(function () {
  const opticTheme = localStorage.getItem('optic_theme') || 'system';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (opticTheme === 'dark' || (opticTheme === 'system' && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
})();
