// @ts-check

import {
  createZipChunks,
  formatZipFilename,
  normalizeZipFolderName,
} from './export-planner.js';
import { getMaxZipChunkBytes } from './zip-limits.js';

/**
 * Batch ZIP export controller.
 * Example: `new OpticExporter(config)` binds the download button.
 */
export class OpticExporter {
  /** @param {OpticExporterConfig} config */
  constructor(config) {
    this.btn = config.btn;
    this.sourceQueue = config.sourceQueue;
    this.db = config.db;
    this.createZipWorker = config.createZipWorker;
    this.showToast = config.showToast || fallbackToast;

    if (this.btn) this.btn.addEventListener('click', () => this.exportAll());
  }

  async exportAll() {
    if (!this.btn || this.btn.classList.contains('is-zipping')) return;

    const stats = this.sourceQueue.processedFileStats;
    if (stats.length === 0) {
      this.showToast('No images to zip.', 'error');
      return;
    }

    const folderName = normalizeZipFolderName(this.sourceQueue.zipFolderName);
    const chunks = createZipChunks(stats, getMaxZipChunkBytes());
    await this.exportChunks(chunks, folderName, stats.length);
  }

  /**
   * @param {ProcessedFileStat[][]} chunks
   * @param {string} folderName
   * @param {number} totalFileCount
   */
  async exportChunks(chunks, folderName, totalFileCount) {
    if (!this.btn) return;

    const totalChunks = chunks.length;
    const originalHtml = this.btn.innerHTML;
    this.btn.classList.add('is-zipping');

    try {
      for (let index = 0; index < totalChunks; index++) {
        await this.exportChunk(chunks[index], folderName, index, totalChunks);
      }
      this.showToast(buildCompletionMessage(totalChunks, totalFileCount));
    } catch (err) {
      console.error('[Optic Exporter] Batch Download Failed', err);
      this.showToast('Sorry, we failed to generate your ZIP.', 'error');
    } finally {
      this.btn.classList.remove('is-zipping');
      this.btn.innerHTML = originalHtml;
    }
  }

  /**
   * @param {ProcessedFileStat[]} chunk
   * @param {string} folderName
   * @param {number} chunkIndex
   * @param {number} totalChunks
   */
  async exportChunk(chunk, folderName, chunkIndex, totalChunks) {
    if (!this.btn) return;

    this.btn.innerHTML = buildZippingButtonLabel(chunk.length, chunkIndex, totalChunks);
    const chunkBlob = await this.createZipBlob(chunk, folderName, chunkIndex, totalChunks);
    triggerDownload(chunkBlob, formatZipFilename(folderName, chunkIndex, totalChunks));
    if (chunkIndex < totalChunks - 1) await sleep(1000);
  }

  /**
   * @param {ProcessedFileStat[]} chunk
   * @param {string} folderName
   * @param {number} chunkIndex
   * @param {number} totalChunks
   * @returns {Promise<Blob>}
   */
  createZipBlob(chunk, folderName, chunkIndex, totalChunks) {
    return new Promise((resolve, reject) => {
      const zipWorker = this.createZipWorker();
      zipWorker.onmessage = (event) => {
        zipWorker.terminate();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.chunkBlob);
      };
      zipWorker.onerror = (error) => {
        zipWorker.terminate();
        reject(error);
      };
      zipWorker.postMessage({ stats: chunk, folderName, chunkIndex, totalChunks });
    });
  }
}

/**
 * @param {number} totalChunks
 * @param {number} totalFileCount
 * @returns {string}
 */
function buildCompletionMessage(totalChunks, totalFileCount) {
  if (totalChunks > 1) return `Finished downloading ${totalChunks} folders (${totalFileCount} images).`;
  return `All done! Downloading ${totalFileCount} images.`;
}

/**
 * @param {number} fileCount
 * @param {number} chunkIndex
 * @param {number} totalChunks
 * @returns {string}
 */
function buildZippingButtonLabel(fileCount, chunkIndex, totalChunks) {
  const label = totalChunks > 1 ? `part ${chunkIndex + 1}/${totalChunks}` : `${fileCount} files`;
  return `
    <svg class="h-5 w-5 animate-spin" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3"></circle>
      <path class="opacity-80" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
    </svg>
    <span>Zipping ${label}...</span>
  `;
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 3000);
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} message
 * @param {'info' | 'success' | 'warning' | 'error'} [type]
 */
function fallbackToast(message, type = 'info') {
  console.log(`[Toast ${type}] ${message}`);
}
