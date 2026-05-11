// @ts-check

export const MAX_EXACT_ALPHA_PIXELS = 1048576;
export const MAX_ALPHA_SAMPLES = 4096;

/**
 * Checks canvas alpha while avoiding large full-canvas readbacks.
 * Large images are treated conservatively when no transparent sample is found.
 *
 * @param {OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function hasTransparentPixels(context, width, height) {
  const pixelCount = width * height;
  if (pixelCount <= 0) return false;

  if (sampleHasTransparency(context, width, height, pixelCount)) return true;
  if (pixelCount > MAX_EXACT_ALPHA_PIXELS) return true;

  const imageData = context.getImageData(0, 0, width, height);
  return alphaDataHasTransparency(imageData.data);
}

/**
 * @param {OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} height
 * @param {number} pixelCount
 * @returns {boolean}
 */
function sampleHasTransparency(context, width, height, pixelCount) {
  const step = Math.max(1, Math.floor(Math.sqrt(pixelCount / MAX_ALPHA_SAMPLES)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = context.getImageData(x, y, 1, 1).data[3];
      if (alpha < 255) return true;
    }
  }

  return false;
}

/**
 * @param {Uint8ClampedArray | Uint8Array} data
 * @returns {boolean}
 */
function alphaDataHasTransparency(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}
