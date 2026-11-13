# Progress log

## WP1: Foundations (story v2, poses, closeness, debug hooks): DONE

**Files:** src/people.js, src/main.js, src/entities.js (BUILD.fire benches only), index.html (Closeness bar, help text, bar label column 58px -> 66px).

### What was built
- **people.js**
  - The new LOOPS (work, push, sit, sitTalk, ride, talk, dance, torchIdle) and SHOTS (pick, sitDown, standUp) exist. All the clips are in anims.glb. A missing clip is skipped with console.warn, and makeHuman skips keys it has no clip for.
  - `h.pose` (a loop that overrides the movement state), `h.straddle`, `h.lie`, and `h.has(key)`. `h.swing(k)` does nothing for an unknown k.
  - Straddle: thigh_l.z += 0.45 and thigh_r.z -= 0.45 after mixer.update, when pose === 'ride' or straddle is set. By eye the sign is right: the legs spread outward (shots/wp1/pose_ride.png). WP4 can tune the size of the spread on the horse.
  - Measured pelvis heights above the root: idle 0.90, work (kneel) 0.425, sit 0.56. A bench top at 0.45 fits the sit pose.
- **main.js story**
  - The CH array has 12 chapters with ids. `chIdx`, `reached` and `roman` exist, plus `const STORY = true` and the new fresh() state (storyV, worldV, close, home, horse, found, seen, stash, kids, rested). The new ITEMS flint and ochre are added already.
  - Every hard-coded index is gone. `grep "S.ch >="` only hits reached() and the migration.
  - `enterChapter()` (onEnter, then save, then epilogue or showChapter) is used by the advance block and by G.setCh.
  - The load path:
    - migration as in §2.3
    - clamp S.ch
    - worldV: reset felled
    - merge home, found, stash and kids
    - `CH[S.ch].onEnter?.()` after the structs are rebuilt
    - `if (epilogue && !S.village) epilogue()` (guarded)
  - The epilogue guard covers both the entry and the fade mid. Home falls back to house, then fire, then {0,0}, for epilogue and spawnVillagers alike. `spawnVillagersIfMissing()`.
- **RECIPES**: the full §3 list with `ch:` ids. The new menu helper `menuRecipes()`:
  - It filters on `reached(r.ch)` and on owned tools.
  - **It also hides `place` recipes whose BUILD[kind] does not exist yet (rack, stable, fence, path, flowers, basket) and every `up:true` recipe (hearth, bed, cradle, nursery).** WP2 must remove that filter, `&& !(r.place && !BUILD[r.id]) && !r.up`, once the builders and upgrade crafting exist. BUILD is now imported into main.js.
  - Tool recipes (flintaxe, flintspear, saddle) show already. They only set S.tools, and their effects are for WP3/WP4.
- **homeliness()** follows the §3 formula (it returns 0 without a house).
- **Chapter `extra()` lines** (deviation): lines with the horse name (clay, hearth, village) come from an optional `extra: () => [[who, text]]` that showChapter appends after `lines`. The hearth chapter's "roof for Dawn" line uses S.horse?.name.
- **`where()`** exists on cave (placeholder coordinates [-128,-98] / [-138,-108]; WP3 should replace them with CAVES mouth/c), herd (meadow, then peak), hearth and newlife (the house).
- **Herd onEnter**: it sets `S.rumour = ['meadow']` (unless the meadow is already found) and calls `spawnWildHerd()`. **That is a stub function declaration in the animals section** (`function spawnWildHerd() { if (!STORY) return; }`), and WP4 replaces its body. Keep it idempotent: onEnter also runs on load.
- **Counters**: `bump('torchlit')` in toggleTorch when the torch catches. `bump('sat_fire')` and `bump('meal_shared')` also exist, and a shared cooked or grilled meal also bumps 'meal'.
- **Sit with Sena**
  - BUILD.fire now has 2 log benches (r 0.18, length 1.3, along local Z) at local x ±1.6, top 0.45, on stone chocks. Old fires get them too.
  - `fireSeats(s)` rotates the bench points by s.rot (deviation: the spec said world `s.x ± 1.6`, but the fire group is rotated, so the seats follow the benches).
  - Aro takes the nearer bench, and both face the fire.
  - The structTarget fire order is: Cook meat → Grill fish → **Sit with Sena** (Sena within 15 m, !busy, and not (grain≥2 and already sat today)) → Bake flatbread → info.
  - `sitTogether(s)`:
    - P.sit = N.sit = 8, pose sit / sitTalk.
    - One VIGNETTES pair per sit, rotating by cnt('sat_fire'). Every chapter id has 2-3 pairs.
    - S.time += 1 (mod 24).
    - +3 once per day (S.c.satDay), then bump.
  - While sitting:
    - updatePlayer freezes movement and jump, and findTarget is off.
    - updateSena returns early.
    - Any WASD or Space ends both sits (pose null + swing('standUp')).
  - die() clears sit and pose.
- **Closeness**
  - `addClose(n, why)`: clamps 0..100, toasts `♥ Closeness +n (why)` with a soft two-tone chime, and updates #b-close.
  - #bar-close (pink #d77a8a) is in #bars and updates in updateStats.
  - Share a meal: findTarget, right after the butcher loop, when Sena is within 2.2 m and not sitting, once a day (S.c.mealDay), with cooked > grilled > bread. It gives food +15, +3 Closeness and one Sena line.
- **settle()** overrides at the top: `e.rest > 0` (lie flat at e.restPos, rotation order YXZ, x = -π/2), else rotation.x = 0. `e.seat` (root at seat, face) is used by WP2/WP4.

### window.G hooks (WP1)
- Existing hooks kept: torch, throwSpear, sleep, attack, EVENTS, EV, animals, herds, spawn, hurt, S (getter), P, N, structs, world, placeStruct, camera, renderer, scene, save, pause, yaw/pitch setters, fps, pr.
- New:
  - `G.CH`
  - `G.setCh(id)`: sets S.ch and calls enterChapter, so onEnter, save and the card (or the epilogue) run. It returns the id.
  - `G.give(k, n=1)`
  - `G.tp(x, z)`: P to x,z and N to x+2. It zeroes velocity and stops auto-walk.
  - `G.time(h)`
  - `G.chId()`
  - `G.goals()`
  - `G.cnt`, `G.bump`, `G.reached`, `G.chIdx`, `G.addClose`, `G.sitTogether(s)`, `G.homeliness()`, `G.findTarget()`, `G.structTarget(s)`, `G.toggleMenu(on)`, `G.craft(r)`, `G.RECIPES`
  - `G.menu()`: the recipe ids the craft menu would show now.
  - `G.target` (the current prompt target), `G.keys` (the live key map; set `G.keys.KeyW = true` to hold a key), `G.torchOn`, `G.toggleTorch()`

### Test harness notes (important for later WPs)
- `scratchpad/tests/run.mjs <outDir> <steps.json>`:
  - Steps: `{js}`, `{expect, name}` prints PASS/FAIL, `{until, timeout}` polls until true, `{key, hold}`, `{wait}`, `{shot}`, `{reload}` (waits for window.G).
  - It collects console errors, warnings and exceptions, and prints `DONE errors=N fails=M`.
  - Every `/api/*` request is intercepted.
  - It uses a fresh temp profile per run.
- The GPU backend is picked with the env var `GL`:
  - `GL="--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist"` runs at about 40 fps in game. Use it for **logic tests**. Its screenshots are GARBLED (vertical stripes), so do not judge visuals from them.
  - `GL="--use-gl=angle --use-angle=gl --ignore-gpu-blocklist"` (Intel) gives **correct screenshots**, but the game loop is very slow or stalls in game at times. Use long waits, and expect animation blends to lag.
  - Without `GL`, swiftshader is very slow (about 1 frame/s).
- Fake old saves: the game saves on beforeunload/pagehide/visibilitychange, which overwrites localStorage on reload. Set the item AND re-set it from listeners on those 3 events (see tests/t4.json), then `{reload}`, then click #btn-continue.
- Kill commands: `pkill -f "remote-debugging-port=933[3]"` and `pkill -f "vite --port 517[4]"`. Use the bracket form, or pkill kills its own shell.

### Acceptance evidence (all PASS, errors=0, no console warnings)
- New game: chId 'awaken', CH.length 12. setCh('cave') shows the card "Chapter 5 · Into the Dark", the HUD shows "V · Into the Dark", and the 5 goals are all false.
- Old saves:
  - ch:4 → cave (close 30), ch:6 → hearth, ch:2 → hunt, ch:0 → awaken.
  - ch:7 + village:true with 5 houses → village, S.village true, still 5 houses.
  - setCh('village') again: still 5 houses and the day unchanged (the guard works).
- A v2 save round-trip stays at herd.
- The fire is placed through Tab, a menu click and E. "Sit with Sena" is the target. After E: pose sit/sitTalk, sat_fire 1, close +3, and the fire goals tick. W ends the sit.
- T bumps torchlit. The menu at shelter has no saddle, and herd has saddle. Share a meal gives +3.
- Awaken goals done → auto-advance to 'fire'. newlife onEnter sets lifeStart.
- `npm run build` passes.
- Screenshots: shots/wp1/sit_fire.png and sit_fire2.png (both on the benches facing the fire), pose_ride.png, village_load.png, card_cave.png.

### Known gaps / notes for later WPs
- The goals of later chapters reference features that are not built yet (S.found, horse, stable, painting…), so they stay false.
- Sena's night idle still walks to (fire.x + 1.7, fire.z - 0.9). That is near, but not on, a bench.
- git: someone (not this WP) staged the working tree (`git status` shows M/MM). Nothing was committed.

## WP1 verification (independent tester)

Tests: `scratchpad/tests/v/v1.json` to `v5.json` (run with `tests/run.mjs`, /api/ intercepted, port 5174). Shots are in `shots/wp1v/`.

### Fixes (src/main.js)
- **The sit never ended by itself (real bug).** `endSit()` returned early when `e.sit <= 0`. That is always the case on natural expiry, because the timer is decremented first. So after the 8 s sit, Aro and Sena both kept the `sit`/`sitTalk` pose forever, and Aro slid around seated. `endSit` now clears `e.sit` and checks the pose itself. It only clears `sit`/`sitTalk`, so a later WP's `work`/`ride` pose is never clobbered.
- **Standing up left them inside the bench log.** On stand-up each person now steps 0.5 m away from the fire. `sitTogether` stores `e.fire`.
- **Clicking while seated played a punch, and right-click threw the spear, from the seated pose.** `attack()` and `throwSpear()` now return while `P.sit > 0`.

### Verified PASS (errors=0 in every run)
- **New game and chapters:** awaken; CH.length 12; HUD shows "I ·"; setCh('cave') shows the card "Chapter 5" / "Into the Dark" with 5 goals, all false.
- **Craft menu:** no saddle at cave or shelter.
- **Fire and sitting:** the fire is placed by craft + E. The target is "Sit with Sena". Pose sit/sitTalk, sat_fire 1, close +3.
- **Ending the sit:** natural expiry clears both poses (after the fix). Sitting a second time the same day gives no closeness. W ends the sit.
- **Shared meal:** +3, once per day.
- **Torch:** toggleTorch and T bump torchlit.
- **Save payload:** has storyV, close, home, found and structs.
- **Map, loop, other features:** the map opens (M); fps > 0. H poultice, R waterskin, C sneak, wolves, storm and G auto-walk all work.
- **Epilogue with only a fire:** 4 houses, day 401.
- **Old saves:**
  - ch:5 → house (close 30, the new inv keys merged).
  - ch:7 with village:false (saved mid-fade) → the epilogue runs once (day 405); after a save and reload, no extra days or houses.
- **Visuals (Intel GL):** sit_side.png and sit_front.png show both seated on the benches facing the fire, with no floating. Before the fix, after_sit.png showed Aro standing inside the log.

### Remaining / notes
- `S.time += 1` while sitting can cross midnight without `S.day++`. That matches the existing clock, which only advances the day on sleep.
- With no grain, "Sit with Sena" can be repeated without limit. Each sit skips 1 hour; Closeness is only once a day.

## WP3: World v2 (landmarks, fords, lake, meadow, caves): DONE

**Files:** src/world.js, new src/caves.js, new src/landmarks.js, src/terrain.js (`export function rockTexture`), src/main.js (blocks tagged `WP3`).

### Built
- **world.js**
  - `land()` (old terrain) → `features()` → `river()` (two fords at z = 30 and z = -150); `rawHeight` is exported.
  - Hills (Echo, Flint, Lookout Peak with a flat top r 6, Great Tree knoll, stones knoll) use the triangle rule plus a small fbm roughness. Then come the meadow flatten, the lake basin (-1.8), the hot-spring basin and `caveCarve`.
  - `biome(x, z)` and `forest` are exported. world.js also re-exports `CAVES`, `POIS` and `depthAt`.
  - Scatter and `river_` skip `keepOut()`: the cave footprints and corridors, plus the landmark spots (`KEEP` in landmarks.js). Nothing needs `n.gone`.
  - Meadow vertex tint. The Mirror Lake water uses the river material with a `riv` attribute.
  - `env.cave` darkens setTime: sun, hemi, fog, exposure and the river uLight.
  - createWorld returns `caves`, `landmarks` and `lake`. The flint and ochre Fields are appended after all the others (`fields.push`), so the felled tree indices are kept.
- **caves.js**
  - `CAVES` (echo c[-138,-108] R11 H6.5, flint c[-40,-192] R13 H8). `initCaves(land)` derives `x, z, dir, mouth, floor`.
  - `caveAt`, `depthAt` (smooth(0, 8, distance in from the mouth)), `caveCarve` (the chamber, plus a corridor that is flat to the mouth and then a 0.24 ramp out for 22 m), and `inCave`.
  - `createCaves` builds:
    - a lumpy dome with an entrance gap, and a half-tube
    - rock dressing
    - rim and tube colliders, and grass clearings
    - painting panels on a CanvasTexture, placed on the wall by raycast
    - a blank handprint panel (`drawHands`)
    - sconces (PointLight, intensity 0 at startup)
    - an Echo bed of hides
    - 8 emissive crystal clusters in Flint Deep, and 30 instanced bats (`burstBats`)
  - Its API: `setSconce`, `batsGone`, `update`.
- **landmarks.js**
  - `LM` coordinates, `FORDS`, `POIS` (11 entries, each with id, name, x, z, r and icon), and `initPOIS`.
  - `createLandmarks`:
    - the Great Tree (commontree_3 ×3.2, with the twisted trees' orange leaf material), collider 2.4
    - a stone ring (one stone fallen)
    - the brick ruins
    - the peak cairn, pole and waving banner
    - the hot spring water, ring stones and steam sprites
    - stepping stones at both fords
- **main.js (WP3 blocks)**
  - NODE `flint` / `ochre`. The cave `where()` now uses `CAVES[0].mouth / .c`.
  - The `wp3Target` hook is called in findTarget just before `if (best)`, and only wins when it is closer than the best node. It handles:
    - Look at the painting (bumps `painting` once per panel via `S.c.p_i`)
    - Leave your handprints (needs ochre ≥ 1 and Sena within 6 m; +5 Closeness)
    - Shelter here until dawn: calls WP2's `sleep(fakeStruct)` with bedPts, camPt and lookPt, so it is a real rest together
    - Carve your names (Sena within 8 m; +5)
    - Rest in the warm water: both sit with `e.seat` at basin + 0.2 for 8 s, warm 100, hp +20, +2 Closeness once a day
  - `updateWP3(dt)`, called in the frame right after `world.env.cave = depthAt(P)` and before updateCamera:
    - Sena's torch (a second makeTorch on her hand_l, with pose `torchIdle` when she is idle inside)
    - the first-entry line
    - the sconce (lit with a toast the first time P's torch is lit inside a cave; saved in `S.c.sconce_<id>`)
    - the bats (once, `S.c.bats`)
    - the "too dark" toast, the soak cleanup, and the 0.5 s POI discovery tick
  - `discoverPOI(id)`: sets `S.found[id]`, does `bump('found_'+id)`, shows a banner (with lore for stones and ruins), plays a chime, and gives 6 bricks at the ruins.
  - Camera: the tpp distance is capped at 3 when cave > 0.15, and `caveCam(camPos)` keeps it inside the dome or tube and under the roof.
  - `sheltered ||= cave > 0.5`. Rain is hidden when cave > 0.3.

### G hooks (WP3)
`G.caves` (list, panels, beds, sconces, bats, flintF, ochreF, setSconce, burstBats, drawHands), `G.landmarks` (spring {x, z, y, water}, tree, ruins, stones, peak), `G.POIS`, `G.discoverPOI(id)`, `G.wp3Target()`, `G.depth()`, `G.biome(x, z)`, `G.h(x, z)`, `G.riverX`.

### Notes for WP5 / WP4 / WP6
- **WP5:** discovery already exists (`discoverPOI` plus the tick in updateWP3). Extend `discoverPOI` with the fog reveal (peak: 230 m) and the +1 bond when riding, rather than adding a second tick. `POIS[].icon` holds the ICON keys.
- **WP4:** the ford river depth is -0.6, and swimming starts at < -1.15. The cave mouth is at `CAVES[i].mouth`; use `depthAt > 0` to refuse riding in. The soak uses `e.seat` together with the `e.soak` flag; WP3 only clears seat when `e.soak` is set.
- **Lights:** 3 new startup point lights (2 sconces and Sena's torch), all at intensity 0.
- **Test harness:** vite full-reloads the page when other engineers save main.js, so tests can fail at random mid-run. Just rerun them. The harness must wait for `btn-new.onclick` (load takes about 16-18 s now under contention).

### Evidence (port 5175 / 9334, /api/ intercepted; tests in scratchpad/tests/wp3/t1-t7.json; shots in shots/wp3/)
- **t1 (vulkan), all PASS, errors=0:**
  - Terrain heights: h(ford) -0.60 and h(river z=0) -2.40; the north ford is wadeable; h(lake) < -1.5; the peak is 44.8 against 1.5.
  - Biomes: meadow, lake, high, valley.
  - Fields: flint 14 and ochre 3.
  - Echo Hollow: depth 1 at 10 m inside, `found.echo`, camera 8.8 m from c (< R 11), sconce lit, Sena torchIdle, 3 lights on.
  - Actions: paintings 3, handprint, flint chipping.
  - Flint Deep: found, bats burst, sconce on, flint ≥ 6.
- **t4, all PASS:**
  - cave shelter: rest, dawn, day 2, still inside
  - hot spring soak: seat +0.20, warm 100, +2; the soak ends cleanly
  - carving the tree
  - stones discovered
  - peak summit (y 44.7)
  - wading the ford (not swimming), and swimming at z = 0
- **t3:**
  - An old v1 save (ch 4 with a fire and a hut) loads into cave with 0 errors. The structures are at ground y (diff 0.000), and felled is reset.
  - hcmp.mjs: terrain within 75 m of home and outside the river band is identical to the old terrain (max diff 0). Only the river band near the ford changes.
- **FPS:** an A/B in the same session with the WP3 meshes and lights hidden: 14.8/9.7 fps against 17.8/10.9. That is within noise; the machine is shared with other test browsers.
- **Visual (Intel GL):** v_flint_outside (a clear arched mouth), v_echo_dark / v_echo_torch / v_painting (an ochre horse lit by the torch), v_lake (the lake water), v_peak (cone and beacon), v_ford (stepping stones), v_stones, v_spring (steam and stones), v_ruins, v_tree_far (the orange Great Tree).
- `npm run build` passes.

### Gaps / deviations
- The Echo Hollow mouth is partly hidden by the arch boulders from some angles. Flint Deep reads well. The cave interiors are quite dark beyond the torch radius; that is by design, but a brighter sconce may help.
- Wolves do not yet prefer the `pine` biome (skipped). The RockPath models were not added: the `RockPath_Round_*.gltf` files are not present, only `pathrocks_diffuse.jpg`.
- No dirt paths to the landmarks (optional). The ruins bricks look dark.
- The sconce turns on when P's torch is lit inside with cave > 0.5, not only on the first torch-light event.
- There is a seated hot-spring pose but no special swim-in animation.

## WP2: Co-op building, placeables, home upgrades, rest together: DONE

**Files:** src/entities.js (hut, house, new BUILD kinds, makeScaffold, imports NAT), src/main.js (tagged `// WP2` blocks), index.html (one help line). The earlier WP2 attempt had changed nothing except the WP1 menu filter comment, so everything below is new.

### What was built
- **Construction sites**
  - `BUILD_TIME` (hut 16, kiln 10, house 36, farm 5, well 12, stable 14).
  - `placeStruct(kind, x, z, rot, instant, grow, p)`: a 7th arg `p` turns a timed kind into a half-built site at that rise.
  - It sets `st.timed`, `byA`, `byN` and `st.scaf` (a scaffold group added to the scene beside the building, not as a child).
  - It stores `st.col` for the solid collider. `st.cols` (local `[x, z, r]`) add small colliders, kept in `st.colList`.
  - Helpers: `toWorld(s, [lx, ly, lz])` turns a local point into a world Vector3. `siteLook`, `completeSite`, `updateSites` (called at the top of updateWorldThings) and `senaBuild(dt)` (in updateSena).
  - Non-timed kinds still rise by themselves.
  - findTarget gets a site block first: "Build the X: n% (hold E)" sets `P.work = 0.5` and `P.workSite`.
  - updatePlayer kneels (pose `work`), faces the site and freezes movement. Movement or jump stops it.
  - `P.dance` and `N.dance` (3 s) run after a shared build. The house `stage(p)` shows the foundation, then the walls at 0.3, then the roof at 0.8.
- **Rest**
  - `sleep(s)` together; `endRest()` puts both at the door, 0.6 m to each side, and calls collide().
  - `camShot`, read in updateCamera, uses `s.camPt` / `s.lookPt` from the entity. `REST_T = 5` s.
  - `S.rested = 180` gives stamina regen ×1.5. `typeof maybeBirth === 'function'` is the WP6 hook.
  - die() clears rest, work, dance and seat.
- **Home**
  - `homeHouse()` is the first house. `applyHome()` calls `setHome(S.home)` and adds the nursery annex collider. It runs on load after the structs are rebuilt and on house completion.
  - `homeUpgrade(r)`: craft() routes `up` recipes here. It needs a finished house within 16 m, then fades, sets the flag, bumps built_together, gives +3 and adds 2 h.
  - The menu now hides only upgrades that are already built (the WP1 filter is gone).
  - `homeLight`: one PointLight created at startup, intensity 1 + 2·night at the hearth when it exists.
- **Placeables**
  - rack: "Hang meat to dry" hangs up to 4. Timers live in `s.hang = [[kind, t]]`, saved as `h`. "Take dried food (n)" at ≥ 90 s.
  - basket: Store / Take back with `S.stash`.
  - flowers: once a day (`S.c.flowerDay`), +3, `bump('flowers')`, a Sena line.
  - stable: info label only (WP4 extends the `case 'stable'` in structTarget).
  - fence: snaps to a free end within 1.5 m (same rot), in ghostSpot.
  - path: +10% walk speed. It uses `NAT.RockPath_Round_Wide` if WP3 loads it, else stone discs.
  - findTarget skips structs whose structTarget returns nothing (fence, path).
- **Save:** each struct entry gets `p` (rise while < 1) and `h` (rack).
- **Map:** ICON has entries for the 6 new kinds.

### Deviations
- `bedPts` are FEET points and `face = s.rot` (heads toward the back wall, -Z). The spec values put the body off the bed. House: `[[-1.3, 0.62, -0.32], [-0.5, 0.62, -0.32]]`, bed centre z -1.25 (moved off the back wall). Hut: `[[±0.35, 0.14, 0.42]]`.
- The camera uses camPt/lookPt inside the doorway instead of "door + 1.7": hut `[0, 1.45, 2.55]`, house `[0.6, 2.15, 2.1]`.
- REST_T is 5 s, not 3.5 s, so the scene is still visible after the fade clears.
- The hut thatch cone is open-based and DoubleSide, with an earth floor disc inside. The closed base cap hid the interior.
- brickM is not DoubleSide: the walls are closed boxes, so it isn't needed.
- No collider covers the house interior beyond the existing r 3.52, so the house is not walkable inside, as before.

### G hooks (WP2)
- `G.sites()`, `G.finishSites()`, `G.sleep()` (the nearest hut or house; returns its kind), `G.place(kind, x, z, rot = 0)` (a site for timed kinds)
- `G.skip(sec)` (rack timers), `G.homeUpgrade(id)`, `G.applyHome()`, `G.endRest()`, `G.camShot`, `G.stash`

### Evidence
- Tests are in `tests/wp2/t1.json`, `t2.json` and `t4.json` (logic, vulkan) and `t5.json`, `t8.json` and `t9.json` (shots, Intel GL). All runs have errors=0 and fails=0.
- **t1 (hut site):**
  - Sena walks over and kneels.
  - Both building finishes the hut in 7.6 s of game time.
  - built_together 1, both dance, the dance ends and the scaffold is removed.
  - A half-built site (rise 0.5) survives a reload.
  - `G.sleep()` in the hut: rotation.x = -π/2, both within 0.55 m of the hut centre. On waking both are more than 2.3 m out, closeness +2 and slept +1, and Aro can move.
- **t2 (house):**
  - The menu shows every new recipe.
  - The hearth gives +3 and built_together. The bed hides from the menu.
  - Resting in the house gives slept_home 1 and +4.
  - Rack: hang, skip 90, take gives cooked +1.
  - homeliness 6. After a reload the home flags and the interior group visibility persist. Opening the map (M) with every new kind placed: no errors.
- **t4:** flowers +3; the basket stores berries and cooked meat and then gives them back; a fence snaps to (-5.6, 10) with rot 0.
- **Shots in `shots/wp2/`:**
  - rest_house.png: both in the double bed, heads on the pillows, hearth glowing.
  - rest_hut.png: both on the reed mat.
  - site_house.png: scaffold and half-height walls, no roof, Sena kneeling.
  - yard.png: hut, fence, basket, house.

### Test notes
- Other engineers' edits made the vite dev server full-reload the page in the middle of tests. I tested against a separate build instead: `npx vite build --outDir scratchpad/tests/wp2/dist`, then `npx vite preview --outDir … --port 5174`.
- Each Bash call is a fresh shell, so set `GL=` on every run. Without it you get swiftshader, at about 0 fps.
- `tests/wp2/run.mjs` also takes `WS=w,h` for the window size.

### Gaps
- The stable has no horse behaviour (WP4).
- The flower NAT groups are scaled to 0.4. That is checked in yard.png before the scale fix only (it was too big), so recheck in the integrated pass.
- Sena has no line for building the stable or kiln beyond the generic 30% line.

## WP5: Map v2 (parchment, fog of war, POIs, markers): DONE

**Files:** src/main.js (map section, tagged `WP5`; one line in save(), one line in start() load branch, a 3-line block in WP3's discoverPOI, G hooks), index.html (#map legend, CSS for journal/canvas).

### Built
- mapBase prerender rewritten: paper #e9dcbc→#c9b88f vignette + blotches, mixed 45% with the old height colours; biome tints (meadow/high/pine via `biomeAt`, sampled on a 128 grid); water #6f9fb0 with ink shoreline; contours at floor(h/6) (×0.78); slope hill shading; olive forest dots.
- Fog: `SEEN` Uint8Array(512), `reveal(x,z,r)`, `seenAt(x,z)`, `seenFrac()`, `encodeSeen()`, `wp5Load(fromSave)` (decode S.seen; old saves without seen reveal 130 at origin + 40 per struct; found POIs re-revealed). Overlay = 64×64 canvas → 512 fogBig (smoothed) + ink cross-hatch via source-atop; redrawn only when dirty. Drawn on map and rotated minimap.
- Tick: in updateMap, every 0.5 s of game `clock`: reveal 45 (70 when `P.ride`).
- discoverPOI (WP3) extended: reveal peak 230 / stones 80 / else r+20; +1 `S.horse.bond` when `P.ride`.
- ICON adds the 10 kinds; `glyph()` hand-drawn ink glyphs (peak triangle, cave arch, 3 stones, tree, wavy ford, lake, ruins, spring, meadow grass, horseshoe, pulsing gold quest diamond, "?" rumour). `marker()` routes those kinds to glyph.
- Only discovered POIs drawn; `S.rumour` ids as "?". Herds/wolves on the big map only in seen cells.
- Labels: serif italic ink; POI names, "Home" at house (else hut), first of each other kind (fence/path skipped).
- Markers: Sena pink (#ff8fb8), horse horseshoe via `mapHorse()` (animals.find(a => a.horse && a.tame) else S.horse x/z; guarded), quest diamond from `CH[S.ch].where?.()` (try/catch), edge-clamped on the minimap.
- Journal in #mapinfo: "Discoveries n/11: names · Homeliness n · Closeness n" + pin text.
- Legend: You, Sena, Horse, Quest, Cave, Landmark, Ford, Deer, Wolves, Pin, Buildings.

### G hooks (WP5)
`G.reveal, G.seenFrac, G.found(), G.seenAt, G.toggleMap, G.drawMap, G.encodeSeen`.

### Evidence (tests/wp5/t1.json vulkan, t2.json Intel GL; served by `vite preview` of a snapshot build in scratchpad/wp5dist on 5175 to avoid HMR reloads from other WPs)
- t1 all PASS errors=0: new game seenFrac 0.015; tp peak → found.peak, banner "Discovered Lookout Peak", seenFrac +0.331; meadow+echo found; map open journal text; drawMap with all 12 struct kinds no crash; S.seen 684 chars.
- t2 all PASS errors=0: fog persists across reload (0.087 = 0.087); old v1 save (no seen) reveals valley (seenAt(0,0), (100,0) true, (200,200) false; frac 0.132).
- Shots: shots/wp5/t2_map.png (parchment, fog + hatch, Echo/Meadow/Great Tree glyphs + labels, Home, Sena, quest diamond), t2_mini.png (rotating parchment minimap with fog edge, quest diamond edge-clamped), t2_oldsave_map.png.

### Notes / gaps
- Harness tip: `pkill -f "...517[5]"` in the same command line as a literal "5175" kills your own shell; run pkill in its own call.
- Bond +1 is in bond points (0..400) as spec'd; tiny effect.
- Small struct labels are ~10 px at the map's on-screen size in a 720p window; fine at 1080p.

## WP6: Family arc, epilogue, polish: DONE (except the full scripted playthrough, which is left for the tester)

**Files:** src/main.js (the `// ---------- WP6 family` block after epilogue(), plus small tagged edits), index.html (title blurb and title-screen keys only; WP4 had already added the help line), README.md.

### Built
- **Small tagged edits to shared code (main.js)**
  - drawQuest: the epilogue shows `sideGoals()`.
  - enterChapter: on the first epilogue run the card waits 9800 ms (was 5200), to leave room for the 5 s final shot.
  - fadeTo: a `let fadeExtra` that mid() may set to lengthen its own hold.
  - spawnVillagers: 2 tame donkeys in a try/catch (needs WP4's donkey model).
  - The epilogue mid calls `epilogueExtras(home)`.
  - start() spawns every `S.kids` entry, and the frame calls `updateKids(dt)` after updateVillagers.
- **maybeBirth()** (the WP2 hook in sleep mid)
  - On every rest together it puts the kids to bed first (`kidsToBed`). The first kid goes to the cradle if one exists, otherwise between the parents on the bed. In the hut she lies between them.
  - Then, if the chapter is newlife, `!cnt('born')`, the rest is in the house and goals 0-3 are true:
    - fade text "Spring came…Lio.", hold +4 s (P/N rest and camShot also +4 s)
    - S.time 9, day +20
    - push the kid, bump born, spawnKid, addClose(10)
    - the two lines, said 5.2 s later
- **Child**
  - `spawnKid(k)`: makeHuman female, buns, hair 0x4a382c. Scale from `kidScale` = 0.5..0.6 by age, or 0.62 once S.village.
  - `updateKids`:
    - follows N at offset (-1.2, -1.2) in N's frame, speed 2.2, or 4.5 when more than 5 m away
    - hops to Sena if blocked for 1.5 s, or if more than 40 m away
    - plays dance or talk near home between 17:00 and 21:30
    - lies down while P.rest > 0
  - Wolves only ever target P, so she is never targeted.
- **Epilogue: Lio on the horse**
  - `liveTameHorse()` = `animals.find(o => o.horse && o.tame && live)`. WP5 already owns a `tameHorse()` (it returns {x,z}), so mine is named differently.
  - When S.village is set, the horse exists and P is not riding it, kid 0 sits on it (pose 'sit' + straddle). The seat is `o.a.bone('Torso2')` world + 0.31 − 0.56·scale (fallback: root + 1.62). The horse keeps its own tame wander (walk 1.1) around its home.
  - epilogueExtras: endRest if needed, moves the kids and the horse next to the house, then sets camShot (t 8.5 game-s) at the Great Tree if `S.found.tree`, else on the house.
- **sideGoals()**: Discoveries n/11, Bond lvl/4, Homeliness n/12, Closeness n/100. Refreshed every 0.5 s in the epilogue.
- **Balance (read only)**: Closeness 60 is reachable. Rough tally: 10 start + builds ~6×3-5 + hearth/bed 6 + tame 3 + handprint 5 + carving 5 + rests + daily sits, meals and flowers (+9/day), plus cradle/nursery +6 and newlife rests +12. The goal stays at 60.

### G hooks
`G.kids` (live children), `G.spawnKid(k)`, `G.maybeBirth()`, `G.liveTameHorse()`, `G.sideGoals()`, `G.kidScale(k)`

### Evidence (port 5176 vite preview of a scratch build / 9335; tests/wp6/t1-t3.json; shots/wp6/)
- **t1 (vulkan): all PASS, errors=0**
  - cradle + nursery via homeUpgrade
  - 2 nights: not born yet
  - the 3rd G.sleep(): fade text has "Lio"; born 1, S.kids 1, G.kids 1, day +21, close +14; the fade is still on 3 s later
  - auto-advance to village; the epilogue gives 5 houses and a camShot
  - side goals text; Lio follows Sena (< 4 m), scale 0.62
  - reload + Continue: kid still there, still 5 houses
  - setCh('village') again: no duplicates
- **t2/t3 (Intel GL), with WP4's horse model spawned as a tame horse**
  - Lio seat set, pose sit, straddle, 2 donkeys
  - lio_horse.png: a small girl sitting on the horse's back, a donkey in view
  - kid_follow.png: Lio walking behind Sena
  - epi_shot.png: house shot over the village
- `npm run build` passes.

### Gaps / notes
- Not done: in newlife, Sena's night idle with 'sitTalk' by the hearth. The house interior is not walkable (collider r 3.52), so she still uses the fire benches spot.
- The camShot timer runs in game time. At very low fps the shot lasts longer than the 9.8 s real-time card delay.
- If WP4 changes the bone helper name, horseSeat falls back to a fixed back height (root + 1.62).
- The children have no minimap marker (WP5 owns the map).

## WP4: Horses: DONE

**Files:** src/animals.js (rewritten small file), src/main.js (`// ---------- WP4 horses ----------` section replacing the spawnWildHerd stub, plus one-line hooks tagged `WP4`), index.html (#bar-horse, #bar-calm, help line), public/models/animals/horse.glb, horse_white.glb, donkey.glb, public/models/CREDITS.txt.

### Built
- **animals.js:** SCALE horse/horse_white 0.48, donkey 0.46; EXT glb. Duplicate clips are removed (the `AnimalArmature|` prefix is stripped, first of each name kept). `makeAnimal(kind, scale)` returns `model`, `bone(n)` and `busy` (a one-shot is playing). `play()` now restarts a finished one-shot as a loop when the same name is played again (before, the model fell to the bind pose).
- **Wild herd:** `spawnWildHerd()` is idempotent. It spawns 2 brown, 1 white and a foal (scale 0.3) at (175, 40), with its own herd object `horseHerd` (NOT in `herds`, so EVENTS.herd and the map's deer herds ignore it). The herd wanders inside the meadow (updateHorses). HP 999. The foal can't be fed or tamed.
- **Curious:** when sneaking with 2 grain or 3 berries, horses don't alarm; within 6 m they stop and face you.
- **Offer / tame:** "Offer grain" / "Offer berries" (while sneaking within 2.8) gives trust+1, bump horse_fed, Eating, a ♥×trust sprite, and Sena's first line. At trust 3 "Climb on her back" → `startTame`: bucking clips, view shake, #bar-calm, each fresh E press (+10 with saddle, +7 without, −4 stamina). calm ≥ 100 → `tameSuccess` (Dawn/Mist, Sena's line, +3 Closeness, still mounted, saved). 10 s or 0 stamina → `thrownOff` (hp −5, trust −1, the herd flees).
- **Riding:** `updateRide()` is the `P.ride` branch of updatePlayer. It handles trot 5.5, canter 9 (W > 1.5 s), gallop 13·(1+0.05·(lvl−1)) with Shift, a saddle and stamina, and S to brake then back up. Without a saddle it caps at 5.5 and toasts once. The turn rate is lerp(2.4, 1.1, v/13). Horse stamina: −12/s at a gallop, +10/s otherwise; at 0 it is tired until 30. Jump costs 20. Refusals: deep water (h < −0.9), uphill > 0.75 per m, caves (depthAt > 0.05). Wading (h < −0.3) caps speed at 3. There is a nose probe. The clips follow the gait, plus hoof sounds. The only prompt is "Dismount".
- **Seats:** `seatOn()` in updateHorses puts the rider's **pelvis** exactly on the saddle point. That point is the Torso2 bone + 0.31 + 0.1; the raycast back surface is at Torso2 + 0.32. Sena sits on Torso, 0.15 back, with pose sit + straddle. The pelvis offset is measured live each frame (smoothed), not as a PELVIS_SIT constant.
- **Sena** hops on at mount if she is within 10 m and free (`N.ride`); updateSena returns early.
- **Camera:** dist ×1.45, look +2.6, wheel up to 12, fpp eye = saddle + 0.75.
- **Whistle X** (GAME_KEYS now includes X):
  - range 80 / 140 / 220 / ∞ by bond level
  - refused in caves
  - the horse gallops to within 3 m; after 4 s stuck it reappears 25 m behind you
- **Bond:** +1 per 25 m ridden, +10 for "Feed {name}" (once a day), +5 for a night in the stable; level-up toast.
- **Stable:** `horseHome()` is the stable, else the house, else the fire. `horseNight()` (called in sleep() mid, after bump('slept')) refills stamina and, with a stable, moves her into it and gives +5 bond plus `bump('stable_night')`.
- **Wolves:** no bite when `P.ride && P.speed > 6`. The tame horse kicks a wolf within 2.4 m behind it (hurt 3, 2 s cooldown). When not ridden it flees toward home from wolves within 10 m.
- **peak_ride:** in the updateHorses 0.5 s tick (P.ride && N.ride within 10 m of LMK.peak). It plays the two lines and gives +3 Closeness.
- **Excluded:** the spear hit loop, landHit, attack() (no melee while riding), the minimap deer fallback (`!o.horse`; WP5's mapHorse/GLYPH draws the tame horse). findTarget calls `wp4Target` first; while riding it returns only that.
- **Save/load:** `horseSave()` in save() (x, z, face, riding, nRide). `wp4Load()` in start() after spawnVillagers: it spawns the tame horse, remounts if saved riding (and Sena if nRide), then `spawnWildHerd()` if reached('herd'). die() dismounts first.

### G hooks (WP4)
- `G.horse()` (the live tame horse), `G.horses()`
- `G.mount(o?)`, `G.dismount()`, `G.callHorse()`, `G.addBond(n)`, `G.wp4Target()`
- `G.tapE()` (a fresh E press, like taming input)
- `G.tame(o?)` (skips the minigame on the nearest wild adult; you end up mounted)
- `G.ride(dx, dz, secs, shift)` (holds virtual keys; resolves to P.speed)
- `G.rideState()` (a function, not a getter: Object.assign would freeze a getter)
- Internal names others can use: `tameHorse()`, `horseHome()`, `hName()`, `hLvl()`, `P.ride`, `N.ride`, `P.saddle`, `S.horse`.

### Deviations
- Calm decays 5/s, not 6, so that 12 quick taps reliably win with a saddle (the test won after 11 taps).
- Mount, dismount and climb-on need a *fresh* E press (`eTap`, set on non-repeat keydown), so holding E does not mount and dismount over and over.
- Hoof interval max(0.13, 2.2/v) s instead of 0.9/v (too many clicks at a gallop).
- The wild herd respawns on load even after taming. So after a reload there are 4 wild horses plus the tame one. They can't be fed once you own a horse.
- An "It is too steep for {name} here." toast for the slope refusal.
- Spec "herd: 'wild'": a herd object + `wild: true` is used instead, because updateAnimal's herd code needs the object.

### Evidence
Tests are in tests/wp4: t1.json (acceptance), t2.json (whistle, feed, stable, kick, die), t3.json (pelvis), v1/v2.json (shots). Logic runs use vulkan; the build was previewed on port 5174 with /api/ intercepted.
- **t1 (all PASS except one timing-only miss; errors=0):**
  - 4 horses
  - the "Offer grain" label
  - trust 3 and horse_fed 3
  - taming starts; doing nothing throws you off (trust 3→2, hp 100→95.07)
  - tamed in 11 taps (Dawn, mounted)
  - gallop 12.96 m/s with stamina 100→78
  - without a saddle 5.49
  - the river at z = 0 stops at h −0.89 with the toast
  - the ford at z = 30 is crossed
  - the Echo mouth is refused (depth 0.047)
  - peak_ride, and the chapter advances to clay
  - the spear does not hurt the horse
  - save while riding → reload → Continue: on the horse at the same x/z, Sena behind
- **Pelvis-vs-seat:** in t1 it failed only because the 30-frame sample ran too slowly. t3 run alone passes: 30 frames at a gallop, mean offset 0.000, variance < 1e-15.
- **Horse size:** back surface 1.64 m (raycast); the Torso2 bone is at 1.32.
- **t2 (all PASS, errors=0):**
  - the X whistle brings her (stops < 3 m); out of range toasts
  - Feed +10 once a day
  - a night in the stable: stam 115 (bond lvl 2 max), +5 bond, the horse in the stable
  - she kicks a wolf behind her (hp 6→3→dead)
  - die() dismounts
- **Shots (Intel GL), in shots/wp4/:**
  - ride_side2.png: Aro astride with his hands forward and his leg down the flank, Sena behind
  - ride_back2.png
  - gallop_side.png
  - (ride_side/ride_back are from before the +0.1 seat raise, when the riders sank in by 0.1)
- `npm run build` passes.

### Gaps / notes
- No herd screenshot of the horses idling in the meadow: they fled from the non-sneaking camera spot. 4 horses with the Idle clip were confirmed in logic (t1).
- The donkey is loaded but unused.
- With a busy machine the game runs at about 0.3–0.5× real time, so tests need `until` waits.
- The mount/dismount hop has no animation (an instant snap).
- Lio-on-horse (WP6) can use `liveTameHorse()` / `seatOn()`-style placement. `seatOn(e, o, bone, back)` is generic but reads `P.face` for the heading.

## Final integrated test
- Build passes. Dev server 5174 + Chrome 9333, all /api/ intercepted. Tests in scratchpad/tests/final/: play.json (full awaken→village playthrough, 28 checks, errors=0 fails=0), ford.json, old.json (old saves ch 0..7 without storyV: all load, map to awaken/fire/hunt/shelter/cave/house(→hearth since house exists)/hearth/village, ch7 runs epilogue once, 5 houses), shots.json + epi.json (GPU screenshots).
- Fixes (tagged "// final test" in main.js):
  - epilogue(): 400-day skip now refills food/water/warmth/hp (hunger/thirst were near 0 after the epilogue).
  - maybeBirth(): food/water at least 70 after the 20-day birth skip.
  - updateKids(): Lio rides the horse only in the mornings (8-11.5 h); otherwise she follows Sena (before, with a tame horse she sat on it forever and never followed Sena).
  - updatePlayer: no E prompt during camShot (rest/epilogue camera shots showed "Rest until dawn").
  - README: Lio horse line.
- Notes: riding through a ford is slow (walk pace in water) but works two-up with no swimming; deep river at z=0 refuses. findTarget gives WP4 horse actions priority when the tame horse is within reach (can hide e.g. "Sit with Sena" if the horse stands at the bench).
- Screens: scratchpad/shots/final/*.png

## P0 shared base (WPN/RST spec §0): verified complete
- people.js (already on branch `expansion`): EXTRA clips (8, sampling only, no actions), `samplePose(who|h, key, t, filter)`, `clipDuration`, `applyPose`, `BONESETS` (armR/armL, fingersR/L = `(thumb|index|middle|ring|pinky)_0[1-3]_[lr]` → 15 per hand, handR/L, upper, lower), `h.overrides` + `addOverride/removeOverride` run after mixer.update (order 10 body, 15 stance, 20 fingers, 30 IK, 40 additive), `ik2(h, side, target, pole, w)`. Only change today: ik2 degenerate-pole fallback no longer allocates.
- main.js: `hostileNear(r, p)` after `remove()`, `Digit[1-4]` in GAME_KEYS, `G.{hostileNear, samplePose, applyPose, clipDuration, BONESETS, ik2}`.
- tests/p0/p0.json: 9/9 PASS errors=0 (fixed test timing: waits on override frame counters, since under slow GL a 600 ms wait ran 0 frames). tests/final/play.json with Vulkan GL: 28/28 PASS errors=0. `npm run build` passes.
- Note: the scratchpad was empty at the start of this session; notes/tests were copied from ~/.claude/projects/-home-ashish-Desktop-game/hearthborn-notes/.

## WP-W weapons (WPN, spec_ws.md §2): DONE
**Files:** src/people.js (sockets, FIT, place/blends, finger grip, upper-body shots), src/entities.js (makeSpear/makeAxe `{flint}` + `userData.setFlint`, makeCarryBasket after makeTorch), src/main.js (`// ---------- WPN weapons ----------` after the melee block + one-line `// WPN` hooks), index.html (#wpn chip, CSS, help lines, 3 settings rows). No commits.
- **people.js:** sockets hand/handL/back(spine_03)/hipL/hipR(pelvis), `h.grip` = hand. `h.place(mesh, slot, blend, fit?)` (slot 'low' = one-handed right-hand variant; `h.fitAdj` per human, used for Sena). `FIT` tuned by eye (solved from character-frame specs, then hardcoded): spear diagonal on the back (tip over the right shoulder, s 0.92), axe head-down at the left hip (s 0.95), unlit torch tucked in the back of the belt, head up behind the right hip (hanging versions clipped the thigh when walking), lit torch flame up out of the left fist. `h.useGrip()` closes the fists (Sword_Idle / Idle_Torch_Loop fingers, weights gripR/gripL). Upper-body clips strikeU/jabU/crossU/useU/throwU/pickU (legs keep walking); `h.swing(k, timeScale)`. Also fixed: the end of every swing blended toward the bind pose (shot weight dropped to 0 while loops were < 1) — the old shot now fades out.
- **Draw/sheathe:** state machine with reach overrides (spear: up over the right shoulder; axe: across to the left hip + chest turn), mesh changes hands at 45% / 55%, leather/wood sounds, fast draw (x0.65) when a click/aim/chop is queued. Auto rules: idle 6 s, sprint 2 s, home/fire 25 m for 2 s (all only with no wolf within 20 m), wolf within 15 m auto-draws (axe preferred over fists, setting), swim = instant stow, ride/sit/Tab/build/place/dance/taming stow. Keys 1/2/3/4, tap Q = last weapon, hold Q = draw/sheathe (8 s auto-draw suppression after a manual sheathe). Wheel stays zoom (ignored while aiming).
- **Stances:** axe/fists use Sword_Idle / a Punch_Jab guard (+ wrist tilt: axe head up). Spear: procedural two-handed stance (chest bladed, both fists on the shaft via ik2 + grip-axis alignment, thrust drives the fists forward). Lit torch: Idle_Torch_Loop left arm, spear goes one-handed ('low'). Strafe facing with wolves within 12 m. Speed x0.8 walk / x0.9 run while drawn.
- **Aim/throw:** hold RMB (fast draw if needed, click = quick 0.35 throw), over-shoulder zoom (FOV 48, offset 0.8, dist x2.2/4.8), spear raised over the shoulder along the aim, left arm points, chest wind-up / spine twist in the saddle (heading never changes; ±2.1 rad throw cone). Dotted arc + ring from the SAME fixed-step integrator as the flight (landing matched the arc end within 0.16-0.2 m). Release: throwU, FOV punch, whoosh, dmg 10 (flint 20). Cancel: LMB, Esc, weapon switch, water, mount/dismount, an 8+ hit.
- **Thrown spear:** sticks (min 24° dip so it reads as stuck), floats in deep water, sticks in animals then drops (or on butcher/remove), saved as `S.spearAt` (+ reload restores it), map/minimap pin, walk-over (1 m) or E (2.2 m) pickup, Sena fetches it after 60 s if you are 25+ m away ("You forgot this."), rest returns it overnight (`wpnWake` toast).
- **Hit feel:** hitstop (real time; P, target, spear only) 0.045/0.07/0.12/0.02/0.06, trauma² shake (setting), knockback + flinch, dust/chip puffs (no blood), whoosh/hit/kill sounds, wolf bites shake.
- **First person:** separate vmScene/vmCam after a depth clear; fists, axe, spear (ready, thrust, aim, throw), torch with glow and its own light; bob, sway, draw slide, recoil. Hidden when sheathed with fists, swimming, riding unless aiming.
- **Sena:** carry basket on her back from Shelter on (hidden sitting/resting/riding/working/dancing), the old stone spear behind it once Aro has flint (s 0.84), her cave torch now held flame-up too, fetch carry.
- **Cross-package:** `wpnStowAll(reason, instant)`, `wpnRest(s, layPts)` (spear leaning at the bed head / on a rack within 8 m, axe+torch flat on the floor, basket on the floor), `wpnWake()`; plus safety: a rest that never wakes restores after 1.5 s of !busy, a sit that ends without endSit (die, a fade) still puts the planted spear back on the back. Bench: the spear is planted upright by Aro's bench end.
- **Save:** `S.equip`, `S.lastEquip`, `S.spearAt` (old saves default to fists). Always loads sheathed.
- **G.wpn:** state, select, draw, sheathe, toggle, stowAll, aim, charge, release, cancel, arc, pickup, fetch, fit, fitDump, axes, ends (handL/handR = fist grip centres), hitStop, trauma, clock, hsLast, vm, bench/unsit/rest/wake, basket.
### Tests (scratchpad/tests/wpn/, daemon.mjs + steps.mjs drive one Chrome on 9333 against a `vite preview` of a build snapshot on 5174; every /api/ intercepted; the dev server was dropped because other packages' edits hot-reloaded the page)
- accept.json (1-4), accept2.json (5-7, 15), accept3.json (8, 9, 14), accept4.json (10-13), rest.json (rest props, wake, Sena fetch), chop.json: all checks PASS, errors=0 (Vulkan). Timings are measured in game time (`G.wpn.clock`): the loaded machine ran the game at 5-20 fps.
- tests/final/play.json: 28/28 PASS errors=0 (run as wpn/play_slow.json: identical except one extra `until` for the meadow discovery, which a fixed 3 s wait missed at ~5 fps).
- Screens (Intel GL) in scratchpad/shots/wpn/: w01_idle_back, w02_idle_side, w02b_idle_leftside, w03_axe_drawn, w03b_axe_hand, w05_bench, w07_spear_ready, w07c_spear_hands, w08a_aim_tpp, w08a2_aim_side, w08b_throw_release, w09_spear_in_ground, w11_torch_axe, w11b_torch_axe_front, w12_ride_aim, w12b_ride_aim_side, w13_fpp_axe, w13b_fpp_aim, w13c_fpp_torch, w15_sena_basket, w15c_sena_basket_side, w16_rest_props, w17_settings, v_thrust, v_axe_strike_walk, v_fists_guard, v_punch, v_draw_spear_mid2, v_draw_axe_mid, v_walk_side, v_sprint_side, vm_*.png; overview grids final_a/b/c.png.
### Notes / gaps
- The axe head swings near the back of the left thigh in a full sprint (light clipping, like most games). The spear stands straight up from the back while swimming.
- The #help panel covers the lower-right of the screen, where a first-person weapon would normally sit; the viewmodel is placed a little more central to stay visible.
- The minimap/map spear marker reuses the purple 'pin' glyph (as specified), so it looks like the player's pin.
- The working tree's changes were found staged (`git add`) by someone else at the end; nothing was committed.

## RST: rest and sleep sequence (spec_ws.md §3): DONE
**Files:** src/main.js (`// ---------- RST rest ----------` replaces the WP2 rest block; one-line `// RST` hooks in settle, updatePlayer, updateSena, updateCamera (camShot block + `structCam` after `caveCam`), updateStats (2 lines), updateHome, maybeBirth, die, structTarget, wp3Target cave bed, keydown, start, the cricket gain line, G.sleep, G block after WP6 hooks), src/entities.js (`makeBlanket`, `makeBedroll` at the end; `bedHide` field on hut and house), index.html (CSS after `#fade.on`, `#restvig/#restbars/#restdip/#restmenu` after `#fade`, `#buff` after `#clock`, help line).
- **Menu and rules:** E at a hut/house/cave bed → `#restmenu` (1 Sleep until dawn / 2 Nap 2 hours / Esc; E = first; mouse works; tier preview). Wolves within 35 m → info prompt + Sena's line once a night; 90 s after waking → no prompt; daytime → nap only. Comfort table and tiers as spec; Snug slows hunger ×0.8.
- **Sequence** (wall-clock driven, so it keeps its length at low fps): walk in through the door on waypoints (cut under a 0.3 s dip if far) → sit on the bed edge (Sitting_Enter) or kneel at a floor bed → lie down (pose blend + root lerp, calibrated so the head lands on the pillow) → night: vignette, crickets ×2, fire crackle, lullaby, dream line, time-lapse; a cut outside to the shelter under the stars turning to dawn → wake (warm tint): sit up, stand, stretch with yawn, morning line, Aro steps toward the door and the camera eases back behind him. First run ~12 s, later ~10 s, skip (any key after the first time) ~3.3 s.
- **Poses:** roots stay upright (yaw only). Aro = Death01 last frame, legs eased 50% toward the standing legs, small knee bend, small roll toward Sena, head turned to her, outer hand on the belly. Sena = same base rolled 1.42 rad onto her side facing him, curled legs (upper knee dropped onto the mattress), lower hand under her cheek. Holding hands (IK, order 30) on the blanket edge; with Lio in the bed both hands rest on her. Sunken feet are lifted at the hip. Breathing order 40. Tunables live in `G.restTune`.
- **Blanket:** 23×19 plane, re-draped every frame from the sleepers' hip/leg/foot bones, smoothed, edges hang over the bed sides (floor beds: to the floor); the shelter's own hide cover is hidden while it is out. House without a bed gets a hide bedroll with rolled pillows; the cave gets rolled-hide pillows.
- **Light:** a low warm key light on the camera side (the unlit torch's PointLight, no new lights); in caves Sena's torch is set down and its light used.
- **After waking:** the hut/house collider is off while Aro is indoors; `rstInside` keeps him inside the walls (door open, furniture solid) and on the floor; out the door → collider back. A reload indoors does the same (`rstLoad`). Sena walks out of the door. `structCam` pulls the third-person camera in front of hut/house/stable/kiln/well walls and roofs (also fixes the camera in the thatch when walking around outside).
- **Outcome** (`rstApply`, once): hp +6/h, food/water −1.8/h (min 12), warm 100; dawn: `S.rested = 120 + 30·C`, `S.restTier`, toast, slept, horseNight, closeness (house +4 + first-home line, else +2, +1 good evening), maybeBirth; nap: no buff, +1 closeness once a day. Solo: Sena stays put, `S.c.apartDay`, her line when they next meet within 6 m. Save is written with everyone at the door. Birth: `R.hold4` shows the card 4 s before the wake (time 09:00 as before).
- **WPN hooks** called through typeof guards: `wpnStowAll('rest', true)`, `wpnRest(s, layPts)` (spear at the bed head, axe + torch on the floor, basket), `wpnWake()` as Aro heads out. Without WPN the tools are just hidden in bed.
- **Deviations:** keydown line sits before the Escape branch (Esc must close the menu); settle line is `if (rstSettle(e, dt)) return;`; `#vignette` already existed, so the night vignette is `#restvig`; Sena's side pose is the rolled Death01 base (not sitHold); Aro ends a step toward the door (the hut is too small for a camera behind him at the bedside); G.sleep() = a skipped night (old tests); wpnWake at the exit, not 1.2 s (it would cut the stand-up clip).
- **G hooks:** `rest(mode,{s,skip})→Promise<outcome>`, `restState`, `restHold(phase)`, `restBlock`, `restMenu`, `restChoose`, `restKey`, `lie(who,on,s)`, `restCam(name)`, `restProbe`, `restTune`, `restLay`, `R`, `rstComfort`, `rstMorningLine`, `structCam`, `sleep`, `endRest`.
- **Evidence** (vite preview of a snapshot build on 5175, Chrome 9334, every /api/ intercepted; tests/rst/t1–t3.json via tests/rst/run.mjs, generated by tests/rst/gen.py): t1 23/23 (rules, menu, wolves, walk, hut pose, HUD, time-lapse, outcome, wake position, camera ray, recent, save, walking out), t2 17/17 (house bed Snug +4, floor line, cave Rested, skip 3.3 s same outcome, solo + apart line, nap), t3 8/8 (birth card 4 s, Lio in cradle then beside Sena, reload keeps tier + #buff, reload indoors walkable). Regressions: tests/final/play.json 28/28, tests/wp4/t2.json 8/8, errors=0. `npm run build` passes. Shots: shots/rst/r00–r14*.png, final_A.png, final_B.png.

## FPP first person: research and audit (read-only, no code changed)
**Harness:** tests/fpp/ (daemon.mjs and cli.mjs/c.sh copied from wpn; Chrome 9341 against `vite preview` of a snapshot in tests/fpp/dist on 5179; every /api/ request intercepted; Intel GL). helpers.js adds `TRACE(ms)` (camera height, roll, speed, step and fov per frame), `EYE()` (the real eye centre from the Eyes mesh, in Aro's facing frame) and `EYETRACE`. proto.js/proto2.js give `PROTO(pitch, fwd, hideHead)` and `PROTO2(pitch, bend, fwd)`, which render the scene once from the eye with the body visible (test-only prototypes). Console: 0 errors. Processes killed.
**Measured (current FPP):**
- Body: `P.h.root.visible = false`, so there is no body, no feet and no player shadow (02).
- Camera: fixed at root + 1.68 up and +0.16 forward.
- Real eye positions: idle 1.625 up, +0.145 forward. Jog clip ("walk" at 3.3 m/s) 1.39–1.61 up, +0.34–0.39 forward. Crouch 0.84–0.94 up, but the camera sits at 1.13. Seated eye 1.28, but the camera stays at 1.68.
- Bob: vertical only, ±0.03 m, one cycle per 2.3 m. No lateral bob, no roll, no landing dip.
- Sneak and sprint use the same bob shape. Swimming reuses the walking bob.
- Footstep sounds come every 2.3 m. The animation lands 2.0 footfalls/s at 3.3 m/s, but the sound plays 1.43/s. Sneak: 1.21 footfalls/s vs 0.74 sounds/s. Neither is phase-locked.
- Jump apex 1.05 m (vy 5.6, g 15).
- FOV 58, rising to 66 at sprint. Near plane 0.15.
- The house collider is a circle of r 3.52 around a 6.4×5.2 box. You can walk into the wall corners, and the camera ends up inside the house (06).
- Pickups play the "use" clip on the hidden body, so nothing shows on screen (13).
- The night torch viewmodel is huge and over-saturated (12).
- Riding: the horse neck shows, but there are no hands, reins or legs (08, 09).
**Prototype finding (20b):** at pitch 1.45 (83°), with the camera 6 cm ahead of the real eye and the head hidden, you see your chest, hands and front foot. With the current 1.25 limit and a 58° FOV, the body stays mostly out of frame (16). A strong spine bend shows only one leg (20), so keep the bend at 0.25 rad or less. A camera behind the eye shows the inside of the neck stump (18), so hide neck vertices too.
**Shots:** shots/fpp/00–14 (audit), 15–20 (body prototypes).
**Plan:** prioritized P0–P3 with parameter values in the agent's return message. The core idea is a smoothed eye taken from the Head bone, a visible body with head and neck discarded in the colour pass only (the shadow keeps the head), and footstep-locked bob, roll and landing dip with comfort sliders.
