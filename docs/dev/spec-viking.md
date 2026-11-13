# Hearthborn Book II "The Sea Road": Viking way of life — Implementation Spec (NRS series)

Status: design only. **Build starts after M1–M6 and the M-QA pass have landed and been committed.** It also waits for the current WPN/RST/FPP QA rounds. Suggested file: `docs/dev/spec-viking.md`.
Sources merged: four research passes (Viking games, era and story, assets, technical feasibility, with a perf probe on the real GPU). Nothing in the repo was changed by research.

---

## 0. For the user: the choice in simple words

You asked for a Viking way of life: going on voyages with other people, plus anything else that fits. There is one problem first. **Real Vikings lived about 4,000 years after Aro and Sena.** Vikings had iron, sails and ships with dragon heads. Hearthborn is the Stone Age: flint, fire, the first horses. So we have three ways to do it.

**Option A: "Age of the Northmen" (jump far ahead)**
- The story jumps forward many lifetimes. You play new people, the great-great-grandchildren of Lio.
- Full Vikings: iron axes, striped sails, dragon ships, a mead hall, runes.
- Bad side: Aro, Sena and Lio are gone. Your Book I choices become only old stories. It is almost a second game, so it is slow and expensive to build.

**Option B: "River Wolves" (Viking life, but Stone Age)**
- No time jump. Aro and the villagers build canoes and rafts, travel the river, raid the Ash People, and hold feasts.
- Bad side: Lio is still a small child. No sails, no shields, no ship with a carved head. It may feel like "canoes, not Vikings".

**Option C: "The Sea Road" (RECOMMENDED: the best of both)**
- After Book I ends, you choose "Eighteen winters later…". Aro has a grey beard and is the clan chief. Sena is the healer. **Lio is a grown woman (about 19)** and steers the ship.
- You build a **long wooden ship with a carved horse head and the first sail**, choose your **crew** (each with a name, a job and loyalty), row down the river to **the sea**, sail to **islands**, **trade** amber and bronze, **feast** in a **longhouse hall**, make **vows**, fight the **Grey Sails** (the Ash People's grandchildren, now sea raiders), raid their island fort, and fight a **holmgang** duel.
- Your Book I choices come back: who leads the Grey Sails, Aro's saga name ("Aro the Open Door", "Aro Red-Spear"…), who joins your crew.
- At the very end, a short scene shows **real Vikings a thousand years later**, with a striped sail and iron, singing the saga of Aro, Sena and Lio.
- Why C: you get the voyages, the crew, the ship, the hall and feasts, the raids and the real Viking image, and we keep the family you already love. It is honest to history too. Real people in the North had long rowing ships with animal heads, round shields, bronze swords, longhouses and mead **before** the Vikings. That time is called the Nordic Bronze Age. Only the sail is a small stretch, and the game makes it "the first sail", the way it already has "the first fire".

**How you will see it arrive (each step is playable):**
1. A **dugout canoe** on Mirror Lake and the river, in free play, right after Book I.
2. The **longhouse hall, mead and feasts**.
3. **The ship, the crew, the sea and the islands.**
4. The **7 new chapters** and the Viking ending.
5. (Later, only if you want it) Option A as a bonus "Saga mode" that uses the same ship and crew code with iron and dragon prows.

**Questions for you (defaults are in brackets; we start with the defaults if you don't answer):**
1. A, B or C? [C]
2. In fights, can grown-up Lio be knocked down? [Yes, she can be knocked down but she never dies]
3. Gods: the game's own gods (the Sun-Horse, the Deep, the Hearth), or real Norse names (Odin, Thor) in the Viking ending? [Our own gods in Book II. The ending's skald names Odin and Thor once.]
4. Horned helmets: real Vikings did not wear them. [No horns. Grey Sails wear leather caps, and the ending's Vikings wear plain iron helmets.]

---

## 1. Ranked features (Option C)

Cost: S ≤ 1 day, M 2–4 days, L 5+ days of agent work. "WP" is the work package in §12.

| # | Feature | Inspired by | Impact | Cost | WP |
|---|---|---|---|---|---|
| 1 | **Boats you board and steer**: dugout (free play), plank longboat "Sun-Horse" with oars and the first sail; Valheim gears; wind; buoyancy | Valheim raft/karve/longship, AC Valhalla row vs sail, Pesse canoe, Hjortspring boat | high | L | N2 |
| 2 | **Named crew with roles and loyalty** (Lio, Brann, Kel, Oda, Ysa, Pell or Korr by branch, plus villagers); rowing on benches; permanent loss on harder modes | Expeditions: Viking hird, Banner Saga, Mass Effect 2 loyalty, RDR2 camp | high | L | N3 |
| 3 | **Book II: 7 chapters plus coda**, with Book I choices paying off (Grey Sails leader, bynames, Pell Snow-Born) | Telltale delayed consequences, RDR2 epilogue skip, Witcher 3 adult heir | high | L | N6 |
| 4 | **Sea and islands** as loadable regions (Saltmouth coast, Grey Sea with 4 islands), Gerstner sea, voyage card | Valheim islands, Expeditions: Viking voyage, Banner Saga travel | high | L | N1+N4 |
| 5 | **Longhouse hall, mead and feasts**: feast buff built from your buildings, ring-giving, saga song | AC Valhalla Ravensthorpe feast, Northgard brewer and skald, Valheim comfort | high | M | N5 |
| 6 | **Raids on Grey Sails war camps and their fort**: horn, crew charge, two-person hoard chests, burn beached ships, holmgang | AC Valhalla raids, Bannerlord raid consequences, Bad North dread | high | L | N4+N6 |
| 7 | **Renown, honour and saga bynames**: tiers unlock crew slots, buildings and trade goods | Bannerlord renown tiers, Crusader Kings epithets, RDR2 honour | high | M | N5 |
| 8 | **Sea weather and danger**: daily wind, swell, storms, bailing, man overboard, fog, reefs | Valheim storms (first-voyage dread), Valheim wind HUD | high | M | N2+N4 |
| 9 | **Trade and a bronze tier** (barter with the shell people and the amber folk; bronze knife, axe and sword; round shield; salt) | Valheim Haldor, Mount & Blade trade, Bronze Age amber routes | medium | M | N4 |
| 10 | **Feast vows** (heitstrenging) as optional goals | Norse bragarfull, AC Valhalla feasts | medium | S | N5 |
| 11 | **Rowing chant and travel sagas**: tap in rhythm for speed; crew talk between landmarks | AC Valhalla crew songs | medium | S | N3 |
| 12 | **Blessings at the stones** (one active, timed, with cooldown); trophies unlock more | Valheim Forsaken powers, Jotun shrines, Wolves of Midgard | medium | S | N5 |
| 13 | **Sea Chart** map tab, per-region fog of war, "Set course" auto-helm | Valheim map, Banner Saga | medium | M | N4 |
| 14 | **Saga Wall** in Echo Hollow: a new rock carving per chapter; Oda narrates | Tanum rock carvings, Hades codex | medium | S | N5 |
| 15 | **"A Thousand Winters" coda**: true Viking-age longship and skald | AC framing device, Ghost of Tsushima epilogue | medium | M | N6 |
| 16 | **Norse clothing** from Quaternius outfits on the existing rig | Asset research | medium | M | N3 |
| 17 | Shore defence at Saltmouth (one chapter branch only) | Bad North, Tribes of Midgard | low | S | N6 |
| — | Backlog (not in this round): flyting duels, dice, seasonal sailing calendar, sea life (seals, orca, whale need assets), dog pup, full Option A "Saga mode", walking on a moving deck | Valhalla flyting/Orlog, Northgard calendar | — | — | §15 |

---

## 2. Era and tone rules (for every writer and builder)

- Setting: **Nordic-Bronze-Age flavour**, 18 winters after Book I. It has plank boats with carved animal prows, round wooden shields, bronze (traded, never smelted in the valley), longhouses, mead, rock carvings, the sun-horse cult and bronze lurs (horns).
- It does **not** have iron, runes or Norse god names, except in the coda (§3.3).
- **The sail is "the first sail"**: Sena weaves it from hides and wool, and characters say no one has done this before. This is the only knowing stretch.
- **Gods:** the **Sun-Horse** pulls the sun (it ties to the horse Dawn's line); **the Deep** is the sea, hungry and indifferent; **the Hearth** is the ancestors, with Sena half-revered.
- **Language:** short, plain, poetic lines, like Book I. No modern words. No "Viking" in Book II dialogue. In Old Norse the word means "going on an expedition", and Oda may say "to go a-viking" only in the coda.

---

## 3. Story: Book II "The Sea Road"

### 3.1 Entry and the time skip
- `village` stays unchanged and remains the end of Book I. Free play continues.
- In free play after `village`, the dugout canoe recipe unlocks (N2 phase 1). Players get a first boat right away.
- New prompt at the Standing Stones, after `village` plus 1 game day: **"When you are ready: Eighteen winters (E)"**. It opens a `choose()` confirm that warns the player that Book I free play ends and that a save backup is kept.
- Then: `S.saveBook1 = snapshot` is written to the save (≤ 60 KB), `S.book = 2`, `fadeTo('Eighteen winters passed…')`, and the chapter becomes `grown`.
- Changes during the skip:
  - **Aro:** grey hair and beard tint (people.js tint, not new meshes), and the title "chief".
  - **Sena:** silver hair; healer; the scar line carries over if `senaWound==='scarred'`.
  - **Lio:** leaves `kids[]` and becomes an adult companion: female rig at scale 1.0, Sena's face tint varied, the ranger outfit (§9.3).
  - **The epilogue's 2 village children** are now adults and become eligible crew. Two **new** children are born in the village. They follow the child rules (§13).
  - **Structures:** structs stay. Time advances by 18 × 365 days on the calendar label only. `S.gh` gets +48 game hours, not years, so timers stay sane.
  - **Graves and cairns** remain, with an "overgrown" tint.
  - Pell is an adult in every branch.

### 3.2 Chapters (appended after `village`, each with `book: 2`; ids are stable)

★ = mature-gated. With Mature story Off they play as narrated fades with the same outcomes (the ARC `skipFx` pattern).

| # | id | Title | Region | Goals and beats | Choices and state |
|---|---|---|---|---|---|
| XX | `grown` | Eighteen Winters | valley | Walk the valley with Lio. Raise the **Great House** (hall struct, co-op). Meet **Ysa** at the south ford (a trader who came upriver). Trade a foal or flint for a bronze knife. Find the bee tree; brew the first **mead**. Hold the first **feast** | First feast **vow** (§6.3). Recruit Brann and Oda at the feast |
| XXI | `keel` | The Keel | valley (Mirror Lake) | Fell a great oak, split planks, sew them with cord, pitch the seams (pine resin node), carve the prow. Sena weaves the **first sail** ("give me hides and seven nights": a 7-game-hour wait or sleep). **Launch on Mirror Lake**. Rowing lesson to Oda's chant. Recruit Kel, plus Pell (if `wena==='saved'`) or Korr (if allied) | **Keel tree:** fell the Great Tree (Sena −2, oak bonus: hull hp +20) or go to the Flint Hills oak. **Prow:** Sun-Horse (crew loyalty +), Wolf (Grey Sails morale −), Sun-disc (storm luck: bail rate −25%) → `S.saga.prow` |
| XXII | `riverroad` | The River Road | valley → saltmouth | Row south down the river. Ground at fords and **portage** (carry the hull: hold E with crew, 30 game min). Rapids. Night camp on the bank (crew vignettes). Pass the south gorge → voyage card → **Saltmouth**: first sight of the sea. Survival lesson: seawater makes thirst worse (SURV hook). Meet Ysa's shell people; trade | — |
| XXIII | `amber` | The Amber Strand | sea (Amber Isle) | Open-sea crossing (wind lesson, first swell). The **Thing** at the island stones: no blades may be drawn. Trade for amber, salt and bronze. Settle a dispute. Feast vow round 2. News: the Grey Sails are burning coast camps (only an empty, scorched camp is seen) | **Dispute** (two fishing families, adults, over a stranded whale): 1 split fairly (mercy +1, fame +10), 2 favour the shell people (Ysa +15 relation, the other −20), 3 claim it for the crew (loyalty +5, fame −10, Sena −2) |
| XXIV | `greysails` ★ | Grey Sails | sea | Fog. A Grey Sails attack at sea: spears thrown between ships, grappling, a deck fight (CMB on both decks; the boarding fight is staged with both hulls locked side by side). The leader is revealed (§3.4). A crew member falls (§4.5) | **Chase** them into the fog (fame +25; the fort is easier in `firewater`; Ysa's camp at Saltmouth is found burned and empty, people fled, Ysa −20, Sena −2) or **Turn back** to warn Saltmouth (shore defence at the waterline, §8.4; mercy +2, Sena +2) → `S.saga.grey` |
| XXV | `firewater` ★ | Fire on the Water | sea (Grey Isle) | Lio sets the rule: "No one sleeps in that fort but men with spears. Their families are on the north isle. We burn ships, not cradles." Approach at night by stealth from the water. **Burn their beached ships** with torches. Take back the hoard (two-person chests). **Holmgang** with the leader | **Hoard:** return it to the shell people (mercy +2, fame +15, Sena +2) or keep it and give rings to the crew (loyalty +10 each, Sena −2). **Holmgang outcome:** kill (quick), spare with an oath, or peace (needs branch and approve conditions, §3.4) |
| XXVI | `oar` | The Steering Oar | valley | **Ship funeral** at sunset on Mirror Lake for whoever fell (or Oda, who dies peacefully of age if no one fell; non-graphic). Aro hands Lio the steering oar. Lio's byname is set (§6.5). Then free play: trade runs, raids on war camps, the Far Shore | — |
| — | `saga` | A Thousand Winters | saltmouth (coda dressing) | A cinematic of about 90 s, skippable after the first view. Optional 2 minutes at the helm of a true longship. A skald at a hall fire sings the family saga; a rune carving beside the handprints in Echo Hollow. Returns to Book II free play | — |

`saga` is a coda, not a gameplay chapter: `goals: []`, `epilogue: true`, `book: 2`. `G.CH.length` goes from 19 to **27**.

### 3.3 The coda's Viking image
- Saltmouth is re-dressed with a `coda` flag: a turf hall on the shore and **one close-up procedural longship** (22 m, striped red and white wool sail, shields on the gunwale, horse-head prow, 16 oar ports with NPC rowers as instanced low-cost "rower" rigs, or the existing human rig with LOD).
- Two or three far ships use `q_viking_boat.glb` (CC0) as the far LOD.
- Plain conical iron helmets (procedural), mail as a dark-grey tint on outfit textures, iron axes (`Axe_Bronze` re-tinted to iron).
- Narration (Oda's voice line in the skald's mouth): "A thousand winters later, the ships had striped sails and iron on every bench. But the prows still wore a horse's head, and no one remembered why."
- Skald: "Sing of Aro Fire-Hand, and Sena who walked out of the cold hills, and Lio, who went to find where the sky lies down." The byname is substituted from `S.saga.byname`. If question 3 is answered "yes", one line names Odin and Thor.

### 3.4 Branches from Book I (read `S.arc`; confirm field names against `arc_data.js` at build time)

`rivalOf(arc)` → `S.saga.rival`:

| Book I state | Grey Sails leader | Extra |
|---|---|---|
| Korr killed (`choices.reckoning==='kill'` / tribe `hostile`) | **Vey**, Korr's daughter, blood-feud. "You buried my father under the snow, Aro. I have come to dig." | Holmgang peace needs approve ≥ 6 and mercy ≥ 3 |
| Korr spared (tribe `wary`) | **Harl**, Korr's nephew; the oath-bound trading partner who breaks the oath in `amber` | Peace needs mercy ≥ 2 |
| Peace (tribe `allied`) | **Durr**, a splinter of Korr's sons. Korr: "Some of my sons did not like the taste of peace. They went to the sea to find a sharper one." | **Korr joins the crew**; peace is always possible |
| Mature story Off in Book I (`arc.skipped`) | Durr (as allied) | — |

**Pell** (independent of the leader):
- `wena==='saved'` → Pell is in **your** crew.
- `wena` is `'lost'` or `'traded'` → **Pell Snow-Born** steers the Grey Sails' ship. He recognises Wena's sling on the Great Tree. "I remember a door. Warm light on the edge of it. Then it closed."
  - At the holmgang, if you carry the sling (pick it up from the Great Tree in `grown`), a third option appears: reconcile. Pell joins and Sena says "We had enough for two. It turns out we had enough for four."
- `wena==='none'` → no Pell.

**Kel's arc:** Kel's loyalty and Book II mercy decide.
- At `firewater`, if `kel.loyal ≥ 40` and `S.saga.mercy2 ≥ 0`, Kel is redeemed: "I wanted songs. I did not know songs cost this."
- Otherwise he deserts before `firewater` and stands among the fort's warriors, as an adult combatant. If he yields, the `choose()` options are spare or kill.

### 3.5 Core lines (the full set goes in `src/saga_data.js`)
- Narration (grown): "Eighteen winters. The girl who rode old Dawn now rode her foals, and there was grey in Aro's beard."
- Sena: "She looks down the river the way you once looked at this valley." / Aro: "Then she will leave." / Sena: "We left. Look what we made."
- Ysa: "Nine days down your river, the water forgets it is water and becomes the sky lying down." / Lio: "Then I want to see where the sky lies down."
- Sena (keel): "If the wind can bend the grass, it can carry a boat. Give me hides and seven nights." / Oda: "A ship is a tree that has agreed to forget the ground."
- Brann: "I do not like water I cannot stand in." / Kel: "Then sit down and row, big man."
- At the sea: Aro: "It does not end." / Lio: "Everything ends somewhere. I want to find where." / Oda (seawater): "Drink it, and it drinks you."
- Ysa (Thing): "Draw a blade inside the Stones and every shore on this sea will close to you."
- Oda (vow): "Careful. A vow is a debt the gods remember." / Oda (fame): "Cattle die. Kin die. We die the same. Only the song of what you did keeps walking."
- Oda (holmgang): "Three shields each. The hide is the world. Step off it and you are nothing."
- Funeral narration: "They gave Brann the sea he was afraid of, and set it burning, so he would not be cold in it."
- Oar: Aro: "Steer by the sun. Come home by the smoke." / Lio: "And if there is no smoke?" / Sena: "There will be. We will keep the fire."
- Sena (sun-horse): "Look, the sun has a horse too."

---

## 4. Crew system (N3, section `NRS-CREW`)

### 4.1 Roster (`S.crew = [{id, name, look, role, loyal, hp, alive, inCrew, wound}]`)

| id | Who | Role | Passive | Start loyalty | Joins |
|---|---|---|---|---|---|
| `lio` | Lio, ~19, steerswoman and heir. Restless, sharp, unexpectedly kind | Steer | Auto-helm holds course 2× tighter; +10% sail speed when she steers | 80 | grown (always) |
| `brann` | Huge, laughing oarsman; cannot swim | Oar | Row power ×1.5; carries the hull at portage (−40% time) | 60 | grown feast |
| `oda` | Old song-keeper and carver, wry; narrator | Song | Chant window wider; loyalty gain +25% crew-wide | 70 | grown feast |
| `kel` | Young adult, hungry for glory, pushes for cruelty | Fight | Damage +10%; charges first on the horn | 45 | keel |
| `ysa` | Coast-born trader of the shell people; many tongues, never lies about a price | Trade | Prices −10%; translates (unlocks dispute options) | 55 | riverroad |
| `pell` | Branch: saved (crew) or Snow-Born (rival, can join after reconciliation) | Lookout | Warns of storms and ships 2× earlier | 65 | keel / firewater |
| `korr` | Branch: allied only. Old, scarred, proud | Fight + sea lore | Reefs and fog shown on the chart | 50 | keel |
| `v1`–`v4` | Promoted villagers (the 6 looks in `spawnVillagers`, incl. the 2 now-adult epilogue kids) | Oar / Heal / Fight | Small role passive | 50 | free recruit at the hall |

- **Crew cap at sea** (not counting Aro and Sena) follows the renown tier (§6.4): 3 / 4 / 5 / **6 maximum** (the perf cap).
- **Sena** sails by default as healer: treats wounds aboard and on camp; her `approve` and Closeness carry on. At departure the player may choose "Sena keeps the fire". She then stays in the valley, and N follows the RST "apart" pattern.

### 4.2 Loyalty (0–100) — balanced: as many ways up as down

| Up | Δ | Down | Δ |
|---|---|---|---|
| Feast attended | +5 | Hunger at sea (crew food store 0 for 6 h) | −5 |
| Fair share of hoard / ring-giving | +4…+10 | Keeping the hoard while promising a share | −8 |
| Vow kept | +4 all | Vow broken | −8 all |
| Mercy to a yielded warrior (personal: Lio, Oda, Pell, Ysa +3; Kel −2) | ±3 | Reckless loss (a crew member dies with renown < 50 or while you fled) | −6 all |
| Rescued them (downed or overboard) | +8 | Left them behind in a region | −15 (that member) |
| Personal quest line done (1 per member, small) | +10 | Drawing a blade at the Thing or a trade camp | −10 all except Kel |

- **Below 30:** grumble lines at camp.
- **Below 15:** the member leaves at the next landing, never at sea, with a farewell line. `inCrew=false`; they stay alive at the hall and can be won back with a gift and a feast.

### 4.3 On board
- The boat is a `THREE.Group`. **Crew `h.root` are children of the boat group** at local seat points, so heave, pitch and roll carry them for free.
- `settle()` gets an `e.boat` branch next to `e.seat`: skip `getHeight`, keep the local seat transform.
- **Stations:** helm (steering oar), benches (rowers), prow (lookout), midship (Sena / passenger). Aro switches station with keys 1–3 (§10.6). Walking on deck is v2 (backlog).
- **Rowing pose** (there is no rowing clip in `anims.glb`, so it is procedural):
  - `samplePose(who, 'sitHold')` as the base.
  - An order-30 override: `ik2` both hands on the oar handle, which moves on an ellipse (stroke phase φ), plus chest pitch ±0.18 rad and slight head counter-pitch.
  - Oars are thin merged cylinders pivoting at the oar ports, driven by the same φ.
  - Empty benches have stowed oars.
  - Rowers are phase-locked to the chant beat.
- **Chant:** the music state `voyage` exposes a beat. Optional: tap Space within ±120 ms of the beat (window ±180 ms with Oda) → row speed +15% and stamina drain −30% for 4 s. No penalty for missing.
- **Travel talk:** every landmark passed, or every 90 s at sea, the next unused line pair from `saga_data.js` plays (recaps, backstories, Lio and Sena moments). It uses the existing subtitle path.

### 4.4 Camp ashore
- On a beach (`Beach the ship` → `Make camp`), a camp panel assigns each crew member one task: Hunt/Fish (+food), Cook (spoilage −, SURV), Tend wounded (wounds heal ×2), Guard (no night ambush), Carve (unlocks a Saga Wall carving early).
- Confirm → RST-style time-lapse of 8 game hours (reuse `rstBegin` night machinery with a campfire framing and crew vignettes).

### 4.5 Danger, death and the funeral

| | Story | Survivor | Hardcore |
|---|---|---|---|
| Crew downed in combat | always revived after the fight | revive within 30 s (E, Sena faster) or dies | same, 20 s |
| Overboard in a storm | climbs back alone | pull back within 30 s (throw a rope: E at the gunwale) | 20 s; drowns otherwise |
| `greysails` scripted fall | Brann wounded, survives | Brann dies unless his loyalty ≥ 70 **and** Aro reaches him within 20 s | same |
| Lio | downed, never killed (pending user Q2) | same | same |

- A death sets `alive=false`, adds a **stone** at The Stones memorial (MAT memorial store) and queues the member for the `oar` ship funeral (or a cairn on the shore in free play).
- Deaths are **non-graphic**: no gore on crew death shots. GORE's dismemberment applies to enemies only, per §12 of the mature spec.

---

## 5. Boats and sailing (N2: `src/boat.js`, `src/sea.js`, section `NRS-BOAT`)

### 5.1 Hull defs (`HULLS` in boat.js; all procedural)

| hull | length × beam | draft | seats | propulsion | speeds (m/s) | hp | cargo | where |
|---|---|---|---|---|---|---|---|---|
| `dugout` | 5.0 × 0.75 | 0.25 | 2 (Aro + 1) | paddles | paddle 1.6, hard 2.4 | 40 | 4 | Free play after `village`; recipe: 1 great log + fire + 2 game h of adzing |
| `longboat` ("Sun-Horse") | 13 × 2.1 | 0.65 | helm, prow, mid, 8 oar seats (4 benches) | oars + one square hide sail | row 2.6, hard 3.2; half sail up to 4, full sail up to 5.5 | 100 (+20 Great-Tree oak) | 18 | Built in `keel` |
| `greysail` | 13 × 2.1 | 0.65 | as longboat | oars + grey sail | same | 80 | — | enemy; wolf prow, grey tint |
| `longship` | 22 × 4.5 | 0.9 | cinematic | 16 oars + striped wool sail | cinematic, or 6 at the helm | — | — | coda only |

- **Hull generator:** loft 9–11 station curves along a sheer line. Clinker strakes come from a canvas plank texture, multiplied by the `T_WoodTrim` albedo and normal (§9) for matching PBR. About 4–6k tris per hull.
- **Dugout:** a lathe or extrude of a log with an adzed interior and bark on the outside.
- **Prow heads:** Sun-Horse, wolf or sun-disc are low-poly carved meshes merged into the hull. The sail is a 6×8 plane with a billow vertex shader (wind × trim).
- One merged geometry per hull, plus the sail, plus the oars instanced: **≤ 4 draw calls per ship**.

### 5.2 Controls and gears (boat key context; N1 adds the keys to `GAME_KEYS`)
- **E** at the hull: board or leave. Weapons stow (`wpnStowAll('ride')` pattern). **E** on sand: "Beach the ship". At a ford: "Carry across" (portage).
- **W/S** step through the gears: `drift → row → hard row → half sail → full sail`. Sail gears exist only on hulls with a sail, after `keel`.
  - Hard row drains Aro's stamina and crew fatigue. At 0 it drops back to row.
- **A/D** steer: rudder authority grows with speed. At gear "row" and speed < 0.6, A/D also differential-rows, so the boat turns on the spot.
- **Q/E** (only on Survivor or Hardcore) trim the sail, with a luff indicator. Story auto-trims.
  - E is shared with leave: hold E 0.6 s to leave; a tap trims.
- **X** reef / un-reef. **B** (hold) bail. **F** horn (raid call). **Space** chant tap. **1–3** station.
- **M** map; on the Sea Chart, "Set course" engages the auto-helm.

### 5.3 Physics (kinematic, no physics engine)
- **Fixed step 30 Hz** with an accumulator: `fixedStep(dt, 1/30, fn)`, max 4 substeps. **This is required.** The frame loop clamps dt to 0.05, and measured fps is 5–20, so behaviour must not depend on fps.
- **State:** position, heading ψ, surge u, sway v, yaw rate r.
  - Sway is damped hard: keel, so leeway is small.
  - Drag `c·u|u|`.
  - Rudder yaw `k_r·u·δ`.
- **Wind** `S.wind = {dir, str, seed}`:
  - It veers slowly (±15° per game hour) and re-rolls each game day. Storms (existing `EV.storm`) raise str and sea state.
- **Sail thrust** `T = k·|W_app|²·Cs(θ_app, trim)·reefK`. The `Cs` polar table:
  - 0 within ±40° of the wind (in irons)
  - peak 1.0 at 90° (beam reach)
  - 0.7 when running
- **Rowing thrust** = Σ rower power (role passive, fatigue, chant bonus).
- **Buoyancy is visual only.**
  - Sample `waveAt` at bow, stern, port and starboard. Drive heave, pitch and roll with critically damped springs (ω ≈ 2.5).
  - The player and crew ride the group.
  - In the valley (lake and river), waves = 0 except a small ripple; the hull sits at y = 0 − draft·0.5.
- **Grounding:**
  - `getHeight` under the bow above `−draft` → stop, with a scrape sound.
  - Sand biome → "Beach the ship".
  - River ford (−0.6) with the longboat → "Carry across": the crew lifts the hull (cut + 30 game min), and the boat appears past the ford on the downstream deep water.
- **Rocks and reefs:** circle colliders in the island def. Hits above 2 m/s cost hp = 8 × speed. At hp 0 the boat is swamped: everyone is in the water near the hull, and it is towed to the nearest beach at −50% cargo. **No permanent loss of the ship.**
- **Storm water:** full sail in sea state > 0.7, or any hard wave hit, adds water to the hull. The bail meter is 0–100.
  - Above 60: speed ×0.6.
  - At 100: swamped (as above).
  - Bailing: B, or 2 crew auto-bail when someone has the Heal or Oar role idle.
  - **No capsize.**
- **Auto-helm** (Set course): steers to a chart pin and avoids island colliders with a simple ray fan.
  - Time compression up to ×20 on open water: `S.gh` advances; crew and sea animate at real rate.
  - It stops at landmarks, events, or land within 120 m.

### 5.4 Sea water (`src/sea.js` + `src/sea_waves.js`, shared CPU and GPU)
- `WAVES` table (one source of truth): 4 Gerstner waves, wavelength 6–60 m, directions spread ±35° around the wind, steepness 0.15–0.35, amplitude × `seaState` (0..1).
  - `waveAt(x, z, t)` returns `{y, nx, nz}`. The GLSL is generated from the same array as uniforms.
  - `t` is the **game clock**, not wall time.
- **Mesh:** a camera-centred polar grid, 96 angular × 48 rings, 0.5 m to 1500 m, snapped to the step so vertices don't swim. About 4.6k vertices, **1 draw**.
  - Wave amplitude fades to 0 in the outer rings. `FogExp2` hides the horizon join.
- **Fragment:** reuse `water.js`: canvas normal and foam textures (export them through a small helper `waterTextures()`), fresnel to sky colour, sun glint, two foam scrolls, whitecaps from crest height.
  - Shore foam and shallow tint come from the island heightmap DataTexture (the river's `uHeight` trick).
- **Opaque with depthWrite on.** Only a thin transparent shallow band near islands uses the existing transparent water material.
  - No planar reflection, no FFT, no render targets (the Polaris12 budget).
- **Hull cap:** a depth-only mesh (colorWrite false, renderOrder before the sea) inside each hull, so no water shows inside the boat.
- **Wake:** a foam ribbon behind the stern (1 draw).
- **Underwater is not supported.** The camera is clamped ≥ wave + 0.3 m. Sea swimming uses `waveAt(...).y` instead of `SWIM_Y`.
- **Comfort:** a new setting "Horizon lock at sea" (default On in FPP): the camera roll is removed and the pitch follows at 30%. The third-person camera distance is ×1.45 at sea (like the ride camera).

---

## 6. Clan, hall, feasts, honour (N5, section `NRS-HALL`)

### 6.1 Buildings (valley; built with the existing co-op build flow; all procedural plus Fantasy Props)

| Struct | Cost (draft) | Effect | Feast buff contribution |
|---|---|---|---|
| **Great House** (`hall`), 18 × 7 m turf-and-thatch longhouse: carved door posts, long hearth, two bench rows (Bench), tables (Table_Large), mugs, Cauldron, Barrel, Banner_1 | wood 40, stone 20, thatch 20, hide 6 | Feasts, crew live here, vows, ring-giving | base: Rested to max; +10 max stamina |
| **Mead brewer** (lean-to: Barrel, Cauldron, Bucket_Wooden_1) | wood 10, clay 6 | honey + grain + berries → mead after 1 game day | +warmth: cold drain ×0.8 |
| **Drying rack** (SURV's rack, existing) | — | — | food regen +20% |
| **Carver's shed** (Workbench, Stool) | wood 12, stone 4 | carve prows, blessings, Saga Wall early | crew loyalty gains +25% for the day |
| **Healer's hut** (Sena; Bag, Bucket, herb bundles) | wood 10, hide 4 | Sena heals crew wounds ×2 at home | bleed resistance (bleed tick ×0.7) |
| **Boatshed** at Saltmouth (`q_hut.glb` re-textured + dock pieces) | wood 14 | repair the hull (wood + resin), store the dugout, home port | — |

The bee tree is a new valley node (honey), appended to world.js nodes **after** existing fields (N1 owns world.js; see §11).

### 6.2 Feast
- **Ring** the bronze lur (horn) at the hall: `G.clan.feast()`. Allowed once per 2 game days.
- **Cost:** mead 2 + cooked or dried food 6. With fewer, a "lean feast" gives half the buff.
- **Scene** (about 40 s, skippable after the first; music state `feast`):
  - Crew and villagers sit on the benches (sit poses). Oda sings the last voyage as a saga (2–4 lines from what happened: `S.saga.log`).
  - **Ring-giving** panel: share hoard items to crew (loyalty).
  - **Vow** choice. A Lio or Sena moment.
- **Buff "Feast-glad":** lasts 1 game day. Base effects plus each building's line from §6.1. It is shown in `#buff`.

### 6.3 Vows (heitstrenging)
- At a feast, choose 1 of 3 contextual vows (`choose()`). One is active at a time. Each becomes an optional goal in the goal list:
  - "I will bring home amber before the leaves fall." (trade amber ×3 within 6 game days)
  - "No one in my crew will die this voyage." (until the next return to the valley)
  - "I will spare the next one who yields."
  - "I will burn a Grey Sails ship." (free play)
- **Kept:** fame +15, loyalty +4 all.
- **Broken:** loyalty −8 all, and Oda's line.

### 6.4 Renown (`S.saga.fame`) and tiers

| Tier | Fame | Unlocks |
|---|---|---|
| 0 | 0 | crew 3, dugout, longboat |
| 1 | 50 | crew 4, carver's shed, Sea Chart routes |
| 2 | 150 | crew 5, bronze axe and sword in trade, healer's hut |
| 3 | 350 | crew 6, blessing slots for trophies, the Far Shore route |
| 4 | 900 | coda helm scene extended, "Saga Hall" banner dressing |

- **Fame sources:** voyages completed +10, new island +15, Grey Sails ship burned +10, war camp cleared +20, feast +5, vow kept +15, holmgang won +40.
- **Fame losses:** fled a fight −10, abandoned crew −20.
- **Honour** is not a new axis. It uses the existing `S.arc.mercy` and `approve`, plus a Book II counter `S.saga.mercy2`, shown as the "Honour" line on the Saga tab:
  - **up:** mercy, fair trade, kept oaths
  - **down:** raiding peaceful sites, broken oaths, abandoned crew
- Honour gates: holmgang peace (§3.4), Thing dispute options, and Lio's byname.

### 6.5 Bynames (`S.saga.byname`, `S.saga.lioName`)
- **Aro** (fixed at Book II entry, in priority order):
  1. Korr killed → **Red-Spear**
  2. allied → **Ash-Friend**
  3. `wena==='saved'` → **the Open Door**
  4. Korr spared → **Oath-Keeper**
  5. else **Fire-Hand**
- Effects: trade price −5% for Open Door and Ash-Friend. Red-Spear means Kel joins with +15 loyalty but Ysa starts at −10.
- **Lio** (set in `oar`):
  - `mercy2 ≥ 3` and the hoard returned → **Peace-Weaver**
  - ≥ 3 Grey Sails ships burned → **Ship-Burner**
  - else **Wave-Daughter**

### 6.6 Blessings (carved at the Standing Stones or the Thing stones)
- One active at a time. Each lasts 3 game hours, with a 12 h cooldown.
- **Base blessings:**
  - **Sea Mother:** tailwind (wind dir set to the heading ±20°), sea state −0.3
  - **Sun-Horse:** stamina regen +30%
  - **Hearth:** cold immunity
  - **Raven:** reveals chart fog within 400 m
- **Trophy blessings:**
  - **Orca tooth** (Skerries): row power +20%
  - **Grey Sail banner** (`firewater`): enemy morale −; they flee earlier
  - **Whale bone** (Far Shore): hull hp regen

### 6.7 Saga Wall
- Each Book II chapter adds one rock-carving decal (ships, horses, suns) to the Echo Hollow painting wall. Reuse the WP3 painting-wall decal approach.
- E reads the chapter's saga verse. The Memories tab gains a "Saga" sub-tab listing `S.saga.log`.

---

## 7. Voyages and other lands (N4, section `NRS-VOY`; regions from N1)

### 7.1 Regions

| id | Size | Content | Gates |
|---|---|---|---|
| `valley` | 640 m, SEG 256 (unchanged, bit-exact) | Book I world plus hall buildings | South river gorge, boat at z > 270 in the river → "Follow the river to the sea" → saltmouth |
| `saltmouth` | 640 m, SEG 192 | The river enters from the north into an estuary. Sand beach, the shell-people camp (Ysa; trade; non-combatants), dock (`q_dock_long`, `q_dock_stairs`), boatshed, a rocky headland, the open sea to the south. Coda dressing flag | North: up the river to the valley (voyage card). South edge of the sea, at z > 250 by boat → `sea` |
| `sea` | 3072 m of open water, with 4 island tiles of 256 m, SEG 128, built lazily (≤ 2 alive) | **Skerries** (seal rocks, storm tutorial, orca-tooth trophy cache in a sea cave); **Amber Isle** (Thing stones ring, amber-folk market with Stall_Empty and Stall_Cart_Empty, non-combatants); **Grey Isle** (the Grey Sails fort: palisade, longhouse, beached boats, war totem; **warriors only**); **Far Shore** (renown 350: whale bay, cliff rune site, a respawning war camp for free-play raids) | Each island's beach → land. The north edge → saltmouth |

- **Voyage card:** leaving a region (by gate or "Set course" to another region) runs a chart cutscene.
  - It reuses the RST time-lapse: the day turns, a vignette, Oda's saga line ("Three days under the sail…"), and game time advances by the route time.
  - The next region loads **behind it** (§10.1).
- **Sea events** while sailing (roll every 4 game h of travel; at most 1 per voyage leg):
  - fog bank
  - squall (storm)
  - a drifting wreck (salvage: random goods; no bodies)
  - a Grey Sails scout boat (fight or outrun)
  - a pod of orcas (ambient fins; v1 fins are a simple procedural mesh)

### 7.2 Trade (barter)
- **Partners:**
  - shell people (Saltmouth)
  - amber folk (Amber Isle)
  - in free play, a Grey Sails truce camp if a holmgang peace was made
- **Relation** −100..100. `price mult = 1.25 − 0.25·rel/100 − byname − Ysa(0.10)`.
- **UI:** two columns, item values summed. Confirm only when ours ≥ theirs. Gifts raise relation (+1 per 10 value).

| Good | Base value | From | Use |
|---|---|---|---|
| hide | 4 | valley | — |
| flint | 3 | valley | — |
| ochre | 5 | valley | — |
| dried meat / fish | 3 | both | food |
| foal | 40 | valley | — |
| honey / mead | 6 / 10 | valley | feasts |
| salt | 8 | shell | SURV: salted meat spoils ×3 slower |
| amber | 15 | amber folk | ring-giving (loyalty), vow goal |
| seal oil | 6 | shell | torch burn time ×1.5 |
| sea-hide cloak | 30 | shell | cloak + wet resistance |
| bronze knife | 35 | amber folk | butcher speed ×1.5; light weapon tier above flint |
| bronze axe (`Axe_Bronze`) | 60 | amber folk, tier 2 | WPN axe damage +25%, chop ×1.3 |
| bronze sword (`Sword_Bronze`) | 90 | amber folk, tier 2 | new WPN melee item (fast, no chop) |
| round shield (`Shield_Wooden`) | 40 | shell | CMB block: frontal reduction 80%, 3-hit durability per fight, repairable |

The bronze items are handed to WPN/CMB through `typeof`-guarded hooks: `wpnAddItem(def)` and `cmbShield(on)`. If those don't exist yet, the item is inventory-only and shows "(cannot be used yet)".

### 7.3 Raids (free play and `firewater`)
- **Raidable sites are only Grey Sails war camps and their fort.** These are built with **only armed adult warriors** in them; non-combatants are never placed there. Peaceful sites (shell camp, amber market, Thing) are **not raid sites** (§7.4).
- **Flow:**
  1. Beach the ship near the camp.
  2. Optional stealth (CMB sneak).
  3. **F horn:** the crew charges (CMB foe AI, crew on the player's side: target = nearest foe; never a non-combatant, by assert).
- **Objectives** (the HUD lists them; the raid ends when all are cleared, or when the foes flee or yield):
  - Warriors defeated, fled or yielded.
  - **Hoard chests** (`Chest_Wood`, skinned with open/close clips). Opening needs **two people**: Aro plus a crew member or Sena within 2 m, then hold E 2 s.
  - **War totem**: chop it down (axe, 6 hits).
  - **Beached ships**: burn them with a lit torch (hold E 3 s; fire VFX; the hull chars).
- A **yielded warrior** → the existing CMB "Decide" `choose()`: **Spare** (default) / **Send home** (mercy +1) / **Recruit** (only with renown ≥ 150 and Ysa or Korr in the crew; joins as a villager-crew at loyalty 30) / **Kill** (quick, explicit, never default).
- **No captives, no thralls, no ransom of people.**
- **Rewards:** hoard rolls (amber, bronze, salt, hides, seal oil), fame. Loot goes into the ship's **cargo** and must be carried home (cargo is lost only by swamping, at 50%).
- **War camps respawn** 6 game days after being cleared (Far Shore only).

### 7.4 Peaceful sites: the rules
- Weapons are sheathed automatically on entering the camp radius.
- Drawing a blade or attacking opens a `choose()`: "Draw your blade here? Honour will be lost and this shore will close." Default is **No**.
- If **Yes**:
  - honour (mercy2) −4, relation −100, crew loyalty −10 (Kel +5)
  - the site's **armed adult guards** (3–4) fight
  - **non-combatants flee indoors and are untargetable and invulnerable** (they despawn inside the huts)
  - huts are closed and cannot be looted or burned while occupied: **all** huts at peaceful sites count as occupied
  - the shore closes to trade for 10 game days, then reopens at relation −50
- Every human has a `role` field: `combatant` | `noncombatant` | `child`. Raid targeting, crew AI, spear hits and fire all go through `canHarm(h)`, which returns false for noncombatant and child. **The dev assert fires if damage is ever applied to one.**

### 7.5 Chart (map v2 extension)
- The parchment is baked **per region** at boot from that region's `getHeight`, biome and POIs (free with the reload model).
- **Fog of war per region:**
  - `S.rg[id].seen` uses the existing 64×64 grid scaled to region size; `sea` uses 128×128 (2 KB).
  - The valley keeps the top-level `S.seen` for back-compat.
- A new **Sea Chart** tab draws regions and islands as nodes and discovered routes as dashed ink lines. It adds `ship`, `wind` and `carving` glyphs to `glyph()`.
- "Set course" pin → auto-helm.
- **Minimap at sea:** wind vane, heading, and the bearing and distance of the nearest land.

---

## 8. Combat at sea and set pieces (N6 with CMB reuse)

### 8.1 Ship-to-ship
- The enemy `greysail` hull is AI-steered: an intercept course.
- Spears are thrown between ships (existing WPN throw; enemies use CMB throw roles). A spear hit on the hull costs hp 2.

### 8.2 Boarding
- When the hulls come within 3 m at a relative speed < 1 m/s, they **lock side by side** (grapple cut).
- The deck fight is on two deck rectangles. In v1 combatants are clamped to a deck nav rectangle per hull, plus a "cross" link.
- CMB foes run with `deckBounds`. Falling off a deck means overboard (§4.5); for enemies it means out of the fight.

### 8.3 Holmgang
- A staked hide, 5 × 5 m, on a beach.
- Each side has 3 shields: shield breaks count down, and at 0 blocks fail.
- Stepping off the hide = forfeit (a loss without death). CMB 1-v-1; the crew watch in a ring and cheer (sounds).
- When the leader reaches 0 hp, or forfeits, the branch `choose()` opens: **Kill** (quick, explicit) / **Spare with an oath** / **Peace** (conditions in §3.4).

### 8.4 Shore defence (`greysails` "Turn back" branch only)
- Two Grey Sails boats land on the Saltmouth beach from two sides. Light 3 warning braziers (reuse the ARC raid braziers), then fight at the waterline.
- Shell-people non-combatants run to their huts at the first horn and are untargetable.
- It succeeds when both boats are driven off or burned.

---

## 9. Assets (paths, licences, plan)

All candidates are already downloaded and inspected (untrusted data) under `/tmp/claude-1000/-home-ashish-Desktop-game/6dfdb715-4157-4569-89fa-7fd9e44a76a2/scratchpad/assets3/` (below: `A3/`).

**Policy:**
- Ship **CC0 only** in v1. The CC-BY candidates are reference only.
- Copy chosen files into `public/models/nrs/`.
- Downscale every texture to **1K JPG** (2K for the hall trim), rewriting glTF `uri`s with a node script `tools/assets/shrink-gltf.mjs` (sharp or canvas; no blender or gltf-transform is installed).
- Add every file to `public/models/CREDITS.txt`.
- **Download budget for Book II: ≤ 15 MB extra**, loaded lazily (only with `S.book===2`, or in the regions that need it).

| Use | Source file (A3/…) | Licence | Tris | Destination | Notes |
|---|---|---|---|---|---|
| Round shield (crew gunwale, trade item, CMB shield) | `props/Exports/glTF/Shield_Wooden.gltf` | CC0 (Quaternius Fantasy Props MegaKit) | 1,404 | `nrs/props/` | Matches the textured style. Instance it along the longship gunwale (coda) |
| Bronze axe, bronze sword | `props/Exports/glTF/Axe_Bronze.gltf`, `Sword_Bronze.gltf` | CC0 | 826 / 1,540 | `nrs/props/` | Bronze Age correct. The coda re-tints them to iron |
| Hall furniture | `props/…/Table_Large`, `Bench`, `Mug`, `Chalice`, `Cauldron`, `Barrel`, `Banner_1(_Cloth)`, `Torch_Metal`, `Stool`, `Bucket_Wooden_1` | CC0 | 152–2,020 each | `nrs/props/` | **Instance** benches, tables and mugs |
| Hoard chest (skinned, open/close clips) | `props/…/Chest_Wood.gltf` | CC0 | 2,546 | `nrs/props/` | Two-person open |
| Loot | `props/…/Pouch_Large`, `Bag`, `Coin_Pile` (re-skin as amber beads) | CC0 | 730–1,062 | `nrs/props/` | Coins are out of era: tint them amber and call them "amber" |
| Carver, workbench | `props/…/Workbench`, `Whetstone`, `Rope_1`, `Crate_Wooden` | CC0 | | `nrs/props/` | |
| Market | `props/…/Stall_Empty`, `Stall_Cart_Empty` | CC0 | 1,496 / 3,936 | `nrs/props/` | Amber Isle |
| Trim textures for hull, hall and runestone | `village/Medieval Village MegaKit[Standard]/glTF/T_WoodTrim_*`, `T_RockTrim_*`; `props/Textures/T_Trim_Props_*` | CC0 | — | `nrs/tex/` | Downscale to 2K/1K JPG |
| Roof and floor pieces (hall interior) | `village/…/glTF/Roof_Log`, `Floor_WoodDark`, `Roof_Support2`, `Door_1_Flat` | CC0 | 32–314 | `nrs/village/` | Optional; the hall shell is procedural |
| Clothing | `outfits/mco/Exports/glTF (Godot-Unreal)/…` Peasant and Ranger (M/F) + Modular Parts (Head_Hood, Acc_Pauldron) + alt colourways `T_Peasant_2`, `T_Ranger_3` | CC0 (Quaternius Modular Character Outfits) | 12.9k–27k per outfit | `nrs/outfits/` | Same 65-bone UBC skeleton. Rebind like the hair in `people.js` L104–109. Hide the body under the cloth (§9.3). **Drop `Feet_Boots` (9k tris) for far crew** |
| Dock and boathouse | `docks/q_dock_long.glb`, `q_dock_stairs.glb`, `camp/q_hut.glb` | CC0 (Quaternius via poly.pizza, META.txt) | 628–1,724 | `nrs/docks/` | Flat-colour: re-material with `T_WoodTrim` |
| Far-LOD Viking ship (coda only) | `boats/q_viking_boat.glb` | CC0 (Quaternius, poly.pizza/m/J7SCPiNoSy) | 1,640 | `nrs/boats/` | Scale ×3.5. Far LOD only |
| Bonfire (camp) | `camp/q_bonfire.glb` | CC0 | 602 | optional | The game's own fire is preferred |
| Sea normal map | `ocean/waternormals.jpg` | MIT (three.js examples; `three_LICENSE.txt`) | — | optional | Default is the procedural water.js normal; use this only if it looks better |

- **Not used** (reasons in the research): all CC-BY poly.pizza boats, canoes, rafts, helmets and static Viking figures (credit overhead and an unrigged, flat style); the T-Allen Studios longship (its licence forbids redistribution); the OpenGameArt horned helms (inaccurate); the Nisu helmet (72 MB of 4K).
- **Procedural (no asset exists):**
  - dugout, longboat and longship hulls
  - prow heads
  - sail
  - Great House shell (turf roof, posts)
  - runestone and carvings
  - conical iron helmet (coda)
  - leather caps (Grey Sails)
  - orca fins
- **Missing and in the backlog:** seal, orca and whale models; a dog.

### 9.3 Outfit integration (N3)
1. Load the outfit parts with GLTFLoader. For each SkinnedMesh, rebind to the human's skeleton by bone name, keeping the outfit's own `boneInverses` (the hair pattern).
   - Male rest offset is up to 17 mm at the upper arm: accept it, then check it in screenshots.
2. **Hide the body under the cloth.** Use an `onBeforeCompile` discard on the base body mesh, driven by a per-vertex mask attribute computed once.
   - Mask = 1 where the skin weight is dominated by bones covered by the outfit. The cover set is defined per outfit: Peasant covers spine/pelvis/thigh/calf/upperarm; Ranger also covers the lower arm.
   - **Colour pass only.** The shadow pass keeps the full body, the same approach FPP uses for the head.
3. **Looks:**
   - Peasant: villagers, Ysa, Oda.
   - Ranger (hood down): Lio, Kel, Brann.
   - Ranger (hood up + pauldrons, grey tint): Grey Sails.
   - Aro and Sena keep their current clothes plus a fur mantle (existing cloak).
4. **LOD:** beyond 25 m, swap to a single merged outfit without boots or pauldrons.

---

## 10. Technical architecture

### 10.1 Regions (N1: `src/regions.js`, `world.js` refactor, section `NRS-RGN`)
- In `world.js`, `SIZE, SEG, CELL, LIMIT` become `export let`, set by `initRegion(def)`. ES live bindings keep the importers correct.
- `createWorld(scene, renderer, quality, def)` gets a region def:

  ```js
  REGIONS = {
    valley:    { size: 640,  seg: 256, height: valleyHeight /* = current rawHeight, untouched */, water: 'river', scatter: 'valley', animals: 'all', poi: VALLEY_POI },
    saltmouth: { size: 640,  seg: 192, height: saltHeight, water: 'sea+river', scatter: 'coast', animals: ['deer','boar','wolf'], poi: SALT_POI, seaLevel: 0 },
    sea:       { size: 3072, seg: 0,   height: islandsHeight /* active tile or -30 */, water: 'sea', scatter: 'island', animals: [], islands: [...], poi: SEA_POI },
  }
  ```

- **Valley output must be bit-exact** (acceptance: a heightfield hash), so `S.felled` indices stay valid.
- **Region switch = save + reload:** `G.rgn.go(id, spawn)` → `save({now:true})` with `S.region=id`, `S.rg[id].spawn=spawn` → `location.reload()`.
  - **Why reload:** the world.js singletons, 1,600 instanced meshes and the closures in main.js have no dispose path. A reload frees about 100 MB of heap. A warm HTTP cache makes it a few seconds, covered by the voyage card.
  - **Before reload:** set `S.region` *before* the `pagehide` beacon fires, so a stale beacon cannot overwrite it.
  - **On boot:** `found` (the loaded save) is read before `createWorld` (main.js L37–38), so the region is known.
  - **Per-region assets:** each region lists the animal kinds and nature models it needs. **`sea` does not download `animals.glb` (19 MB).**
- **Region guard `RG`:** `RG.kind` is `'valley' | 'coast' | 'sea'`, and `inValley()` turns off valley-only systems elsewhere:
  - herd, horse call and horses (v1: horses never leave the valley; a ridden horse is left at the hall with a line)
  - home structs and `updateHome`
  - wolves/storm `EV` (sea has its own weather)
  - chapter `where()`: returns a gate marker if the target region differs
  - villager routines
  - auto-walk to the pin
- **Island tiles** (sea): 256 m at SEG 128 (about 16.6k verts, about 0.9 MB each). Built when the ship is within 600 m, disposed beyond 900 m, with a **pool of 2**.
  - Vegetation: instanced Nature MegaKit subset at reduced counts, with impostors beyond 120 m.
  - Island `getHeight` returns the tile height, else −30.

### 10.2 Save format (`regionV: 1`, `S.book`)
Additions to `fresh()` (N1 only):

```js
book: 1, regionV: 1, region: 'valley',
rg: {},                     // { saltmouth: {seen, found, px, pz, spawn}, sea: {seen, found, islands: {id: {visited, cleared, clearedDay, relation}}} }
boats: {},                  // { dugout: {region, x, z, face, moored, hp, cargo}, ship: {hull:'longboat', region, x, z, face, moored, hp, water, sail:{trim, reef}, prow, cargo:{}} }
crew: [],                   // §4.1
saga: { fame: 0, byname: null, lioName: null, rival: null, grey: null, mercy2: 0, vows: [], vowActive: null, hoard: {}, prow: null, log: [], carvings: [], burned: 0, coda: false },
clan: { lastFeast: -1e9, feasts: 0, blessing: { id: null, until: 0, cd: 0 }, trophies: [] },
trade: { rel: { shell: 0, amber: 0, grey: -100 }, closedUntil: {} },
wind: { dir: 0, str: 0.5, seed: 1 },
voyage: null,               // { from, to, t0, t1, seed, leg } so that a reload mid-voyage resumes the card
saveBook1: null,            // snapshot taken at Book II entry
```

- Old saves: missing fields are deep-merged from `fresh()` in `start()`, and `regionV` defaults to 1 with `region:'valley'`.
- The valley's `S.px/pz`, `S.felled`, `S.seen` and `S.structs` stay **top-level**, unchanged.
- Saltmouth structs (boatshed) are stored in `S.rg.saltmouth.structs`.
- The server stores the blob without looking inside it: **no server change.** The JSON stays well under 100 KB (snapshot ≤ 60 KB).

### 10.3 Integration points in existing code (one tagged line each, `// NRS-xx`, with `typeof` guards)

| Where | Hook | Owner |
|---|---|---|
| `fresh()`, `ITEMS`, `DEFAULTS`, settings UI, `GAME_KEYS` | all NRS fields, items (`mead, honey, salt, amber, sealoil, bronzeknife, bronzeaxe, bronzesword, shield, plank, resin`), keys, the "Horizon lock at sea" setting | **N1 only** (freeze after N1) |
| `CH` | Book II entries appended after `village` | **N6 only** |
| `world.js` | `export let`, `initRegion`, bee-tree node + resin node (appended **after** existing fields) | **N1 only** |
| `water.js` | export `waterTextures()` | N2 (one export) |
| `people.js` | `rowPose(h, phi, handle)` helper if needed; outfit rebind helper | N3 |
| `settle()` | `if (nrsBoatSettle(e, dt)) return;` | N2 |
| `updatePlayer` | `if (P.boat) return updateBoat(dt, mx, mz);` (next to `P.ride`) | N2 |
| `updateCamera` | boat camera, horizon lock, wave clamp | N2 |
| `findTarget` / CMB target filter | `canHarm(h)` | N3 (shared contract; CMB calls it) |
| keydown | boat context keys; chant; horn | N2 / N3 |
| frame loop | see §10.4 | each WP its line |
| map section | per-region bake, region fog, Sea Chart tab | N4 |
| `start()` | region boot, NRS migration, crew/boat/hall restore | N1 (others add one line each) |
| epilogue / free-play `sideGoals` | dugout recipe unlock; Standing Stones "Eighteen winters" prompt | N2 / N6 |
| RST | camp time-lapse reuse via `rstBegin(..., {camp:true})` | N3, one line |
| MUS | new states `voyage` (beat API), `storm`, `feast`, `raid2` | N2/N5 add to the state table via `typeof` guard |

### 10.4 Frame order (extends mature spec §5.8)
updatePlayer [**N2 updateBoat** in fixed step] → torch → updateSena [**N3 crewStation** for N aboard] → villagers/kids → **updateCrew(dt)** (N3) → spear → updateStats → updateSurvival → subs → events → **updateWeather(dt)** (N4, sea/coast only) → map → chapter check → updateArc → **updateSaga(dt)** (N6) → animals (valley/coast) → updateFoes (+ deck bounds) → updateHorses (valley only) → updateWorldThings → **updateSea(dt)** + **updateIslands()** (N2/N4) → updateGore → updateWP3 (valley) → updateCamera → updateMusic → render

### 10.5 main.js sections (new, appended before `// ---------- start ----------`)

| Tag | Section header | WP | New files |
|---|---|---|---|
| NRS-RGN | `// ---------- NRS-RGN regions ----------` | N1 | `src/regions.js` |
| NRS-BOAT | `// ---------- NRS-BOAT boats and sea ----------` | N2 | `src/boat.js`, `src/sea.js`, `src/sea_waves.js` |
| NRS-CREW | `// ---------- NRS-CREW crew ----------` | N3 | `src/crew.js`, `src/outfits.js` |
| NRS-VOY | `// ---------- NRS-VOY voyages, trade, raids, chart ----------` | N4 | `src/islands.js`, `src/voyage.js` |
| NRS-HALL | `// ---------- NRS-HALL hall, feasts, renown ----------` | N5 | `src/hall.js` |
| NRS-SAGA | `// ---------- NRS-SAGA Book II story ----------` | N6 | `src/saga_data.js` |

- Pure logic goes in the new modules (unit-testable); main.js sections only glue.
- **Every cross-WP call is `typeof fn === 'function'` guarded**, so each WP tests alone.

### 10.6 `window.G` namespaces (each WP owns one)

| Namespace | Owner |
|---|---|
| `G.rgn` (`id(), go(id, spawn), hash(id), guard(), def()`), `G.fixedStepTest` | N1 |
| `G.boat` (`spawn(hull, x, z), board(), leave(), gear(n), state(), portage(), beach()`), `G.sea` (`waveAt(x,z,t), seaState(v), tiles()`), `G.wind(dir, str)` | N2 |
| `G.crew` (`list(), recruit(id), dismiss(id), loyal(id, d), overboard(id), down(id), camp(tasks), adultLio(), look(id, outfit), stats()`), `G.canHarm(h)` | N3 |
| `G.voy` (`chart(), setCourse(id), trade(partner), spawnSite(kind, x, z), weather(kind), event(kind), raidState()`) | N4 |
| `G.clan` (`feast(), vow(i), vowResolve(ok), bless(id), fame(n), tier(), byname()`), `G.hall` | N5 |
| `G.saga` (`enter(), rival(), choose(id, i), holmgang(), fortCheck(), coda(skip)`) | N6 |

---

## 11. Performance plan

**Measured baseline** (real GPU, AMD Polaris12, test server 5174):
- Valley: about **850 draw calls and 3.0M tris** per frame. Shadows alone are about 230 calls and 0.76M tris.
- 1,604 InstancedMeshes, 123 SkinnedMeshes, a 85–115 MB JS heap.
- Headless runs at 5–21 fps.
- **The valley is already over budget; the sea must not add to it.**

| Area | Budget | How |
|---|---|---|
| Sea region | **≤ 250 calls, ≤ 600k tris** (medium) | Ocean 1, hull-cap 1, wake 1, ship ≤ 4, 6–8 humans about 50–60, 1–2 island tiles (instanced + impostors), sky/clouds. Shadow camera only around the ship (about 30 m range), updated every 3rd frame. Crew cast no shadows |
| Saltmouth | ≤ 450 calls, ≤ 1.4M tris | SEG 192, half the valley's scatter density, camp props instanced |
| Valley additions (hall + brewer + shed + healer + dugout) | **≤ +25 calls, ≤ +60k tris** | Hall shell merged into 3 materials. Furniture instanced per kind. Hall interior props culled when the camera is outside and more than 40 m away |
| Humans | crew > 10 m animate every other frame; > 25 m LOD outfit; > 60 m pose freeze | `G.crew.stats().halfRate` |
| Sea quality knob | waves 3 (low) / 4 (medium, high); rings 32/48/48; whitecaps only on high | `quality.js` preset |
| Physics | fixed 30 Hz, ≤ 4 substeps | `fixedStep` |
| Downloads | Book II assets lazy, ≤ 15 MB; sea skips `animals.glb` | per-region asset list |
| Region switch | warm reload ≤ 6 s on the dev machine (measure cold too) | voyage card covers it |

**Strongly recommended, separate prerequisite work (not part of NRS, but it helps everything):**
- Merge Field cells: 1,604 InstancedMeshes down to a few hundred.
- Tree impostors beyond about 120 m.
- Cap shadow casters.
- Target for the valley: ≤ 300 calls and ≤ 1M tris.

Every WP reports `renderer.info` numbers via `G.perf()` in its progress entry.

---

## 12. Work packages

**Order:**
- **Phase A:** N1 alone.
- **Phase B (parallel):** N2, N5, and N6-data (`saga_data.js` lines, CH stubs behind a flag).
- **Phase C (parallel):** N3 (needs the N2 seat API) and N4 (needs N1 regions and the N2 boats).
- **Phase D:** N6 integration.
- **Phase E:** QA on Story, Survivor and Hardcore, plus guardrail screenshot review.

**Test hygiene:**
- Each WP has its own vite + CDP port pair (5180+ / 9350+, never 5173).
- Every `/api/` request is intercepted.
- Tests live in `tests/nrs/<wp>/*.json` and run through `tools/test/run.mjs` in headless Chrome.
- Each WP re-runs `tests/final/play.json` and `npm run build`, and appends a progress entry: built, deviations, G hooks, evidence, perf, gaps.

### N1 NRS-RGN: regions, save, foundation (M)
**Builds:**
- `regions.js`, the world.js `export let` + `initRegion`, and the reload-based `G.rgn.go`.
- Boot by region, the region guard, the save fields and migration, the `fixedStep` util.
- All `fresh()`/ITEMS/GAME_KEYS/settings additions (then frozen).
- The bee-tree and resin nodes.
- A `testsea` region: a flat sea with one island tile.
- **No gameplay.**

**Acceptance:**
1. `G.rgn.hash('valley')` equals the hash recorded from the pre-change build (heightfield bit-exact). An existing save's `S.felled` trees stay felled in the same places.
2. Old save (no NRS fields) → loads in the valley: `S.region==='valley'`, `S.regionV===1`, 0 console errors. `tests/final/play.json` passes unchanged.
3. `G.rgn.go('testsea', {x:0, z:0})` → after reload, `G.rgn.id()==='testsea'`, `G.rgn.def().size===3072`, `getHeight(0,900) === -30`.
   - `G.rgn.go('valley')` → back at the saved `px/pz` (±0.5 m), same day and time ± travel.
4. A simulated `pagehide` beacon fired after `go()` and before the reload → the target region is still loaded.
5. In `testsea`: `G.callHorse()` returns false with a toast; herd and wolves are not updated (`G.rgn.guard().herd===false`).
6. `G.fixedStepTest()` integrates a test body for 10 s of game time at forced 5 fps and at 60 fps → final positions within 1%.
7. The bee-tree node exists. Adding the node did not change any earlier field's node order (hash of the field order unchanged).
8. `npm run build` passes.

### N2 NRS-BOAT: boats, sailing, sea water (L)
**Builds:**
- `boat.js`: hull generator, `HULLS`, physics, controls, portage, beaching, persistence.
- `sea.js` and `sea_waves.js`: Gerstner sea, hull cap, wake.
- Boat camera, horizon-lock comfort, wind HUD, bail meter, the chant beat API on MUS.
- **Dugout recipe in free play after `village`** (the first user-visible milestone).

**Acceptance:**
1. Free play after `village`: the dugout recipe is listed. `G.boat.spawn('dugout', lakeX, lakeZ); G.boat.board()` → `P.boat` is set; Aro sits.
   - After `G.boat.gear(1)` and 10 s game time: speed 1.4–1.8 m/s.
   - The same test at forced 5 fps → within ±10%.
2. Longboat on the river heading for a ford → it stops at the ford with the "Carry across" prompt. `G.boat.portage()` → hull downstream of the ford in water deeper than −0.65, and `S.gh` +0.5.
3. `G.wind(0, 1)` (from north), heading north, full sail → speed < 0.5 m/s after 15 s (in irons). Heading east (beam reach) → > 3.5 m/s.
4. In `testsea`, `G.sea.seaState(1)`: the hull's heave follows `G.sea.waveAt` at the hull centre within 3 cm (damped). Full sail for 60 s → `state().water > 0`. Reefed → water rises at least 50% slower. **It never capsizes.**
5. Swamping (water 100) → everyone is in the water, then the boat is towed to the nearest beach with cargo halved. No soft-lock (the player can board again).
6. Screenshot review: no water drawn inside the hull at sea state 1 (hull cap), and a wake is visible.
7. `G.boat.leave()` on a beach, reload → the boat is moored at the same spot (±0.5 m) in the same region.
8. Horizon lock on, FPP, sea state 1 → camera roll is 0 while the hull roll is ≥ 5°.
9. Perf in `testsea` with the longboat + 8 humans (stand-ins): `G.perf().calls ≤ 250`, `tris ≤ 600k`.
10. The valley with a dugout on the lake: calls up by ≤ 6.

### N3 NRS-CREW: crew, rowing, loyalty, outfits, content guard (L)
**Builds:**
- `crew.js`: roster, recruit, stations, rowing IK, chant tap, travel talk.
- Loyalty table, camp panel, downed/overboard/death per difficulty, memorial stones.
- `G.crew.adultLio()` conversion.
- `outfits.js`: rebind, body mask, LOD.
- `canHarm(h)` + `role` on every human + the dev assert.

**Acceptance:**
1. `G.crew.adultLio()` → `kids` no longer contains Lio. `G.crew.list()` has `lio` at scale 1.0 with the ranger look. Any remaining entries in `kids` keep the child role, and `G.canHarm(kidHuman)===false`.
2. `G.crew.recruit('brann')` + board the longboat → `brann.h.root.parent === ship.group`. Across a full stroke the hand bones stay within 6 cm of the oar handle. Rowing speed with 4 rowers > with 2.
3. Chant: 5 taps on the beat → row speed ×1.15 (±0.02) for 4 s. Off-beat taps → no bonus and no penalty.
4. `G.crew.loyal('kel', -50)` → a grumble line within 1 game hour. Loyalty < 15 at the next `beach()` → Kel has `inCrew===false`, `alive===true`, and is at the hall.
5. `G.crew.overboard('brann')` on Hardcore, no rescue → after 20 s `alive===false` and the memorial count +1. On Story → back on board without help.
6. `G.crew.camp({brann:'hunt', oda:'tend'})` → `S.gh` +8; food store +; wounded crew hp +.
7. **Guard:** spawn a mixed group (2 combatant, 2 noncombatant, 1 child). Crew AI, a thrown spear, torch fire and an axe swing at each → damage applied only to combatants. A forced `hurt(noncombatant)` triggers the dev assert (`console.assert` false observed).
8. Outfits: screenshots of 6 poses (idle, row, sit, run, axe swing, ride stand-in) for M and F → no body skin poking through the cloth. The shadow still shows the full body.
9. Crew at 30 m → `G.crew.stats().halfRate >= 1`; LOD outfit active.

### N4 NRS-VOY: lands, voyages, weather, trade, raids, chart (L)
**Builds:**
- Saltmouth and sea regions (Skerries, Amber Isle, Grey Isle, Far Shore), island tile pool.
- Valley and region gates, voyage card, sea events, weather.
- Barter UI + goods, peaceful-site rules, war camps, raid flow (horn, two-person chests, totem, ship burning, yield `choose()`).
- Per-region map bake and fog, Sea Chart, auto-helm.

**Acceptance:**
1. In the valley, the longboat at z > 270 in the river → prompt → voyage card → `G.rgn.id()==='saltmouth'`, with the ship at the dock and the crew aboard. The shell camp has ≥ 3 non-combatant humans and 2 armed guards.
2. `G.voy.setCourse('amber')` from Saltmouth → (via `sea`) arrives within 60 m of the Amber Isle beach. `G.sea.tiles().length <= 2` throughout.
3. `G.voy.trade('shell')`: an unbalanced offer cannot be confirmed. With byname Open Door the salt price is 5% lower than with Fire-Hand. Buying salt → `S.inv.salt` +1. Salted meat spoils 3× slower (SURV hook, if present).
4. Drawing the axe inside the shell camp → `choose()` opens, default No. Choosing Yes → guards hostile; every non-combatant is indoors and untargetable within 3 s; relation −100; trade closed.
5. `G.voy.spawnSite('warcamp', x, z)` → `G.saga.fortCheck()`-style audit: every human has `role==='combatant'`. Horn F → every crew member gets a foe target within 2 s. A chest does not open alone; it opens with a crew member within 2 m. A torch held 3 s on a beached boat → burned state; `S.saga.burned` +1.
6. A yielded warrior → `choose()` lists Spare (default), Send home, Recruit (only if allowed), Kill. Esc → spared.
7. `G.voy.weather('storm')` at sea → seaState ≥ 0.8; music state `storm`; lookout warning line (with Pell or Korr: ≥ 30 game min earlier).
8. Drinking seawater (E at the sea) → water stat drops (SURV hook) and Oda's line.
9. The Chart shows the Saltmouth → Amber route after the first visit. Fog in `sea` is stored in `S.rg.sea.seen` and survives a reload.
10. Perf: Saltmouth ≤ 450 calls; sea at Amber Isle ≤ 250 calls.

### N5 NRS-HALL: hall, mead, feasts, vows, renown, blessings, Saga Wall (M)
**Builds:**
- Great House and the 4 small buildings (procedural + Fantasy Props), mead brewing.
- Feast scene + buff composition, ring-giving, vows.
- Renown tiers, bynames, honour line, blessings and trophies, Saga Wall carvings + Saga sub-tab.

**Acceptance:**
1. Co-op build of the hall with Sena → `has('hall')`; interior benches are walkable. Valley perf delta ≤ +25 calls with all 5 buildings.
2. Brewer + honey 2 + grain 2 + berries 4 → after `G.skipHours(24)`, `S.inv.mead >= 2`.
3. `G.clan.feast()` → the scene plays (skippable); Rested = max; the `#buff` text lists exactly the bonuses of the buildings present. A second call within 48 game hours → `'too soon'`.
4. `G.clan.vow(0)` → the vow goal is visible; `G.clan.vowResolve(true)` → fame +15 and loyalty +4 for each crew member; `false` → loyalty −8 each.
5. `G.clan.fame(150)` → `G.clan.tier()===2`, crew cap 5, bronze axe in the amber stock.
6. Byname table: `G.setArc({tribe:'hostile', choices:{reckoning:'kill'}})` then `G.saga.enter()` → `'Red-Spear'`. Allied → `'Ash-Friend'`.
7. `G.clan.bless('seamother')` → wind within ±20° of the heading for 3 game h. A second blessing replaces the first. Re-blessing during the 12 h cooldown is refused.
8. After `G.setCh('keel')` is completed → the Saga Wall has +1 carving, and E shows its verse.

### N6 NRS-SAGA: Book II chapters, branches, set pieces, coda, QA (L)
**Builds:**
- `saga_data.js`: lines, vignettes, verses, travel talk.
- The 8 `CH` entries, Book II entry flow + snapshot, `rivalOf`, Kel and Pell arcs.
- Grey Sails AI ship + boarding, firewater (stealth, burning, hoard), holmgang, shore defence, ship funeral, Lio byname, coda.
- Mature story Off narrated fades.
- The full Book II playthrough steps file.

**Acceptance:**
1. `G.CH.length===27`; ids after `village` are `grown, keel, riverroad, amber, greysails, firewater, oar, saga`.
   - In `village` free play, completing every side goal **never** advances to `grown` without `G.saga.enter()` or the Standing Stones prompt.
2. `G.saga.enter()` → fade text "Eighteen winters passed…"; `S.book===2`; `S.chId==='grown'`; `S.saveBook1` is set; Aro's hair tint is grey; Lio is an adult.
3. `G.setArc({tribe:'hostile', choices:{reckoning:'kill'}, wena:'lost'})` → `G.saga.rival()==='vey'`, and Pell is the Grey Sails' steersman. With `tribe:'allied', wena:'saved'` → rival `durr`, `korr` and `pell` recruitable.
4. `greysails`: the boarding fight starts with hulls locked. On Hardcore, Brann at loyalty 50 → `brann.alive===false` after the fight; at loyalty 80 with a rescue → alive. The chase/turn choice sets `S.saga.grey`.
5. `firewater`: `G.saga.fortCheck()` → `{children:0, noncombatants:0, combatants:n>0}`. Stepping off the holmgang hide → forfeit. The holmgang `choose()` options match the §3.4 conditions, and Kill is never the default.
6. Mature story Off: `greysails` and `firewater` play as fades. `S.saga.grey` and the hoard result get default values (`turn`, `returned`); no foes are spawned.
7. `oar`: the funeral boat burns on Mirror Lake at sunset (screenshot); `S.saga.lioName` is set; then free play.
8. `saga` coda: plays ≤ 100 s, is skippable after the first view, and returns control in Book II free play. A save → reload resumes in free play.
9. `tests/nrs/book2.json` (a full Book II run with G hooks on Story) passes; `tests/final/play.json` still passes; `npm run build` passes; console errors = 0.
10. Guardrail screenshot review: no child in any combat frame, no gore on crew deaths, nothing sexual, no execution of the helpless shown.

---

## 13. Content limits (binding on every WP; paste as a comment at the top of `crew.js`, `voyage.js` and `saga_data.js`)

1. **No sexual content or nudity.** Romance stays Aro and Sena only: tender elder lines, embrace, kiss, fade to black.
   - **Lio has no romance**, and no one courts her.
   - Outfit body masks hide skin under clothes only; no undress path. (These are the same rules as mature spec §2.1 and §12.)
2. **Children are never harmed, targeted or endangered on screen.**
   - Every human has a `role`; `canHarm()` returns false for `child` and `noncombatant`; a dev assert backs it.
   - Children never board a boat for a voyage or a raid.
   - Book II valley children go indoors when foes are within 80 m.
   - The Grey Sails' families are off-screen on the "north isle". **Raid sites hold only armed adult warriors.**
3. **No torture, no captives, no thralls, no slave-taking, no ransom of people.** Tribute is only ever mentioned off-screen.
4. **Yielded enemies:**
   - They are killed **only** by an explicit `choose()` option, never the default, and the kill is quick.
   - Spare, send home and (conditionally) recruit are always available.
   - A recruit joins by their own choice (dialogue line), never by force.
5. **No burning of occupied buildings.** All huts at peaceful sites count as occupied. At the fort only ships, the totem and empty storehouses burn.
6. **Peaceful sites are not raid targets.** Attacking one needs a confirm (default No) and has heavy honour costs; non-combatants flee and are invulnerable.
7. **Violence and gore** follow mature spec §12: dismemberment applies to enemy combatants and predators in combat only. **Crew and family deaths are non-graphic** (no blood on funeral, memorial or death shots).
8. **Settings win.** Blood Off, Gore Low and Mature story Off apply to everything in Book II (Mature Off turns `greysails` and `firewater` into narrated fades).
9. **Sena reacts to cruelty** (approve −); Lio voices the rule "We burn ships, not cradles."

---

## 14. Open questions and defaults
1. Era option A / B / C → **C**.
2. May adult Lio be downed in combat → **downed, never killed**.
3. Real Norse god names → **only one skald line in the coda**.
4. Horned helmets → **no**.
5. Should Sena sail on voyages by default → **yes** (the player can leave her "to keep the fire").
6. Dugout in free play before Book II → **yes** (first visible milestone).

## 15. Backlog (not in this round)
- **"Saga of the Northmen" mode (full Option A):** a playable Iron Age campaign with Lio's far descendants. It reuses NRS hulls (longship with sail), crew, regions, raids and the hall, with iron reskins and runestones. Cost L. It needs helmets and mail (procedural or a later CC0 find).
- Flyting duels at feasts (`choose()` rhymes, Charisma-like dialogue unlocks).
- Knucklebones/Orlog-like dice.
- Seasonal sailing calendar (winter = hall life).
- Walking on a moving deck.
- Horses on board.
- Seal, orca and whale models; a dog pup from trade.
- Valley perf prerequisite (§11), if it has not been done by then.
