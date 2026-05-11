// @ts-check

/** @typedef {'info' | 'success' | 'warning' | 'error'} ToastType */

/** @type {number} */
export const FILE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

/** @type {number} */
export const BATCH_FILE_LIMIT = 10000;

/** @type {ReadonlySet<string>} */
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/x-nikon-nef',
  'image/nef',
]);

/**
 * Checks browser File metadata for formats OpticPress can process.
 * Example: `isSupportedImageFile(file)` returns true for JPEG and `.nef`.
 * @param {File} file
 * @returns {boolean}
 */
export function isSupportedImageFile(file) {
  const isNef = file.name.toLowerCase().endsWith('.nef');
  return SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || isNef;
}

/**
 * Extracts the selected folder name from a webkitRelativePath.
 * Example: `wedding/raw/a.nef` becomes `wedding`.
 * @param {string} relativePath
 * @returns {string | null}
 */
export function getFolderNameFromRelativePath(relativePath) {
  const parts = relativePath.split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Filters a batch and emits rich user-facing validation errors.
 * Example: `collectAcceptedImageFiles(files, { existingQueueCount: 0 })`.
 * @param {Iterable<File>} files
 * @param {{
 *   existingQueueCount: number,
 *   maxBytes?: number,
 *   maxQueueSize?: number,
 *   showToast?: (message: string, type?: ToastType) => void,
 * }} options
 * @returns {File[]}
 */
export function collectAcceptedImageFiles(files, options) {
  const maxBytes = options.maxBytes ?? FILE_SIZE_LIMIT_BYTES;
  const maxQueueSize = options.maxQueueSize ?? BATCH_FILE_LIMIT;
  const accepted = [];

  for (const file of files) {
    if (!isSupportedImageFile(file)) {
      options.showToast?.(
        `Unsupported file: ${file.name}. Currently, we only support WEBP, PNG, JPEG, AVIF and NEF.`,
        'error',
      );
      continue;
    }

    if (file.size > maxBytes) {
      const maxMB = Math.round(maxBytes / 1024 / 1024);
      options.showToast?.(
        `This file is a bit too large: ${file.name}. Received ${file.size} bytes, expected at most ${maxMB} MB.`,
        'error',
      );
      continue;
    }

    accepted.push(file);
  }

  const remainingSlots = Math.max(0, maxQueueSize - options.existingQueueCount);
  if (accepted.length <= remainingSlots) return accepted;

  options.showToast?.(
    `For safety, we've limited your batch to ${maxQueueSize} photos at once.`,
    'warning',
  );
  return accepted.slice(0, remainingSlots);
}
