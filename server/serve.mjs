// Production server: serves the built game from dist/ and the save API on the same port.
//   npm run build && npm start
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleApi, openDb, dbMode } from './db.mjs';

const DIST = path.resolve('dist'), PORT = +(process.env.PORT || 5173);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
await openDb();
http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  let p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Hearthborn on http://localhost:${PORT}  (saves: ${dbMode()})`));
