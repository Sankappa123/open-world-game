# Workflow B: open items after final verification (2026-11-16 ~02:30)

Independent verifiers checked every user report and retest issue with fresh screenshots, across 3 fix and re-verify rounds.

## riding: 27/32 pass
- FAIL: USER REPORT riding pose 6: short mount and dismount motion; 'Dismount Dawn' is the first prompt. The motion exists, but the far leg passes through the horse in both directions, and mid-dismount both riders float seated in mid-air beside the horse with no contact. The prompt part passes.
- FAIL: USER REPORT Sena two-up: short mount and dismount motion. On dismount her far leg passes through the horse's back and rump. Mid-slide she hovers seated beside the horse.
- FAIL: REVIEW NOTE: axe near Sena's leg must not clip in motion. Aro's hip axe hangs in the gap between his thigh and Sena's knee, in the same plane as her shin (x=0.29 for both). Clearance is only about 4-6 cm, and from behind-left it overlaps her shin at a gallop.
- FAIL: r2 #0: horse and rider inside a young pine; first-person view all green. She no longer stops inside the trunk, but she still stops with the seat 2.47 m from a young pine's trunk. The horse's head is buried in the low boughs, and the first-person view is still about 60 percent branches.
- FAIL: r2 #2: dismount: legs leave the straddle at once and Aro passes through the flank. Aro no longer passes through the near flank, but his far leg now goes through the horse's back and barrel during the swing. Both riders then hover seated in the air beside her.
- NEW (major): Mount: Aro's far leg swings through the horse's barrel and belly instead of over her back. His right shin shows under the belly mid-mount.
- NEW (major): Dismount: both riders hover in a seated pose in mid-air beside the horse, with no hand or leg contact, before dropping. It reads as levitating off sideways.
- NEW (minor): There is no real trot or sustained walk. Holding W goes straight to 5.5 m/s, the 'trot' band (3.5-7 m/s) plays the Gallop clip at 0.55 speed, and Walk only shows in the first 0.4 s of acceleration.
- NEW (minor): Drawing a weapon on horseback (hold Q) pulls the spear out and puts it straight back (drawing 0.42 s, then sheathing). The HUD hint 'hold Q draw / sheathe' does nothing useful while riding; only aiming keeps it drawn.
- NEW (minor): The horse body stays level on slopes, so on a hillside her front hooves sink into the ground and the hind legs float.
- NEW (minor): Third-person reins are 9 mm cylinders and are sub-pixel at normal camera distance, so the rider often looks like he grips nothing.
- NEW (minor): The hip axe dangles between Aro's thigh and Sena's knee in two-up and crowds her shin.

## sitting-home: 27/30 pass
- FAIL: Hearth sit: no clipping. Sena's hearth seat is against the bed. Her buttock and hip go into the bed's side board.
- FAIL: Sleeping blanket shape: no lumpy mound or box-like sides (house, hut, cave). The house bed is acceptable. On the floor beds (hut and cave) the cover still looks like a stiff cushion. It rises up to 0.33 m in steep, rounded walls and then drops to a flat apron. In the hut, Sena's side-lying hip makes one big round lump with a black shadow pit in the middle of the cover.
- FAIL: Birth cradle shot (empty corner, no baby, sees through wall). The first wake frame is now inside the walls and shows the cradle with Lio, the hearth and the bed. About 2 s later the camera is on Sena's back by the hearth while she says 'Look at her hands, Aro.' The baby is out of frame for the birth lines. The next line plays behind Aro, who is facing the door.
- NEW (blocker): CONTENT LIMIT: the child Lio is Sena's adult female body uniformly scaled down. spawnKid calls makeHuman({ female: true, ... scale: kidScale(k) }). At age 7 in the epilogue she has adult proportions and an adult face, and wears Sena's bra-style top and thong-style bottom. Up close she looks like an adult woman in lingerie. The newborn in the cradle is the same adult body at scale 0.3. A grown Lio with no nursery also sleeps between her parents under the blanket. This needs a child body and child clothing.
- NEW (major): The tame donkey's head comes through the home's brick wall into the room.
- NEW (minor): The epilogue 'family shot' is crowded by livestock. An ox's head fills the middle of the frame next to Sena, and Aro and Lio are not in the shot while 'The valley is ours, Aro. Keep building.' plays.
- NEW (minor): Fire and hearth sits end by themselves about 8-10 s after sitting, and both stand up with no input. This is the same complaint that was fixed for the hot spring, which now lasts until a key press, so the sits behave inconsistently.
- NEW (minor): Villagers brush the nursery annex corners. Their centres pass 0.07-0.2 m from the nursery wall plane, so their shoulders graze the corner bricks. The steering circle (radius + 2.3 + 0.2 = 6.9 m) only just clears the annex corner, which is 6.84 m out.
- NEW (minor): After standing up from a fire sit, the follow camera stays where the two-shot was, across the fire and facing Aro. Control returns with the camera in front of him, so W walks him toward the camera.
- NEW (minor): At the start of the rest walk-in from the hearth, Sena's right arm sticks out stiffly behind her for a moment.
- NEW (minor): After a hut wake, Sena is not in frame at the hand-back. Aro comes out alone while she delivers the morning line off-screen.

## fpp-hud-world: 11/16 pass
- FAIL: No HUD overlaps with the first-person weapon (1280x720 and 1920x1080). The spear's left hand and shaft sit exactly on the crosshair (640,360 / 960,540) at every pitch, so the weapon blocks the aim point and the centre of view. At 720p the subtitle line is drawn over the forearm and shaft. While the pack is showing (3-4 s after a change) it draws over the forearm, and an open F1 list covers the right fist.
- FAIL: First-person spear two-handed with a visible spearhead. Both hands show and the head is clearly visible. But the upper hand is not attached to its forearm: the forearm ends in a flat cut cap, and the hand rises out from behind it like a broken wrist. The spear is also held port-arms (diagonal, pointing up-left across the screen), not forward, and covers the crosshair.
- FAIL: First-person forearm still plain skin. The wraps are visible on the axe and the rein hands. In the spear hold the big forearm across the bottom of the screen is plain skin, and its wrap is only a sliver at the broken wrist seam.
- FAIL: Caves readable past the torch, with no specks. Readability is fine: walls, handprints, the tube and Sena are all legible past the torch, and at noon without a torch. But in third person with Aro's torch lit, a dotted line of bright specks outlines every back-lit edge (the spear shaft, Aro's hair, his shoulder). It shows in two separate runs. There are also large flat pale slabs floating overhead inside the dome.
- FAIL: First-person riding: fists at eye height, forearms fill the view, no horse neck (owned by the riding fixer). The three original faults are fixed: the fists are low with reins, the neck and ears show, and the arms no longer fill the view. But looking down (pitch 0.9) shows an obvious screen-door dither dot pattern across the withers. The mane is a flat black faceted plank, and the left rein vanishes at gallop.
- NEW (major): In first person the spear viewmodel's hand and shaft cover the crosshair at every pitch, so you cannot see what you aim at.
- NEW (major): The first-person spear's upper wrist is broken: the forearm ends in a visible flat cap and the hand is detached from it.
- NEW (major): Bright speck outlines on back-lit silhouettes (spear, hair, shoulders) in torchlight in third person.
- NEW (major): Large flat pale slabs float in mid-air inside the Echo Hollow dome (looks like seal or lintel geometry).
- NEW (minor): Screen-door dither dots across the horse's withers when looking down while riding in first person; the mane reads as a black plank.
- NEW (minor): Two dark rhombus patches float on Sena's upper chest and shoulders (look like cut-off strap ends).
- NEW (minor): Aro's head twists sharply back and sideways in third person when the camera faces him from behind (looks like a broken neck).
- NEW (minor): The third-person camera can sit inside pine boughs, filling half the screen with a dark slab of foliage.
- NEW (minor): The cave bed renders as a flat glowing red blob in the dark.
- NEW (minor): The aim arc starts under the stats panel and the pack, and hooks upward oddly at its end near the crosshair.

## save-perf-regression: 11/11 pass
- NEW (minor): If the save server stays slower than 15 s on every request, the title never recovers. titleRetry uses a 15 s timeout, so each retry aborts before the answer arrives. After 6 tries it says 'not answering'. Nothing is lost, but Continue never appears until a reload.
- NEW (minor): tools/test/steps/epi.json is stale. Its untrusted click starts a game behind the 21+ notice, which stays on screen, and 'Lio born' never happens because the script skips the cradle and nursery upgrades. The run ends with G.kids[0] undefined. play.json covers the same flow and passes, so this looks like a test problem, not a game regression.
- NEW (minor): In the 800x600 window (headless fullscreen), the 3-row pack bar covers the Health, Stamina and Hunger bars.
- NEW (minor): Shader programs grow slowly during play (77 to 83 over the 5-minute soak, with wolves, night and torch), although the warm-up should cover these. There are no hitches in the fps log, but a few compiles still happen in play.
- NEW (minor): The build I tested is HEAD a187155 plus uncommitted changes to src/main.js (+299/-47 lines: RIDE-r4, SIT-r4 and a SAVE-PERF wolf-corpse cap) and src/caves.js. Another fixer was editing these files during this run, so results apply to that snapshot.

## Child model (content-limit fix, commit 67221c7)
The child-safety and coverage judges PASS: no adult or revealing traits; modest tunic; swaddled newborn; own bed. Art polish is still open (the art judge failed it):
- the procedurally sealed mouth on all child faces looks lumpy and pouty, with a scar-like crease at one corner;
- the boys' hair texture reads like a receding adult hairline;
- while riding, the skirt stretches back along the horse and opens above the knee; add short leggings under the tunic;
- the skirt clips through the horse's belly from a low angle;
- a tame cow or donkey clips into the house at night.
