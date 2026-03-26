// @ts-check

/**
 * @param {string | null} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class OpticResultCard extends HTMLElement {
  connectedCallback() {
    // Read attributes
    const variant = this.getAttribute('variant') || 'default';
    const filename = escapeHTML(this.getAttribute('filename') || 'untitled.jpg');
    const badge = this.getAttribute('badge') ? escapeHTML(this.getAttribute('badge')) : null;
    const originalLabel = escapeHTML(this.getAttribute('original-label') || 'Original');
    const originalValue = escapeHTML(this.getAttribute('original-value') || '--');
    const optimizedLabel = escapeHTML(this.getAttribute('optimized-label') || 'Optimized');
    const optimizedValue = escapeHTML(this.getAttribute('optimized-value') || '--');
    const precisionMode = this.getAttribute('precision-mode') ? escapeHTML(this.getAttribute('precision-mode')) : null;
    const imgSrc = escapeHTML(this.getAttribute('img-src') || '');
    const imgAlt = escapeHTML(this.getAttribute('img-alt') || 'Preview');

    let contentHtml = '';

    if (variant === 'status') {
      contentHtml = `
        <div class="result-card bg-surface-container-low p-8 rounded-xl border border-primary/10 relative overflow-hidden h-full flex flex-col cursor-pointer transition-shadow hover:shadow-md">
          <div class="absolute top-0 right-0 p-4">
            <span class="material-symbols-outlined text-primary" data-icon="verified"
              class="material-symbols-outlined text-emerald-500 text-sm icon-filled">verified</span>
          </div>
          <div class="flex justify-between items-start mb-8">
            <div class="w-16 h-16 bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm">
              <img alt="${imgAlt}" src="${imgSrc}" />
            </div>
          </div>
          <div class="mb-auto">
            <h4 class="font-bold text-on-surface mb-1 truncate">${filename}</h4>
            ${precisionMode ? `<p class="text-xs text-on-surface-variant mb-4">${precisionMode}</p>` : ''}
            <div class="flex space-x-4 text-sm mb-6">
              <div class="text-on-surface-variant">
                <p class="label-sm uppercase tracking-tighter opacity-60">${originalLabel}</p>
                <p class="font-medium">${originalValue}</p>
              </div>
              <div class="text-primary font-bold">
                <p class="label-sm uppercase tracking-tighter opacity-60">${optimizedLabel}</p>
                <p>${optimizedValue}</p>
              </div>
            </div>
          </div>
          <button class="w-full py-3 mt-auto bg-primary text-on-primary rounded font-semibold text-sm hover:bg-primary-dim transition-colors card-download-btn">
            Download
          </button>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="result-card bg-surface-container-lowest p-8 rounded-xl ghost-border hover:bg-surface-bright transition-colors group h-full flex flex-col cursor-pointer">
          <div class="flex justify-between items-start mb-8">
            <div class="w-16 h-16 bg-surface-container rounded-lg overflow-hidden shrink-0">
              <img alt="${imgAlt}" src="${imgSrc}" class="w-full h-full object-cover" />
            </div>
            ${badge ? `<span class="bg-tertiary-container text-on-tertiary-container text-xs font-bold px-3 py-1 rounded-full">${badge}</span>` : ''}
          </div>
          <div class="mb-auto">
            <h4 class="font-bold text-on-surface mb-1 truncate">${filename}</h4>
            <div class="flex space-x-4 text-sm mb-6">
              <div class="text-on-surface-variant">
                <p class="label-sm uppercase tracking-tighter opacity-60">${originalLabel}</p>
                <p class="font-medium">${originalValue}</p>
              </div>
              <div class="text-primary font-bold">
                <p class="label-sm uppercase tracking-tighter opacity-60">${optimizedLabel}</p>
                <p>${optimizedValue}</p>
              </div>
            </div>
          </div>
          <button class="w-full py-3 mt-auto bg-secondary-container text-on-secondary-container rounded font-semibold text-sm hover:opacity-90 transition-opacity card-download-btn">
            Download
          </button>
        </div>
      `;
    }

    this.innerHTML = contentHtml;

    // Dispatch selection events
    const cardEl = this.querySelector('.result-card');
    if (cardEl) {
      cardEl.addEventListener('click', (e) => {
        // Prevent clicking the download button from selecting the card
        const target = /** @type {HTMLElement} */ (e.target);
        if (target && target.closest && target.closest('button')) return;
        this.dispatchEvent(new CustomEvent('card-selected', { bubbles: true, detail: { card: cardEl } }));
      });
    }

    // Attach toast event to the download button
    const btn = this.querySelector('.card-download-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        /** @type {(message: string, type?: 'info' | 'success' | 'warning' | 'error') => void} */
        // @ts-ignore
        const showToast = window.showToast || ((m, t = 'info') => console.log(`[Toast ${t}] ${m}`));
        showToast(`Downloading ${filename}...`);
      });
    }
  }
}

// Register the web component
customElements.define('optic-result-card', OpticResultCard);

class OpticHistoryRow extends HTMLElement {
  connectedCallback() {
    const filename = escapeHTML(this.getAttribute('filename') || 'untitled');
    const original = escapeHTML(this.getAttribute('original') || '--');
    const optimized = escapeHTML(this.getAttribute('optimized') || '--');
    const savings = escapeHTML(this.getAttribute('savings') || '--');
    const date = escapeHTML(this.getAttribute('date') || '');

    this.innerHTML = `
      <div class="grid grid-cols-12 gap-4 px-6 py-4 items-center border-t border-outline-variant/10 hover:bg-surface-bright transition-colors group cursor-pointer">
        <div class="col-span-5 flex items-center space-x-4">
          <div class="w-10 h-10 bg-surface-container rounded flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-xl icon-filled">image</span>
          </div>
          <div class="overflow-hidden">
            <h4 class="font-bold text-sm text-on-surface truncate group-hover:text-primary transition-colors">${filename}</h4>
            <span class="text-xs text-on-surface-variant">${date}</span>
          </div>
        </div>
        <div class="col-span-2 text-right text-sm text-on-surface-variant font-medium">${original}</div>
        <div class="col-span-2 text-right text-sm text-primary font-bold">${optimized}</div>
        <div class="col-span-1 flex justify-center">
          <span class="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-2 py-0.5 rounded-full">${savings}</span>
        </div>
        <div class="col-span-2 flex justify-end">
           <button class="bg-surface-container-high text-on-surface hover:bg-primary-container hover:text-on-primary-container transition-colors w-8 h-8 rounded flex items-center justify-center">
             <span class="material-symbols-outlined text-sm">download</span>
           </button>
        </div>
      </div>
    `;
  }
}

customElements.define('optic-history-row', OpticHistoryRow);
