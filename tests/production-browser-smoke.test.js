import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { access, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const commonViewports = [
  { name: 'mobile-small', width: 360, height: 640 },
  { name: 'mobile-modern', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

test('production build opens dist/index.html in common browser viewports', { timeout: 180000 }, async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Edge smoke is only configured for the local Windows browser environment');
    return;
  }
  try {
    await access(edgePath);
  } catch {
    t.skip('Microsoft Edge executable was not found');
    return;
  }

  const port = 6200 + (process.pid % 1000);
  const workspace = await mkdtemp(join(tmpdir(), 'opticpress-smoke-'));
  const distRoot = join(workspace, 'dist');

  await execFileAsync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', distRoot], {
    cwd: projectRoot,
    timeout: 120000,
  });

  const server = spawn(process.execPath, ['scripts/static-dist-server.mjs', String(port), distRoot], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(server);
    const pageUrl = `http://127.0.0.1:${port}/index.html`;

    for (const viewport of commonViewports) {
      const screenshotPath = join(workspace, `${viewport.name}.png`);
      const userDataDir = join(workspace, `edge-profile-${viewport.name}`);

      await execFileAsync(edgePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--run-all-compositor-stages-before-draw',
        `--user-data-dir=${userDataDir}`,
        `--window-size=${viewport.width},${viewport.height}`,
        `--screenshot=${screenshotPath}`,
        pageUrl,
      ], {
        cwd: projectRoot,
        timeout: 60000,
      });

      const screenshot = await stat(screenshotPath);
      assert.ok(
        screenshot.size > 1000,
        `Expected browser to render a non-empty production screenshot for ${viewport.name}`,
      );
    }
  } finally {
    server.kill();
    await rm(workspace, { recursive: true, force: true });
  }
});

/** @param {import('node:child_process').ChildProcessWithoutNullStreams} server */
function waitForServer(server) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for static dist server'));
    }, 10000);

    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('static dist server ready')) {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
    server.stderr.on('data', (chunk) => {
      clearTimeout(timer);
      reject(new Error(String(chunk)));
    });
    server.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Static dist server exited early with code ${code}`));
    });
  });
}
