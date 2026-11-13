// Save-game storage. MongoDB (run locally with `docker compose up -d`) is the primary store; if it cannot be
// reached the server falls back to a SQLite file in saves/ so a game is never lost. Every save also keeps a
// short history of snapshots that can be rolled back.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('saves');
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27018';
const MONGO_DB = process.env.MONGO_DB || 'hearthborn';
// Only a server listening on the player's own port may touch the real saves. Every other port (test servers run by
// tools and agents on 5174+) gets a separate "_test" database and SQLite file, so a test can never overwrite a game.
const REAL_PORTS = String(process.env.HB_SAVE_PORTS || '5173').split(',').map((p) => +p.trim());
const KIND = { real: { mongo: MONGO_DB, sqlite: path.join(DIR, 'hearthborn.sqlite') }, test: { mongo: MONGO_DB + '_test', sqlite: path.join(DIR, 'hearthborn_test.sqlite') } };
const KEEP = 12;                       // snapshots kept per slot
const handles = {}, modes = {};
let mode = 'none';

async function openMongo(name) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 2500, connectTimeoutMS: 2500 });
  await client.connect();
  const d = client.db(name), saves = d.collection('saves'), snaps = d.collection('snapshots');
  await saves.createIndex({ slot: 1 }, { unique: true });
  await snaps.createIndex({ slot: 1, createdAt: -1 });
  return {
    async get(slot) { const r = await saves.findOne({ slot }); return r ? { data: r.data, updatedAt: r.updatedAt } : null; },
    async put(slot, data, snapshot = true) {
      const now = Date.now();
      await saves.updateOne({ slot }, { $set: { data, updatedAt: now } }, { upsert: true });
      if (snapshot) {
        await snaps.insertOne({ slot, data, createdAt: now });
        const old = await snaps.find({ slot }).sort({ createdAt: -1 }).skip(KEEP).project({ _id: 1 }).toArray();
        if (old.length) await snaps.deleteMany({ _id: { $in: old.map((o) => o._id) } });
      }
      return now;
    },
    async del(slot) { await saves.deleteOne({ slot }); },
    async list() { return (await saves.find().sort({ updatedAt: -1 }).project({ slot: 1, updatedAt: 1 }).toArray()).map((r) => ({ slot: r.slot, updated_at: r.updatedAt })); },
    async history(slot) { return (await snaps.find({ slot }).sort({ createdAt: -1 }).project({ createdAt: 1 }).toArray()).map((r) => ({ id: String(r._id), created_at: r.createdAt })); },
    async restore(slot, id) {
      const { ObjectId } = await import('mongodb');
      const r = await snaps.findOne({ _id: new ObjectId(String(id)), slot });
      if (!r) return false;
      await saves.updateOne({ slot }, { $set: { data: r.data, updatedAt: Date.now() } }, { upsert: true });
      return true;
    },
  };
}

async function openSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(file);
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS saves (slot TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, slot TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS snapshots_slot ON snapshots (slot, id);
  `);
  const q = {
    get: d.prepare('SELECT data, updated_at FROM saves WHERE slot = ?'),
    put: d.prepare('INSERT INTO saves (slot, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(slot) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'),
    snap: d.prepare('INSERT INTO snapshots (slot, data, created_at) VALUES (?, ?, ?)'),
    trim: d.prepare('DELETE FROM snapshots WHERE slot = ? AND id NOT IN (SELECT id FROM snapshots WHERE slot = ? ORDER BY id DESC LIMIT ?)'),
    del: d.prepare('DELETE FROM saves WHERE slot = ?'),
    list: d.prepare('SELECT slot, updated_at FROM saves ORDER BY updated_at DESC'),
    history: d.prepare('SELECT id, created_at FROM snapshots WHERE slot = ? ORDER BY id DESC'),
    snapshot: d.prepare('SELECT data FROM snapshots WHERE id = ? AND slot = ?'),
  };
  return {
    async get(slot) { const r = q.get.get(slot); return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : null; },
    async put(slot, data, snapshot = true) {
      const json = JSON.stringify(data), now = Date.now();
      q.put.run(slot, json, now);
      if (snapshot) { q.snap.run(slot, json, now); q.trim.run(slot, slot, KEEP); }
      return now;
    },
    async del(slot) { q.del.run(slot); },
    async list() { return q.list.all(); },
    async history(slot) { return q.history.all(slot); },
    async restore(slot, id) { const r = q.snapshot.get(+id, slot); if (!r) return false; q.put.run(slot, r.data, Date.now()); return true; },
  };
}

// kind: 'real' (the player's saves) or 'test'. Each is opened once and cached.
export async function openDb(kind = 'real') {
  if (kind in handles) return handles[kind];
  const K = KIND[kind];
  let d = null, m = 'none';
  fs.mkdirSync(DIR, { recursive: true });
  try { d = await openMongo(K.mongo); m = 'mongodb'; }
  catch (err) {
    console.warn(`[hearthborn] MongoDB not reachable at ${MONGO_URL} (${err.message.split('\n')[0]}). Start it with: docker compose up -d`);
    try { d = await openSqlite(K.sqlite); m = 'sqlite'; }
    catch (err2) { console.warn('[hearthborn] SQLite unavailable too:', err2.message); }
  }
  handles[kind] = d; modes[kind] = m;
  if (kind === 'real') mode = m;
  console.log(`[hearthborn] ${kind} saves: ${m}${m === 'mongodb' ? ` (${MONGO_URL}/${K.mongo})` : m === 'sqlite' ? ` (${K.sqlite})` : ''}`);
  return d;
}
export const dbMode = () => mode;
const kindOf = (req) => (REAL_PORTS.includes(req.socket?.localPort) ? 'real' : 'test');

// Express-style handler shared by the Vite dev server and the production server. Returns true if it handled the request.
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  const send = (code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); };
  const kind = kindOf(req), d = await openDb(kind), mode = modes[kind];
  if (!d) return send(503, { ok: false, error: 'no database available' }), true;
  const slot = (url.searchParams.get('slot') || 'default').slice(0, 40);
  try {
    if (url.pathname === '/api/health') return send(200, { ok: true, db: mode, saves: kind }), true;
    if (url.pathname === '/api/saves') return send(200, { ok: true, db: mode, saves: await d.list() }), true;
    if (url.pathname === '/api/history') return send(200, { ok: true, history: await d.history(slot) }), true;
    if (url.pathname === '/api/restore' && req.method === 'POST') return send(200, { ok: await d.restore(slot, url.searchParams.get('id')) }), true;
    if (url.pathname !== '/api/save') return send(404, { ok: false, error: 'unknown endpoint' }), true;
    if (req.method === 'GET') { const r = await d.get(slot); return send(200, { ok: true, db: mode, data: r?.data ?? null, updatedAt: r?.updatedAt ?? null }), true; }
    if (req.method === 'DELETE') { await d.del(slot); return send(200, { ok: true }), true; }
    if (req.method === 'PUT' || req.method === 'POST') {
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 4e6) return send(413, { ok: false, error: 'save too large' }), true; chunks.push(c); }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { ok: false, error: 'bad json' }), true; }
      if (!data || typeof data !== 'object') return send(400, { ok: false, error: 'bad save' }), true;
      const updatedAt = await d.put(slot, data, url.searchParams.get('snapshot') !== '0');
      return send(200, { ok: true, db: mode, updatedAt }), true;
    }
    return send(405, { ok: false, error: 'method not allowed' }), true;
  } catch (err) {
    console.error('[hearthborn] save API error', err);
    return send(500, { ok: false, error: String(err.message || err) }), true;
  }
}
