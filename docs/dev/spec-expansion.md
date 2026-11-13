# Hearthborn: "Horses, Caves and Home" implementation spec

Target: `/home/ashish/Desktop/game` (Three.js r187, Vite, plain ES modules). This spec is for engineers who work one after another. Each work package (WP) builds on the one before it. Line numbers are approximate and refer to the current working tree, so find code by function name.

All content is family-friendly. "Sleeping together" means the couple rests side by side in their bed, the screen fades to black, and dawn follows. The family arc uses dialogue and a fade card only.

---

## 0. Feature summary

| # | Feature | Inspired by | Where | WP |
|---|---|---|---|---|
| 1 | **Story v2**: 12 chapters (5 new), stable chapter ids, `reached(id)` gates, save migration (`S.storyV`), `onEnter` hooks, epilogue guard | Stardew, Far Cry Primal, Ancestors | main.js | 1 |
| 2 | **Poses for humans**: work, sit, ride, lie, dance, talk, torch | n/a | people.js | 1 |
| 3 | **Closeness meter** with Sena: sitting at the fire, shared meals, building and resting together | Stardew hearts | main.js, index.html | 1 |
| 4 | **Co-op construction sites**: timed builds; Sena walks over and works (Fixing_Kneeling); the build goes faster together; a dance at the end | Farthest Frontier, Valheim | main.js, entities.js | 2 |
| 5 | **New placeables**: drying rack, stable, fence, stone path, flower bed, storage basket | Farthest Frontier, Stardew | entities.js, main.js | 2 |
| 6 | **Home upgrades**: hearth, double bed, cradle, nursery room. A **Homeliness** score | Stardew house upgrades | entities.js, main.js | 2 |
| 7 | **Rest together**: both lie side by side in the hut or house bed, fade, dawn, a "Well rested" buff | Stardew | main.js | 2 |
| 8 | **World v2**: landmark hills (triangle rule), 2 river fords, Mirror Lake, Horse Meadow, hot spring | BotW, GMTK | world.js, new landmarks.js | 3 |
| 9 | **Caves**: Echo Hollow (paintings, handprints, shelter) and Flint Deep (flint, crystals, bats). Darkness, torch, Sena with her own torch | Valheim, The Forest, Sons of the Forest | new caves.js, world.js, main.js | 3 |
| 10 | **Horses**: Quaternius CC0 brown and white horses. Grain-lure trust, a soothe minigame to tame, saddle, 4 gaits, horse stamina, fords and slopes, Sena rides behind, whistle (X), bond levels 1-4, stable | BotW, Valheim, RDR2 | animals.js, main.js, index.html | 4 |
| 11 | **Map v2**: parchment style, contours, fog of war (64×64 bit grid, saved), 11 POIs with discovery banners, region labels, quest marker, horse and Sena markers, journal x/11 | BotW, Valheim | main.js, index.html | 5 |
| 12 | **Family arc**: "A New Life" chapter, cradle and nursery, daughter Lio born (fade card), the child follows Sena, revised epilogue | Stardew, Ancestors | main.js | 6 |

**Horses are story-mode only.** The game has only one mode today (story, from New/Continue), so every horse system is gated on `STORY && reached('herd')`. Add `const STORY = true` near the state section so a future free mode can switch it off.

---

## 1. Shared definitions (all WPs use these names)

### 1.1 New state in `fresh()` (main.js ~39)
```js
storyV: 2, worldV: 2,
close: 10,               // Closeness with Sena, 0..100
home: { hearth: false, bed: false, cradle: false, nursery: false },
horse: null,             // {kind,x,z,face,stam,bond,name,riding,nRide,fedDay}
found: {},               // POI id -> 1
seen: '',                // fog of war, base64 of a 64*64 bit grid (512 bytes)
stash: {},               // storage basket contents
kids: [],                // [{name:'Lio', born: day, female: true}]
rested: 0,               // seconds of "Well rested" left
```
New `ITEMS`: `flint: 'Flint', ochre: 'Ochre'`. Old saves pick these up through the `Object.assign(fresh(), data)` merge plus the inv merge in `start()`.

### 1.2 Chapter ids and helpers (WP1)
```js
const chIdx = (id) => CH.findIndex((c) => c.id === id);
const reached = (id) => S.ch >= chIdx(id);
const roman = (n) => ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][n - 1];
```

### 1.3 `window.G` debug handle (grown in every WP; used by the headless tests)
WP1 adds: `S, P, N, CH, structs, animals, world, setCh(id)` (sets S.ch = chIdx(id), runs onEnter, calls showChapter), `give(k, n)`, `tp(x, z)` (moves P, and N to 2 m away), `time(h)`, `chId: () => CH[S.ch].id`, `goals: () => CH[S.ch].goals.map(([l, f]) => [l, !!f()])`, `save`.
Later WPs add the hooks listed in their sections.

---

## 2. The new story (CH array, main.js 51-68)

Every entry gets an `id`. Goals are `[label, () => bool]` as now. `onEnter` (optional) must be **idempotent**. It runs when the chapter is advanced into AND again on load in `start()`. `where` (optional) returns `[x, z]` or null for the quest marker.

Line tone: short, warm, plain speech, as in the existing chapters. `''` is the narrator.

| idx | id | Title | Goals (label → check) | Unlocks (recipes with `ch:` = this id) |
|---|---|---|---|---|
| 0 | `awaken` | Awakening | unchanged | – |
| 1 | `fire` | The First Fire | existing 2 goals + **"Sit by the fire with Sena (E at the fire)"** → `cnt('sat_fire') >= 1` | fire, torch, poultice |
| 2 | `hunt` | The Hunt | unchanged | spear, cloak, waterskin, **rack** |
| 3 | `shelter` | Shelter | axe; 12 timber; **"Raise the thatch hut with Sena"** → `has('hut')`; **"Rest together in the hut"** → `cnt('slept') >= 1` | axe, hut |
| 4 | `cave` **NEW** | Into the Dark | "Light a torch (T)" → `cnt('torchlit') >= 1`; "Find the hollow in the western hills" → `!!S.found.echo`; "Look at the old paintings (E)" → `cnt('painting') >= 3`; "Leave your handprints beside theirs" → `cnt('handprint') >= 1`; "Chip 6 flint" → `cnt('flint') >= 6` | flintaxe, flintspear |
| 5 | `herd` **NEW** | The Wild Herd | "Craft a saddle" → `!!S.tools.saddle`; "Find the wild herd east of the river" → `!!S.found.meadow`; "Win a horse's trust: sneak close and offer food (E) ×3" → `cnt('horse_fed') >= 3`; "Calm the horse and ride her" → `!!S.horse`; "Ride with Sena to Lookout Peak" → `cnt('peak_ride') >= 1` | saddle, stable |
| 6 | `clay` | Clay and Flame | unchanged | kiln |
| 7 | `house` | A Home of Brick | "Build the brick house with Sena" → `has('house')` | house |
| 8 | `hearth` **NEW** | Hearth and Home | "Build a hearth inside the house" → `S.home.hearth`; "Make a bed for two" → `S.home.bed`; "Build a stable for your horse" → `has('stable')`; "Rest at home together" → `cnt('slept_home') >= 1` | hearth, bed, fence, path, flowers, basket |
| 9 | `seeds` | Seeds of Tomorrow | existing 4 goals + "Make the home cosy (Homeliness 6)" → `homeliness() >= 6` | farm, well |
| 10 | `newlife` **NEW** | A New Life | "Grow close to Sena (Closeness 60)" → `S.close >= 60`; "Build a cradle" → `S.home.cradle`; "Add a nursery room to the house" → `S.home.nursery`; "Rest at home three nights" → `cnt('slept_home') - (S.c.lifeStart ?? 0) >= 3`; "Welcome your child" → `cnt('born') >= 1` | cradle, nursery |
| 11 | `village` | The Village | `goals: [], epilogue: true` | – |

### 2.1 Lines (`lines`) and `onEnter` / `where` for the new and changed chapters

- **fire** (append to the existing lines): `['Sena', 'Sit with me a while. The fire is better with two.']`
- **shelter** (replace): `['Sena', 'A fire is not a home. The rain will come, and the wind after it.']`, `['Aro', 'Then we raise a roof, the two of us. You weave, I will cut.']`
- **cave**
  - Lines: `['Sena', 'The wind smells of stone and old smoke. There is a hollow in the western hills. I saw it from the ridge.']`, `['Aro', 'Then we take fire with us. Whatever is in the dark, we will see it first.']`
  - `where`: Echo Hollow mouth if not found, else the Echo chamber centre.
  - One-off lines (in their act handlers):
    - first painting: `['Sena', 'Look, Aro: horses. And people sitting on their backs. Someone lived here before us.']`
    - handprint: `['Sena', 'Now the stone will remember us too.']`
    - flint: `['Aro', 'This stone breaks sharp as ice. Better than anything in the river.']`
- **herd**
  - Lines: `['Sena', 'Across the river, on the open grass, I saw them running. Horses, like on the cave wall.']`, `['Aro', 'They will not come to a stranger. We go slow, and we bring them something sweet.']`
  - `onEnter`: `spawnWildHerd()` (WP4) and reveal the meadow as a "rumour" pin (`S.rumour = ['meadow']`, drawn as a "?" on the map).
  - `where`: the meadow centre, then Lookout Peak once `S.horse` exists.
  - One-off lines:
    - first feed: `['Sena', 'She is curious. Keep your hand low.']`
    - tamed: `['Sena', 'She chose you. Let us call her Dawn.']` (brown) or `'…call her Mist.'` (white)
    - peak ride: `['Sena', 'From up here the whole valley is ours to see.']`, `['Aro', 'And there is our smoke. Home.']`
- **clay** (append): `['Aro', 'Dawn can carry the clay. We will need a great deal of it.']`. Use `S.horse?.name || 'The horse'`.
- **house** (replace): `['Aro', 'Walls that no wind can push over. We build them together.']`, `['Sena', 'Build it where we can see the river.']`
- **hearth**
  - Lines: `['Sena', 'Walls are not enough. A home needs a fire inside, and a bed where we can both rest.']`, `['Aro', 'And a roof for Dawn, so she does not stand in the rain.']`
  - `where`: the house.
  - First `slept_home` (in sleep mid): `['Sena', 'Aro… I want our children to grow up here.']`
- **newlife**
  - Lines: `['Sena', 'Come and sit with me by the hearth, Aro. By the time the grain is tall again, there will be three of us.']`, `['Aro', 'Three. Then I had better build another room, and a cradle.']`
  - `onEnter`: `S.c.lifeStart ??= cnt('slept_home')`.
  - `where`: the house.
  - The birth happens in `sleep()` (WP6).
- **village** (replace lines):
  - `['', 'Seasons turned into years. Others followed the smoke of the hearth, and stayed.']`
  - `['', 'Lio learned to ride on old Dawn before she could run.']` (use the horse's name)
  - `['', 'From one fire, a village. From a village, everything that came after.']`
  - `['Sena', 'The valley is ours, Aro. Keep building.']`

### 2.2 Replace the hard-coded chapter indices (WP1)

| Location | Old | New |
|---|---|---|
| drawQuest ~173 | roman array `[S.ch]` | `CH[S.ch].epilogue ? 'Epilogue' : roman(S.ch + 1)` |
| showChapter ~185 | `S.ch < 7 ? …` | `CH[S.ch].epilogue ? 'Epilogue' : 'Chapter ' + (S.ch + 1)` |
| EVENTS.wolves ~437 | `S.ch >= 5` | `reached('house')` |
| updateEvents ~478 | `S.ch < 1` | `!reached('fire')` |
| ~479 | `S.ch >= 2` | `reached('hunt')` |
| updateSena ~1073 | `S.ch >= 1` | `reached('fire')` |
| ~1075 | `S.ch >= 6` | `reached('seeds')` |
| RECIPES `ch: n` | numbers | chapter **ids** (`ch: 'fire'` …) |
| toggleMenu ~561 | `r.ch > S.ch` | `!reached(r.ch)` |
| advance block ~1222 | `S.ch++; … epilogue` | `S.ch++; CH[S.ch].onEnter?.(); save(); if (CH[S.ch].epilogue) {epilogue(); setTimeout(showChapter, 5200)} else showChapter();` |

`epilogue()` guard: `if (S.village) { spawnVillagersIfMissing(); return; }`. It must never place houses or add `S.day += 400` twice. If there is no house, use a fire, then {0,0} (it currently crashes at `home.x`).

### 2.3 Save migration (in `start()` right after `Object.assign(fresh(), data)`)
```js
const OLD = ['awaken','fire','hunt','shelter','clay','house','seeds','village'];
if ((data.storyV || 1) < 2) {
  const o = Math.max(0, Math.min(7, data.ch | 0));
  // An old index means "chapters before o are finished" -> go to the first NEW chapter after the last finished one,
  // so players on clay/house/seeds still meet the new cave/herd/hearth content.
  S.ch = o === 7 ? chIdx('village') : o === 0 ? 0 : chIdx(OLD[o - 1]) + 1;
  // old 1->1, 2->2, 3->3, 4(clay)->4(cave), 5(house)->7(house), 6(seeds)->8(hearth), 7->11(village)
  S.storyV = 2;
  if (S.ch >= 3) S.close = Math.max(S.close, 30);
  if (has('house')) S.home = S.home || fresh().home;
}
S.ch = Math.max(0, Math.min(CH.length - 1, S.ch | 0));
if ((data.worldV || 1) < 2) { S.felled = []; S.worldV = 2; }   // new terrain features shift node scatter; trees regrow (cosmetic)
```
- After structs are rebuilt, call `CH[S.ch].onEnter?.()`.
- Old players at the village (index 11) skip the story chapters. Horse taming and the caves still work for them because every feature gates on `reached('cave')` / `reached('herd')`, and those are true at the village.
- Wild horses spawn when `reached('herd') && !S.horse` (call `spawnWildHerd()` on load).
- The structure-load call becomes `placeStruct(s.k, s.x, s.z, s.r, s.p == null || s.p >= 1, s.g)`, then `st.rise = s.p ?? 1` (WP2).

---

## 3. Recipes (full list after all WPs)

`place` = placeable ghost. `tool` = sets `S.tools[id]`. `up` = house upgrade (needs `has('house')` and P within 16 m of the house). `t` = build time in seconds when Aro works alone (0 = rises by itself as today, `dt/2.4`).

| id | Name | Cost | ch | Kind | t | Effect |
|---|---|---|---|---|---|---|
| fire | Campfire | stick 4, stone 3 | fire | place | 0 | now also has 2 log benches (sit spots) |
| torch, poultice | unchanged | | fire | | | |
| spear, cloak, waterskin | unchanged | | hunt | | | |
| rack | Drying rack | stick 6, fiber 4 | hunt | place | 0 | E: hang up to 4 raw meat or fish. After 90 s they become cooked meat or grilled fish (E collects). +1 Homeliness |
| axe, hut | unchanged cost | | shelter | hut place | hut 16 | |
| flintaxe | Flint axe | flint 3, stick 2, fiber 2 | cave | tool | | trees fall in 2 hits (damage 2) |
| flintspear | Flint spear | flint 2, stick 2, fiber 1 | cave | tool | | spear damage ×2 |
| saddle | Saddle | hide 3, fiber 4, wood 2 | herd | tool | | needed for canter and gallop |
| stable | Stable | wood 14, fiber 6, stone 4 | herd | place | 14 | horse home; at night stamina full, +5 bond |
| kiln | Kiln | unchanged | clay | place | 10 | |
| house | Brick house | unchanged | house | place | 36 | |
| hearth | Hearth | stone 8, clay 4 | hearth | up | fade | inside fire ring, warmth; the home light turns on |
| bed | Bed for two | wood 6, hide 3, fiber 6 | hearth | up | fade | double straw bed with a hide blanket |
| fence | Fence | wood 1 | hearth | place | 0 | 2.4 m segment; snaps to the end of a fence within 1.5 m (pos and rot) |
| path | Stone path | stone 2 | hearth | place | 0 | flat stones; no collider; +10% walk speed when on one |
| flowers | Flower bed | berry 2, fiber 2 | hearth | place | 0 | once a day E "Pick flowers for Sena": +3 Closeness |
| basket | Storage basket | fiber 8, stick 4 | hearth | place | 0 | E "Store food": moves berry, meat, cooked, fish, grilled and bread into `S.stash`; E again takes it all back |
| farm, well | unchanged | | seeds | place | 5 / 12 | |
| cradle | Cradle | wood 4, hide 2, fiber 4 | newlife | up | fade | |
| nursery | Nursery room | brick 12, wood 6 | newlife | up | fade | adds a side room to the house mesh |

**Homeliness** `homeliness()`: count every `rack, fence(÷3, floor), path(÷3, floor), flowers, basket, stable, well, farm` with `rise >= 1` within 25 m of the house, plus 1 for each `S.home` flag that is true.

---

## WP1: Foundations: story v2, poses, closeness, debug hooks

**Files:** `src/people.js`, `src/main.js` (state, story, HUD helpers, start, frame advance block, toggleTorch, fire interaction), `index.html` (Closeness bar).

### Tasks
1. **people.js poses**
   - Add to `LOOPS`: `work: 'Fixing_Kneeling', push: 'Push_Loop', sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop'` (only if the clip exists; skip a missing name with a console.warn), `ride: 'Driving_Loop', talk: 'Idle_Talking_Loop', dance: 'Dance_Loop', torchIdle: 'Idle_Torch_Loop'`.
   - Add to `SHOTS`: `pick: 'PickUp_Table', sitDown: 'Sitting_Enter', standUp: 'Sitting_Exit'`.
   - `h.pose = null`. In `animate`, at the state pick (~91): `const state = h.pose && act[h.pose] ? h.pose : (existing)`.
   - Straddle: after `mixer.update`, `if (h.pose === 'ride' || h.straddle) { bones.thigh_l.rotation.z += 0.45; bones.thigh_r.rotation.z -= 0.45; }`. Tune the sign by eye.
   - `h.lie` (bool). It is read by `settle()` in main, not here.
2. **Story**: replace CH and RECIPES as in §2-3. Add the helpers from §1.2, the replacements in §2.2, the migration in §2.3, the `onEnter` calls, and the epilogue guard. Goals that point at features not built yet (has('stable'), S.found…) just stay false until later WPs land.
3. **Counters**:
   - `bump('torchlit')` in toggleTorch when it lights.
   - `bump('sat_fire')` in the new sit action (below).
4. **Sit by the fire with Sena**
   - In `structTarget` for `fire`: when Sena is within 15 m and `!busy`, return `{label:'Sit with Sena', act: sitTogether(s)}`. Keep cook/sleep as now if they take precedence; put sit as the target when P is not holding raw meat.
   - `sitTogether(s)`:
     - Place P at `s.x - 1.6, s.z` and N at `s.x + 1.6, s.z`, both facing the fire.
     - `P.sit = N.sit = 8` (seconds). `P.h.pose = 'sit'`, `N.h.pose = 'sitTalk' || 'sit'`.
     - Queue one vignette pair from `VIGNETTES[CH[S.ch].id]` (2-3 pairs per chapter, same tone as §2.1; examples: `['Sena','Do you remember the cold hills?'],['Aro','Only that you were there.']`).
     - `S.time += 1`. Once per day (`S.c.satDay !== S.day`) give +3 Closeness. Then `bump('sat_fire')`.
   - While `P.sit > 0` / `N.sit > 0`, updatePlayer and updateSena skip movement. Any movement key ends the sit early: pose null, then `P.h.swing('standUp')` if that shot exists.
   - BUILD.fire: add two log benches (cylinder r 0.18, length 1.3, wood mat) at ±1.6 m, top at 0.45 m, so the Sitting clips sit on them.
5. **Closeness**
   - `addClose(n, why)`: clamp 0..100, toast `♥ Closeness +n (why)`.
   - Share a meal: `findTarget` on Sena when within 2.2 m and P has `cooked|grilled|bread`, once per day: "Share a meal with Sena". This consumes 1, sets food +15 for P, gives +3, and Sena says one line.
   - HUD: `<div class="bar" id="bar-close">Closeness<i><b id="b-close"></b></i></div>` in `#bars` (pink 0xd77a8a). Update it next to the other bars.
6. `settle(e)` overrides, used by all later WPs. They go at the top of settle:
   - `if (e.rest > 0) { root.position.copy(e.restPos); root.rotation.order = 'YXZ'; root.rotation.set(-Math.PI/2, e.face, 0); e.h.animate(dt,0,false,false,false); return; }`
   - else reset `rotation.x = 0`.
   - `if (e.seat) { root.position.copy(e.seat); root.rotation.y = e.face; e.h.animate(dt,0,…); return; }` (horse rider, WP4).
7. `window.G` hooks from §1.3.

### Acceptance (headless Chrome)
- New game: `G.chId() === 'awaken'`, and `G.CH.length === 12`.
- `G.setCh('cave')` shows the card "Chapter 5 · Into the Dark". `G.goals()` returns 5 goals, all false.
- A fake old save (localStorage `hearthborn-save-v2` with `{ch:4, storyV:undefined}`) loads to `G.chId() === 'cave'`. `ch:6` gives `'hearth'`, `ch:7` gives `'village'`, and `S.village` stays true with no duplicate houses (count structs of kind house before and after load).
- `G.setCh('fire')`; place a fire with `G.give` and the craft menu; `sitTogether` works: `G.P.h.pose === 'sit'`, `cnt('sat_fire') === 1`, and `S.close` grows by 3.
- Lighting a torch bumps `torchlit`. Recipes appear only when their chapter is reached (the menu has no `saddle` at `shelter`).
- No console errors. `npm run build` passes.

---

## WP2: Co-op building, placeables, home upgrades, rest together

**Files:** `src/entities.js` (BUILD.*), `src/main.js` (building section, findTarget/structTarget, updateSena, updateWorldThings, sleep, save/load), `index.html` (help).

### 2.1 Construction sites
- `BUILD_TIME = { hut: 16, kiln: 10, house: 36, farm: 5, well: 12, stable: 14 }`. Kinds without an entry rise by themselves (`dt/2.4`) as now.
- `placeStruct`:
  - For timed kinds set `st.timed = true`, `st.rise = 0`, `st.byA = st.byN = 0`.
  - Add a **scaffold** group: 4 stick posts + 2 cross bars around `radius`, using the existing wood mat. Visible while `rise < 1`.
  - Store `st.col = addCollider(...)` (needed later).
- Staged look (updateWorldThings ~1118):
  - `g.scale.y = 0.06 + 0.94 * ease(rise)`.
  - Optional `BUILD.x.stage(p)` hook. The house uses it to show the foundation at <0.3, the walls up to 0.8, and the roof at ≥0.8.
- Work rate:
  ```js
  const a = P.work > 0 && P.workSite === s ? 1 : 0, n = N.workSite === s && N.working ? 1 : 0;
  const rate = a && n ? 2.2 : a ? 1 : n ? 0.6 : 0;
  s.rise = Math.min(1, s.rise + dt * rate / BUILD_TIME[s.kind]); s.byA += dt*a; s.byN += dt*n;
  ```
  - With both working the hut takes about 7 s and the house about 16 s. Aro alone takes 16 s / 36 s.
- Aro working:
  - `findTarget`: for a timed site within `radius + 2.5`, return `{label: \`Build the ${label}: ${pct}% (hold E)\`, key: true, act(){ P.work = 0.5; P.workSite = s; }}`.
  - In updatePlayer: `P.work -= dt`. While `P.work > 0`, `P.h.pose = 'work'`, face the site and freeze movement.
  - Any movement input clears `P.work` and sets pose to null.
- Sena working (updateSena, before the gather branch; this preempts gathering and clears `N.node`):
  - `site = structs.find(s => s.timed && s.rise < 1 && dist(s, P) < 45)`.
  - Her work spot is the side opposite Aro: `ang = atan2(P.x - s.x, P.z - s.z) + Math.PI`, at `s.radius + 0.8`.
  - She walks there with walkTo (stop 0.4). On arrival: face the site, `N.working = true`, `N.workSite = s`, pose `'work'`. Every 6 s she plays `swing('pick')` (fetching), purely cosmetic.
  - One line per site, at 30%: `['Sena','Hold that beam steady, I will tie it.']` / house: `['Sena','One more row and we can see the river through the window.']`.
- Completion (rise reaches 1):
  - Scaffold off; pose null for both.
  - If `s.byN > 1.5 && s.byA > 1.5`: `bump('built_together')`, `addClose(5, 'built together')`, toast `Built together: ${label}`. Both play pose `'dance'` for 3 s (`P.dance = N.dance = 3`; freeze input).
  - Existing completion side effects (drawQuest, homeLine) stay.
- Save: the struct entry gets `p: s.rise < 1 ? +s.rise.toFixed(3) : undefined`. Load uses it (§2.3).

### 2.2 New BUILD kinds (entities.js). Each returns `{radius, label, solid?, update?}`
- `rack`: 2 posts + 3 crossbars, 1.6 wide, 1.5 tall; radius 0.9. `st.hang = []` (items with a timer). `update` shows meat strips (small brown boxes) for each hung item. Non-solid.
- `stable`:
  - 4 corner posts, a lean-to thatch roof (tilted plane with the hut thatch mat), 3 fence sides, a trough (box) and hay (yellow box).
  - Open side faces local +Z. Footprint 5×4; radius 2.8.
  - Colliders: 3 circles on the back wall instead of one solid circle, so the horse can stand inside.
- `fence`: 2 posts + 2 rails, 2.4 long along local X; radius 1.3. Colliders are 3 small circles r 0.25 along it.
- `path`: use `NAT.RockPath_Round_Wide` if it is loaded (see WP3 §3.6 note), else 5 flattened lumpy stone discs. Radius 1.2, no collider.
- `flowers`: ring of small stones + NAT `flower_3_group` and `flower_4_group` instances; radius 0.9.
- `basket`: woven cylinder (fiber colour 0xb89a5e) with a lid; radius 0.5; small collider r 0.4.
- Add `R_OF` entries: rack 1, stable 3, fence 1.3, path 1.2, flowers 1, basket 0.6.
- Add `ICON` entries: `rack ['#a0784a','Rack'], stable ['#8a5a2e','Stable'], fence ['#7a5a3a','Fence'], path ['#9a958c','Path'], flowers ['#d77ab0','Flowers'], basket ['#b89a5e','Basket']`. A missing ICON crashes drawMap.

### 2.3 House and hut interiors (entities.js)
- **house**:
  - Remove the dark door panel (~263) and add an interior floor plane at local y 0.15.
  - Groups toggled by `setHome(home)`:
    - `hearthG`: stone ring at local (1.9, 0.15, -1.2) with an emissive ember disc.
    - `bedG`: double bed at local (-0.9, 0.15, -1.6): frame 1.6×2.1, straw mattress top at y 0.55, two pillows, and a hide blanket box covering the lower 70%.
    - `cradleG`: small rocking box at (1.8, 0.15, 1.2).
    - `nurseryG`: a 3.2×3.2 brick annex on local -X with its own roof and a doorway gap in the main wall.
  - Return `setHome` and `bedPts: [[-1.3, 0.62, -1.6], [-0.5, 0.62, -1.6]]` (local; heads toward -Z, the back wall).
  - Wall material `side: DoubleSide`, so the cinematic camera at the doorway sees in.
- **hut**:
  - Wall cylinder with a 50° gap facing +Z (`thetaStart`/`thetaLength`), DoubleSide. Remove the dark door box.
  - Add a reed mat (flat box 1.4×2) with a hide blanket at local (0, 0.05, -0.4).
  - `bedPts: [[-0.35, 0.12, -0.4], [0.35, 0.12, -0.4]]`.
- **Home light**: create ONE `PointLight(0xffa860, 0, 9)` at startup in main (never add lights later). When the hearth exists, move it to the hearth's world position and set intensity 3 at night / 1 by day.
- Upgrades:
  - Crafting an `up` recipe spends the cost, then `fadeTo('Aro and Sena build the ' + name.toLowerCase() + ' together…', mid)`.
  - mid: `S.home[id] = true`; `house.setHome(S.home)`; `bump('built_together')`; `addClose(3)`; `S.time += 2`.
  - On load call `setHome(S.home)` after the structs are rebuilt.

### 2.4 Rest together (replaces `sleep()`)
`structTarget` for hut/house passes the struct: `t('Rest until dawn', () => sleep(s))`. The new `sleep(s)`:
```text
together = s && dist(N, s) < 40
fadeTo(together ? 'Aro and Sena rest side by side as the fire burns low…' : 'You sleep until dawn…', mid, 2200)
mid():
  existing: time = 6.3, day++, stat refills, bump('slept'), save
  if together:
    pts = s.bedPts transformed by s.rot to world (+ placeStruct base y)
    P.rest = N.rest = 3.5; P.restPos/N.restPos = pts; P.face = N.face = s.rot + Math.PI; P.vx = P.vz = 0
    camShot = {pos: door point + up 1.7 (door = s + (sin rot, cos rot)*(radius+0.6)), look: bed centre, t: 3.5}
    s.kind === 'house' ? (bump('slept_home'), addClose(4,'rested at home'), first time -> Sena line) : addClose(2,'rested together')
    S.rested = 180 ("Well rested": stamina regen ×1.5, toast)
    hook for WP6: maybeBirth()
```
- While `rest > 0`: updatePlayer and updateSena return early (they still decrement it, and settle uses the lie override from WP1). Input is ignored.
- When it ends: set `rest = 0`, put both at the door point (+0.6 apart), `collide()` both, and reset `rotation.x`.
- `updateCamera`: when `camShot` is active, lerp the camera to it, force third person, and skip the normal camera logic.
- `die()` clears `rest, sit, work, dance, seat` for both.

### 2.5 Other interactions
- Rack:
  - `structTarget` returns "Hang meat to dry" when P has meat or fish and `hang.length < 4`.
  - Or "Take dried food" when any timer ≥ 90 s. Raw meat becomes cooked; fish becomes grilled.
  - Save `hang` in the struct entry: `h: [[kind, t]]`.
- Basket: E toggles store and take. Save `S.stash`.
- Flowers: once per day, "Pick flowers for Sena" gives +3 Closeness and a Sena line.

### G hooks
`G.sites()` returns `structs.filter(s => s.timed).map(s => ({k: s.kind, rise: s.rise}))`, `G.finishSites()`, `G.homeliness()`, `G.sleep()` (uses the nearest hut/house), `G.place(kind, x, z)` (spends nothing, places the ghost result directly).

### Acceptance
- At `G.setCh('shelter')`, place a hut 6 m from P with `G.place`. After 3 s with no one working the rise is still 0; Sena then walks to the site and `G.N.h.pose === 'work'`.
- Simulating Aro holding E (call the target act every 0.3 s) finishes the hut in under 9 s of game time. `cnt('built_together') === 1`. Both play the dance pose.
- Reloading halfway through a build keeps the rise value (it does not complete for free).
- `G.sleep()` in the hut puts P and N inside the hut on the mat with `P.h.root.rotation.x ≈ -π/2`. Afterwards both stand outside the door, not stuck in the collider. `cnt('slept')` is 1 and Closeness is +2. Take a screenshot during camShot to show them side by side.
- With a house at `hearth` chapter: craft hearth, then bed. `S.home.bed` is true, and the bed mesh is visible on reload. Sleeping gives `cnt('slept_home') === 1`.
- Rack: hang 1 meat, advance 90 s (`G.skip(90)` or a loop), take, and inventory cooked +1.
- `drawMap` does not crash with every new kind placed.

---

## WP3: World v2: landmarks, fords, lake, meadow, caves

**Files:** `src/world.js` (rawHeight, createWorld tail, exports), new `src/caves.js`, new `src/landmarks.js`, `src/terrain.js` (export `rockTexture`), `src/main.js` (NODE/ITEMS flint and ochre, cave darkness hooks, camera clamp, sheltered, rain, Sena torch, POI interactions).

Coordinates: home is at the origin. The river runs north-south at `riverX(z) ≈ 62 ± 40`, so the east bank is x > ~100. The valley is flattened within 90 m, and every new feature is at d > 95. North is -z.

### 3.1 POIS (export from `src/landmarks.js`; shared with the map in WP5)
| id | Name | Centre (x, z) | r (discover) | Terrain feature |
|---|---|---|---|---|
| `ford` | Ford of Reeds | (riverX(30), 30) | 18 | river depth -0.6 at z = 30 |
| `nford` | North Ford | (riverX(-150), -150) | 18 | river depth -0.6 at z = -150 |
| `meadow` | Horse Meadow | (175, 40) | 45 | flattened to ~4.5 within r 45-75 |
| `stones` | Standing Stones | (168, -45) | 16 | small flat knoll r 14 |
| `ruins` | Old Ruins | (125, -140) | 16 | – |
| `echo` | Echo Hollow | mouth (see caves) | 14 | hill + chamber |
| `flint` | Flint Deep | mouth (see caves) | 14 | hill + chamber |
| `spring` | Hot Spring | (-105, -62) | 12 | basin 0.9 m below land |
| `peak` | Lookout Peak | (-185, 70) | 10 (summit) | cone hill, +42 m, flat top r 6 |
| `tree` | Great Tree | (-62, 80) | 14 | knoll, +4 m, r 18 |
| `lake` | Mirror Lake | (-95, 178) | 40 | basin to -1.8, rIn 26, rOut 40 |

### 3.2 rawHeight changes (world.js 20-28)
Split the function:
- `land(x, z)` = lines 21-25 as they are now.
- `rawHeight(x, z) = river(features(land(x, z), x, z), x, z)`.
- `features()` applies, in this order:
  - `HILLS` (Echo hill (-150, -120) r 55 h 30; Flint hill (-40, -215) r 60 h 36; Lookout Peak cone r 60 h 42 with `min(h, top)` flattening at the top; Great Tree knoll; stones knoll): `h += hh * Math.pow(1 - smooth(0, r, d), 1.6)` (cone-like, BotW triangle rule).
  - Meadow flatten: `h = lerp(h, 4.5 + fbm(x*.02, z*.02, 2)*1.2, 0.85*(1 - smooth(45, 75, d)))`.
  - Lake basin: `lerp(h, -1.8, 1 - smooth(26, 40, d))`.
  - Hot spring basin: `lerp(h, land - 0.9, 1 - smooth(5, 8, d))`.
  - Cave flatten (caves.js `caveCarve(h, x, z)`, §3.3).
- River with fords: `depth = lerp(-2.4, -0.6, max over fords of (1 - smooth(5, 16, |z - zf|)))`, then `lerp(h, depth, r)`. The river shader renders the shallow water by itself.
- Mirror Lake water: in createWorld add `new Mesh(new CircleGeometry(44, 48).rotateX(-PI/2), river.mesh.material)` at (-95, 0, 178). Return it as `world.lake`.
- `export function biome(x, z)` returns, in this order:
  - `'meadow'` when in the meadow mask
  - `'lake'` within 45 m of the lake
  - `'high'` if `max(|x|,|z|) > 215` or near the Flint/Echo hills (d < 50)
  - `'pine'` if `forest(x, z) > 0.55` (expose `forest`)
  - otherwise `'valley'`
- Optional terrain vertex tint: meadow `+0x0a0f00` lighter yellow-green, high `lerp` toward rock grey. Do this only if it is cheap at the vertex colour step (106-128).
- Save safety: everything is > 95 m from the origin, so player homes do not move. `S.worldV` (WP1) resets the felled trees.
- Note: the grid is `CELL = 2.5 m`, so features narrower than ~6 m alias. That is why caves use chambers, not thin tunnels.
- Spawn checks: deer `landSpot` should avoid the lake (it already avoids h < 1.6).
- Wolves: prefer `biome === 'pine'` for EVENTS.wolves spawn points when possible.

### 3.3 Caves (new `src/caves.js`): "chamber in a hillside"
The heightfield cannot overhang, so each cave is a **flattened disc chamber under a hollow rock dome**, set into the front of its hill, plus a short entrance tube. The hill rises behind and over the dome, so only the arched front shows.
```js
export const CAVES = [
  { id:'echo',  name:'Echo Hollow', c:[-138,-108], R:11, H:6.5, dir:null /* computed: toward origin */ },
  { id:'flint', name:'Flint Deep',  c:[-40,-192],  R:13, H:8,   dir:null /* toward origin (+z mostly) */ },
];
// derived at module load: c.dir = normalize(-c.x, -c.z); c.mouth = c + dir*(R+5); c.floor = land(mouth) + 0.2  (import land from world or pass in init)
export function caveAt(x,z)  // -> {cave, d (dist to centre), m (dist to mouth)} | null
export function depthAt(x,z) // 0 outside; inside the dome: smooth(0, 8, distance travelled in from the mouth) -> 0..1
export function caveCarve(h, x, z) // h = lerp(h, floor, 1 - smooth(R+0.5, R+3, d)) and the entrance corridor (polyline mouth->rim, half width 3.5)
export function createCaves(scene, NAT, rockTex, addCollider, clear)
```
`createCaves` builds:
- **Dome**: an IcosahedronGeometry(1, 4) upper hemisphere scaled (R, H, R). Make it lumpy with util.js `lumpy()`. Cut an entrance gap (drop the faces whose direction is within 28° of `dir` and below 0.75 H). `side: DoubleSide`, rock texture material (export `rockTexture` from terrain.js; fallback colour 0x5a554e). `castShadow` and `receiveShadow` on.
- **Entrance tube**: a half-tube (TubeGeometry along the mouth-to-rim line, radius 3.6, upper half only), same material.
- **Rock dressing**: 12-18 `NAT.rock_medium_1..3` meshes, scale 2.5-5, around the mouth arch and on top of the dome to break up the silhouette.
  - These files already exist at `public/models/nature/rock_medium_{1,2,3}.gltf` and are in nature.js `NAMES`. **No copying needed.**
- **Colliders**: circles r 0.7 every 1.3 m around the dome rim at `R - 0.6`, leaving the gap. Two rows along the tube sides.
- **Clearing**: call `clear(x, z, R + 3)` for the grass carpets. For every node of `world.fields` inside the chamber footprint, set `n.gone = true` and call `f.set(n, false)`. This keeps indices stable.
- **Lights**: one `PointLight(0xffb060, 0, 10)` per cave as a wall sconce, created at startup. It turns on (intensity 4) after the player first lights a torch inside the cave ("Sena sets a torch in the wall").
- **Echo Hollow content**:
  - 3 painting panels: planes on the inner dome wall. Their CanvasTexture is drawn at load with 2D canvas in ochre (#a0452a) on a transparent background:
    - (1) running horses (ellipse bodies, line legs)
    - (2) a rider on a horse
    - (3) hand prints around a fire
  - A 4th blank panel "handprint wall" receives two hand prints (drawn onto its canvas) when the handprint act runs.
  - 1 ochre node (red clay look) and 4 flint nodes.
  - A dry sleeping spot: `findTarget` "Shelter here until dawn" calls `sleep(null)` with together = true and the bed points on the floor.
- **Flint Deep content**:
  - 10 flint nodes and 2 ochre nodes.
  - 8 emissive crystal clusters: ConeGeometry ×3-5, `MeshStandardMaterial({color: 0x6fd3ff, emissive: 0x2aa8e0, emissiveIntensity: 1.6})`.
  - A 4th painting: many huts around one fire, which foreshadows the village.
  - **Bats**: 30 small dark quads (InstancedMesh) that circle near the roof. On the first entry with a lit torch they burst out of the mouth over 3 s (cosmetic; play a noise burst through `A`). Banner "Bats!" with Sena: `'Only bats. My heart is still racing.'`
- **Flint and ochre fields**: new `Field` instances built AFTER line 254 with their own `rng(9123)`, and appended with `fields.push(flintF, ochreF)`. This keeps the tree indices.

**main.js cave hooks**
- ITEMS `flint`, `ochre`. NODE entries:
  - `flint: ['Chip flint', () => { give('flint', 1); }, 300]`
  - `ochre: ['Dig red ochre', () => give('ochre', 1), 400]`
- Paintings: `findTarget` when within 2.5 m of a panel gives "Look at the painting". It shows `banner(title, lore)` and does `bump('painting')` once per panel (`S.c['p_' + i]`). Lore lines:
  - "Horses run across the stone, red as embers."
  - "A person sits on a horse's back, arms raised."
  - "Small hands, and big ones, around a fire."
  - "Many huts around one fire."
- Handprint: needs `ochre >= 1` and Sena within 6 m. "Leave your handprints (with Sena)". It spends the ochre, draws the prints, does `bump('handprint')`, gives +5 Closeness, and Sena says her line.
- Darkness: each frame `world.env.cave = depthAt(P.pos.x, P.pos.z)`, set before `world.setTime`. In `setTime`:
  - `sun.intensity *= 1 - cave`
  - `hemi.intensity *= 1 - 0.92*cave`
  - fog colour lerp toward 0x050403, density += cave*0.02
  - exposure *= 1 + 0.25*cave
- Rain is hidden when cave > 0.3. `sheltered ||= cave > 0.5`.
- Camera:
  - When cave > 0.15, clamp tpp dist to 3.0.
  - Clamp the camera inside the dome: if its distance from the cave centre is > R - 0.9, pull it toward P, and keep `y <= floor + H*0.85`.
- Sena's torch: a second `makeTorch()` on Sena's `hand_l` and a second PointLight created at startup. Inside caves (`depthAt(N) > 0.2`) the light is on and her idle pose is `'torchIdle'`. Outside it is hidden. One-off line on first entry: `['Sena','Stay close. I have a light too.']`.
- Torch pressure: when cave > 0.6 and P's torch is off, toast "It is too dark: light your torch (T)".

### 3.4 Landmarks (new `src/landmarks.js` `createLandmarks(scene, NAT, getHeight, addCollider)`)
- **Great Tree**:
  - NAT `commontree_3` meshes cloned, scaled 3.2, with a warm autumn tint on the leaf material clone (0xd08a3a), and a collider r 2.4.
  - `findTarget`: "Carve your names" (once, with Sena within 8 m). It does `bump('carved')`, gives +5 Closeness, and Sena says `'So the tree will remember, long after us.'`
- **Standing Stones**:
  - 8 `rock_medium_2` scaled (1.3, 3.8, 1.3) in a ring r 9; one fallen; a centre flat stone. Colliders r 0.9.
  - Lore banner on discovery: "Someone raised these, long ago. The shadows point toward the hills."
- **Old Ruins**:
  - 4 broken brick wall boxes (heights 0.6-2.2; brick mat exported from entities.js) and a fallen roof beam.
  - First visit gives 6 bricks plus the lore "A house of brick… older than any we have made."
- **Lookout Peak**:
  - A stone cairn and a 6 m pole with a hide banner (red-brown). The banner is the beacon that can be seen from the valley.
  - Reaching the summit (within 8 m of the top) the first time reveals the map within 230 m (WP5). Riding there with Sena gives `bump('peak_ride')` (WP4).
- **Hot Spring**:
  - A disc water mesh (own MeshStandardMaterial 0x7fc6c8, opacity .8) at basin + 0.6, 10 steam sprites rising slowly, and ring stones.
  - `findTarget`: "Rest in the warm water" (with Sena). Both get pose `'sit'` at y = basin + 0.2 for 8 s. Warmth goes to 100 and P's hp +20. Once a day +2 Closeness.
- **Fords**: reed and stepping-stone decor on both banks (rock_medium_1 scaled 0.6).
- **Paths**: optional dirt lines toward the landmarks (decals). Skip if time is short.
- **RockPath models** (optional for the `path` placeable): add `'RockPath_Round_Wide'` and `'RockPath_Round_Thin'` to nature.js `NAMES`. The files exist at `public/models/nature/RockPath_Round_Wide.gltf/.bin` (the original casing; the texture is `PathRocks_Diffuse.png`, which is present).
  - Check that the gltf `images[].uri` resolves (a 404 shows in the console). If it does not, run `tools/prep_models.py` on those files the same way the other nature files were prepared, or fall back to the procedural stones.

### G hooks
`G.caves`, `G.POIS`, `G.depth()` (the current `world.env.cave`), `G.biome(x, z)`, `G.h(x, z)` (getHeight).

### Acceptance
- `G.h(riverX(30), 30) > -0.9` (the ford can be waded), and `G.h(riverX(0), 0) < -2` (the river is still deep elsewhere).
- `G.h(-95, 178) < -1.5` (lake), and the lake water is visible in a screenshot.
- `G.h(-185, 70) > G.h(-185, 140) + 25` (the peak).
- `G.tp` to the Echo mouth, then walk 10 m inward (`G.tp` toward c): `G.depth() > 0.6`, and the scene is dark in a screenshot apart from the torch. With `T` the torch lights the dome walls and the paintings, and Sena's torch is on.
- The camera never ends up outside the dome while P is in the chamber (check `camera.position` distance to c is < R).
- Flint nodes can be gathered (`cnt('flint')` goes up). Paintings bump `painting` 3 times. The handprint works with ochre.
- Old save loads: no console errors, and the structures near the origin are at the same y (±0.05).
- Frame rate is not worse than about 10% at the default quality.

---

## WP4: Horses

**Assets (step 1, shell):**
```bash
SP=/tmp/claude-1000/-home-ashish-Desktop-game/6dfdb715-4157-4569-89fa-7fd9e44a76a2/scratchpad/assets/horse
cp $SP/horse_brown.glb /home/ashish/Desktop/game/public/models/animals/horse.glb
cp $SP/horse_white.glb /home/ashish/Desktop/game/public/models/animals/horse_white.glb
cp $SP/donkey.glb      /home/ashish/Desktop/game/public/models/animals/donkey.glb
echo "Horse, White Horse, Donkey - Quaternius (Ultimate Animated Animals), CC0 1.0, via poly.pizza" >> public/models/CREDITS.txt
```
(The source pages are https://poly.pizza/m/qvTrSG9pZF, /m/bEdE4rmZy9 and /m/qmX6nhnvp7. If the scratchpad files are gone, re-download them from the static.poly.pizza URLs in the asset report.)

**Files:** `src/animals.js`, `src/main.js` (animals, spear/melee exclusions, findTarget, updatePlayer, new updateRider, updateSena, camera, save/load, input), `index.html`.

### 4.1 animals.js
- `SCALE` adds `horse: 0.48, horse_white: 0.48, donkey: 0.46`. Add `const EXT = { horse: 'glb', horse_white: 'glb', donkey: 'glb' }` and load `` `/models/animals/${k}.${EXT[k] || 'gltf'}` ``.
- Remove duplicate clips: keep the clips without a `|` in their name, otherwise strip `'AnimalArmature|'`. Keep the first of each name.
- `makeAnimal(kind, scale = SCALE[kind])` is used for the foal (0.3).
- It also returns `model` and `bone: (n) => model.getObjectByName(n)`.
- Horse clips: Idle, Idle_2, Idle_Headlow, Eating, Walk, Gallop, Gallop_Jump, Jump_toIdle, Attack_Kick, Attack_Headbutt, Idle_HitReact_Left/Right. `find('Idle_HitReact')` matches through startsWith.

### 4.2 Wild herd and taming (main.js)
- `spawnWildHerd()` (idempotent: return if any `o.horse && !o.tame` is alive): at the meadow (175, 40) spawn `horse`, `horse`, `horse_white`, and a foal (`horse` at 0.3, which follows its mother). Give them `herd: 'wild'`, `horse: true`, and `trust: 0`. Use the existing herd wander and flee.
- `HP.horse = HP.horse_white = 999`. No LOOT.
- **Exclude `o.horse`** from:
  - the updateSpear hit loop (~269)
  - landHit (~499)
  - wolf targeting
  - the minimap "deer" fallback (draw horses as a `'horse'` icon, `#c08850`)
- Alarm: horses have the normal alarm, except when `P.sneak && (inv.grain >= 2 || inv.berry >= 3)`. Then they do not flee if P is within 3.5 m and turn their head toward P (they are curious).
- **Offer food**: `findTarget` on a wild horse within 2.8 while sneaking gives "Offer grain (E)" or "Offer berries (E)":
  - It consumes 2 grain or 3 berries, plays `Eating`, and does `o.trust++` and `bump('horse_fed')`.
  - It shows a heart sprite: a CanvasTexture of "♥" × trust above the horse for 3 s. First time, Sena says her line.
  - With `trust >= 3` the label becomes "Climb on her back (E)", which calls `startTame(o)`.
- **Soothe minigame** (BotW style), `startTame(o)`:
  - `P.ride = o; P.taming = {calm: 0, t: 10}`. The horse alternates `Attack_Kick` / `Idle_HitReact` / `Gallop` in place, and the camera shakes a little.
  - Each `tapE` (not held repeat) gives `calm += S.tools.saddle ? 10 : 7` and costs 4 player stamina. Calm decays 6/s.
  - `#bar-calm` is shown. Toast "Press E again and again to calm her".
  - `calm >= 100`: tamed.
    - `o.tame = true; o.herd = null; o.home = stable || house || fire || {0,0}`.
    - `S.horse = {kind: o.kind, name: o.kind === 'horse_white' ? 'Mist' : 'Dawn', bond: 0, stam: 100, fedDay: -1}`.
    - Sena names her (line). +3 Closeness. You stay mounted.
  - `t <= 0` or `stam <= 0`: thrown off. Dismount to the side, `hp -= 5`, `trust = max(0, trust - 1)`, toast "Thrown off! She trusts you a little less."
- Only one tamed horse. Other wild horses keep wandering.

### 4.3 Riding (updatePlayer branch; keep `P.pos` = the horse's ground position)
- Mount: `findTarget` on the tame horse within 2.6 gives "Ride {name} (E)". `mount()`:
  - `P.ride = o; P.sneak = false; P.air = false; spear hidden; useCool = 0.8`.
  - If Sena is within 10 m and not busy: `N.ride = true` (she hops on behind).
- While riding, `findTarget` returns "Dismount (E)" first. `dismount()`:
  - P goes to `horse.pos + right * 1.3`, N to `- right * 1.3`; `collide` both; `useCool = 0.8`.
  - `o.home` stays; the horse plays Idle.
- Gaits: target speed from input.
  - W gives trot 5.5; W held over 1.5 s gives canter 9 (needs a saddle).
  - Shift gives gallop `13 * (1 + 0.05*(lvl-1))` (needs a saddle and `S.horse.stam > 0`).
  - S brakes, then reverses at 1.5.
  - No saddle: capped at 5.5, toast once "Without a saddle you can only trot."
- Steering: same camera-relative input vector as walking. The horse yaw turns toward it at most `lerp(2.4, 1.1, v/13)` rad/s. Velocity always follows the heading (no strafing). `accel = dt * 2.5`.
- Horse stamina: max `100 + 15*(lvl-1)`. Gallop drains 12/s; it regenerates 10/s otherwise. At 0 the horse is forced to trot until it reaches 30. `#bar-horse` shows it.
- Jump: Space while v > 4 plays `Gallop_Jump`, uses the existing `P.vy/P.jy`, and costs 20 stamina.
- Limits, checked before committing `nx/nz`:
  - `getHeight(nx, nz) < -0.9`: stop with velocity 0, play `Idle_HitReact`, toast "{name} will not go into deep water. Find a ford."
  - Uphill slope `(getHeight(ahead 1 m) - getHeight(here)) > 0.75`: refuse in the same way.
  - `depthAt(nx, nz) > 0.05`: refuse ("{name} will not go into the dark").
  - Shallow water (h < -0.3) caps speed at 3.
- Collision: `collide(P.pos, 0.75)` plus a nose probe at `pos + fwd * 1.1` with r 0.5; if the probe is pushed, cut the speed.
- The LIMIT check stays.
- Clips:
  - v < 0.3: Idle (or Eating if idle > 8 s)
  - v < 3.5: Walk, timeScale v/2.2
  - v < 7: Gallop, timeScale 0.55
  - else: Gallop, timeScale v/13 + 0.2
  - The horse root goes to `P.pos` with y = getHeight; `rotation.y = P.face`.
- `P.speed = v` (this drives the FOV kick). `updateStats`: effort as if standing still. Footsteps use a hoof sound (lower pitch, interval `0.9/v`).
- Disabled while riding: sneak, melee, placing a build, building work, gather prompts. Spear throwing is allowed.
- In `updateAnimal`: `if (o === P.ride) { o.a.update(dt); return; }` at the top.
- **updateRider()**, called after the animals loop (~1233) and before updateCamera:
  - `seat = o.bone('Torso2').getWorldPosition() + (0, 0.65*scale, 0)`.
  - `P.seat = seat - (0, PELVIS_SIT, 0)`, with `PELVIS_SIT` measured once (pelvis world y minus root y in the `'ride'` pose, about 0.5). `P.face = horse yaw`, `P.h.pose = 'ride'`.
  - Sena: if `N.ride`, `N.seat` = the `Torso` bone world position + up − PELVIS_SIT, nudged −0.15 back along the heading, with pose `'sit'` and `N.h.straddle = true`.
  - settle uses `e.seat` (WP1).
  - When unmounted, clear `seat`, `straddle` and pose.
- Camera:
  - tpp dist ×1.45, look y +2.6 while riding. The wheel clamp goes up to 12.
  - fpp eye = seat + 0.75.
- Wolves:
  - No bite if `P.ride && P.speed > 6`.
  - A tame horse with a wolf within 2.4 behind it plays `Attack_Kick` and calls `hurt(wolf, 3)` (cooldown 2 s).
  - An unmounted tame horse near a wolf flees toward its home.

### 4.4 Whistle, bond, stable
- `KeyX` (add it to the GAME_KEYS regex; check X is not already bound, else use J), "Call {name}":
  - Range by bond level: 80 / 140 / 220 / Infinity.
  - It does not work if P or the horse is in a cave (`depthAt > 0.05`).
  - In range: `o.call = true`. The horse gallops to within 3 m of P using its own steering (`step()` with slope and water checks). If it is stuck for over 4 s, teleport it to the nearest dry point 25 m behind P out of view.
  - Out of range: toast "{name} is too far away to hear you."
- Bond: `S.horse.bond` 0..400, `lvl = 1 + Math.min(3, bond/100 | 0)`.
  - +1 per 25 m ridden, +10 for feeding grain or berries once per day ("Feed {name}" when dismounted near her), +5 for a night in the stable.
  - Toast on level up "{name} trusts you more (Bond 2)".
- Stable: if one exists, the unmounted horse's `home` is the stable. On `sleep()`, move her into the stable, refill her stamina and add +5 bond.
- `peak_ride`: in the 0.5 s tick, if `P.ride && N.ride` and P is within 10 m of the peak summit, run `bump('peak_ride')` once with the lines.

### 4.5 Save and load
- In `save()`: `if (S.horse) Object.assign(S.horse, {x, z, face, riding: !!P.ride, nRide: !!N.ride})` from the live horse object.
- In `start()`, after the structs: `if (S.horse) { o = spawn(S.horse.kind, x, z, {tame: true, horse: true, home}); if (riding) mount(o); }`. This runs after `P.pos.set`.
- `if (reached('herd') && !S.horse) spawnWildHerd()`.
- `die()` dismounts first.

### 4.6 HUD
- index.html `#bars`: `bar-horse` (Horse, hidden unless riding), `bar-calm` (Calm, hidden unless taming).
- `#help`: "E ride / dismount · W/Shift trot / gallop · Space jump · X call horse".

### G hooks
`G.horse()` returns the live horse object, plus `G.mount()`, `G.dismount()`, `G.tame()` (skips the minigame: sets `trust = 3` and calls the success path), and `G.ride(dx, dz, secs)` (holds virtual keys).

### Acceptance
- `G.setCh('herd'); G.tp(170, 40)`: within 1 s there are 4 horses (`animals.filter(a => a.horse).length === 4`). In a screenshot they are horse-shaped, horse-sized (back about 1.65 m) and play Idle or Eating.
- Sneaking with grain within 2.5 m gives the target label "Offer grain". Three offers give trust 3 and `cnt('horse_fed') === 3`.
- Taming: 12 tapE calls within 10 s give `S.horse.name` in `['Dawn', 'Mist']` and `P.ride` set. Doing nothing for 10 s throws you off, trust drops by 1, and hp drops by 5.
- Riding with the saddle and Shift for 3 s: `P.speed > 11` and the horse stamina falls. Without a saddle the speed stays ≤ 5.6.
- Riding into the river at z = 0 stops you (h < -0.9). Riding across the ford at z = 30 works. Riding into the Echo mouth is refused.
- In a screenshot Aro sits on the horse's back (pelvis within ±0.15 m of the seat) and Sena sits behind; both stay in place in the gallop without visible jitter. Compare the pelvis to the seat over 30 frames: the variance is less than 0.05.
- The spear cannot damage the horse. Saving while riding and reloading puts you back on the horse in the same place.
- `peak_ride` works. `G.goals()` for herd is all true and the chapter advances to `clay`.

---

## WP5: Map v2: parchment, fog of war, POIs, markers

**Files:** `src/main.js` (map section 748-851, 0.5 s tick, save), `index.html` (#map legend, #mapinfo journal, CSS).

### Tasks
1. **Fog of war**
   - `SEEN = new Uint8Array(512)`, a 64×64 bit grid of 10 m cells over SIZE 640.
   - `reveal(x, z, r)` sets the bits within the circle and marks the map dirty.
   - In the 0.5 s tick, reveal radius 45 (70 while riding).
   - The peak summit reveals 230 once. Stones reveal 80.
   - Save `S.seen = btoa(String.fromCharCode(...SEEN))`. Load decodes it.
   - Old saves (no `seen`): reveal 130 around the origin and 40 around each structure.
2. **Parchment base** (`mapBase` prerender):
   - Paper colours (#e9dcbc to #c9b88f) multiplied by the old height colours at 55% (see the sketch below).
   - Contour lines: draw a pixel darker where `floor(h/6)` differs from its right or down neighbour.
   - Water #6f9fb0, forest dots olive.
   - Biome tints from `biome()`: meadow #c9d27a, high #9d958a, pine #6f7f4e.
   - Hill shading by slope. Draw it once at load.
3. **Fog overlay** (drawMap and drawMini):
   - A 64×64 offscreen canvas: unseen cells get parchment #d8c8a4 at alpha 0.94, seen cells are transparent.
   - Draw it scaled up with `imageSmoothingEnabled = true` for soft edges, plus a faint ink cross-hatch pattern on unseen areas.
4. **POIs**:
   - In the 0.5 s tick, for each `POIS` entry not in `S.found` and within `r`: set `S.found[id] = 1`, `banner('Discovered', name)`, `bump('found_' + id)`, give +1 bond if riding, and play a small chime.
   - The Hot Spring, Great Tree and others also have their own E acts (WP3).
5. **Icons**: `ICON` adds `cave ['#4a4550','Cave'], ford ['#6fb0c8','Ford'], lake ['#4f8fb0','Lake'], peak ['#7a6a5a','Peak'], tree ['#c07a30','Great Tree'], stones ['#8a8a8a','Stones'], ruins ['#a05a3a','Ruins'], spring ['#8fd0d0','Hot Spring'], meadow ['#b0c060','Meadow'], horse ['#c08850','Horse']`.
   - Draw small hand-made glyphs for the POIs (triangle peak, arch cave, three dots for stones, tree circle, wavy lines for the ford) instead of squares.
   - Only discovered POIs are drawn. Rumours (`S.rumour`) show as a "?" glyph.
6. **Labels**: drawMap shows region names in a serif italic font (`label()`) for the discovered POIs and for "Home" at the house or hut.
7. **Markers**:
   - player arrow (existing)
   - Sena: pink dot
   - horse: tan horseshoe glyph, when tamed
   - quest target: a gold diamond from `CH[S.ch].where?.()`, which pulses. On the minimap it uses edge-clamp when out of range.
   - pins (existing)
8. **Journal**: `#mapinfo` adds "Discoveries n/11" and the list of discovered names, plus "Homeliness n" and "Closeness n".
9. **Legend** (index.html ~147): add Cave, Landmark, Ford, Horse, Quest and Sena.

```text
paper(h): base = mix(#e9dcbc, heightColour(h), .45); water -> #6f9fb0; contour pixels -> base * .78
```

### G hooks
`G.reveal(x, z, r)`, `G.seenFrac()` (share of bits set), `G.found()`.

### Acceptance
- New game: `G.seenFrac() < 0.1`. After `G.tp(-185, 70)` (peak summit) and 1 s: `S.found.peak` is set, a banner shows, and `G.seenFrac()` increases by more than 0.15.
- Opening the map (M) after visiting the meadow and Echo: the screenshot shows a parchment map, fogged edges, the Echo and Meadow glyphs with labels, the player, the Sena dot and the quest diamond.
- Save and reload: `S.seen` is under 1 KB and the fog stays the same. An old save shows the valley revealed.
- No crash for any structure kind or POI. The minimap still rotates correctly.

---

## WP6: Family arc, epilogue, polish and full playthrough

**Files:** `src/main.js` (sleep, kids, updateKids, epilogue/spawnVillagers, help text), `index.html` (help/title), `README.md`.

### Tasks
1. **maybeBirth()**, called from `sleep()` mid when together at home:
   - If `CH[S.ch].id === 'newlife'` and the first 4 goals are true and `!cnt('born')`: replace the fade text with **"Spring came, and with it a daughter. They named her Lio."**
   - Hold the fade 4 s, `S.time = 9`, `S.day += 20`.
   - `S.kids.push({name: 'Lio', female: true, born: S.day})`, `bump('born')`, `spawnKid()`, `addClose(10)`.
   - Lines: `['Sena','Look at her hands, Aro. Like the little ones on the cave wall.']`, `['Aro','Then she will leave her mark too.']`
   - Before that, in chapter newlife, Sena's idle at night near home uses `'sitTalk'` by the hearth if it exists. Nothing else is shown.
2. **Child**:
   - `spawnKid(k)`: `makeHuman({female: true, hairColor: 0x4a382c, scale: 0.5 + 0.1 * clamp((S.day - k.born)/30, 0, 1)})`. Use the villager look options (see villager `look` ~722).
   - `updateKids(dt)`: she follows N at an offset (-1.2, -1.2) with walkTo at speed ≤ 4.5. Near home in the evening she plays `'dance'` or `'talk'` for a few seconds.
   - She is excluded from wolves (wolves never target her). She sleeps with them (pose lie at the cradle if `S.home.cradle`, else a third bed point).
   - Load: spawn every `S.kids` entry.
3. **Epilogue**:
   - The village chapter onEnter keeps the existing epilogue, guarded.
   - Add: Lio (scaled to 0.62 after the time skip) is placed on the tame horse with pose `'sit'` + straddle at a walk loop near the house.
   - 2 villager donkeys (`donkey`) join the tame cows.
   - Final camera shot (camShot) at the Great Tree if it was discovered, else at the house, for 5 s before the card.
4. **Free play after the epilogue**:
   - When `CH[S.ch].epilogue`, drawQuest shows side goals instead of "The story is told":
     - Discoveries n/11
     - Bond n/4
     - Homeliness n/12
     - Closeness n/100
   - All systems stay active.
5. **Help and README**:
   - Help gets the new keys (E sit / ride / build hold, X call horse, Shift gallop).
   - README: a chapter list, the controls, and the new features with the CC0 credits.
6. **Balance pass**: check by reading that Closeness 60 can be reached by the newlife chapter:
   - built together ×5: +25
   - upgrades ×4: +12
   - rests: +2 or +4 each
   - handprint: +5
   - naming: +3
   - meals and sits: +3 each per day

   If it cannot be reached, lower the goal to 50.
7. **Scripted playthrough** in headless Chrome using G (fake the save API with request interception, as before; never touch the real save). For each chapter: `G.setCh(id)`, satisfy the goals using G helpers and real act calls, and check that the chapter advances to the next id. Screenshot the key scenes:
   - fire sit
   - hut build with Sena working
   - cave with torches
   - riding two-up
   - rest in the house bed
   - the map
   - Lio following Sena

### Acceptance
- At `G.setCh('newlife')`, with Closeness 60 and the cradle and nursery done, 3 `G.sleep()` calls at home give `cnt('born') === 1`. `S.kids.length === 1` and a child human follows Sena. The child survives a reload.
- At `G.setCh('village')`: one epilogue run; houses +4 once; reloading does not duplicate them. Lio is on the horse.
- The full playthrough script passes every chapter transition from awaken to village with no console errors. `npm run build` passes.
- Text check: grep the CH lines and toasts; no content beyond holding hands, sitting together, resting side by side and fade cards.

---

## 4. Order and conflict notes
- WP1 changes the shared main.js scaffolding: state, CH, settle, G. Every later WP adds code in **its own section** of main.js:
  - WP2: building and interaction, sleep, updateSena work branch
  - WP3: NODE, cave hooks in frame and camera
  - WP4: animals, updatePlayer ride branch, updateRider, input
  - WP5: map section
  - WP6: kids and epilogue
- The places more than one WP touches are `findTarget`, `updateCamera` and `save()`. Each WP adds **one clearly commented block** (`// WP4 horse`), so the edits stack.
- Frame order after WP4: updatePlayer → torch → updateSena → villagers/kids → spear → stats → subs → events → map tick (fog/POIs) → chapter check → animals → **updateRider** → updateWorldThings (sites, rack, lights) → `world.env.cave` → updateCamera (camShot, cave clamp, ride offsets) → setTime → render.
- Lights: total new startup lights = home hearth 1 + cave sconces 2 + Sena torch 1. All are created at startup with intensity 0.
- Keep `S` small: no per-frame arrays. `seen` is about 700 chars of base64.
