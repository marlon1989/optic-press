// @ts-check

/**
 * IndexedDB wrapper for compressed files stored off heap.
 * Example: `await db.putFile(id, blob, filename, mime)`.
 */
export class OpticDB {
  constructor() {
    /** @type {string} */
    this.dbName = 'OpticPressDB';
    /** @type {number} */
    this.version = 1;
    /** @type {string} */
    this.storeName = 'compressed';
  }

  /** @returns {Promise<IDBDatabase>} */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const target = /** @type {IDBOpenDBRequest} */ (event.target);
        const database = target.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * @param {string | number} id
   * @param {Blob} blob
   * @param {string} filename
   * @param {string} [mime]
   * @returns {Promise<void>}
   */
  async putFile(id, blob, filename, mime = 'image/jpeg') {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.put({ id, blob, filename, mime });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * @param {string} id
   * @returns {Promise<{id: string, blob: Blob, filename: string, mime: string} | undefined>}
   */
  async getFile(id) {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** @returns {Promise<void>} */
  async clear() {
    const database = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
