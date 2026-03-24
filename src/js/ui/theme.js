// @ts-check

class OpticThemeManager {
  constructor() {
    /** @type {HTMLElement} */
    this.htmlEl = document.documentElement;
    /** @type {string} */
    this.STORAGE_KEY = 'optic_theme';
    /** @type {MediaQueryList} */
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // UI Elements
    /** @type {HTMLElement | null} */
    this.menuButton = document.getElementById('theme-menu-button');
    /** @type {HTMLElement | null} */
    this.dropdown = document.getElementById('theme-dropdown');
    /** @type {NodeListOf<HTMLElement> | Array<HTMLElement>} */
    // @ts-ignore
    this.options = this.dropdown ? this.dropdown.querySelectorAll('[data-theme]') : [];
    
    this.init();
  }

  init() {
    if (!this.menuButton || !this.dropdown) return;

    // Real-time listener for OS theme changes
    this.mediaQuery.addEventListener('change', () => {
       if (localStorage.getItem(this.STORAGE_KEY) === 'system') {
           this.applyCurrentState();
       }
    });

    this.applyCurrentState();

    // Toggle menu
    this.menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Handle selection
    this.options.forEach(opt => {
      opt.addEventListener('click', () => {
        this.setTheme(opt.dataset.theme || 'system');
        this.closeDropdown();
      });
    });

    // Close on click outside
    document.addEventListener('click', () => this.closeDropdown());
  }

  toggleDropdown() {
    if (!this.dropdown) return;
    const isHidden = this.dropdown.classList.contains('hidden');
    if (isHidden) {
      this.dropdown.classList.remove('hidden');
    } else {
      this.closeDropdown();
    }
  }

  closeDropdown() {
    if (this.dropdown) {
      this.dropdown.classList.add('hidden');
    }
  }

  applyCurrentState() {
     const theme = localStorage.getItem(this.STORAGE_KEY) || 'system';
     let isDark = false;
     
     if (theme === 'dark') {
         isDark = true;
     } else if (theme === 'light') {
         isDark = false;
     } else { // system mode
         isDark = this.mediaQuery.matches;
     }
     
     if (isDark) {
        this.htmlEl.classList.add('dark');
     } else {
        this.htmlEl.classList.remove('dark');
     }
     
     this.updateUI(theme);
  }

  /** @param {string} theme */
  setTheme(theme) {
    localStorage.setItem(this.STORAGE_KEY, theme);
    this.applyCurrentState();
  }

  /** @param {string} theme */
  updateUI(theme) {
    // Update main button icon
    if (this.menuButton) {
      if (theme === 'system') {
        this.menuButton.textContent = 'monitor';
      } else if (theme === 'dark') {
        this.menuButton.textContent = 'dark_mode';
      } else {
        this.menuButton.textContent = 'light_mode';
      }
    }

    // Update checkmarks in dropdown
    this.options.forEach(opt => {
      const check = opt.querySelector('[data-check]');
      if (check) {
        if (opt.dataset.theme === theme) {
          check.classList.remove('hidden');
        } else {
          check.classList.add('hidden');
        }
      }
    });
  }
}

// Bind to DOM when ready
document.addEventListener('DOMContentLoaded', () => {
  new OpticThemeManager();
  
  // Update current year in footer
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
});
