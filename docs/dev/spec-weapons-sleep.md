# Hearthborn implementation spec: weapon handling (WPN) and rest sequence (RST)

This spec is handed verbatim to two implementers. It is based on the code at HEAD plus the uncommitted expansion. It cites the research summary and the current-state audit (screenshots in `scratchpad/shots/audit/NN_*.png`). Line numbers refer to `src/main.js` as of this writing and will drift, so search for the quoted code.

**Before you start.** Another engineer is finishing the final integrated test. Do not touch the tree until that work is committed. Then branch `wpn` and `rst` off it.

**Constraints from the codebase:**
- No new animation clips exist. `public/models/anims.glb` is UAL1_Standard, the same 43 clips, and the source pack has nothing more. Everything here is built from existing clips, poses sampled from them, and bone overrides applied after `mixer.update`, the same trick as the existing `straddle`.
- Family-friendly only: dust or leaf puffs instead of blood, and a blanket over the sleepers.
- Test server on **5174** (not 5173). Intercept every `/api/` request so the real save is never touched, as in tests/wp4 and tests/audit.

---

## 0. P0: a shared base commit (land first, about 60 lines)

The WPN engineer makes this tiny commit on `main` before either package branches. The RST engineer can code against this API straight away.

### 0.1 `src/people.js`

1. **Register extra clips without actions.** Add the table below and convert it in `loadPeople` alongside LOOPS and SHOTS: the loop becomes `for (const [key, name] of Object.entries({ ...LOOPS, ...SHOTS, ...EXTRA }))`. `makeHuman` must **not** create actions for EXTRA. They are only for sampling.
   ```js
   const EXTRA = { death: 'Death01', ready: 'Sword_Idle', aimN: 'Pistol_Aim_Neutral', aimUp: 'Pistol_Aim_Up', spellIn: 'Spell_Simple_Enter', spellShot: 'Spell_Simple_Shoot', torchHold: 'Idle_Torch_Loop', sitHold: 'Sitting_Idle_Loop' };
   ```
2. **Pose sampling** (exported):
   ```js
   // A static pose from a clip: { q: {bone: Quaternion}, pelvis: Vector3|null }. t is clamped to the clip.
   export function samplePose(who, key, t = 0, filter = null) {
     const clip = lib.clips[who][key], out = { q: {}, pelvis: null };
     for (const tr of clip.tracks) {
       const [bone, prop] = tr.name.split('.');
       if (filter && !filter(bone)) continue;
       const v = tr.createInterpolant().evaluate(Math.min(Math.max(0, t), clip.duration));
       if (prop === 'quaternion') out.q[bone] = new THREE.Quaternion().fromArray(v);
       else if (prop === 'position') out.pelvis = new THREE.Vector3().fromArray(v);
     }
     return out;
   }
   export function applyPose(h, pose, w, filter = null) {
     if (w <= 0) return;
     for (const b in pose.q) if (h.bones[b] && (!filter || filter(b))) h.bones[b].quaternion.slerp(pose.q[b], w);
     if (pose.pelvis && (!filter || filter('pelvis'))) h.bones.pelvis.position.lerp(pose.pelvis, w);
   }
   export const BONESETS = {
     armR: (b) => /^(clavicle|upperarm|lowerarm|hand)_r$/.test(b), armL: (b) => /^(clavicle|upperarm|lowerarm|hand)_l$/.test(b),
     fingersR: (b) => /_(0[1-3])_r$/.test(b) && !/^(clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball)/.test(b),
     fingersL: (b) => /_(0[1-3])_l$/.test(b) && !/^(clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball)/.test(b),
     upper: (b) => !/^(root|pelvis|thigh|calf|foot|ball)/.test(b),
   };
   ```
   Print `Object.keys(h.bones)` once and fix the regexes to match the real finger names (`index_01_r` … `thumb_03_r`).
3. **Override pipeline.** In `makeHuman`, `h.overrides = []`. Add these helpers:
   ```js
   h.addOverride = (id, order, fn) => { h.removeOverride(id); h.overrides.push({ id, order, fn }); h.overrides.sort((a, b) => a.order - b.order); };
   h.removeOverride = (id) => { const i = h.overrides.findIndex((o) => o.id === id); if (i >= 0) h.overrides.splice(i, 1); };
   ```
   At the end of `h.animate`, after the straddle line:
   ```js
   if (h.overrides.length) { root.updateMatrixWorld(true); for (const o of h.overrides) o.fn(h, dt); }
   ```
   **Order convention:**
   - 10: whole-body poses (lie, sit-hold)
   - 15: upper-body stance (ready, aim, sprint carry)
   - 20: fingers
   - 30: IK (left hand on shaft, holding hands, aim arms)
   - 40: additive (breathing, flinch, stretch, draw reach)

   **Additive rule.** Additive overrides may only touch bones the clips animate, because the mixer rewrites those bones every frame. Every body bone is animated.
4. **Two-bone IK** (exported):
   ```js
   const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
   const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
   function aim(bone, from, to, w) {                 // rotate bone in world space so `from` turns to `to`
     _q.setFromUnitVectors(from.normalize(), to.normalize());
     bone.getWorldQuaternion(_qw); bone.parent.getWorldQuaternion(_qp);
     bone.quaternion.slerp(_qp.invert().multiply(_q.multiply(_qw)), w);
     bone.updateWorldMatrix(false, true);
   }
   export function ik2(h, side, target, pole, w = 1) {
     if (w <= 0) return;
     const A = h.bones['upperarm_' + side], B = h.bones['lowerarm_' + side], C = h.bones['hand_' + side];
     A.updateWorldMatrix(true, true);
     A.getWorldPosition(_a); B.getWorldPosition(_b); C.getWorldPosition(_c);
     const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
     _n.copy(target).sub(_a); const d = THREE.MathUtils.clamp(_n.length(), 0.05, (la + lb) * 0.999); _n.normalize();
     const x = (la * la - lb * lb + d * d) / (2 * d), y = Math.sqrt(Math.max(0, la * la - x * x));
     _p.copy(pole).sub(_a); _p.addScaledVector(_n, -_p.dot(_n)).normalize();
     _e.copy(_a).addScaledVector(_n, x).addScaledVector(_p, y);
     aim(A, _f.copy(_b).sub(_a), _g.copy(_e).sub(_a), w);
     B.getWorldPosition(_b); C.getWorldPosition(_c);
     aim(B, _f.copy(_c).sub(_b), _g.copy(_a).addScaledVector(_n, d).sub(_b), w);
   }
   ```
   Export `ik2`, `samplePose`, `applyPose` and `BONESETS`, and import them in main.js.

### 0.2 `src/main.js`
- In the animals section, after `remove()`:
  ```js
  // Live wolves that are not leaving, within r of p (rest rules, auto-draw, auto-sheathe)
  function hostileNear(r, p = P.pos) { return animals.some((o) => o.kind === 'wolf' && o.state === 'live' && !o.leave && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < r); }
  ```
- `GAME_KEYS`: add `|Digit[1-4]` so digits don't scroll or type.

**Acceptance for P0:** `npm run build` passes, the game plays unchanged, and errors=0 in a quick run of tests/final/play.json.

---

## 1. File and section ownership (so the two packages never conflict)

| Place | WPN owns | RST owns |
|---|---|---|
| `src/people.js` | Everything beyond P0: sockets, FIT table, upper-body shot variants, finger overlay | **Nothing.** It uses only the P0 API |
| `src/entities.js` | `makeSpear(opts)` / `makeAxe(opts)` options, new `makeCarryBasket()` placed directly after `makeTorch` | New `makeBlanket()` at the **end of the file**. New `pillowPts`/`restCam` fields in the hut (≈l.256) and house (≈l.327) return objects |
| `main.js` new section | `// ---------- WPN weapons ----------`, inserted directly **after the `// ---------- melee ----------` block** (after `landHit`) | `// ---------- RST rest ----------`, **replacing** the WP2 rest block (`let camShot…` through `endRest`, ≈l.1483-1520). Keep `camShot` declared there |
| `main.js` functions | `throwSpear`, `updateSpear`, `attack`, `landHit`, the chop-tree `act` in `findTarget`, `mount` (1 line), `sitTogether` (1 line), `updateTorch`/`setTorch`, `bindSettings` (lines), `drawInv` (1 line), the **third-person and fpp parts of `updateCamera`** (after the camShot block), the `render` line in `frame`, `remove()` (1 line), `hurt()` (1 line), `updateAnimal` (the `o.a.update(dt)` line), the last lines of `updatePlayer` (the `P.cool…` line through `settle(P…)`) and its movement-speed lines | `settle()` (one new line before the rest line), the `P.rest` branch of `updatePlayer`, the `N.rest` line of `updateSena`, the **`camShot` block of `updateCamera`**, `updateStats` (2 lines), `updateHome` (the `S.rested` line), `maybeBirth` (1 line), `die()` (1 line), the structTarget hut/house case (≈l.1354), the cave-bed `sleep({...})` call (unchanged signature) |
| keydown | Digit/Q handling, added **at the end** next to the `KeyQ && placing` line, plus the aim-cancel Esc check at the **top of the Escape branch** | One line **right after** `if (paused \|\| (e.repeat …)) return;`: `if (rstKey(e)) return;` |
| mouse | `mousedown`/new `mouseup` for button 2, button 0 | none |
| `start()` | `wpnLoad();` on its own line **after** `drawInv(); applyQuality();` | `rstLoad();` on its own line **after** `wp5Load(true);` |
| `G` hooks | New `Object.assign(window.G, { wpn: … })` block **right after the `// WP3 debug and test hooks` block** | New block `Object.assign(window.G, { rest… })` **right after the `// WP6 family hooks` line** |
| `index.html` | `#wpn` chip markup after `#inv`. CSS appended just before `</style>`. The help lines `Click punch …` and `T torch …`. Settings rows `opt-autodraw`, `opt-shake`, `opt-arc` after the Volume row | `#vignette`, `#restmenu`, `#buff` markup after `#fade`. CSS inserted right after the `#fade.on` rule. The help line `hold E at a site … rest …`. Class `cine` on `#hud` |
| Cross-package hooks (soft, `typeof f === 'function' && f()` like the existing `maybeBirth` pattern) | Provides `wpnRest(s, layPts)`, `wpnWake()`, `wpnStowAll(reason, instant)` | Calls those 3. Provides `structCam(look, camPos)` and calls it via **one line** after `caveCam(camPos);`, **the only RST line inside WPN's camera area** |

Use the tags `// WPN` and `// RST` on every one-line hook outside your own section. Do not reformat lines you don't own.

---

## 2. WP-W: "Assassin's Creed-style" weapon handling (WPN)

### 2.1 Goals (from the user's request and the audit)
Weapons are **always visible on the body** when you aren't using them:
- spear diagonal on the back
- axe on the left hip
- unlit torch on the right hip

You **draw** them into the hand with a short motion and they **sheathe themselves** after combat or when you sit, ride, swim, build or sleep.

**Bugs this package fixes:**
- The spear is glued to an open-fingered wrist and stabs the ground or head (audit 01-05, 09-12).
- Axe swap-pop (13-16).
- Throw has no wind-up and the spear spawns through the head (19-22).
- Duplicate spear after a throw.
- Nothing is visible in first person (24-28).
- The torch flame sits behind the shoulder (06-07).

### 2.2 State and save
```js
// WPN state (main.js section)
const W = {
  sel: 'fists', last: 'fists',             // 'fists' | 'axe' | 'spear'
  st: 'sheathed',                          // 'sheathed' | 'drawing' | 'drawn' | 'sheathing'
  t: 0, idleT: 0, sprintT: 0, homeT: 0,    // timers (s)
  queued: null,                            // 'attack' | 'aim' | 'chop' — runs when a draw finishes
  aim: null,                               // { t, charge, cam } while RMB held
  spearOut: false,                         // thrown and not yet recovered
  spearLeftT: 0,                           // seconds the spear has been lying out
};
let hitStop = 0, hsWho = null, trauma = 0;  // hit feedback (real-time seconds)
```
**Save fields:**
- `S.equip` (= W.sel)
- `S.lastEquip`
- `S.spearAt` = `{ x, y, z, qx, qy, qz, qw }` or `null`

Write them in WPN code called from `save()` by a one-line `wpnSave();` hook placed after `horseSave();`.

`wpnLoad()` (called from `start()`) does the following:
- default `S.equip ??= 'fists'`
- validate ownership (fall back to fists)
- `W.st = 'sheathed'`
- if `S.spearAt`, spawn the stuck spear there and set `W.spearOut = true`
- put every mesh in its socket

Drawn state is **not** saved; you always load sheathed.

**Ownership:**
- `hasAxe = S.tools.axe || S.tools.flintaxe`
- `hasSpear = S.tools.spear || S.tools.flintspear`
- Verify the flint tool ids in `craft()`; the recipe ids are `flintaxe` and `flintspear`.

**Settings** (in `settings`, read with defaults so save.js isn't touched):
- `settings.autoDraw ?? true`
- `settings.shake ?? true`
- `settings.arc ?? 'on'` (one of `'on'|'fade'|'off'`)

### 2.3 Meshes and sockets (`people.js` + `entities.js`)
- **entities.js:**
  - `makeSpear({ flint } = {})`: a flint tip is darker (0x3b3e45), cone 0.04×0.24.
  - `makeAxe({ flint } = {})`: the same treatment for the axe.
  - `makeCarryBasket()`: an open woven cylinder r 0.16, h 0.32, reed material, with 2 straps (thin boxes).
- **people.js makeHuman.** Replace the "Tools ride on the right hand" block with sockets:
  ```js
  const sock = {
    hand: new THREE.Group(),   // on hand_r (this replaces `grip`; keep h.grip = sock.hand as an alias)
    handL: new THREE.Group(),  // on hand_l
    back: new THREE.Group(),   // on spine_03
    hipL: new THREE.Group(),   // on pelvis (axe, head down, left side, haft forward-down for a cross draw)
    hipR: new THREE.Group(),   // on pelvis (unlit torch, right side, behind the hip)
  };
  bones.hand_r.add(sock.hand); bones.hand_l.add(sock.handL); bones.spine_03.add(sock.back); bones.pelvis.add(sock.hipL, sock.hipR);
  ```
  - Each human gets its own `spear` and `axe` instances (already the case).
  - `h.sock = sock`.
  - `h.place(mesh, slot, blend = 0)` reparents: `sock[slot].attach(mesh)` keeps the world transform. Then, if `blend > 0`, it eases `position`, `quaternion` and `scale` toward `FIT[mesh.userData.kind][slot]` over `blend` seconds (tracked in `h.blends`, advanced inside `h.animate` before the overrides). If `blend` is 0 it snaps.
  - Set `spear.userData.kind = 'spear'` and `axe.userData.kind = 'axe'`.
- **`export const FIT`:** a mutable tuning table in people.js. These are **starting values only**. Bone local axes are not documented, so step 1 is `G.wpn.axes(true)`, a screenshot, then fix the values.
  ```js
  export const FIT = {
    spear:  { back: { p: [0.02, 0.06, -0.15], r: [0.25, 0, 0.58], s: 0.92 },   // diagonal: tip over the RIGHT shoulder, butt at the LEFT hip, ~32° off vertical, 0.12-0.15 m behind the spine so hair and cloak don't clip
              hand: { p: [0, 0.01, 0.35], r: [0, 0, 0], s: 1 },              // hand 0.35 m behind the balance point (mesh shifted +z toward the tip)
              low:  { p: [0, 0.01, 0.15], r: [-0.55, 0, 0], s: 1 } },        // sprint and one-handed carry: tip pitched down/forward
    axe:    { hipL: { p: [-0.17, -0.06, 0.05], r: [2.9, 0, 0.2], s: 0.95 },  // head down, haft up/forward by the left hip
              hand: { p: [0, 0.01, -0.12], r: [0, 0, 0], s: 1 } },           // hold near the haft end; head ~0.45 m from the fist
    torch:  { hipR: { p: [0.16, -0.05, -0.06], r: [2.8, 0, -0.15], s: 1 },
              handL: { p: [0.02, 0.05, 0.03], r: [-0.35, 0, 0], s: 1 } },    // flame UP and FORWARD of the fist (the current rot.x 1.25 points it back over the shoulder)
    basket: { back: { p: [0, 0.02, -0.2], r: [0, 0, 0], s: 1 } },
  };
  ```
- **Valhalla trick.** A sheathed weapon has scale ≤ 0.95. It scales up to 1 on draw (the blend handles it).
- **P's torch.** In main.js, `torch.root.userData.kind = 'torch'`. Lit → `P.h.place(torch.root, 'handL', 0.15)`. Unlit and owned → `'hipR'`. Visible whenever `S.tools.torch`. `updateTorch` must stop forcing `torch.root.visible`; visibility follows the slot rules below.
- **Sena.**
  - From `reached('shelter')` she carries `makeCarryBasket()` in `N.h.sock.back`.
  - If Aro owns the flint spear, she also carries the old stone spear on her back, using the FIT `spear.back` value with z −0.2 so it sits outside the basket.
  - Hide both while `N.rest`, `N.ride` or `N.sit`, and while kneeling at work (`N.working`).
- **Finger grip** (fixes open fingers, audit 05).
  - At makeHuman time: `h.fist = { r: samplePose(who, 'ready', 0, BONESETS.fingersR), l: samplePose(who, 'torchHold', 0, BONESETS.fingersL) }`.
  - Override `fingers` at order 20: `applyPose(h, h.fist.r, h.gripR)` and `applyPose(h, h.fist.l, h.gripL)`.
  - `h.gripR` and `h.gripL` are weights (0..1) that main.js eases toward 1 when something is in that hand, at 10/s.
- **Upper-body attack variants** (legs keep walking, fixing the frozen legs in 13-16).
  - In loadPeople, also build filtered clips `strikeU`, `jabU`, `crossU`, `useU`, `throwU` (from `Spell_Simple_Shoot`) and `pickU` (from `PickUp_Table`) that keep only the tracks where `BONESETS.upper(bone)` is true. Add them to SHOTS as LoopOnce actions.
  - In `h.animate`: when the current shot's key ends in `U`, **do not** scale the loops down (skip the `1 - shotW*0.92` factor) and set the shot weight to `shotW * 12`.
  - This works because three.js PropertyMixer accumulates normalised weighted averages: with loops at about 1 and the shot at 12, upper-body tracks are about 92% shot, and the legs (which have no shot tracks) stay 100% loop.
  - `h.swing(kind, timeScale?)` takes an optional timeScale.

### 2.4 Draw/sheathe state machine (main.js WPN)
`wpnUpdate(dt)` replaces these two lines in updatePlayer:
```js
P.cool = Math.max(0, P.cool - dt);
if (P.cool <= 0) { P.h.axe.visible = false; P.h.spear.visible = !!S.tools.spear && !P.swim; }
```
Keep `P.cool` decrementing, then call `wpnUpdate(dt)`. Also call `wpnUpdate(dt)` from `updateRide` (one `// WPN` line after its own `P.cool` line, ≈l.652) so riding gets stow and aim.

**Transitions:**
- **sheathed → drawing.** Triggers: `drawWeapon()` (hold Q, or press 1/2/3 for the current pick), the first LMB/RMB, the chop-tree action, or auto-draw.
  - Duration: `T_DRAW = { axe: 0.32, spear: 0.38, fists: 0.15 }`. When `W.queued` is set it is ×0.65 (a fast draw folded into the first swing).
  - Motion: override `draw` at order 40, envelope `e = sin(π·t/T)`:
    - **spear:** reach up and back over the right shoulder. Rotate `clavicle_r` and `upperarm_r` toward the back socket with `ik2(h, 'r', backSocketWorld + up 0.05, pole = shoulder + down + back, e)`.
    - **axe:** cross-body reach to the left hip with `ik2(h, 'r', hipLSocketWorld, pole = elbow out/right, e)`, plus `spine_02` yaw +0.25·e.
  - At **45%** of T: `P.h.place(mesh, 'hand', 0.12)`.
  - Sound: a leather and wood scrape `A.hit(650 + rand()*250, 0.14, 0.12)`, then `A.hit(2400, 0.04, 0.05)`.
  - At 100%: state `drawn`, run `W.queued`.
- **drawn → sheathing.** The same motion reversed. Reparent to the socket at 55%. Fists: just drop the stance.
- **Instant stow** (`wpnStowAll(reason, true)`): when not visible or in water. Snap to sockets with no motion.
- **Switch** (press 1/2/3 to a different weapon while drawn): sheathe the current one at 1.6× speed, then draw the new one. While a switch is running, `W.queued` holds `'switch:<k>'`.

**Auto rules,** evaluated in wpnUpdate. `idleT` resets on any attack, aim, throw or damage taken.

| Condition | Action |
|---|---|
| drawn, `idleT > 6` and `!hostileNear(20)` | sheathe (animated) |
| `P.swim` | instant stow; no re-draw after swimming |
| `P.ride` (mount) | `mount()` calls `wpnStowAll('ride')` (animated if visible). Melee stays blocked; aim/throw allowed (2.6) |
| `P.sit > 0` (sitTogether) | `wpnStowAll('sit')`. The **spear is leaned** against the bench end: `scene.attach(spear)` at the bench seat + 0.45 m along the log, upright, tilted 12°. It goes back to `back` on `endSit`, through the ≈1-line hook `wpnUnSit()` in `endSit` |
| `P.work > 0`, `menuOpen`, `placing`, `P.dance > 0`, `P.taming` | `wpnStowAll('busy')` animated |
| rest | `wpnRest(s, layPts)` (RST calls it, see 3.6) |
| sprinting (`P.speed > 5.6`) while drawn | carry low: spear uses FIT `low`, Sword_Idle stance weight 0, no left IK. If `sprintT > 2 && !hostileNear(20)` → sheathe |
| within 25 m of the house or fire and `!hostileNear(20)` while drawn | `homeT += dt`; sheathe at 2 s ("town rule") |
| a hostile wolf within 15 m, `settings.autoDraw`, sheathed, not riding/swimming/busy | draw `W.sel`; if fists, choose the axe if owned |
| cave + torch lit + axe | **allowed**: torch in hand_l, axe in hand_r. The spear in a cave with a lit torch is one-handed (FIT `low`, no left IK) |

**Torch with the axe.** The torch is in the left hand, so the left-hand-on-shaft IK is off and the axe stance is one-handed. Lighting the torch while the spear is drawn switches the spear to `low`.

### 2.5 Combat stance, grip and selection
- **Keys** (keydown, WPN lines at the end):
  - `Digit1` fists, `Digit2` axe, `Digit3` spear: `wpnSelect(k)`. If the weapon is not owned, toast "You have no axe yet" or similar. If the spear is out, toast "Your spear is lying where it landed (see the map)".
  - `Digit4` = toggleTorch (T stays).
  - **Q:** if `placing`, keep the existing cancel. Otherwise record `qDown = clock`.
    - keyup Q **< 0.3 s** = tap → swap to `W.last`
    - **≥ 0.3 s** (checked in wpnUpdate while held) → toggle draw/sheathe, fired once per hold
- **Mouse wheel** stays camera zoom (`camDist` 2.6–9/12). Do **not** bind weapon cycling: it conflicts with zoom, and users rely on it. While aiming, ignore the wheel.
- **Ready stance while drawn** (order 15):
  - `h.ready = samplePose(who, 'ready', 0)`, which is Sword_Idle.
  - Apply `BONESETS.armR` + `spine_02/03` with weight `0.85` idle, `0.5` walking, `0` sprinting/swimming.
  - **Spear, two-handed:** at order 30, `ik2(h, 'l', spear.localToWorld(0,0,+0.10 after FIT offset → about 0.45 m in front of the right hand along the shaft), pole = elbow down/left, 0.9)`. Skip it when the torch is lit, sprinting or aiming.
- **Movement while drawn:**
  - walk speed ×0.8 and run ×0.9; sprint is allowed and ends the stance
  - when `hostileNear(12)`, the body faces camera yaw (strafe) instead of the movement direction; in `updatePlayer`'s facing line add a `// WPN` condition `W.st === 'drawn' && hostileNear(12)`
- **Attack facing.** Replace the instant `P.face = atan2(cam)` in `attack()` and `throwSpear()` with `P.wantFace = …`. In wpnUpdate, while `P.cool > 0`: `P.face = turn(P.face, P.wantFace, Math.min(1, dt * 18))`. This fixes the 13 snap.
- **LMB by weapon** (`attack()` becomes `wpnPrimary()`; keep `attack` as an alias for G):
  - **sheathed:** queue `'attack'` and draw fast.
  - **fists:** `jabU`/`crossU` alternate; dmg 2, cool 0.48, hit at 0.2 s, reach 2.2.
  - **axe:** `strikeU` (timeScale 1.5); dmg 4 (flint 6), cool 0.75, hit at 0.3 s, reach 2.5.
  - **spear:** thrust, `jabU` timeScale 1.3, plus a procedural lunge (`sock.hand` child z offset +0.35·sin envelope over 0.3 s); dmg 3 (flint 5), cool 0.6, hit at 0.22 s, reach 2.8, cone dot > 0.35.
  - `landHit()` takes reach and cone from the weapon. Keep the WP4 horse exclusions.
  - **while aiming:** cancel the aim, with no attack.
  - **while riding:** blocked (unchanged).
- **Chop tree** (the findTarget `act` at ≈l.1189):
  - No `visible` toggles.
  - If the axe is not drawn: `W.sel = 'axe'`, fast draw, `W.queued = 'chop'`.
  - Face the tree with `P.wantFace`, play `strikeU`.
  - Hit feedback: hitstop 0.02, trauma +0.1.
  - Wood logic unchanged.

### 2.6 Spear aim mode (Far Cry Primal). Replaces the instant right-click throw
- **RMB down** (in mousedown):
  - If `placing`: unchanged.
  - Else if `hasSpear && !W.spearOut && !P.swim && !(P.sit>0) && !busy`:
    - spear not drawn: `W.sel = 'spear'`, fast draw, `W.queued = 'aim'`
    - otherwise `W.aim = { t: 0, charge: 0 }`
- **RMB up** (new `mouseup` listener on canvas for button 2): if `W.aim`, call `wpnRelease()`. If RMB was released during the fast draw, do a quick throw at charge 0.35 when the draw ends. That keeps the old "click to throw" feel.
- **While aiming** (`W.aim.t += dt`, `charge = min(1, t / 0.6)`):
  - **Pose** (order 30):
    - right hand `ik2(h, 'r', shoulder_r + up 0.16 + back 0.22 + right 0.10 (in P-facing frame), pole = elbow right/down, 1)`
    - spear world orientation slerped to look along the aim direction (set `spear.quaternion` from `lookAt` in world, then convert to local; the spear z axis = aim dir)
    - left arm pointing forward `ik2(h, 'l', shoulder_l + fwd 0.5 + up 0.05, pole = down, 0.8)`
    - `spine_02` yaw −0.2 (wind-up), easing in 0.15 s
  - **Body:**
    - on foot: `P.wantFace` = camera yaw, turning at 14/s; speed capped at 1.8 (strafe)
    - riding: **do not** change `P.face` (seatOn and updateRide use it as the horse heading); instead twist `spine_01..03` yaw toward camera yaw, total clamp ±1.7 rad. Throwing is allowed only within ±2.1 rad of the heading
  - **Camera** (updateCamera third-person block; on horseback multiply by the existing ride factors):
    - FOV 58 → 48
    - shoulder offset 0.45 → 0.8
    - `camDist` scaled to 2.2 / 4.8
    - all eased with `1 - exp(-dt*12)`
    - crosshair `#cross` gets class `aim` (a small circle)
  - **Power:** `v = 22 + 16 * charge` (was a fixed 34).
  - **Arc:**
    - Compute every frame with **the same integrator as `updateSpear`**: step `1/60`, `vel.y -= 6*dt`, `pos += vel*dt`, the same animal hit test (`<1.05` radius, y band 0.2–2.1, skip horses), the ground test `pos.y < getHeight + 0.05`, max 3 s.
    - Spawn point = `hand_r` world position + aimDir × 0.35 (the same point `wpnRelease` uses).
    - Direction: `target = camera.position + camDir * 40; dir = normalize(target - spawn); dir.y += 0.035; normalize`. The same expression goes in `wpnRelease`, so the arc never lies.
    - Render: one `THREE.Line` with `LineDashedMaterial` (white, opacity 0.55, `depthWrite:false`) holding up to 180 points, plus an end ring: a white ring on the ground, or a red ring when it hits an animal.
    - `settings.arc`: `'fade'` fades the arc to 0 as charge goes 0.7→1; `'off'` hides it.
- **Release** (`wpnRelease`):
  - spawn the projectile at the spawn point with the same `dir` and `v`
  - `proj.dmg = S.tools.flintspear ? 20 : 10` (the recipe text promises double)
  - attach `P.h.spear` to the projectile pose: hide the hand mesh and use `proj.m` (a separate mesh, kept)
  - play `throwU` (Spell_Simple_Shoot) at timeScale 1.4
  - FOV punch +3 for 0.12 s
  - `W.spearOut = true`
  - sound `A.hit(900, 0.18, 0.18)` (whoosh)
  - `P.cool = 0.5`
- **Cancel:** LMB, Esc (checked first in the Escape branch: `if (W.aim) { wpnCancelAim(); return; }`), switching weapon, entering water, mounting or dismounting, or taking damage of 8 or more.
- **Keep `G.throwSpear()`** as an instant charge-0.6 throw for tests.

### 2.7 Thrown spear stays out until you take it back (fixes the duplicate spear)
- **`updateSpear`:**
  - **Ground stick:** `proj.stuck = Infinity` (no 4 s vanish). Record `S.spearAt`. Spear fishing is unchanged.
  - **Animal hit:** `hurt(o, proj.dmg)`, then `o.root.attach(proj.m)` at the hit point so it sticks out of the body.
    - If the animal survives: after 1.2 s, `scene.attach(proj.m)` and drop it to the ground at its current xz (tilted 70°).
    - Before `remove(o)`: one `// WPN` line in `remove()` that, if `proj.m.parent === o.root`, re-attaches the spear to the scene on the ground.
  - **Deep water** (`gy < -0.9`): the spear floats at the surface (y = −0.05, horizontal) and can be picked up while swimming.
- **Pickup:**
  - Walking within 1.0 m picks it up automatically. A findTarget entry "Take back your spear" (E) works within 2.2 m, as a one-line `// WPN` call `wpnTarget(p)` at the top of `findTarget`, after `wp4Target`.
  - On pickup: `proj.on = false`, hide `proj.m`, `W.spearOut = false`, `S.spearAt = null`, the spear goes to `back`, play `pickU`, sound `A.hit(500, 0.1, 0.15)`.
- **Map ping:** WP5 owns the map, but `drawMini`/`drawMap` get a 1-line `// WPN` marker using the existing `marker(g, x, y, 'pin', 0.8)` when `S.spearAt`.
- **Safety net:**
  - `W.spearLeftT += dt` while out.
  - If it is over 60 s, Aro is more than 25 m from the spear, `nFree()`, and Sena is within 60 m of it: `N.fetch = {x, z}`.
  - updateSena gets one `// WPN` line **after the `senaBuild` line**: `if (N.fetch && wpnSenaFetch(dt)) { settle(N, dt, false); return; }`.
  - `wpnSenaFetch` walks her to the spear (walkTo 3.3), plays `pick`, carries it in her hand, walks to within 2 m of Aro, says "You forgot this." and gives it (back socket).
  - `wpnRest` also returns it overnight.
- **Old spear-on-back logic:** the back socket shows the spear only when `!W.spearOut`.

### 2.8 Hit feedback
- **Hitstop** (real time): in `frame()`, `hitStop = Math.max(0, hitStop - raw)`.
  - `const hsK = (who) => (hitStop > 0 && (who === P || who === hsWho) ? 0.05 : 1);`
  - Apply it at the call site `settle(P, dt * hsK(P), P.sneak)` (WPN-owned end of updatePlayer), in `updateAnimal`'s `o.a.update(dt * hsK(o))`, and in `updateSpear(dt * (hitStop > 0 ? 0.05 : 1))` in frame.
  - **Never** scale UI, input, camera or `S.time`.
  - Values: punch 0.045, axe or spear melee 0.07, a kill 0.12, chop 0.02, a thrown-spear hit 0.06.
  - Set `hsWho = target`.
- **Trauma shake:**
  - `trauma = min(1, trauma + x)`, decaying at 1.5/s.
  - In the third-person and first-person camera blocks, after `camera.position` is set: `const k = settings.shake === false ? 0 : trauma * trauma;` then offset `camera.position` by `k * 0.12 * (sin(clock*37), sin(clock*41+1), sin(clock*29+2))`, and after `lookAt` call `camera.rotateZ(k * 0.03 * sin(clock*23))`.
  - Values: punch +0.25, axe/spear +0.4, kill +0.7, chop +0.1. Being bitten by a wolf +0.35: add a `// WPN` line where the wolf damages P, in wolfBrain.
- **Target reaction:** `hurt(o, dmg)` gets a 1-line `// WPN` call `wpnKnock(o)`.
  - It sets `o.kb = { x: dirx * 2.2, z: dirz * 2.2, t: 0.25 }` (direction from P) and `o.flinch = 0.3`.
  - In updateAnimal after the mixer line: move `o.root.position` by `o.kb * dt` (with `collide`), decay it, and apply `o.root.rotation.z = sin(o.flinch / 0.3 * π) * 0.12`.
  - A dust puff: 6 small brown sprites that rise and fade over 0.4 s, from a pooled `Points`. **No blood.**
- **Sounds** (pitch randomised ±10%):
  - swing whoosh at swing start: `A.hit(700 + rand()*300, 0.12, 0.07)`. It replaces the current `A.hit(1100, 0.1, 0.15)`.
  - hit: `A.hit(170·r, 0.16, 0.45)` + `A.hit(1300·r, 0.04, 0.2)`
  - whiff (no target): only the whoosh
  - kill: an extra `A.tone(110, 0.3, 0.08)`

### 2.9 First-person viewmodel (fixes 24-28)
- **Separate scene and camera:**
  - `vmScene` and `vmCam = new THREE.PerspectiveCamera(52, aspect, 0.01, 10)`; update the aspect in the resize handler with a `// WPN` line.
  - Lights: a `HemisphereLight` whose intensity is `0.35 + 0.65 * (1 - world.env.night)` times `(1 - 0.6 * world.env.cave)`, plus a `PointLight` (orange, 2.5) near the left hand when the torch is lit.
- **Render:** in `frame` replace `renderer.render(scene, camera)` with:
  ```js
  renderer.render(scene, camera);
  if (playing && view === 'fpp' && !camShot && !P.ride?.hideVm) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
  ```
  This needs no world clipping and no near-plane tricks.
- **Content:**
  - `vmR` group at (0.24, −0.24, −0.42): a forearm (cylinder r 0.035, 0.32 long, skin colour from `P.h` body material colour), a fist (rounded box), and a vm instance of the current weapon (own `makeSpear`/`makeAxe` with the same `flint` option)
  - `vmL` at (−0.24, −0.26, −0.42): forearm plus a vm torch (`makeTorch()` with `lit` true; take its `light` out of the scene and set its intensity to 0, using the vm point light instead), shown only when the torch is lit
- **Motion:**
  - bob: `sin(P.step*2.7) * 0.012 * min(1, P.speed/3)` on y and half of it on x
  - sway: lag of camera yaw/pitch deltas × 0.02, clamped
- **Draw/sheathe:** the weapon group slides from y −0.45 to 0, and back.
- **Swings** (procedural, using the attack time fraction `u`):
  - axe: rotation.x −1.1 → +0.7 with a z push
  - spear thrust: z −0.3 and back
  - fists: alternate L/R jab forward 0.22
  - aim: the spear rises to (0.28, −0.05, −0.35), pointing forward, and charge pulls it back 0.08
  - throw: forward 0.4, then the weapon hides
- **Hidden** when sheathed with fists (hands at rest are off screen), when swimming, and when riding unless aiming.

### 2.10 HUD and HTML
- **`#wpn` chip** after `#inv`, three slots `1 Fists · 2 Axe · 3 Spear`:
  - the current one is highlighted
  - unowned weapons are dimmed
  - a small "drawn" dot
  - the spear slot reads "Spear — on the ground" while out
  - a hint line `hold Q sheathe · tap Q swap`
  - updated by `wpnHud()` on state changes only, not every frame
- **Help lines:** `<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> fists / axe / spear · hold <kbd>Q</kbd> draw/sheathe · tap <kbd>Q</kbd> swap` and `<kbd>Click</kbd> attack &nbsp;hold <kbd>Right-click</kbd> aim, release to throw`.
- **Settings rows:** "Draw weapon when wolves come close" (`opt-autodraw`), "Camera shake on hits" (`opt-shake`), "Spear aim arc" (`opt-arc` select On/Fade/Off). Wire them in `bindSettings` with `// WPN` lines.
- **`drawInv`:** keep the tool list.

### 2.11 Cross-package API that WPN provides (RST calls these)
- `wpnStowAll(reason, instant)`: cancels aim, and sheathes or snaps to sockets.
- `wpnRest(s, layPts)`:
  - instant stow
  - if the spear is out, return it silently and set the flag `W.returnedOvernight = true`
  - turn the axe and spear into **world props** for the night: `scene.attach` them at `layPts.spear` (leaning against the wall or bed head, upright, tilted 15°) and `layPts.axe` (lying flat on the floor beside the bed); if a rack structure is within 8 m, hang the spear on it instead
  - the unlit torch lies next to the axe
  - Sena's basket goes on the floor at `layPts.basket`
- `wpnWake()`:
  - plays `pickU` on P
  - over 0.6 s moves the props back to their sockets with `h.place(..., 0.25)`
  - toast "Sena brought your spear home last night" if `W.returnedOvernight`

### 2.12 G hooks (WPN)
```
G.wpn = {
  state() → { sel, last, st, aim: W.aim && { t, charge }, spearOut, spearAt: S.spearAt, parents: { spear, axe, torch } (socket names), gripR: P.h.gripR },
  select(k), draw(), sheathe(), toggle(),
  aim(on = true), charge(t) /* sets aim.t */, release(), cancel(), arc() → { pts: [[x,y,z]…], hit: 'ground'|'animal'|null, end: [x,y,z] },
  pickup(), fetch() /* forces Sena fetch */,
  fit(kind, slot, { p, r, s }) /* live-edit FIT and re-place */, fitDump() → JSON string, axes(on) /* AxesHelper(0.15) on every socket and both hands */,
  ends() → { spearTip, spearButt, head, flame, handL, handR } world positions (for the clipping checks),
  get hitStop(), get trauma(), vm() → { visible, weapon, y },
}
```

### 2.13 WPN acceptance checks (tests in `scratchpad/tests/wpn/`, shots in `scratchpad/shots/wpn/`)
Set up with `G.give`/`S.tools` = spear, axe, torch; flat meadow near (0, 4); `G.time(12)`.

**Rest pose and clipping:**
1. **Idle, sheathed:** `state().parents` = `{ spear: 'back', axe: 'hipL', torch: 'hipR' }`, and nothing in `hand`.
   - Shots `w01_idle_back.png` (camera behind) and `w02_idle_side.png`: the spear diagonal across the back, tip over the right shoulder; the axe at the left hip; the torch at the right hip.
2. **No clipping when idle:** over 3 s each of idle, walk and sprint, sampled every 0.1 s:
   - the minimum distance from the spear shaft segment to `Head` > 0.14 m
   - the butt y > ground + 0.05
   - the tip is never below the pelvis y
   - This is a regression test for 09, 11 and 12.

**Draw, sheathe and selection:**

3. **Draw:** press `2`, hold Q 0.4 s, then within 0.45 s `parents.axe === 'hand'` and `st === 'drawn'`.
   - Shot `w03_axe_drawn.png`: the fingers are closed (gripR ≥ 0.95).
   - Sheathe: back to `hipL` within 0.45 s.
4. **Auto-sheathe:** drawn, no wolves, wait 6.5 s → `'sheathed'`.
   - Spawn a wolf at 10 m (`G.spawn('wolf', …)`) → the weapon auto-draws within 0.6 s.
   - With `settings.autoDraw = false` it does not.
5. **Context stow:** each of these sets the state to sheathed within 0.5 s (or instantly):
   - swim (tp into the river at z = 0)
   - `G.mount()`
   - `G.sitTogether(fire)`: the spear prop leans at the bench, shot `w05_bench.png`
   - Tab menu open
   - near the house for 2.5 s
6. **Swap:** with the axe drawn, tap Q → spear drawn (last weapon) within 0.8 s. Tap Q again → axe.

**Spear and hit feel:**

7. **Two-handed spear stance:** spear drawn, idle → `handL` within 0.06 m of the shaft line. Shot `w07_spear_ready.png`.
   - With the torch lit, the spear is one-handed (the hand_l to shaft distance is > 0.15).
8. **Aim and throw:**
   - `G.wpn.aim(); G.wpn.charge(0.6)` → camera FOV ≤ 49 after 0.3 s, and the arc has ≥ 20 points.
   - `G.wpn.release()` and wait for the stick: the landing point is within **0.6 m** of `arc().end` (flat ground, no animals).
   - `parents.spear` is not `back`, `S.spearAt` is set, and the back socket is empty.
   - Shots `w08a_aim_tpp.png` (overhead pose, crosshair, arc) and `w08b_throw_release.png` (body mid-throw; the projectile in front of the hand, not through the head).
9. **Spear stays and is picked back up:**
   - After 10 s the spear is still visible at `S.spearAt`, and there is only one spear in the world (no duplicate in hand).
   - Walk onto it → `spearOut === false`, `parents.spear === 'back'`.
   - Save → reload → Continue with the spear out: it is still at the same spot.
10. **Hitstop and shake:**
    - Punch a deer → `hitStop` was set to about 0.045 (read on the next frame) and `trauma > 0.2`.
    - An axe kill → about 0.12.
    - The deer was knocked back > 0.3 m.
    - `settings.shake = false` → no camera offset.
11. **Torch with the axe:** light the torch and draw the axe.
    - flame y > handL y + 0.15
    - the flame-to-Head distance > 0.35
    - the flame is in front of the chest plane (dot with the facing direction > 0)
    - Shot `w11_torch_axe.png` (night). This is a regression test for 06 and 07.

**Riding, first person, save and Sena:**

12. **Riding:** after `G.tame()`, everything is in its socket and the torch, if unlit, is on the hip.
    - Aim from the saddle works; `P.face` is unchanged by aiming.
    - LMB does nothing.
    - Shot `w12_ride_aim.png`.
13. **First person:**
    - The axe is drawn: `vm().visible`; shot `w13_fpp_axe.png`.
    - Aim: shot `w13b_fpp_aim.png`.
    - Night with the torch: shot `w13c_fpp_torch.png`.
14. **Save:** `S.equip`/`S.lastEquip` survive a reload. You always load sheathed.
15. **Sena:** the basket is on her back (`w15_sena_basket.png`); it is hidden while sitting or resting.
16. **Overall:** `npm run build` passes. Errors are 0 over the whole run, and tests/final/play.json still passes.

---

## 3. WP-S: rest and sleep sequence (RST)

### 3.1 Goals
Replace the black fade, the stiff rotated statues (audit 32-46) and the door teleport (36-38, 47-48) with a short, **skippable** cinematic:
1. walk to the bed
2. sit and lie down, in a real lying pose, side by side, facing each other and holding hands, under a blanket
3. the camera dollies in
4. a time-lapse of the night sky (stars, then sunrise) under a 70% vignette, with ambience and a dream line
5. wake: sit up, stand **beside the bed**, stretch, and a morning greeting from Sena

**Rules:**
- rest length (until dawn or a 2 h nap)
- no sleep with wolves nearby
- sleep-until-dawn only in the evening and night
- the rested buff depends on shelter quality
- weapons stowed and the torch out

### 3.2 State and save
```js
// RST state
const R = { on: false, phase: null, t: 0, s: null, mode: 'dawn', together: false, tier: null, comfort: 0,
  t0: 0, t1: 0, hours: 0, dayAdd: 0, skip: false, hold: 0, hold4: 0, line: null, wokeAt: -1e9, menu: false, freeze: null };
```
**Save fields:**
- `S.rested` (exists; seconds left)
- `S.restTier` (`'Rested' | 'Well rested' | 'Snug' | null`)
- `S.c.restSeen` (the first full cinematic has played)
- `S.c.apartDay` (a day Aro slept apart from Sena)
- `S.c.lastSleepDay`

`rstLoad()` sets `S.restTier ??= S.rested > 0 ? 'Well rested' : null` and draws `#buff`.

**Saving during the sequence:** `save()` runs only at the end of the night phase, so a save never captures someone in bed. If the tab closes mid-sequence, the beacon save may catch `R.on`. That is harmless, because `R` is not saved and `P.rest` is not saved.

### 3.3 Entry, menu and rules
- **structTarget** (≈l.1354): `case 'hut': case 'house': return rstPrompt(s, t);`. The cave bed still calls `sleep({...})`.
- **`sleep(s)`** stays the public entry (G.sleep and the cave use it). Now it is `rstOpen(s)`.
- **`rstPrompt(s, t)`:** returns `t(label, act)` or an info-only target. Its rules:
  - **Wolves:** `hostileNear(35)` → label "You can't rest with wolves prowling nearby" (no action). Sena's line once per night: "Not now — I can hear them out there."
  - **Just woke:** `clock - R.wokeAt < 90` → no rest prompt at all. This fixes 36 and 47.
  - **Night window:** `S.time >= 18 || S.time < 5.5` → "Rest until dawn". Otherwise "Nap for a while".
- **`rstOpen(s)`** opens `#restmenu` (a centred panel) and sets `R.menu = true` (movement is blocked like `menuOpen`).
  - Title: "Rest in the {label}" (cave: "Shelter in the cave").
  - **Night options:** `1` Sleep until dawn, `2` Nap 2 hours, `Esc` Not now.
  - **Day options:** `1` Nap 2 hours, `Esc` Not now.
  - **E** also chooses the first option.
  - Each option shows a preview of the buff tier, e.g. "Snug · stamina returns faster for 5½ min". Naps say "a little health, no buff".
  - Mouse clicks work too (the menu exits pointer lock and re-locks on close).
  - `rstKey(e)` is the keydown line: when `R.menu`, it consumes `Digit1`/`Digit2`/`KeyE`/`Escape` and returns true. When `R.on` and the phase is in `walk|sit|lie|night` and `S.c.restSeen`, **any key** sets `R.skip = true` and returns true. Otherwise it returns false.
- **Together:**
  - `R.together = !!(s.bedPts && Math.hypot(N.pos.x - s.x, N.pos.z - s.z) < 40 && !N.ride)`.
  - Alone: a solo sequence (only Aro lies down), no closeness, and `S.c.apartDay = S.day`. The next time Aro is within 6 m of Sena she says one of: "You didn't come home last night. I kept the fire going for you." / "Next time, sleep where I can hear you breathing." This check is an RST tick inside `rstTick`.
- **Comfort points** (`rstComfort(s)`):

  | Source | Points |
  |---|---|
  | cave | 1 |
  | hut | 2 |
  | house | 3 |
  | house with a bed | +2 |
  | hearth upgrade (`S.home.hearth`) | +2 |
  | a lit campfire within 8 m (`structs` kind `fire`, `rise >= 1`) | +1 |
  | house only: `min(3, homeliness() / 3 | 0)` | +0 to 3 |
  | together | +1 |
  | storm (`world.env.storm > 0.5`) in the hut | −1 (the thatch leaks) |

  Tier: `C <= 2` → 'Rested', `3..5` → 'Well rested', `>= 6` → 'Snug'.
- **Outcome** (`rstApply()`, run once at the end of the night phase):
  - `R.hours` = hours slept, from `t0` to `t1` across midnight
  - `S.hp = min(100, S.hp + 6 * hours)`
  - `S.food = max(12, S.food - 1.8 * hours)`, and the same for `S.water`
  - `S.warm = 100`
  - **Dawn mode:**
    - `S.rested = 120 + 30 * C` (game seconds; the existing ×1.5 stamina effect, unchanged)
    - `S.restTier = tier`; Snug also makes hunger drain ×0.8 while active (one `// RST` factor in updateStats)
    - toast `"{tier}: stamina returns faster ({m} min)"`
  - **Nap mode:** no buff (keep any remaining buff); toast "A short nap: you feel a little better".
  - **Together:** keep the existing closeness and dialogue
    - house: `bump('slept_home'); addClose(4, 'rested at home')`, plus the first-time line
    - otherwise `addClose(2, 'rested together')`
    - +1 `addClose(1, 'a good evening together')` if `S.c.mealDay === S.day || S.c.satDay === S.day` (checked **before** the day changes)
    - naps give closeness at most once per day
  - `bump('slept')` (dawn mode only), `horseNight()` (dawn only), `maybeBirth()` (together and dawn), `save()`, toast `Day N` when the day changed.

### 3.4 Lying poses (no root rotated −π/2 for P and N)
- **`settle()`:** one new first line `if (e.rest > 0 && e.lie) { rstSettle(e, dt); return; }`, placed before the existing rest line. **Kids keep the old branch**, because they have no `e.lie`.
- **`rstSettle(e, dt)`:**
  - `root.rotation.x = 0`, `root.rotation.order = 'YXZ'`
  - sets the root position and quaternion from `e.lieQ` and `e.liePos`, smoothed
  - then `e.h.animate(dt, 0)` with `e.h.pose = 'sit'` for Sena's base (any loop works, because the full-body override replaces it)
- **The lie override** (order 10), registered per sleeper as `h.addOverride('lie', 10, …)` with weight `e.lieW`, eased by the phase:
  - **Aro, on his back:**
    - `applyPose(h, LIE.aro, w)` with `LIE.aro = samplePose('male', 'death', clip.duration)` (Death01's last frame: lying on the back, pelvis about 0.06 above the root)
    - then additive tweaks × w:
      - `neck_01` and `Head` yaw toward Sena (+0.35 total, sign chosen at runtime so his face turns toward her head)
      - the outer arm (away from Sena) folded under the head: `ik2(h, outer, headWorld + up 0.04 + outward 0.12, pole = up/out, w)`
      - knees slightly bent: `calf_*` +0.15 rad and `thigh_*` −0.08 (tune the sign by eye)
  - **Sena, on her side facing Aro:**
    - `applyPose(h, LIE.sena, w)` with `LIE.sena = samplePose('female', 'sitHold', 0)` (the seated pose)
    - root orientation built from axes, so the roll is right by construction. In bed-local terms, X goes toward Sena's right side of the bed, −Z toward the pillows:
      ```js
      // Sena's model +Y (up the spine) → toward the pillow; model +Z (her facing) → toward Aro; small 0.25 rad roll back for a natural side lie
      const up = pillowDir (world, = toWorld dir of local -Z), fwd = dirToAro (world horizontal, perpendicular to up)
      const xAxis = new THREE.Vector3().crossVectors(up, fwd);   // check handedness: if her face ends up away from Aro, negate fwd
      e.lieQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, fwd));
      e.lieQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0).premultiply(...)) // apply the 0.25 roll about `up`
      ```
      The seated thighs then point toward Aro (knees bent) and the shins down the bed: a curled side sleeper.
    - Tweaks: `Head` pitch +0.15 toward the pillow; the lower arm under her cheek: `ik2(h, lowerSide, headWorld + toward Aro 0.08 + down 0.05, …)`.
- **Holding hands** (order 30, both sleepers, only when together):
  - Aro uses the hand nearer Sena (compare `hand_l`/`hand_r` world distance to `N.h.bones.spine_02`). Sena uses her upper hand (higher world y).
  - Target `T` = the point on the mattress halfway between Aro's hip and Sena's chest, `y = mattressY + 0.06`.
  - `ik2(Aro, side, T + toward Aro 0.03, pole = up, wHold)` and `ik2(Sena, side, T + toward Sena 0.03, pole = up, wHold)`.
  - `wHold` eases to 1 over 1 s after the lie blend completes.
- **Alignment (measure and align, like WP4 seatOn)** inside `rstSettle`, after `animate`:
  - read `Head` and `pelvis` world positions
  - correct the root position in xz so `Head` lands on `e.pillowPt`
  - correct y so `pelvis.y = mattressY + PELVIS_CLEAR`, where `PELVIS_CLEAR` is 0.11 for Aro on his back and 0.16 for Sena on her side (tune)
  - smooth with `1 - exp(-dt*12)`; snap on the first frame of the lie phase
  - only translations, never root pitch
- **Points:**
  - **Hut and house:** RST adds `pillowPts` to the returned struct data in entities.js:
    - hut: `[[-0.35, 0.2, -1.12], [0.35, 0.2, -1.12]]` (pillows at z −1.22, y 0.12)
    - house: measure the bed and pillow meshes in `setHome` and add matching points
  - **House without a bed** (the user's current save!): the floor fallback feet `[[-1.3,0.24,-0.4],[-0.5,0.24,-0.4]]`, with pillow = feet + (0, 0.04, −1.55); the blanket is a "hide on the floor"
  - **Cave:** `bedPts` + pillow = feet + (0, 0.04, −1.55)
  - `mattressY` = pillow y − 0.05
- **Breathing** (order 40): `spine_02.rotation.x += sin(clock * 2π * 0.22 + phase) * 0.025 * w`, with `spine_03` at half of that. Sena's phase is offset by 1.3.
- **Blanket** (`makeBlanket(w = 1.45, l = 1.15)` in entities.js):
  - `PlaneGeometry(w, l, 14, 12)`, laid flat, hide colour 0x8a6a4a, roughness 1, `DoubleSide`, castShadow, `userData.drape(points, mattressY)`
  - **Draping:** each vertex height = `mattressY + 0.04 + max over body points of (r² − d²)⁺ / r · 0.9`. Body points: both sleepers' pelvis, thighs, calves and feet bones in world xz, r 0.18.
  - Recompute once when `lieW` reaches 1 and once after the hand-hold settles. That is cheap: 195 vertices.
  - Place it from the hip line to beyond the feet, centred between the two sleepers, aligned with the bed.
  - Scale y in from 0 over 0.5 s during the lie phase, and out on wake. **It covers from the waist down**, which also hides any clipping.
  - Solo: width 0.9, centred on Aro.

### 3.5 The sequence (`rstUpdate(dt)`, driven from updatePlayer's rest branch)
`busy = true` for the whole sequence. This blocks events, prompts and keys, like `fadeTo`. `#hud` gets class `cine`, which hides `#quest`, `#bars`, `#help`, `#prompt`, `#toasts`, `#inv`, `#wpn` and `#clock` while keeping `#sub` (subtitles).

The updatePlayer branch becomes:
```js
if (P.rest > 0) { P.vx = P.vz = 0; jumpTap = false; rstUpdate(dt); if (P.rest > 0) { settle(P, dt, false); target = null; $('prompt').style.display = 'none'; return; } }
```
P.rest and N.rest are 1 while `R.on`. The `N.rest` line in updateSena: when `R.phase === 'walk' || 'wake'`, rstUpdate itself moves N, so the line keeps `settle(N, dt, false)` but uses N.speed from rstUpdate (remove `N.speed = 0` for those phases).

Phases (real seconds; first time / after first time / when skipped):

| # | phase | duration | What happens |
|---|---|---|---|
| 0 | `prep` | 0 | `wpnStowAll('rest', true)` and `setTorch(false)` (extinguish: toast "You put out the torch" suppressed), dismount guard, clear sit/work/dance, `P.auto = false`, `N.node = null`. Compute points: **approach** = the bed side (feet point + outward lateral 0.55 + toward the head 0.6), sit = the bed edge, lie, pillow, **stand** = feet + outward 0.55. Call `wpnRest(s, layPts)` with `layPts` `{ spear: headboard corner + outward 0.3 (inside the walls), axe: floor beside Aro's approach, basket: beside Sena's approach }`. Start the camera: `camShot = { from: camPos.clone(), pos: restCam.start, look: restCam.look, k: 0, dur: 1.2, dolly: true }` |
| 1 | `walk` | ≤ 2.2 s | `walkTo(P, approach, 2.2)` and `walkTo(N, approachN, 2.2)` (if together). The phase ends when both arrive, or at the time limit (snap the rest of the way) |
| 2 | `sit` | 0.9 s | face away from the bed's side, `h.swing('sitDown')`, then `h.pose = 'sit'`, root moved to the bed edge (y = mattress − 0.05). Sena starts 0.25 s later |
| 3 | `lie` | 0.9 s | `e.lie = true`, `lieW` 0 → 1 (smoothstep), root lerps from the sit spot to the lie alignment, and the orientation slerps from upright-facing to `e.lieQ`. The blanket grows in. Camera dolly to `restCam.end` over 3 s (smoothstep, continuing into the night) |
| 4 | `night` | 3.8 s first time / 3.0 s / skip → 0.4 s | `#vignette` opacity → 0.7 (a radial gradient, not black). **Time-lapse:** `S.time = (R.t0 + ease(u) * R.hours) % 24`; `S.day++` when it wraps past 24 (dawn mode); naps advance 2 h. `updateStats` gets a `// RST` guard `if (R.on && R.phase === 'night') { /* skip the S.time increment */ }`. `world.setTime` then does the sky, stars and sun automatically. Ambience: `A.cricket.gain` up ×2 (updateWorldThings sets it each frame from E.night, so set it after that call via `rstAmbience()` in rstUpdate, which runs earlier, and set the value in `updateWorldThings`… simpler: a `// RST` multiplier `* (R.on ? 2 : 1)` on that line); a fire crackle `A.hit(300 + rand()*600, 0.05, 0.025)` at random about 5/s if a fire or hearth is within 10 m; one soft lullaby tone pair `A.tone(262, 2.2, 0.015)` and `A.tone(330, 2.2, 0.012, 0.6)` at the start. The **dream line** at 25%: `say('Sena', DREAM[ch][i])` or, for odd nights, `say('Aro', …)`; solo nights use Aro thoughts. **Birth:** `maybeBirth()` runs inside rstApply at the end of this phase. Its line `fadeExtra = 4000; P.rest += 4; N.rest += 4; if (camShot) camShot.t += 4;` changes (RST-owned) to `R.hold4 = 4;`. When `R.hold4 > 0`, rstUpdate shows `#fade` with its text (already set by maybeBirth) for 4 s before `wake`; the time remains 9 as maybeBirth sets. Then `rstApply()` |
| 5 | `wake` | 2.6 s | Vignette → 0 over 0.8 s with a warm tint (`#vignette` colour #3a2410 → transparent). Aro: `lieW` 1 → 0 over 0.7 s while the root eases to upright at the sit spot (`h.pose = 'sit'`), then `swing('standUp')`, root to the **stand** point, `face = s.rot` (toward the door), then the **stretch** (order 40, 1.1 s): `upperarm_l/r` raised with `ik2` to targets above the head (shoulder + up 0.55 + out 0.12, envelope sin), `spine_03` back-arch −0.12, `Head` pitch −0.15, plus a yawn sound `A.tone(180, 0.6, 0.02)`. Sena does the same 1.0 s later. The blanket shrinks out. `wpnWake()` at 1.2 s. The **morning line** at 1.6 s (3.7). Camera: `camShot` pos → `restCam.start`, then release (3.8) |
| 6 | `done` | 0 | `P.rest = N.rest = 0`, `e.lie = false`, remove the overrides `lie`/`hold`/`breath`/`stretch`, `busy = false`, remove `cine`, `R.on = false`, `R.wokeAt = clock`, `S.c.restSeen = 1`, `S.c.lastSleepDay = S.day` |

- **Total:** about 10 s the first time, about 8 s after that, and about 4 s skipped. **Skip** (`R.skip`) jumps straight to the end of `night`, applies everything and plays `wake` at 1.5× speed. The first-ever sequence can't be skipped.
- **`endRest()`** is kept for `epilogueExtras` and `G`. It finishes instantly: if not applied, `rstApply()`; then everyone stands at the stand points, overrides are cleared, and it goes to `done`.
- **`die()`:** a `// RST` line `rstAbort();` (no apply, just a reset), before its existing reset line.
- **Kids:** `kidsToBed(s)` is unchanged (old rotated-root pose). At `done`, kids wake beside Sena, using the existing code at ≈l.1624, which uses `N.pos`. Because N is now inside, they wake inside too.

### 3.6 Camera
- **`restCam` per shelter:** in entities.js data for the hut and house, and in the cave object literal. Each has `start`, `end` and `look` in local coords. Tune them with `G.restCam(name)`.
  - **hut:**
    - start = the existing `camPt [0, 1.45, 2.55]`
    - end `[0.55, 1.55, 0.35]` (inside, high, a 3/4 view down onto the pillows)
    - look `[0, 0.2, -0.7]`
  - **house:**
    - start `[0.6, 2.15, 2.1]`
    - end `[-0.25, 1.9, 0.5]`
    - look `[-0.9, 0.55, -1.0]`
  - **cave:**
    - start `[2.4, 2.0, 2.4]`
    - end `[1.1, 1.5, 1.0]`
    - look `[0, 0.3, -0.3]`
- **The `camShot` block** in updateCamera (RST-owned) gains `dolly` support. When `camShot.dolly`:
  ```js
  camPos.lerpVectors(camShot.from, camShot.pos, smooth(k = min(1, k + dt / dur)))
  // with the look point lerping the same way
  ```
  `camShot.t` is no longer used for the rest sequence; rstUpdate owns the lifetime and sets `camShot = null` at the release. Epilogue shots keep the old `t` behaviour.
- **Release to gameplay** (fixes the snap and the in-thatch camera, 36-38 and 47-48):
  - set `camYaw = (s.rot || 0) + Math.PI`, so the camera is behind Aro and he faces the door
  - `camPitch = 0.18`
  - then for 0.8 s keep `camShot = { release: true, … }`, lerping `camPos` toward the normal third-person position computed with the same formula as the third-person block (copy the 3 lines)
  - then `camShot = null`
- **`structCam(look, camPos)`** in the RST section (called by one `// RST` line after `caveCam(camPos);`):
  - for structures with `rise >= 1` within `radius + 6` of P, raycast from `look` toward `camPos` against `s.group` (recursive, `far = dist`)
  - on a hit, pull `camPos` to `hit.distance - 0.2` along the ray, with a minimum of 0.5
  - skip meshes flagged `userData.noCam` (floor and rugs); set that flag on the floor and hide-rug meshes in entities.js
  - cost: at most 3 structures, one raycaster
  - this also fixes audit 29 (camera inside the thatch before resting)

### 3.7 Dialogue pools (family-friendly)
- **`DREAM[chapterId]`,** two lines each. Use the chapter's last pair as a fallback.
  - **awaken/fire:** Sena: "…warm… the sparks look like little stars…"; Aro (thought): "The fire held. We held."
  - **hunt:** Sena: "…quiet feet… the deer by the water…"; Aro: "Tomorrow I will throw truer."
  - **shelter:** Sena: "…a roof of reeds… no more rain on my face…"
  - **cave:** Sena: "…the painted hands… they're waving at us…"
  - **herd:** Sena: "…the horses in the meadow… so fast…"
  - **clay/house:** Sena: "…red clay… a house that stands for our children's children…"
  - **hearth:** Sena: "…the hearth crackling… home…"
  - **seeds:** Sena: "…green shoots… bread from our own field…"
  - **newlife:** Sena: "…small hands… a lullaby…"
  - **village:** Sena: "…so many fires in the valley now…"
- **`MORNING` (`rstMorningLine()`):** pick in order. The first matching rule gives the first sentence. Then add a goal hint from `CH[S.ch].goals.find(([, f]) => !f())`, e.g. "Let's {goal lowercased} today." Only for open goals, and at most every other morning.
  - **storm overnight** (any `world.env.storm > 0.5` sampled during the night): "The rain sang on the roof all night." In the hut: "The rain found a hole in the thatch — right on my nose."
  - **solo** (Sena not in the sequence): no line at wake; the apart line comes later (3.3)
  - **cave:** "Stone is a cold pillow. I miss our bed."
  - **hut:** "My back aches a little from the ground — but I slept."
  - **house, no bed:** "A floor is still a floor, even under a roof. A bed would be nice." (This nudges the user's open mission.)
  - **house + bed:** "I slept like a stone. Our own bed, Aro."
  - **Snug:** "Warm hearth, soft furs… I could stay here forever."
  - **kids:** "Lio kicked me twice in the night. She dreams of running."
  - **closeness ≥ 60:** an extra "Good morning, you." in front of the line
  - **nap:** "Mm… just a little longer… all right, I'm up."
  - The returned spear (WPN flag) is handled by `wpnWake`'s toast.

### 3.8 HUD and HTML (RST)
- **`#vignette`:** fixed full screen, `background: radial-gradient(ellipse at center, rgba(5,8,20,0) 35%, rgba(5,8,20,.9) 100%)`, opacity transition 0.6 s, `pointer-events:none`, z-index just under `#sub`.
- **`#restmenu`:** a centred `.panel`, a serif title, and 2-3 `<button>`s with `<kbd>` hints and a tier preview line. Hidden by default.
- **`#buff`:** a chip inside or next to `#clock`: "Snug · 4:30". Shown while `S.rested > 0`, updated twice a second from `updateHome`'s `S.rested` line.
- **`#hud.cine`** rules: hide `#quest, #bars, #help, #prompt, #toasts, #inv, #wpn, #clock, #fps, #cross`.
- **Help line:** "hold <kbd>E</kbd> at a site to build together · <kbd>E</kbd> at the hut, house or cave bed to rest or nap".

### 3.9 Optional (only after 3.1-3.8 pass)
- **R-opt1, morning breakfast.** At `done` in dawn mode, if `S.inv.meat >= 1` and a fire or hearth is within 30 m:
  - Sena walks there (a `N.breakfast` state, one `// RST` line in updateSena after the `N.rest` line), plays `use`, and turns 1 meat into cooked meat
  - toast "Sena cooked breakfast"
  - "Share a meal" (`shareMeal`) is then offered by the existing target logic
- **R-opt2, night wake.** About 5% chance, never in a house. In `night` at 40%, the time-lapse stops at about 03:00:
  - Sena: "Did you hear that?"
  - wake straight away, with the buff halved
  - with no wolves near, it was just a fox: no spawn
- **R-opt3, "Sleep by the fire" outdoors** at a campfire at night: comfort 0, tier 'Rested' only when no storm, otherwise no buff ("Stiff": hp +3/h).

### 3.10 G hooks (RST)
```
G.rest(mode = 'dawn', { s, skip = false } = {}) → Promise<{ tier, comfort, hours, hp, close, line, phaseLog: [[phase, clock]…] }>   // bypasses the menu
G.restState() → { on, phase, t, mode, tier, together, lieW: [P.lieW, N.lieW], time: S.time }
G.restHold(phase | null)   // freeze the sequence when it reaches that phase (for screenshots); null releases
G.restBlock(s?) → null | 'wolves' | 'recent' | 'nap-only'
G.restMenu(s?) / G.restChoose(i)
G.lie(who = 'both', on = true, s?)   // pose in bed instantly without the sequence (tuning)
G.restCam('start' | 'end' | 'look')  // jump the camera to that point
G.restProbe() → { mattressY, P: { head, pelvis, footL, footR, handNear }, N: {…}, pillow: [..], handGap, rootPitch: [P.h.root.rotation.x, N.h.root.rotation.x] }
G.endRest (existing; now ends cleanly beside the bed)
```

### 3.11 RST acceptance checks (tests in `scratchpad/tests/rst/`, shots in `scratchpad/shots/rst/`)
Scenarios: a hut and a house **with and without a bed** (`S.home.bed` false is the user's real save state), plus a cave bed. `G.time(21)`.

**Rules and menu:**
1. **Rules:**
   - `G.time(12)` → `restBlock() === 'nap-only'`, and the menu has only "Nap 2 hours".
   - `G.time(21)` → 2 options.
   - Spawn a wolf at 20 m → `'wolves'`, `G.rest()` refuses with a toast, and no state changes.
   - Right after a sequence → `'recent'`, and the prompt is hidden.

**Walk, poses and stage:**

2. **Walk:** during `walk`, P and N each move ≥ 0.5 m toward the bed; neither teleports more than 0.3 m in one frame (except at the time-limit snap).
3. **Pose quality** (`restHold('night')`, then `restProbe()`) in the hut, the house bed and the house floor:
   - **root pitch:** `rootPitch` are both 0. There is no −π/2 root.
   - **flat feet:** `|footL.y − footR.y| < 0.12` for Aro (was 0.43 in the audit).
   - **on the mattress:** all of head, pelvis and feet lie in `[mattressY − 0.03, mattressY + 0.35]`.
   - **pillow:** each head is within 0.15 m (xz) of its pillow point (was off the pillow in 43 and 44).
   - **hands:** `handGap < 0.12` when together.
   - **faces:** Sena's face direction (Head forward axis) points toward Aro (dot > 0.5).
4. **Shots:** `r01_walk.png` (walking to the bed), `r02_sit.png`, `r03_lie_hut.png`, `r04_lie_house_bed.png`, `r05_lie_house_floor.png`, `r06_top_house.png` (dolly end). Also `r07_night_lapse.png`: vignette and stars, mid-night, with the HUD hidden. No spear sticking up, no torch on the thigh, the blanket over the legs, and the weapons as props by the bed (visible in r04 or r06).

**Time-lapse, wake and outcome:**

5. **Time-lapse:** S.time, sampled every 0.25 s during `night`, increases monotonically (mod 24) from 21 toward 6.3; the day goes up by 1 exactly once. A nap at 12 → 14 with the day unchanged.
6. **Wake:** after `done`:
   - P is within 1.2 m of the bed's stand point and **inside** the structure radius (not at the door)
   - `P.h.root.rotation.x === 0`, `h.pose === null`
   - the weapons are back in their sockets (WPN `state().parents`)
   - the camera is not inside a wall: a ray from `look` to `camera.position` is unobstructed, given `structCam`
   - shots: `r08_wake_situp.png`, `r09_stretch.png`, `r10_after_wake_cam.png` (an unobstructed view, cf. audit 36 and 47)
7. **Outcome:**
   - hut together → tier 'Well rested' (2 + 1 + fire?)
   - house + bed + hearth → 'Snug'
   - cave → 'Rested'
   - `S.rested === 120 + 30*C`
   - hp increase ≈ 6 × hours (±1)
   - nap → no buff change
   - closeness +4 in the house and +2 in the hut, as before
   - the morning line matches the shelter: "No bed" → the floor line
8. **Skip:** on the second run any key at `lie` → `done` within 4.5 s, with the outcome identical to an unskipped run. The first run ignores the skip.
9. **Solo:** Sena more than 40 m away → only Aro lies down, no closeness; walking within 6 m of Sena later triggers the "didn't come home" line once.
10. **Birth path:** `G.setCh('newlife')` with its goals met → the fade card shows 4 s, `S.time === 9`, and Lio exists, sleeping in the kid bed with the old pose, and wakes beside Sena.
11. **Save:** after waking, save → reload → `S.restTier` and `S.rested` persist and `#buff` shows. A save during the sequence never contains `rest`.
12. **Regressions:** `npm run build` passes; tests/final/play.json (which calls `G.sleep()`) and tests/wp4 t2 (stable night via sleep) pass with `G.sleep()` → `G.rest()` adapters if needed; errors = 0.

---

## 4. Integration (after both branches)
1. Merge `wpn`, then `rst`. The only expected touch points are the `// RST` `structCam` line in WPN's camera block and the soft `wpnRest`/`wpnWake`/`wpnStowAll` calls.
2. Joint checks:
   - rest with the spear thrown out → it comes back overnight with the toast
   - rest with the torch lit → it is out, and the unlit torch lies by the bed and is back on the hip at wake
   - rest with the axe drawn → stowed in `prep`
   - aim held while pressing E at the bed → the aim is cancelled first
3. Run tests/final/play.json, wpn/*, rst/* and tests/wp4/t1,t2. Then take a final screenshot set and look at it by eye before reporting.

## 5. Known risks and fallbacks
- **Bone axes / FIT values:** expect 1-2 tuning passes per socket with `G.wpn.axes(true)` and `fitDump()`. Commit the tuned numbers into `FIT`.
- **Death01 last frame:** if it looks too dramatic (arms flung out), the arm overrides cover it. If the legs splay, also apply the `Idle_Loop` leg pose (`BONESETS` legs) rotated, or blend in `sitHold` legs at 0.3.
- **Sena side pose handedness:** if she faces away, negate `fwd` in `makeBasis` (spec 3.4). Verify with check 3's dot test.
- **Upper-body weight trick:** if the upper body jitters between loop and shot, raise the multiplier to 20. If the legs freeze, check that the `U` clips really contain no pelvis or leg tracks.
- **Viewmodel second pass:** if a post-processing composer is added later, render the viewmodel after it.
- **Performance:** IK and overrides only run for P and N. Villagers and kids get no overrides. The arc integrates at most 180 steps per frame, only while aiming.

