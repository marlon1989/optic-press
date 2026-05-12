import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { access, mkdtemp, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserLockPath = join(tmpdir(), 'opticpress-browser-smoke.lock');

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
  const distRoot = join(workspace, 'dist');
  const browserLock = await acquireBrowserLock();
  await execFileAsync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', distRoot], {
    cwd: projectRoot,
    timeout: 120000,
  });

  const server = spawn(process.execPath, ['scripts/static-dist-server.mjs', String(serverPort), distRoot], {
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

    const page = await waitForDebugPage(debugPort, String(serverPort));
    cdp = await createCdpSession(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await waitForReady(cdp);
    await waitForThemeReady(cdp);

    assert.deepEqual(await readThemeState(cdp), {
      expanded: 'false',
      dropdownHidden: true,
      storedTheme: null,
      htmlDark: false,
      activeIcon: 'theme-icon-monitor',
      activeCheck: 'system',
    });

    await mouseClick(cdp, '#theme-menu-button');
    assert.equal((await readThemeState(cdp)).expanded, 'true');
    assert.equal((await readThemeState(cdp)).dropdownHidden, false);
    assert.equal(await hitTest(cdp, '[data-theme="dark"]'), true);
    assert.equal(await hitTest(cdp, '[data-theme="system"]'), true);

    await mouseClick(cdp, '[data-theme="dark"]');
    await wait(cdp, 250);
    assert.deepEqual(await readThemeState(cdp), {
      expanded: 'false',
      dropdownHidden: true,
      storedTheme: 'dark',
      htmlDark: true,
      activeIcon: 'theme-icon-dark',
      activeCheck: 'dark',
    });

    await mouseClick(cdp, '#theme-menu-button');
    assert.equal(await hitTest(cdp, '[data-theme="light"]'), true);
    assert.equal(await hitTest(cdp, '[data-theme="dark"]'), true);
    await mouseClick(cdp, '[data-theme="light"]');
    await wait(cdp, 250);
    assert.deepEqual(await readThemeState(cdp), {
      expanded: 'false',
      dropdownHidden: true,
      storedTheme: 'light',
      htmlDark: false,
      activeIcon: 'theme-icon-light',
      activeCheck: 'light',
    });

    await mouseClick(cdp, '#theme-menu-button');
    await mouseClick(cdp, 'main');
    await wait(cdp, 250);
    assert.equal((await readThemeState(cdp)).dropdownHidden, true);

    await mouseClick(cdp, '#theme-menu-button');
    assert.equal(await hitTest(cdp, '[data-theme="system"]'), true);
    await mouseClick(cdp, '[data-theme="system"]');
    await wait(cdp, 250);
    assert.equal((await readThemeState(cdp)).storedTheme, 'system');
    assert.equal((await readThemeState(cdp)).activeIcon, 'theme-icon-monitor');
  } finally {
    try {
      await cdp?.send('Browser.close');
    } catch {}
    browser?.kill();
    server.kill();
    await releaseBrowserLock(browserLock);
    await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
});

async function acquireBrowserLock() {
  const startTime = Date.now();
  while (Date.now() - startTime < 120000) {
    try {
      const handle = await open(browserLockPath, 'wx');
      await handle.writeFile(String(process.pid));
      return handle;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Timed out waiting for browser smoke lock');
}

async function releaseBrowserLock(handle) {
  await handle.close();
  await rm(browserLockPath, { force: true });
}

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
async function mouseClick(cdp, selector) {
  const point = await elementCenter(cdp, selector);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
}

/**
 * @param {CdpSession} cdp
 * @param {string} selector
 */
function elementCenter(cdp, selector) {
  return evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing selector: ${selector}');
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
}

/**
 * @param {CdpSession} cdp
 * @param {string} selector
 */
function hitTest(cdp, selector) {
  return evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === element || Boolean(target?.closest(${JSON.stringify(selector)}));
  })()`);
}

/** @param {CdpSession} cdp */
async function waitForReady(cdp) {
  for (let i = 0; i < 50; i++) {
    if (await evaluate(cdp, 'document.readyState === "complete"')) return;
    await wait(cdp, 100);
  }
  throw new Error('Timed out waiting for page readiness');
}

/** @param {CdpSession} cdp */
async function waitForThemeReady(cdp) {
  for (let i = 0; i < 80; i++) {
    const isReady = await evaluate(cdp, `(() => {
      const button = document.querySelector('#theme-menu-button');
      const dropdown = document.querySelector('#theme-dropdown');
      const options = document.querySelectorAll('[data-theme]');
      const checks = document.querySelectorAll('[data-check]');
      return Boolean(button && dropdown && options.length === 3 && checks.length === 3);
    })()`);
    if (isReady) return;
    await wait(cdp, 100);
  }
  throw new Error('Timed out waiting for theme selector readiness');
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
    const details = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(details || 'Browser evaluation failed');
  }
  return result.result.value;
}

/**
 * @param {number} port
 * @param {string} appPort
 */
async function waitForDebugPage(port, appPort) {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((entry) => (
        entry.type === 'page'
        && entry.webSocketDebuggerUrl
        && String(entry.url).includes(`:${appPort}/index.html`)
      ));
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
