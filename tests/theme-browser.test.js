import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

test('theme selector works in a real browser', { timeout: 120000 }, async (t) => {
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

  const serverPort = 6500 + (process.pid % 1000);
  const debugPort = 9500 + (process.pid % 400);
  const workspace = await mkdtemp(join(tmpdir(), 'opticpress-theme-'));
  const server = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    String(serverPort),
  ], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  let cdp;

  try {
    await waitForHttp(`http://127.0.0.1:${serverPort}/index.html`);
    browser = spawn(edgePath, [
      '--headless=new',
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-dev-shm-usage',
      '--disable-features=VizDisplayCompositor',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--run-all-compositor-stages-before-draw',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${join(workspace, 'edge-profile')}`,
      `http://127.0.0.1:${serverPort}/index.html`,
    ], { stdio: ['ignore', 'ignore', 'ignore'] });

    const page = await waitForDebugPage(debugPort);
    cdp = await createCdpSession(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await waitForReady(cdp);

    assert.deepEqual(await readThemeState(cdp), {
      expanded: 'false',
      dropdownHidden: true,
      storedTheme: null,
      htmlDark: false,
      activeIcon: 'theme-icon-monitor',
      activeCheck: 'system',
    });

    await click(cdp, '#theme-menu-button');
    assert.equal((await readThemeState(cdp)).expanded, 'true');
    assert.equal((await readThemeState(cdp)).dropdownHidden, false);

    await click(cdp, '[data-theme="dark"]');
    await wait(cdp, 250);
    assert.deepEqual(await readThemeState(cdp), {
      expanded: 'false',
      dropdownHidden: true,
      storedTheme: 'dark',
      htmlDark: true,
      activeIcon: 'theme-icon-dark',
      activeCheck: 'dark',
    });

    await click(cdp, '#theme-menu-button');
    await click(cdp, '[data-theme="light"]');
    await wait(cdp, 250);
    assert.deepEqual(await readThemeState(cdp), {
      expanded: 'false',
      dropdownHidden: true,
      storedTheme: 'light',
      htmlDark: false,
      activeIcon: 'theme-icon-light',
      activeCheck: 'light',
    });

    await click(cdp, '#theme-menu-button');
    await click(cdp, 'body');
    await wait(cdp, 250);
    assert.equal((await readThemeState(cdp)).dropdownHidden, true);

    await click(cdp, '#theme-menu-button');
    await click(cdp, '[data-theme="system"]');
    await wait(cdp, 250);
    assert.equal((await readThemeState(cdp)).storedTheme, 'system');
    assert.equal((await readThemeState(cdp)).activeIcon, 'theme-icon-monitor');
  } finally {
    try {
      await cdp?.send('Browser.close');
    } catch {}
    browser?.kill();
    server.kill();
    await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

/** @param {CdpSession} cdp */
async function readThemeState(cdp) {
  return evaluate(cdp, `(() => {
    const dropdown = document.querySelector('#theme-dropdown');
    const icons = ['theme-icon-monitor', 'theme-icon-light', 'theme-icon-dark'];
    const activeIcon = icons.find((id) => !document.querySelector('#' + id).classList.contains('hidden'));
    const activeCheck = [...document.querySelectorAll('[data-theme]')]
      .find((option) => !option.querySelector('[data-check]').classList.contains('hidden'))
      ?.dataset.theme;

    return {
      expanded: document.querySelector('#theme-menu-button').getAttribute('aria-expanded'),
      dropdownHidden: dropdown.classList.contains('hidden'),
      storedTheme: localStorage.getItem('optic_theme'),
      htmlDark: document.documentElement.classList.contains('dark'),
      activeIcon,
      activeCheck,
    };
  })()`);
}

/**
 * @param {CdpSession} cdp
 * @param {string} selector
 */
async function click(cdp, selector) {
  await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).click()`);
}

/** @param {CdpSession} cdp */
async function waitForReady(cdp) {
  for (let i = 0; i < 50; i++) {
    if (await evaluate(cdp, 'document.readyState === "complete"')) return;
    await wait(cdp, 100);
  }
  throw new Error('Timed out waiting for page readiness');
}

/**
 * @param {CdpSession} cdp
 * @param {number} ms
 */
function wait(cdp, ms) {
  return evaluate(cdp, `new Promise((resolve) => setTimeout(resolve, ${ms}))`);
}

/**
 * @param {CdpSession} cdp
 * @param {string} expression
 */
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result.value;
}

/** @param {number} port */
async function waitForDebugPage(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for browser debug page');
}

/** @param {string} url */
function createCdpSession(url) {
  const socket = new WebSocket(url);
  let nextId = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        },
      });
    }, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

/** @param {string} url */
async function waitForHttp(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/**
 * @typedef {{
 *   send(method: string, params?: Record<string, unknown>): Promise<any>
 * }} CdpSession
 */
