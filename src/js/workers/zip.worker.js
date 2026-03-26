// @ts-check
/**
 * OpticPress Zip Worker — Off-Thread ZIP Packaging Engine
 *
 * Architecture: True Worker-to-Disk ZIP
 * This Worker reads compressed Blobs directly from IndexedDB, packages them
 * with JSZip, and posts the final Blob back to the Main Thread.
 * The Main Thread never touches JSZip or heavy Blob allocations — it only
 * triggers the <a>.click() download from the received Blob.
 *
 * Receives: { stats: ProcessedFileStat[], folderName: string, chunkIndex: number, totalChunks: number }
 * Posts:    { chunkBlob: Blob, filename: string, chunkIndex: number, totalChunks: number, error?: string }
 */

// @ts-ignore
self.importScripts('/js/vendor/jszip.min.js');
// @ts-ignore
const JSZip = self.JSZip;

// ── WorkerDB (Shared IndexedDB client — same DB as compression worker) ─────────
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
   * Retrieve a compressed file record from the store.
   * @param {string} id
   * @returns {Promise<{id: string, blob: Blob, filename: string, mime: string} | undefined>}
   */
  async getFile(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

const workerDB = new WorkerDB();

/**
 * @typedef {Object} ProcessedFileStat
 * @property {string} id
 * @property {string} filename
 * @property {number} size
 * @property {string} mime
 */

/** @type {Record<string, string>} */
const MIME_TO_EXT = {
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/avif': 'avif',
};

// ── Main Message Handler ──────────────────────────────────────────────────────

self.onmessage = async function (e) {
  /** @type {{ stats: ProcessedFileStat[], folderName: string, chunkIndex: number, totalChunks: number }} */
  const { stats, folderName, chunkIndex, totalChunks } = e.data;

  try {
    const zip = new JSZip();

    // Sequentially hydrate RAM from IndexedDB — prevents OOM from parallel Blob reads
    let loaded = 0;
    for (const stat of stats) {
      const record = await workerDB.getFile(stat.id);
      if (record && record.blob) {
        // Anti Zip-Slip: sanitize filename to prevent path traversal injection
        const safeName = record.filename
          .replace(/^.*[\\/:]/, '')   // strip any leading path
          .replace(/\.[^.]+$/, '');   // strip extension (we re-add from MIME)

        const ext = MIME_TO_EXT[stat.mime] || MIME_TO_EXT[record.blob.type] || 'jpeg';
        zip.file(`${safeName}.${ext}`, record.blob);
      }

      loaded++;
      // Yield every 25 files to keep the Worker event loop breathing
      if (loaded % 25 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Heavy allocation happens here — isolated entirely off the Main Thread
    const chunkBlob = await zip.generateAsync({ type: 'blob' });

    const partLabel = totalChunks > 1 ? `_parte${chunkIndex + 1}de${totalChunks}` : '';
    const filename = `${folderName}${partLabel}.zip`;

    // Transfer the Blob reference — the Main Thread only triggers the download
    self.postMessage({ chunkBlob, filename, chunkIndex, totalChunks });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown zip error';
    self.postMessage({ error: errorMessage, chunkIndex, totalChunks });
  }
};
