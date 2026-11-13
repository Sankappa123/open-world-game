# Hearthborn: project notes for Claude Code

This file is read at the start of every session, so work can resume on any machine after `git pull`.
**Keep the "Status" section up to date** whenever a milestone lands. The detailed specs and the engineering log are in `docs/dev/`.

## What this is
Hearthborn is a browser 3D survival story game: Three.js r187, Vite, plain JS ES modules, no framework.
- The player is Aro. Sena is the AI companion. Their daughter Lio arrives later in the story.
- They found a home in a prehistoric valley.
- Saves: a Node API (`server/`) stores them in MongoDB (Docker, port **27018**), with a SQLite fallback in `saves/`. The browser keeps a localStorage copy.
- The user wants a **professional, complete, polished** game, not quick versions. They prefer realistic visuals from free CC0 assets, chosen by Claude. They check progress often, so give clear percentage and status updates.

## Run
```bash
npm install
npm run db      # MongoDB in Docker (port 27018)
npm run dev     # http://localhost:5173  (the user's port)
npm run build   # must always pass
```

## Code map (src/)
- `main.js` is the game: state `S`, story `CH`, recipes, input, the frame loop and the `window.G` debug/test hooks. It is large, so find code by its section tags:
  - WP1–WP6: expansion
  - WP3: caves and points of interest
  - WPN: weapons
  - RST: rest and sleep
  - FPP: first person
  - MAT, GORE, SURV, CMB, ARC, ROM, MUS: mature features
- `world.js` builds the terrain, river, fords and biomes; `caves.js` the caves; `landmarks.js` the landmarks.
- `people.js` holds the humans: Quaternius rig plus UAL animation clips, pose sampling, bone overrides and two-bone IK.
- `animals.js`, `entities.js` (structures, tools, torch), `nature.js`, `sky.js`, `water.js`, `terrain.js`, `save.js`, `quality.js`.
- `public/models/` holds the CC0 assets; credits are in `public/models/CREDITS.txt`.

## Testing rules (important)
- **Never touch the user's real save.** Test servers use ports **5174+**, never 5173.
- **Hard protection** in `server/db.mjs`: only requests that arrive on port 5173 (or the ports in `HB_SAVE_PORTS`) use the real `hearthborn` database. Every other port gets `hearthborn_test` and `saves/hearthborn_test.sqlite`.
  - Added on 2026-11-13, after a test run overwrote the real save. It was restored from a snapshot; backup copy at `~/.claude/projects/-home-ashish-Desktop-game/hearthborn-notes/save_backup_day13.json`.
  - If you run the production server on another port, set `HB_SAVE_PORTS`.
- Drive the game in headless Chrome with every `/api/` request intercepted: `tools/test/run.mjs`.
  ```bash
  npx vite --port 5174 --strictPort &
  PORT=5174 CDP=9333 node tools/test/run.mjs /tmp/hb-out tools/test/steps/play.json
  ```
  `play.json` is a scripted playthrough of the full story using `window.G` hooks.
- When several agents run in parallel, give each its own vite and CDP port pair, and tag code sections so edits don't collide.

## Content limits (decided with the user; do not re-litigate)
The user asked for a 21+ game.
- **Agreed:**
  - realistic violence and blood
  - dismemberment of enemies and animals
  - harsh survival
  - a dark mature story
  - an adult (non-explicit) romance tone
  - full-intensity defaults, with tone-down settings that are opt-in
- **Declined** (the user asked repeatedly; the answer stays no):
  - sex scenes, sexual content or nudity (romance is kiss and embrace, then a fade to black)
  - any harm to children
  - torture mechanics

## Status (last updated 2026-11-13)
**Committed** on branch `expansion`, which the user pushed:
- the 12-chapter story with old-save migration
- co-op building and home upgrades
- the bigger world with landmarks and caves
- tameable, rideable horses
- the parchment map with fog of war
- the family arc
- torch, poultice, cloak, waterskin and fishing

**In progress (uncommitted while agents work):**
1. **Weapons (WPN) and sleep (RST)** are built. The integration check and then the 2-round QA test-and-fix pass are running. Spec: `docs/dev/spec-weapons-sleep.md`.
2. **First-person realism (FPP):** body awareness, head bob, hands, no clipping, settings. Research is done and the build is in progress.
3. **Mature features (M1–M6), 14 features.** Spec: `docs/dev/spec-mature.md`, including §12 (the user's tone decisions). Steps:
   1. M1 foundation: content notice, difficulty, downed/permadeath, settings.
   2. Built in parallel:
      - M2 GORE: blood, wounds, hunting realism, dismemberment
      - M3 SURV: injuries, illness, water, spoilage
      - M4 CMB: combat, predators, the Ash People raiders
      - M5 ARC: 7 mature chapters with choices
      - M6 ROM+MUS: romance and an adaptive score
   3. ARC integration.
   4. QA: Story, Survivor and Hardcore runs.

**Next after these land:** commit to `expansion` (Claude has no GitHub credentials on this machine, so the user pushes). Then work the backlog in `docs/dev/spec-mature.md` §1.2:
- loading bar and contextual hints
- seasons
- bow, traps, dog companion
- skills
- gamepad
- achievements and photo mode

**Known issues to watch:** frame rate is low in headless tests (7–21 fps with software rendering); check on a real GPU.

The user's real save (MongoDB slot `default`) was advanced at their request to day 12, chapter 9 "Hearth and Home".
