// @ts-check
/**
 * OpticPress Compressor — Interaction Layer
 * Handles: drag & drop, file input, progress simulation, card selection
 */
import JSZip from 'jszip';

// ── Constants ────────────────────────────────────────────────────────

/** @type {number} */
const FAKE_PROGRESS_DURATION = 3200; // ms for the demo progress bar

// ── DOM References ───────────────────────────────────────────────────

/** @type {HTMLElement | null} */
const dropZone = document.getElementById('drop-zone');
/** @type {HTMLInputElement | null} */
const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById('file-input'));
/** @type {HTMLElement | null} */
const progressFill = document.getElementById('progress-fill');
/** @type {HTMLElement | null} */
const progressPct = document.getElementById('progress-pct');
/** @type {NodeListOf<Element>} */
const resultCards = document.querySelectorAll('.result-card');
/** @type {HTMLElement | null} */
const downloadAllBtn = document.getElementById('download-all-btn');

// ── Core Compression Engine (Moved to js/worker.js) ────────────
// The main thread now merely dispatches jobs to isolated Web Workers
// to prevent browser freezes when handling 7k+ images.

// ── IndexedDB Wrapper (RAM Eradication Engine) ──────────────────────

/**
 * @typedef {Object} ProcessedFileStat
 * @property {string} id
 * @property {string} filename
 * @property {number} size
 */

class OpticDB {
  constructor() {
    /** @type {string} */
    this.dbName = 'OpticPressDB';
    /** @type {number} */
    this.version = 1;
    /** @type {string} */
    this.storeName = 'compressed';
  }

  /**
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        /** @type {IDBDatabase} */
        // @ts-ignore
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * @param {string | number} id
   * @param {Blob} blob
   * @param {string} filename
   * @returns {Promise<void>}
   */
  async putFile(id, blob, filename) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ id, blob, filename });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * @param {string} id
   * @returns {Promise<{id: string, blob: Blob, filename: string}>}
   */
  async getFile(id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** @returns {Promise<void>} */
  async clear() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();
      tx.oncomplete = () => resolve();
    });
  }
}

const db = new OpticDB();

// ── Drop Zone Architecture (File API) ────────────────────────────────

/**
 * @typedef {Object} OpticUIConfig
 * @property {HTMLElement | null} dropZone
 * @property {HTMLElement | null} activeSection
 * @property {HTMLElement | null} jobsList
 * @property {HTMLElement | null} countText
 * @property {HTMLElement | null} completedSection
 * @property {HTMLElement | null} completedStatsText
 * @property {HTMLElement | null} downloadBtnText
 */

class OpticUI {
  /** @param {OpticUIConfig} config */
  constructor(config) {
    this.dropZone = config.dropZone;
    this.activeSection = config.activeSection;
    this.jobsList = config.jobsList;
    this.countText = config.countText;
    this.completedSection = config.completedSection;
    this.completedStatsText = config.completedStatsText;
    this.downloadBtnText = config.downloadBtnText;

    this.globalProgressEl = null;

    this.fillEl = null;
    this.pctEl = null;
    this.countEl = null;
    this.speedEl = null;
    this.timerEl = null;
  }

  /**
   * @param {boolean} isDragging
   */
  setDragState(isDragging) {
    if (!this.dropZone) return;
    if (isDragging) this.dropZone.classList.add('is-dragover');
    else this.dropZone.classList.remove('is-dragover');
  }

  /**
   * @param {number} totalCount
   */
  showActive(totalCount) {
    if (this.activeSection) {
      this.activeSection.classList.remove('hidden');
      this.activeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (this.countText) this.countText.textContent = `Processing ${totalCount} images...`;

    if (!this.globalProgressEl && this.jobsList) {
      this.jobsList.innerHTML = '';
      this.globalProgressEl = document.createElement('div');
      this.globalProgressEl.className = 'bg-surface-container-lowest p-6 rounded-xl ambient-shadow ghost-border mb-4 transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 cursor-default';
      this.globalProgressEl.innerHTML = `
        <div class="flex justify-between mb-2">
          <span class="font-semibold text-on-surface">Compressing your images</span>
          <div class="flex items-center space-x-3">
            <span class="font-mono text-sm font-medium bg-primary-container text-primary px-2 py-0.5 rounded shadow-sm opacity-0 transition-opacity duration-300" id="global-speed">⚡ 0 img/s</span>
            <span class="font-mono text-sm text-on-surface-variant" id="global-timer">Warming up...</span>
          </div>
        </div>
        <div class="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden mb-2">
           <div class="bg-primary h-full transition-all duration-300" id="global-fill" style="width: 0%"></div>
        </div>
        <div class="flex justify-between text-xs text-on-surface-variant font-medium">
           <span id="global-count-text">0 / ${totalCount}</span>
           <span id="global-pct-text">0%</span>
        </div>
      `;
      this.jobsList.appendChild(this.globalProgressEl);

      this.fillEl = document.getElementById('global-fill');
      this.pctEl = document.getElementById('global-pct-text');
      this.countEl = document.getElementById('global-count-text');
      this.speedEl = document.getElementById('global-speed');
      this.timerEl = document.getElementById('global-timer');
    }
  }

  /**
   * @param {number} processedCount
   * @param {number} totalCount
   * @param {{speed?: number, timerLabel?: string}} speedInfo
   */
  updateProgress(processedCount, totalCount, speedInfo) {
    const pct = Math.round((processedCount / totalCount) * 100);
    if (this.fillEl) this.fillEl.style.width = `${pct}%`;
    if (this.pctEl) this.pctEl.textContent = `${pct}%`;
    if (this.countEl) this.countEl.textContent = `${processedCount} / ${totalCount}`;

    if (speedInfo.speed && this.speedEl) {
      this.speedEl.textContent = `⚡ ${speedInfo.speed} img/s`;
      this.speedEl.style.opacity = '1';
    }
    if (speedInfo.timerLabel && this.timerEl) {
      this.timerEl.textContent = speedInfo.timerLabel;
    }
  }

  hideActive() {
    if (this.countText) this.countText.textContent = `Processing 0 images in your queue`;
    if (this.activeSection) this.activeSection.classList.add('hidden');
    
    if (this.globalProgressEl) {
      this.globalProgressEl.remove();
      this.globalProgressEl = null;
    }
  }

  /**
   * @param {number} totalSavedPct
   * @param {string} savedMB
   * @param {string} totalOptimizedMB
   * @param {number} processedCount
   */
  showCompleted(totalSavedPct, savedMB, totalOptimizedMB, processedCount) {
    if (this.completedSection) {
      this.completedSection.classList.remove('hidden');
      this.completedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (this.completedStatsText) {
        this.completedStatsText.textContent = `You saved ${totalSavedPct}% of space! (${savedMB} MB total)`;
      }
      if (this.downloadBtnText) {
        this.downloadBtnText.textContent = `Download All ${processedCount} Photos (${totalOptimizedMB} MB)`;
      }
    }
  }
}

class OpticFileQueue {
  /**
   * @param {Object} config
   * @param {HTMLElement | null} config.dropZone
   * @param {HTMLInputElement | null} config.fileInput
   * @param {HTMLElement | null} [config.selectBtn]
   * @param {OpticUI} config.ui
   * @param {function(string, string=): void} [config.showToast]
   * @param {OpticDB} config.db
   * @param {string | URL} config.workerUrl
   */
  constructor(config) {
    this.config = config;
    this.db = config.db;
    this.ui = config.ui;
    this.workerUrl = config.workerUrl;
    /** @type {HTMLElement | null} */
    this.dropZone = config.dropZone;
    /** @type {HTMLInputElement | null} */
    this.fileInput = config.fileInput;
    /** @type {File[]} */
    this.queue = [];
    /** @type {ProcessedFileStat[]} */
    this.processedFileStats = []; // { id, filename, size } (RAM safe)
    /** @type {string | null} */
    this.zipFolderName = null; // detected source folder name for zip filename
    /** @type {number} */
    this.MAX_BYTES = 50 * 1024 * 1024; // 50MB limit matching HTML copy
    /** @type {number} */
    this.MAX_QUEUE_SIZE = 10000; // Hard limit against DOM/App memory exhaustion (DoS mitigation)
    
    // Clear DB on start to prevent leftover space usage
    this.db.clear().catch(console.error);
    /** @type {Set<string>} */
    this.ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/avif']);
    /** @type {number} */
    this.totalOriginalBytes = 0;
    /** @type {number} */
    this.totalOptimizedBytes = 0;

    // Reactive Pressure Sensing (RPS) State
    /** @type {number} */
    this.baselineLatency = 0;
    /** @type {number[]} */
    this.latencyHistory = [];
    /** @type {number} */
    this.BATCH_WARMUP = 10;
    
    // Heartbeat Pulse (Resiliency Engine)
    /** @type {number} */
    this.pulseLag = 0;
    /** @type {number} */
    this.lastPulseTime = 0;
    /** @type {number | null} */
    this.pulseId = null;

    if (this.dropZone && this.fileInput) {
      this.bindEvents();
    }
  }

  bindEvents() {
    // 1. Centralized Event Delegation for Drag, Drop, Click and Change
    // We attach listeners to the body to avoid detached DOM memory leaks 
    // and we route them to specialized class methods.
    const body = document.body;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
      body.addEventListener(ev, e => this._handleDragEvent(/** @type {DragEvent} */ (e)));
    });
    
    body.addEventListener('click', e => this._handleClick(/** @type {MouseEvent} */ (e)));
    body.addEventListener('change', e => this._handleChange(/** @type {Event} */ (e)));
  }

  /**
   * Master router for drag and drop delegation
   * @param {DragEvent} e 
   */
  _handleDragEvent(e) {
    e.preventDefault(); // Global strict prevent default to stop browser from opening dropped files

    if (!this.dropZone) return;
    const isOverDropZone = e.target instanceof Node && this.dropZone.contains(e.target);

    switch (e.type) {
      case 'dragenter':
      case 'dragover':
        if (isOverDropZone) this.ui.setDragState(true);
        break;
      case 'dragleave':
        // Only remove visually if leaving the dropzone boundary entirely
        if (isOverDropZone && e.relatedTarget instanceof Node && !this.dropZone.contains(e.relatedTarget)) {
          this.ui.setDragState(false);
        }
        break;
      case 'drop':
        this.ui.setDragState(false);
        if (isOverDropZone) this._handleDrop(e);
        break;
    }
  }

  /**
   * Extracted Drop Logic Core
   * @param {DragEvent} e 
   */
  async _handleDrop(e) {
    if (!e.dataTransfer) return;
    const items = Array.from(e.dataTransfer.items || []);
    const entries = items.map(i => i.webkitGetAsEntry?.()).filter(Boolean);

    // Detect folder name from the first directory entry
    const dirEntry = entries.find(entry => entry && entry.isDirectory);
    if (dirEntry) this.zipFolderName = dirEntry.name;

    // Traverse entries — extract real files, skip folder pseudo-entries
    /** @type {File[]} */
    const collectedFiles = [];
    await Promise.all(entries.map(entry => this._readEntry(entry, collectedFiles)));

    if (collectedFiles.length > 0) {
      this.processFiles(collectedFiles);
    } else {
      this.processFiles(e.dataTransfer.files); // fallback for browsers without FileSystem API
    }
  }

  /**
   * Centralized Click Delegation Core
   * @param {MouseEvent} e 
   */
  _handleClick(e) {
    if (!this.fileInput || !(e.target instanceof Node)) return;

    // If click originated from anywhere within the dropzone OR specifically the select button
    const isDropZoneClick = this.dropZone && this.dropZone.contains(e.target);
    const isBtnClick = this.config.selectBtn && this.config.selectBtn.contains(e.target);

    // Prevent double invocation gracefully instead of hard stopPropagation()
    if (isDropZoneClick || isBtnClick) {
      this.fileInput.click();
    }
  }

  /**
   * Centralized Change Delegation Core
   * @param {Event} e 
   */
  _handleChange(e) {
    // Escopo restrito: só executa se o evento de change veio do nosso file input invísivel
    if (!this.fileInput || e.target !== this.fileInput) return;
    
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (!target.files) return;
    
    const files = Array.from(target.files);
    // webkitRelativePath is populated when input has webkitdirectory or folder is selected
    if (files.length > 0 && files[0].webkitRelativePath) {
      this.zipFolderName = files[0].webkitRelativePath.split('/')[0];
    }
    
    this.processFiles(target.files);
    target.value = ''; // reset DOM state properly
  }

  // Recursively reads a FileSystemEntry — resolves files, traverses directories
  /**
   * @param {any} entry
   * @param {File[]} fileList
   * @returns {Promise<void>}
   */
  _readEntry(entry, fileList) {
    return new Promise(resolve => {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file(/** @param {File} file */ file => { fileList.push(file); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        const reader = entry.createReader();

        // readEntries() returns at most 100 entries per call — loop until empty
        const readAll = () => {
          reader.readEntries(async (/** @type {any[]} */ entries) => {
            if (entries.length === 0) return resolve();
            await Promise.all(entries.map(e => this._readEntry(e, fileList)));
            readAll(); // fetch next batch
          }, () => resolve());
        };
        readAll();
      } else {
        resolve();
      }
    });
  }

  /**
   * @param {FileList | File[]} fileList
   */
  processFiles(fileList) {
    if (!fileList || (fileList instanceof FileList && fileList.length === 0) || (Array.isArray(fileList) && fileList.length === 0)) return;
    /** @type {File[]} */
    let validFiles = [];
    Array.from(fileList).forEach(file => {
      /** @type {(message: string, type?: 'info' | 'success' | 'warning' | 'error') => void} */
      // @ts-ignore
      const showToast = this.config.showToast || window.showToast || ((message, type = 'info') => console.log(`[Toast ${type}] ${message}`));

      if (!this.ALLOWED_TYPES.has(file.type)) {
        showToast(`Oops! We don't support this format: ${file.name}`, 'error');
        return;
      }
      if (file.size > this.MAX_BYTES) {
        showToast(`This file is a bit too large: ${file.name}`, 'error');
        return;
      }
      if (file.type === 'image/png') {
        showToast('Heads up! We will convert transparent PNGs to a white background.', 'warning');
      }
      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      if (this.queue.length + validFiles.length > this.MAX_QUEUE_SIZE) {
        // @ts-ignore
        const showToast = this.config.showToast || window.showToast;
        if (typeof showToast === 'function') showToast(`For safety, we've limited your batch to ${this.MAX_QUEUE_SIZE} photos at once.`, 'warning');
        validFiles = validFiles.slice(0, this.MAX_QUEUE_SIZE - this.queue.length);
      }
      if (validFiles.length > 0) {
        this.queue.push(...validFiles);
        this.startProcessing();
      }
    }
  }

  /**
   * Main Thread Pulse Sensing (HEARTBEAT)
   * Monitors the UI thread's ability to maintain a consistent frame rate.
   * Discrepancies between frames indicate main-thread starvation.
   */
  startPulse() {
    this.lastPulseTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const delta = now - this.lastPulseTime;
      // Ideal frame is 16.6ms. We track anything above that as 'starvation lag'.
      this.pulseLag = Math.max(0, delta - 16.6);
      this.lastPulseTime = now;
      this.pulseId = requestAnimationFrame(tick);
    };
    this.pulseId = requestAnimationFrame(tick);
  }

  stopPulse() {
    if (this.pulseId) cancelAnimationFrame(this.pulseId);
    this.pulseId = null;
    this.pulseLag = 0;
  }

  async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const totalToProcess = this.queue.length;
    this.ui.showActive(totalToProcess);
    this.startPulse();
    
    // Optic Web Worker Pool Initialization (Adaptive Scaling)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // @ts-ignore - deviceMemory is non-standard but stable in Chromium
    const lowMemory = (navigator.deviceMemory && navigator.deviceMemory < 4);
    
    // Elena's Rigor: Cap concurrency on mobile/low-memory to prevent browser crash (OOM)
    const poolSize = (isMobile || lowMemory) 
        ? Math.min(2, navigator.hardwareConcurrency || 2)
        : Math.max(2, navigator.hardwareConcurrency || 4);

    const workers = [];
    for(let i=0; i<poolSize; i++){
      workers.push(new Worker(this.workerUrl));
    }

    let processedCount = 0;
    let nextIndex = 0;
    const startTime = performance.now();
    // Elena's Rigor: Adaptive Yield duration (Initial heuristic)
    let yieldMs = (isMobile || lowMemory) ? 40 : 10;
    const baseYield = yieldMs;
    // Elite Pressure Heuristic: Yield ratio (lower = more frequent yielding)
    let yieldRatio = 2.0; 

    // The Worker Dispatcher
    /** @param {Worker} worker */
    const processNext = (worker) => {
      /** @returns {Promise<void>} */
      return new Promise(/** @param {function(void):void} resolve */ (resolve) => {
        if (nextIndex >= this.queue.length) {
           resolve();
           return;
        }
        
        const fileIndex = nextIndex++;
        const file = this.queue[fileIndex];
        const jobStartTime = performance.now();
        
        worker.onmessage = async (/** @type {MessageEvent} */ e) => {
            const { success, blob, finalSize, savingsPct, filename, error } = e.data;
            
            if (success) {
                // Save to ephemeral disk (IndexedDB) and erase RAM reference
                await this.db.putFile(String(fileIndex), blob, filename);
                this.processedFileStats.push({ id: String(fileIndex), filename, size: finalSize });
                this.totalOriginalBytes += file.size;
                this.totalOptimizedBytes += finalSize;
            } else {
                console.error(`Compression failed for ${filename}`, error);
            }
            
            processedCount++;

            // Dynamic Time Estimation (Calculated after 5 samples)
            const speedInfo = {};
            if (processedCount >= 5) {
                const elapsedMs = performance.now() - startTime;
                const msPerFile = elapsedMs / processedCount;
                const remainingFiles = totalToProcess - processedCount;
                const remainingMs = remainingFiles * msPerFile;
                
                speedInfo.speed = Math.round(1000 / msPerFile);
                const secs = Math.ceil(remainingMs / 1000);
                speedInfo.timerLabel = secs > 60 ? `~${Math.ceil(secs/60)}m remaining` : `~${secs}s remaining`;
            }

            // Sync UI state
            this.ui.updateProgress(processedCount, totalToProcess, speedInfo);

            // Reactive Pressure Sensing (RPS) Logic
            const jobDuration = performance.now() - jobStartTime;
            this.latencyHistory.push(jobDuration);
            if (this.latencyHistory.length > 10) this.latencyHistory.shift();

            if (processedCount === this.BATCH_WARMUP) {
                this.baselineLatency = this.latencyHistory.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / this.latencyHistory.length;
            }

            if (processedCount > this.BATCH_WARMUP && this.baselineLatency > 0) {
                const currentAvg = this.latencyHistory.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / this.latencyHistory.length;
                const workerPressure = currentAvg / this.baselineLatency;
                
                // Sigmoid Scaling: We combine worker pressure with main-thread pulse lag.
                // pulseLag is usually 0. If it climbs to 10-20ms, it means the main thread is starving.
                const pulseHardness = 1 + (this.pulseLag / 16.6);
                const combinedPressure = workerPressure * pulseHardness;
                
                // Elastic Yield: Clamped Sigmoid Scaling
                // yieldMs = base * (1 + combinedPressure^1.5), capped at 500ms
                yieldMs = Math.min(500, baseYield * (1 + Math.pow(combinedPressure - 1, 1.8)));

                // Adaptive Frequency: If pressure is high, we yield more often
                yieldRatio = combinedPressure > 1.5 ? 1.0 : 2.0;

            }

            // Yield to Main Thread (Adaptive Frequency)
            // If yieldRatio is 1.0, we yield every poolSize jobs.
            if (processedCount % Math.max(1, Math.round(poolSize * yieldRatio)) === 0) {
               await new Promise(r => setTimeout(r, Math.max(0, yieldMs)));
            }

            processNext(worker).then(resolve);
        };
        
        worker.postMessage({ id: String(fileIndex), file, quality: 0.70, targetMime: file.type });
      });
    };

    // Ignite the engine
    await Promise.all(workers.map(w => processNext(w)));
    
    // Teardown & Finalization
    workers.forEach(w => w.terminate());
    this.stopPulse();
    this.queue = [];

    this.ui.hideActive();

    if (this.processedFileStats.length > 0) {
        const savedBytes = this.totalOriginalBytes - this.totalOptimizedBytes;
        const totalSavedPct = this.totalOriginalBytes > 0 ? Math.round((savedBytes / this.totalOriginalBytes) * 100) : 0;
        
        this.ui.showCompleted(
            totalSavedPct,
            (savedBytes / 1024 / 1024).toFixed(2),
            (this.totalOptimizedBytes / 1024 / 1024).toFixed(2),
            this.processedFileStats.length
        );
    }

    this.isProcessing = false;
  }
}

// Initialize the UI Manager Singleton
const uiManager = new OpticUI({
  dropZone,
  activeSection: document.getElementById('active-compression-section'),
  jobsList: document.getElementById('active-jobs-list'),
  countText: document.getElementById('active-compression-count'),
  completedSection: document.getElementById('completed-compression-section'),
  completedStatsText: document.getElementById('completed-compression-stats'),
  downloadBtnText: document.getElementById('download-btn-text')
});

// Initialize the Uploader Queue Singleton
const uploader = new OpticFileQueue({
  dropZone,
  fileInput,
  selectBtn: document.getElementById('select-files-btn'),
  ui: uiManager,
  showToast: typeof showToast === 'function' ? showToast : undefined,
  db: db,
  workerUrl: new URL('../workers/worker.js', import.meta.url)
});

// ── Progress Bar Animation (Fake) Removed for Scale ────────────
// Native accurate calculation is now used via the Worker dispatcher.



// ── Download All (Batch Zip Generation) ──────────────────────────────────

/**
 * @typedef {Object} OpticExporterConfig
 * @property {HTMLElement | null} btn
 * @property {OpticFileQueue} sourceQueue
 * @property {OpticDB} db
 * @property {any} JSZip
 * @property {function(string, string=): void} [showToast]
 */

class OpticExporter {
  /**
   * @param {OpticExporterConfig} config
   */
  constructor(config) {
    this.btn = config.btn;
    this.sourceQueue = config.sourceQueue;
    this.db = config.db;
    this.JSZip = config.JSZip;
    // @ts-ignore
    this.showToast = config.showToast || window.showToast || ((m, t) => console.log(`[Toast ${t}] ${m}`));

    if (this.btn) {
      this.btn.addEventListener('click', () => this.exportAll());
    }
  }

  async exportAll() {
    if (!this.btn || this.btn.classList.contains('is-zipping')) return;

    const stats = this.sourceQueue.processedFileStats;
    if (stats.length === 0) {
      this.showToast('No images to zip.', 'error');
      return;
    }

    if (!this.JSZip) {
      console.error('[Optic Exporter] JSZip not injected.');
      this.showToast('Oops, zip packaging is not available.', 'error');
      return;
    }

    // ── Chunked ZIP to avoid ArrayBuffer OOM on large batches ────────
    // Elena's Rigor: Dynamic chunk size (200MB on mobile vs 800MB on desktop)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const MAX_CHUNK_BYTES = (isMobile ? 200 : 800) * 1024 * 1024; 
    const folderName = this.sourceQueue.zipFolderName || 'photos';

    // Split files into chunks by cumulative blob size
    const chunks = [];
    let current = [], currentSize = 0;
    for (const f of stats) {
      if (currentSize + f.size > MAX_CHUNK_BYTES && current.length > 0) {
        chunks.push(current);
        current = [];
        currentSize = 0;
      }
      current.push(f);
      currentSize += f.size;
    }
    if (current.length > 0) chunks.push(current);

    const totalChunks = chunks.length;
    this.btn.classList.add('is-zipping');
    const originalHtml = this.btn.innerHTML;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        const partLabel = totalChunks > 1 ? `_parte${i + 1}de${totalChunks}` : '';

        this.btn.innerHTML = `
          <span class="material-symbols-outlined animate-spin" data-icon="sync" style="font-variation-settings: 'FILL' 0;">sync</span>
          <span>Zipping ${totalChunks > 1 ? `part ${i + 1}/${totalChunks}` : `${chunk.length} files`}...</span>
        `;

        const zip = new this.JSZip();
        
        // Sequentially hydrate RAM with blobs from disk to prevent OOM
        let loaded = 0;
        for (const stat of chunk) {
          const record = await this.db.getFile(stat.id);
          if (record && record.blob) {
            // Anti Zip-Slip: Força a remoção de qualquer path traversal ou diretório malicioso injetado via file API
            const safeName = record.filename.replace(/^.*[\\\/:]/, '').replace(/\.[^.]+$/, '');
            zip.file(`${safeName}.jpeg`, record.blob);
          }
          loaded++;
          if (loaded % 25 === 0) await new Promise(r => setTimeout(r, 0)); // yield loop
        }

        await Promise.resolve(); // yield to browser before heavy generation

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(zipBlob);
        anchor.download = `${folderName}${partLabel}.zip`;
        anchor.click();

        // Free memory immediately before generating next chunk
        setTimeout(() => URL.revokeObjectURL(anchor.href), 3000);

        // Small pause between chunks to let browser release memory
        if (i < totalChunks - 1) {
          chunk.length = 0; // Clear chunk references
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const msg = totalChunks > 1
        ? `Finished downloading ${totalChunks} folders (${stats.length} images).`
        : `All done! Downloading ${stats.length} images.`;
      this.showToast(msg);
      
      // Clear RAM & DB after fully downloading
      this.db.clear().catch(console.error);

    } catch (err) {
      console.error('[Optic Uploader] Batch Download Failed', err);
      this.showToast('Sorry, we failed to generate your ZIP.', 'error');
    } finally {
      this.btn.classList.remove('is-zipping');
      this.btn.innerHTML = originalHtml;
    }
  }
}

// Initialize the Exporter Singleton
const exporter = new OpticExporter({
  btn: downloadAllBtn,
  sourceQueue: uploader,
  db: db,
  JSZip: JSZip,
  showToast: typeof showToast === 'function' ? showToast : undefined
});

// ── Toast Notifications ──────────────────────────────────────────────

/**
 * @param {string} message
 * @param {string} type
 */
function showToast(message, type = 'default') {
  const existing = document.getElementById('optic-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'optic-toast';

  const bg    = type === 'error'   ? 'var(--error-container)'    :
                type === 'warning' ? '#fef3c7'                    : 'var(--inverse-surface)';
  const color = type === 'error'   ? 'var(--error)'              :
                type === 'warning' ? '#92400e'                    : 'var(--inverse-on-surface)';

  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(8px);
    background: ${bg};
    color: ${color};
    padding: 0.625rem 1.125rem;
    border-radius: 0.375rem;
    font-family: 'Inter', sans-serif;
    font-size: 0.8125rem;
    font-weight: 500;
    white-space: nowrap;
    box-shadow: 0 0 24px rgba(43,52,55,0.12);
    z-index: 999;
    opacity: 0;
    transition: opacity 200ms ease, transform 200ms ease;
    pointer-events: none;
  `;

  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => toast.remove(), 220);
  }, 2800);
}

// ── Nav active link tracking on scroll ──────────────────────────────

const navLinks = document.querySelectorAll('.optic-nav-link[data-section]');
const pageSections = document.querySelectorAll('section[id]');

const navObserver = new IntersectionObserver((/** @type {IntersectionObserverEntry[]} */ entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('is-active'));
      const match = document.querySelector(`.optic-nav-link[data-section="${entry.target.id}"]`);
      if (match) match.classList.add('is-active');
    }
  });
}, { threshold: 0.4 });

pageSections.forEach(s => navObserver.observe(s));
