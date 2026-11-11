# Hearthborn

A 3D survival story: two people start with nothing in a wild valley and work their way from
gathering and hunting to fire, a thatch hut, a kiln, a brick house, farming and finally a village.

## Run

    npm install
    npm run db      # starts the MongoDB save database in Docker (once per boot; data persists)
    npm run dev

Then open http://localhost:5173 in Chrome or Firefox. Progress is saved automatically (every 20 s, after
every build/craft/sleep, and when the tab is hidden or closed) to MongoDB, with a copy in the browser.
If Docker is not running the server falls back to a SQLite file in `saves/`, so nothing is lost either way.

`npm run db:stop` stops the database container (saves are kept in the `hearthborn-mongo` volume).
The container listens on port 27018; set `MONGO_URL` to point the server elsewhere.

Production: `npm run build && npm start` serves the built game plus the save API on one port.

### Save API

    GET    /api/save?slot=default      current save
    PUT    /api/save?slot=default      store a save (JSON body); keeps the last 12 snapshots
    DELETE /api/save?slot=default
    GET    /api/history?slot=default   snapshot list;  POST /api/restore?slot=default&id=… rolls one back
    GET    /api/health                 which database is in use

## Controls

W A S D move · Shift sprint (uses stamina) · Space jump · C toggles sneak, or hold Ctrl · V first/third person ·
Mouse look, wheel zooms the camera · E use/gather · F eat · Tab craft & build · M map (click to drop a pin) ·
G auto-walk to the pin · Click punch (axe swing once you have one) · Right-click throw spear · Q cancel building ·
Esc pause menu (mouse sensitivity, invert Y, graphics quality, fullscreen, volume, save, quit). Walk into deep water to swim.

The game goes fullscreen when you start so that Ctrl, Tab, Alt and Esc reach the game instead of the browser;
turn that off in the Esc menu if you prefer a window. Graphics quality is picked automatically from your
graphics card and the render resolution adapts to hold a smooth frame rate (shown bottom-right).

Events: storms, wolf packs at night (fire and deep water keep them off) and deer herds crossing near camp.

## Credits

All models are by Quaternius (quaternius.com), CC0 1.0 Public Domain: Universal Base Characters,
Universal Animation Library, Stylized Nature MegaKit and Ultimate Animated Animals. The game-ready copies live in `public/models`;
`tools/prep_models.py` rebuilds them from the original packs in `_assets_src/`.
