// Saving: the game state goes to the server's SQLite database (saves/hearthborn.sqlite) and, as a backup,
// to the browser's localStorage. Settings stay in localStorage only.
const KEY = 'hearthborn-save-v2', OLD_KEY = 'hearthborn-save-v1', SETTINGS_KEY = 'hearthborn-settings';

export const saveState = { where: 'none', at: 0, pending: 0, error: '', listeners: [] };
const notify = () => { for (const f of saveState.listeners) f(saveState); };

export async function loadGame() {
  let local = null;
  try { const s = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); if (s) local = JSON.parse(s); } catch {}
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('/api/save', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (r.ok) {
      const j = await r.json();
      saveState.where = 'db';
      // Prefer whichever copy is newer: the database normally, the browser if the server was down for a while.
      if (j.data && (!local || (j.data.savedAt || 0) >= (local.savedAt || 0))) return { data: j.data, from: 'database' };
      if (local) return { data: local, from: 'browser' };
      return null;
    }
  } catch {}
  saveState.where = 'local';
  return local ? { data: local, from: 'browser' } : null;
}

let timer = 0, queued = null;
export function saveGame(data, { beacon = false, now = false } = {}) {
  data.savedAt = Date.now();
  const json = JSON.stringify(data);
  try { localStorage.setItem(KEY, json); } catch {}
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
  saveState.pending++;
  fetch('/api/save', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json, keepalive: true })
    .then((r) => r.json())
    .then((j) => { if (!j.ok) throw new Error(j.error); saveState.where = 'db'; saveState.at = j.updatedAt; saveState.error = ''; })
    .catch((e) => { saveState.where = 'local'; saveState.error = String(e.message || e); })
    .finally(() => { saveState.pending--; notify(); });
}
export function deleteGame() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch {}
  fetch('/api/save', { method: 'DELETE' }).catch(() => {});
}

// ---------- settings ----------
const DEFAULTS = { sens: 1, invertY: false, quality: 'auto', fullscreen: true, volume: 0.7 };
export const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch {}
export function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
