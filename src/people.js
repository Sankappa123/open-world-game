import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSpear, makeAxe } from './entities.js';

// Rigged human models, hair and animations: Quaternius (CC0). See public/models/CREDITS.txt.
const LOOPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', sneakIdle: 'Crouch_Idle_Loop', sneak: 'Crouch_Fwd_Loop', swim: 'Swim_Fwd_Loop', swimIdle: 'Swim_Idle_Loop', jump: 'Jump_Loop',
  // poses, picked with h.pose (work, sit, ride…)
  work: 'Fixing_Kneeling', push: 'Push_Loop', sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop', ride: 'Driving_Loop', talk: 'Idle_Talking_Loop', dance: 'Dance_Loop', torchIdle: 'Idle_Torch_Loop',
  limp: 'Zombie_Walk_Fwd_Loop', consume: 'Consume' };   // CMB (anims2): SURV limp, eat/drink
const SHOTS = { use: 'Interact', strike: 'Sword_Attack', jab: 'Punch_Jab', cross: 'Punch_Cross', pick: 'PickUp_Table', sitDown: 'Sitting_Enter', standUp: 'Sitting_Exit',
  // CMB combat v2: hit reactions, dodge roll, knockdown, guard break, getting up (anims2.glb = UAL2, CC0)
  hitChest: 'Hit_Chest', hitHead: 'Hit_Head', roll: 'Roll', knock: 'Hit_Knockback', stagger: 'Idle_Shield_Break', getUp: 'LayToIdle' };
// Extra clips, loaded for pose sampling only (no actions): see samplePose / applyPose.
const EXTRA = { death: 'Death01', ready: 'Sword_Idle', aimN: 'Pistol_Aim_Neutral', aimUp: 'Pistol_Aim_Up', spellIn: 'Spell_Simple_Enter', spellShot: 'Spell_Simple_Shoot', torchHold: 'Idle_Torch_Loop', sitHold: 'Sitting_Idle_Loop',
  block: 'Sword_Block' };   // CMB: the guard, sampled mid-clip as an upper-body override
// WPN upper-body variants: only spine/arms/head tracks, so the legs keep walking under a swing (see h.animate).
const UPPER = { strikeU: 'Sword_Attack', jabU: 'Punch_Jab', crossU: 'Punch_Cross', useU: 'Interact', throwU: 'Spell_Simple_Shoot', pickU: 'PickUp_Table',
  swordA: 'Sword_Regular_A', swordB: 'Sword_Regular_B', swordC: 'Sword_Regular_C', hookU: 'Melee_Hook', overU: 'OverhandThrow' };   // CMB combos (anims2)
const PACE = { walk: 1.6, run: 3.6, sprint: 6.2, sneak: 1.4, swim: 1.7 };   // metres per second each clip is authored for
const lib = {};

// WPN sockets: where each carried thing sits. Slot -> bone. 'low' is a variant of the right hand (one-handed carry).
const SLOT_BONE = { hand: 'hand_r', handL: 'hand_l', back: 'spine_03', hipL: 'pelvis', hipR: 'pelvis' };
const SLOT_SOCK = { low: 'hand' };
// Mesh transform inside each socket (p metres, r Euler XYZ radians, s scale). Bone frames: spine_03 and pelvis are
// about x = the body's left, y = up, z = forward; hand_r/hand_l: y runs along the fingers, z out of the thumb side
// of the fist, the closed-finger grip centre is about (∓0.034, 0.1, 0). Tuned by eye (G.wpn.fit / fitDump / axes).
// Sheathed things are drawn at scale <= 0.95 and grow to 1 on the draw (the "Valhalla trick").
export const FIT = {
  spear: { back: { p: [-0.09, 0.198, -0.221], r: [-1.8, -0.442, 0.219], s: 0.92 },   // diagonal: tip over the right shoulder, butt by the left hip
    hand: { p: [-0.034, 0.182, 0.34], r: [-0.243, 0, 0], s: 1 },                       // fist 0.35 m behind the balance point
    low: { p: [-0.034, 0.12, 0.1], r: [-0.8, 0, 0], s: 1 } },                          // sprint / one-handed: tip pitched down and forward
  axe: { hipL: { p: [0.19, 0.054, 0.014], r: [1.676, 0.011, -0.225], s: 0.95 },             // head down by the left thigh, haft end up at the belt
    hand: { p: [-0.034, 0.093, 0.02], r: [-0.243, 0, -3.142], s: 1 } },                // edge toward the knuckles, head 0.45 m out
  torch: { hipR: { p: [0.126, -0.247, -0.053], r: [-1.714, -0.613, 0.198], s: 1 },     // tucked in the back of the belt, head up behind the right hip
    handL: { p: [0.036, 0.1, -0.02], r: [-0.243, 0.01, 0], s: 1 } },                   // flame up out of the thumb side of the fist
  basket: { back: { p: [0, -0.1, -0.21], r: [0.12, 0, 0], s: 1 } },                     // Sena's carry basket, mid-back
};
const _fq = new THREE.Quaternion(), _fe = new THREE.Euler();
const fitOf = (kind, slot, h) => h?.fitAdj?.[kind]?.[slot] || FIT[kind]?.[slot] || null;

export async function loadPeople() {
  const loader = new GLTFLoader();
  const load = (f) => loader.loadAsync('/models/' + f);
  const [male, female, hairM, beard, hairF, buns, buzz, anims, anims2] = await Promise.all(
    ['male.gltf', 'female.gltf', 'hair_simpleparted.gltf', 'hair_beard.gltf', 'hair_long.gltf', 'hair_buns.gltf', 'hair_buzzed.gltf', 'anims.glb', 'anims2.glb']
      .map((f) => (f === 'anims2.glb' ? load(f).catch((e) => { console.warn('anims2.glb not loaded', e); return { scene: null, animations: [] }; }) : load(f))));   // CMB: UAL2 clips (same rig)
  const tl = new THREE.TextureLoader();
  const skin = (f) => { const t = tl.load('/models/' + f); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
  Object.assign(lib, { male, female, hair: { parted: hairM, beard, long: hairF, buns, buzz }, light: { male: skin('male_light.jpg'), female: skin('female_light.jpg') } });

  // Keep rotations only (so each body keeps its own proportions) plus the hip height, scaled per body.
  const refHip = anims.scene.getObjectByName('pelvis').position.length();
  const refHip2 = anims2.scene?.getObjectByName('pelvis')?.position.length() || refHip;   // CMB: anims2 has its own hip height
  const srcOf = (name) => { const a = anims.animations.find((c) => c.name === name); if (a) return [a, refHip]; const b = anims2.animations.find((c) => c.name === name); return b ? [b, refHip2] : [null, refHip]; };
  lib.clips = {};
  for (const who of ['male', 'female']) {
    const hip = lib[who].scene.getObjectByName('pelvis').position.length();
    const bonesIn = new Set(); lib[who].scene.traverse((o) => { if (o.name) bonesIn.add(o.name); });
    const build = (key, name) => {                    // rotations (bones the body has) + the pelvis height, scaled per body
      const [src, ref] = srcOf(name);
      if (!src) { console.warn('Missing animation clip', name); return null; }
      const k = hip / ref, tracks = [];
      for (const t of src.tracks) {
        const bone = t.name.split('.')[0];
        if (!bonesIn.has(bone)) continue;
        if (t.name.endsWith('.quaternion')) tracks.push(t.clone());
        else if (t.name === 'pelvis.position') { const c = t.clone(); c.values = c.values.map((v) => v * k); tracks.push(c); }
      }
      return new THREE.AnimationClip(key, src.duration, tracks);
    };
    lib.clips[who] = {};
    for (const [key, name] of Object.entries({ ...LOOPS, ...SHOTS, ...EXTRA })) { const c = build(key, name); if (c) lib.clips[who][key] = c; }
    for (const [key, name] of Object.entries(UPPER)) {   // WPN: upper body only, rotations only
      const base = lib.clips[who][Object.keys(SHOTS).find((k) => SHOTS[k] === name) || Object.keys(EXTRA).find((k) => EXTRA[k] === name)] || build(key, name);   // CMB: anims2-only bases
      if (!base) continue;
      lib.clips[who][key] = new THREE.AnimationClip(key, base.duration, base.tracks.filter((t) => t.name.endsWith('.quaternion') && BONESETS.upper(t.name.split('.')[0])).map((t) => t.clone()));
    }
  }
}

export function makeHuman({ female = false, light = false, tint = 0xffffff, hair = female ? 'long' : 'parted', beard = !female, hairColor = 0x6a5140, scale = 1 } = {}) {
  const who = female ? 'female' : 'male';
  const model = SkeletonUtils.clone(lib[who].scene);
  const root = new THREE.Group();
  root.add(model);
  let body = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    o.material = o.material.clone();
    if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o;
  });
  model.traverse((o) => { if (o.isSkinnedMesh && o !== body && /hair/i.test(o.material.name)) o.material.color.set(hairColor); });
  if (light) body.material.map = lib.light[who];
  body.material.color.set(tint);
  body.material.roughness = 1;
  const bones = Object.fromEntries(body.skeleton.bones.map((b) => [b.name, b]));

  for (const name of [hair, beard && 'beard']) {
    if (!name) continue;
    let src = null;
    lib.hair[name].scene.traverse((o) => { if (o.isSkinnedMesh) src = o; });
    const m = new THREE.SkinnedMesh(src.geometry, src.material.clone());
    m.material.color.set(hairColor);
    m.castShadow = true; m.frustumCulled = false;
    body.parent.add(m);
    m.bind(new THREE.Skeleton(src.skeleton.bones.map((b) => bones[b.name]), src.skeleton.boneInverses), src.bindMatrix);
  }

  // WPN sockets: the right hand (h.grip is an alias), the left hand, the back (spine_03) and both hips (pelvis).
  const sock = {};
  for (const [slot, b] of Object.entries(SLOT_BONE)) { sock[slot] = new THREE.Group(); sock[slot].name = 'sock_' + slot; bones[b].add(sock[slot]); }
  const grip = sock.hand;
  const spear = makeSpear(), axe = makeAxe();
  spear.userData.kind = 'spear'; axe.userData.kind = 'axe';
  spear.visible = axe.visible = false;
  grip.add(spear, axe);
  root.scale.setScalar(scale);

  const mixer = new THREE.AnimationMixer(model);
  const act = {}, w = {};
  const clips = lib.clips[who];
  const ONCE = [...Object.keys(SHOTS), ...Object.keys(UPPER)];
  for (const key in LOOPS) { if (!clips[key]) continue; act[key] = mixer.clipAction(lib.clips[who][key]); act[key].play(); act[key].setEffectiveWeight(key === 'idle' ? 1 : 0); w[key] = key === 'idle' ? 1 : 0; }
  for (const key of ONCE) { if (!clips[key]) continue; act[key] = mixer.clipAction(lib.clips[who][key]); act[key].setLoop(THREE.LoopOnce); act[key].clampWhenFinished = false; }
  for (const key in act) act[key].time = Math.random() * 0.5;
  let shot = null, shotW = 0, shotKey = null, fading = null;

  // pose: a loop that overrides the movement state; straddle spreads the legs (riding behind); lie is read by settle() in main
  const h = { root, spear, axe, grip, sock, bones, who, crouch: 0, pose: null, straddle: false, lie: false, has: (k) => !!act[k], overrides: [], blends: [], gripR: 0, gripL: 0 };
  // Bone overrides run after mixer.update, sorted by order (10 body, 15 stance, 20 fingers, 30 IK, 40 additive).
  h.removeOverride = (id) => { const i = h.overrides.findIndex((o) => o.id === id); if (i >= 0) h.overrides.splice(i, 1); };
  h.addOverride = (id, order, fn) => { h.removeOverride(id); h.overrides.push({ id, order, fn }); h.overrides.sort((a, b) => a.order - b.order); };
  // timeScale is optional (default 1.5 for 'use', 1.7 otherwise). Keys ending in U are upper-body only.
  h.swing = (kind = 'use', timeScale) => {
    if (!act[kind]) return;
    if (shot && shot !== act[kind]) fading = shot;
    shot = act[kind]; shotKey = kind;
    for (const key of ONCE) if (act[key] && act[key] !== fading) act[key].stop();
    shot.reset(); shot.timeScale = timeScale ?? (kind === 'use' || kind === 'useU' ? 1.5 : 1.7); shot.play();
  };
  // The running one-shot and its blend weight (0..1): main uses it to fade stance overrides under a swing.
  h.shotKey = () => (shot ? shotKey : null);
  h.shotW = () => shotW;
  h.shotT = () => (shot ? shot.time / shot.getClip().duration : 1);
  // WPN: move a carried mesh into a socket. attach() keeps the world transform; it then eases into its FIT spot
  // over `blend` seconds (snaps when 0). slot may be 'low' (a right-hand variant). fit overrides FIT for this call.
  h.place = (mesh, slot, blend = 0, fit = null) => {
    const sk = sock[SLOT_SOCK[slot] || slot];
    if (!sk) return;
    const f = fit || fitOf(mesh.userData.kind, slot, h);
    if (mesh.parent !== sk) { if (mesh.parent) sk.attach(mesh); else sk.add(mesh); }
    mesh.userData.slot = slot;
    const i = h.blends.findIndex((b) => b.m === mesh); if (i >= 0) h.blends.splice(i, 1);
    if (!f) return;
    const q = _fq.setFromEuler(_fe.set(f.r[0], f.r[1], f.r[2])).clone(), s = f.s ?? 1;
    if (blend > 0) h.blends.push({ m: mesh, t: 0, dur: blend, p0: mesh.position.clone(), q0: mesh.quaternion.clone(), s0: mesh.scale.x, p1: new THREE.Vector3(...f.p), q1: q, s1: s });
    else { mesh.position.set(...f.p); mesh.quaternion.copy(q); mesh.scale.setScalar(s); }
  };
  h.slotOf = (mesh) => (mesh.parent && mesh.parent.name.startsWith('sock_') ? mesh.userData.slot : null);
  // Closed fists: Sword_Idle fingers on the right, Idle_Torch_Loop fingers on the left, weighted by gripR / gripL.
  h.fist = { r: samplePose(who, 'ready', 0, BONESETS.fingersR), l: samplePose(who, 'torchHold', 0, BONESETS.fingersL) };
  h.useGrip = () => h.addOverride('fingers', 20, (hh) => { applyPose(hh, hh.fist.r, hh.gripR); applyPose(hh, hh.fist.l, hh.gripL); });
  h.animate = (dt, speed, crouch = false, swim = false, air = false) => {
    const moving = speed > 0.1;
    const state = h.pose && act[h.pose] ? h.pose : air ? 'jump' : swim ? (moving ? 'swim' : 'swimIdle') : crouch ? (moving ? 'sneak' : 'sneakIdle') : !moving ? 'idle' : speed > 5.6 ? 'sprint' : speed > 2.4 ? 'run' : 'walk';
    h.crouch += ((crouch ? 1 : 0) - h.crouch) * Math.min(1, dt * 8);
    if (shot && (!shot.isRunning() || shot.time > shot.getClip().duration - 0.25)) { fading = shot; shot = null; }
    shotW += ((shot ? 1 : 0) - shotW) * Math.min(1, dt * 12);
    if (fading && (!fading.isRunning() || shotW < 0.01) && fading !== shot) { fading.stop(); fading = null; }
    // Upper-body shots: loops keep full weight; the shot gets weight W so it owns W/(W+1) of the upper body
    // (PropertyMixer normalises), while the legs (no shot tracks) stay 100% loop.
    const cur = shot || fading, upper = !!cur && (cur.getClip().name.endsWith('U') || !!UPPER[cur.getClip().name]);   // CMB: swordA/B/C are upper-body too
    const sw = upper ? Math.min(12, shotW / Math.max(0.001, 1 - shotW)) : shotW;
    for (const key in LOOPS) {
      if (!act[key]) continue;
      w[key] += ((key === state ? 1 : 0) - w[key]) * Math.min(1, dt * 9);
      act[key].setEffectiveWeight(w[key] * (upper ? 1 : 1 - shotW * 0.92));
    }
    for (const key of ONCE) act[key]?.setEffectiveWeight(act[key] === cur ? sw : 0);
    if (PACE[state]) act[state].timeScale = THREE.MathUtils.clamp(speed / PACE[state], 0.7, 1.5) * (h.back && state !== 'swim' ? -1 : 1);   // FPP: h.back plays the gait in reverse
    mixer.update(dt);
    if (h.pose === 'ride' || h.straddle) { bones.thigh_l.rotation.z += 0.45; bones.thigh_r.rotation.z -= 0.45; }
    for (let i = h.blends.length - 1; i >= 0; i--) {   // WPN socket blends (before the overrides, which may read them)
      const b = h.blends[i]; b.t += dt;
      const k = Math.min(1, b.t / b.dur), e = k * k * (3 - 2 * k);
      b.m.position.lerpVectors(b.p0, b.p1, e); b.m.quaternion.slerpQuaternions(b.q0, b.q1, e); b.m.scale.setScalar(b.s0 + (b.s1 - b.s0) * e);
      if (k >= 1) h.blends.splice(i, 1);
    }
    if (h.overrides.length) { root.updateMatrixWorld(true); for (const o of h.overrides) o.fn(h, dt); }
  };
  return h;
}

// A static pose from a clip: { q: {bone: Quaternion}, pelvis: Vector3|null }. t is clamped to the clip.
// who is 'male' | 'female' (h.who), or a human h.
export function samplePose(who, key, t = 0, filter = null) {
  if (typeof who === 'object') who = who.who;
  const clip = lib.clips?.[who]?.[key], out = { q: {}, pelvis: null };
  if (!clip) return out;
  for (const tr of clip.tracks) {
    const [bone, prop] = tr.name.split('.');
    if (filter && !filter(bone)) continue;
    const v = tr.createInterpolant().evaluate(Math.min(Math.max(0, t), clip.duration));
    if (prop === 'quaternion') out.q[bone] = new THREE.Quaternion().fromArray(v);
    else if (prop === 'position') out.pelvis = new THREE.Vector3().fromArray(v);
  }
  return out;
}
export function clipDuration(who, key) { if (typeof who === 'object') who = who.who; return lib.clips?.[who]?.[key]?.duration ?? 0; }
// Blend a sampled pose onto the live bones with weight w (0..1).
export function applyPose(h, pose, w, filter = null) {
  if (!(w > 0)) return;
  for (const b in pose.q) if (h.bones[b] && (!filter || filter(b))) h.bones[b].quaternion.slerp(pose.q[b], w);
  if (pose.pelvis && (!filter || filter('pelvis'))) h.bones.pelvis.position.lerp(pose.pelvis, w);
}
// Bone filters. Fingers are (thumb|index|middle|ring|pinky)_0[1-3]_[lr]; the _04_leaf tips are not animated.
const FINGER = /^(thumb|index|middle|ring|pinky)_0[1-3]_/;
export const BONESETS = {
  armR: (b) => /^(clavicle|upperarm|lowerarm|hand)_r$/.test(b), armL: (b) => /^(clavicle|upperarm|lowerarm|hand)_l$/.test(b),
  fingersR: (b) => FINGER.test(b) && b.endsWith('_r'), fingersL: (b) => FINGER.test(b) && b.endsWith('_l'),
  handR: (b) => b === 'hand_r' || (FINGER.test(b) && b.endsWith('_r')), handL: (b) => b === 'hand_l' || (FINGER.test(b) && b.endsWith('_l')),
  upper: (b) => !/^(root|pelvis|thigh|calf|foot|ball)/.test(b),
  lower: (b) => /^(pelvis|thigh|calf|foot|ball)/.test(b),
};

// Two-bone IK for an arm: put hand_<side> at world `target`, elbow bending toward world `pole`. w blends.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
function aimBone(bone, from, to, w) {   // rotate bone in world space so `from` turns to `to`
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_qw); bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.slerp(_qp.invert().multiply(_q.multiply(_qw)), w);
  bone.updateWorldMatrix(false, true);
}
export function ik2(h, side, target, pole, w = 1) {
  if (!(w > 0)) return;
  const A = h.bones['upperarm_' + side], B = h.bones['lowerarm_' + side], C = h.bones['hand_' + side];
  A.updateWorldMatrix(true, true);
  A.getWorldPosition(_a); B.getWorldPosition(_b); C.getWorldPosition(_c);
  const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
  _n.copy(target).sub(_a); const d = THREE.MathUtils.clamp(_n.length(), Math.max(0.05, Math.abs(la - lb) * 1.001), (la + lb) * 0.999); _n.normalize();
  const x = (la * la - lb * lb + d * d) / (2 * d), y = Math.sqrt(Math.max(0, la * la - x * x));
  _p.copy(pole).sub(_a); _p.addScaledVector(_n, -_p.dot(_n));
  if (_p.lengthSq() < 1e-8) { _p.copy(_b).sub(_a); _p.addScaledVector(_n, -_p.dot(_n)); }   // pole on the reach line: keep the current elbow plane
  _p.normalize();
  _e.copy(_a).addScaledVector(_n, x).addScaledVector(_p, y);
  aimBone(A, _f.copy(_b).sub(_a), _g.copy(_e).sub(_a), w);
  B.getWorldPosition(_b); C.getWorldPosition(_c);
  aimBone(B, _f.copy(_c).sub(_b), _g.copy(_a).addScaledVector(_n, d).sub(_b), w);
}
