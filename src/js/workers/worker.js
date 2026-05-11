// @ts-check
/// <reference path="../types.d.ts" />
/**
 * OpticPress Worker — Image Compression Engine
 * Runs completely isolated from the Main Thread (No DOM access)
 *
 * Architecture: True Worker-to-Disk
 * Blobs are persisted to IndexedDB directly from this Worker.
 * The Main Thread receives only lightweight stat metadata — never a Blob.
 * This eliminates multi-MB blob traffic across the postMessage boundary,
 * preventing heap spikes in the UI thread when many workers finish simultaneously.
 */

// ── External Decoders (RAW) ───────────────────────────────────────────────────
import UTIF from 'utif';
import { hasTransparentPixels } from './image-analysis.js';
import {
  isNefFile,
  resolveEffectiveMime,
} from './mime.js';
// pako.js (optional but recommended for compressed TIFF features)

// ── CompressionDB (True Worker-to-Disk Architecture) ──────────────────────────────
// A lean IndexedDB client embedded directly in the Worker.
// The Worker persists compressed Blobs to disk without crossing the
// postMessage boundary — the Main Thread only receives metadata (JSON).
class CompressionDB {
  constructor() {
    /** @type {string} */
    this.dbName = 'OpticPressDB';
    /** @type {number} */
    this.version = 1;
    /** @type {string} */
    this.storeName = 'compressed';
    /** @type {IDBDatabase | null} */
    this._db = null;
  }

  /** @returns {Promise<IDBDatabase>} */
  async _open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._db = request.result;
        resolve(request.result);
      };
      request.onupgradeneeded = (e) => {
        // @ts-ignore
        const db = /** @type {IDBDatabase} */ (e.target.result);
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Save a compressed blob directly from the Worker.
   * @param {string} id
   * @param {Blob} blob
   * @param {string} filename
   * @param {string} mime
   * @returns {Promise<void>}
   */
  async putFile(id, blob, filename, mime) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ id, blob, filename, mime });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

const compressionDB = new CompressionDB();

// ── Canvas State (Recycled across jobs) ──────────────────────────────────────
/** @type {OffscreenCanvas | null} */
let canvas = null;
/** @type {OffscreenCanvasRenderingContext2D | null} */
let ctx = null;
/** @type {boolean | null} */
let currentAlpha = null;

// ── Main Message Handler ──────────────────────────────────────────────────────

self.onmessage = async function(e) {
  /** @type {WorkerMessage} */
  const { id, file, quality, targetMime = 'image/jpeg' } = e.data;
  
  try {
    /** @type {ImageBitmap} */
    let bitmap;

    const isNef = isNefFile(file.name || '');
    if (isNef) {
      // ── NEF RAW Pipeline: Sensor Fidelity Mode ─────────────────────────
      const buffer = await file.arrayBuffer();
      const ifds = UTIF.decode(buffer);
      if (!ifds || ifds.length === 0) throw new Error("Could not decode NEF structure.");
      
      // Helper to safely extract single values from UTIF tags
      /** @param {any} val */
      const tagVal = (val) => (Array.isArray(val) || ArrayBuffer.isView(val)) ? /** @type {any} */ (val)[0] : val;

      /** @type {any[]} */
      let allIFDs = [];
      /** @param {any} listOrIFD */
      const collect = (listOrIFD) => {
        if (!listOrIFD) return;
        const items = Array.isArray(listOrIFD) ? listOrIFD : [listOrIFD];
        for (const ifd of items) {
          if (!ifd || typeof ifd !== 'object' || allIFDs.includes(ifd)) continue;
          allIFDs.push(ifd);
          // Recurse into all common TIFF/RAW sub-IFD structures
          if (ifd.subIFD) collect(ifd.subIFD);
          if (ifd.exifIFD) collect(ifd.exifIFD);
          if (ifd.gpsIFD) collect(ifd.gpsIFD);
          if (ifd.t34665) collect(ifd.t34665); // Exif IFD
          if (ifd.t330) collect(ifd.t330);     // SubIFDs
          if (ifd.makerNote) collect(ifd.makerNote); // Some MakerNotes are valid IFDs
        }
      };
      collect(ifds);

      let mainIFD = allIFDs[0];
      let maxArea = 0;
      let selectionMode = "Metadata (IFD0)";
      let finalW = 0, finalH = 0;

      for (let i = 0; i < allIFDs.length; i++) {
        const ifd = allIFDs[i];
        const compression = tagVal(ifd["t259"]) || 1;
        const interpretation = tagVal(ifd["t262"]) || 2;
        const w = Number(tagVal(ifd["t256"]) || tagVal(ifd["t40962"]) || ifd.width || 0);
        const h = Number(tagVal(ifd["t257"]) || tagVal(ifd["t40963"]) || ifd.height || 0);
        
        const jpegOffset = tagVal(ifd["t513"]) || 0;
        const jpegLength = tagVal(ifd["t514"]) || 0;
        const stripOffset = tagVal(ifd["t273"]) || 0;
        const stripLength = tagVal(ifd["t279"]) || 0;
        
        // Score logic
        let score = 0;
        const hasJpegPointer = (jpegOffset > 0 && jpegLength > 0) || (stripOffset > 0 && stripLength > 0);
        const isJpegCompressed = (compression === 6 || compression === 7 || compression === 34713);

        if (isJpegCompressed && hasJpegPointer) {
          score = 4; // High-Resolution JPEG Preview (Trusted Stream Mode)
        } else if (w > 0 && h > 0) {
          if (compression === 6 || compression === 7) score = 3;      // JPEG with dimensions
          else if (compression === 1 && interpretation === 2) score = 2; // Uncompressed RGB
          else if ([0, 1, 2, 3, 5, 6].includes(interpretation)) score = 1; // Basic Raster
        }

        // Selection Tie-breaker
        const currentBestScore = mainIFD._score || 0;
        const currentBestArea = maxArea;
        const currentBestOffset = mainIFD._jpegOffset || 0;

        const isBetter = score > currentBestScore || 
                        (score === currentBestScore && score === 4 && jpegOffset > currentBestOffset) ||
                        (score === currentBestScore && score < 4 && (w * h) > currentBestArea);

        if (score > 0 && isBetter) {
           maxArea = w * h;
           mainIFD = ifd;
           mainIFD._score = score;
           mainIFD._jpegOffset = jpegOffset || stripOffset;
           finalW = w;
           finalH = h;
           selectionMode = score === 4 ? "JPEG Preview (Direct)" : (score === 3 ? "JPEG Preview" : (score === 2 ? "RGB Uncompressed" : "Generic Raster"));
        }
      }

      console.log(`[Optic Worker] Selected NEF IFD: ${selectionMode} (${finalW}x${finalH})`);

      // ── Extraction Logic ───────────────────────────────────────────────────
      const compression = tagVal(mainIFD["t259"]);
      const offset = tagVal(mainIFD.t513) || tagVal(mainIFD.t273);
      const count = tagVal(mainIFD.t514) || tagVal(mainIFD.t279);

      if ((compression === 6 || compression === 7 || compression === 34713) && offset && count) {
         try {
           const jpegData = new Uint8Array(buffer, offset, count);
           const jpegBlob = new Blob([jpegData], { type: 'image/jpeg' });
           bitmap = await createImageBitmap(jpegBlob);
           // Update dimensions if they were 0 in metadata
           if (finalW <= 0) finalW = bitmap.width;
           if (finalH <= 0) finalH = bitmap.height;
         } catch (e) {
           console.warn("[Optic Worker] Fallback: Direct extraction failed, trying UTIF decode.", e);
           UTIF.decodeImage(buffer, mainIFD, ifds);
           const rgba = UTIF.toRGBA8(mainIFD);
           const imageData = new ImageData(new Uint8ClampedArray(rgba), finalW || mainIFD.width, finalH || mainIFD.height);
           bitmap = await createImageBitmap(imageData);
         }
      } else {
        if (finalW <= 0 || finalH <= 0) throw new Error("Could not find valid dimensions for non-JPEG image.");
        UTIF.decodeImage(buffer, mainIFD, ifds);
        const rgba = UTIF.toRGBA8(mainIFD);
        if (!rgba) throw new Error("UTIF failed to decode image data into RGBA.");
        const clampedData = new Uint8ClampedArray(rgba);
        const imageData = new ImageData(clampedData, finalW, finalH);
        bitmap = await createImageBitmap(imageData);
      }
    } else {
      bitmap = await createImageBitmap(file);
    }
    
    // Pixel / Decompression bomb mitigation (~64 Megapixel hard limit)
    if (bitmap.width * bitmap.height > 64000000) {
      bitmap.close();
      throw new Error(`File rejected: Exceeds safe megapixel limit (Image Bomb protection).`);
    }

    // Adaptive downscaling (Maintains aspect ratio)
    // Both RAW and standard images now follow the 2560px optimized limit.
    const WEB_MAX_DIMENSION = 2560;
    const effectiveLimit = WEB_MAX_DIMENSION;

    let targetW = bitmap.width;
    let targetH = bitmap.height;
    
    if (targetW > effectiveLimit || targetH > effectiveLimit) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * effectiveLimit) / targetW);
        targetW = effectiveLimit;
      } else {
        targetW = Math.round((targetW * effectiveLimit) / targetH);
        targetH = effectiveLimit;
      }
    }

    let effectiveMime = resolveEffectiveMime(file.name || '', targetMime);

    if (effectiveMime === 'image/jpeg') {
      // ── JPEG Path: alpha is never needed ─────────────────────────────────
      if (!canvas || currentAlpha !== false) {
        canvas = new OffscreenCanvas(targetW, targetH);
        ctx = canvas.getContext('2d', { alpha: false });
        currentAlpha = false;
      } else {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      if (!ctx) throw new Error('Failed to get 2D rendering context');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close();

    } else {
      // ── Alpha-First Path (PNG / WEBP / AVIF) ─────────────────────────────
      // Step 1: Always initialize with alpha:true — we don't know yet if we need it.
      // This is the "Alpha-First" principle: truth comes from the pixels, not the MIME type.
      if (!canvas || currentAlpha !== true) {
        canvas = new OffscreenCanvas(targetW, targetH);
        ctx = canvas.getContext('2d', { alpha: true });
        currentAlpha = true;
      } else {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      if (!ctx) throw new Error('Failed to get 2D rendering context');

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);

      // Step 2: Inspect actual pixel data to determine if alpha was needed.
      // This check is now data-driven, not format-driven.
      if (effectiveMime === 'image/png') {
        const isTransparent = hasTransparentPixels(ctx, targetW, targetH);

        if (!isTransparent) {
          // ── Codec Awareness: Opaque PNG → WebP Upgrade ─────────────────
          // The image has no transparent pixels → the alpha channel we allocated
          // was pure waste. We now probe WebP to see if it's worth upgrading.

          // @ts-ignore
          const webpProbe = await canvas.convertToBlob({ type: 'image/webp', quality });

          if (webpProbe.size < file.size * 0.40) {
            // WebP is < 40% of original size → upgrade is worthwhile.
            // Recreate canvas WITHOUT alpha to eliminate the wasted channel memory.
            effectiveMime = 'image/webp';
            canvas = new OffscreenCanvas(targetW, targetH);
            ctx = canvas.getContext('2d', { alpha: false });
            currentAlpha = false;
            if (!ctx) throw new Error('Failed to get 2D rendering context for WebP upgrade');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(bitmap, 0, 0, targetW, targetH);
          }
          // If WebP probe gain is insufficient, fall through with original PNG + alpha:true
          // (alpha channel memory is a sunk cost at this point — no re-draw needed)
        }
        // If transparent: alpha:true canvas is already the correct final state — no action needed.
      }
      // For WEBP/AVIF inputs: alpha:true is always correct — no pixel inspection needed.
      bitmap.close();
    }

    // Resilient Conversion Flow (With Fallbacks for AVIF/Edge formats)
    /** @type {Blob} */
    let blob;
    try {
      // @ts-ignore
      blob = await canvas.convertToBlob({ type: effectiveMime, quality });
    } catch (_convErr) {
      console.warn(`[Optic Worker] Failed conversion to ${effectiveMime}. Falling back to image/webp.`);
      // @ts-ignore
      blob = await canvas.convertToBlob({ type: 'image/webp', quality });
    }
    
    // Strict EXIF Stripping (Zero Trust Privacy)
    // We never return the original 'file', ensuring all metadata
    // (GPS coordinates, camera model, EXIF) is permanently destroyed via canvas.
    const finalBlob = blob;
    const finalSize = blob.size;
    let savingsPct = 0;

    if (blob.size < file.size) {
       savingsPct = Math.round(100 - (blob.size / file.size) * 100);
    }

    // ── True Worker-to-Disk: Persist DIRECTLY to IndexedDB ───────────────
    // The blob is written to the persistent store from inside the Worker.
    // The Main Thread receives ONLY metadata (no Blob crossing postMessage).
    // This eliminates the heap spike that would occur if 32 workers posted
    // 20MB blobs simultaneously to the main thread.
    await compressionDB.putFile(id, finalBlob, file.name, finalBlob.type);
    
    // Post ONLY lightweight metadata back to the Main Thread
    self.postMessage({
      id,
      success: true,
      finalSize,
      savingsPct,
      finalMime: finalBlob.type, // Real MIME (may differ if codec was upgraded)
      filename: file.name,
      originalSize: file.size
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    /** @type {WorkerResultError} */
    const result = { id, success: false, error: errorMessage, filename: file.name };
    self.postMessage(result);
  }
};
