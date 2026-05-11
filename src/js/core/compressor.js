// @ts-check
/**
 * OpticPress Compressor — Interaction Layer
 * Handles: drag & drop, file input, progress simulation, card selection
 */
import {
  BATCH_FILE_LIMIT,
  FILE_SIZE_LIMIT_BYTES,
  collectAcceptedImageFiles,
  getFolderNameFromRelativePath,
} from './file-rules.js';
import { OpticDB } from './optic-db.js';
import { OpticExporter } from './exporter.js';
import { OpticUI } from '../ui/progress.js';
import { showToast } from '../ui/toast.js';
// JSZip has been moved to zip.worker.js — zero zip dependency on the Main Thread.

// ── DOM References ───────────────────────────────────────────────────

/** @type {HTMLElement | null} */
const dropZone = document.getElementById('drop-zone');
/** @type {HTMLInputElement | null} */
const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById('file-input'));
/** @type {HTMLElement | null} */
const downloadAllBtn = document.getElementById('download-all-btn');

// ── Core Compression Engine (Moved to js/worker.js) ────────────
// The main thread now merely dispatches jobs to isolated Web Workers
// to prevent browser freezes when handling 7k+ images.

const db = new OpticDB();
window.showToast = showToast;

class OpticFileQueue {
  /**
   * @param {Object} config
   * @param {HTMLElement | null} config.dropZone
   * @param {HTMLInputElement | null} config.fileInput
   * @param {HTMLElement | null} [config.selectBtn]
   * @param {OpticUI} config.ui
   * @param {(message: string, type?: ToastType) => void} [config.showToast]
   * @param {OpticDB} config.db
   * @param {() => Worker} config.createWorker
   */
  constructor(config) {
    this.config = config;
    this.db = config.db;
    this.ui = config.ui;
    this.createWorker = config.createWorker;
    this.showToast = config.showToast || showToast;
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
    // Clear DB on start to prevent leftover space usage
    this.db.clear().catch(console.error);
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
      this.zipFolderName = getFolderNameFromRelativePath(files[0].webkitRelativePath);
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
    const validFiles = collectAcceptedImageFiles(Array.from(fileList), {
      existingQueueCount: this.queue.length,
      maxBytes: FILE_SIZE_LIMIT_BYTES,
      maxQueueSize: BATCH_FILE_LIMIT,
      showToast: this.showToast,
    });
    if (validFiles.length === 0) return;

    this.queue.push(...validFiles);
    this.startProcessing();
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
      workers.push(this.createWorker());
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
  createWorker: createCompressionWorker
});

// Initialize the Exporter Singleton
const exporter = new OpticExporter({
  btn: downloadAllBtn,
  sourceQueue: uploader,
  db: db,
  createZipWorker,
  showToast
});

/** @returns {Worker} */
function createCompressionWorker() {
  return new Worker(new URL('../workers/worker.js', import.meta.url), { type: 'module' });
}

/** @returns {Worker} */
function createZipWorker() {
  return new Worker(new URL('../workers/zip.worker.js', import.meta.url), { type: 'module' });
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
