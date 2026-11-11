import { defineConfig } from 'vite';
import { handleApi, openDb, dbMode } from './server/db.mjs';

// The dev server also hosts the save-game API, so progress is stored in saves/hearthborn.sqlite
// on disk instead of only in the browser.
const saveApi = () => ({
  name: 'hearthborn-save-api',
  async configureServer(server) {
    await openDb();
    server.config.logger.info(`  save database: ${dbMode()}`);
    server.middlewares.use((req, res, next) => { handleApi(req, res).then((done) => { if (!done) next(); }, next); });
  },
  async configurePreviewServer(server) {
    await openDb();
    server.middlewares.use((req, res, next) => { handleApi(req, res).then((done) => { if (!done) next(); }, next); });
  },
});

export default defineConfig({ plugins: [saveApi()], server: { port: 5173, strictPort: true } });
