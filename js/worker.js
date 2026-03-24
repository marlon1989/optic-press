// @ts-check
/**
 * OpticPress Worker — Image Compression Engine
 * Runs completely isolated from the Main Thread (No DOM access)
 */

/**
 * @typedef {Object} WorkerMessage
 * @property {string} id
 * @property {File} file
 * @property {number} quality
 */

/**
 * @typedef {Object} WorkerResultSuccess
 * @property {string} id
 * @property {boolean} success
 * @property {Blob} blob
 * @property {number} finalSize
 * @property {number} savingsPct
 * @property {string} filename
 * @property {number} originalSize
 */

/**
 * @typedef {Object} WorkerResultError
 * @property {string} id
 * @property {boolean} success
 * @property {string} error
 * @property {string} filename
 */

/** @type {OffscreenCanvas | null} */
let canvas = null;
/** @type {OffscreenCanvasRenderingContext2D | null} */
let ctx = null;

self.onmessage = async function(e) {
  /** @type {WorkerMessage} */
  const { id, file, quality } = e.data;
  
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

    // Reuse OffscreenCanvas for Background Rendering to prevent RAM leakage
    if (!canvas) {
      canvas = new OffscreenCanvas(targetW, targetH);
      ctx = canvas.getContext('2d', { alpha: false }); // alpha false optimizes memory for jpegs
    } else {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    
    if (!ctx) throw new Error("Failed to get 2D rendering context");

    // Fill white background for transparent images (e.g., PNGs) before drawing
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close(); // Immediate GC trigger

    const targetMime = 'image/jpeg';
    
    // convertToBlob is the OffscreenCanvas equivalent of toBlob
    const blob = await canvas.convertToBlob({ type: targetMime, quality: quality });
    
    // Strict EXIF Stripping (Zero Trust Privacy)
    // Nós nunca mais devolvemos o 'file' original, garantindo que metadados 
    // como GPS ou Câmera (EXIF) sejam sumariamente destruídos no canvas.
    const finalBlob = blob;
    const finalSize = blob.size;
    let savingsPct = 0;

    if (blob.size < file.size) {
       savingsPct = Math.round(100 - (blob.size / file.size) * 100);
    }
    
    // Send back the compressed payload
    self.postMessage({
      id,
      success: true,
      blob: finalBlob,
      finalSize,
      savingsPct,
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
