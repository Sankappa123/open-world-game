// Headless Chrome test runner. usage: node run.mjs <outDir> <steps.json>
// Steps: {js}, {key, hold?}, {wait}, {shot}, {reload}, {expect: js-returning-truthy, name}
// ALL /api/ requests are intercepted and answered locally, so the real save DB is never touched.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const PORT = process.env.PORT || 5174, CDP = process.env.CDP || 9333;
const OUT = process.argv[2], steps = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-prof-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=' + CDP + '', '--user-data-dir=' + prof, '--window-size=' + (process.env.WS || '1280,720') + '',
  ...(process.env.GL ? process.env.GL.split(' ') : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
const tabs = await (await fetch('http://127.0.0.1:' + CDP + '/json')).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0, errors = 0, fails = 0; const pend = {};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = async (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend[m.id]) { pend[m.id](m.result ?? m); delete pend[m.id]; }
  if (m.method === 'Fetch.requestPaused') {
    const body = Buffer.from(JSON.stringify({ data: null, ok: true, mode: 'test' })).toString('base64');
    send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body });
  }
  if (m.method === 'Runtime.exceptionThrown') { errors++; console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 800)); }
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) { if (m.params.type === 'error') errors++; console.log(m.params.type.toUpperCase(), m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400)); }
};
await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://localhost:' + PORT + '/' });
await sleep(9000);
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXCEPTION ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result?.value; };
for (const st of steps) {
  if (st.js) console.log('>', st.js.slice(0, 90), '=>', JSON.stringify(await ev(st.js)));
  if (st.until) { const t0 = Date.now(); while (Date.now() - t0 < (st.timeout || 15000) && !(await ev(st.until))) await sleep(200); }
  if (st.expect) { const v = await ev(st.expect); const ok = !!v && !String(v).startsWith('EXCEPTION'); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', st.name || st.expect.slice(0, 90), JSON.stringify(v)); }
  if (st.key) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: st.key, key: st.key.replace('Key', '').toLowerCase() });
    if (st.hold) await sleep(st.hold);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: st.key, key: st.key.replace('Key', '').toLowerCase() });
  }
  if (st.reload) { await send('Page.reload', {}); await sleep(2000); const t0 = Date.now(); while (Date.now() - t0 < 40000 && !(await ev("!!(window.G && document.getElementById('btn-new'))"))) await sleep(300); await sleep(500); }
  if (st.wait) await sleep(st.wait);
  if (st.shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + '/' + st.shot, Buffer.from(r.data, 'base64')); console.log('shot', st.shot); }
}
console.log(`DONE errors=${errors} fails=${fails}`);
ws.close(); chrome.kill(); await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
