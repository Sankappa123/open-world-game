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

## Working with this user
- They often check progress. Answer with a short table: what's done, what's running, a % estimate and a time estimate.
- They want complete, professional results. They chose multi-agent workflows for big jobs ("run more agents, use the full power").
- Keep this file and `docs/dev/` updated at every milestone and commit them (`git commit -- CLAUDE.md docs/dev`), so any laptop can resume.
- Claude usually has no GitHub credentials, so ask the user to push (VS Code "Sync Changes", or `git push`).
- They tend to restart or close sessions. Commit WIP before long runs, and commit again at checkpoints.
- Never start a new game or click "New story" without `/api/` interception. Never touch their real save except at their explicit request.

## Status (updated 2026-11-16 ~06:00, Aman's Mac). RESUME HERE
**When the user says "continue" (or "I'm back"), do NOT start anything. FIRST ask these 2 questions and wait for the answers:**
1. **Which machine runs workflow A?** The M4 MacBook Air, the Mac mini M1 (8 GB RAM, so 2 agents and a long run), or the Asus A15 (GTX 1650, 16 GB+, needs a setup test first).
2. **Clear the open B items first** (`docs/dev/b-open-items.md`), **or go straight to A?**

**Workflow B is DONE.** QA, 2 fix rounds, then an independent verification with 3 fix and re-verify rounds, then a content-limit fix. Everything is committed and pushed.
- The verification passed most items. Save and regressions passed 11/11. What is still open is listed in **`docs/dev/b-open-items.md`**:
  - riding: the far leg passes through the horse on mount and dismount, the riders float mid-dismount, and the axe crowds Sena's shin;
  - first person: the spear covers the crosshair, the upper wrist looks broken, and back-lit specks show in torchlight;
  - world: floating slabs in Echo Hollow;
  - home: the blanket on the floor beds, and Sena's hearth seat clips the bed;
  - child faces: art polish.
- **Content-limit fix (commit 67221c7):** children (Lio, Pell, the village kids) now have a real child body on the base mesh, modest child clothing, a swaddled newborn and their own bed. They were the adult female rig scaled down, in adult clothing. The child-safety judge passed it.

**NEXT: workflow A** (`docs/dev/workflows/A-mature-finish.js`): finish the 5 mature packages GORE, SURV, CMB, ARC phase C, and ROM+MUS. Their partial code is on disk.
- **Ask the user which machine runs A before preparing anything.** The options are this M4 Air, a Mac mini M1 (8 GB, so 2 agents and a long run), or an Asus A15 (GTX 1650, needs a setup test).
- Use the strict verify loop from B for A as well: independent judges with fresh screenshots, fix until pass. See `docs/dev/workflows/D-B-verify.js` and the child-fix pattern.
- The user may also choose to clear `b-open-items.md` first.

**Open design question for Deril:** the style of the brick ruins and brick house.

**Machine notes:**
- The M4 Air shut down twice under 7-9 agents. Use about 4 agents, 1 headless Chrome each, on the charger.
- The scratchpad in /private/tmp is wiped on reboot. Keep anything important in `docs/dev/`.

### What is done (all committed on `main`; the old `expansion` branch was merged and deleted)
- **Expansion:** the 12-chapter story with old-save migration, co-op building and home, landmarks and caves, horses, the parchment map with fog of war, the family arc, torch, poultice, cloak, waterskin and fishing.
- **WPN, Assassin's Creed–style weapons:**
  - spear on the back, axe at the hip;
  - draw and sheathe, keys 1–4 and Q;
  - aim with right mouse, with an arc; the thrown spear stays where it lands and can be picked up;
  - hitstop and shake on hits.
- **RST cinematic sleep:**
  - rest menu with "until dawn" or "nap";
  - lying side by side, a blanket, holding hands;
  - a time-lapse sky, waking up and Sena's greeting.
- **FPP first person:**
  - your body is visible when looking down, and your hands hold the weapons;
  - head bob comes from the feet, with a landing dip;
  - no clipping into walls;
  - comfort settings.
- **M1 MAT mature foundation:**
  - the 21+ notice;
  - difficulty modes Story, Survivor, Hardcore and Custom;
  - being downed and rescued by Sena; permadeath with a memorial;
  - 5-tab settings.
- **Save protection:** only port 5173 touches the real database. A double-start guard stops structures from being built twice.

### What is partial (code on disk, not finished or tested; details in `docs/dev/where-agents-stopped.txt`)
| Package | Where it stopped |
|---|---|
| M2 GORE (`gore.js`) | Logic and bear wounds done. Was running its visual test pass. |
| M3 SURV (`survival.js`) | Unit tests pass. Was running its browser acceptance tests. |
| M4 CMB (`combat.js`, `enemies.js`, `tribe.js`) | Fixed a null-attacker crash in the raider logic. Was writing acceptance scripts 5, 11 and 12. |
| M5 ARC (`arc_data.js`) | Phase B mostly done (fever goal counters, migration tests). **Phase C (raid, fever, romance integration) not started.** |
| M6 ROM+MUS (`romance.js`, `music.js`) | Was testing the heart-60 event, the fade setting and gifts. |

### Top QA issues to fix (see `docs/dev/qa-round1-issues.json`)
- **Help panel** is always on and covers subtitles, the E prompt, the first-person weapon and the inventory. Make it toggle with F1/H, or show contextual hints instead.
- **Tame horse's E prompt** overrides "Sit with Sena", meals, revive and story beats. Fix the target priority.
- **Caves:** pitch black past the torch; the mouth renders black from inside; white specks at gaps in the dome; the Echo Hollow entrance is buried under boulders.
- **WebGL context loss** is unhandled: the screen goes white.
- **Home and sleep:**
  - berry bushes stay inside a hut or house built on top of them;
  - the blanket hump hides Sena and the held hands;
  - grown Lio sleeps on the tiny cradle;
  - in the hot spring, they sit on top of the water.
- **Still open from earlier:**
  - stiff rider arms and instant mounting;
  - no map marker for Lio;
  - Sena doesn't sit by the hearth on New Life nights;
  - wolves don't prefer the pine forest;
  - the spear is one-handed in first person;
  - the "hands are empty" chip shows while holding a weapon;
  - low frame rate.

### After that
- **Viking "Book II: The Sea Road":** spec in `docs/dev/spec-viking.md`. **Ask the user the 4 questions in §0 first.** Defaults: option C; grown Lio can be downed but never dies; the game's own gods; no horned helmets.
- **Backlog** (`docs/dev/spec-mature.md` §1.2): loading bar, seasons, bow, traps, dog, skills, gamepad, achievements, photo mode.
