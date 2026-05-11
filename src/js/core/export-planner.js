// @ts-check

/** @type {Readonly<Record<string, string>>} */
const IMAGE_MIME_EXTENSIONS = {
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/avif': 'avif',
};

/**
 * Builds memory-safe ZIP chunks from compressed file stats.
 * Example: `createZipChunks(stats, 800 * 1024 * 1024)`.
 * @param {ProcessedFileStat[]} stats
 * @param {number} maxChunkBytes
 * @returns {ProcessedFileStat[][]}
 */
export function createZipChunks(stats, maxChunkBytes) {
  /** @type {ProcessedFileStat[][]} */
  const chunks = [];
  /** @type {ProcessedFileStat[]} */
  let currentChunk = [];
  let currentBytes = 0;

  for (const stat of stats) {
    if (currentBytes + stat.size > maxChunkBytes && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }

    currentChunk.push(stat);
    currentBytes += stat.size;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

/**
 * Ensures exported archive folder names cannot become paths.
 * Example: `normalizeZipFolderName("../x")` returns `photos`.
 * @param {string | null | undefined} folderName
 * @returns {string}
 */
export function normalizeZipFolderName(folderName) {
  if (!folderName) return 'photos';
  if (/[\\/:]/.test(folderName) || folderName.includes('..')) return 'photos';
  return folderName.trim() || 'photos';
}

/**
 * Formats deterministic ZIP filenames, including multi-part labels.
 * Example: `formatZipFilename("photos", 1, 3)` returns `photos_parte2de3.zip`.
 * @param {string} folderName
 * @param {number} chunkIndex
 * @param {number} totalChunks
 * @returns {string}
 */
export function formatZipFilename(folderName, chunkIndex, totalChunks) {
  const safeFolderName = normalizeZipFolderName(folderName);
  const partLabel = totalChunks > 1 ? `_parte${chunkIndex + 1}de${totalChunks}` : '';
  return `${safeFolderName}${partLabel}.zip`;
}

/**
 * Resolves output image extension from trusted MIME metadata.
 * Example: `resolveImageExtension("image/webp", "")` returns `webp`.
 * @param {string | undefined} statMime
 * @param {string | undefined} blobMime
 * @returns {string}
 */
export function resolveImageExtension(statMime, blobMime) {
  return IMAGE_MIME_EXTENSIONS[statMime || '']
    || IMAGE_MIME_EXTENSIONS[blobMime || '']
    || 'jpeg';
}

/**
 * Removes paths and extensions before adding files to an archive.
 * Example: `sanitizeArchiveEntryBaseName("../a/raw.nef")` returns `raw`.
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeArchiveEntryBaseName(filename) {
  const leafName = filename.replace(/^.*[\\/:]/, '').replace(/\.[^.]+$/, '');
  return leafName || 'image';
}
