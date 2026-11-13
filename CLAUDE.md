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

**WIP checkpoint committed (8e37add, 2026-11-13 16:00, after a reboot stopped all agents):**
1. **Weapons (WPN) and sleep (RST):** built, integrated and tested by their builders. **The QA test-and-fix round has NOT run yet**: all 5 testers were cut off by an API outage. Spec: `docs/dev/spec-weapons-sleep.md`.
2. **First-person realism (FPP):** DONE and verified. Open items: the spear is one-handed in FPP, no neck limit while riding, and the "hands are empty" chip shows while holding a weapon.
3. **Mature features:**
   - M1 foundation is DONE (21+ notice, difficulty modes, downed/permadeath and memorial, settings tabs). Pure logic is in `src/mature.js`.
   - **M2 gore, M3 survival, M4 combat/enemies, M5 story, M6 romance+music are PARTIAL** (files `gore.js`, `survival.js`, `combat.js`, `enemies.js`, `tribe.js`, `arc_data.js`, `romance.js`, `music.js`). Each builder must inspect its partial work and continue from it, not start over.
   - After that: ARC integration (raid, fever, romance beats), then QA on Story, Survivor and Hardcore.
   - Spec: `docs/dev/spec-mature.md`.

**Planned for 2026-11-14: Viking way of life, "Book II: The Sea Road".** Spec: `docs/dev/spec-viking.md`, which starts with the user-facing options in §0.
- Recommended option C: after Book I, eighteen winters later, Lio is grown and steers. Bronze Age longship with a horse-head prow and the first sail, a crew with loyalty, river to the sea and islands, a longhouse hall with feasts and vows, the Grey Sails sea raiders, a holmgang duel, and a coda with real Vikings.
- **Ask the user the 4 questions in §0** (A/B/C, can grown Lio be downed, gods, helmets) before building. Defaults: C, yes but never dies, own gods, no horns.
- Build it with work packages N1–N6 from the spec after the mature build is committed.

**Next after these land:** commit to `expansion` (Claude has no GitHub credentials on this machine, so the user pushes). Then work the backlog in `docs/dev/spec-mature.md` §1.2:
- loading bar and contextual hints
- seasons
- bow, traps, dog companion
- skills
- gamepad
- achievements and photo mode

**Known issues to watch:** frame rate is low in headless tests (7–21 fps with software rendering); check on a real GPU.

The user's real save (MongoDB slot `default`) was advanced at their request to day 12, chapter 9 "Hearth and Home".
