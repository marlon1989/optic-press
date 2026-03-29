// @ts-check
/**
 * OpticPress Compressor — Interaction Layer
 * Handles: drag & drop, file input, progress simulation, card selection
 */
import { escapeHTML } from './utils.js';
// JSZip has been moved to zip.worker.js — zero zip dependency on the Main Thread.

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

// ── IndexedDB Wrapper (RAM Eradication Engine) ──────────────────────

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
   * @param {string} [mime]
   * @returns {Promise<void>}
   */
  async putFile(id, blob, filename, mime = 'image/jpeg') {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put({ id, blob, filename, mime });
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

// ── Drop Zone Architecture (File API) ────────────────────────────────

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
           <div class="bg-primary h-full transition-all duration-300" id="global-fill"></div>
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
    this.ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/avif', 'image/x-nikon-nef', 'image/nef']);
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

      const isNef = file.name.toLowerCase().endsWith('.nef');
      if (!this.ALLOWED_TYPES.has(file.type) && !isNef) {
        showToast(`Unsupported file: ${file.name}. Currently, we only support WEBP, PNG, JPEG, AVIF and NEF.`, 'error');
        return;
      }
      if (file.size > this.MAX_BYTES) {
        showToast(`This file is a bit too large: ${file.name}`, 'error');
        return;
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

    // ── Battery Status API (Predictive Resilience) ────────────────────────
    // If the user is on low battery and unplugged, we become a considerate guest.
    // We clamp concurrency to 1 and increase yield to prevent draining a dying battery.
    let isBatteryLow = false;
    if ('getBattery' in navigator) { // Firefox/Safari guard — API is Chromium-only
      try {
        // @ts-ignore - getBattery is non-standard but widely supported in Chromium
        const battery = await navigator.getBattery();
        if (battery.level < 0.20 && !battery.charging) {
          isBatteryLow = true;
        }
      } catch (_e) { /* getBattery rejected — no-op, proceed normally */ }
    }
    
    // Elite Priority: Battery constraint overrides all other heuristics
    const poolSize = isBatteryLow
        ? 1
        : (isMobile || lowMemory) 
            ? Math.min(2, navigator.hardwareConcurrency || 2)
            : Math.max(2, navigator.hardwareConcurrency || 4);

    const workers = [];
    for(let i=0; i<poolSize; i++){
      workers.push(new Worker(this.workerUrl, { type: 'module' }));
    }

    let processedCount = 0;
    let nextIndex = 0;
    const startTime = performance.now();
    // Adaptive Yield duration: Battery mode gets the most generous yield
    let yieldMs = isBatteryLow ? 80 : (isMobile || lowMemory) ? 40 : 10;
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
            const { success, finalSize, savingsPct, filename, finalMime, error } = e.data;
            
            if (success) {
                // Worker already persisted the blob to IndexedDB (True Worker-to-Disk).
                // We only track the lightweight stat metadata here — zero blob RAM on the main thread.
                this.processedFileStats.push({ id: String(fileIndex), filename, size: finalSize, mime: finalMime });
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

// ── Download All (Batch Zip Generation) ──────────────────────────────────

class OpticExporter {
  /**
   * @param {OpticExporterConfig} config
   */
  constructor(config) {
    this.btn = config.btn;
    this.sourceQueue = config.sourceQueue;
    this.db = config.db;
    this.zipWorkerUrl = config.zipWorkerUrl;
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

    // ── Chunked ZIP Worker Dispatch ─────────────────────────────────────────
    // ZIP generation happens entirely in zip.worker.js — the Main Thread
    // receives only a completed Blob and triggers the <a>.click() download.
    // This keeps the UI at 60fps even while packaging hundreds of images.
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const MAX_CHUNK_BYTES = (isMobile ? 200 : 800) * 1024 * 1024;
    const folderName = this.sourceQueue.zipFolderName || 'photos';

    // Split stats into chunks by cumulative compressed size
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

        this.btn.innerHTML = `
          <span class="material-symbols-outlined animate-spin icon-outline" data-icon="sync">sync</span>
          <span>Zipping ${totalChunks > 1 ? `part ${i + 1}/${totalChunks}` : `${chunk.length} files`}...</span>
        `;

        // Dispatch to Zip Worker — blocking zip.generateAsync() runs off-thread
        const chunkBlob = await new Promise((resolve, reject) => {
          const zipWorker = new Worker(this.zipWorkerUrl);
          zipWorker.onmessage = (/** @type {MessageEvent} */ e) => {
            zipWorker.terminate();
            if (e.data.error) {
              reject(new Error(e.data.error));
            } else {
              resolve(e.data.chunkBlob);
            }
          };
          zipWorker.onerror = (err) => {
            zipWorker.terminate();
            reject(err);
          };
          zipWorker.postMessage({ stats: chunk, folderName, chunkIndex: i, totalChunks });
        });

        const partLabel = totalChunks > 1 ? `_parte${i + 1}de${totalChunks}` : '';
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(/** @type {Blob} */ (chunkBlob));
        anchor.download = `${folderName}${partLabel}.zip`;
        anchor.click();

        // Revoke URL after a short delay to ensure the download starts
        setTimeout(() => URL.revokeObjectURL(anchor.href), 3000);

        // Brief pause between chunks so the browser can release memory
        if (i < totalChunks - 1) {
          current.length = 0;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const msg = totalChunks > 1
        ? `Finished downloading ${totalChunks} folders (${stats.length} images).`
        : `All done! Downloading ${stats.length} images.`;
      this.showToast(msg);

      // Clear IDB after all chunks are downloaded
      this.db.clear().catch(console.error);

    } catch (err) {
      console.error('[Optic Exporter] Batch Download Failed', err);
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
  zipWorkerUrl: new URL('../workers/zip.worker.js', import.meta.url),
  showToast: typeof showToast === 'function' ? showToast : undefined
});

// ── Toast Notifications ──────────────────────────────────────────────

/**
 * @param {string} message
 * @param {string} type
 */
/**
 * OpticPress Premium Toast Notification System
 * Implements glassmorphism, SVG icons, and smooth physics-based animations.
 * @param {string} message 
 * @param {string} [type] 
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('optic-toast-container') || (() => {
    const c = document.createElement('div');
    c.id = 'optic-toast-container';
    document.body.appendChild(c);
    return c;
  })();

  // Clear existing to avoid stacking (maintained UX choice for this layout)
  container.innerHTML = '';

  const toast = document.createElement('div');
  const typeClass = `optic-toast-${['success', 'error', 'warning', 'info'].includes(type) ? type : 'info'}`;
  toast.className = `optic-toast ${typeClass}`;
  
  // Icon Mapping (Heroicons Outline)
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>`
  };

  const icon = icons[/** @type {keyof typeof icons} */ (type)] || icons.info;

  toast.innerHTML = `
    <div class="flex-shrink-0">${icon}</div>
    <span class="text-sm font-semibold tracking-wide whitespace-normal sm:whitespace-nowrap">${escapeHTML(message)}</span>
    <div class="optic-toast-progress"></div>
  `;

  container.appendChild(toast);

  // Animate In: Force reflow for transition
  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  // Auto-Dismiss
  const cleanup = () => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 500);
  };

  const timer = setTimeout(cleanup, 3000);

  // Pause on hover (Elite UX feature)
  toast.onmouseenter = () => {
    clearTimeout(timer);
    const progress = toast.querySelector('.optic-toast-progress');
    if (progress instanceof HTMLElement) progress.style.animationPlayState = 'paused';
  };
  
  toast.onmouseleave = () => {
    setTimeout(cleanup, 1000);
    const progress = toast.querySelector('.optic-toast-progress');
    if (progress instanceof HTMLElement) progress.style.animationPlayState = 'running';
  };
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
