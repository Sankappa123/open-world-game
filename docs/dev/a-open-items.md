# UPDATE 2026-11-20 (final): ALL A blockers, fails and majors are CLOSED
- Final pass "A-last-two", checked by an independent verifier:
  - bra strip: PASS. SENA-LOOK A3c: an exact-texel hide layer, and the bra texels are repainted hide in Sena's own skin copy.
  - romance-night morning: PASS. ARC-A3r7: one dip cut to both standing, `h.snapLoop()`, `R.upHold` on the birth morning.
- Tests: build passes; play.json 45/45, errors=0.
- Evidence: `../hb-scratch/shots/a3l2a/`, `a3l2b/`, `a3l2v/`.
- What remains is only the minor polish items listed below.

# UPDATE 2026-11-20: last fix pass (workflow "A-last-five")
A focused pass targeted the 5 open items. An independent verifier then re-checked them (evidence in `../hb-scratch/shots/a3vfin/`).
- **FIXED, verified:**
  - jog brief blocker: `senaLoin()` in people.js adds a hide loincloth layer over the brief texels; 0 brief pixels in 56 frames;
  - cave-fire seat (`CAVE-SIT`, `FIRE_SIT_IN`);
  - Tamu mid-air in the jealousy scene;
  - romance-night kiss camera.
- **STILL OPEN:**
  1. **Content rule (new):** the base-mesh bra shows as a dark lace strip above Sena's breast band in every pose (`a3vfin/chest_0.jpg`, `chest_1.jpg`). Fix it like `senaLoin()`: a hide layer over the bra texels, or a raised band edge.
  2. **Romance-night morning:** Sena no longer sinks, but she rises as a stiff plank. She floats above the bed with her legs out over the floor (`a3vfin/nb_w45.png`, `nn_up2.png`), and Aro still faces the wall. She needs a real sit-up or roll-out, or the shot should cut past it.
- Tests: build passes; play.json 45/45, errors=0.

# Workflow A: open items after the final round (A3, 2026-11-20)

Workflow A built, QA'd, fixed and verified the mature packages: GORE, SURV, CMB, ARC, ROM+MUS and BOW. There were 3 independent verify rounds per area.

| Area | Result | Open |
|---|---|---|
| gore-cmb | PASS (all 11 known items + M2/M4 acceptance) | 4 minor |
| mat-surv | PASS (rescue, HC reload, 21+ gate, grief cam, water-down) | 5 minor |
| arc-rom-mus | **FAIL** (2 items) | 2 fails, 1 new major, 3 minor |
| bow-limits | **FAIL** (1 blocker, user decision SENA-LOOK) | 1 blocker, 1 major, 4 minor |

The evidence paths below are relative to `../hb-scratch/`.

## Must fix first

### Blocker: Sena's skirt shows the base-mesh brief while she jogs (bow-limits, SENA-LOOK)
- When she jogs toward a hip-height camera (0.85 m high, 1.3 m away), the black base-mesh brief shows between her thighs under the flared skirt front.
- False colour confirms that it is the body mesh. It shows in 12 of 60 jog frames.
- The skirt front also flares like a stiff card with a V notch, even at eye level.
- Standing, walking and seated poses are clean.
- Evidence: `shots/a3fvb/fj_1.jpg`, `fj_8.jpg`, `fj_9.jpg`, `c_fe_2.jpg`, `c_fe_6.jpg`.
- Likely fixes:
  - Paint or shrink the body's brief region dark-skin or skirt-coloured under the skirt.
  - Add an inner skirt layer that follows the thighs.
  - Never revert her to the dress.

### arc-rom-mus fails
- **Romance-night morning:** Sena sinks through the bed as she gets up.
  - At a lie weight of 0.40, her pelvis is at y 4.66, while the bed is at 4.96 and the floor at about 4.53.
  - Her legs stick out from under the bed in the letterboxed wake shot.
  - Before that she lies on top of the blanket, and Aro faces the wall.
  - Evidence: `shots/a3r3vs/nn_after.png`, `n3_w1.png`.
- **Jealousy scene:** Tamu sits in mid-air, in a seated squat with no log under him.
  - Sena's seated skirt front stands up as stiff cards.
  - Evidence: `shots/a3r3vs/jj_story.png`, `jj_l2.png`.

## Major
- **Romance-night kiss camera:**
  - Survivor: a near-black frame, blocked by a body at point-blank range (`shots/a3r3vs/nb_kiss.png`).
  - Story: Sena's arm is raised straight up over Aro's head, and both faces are dark (`nn_kiss2.png`, `nn_kiss3.png`).
- **Cave fire sit:** seated at a fire placed in a cave, Sena's shins pass through the seat log (`shots/a3fvb/sit_1.jpg`, `sit_5.jpg`, `sit_9.jpg`).

## Minor, by area

### gore-cmb
- The screen blood runs are straight, uniform bars with blunt ends. Two of them read as a pause icon (`shots/a3r3gc/scr_day_crop.png`).
- In the raid look-up shot, a torchbearer stands behind Aro's head, so the flame seems to grow out of it (`shots/a3r3gc/look_a.png`).
- The aurochs brace test (m4_8) is flaky: it failed in 1 of 5 runs, with 0 damage as the charge passed through.
- Test note, not a game bug: `G.bow.shoot()` re-enters aim after the test has aimed. Aim first, then loose.

### arc-rom-mus
- At the raid dawn, Aro's head and arm hide Sena's face, and her legs are splayed toward the lens (`shots/a3r3vs/rv_dawn1.png`).
- In Tamu's death shot, a stray arm enters the right edge of the frame (`shots/a3r3vs/rv_tamu1.png`).
- After the handfast kiss, the couple stand 1 m apart in the held wide shot (`shots/a3r3vs/h3_*`).
- The raid opening shot still has Aro's back at the lower left.

### mat-surv
- play.json is flaky at "smoke -> outcast (Mature)": 1 of 2 runs failed (`tests/a3v3ms/play.log`). It passed 45/45 in the wrap-up run.
- If Aro goes down in the water within about 4 s of a chapter start, the chapter card overlaps DOWN and the camera is under water (`shots/a3v3ms/wfull_2.png`).
- In the top-down DOWN camera on the river bank, reed stalks cross Aro's face (`wfull_3.png`).
- At the Ford of Reeds, Aro's feet lie over a stone while he is down (`ffull_3.png`).
- In the grief beat, the fallen Sena's skirt stands off her legs like a stiff bell (`r2/grief_N15_7.png`).

### bow-limits
- With the bow slung, the stave and the back spear overlap by about 1 cm at a sneak. It is hidden in the bundle (`shots/a3fvb/g_4.jpg`).
- A bear spawned 10 m from the child came within 3.9 m of her. The spawn was contrived, and the bear was not targeting her. Spawns at 12-15 m stay at least 13 m away.
- While riding, `BOW.on` stays true: the bow is slung and comes back to the hand on dismount, while the spec says it should be put away.
- Tests: use the radius-aware clearance check in `tests/a3fvb/js/surf2.js` (CLR2). The old one misses tube-on-tube overlaps.

## Still open from workflow B
See `b-open-items.md`.
