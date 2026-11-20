// Saving: the game state goes to the server's MongoDB database (server/db.mjs) and, as a backup,
// to the browser's localStorage. Settings stay in localStorage only.
const KEY = 'hearthborn-save-v2', OLD_KEY = 'hearthborn-save-v1', SETTINGS_KEY = 'hearthborn-settings';
const ASIDE_KEY = 'hearthborn-save-aside';     // SAVE-PERF r3: a session set aside when the player took the server's newer story

export const saveState = { where: 'none', at: 0, pending: 0, error: '', unknown: false, conflict: null, listeners: [] };
const notify = () => { for (const f of saveState.listeners) f(saveState); };

// SAVE-PERF: saveState.unknown is set when the server did not answer (timeout, network error, 5xx). That is not
// "no save": a slow first request (Mongo connect timeout, a loaded machine) must never read as an empty slot, or a
// new game would delete the real save. Only an answer from the server (data or data:null) is definitive.
// With a browser copy the wait is short (that copy is shown meanwhile); without one it waits longer.
export async function loadGame({ timeout } = {}) {
  let local = null;
  try { const s = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); if (s) local = JSON.parse(s); } catch {}
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeout ?? (local ? 4000 : 8000));
    const r = await fetch('/api/save', { signal: ctrl.signal, cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    clearTimeout(t);
    if (j && j.ok !== false) {
      saveState.where = 'db'; saveState.unknown = false;
      // Prefer whichever copy is newer: the database normally, the browser if the server was down for a while.
      if (j.data && (!local || (j.data.savedAt || 0) >= (local.savedAt || 0))) return { data: j.data, from: 'database' };
      if (local) return { data: local, from: 'browser' };
      return null;
    }
  } catch {}
  saveState.where = 'local'; saveState.unknown = true;
  return local ? { data: local, from: 'browser' } : null;
}

// SAVE-PERF r3: a game started while the server had not answered (a browser copy, or a new story after the "cannot tell"
// warning) must not write over a server save it never saw. Its saves go to this browser only and a background check keeps
// asking the server: no save there, or one no newer than the one this session started from, releases the held saves;
// a newer one is reported as saveState.conflict for main.js to put to the player. Nothing is sent until then.
const hold = { on: false, base: 0, json: null, t: 0, tries: 0 };
let frozen = false;                                  // SAVE-PERF r3: the player switched to the server's story: no more writes
export function holdServer(base = 0) { hold.on = true; hold.base = base; hold.json = null; hold.tries = 0; probe(); }
function probe() {
  clearTimeout(hold.t);
  hold.t = setTimeout(async () => {
    if (!hold.on) return;
    let j = null;
    try {
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch('/api/save', { signal: ctrl.signal, cache: 'no-store' });
      j = r.ok ? await r.json() : null; clearTimeout(t);
    } catch {}
    if (!hold.on) return;
    if (!j || j.ok === false) { probe(); return; }   // still no answer: ask again later
    saveState.unknown = false;
    if (j.data && (j.data.savedAt || 0) > hold.base) { saveState.conflict = j.data; notify(); return; }   // held until the player chooses
    releaseServer();
  }, Math.min(15000, 3000 + 2000 * hold.tries++));
}
export function releaseServer() {                    // the server has nothing newer, or the player chose this session
  hold.on = false; clearTimeout(hold.t); saveState.conflict = null;
  if (hold.json) { queued = hold.json; hold.json = null; flush(); }
}
export function abandonSession() {                   // switch to the server's story: keep this session aside, then reload
  hold.on = false; clearTimeout(hold.t); clearTimeout(timer); timer = 0; queued = null; frozen = true;
  try { const s = localStorage.getItem(KEY); if (s) localStorage.setItem(ASIDE_KEY, s); localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch {}
}

let timer = 0, queued = null;
export function saveGame(data, { beacon = false, now = false } = {}) {
  if (frozen) return;
  data.savedAt = Date.now();
  const json = JSON.stringify(data);
  try { localStorage.setItem(KEY, json); } catch {}
  if (hold.on) { hold.json = json; saveState.where = 'local'; notify(); return; }   // SAVE-PERF r3: browser only until the server is heard
  if (beacon && navigator.sendBeacon) {        // page is closing: fire-and-forget, the browser finishes the request
    navigator.sendBeacon('/api/save?snapshot=0', new Blob([json], { type: 'application/json' }));
    return;
  }
  queued = json;
  if (timer && !now) return;                   // coalesce bursts of saves into one request
  clearTimeout(timer);
  timer = setTimeout(flush, now ? 0 : 400);
}
function flush() {
  const json = queued; queued = null; timer = 0;
  if (!json) return;
  if (hold.on) { hold.json = json; return; }        // SAVE-PERF r3
  saveState.pending++;
  fetch('/api/save', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json, keepalive: true })
    .then((r) => r.json())
    .then((j) => { if (!j.ok) throw new Error(j.error); saveState.where = 'db'; saveState.at = j.updatedAt; saveState.error = ''; })
    .catch((e) => { saveState.where = 'local'; saveState.error = String(e.message || e); })
    .finally(() => { saveState.pending--; notify(); });
}
export function deleteGame({ server = true } = {}) {   // SAVE-PERF: server:false keeps a save the server never showed us
  clearTimeout(timer); timer = 0; queued = null; hold.json = null;   // MAT: a pending save must not resurrect a deleted (permadeath) game
  try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch {}
  if (server) fetch('/api/save', { method: 'DELETE' }).catch(() => {});
}

// ---------- settings ----------
const DEFAULTS = { sens: 1, invertY: false, quality: 'auto', fullscreen: true, volume: 0.7,
  // MAT content and difficulty-adjacent settings (spec §3.1, defaults per §12: full intensity, the notice shows once)
  ageOk: 0,              // CONTENT_V once the 21+ notice is accepted; the title gate shows while below it
  blood: 'on',           // 'on' | 'off' (off swaps every blood visual for dust and scuffs, mechanics unchanged)
  gore: 'high',          // 'low' | 'med' | 'high' (high: dismemberment on heavy and finisher kills)
  screenBlood: true,     // directional screen splatter and the bleeding edge pulse
  finisherCam: true,     // finisher / kill-cam camera cut and slow-motion
  romance: 'full',       // 'full' | 'fade' (cut at the embrace) | 'off' (no kiss/embrace/hand-holding/night options)
  matureStory: true,     // dark chapters and hard choices
  choiceTimer: true,     // timed choices; off = untimed
  reduceFlash: false,    // halves screen flashes
  music: 0.6, sfx: 1, amb: 1,   // volume buses under the master `volume`
};
export const settings = { ...DEFAULTS };
export const SETTING_DEFAULTS = DEFAULTS;          // MAT: the pause menu's reset/compare
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
export function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
