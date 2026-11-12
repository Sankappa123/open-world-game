import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSpear, makeAxe } from './entities.js';

// Rigged human models, hair and animations: Quaternius (CC0). See public/models/CREDITS.txt.
const LOOPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', sneakIdle: 'Crouch_Idle_Loop', sneak: 'Crouch_Fwd_Loop', swim: 'Swim_Fwd_Loop', swimIdle: 'Swim_Idle_Loop', jump: 'Jump_Loop',
  // poses, picked with h.pose (work, sit, ride…)
  work: 'Fixing_Kneeling', push: 'Push_Loop', sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop', ride: 'Driving_Loop', talk: 'Idle_Talking_Loop', dance: 'Dance_Loop', torchIdle: 'Idle_Torch_Loop' };
const SHOTS = { use: 'Interact', strike: 'Sword_Attack', jab: 'Punch_Jab', cross: 'Punch_Cross', pick: 'PickUp_Table', sitDown: 'Sitting_Enter', standUp: 'Sitting_Exit' };
// Extra clips, loaded for pose sampling only (no actions): see samplePose / applyPose.
const EXTRA = { death: 'Death01', ready: 'Sword_Idle', aimN: 'Pistol_Aim_Neutral', aimUp: 'Pistol_Aim_Up', spellIn: 'Spell_Simple_Enter', spellShot: 'Spell_Simple_Shoot', torchHold: 'Idle_Torch_Loop', sitHold: 'Sitting_Idle_Loop' };
const PACE = { walk: 1.6, run: 3.6, sprint: 6.2, sneak: 1.4, swim: 1.7 };   // metres per second each clip is authored for
const lib = {};

export async function loadPeople() {
  const loader = new GLTFLoader();
  const load = (f) => loader.loadAsync('/models/' + f);
  const [male, female, hairM, beard, hairF, buns, buzz, anims] = await Promise.all(
    ['male.gltf', 'female.gltf', 'hair_simpleparted.gltf', 'hair_beard.gltf', 'hair_long.gltf', 'hair_buns.gltf', 'hair_buzzed.gltf', 'anims.glb'].map(load));
  const tl = new THREE.TextureLoader();
  const skin = (f) => { const t = tl.load('/models/' + f); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
  Object.assign(lib, { male, female, hair: { parted: hairM, beard, long: hairF, buns, buzz }, light: { male: skin('male_light.jpg'), female: skin('female_light.jpg') } });

  // Keep rotations only (so each body keeps its own proportions) plus the hip height, scaled per body.
  const refHip = anims.scene.getObjectByName('pelvis').position.length();
  lib.clips = {};
  for (const who of ['male', 'female']) {
    const k = lib[who].scene.getObjectByName('pelvis').position.length() / refHip;
    lib.clips[who] = {};
    for (const [key, name] of Object.entries({ ...LOOPS, ...SHOTS, ...EXTRA })) {
      const src = anims.animations.find((a) => a.name === name);
      if (!src) { console.warn('Missing animation clip', name); continue; }
      const tracks = [];
      for (const t of src.tracks) {
        if (t.name.endsWith('.quaternion')) tracks.push(t.clone());
        else if (t.name === 'pelvis.position') { const c = t.clone(); c.values = c.values.map((v) => v * k); tracks.push(c); }
      }
      lib.clips[who][key] = new THREE.AnimationClip(key, src.duration, tracks);
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

  // Tools ride on the right hand.
  const grip = new THREE.Group();
  bones.hand_r.add(grip);
  const spear = makeSpear(), axe = makeAxe();
  spear.visible = axe.visible = false;
  grip.add(spear, axe);
  root.scale.setScalar(scale);

  const mixer = new THREE.AnimationMixer(model);
  const act = {}, w = {};
  const clips = lib.clips[who];
  for (const key in LOOPS) { if (!clips[key]) continue; act[key] = mixer.clipAction(lib.clips[who][key]); act[key].play(); act[key].setEffectiveWeight(key === 'idle' ? 1 : 0); w[key] = key === 'idle' ? 1 : 0; }
  for (const key in SHOTS) { if (!clips[key]) continue; act[key] = mixer.clipAction(lib.clips[who][key]); act[key].setLoop(THREE.LoopOnce); act[key].clampWhenFinished = false; }
  for (const key in act) act[key].time = Math.random() * 0.5;
  let shot = null, shotW = 0;

  // pose: a loop that overrides the movement state; straddle spreads the legs (riding behind); lie is read by settle() in main
  const h = { root, spear, axe, grip, bones, who, crouch: 0, pose: null, straddle: false, lie: false, has: (k) => !!act[k], overrides: [] };
  // Bone overrides run after mixer.update, sorted by order (10 body, 15 stance, 20 fingers, 30 IK, 40 additive).
  h.removeOverride = (id) => { const i = h.overrides.findIndex((o) => o.id === id); if (i >= 0) h.overrides.splice(i, 1); };
  h.addOverride = (id, order, fn) => { h.removeOverride(id); h.overrides.push({ id, order, fn }); h.overrides.sort((a, b) => a.order - b.order); };
  h.swing = (kind = 'use') => {
    if (!act[kind]) return;
    shot = act[kind];
    for (const key in SHOTS) act[key]?.stop();
    shot.reset(); shot.timeScale = kind === 'use' ? 1.5 : 1.7; shot.play();
  };
  h.animate = (dt, speed, crouch = false, swim = false, air = false) => {
    const moving = speed > 0.1;
    const state = h.pose && act[h.pose] ? h.pose : air ? 'jump' : swim ? (moving ? 'swim' : 'swimIdle') : crouch ? (moving ? 'sneak' : 'sneakIdle') : !moving ? 'idle' : speed > 5.6 ? 'sprint' : speed > 2.4 ? 'run' : 'walk';
    h.crouch += ((crouch ? 1 : 0) - h.crouch) * Math.min(1, dt * 8);
    if (shot && (!shot.isRunning() || shot.time > shot.getClip().duration - 0.25)) shot = null;
    shotW += ((shot ? 1 : 0) - shotW) * Math.min(1, dt * 12);
    for (const key in LOOPS) {
      if (!act[key]) continue;
      w[key] += ((key === state ? 1 : 0) - w[key]) * Math.min(1, dt * 9);
      act[key].setEffectiveWeight(w[key] * (1 - shotW * 0.92));
    }
    for (const key in SHOTS) act[key]?.setEffectiveWeight(act[key] === shot ? shotW : 0);
    if (PACE[state]) act[state].timeScale = THREE.MathUtils.clamp(speed / PACE[state], 0.7, 1.5);
    mixer.update(dt);
    if (h.pose === 'ride' || h.straddle) { bones.thigh_l.rotation.z += 0.45; bones.thigh_r.rotation.z -= 0.45; }
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
  if (_p.lengthSq() < 1e-8) _p.copy(_b).sub(_a).addScaledVector(_n, -_b.clone().sub(_a).dot(_n));
  _p.normalize();
  _e.copy(_a).addScaledVector(_n, x).addScaledVector(_p, y);
  aimBone(A, _f.copy(_b).sub(_a), _g.copy(_e).sub(_a), w);
  B.getWorldPosition(_b); C.getWorldPosition(_c);
  aimBone(B, _f.copy(_c).sub(_b), _g.copy(_a).addScaledVector(_n, d).sub(_b), w);
}
