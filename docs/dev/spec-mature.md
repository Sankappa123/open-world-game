# Hearthborn 21+ Mature Expansion: Implementation Spec (M-series)

Lead-design merge of four research passes: gap analysis, violence, harsh survival, and story/romance. Engineers build this **after** the current WPN, RST and QA retest work has landed and `scratchpad/tests/final/play.json` passes again. Line numbers below are from `src/main.js` as of 2026-11-13 and will drift. **Always grep the function name before editing.**

Ground rules (same as earlier WPs):
- Branch `expansion`. No commits unless the user asks.
- Every WP works in its **own tagged section** of `main.js` and adds only **one-line tagged hooks** (`// MAT`, `// GORE`, `// SURV`, `// CMB`, `// ARC`, `// ROM`, `// MUS`) in shared functions.
- New logic goes into new files where possible.
- Test harness:
  - Use `scratchpad/tests/run.mjs`, with steps `{js}`, `{expect}`, `{until}`, `{key}`, `{wait}`, `{shot}`, `{reload}`.
  - Run against `vite preview` of a snapshot build (5174/5175). The dev server hot-reloads when other WPs save.
  - Intercept every `/api/*` request.
  - Use `GL="--use-angle=vulkan ..."` for logic tests and Intel GL for screenshots.
  - The machine runs at 5-20 fps, so measure in **game time** (`clock`, `S.gh`), never with fixed waits.

---

## 1. Feature selection

### 1.1 Ranked: build these 14

| # | Feature | Inspired by | Impact | Cost | WP |
|---|---|---|---|---|---|
| 1 | 21+ content notice and Content settings (Blood on/off, Gore level, screen blood, finisher camera, Romance scenes, Mature story) | ESRB/PEGI practice, TLOU2 and Ghost of Tsushima gore toggles | High | S | M1 MAT |
| 2 | Difficulty presets Story / Survivor / Hardcore, plus Custom and scarcity tuning | The Long Dark (Pilgrim to Interloper, plus Custom), Sons of the Forest, Valheim world modifiers | High | S | M1 MAT |
| 3 | Downed state with Sena rescue, real death costs, Hardcore permadeath with memorial ("The Stones") | Sons of the Forest revive, DayZ unconscious, TLD/Don't Starve memorials | High | M | M1 MAT |
| 4 | Procedural blood and wounds: pooled spray, ground splats, a bind-space wound shader on skinned bodies, screen blood, heartbeat | RDR2, Ghost of Tsushima, The Last of Us | High | M | M2 GORE |
| 5 | Hunting realism: hit zones, wounded prey that flee and bleed out, blood trails, Hunter's Focus (hold Z), mercy kill, hide quality, bloody butchering with the carcass left behind | RDR2 Eagle Eye and pelts, Far Cry Primal Hunter Vision | High | M | M2 GORE |
| 6 | Injuries: bleeding to wound to infection; fall damage giving sprain/fracture; bandage and splint; body screen (I); status-icon ("moodle") HUD row; Sena tends you | Green Hell, The Long Dark, DayZ, Project Zomboid | High | M-L | M3 SURV |
| 7 | Illness and water quality: raw, undercooked or spoiled food causes poisoning; unsafe water causes dysentery; boiling (hide bag, then clay pot); herbs and teas | Green Hell, The Long Dark, Kingdom Come | High | M | M3 SURV |
| 8 | Food spoilage, spit cooking with doneness, dried-meat preservation, cold storage in the basket or a cave | KCD, TLD, Valheim | High | S-M | M3 SURV |
| 9 | Weighty stamina combat: combos, heavy attack, block/parry, dodge roll with i-frames, posture, telegraph glints, finishers, spear brace (uses UAL2 clips) | Kingdom Come, Ghost of Tsushima, Valheim, Mount & Blade | High | L | M4 CMB |
| 10 | Dangerous predators: an alpha wolf that leads the pack, aurochs (CC0 bull), cave bear (CC-BY morph model) | RDR2, Far Cry Primal | High | M-L | M4 CMB |
| 11 | Rival tribe raider AI (the Ash People): roles, attack tokens, telegraphs, flee/surrender. Sena vulnerability: she can be downed, and can die on Hardcore | Far Cry Primal, The Forest, TLOU, Sons of the Forest | High | L | M4 CMB (AI), M5 ARC (beats) |
| 12 | Mature story: 7 new chapters in 4 seasonal acts, choices with delayed consequences (approval, mercy), loss, a branching epilogue | TLOU seasons, RDR2 honor/epilogue, Telltale TWD, Witcher 3 | High | L | M5 ARC |
| 13 | Romance v2, strictly non-explicit: tiers, hold hands, embrace, kiss, heart events, a consent-gated first kiss, fade-to-black nights, gifts, rift and neglect | Stardew hearts, BG3/Mass Effect approval and camp romance, KCD time-skip | High | M | M6 ROM |
| 14 | Adaptive procedural music score and 4 volume buses (Master/Music/Effects/Ambience) | RDR2, BotW | High | S-M | M6 MUS |

### 1.2 Backlog: not in this round

| Item | Why it waits |
|---|---|
| Loading progress bar and contextual hints replacing the #help wall | Small and good. Do it in the next polish round. |
| Journal/codex (J) | M5 adds a "Memories" tab to the map journal instead. |
| Full seasons and weather cycle (snow, fog, lightning) | L. M5's winter chapter gives a scripted winter via `S.arc.season`. |
| Use-based skills | Medium value |
| Wolf-pup or dog companion | Medium |
| Bow | Large |
| Traps | Medium value |
| Achievements | Small and low value now |
| Photo mode | Small and low value now |
| Gamepad support | Medium |
| Tool durability and bone tier | Medium value |
| Multiple save slots | Medium |
| Clothing layers, Wet, Fatigue, Dread | Good, but the survival layer is already big |
| Parasites and leeches | Survival extras |
| Canoe | Medium value |
| Dynamic world events | Medium value |
| Trading post | Large |
| Boar and big cats | The assets are downloaded but need more work. See §6. |
| Legacy "Continue as Lio" after permadeath | Large. The memorial ships now. |
| "Story intensity: Harrowing" (a lost first pregnancy) | **Excluded** pending an explicit user decision (§11). |

---

## 2. Content guardrails (binding on every WP; put this block as a comment at the top of gore.js, romance.js and arc_data.js)

1. **Romance is strictly non-explicit.**
   - Affection is limited to hand-holding, embrace, kiss (lips or forehead) and resting together clothed.
   - Intimacy is always shown as embrace, then kiss, then a **cut or fade to black**, then the next morning.
   - No sex scenes. No sexual sounds, text or innuendo beyond warm, adult tenderness.
   - No undressing API, and no nude or underwear meshes or textures. Never swap the Quaternius clothed bodies.
   - In bed, only show sleeping: clothed, under the blanket, holding hands (the existing RST look).
   - Romance happens only between Aro and Sena, both adults.
   - No romance option is available when a child is within 15 m or awake in the house.
2. **No sexual violence or threat of it, anywhere.** Korr wants Sena as a *healer*. Never write or imply anything else.
3. **Children (Lio, Pell) are never harmed, targeted, endangered on screen or shown dead.**
   - AI target selection is restricted in code to `P`, `N` and structures. Add an assert in dev builds.
   - Children are moved out of any combat area (indoors, or despawned) before a fight starts.
   - Wena and Pell's fate when refused is off-screen and unknown: an empty camp and a sling. No bodies.
4. **Violence is realistic, not torture porn.**
   - Blood, wounds, bleeding out, kills and butchering are allowed.
   - Not allowed: dismemberment, decapitation, gore close-ups held longer than about 1.5 s, torture, prolonged suffering, or harming the helpless as spectacle.
   - Finishers are fast.
   - A surrendered human is killed **only** by an explicit player choice in a `choose()` panel, never automatically and never as the default option.
   - Sena reacts to cruelty: approval and Closeness consequences.
5. **Death of a main character is non-graphic.** Grief is shown through Sena's face, hands and words, the sky, and a cairn. Blood is never shown on the player death screen or the memorial, even with Blood on.
6. **Settings always win.**
   - Blood Off swaps every blood visual for dust and brown scuffs and keeps every mechanic.
   - Gore Low cuts the camera away at finisher impact.
   - Romance "Fade early" cuts at the embrace; "Off" hides kiss, embrace, hand-holding and night options. Closeness and dialogue still work.
   - Mature story Off skips the dark chapters (§5.6).
7. **Content notice.**
   - Shown on the title screen until accepted:
     > "Hearthborn is intended for adults (21+). It contains blood and realistic violence toward animals and people, injury, illness, death and grief, and mature relationship themes. Romance is non-explicit: no nudity and no sexual content."
   - Two buttons: **I am 21 or older** and **Use toned-down mode**.

---

## 3. Settings plan (M1 builds all of the UI; the other WPs only read `settings.*`)

### 3.1 `src/save.js` `DEFAULTS` additions (merged from localStorage as today)

```js
ageOk: 0,              // CONTENT_V (=1) once the notice is accepted; the gate shows while < CONTENT_V
blood: 'off',          // 'on' | 'off'  (set to 'on' by "I am 21 or older"; stays 'off' until the gate)
gore: 'med',           // 'low' | 'med' | 'high'
screenBlood: true,     // directional splatter and bleeding edge pulse
finisherCam: true,     // finisher / kill-cam camera cut and slow-motion
romance: 'full',       // 'full' | 'fade' | 'off'
matureStory: true,     // dark chapters and choices (§5.6)
choiceTimer: true,     // timed Telltale-style choices; off = untimed
reduceFlash: false,    // halves screen flashes (blood pulse, hit flash, finisher flash)
music: 0.6, sfx: 1, amb: 1,   // `volume` stays the master
```

- **Toned-down mode:** `blood:'off', gore:'low', screenBlood:false, finisherCam:false, romance:'fade'`. `matureStory` stays on, because those are story themes and not graphic content.

### 3.2 Pause menu

Restructure `#pause .box` in index.html (rows today are at about L182-190) into 5 tabs. Keep every existing element id so `bindSettings()` still works.

| Tab | Rows |
|---|---|
| Game | Difficulty (read-only for Hardcore; the dropdown can only *lower*), Choice timer, "Show the content notice again" button |
| Controls | Sensitivity, Invert Y, Auto-draw, Spear arc |
| Video | Quality, Fullscreen, Camera shake, Reduce flashing |
| Audio | Master (`opt-vol`), Music, Effects, Ambience |
| Content | Blood, Gore intensity (disabled when Blood is off), Screen blood effects, Finisher camera and slow-motion, Romance scenes, Mature story |

In Hardcore, hide `#btn-save`. "Save & quit" still saves.

### 3.3 Title screen (index.html `#title` about L204; main.js about L3911)

- **`#gate`** (§2.7) covers the buttons while `settings.ageOk < CONTENT_V`.
- **`#newgame` modal** opens from "Begin the story" / "New story".
  - 3 cards: Story, Survivor (preselected), Hardcore. Each has a 3-line description.
  - A "Custom…" expander, built from the §3.4 keys: toggles for afflictions, illness, spoilage and permadeath; sliders for drain ×0.75-1.3, scarcity ×0.8-2.2 and enemy damage ×0.6-1.6.
  - Confirm calls `start(false, diffChoice)`.
- **"The Stones"** button shows only if `localStorage['hearthborn-stones']` has entries. It opens a list of fallen runs (§4.4).

### 3.4 Difficulty table (`DIFF` constant in the MAT section; `D()` returns the preset merged with `S.diff.custom`)

| Key | Story | Survivor (default) | Hardcore |
|---|---|---|---|
| `drainK` (food/water) | 0.75 | 1.0 | 1.3 |
| `chillK` | 0.75 | 1.0 | 1.4 |
| `dmgK` (all damage to Aro and Sena) | 0.6 | 1.0 | 1.6 |
| `foeHpK` (wolves, predators, raiders) | 0.7 | 1.0 | 1.25 |
| `pack` (wolves per event; +1 after `house`) | 2 | 3 | 3-5 |
| `aff` (injuries) | off (bleeding is cosmetic and stops in 10 s) | gentle: hp floor 10, max 3 active, sev 1 clots in 60 s | full: can kill |
| `ill` (poisoning, dysentery chances) | off | on (low) | on (high) |
| `spoil` | off | Survivor times | Hardcore times |
| `cook` | instant (as now) | spit | spit |
| `nodeK` (berry/herb/grain respawn × NODE[k][2]) | 0.8 | 1.3 | 2.2 |
| `animalRespawn` (s, base 80) | 60 | 150 | 300; herd cap −40% |
| `meat` (deer / stag) | 2 / 4 | 2 / 4 | 1 / 2 |
| `revive` (Sena revives a downed Aro) | always | always | once per game day, needs a bandage or poultice in the pack |
| `senaFate` (Sena at 0 hp) | never hurt | downed, recovers by herself after 60 s (−5 Closeness) | downed; dies if not revived in 60 s, which ends the run |
| `death` | rescue (as now) | rescue plus penalty | permadeath |
| `saves` | free | free | autosave only; save deleted on death |
| `grace` | none | no afflictions until `hunt` is reached | first 24 game hours |

**Mode changes mid-run:**
- Story and Survivor can be swapped freely.
- Hardcore can only be lowered. That sets `S.diff.softened = true`; the memorial is still written but tagged "softened".
- Raising to Hardcore is only possible at a new game.

---

## 4. State, save fields and old-save compatibility (M1 adds ALL of these at once so the other WPs never edit `fresh()`)

### 4.1 `fresh()` additions (main.js about L43)

```js
storyV: 3, chId: 'awaken',
gh: 0,                                  // monotonic game hours (see 4.3)
diff: { mode: 'survivor', perma: false, softened: false, custom: null, graceUntil: 0 },
downedDay: -1, weakUntil: 0,            // MAT
nhp: 100,                               // CMB Sena health (Sena's downed timer is runtime only)
aff: [], naff: [],                      // SURV afflictions [{id, part, sev, t, tr, risk}] for Aro / Sena
risk: { hypo: 0 }, skinQ: 'safe',       // SURV
age: {}, stashAge: {},                  // SURV food ages {meat:[gh,...]} FIFO, capped at 40 per key
legend: {},                             // CMB {alpha:'alive'|'dead', bear:{state, hp}, aurochs:{...}}
arc: { season: 'summer', tribe: 'unknown', choices: {}, tamu: 'none', wena: 'none', senaWound: 'none',
       horseFate: 'safe', graves: [], approve: 0, mercy: 0, rift: 0, riftCause: null, bonded: false,
       fever: 0, memory: [], coldCamp: false, campPos: null, winterStart: null, doorDay: null, raidDay: null,
       raid: { done: false, wave: 0 }, home: { burned: false }, legacy: false },
rom: { firstKiss: null, held: 0, embraces: 0, kisses: 0, nights: 0, lastShared: 0, heart: {},
       dayCaps: {}, gifts: {}, vow: null },
```

### 4.2 ITEMS additions (M1 adds the keys so every WP can `give()`; `drawInv` only shows counts above 0)

- **SURV:** `bandage` Fibre bandage, `hidebandage` Hide bandage, `splint` Splint, `yarrow` Yarrow, `willow` Willow bark, `mint` Mint, `moss` Cave moss, `minttea` Mint tea, `willowtea` Willow-bark tea, `ypoultice` Yarrow poultice, `dried` Dried meat, `driedfish` Dried fish, `spoiled` Spoiled meat.
- **CMB:** `pelt` Alpha pelt, `bearhide` Bear hide, `horn` Aurochs horn, `claws` Bear claws.
- **ROM/ARC:** `beads` Ochre beads, `carving` Carved figure, `cord` Ochre cord.
- **Tools** (in `S.tools`): `boilbag`, `pot`, `mantle` (wolf-pelt mantle), `bearcloak`.

### 4.3 Monotonic game clock

`S.time` wraps without `S.day++` (by design; RST and the birth logic depend on it), so spoilage and afflictions need their own clock.

- `matClock()` runs at the end of `updateStats`: `d = (S.time - lastT + 24) % 24; if (d < 12) S.gh += d; lastT = S.time`.
- Rest, sit and death time jumps are all under 24 h, so the mod-24 delta is exact.
- `skipHours(h)` (test and story helper): `S.time = (S.time + h) % 24; S.gh += h; emit('hours', {h})`.
- Every timed system (SURV spoilage and afflictions, ARC fever) also listens to `'hours'`, so tests can fast-forward.

### 4.4 Memorial store (no server change)

- `localStorage['hearthborn-stones']` holds an array of entries:
  `{name, sena, days, chapterTitle, close, deer, wolves, found, kids, cause, epitaph, mode, softened, date}`.
- Write it **before** `deleteGame()`.
- The Mongo/SQLite single-slot API is unchanged.

### 4.5 Load path (`start()` about L3869, right after the existing merges)

1. Deep-merge the nested objects: `S.diff = {...fresh().diff, ...data.diff}`, and the same for `arc` (plus `arc.choices`, `arc.raid`, `arc.home`), `rom` (plus `rom.heart`, `rom.dayCaps`, `rom.gifts`), `risk`, `age`, `stashAge` and `legend`. Arrays default to `[]`.
2. **No `diff` in the save:** use `mode: 'survivor'` with `graceUntil = S.gh + 24`, and toast once: "Difficulty: Survivor (you can lower it in Esc > Game)". Old food has no age entries, so treat it as fresh (stamp it with `S.gh` on first tick).
3. **Story migration storyV 2 to 3** (owned by M5, but the code goes here):
   ```js
   const V2 = ['awaken','fire','hunt','shelter','cave','herd','clay','house','hearth','seeds','newlife','village'];
   if ((data.storyV || 1) < 3) {               // v1 is first mapped to v2 by the existing block
     const id = V2[clamp(S.ch|0, 0, 11)];
     S.ch = chIdx(id); S.chId = id; S.storyV = 3;
     if (chIdx(id) >= chIdx('hearth')) { S.arc.legacy = true; if (S.close >= 60) S.rom.firstKiss = S.day; }
   }
   S.chId = CH[S.ch].id;                       // from now on save() writes chId too; on load prefer chIdx(S.chId) when it is valid
   ```
   - Old saves at `clay` or `house` skip `smoke` and `outcast` (choices undefined). All ARC code must accept undefined choices.
   - The existing v1-to-v2 block must run first.
4. Hardcore saves with `S.diff.perma && S.dead` cannot be loaded (defensive; normally they are deleted).

---

## 5. Shared contracts (M1 builds these first; everyone codes against them)

### 5.1 Event bus (MAT section)

```js
const BUS = {};
function on(ev, fn, order = 50) { (BUS[ev] ||= []).push({ fn, order }); BUS[ev].sort((a, b) => a.order - b.order); }
function emit(ev, e = {}) { for (const h of BUS[ev] || []) { h.fn(e); if (e.cancel) break; } return e; }
```

| Event | Payload | Emitted by | Listeners (order) |
|---|---|---|---|
| `playerHitPre` | `{who:'P'\|'N', dmg, kind:'bite'\|'claw'\|'gore'\|'cut'\|'pierce'\|'blunt'\|'fall'\|'kick', from, dir, part, cancel, blocked}` | `playerHurt()` | CMB dodge i-frames, block, parry (10); MAT `dmgK` (20) |
| `playerHit` | same, after hp is applied | `playerHurt()` | SURV affliction roll (60); GORE screen splat and wound decal (70); MUS combat state (80); ARC/ROM reactions (90) |
| `animalHitPre` | `{o, dmg, kind, point, dir, zone, crit}` | `hurt()` | GORE zone and multiplier (20); CMB posture, block, anti-spam (30) |
| `animalHit` / `animalDie` | same plus `kill` | `hurt()` | GORE blood, bleed, trail (50); CMB hit reactions (60); ARC tribe morale/story (90) |
| `land` | `{drop, speed, water}` | `updatePlayer` landing | SURV fall damage |
| `rested` | `{hours, mode, together, tier}` | `rstApply()` | SURV healing ×2 per slept hour; ROM night buff; ARC vigil |
| `hours` | `{h}` | `skipHours`, `matClock` (each whole hour) | SURV, ARC |
| `downed` / `revived` / `died` | `{who, cause}` | MAT, CMB | GORE (clear screen blood), MUS (lament), ARC |

### 5.2 Damage entry points

- **`playerHurt(e)` (MAT).** It replaces direct hp writes:
  - wolfBrain bite (about L769): `playerHurt({dmg: 8, kind:'bite', from:o})`. The value goes from 6 to 8, scaled by `dmgK`.
  - Horse throw (about L452): `playerHurt({dmg:5, kind:'blunt', from:o})`.
  - Steps: `emit('playerHitPre')`. If cancelled or `dmg ≤ 0`, return. Then hp, `hurtFlash = min(1, .35 + dmg/14)`, `S.lastHurt = e.kind`, `emit('playerHit')`.
  - `who:'N'` routes to Sena's `S.nhp` (CMB applies it).
- **`hurt(o, dmg, info = {})` (MAT changes the signature).** Steps: `emit('animalHitPre', e)`, then apply `e.dmg`, then the existing body, then `emit('animalHit' | 'animalDie')`. Pass `info` at the call sites:
  - `wpnHitFx` (about L1147): `{kind, point, dir}`, where `point` = target position + 0.9 up, and `dir` = the attacker's forward.
  - `landSpearAnimal` (about L1355): the spear-tip world point and `proj.vel`.
  - The horse kick at about L673.
- **`hostileNear(r, p)` (about L718)** becomes `animals.some(o => (o.kind==='wolf' || o.hostile) && live && !o.leave && dist<r) || foes.some(f => f.live && !f.fled && dist<r)`. That makes RST rest blocking, WPN auto-draw and ROM menus aware of bears and raiders automatically.

### 5.3 `choose()` modal (MAT; used by ARC, ROM and CMB surrender)

```js
choose(id, title, options /* [{label, req?:()=>bool, hint?}] */, { timer = 0, def = 0, note = '' } = {}) -> Promise<index>
```
- Builds a `#choice` panel (the same look as `#restmenu`).
- Keys: Digit1-4, E = first enabled option, Esc = `def` when `def` is not null.
- Unlocks the pointer and freezes AI while open (`busy = true`).
- Shows a timer bar when `timer && settings.choiceTimer`.
- Options with `req()` false are shown greyed with their hint.
- Does **not** write story state. ARC's `arcChoose()` wraps it to record `S.arc.choices`, `memory` and approval.
- Add `Digit1-4` handling to the existing keydown path: GAME_KEYS already has Digit1-4.

### 5.4 Keys (MAT edits `GAME_KEYS` once, about L3517)

| Key | Action | Owner |
|---|---|---|
| **I** | body/injury screen | SURV |
| **Z** (hold) | Hunter's Focus | GORE |
| **AltLeft** | dodge roll; `preventDefault` | CMB |
| E (hold 0.3 s) on Sena | Sena menu | ROM |
| H | smart treat: worst bleed first with the best item, else poultice | SURV takes over `heal()` |
| F (hold 0.6 s) | eat raw | SURV |
| RMB | block with axe, fists or torch (spear keeps aim and brace) | CMB |
| LMB (hold 0.4 s) | heavy attack | CMB |

The help panel gets one line per new key. Keep it short: the #help wall is already too big.

### 5.5 `findTarget` order (about L1917)

1. `wp4Target`
2. `wpnTarget`
3. **CMB:** "Revive Sena", "Finish", "Spare / …" (surrender)
4. **GORE:** "End its suffering" (bedded prey), then **butcher (replaces the loop at about L1922)**
5. existing share meal
6. **ROM:** "Sena (hold E)"
7. nodes, sites, structs, wp3
8. **SURV:** river drink (replaces the line at about L1964)

### 5.6 Mature story Off and chapter skipping

- Chapters flagged `mature: true` are skipped in `enterChapter()` (loop `S.ch++` while `CH[S.ch].mature && !settings.matureStory`) and get their neutral `skipFx()`.
- Raiders never spawn.
- Sena cannot die. Hardcore still has permadeath for Aro.

### 5.7 `window.G` namespaces (each WP owns one)

| Namespace | Owner |
|---|---|
| `G.mat`, `G.playerHurt`, `G.skipHours`, `G.choose`, `G.on` | MAT |
| `G.gore` | GORE |
| `G.surv` | SURV |
| `G.cmb`, `G.foes`, `G.spawnRaider` | CMB |
| `G.arc`, `G.setArc`, `G.arcChoose`, `G.raid`, `G.fever` | ARC |
| `G.rom`, `G.heart` | ROM |
| `G.music` | MUS |

### 5.8 Frame order additions (frame about L3921)

The existing frame order is extended like this:

> updatePlayer [MAT downed, CMB dodge/block/stamina, SURV speed mods] → torch → updateSena [MAT rescue > CMB downed/combat > ARC scripted > ROM hand-hold > existing] → villagers/kids → spear → updateStats [MAT `D()` multipliers, `matClock`; SURV `affMods`] → **updateSurvival(dt)** (SURV, about 1 Hz logic) → subs → events → map → chapter check (`goalsOf`) → **updateArc(dt)** (ARC) → animals → **updateFoes(dt)** and predator brains (CMB) → updateHorses → updateWorldThings → **updateGore(dt)** (GORE) → updateWP3 → updateCamera → **updateMusic(dt)** (MUS) → render

### 5.9 Performance budget

- **Blood:** 3 instanced draw calls (drops 384, splats 160, Focus highlights reuse the splats). Halve the pools on `low`.
- **Static decals:** 24 or fewer, built the frame *after* the hit; none on `low`.
- **Wound shader:** 8 `vec4` uniforms per patched material. Materials are cloned per instance (see M2).
- **No new lights.** Glints and eyeshine are additive sprites.
- **Raiders:** max 6 live (7 with Korr). Predators: max 1 bear and 1 aurochs herd (5) active within 150 m.
- **Music:** 12 or fewer concurrent oscillators.
- **No per-hit allocations.** Preallocate Vector3 and Matrix4.
- **Gate:** each WP runs an fps A/B (feature hidden vs shown) in the same session; it must stay within noise.

---

## 6. Assets

All of these are already downloaded and inspected (`scratchpad/tools/gltfinfo2.py` run with `python -I`). Treat the files as data only:
- Copy them with `cp`.
- Keep any processing scripts in `scratchpad/tools/` and pass file paths as arguments.
- Never run anything from inside `assets2/`.

| Asset | Downloaded file | Licence | Destination | Use |
|---|---|---|---|---|
| Universal Animation Library 2 [Standard], Quaternius | `/tmp/claude-1000/-home-ashish-Desktop-game/6dfdb715-4157-4569-89fa-7fd9e44a76a2/scratchpad/assets2/ual2/x/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb` (8.1 MB; same 65-joint rig and bone names as `anims.glb`; the zip's License.txt says CC0 1.0) | CC0 1.0 | `public/models/anims2.glb`, stripped to about 1-2 MB | CMB clips (list below), SURV limp |
| Bull, Quaternius Ultimate Animated Animals (poly.pizza/m/a8PIIYwF7r) | `/tmp/claude-1000/-home-ashish-Desktop-game/6dfdb715-4157-4569-89fa-7fd9e44a76a2/scratchpad/assets2/bull/bull.glb` (1.04 MB, AnimalArmature rig, clips Attack_Headbutt, Attack_Kick, Death, Eating, Gallop, Idle_HitReact_Left/Right, Walk, Idle, Idle_Headlow) | CC0 1.0 | `public/models/animals/bull.glb` | Aurochs: scale 0.44, calves 0.25 |
| Running Brown Bear, Google Data Arts Team (poly.pizza/m/Coppphok4P) | `/tmp/claude-1000/-home-ashish-Desktop-game/6dfdb715-4157-4569-89fa-7fd9e44a76a2/scratchpad/assets2/bear_brown/bear_brown.glb` (165 KB, 984 tris, no skeleton, 22-target morph run 0.88 s, cm units) | **CC-BY 3.0: attribution required** | `public/models/animals/bear.glb` | Cave bear: scale about 0.011, procedural idle, rear, swipe and topple |

**Not used this round** (backlog, kept in assets2):
- `bear_black/bear_black.glb` (CC-BY 3.0)
- `mountain_lion/mountain_lion.glb` (/m/MKOuVluVBe, CC-BY 3.0)
- `panther/panther.glb` (/m/JcAlAQynld, CC-BY 3.0)
- `boar_oga/boar_0.blend` (CC0; needs a headless Blender export, and Blender is not installed)

**Rejected:**
- `pig/`, `cat_q2/`: blocky style.
- `bear_oga/`: CC-BY 4.0, static FBX.

**UAL2 strip.** Write `scratchpad/tools/strip_glb.mjs <in.glb> <out.glb> <Clip1,Clip2,...>` with no dependencies (gltf-transform is not installed):
1. Parse the GLB JSON and BIN chunks.
2. Drop meshes, skins, materials, textures and images. Drop the node `mesh` and `skin` refs.
3. Keep only the listed animations. Drop channels whose `target.path === 'scale'`.
4. Rebuild accessors, bufferViews and BIN with only the referenced data (4-byte aligned).
5. Run it with `node` on absolute paths.

Keep these clips:
- `Hit_Knockback`
- `Idle_Shield_Break` (stagger)
- `Sword_Block`
- `LayToIdle` (get up / downed)
- `Sword_Regular_A`, `Sword_Regular_B`, `Sword_Regular_C`
- `Melee_Hook`
- `OverhandThrow`
- `Zombie_Walk_Fwd_Loop` (limp)
- `Consume` (eat/drink)

Load it in `people.js` the same way as `anims.glb`: rotation-only retarget, a missing clip is a warning and is skipped.

**Credits.**
- Add to `public/models/CREDITS.txt` and the README Credits section:
  > "Running Brown Bear by Google Data Arts Team, CC-BY 3.0, via poly.pizza (https://poly.pizza/m/Coppphok4P)"
  > "Universal Animation Library 2 and Bull by Quaternius, CC0 1.0"
- Add a one-line Credits row in the pause menu Game tab (CC-BY needs visible attribution).

Everything else is procedural: blood textures (CanvasTexture atlas), moodle icons (inline SVG), glints, music and sounds (WebAudio).

---

## 7. Work packages

### M1 MAT: Mature foundation (first; everyone depends on it). Section `// ---------- MAT mature foundation ----------`

**Files:**
- `src/save.js`: DEFAULTS
- `index.html`: `#gate`, `#newgame`, `#stones`, `#obit`, `#choice`; pause tabs and all new settings rows
- `src/main.js`: MAT section plus one-line `// MAT` hooks

**Integration points:**
- `fresh()`, `ITEMS` and `start()` merge and migration (§4).
- `save()` writes `S.chId`.
- `bindSettings()` (about L3605) wires every §3.1 row. Call `typeof musicVolumes==='function' && musicVolumes()` and `typeof setGore==='function' && setGore(...)` on change.
- Replace the hp writes at about L452 and L769 with `playerHurt`. Change the `hurt()` signature and call sites (§5.2). Extend `hostileNear`.
- **Scarcity:**
  - `take()` (about L1913): `at = clock + NODE[k][2] * D().nodeK`.
  - The butcher `o.respawn = clock + D().animalRespawn` (GORE replaces the butcher body but must keep this expression).
  - `LOOT` meat comes from `D().meat`.
  - `EVENTS.wolves` takes n from `D().pack`.
  - `revive()` sets hp `HP[kind] * D().foeHpK`.
- **`updateStats` (about L3767):** food and water drain `× D().drainK`, chill `× D().chillK`, then `matClock()`. Hp death now goes through the new `die()`.
- **`die(why)` (about L3090) rewrite:**
  - `if (canBeDowned()) return downed(why)`.
  - Else, by mode: `rescue(why)` (today's code) / `rescue(why)` plus penalty / `permadeath(why)`.
- **`downed(why)`:**
  - `P.downed = 25` s. Aro lies in the `samplePose(P.h,'death',0.5)` pose through `applyPose` (order 10). Low camera via `camShot`. Input ignored.
  - In `updateSena`, a top branch makes Sena run to P (`walkTo` at run speed). At 1.2 m she kneels (`work` pose) for 2.5 s, then: hp 25, `emit('revived',{who:'P'})`, a Sena line, and on Hardcore she uses up a bandage or poultice and sets `S.downedDay = S.day`.
  - Each hostile hit while downed counts. A third hit, or the timer running out, means the mode's death.
  - `canBeDowned`: Sena within 40 m and not downed herself, `!P.swim`, plus the Hardcore rule in §3.4.
- **Survivor penalty:** lose all carried meat, fish, cooked, grilled and bread, plus half the fibre and berries. `S.weakUntil = S.gh + 24`, which gives stamina cap 70 and hp regen ×0.5 (the stamina line in updatePlayer reads `matStamCap()`). Closeness unchanged.
- **`permadeath(why)` / `endRun(cause)`:**
  1. `busy`.
  2. `fadeTo` a non-graphic grief beat: Sena kneels and holds his hand; the camera is on her and the sky; never blood.
  3. Write the memorial (§4.4). The epitaph comes from templates, for example: "Aro, who made the first fire. He lived {days} days in the valley and was loved."
  4. `deleteGame()`.
  5. Show `#obit`: stats, cause, epitaph, and a "Return to the valley" button that reloads.
  6. `endRun('sena')` (called by CMB or ARC) uses both names and "Embers" wording.
- **Hardcore:** hide `#btn-save`. The autosave every 20 s and on visibilitychange stays.
- Build `choose()`, `BUS`, `playerHurt`, `skipHours`, `D()`, `diffK()`, `GAME_KEYS` (§5).

**G hooks:** `G.mat = {D, diff:()=>S.diff, setDiff(mode, custom), canLower, endRun, downed:()=>P.downed, stones:()=>JSON.parse(localStorage['hearthborn-stones']||'[]'), respawnAt(k)}`, plus `G.playerHurt`, `G.skipHours`, `G.choose`, `G.on`, `G.emit`.

**Acceptance (headless):**
1. Clean profile: `#gate` visible and `#btn-new` disabled. Click "I am 21 or older" → `settings.ageOk===1`, `settings.blood==='on'`. After a reload, `#gate` is hidden.
2. Clean profile, "Use toned-down mode" → `blood==='off' && gore==='low' && romance==='fade' && !finisherCam`.
3. New game → `#newgame` shows 3 cards. Pick Hardcore → `S.diff.mode==='hardcore' && S.diff.perma`. Pause → `#btn-save` hidden.
4. With all stats above 35 and no regen interference, food drain over 20 s of game `clock` on Hardcore is 1.3 × Survivor, ±10%.
5. `G.playerHurt({dmg:10,kind:'bite'})` → hp −6 on Story, −10 on Survivor, −16 on Hardcore.
6. Survivor, Sena within 10 m, `S.hp=0` → `P.downed>0`. `until S.hp===25` within 40 s of game time. `G.emit` logs `revived`.
7. Survivor, Sena teleported 200 m away (`G.N.pos.set(...)`, `G.N.wait=999`), `S.hp=0` → after the fade: `S.inv.cooked===0 && S.weakUntil>S.gh`.
8. Hardcore with no bandage or poultice, `S.hp=0` → `localStorage['hearthborn-save-v2']===null`, the stones length goes up by 1, `#obit` visible. `/api/save` DELETE observed.
9. Load a fake v2 save without `diff` (tests/t4.json listener trick) → `S.diff.mode==='survivor'`, `S.diff.graceUntil>0`, errors=0. A v2 save at `ch:8` (hearth) → `S.chId==='hearth'` and `S.arc.legacy===true` (once ARC's CH is in place; before that, the hearth index is unchanged).
10. `G.skipHours(5)` → `S.gh` goes up by 5, and an `on('hours')` spy receives `{h:5}`.
11. `G.choose('t','T',[{label:'A'},{label:'B'}])` plus key Digit2 resolves to 1. A `req:()=>false` option cannot be chosen.
12. `G.mat.respawnAt('berry')===170*1.3` on Survivor. Every settings row persists across a reload.
13. `tests/final/play.json` still passes, run on Story difficulty.

---

### M2 GORE: Blood, wounds, hunting realism. New `src/gore.js`; section `// ---------- GORE ----------`

**Files:**
- `src/gore.js` (new)
- `src/main.js`: GORE section; replace the butcher block; hooks in `wpnKnock` and `wpnPuff`
- `index.html`: `#splat` canvas and the `#hurt` layers
- `src/animals.js`: one hook. `makeAnimal` must **clone each mesh material per instance** before `patchWoundMaterial`, because `SkeletonUtils.clone` shares materials and otherwise every deer would bleed.

**gore.js API:**

```js
initGore(scene, getHeight, quality)      // pools: drops InstancedMesh 384, splats InstancedMesh 160, mist sprites (puffTex tint 0x7a0c0c)
setGore({blood, gore, screenBlood})      // multipliers: particles 0.4/1/1.8, splat size 0.7/1/1.3, uGore 0.5/0.8/1
bloodBurst(pos, dir, n, {heavy, kill})   // 35° cone around dir, 2-5 m/s, gravity 9.8, drag 0.8, streak scale along velocity; ground contact -> splat p=0.35
groundSplat(x, z, size, kind)            // kind 'blood'|'trail'|'pool'|'scuff'; terrain-normal aligned quads, polygonOffset, wet 0x4a0606 -> dry 0x2a0d08 over 120 s; rain fades x4; FIFO
staticDecal(hitPoint, normal, size)      // DecalGeometry on non-instanced static meshes (walls, cave shell, landmark stones); cap 24; queued 1 frame; skipped on 'low'
patchWoundMaterial(mat)                  // onBeforeCompile: vBind = position (pre-skinning); uniform vec4 uW[8], float uWet[8], uGore, uHands; noisy sphere mask -> dark wet red, roughness 0.25
addWound(model, worldPt, rWorld, {wet})  // nearest-bone inverse transform into bind space (radius / matrixWorld max scale; the new GLBs carry x100 armature scale); 8 slots FIFO
clearWounds(model)
screenSplat(angleRad, amt)               // DOM canvas #splat, 3-6 pre-rendered splatter sprites at the edge facing the attacker; slide 30 px over 2 s
updateGore(dt, env)                      // integrate drops, age splats, drips from wounds, heartbeat pulse
stats()                                  // {drops, splats, decals, wounds} for tests
```

**Tasks:**

1. **Blood on hits.** Add an `on('animalHit', 50)` listener:
   - `bloodBurst(point, dir, n)` with n = 6/14/28 by gore level, ×2 on a kill.
   - `addWound` on the victim.
   - `wpnKnock` keeps its dust puff only when `settings.blood==='off'`.
   - Delete the "(no blood)" comments.
   - Sounds through `A`: flesh thump (lowpass noise 400 Hz plus 140→70 Hz pitch drop), bone crack (2 kHz click) on heavy hits, spatter (band noise 1.5-3 kHz, 60 ms). Route them to `A.sfx || A.out`.
2. **Hit zones on prey.** Add an `on('animalHitPre', 20)` listener. Convert `point` with `o.root.worldToLocal`, normalised by the model extent.

   | Zone | Region | Damage | Bleed (hp/s) | Notes |
   |---|---|---|---|---|
   | head/neck | front 25%, upper half | ×3 | — | `e.crit` |
   | heart/lung | front-mid, lower | ×2 | 0.5 | |
   | gut/hind | — | ×0.8 | 0.08 | |
   | leg | low y | ×1 | — | `o.limp`: speed ×0.6, Walk timeScale 0.7 |

   - A clean kill is a single hit to head or heart, or a thrown spear from 12 m or more. It sets `o.clean = true`.
3. **Wounded prey.**
   - While `o.bleed > 0`: hp drains, the animal flees, speed scales with hp.
   - At hp ≤ 35% it beds down in cover: a forest `landSpot` 60-150 m away; plays `Idle_Headlow`, then `Death` paused at t≈0.35 as a lying pose.
   - Bleeding to 0 counts as a kill.
   - Trail: every `lerp(2.5, 0.8, bleedNorm)` m, a `groundSplat(...,'trail')` with `trailId = o.id`.
   - Blood off: `'scuff'` kind (brown) instead.
4. **Mercy kill.** In findTarget: a bedded prey within 2.5 m while `P.sneak` → "End its suffering (E)".
   - A short kneel and strike: `P.h.swing('strikeU')`, a 0.6 s camShot side view (cut away on Gore Low).
   - Approaching without sneaking makes it bolt (re-flee).
5. **Hunter's Focus (hold Z).**
   - Sneak speed.
   - Trail splats within 40 m get emissive ×4 through `instanceColor` and a pulse.
   - An arrow sprite points along the last-seen trail direction.
   - Sena line, once per trail: "It is bleeding. This way."
6. **Butchering** (replaces the loop at about L1922; keep the `D()` respawn and meat expressions):
   - Hold E: 2.5 s for small game, 4 s for big. Kneel pose `work`, close `camShot` (wide on Gore Low).
   - 3 cuts at `strikeU` timeScale 1.2. Each cut is a 6-drop spurt plus a squelch.
   - Pool `groundSplat(...,'pool')` grows 0.2 to 1.2 m over 6 s.
   - The carcass stays 120 s with Main/Main_Light swapped to a flesh look (`0x7a2620`, roughness 0.45; skip when Blood is off), scale ×0.9, then fades and hides. **Respawn timing is unchanged.**
   - `o.clean` gives a **Prime hide** (+1 hide, toast). Five or more hits gives Poor (−1, minimum 0).
   - Bloody hands: `uHands = 1` on Aro's material (vertex mask from hand, lowerarm and finger joints). It decays in water (`P.pos.y < 0`, 5 s) or slowly over 10 game minutes.
7. **Screen feedback.** Add an `on('playerHit', 70)` listener:
   - `screenSplat(bearing(from) - camYaw, dmg/12)`.
   - `#hurt` heartbeat when `hp < 35`: opacity on a 70-110 bpm curve plus an `A.tone(55)` thump.
   - Bleeding edge pulse while `typeof survBleeding==='function' && survBleeding()`.
   - Desaturation `saturate(.4+.6*hp/35)` on `high` quality only.
   - All of this needs `screenBlood`, and is halved with `reduceFlash`.
8. **Deaths.**
   - Terrain conform after the Death clip ends: sample `getHeight` at head and tail (±0.6 × length) and both sides, and slerp up to the normal over 0.3 s.
   - Keep integrating `o.kb` for 0.4 s after death.
   - Hitting a corpse gives a small burst plus a flinch spring.
9. **Humans** (Aro, Sena, raiders): patch materials at load and call `addWound` on `playerHit` (who P or N). The same `uPaint` vec4 array gives the tribe's grey ash hands and face (`patchWoundMaterial(mat, {paint:[...]})`), used by CMB.

**G hooks:** `G.gore = {stats, burst, splat, wound, clear, focus:()=>focusOn, trail:(o)=>trailCount(o.id), hands:()=>uHands}`.

**Acceptance:**
1. Blood on. `G.spawn('deer', x, z)` near P, then `G.hurt(deer, 2, {point: deerPos+(0,.9,0), dir})` → `G.gore.stats().drops > 0` within 3 frames, and `.wounds >= 1` on that deer only (another deer's material uniform has no wounds: proves per-instance materials).
2. Gut zone (local point at the hindquarter) → `deer.bleed≈0.08`, deer flees. `until G.gore.trail(deer) >= 3` within 60 s of game time. Later `deer.state==='dead'` or bedded.
3. Thrown spear at the head zone with 20 dmg (flint) → dead in one hit, `deer.clean===true`. Butcher hold → `S.inv.hide` goes up by LOOT + 1 and a "Prime hide" toast.
4. Butcher: after 4.5 s of holding E → the carcass is still visible with the flesh colour, `G.gore.hands()===1`. Teleport into the river → `< 0.2` within 6 s.
5. `settings.blood='off'` → hits give `drops===0`, a puff count above 0, trail splats of kind `scuff`, carcass material unchanged.
6. Stress: 500 `G.gore.burst` calls → `stats().drops <= 384`, `splats <= 160`, `decals <= 24`, errors=0. On `low`: decals 0, pools halved.
7. `G.playerHurt({dmg:10, kind:'bite', from:wolf})` → `#splat` has drawn more than 0 sprites. With `screenBlood=false` → 0.
8. Hold Z near a trail → its splats' `instanceColor` brightness ×4 (read back from the instanced attribute).
9. Bedded deer plus `P.sneak` within 2.5 m → `G.target.label` matches "End its suffering".
10. Visual (Intel GL) screenshots: spray on an axe hit, a trail on grass, the butcher pool, wounds on a deer, the Blood Off comparison.

---

### M3 SURV: Injuries, illness, spoilage, cooking. New `src/survival.js` (pure functions plus tables, unit-testable); section `// ---------- SURV ----------`

**Files:**
- `src/survival.js` (new)
- `src/main.js`: SURV owns `eat()`, `drinkSkin()`, `fillSkin()`, `heal()`, the river-drink line, the `structTarget` `fire`, `rack`, `basket` and `well` branches, the herb `NODE` entries, and the new RECIPES (below)
- `src/world.js`: herb Fields **appended after flint/ochre** so felled-tree field indices are kept
- `index.html`: `#moodles` row under `#bars`, `#body` panel

**New recipes** (in `RECIPES`, with `ch:`):

| Recipe | Cost | Chapter |
|---|---|---|
| bandage | fibre 3 | fire |
| hidebandage | hide 1, fibre 1 | hunt |
| splint | stick 2, fibre 2 | fire |
| boilbag (tool) | hide 1, fibre 2 | hunt |
| pot (tool) | clay 3, fired at the fire | clay |
| ypoultice | yarrow 2, fibre 1 | hunt |

**Herb nodes:**

| Herb | Where | Respawn (× `nodeK`) |
|---|---|---|
| yarrow | meadow and valley | 260 s |
| mint | within 6 m of the river | 240 s |
| willow bark | riverbank bushes | 300 s |

Reuse the NAT bush/flower models and tint them.

**Affliction table (`AFF` in survival.js)**, all timers in game hours:

| id | Cause | Effect | Cure |
|---|---|---|---|
| `bleed` sev 1/2/3 | Bite 25%/50% chance (sev 2 if hp < 40); claw or gore (aurochs, bear: sev 3); raider cut 40%; fall over 4 m (sev 1) | −0.15 / −0.4 / −0.8 hp/s; drips; wolves detect ×2 | Fibre bandage stops sev 1; hide bandage or yarrow poultice stops 2-3; Survivor sev 1 clots in 60 s |
| `wound` | Stopped bleed | Infection-risk ring fills over 12 h | Clean it with a poultice, boiled-water rinse (pot or bag at a fire), or Sena tending |
| `infection` | Risk full: 35% Survivor / 70% Hardcore | Fever: warmth ±15 swings; hp regen off; stamina cap −30; Survivor hp floor 20 | 2 doses (willow tea or yarrow poultice) at least 12 h apart, plus rest |
| `sprain` (ankle) | Landing from a drop over 2.5 m (50%; 100% over 4 m); thrown from a horse | Speed ×0.7, no sprint or jump, limp | 24 h (each slept hour counts double); splint halves it and allows sprint |
| `fracture` (leg) | Drop over 6 m (Hardcore; Survivor gives sprain sev 2); a fall at a gallop | Speed ×0.35, no sprint or jump, pain vignette | Splint, then 72 h. Riding ignores leg penalties. "Lean on Sena" (Sena menu) walks both at ×0.6 |
| `poison` | Eating raw (40%/60%), spoiled (70%/90%) or undercooked (25%) | Onset 1-2 h, then for 12 h: an episode every about 90 s real time (stop, kneel 1.2 s, camera sway, −10 food, −12 water; **no vomit visuals**), stamina cap 50 | Rest plus water; mint tea cuts the remaining time by 60% |
| `dysentery` | Unsafe water: lake biome or marsh 15%/30%; river 0%/8%; well and boiled water always safe | 36 h: water drain ×2.5, food ×1.5, stamina cap 60 | 4 boiled drinks plus rest, or mint tea |
| `hypo` | Risk fills while warm < 20 (90 / 45 game minutes) | Stamina cap 50, warmth gain halved, −0.1 hp/s while warm < 20 | 10 h sheltered by a fire, a Snug sleep, or a hot-spring soak (instant) |

- **Story:** `addAff` returns false (bleed is visual only, 10 s).
- **Survivor:** max 3 active, one new affliction per 10 game minutes at most, hp floor 10 from afflictions, grace until `hunt`.
- **Hardcore:** no caps after the first 24 h.

**Spoilage** (`S.age[k]` = FIFO list of `S.gh` stamps; `give()` gets a one-line `// SURV` hook `survGive(k, n)`; eating takes the oldest; 1 Hz tick). Times in game hours:

| Food | Survivor | Hardcore |
|---|---|---|
| raw meat | 24 | 12 |
| raw fish | 12 | 8 |
| cooked | 72 | 48 |
| grilled | 48 | 36 |
| berries | 96 | 72 |
| bread | 120 | 96 |
| dried, driedfish, grain | never | never |

- The basket (`S.stashAge`) spoils at ×0.5. A basket inside a cave (`depthAt(basket) > 0.5`) spoils at ×0.35.
- Spoiled food becomes `spoiled`. It can be eaten (risky) or used as farm compost: "Mulch the plot", +25% growth, in the `structTarget` farm branch via a one-line hook.

**Cooking:**
- Survivor and Hardcore replace the instant Cook/Grill with a spit at the fire.
- "Put meat on the spit" holds up to 3 pieces (`s.spit = {items, t}`). World-space bar: 0-7 s undercooked, 7-15 s cooked (green window), over 18 s burnt (lost).
- E takes them off. Walking away keeps cooking, so they can burn.
- Story keeps the instant cook.
- **Boil:**
  - Boil bag at a fire: "Boil water (hot stones)" sets `S.skinQ='safe'` and fills the skin in 20 s (hold).
  - Pot: 8 s, and unlocks teas: herb + boiled water gives `minttea` / `willowtea`.
- **Water quality:**
  - `fillSkin()` takes a source argument: the well is safe; river and lake are raw.
  - The HUD chip shows "Waterskin 2/3 (river)".
  - `drinkSkin` with `skinQ==='raw'` rolls dysentery (Hardcore only).
  - River drink (findTarget line) rolls by `biome()`.
- **Rack:** yields `dried` / `driedfish` (+30 food, never spoils) instead of cooked. Survivor and Hardcore take 3 game hours; a storm (`world.env.storm > 0.5`) pauses it.
- **Eat raw:** hold F 0.6 s when only raw food is left: +20 food plus the poison roll. `eat()` priority: cooked, grilled, bread, dried, berries.

**Modifiers:** `affMods(S)` returns `{speed, stamCap, stamRegen, foodK, waterK, chillK, warmGainK, noSprint, noJump, regenK, aimWobble}`. Read it at:
- `updatePlayer`: speed, sprint, jump, the stamina line
- `updateStats`: drains, chill, regen, hp floor
- WPN aim: `aimWobble` adds to the arc sway, via a one-line hook in `wpnAimPose`

The limp is a procedural override (order 40, thigh/calf dip at the step phase), or the `limp` loop from anims2 if `P.h.has('limp')`.

**Fall damage:** `updatePlayer` tracks the peak `P.pos.y` while `P.air`. On landing: `emit('land', {drop: peak - y, water: P.pos.y < SWIM_Y})`. No damage into water. Over 4 m: `playerHurt({dmg:(drop-4)*8, kind:'fall'})`.

**UI:**
- **`#moodles`:** 26 px round SVG icons with a severity ring (yellow, orange, red), a draining arc for time or risk, a pulse when worsening, and a `title=` tooltip giving cause and cure in one line.
  - Icons: drop (bleed), bandaged cut (wound), haloed cut (infection), ankle, bone, stomach, droplet stomach, snowflake.
  - With Blood off the bleed icon is grey.
- **Body screen (I):**
  - A parchment overlay (map styling) with an SVG paper doll of 6 regions (head, torso, arms, legs).
  - The selected part lists its afflictions with timers.
  - Buttons: Bandage, Splint, Poultice, Clean (boiled water), Drink tea, Treat all. Each is a 1.5-2.5 s hold with `P.h.swing('pickU')`.
  - Also shows a feels-like temperature line and the waterskin state.
  - Pauses on Story and Survivor; real time on Hardcore.
- **Sena acts:** register into ROM's `SENA_ACTS` (typeof-guarded):
  - `tend`: Sena within 2.5 m, no hostiles. Treats everything she can with the pack, bandage plus clean in one step, +1 Closeness once a day, a line ("Sit. Let me see that leg.").
  - `lean`: available with a fracture.
- On Hardcore, Sena can be bitten (`S.naff`). The player treats her with E → "Bandage Sena" (+2 Closeness).
- **Rest:** `on('rested')`: affliction timers advance 2 h per slept hour. A house bed pauses infection progress. Resting together heals ×1.5. Set `R.healLine` for the RST outcome toast ("The ankle feels stronger.").
- **Hot spring:** the soak cures `hypo` and doubles sprain healing (one-line hook in `soakTogether`).

**G hooks:** `G.surv = {add(id, part, sev, who='P'), list(who), treat(id, item), mods(), eatRaw(), spoilTick(), land(drop), rng(seed), body(open), skinQ:()=>S.skinQ, ages:()=>S.age}`.

**Acceptance** (use `G.surv.rng(seed)` for deterministic rolls):
1. Hardcore: `G.surv.add('bleed','legL',2)` → hp drops at least 3.5 over 10 s of game time. `G.give('hidebandage'); G.surv.treat('bleed','hidebandage')` → bleed gone, `wound` present with `risk > 0`.
2. Then `G.skipHours(13)` with rng forced → `infection` present, and `G.surv.mods().regenK===0`.
3. Story: `G.surv.add('bleed','legL',2)===false` and `S.aff.length===0`.
4. `G.surv.land(5)` (Survivor) → `sprain`, `mods().speed≈0.7`, holding Shift does not raise `P.speed` above the jog cap. `G.surv.land(7)` on Hardcore → `fracture`.
5. Inventory only `meat:1`, then `G.surv.eatRaw()` with forced rng → food +20; `G.skipHours(2)` → `poison` active.
6. Survivor: `G.give('meat',1); G.skipHours(25)` → `S.inv.meat===0 && S.inv.spoiled===1`. Stored in the basket: `G.skipHours(25)` → still meat.
7. Rack in Survivor → after `G.skipHours(3)` the yield is `dried`. Then `G.skipHours(500)` → still dried.
8. Survivor fire with meat: the target label is "Put meat on the spit". After 10 s of game time, E → cooked +1. A new piece left 20 s → lost.
9. Boil bag plus fire: hold boil → `S.skinQ==='safe'`. Well fill → safe. River fill → raw.
10. `#moodles` shows one icon per affliction. KeyI opens `#body` and lists them. "Treat all" uses up the matching items.
11. An old save with no `aff` or `age` loads with errors=0. Inventory food gets stamped on the first tick.
12. `tests/final/play.json` passes on Story; on Survivor it passes with the instant-cook steps replaced by spit steps.

---

### M4 CMB: Combat v2, predators, raider AI, Sena vulnerability. New `src/combat.js`, `src/enemies.js`, `src/tribe.js`; section `// ---------- CMB ----------`

**Files:**
- `scratchpad/tools/strip_glb.mjs`, `public/models/anims2.glb`
- `src/people.js`: load anims2; add to SHOTS `hitChest:'Hit_Chest', hitHead:'Hit_Head', roll:'Roll', knock:'Hit_Knockback', stagger:'Idle_Shield_Break', getUp:'LayToIdle'`; add to UPPER `swordA/B/C:'Sword_Regular_A/B/C', hookU:'Melee_Hook', overU:'OverhandThrow'`; add to EXTRA `block:'Sword_Block'`; add to LOOPS `limp:'Zombie_Walk_Fwd_Loop', consume:'Consume'`
- `src/animals.js`: `bull` (glb, 0.44), `bear` (glb, morph wrapper)
- `src/main.js`: CMB section; hooks in `wpnPrimary`, `wpnAimStart` (brace), `wolfBrain`, `EVENTS.wolves`, `updatePlayer`, `updateSena`
- `public/models/animals/bull.glb`, `public/models/animals/bear.glb`, credits

**Tasks:**

1. **HP and damage rebalance** (multiply by `D().foeHpK` and `dmgK`):

   | Target | HP |
   |---|---|
   | deer | 8 |
   | stag | 12 |
   | fox | 3 |
   | wolf | 14 |
   | alpha | 30 |
   | aurochs | 90 |
   | bear | 120 |
   | raider | 40 |
   | Korr | 80 |

   | Weapon | Damage |
   |---|---|
   | fists | 2 |
   | stone axe / flint axe | 6 / 9 |
   | spear jab, stone / flint | 5 / 7 |
   | thrown spear, stone / flint | 12 / 22 |

   GORE zones multiply on top.

   | Enemy attack | Damage to Aro |
   |---|---|
   | wolf bite | 8 |
   | alpha bite | 14 |
   | aurochs gore | 25 plus knockdown |
   | bear swipe | 22 plus knockdown |
   | maul fail | 30 |
   | raider melee | 10 |
   | raider heavy | 18 (red, unblockable) |
   | raider spear throw | 12 |

2. **Stamina economy:**
   - Light attack 10, heavy 22, dodge 18. Block drains stamina by dmg ×1.5. At 0 stamina the guard breaks: 1 s `stagger` shot.
   - Regen 18/s after a 0.8 s delay (gate the existing regen line with `cmbRegenOk()`).
   - Below 20% stamina: swings ×0.8 speed plus a breathing loop.
3. **Combos and heavy (in `wpnPrimary`):**
   - 0.25 s input buffer.
   - Axe: `swordA`, `swordB`, `swordC`. Spear: jab, jab, thrust (existing procedural). Fists: jab, cross, `hookU`.
   - Holding LMB 0.4 s gives a heavy: posture ×2, damage ×1.8, slower.
4. **Block and parry (RMB with axe, fists or torch):**
   - `block` sampled at mid-clip as an upper-body override, order 15 (the WPOSE technique).
   - Covers the front 120°. Damage reduction: axe 80%, torch 60%, fists 50%.
   - **Parry:** block pressed within 0.18 s before impact → `e.cancel`, attacker `o.stagger = 1.2`, posture +50, 0.2 s slow-motion (scale `dt` through the hitStop mechanism), a wood/stone clack. Wolves are knocked back 2 m.
   - Red attacks cannot be blocked.
   - Hooks into `playerHitPre` at order 10.
5. **Dodge (AltLeft):**
   - `roll` shot, 3.2 m in the movement direction (backward if idle). i-frames from 0.10 to 0.40 s (`e.cancel` in `playerHitPre`).
   - **Perfect dodge** (within 0.15 s of impact): 0.4 s slow-motion and a counter window (next hit ×1.5).
6. **Telegraphs:**
   - Every enemy attack has a 0.35-0.6 s windup and an additive glint sprite at the jaws or weapon: white means parryable, red means dodge.
   - Wolves: the existing `o.pending = 0.35` becomes the windup with a white glint.
7. **Posture:**
   - `o.posture` 0-100 from hits and parries; it regenerates 15/s when not hit for 2 s.
   - At 100: `o.stagger = 2` and a small bar over the head.
8. **Finishers (findTarget "Finish (E)"):**
   - Valid targets: staggered or downed enemies, bedded prey (GORE owns prey mercy), or unaware humans approached from behind while sneaking.
   - Snap the victim to `P + fwd·0.95`. `camShot` side view, 2.2 m, FOV 45. Time scale 0.35 for 0.25 s.
   - Moves by weapon: spear downward thrust; axe `swordC` overhead; fists (humans only) `hookU`, then `cross`.
   - Emits `hurt(o, 999, {kind:'finisher', zone:'neck'})` so GORE adds the double burst.
   - Gore Low: the camera cuts to the sky at impact. `finisherCam` off: no cut, no slow-motion.
9. **Spear brace:**
   - RMB held with the spear while a charger (aurochs, bear) is within 6 m in the front 50° cone → "Brace!" prompt; aim is suppressed.
   - On contact: 45 damage, the charger is staggered, finisher available.
10. **Player hit reactions** (on `playerHit`): `hitChest` / `hitHead` upper shot when dmg ≥ 6. Knockdown on gore or claw: `knock`, then 1.2 s down, then `getUp`.
11. **Predators (`enemies.js`):**
    - **Alpha wolf.**
      - One per pack after `house` (always on Hardcore). Scale 0.42, Main ×0.55, grey Main_Light.
      - Pack members circle at 6-8 m and attack on its howl, or when Aro has faced away for 2 s.
      - Killing the alpha makes the rest of the pack flee (`o.leave = true`).
      - Drops `pelt`. Recipe `mantle` (pelt 1, fibre 2): a cloak with chill ×0.4 that replaces `S.tools.cloak`'s ×0.5. `S.legend.alpha`.
    - **Aurochs.**
      - A herd of 4 (one calf at scale 0.25) on the north plain via `landSpot`. Neutral grazing.
      - Hitting one, or coming within 8 m of the calf, triggers a charge: 0.8 s paw plus snort, red glint, a straight dash at 11 m/s for up to 15 m, `Attack_Headbutt`.
      - Hit reacts map to `Idle_HitReact_Left/Right` by side.
      - Drops meat 12, hide 3, `horn`.
    - **Cave bear** (morph wrapper with the same `{play, update, root}` API as `makeAnimal`):
      - Den 25-40 m from `CAVES[1].mouth` (Flint Deep), placed with `landSpot` on first load and saved in `S.legend.bear`.
      - FSM:
        1. Forage.
        2. WARN at 25 m: stop, rear up (procedural pitch about the hind feet), roar.
        3. If Aro backs off or sneaks away: CALM.
        4. If Aro stays or comes within 15 m: BLUFF charge (50%, stops at 4 m), otherwise CHARGE.
        5. SWIPE: red glint, 22 damage, sev 3 bleed, knockdown.
        6. If Aro is down: MAUL QTE, mash E 8 times in 2.5 s. Success is a spear push-off; failure is 30 damage.
        7. FLEE at 20% hp.
      - A lit torch facing it scares it 50% of the time.
      - Death: freeze the morph, then a procedural topple (θ'' = 9·sin(θ+0.1) up to 85°), then terrain conform.
      - Drops meat 8, `bearhide` 3, `claws`. Recipe `bearcloak` (bearhide 2, fibre 3): chill ×0.3.
      - Never respawns once dead.
12. **Raider AI (`tribe.js`; M5 consumes it):**
    - `makeTribesman({chief, female, name})` uses `people.makeHuman` with `hair:'buzzed'`, `beard`, grey ash paint via GORE `uPaint` (fallback: material colour ×0.8), and a bone necklace mesh on `neck_01`. Weapons from `makeSpear` / `makeAxe` / `makeTorch` in sockets.
    - **Perception:**
      - Cone 110°, 30 m by day and 14 m at night.
      - ×1.8 with Aro's torch lit, ×0.5 sneaking, ×0.6 in forest.
      - Hearing: sprint 20 m, walk 8 m, sneak 2 m, combat 35 m.
      - Detection-meter sprite: white, then orange, then red.
    - **FSM:** PATROL/CAMP, SUSPICIOUS, SEARCH (20 s), COMBAT, then FLEE (hp < 25%, leader dead, or 2 allies dead) or DOWNED.
    - **Combat roles:**
      - brawler: 3.5 m ring, attack tokens, max 2 in melee
      - thrower: holds 10-14 m, spear every 4 s using the `spearStep` integrator
      - torchbearer: throws a torch at the nearest struct (`s.scorch += 0.5`; the visual darkens the materials). M5 decides the consequences.
      - leader: Korr
    - Windup, strike (70° cone, 2.2 m), 0.5 s recover. Block chance 25%, +20% per repeated player attack type (last 3).
    - **DOWNED with `surrender: true`:** kneels (`work` pose), drops the weapon, prompt "Decide (E)", which calls `choose('surrender', ..., [{label:'Spare him'}, {label:'Kill him'}], {def:0})`. ARC records the result. **Never auto-kill.**
    - **Target selection** is `[P, N]` plus structs only. `console.assert` that the target is never a kid. Raiders never enter caves (`depthAt > 0`).
    - API: `spawnRaider(x, z, opts)` returns a foe. `foes[]`, `updateFoes(dt)`, `clearFoes()`.
13. **Sena vulnerability:**
    - `S.nhp` takes damage via `playerHurt({who:'N'})` from raiders, and on Hardcore from wolves (30% of bites retarget to her when she is within 3 m).
    - Sena fights: every 3 s she throws a stone or her spear at the nearest foe within 12 m (4 damage).
    - At 0 hp she is downed (`sitHold` / death pose) for 60 s. Revive: E hold 2 s, or a poultice.
    - Outcome by mode: Story is immune; Survivor auto-recovers at 25 hp with −5 Closeness; Hardcore calls `endRun('sena')`. Mature story Off: Sena only gets downed, never dies.

**G hooks:** `G.cmb = {block(on), dodge(), heavy(), posture(o), state(o), spawn(kind, x, z), brace:()=>bool, stam:()=>S.stam, glints:()=>n}`, plus `G.foes`, `G.spawnRaider`.

**Acceptance:**
1. `G.P.h.has('block') && has('roll') && has('swordA') && has('limp')`. The `anims2.glb` file is 2.5 MB or less. No console warnings about missing clips.
2. Axe drawn, `G.cmb.block(true)`, front `G.playerHurt({dmg:8, kind:'bite', from:wolfInFront})` → hp loss ≤ 1.6 and stamina reduced. The same hit from behind → full 8.
3. Parry: block 0.1 s before a wolf's `pending` resolves → the wolf's `stagger > 0` and no hp loss.
4. `G.cmb.dodge()`, then a hit at 0.2 s → cancelled.
5. Six light swings from 100 stamina → `stam ≤ 45`. At 0, a blocked hit → `P.stagger > 0`.
6. Hitting a raider repeatedly fills posture; at 100, the target label is "Finish". E → raider dead. With `finisherCam=false`, `camShot` stays null.
7. `G.cmb.spawn('bear', ...)`: P teleported 20 m away → state `warn` within 3 s. Teleport 35 m → `calm`. Teleport 10 m → `charge` or `bluff`.
8. Aurochs charge with RMB held and spear → `brace()===true`; on contact the aurochs hp drops by at least 45.
9. Kill the alpha → every pack member has `leave===true` within 1 s.
10. `G.spawnRaider(...)` near P → a white or red glint is seen (`G.cmb.glints() > 0`) before the first damage. A raider at hp < 25% flees. With `surrender:true` at 0 hp → kneel plus a "Decide" prompt; Esc → spared (default).
11. Spawn a kid 2 m from a raider for 30 s → the raider's target is never the kid (logged).
12. Hardcore, Sena at 0 hp for 61 s with no revive → `endRun` called with `'sena'`. Survivor → `S.nhp===25` after 60 s.
13. `tests/final/play.json` passes on Story (the existing wolf fight still works with the new HP).

---

### M5 ARC: Mature story, choices, tribe beats, epilogue. New `src/arc_data.js` (lines, vignettes, epitaphs); section `// ---------- ARC ----------`; ARC now owns the `CH` array

**Files:**
- `src/arc_data.js`
- `src/main.js`: CH, `goalsOf`, `roman`, `showChapter` season label, migration (§4.5), ARC section
- `src/caves.js`: `smearHands()` greys out handprints on the existing panel
- `src/entities.js`: `BUILD.cairn` (stacked stones plus an ochre handprint), `BUILD.brazier`
- `src/landmarks.js`: dynamic POI `camp` from `S.arc.campPos`
- `index.html`: season line on `#card`, "Memories" tab in `#map`

**Chapter list (19, in 4 acts; ★ = new and `mature: true`):**

| # | id | Act / season |
|---|---|---|
| I-VI | awaken, fire, hunt, shelter, cave, herd | Summer, "The Valley" |
| VII | ★smoke | Autumn |
| VIII | ★outcast | Autumn |
| IX-X | clay, house | Autumn |
| XI | ★winter | Winter, "The Long Cold" |
| XII | ★raid | Winter |
| XIII | ★fever | Winter |
| XIV | ★reckoning | Winter |
| XV-XVI | hearth, seeds | Spring, "What Grows" |
| XVII | ★bond | Spring (not mature-gated; handfasting) |
| XVIII-XIX | newlife, village | Spring |

**Code mapping:**
- `roman(n)` becomes a general function.
- `goalsOf(ch)` (`goals` can be a function) replaces all 5 reads: `drawQuest` at about L251, `rstMorningLine` at about L2998, `maybeBirth` at about L3165, the frame advance at about L3943, and `G.goals`.
- `newlife` keeps 5 goals in the same order: goal 0 becomes "Bound at the stones" (`S.arc.bonded`). Legacy saves treat bonded as `close >= 60`.
- **Recipe chapter moves:** basket `hearth` → `hunt`; fence `hearth` → `house` (palisade); new `brazier` (raid: stick 3, stone 2), `cord` (bond: fibre 4, ochre 1), `beads` and `carving` (house; ROM gifts).
- Every `onEnter` is idempotent: guard spawns with `S.arc` flags, because it also runs on load.
- `say()` speaker colours for Korr, Tamu, Wena and Pell.

**`arcChoose(id, title, opts, cfg)`:**
- Wraps `choose()`.
- Writes `S.arc.choices[id]`, runs `fx`, adjusts `approve` and `mercy` (clamped to ±10), pushes `memory {day, id, text}`.
- Toasts "Sena will remember that." when the approval change is 2 or more. Calls `save()`.
- The chapter-end card shows a one-line recap of that chapter's choices.

**Chapters** (lines from the research are in `arc_data.js`; samples in Appendix A):

| Chapter | Goals and key beats | Choices and state |
|---|---|---|
| **smoke** "Other Fires" | Find the strange smoke (cold camp prop at `LM.ruins`, `coldCamp`); go back to Echo Hollow (`smearHands()`, `cnt('ash_seen')`); meet the strangers at the north ford (daylight, P within 30 m of `FORDS[0]`: Korr plus 3 on the far bank, not hostile) | **Ford** (timed 12 s, default 3): 1 Share 2 cooked → tribe `wary`, mercy +1. 2 Threaten → `hostile`, mercy −1. 3 Hold your spear → `wary`. 4 [close ≥ 40] Let Sena answer → approve +2, `S.arc.healOffer = true` (peace route) |
| **outcast** "The Wounded Stranger" | A blood trail (GORE trail splats, or scuffs) to the Great Tree; Tamu has a spear in his side | 1 Help (carry home walking or on horseback; poultice) → `tamu='guest'`, approve +2. 2 Kill → quick, cut away; approve −3, mercy −3; goal "Bury him" (cairn). 3 Leave → `tamu='gone'`. Goals are branch-dependent via `goals()` |
| clay (existing) | If Tamu is a guest he digs too. **Jealousy beat:** day+1 at dusk, Sena and Tamu laugh at the fire (`sitTalk`) | 1 Join them → approve +1, `tamu='friend'`. 2 Walk away → a later Sena line. 3 Tell her to keep away → `romRift(1, 'jealous')` |
| house (existing) | Adds the goal "Make peace with Sena" while `rift > 0`. **Reconciliation** at Mirror Lake at dusk | 1 "I was afraid." → rift 0, +5, embrace (ROM). 2 "I was wrong." → rift 0, +3. 3 "I will not be sorry." → rift stays one more day |
| **winter** "The Long Cold" | onEnter: season `winter`, chill ×1.8, berry nodes yield 0, herds halved, a storm every other night (`EV`). Goals: store 8 dried or cooked food in the basket; survive 5 nights (`cnt('slept') - winterStart >= 5`); answer the strangers at the door. Meal option "Give your share to Sena": food −15, +2 | **Door** (night, untimed; Wena and Pell): 1 Share → stash −6, they winter in the hut, `wena='saved'`, approve +3, mercy +2. 2 Refuse → 2 days later an empty snow camp by the ruins with Wena's sling (no bodies), approve −4, `wena='lost'`. 3 Trade food for the camp location → `campPos` revealed, `wena='traded'` |
| **raid** "Fire in the Night" | Pell warned you (if `saved`): one day's notice and a choice; otherwise a surprise at 20:00. **Children are moved indoors first and are untargetable** | **Stand or run.** Defend: light 4 braziers or the palisade; waves of `{story:3, survivor:5, hardcore:6}` raiders via `spawnRaider`; torchbearers scorch structs. Mid-fight: guard the **stable** (`home.burned = true`, homeliness −3) or the **house** (`horseFate = 'taken'`). Flee to Echo Hollow: stash lost, hut burned, horse taken unless ridden out. **Always:** Sena takes a spear wound (`senaWound='bleeding'`, not killable here). Tamu: guest or friend dies shielding Sena (cairn at the Great Tree); gone means he is a raider, and the surrender choice makes him `dead` or `traitor`. Fallback if `spawnRaider` is missing: a narrated fade with the same consequences |
| **fever** "Bitter Roots" | Sena in bed (RST lie, `sick` variant: slow breath). `S.arc.fever` +6 per game hour. Goals: stop the bleeding (poultice on Sena at the bed); willow bark ×2; yarrow ×2; cave moss ×1 (an ARC node in Flint Deep); sit with her through the night. Each remedy −25 to −35 fever | **Vigil:** RST extension `rstBegin(s, 'dawn', {vigil:true})`: Aro sits on the bed edge holding her hand (`rstHoldOverride`), time-lapse with fever lines. Fever reaches 100: Story/Survivor → `senaWound='scarred'` (N speed ×0.85, a permanent line); Hardcore → `endRun('sena')` ("Embers"). **Recovery morning** → `romFirstKiss()` (ROM) |
| **reckoning** "Blood and Ash" | Find the Ash camp (`campPos` east of Horse Meadow via `landSpot`; 4 raiders at a fire, stealth-able); face Korr; if taken, bring Dawn home | **Korr:** 1 Kill (duel; Korr does not surrender) → mercy −3, tribe `hostile`. 2 Spare (after beating him) → oath, tribe `wary`. 3 Peace (no fight; needs `approve >= 4` or door `share` or `healOffer`) → give seed grain, tribe `allied`. The horse returns in every branch. Thaw: music, a foal born in the meadow (`spawn('horse', ..., {scale:0.26, follow: mare})`) |
| hearth (existing) | If `home.burned`, first goal "Repair the scorched walls" (`hold E`, uses `s.scorch`) | |
| seeds (existing) | If tribe `allied`, they bring grain and the grain goal drops to 3 | |
| **bond** "The Cord and the Stones" | Closeness 75; braid the cord; go to the standing stones at dusk with Sena; speak your vow | Handfasting (ROM `romScene('handfast')`): ochre cheek marks, the cord on both wrists, **vow** choice of 3 → `S.rom.vow`, kiss, dance, fade night. `S.arc.bonded = true` |
| village (existing) | `epilogueExtras` reads `S.arc` | Variants: **Ash and Hearth** (allied: grey and ochre hands together in the cave); **The Palisade** (Korr killed); sling on the Great Tree (door refused); the scar line; Tamu's cairn line; the vow quote. Legacy saves get the neutral version |

- **Graves:** `BUILD.cairn` placed at the beat location and recorded in `S.arc.graves`. E "Remember" once a day when Sena is within 8 m gives +1 Closeness.
- **Mature story Off:** the ★ chapters (except bond) are skipped with `skipFx`. That sets `tribe='allied'`, `tamu='none'`, `wena='none'`, and `romFirstKiss` is triggered by ROM's fallback.
- **New VIGNETTES:** 2-3 pairs for each new chapter id.

**G hooks:** `G.arc` (getter `S.arc`), `G.setArc(patch)` (deep merge), `G.arcChoose(id, i)` (resolves the open choice or runs fx directly), `G.raid()`, `G.fever(v)`, `G.goalsOf`.

**Acceptance:**
1. New game: `G.CH.length===19`, and the ids are in the order above. `G.setCh('winter')` → card text "Chapter XI" and season line "Winter".
2. Migration: a fake v2 save with `ch:6` → `chId==='clay'`; `ch:8` → `'hearth'` and `arc.legacy`; `ch:11` → village runs once. v1 saves still map correctly (re-run `tests/final/old.json` with expected ids updated).
3. `G.setCh('smoke')`, teleport to the ford by day → Korr spawned (not hostile). The choice opens; `G.arcChoose('ford', 0)` → `choices.ford==='share'`, tribe `wary`, memory length +1, cooked −2.
4. `settings.matureStory=false`, `G.setCh('herd')`, complete the herd goals → the next chapter is `clay`. The raid never spawns.
5. `G.setCh('raid'); G.raid()` → `G.foes.length >= 3` (or `S.arc.raid.narrated` without CMB). After the waves, `senaWound==='bleeding'` and `raid.done`. Reloading mid-raid causes no duplicate foes after load.
6. Kid present during the raid (setArc `wena:'saved'`) → Pell is indoors or hidden and never in any `foe.target`.
7. `G.setCh('fever'); G.fever(95); G.skipHours(2)` on Survivor → `senaWound==='scarred'`. On Hardcore with perma → `endRun('sena')` is called.
8. Fever cured (`G.fever(0)`) → the ROM first-kiss choice opens (or a line if ROM is absent).
9. `G.setArc({tribe:'allied'})`, `G.setCh('village')` → the epilogue lines include "Ash and Hearth".
10. `goalsOf(newlife).length===5`. With `bonded` plus the cradle and nursery done, `maybeBirth` still triggers (existing WP6 test).
11. `tests/final/play.json` with matureStory off passes unchanged except for the chapter count.

---

### M6 ROM + MUS: Romance (non-explicit) and adaptive music. New `src/romance.js`, `src/music.js`; sections `// ---------- ROM ----------`, `// ---------- MUS ----------`

**Files:**
- `src/romance.js`: pure pose-override factories using `ik2`, `applyPose` and `rotW`
- `src/music.js`
- `src/main.js`: ROM and MUS sections; one-line hooks in `sitTogether`, `addClose`, `rstOpen` / `rstChoose` / `rstBegin` (RST extension), `updateSena`, `A` routing
- `index.html`: nothing new (`#choice` and the audio rows come from MAT)

**ROM tasks:**

1. **Tiers** on `S.close`:

   | Range | Tier | Unlocks |
   |---|---|---|
   | 0-19 | Companions | — |
   | 20-39 | Fond | Sena follows at 1.2 m instead of 2; hold hands at 25 |
   | 40-59 | Close | Embrace; shared bench; forehead kiss on leaving and returning home (auto, short) |
   | 60-79 | Devoted | Kiss, after `firstKiss` |
   | 80-100 | Beloved | Sena takes his hand by herself after he has been away 60 s or more; rests her head on his shoulder at the bench |

   The `#bar-close` label shows the tier name.
2. **Sena menu.**
   - findTarget entry (§5.5): N within 2.2 m, no hostile within 20 m, neither of them busy, riding, resting or sitting.
   - Hold E 0.3 s → `choose('sena', 'Sena', SENA_ACTS.filter(when))`.
   - Registry `SENA_ACTS = [{id, label, when, act}]`. ROM registers: Talk (a chapter VIGNETTE pair, `talk` pose), Hold hands, Embrace, Kiss, Give a gift. SURV and CMB register tend, lean and revive.
3. **Hold hands** (25 or more):
   - N snaps to P's right at 0.55 m, matching heading and speed. Speed is capped at jog.
   - Sprint, swim, draw, jump or `hostileNear(20)` breaks it.
   - `romHand` override, order 30: both `ik2` to the midpoint of the two hand bones, pinned at pelvis height − 0.12 and 0.08 forward, elbow pole down and back.
   - +1 per day after 60 s of walking.
4. **Embrace** (40 or more):
   - 3.5 s, `rstShot` two-shot at shoulder height, side-on, 1.6 m. Bodies face each other 0.32 m apart.
   - Aro's hands go to `N.spine_03 ± right·0.14 − fwd·0.09`. Sena's go to `P.spine_03 + up·0.10 ± right·0.12 − fwd·0.08`.
   - Head yaw ±0.35, `spine_02` lean 0.06. Orders: arms 30, spine and head 15.
   - +2 per day.
5. **Kiss** (60 or more and `firstKiss`):
   - Starts from the embrace. Head yaw back to 0, Aro's head pitch −0.18, both lean 0.05.
   - Hold 1.2 s, then foreheads together 1.5 s.
   - Profile silhouette camera against the fire or sky. Two-note `A.tone` sting.
   - +2 per day.
   - `romance:'fade'` → fade to black when the embrace starts, then resume.
   - `'off'` → hand, embrace, kiss and night options are hidden.
6. **Shared bench** (40 or more): a one-line hook in `sitTogether` puts both on **one** bench at local Z ±0.35. `romShoulder` override (order 15): Sena's spine and neck roll toward Aro; Aro's far arm `ik2` to her far clavicle + 0.04 up.
7. **Heart events** (once each, at the next fire sit or rest after crossing the threshold; +2 each):
   - 20: Sena's mother.
   - 40: Dain, told at Lookout Peak at night (sit, starry `camShot`).
   - 60: an almost-kiss broken by a wolf howl.
   - 80: a carved horse figurine (+1 homeliness via `S.c.figurine`).
   - 100: "I want a child with you, Aro." (words only).
   - `G.heart(n)` forces one.
8. **First kiss** `romFirstKiss()`:
   - Called by ARC at fever recovery.
   - **Fallback** when ARC is skipped, Mature story is off, or the save is legacy: at the first fire sit with close ≥ 60.
   - Scripted lines (Appendix A), then `choose` "Kiss her" / "Hold her hand".
   - Kiss → `firstKiss = S.day`, +10. Hand → +5, and the kiss is offered again at the next fire sit.
9. **Fade-to-black nights** (RST extension):
   - Shows in `rstOpen` as option 3, "Go to bed early, together", when all of these hold:
     - close ≥ 70
     - `firstKiss` is set
     - a house bed exists
     - `S.time` is 19-23
     - `rift === 0`
     - no hostiles
     - the last night was at least 2 days ago
     - `settings.romance === 'full'`
     - kids are asleep in the cradle or nursery (not in their bed)
   - Sequence:
     1. Sena sits at the hearth.
     2. 2 lines.
     3. Embrace, then a 1.2 s kiss two-shot.
     4. `fadeTo` black with a 3.5 s hold and a seasonal line (Appendix A).
     5. `rstBegin(s, 'dawn', {together:true, skipTo:'night'})` (new option: start already lying down).
   - Then RST's normal wake. Buff `Content`: chill ×0.8 and rest tier +1. +3 Closeness, `nights++`, morning line "You are smiling in your sleep. Still."
   - Place the §2 guardrail comment verbatim above this function.
10. **Rift and neglect:**
    - `romRift(n, cause)` is called by ARC.
    - While `rift > 0`: hand, embrace and kiss answer "Not now." and Sena steps back. `addClose` gains are halved (a one-line hook in `addClose`). Sena sleeps apart (RST `together = false`, line "I will sleep by the fire tonight.").
    - **Neglect:** 3 days with no shared act (sit, meal, hand, embrace, gift, rest together; tracked by `S.rom.lastShared`) → −1 per day, plus one Sena line.
11. **Gifts** (one per day, via the Sena menu):

    | Gift | Effect |
    |---|---|
    | flowers | existing +3 |
    | `beads` (ochre 1, stone 1, fibre 2) | +4 once |
    | `carving` (wood 1) | +3 once |
    | first-snow gift in winter | +3 |
    | raw meat | −1, "Charming." |

12. **Handfasting** `romScene('handfast')`, used by ARC bond: two-shot at the stones, ochre cheek decal (small plane on the head bone), a cord mesh between both `hand_*` bones, the vow choice, kiss, `dance` loop, fade night.

**MUS tasks:**
- **Buses.** Refactor `A`: `A.out` is the master (keeps `settings.volume`). `A.sfx`, `A.amb` and `A.mus` gains connect to it.
  - `A.hit` / `A.tone` go to `A.sfx`.
  - Wind, cricket, rain, river and chirp go to `A.amb`.
  - `musicVolumes()` applies `settings.music`, `sfx` and `amb`. MAT's sliders call it.
- **`music.js`** is procedural:
  - pentatonic drone pads (2 detuned saws, lowpass)
  - bone-flute melody (sine with vibrato plus a noise breath)
  - frame drum (lowpass noise burst)
  - lookahead scheduler on `ctx.currentTime + 0.4` s, so it survives 5 fps
- **States** (3 s crossfade): `title`, `day`, `night`, `cave` (`env.cave > 0.5`), `danger` (`hostileNear(30)`), `combat` (a hit in the last 6 s), `fire` (sitting), `romance` (ROM scene), `grief` (ARC beat or `died`), `raid`.
- **Stingers:** chapter card, POI discovery, level-up-free "thaw" theme, death lament.
- Duck music by −6 dB while `#sub` shows a line.

**G hooks:** `G.rom = {tier:()=>name, menu:()=>ids, hand(on), embrace(), kiss(), night(), firstKiss(), rift(n), gift(k)}`, `G.heart(n)`, `G.music = {state:()=>s, force(s), buses:()=>({m, s, a})}`.

**Acceptance:**
1. `S.close=30`, Sena within 2 m, hold E → the choice lists Talk and Hold hands, but not Embrace or Kiss. `S.close=65` without `firstKiss` → no Kiss.
2. `G.rom.hand(true)`, hold W 5 s → N's distance to P is 0.55 ± 0.15 and the hand-bone distance is < 0.12 m. Sprint → hand-holding ends.
3. `G.rom.embrace()` → `camShot` is set, and within 1 s Aro's hand_r is within 0.15 m of Sena's back target. +2 once per day (the second call the same day gives +0).
4. `settings.romance='off'` → the menu has no hand, embrace, kiss or gift-kiss options. `'fade'` → `#fade` opacity is above 0.9 during the embrace.
5. Night option: set all conditions → the rest menu has 3 options. Choose 3 → `rstState` reaches `night` with both lying (`P.rest > 0 && N.rest > 0`), `S.rom.nights===1`, buff `Content`. Kid awake in the house → option hidden.
6. `G.rom.rift(1)` → `addClose(4)` gives +2, and the menu kiss answers "Not now.".
7. `G.heart(60)` plays once; a second call is a no-op. With ARC skipped, the first fire sit at close ≥ 60 opens the first-kiss choice.
8. Screenshots (Intel GL): hand-holding walk side view, embrace two-shot, kiss profile, shared bench. **Review them for guardrail compliance:** clothed, no clipping that reads as suggestive.
9. Music: `G.music.state()==='day'` by day; `G.spawn('wolf', near)` → `'danger'` within 3 s; sitting → `'fire'`. Music slider 0 → `G.music.buses().m===0`, and effects still audible (`s > 0`).
10. `tests/final/play.json` passes, errors=0.

---

## 8. Order, parallelism and conflict rules

| Phase | Work | Notes |
|---|---|---|
| A | **M1 MAT** alone | Smallest WP; unblocks everyone. Freezes `fresh()`, `ITEMS`, settings, `BUS`, `choose`, `playerHurt`, `hurt` signature, keys |
| B (parallel) | **M2 GORE**, **M3 SURV**, **M4 CMB**, **M6 ROM+MUS**; **M5 ARC** starts on data, CH, migration, `arcChoose` and the non-combat beats | All cross-WP calls are `typeof fn === 'function'` guarded, so each WP tests alone |
| C | **M5 ARC** integrates the raid (M4 `spawnRaider`), fever herbs (M3 nodes and items), first kiss, rift and handfasting (M6) | |
| D | Integration QA: full playthrough on Story and Survivor, plus a Hardcore permadeath run, plus guardrail screenshot review | |

**Shared-file rules:**

| Area | Rule |
|---|---|
| `fresh()`, `ITEMS`, `DEFAULTS`, settings UI, `GAME_KEYS`, `die()` | **MAT only** |
| `CH` | **ARC only** |
| `world.js` | SURV appends herb fields; ARC appends the `moss` node **after** SURV's (the field order must stay stable for `S.felled`) |
| `people.js` | CMB (clip tables); ROM touches nothing (uses existing `ik2` / `applyPose`) |
| RST section | ROM option 3 and `skipTo`; ARC `vigil`; MAT `emit('rested')`. One-line hooks only, each tagged |
| `findTarget`, `updateSena`, `updatePlayer`, `updateStats`, `structTarget`, keydown | One tagged line per WP, in the orders given in §5.5 and §5.8 |
| Credits | CMB adds the bear credit to the README and `public/models/CREDITS.txt` |

**Per-WP test hygiene:**
- Every WP writes `scratchpad/tests/<wp>/*.json` and appends a progress entry to `scratchpad/progress.md`: built, deviations, G hooks, evidence, gaps.
- Every WP re-runs `tests/final/play.json` and `npm run build`.

---

## 9. Balance targets (for QA)

| Mode | Expected experience |
|---|---|
| Survivor | First death unlikely before `shelter` for an attentive player. Spoilage forces one rack or basket decision per in-game day. A 4-wolf pack after `house` is dangerous without block or dodge, and fair with them |
| Hardcore | A median first run ends between `herd` and `winter` |
| Story | Never more friction than the current game |

Closeness by chapter, for romance pacing:

| Point in the story | Closeness |
|---|---|
| house | about 45 |
| winter | about 55 |
| after fever (vigil +5, first kiss +10) | about 70 |
| bond | 75 or more |

---

## 10. Appendix A: core lines (the full set goes in `arc_data.js`)

**Ford**
- Korr: "This water runs down from our hills. The deer that drink it are ours."
- Sena: "Then the rain is yours too. Come and take it back."
- Korr: "Your woman knows roots. Ours are coughing blood. Send her to us, and keep your river."
- Sena: "I am not sent. If I go, I walk."

**Outcast**
- Tamu: "Finish it, or help me. Only do not stand there looking."
- After a kill:
  - Sena: "He was on the ground, Aro."
  - Aro: "So was the wolf by the river. It still bit."

**Jealousy**
- Sena: "When the fever had you in the cold hills, I sat with you three nights. Should I have let you burn, so no one would talk?"

**Reconciliation**
- Sena: "Afraid I would leave? I walked out of the cold hills beside you. I chose that. I keep choosing it."

**Winter**
- Sena: "Eat."
- Aro: "I ate already."
- Sena: "You lie badly, Aro. You always did."

**Door**
- Wena: "Not for me. For him. He has not eaten in four days."
- Refused, later. Sena: "Do not say anything. There is nothing that would be right."
- Shared. Sena: "We had enough for two. It turns out we had enough for four."

**Raid**
- Pell: "Korr says the valley feeds no one who does not bleed for it."
- Sena: "It is nothing — Aro, I cannot feel my hand."
- Tamu: "Tell her… it was a good stitch she sewed."

**Fever**
- Sena: "Is it summer? You said we would go to the lake when it was summer."
- Aro: "We will. Stay."

**First kiss**
- Sena: "You did not sleep."
- Aro: "I did not want to miss it."
- Sena: "Miss what?"
- Aro: "You, waking up."

**Reckoning**
- Korr: "You came alone. Either you are brave, or she is dead."
- Spare. Aro: "I have buried enough this winter."
- Kill:
  - Sena: "Is it over?"
  - Aro: "It is over."
  - Sena: "Then why are your hands still shaking?"

**Vows** (choose one)
- "Where you walk, I walk."
- "I will keep the fire, and the fire will keep you."
- "I have nothing to give you but every day I have left."

**Fade night**
- Sena: "Bank the fire, Aro. Then come to bed." / "Leave it. Come here."
- Card: "The hearth burned down to embers, and no one rose to feed it."
- Winter card: "Outside, the snow kept falling. Inside, no one was cold."

**Affection**
- "Your hand is cold. Give it here."
- "Stay like this. A little longer."
- "You still look at me like the first day."

---

## 11. Open questions for the user (do not block the build; defaults in brackets)

1. **Sena can die on Hardcore** (not revived in 60 s, or the fever is failed), which ends the run with the "Embers" memorial. [Default: yes, Hardcore only, and only with Mature story on.]
2. **"Harrowing" story intensity** (a lost first pregnancy in winter). [Default: **not built**. It needs the user's explicit request.]
3. **Legacy "Continue as Lio" after a Hardcore death.** [Default: deferred to the next round; this round ships the memorial and "The Stones".]
4. **Age notice wording** says 21+ as the user asked. It is a self-declaration with no verification. [Default: as written in §2.7.]
---

## 12. USER DECISION UPDATE (2026-11-13), overrides §2 where they conflict

The user asked for a stronger 21+ tone. Apply these changes on top of §2:
- **Violence, stronger:** dismemberment of ENEMIES (raiders) and PREDATORS/PREY is allowed in combat: severed limbs on heavy/finisher kills, decapitation finishers on raiders with an axe, brutal finisher animations, more blood volume, persistent blood decals, bloody bodies. Keep it combat/hunting violence. Still NOT allowed: torture mechanics or prolonged cruelty toward the helpless as spectacle (a surrendered raider is still only killed by an explicit player choice; the kill is quick).
- **Defaults:** Blood = Full, Gore = High (dismemberment on), Romance = Full, Mature story = On. The toned-down options stay in Settings but are opt-in, not default. The title notice still appears once.
- **Romance tone:** more passionate, adult dialogue and kiss/embrace scenes are fine. STILL strictly non-explicit: no sex scenes, no sexual content or innuendo beyond adult tenderness, no nudity/undressing; fade to black at the embrace; next morning.
- **Children:** unchanged and absolute. Lio, Pell and any child are never harmed, targeted, endangered or shown dead; no gore near children.
