import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Theme manager dependencies are present in HTML', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verify theme menu button exists
  assert.match(indexHtml, /id="theme-menu-button"/, 'Theme menu button must exist');
  
  // Verify dropdown exists
  assert.match(indexHtml, /id="theme-dropdown"/, 'Theme dropdown must exist');

  // Verify theme options exist
  assert.match(indexHtml, /data-theme="light"/, 'Light theme option must exist');
  assert.match(indexHtml, /data-theme="dark"/, 'Dark theme option must exist');
  assert.match(indexHtml, /data-theme="system"/, 'System theme option must exist');
});

test('Footer year has a current fallback and dynamic updater', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const themeJs = await readFile(new URL('../src/js/ui/theme.js', import.meta.url), 'utf8');

  assert.doesNotMatch(indexHtml, /&copy;\s*2024\b/, 'Footer must not be pinned to 2024');
  assert.match(indexHtml, /id="current-year">2026<\/span>/, 'Footer fallback year must be current for static rendering');
  assert.match(themeJs, /new Date\(\)\.getFullYear\(\)/, 'Footer year must be updated from the runtime date');
});

test('Theme manager handles multiple instantiations safely', async () => {
  const themeJs = await readFile(new URL('../src/js/ui/theme.js', import.meta.url), 'utf8');
  
  // Verify robust instantiation logic
  assert.match(themeJs, /isThemeInitialized = true/, 'Must have a flag to prevent multiple initializations');
  assert.match(themeJs, /if \(isThemeInitialized\) return/, 'Must return early if already initialized');
});

test('Theme manager keeps default system mode reactive and accessible', async () => {
  const themeJs = await readFile(new URL('../src/js/ui/theme.js', import.meta.url), 'utf8');
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    themeJs,
    /if \(!storedTheme \|\| storedTheme === 'system'\)/,
    'Default system mode must react to OS theme changes even before localStorage is written',
  );
  assert.match(themeJs, /clearCloseTimer/, 'Dropdown close timers must be cleared when reopening quickly');
  assert.match(indexHtml, /aria-expanded="false"/, 'Theme trigger must expose collapsed state');
  assert.match(indexHtml, /aria-hidden="true"/, 'Theme dropdown must expose hidden state');
});
