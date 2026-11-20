// Save-game storage in MongoDB (run locally with `npm run db`, i.e. Docker). Every save also keeps a short history
// of snapshots that can be rolled back. If MongoDB is down the API answers 503 and the browser keeps its own copy;
// the connection is retried on the next request, so starting Docker later just works.
import path from 'node:path';

// Settings come from .env in the project root (committed: it holds only the local Docker MongoDB address).
// A variable already set in the shell wins over .env.
try { process.loadEnvFile(path.resolve('.env')); } catch { /* no .env: use the defaults below */ }

const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27018';
const MONGO_DB = process.env.MONGO_DB || 'hearthborn';
// Only a server listening on the player's own port may touch the real saves. Every other port (test servers run by
// tools and agents on 5174+) gets a separate "_test" database, so a test can never overwrite a game.
const REAL_PORTS = String(process.env.HB_SAVE_PORTS || '5173').split(',').map((p) => +p.trim());
const KIND = { real: MONGO_DB, test: MONGO_DB + '_test' };
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

// kind: 'real' (the player's saves) or 'test'. Each is opened once and cached. Requests that arrive while it is
// still opening share the same attempt (SAVE-PERF: two first requests used to open, and time out on, Mongo twice).
const opening = {};
export function openDb(kind = 'real') {
  if (kind in handles) return Promise.resolve(handles[kind]);
  return (opening[kind] ||= openDbNow(kind).finally(() => { delete opening[kind]; }));
}
// SAVE-PERF: open both stores when the server starts, so the first GET /api/save (the title's "Continue") never waits
// out the Mongo connect timeout. The player's store is awaited; the test store opens in the background.
export async function warmDb() { openDb('test').catch(() => {}); return openDb('real'); }
async function openDbNow(kind) {
  const name = KIND[kind];
  let d = null;
  try { d = await openMongo(name); }
  catch (err) {
    console.warn(`[hearthborn] MongoDB not reachable at ${MONGO_URL} (${err.message.split('\n')[0]}). Start it with: npm run db`);
  }
  modes[kind] = d ? 'mongodb' : 'none';
  if (d) handles[kind] = d;           // a failed connect is not cached: the next request tries again
  if (kind === 'real') mode = modes[kind];
  console.log(`[hearthborn] ${kind} saves: ${d ? `mongodb (${MONGO_URL}/${name})` : 'none'}`);
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
  if (!d) return send(503, { ok: false, error: 'MongoDB not reachable; run npm run db' }), true;
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
