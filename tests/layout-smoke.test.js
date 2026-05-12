import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

test('source HTML loads Tailwind CSS before application JavaScript', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const mainJs = await readFile(new URL('../src/js/main.js', import.meta.url), 'utf8');

  const stylesheetIndex = indexHtml.indexOf('href="/src/styles/input.css"');
  const scriptIndex = indexHtml.indexOf('src="/src/js/main.js"');

  assert.notEqual(stylesheetIndex, -1, 'Expected index.html to link /src/styles/input.css');
  assert.notEqual(scriptIndex, -1, 'Expected index.html to load /src/js/main.js');
  assert.ok(stylesheetIndex < scriptIndex, 'Expected Tailwind stylesheet before app script');
  assert.doesNotMatch(mainJs, /styles\/input\.css/, 'CSS must not depend on main.js execution');
});

test('initial layout-only sections stay hidden until JavaScript shows them', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(
    indexHtml,
    /<(?:section|div)[^>]*id="active-compression-section"[^>]*class="[^"]*\bhidden\b[^"]*"/,
    'active compression section must start hidden',
  );
  assert.match(
    indexHtml,
    /<(?:section|div)[^>]*id="completed-compression-section"[^>]*class="[^"]*\bhidden\b[^"]*"/,
    'completed compression section must start hidden',
  );
  assert.match(
    indexHtml,
    /<input[^>]*id="file-input"[^>]*class="[^"]*\bhidden\b[^"]*"/,
    'native file input must remain visually hidden',
  );
});

test('source HTML has no conflicting Tailwind display utilities on one element', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const classMatches = indexHtml.matchAll(/class="([^"]+)"/g);
  const displayUtilities = ['block', 'flex', 'grid', 'hidden', 'inline', 'inline-block', 'inline-flex'];

  for (const match of classMatches) {
    const classes = match[1].split(/\s+/);
    const conflicts = classes.filter((className) => displayUtilities.includes(className));
    assert.ok(
      conflicts.length <= 1,
      `Expected one display utility per element, received: ${conflicts.join(', ')}`,
    );
  }
});


test('production build emits CSS bundle with critical Tailwind layout utilities', async () => {
  await execFileAsync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: projectRoot,
    timeout: 120000,
  });

  const distHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const stylesheetMatch = distHtml.match(/<link rel="stylesheet"[^>]+href="([^"]+\.css)"/);
  assert.ok(stylesheetMatch, 'Expected dist/index.html to include built stylesheet link');

  const cssFiles = await readdir(new URL('../dist/assets/', import.meta.url));
  const cssFile = cssFiles.find((fileName) => fileName.endsWith('.css'));
  assert.ok(cssFile, 'Expected dist/assets to contain a CSS file');

  const cssText = await readFile(join(projectRoot, 'dist/assets', cssFile), 'utf8');
  assert.match(cssText, /\.hidden\{display:none\}/, 'Expected Tailwind hidden utility');
  assert.match(cssText, /\.flex\{display:flex\}/, 'Expected Tailwind flex utility');
  assert.match(cssText, /\.max-w-7xl\{max-width:80rem\}/, 'Expected page max-width utility');
  assert.match(cssText, /\.text-center\{text-align:center\}/, 'Expected centered hero utility');
  assert.match(cssText, /\.rounded-full\{border-radius:/, 'Expected rounded button utility');

  const assetFiles = await readdir(new URL('../dist/assets/', import.meta.url));
  const workerFiles = assetFiles.filter((fileName) => /(?:^worker-|^zip\.worker-).+\.js$/.test(fileName));
  assert.equal(workerFiles.length, 2, 'Expected production build to emit both worker bundles');

  const workerTexts = await Promise.all(
    workerFiles.map((fileName) => readFile(join(projectRoot, 'dist/assets', fileName), 'utf8')),
  );
  for (const workerText of workerTexts) {
    assert.doesNotMatch(workerText, /import\s+[^;]+['"](?:utif|jszip)['"]/, 'Worker dependencies must be bundled');
    assert.doesNotMatch(workerText, /\.\.\/core\/export-planner\.js/, 'Worker helper modules must be bundled');
  }
});
