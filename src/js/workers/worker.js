// @ts-check
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

/**
 * @typedef {Object} WorkerMessage
 * @property {string} id
 * @property {File} file
 * @property {number} quality
 * @property {string} [targetMime]
 */

/**
 * @typedef {Object} WorkerResultSuccess
 * @property {string} id
 * @property {boolean} success
 * @property {number} finalSize
 * @property {number} savingsPct
 * @property {string} filename
 * @property {string} finalMime
 * @property {number} originalSize
 */

/**
 * @typedef {Object} WorkerResultError
 * @property {string} id
 * @property {boolean} success
 * @property {string} error
 * @property {string} filename
 */

// ── WorkerDB (True Worker-to-Disk Architecture) ──────────────────────────────
// A lean IndexedDB client embedded directly in the Worker.
// The Worker persists compressed Blobs to disk without crossing the
// postMessage boundary — the Main Thread only receives metadata (JSON).
class WorkerDB {
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

const workerDB = new WorkerDB();

// ── Canvas State (Recycled across jobs) ──────────────────────────────────────
/** @type {OffscreenCanvas | null} */
let canvas = null;
/** @type {OffscreenCanvasRenderingContext2D | null} */
let ctx = null;
/** @type {boolean | null} */
let currentAlpha = null;

// ── Codec Awareness Helpers ───────────────────────────────────────────────────

/**
 * Inspects pixel data to determine if ANY alpha channel value < 255 exists.
 * If the entire image is fully opaque, we can safely convert to a lossy codec.
 *
 * @param {OffscreenCanvasRenderingContext2D} context
 * @param {number} w
 * @param {number} h
 * @returns {boolean} true if the image contains at least one semi-transparent pixel
 */
function hasTransparentPixels(context, w, h) {
  // Sample the full image — getImageData returns RGBA Uint8ClampedArray
  const imageData = context.getImageData(0, 0, w, h);
  const data = imageData.data;
  // Alpha channel is every 4th byte (index 3, 7, 11, ...)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

// ── Main Message Handler ──────────────────────────────────────────────────────

self.onmessage = async function(e) {
  /** @type {WorkerMessage} */
  const { id, file, quality, targetMime = 'image/jpeg' } = e.data;
  
  try {
    // createImageBitmap works seamlessly in workers
    const bitmap = await createImageBitmap(file);
    
    // Pixel bomb / Decompression bomb mitigation (Limit to ~64 Megapixels)
    // Rejects files computationally designed to consume massive memory decoding
    if (bitmap.width * bitmap.height > 64000000) {
      bitmap.close();
      throw new Error(`File rejected: Exceeds safe megapixel limit (Image Bomb protection).`);
    }

    // Adaptive downscaling logic (Maintains aspect ratio)
    const MAX_DIMENSION = 2560;
    let targetW = bitmap.width;
    let targetH = bitmap.height;
    
    if (targetW > MAX_DIMENSION || targetH > MAX_DIMENSION) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * MAX_DIMENSION) / targetW);
        targetW = MAX_DIMENSION;
      } else {
        targetW = Math.round((targetW * MAX_DIMENSION) / targetH);
        targetH = MAX_DIMENSION;
      }
    }

    // Reuse OffscreenCanvas with Alpha Awareness
    // Initial assumption: preserve alpha for all non-JPEG formats
    const hasAlpha = targetMime !== 'image/jpeg';
    
    if (!canvas || currentAlpha !== hasAlpha) {
      canvas = new OffscreenCanvas(targetW, targetH);
      ctx = canvas.getContext('2d', { alpha: hasAlpha });
      currentAlpha = hasAlpha;
    } else {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    
    if (!ctx) throw new Error("Failed to get 2D rendering context");
    
    // Clear canvas and fill white background *only* for JPEGs
    if (!hasAlpha) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    } else {
      ctx.clearRect(0, 0, targetW, targetH);
    }
    
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close(); // Immediate GC trigger

    // ── Codec Awareness (Opaque PNG → WebP Upgrade) ───────────────────────
    // If the user uploaded a PNG but it contains zero transparent pixels,
    // there is no reason to preserve the lossless PNG codec. We silently
    // upgrade to WebP for superior compression ratios.
    // The switch only happens if the WebP result is meaningfully smaller (< 40% of original).
    let effectiveMime = targetMime;

    if (targetMime === 'image/png' && ctx) {
      const isTransparent = hasTransparentPixels(ctx, targetW, targetH);
      if (!isTransparent) {
        // Probe WebP size before committing
        // @ts-ignore
        const webpProbe = await canvas.convertToBlob({ type: 'image/webp', quality });
        // Only switch if WebP is at least 5x smaller (< 20% of original file size)
        // This prevents degrading high-quality PNGs where WebP gains nothing
        if (webpProbe.size < file.size * 0.40) {
          effectiveMime = 'image/webp';
          // Switch canvas context to non-alpha mode for optimal WebP encoding
          if (currentAlpha !== false) {
            canvas = new OffscreenCanvas(targetW, targetH);
            ctx = canvas.getContext('2d', { alpha: false });
            currentAlpha = false;
            if (!ctx) throw new Error("Failed to get 2D rendering context for WebP upgrade");
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
            // Re-draw is necessary after context recreation
            const bitmapRetry = await createImageBitmap(file);
            ctx.drawImage(bitmapRetry, 0, 0, targetW, targetH);
            bitmapRetry.close();
          }
        }
      }
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
    await workerDB.putFile(id, finalBlob, file.name, finalBlob.type);
    
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
