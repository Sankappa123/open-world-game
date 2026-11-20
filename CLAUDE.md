# Hearthborn: how the project works

Hearthborn is a browser 3D survival story game. It uses Three.js r187, Vite and plain JavaScript ES modules, with no framework.
- The player is Aro. Sena is the AI companion. Their daughter Lio arrives later in the story.
- They build a home in a prehistoric valley across a 12-chapter story, followed by an epilogue in free play.

## Run
```bash
npm install
npm run db      # start MongoDB in Docker (port 27018)
npm run dev     # http://localhost:5173  (the player's port and the real save)
npm run build   # must always pass
npm start       # production: serves dist/ and the save API on one port
```

## How it fits together
- **Browser game (`src/`).** `main.js` loads the world, the people and the systems, then runs the frame loop.
- **Save API (`server/`).**
  - `db.mjs` stores saves in MongoDB and keeps the last 12 snapshots per slot.
  - In development it runs inside the Vite dev server (`vite.config.js`). In production it runs inside `serve.mjs`.
- **Settings (`.env`, committed).** `MONGO_URL`, `MONGO_DB` and `HB_SAVE_PORTS`. A variable set in the shell overrides `.env`.
- **Save flow.**
  - The game saves every 20 s, after building, crafting or sleeping, and when the tab closes.
  - It writes to `PUT /api/save` and keeps a copy in localStorage (`src/save.js`).
  - If MongoDB is down, the API answers 503 and the browser copy is kept. The server reconnects on the next request.
- **Real save protection.** Only requests that arrive on port 5173 (or a port in `HB_SAVE_PORTS`) use the real `hearthborn` database. Every other port uses `hearthborn_test`.

## Code map (src/)
| File | What it does |
|---|---|
| `main.js` | The game: state `S`, story `CH`, recipes, input, the frame loop and the `window.G` debug and test hooks |
| `world.js`, `terrain.js` | Terrain, river, fords, biomes |
| `water.js`, `sky.js`, `nature.js` | Water, sky and day/night, trees and plants |
| `caves.js`, `landmarks.js` | Caves (Echo Hollow, Flint Deep), landmarks |
| `people.js` | Humans: Quaternius rig with UAL animation clips, clothing (Sena's `SENA-LOOK`), child bodies, bone overrides, IK |
| `animals.js`, `entities.js` | Animals and horses; structures, tools, torch |
| `combat.js`, `enemies.js`, `tribe.js`, `bow.js` | Combat, enemies, the rival tribe, the bow |
| `gore.js`, `survival.js`, `mature.js` | Blood and wounds, harsh survival, the 21+ gate, difficulty modes, downed and rescue |
| `arc_data.js`, `romance.js`, `music.js` | Story arc data, romance scenes, music |
| `save.js`, `quality.js`, `util.js` | Saving, graphics quality, helpers |

`main.js` is large. Find code by its section tags: WP1–WP6 (expansion), WPN (weapons), RST (rest and sleep), FPP (first person), MAT, GORE, SURV, CMB, ARC, ROM, MUS.

The models in `public/models/` are CC0. Credits are in `public/models/CREDITS.txt`.

## Testing
- **Never use port 5173 for tests.** Test servers use port 5174 or higher.
- Drive the game in headless Chrome with every `/api/` request intercepted:
  ```bash
  npx vite --port 5174 --strictPort &
  PORT=5174 CDP=9333 node tools/test/run.mjs /tmp/hb-out tools/test/steps/play.json
  ```
- The scripted runs are in `tools/test/steps/`:
  - `play.json`: the full story;
  - `play_survivor.json`: Survivor mode;
  - `bow.json`, `old.json` (old-save migration), `epi.json`, `ford.json`, `shots.json`.
- Never click "New story" without `/api/` interception. Never touch the real save unless the user asks.
- When several agents run in parallel, give each its own Vite port and Chrome debug (CDP) port. On the M4 Air, run about 2 agents at a time.

## Decisions to keep
- **Content (21+, agreed with the user):**
  - in: realistic violence and blood, dismemberment of enemies and animals, harsh survival, a dark story, an adult non-explicit romance;
  - never: sex scenes, sexual content or nudity (romance is a kiss and embrace, then a fade to black), any harm to children, torture mechanics.
- **Sena's look:** a revealing hide two-piece, not a dress (`SENA-LOOK`). The base-mesh underwear must never show in any pose; the hide layers in `people.js` enforce this.
- The user wants polished, professional results with realistic CC0 visuals. Commit at checkpoints.
