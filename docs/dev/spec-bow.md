# BOW: bow and arrows (spec)

Agreed with the user on 2026-11-16:
- **Story:** a side quest after the cave.
- **Arrows:** crafted and recovered.
- **Order:** built before workflow A.
- **How:** a small agent team, with independent judges and a fix-until-pass loop.

Work happens on branch `bow` in the worktree `/home/ashish/Desktop/hearthborn-bow`. The user's game runs from `/home/ashish/Desktop/game` on port 5173: **never touch that folder or that port.**

Tag every edit with **BOW** (`// BOW ...`). Put new code in new modules where you can (`src/bow.js` for logic and models, `src/bow_fpp.js` for the first-person view model, `src/bow_story.js` for the quest), and keep the hooks in `main.js` small.

## 1. Feel and quality bar
A demanding player should feel a real prehistoric self bow, in the same spirit as the Assassin's Creed–style spear and axe the game already has.
- Draw weight shows in the body.
- The string bends to the hand.
- The arrow flies and drops on a believable arc, then sticks in what it hits.
- The release has a twang, the hit has a thunk, and both carry hitstop and shake that match the existing weapons.
- There is no clipping (bow, string, quiver, spear on the back) in any pose.

## 2. Items, crafting, carry
All of these are crafted at Tab and unlock with the side quest (§5). The costs use items already in the game; tune them if needed, but keep them reachable just after the cave chapter.
- **Bow** (`S.tools.bow`): wood 2 (the stave), fibre 3 (the string), hide 1 (the grip wrap).
- **Quiver** (`S.tools.quiver`): hide 1, fibre 2. Carry capacity is **8 arrows without a quiver and 24 with one.**
- **Flint arrows** (`S.inv.arrow`): stick 1, flint 1, fibre 1 makes **3 arrows**.
  - Respect the capacity: craft only up to the cap, and show a clear message when full.
- Add it to the inventory chips, the crafting menu, and the HUD (the tool list shows "Bow" and an arrow count such as `Bow · 12 arrows`).

**Carry visuals:**
- The bow is slung across the body when sheathed. Choose the side that never clips the spear on the back or the axe at the hip.
- The quiver sits on the back or the hip, with visible fletchings whose count roughly follows the arrow count (0 means an empty quiver).
- Sena does not get a bow.

## 3. Controls (match the existing weapon scheme)
- **Key 5** selects or draws the bow; it toggles back like the other keys. Add `Digit5` to `GAME_KEYS` and `wpnKey`. Tap/hold Q swaps and draws or sheathes as now.
- **Hold right mouse:** nock and draw. The draw takes about 0.6 s, and charge builds to full draw.
- **Left click while drawn:** loose.
  - Power and accuracy grow with charge; a quick shot is weak and wobbly.
  - Holding full draw for more than about 4 s drains stamina and makes the aim shake.
- Right mouse released without shooting lets the string down (no arrow is spent).
- **While drawn:**
  - movement slows to a strafe (as with spear aim);
  - Aro faces the camera direction;
  - the camera tightens over the shoulder (reuse the spear-aim camera);
  - a crosshair shows;
  - the arc preview follows the existing `settings.arc` option, in both third and first person.
- No arrows: a short "No arrows" message and a dry-pull sound; no shot.
- Riding: the bow is put away on mount, the same as the current rule for other weapons while riding unless it is already supported. Shooting from the saddle is out of scope.
- Swimming, sitting, resting, downed or busy: the bow is put away, as with the other weapons.
- Update the F1 help list.

## 4. Flight, hits, recovery
- **Projectile physics:** reuse `aimSolve` so the arc never lies.
  - Speed at full draw is about 45 m/s, against about 18 for the thrown spear; gravity is the same.
  - The arrow is oriented along its velocity.
- **Damage:**
  - Full draw: about 14 (flint point). Partial draw scales down.
  - A hit to the head or neck of an animal does double damage, where the existing hit code can tell.
  - Targets for full-draw body hits: a **deer** dies in 1–2, a **wolf** in 2, a **bear** needs many.
  - Use the existing hit pipeline (`wpnHitFx`, the `animalHit` listener, GORE blood, CMB enemies and raiders where they exist), so wounds, blood and flinches match the spear.
- **Never hit friendlies:** Sena, Lio, any child, villagers and your horse. The arrow passes through or deflects, and no damage is dealt. This is a content limit as well as a design choice; children are never harmed.
- **Sticking:**
  - Arrows stick in animals (visible, moving with the body), in the ground, in trees and in structures, at the correct depth and angle.
  - An arrow that hits stone or a rock has a **30% chance to break**; otherwise it bounces and drops.
  - In water it is lost (a small splash).
- **Recovery:**
  - Walk near stuck arrows and press E: "Pick up arrows (n)" collects all within about 2.5 m.
  - Arrows in a carcass come back when you butcher or loot it.
  - At most 40 loose arrows are kept in the world; the oldest despawn.
  - Loose arrows are saved and restored on load.
- Pickup respects capacity: overflow stays on the ground with a "Quiver full" message.
- Hitstop and screen shake on hit go through the existing helpers, with the shake setting respected.
- **Sound** (existing synth `A.*`): the string creak while drawing, a twang on release, a whoosh past the ear, a thunk in wood, a thud in flesh, a clack on stone.

## 5. Story: side quest "The Hunter's Bow"
- **Unlock:** after the cave chapter (`id: 'cave'`) is completed. Saves already past it get the quest on load, with **no crash on any old save** (see `tools/test/steps/old.json` and `docs/dev/user-save.json` if present).
- **Offer:** Sena brings it up in her own voice, a short line or two about the flint they chipped and hunting from further away. Write it in the game's existing subtitle style (`say('Sena', ...)`).
- **Display:** the quest shows as an optional block under the chapter goals in the quest panel, titled "Side: The Hunter's Bow", with ticks as goals complete. It must not block or alter chapter progress, and it stays visible in the epilogue's free play until done.
- **Goals:**
  1. Craft a bow.
  2. Craft a quiver.
  3. Make 6 flint arrows.
  4. Hit a target from at least 15 m. Any animal counts, or the practice target (optional nicety: a straw target near home that Sena sets up).
  5. Bring down a deer with an arrow.
  6. Recover your arrows (pick up 3).
- **Done:** Sena reacts, closeness goes up a little (`addClose`), and there's a toast. The state lives in `S.bowQ` (or similar) and is saved.
- Add `window.G` test hooks: `G.bow = { give(), state(), shoot(chargeFrac, yaw, pitch), arrows() }` or similar, enough for scripted tests.

## 6. First person
- A view model: the left hand holds the bow out at the grip, and the right hand draws the string to the cheek, using the existing FP arms and hands.
- **The crosshair must stay clear.** This is a known complaint about the spear covering the crosshair, so don't repeat it.
- The bow is canted a little, and the wrists look natural (no broken wrists; that complaint is open for the spear too).
- Draw, hold and release animate the string and the arrow. The view model hides correctly when sheathed, swimming or riding.
- Comfort settings (head bob and so on) apply as they do for the other weapons.

## 7. Saves and regressions
- New save keys default safely: `S.tools.bow`, `S.tools.quiver`, `S.inv.arrow`, `S.bowQ`, and the loose arrows. Old saves load with zero exceptions.
- `npm run build` passes.
- `tools/test/steps/play.json` still passes in full.
- Add `tools/test/steps/bow.json`. It runs the quest end to end via `G` hooks and real input: craft, draw, shoot, hit a deer, recover, then save and reload with the arrows still there.
- No new npm dependencies. Frame rate shouldn't drop noticeably: pool the arrow meshes and share the geometry.

## 8. Testing rules (hard)
- Use only your assigned vite port (5221+) and Chrome debugging port (9421+), never 5173.
- Run vite from the worktree: `cd /home/ashish/Desktop/hearthborn-bow && npx vite --port <vp> --strictPort`.
- Drive the game with `tools/test/run.mjs`, which intercepts every `/api/` request.
- Machine: a ThinkPad with 8 threads, 22 GB of RAM and Intel UHD 620 graphics. Headless Chrome uses SwiftShader by default (slow). Run **one Chrome at a time per agent**, and kill your vite and Chrome by PID when done.
- Read every screenshot you take at full size before claiming anything about visuals.
