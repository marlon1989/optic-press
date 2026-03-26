import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Disable the modulePreload polyfill — it generates `data:text/javascript` URI scripts
    // that violate a strict CSP (script-src without 'data:'). All modern browsers
    // support <link rel="modulepreload"> natively, so the polyfill is unnecessary.
    modulePreload: { polyfill: false },
  },
});
