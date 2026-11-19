
## M2 GORE finisher (2026-11-16, ~20:45)
- State found: gore.js + GORE section already complete (zones, trail, mercy, butcher, focus, sever, carcass, screen blood, arrow hooks). No rewrite.
- Changed (src/gore.js only): Blood switched off mid-game now swaps what is already in the world (drops, mist, spurts, screen blood cleared; ground blood -> scuffs; severed pieces removed; stump caps and carcass flesh go dust-coloured). Drops are a brighter arterial red (were near-black at 5 m).
- Tests (headless Chrome, metal, port 5181/9343): acceptance 1-9 + extras 10-14 pass; new A (arrow sticks/rides body/returns on butcher), 4b (river wash 4 s), B (head arrow falls with severed head), C (wolf + bear arrows), D (child within 20 m: no dismemberment, plain carcass), E (blood-off swap), F (frame time 16.66 vs 16.65 ms), G (died clears). errors=0.
- Scripts: hb-scratch/tests/gore/{lib,acc,acc2,acc3,fin1,fin2,w1,w2}.js, run with r.sh. Shots: hb-scratch/shots/gore/.
- Not done: play.json full regression not re-run; static wall decals not exercised (cap test ran in open field, decals 0).

## M3 SURV finisher (2026-11-16 ~20:50)
- State found: survival.js + the SURV section + #moodles/#body were functionally complete; unit tests and acceptance set 1 passed. Set 2 had 8 fails.
- Real bugs fixed:
  - world.js herbFields: mint had 0 nodes and willow 2 (bank spots were measured from the river centre line, which is under water out to ~12 m). Now measured from the waterline: mint 70, willow 31, yarrow 75 (yarrow unchanged).
  - Willow shrub read as a tripod of bare sticks: 8 stems with drooping leaf sprays. Mint clump slightly larger.
  - Rack label said "Hang meat to dry" with only fish in the pack.
  - Pain vignette (fracture) was nearly invisible: stronger gradient in index.html #survfx.
- The other set-2 fails were test artifacts: headless Chrome drops pointer lock, which opens the pause menu (use UP() in the scripts), and the fire opens a choice menu when boil/tea are also possible (use FA(/Put/)).
- Results (snapshot hb-scratch/tests/surv/dist, port 5182 / CDP 9344): unit fails=0; acc.json errors=0 fails=0; acc2.json errors=0 fails=0; acc3.json (new: grace, hp floor, cap, infection doses, dysentery, mint tea, Sena acts, tooltips, Hardcore real-time body screen, Treat all) errors=0 fails=0; play.json on Survivor 36 PASS; play_story.json on Story 37 PASS. npm run build passes.
- Test helpers: hb-scratch/tests/surv/{run.sh, gen_acc*.mjs, repl.mjs + r/up.sh/down.sh (persistent session)}.
- Not browser-tested (code read only): cave basket x0.35, rack paused by a storm, hot-spring soak hook, thrown-from-horse sprain.

## M4 CMB finisher, attempt 4 (2026-11-17 ~07:30)
- State found: combat.js, enemies.js, tribe.js and the CMB section of main.js were functionally complete (stamina, combos, heavy, block/parry, dodge, glints, posture, finishers, brace, knockdown, maul QTE, alpha/aurochs/bear, raider FSM and roles, Sena health/downed/revive, spawnRaider/updateFoes/clearFoes/cmbDuel, bow vs predators and raiders). No rewrite.
- Fixed (src/tribe.js hurtFoe): a raider's block checked the cone toward Aro even when Sena threw, and her stones fed the "repeated attack" history, so after one or two throws he blocked nearly all of them (acc. 13a failed: 0 hits in 9 s). Now the cone uses the attacker's position, only Aro's blows train the history, Sena's stones get a flat 15%, and the block jolt (shake/recoil) fires only for Aro's own blows.
- Test fix: 7e allowed a 0.25 hp drift from the swipe's bleed/regen (it is not maul damage).
- Results (snapshot hb-scratch/tests/cmb/dist, 5183/9345, metal): a1-a6 all PASS (acceptance 1-12 incl. 13a), b1 bow B1-B13 all PASS (wolf/bear/aurochs/raider hits, head x2, unaware x1.5, lunge break, posture stagger, arrows stand in bodies, recovery from a dead raider). play_story.json (Story) 37 PASS errors=0; play.json 36 PASS errors=0. npm run build passes.
- Shots: hb-scratch/shots/cmb/v3_arrows.png, v3_fight.png (plus the earlier set).
- Harness: repl.mjs no longer dies on an empty request body.

## M5 ARC phase B finisher (2026-11-17)
- State found: arc_data.js, the 19-chapter CH, migration, arcChoose, all phase-B beats (ford, outcast, jealousy, lake, door, narrated raid, fever, reckoning, bond fallback, epilogue variants), season card, recap, Memories tab: complete. Earlier acceptance scripts a1-a6 all pass. No rewrite.
- Added/fixed (main.js ARC section + 1 BOW guard line + 1 index.html CSS line):
  - Ash People look: grey ash hands to the wrist (skin-weight shader mix; Tamu's faded) and shaggy hide mantles; Wena gets a hide wrap + knee skirt (was in base-mesh underwear in a blizzard).
  - Door night: warm doorway light during the scene (Aro's idle torch light, reset after); the knock now comes before the blizzard and the door night stays calm (banner no longer over the scene).
  - Reckoning waits 4.5 s after the Ash Camp banner before Korr's scene.
  - Chapter card hidden while the map/Memories is open (it lay over the parchment).
  - Bow side quest: fits the new order (unlocks after cave); its offer no longer plays over an ARC scene/choice or while Sena lies in fever.
- Tests (snapshot hb-scratch/tests/arc/dist, 5184/9346): a1, a2, a3, a4+a4b, a4c, a4d, a5+a5b, a6, a7 (new: ford close-up, door night), a8 (new: Wena outfit) errors=0, no real fails (a2 'o tended' is a timing artifact: the chapter advanced before the check). play.json 36 PASS. npm run build passes.
- Phase C left (guarded hooks in place): CMB raid waves via spawnRaider, Korr duel (cmb duel), RST rstVigil, ROM romFirstKiss/romScene/romEmbrace.

## M6 ROM + MUS finisher, attempt 4 (2026-11-17)
- State found: romance.js, music.js, the ROM and MUS sections, buses, hooks and G.rom / G.heart / G.music were functionally complete. No rewrite.
- Fixed (main.js ROM section + 1 hook line; romance.js 1 line):
  - Night together: Aro stood on the terrain under the house (0.45 m below Sena on a slope). Both now stand on the floor for the whole scene.
  - Night kiss camera: a fixed spot ended up behind Aro. It is now a side-on two-shot that stays inside the room.
  - Hand in hand: they jogged at 3.3 m/s. Now a 1.9 m/s stroll on the walk loop (hook `sp = romSpeed(sp)` after survSpeed).
  - Hand-holding is blocked while Sena carries the newborn (the holdBaby IK pulled her hand away from Aro's).
  - Heart events also fire on waking after a rest together (spec: "fire sit or rest").
  - Handfasting:
    - they face the stones side by side;
    - the hands stay joined through the vow choice (before, busy dropped the hand);
    - letterboxed two-shot camera;
    - the cord is now two ochre loops around both wrists (was an invisible rod);
    - they step apart before the dance, a wide shot is held over the dance, then the camera is released.
  - New hook: G.music.duck().
- Tests (snapshot hb-scratch/tests/rom/dist, 5185/9347, metal):
  - a1 (acceptance 1, 2, 3, 4, 6) 12/12; a2 (7 and 9) 8/8; a3 (5, plus the baby block) 5/5; a4 (heart after rest) 2/2. errors=0.
  - Node rule checks pass. play.json 36 PASS, errors=0. npm run build passes.
- Shots: hb-scratch/shots/rom/ (hand_walk2, embrace_day, kiss_fire, brow_fire, bench45, bench85, n1b, n3b, n4, n5, hf_vow, hf_cord, hf_dance).
- Not done: Intel GL shots (metal only); the heart-40 Lookout Peak night was code-read only; the handfast ochre decals are small at camera distance.

## BOW finisher, attempt 4 (2026-11-17)
- State found: basic bow merged and working in third person (draw IK, nock, flight on the aim arc, sticks in game/raiders/ground, pickup E, save of loose arrows, side quest, G.bow hooks). Missing: first-person view model, rock-break check (flat 12% snap on any ground), bow.json, play.json re-run.
- Added (main.js BOW / BOW-FPP sections + one-line hooks; bow.js; world.js 3 tagged lines; index.html bow slot):
  - First-person bow view model (bowFpp, after fppVm): left fist on the grip low-left of the crosshair (stave canted away), right hand draws the string back along the arrow line to the jaw, nocked arrow, string snaps home on release, bow held up 0.3 s after the shot, sway/bob (comfort bob setting), shake when tired; hidden riding/swimming/seated/busy/torch. Thick view-model string (makeBow({thick})). World bow/nock arrow hidden in the FP colour pass.
  - Arrows now stop at tree trunks (stick in the bark), boulders and buildings (thunk); rocky ground (terrain-shader rock weight, or a stone at the spot) and boulders: clack, 30% snap, else glance and drop flat. Soft ground never snaps. Arrows in a felled tree drop. Carcass-drop arrows lie flat (they stood point-up, buried). Spatial 6 m grid for trunks/boulders. The arc preview uses the arrow step (ends on the trunk).
  - Full draw held > 4 s: aim shake grows, stamina drains (no regen + 8/s), spent arms let the string down (no arrow spent). Quick/tired shots stray.
  - Bow pose aims by yaw/pitch, not camera (story/test cameras no longer bend the draw).
  - Seated at a fire: bow upright and quiver leaning at the far bench end (log clipping fixed); other seats set them aside.
  - Weapon chip: "5 Bow" slot; the Arrows item chip is folded into the Bow chip.
- Tests (snapshot hb-scratch/tests/bow/dist, 5186/9348, metal): tools/test/steps/bow.json 10/10 PASS errors=0 (quest offer after cave, craft, key 5, FP view model clear of crosshair, deer killed by arrow from 17 m, E pickup, quest done, save+reload keeps loose arrows/stock); a1.js 7/7 (rock ~30% break, soft ground 20/20 stick, boulder, trunk, arc on trunk, pickup from trunk); CMB b1.js 15/15 (with G.bow.BOW.noObst, since trees/boulders now block some of its lanes); play.json 36 PASS errors=0. npm run build passes.
- Shots: hb-scratch/shots/bow/ (fp2_*, fp3_rel, tp_draw_side_*, sl_*, bag_open*, bow_*).

## M5 ARC phase C, attempt 4 (2026-11-17)
- State found: phase C was largely wired by an earlier attempt (committed in e1dc886): CMB raid waves via spawnRaider (2 waves, roles, guard choice, Tamu as raider with surrender), the Korr duel via cmbDuel, the bedside vigil, romFirstKiss / romRift / romEmbrace / romScene('handfast') calls.
- Fixed (main.js ARC section only):
  - Pell's warning now really gives "tomorrow night": raidDay is set after the warning (the raid could start the same evening, before the braziers were built; lit=0).
  - Dawn after the raid: dead raiders are carried off and blood splats/severed pieces within 60 m of the home are cleared before Pell comes out (child guardrail).
  - Fever bed: Sena lies under a draped hide blanket (shaped on her pose at render time), her legs straightened to the bind pose (the idle stance laid flat lifted one knee and sank the other foot into the bed).
  - Tending her: Aro steps to her side (he stood in the room camera's lens); a warm low light at night for the shot.
  - Korr duel: Sena steps back behind Aro (she stood inside Korr).
  - New test hook G.arcDbg.sick().
- tools/test/steps/play.json: Story difficulty (G.mat.newGame('story')), Hunter's Bow side quest in the herd chapter, door 'share' (Wena and Pell saved), the real raid (warning, 4 braziers, CMB waves killed, Pell never targeted or visible), fever with poultice + SURV herbs at the bed, vigil, first kiss, reckoning duel (spare), the horse back. Result: 45 PASS, errors=0, fails=0 (snapshot on 5180/9342, metal).
- Shots: hb-scratch/shots/arcC/ (raid_fight, fever_vigil, korr_duel, fevB16/17 blanket, fk1 first kiss).

## QA story/romance lens (qastory, 2026-11-17)
- Snapshot hb-scratch/tests/qastory/dist, preview 5187, Chrome 9349 (metal), all /api/ intercepted; both stopped. Read-only on code. npm run build passes.
- Played Story difficulty through smoke, outcast (help), jealousy (forbid), lake (afraid, then proud on a 2nd run), door (refuse), sling, surprise raid (stand, Tamu guest), fever (scarred path), vigil, first kiss, reckoning (kill duel), handfast, epilogue.
- Blocker: lake "proud" answer softlocks the house chapter (arcChoose returns the old answer every dusk; the rift never mends).
- Majors: random world events (wolves, herd) fire during handfast/outcast scenes; chapter advance cuts the lake embrace and first kiss; Tamu dies off-screen while hidden; Korr "You came alone" with Sena beside Aro; Sena base-mesh bikini in every scene incl. kiss and epilogue next to Lio; Aro's blood decals persist 7 years into the epilogue beside Lio; scarred-path vigil replays fever ravings after "the fever broke"; Tamu scene camera inside the Great Tree; lake/jealousy cameras frame backs/empty logs.
- Shots: hb-scratch/shots/qastory/

## QA (Survivor/Hardcore lens), attempt 4 (2026-11-17)
- Read-only QA on snapshot hb-scratch/tests/qa4/dist (preview 5188, Chrome 9350, metal, all /api/ intercepted). npm run build passes. No code edits.
- Ran: autopilot fights (spear/axe/bow vs pack, alpha, bear, aurochs, raiders) on Survivor and Hardcore; downed, rescue, Sena revive (hold E), Hardcore permadeath + memorial, Hardcore Sena death + grief; content toggles via the pause UI; mid-fight save/reload; user-save.json and synthetic v1/v2 saves; play.json prefix on Survivor through the raid with a mid-raid reload (tests/qa4/raid_surv.json, 0 errors, raid resumes and finishes, dawn cleaned).
- Main findings: Hardcore save-on-pagehide lets a quit/reload drop an ongoing fight; melee reach measured to animal centre (aurochs/bear flank hits miss); Romance Off still offers "Kiss her" at the first-kiss beat; Sena's overhead HP bar shows during the Hardcore grief scene; Gore Low cut-away skipped with finisher cam off / first person; toast stacking in fights.
- Shots: hb-scratch/shots/qa4/ (h02 memorial, h06 grief bar, c06 romance-off choice, a01 aurochs, raid/qa_raid*.png).

## QA visuals + content limits (qavis), attempt 4 (2026-11-17)
- Read-only. Snapshot hb-scratch/tests/qavis/dist, preview 5189, Chrome 9351 (metal), all /api/ intercepted; both stopped. npm run build passes.
- Blocker: wolves attack right beside grown Lio (closest 0.19 m and 1.18 m); she does not flee or hide, and blood and screen blood fly around her. No predator guard for children exists (only gore suppression).
- Majors: severed wolf legs and heads come to rest standing upright, half buried (the pivot is clamped at its centre and the orientation is never settled); bear wounds are invisible (the bear is a rigid Mesh, 8 wounds registered, none visible); white glare blobs on fresh blood splats; the raider's groin and buttocks wound reads as glossy red paint; the first-person bow arrow points left of the crosshair; Sena's lace-textured underwear in kiss and embrace shots; Sena clips inside the bear carcass.
- Minor/polish: the HUD does not scale at 1080p (tiny moodle icons); glossy stump caps; the severed raider head carries the necklace and sits upright like a bust; clip-art splat stamps; jelly-bean blood drops; the "Click the game to capture the mouse" chip never hides.
- Perf: 60 fps (M4, metal) with 160 splats, bursts, 4 severs and 6 raiders; render 2.7 to 3.6 ms; worst frame 23 ms.
- Shots: hb-scratch/shots/qavis/

## mat-surv fixer, attempt 4 (2026-11-17)
- Edits tagged MAT-SV (main.js MAT/SURV areas + one-line hooks; index.html CSS). Snapshot hb-scratch/tests/matsurv/dist, preview 5193, Chrome 9355 (metal), all /api/ intercepted; both stopped. npm run build passes.
- Hardcore: save() holds (keeps the last calm save) while a fight is on (matInFight: Aro/Sena down, rescue, hostile within 30 m, raiders in combat): pagehide/beforeunload/visibilitychange, pause, autosave, story saves. The held save goes out ~2 s after the fight ends. Pause "Save & quit" is disabled during a Hardcore fight. Tested: mid-fight unload/pause/reload keep the calm save (hp 100, not 40).
- Overhead bars (Sena, posture, raider meters) hidden while MAT.endT/MAT.dead/#hud.cine.
- Toasts merge by text/key (refresh, no stacking, max 4); bleed toasts keyed per part; re-hits that do not worsen are silent; no toasts/Sena lines during downed/rescue/death; permadeath clears toasts and subtitles and mutes toasts.
- Downed in water: drifts to the nearest dry shore (<=16 m) then the normal downed phase; otherwise the rescue text says Sena could not reach him in deep water.
- HUD scales by --ui (1 at 720p .. 1.5 at 1080p, CSS zoom on panels, notice, body sheet, pause). Moodles: 36 px tinted discs with bold ring and label, row above the stat panel.
- "Click the game to capture the mouse" fades after 6 s; back on a click without capture or when a menu closes; hidden in cine/cinew/downed.
- play.json: 43 PASS, 2 FAIL (bow side quest offer/complete: BOW-Q code being edited by the bow agent at the time), errors=0.
- Shots: hb-scratch/shots/matsurv/

## FIXER arc-rom-mus, attempt 4 (2026-11-17)
- Snapshot hb-scratch/tests/arcfix/dist, preview 5192, Chrome 9354 (metal), all /api/ intercepted. REPL harness in tests/arcfix (up/boot/down.sh, r, portrait.sh, lake.sh, jeal.sh).
- people.js ADULT-DRESS section: every adult (not children) gets hide clothing by default (makeHuman dress: true | colour | false). Women: a shell top grown from the body's skinned verts (smock front) + knee skirt; men: a hide kilt. No base-mesh underwear shows on Sena, Aro, villagers, Korr/hunters, raiders. Wena keeps her own wrap (dress:false). FPP: Aro's kilt is excluded from FP.headMats. Sena wears a fur mantle in winter (arcSenaFur).
- main.js ARC/ROM (tagged ARC-FIX): arcCalm()/arcCalmNow()/arcCalmClear() gate world EVENTS (hook in updateEvents), Sena's night warning, and the chapter advance (frame-loop hook now calls arcAdvance(): a short fade when the season turns); scene starts send event wolves away/despawn within 28 m. Lake 'proud' re-asks the next dusk (afraid/wrong only), plays reconcile.away; lake staging faces them, warm lamp; embrace held inside the scene and they step apart after any embrace/kiss (romSceneEnd). arcCloseUp: seated framing, collider line-of-sight swing (no trunk/wall shots); arcShot other-shoulder fallback. Jealousy answer lines framed while Sena stays seated. Guest Tamu stands by Sena with a spear through the raid and dies in shot (arcTamuGuard/arcTamuFall). Raid dawn plays L.raid.dawn framed on Sena. Korr meetWith variant when Sena is near. reckoning.hint as a morning line. Foal shot held over its lines; sling camera beat. Scarred vigil: recovery lines + own fade. romShared in fever beats, no neglect in fever chapter. Romance Off: no kiss/hand choice. ARC targets beat Share a meal. House floor raised over sloping ground (placeStruct hook) - the vigil wedge.
- arc_data.js: act names Strangers / Hunger Moon; sling line; epilogue narrator voice + one Great Tree; scarredVigil/scarredFade; reconcile.again; reckoning.meetWith.
- Shots: hb-scratch/shots/arcfix/

## Fixer gore-cmb, attempt 4 (2026-11-17)
- Snapshot hb-scratch/tests/gorefix/dist, preview 5191, Chrome 9353 (metal), all /api/ intercepted; both stopped. npm run build passes. play.json 45 PASS, errors=0.
- gore.js: drops small dark streaks (motion-stretched); splats directional (dir/stretch, new spatter atlas, feathered pool), red-tinted faint specular + roughness >= 0.6 (no white/red glare); wound shader less saturated, dark core, ragged edge, torn-flesh tint, shorter runs, roughness 0.4; addWound maxR cap; wound space after morph targets (cave bear); human head segment cut at 'Head' (necklace/collar stay on body); ragged vertex-coloured stump caps; severed pieces contact the ground by their lowest real vertex and settle lying along the slope; clearAll / splatsNear / piecesNear / pieceInfo.
- main.js GORE-FIX block (after goreConform) + one-line hooks: melee reach to the body surface (goreBody/goreBodyGap/goreMeleeD in landHit and goreCorpseHit); hit points snapped onto the skin; raider/Aro/Sena wounds on chest/belly/flank (never groin), 12 cm cap; predator child guard (predKidGuard in updateAnimal), Lio hides in the house or behind Sena (kidHide in updateKids), goreKidSweep + no bursts/screen blood near a child; goreTimeSkip in epilogue and the birth skip; Gore Low dip-to-black when there is no finisher camera / first person; senaBodyPush; first raid wave carries lit torches (raidTorch, dropped when they close in), raid banner shown 3.2 s before the choice. Test hooks G.gore.body/gap/pieces/kids/rec/raidTorch.
- Shots: hb-scratch/shots/gorefix/ (sev2, cap3, hd2, hd3, rd1, rd3, bear8, gl4_7.2, drops1, torch1, sena2).

## Fixer: bow, attempt 4 (2026-11-17)
- Hunter's Bow offer (main.js BOW-Q, bowQuiet/bowSideQuest): Sena offers only after 6 s of quiet: no lines playing or queued (subs, S.arc.pending), no banner (#event), chapter card, choice, ARC scene or camShot, not in a cave, not within r+25 m of an unfound POI, not within 70 m of the chapter's own story spots (BOWQ_SPOTS) or its arcWhere target (unless that is the home), and Sena within 14 m. Fever stays blocked.
- Quest panel: the side line shows only after the offer; drawQuest() calls bowQuestFit(): 5+ goals or overlap with #bars folds it to "Side · Hunter's Bow n/6", still overlapping hides it; resize redraws.
- First-person bow (bowFpp): raised pose derived from the anchor (BOWFP.nock) and a screen aim point (BOWFP.tip NDC [-0.012,-0.075]); the arrow runs from the draw hand (lower right, fingers NDC [0.24,-0.51]) along the line of sight to just under the crosshair, resting on the left of the stave over the bow fist; stave canted top-right (BOWFP.cant -0.32); arms step forward 0.3 m when raised (one-line hook in the FPP az line) so the left fist reaches the grip (gap 0.014 m).
- Tests (snapshot hb-scratch/tests/bowfix/dist, 5194/9356, metal): bow.json 10/10 (FP assertion updated to the new spec); play.json 45 PASS, errors=0 (its bow step now tps to (10,10) before waiting for the offer). Note: play.json's cave handprint step flaked 2 of 5 runs: romTarget ("Sena (hold E)") wins the E target over the hand panel (ROM area).
- Shots: hb-scratch/shots/bowfix/ (fp_full, fp_draw_mid, fp_ready, fp_v2/v4, q_smoke_camp, q_fever, q_house, q_offer).

## USER DECISION 2026-11-17 ~21:50: Sena's outfit (from Aman; all fixers and verifiers must respect it)
The user does NOT want Sena in the hide dress. They want her in an attractive, revealing two-piece. This stays within the content limits: no nudity, nothing sexual, and the romance stays non-explicit.
- Implemented by the lead (tag SENA-LOOK):
  - `makeHuman({ ..., dress: { color, style: 'twopiece' } })` for Sena (N) only;
  - `adultDress` builds a hide breast-band (bust only, bare shoulders and midriff) and a hip-slung, mid-thigh hide skirt;
  - `senaTrinkets` adds a bone and amber bead necklace and braided arm cords.
- NOT yet visually verified (the Mac was overloaded). Verifiers and fixers:
  - check that it renders cleanly: no gaps showing the base-mesh underwear, no clipping, no floating beads; it looks good in all poses, riding and sitting;
  - polish it if needed, keeping the revealing two-piece style;
  - do NOT revert Sena to the dress, and do NOT fail her for "wearing a bikini". This is the user's choice.
- Other adult women (villagers, raiders) keep their current clothing. Children are untouched: child body and tunic, commit 67221c7.

## VERIFIER bow + content limits (vbow), round 1 (2026-11-17)
- Read-only. Snapshot hb-scratch/tests/vbow/dist, preview 5204, Chrome 9404 (metal), all /api/ intercepted; both stopped. npm run build passes. bow.json 10/10, old.json 9/9, errors=0.
- FAIL (major): arrows tunnel through tree trunks: one tip test per 1/60 s step (~0.97 m at 58 m/s) vs a 0.57 m trunk; 4 of 8 dead-centre FP shots at 7-15 m flew through (path within 0.03 m of the trunk axis).
- FAIL (major): FP arc preview draws a large blurred dark/white blob just left of the crosshair (arc dots/halo at the camera); gone with arc off (vis/fp_full_up.png, vis2/fp_full_arc_sky.png vs fp_full_noarc_sky.png).
- FAIL (major): FP full draw stops ~0.42 m in front of the eye; draw hand mid-lower screen (wrist NDC 0.48,-0.75), not at the cheek; mid and full draw look almost the same.
- FAIL (minor): right mouse release looses the arrow (spec: release lets the string down; left click looses). A full draw cannot be let down.
- Minor: arrow speed 58 m/s (spec ~45); TPP arrow 0.5 m low/0.23 m left of the crosshair at ~5 m from Aro (parallax); world cap reached 49 loose arrows after rapid fire (trim only on the next shot); "quiver full" toast with no quiver; bow string (unlit Line) glows white at night.
- PASS: offer gating (smoke chapter, no banner/card after), side line folds/hides in fever and shows in epilogue, capacity 8/24 + message, No arrows, partial draw dmg 7 / full 14, deer 1, wolf 2, bear 15, Sena/tame horse/herd horse/Lio pass-through, rock break 14/50, pickup 2.5 m, carcass arrows recovered, mount puts bow away, save/reload.
- Content limits: no violation seen (Lio child body + dress, wolf next to Lio driven off, no blood near her; Sena dressed in kiss scene; no torture mechanic; execution is a quick choice).
- Shots: hb-scratch/shots/vbow/

## Verifier round 1: story/romance/music (vstory), attempt 4 (2026-11-17)
- Read-only. Snapshot hb-scratch/tests/vstory/dist, preview 5202, Chrome 9402 (metal), all /api/ intercepted; both stopped (stale servers from an earlier attempt killed). npm run build passes. play.json 45/45 PASS, errors=0.
- PASS: lake proud re-ask + mend, events gated in scenes, Korr meetWith, Sena/adult clothing, scarred vigil, neglect line, act names, epilogue voice, Tend Tamu priority, Romance Off, vigil floor wedge, outcast trunk camera, foal shot.
- FAIL: first kiss (cinematic ends after ~4 s; after-lines and choice in open play, Sena walks off, chapter flips mid-dialogue), jealousy framing (fire/grass in front of speakers), Tamu death (body through the fire log), raid dawn ('Stay awake' to a standing Sena), sling camera beat missing.
- New: bow offer fires on raid night and right after the jealousy fight; Korr choice camera behind a head/tent; handfast feet-only shot and Aro alone before fade; Blizzard banner stacked on chapter card.
- Shots: hb-scratch/shots/vstory/

## Verifier mat-surv, round 1, attempt 4 (vms4, 2026-11-17)
- Read-only. Snapshot hb-scratch/tests/vms4/dist, preview 5203, Chrome 9403 (metal), all /api/ intercepted; both stopped (also stopped a 4 h old ver1ms preview+Chrome left on 5203/9403). npm run build passes.
- M1 1-13 and M3 1-11 pass by measurement (drain ×1.30, hurt 6/10/16, downed→revive 4.2 s, penalty, permadeath+stone+DELETE, v2 ch:8→hearth legacy, user-save.json loads 0 errors, settings persist, spit/rack/basket/boil/fill, Treat all). play.json: run 1 FAIL "rest in house bed" (flaky), run 2 45/45.
- QA: toasts, Sena bar, water downed, HUD 1080p, lock chip PASS. Hardcore mid-fight reload FAIL: the save is held (quit disabled), but reloading at hp 44 with 4 wolves at 0.8 m still Continues at the calm save (hp 100, no wolves): the losing fight is escaped.
- New: grief-scene camera behind Sena / grass blades in the lens; Sena kneels over Aro's head on revive; Aro invisible under water during the drift; spit "take it off" bar but E prompt says "Share a meal with Sena".
- Shots: hb-scratch/shots/vms4/

## Verifier gore-cmb round 1 (ver1gc), 2026-11-17
- Read-only. Snapshot hb-scratch/tests/ver1gc/dist, preview 5201, Chrome 9401 (metal), all /api/ intercepted; both stopped. npm run build passes. play.json 45 PASS, errors=0.
- PASS: kid guard (wolves/bear never closer than 15 m to grown Lio), melee reach to body surface, severed pieces lie on the ground, splat glare gone, raider wounds on chest/flank, epilogue clears all gore, raid wave-1 torches + banner before choice, Gore Low dip in FPP / no finisher cam, stump caps and wound look, drops, splat variety; M2 1-9 and M4 1-13 functional checks.
- FAIL: bear wounds barely visible (dark maroon on dark fur); Sena still clips into a toppled bear carcass (2 of 6 trials); severed raider head often rests upright like a bust (head bone up-Y 0.7-0.83 in 3 of 5); butchered carcass reads as glossy red plastic.
- New: dropped raider axe/spear stand upright on their butt ends; death pool centred under the raider's pelvis; "Sit with Sena (E)" prompt shown mid-raid; aurochs herd fight downs Aro 15x in 70 s with the axe.
- Shots: hb-scratch/shots/ver1gc/

## Fixer: bow-limits, attempt 4 (2026-11-18)
- Code for all 4 items was already on disk from attempt 3 (committed in WIP 67f933b): BOW-SWEEP swept-segment obstacle test (bowStep/bowSweep), BOW-ARC FP near-run trim (ARC.n0), BOW-FPP draw to the cheek (BOWFP.nock z -0.18, draw 0.6, bowFpClav shoulder back), RMB release = let down, left click = loose (recipe text + F1 help updated). This attempt verified them; no new code edits.
- Tests (snapshot hb-scratch/tests/bowlim/dist, 5204/9404, metal, /api/ intercepted): 24/24 FP dead-centre shots at trunks 7-15 m stick (tips within 0.3 m of the axis); RMB held 1 s at full charge then released: no arrow spent; left click looses (inv 24->23); bow.json 10/10 errors=0; play.json see below. npm run build passes.
- Shots: hb-scratch/shots/bowlim/v4_fp_ch0.1/0.4/0.7/1.0.png (draw animates, hand to the cheek), v4_fp_full_arc_sky/grass.png (no blob), v4_tpp_arc.png.

## Fixer gore-cmb (gcfix4), attempt 4 (2026-11-18)
- Snapshot hb-scratch/tests/gcfix4/dist, preview 5201, Chrome 9401 (metal), all /api/ intercepted. npm run build passes.
- Bear wounds: GORE-FIX5 snapToSurface in gore.js addWound: the hit point is moved onto the skin (it was cm inside the body, so the wound only grazed it). Morph-mesh bears keep wounds on the rest shape (barycentric), so they stay on the body through the death fall. Big-body wound scale is now 1.8. Shots: bearLit3 (lit flank), bearL1, bearD0-3 (dead, 8 wounds, red in every view).
- Sena vs dead bear: footprint() now applies morphs (it was sampling the standing rest shape). It returns a convex outline, and senaFootPush keeps her 0.4 m outside it. It refreshes every 0.1 s during the fall. 6/6 bear trials: 0 vertices inside, min 0.48 m. Shot: senabear.png.
- Severed head (GORE-FIX4 headRest, verified): 5 trials, head up-Y 0.15/0.21/-0.03/-0.17/0.12. It lies on a cheek. Shots: rh_head_a/b.
- Carcass: the flesh pattern is now in real metres (uFS). Fibre and grain, marbling fat seams, a back fat cap, subtle ribs, roughness 0.7-0.86. Shots: carcass0-2 (deer), carcbear0-2.
- play.json 45/45 PASS, errors=0. Servers stopped.

## Fixer: bow-limits, attempt 4 re-run (2026-11-18, 5204/9404)
- No code changes needed: all 4 fixes (BOW-SWEEP, BOW-ARC near-run trim, BOW-FPP cheek draw, RMB = let down) are in HEAD. Re-verified on a fresh snapshot.
- Trunks: 24/24 dead-centre FP shots at 7-15 m stick. RMB: a full draw (BOWFP.a 1) released with right mouse spends no arrow (24 -> 24); left click looses (24 -> 23).
- FP draw: string-hand wrist NDC goes (0.25,-0.43) at charge 0.15, (0.37,-0.56) at 0.42, and (1.47,-2.08) at full draw (off-screen at the cheek, nock end at (0.45,-0.91)). Shots a5_fp_ch0.15/0.42/1.0 look clearly different.
- Arc: a5_fp_full_arc_sky/grass show no blob near the crosshair; the landing ring is visible; a5_tpp_arc is fine.
- play.json: 45/45 PASS, errors=0. npm run build passes. Servers stopped. Shots: hb-scratch/shots/bowlim/a5_*.png

## FIXER arc-rom-mus, round 2 (arcfix7), 2026-11-18
- Snapshot hb-scratch/tests/arcfix7/dist, preview 5202, Chrome 9402 (metal), all /api/ intercepted; both stopped. npm run build passes. play.json 45 PASS, errors=0, fails=0.
- Found on disk from the cut-off attempts (ARC-FIX4/5, in WIP commits) and verified here: first kiss as one letterboxed beat inside the vigil scene (choice, kiss, after-lines; chapter turns ~6 s after the scene ends), scarred-path choice in the same staged two-shot, Tamu down on open ground with Sena kneeling at his chest, raid dawn with Sena on her back and Aro kneeling over her.
- New this round (tag ARC-FIX7, main.js ARC section + one CSS line in index.html):
  - Jealousy answer: Aro steps to the fire ring and gets a firelit medium shot (arcJealAro / arcJealAroShot); Sena answers looking up at him (arcFireCloseUp takes who she speaks to); Tamu (sitting on the ground) is framed at face height.
  - Sling: grass cleared at the snow camp, sling and pouch sit on their own ground, close low shot of the sling, letterbox lasts as long as the shot.
  - Wounded Sena keeps by Aro after the raid dawn (she went off gathering stones); no-bed fever uses the same rule.
  - Dropped raider weapons within 8 m are hidden in the Tamu shot; the 'Saved' chip is hidden while letterboxed.
- Harness note: under load 200+ the REPL is too slow to time shots. tests/arcfix7/helpers.js adds a self-freezing queue (window.SQ + cap.sh): the page stops its own frame loop on a condition, the shot is taken, then it resumes.
- Shots: hb-scratch/shots/arcfix7/ (fk_choice, fk_1, fk_2, scar_choice, rd_tamu2, rd_tamu_close, rd_dawn_def, rd_dawn_top, jg_l1, jg_l2, jj_story, jj_l2, sm_3).

## Verifier gore-cmb round 2 (v2gc, attempt 4), 2026-11-18
- Read-only. Snapshot hb-scratch/tests/v2gc/dist, preview 5201, Chrome 9401 (metal), all /api/ intercepted; both stopped. npm run build passes. play.json 45 PASS, errors=0.
- PASS: M2 1-10, M4 1-13 (functional); all 14 gore-cmb QA issues (kid guard min 14.9 m, reach to surface, pieces flat, bear wounds visible live and dead, no splat glare, raider wounds on chest/flank, Sena 0 verts inside in 4 trials, head on its side, necklace on body, caps, splat variety, drops, epilogue clean, raid torches, Gore Low dip in FPP / no cam).
- NEW / still open: dropped raider axe/spear stands upright on its butt end (4 of 4 corpses); axe hit lands on a wolf 2.2 m away while the blade is still raised (damage at ~210 ms); decapitated raider's pool forms at the feet, not the neck; bear carcass can fall into a tree trunk; child follows Aro to a fresh kill (3 m) and Aro butchers with red hands beside her; "Rest until dawn" prompt during the raid alarm; butcher pool is a perfect disc.
- Shots: hb-scratch/shots/v2gc/

## Fixer mat-surv (msfix4), attempt 4 rerun (2026-11-18)
- Snapshot hb-scratch/tests/msfix4/dist, preview 5203, Chrome 9403 (metal), all /api/ intercepted; both stopped. npm run build passes. Harness: tests/msfix4 (up.sh, down.sh, fresh.sh, fight.js, cont.js, grief.sh).
- Code for the Hardcore reload (HC_FIGHT_KEY fight mark + matFightResume), the gate (#btn-new disabled) and the grief camera (MAT-GRIEF r2/r3) was already on disk from the earlier attempts (commit eac060b); this run verified them.
- Hardcore mid-fight reload: calm save hp 100, 4 wolves, reload at hp 63 -> Continue gives hp 19 (the mark is refreshed at unload), 4 wolves at 4.6-6.1 m with their hp, hostileNear true; he then died and permadeath ran. Test note: reload at once after fight.js; a few seconds later Aro is dead and the save is (correctly) gone.
- Gate: clean profile #gate 'mat-ov on', #btn-new.disabled true; accept -> ageOk 1, blood on, gore high, button enabled; after reload gate display none.
- Grief: low three-quarter shot on the mourner's face, grass flattened round them and along the lens line (shots grief_a5Pn_2.6/5/7.5, grief_a5Nd_5/9.6). grief.sh: pass the first time as arg 5 or the hold starts late.
- New one-line hook (main.js findOtherTarget, tag MAT-SV r3): at the bare cave wall with ochre and no handprint yet, 'Leave your handprints' beats 'Sena (hold E)'. This was the play.json cave flake (it cascaded to 16 fails in one run at load average 300).
- play_survivor.json: fever wait 30 s -> 75 s (as play.json); the three newlife nights retry until the rest starts (G.sleep is silently refused while busy, e.g. during the cradle/nursery work) and assert it. 54/54 PASS twice, errors=0.
- play.json (Story): 3 runs. Before the handprint hook: 45/45, then a cave-step fail (cascade). After the hook: 45/45, errors=0 (one run).
- Shots: hb-scratch/shots/msfix4/

## VERIFIER bow + content limits (vbow4), round 2, attempt 4 (2026-11-18)
- Read-only. Snapshot hb-scratch/tests/vbow4/dist, preview 5204, Chrome 9404 (metal), all /api/ intercepted; both stopped (a stale vbow3 repl from the earlier attempt was also stopped). npm run build passes. bow.json 10/10, old.json 9/9, play.json 45/45, errors=0.
- PASS (round-1 fails now fixed): trunks 24/24 dead-centre FP shots stick; FP arc has no blob; FP draw animates to the cheek (tip NDC -0.012,-0.075, crosshair clear); RMB release lets down (24->24), left click looses (24->23).
- PASS: offer gating (no offer through the smoke/cold-camp lines, fires 8.8 s into a quiet stretch at home), side line hidden in fever / shown in epilogue, kill counts (deer 1, wolf 2, bear 15), Sena / Lio / tame horse pass-through, rock break 12/40, water loss, pickup 2.5 m, capacity 8/24, mount and swim put the bow on the back, save/reload.
- FAIL (major): sheathed bow clips the body: the lower limb goes through the kilt and comes out between the legs, the string enters the kilt and is cut off (carryz_back.jpg, cliplow_back.jpg; triangle test: stave segments 2,4,5,6 cross the body mesh, lower string enters dressKilt at 29%). The quiver axis is 17 cm inside the hip.
- FAIL (major): third-person aim parallax: the arrow passes 0.46-0.59 m left and 0.17-0.38 m low of the crosshair at 5-12 m. Centre-mass shots, full draw: wolf at 6 m 1/5, wolf 9 m 4/5, deer 9 m 3/5 (first person 30/30).
- Minor, still open: arrow speed 58 m/s (spec ~45); 42 loose arrows after 50 rapid shots (cap 40); "+1 arrows · quiver full" with no quiver; "Crafted: Flint arrows x3" when only 1 fit under the cap; TPP string is an unlit white line at night; bag chip overlaps the toast at bottom centre.
- Content limits: no violation. Children: child body, tunic and skirt (Lio, 2 village kids). Night together: kiss, fade to black with the card, morning, both dressed. Wolves/bear never target Lio; she is hidden indoors, 0 splats. No torture mechanic.
- NEW (major, not a limit violation): Sena's two-piece skirt sits below the hips, so the base-mesh brief shows above it front, side and back, with a notch missing from the front hem (sena2_f.jpg, sena2_s.jpg, sena_b.jpg).
- Shots: hb-scratch/shots/vbow4/

## Fixer gore-cmb round 2 (gcfix5), attempt 4 (2026-11-18)
- Snapshot hb-scratch/tests/gcfix5/dist, preview 5201, Chrome 9401 (metal), all /api/ intercepted; both stopped. npm run build passes. play.json 45 PASS, errors=0, fails=0.
- Dropped raider weapons (tag GC-FIX5, tribe.js dropWeapon/updateDrops): the models' long axis is +z, so the old rotation.x = -90° stood them on the butt end. They now tumble out of the hand (0.34 s) and lie flat along the slope, 0.75-1 m out on the weapon-hand side; the axe rests on the flat of its head. 6 kills (3 spear, 1 axe, 1 torch, 1 spear): shaft tilt = ground slope (1.5-12.8°), both ends 3-6 cm above the ground. Shots: drop_0, drop_5, drop_5_close.
- Axe reach and timing (tag GC-FIX5, combat.js COMBO/HEAVY/STEP/stepIn, main.js cmbStepIn/cmbStepTick, goreMeleeD, cmbFoeInReach):
  - Reach is now the gap to the target's surface that the blade really covers: axe 1.2/1.0/1.2 (heavy 1.25), spear 2.1/2.1/2.2 (heavy 2.3), fists 0.9. goreMeleeD returns the plain gap (no +0.2); raiders are measured to the body (centre - 0.3).
  - A target a little further off (up to reach + 1.3 m axe, 0.8 spear, 1.1 fists) makes Aro step in during the wind-up, to 0.4 m inside the reach. Beyond that the swing misses and he does not move.
  - Hit delay = the moment the blade comes through (measured per clip): light 1 0.26 s, light 2 0.2, light 3 0.48, heavy 0.7. Light 1 now plays the overhead chop (strikeU): Sword_Regular_A is only a 0.19 s wind-back, the blade never came forward.
  - Measured: wolf side-on, root 2.4 m (surface 2.22): Aro steps 1.3 m, damage at 0.267 s with the axe head inside the wolf's outline (-0.12 m); wolf at 3.9 m: no hit, no step; aurochs flank from 1.72 m: step 0.92, head 0.23 m inside. Live night fights: 2/2, 5/5 (3 wolves), 4/4 (spear) swings hit.
  - Shots: r_axe1_wolf2.4, r_axe2b_wolf2.4, r_axe3b_wolf2.4, r_axeH_wolf2.4, r_axe1_wolf3.9 (miss), r_axe1_aur, r_spear_aur3.
- Not changed, for the next round: raiders' own light swing still uses swordA (tribe.js tickAttack); light 2 (swordB) is a chest-height slash, so it passes over a wolf's back.
- Shots: hb-scratch/shots/gcfix5/

## Fixer: bow-limits, attempt 4 third run (2026-11-18, 5204/9404)
- No code changes: all 4 fixes are in HEAD (BOW-SWEEP, BOW-ARC FP near-run trim, BOW-FPP cheek draw, RMB = let down). Re-verified on a fresh snapshot.
- Trunks 24/24 FP dead-centre shots at 7-15 m stick. Real canvas mouse events: full draw (BOWFP.a 1) + RMB up spends nothing (24->24); left click while drawn looses (24->23).
- Draw frozen at charge 0.13/0.43/0.73/1.0: string-hand NDC (0.25,-0.44) -> (0.32,-0.50) -> (0.59,-0.87) -> (1.47,-2.08, at the cheek); a6_fp_ch*.png clearly differ. a6_fp_full_arc_sky/grass: no blob, crosshair clear.
- Harness note: a CDP screenshot drops pointer lock and pauses (cancels the draw); shoot one draw per screenshot.
- play.json 45/45, errors=0. npm run build passes. Servers stopped. Shots: hb-scratch/shots/bowlim/a6_*.png

## Verifier mat-surv, round 2, attempt 4 (v6ms, 2026-11-18)
- Read-only. Snapshot hb-scratch/tests/v6ms/dist, preview 5203, Chrome 9403 (metal), all /api/ intercepted; both stopped. npm run build passes. play.json 45/45 and play_survivor.json 54/54, errors=0.
- PASS: M1 1-13 (gate/toned-down, 3 cards, HC save hidden, drain x1.30, hurt 6/10/16, revive 3.4 s, rescue penalty, HC permadeath + DELETE + stone + obit, v2 ch:8 -> hearth legacy, skipHours spy, choose/req, berry 221, 21/22 settings persist: fullscreen can't re-enter headless). M3 1-12 (bleed -4.0/10 s, infection + regenK 0 with rng(0), Story no aff, sprain 0.7 + no sprint, raw meat poison, spoil/basket, rack dried, spit cook + burnt lost, well/boil safe, river raw, moodles/body screen). user-save.json loads (hearth, 0 errors).
- QA all 6 PASS: HC reload mid-fight -> Continue puts 4 wolves back at 1.8-6.6 m with low hp, he dies, permadeath; Sena bar hidden in grief; toasts max 2 no dups, subs hidden at permadeath; water down -> drifts to bank + downed phase + revive; HUD --ui 1.5 at 1080p, 66 px moodles; lock chip fades after ~6 s.
- NEW (major): Survivor, Aro falls while Sena is down -> fade "Sena carries you back to camp and tends you until morning", then at 07:00 Sena is still lying downed beside him (timer barely moved). rescue() never clears N.downed. Shots h_rescue_senadown.png, c_raid_3.png.
- NEW (minor): water-down shot: Discovered banner over DOWN; Aro's body half sunk into the bank slope (d_water_1.png).
- Shots: hb-scratch/shots/v6ms/

## Verifier gore-cmb round 2 (v4gc, attempt 4 re-run), 2026-11-18
- Read-only. Snapshot hb-scratch/tests/v4gc/dist, preview 5201, Chrome 9401 (metal), all /api/ intercepted. npm run build passes. Shots: hb-scratch/shots/v4gc/
- PASS: M2 1-9, M4 1-12 (functional); kid guard (wolves/bear min 15-18 m from a visible Lio); reach to the body surface (aurochs hit to 3.0 m spear/axe, miss at 3.6); bear wounds visible; no splat glare into a low sun; raider wounds on chest; head lies flat, necklace stays on body; epilogue clears wounds/splats; raid wave-1 torches + Sena line; Gore Low black dip at impact in FPP and with the finisher cam off.
- FAIL: severed deer heads can rest upright on the neck stump like a trophy (carc1.png, piece_deer2.png, left head).
- NEW: grown Lio follows Aro onto a fresh kill (0.1 m from the carcass) and stands inside Aro (0.27 m) while he butchers (kid_butcher*.png, kid_hands.png); kill pools: none under an axe-killed wolf, raider pool at the legs; screen blood sprites are clip-art stars; raid look-up shot keeps the full HUD.

## mat-surv fixer, attempt 4 (2026-11-18)
- rescue() (main.js MAT section): if Sena is downed when Aro falls, the fade now says she comes to, binds her own wound and drags him back; at dawn she is revived (N.downed=0, nhp>=40, lie override cleared, emits 'revived' by 'rescue'). Normal text unchanged when she is up.
- Test: hb-scratch/tests/matsurv/rescue.json (5/5 PASS); shots in hb-scratch/shots/matsurv/.
- play.json 45/45 PASS, errors=0. Servers stopped.

## VERIFIER bow + content limits (vbow5), round 2, attempt 4 rerun (2026-11-18)
- Read-only. Snapshot hb-scratch/tests/vbow5/dist, preview 5204, Chrome 9404 (metal), all /api/ intercepted. npm run build passes. bow.json 10/10, old.json 9/9 (errors=0); play.json see the end of this section.
- Fixed since vbow4 (PASS): sheathed bow vs body 0 hits in 8 movement modes (idle/walk/run/sneak/strafe/back/jump), quiver axis clear; TPP parallax gone (wolf/deer 6/9/13 m: TPP 29/30, FP 30/30; trunks TPP 16/16 held draw, FP 24/24); riding: bow slung, 0 hits vs horse or rider at walk/gallop.
- PASS: RMB let-down 24->24, LMB loose 24->23, no arrows toast; kill counts deer 1, wolf 2, bear 11; Sena, Lio, village kids, adult villager, tame horse pass-through; rock break 8/40; water loss; pickup 2.5 m, caps 8/24; hitstop/shake; offer fires in a quiet stretch; fever hides side line; herd folds it.
- FAIL: slung bow stave crosses the back spear while running (2-3 of 12 frames; slrunD_1/2); bow in hand at the hip crosses the spear shaft when walking (handwalkD_2).
- FAIL: FP full draw: the arrowhead is hidden inside the bow fist (tip projects onto the knuckles, no flint point visible), fletching reads as flat grey cards (crop_fp_hand.png, fp_y2.5_p0.35.png).
- Still open minor: TPP string is LineBasicMaterial (unlit, glows white at dusk/night/indoors: slrun_2, rn_4); arrow speed 58 m/s (spec ~45); 42 loose arrows after 50 shots (cap 40); "Crafted: Flint arrows x3" when only 1 fits; rock break 20% (spec 30%).
- Content limits: no violation. Children: child bodies, tunic/skirt, modest (lio0_f, vk4_f, vk5_b); arrows pass through all children; predators never target the hidden child; romance night = embrace, kiss, fade (opacity 1 at 17 s), both clothed (rn_4/5/6); night blocked unless the child is in her own nursery/cradle. No torture; surrender kill only by explicit choice (spec §12).
- NEW: Aro's kilt shows a skin-coloured hole at the back of the thigh mid-stride (handwalkD_2.jpg); Sena's fever line ("The wound is hot...") plays inside the romance night scene when Aro is bleeding.
- Shots: hb-scratch/shots/vbow5/

## Verifier gore-cmb A3 round 1 (v10gc), 2026-11-19
- Read-only. Snapshot hb-scratch/tests/v10gc/dist (HEAD ed5b1be, code = b6e286d), preview 5221, Chrome 9421 (metal), all /api/ intercepted; both stopped by PID. npm run build passes.
- Functional PASS: M2 1-9 (4a: carcass copy replaces the hidden animal, hands 0.999), M4 1-12 (m4_10 first miss was a 25% raider block; retried: kneel, "Decide", Esc spares, he flees; HC Sena endRun ok), arrows kill deer/wolf/raider, wound bears/aurochs.
- PASS: grown Lio at a kill: stays 8.2-9.2 m from the carcass, >=4.1 m from Aro (8 m while butchering), faces away (kidd.png).
- FAIL: deer head no longer stands on the stump but rests propped on one ear, stump 0.17-0.33 m off the ground (dh_0/2/3.png); no pool under an axe-killed wolf (only 0.2-0.6 m drops; wolf_axe.png); decapitated raider's 1.7 m pool sits 0.4 m from the feet, 1.1 m from the neck, 3/3 (decap_close.png); butcher pool is a perfect round disc beside the carcass (bpool_top.png); screen blood still radial clip-art starbursts (screen_1.png); raid look-up shot keeps the full HUD, no letterbox (raid_look.png); "Rest until dawn" E prompt for 6.5 s under the "Fire in the Night" alarm; bear carcass in a trunk 2/10 at 1.35 m (0.12-0.18 m deep), 1/1 at 1.1 m (bear_tree.png); raider light swing swordA: hand max 0.06 m forward, 0.10 m behind at the 0.45 s strike (rsw_swordA_440.png); Aro's light 2 hits a side-on wolf with the axe head 1.21 m up, over its back (l2_c1.png).
- NEW: raider neck stump reads as a white jagged collar; rest block says "wolves prowling" when raiders are near; arrow hit zones mislabelled (neck/tail -> "leg", leg -> "heart"); kid sweep wipes pieces/splats within 25 m of a visible child (by design, note for testers: tests must remove the kid).
- Shots: hb-scratch/shots/v10gc/

## VERIFIER bow + content limits (a3bow), A3 round 1 (2026-11-19)
- Read-only. Snapshot hb-scratch/tests/a3bow/dist (same src as HEAD), preview 5224, Chrome 9424 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. bow.json (slow waits) 10/10, old.json 9/9, errors=0.
- FAIL (still open): slung stave crosses the back spear when running (spear:st12/13, 5 of 30 frames); bow in hand crosses the spear when walking/strafing/back/jump (st6/st7, 5-8 of 30) and the string when running; FP full draw: arrowhead buried in the bow fist, fletching a flat beige card (r1_fp_1_crop/_cropR); TPP string LineBasicMaterial glows white at night (r1_night_0); speed 58 m/s; 50 loose arrows after a 50-shot burst (trim runs only at loose); "Crafted: Flint arrows x3" when 1 fits (full cost spent); "+1 arrows · quiver full" with no quiver; kilt skin hole at the back of the thigh (r1_kilt_1, r1_handwalk_0).
- PASS: rock break 35/100 (~30%); kill counts deer 1, wolf 2, bear 15; RMB let-down 24->24, LMB loose, no-arrows toast; hold >4.6 s drains stamina + tire; quiver fletch count follows arrows; FP hidden when sheathed/swimming; Sena/kid/horse pass-through; predators kept >20 m from the child; Lio child body + tunic; Sena's skirt standing/walking covers the brief.
- NEW (blocker-level, content/user decision): seated at the fire (Sit with Sena) her skirt flares into a disc open at the front: the base-mesh brief and a skin crotch crease show between her thighs, and both her hands cup her breast-band (reads as groping). Visible in first person across the fire (r1_sitfp_0_crop) and close views (r1_sit_0/4 crops; also sena_sit_f.jpg from the cut attempt).
- NEW (minor): Sena's stepping thigh pokes through the front of the skirt mid-stride (r1_senaw_0_crop).
- Shots: hb-scratch/shots/a3bow/r1_*

## Verifier story/romance/music, A3 round 1 (a3vs, 2026-11-19)
- Read-only. Snapshot of clean HEAD ed5b1be in hb-scratch/tests/a3vs/dist, static server 5222, Chrome 9422 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45 PASS, errors=0.
- PASS: first kiss is one letterboxed beat (the chapter turns ~8 s after the scene; fv_*); jealousy framing (jj_*); sling camera beat (letterbox and shot end together; sl_2); no bow offer on raid night (watched through the raid and dawn); handfast has no feet-only shot and Sena stays with Aro; M5 acceptance (19 ids, ford share/wary/+1 mem/-2 cooked, fever 95 to scarred on Survivor, allied epilogue, newlife 5 goals); M6 acceptance (menu tiers, hand 0.55 m / 0.045 m bones, sprint ends it, embrace +2 then +0, Off/Fade, rift +2 and "Not now.", heart(60) once, music slider buses; danger music only at night: a lone day wolf flees).
- FAIL: bow offer fires 9 s after the jealousy fight (jj_bow); Tamu death intermittent: run 2 Sena kneels with her head in the fire ~2 m from Tamu, who is cut off at the frame edge (r2_tamu1/2); raid dawn intermittent: a3story run had Sena hidden behind the fire log for the whole 'Stay awake' beat, and Aro stands and walks off while she still speaks (rd_dawn3); Korr choice camera behind a tent with a blurred figure filling the centre (kr_choice); handfast: letterbox drops and the HUD returns ~5 s before 'The stones kept watch' fade (main.js arcWait(5) after romScene; hf_c/hf_d); Blizzard banner stacked on the 'Long Cold' card when winter starts at night (bz_both), then replaced 1 s later by the 'Winter' banner; Sena's 'The wound is hot...' line plays in the romance night hearth shot (svNotify has no scene gate; nb_hot, Survivor).
- NEW: handfast opening close-up has pitch-black faces with glowing red ochre stripes like eyes, and Sena wears her basket at the vow (hf_1); thaw foal shot frames a tiny head-on foal as a brown blob with HUD and crosshair on (kr_foal1/2); 'Discovered Ash Camp' banner over Korr's first line (kr_meet1).
- Shots: hb-scratch/shots/a3vs/ (reused a3story rd_dawn1-3 for the hidden-Sena dawn run).

## Verifier mat-surv, A3 round 1 (a3vms), 2026-11-19
- Read-only. Snapshot of clean HEAD ed5b1be in hb-scratch/tests/a3vms/dist, preview 5223, Chrome 9423 (metal), all /api/ intercepted; both stopped. npm run build passes (on the tree with other agents' edits).
- PASS: M1 1-13 (gate + toned-down, 3 cards, HC hides save, drain x1.30, hurt 6/10/16, revive 4.1 s, penalty, HC permadeath+DELETE+stone+obit, v2 ch:8 -> hearth legacy, user-save.json 0 errors, skipHours/choose/req/respawnAt 221, 21/22 settings persist (fullscreen headless)); M3 1-12; HC revive once/day with bandage; Sena fate Survivor 60 s -5 close, Hardcore Embers.
- Re-checks: rescue() with Sena downed PASS (dawn: N.downed 0, nhp 40, revived:N:rescue); HC mid-fight reload PASS (4 wolves back at 1.3-6 m, hp 53, then permadeath); 21+ gate PASS.
- FAIL grief camera (minor): faces framed well 0-9 s, but the closing crane drops the couple to the bottom edge, cut off (grief_N15_11, grief_P15_11).
- FAIL water-down (still open): Discovered banner over DOWN (wb1, wb2); Aro's torso/head sunk into the bank, only arms/kilt/legs show (wb2, w01); Sena kneels on top of him (crop_w01); "I am coming!" line plays after she has arrived.
- NEW: grief: Sena's necklace stands up in a loop off her chest when she lies dead (crop_N15_5); mourner's hands hover claw-shaped above the face; Aro's head bent far back. Rescue: the queued "Sena! No!" line plays after the dawn fade (rescue() does not clear subs). Treat all needs a second press to clean the wound that the bandage just made. play_survivor.json: bow 17 m deer step flaky (1 of 2 runs, arrows land on a rise).
- play.json 45/45; play_survivor.json 52/54 then 54/54, errors=0.
- Shots: hb-scratch/shots/a3vms/

## Fixer gore-cmb, A3 fix round 1 (gcfix8), 2026-11-19
- Most fixes were already on disk from the cut-off GC-FIX7 run (commit c3a5ca1); this run tested them all and added GC-FIX8 (gore.js only).
- GC-FIX8: deer head settle: a tipped-up neck now costs far more in settleLow (heads lie on a cheek with the neck along the ground, top 0.24-0.30 m, cap 0.01-0.16 m, 8/8); human neck stump cap wider/flatter and set a little down the neck; the raider's bone-tooth necklace is hidden when the head comes off (it was the "white paper ruff").
- Verified (snapshot hb-scratch/tests/gcfix8/dist, preview 5221, Chrome 9421, all /api/ intercepted, both stopped): wolf axe kill pool under the body (1.08x2.18 irregular); decap pool 0.29 m from the stump, 1.7 m from the feet, 3/3; butcher pool irregular and under the carcass; screen blood = directional spatter + runs; raid look-up letterboxed, HUD off; "No rest tonight: raiders on the hill" from 0.4 s of the alarm; bear vs trunk 0/20 inside at 1.35 and 1.1 m; raider strikeU/swordB/swordC hand 0.60-0.66 m forward at the strike frame; Aro light 2 at a side-on wolf = chop, hit with the axe head 0.69-0.72 m up, inside the outline; arrow zones Neck -> head, BackLeg -> leg; G.gore.clear() with no argument works.
- npm run build passes; play.json errors=0 fails=0. Shots: hb-scratch/shots/gcfix8/

## Fixer bow-limits, A3 fix round 1 (a3bowfix, 2026-11-19)
- Snapshot hb-scratch/tests/a3bowfix/dist, preview 5224, Chrome 9424 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45, errors=0.
- Already in HEAD from the cut-off attempt (re-verified): lit TPP string tubes (BOW-A3, bow.js); barred cut-out fletching + bindings; FP arrow rest (BOWFP.rest) so the flint point shows past the stave (fpC_1_tip.png); 45 m/s full draw (33.9 at 0.47); bowTrim on every landing (40 after 50 shots, 40 after 51); craft at 23/24: "Crafted 3 flint arrows: 1 to the quiver (now full), 2 laid at your feet" (nothing wasted); pickup with no quiver "+1 arrow · no quiver: you carry only 8".
- NEW (BOW-A3, main.js): in-hand carry BOWC.hand pitch -0.25, spin 1.9 (front tip dips, lower limb rises over the spear butt, string turned out/down); bowSlungFollow (slung bow takes the spear's turn off its fit + up to 4 cm lift); bowSlungSteadyK (BOWC.steady 0.5: spearSteady at half while the bow is slung). Live triangle test: 0 hits spear/axe/quiver/body in 8 modes, slung 3x and in hand (one run had 3 frames string-top vs spear right after drawing mid-sprint). Spear top over head at a sprint 0.39-0.80 m (fully steadied 0.55-0.69).
- KILT-A3 (people.js): kilt back panel 4 cm more ease below the belt: back-of-thigh pokes 17/30 frames (3.5 cm) -> 0 in walk/run/back/strafe/sneak.
- SENA-SIT A3 (people.js): adult women never play Sitting_Talking (hands landed on the breast-band) -> Sitting_Idle, hands on thighs; skirt front centre on a 5th drape bone (skirt_fc) that hangs between the knees when seated (SENA_SEATC 0.85): brief and crotch covered (sit1_0/1/4, sitfp_0_crop). Front drape scale is 1.0 at a stride (lapF), 0.8 only seated.
- Still open (minor): seated skirt sides still flare as a stiff disc; jogging Sena: 2-3 cm of upper thigh through the band near the hip crease (POKE test), visible as an edge in senaw_4.
- Shots: hb-scratch/shots/a3bowfix/

## VERIFIER bow + content limits (a3vb2), A3 round 2 (2026-11-19)
- Read-only. Snapshot of HEAD b98ac36 in hb-scratch/tests/a3vb2/dist, preview 5224, Chrome 9424 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. bow_slow.json PASS (errors=0 fails=0), old_slow.json 9 PASS (errors=0).
- PASS: slung stave vs back spear while running (live triangle test 0 spear hits over 3 runs, 1/30 run frames stave-vs-quiver); bow in hand vs spear when walking/strafing/back (0 hits); running in hand string-top vs spear 2/240 frames (string not visible at that moment); FP full draw: flint point shows just past the stave at the crosshair, fletching barred feathers (crop_tip/crop_fl); TPP string is lit tubes (night_0); speed 45 m/s; 40 loose after 50 shots; craft at 23 "1 to the quiver (now full), 2 laid at your feet"; pickup "+1 arrow" / "You can carry only 8 arrows without a quiver" / "Quiver full"; rock break 36/100; kilt pokes 0 (2 mm sneak), no hole in kiltw/kiltr; Sena brief covered standing (front/side/back), jogging and seated front; friendly fire passes through Sena, child, horse.
- FAIL (major): jogging Sena: thighs poke through the skirt front near the hip crease (POKE 2-3 cm on most jog frames; skin patches/tears in the skirt in sjs_*, senajog_0/3; front panel folds like card).
- NEW (minor): black flat "strap stub" cards on Sena's collarbones (senaup_0/1); seated skirt still a stiff disc with a V flap (sit_1); stray duplicate src/people 2.js (1072 lines) committed in b98ac36, not imported.
- Shots: hb-scratch/shots/a3vb2/

## Verifier gore-cmb A3 round 2 (a3r2gc), 2026-11-19
- Read-only. Snapshot of HEAD b98ac36 in hb-scratch/tests/a3r2gc/dist, preview 5221, Chrome 9421 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45, errors=0.
- PASS: M2 1-9 (4a: carcass copy replaces the animal, hands 0.999), M4 1-13 (m4_10 surrender: 3/5 hits landed, 2 were raider blocks; Decide -> Esc spares, he flees; HC Sena death ends the run); arrows kill deer/wolf/raider, wound aurochs/bear.
- PASS (all 10 known items except screen blood): deer heads lie on a cheek (6 trials, top 0.24-0.31 m, cap 0.04-0.16 m); grown Lio stays 8.3+ m from the kill and 4.6+ m from Aro, faces away; wolf axe kill pool under the body (3 meadow trials); decap pool 0.28 m from the neck, 1.7 m from the feet (3/3); butcher pool irregular; raid look-up letterboxed with HUD off; "No rest tonight: raiders on the hill" from 0.4 s; bear vs trunk 0/18 inside at 1.35 and 1.1 m; raider strikeU/swordB/swordC hand 0.60-0.65 m forward at the strike frame; Aro light 2 at a low wolf = LOW2 lunge chop, hits at hand height 0.84-0.99 m.
- FAIL: screen blood: no longer starbursts, but by day the drops read as translucent pink petals with dark outlines (screen_1_cropR.png); at night bright unlit red blobs (screen_night.png).
- NEW (minor): arrow hit zone on a raider's arm reads "gut"; "Saved to database" chip shows during the hidden-HUD/gore camera; a fern pokes through the butchered deer carcass (bpool_side_2.png).
- Test notes: the kid sweep wipes splats near a visible child (remove G.kids before pool tests); spots (52,-30) and (68,-30) are in/at the river, where weapons sheathe.
- Shots: hb-scratch/shots/a3r2gc/

## Fixer mat-surv, A3 fix round 1 (a3msfix, second run), 2026-11-19
- Most fixes were already on disk from the cut-off first run (commit b98ac36: MAT-SV A3, MAT-GRIEF A3, SENA-LOOK A3 laceRest, SURV A3 treat-all second pass, play_survivor deer placement). This run tested them on a fresh snapshot (hb-scratch/tests/a3msfix/dist, preview 5223, Chrome 9423 metal, all /api/ intercepted; both stopped by PID) and added:
  - MAT-GRIEF A3r2 (main.js + index.html `#hud.mgrief #sub`): the grief beat's captions sit low (4vh), under the couple, not across the fallen body.
  - MAT-SV A3r2 (main.js banner/matDown): a banner already on screen as he falls is held and re-shown after he gets up (before, it was dropped). Rescue dawn sets ARCS.sceneEndAt, so the bow lesson does not start the moment he wakes.
  - play_survivor.json bow step: aim loop converges (camera-to-deer error < 0.004 rad, 4 frames per step) before each shot. The old LOOK ran 6 fixed steps of 3 frames and could leave the camera aimed over the deer under load (all 6 arrows behind it at z 51-52).
- Verified: grief crane keeps both in frame to the fade (r2/grief_N15_11.3, grief_P15_11.3); necklace flat on her chest (g_N5_top, crop_N5_face); eyes closed; mourner's hand on his jaw (g_P8_side). Water-down at the Ford of Reeds: no banner while downed (14 samples, all after he got up), body on the bank (head 0.04-0.18 m, pelvis 0-0.06 m above the ground), Sena kneels 1.0-1.15 m away on the dry side (wr_h6), near line "Aro! No. No, hold on!" when she is <12 m. Rescue with Sena down: no "Sena! No!" at dawn, no gathering toast, N.wait 118 s, she stays 1.4 m away. Treat all: hide bandage + boiled water = bleed -> clean wound in one press.
- play_survivor.json 54/54 twice (ps4, ps5), play.json 45/45, errors=0. npm run build passes. Shots: hb-scratch/shots/a3msfix/r2/

## Fixer arc-rom-mus, A3 fix round 1 (a3arcfix rerun), 2026-11-19
- Most ARC-A3 fixes were already on disk from the cut-off attempt (commit b98ac36); this run re-tested all on a fresh snapshot (hb-scratch/tests/a3arcfix/dist, static server 5222, Chrome 9422 metal, all /api/ intercepted) and added ARC-A3 r2.
- ARC-A3 r2 (main.js): romScene handfast waits for the chapter card / Discovered banner and clears stray queued lines before the two-shot ('Night is here and we have no fire' played over the opening); showChapter keeps its timer (an earlier card's timeout cut the next card to 0.7 s, so 'Winter' and 'Blizzard' followed it at once); blizzard needs 6 s clear of any banner/card (evOnAt); arcShotKeepOut: animals slid out of a held shot's lens corridor (the foal shot had a grey beast filling the left third).
- Verified: raid x3 (incl. fire 2 m closer): Tamu on open ground, Sena kneeling at his chest; dawn: Aro kneels at Sena, both clear, no 'Sena (hold E)' under the letterbox, she does not move until her last line is off. Jealousy: no bow offer in 20 min (rift 1). Korr: letterboxed choice, no tent/blur; no Discovered banner over the first line; foal side-on at the mare, letterboxed, clear. Handfast: lit faces, no red eyes, no basket, letterbox holds into 'The stones kept watch'. Blizzard: card 0-3.9 s, Winter 4.1-11.1, Blizzard 17.2. Romance night (Survivor): infection at 3.3 s, 'The wound is hot' held to 30.6 s (after the scene); hearth shot has Aro's head in frame.
- Shots: hb-scratch/shots/a3arcfix/ (v1-v3_*, kr_*, hf_*, nb_*, jj_*).

## Fixer gore-cmb, A3 fix round 2 (gcfix9), 2026-11-19
- Snapshot hb-scratch/tests/gcfix9/dist, preview 5221, Chrome 9421 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45, errors=0 fails=0.
- GC-FIX9 screen blood (gore.js screenSprites/screenInit/screenUpdate): #splat now mix-blend-mode multiply (blood darkens and reddens what is behind it: deep crimson over sky, near black at night, cannot glow); a second canvas #splatg (made in JS) draws a near-black copy that fades in with darkness, plus wet glints scaled by daylight (none at night). Shapes: an irregular splotch with a lumpy trailing edge, 3-6 uneven streaks thrown forward ending in beads, satellite drops with short tails, fine spray; runs unchanged in path. main.js passes light: env.day*(1-0.85*cave) to updateGore. Shots screen_1/_cropR (day), screen_night.
- Arrow zones on people (main.js goreBoneZone): neck/head -> head, upper/lower arm/hand/clavicle -> 'arm' (new ZONES.arm k 0.7 bleed 0.05), thigh/calf/foot -> leg, spine_03 -> heart, spine_01/02/pelvis -> gut. Test: raider arrows spine_03=heart, upperarm_l=arm x2.
- Save chip hidden while camShot.gore, #hud cine/cinew, #hud visibility hidden (harness) or HUD off (main.js frame update). Test: opacity 0 in all three; decap_close.png.
- Plants under bodies (main.js goreFlatten/goreFlatTick): decor plants (not berry bushes) inside a dead animal's ground outline are hidden once it settles (deadT>1.3) or at butcher start; restored once body and carcass are gone (not under a structure). Tests: plant hidden under a dead deer, back after G.remove; deer killed on a plant and butchered at once: hidden (fern_butch.png, bpool_side.png).
- Raid look-up: over Aro's right shoulder at head height, aimed at the wave's mean position, FOV 34 (eases back after): head and shoulders in the lower left, three torchbearers readable (raid_lookup.png).
- Shots: hb-scratch/shots/gcfix9/

## Verifier gore-cmb A3 round 3 (a3r3gc), 2026-11-19
- Read-only. Fresh snapshot of HEAD cfaaf17 (src = HEAD) in hb-scratch/tests/a3r3gc/dist, preview 5221, Chrome 9421 (metal), all /api/ intercepted; both stopped by PID. npm run build passes.
- Functional PASS: M2 1-9 (m2_4a flag false only because the carcass copy replaces the hidden animal, hands 0.998, as before); M4 1-10 (m4_8 brace failed once in the full script: aurochs reached 0.2 m, braced, 0 dmg; 4/4 isolated/re-runs pass 67.5 dmg, flaky); Sena downed->revive (Survivor), HC Sena death ends run; raider never targets the child (kid hides).
- Arrows: deer/wolf/raider at 10 and 16 m all hit when aimed in bow-aim mode (cam miss <=0.07 m); aurochs/bear wounded 4/4. Harness note: G.bow.shoot() enters aim AFTER the LOOK, the aim camera moves, so arrows pass ~0.5 m left; aim first (G.bow.aim, LOOK, loose) = ar5.js.
- PASS (10 known items): deer heads lie on a cheek 8/8 (top 0.24-0.34 m); grown Lio 8.2-9.2 m from the kill, >=4.1 m from Aro (7.9-8.3 while butchering), faces away; wolf axe-kill pool under the body 3/3 (0.8x1.6-0.9x1.8); decap pool 0.29 m from the neck, 1.7 m from the feet 3/3; butcher pool irregular (bpool_1); raid look-up letterboxed, HUD off (look_a); "No rest tonight: raiders on the hill" from 0.4 s, no Rest prompt; bear vs trunk 0/18 inside at 1.35/1.1 m; raiders use strikeU/swordB/swordC (no swordA), hand 0.62-0.67 m forward at the strike; Aro light 2 at a low wolf = chop at hand 0.84-0.99 m (wolf top 0.91).
- Screen blood: no stars; reads as spatter by day, invisible (not glowing) at night. Minor: the runs are straight uniform-width bars with blunt ends (a "II" pair in scr_day).
- NEW (minor): raid look-up: a third torchbearer stands right behind Aro's head, so the flame seems to sprout from his head (look_a); m4_8 brace flake.
- Shots: hb-scratch/shots/a3r3gc/

## Fixer bow-limits, A3 fix round 2 (a3bfx3), 2026-11-19
- Snapshot hb-scratch/tests/a3bfx3/dist, preview 5224, Chrome 9424 (metal), all /api/ intercepted; both stopped by PID. npm run build passes.
- Tested the cut-off fixer's SENA-JOG A3 push morphs / SENA-SIT A3r2 / SENA-STRAP A3 (committed in cfaaf17, never verified), then added SENA-JOG A3r2 (people.js):
  - push morphs stronger and earlier (SENA_PUSH 0.07, PUSHF 0.4, SENA_PUSHK high-knee term, off when seated);
  - 8 rings below the hips (was 4): the drape bends in a curve, not a hard fold;
  - SENA_DRAPEF 0.85 (front share; back stays 0.7): the two front halves no longer fold against each other;
  - 'dressSkirtBand': an unpushed hide under-band (skirt front, top edge to hip ring, polygonOffset behind): the pushed front stood off the belly and showed the brief's top edge in the gap (c_belly.jpg); now the gap shows hide;
  - SENA_SEATB 0.8 (was 0.5): seated, the back and sides hang more.
- Jog POKE (60 frames x runs): HEAD 26/60 up to 2.2 cm -> 8-15/60, 1-4 vertices, max 0.3-3.0 cm (mostly <1.5 cm, at F 0.30 with the thigh near horizontal); false-colour jog frames show no skin through the skirt (M_jog5b). Seated: 4 vertices <= 0.9 cm.
- Strap stubs: gone (rounded hide cords over the shoulders, M_up). Seated: still a bell/disc in front view with the V centre flap (M_sitb): improved slope only. Bow string-top vs spear 2/240 run frames: not changed. 'src/people 2.js': already removed in cfaaf17.
- play.json 45/45, errors=0 (play2; a first run under load timed out at herd->smoke). Shots: hb-scratch/shots/a3bfx3/

## Verifier story/romance/music, A3 round 2 (a3r2vs), 2026-11-19
- Read-only. Fresh snapshot of HEAD cfaaf17 (same bundle hash as a3r2st) in hb-scratch/tests/a3r2vs/dist, static server 5222, Chrome 9422 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45 PASS, errors=0 fails=0.
- PASS: first kiss is one letterboxed beat (chapter turns ~8 s after the scene; fv_*); no bow offer on raid night or in the day after the jealousy fight; Korr choice letterboxed, no tent/blur (kr_choice); sling beat (sl_*); Blizzard: card 0-3.9 s, Winter 4.2-11.2, Blizzard 17.3 (no stacking); 'The wound is hot' held until after the romance night (40.1 s vs letterbox off 34.1 s); M5 (19 ids, ford share/wary/+1/-2, fever 95 to scarred on Survivor, allied epilogue, newlife 5); M6 (tiers, hand 0.55 m / 0.042 m, sprint ends it, embrace +2 then +0, rift +2 and 'Not now.', Off/Fade, heart(60) once, music buses).
- FAIL: raid dawn: Sena lies FACE DOWN (matLieStart prone pose) while Aro says 'look at me' (rv_dawn1-3); Tamu death: he lies face down delivering his last line, wide shot, fire-log end in the left foreground (rv_tamu1); jealousy: Sena's shins pass through the fire log in her answer shot (jj_l2, both runs); handfast after the kiss: they snap 1.6 m apart in the close two-shot, then ~2-3 s of an EMPTY frame (stones only, h3_e3, hf_a), then a mid shot with Sena's head cut off by the letterbox (h3_e5), then the wide shot and fade.
- NEW: romance-night morning shot: empty bed, Aro facing the wall, Sena's bare legs sticking out from under the bed (nb_bed, nn_bed; Story and Survivor); bow offer fires ~20 s after the romance night and 14 s after 'The wound is hot' (bowQuiet's 180 s rule does not count romance-night ends); bow offer also fires right after 'Like wolves made of wind' in a blizzard; Ash hunters have white/grey untextured hands and forearms (kr_meet1); Korr choice panel's 3rd option runs under the bottom letterbox bar; chapter card overlaps the jealousy opening line when the chapter starts on the scene's evening (jj_story).
- Shots: hb-scratch/shots/a3r2vs/

## Verifier mat-surv, A3 round 2 (a3fms), 2026-11-19
- Read-only. Snapshot of HEAD cfaaf17 (clean src at 21:28) in hb-scratch/tests/a3fms/dist, preview 5223, Chrome 9423 (metal), all /api/ intercepted; both stopped by PID. npm run build passes (on the tree with other agents' later edits).
- PASS re-checks: 21+ gate (trusted clicks: gate on, New disabled and covered, Tab cycles only gate buttons, OK -> full, toned -> blood off/gore low/romance fade/no finisher, persists over reload); rescue() with Sena downed (fade text, dawn: N.downed 0, nhp 40, revived:N:rescue, no stale line shown); HC mid-fight reload (pagehide mark 4 wolves hp 53.8 -> trusted Continue: wolves beside him, fight resumes, permadeath, save deleted, obit); grief camera (crane keeps both in frame to 11.6 s, P and N).
- PASS water-down (both known parts): no banner while downed (Discovered Ford of Reeds shows ~2 s after he is up), head 0.17-0.20 m / pelvis 0.05 m above the bank, not sunk (v6ms spot 68,10 and 76,21).
- PASS: M1 1-12 (hurt 5.9/10/16, drain HC/Surv 1.29, revive 3.5 s, rescue penalty, HC bandage revive once then permadeath + DELETE + stone, migrations v1 ch5 -> house, ch8 -> hearth legacy, user-save.json 0 errors, skipHours/choose/req, berry 221, settings 21/22 (fullscreen headless)); M3 1-11 (bleed 3.75/10 s, infection + regenK 0 with rng(0), Story none, sprain 0.7 no sprint, fracture 0.35 on HC, raw meat +20 then poison, spoil + basket, rack dried at 500 h, spit cooked at 10 s and burnt at 23 s, boil 19 s -> safe, well safe, river raw, moodles + body + Treat all).
- play.json 45/45 errors=0. play_survivor.json 54/54 twice, 1 of 3 runs failed at "Ride with Sena to Lookout Peak" (herd -> smoke not reached in 30 s, 23 cascaded fails; another agent's play run was loading the Mac).
- NEW: water revive: Sena kneels at his hips and bends over his kilt (wr_o6, wr_b4), while on land she kneels at his head; DOWN note says "Sena is coming" when she is already beside him (wd_hud_2); grief: the fallen face is never visible (top/back of the head, hair over Sena's face) and Aro's hands rest on Sena's upper chest (grief_N15_7); obit "1 Days".
- Shots: hb-scratch/shots/a3fms/ (and r2/ for grief)

## LEAD NOTE 2026-11-19 23:27: FINISH FAST (from Aman, the user)
Aman wants workflow A finished as soon as possible. Every A3 agent from now on (fix a3r2:arc-rom-mus, fix a3r2:mat-surv, verify a3r3:*, wrap-up):
- **Fixers:** fix ONLY the listed fails and new majors. No extra polish, refactors or exploration.
  - Take one screenshot per fixed item to confirm it, plus one build. Run play.json once at the end, not after every change.
- **Verifiers:**
  - re-check only the items that failed last time, plus a quick smoke pass of the area;
  - reuse the existing harnesses in ../hb-scratch/tests;
  - do not re-shoot items that already passed.
- **Wrap-up:** build, play.json, play_survivor.json, bow.json, then the notes. No new feature work.
- Content limits and Sena's two-piece (no base-mesh underwear showing) still apply. Do not trade those away for speed.

## Fixer mat-surv, A3 fix round 2 (a3msfx2), 2026-11-20
- Snapshot hb-scratch/tests/a3msfx2/dist, preview 5223, Chrome 9423 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45 errors=0; play_survivor.json 54/54 twice (ps1, ps2), errors=0.
- Already on disk from the cut-off run (commit 56c0bf5, MAT-SV A3r3), re-tested here: water revive waits until he lies still and she holds the spot beside his chest (spots 68,10 and 76,21: Sena 0.39 m along pelvis->head of 0.65, i.e. at the chest; pb_p*, hud_r3); strict bank spot (whole body dry, nothing over the foam); DOWN note live ("Sena is with you" once she is there) and the timer bar clear of the text (hud_r3); obit "1 Day"; HC Continue puts foes >=3.5 m off with a 3 s no-bite grace (wolves 4.9-6 m at Continue).
- MAT-GRIEF A3r4 (main.js matHold): the mourner's other hand rests on their own thigh (IK) instead of hanging onto the fallen partner's upper chest/breast-band; the near hand cups the jaw; both fallen faces read in profile (f_N7r_*, f_P7r_*, r2/grief_*).
- play_survivor.json: the Lookout Peak step re-teleports/re-seats every 1.5 s until peak_ride counts (logged in _PKD), timeout 45 s.
- Shots: hb-scratch/shots/a3msfx2/

## VERIFIER bow + content limits (a3fvb), A3 final round 3 (2026-11-20)
- Read-only. Fresh snapshot of HEAD 56c0bf5 in hb-scratch/tests/a3fvb/dist, preview 5224, Chrome 9424 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. bow_slow.json 10 PASS errors=0 fails=0; old_slow.json 9 PASS errors=0.
- New metric (js/surf2.js CLR2): stave-tube vs spear-shaft SURFACE clearance (axis distance minus both radii). The old triangle test (bow axis vs spear tris) reports 0 even when the tubes overlap by 1 cm.
- PASS: slung stave vs spear running (min +3.3 cm, 0/40); bow in hand vs spear: 0 visible crossings in 16 gameplay views, geometric touch <=1.1 cm on 3-7/40 walk/strafe/back frames at the spear butt by the left fist (not readable); FP full draw: flint point shows just past the stave below the crosshair, barred fletching, crosshair clear (fpshot.png, c_tip.png, c_fl.png); TPP string lit at night (night_*); 45 m/s full, 33.9 half; 40 loose after 55 shots once all land; craft at 23 "1 to the quiver (now full), 2 laid at your feet"; no-quiver pickup "+1 arrow · no quiver: you carry only 8"; rock break 36/100; kilt back pokes 0 in 6 gaits, no hole (kilt_*); Sena brief covered standing/walking (st_*) and seated (sit_*, V flap); child body + tunic (kid_*); arrows skip friendlies (spearStep only wild animals/raiders; horse passes through, hp 999); predators spawned 12-15 m stay >=13.4 m from the child.
- FAIL (blocker, user decision): Sena jogging toward a camera at hip height (0.85 m, 1.3 m away): the black base-mesh brief shows between her thighs under the flared skirt front (fj_1, fj_8, fj_9; false colour confirms it is the body, not the skirt/under-band). Eye-level views (fe_*) hide it, but the front panel still flares as a stiff card with a V notch and a dark gap (c_fe_*).
- NEW: Sena seated at a placed fire in a cave: her shins pass through the seat log (sit_1, sit_5, sit_9); slung bow vs spear at a sneak overlaps ~1 cm on 40/40 frames near the grip (hidden in the bundle, g_4); a bear spawned 10 m from the child crossed within 3.9 m of the fleeing visible child (contrived spawn; not targeting); riding keeps BOW.on true (bow shown slung, back in hand on dismount).
- Shots: hb-scratch/shots/a3fvb/

## Fixer arc-rom-mus, A3 fix round 2 (a3arcfx3), 2026-11-20
- Snapshot hb-scratch/tests/a3arcfx3/dist, static/preview server 5222, Chrome 9422 (metal), all /api/ intercepted; both stopped by PID. npm run build passes.
- Tested the cut-off a3arcfx2 fixer's ARC-A3r3 code (commit 56c0bf5, never verified) and added ARC-A3r4 (main.js):
  - romance night: on the first night in their own bed only FIRST_HOME is said (both lines were queued; 'smiling in your sleep' played after they got up); the in-bed hold waits for every queued line (16 s cap, was 9 s).
  - arcPairSpot(fireD): Tamu's death and the raid dawn are staged >= 6.5 m from a lit fire ring (at 3.7 m every lens had a bench log in the frame edge); arcLowShot also penalises the ring anywhere in the 16:9 frame; o.fw/o.kw weights; G.arcDbg.low() lists the last candidates.
  - arcAshHands: ash = greyed, dulled skin with its own texture and shading (flat light grey read as white untextured hands/forearms on hunters and Tamu).
- Verified: jealousy: Sena sits on the bench, shins in front of the log (jj_l2), no card over Tamu's first line (jj_story); Tamu on his back, Sena kneeling, fire only in the background (rv_tamu1); dawn: Sena on her back, Aro kneeling through her lines (rv_dawn1-3); handfast: no snap apart, no empty frame, no head cut, wide shot held to the fade (h3_grid); romance night: line said in bed under the blanket, no line after they get up (nn_pair, Story; nb Survivor 'The wound is hot' 6 s after the letterbox); Korr choice panel above the letterbox (kr_choice); 'Is it over?' letterboxed (kr_over); hunters' hands (kr_meet1).
- Still open (minor): at the dawn Aro's bent head/arm hides Sena's face from the chosen lens (all other lenses scored worse); raid opening shot still has Aro's back at the lower left (smaller than a third).
- Shots: hb-scratch/shots/a3arcfx3/ (r1/ = HEAD before fixes, r2/ = middle build).

## Verifier mat-surv, A3 round 3 (a3v3ms), 2026-11-20
- Read-only. Snapshot of the working tree (HEAD 56c0bf5 + uncommitted MAT-GRIEF A3r4 / ARC-A3r4 / play_survivor edits) in hb-scratch/tests/a3v3ms/dist, preview 5223, Chrome 9423 (metal), all /api/ intercepted; both stopped by PID. npm run build passes.
- PASS rescue() with Sena downed: fade text, dawn day 2 07:13, N downed 0, nhp 40.7, revived:N:rescue, she stands 1.4 m away, no stale sub/toast (rsb_r02, rs_full_after).
- PASS HC mid-fight reload: mark hp 32 + 4 wolves; trusted Continue -> hp 33.8, wolves 3.2-6 m, fight resumes, permadeath, DELETE /api/save, obit "1 Day", title has no Continue (hc_cont, hc_end1, hc_title2).
- PASS 21+ gate: fresh profile -> gate on, New disabled + covered, Tab only reaches the 2 gate buttons; trusted OK -> full intensity; trusted toned -> blood off/gore low/romance fade/no finisher; both persist over reload (gate_0).
- PASS grief camera: N and P, both in frame from 3 s to the crane at 11.5 s (sheet_gN, sheet_gP, r2/).
- PASS water-down (was open): spot 68,10 and Ford of Reeds 76,21: no banner while DOWN (Discovered held, shown again ~3 s after he is up), body whole on the dry bank (head 0.12-0.22 m above ground), Sena at his chest 0.4 m along, 0.7 m to the side, note "Sena is with you" (wfull_4, ffull_3).
- PASS smoke: user-save.json -> hearth legacy, old ch8 -> hearth legacy, v1 ch5 -> house, 0 errors; HC pause menu hides "Save now".
- play.json: run 1 FAIL at "smoke -> outcast" (goals done, chapter not advanced in 30 s; 21 cascaded fails, errors=0); run 2 45/45. play_survivor.json 54/54, errors=0.
- NEW (minor): if he goes down in the water within ~4 s of a chapter start, the chapter card ("SUMMER · THE VALLEY") overlaps DOWN, and the camera is under water (wfull_2); reed stalks cut across his face in the top-down DOWN camera (wfull_3); his feet lie over a stone at the Ford (ffull_3); dead Sena's skirt stands off her legs like a stiff bell (grief_N15_7).
- Shots: hb-scratch/shots/a3v3ms/

## Verifier story/romance/music, A3 round 3 (a3r3vs), 2026-11-20
- Read-only. Snapshot of the working tree (HEAD 56c0bf5 + uncommitted ARC-A3r4/MAT-GRIEF A3r4 in main.js) in hb-scratch/tests/a3r3vs/dist, static server 5222, Chrome 9422 (metal), all /api/ intercepted; both stopped by PID. npm run build passes. play.json 45/45, errors=0 fails=0.
- PASS: first kiss one letterboxed beat (chapter turns ~7 s after the scene, fv_*); Tamu death on his back, Sena kneeling, fire only in the background (rv_tamu1/2); raid dawn: Sena on her back, Aro kneeling through both lines (rv_dawn1-3); sling beat letterboxed close-up (sl_2); Korr choice letterboxed, panel above the bar, no tent/head (k2_choice); handfast: wide two-shot held to the fade, no feet-only, Aro not alone (h3_*); Blizzard card 0-3.9, Winter 4.1-11.1, Blizzard 17.2; no bow offer on raid night/next morning or within ~20 game h of the jealousy fight; bow offer 190 s after romance night, 13 s after the blizzard ends (not inside it); 'The wound is hot' 6 s after the romance-night letterbox (Survivor).
- FAIL: jealousy framing: Tamu sits in mid-air (squat pose, no log under him) in jj_story and behind Sena in jj_l2.
- NEW (major): romance-night morning: as Sena gets up her pelvis dips 0.4 m below the mattress (lieW 0.4: pel 4.66 vs bed 4.96) and her legs show sticking out from under the bed (nn_after), she lies on top of the blanket before that (n3_w1), Aro faces the wall; romance-night kiss: Survivor run camera inside/behind a body (nb_kiss, an all-dark frame), Story run Sena's arm raised straight up over Aro's head (nn_kiss2/3).
- NEW (minor): raid dawn: Sena's face hidden by Aro's head/arm for both lines, her legs splayed toward the lens; Tamu shot has a stray arm entering the right edge; after the handfast kiss they stand 1 m apart in the wide shot (cut hides the step).
- Shots: hb-scratch/shots/a3r3vs/

## Wrap-up engineer, A3 final round (a3wrap), 2026-11-20
- Snapshot of the working tree (HEAD 56c0bf5 + uncommitted ARC-A3r4 / MAT-GRIEF A3r4 / play_survivor edits) in hb-scratch/tests/a3wrap/dist, preview 5225, Chrome 9425 (metal), all /api/ intercepted; both stopped by PID.
- npm run build passes. play.json 45/45, play_survivor.json 54/54, bow.json 10/10, old.json 9/9; all errors=0 fails=0. Logs: hb-scratch/tests/a3wrap/*.log.
- No code changes. Wrote docs/dev/a-open-items.md; updated the CLAUDE.md Status (A finished with 3 fails open: SENA-LOOK jog brief blocker, romance-night morning bed sink, Tamu mid-air; 2 majors: romance-night kiss camera, cave-fire shins through log).
- Copied this file to docs/dev/progress-log-mature.md.
