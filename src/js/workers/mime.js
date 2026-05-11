// @ts-check

export const JPEG_MIME = 'image/jpeg';

/**
 * @param {string} fileName
 * @returns {boolean}
 */
export function isNefFile(fileName) {
  return fileName.toLowerCase().endsWith('.nef');
}

/**
 * @param {string} fileName
 * @param {string} targetMime
 * @returns {string}
 */
export function resolveEffectiveMime(fileName, targetMime) {
  if (isNefFile(fileName) && (!targetMime || targetMime.includes('nef'))) {
    return JPEG_MIME;
  }
  return targetMime || JPEG_MIME;
}
