// Critical script to prevent Flash of Unstyled Content (FOUC)
// Synchronously reads localStorage and OS preference BEFORE painting the DOM
// Moved to an external file to comply with strict Content-Security-Policy
// @ts-check
let opticTheme = localStorage.getItem('optic_theme');
if (!opticTheme) {
  opticTheme = 'system';
  localStorage.setItem('optic_theme', 'system');
}
if (opticTheme === 'dark' || (opticTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}
