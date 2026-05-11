// @ts-check

/**
 * OpticPress progress UI manager.
 * Example: `ui.showActive(files.length)` renders global progress state.
 */
export class OpticUI {
  /** @param {OpticUIConfig} config */
  constructor(config) {
    this.dropZone = config.dropZone;
    this.activeSection = config.activeSection;
    this.jobsList = config.jobsList;
    this.countText = config.countText;
    this.completedSection = config.completedSection;
    this.completedStatsText = config.completedStatsText;
    this.downloadBtnText = config.downloadBtnText;

    /** @type {HTMLElement | null} */
    this.globalProgressEl = null;
    /** @type {HTMLElement | null} */
    this.fillEl = null;
    /** @type {HTMLElement | null} */
    this.pctEl = null;
    /** @type {HTMLElement | null} */
    this.countEl = null;
    /** @type {HTMLElement | null} */
    this.speedEl = null;
    /** @type {HTMLElement | null} */
    this.timerEl = null;
  }

  /** @param {boolean} isDragging */
  setDragState(isDragging) {
    if (!this.dropZone) return;
    this.dropZone.classList.toggle('is-dragover', isDragging);
  }

  /** @param {number} totalCount */
  showActive(totalCount) {
    if (this.activeSection) {
      this.activeSection.classList.remove('hidden');
      this.activeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (this.countText) this.countText.textContent = `Processing ${totalCount} images...`;
    if (this.globalProgressEl || !this.jobsList) return;

    this.jobsList.innerHTML = '';
    this.globalProgressEl = document.createElement('div');
    this.globalProgressEl.className = 'bg-surface-container-lowest p-6 rounded-xl ambient-shadow ghost-border mb-4 transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/5 cursor-default';
    this.globalProgressEl.innerHTML = `
      <div class="flex justify-between mb-2">
        <span class="font-semibold text-on-surface">Compressing your images</span>
        <div class="flex items-center space-x-3">
          <span class="font-mono text-sm font-medium bg-primary-container text-primary px-2 py-0.5 rounded shadow-sm opacity-0 transition-opacity duration-300" id="global-speed">0 img/s</span>
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
    this.cacheProgressElements();
  }

  cacheProgressElements() {
    this.fillEl = document.getElementById('global-fill');
    this.pctEl = document.getElementById('global-pct-text');
    this.countEl = document.getElementById('global-count-text');
    this.speedEl = document.getElementById('global-speed');
    this.timerEl = document.getElementById('global-timer');
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
      this.speedEl.textContent = `${speedInfo.speed} img/s`;
      this.speedEl.style.opacity = '1';
    }
    if (speedInfo.timerLabel && this.timerEl) this.timerEl.textContent = speedInfo.timerLabel;
  }

  hideActive() {
    if (this.countText) this.countText.textContent = 'Processing 0 images in your queue';
    if (this.activeSection) this.activeSection.classList.add('hidden');
    if (!this.globalProgressEl) return;

    this.globalProgressEl.remove();
    this.globalProgressEl = null;
  }

  /**
   * @param {number} totalSavedPct
   * @param {string} savedMB
   * @param {string} totalOptimizedMB
   * @param {number} processedCount
   */
  showCompleted(totalSavedPct, savedMB, totalOptimizedMB, processedCount) {
    if (!this.completedSection) return;

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
