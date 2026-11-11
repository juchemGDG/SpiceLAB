// Bedienungstests im Browser: startet den Entwicklungsserver und ein unsichtbares Chrome und steuert
// es über das DevTools-Protokoll (ohne zusätzliche Pakete; Node 22+ bringt WebSocket mit).
//
// Chrome wird gesucht unter: Umgebungsvariable CHROME, sonst den üblichen Pfaden von macOS/Linux/Windows.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(100); }
  }
  throw new Error(`${url} nicht erreichbar`);
}

/** Startet Server und Browser, öffnet die App. Am Ende close() aufrufen. */
export async function openApp({ width = 1280, height = 860 } = {}) {
  const chrome = CHROME_PATHS.find((p) => existsSync(p));
  if (!chrome) throw new Error('Chrome nicht gefunden – Pfad in der Umgebungsvariablen CHROME angeben');

  const port = 8700 + Math.floor(Math.random() * 200);
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'spicelab-ui-'));
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const browser = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

  const targets = await waitFor(`http://127.0.0.1:${debugPort}/json`);
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await sleep(100); } }
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await sleep(800);

  const page = {
    errors,
    sleep,
    /** JavaScript im Browser auswerten (Ergebnis als Wert). */
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    /** Code mit Zugriff auf den App-Zustand `app` ausführen. */
    app(code) {
      return page.eval(`(async () => { const { app } = await import('/js/main.js'); ${code} })()`);
    },
    /** Zeichnungskoordinaten → Bildschirmkoordinaten. */
    screen(x, y) {
      return page.app(`const r = document.getElementById('svg').getBoundingClientRect(); return [r.left + app.view.x + ${x} * app.view.z, r.top + app.view.y + ${y} * app.view.z];`);
    },
    async mouse(type, x, y, extra = {}) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    },
    async click(x, y) { await page.mouse('mousePressed', x, y); await page.mouse('mouseReleased', x, y); await sleep(30); },
    async dblclick(x, y) { await page.click(x, y); await page.click(x, y); },
    async hover(x, y) { await page.mouse('mouseMoved', x, y, { buttons: 0 }); await sleep(50); },
    async drag(x1, y1, x2, y2, steps = 10) {
      await page.hover(x1, y1);
      await page.mouse('mousePressed', x1, y1);
      for (let i = 1; i <= steps; i++) await page.mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
      await page.mouse('mouseReleased', x2, y2);
      await sleep(30);
    },
    async key(key, code = key, extra = {}) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...extra });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, ...extra });
      await sleep(20);
    },
    /** Mittelpunkt eines Elements (CSS-Selektor) auf dem Bildschirm. */
    center(selector) {
      return page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    },
    text: (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`),
    close() {
      ws.close();
      browser.kill();
      server.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome räumt noch auf */ }
    },
  };
  return page;
}
