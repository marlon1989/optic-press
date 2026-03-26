import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Disable the modulePreload polyfill — it generates `data:text/javascript` URI scripts
    // that violate a strict CSP (script-src without 'data:'). All modern browsers
    // support <link rel="modulepreload"> natively, so the polyfill is unnecessary.
    modulePreload: { polyfill: false },

    // Prevent Vite from inlining ANY asset as a data: URI during build.
    // Without this, small JS modules (like main.js at 254 bytes) are rewritten
    // to href="data:text/javascript;base64,..." in <link rel="modulepreload">,
    // which violates a strict script-src CSP that does not allow data: URIs.
    assetsInlineLimit: 0,
  },
});
