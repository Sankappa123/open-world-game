import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSpear, makeAxe } from './entities.js';
import { loadGltf } from './util.js';

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
  axe: { hipL: { p: [0.155, 0.048, -0.08], r: [1.75, 0.36, -0.26], s: 0.95 },              // head down outside and behind the left thigh (WH: 0.14 m clear of the leg at walk and sprint), haft end up at the belt
    hand: { p: [-0.034, 0.093, 0.02], r: [-0.243, 0, -3.142], s: 1 } },                // edge toward the knuckles, head 0.45 m out
  torch: { hipR: { p: [0.126, -0.247, -0.053], r: [-1.714, -0.613, 0.198], s: 1 },     // tucked in the back of the belt, head up behind the right hip
    handL: { p: [0.036, 0.1, -0.02], r: [-0.243, 0.01, 0], s: 1 } },                   // flame up out of the thumb side of the fist
  basket: { back: { p: [0, -0.1, -0.21], r: [0.12, 0, 0], s: 1 } },                     // Sena's carry basket, mid-back
};
const _fq = new THREE.Quaternion(), _fe = new THREE.Euler();
const fitOf = (kind, slot, h) => h?.fitAdj?.[kind]?.[slot] || FIT[kind]?.[slot] || null;

export async function loadPeople() {
  const load = (f) => loadGltf('/models/' + f);   // SAVE-PERF retry (textures too)
  const [male, female, hairM, beard, hairF, buns, buzz, anims, anims2] = await Promise.all(
    ['male.gltf', 'female.gltf', 'hair_simpleparted.gltf', 'hair_beard.gltf', 'hair_long.gltf', 'hair_buns.gltf', 'hair_buzzed.gltf', 'anims.glb', 'anims2.glb']
      .map((f) => (f === 'anims2.glb' ? load(f).catch((e) => { console.warn('anims2.glb not loaded', e); return { scene: null, animations: [] }; }) : load(f))));   // CMB: UAL2 clips (same rig)
  const tl = new THREE.TextureLoader();
  const skin = (f) => { const t = tl.load('/models/' + f); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
  Object.assign(lib, { male, female, hair: { parted: hairM, beard, long: hairF, buns, buzz }, light: { male: skin('male_light.jpg'), female: skin('female_light.jpg') } });
  lib.childSkin = childSkin('/models/male_light.jpg');   // CHILD: a child's face (no stubble, soft brows) on the male base mesh

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

export function makeHuman({ female = false, light = false, tint = 0xffffff, hair = female ? 'long' : 'parted', beard = !female, hairColor = 0x6a5140, scale = 1, child = null, dress = true } = {}) {   // ADULT-DRESS: dress true | hide colour | false
  // CHILD: children (Lio, Pell, the village children) are built on the MALE base mesh (flat chest, no adult female shape)
  // with child proportions from bone scales and a full tunic; see childBody below. The rig choice never follows `female`.
  if (child) { beard = false; light = true; }
  const who = female && !child ? 'female' : 'male';
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
  if (light) body.material.map = child ? lib.childSkin : lib.light[who];
  if (child) body.material.normalMap = null;                           // CHILD: no adult muscle / wrinkle relief
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
  const kid = child ? childBody(model, body, bones, CHILD[child] || CHILD.girl) : null;   // CHILD: proportions + clothes, before the scale
  const dObj = dress && typeof dress === 'object' ? dress : null;   // SENA-LOOK: { color, style: 'twopiece' }
  const clothes = !child && dress !== false ? adultDress(model, body, bones, who, dObj ? dObj.color : typeof dress === 'number' ? dress : who === 'female' ? 0x7d5c40 : 0x6a5038, dObj ? dObj.style : null) : null;   // ADULT-DRESS: never the base mesh's underwear
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
  const h = { root, spear, axe, grip, sock, bones, who, kid, clothes, crouch: 0, pose: null, straddle: false, lie: false, has: (k) => !!act[k] || !!lib.clips[who]?.[k], overrides: [], blends: [], gripR: 0, gripL: 0 };
  // Bone overrides run after mixer.update, sorted by order (10 body, 15 stance, 20 fingers, 30 IK, 40 additive).
  // CHILD: the clips' hip height, for the shorter legs; and a child's carriage: the chest eases back a little (the
  // tummy leads, not the chest), and the adult clips carry the head forward over the chest, which on a big child's head
  // reads as a stoop, so the neck and head tip back.
  if (clothes?.rig) h.overrides.push({ id: 'skirtRig', order: 98, fn: clothes.rig });   // SENA-LOOK r3: the skirt's drape bones, after every pose override
  // SENA-LOOK A3: lying down (h.laceW, set each frame by the lying pose in main) the strand keeps to her chest the way it
  // sits when she stands; it rode the neck bone, so with the head thrown back it stood up off her chest in a loop.
  const lace = clothes?.parts?.find((o) => o.name === 'senaLace');
  if (lace) h.overrides.push({ id: 'laceRest', order: 99, fn: (hh) => {
    const w = hh.laceW || 0; hh.laceW = 0;
    const base = lace.userData.base || _laceI;
    if (!(w > 0)) { lace.quaternion.copy(base); return; }
    const q0 = (lace.userData.q0 ||= samplePose(hh, 'idle', 0).q.neck_01); if (!q0 || !hh.bones.neck_01) return;
    lace.quaternion.copy(hh.bones.neck_01.quaternion).invert().multiply(q0); lace.quaternion.slerp(_laceI, 1 - w).multiply(base);
  } });
  if (kid) h.overrides.push({ id: 'childHip', order: 1, fn: (hh) => {
    hh.bones.pelvis.position.multiplyScalar(kid.legK);
    if (hh.kidLie) {                                                   // asleep: lying straight, legs together (under her own cover)
      for (const [b, q] of kid.restQ) hh.bones[b].quaternion.copy(q);
      // the feet relax: the toes fall forward toward the foot of the bed (in the bind pose they point straight up, and
      // the wrapped feet stood up under her cover). The turn's sign is found once, from where the toes go.
      _cq.setFromRotationMatrix(_cm.extractRotation(root.matrixWorld)); _cax.set(1, 0, 0).applyQuaternion(_cq);
      for (const sd of ['l', 'r']) {
        const f = hh.bones['foot_' + sd], t = hh.bones['ball_' + sd]; if (!f || !t) continue;
        if (!kid.footSign) { const y0 = t.getWorldPosition(_cv1).y; rotWorld(f, _cax, 0.3); const y1 = t.getWorldPosition(_cv1).y; f.quaternion.copy(kid.restQ.find(([b]) => b === 'foot_' + sd)[1]); kid.footSign = y1 < y0 ? 1 : -1; }
        rotWorld(f, _cax, 0.85 * kid.footSign);
      }
      return;
    }
    if (hh.lie || hh.pose === 'sit') return;
    _cq.setFromRotationMatrix(_cm.extractRotation(root.matrixWorld)); _cax.set(1, 0, 0).applyQuaternion(_cq);
    for (const [b, a] of [['spine_02', -0.03], ['spine_03', -0.03], ['neck_01', -0.24], ['Head', -0.08]]) rotWorld(hh.bones[b], _cax, a);
  } });
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
    // SENA-SIT A3 (content limit, verifier A3): the seated talking clip's gestures land on a woman's chest (Sena seemed to
    // cup her breast-band at the fire); a woman sits with her hands on her thighs (Sitting_Idle) instead
    const pz = h.pose === 'sitTalk' && who === 'female' ? 'sit' : h.pose;
    const state = pz && act[pz] ? pz : air ? 'jump' : swim ? (moving ? 'swim' : 'swimIdle') : crouch ? (moving ? 'sneak' : 'sneakIdle') : !moving ? 'idle' : speed > 5.6 ? 'sprint' : speed > 2.4 ? 'run' : 'walk';
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
    if ((h.pose === 'ride' || h.straddle) && !h.legIK) { bones.thigh_l.rotation.z += 0.45; bones.thigh_r.rotation.z -= 0.45; }   // WH: legIK riders get real leg IK instead
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
  ikChain(h.bones['upperarm_' + side], h.bones['lowerarm_' + side], h.bones['hand_' + side], target, pole, w);
}
// WH: the same solver for a leg (thigh, calf, foot): the rider's legs down the horse's sides.
export function ikLeg(h, side, target, pole, w = 1) {
  if (!(w > 0)) return;
  ikChain(h.bones['thigh_' + side], h.bones['calf_' + side], h.bones['foot_' + side], target, pole, w);
}
function ikChain(A, B, C, target, pole, w) {
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

// ---------- CHILD: children's bodies and clothes ----------
// GUARDRAIL (CLAUDE.md content limits): children are never sexualised or shown in revealing clothing. A child is the
// male base mesh (flat chest) with child proportions from per-bone scales (a big head, short neck, narrow shoulders,
// short limbs), a cleaned-up face texture, and a modest garment that covers the shoulders to the knees: a fitted tunic
// shell grown from the body's own skinned vertices (so it follows every animation), a rolled collar, a flared
// knee-length skinned skirt, and foot wraps. The base mesh's painted underwear is entirely under the tunic shell.
// The body itself is remodelled into a young child's (childGeo): slight soft limbs and a round, soft child's face.
// head/neck/arms/legs/spine: bone scales; legK also scales the clips' hip height (the 'childHip' override).
export const CHILD = {
  girl: { head: 1.52, headShape: [1.06, 0.97, 1.04], hand: 0.82, neck: 0.7, clav: 0.78, arms: 0.82, legs: 0.78, spine: 0.95, chest: 0.9, tunic: 0x9a5236, wrap: 0x5e4430, skirt: 1 },
  boy: { head: 1.46, headShape: [1.05, 0.97, 1.03], hand: 0.84, neck: 0.72, clav: 0.8, arms: 0.84, legs: 0.8, spine: 0.96, chest: 0.91, tunic: 0x6e6448, wrap: 0x4e3a28, skirt: 0.7 },
};
const _cv1 = new THREE.Vector3(), _cv2 = new THREE.Vector3(), _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cax = new THREE.Vector3(), _cq2 = new THREE.Quaternion(), _cq3 = new THREE.Quaternion();
function rotWorld(bone, axis, ang) {                                   // turn a bone about a world axis (children follow)
  bone.getWorldQuaternion(_cq2); bone.parent.getWorldQuaternion(_cq3);
  bone.quaternion.copy(_cq3.invert().multiply(_cq2.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang))));
  bone.updateWorldMatrix(false, true);
}
// Vertex normals averaged across UV seams (split vertices at one position), so a remodelled mesh shows no seam lines.
function weldNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal, acc = new Map(), q = 1e4 / Math.max(1e-6, g.boundingSphere?.radius || 1);
  const k = (i) => Math.round(p.getX(i) * q) + ',' + Math.round(p.getY(i) * q) + ',' + Math.round(p.getZ(i) * q);
  for (let i = 0; i < p.count; i++) { const kk = k(i); let a = acc.get(kk); if (!a) acc.set(kk, (a = [0, 0, 0])); a[0] += nr.getX(i); a[1] += nr.getY(i); a[2] += nr.getZ(i); }
  for (let i = 0; i < p.count; i++) { const a = acc.get(k(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; nr.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  nr.needsUpdate = true;
}
function childBody(model, body, bones, cfg) {
  model.updateMatrixWorld(true);
  const bw = (n) => bones[n].getWorldPosition(new THREE.Vector3());
  const bind = { spine3: bw('spine_03').y, foot: bw('foot_l').y, pelvis: bw('pelvis'), spine1: bw('spine_01').y, thigh: bw('thigh_l').y, knee: bw('calf_l').y };
  const b0 = Object.fromEntries(Object.keys(bones).map((k) => [k, bw(k)]));   // the unscaled bind pose
  const g0 = body.geometry, pos = g0.attributes.position, si = g0.attributes.skinIndex, sw = g0.attributes.skinWeight;
  const names = body.skeleton.bones.map((b) => b.name), n = pos.count, main = new Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bi = 0;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
    main[i] = names[bi] || '';
  }
  const headC = (() => {                                              // the head's centre relative to its bone (bind pose)
    const hb = body.skeleton.bones.indexOf(bones.Head);
    const c = new THREE.Vector3(); let m = 0;
    for (let i = 0; i < n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hb) w += sw.getComponent(i, k); if (w < 0.9) continue; c.add(_cv1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld)); m++; }
    return m ? c.divideScalar(m).sub(bw('Head')) : null;
  })();
  // 0. the child's own body shape (shared per child type): slight soft limbs, a young child's face (childGeo)
  const cache = (cfg._geo ||= {});
  const cg = cache.body ||= childGeo(g0, main, model, body, b0);
  body.geometry = cg;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (/eyebrow/i.test(o.name)) o.visible = false;                   // no adult brows: faint ones are painted in the skin (childSkin)
    if (/^eyes$/i.test(o.name) && cg.userData.eyes) o.geometry = cg.userData.eyes;   // the larger eyes
  });
  // No shadows received on the bare skin. The sun's large normal bias (world.js, 0.4 m) moves each shadow lookup 40 cm
  // out along the normal, which on the child's enlarged head lands inside the head's own shadow: hard, dithered dark
  // patches over the brow, round the eyes and down a cheek (read as bruises), and a shadowed neck under a pale face.
  // The skin is evenly lit at every hour; the clothes still take shadows.
  model.traverse((o) => { if (o.isSkinnedMesh && (o === body || /^eyes$/i.test(o.name))) o.receiveShadow = false; });
  // 1. proportions. Scales cascade down the chain, so the head's own scale is divided by the neck's.
  const set = (n, s) => { if (bones[n]) Array.isArray(s) ? bones[n].scale.set(...s) : bones[n].scale.setScalar(s); };
  set('spine_01', cfg.spine);
  set('spine_03', cfg.chest);                                         // a slighter ribcage (uniform: a non-uniform parent scale shears the head)
  set('neck_01', cfg.neck / cfg.chest); set('Head', cfg.headShape.map((k) => k * cfg.head / cfg.neck));   // a rounder, shorter face (Head has no child bones: no shear)
  set('hand_l', cfg.hand); set('hand_r', cfg.hand);
  for (const sd of ['l', 'r']) { set('clavicle_' + sd, cfg.clav / cfg.chest); set('upperarm_' + sd, cfg.arms / cfg.clav); set('thigh_' + sd, cfg.legs); }   // narrow shoulders, short limbs
  bones.pelvis.position.multiplyScalar(cfg.legs);                    // the rest pose stands on the shorter legs too
  model.updateMatrixWorld(true);
  // the head grows about its bone (the base of the skull), which pushed the face forward over the chest (a stoop):
  // slide the Head bone back so the larger head sits balanced over the neck
  if (headC) {
    const h1 = bones.Head.getWorldPosition(new THREE.Vector3()), k = cfg.head * cfg.spine - 1;
    h1.z -= headC.z * k * 1.15;
    bones.Head.position.copy(bones.neck_01.worldToLocal(h1));
    model.updateMatrixWorld(true);
  }

  // 2. the tunic shell and the foot wraps: copies of the child body mesh, pushed out along the normals, keeping only the
  // triangles whose vertices are mostly driven by the covered bones. They share the body's skeleton and skin weights.
  body.updateWorldMatrix(true, false);
  const wy = new Float32Array(n);                                     // bind-pose world height of each vertex
  for (let i = 0; i < n; i++) wy[i] = _cv1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld).y;
  const unit = 1 / _cv2.setFromMatrixScale(body.matrixWorld).x;      // world metres -> mesh units
  const TUNIC = /^(pelvis|spine_0[123]|clavicle_[lr]|upperarm_[lr]|thigh_[lr])$/;
  // Cloth, not skin: the shell is welded (UV seams), Taubin-smoothed (the muscle sculpt and grooves are filled in, no
  // shrinking), then held at least `off` out from the body everywhere; the cut edges stay put.
  // The geometries depend only on the child type, so they are built once per type and shared (CHILD[type]._geo).
  const shell = (key, keep, off, color, passes = 0, hang = null) => {
    let g = cache[key];
    if (!g) {
    g = cg.clone(); const p = g.attributes.position, nr = g.attributes.normal;
    const src = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i), idx = [];
    for (let t = 0; t < src.length; t += 3) if (keep(src[t]) && keep(src[t + 1]) && keep(src[t + 2])) idx.push(src[t], src[t + 1], src[t + 2]);
    const q = 0.0005 * unit, gid = new Int32Array(n).fill(-1), key = new Map(); let G = 0;
    for (const i of idx) if (gid[i] < 0) { const k = Math.round(p.getX(i) / q) + ',' + Math.round(p.getY(i) / q) + ',' + Math.round(p.getZ(i) / q); let v = key.get(k); if (v === undefined) { v = G++; key.set(k, v); } gid[i] = v; }
    const gp = new Float64Array(G * 3), gn = new Float64Array(G * 3), go = new Float64Array(G), cnt = new Float64Array(G), nb = Array.from({ length: G }, () => new Set()), edge = new Map();
    for (let i = 0; i < n; i++) { const v = gid[i]; if (v < 0 || cnt[v]) { if (v >= 0) { gn[v * 3] += nr.getX(i); gn[v * 3 + 1] += nr.getY(i); gn[v * 3 + 2] += nr.getZ(i); } continue; } cnt[v] = 1; gp[v * 3] = p.getX(i); gp[v * 3 + 1] = p.getY(i); gp[v * 3 + 2] = p.getZ(i); gn[v * 3] = nr.getX(i); gn[v * 3 + 1] = nr.getY(i); gn[v * 3 + 2] = nr.getZ(i); go[v] = off(i) * unit; }
    for (let v = 0; v < G; v++) { const l = Math.hypot(gn[v * 3], gn[v * 3 + 1], gn[v * 3 + 2]) || 1; gn[v * 3] /= l; gn[v * 3 + 1] /= l; gn[v * 3 + 2] /= l; }
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = gid[idx[t + e]], b = gid[idx[t + (e + 1) % 3]]; if (a === b) continue;
      nb[a].add(b); nb[b].add(a); const k = a < b ? a + ':' + b : b + ':' + a; edge.set(k, (edge.get(k) || 0) + 1);
    }
    const fixed = new Uint8Array(G); for (const [k, c] of edge) if (c === 1) { const [a, b] = k.split(':'); fixed[+a] = fixed[+b] = 1; }
    const base = gp.slice(), cur = gp.slice(), tmp = new Float64Array(G * 3);
    for (let v = 0; v < G; v++) for (let c = 0; c < 3; c++) cur[v * 3 + c] += gn[v * 3 + c] * go[v];
    for (let it = 0; it < passes * 2; it++) {
      const lam = it % 2 ? -0.53 : 0.5;
      for (let v = 0; v < G; v++) {
        if (fixed[v] || !nb[v].size) { tmp.set(cur.subarray(v * 3, v * 3 + 3), v * 3); continue; }
        let x = 0, y = 0, z = 0; for (const u of nb[v]) { x += cur[u * 3]; y += cur[u * 3 + 1]; z += cur[u * 3 + 2]; }
        const k = nb[v].size; tmp[v * 3] = cur[v * 3] + lam * (x / k - cur[v * 3]); tmp[v * 3 + 1] = cur[v * 3 + 1] + lam * (y / k - cur[v * 3 + 1]); tmp[v * 3 + 2] = cur[v * 3 + 2] + lam * (z / k - cur[v * 3 + 2]);
      }
      cur.set(tmp);
    }
    for (let v = 0; v < G; v++) {                                     // never closer to the body than its offset
      const d = (cur[v * 3] - base[v * 3]) * gn[v * 3] + (cur[v * 3 + 1] - base[v * 3 + 1]) * gn[v * 3 + 1] + (cur[v * 3 + 2] - base[v * 3 + 2]) * gn[v * 3 + 2];
      if (d < go[v]) for (let c = 0; c < 3; c++) cur[v * 3 + c] += gn[v * 3 + c] * (go[v] - d);
    }
    if (hang) {                                                       // world-space shaping (the smock front), then back to mesh space
      const inv = new THREE.Matrix4().copy(body.matrixWorld).invert(), nm = new THREE.Matrix3().getNormalMatrix(body.matrixWorld), wn = new THREE.Vector3(), W = [];
      for (let v = 0; v < G; v++) W.push(_cv1.set(cur[v * 3], cur[v * 3 + 1], cur[v * 3 + 2]).applyMatrix4(body.matrixWorld).clone());
      const ctx = hang.prep(W);
      for (let v = 0; v < G; v++) {
        wn.set(gn[v * 3], gn[v * 3 + 1], gn[v * 3 + 2]).applyMatrix3(nm).normalize();
        if (!fixed[v] && hang.fn(W[v], wn, ctx, v)) { W[v].applyMatrix4(inv); cur[v * 3] = W[v].x; cur[v * 3 + 1] = W[v].y; cur[v * 3 + 2] = W[v].z; }
      }
    }
    for (let i = 0; i < n; i++) { const v = gid[i]; if (v >= 0) p.setXYZ(i, cur[v * 3], cur[v * 3 + 1], cur[v * 3 + 2]); }
    g.setIndex(idx); g.computeBoundingSphere(); weldNormals(g);
    cache[key] = g;
    }
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, map: weave(), side: THREE.DoubleSide }));   // both sides: no see-through at the cut edges
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale);
    body.parent.add(m); m.bind(body.skeleton, body.bindMatrix);
    return m;
  };
  // the smock front: from the most forward point of the chest the cloth falls straight down (a slight A-line) past the
  // waist to the hips, so the front is one flat, straight line: no waist shaping, no curve above a waist, no belt
  const yC = (b0.spine_03.y + b0.neck_01.y) / 2, yB = bind.thigh;  // bind (unscaled) heights: the shell is built in the bind shape
  const smock = { prep: (W) => { let zM = -1e9, yM = yC; for (const w of W) if (w.y < yC && w.y > yB && Math.abs(w.x) < 0.1 && w.z > zM) { zM = w.z; yM = w.y; } return [zM, yM]; },
    fn: (w, wn, [zM, yM]) => { if (w.y > yM || w.y < yB || wn.z < 0.1 || Math.abs(w.x) > 0.17) return false; const t = Math.min(1, (yM - w.y) / 0.03), zt = zM + (yM - w.y) * 0.05 - Math.max(0, Math.abs(w.x) - 0.06) * 0.25; if (w.z >= zt) return false; w.z += (zt - w.z) * t * Math.min(1, wn.z * 2); return true; } };
  const tunic = shell('tunic', (i) => TUNIC.test(main[i]), (i) => (/^thigh/.test(main[i]) ? 0.008 : /^upperarm/.test(main[i]) ? 0.014 : 0.02), cfg.tunic, 30, smock);
  const wrapTop = bind.foot + 0.1;
  const wraps = shell('wraps', (i) => /^(foot|ball)_/.test(main[i]) || (/^calf_/.test(main[i]) && wy[i] < wrapTop), () => 0.01, cfg.wrap, 3);
  tunic.name = 'childTunic'; wraps.name = 'childWraps';

  // 3. the hems: a soft rolled band over each of the tunic's open cut edges (the neck, and both short sleeves), skinned
  // like the tunic edge under it, so no cut edge shows its triangle steps (a ragged, torn-looking hem)
  const tg = tunic.geometry, tp = tg.attributes.position, tIdx = tg.index.array, edgeN = new Map();
  for (let t = 0; t < tIdx.length; t += 3) for (let e = 0; e < 3; e++) { const x = tIdx[t + e], y = tIdx[t + (e + 1) % 3]; const k = x < y ? x + ':' + y : y + ':' + x; edgeN.set(k, (edgeN.get(k) || 0) + 1); }
  const edgeV = []; { const seen = new Set(); for (const [k, c] of edgeN) if (c === 1) for (const i of k.split(':').map(Number)) if (!seen.has(i)) { seen.add(i); edgeV.push([new THREE.Vector3().fromBufferAttribute(tp, i).applyMatrix4(body.matrixWorld), i]); } }
  // band(key, ring, axis, e1, e2, th): ring = [[world pos, vertex]] round the axis; per bearing (about the axis, in the
  // e1/e2 plane) the edge's reach and its range along the axis, widened to the neighbouring bearings' extremes and then
  // smoothed, so the band covers every step of the cut
  const band = (key, ring, ax, e1, e2, th, shade) => {
    if (ring.length < 6) return null;
    const c = new THREE.Vector3(); for (const [v] of ring) c.add(v); c.divideScalar(ring.length);
    const SEGc = 36, BR = new Float64Array(SEGc), LO = new Float64Array(SEGc).fill(1e9), HI = new Float64Array(SEGc).fill(-1e9), NI = new Int32Array(SEGc).fill(-1), ND = new Float64Array(SEGc).fill(1e9), d3 = new THREE.Vector3();
    for (const [v, i] of ring) {
      d3.subVectors(v, c); const s = d3.dot(ax), p1 = d3.dot(e1), p2 = d3.dot(e2);
      const b = Math.atan2(p2, p1), k = ((Math.round(b / (Math.PI * 2) * SEGc) % SEGc) + SEGc) % SEGc, r = Math.hypot(p1, p2);
      BR[k] = Math.max(BR[k], r); LO[k] = Math.min(LO[k], s); HI[k] = Math.max(HI[k], s);
      const d = Math.abs(Math.atan2(Math.sin(b - k / SEGc * Math.PI * 2), Math.cos(b - k / SEGc * Math.PI * 2))); if (d < ND[k]) { ND[k] = d; NI[k] = i; }
    }
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < SEGc; k++) {   // fill empty bearings from their neighbours
      if (NI[k] >= 0) continue;
      for (let d = 1; d < SEGc / 2; d++) { const j = [(k + d) % SEGc, (k - d + SEGc) % SEGc].find((q) => NI[q] >= 0); if (j !== undefined) { BR[k] = BR[j]; LO[k] = LO[j]; HI[k] = HI[j]; NI[k] = NI[j]; break; } }
    }
    const widen = (A, f) => { const B = A.slice(); for (let k = 0; k < SEGc; k++) A[k] = f(B[(k + SEGc - 1) % SEGc], B[k], B[(k + 1) % SEGc]); };
    widen(BR, Math.max); widen(LO, Math.min); widen(HI, Math.max);
    const smooth = (A, it) => { for (let t = 0; t < it; t++) { const B = A.slice(); for (let k = 0; k < SEGc; k++) A[k] = (B[(k + SEGc - 1) % SEGc] + 2 * B[k] + B[(k + 1) % SEGc]) / 4; } };
    for (let k = 0; k < SEGc; k++) BR[k] = Math.max(BR[k], 0.03);
    smooth(BR, 3); smooth(LO, 3); smooth(HI, 3);
    let g = cache[key];
    if (!g) {
      const cv = [], cuv = [], csi = [], csw = [], cix = [], RAD = 8, inv = new THREE.Matrix4().copy(body.matrixWorld).invert(), L = new THREE.Vector3();
      for (let k = 0; k <= SEGc; k++) {
        const kk = k % SEGc, a = kk / SEGc * Math.PI * 2, o1 = Math.cos(a), o2 = Math.sin(a), lo = LO[kk] - 0.006, hi = Math.max(HI[kk], LO[kk] + 0.012) + 0.005, mid = (lo + hi) / 2, hh = (hi - lo) / 2;
        for (let r = 0; r <= RAD; r++) {                               // a rounded section: out over the cut and back in
          const b = (r / RAD) * Math.PI * 2, rr = BR[kk] - 0.002 + (Math.cos(b) * 0.5 + 0.5) * th, s = mid + Math.sin(b) * hh;
          L.copy(c).addScaledVector(ax, s).addScaledVector(e1, o1 * rr).addScaledVector(e2, o2 * rr).applyMatrix4(inv); cv.push(L.x, L.y, L.z); cuv.push(k / SEGc * 6, r / RAD);
          for (let q = 0; q < 4; q++) { csi.push(tg.attributes.skinIndex.getComponent(NI[kk], q)); csw.push(tg.attributes.skinWeight.getComponent(NI[kk], q)); }
        }
      }
      for (let k = 0; k < SEGc; k++) for (let r = 0; r < RAD; r++) { const a = k * (RAD + 1) + r, b = a + RAD + 1; cix.push(a, b, a + 1, a + 1, b, b + 1); }
      g = cache[key] = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(csi, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(csw, 4)); g.setIndex(cix); g.computeVertexNormals();
    }
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.tunic).multiplyScalar(shade), roughness: 1, metalness: 0, side: THREE.DoubleSide, map: weave() }));
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.name = key === 'collar' ? 'childCollar' : 'childCuff';
    m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale);
    body.parent.add(m); m.bind(body.skeleton, body.bindMatrix);
    return m;
  };
  const neckW = b0.neck_01;                                            // the cut edge's vertices around the neck (bind world)
  const collar = band('collar', edgeV.filter(([v]) => v.distanceTo(neckW) < 0.14 && Math.abs(v.x - neckW.x) < 0.11), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), 0.013, 0.82);
  const cuffs = ['l', 'r'].map((sd) => {                               // the short sleeves' hems, round the upper arm's axis
    const A = b0['upperarm_' + sd], B = b0['lowerarm_' + sd], ax = new THREE.Vector3().subVectors(B, A), len = ax.length(); ax.normalize();
    const e1 = new THREE.Vector3(0, 1, 0).addScaledVector(ax, -ax.y).normalize(), e2 = new THREE.Vector3().crossVectors(ax, e1);
    const d3 = new THREE.Vector3(), ring = edgeV.filter(([v]) => { d3.subVectors(v, A); const s = d3.dot(ax); return s > len * 0.3 && s < len * 1.1 && d3.addScaledVector(ax, -s).length() < 0.1; });
    return band('cuff_' + sd, ring, ax, e1, e2, 0.009, 0.86);
  });

  // 4. the skirt: an open, flared, elliptical tube from the waist to the knee. It is skinned: the top on the pelvis, the
  // lower sides partly on the thighs, so it swings with each stride and opens over a horse's back instead of the legs
  // pressing through it. Built in the child's (scaled) rest pose with its own bind inverses. Sized from the body's hips.
  const ext = (y0, y1) => {                                            // half-widths of the hips/waist band (bind pose)
    let rx = 0, rz0 = 1e9, rz1 = -1e9;
    for (let i = 0; i < n; i++) {
      if (wy[i] < y0 || wy[i] > y1 || !/^(pelvis|thigh_[lr]|spine_01)$/.test(main[i])) continue;
      _cv1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
      rx = Math.max(rx, Math.abs(_cv1.x - bind.pelvis.x)); rz0 = Math.min(rz0, _cv1.z); rz1 = Math.max(rz1, _cv1.z);
    }
    return [rx, (rz1 - rz0) / 2, (rz1 + rz0) / 2];
  };
  const hip = ext(bind.thigh - 0.06, bind.thigh + 0.02), waist = ext(bind.spine1 - 0.03, bind.spine1 + 0.03);
  const P0 = bw('pelvis'), yW = bw('spine_01').y - 0.02, yH = Math.min(P0.y - 0.04, bw('thigh_l').y - 0.03), yK = bw('calf_l').y + 0.03;
  const cz = hip[2], fl = cfg.skirt;
  const rings = [[yW, waist[0] + 0.02, waist[1] + 0.02], [yH, hip[0] + 0.05, hip[1] + 0.055]];
  for (let r = 1; r <= 4; r++) { const t = r / 4; rings.push([yH + (yK - yH) * t, hip[0] + 0.05 + (0.012 + 0.07 * fl) * t, hip[1] + 0.055 + (0.025 + 0.07 * fl) * t]); }
  const SEG = 32, vs = [], uv = [], ssi = [], ssw = [];
  const bi = (nm) => body.skeleton.bones.indexOf(bones[nm]), iP = bi('pelvis'), iL = bi('thigh_l'), iR = bi('thigh_r');
  const lSide = Math.sign(bw('thigh_l').x - P0.x) || 1;
  body.parent.updateMatrixWorld(true);
  for (const [y, rx, rz] of rings) for (let k = 0; k <= SEG; k++) {
    const a = (k / SEG) * Math.PI * 2, x = Math.sin(a) * rx, z = cz + Math.cos(a) * rz;
    const L = body.parent.worldToLocal(new THREE.Vector3(P0.x + x, y, z)); vs.push(L.x, L.y, L.z); uv.push(k / SEG * 3, (y - yK) * 6);
    const t = Math.max(0, Math.min(1, (yH - y) / (yH - yK))), f = Math.min(1, Math.abs(x) / rx * 1.5), wT = Math.pow(t, 0.9) * 0.82 * f;
    ssi.push(iP, Math.sign(x) === lSide ? iL : iR, 0, 0); ssw.push(1 - wT, wT, 0, 0);
  }
  const ix = [];
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < SEG; k++) { const a = r * (SEG + 1) + k, b = a + SEG + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
  const sg = cache.skirt || new THREE.BufferGeometry();
  if (!cache.skirt) { cache.skirt = sg; sg.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ssi, 4)); sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ssw, 4)); sg.setIndex(ix); sg.computeVertexNormals(); }
  const skirt = new THREE.SkinnedMesh(sg, new THREE.MeshStandardMaterial({ color: cfg.tunic, roughness: 1, metalness: 0, side: THREE.DoubleSide, map: weave() }));
  skirt.castShadow = true; skirt.receiveShadow = true; skirt.frustumCulled = false; skirt.name = 'childSkirt';
  body.parent.add(skirt); skirt.updateMatrixWorld(true);
  skirt.bind(new THREE.Skeleton(body.skeleton.bones));                // inverses from the child's own rest pose (now)
  const restQ = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'].map((b) => [b, bones[b].quaternion.clone()]);   // the bind pose: straight legs
  return { legK: cfg.legs, tunic, wraps, skirt, collar, cuffs, restQ };
}

// CHILD: the male base mesh remodelled into a young child's body (in the bind pose; the skin weights are kept, so every
// clip still drives it). Arms: drawn in toward the bone line (slight limbs) and smoothed (no sculpted biceps or forearm
// muscle). Calves: smoothed. Head: the adult features (brow ridge, cheekbones, the sharp nose, the jaw angle) are
// smoothed away, the lower face is shortened (a short chin; the eyes sit lower in the head), the cheeks are filled out,
// the eyes are enlarged, and the mouth is closed. b0 = bone positions in the unscaled bind pose (world).
let lineN = [], headGid = null;                                       // childGeo: the mouth line's normal sources (head weld ids)
function childGeo(g0, main, model, body, b0) {
  lineN = []; headGid = null;
  const g = g0.clone(), p = g.attributes.position, n = p.count, src = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  const W = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { _cv1.fromBufferAttribute(p, i).applyMatrix4(body.matrixWorld); W[i * 3] = _cv1.x; W[i * 3 + 1] = _cv1.y; W[i * 3 + 2] = _cv1.z; }
  // weld a vertex selection (UV seams split vertices), with its neighbours; vertices touching unselected ones are fixed
  const weld = (sel) => {
    const q = 0.0004, gid = new Int32Array(n).fill(-1), key = new Map(); let G = 0;
    for (let i = 0; i < n; i++) { if (!sel(i)) continue; const k = Math.round(W[i * 3] / q) + ',' + Math.round(W[i * 3 + 1] / q) + ',' + Math.round(W[i * 3 + 2] / q); let v = key.get(k); if (v === undefined) { v = G++; key.set(k, v); } gid[i] = v; }
    const cur = new Float64Array(G * 3), fixed = new Uint8Array(G), nb = Array.from({ length: G }, () => new Set());
    for (let i = 0; i < n; i++) { const v = gid[i]; if (v >= 0) { cur[v * 3] = W[i * 3]; cur[v * 3 + 1] = W[i * 3 + 1]; cur[v * 3 + 2] = W[i * 3 + 2]; } }
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      if (gid[a] < 0 || gid[b] < 0 || gid[c] < 0) { for (const x of [a, b, c]) if (gid[x] >= 0) fixed[gid[x]] = 1; continue; }
      for (const [x, y] of [[a, b], [b, c], [c, a]]) if (gid[x] !== gid[y]) { nb[gid[x]].add(gid[y]); nb[gid[y]].add(gid[x]); }
    }
    return { gid, G, cur, fixed, nb };
  };
  const taubin = (R, passes, pin = null) => {                          // volume-keeping smoothing; fixed / pinned stay put
    const { G, cur, fixed, nb } = R, tmp = new Float64Array(G * 3);
    for (let it = 0; it < passes * 2; it++) {
      const lam = it % 2 ? -0.53 : 0.5;
      for (let v = 0; v < G; v++) {
        if (fixed[v] || (pin && pin[v]) || !nb[v].size) { tmp[v * 3] = cur[v * 3]; tmp[v * 3 + 1] = cur[v * 3 + 1]; tmp[v * 3 + 2] = cur[v * 3 + 2]; continue; }
        let x = 0, y = 0, z = 0; for (const u of nb[v]) { x += cur[u * 3]; y += cur[u * 3 + 1]; z += cur[u * 3 + 2]; }
        const k = nb[v].size; tmp[v * 3] = cur[v * 3] + lam * (x / k - cur[v * 3]); tmp[v * 3 + 1] = cur[v * 3 + 1] + lam * (y / k - cur[v * 3 + 1]); tmp[v * 3 + 2] = cur[v * 3 + 2] + lam * (z / k - cur[v * 3 + 2]);
      }
      cur.set(tmp);
    }
  };
  const back = (R) => { for (let i = 0; i < n; i++) { const v = R.gid[i]; if (v >= 0) { W[i * 3] = R.cur[v * 3]; W[i * 3 + 1] = R.cur[v * 3 + 1]; W[i * 3 + 2] = R.cur[v * 3 + 2]; } } };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ARMS: slight, soft limbs
  for (const sd of ['l', 'r']) {
    const A = b0['upperarm_' + sd], B = b0['lowerarm_' + sd], C = b0['hand_' + sd], lAB = A.distanceTo(B), lBC = B.distanceTo(C);
    const re = new RegExp('^(upperarm|lowerarm)_' + sd + '$'), Q = new THREE.Vector3(), P = new THREE.Vector3(), seg = new THREE.Line3();
    const R = weld((i) => re.test(main[i]));
    for (let v = 0; v < R.G; v++) {
      if (R.fixed[v]) continue;
      P.set(R.cur[v * 3], R.cur[v * 3 + 1], R.cur[v * 3 + 2]);
      seg.set(A, B); const t1 = seg.closestPointToPointParameter(P, true); seg.at(t1, Q); let d = P.distanceTo(Q), s = t1 * lAB, q = Q.clone();
      seg.set(B, C); const t2 = seg.closestPointToPointParameter(P, true); seg.at(t2, Q); if (P.distanceTo(Q) < d) { s = lAB + t2 * lBC; q = Q; }
      const k = 1 - 0.24 * ss(0.02, 0.1, s);                          // drawn in, but not at the shoulder (the tunic sleeve)
      R.cur[v * 3] = q.x + (P.x - q.x) * k; R.cur[v * 3 + 1] = q.y + (P.y - q.y) * k; R.cur[v * 3 + 2] = q.z + (P.z - q.z) * k;
    }
    taubin(R, 18); back(R);
  }
  // CALVES (bare below the hem): smoothed
  { const R = weld((i) => /^calf_[lr]$/.test(main[i])); taubin(R, 8); back(R); }
  // CHEST: flat, with no pectoral relief: the front of the ribcage is held to the breastbone's line, then smoothed
  {
    const zs = b0.spine_03.z, mid = new Map(), bin = (y) => Math.round(y / 0.01);
    for (let i = 0; i < n; i++) if (/^spine_0[123]$/.test(main[i]) && Math.abs(W[i * 3]) < 0.012 && W[i * 3 + 2] > zs) { const b = bin(W[i * 3 + 1]); mid.set(b, Math.max(mid.get(b) ?? -1e9, W[i * 3 + 2])); }
    const zmid = (y) => { const b = bin(y); return mid.get(b) ?? mid.get(b - 1) ?? mid.get(b + 1) ?? null; };
    const sel = (i) => /^(spine_0[23]|clavicle_[lr])$/.test(main[i]) && W[i * 3 + 2] > zs && Math.abs(W[i * 3]) < 0.14;
    for (let i = 0; i < n; i++) {
      if (!sel(i)) continue;
      const zm = zmid(W[i * 3 + 1]); if (zm === null) continue;
      const lim = zm + 0.002 - W[i * 3] * W[i * 3] * 0.6;               // a gently rounded, flat front
      if (W[i * 3 + 2] > lim) W[i * 3 + 2] = lim + (W[i * 3 + 2] - lim) * 0.15;
    }
    const R = weld(sel); taubin(R, 10); back(R);
    // the back too: no adult shoulder-blade and lat muscle relief, a child's straight, slight back
    const midB = new Map();
    for (let i = 0; i < n; i++) if (/^spine_0[123]$/.test(main[i]) && Math.abs(W[i * 3]) < 0.012 && W[i * 3 + 2] < zs) { const b = bin(W[i * 3 + 1]); midB.set(b, Math.min(midB.get(b) ?? 1e9, W[i * 3 + 2])); }
    const zmb = (y) => { const b = bin(y); return midB.get(b) ?? midB.get(b - 1) ?? midB.get(b + 1) ?? null; };
    const selB = (i) => /^(spine_0[123]|clavicle_[lr])$/.test(main[i]) && W[i * 3 + 2] < zs && Math.abs(W[i * 3]) < 0.17;
    for (let i = 0; i < n; i++) {
      if (!selB(i)) continue;
      const zm = zmb(W[i * 3 + 1]); if (zm === null) continue;
      const lim = zm - 0.004 + W[i * 3] * W[i * 3] * 0.8;
      if (W[i * 3 + 2] < lim) W[i * 3 + 2] = lim + (W[i * 3 + 2] - lim) * 0.15;
    }
    const RB = weld(selB); taubin(RB, 10); back(RB);
  }

  // HEAD
  const eyes = []; model.traverse((o) => { if (o.isSkinnedMesh && /^eyes$/i.test(o.name)) eyes.push(o); });
  const ec = [];                                                     // the two eyeball centres (bind world): [left (+x), right]
  if (eyes[0]) { const ep = eyes[0].geometry.attributes.position, L = [0, 0, 0, 0], Rr = [0, 0, 0, 0]; for (let i = 0; i < ep.count; i++) { _cv1.fromBufferAttribute(ep, i).applyMatrix4(eyes[0].matrixWorld); const a = _cv1.x > 0 ? L : Rr; a[0] += _cv1.x; a[1] += _cv1.y; a[2] += _cv1.z; a[3]++; } for (const a of [L, Rr]) if (a[3]) ec.push(new THREE.Vector3(a[0] / a[3], a[1] / a[3], a[2] / a[3])); }
  const info = { eyes: ec.map((e) => e.toArray().map((x) => +x.toFixed(4))) };
  if (ec.length === 2) {
    const eyeY = (ec[0].y + ec[1].y) / 2, eyeZ = (ec[0].z + ec[1].z) / 2, u = Math.abs(ec[0].x - ec[1].x);   // u: eye spacing (~6 cm)
    const R = weld((i) => main[i] === 'Head'), { G, cur, fixed, nb } = R;
    lineN = []; headGid = R.gid;
    const cur0 = cur.slice();                                          // the head as it came (the open mouth's inside keeps its depth)
    const ed = (v) => Math.min(...ec.map((e) => Math.hypot(cur[v * 3] - e.x, cur[v * 3 + 1] - e.y, cur[v * 3 + 2] - e.z)));
    const lidR = u * 0.25, pin = new Uint8Array(G), mt = new Uint8Array(G);   // mt: 1 the inside of the mouth, 2 a sealed lip edge
    const mouthY = eyeY - u * 1.107, mW = u * 0.36;                   // the mouth line and half-width (the base mesh's lips are parted)
    for (let v = 0; v < G; v++) {                                      // close the mouth: the lips meet on the mouth line, smaller
      const x = cur[v * 3], y = cur[v * 3 + 1], z = cur[v * 3 + 2], dy = y - mouthY;
      if (Math.abs(x) > mW || Math.abs(dy) > u * 0.2 || z < eyeZ) continue;
      const fx = 1 - ss(mW * 0.6, mW, Math.abs(x));
      if (z < eyeZ + u * 0.3 && Math.abs(dy) < u * 0.1) { cur[v * 3 + 1] = mouthY; cur[v * 3 + 2] = z - u * 0.05; pin[v] = 1; mt[v] = 1; continue; }   // the inside of the mouth, sunk behind the lips
      if (Math.abs(dy) < u * 0.065) { cur[v * 3 + 1] = mouthY + dy * (1 - fx); pin[v] = 1; if (fx > 0.2) mt[v] = 2; }   // the lip edges, sealed
      else cur[v * 3 + 1] = mouthY + dy * (1 - 0.4 * fx);              // thinner lips
      cur[v * 3] = x * (1 - 0.15 * fx);                                 // a smaller mouth
    }
    let zMax = -1e9, yMin = 1e9, yMax = -1e9;
    for (let v = 0; v < G; v++) { if (ed(v) < lidR) pin[v] = 1; zMax = Math.max(zMax, cur[v * 3 + 2]); yMin = Math.min(yMin, cur[v * 3 + 1]); yMax = Math.max(yMax, cur[v * 3 + 1]); }
    const hops = new Int32Array(G).fill(99), qu = [];                 // graph distance from the neck seam (deformations fade there)
    for (let v = 0; v < G; v++) if (fixed[v]) { hops[v] = 0; qu.push(v); }
    for (let h = 0; h < qu.length; h++) { const v = qu[h]; for (const w of nb[v]) if (hops[w] > hops[v] + 1) { hops[w] = hops[v] + 1; qu.push(w); } }
    const light = cur.slice(); { const L = { ...R, cur: light }; taubin(L, 4, pin); }
    const heavy = cur.slice(); { const H = { ...R, cur: heavy }; taubin(H, 70, pin); }
    // the mouth: the lip line and the mouth's inner surface (behind it) are pulled onto the heavily smoothed face
    const front = (v) => cur[v * 3 + 2] > eyeZ - u * 0.9;
    for (let v = 0; v < G; v++) {
      const x = cur[v * 3], y = cur[v * 3 + 1];
      let w = front(v) ? 0.9 : 0.45;                                  // the features go; the back of the head barely changes
      w *= ss(lidR, lidR * 1.6, ed(v));                                // the eyelids keep their shape
      if (Math.abs(x) < u * 0.45 && Math.abs(y - mouthY) < u * 0.1 && front(v)) w *= 0.3;   // the sealed lips keep their shape
      else if (Math.abs(x) < u * 0.45 && y > mouthY && y < eyeY - u * 0.3 && front(v)) w = 1;   // the nose and under it: fully smoothed
      for (let c = 0; c < 3; c++) cur[v * 3 + c] = light[v * 3 + c] + (heavy[v * 3 + c] - light[v * 3 + c]) * w;
    }
    // shape: a shorter lower face and chin, full cheeks, bigger eyes
    const hc = new THREE.Vector3(0, (yMin + yMax) / 2 + u * 0.3, eyeZ - u * 1.2), dir = new THREE.Vector3();
    for (let v = 0; v < G; v++) {
      if (fixed[v]) continue;
      const fade = Math.min(1, hops[v] / 5);
      let x = cur[v * 3], y = cur[v * 3 + 1], z = cur[v * 3 + 2];
      const de = ed(v);
      if (de < lidR * 1.5) {                                           // open, bright eyes: the upper lid rolls up over the eyeball, the lower a little down
        const e = ec[Math.abs(x - ec[0].x) < Math.abs(x - ec[1].x) ? 0 : 1], dy0 = y - e.y, dz0 = z - e.z;
        const th = (dy0 > 0 ? 0.3 : -0.06) * (1 - ss(lidR, lidR * 1.5, de)), c = Math.cos(th), sn = Math.sin(th);
        y = e.y + dy0 * c + dz0 * sn; z = e.z - dy0 * sn + dz0 * c;
      }
      if (de < u * 0.9) {                                              // the eyes and lids grow about the eye centres
        const e = ec[Math.abs(x - ec[0].x) < Math.abs(x - ec[1].x) ? 0 : 1], k = 0.16 * (1 - ss(lidR * 0.9, u * 0.9, de));
        x += (x - e.x) * k; y += (y - e.y) * k; z += (z - e.z) * k * 0.5;
      }
      {                                                                // a small button nose: the bridge and tip pressed back toward the face
        const zRef = eyeZ + u * 0.33, wn = (1 - ss(u * 0.18, u * 0.36, Math.abs(x))) * ss(eyeY - u * 0.95, eyeY - u * 0.8, y) * (1 - ss(eyeY - u * 0.15, eyeY + u * 0.05, y));
        if (z > zRef) z = zRef + (z - zRef) * (1 - 0.6 * wn);
      }
      const yl = eyeY - u * 0.35;
      if (y < yl) {                                                    // a shorter, rounder lower face; the chin set back
        const dy = yl - y; y += dy * 0.24 * fade; x *= 1 + 0.07 * fade * ss(0, u * 0.5, dy);
        if (z > eyeZ - u * 1.2) z -= (z - (eyeZ - u * 1.2)) * 0.07 * ss(u * 0.7, u * 1.5, dy) * fade;   // (below the mouth only: no recess under the nose)
      }
      dir.set(x - hc.x, (y - hc.y) * 0.7, z - hc.z).normalize();
      for (const sx of [-1, 1]) {                                      // round, full cheeks
        const dx = x - sx * u * 0.6, dyc = y - (eyeY - u * 0.95), g2 = Math.exp(-(dx * dx + dyc * dyc) / (2 * (u * 0.45) ** 2));
        if (z > eyeZ - u * 0.8) { const a = u * 0.16 * g2 * fade; x += dir.x * a; y += dir.y * a; z += dir.z * a; }
      }
      cur[v * 3] = x; cur[v * 3 + 1] = y; cur[v * 3 + 2] = z;
    }
    { const L = { ...R }; taubin(L, 2, pin); }
    // a soft, closed child's mouth. The sealed lip edges came out of the steps above as an uneven, lumpy line (each
    // vertex where its own lip put it), with deep pits at the corners and a ledge under the nose. Now: a smooth surface
    // is fitted to the face round the mouth (z = F(x, y), symmetric in x); the lips, the skin under the nose and over
    // the chin are eased onto it (fully at the mouth, fading out by the nose, the cheeks and the chin); every lip edge
    // and corner vertex lies on one clean, level line on it (the corners turned up a touch); and the inside of the mouth
    // is folded away well behind. The mouth itself is drawn by the skin texture (childSkin): small, soft and closed.
    {
      let ym = 0, nm = 0;
      for (let v = 0; v < G; v++) if (mt[v] === 2) { ym += cur[v * 3 + 1]; nm++; }
      if (nm > 3) {
        ym /= nm;
        const lineV = [], lw = u * 0.46, lineY = (x) => ym + u * 0.025 * (x / lw) ** 2, fr = (v) => cur[v * 3 + 2] > eyeZ - u * 0.3;
        const wz = (x, dy) => (1 - ss(u * 0.42, u * 0.62, Math.abs(x))) * (dy > 0 ? 1 - ss(u * 0.18, u * 0.32, dy) : 1 - ss(u * 0.24, u * 0.42, -dy));
        const A = Array.from({ length: 5 }, () => new Float64Array(6));   // least squares: z = c0 + c1 y' + c2 y'^2 + c3 x^2 + c4 x^2 y'
        for (let v = 0; v < G; v++) {
          const x = cur[v * 3], y = cur[v * 3 + 1] - ym, z = cur[v * 3 + 2];
          if (mt[v] || !fr(v) || wz(x, y) > 0.02 || Math.abs(x) > u * 1.0 || y > u * 0.3 || y < -u * 0.65) continue;
          const b = [1, y, y * y, x * x, x * x * y];
          for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) A[i][j] += b[i] * b[j]; A[i][5] += b[i] * z; }
        }
        for (let i = 0; i < 5; i++) {                                    // Gauss-Jordan
          let pv = i; for (let r = i + 1; r < 5; r++) if (Math.abs(A[r][i]) > Math.abs(A[pv][i])) pv = r;
          [A[i], A[pv]] = [A[pv], A[i]]; const d = A[i][i] || 1e-12;
          for (let j = i; j < 6; j++) A[i][j] /= d;
          for (let r = 0; r < 5; r++) if (r !== i) { const f = A[r][i]; for (let j = i; j < 6; j++) A[r][j] -= f * A[i][j]; }
        }
        const C = A.map((r) => r[5]), F = (x, y) => C[0] + C[1] * y + C[2] * y * y + C[3] * x * x + C[4] * x * x * y;
        // which vertices are skin and which the inside of the mouth: by their texture (the mouth's inside is mapped low
        // on the sheet, v > 0.55; the face high). A vertex on both is the lip's rim, and goes on the line.
        const uva = g.attributes.uv, face = new Uint8Array(G), inside = new Uint8Array(G);
        for (let i = 0; i < n; i++) { const v = R.gid[i]; if (v < 0) continue; if (uva.getY(i) > 0.55) inside[v] = 1; else face[v] = 1; }
        for (let v = 0; v < G; v++) {
          const near = Math.abs(cur[v * 3]) < lw * 1.2 && Math.abs(cur[v * 3 + 1] - ym) < u * 0.2;
          if (inside[v] && !face[v] && (mt[v] || near)) mt[v] = 1;
          else if (mt[v]) mt[v] = 2;
          else if (fr(v) && Math.abs(cur[v * 3]) < lw && Math.abs(cur[v * 3 + 1] - ym) < u * 0.05) mt[v] = 2;   // the corners join the line
        }
        for (let v = 0; v < G; v++) {
          const x = cur[v * 3], dy = cur[v * 3 + 1] - ym;
          if (mt[v] === 1) { const xx = Math.max(-lw * 0.97, Math.min(lw * 0.97, x * 0.95)); cur[v * 3] = xx; cur[v * 3 + 1] = lineY(xx) + (cur0[v * 3 + 1] - mouthY) * 0.8; cur[v * 3 + 2] = F(xx, 0) - u * 0.08 - Math.max(0, F(cur0[v * 3], 0) - cur0[v * 3 + 2]) * 0.5; continue; }   // folded away inside: a closed pocket behind the line (so nothing shows through it)
          if (mt[v] === 2) { const xx = Math.sign(x) * Math.min(Math.abs(x), lw); cur[v * 3] = xx; cur[v * 3 + 1] = lineY(xx); cur[v * 3 + 2] = F(xx, lineY(xx) - ym); lineV.push(v); continue; }
          if (!fr(v)) continue;
          const w = wz(x, dy); if (w > 0) cur[v * 3 + 2] += (F(x, dy) - cur[v * 3 + 2]) * w;
        }
        // the line's shading: its vertices border the pocket behind, which tipped their normals up or down (a bright,
        // ragged seam). Each takes the normal of the nearest lip vertex off the line (applied after weldNormals below).
        const off = []; for (let v = 0; v < G; v++) if (!mt[v] && fr(v) && Math.abs(cur[v * 3]) < lw * 1.3 && Math.abs(cur[v * 3 + 1] - ym) < u * 0.25) off.push(v);
        for (const v of lineV) { let best = -1, bd = 1e9; for (const w of off) { const d = (cur[w * 3] - cur[v * 3]) ** 2 + (cur[w * 3 + 1] - cur[v * 3 + 1]) ** 2 * 0.5; if (d < bd) { bd = d; best = w; } } if (best >= 0) lineN.push([v, best]); }
      }
    }
    back(R);
    Object.assign(info, { eyeY, eyeZ, u, zMax, yMin, yMax, G });
    // the eyeballs grow with the lids (their own copy of the eye mesh)
    if (eyes[0] && !eyes[0].userData.childGrown) {
      const eg = eyes[0].geometry.clone(), epp = eg.attributes.position, inv = new THREE.Matrix4().copy(eyes[0].matrixWorld).invert();
      for (let i = 0; i < epp.count; i++) { _cv1.fromBufferAttribute(epp, i).applyMatrix4(eyes[0].matrixWorld); const e = _cv1.x > 0 ? ec[0] : ec[1]; _cv1.sub(e).multiplyScalar(1.16).add(e).applyMatrix4(inv); epp.setXYZ(i, _cv1.x, _cv1.y, _cv1.z); }
      eg.computeVertexNormals(); g.userData.eyes = eg;
    }
  }
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  for (let i = 0; i < n; i++) { _cv1.set(W[i * 3], W[i * 3 + 1], W[i * 3 + 2]).applyMatrix4(inv); p.setXYZ(i, _cv1.x, _cv1.y, _cv1.z); }
  g.computeBoundingSphere(); weldNormals(g);
  if (lineN.length) {                                                  // the mouth line's normals (see the mouth above)
    const nr = g.attributes.normal, byG = new Map();
    for (let i = 0; i < n; i++) { const v = headGid[i]; if (v >= 0 && !byG.has(v)) byG.set(v, i); }
    for (const [v, w] of lineN) { const j = byG.get(w); if (j === undefined) continue; for (let i = 0; i < n; i++) if (headGid[i] === v) nr.setXYZ(i, nr.getX(j), nr.getY(j), nr.getZ(j)); }
    nr.needsUpdate = true;
  }
  return g;
}
// A coarse woven-cloth texture (tinted by the material colour), shared.
let weaveT = null;
function weave() {
  if (weaveT) return weaveT;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) { const o = ((x + y) / 4) % 2; g.fillStyle = o ? '#c4c4c4' : '#ececec'; g.fillRect(x, y, o ? 4 : 3, o ? 3 : 4); }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.08)`; g.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 6, 1); }
  weaveT = new THREE.CanvasTexture(c); weaveT.wrapS = weaveT.wrapT = THREE.RepeatWrapping; weaveT.repeat.set(10, 10); weaveT.colorSpace = THREE.SRGBColorSpace;
  return weaveT;
}
// The child's skin: the male texture evened out into smooth young skin. The whole sheet is blurred and laid under an
// even skin tone (no painted muscle shading on the arms and legs, no stubble, no brow shadow, no colour steps at the
// UV seams), the eyes are kept, and a child's face is painted: rosy cheeks, faint fine brows, a small closed mouth.
function childSkin(url) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 1024, 1024);
    const keep = (cx, cy, rx, ry) => {                                 // a soft-edged copy of a patch (the eyes)
      const t = document.createElement('canvas'); t.width = rx * 2; t.height = ry * 2; const tg = t.getContext('2d');
      tg.drawImage(cv, cx - rx, cy - ry, rx * 2, ry * 2, 0, 0, rx * 2, ry * 2);
      tg.globalCompositeOperation = 'destination-in'; tg.translate(rx, ry); tg.scale(1, ry / rx);
      const gr = tg.createRadialGradient(0, 0, rx * 0.6, 0, 0, rx); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      tg.fillStyle = gr; tg.fillRect(-rx, -rx, rx * 2, rx * 2);
      return () => g.drawImage(t, cx - rx, cy - ry);
    };
    const eyeL = keep(137, 184, 22, 14), eyeR = keep(242, 184, 22, 14);
    // the painted underwear patches stay (they are under the tunic); everything else becomes even skin
    const blur = document.createElement('canvas'); blur.width = blur.height = 1024; const bg = blur.getContext('2d');
    bg.filter = 'blur(10px)'; bg.drawImage(cv, 0, 0); bg.filter = 'none';
    g.drawImage(blur, 0, 0);
    g.fillStyle = 'rgba(236,184,152,0.72)'; g.fillRect(0, 0, 1024, 1024);
    g.save(); g.filter = 'blur(18px)'; g.fillStyle = 'rgba(236,184,152,0.85)'; g.beginPath(); g.ellipse(190, 230, 170, 150, 0, 0, Math.PI * 2); g.fill(); g.restore();   // the face: no stubble or mouth shadow
    g.save(); g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(240,128,118,0.34)'; g.beginPath(); g.ellipse(104, 236, 42, 30, 0, 0, Math.PI * 2); g.ellipse(276, 236, 42, 30, 0, 0, Math.PI * 2); g.fill();   // rosy cheeks
    g.fillStyle = 'rgba(236,140,124,0.25)'; g.beginPath(); g.ellipse(190, 228, 16, 10, 0, 0, Math.PI * 2); g.fill();   // the nose tip
    g.restore();
    g.save(); g.filter = 'blur(6px)'; g.fillStyle = 'rgba(246,200,172,0.45)'; g.beginPath(); g.ellipse(190, 247, 44, 10, 0, 0, Math.PI * 2); g.fill(); g.restore();   // an even skin under the nose (no shadowed 'moustache')
    eyeL(); eyeR();
    g.save(); g.filter = 'blur(4px)'; g.fillStyle = 'rgba(236,184,152,0.45)'; g.beginPath(); g.ellipse(137, 163, 26, 7, 0, 0, Math.PI * 2); g.ellipse(242, 163, 26, 7, 0, 0, Math.PI * 2); g.fill(); g.restore();   // soft upper lids
    g.save(); g.filter = 'blur(2.5px)'; g.strokeStyle = 'rgba(120,82,60,0.45)'; g.lineWidth = 4; g.lineCap = 'round';
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(190 + sx * 24, 152); g.quadraticCurveTo(190 + sx * 52, 140, 190 + sx * 78, 150); g.stroke(); }   // faint, fine, arched brows
    g.restore();
    // the mouth. The lips' rims are folded onto one closed line in the mesh (childGeo), which maps to texture rows
    // ~263-282 (x 155-227; the centre at x 190): the strips just above and below it are the lips. Painted: even skin over
    // the whole band (no adult lip colour or shadow), a soft rose on the upper and lower lip in the middle only (a small
    // mouth), and a short, soft closed line that fades out at both ends.
    g.save(); g.filter = 'blur(3px)'; g.fillStyle = 'rgb(236,184,152)'; g.fillRect(138, 252, 106, 46); g.restore();
    g.save(); g.filter = 'blur(3px)';
    g.fillStyle = 'rgba(222,140,124,0.55)'; g.beginPath(); g.ellipse(190, 259, 19, 5, 0, 0, Math.PI * 2); g.fill();   // the upper lip
    g.fillStyle = 'rgba(226,146,130,0.6)'; g.beginPath(); g.ellipse(190, 287, 16, 6, 0, 0, Math.PI * 2); g.fill();   // the lower lip, a little fuller
    g.restore();
    g.save(); g.filter = 'blur(2px)'; g.fillStyle = 'rgba(206,146,126,0.85)'; g.fillRect(142, 262, 98, 22); g.restore();   // the rest of the line: a soft, slightly deeper skin tone (it was a bright seam)
    { const gr = g.createLinearGradient(170, 0, 210, 0); gr.addColorStop(0, 'rgba(160,86,76,0)'); gr.addColorStop(0.25, 'rgba(160,86,76,0.75)'); gr.addColorStop(0.75, 'rgba(160,86,76,0.75)'); gr.addColorStop(1, 'rgba(160,86,76,0)');
      g.save(); g.filter = 'blur(1.5px)'; g.fillStyle = gr; g.fillRect(170, 264, 40, 18); g.restore(); }   // the closed line
    // the inside of the mouth (x ~110-145, rows ~690-722) is folded away into a pocket behind the line; a sliver of it
    // can show along the line, so it is painted the line's soft rose-brown (never the pale teeth, never a bright seam)
    g.save(); g.filter = 'blur(3px)'; g.fillStyle = 'rgb(168,102,90)'; g.fillRect(96, 676, 64, 60); g.restore();
    // the nostrils and the underside of the button nose: soft, not dark
    g.save(); g.filter = 'blur(4px)'; g.fillStyle = 'rgba(236,184,152,0.6)'; g.beginPath(); g.ellipse(190, 236, 22, 7, 0, 0, Math.PI * 2); g.fill(); g.restore();
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

// ---------- ADULT-DRESS: adults' hide clothing ----------
// GUARDRAIL (content limits, arc_data.js "no underwear meshes"): no adult is ever shown in the base mesh's painted
// underwear. Women wear a hide dress: a fitted top grown from the body's own skinned vertices (shoulders to hips, short
// sleeves; the front falls straight from the bust like a hide smock) and a flared knee-length skirt skinned to the
// pelvis and thighs. Men wear a hide kilt to above the knee (the chest stays bare). Geometry is built once per rig and
// shared; each wearer gets its own material (colour). Called from makeHuman (dress: true | colour; false for none).
const DRESS_GEO = {};
let hideT = null;
function hideTex() {                                                   // a soft, mottled tanned-hide grain (tinted)
  if (hideT) return hideT;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 420; i++) { const r = 2 + Math.random() * 9, l = Math.random() < 0.5; g.fillStyle = `rgba(${l ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 0.6; g.beginPath(); const x = Math.random() * 128, y = Math.random() * 128; g.moveTo(x, y); g.quadraticCurveTo(x + Math.random() * 20 - 10, y + Math.random() * 8, x + Math.random() * 26 - 13, y + Math.random() * 16); g.stroke(); }
  hideT = new THREE.CanvasTexture(c); hideT.wrapS = hideT.wrapT = THREE.RepeatWrapping; hideT.repeat.set(3, 3); hideT.colorSpace = THREE.SRGBColorSpace;
  return hideT;
}
function adultDress(model, body, bones, who, color, style = null) {
  model.updateMatrixWorld(true); body.updateWorldMatrix(true, false);
  const two = style === 'twopiece' && who === 'female';   // SENA-LOOK: a hide breast-band and a short hip-slung skirt (the user's choice for Sena; non-explicit)
  const cache = (DRESS_GEO[who + (two ? ':two' : '')] ||= {});
  const g0 = body.geometry, pos = g0.attributes.position, si = g0.attributes.skinIndex, sw = g0.attributes.skinWeight, n = pos.count;
  const names = body.skeleton.bones.map((b) => b.name), main = new Array(n), wy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bi = 0;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
    main[i] = names[bi] || ''; wy[i] = _cv1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld).y;
  }
  const bw = (nm) => bones[nm].getWorldPosition(new THREE.Vector3());
  const unit = 1 / _cv2.setFromMatrixScale(body.matrixWorld).x;
  const mat = (shade = 1) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(shade), roughness: 0.95, metalness: 0, map: hideTex(), side: THREE.DoubleSide });
  const out = { parts: [] };
  // 1. the top (women): the same shell method as the children's tunic (welded, Taubin-smoothed, held off the skin)
  if (who === 'female') {
    let g = cache.top;
    if (!g) {
      const TOP = two ? /^(spine_0[23]|clavicle_[lr])$/ : /^(pelvis|spine_0[123]|clavicle_[lr]|upperarm_[lr])$/, yHipCut = bw('thigh_l').y - 0.04;
      const s2 = bw('spine_02').y, s3 = bw('spine_03').y, nk = bw('neck_01').y;
      const yLo = s2 + (s3 - s2) * 0.55, yHi = s3 + (nk - s3) * 0.42;   // SENA-LOOK: the band covers the bust only; bare shoulders and midriff
      const keep = (i) => TOP.test(main[i]) && !(main[i] === 'pelvis' && wy[i] < yHipCut) && (!two || (wy[i] > yLo && wy[i] < yHi));
      const off = (i) => (/^upperarm/.test(main[i]) ? 0.012 : 0.016) * unit;
      g = g0.clone(); const p = g.attributes.position, nr = g.attributes.normal;
      const src = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i), idx = [];
      for (let t = 0; t < src.length; t += 3) if (keep(src[t]) && keep(src[t + 1]) && keep(src[t + 2])) idx.push(src[t], src[t + 1], src[t + 2]);
      const q = 0.0005 * unit, gid = new Int32Array(n).fill(-1), km = new Map(); let G = 0;
      for (const i of idx) if (gid[i] < 0) { const k = Math.round(p.getX(i) / q) + ',' + Math.round(p.getY(i) / q) + ',' + Math.round(p.getZ(i) / q); let v = km.get(k); if (v === undefined) { v = G++; km.set(k, v); } gid[i] = v; }
      const gp = new Float64Array(G * 3), gn = new Float64Array(G * 3), go = new Float64Array(G), cnt = new Uint8Array(G), nb = Array.from({ length: G }, () => new Set()), edge = new Map();
      for (let i = 0; i < n; i++) { const v = gid[i]; if (v < 0) continue; gn[v * 3] += nr.getX(i); gn[v * 3 + 1] += nr.getY(i); gn[v * 3 + 2] += nr.getZ(i); if (cnt[v]) continue; cnt[v] = 1; gp[v * 3] = p.getX(i); gp[v * 3 + 1] = p.getY(i); gp[v * 3 + 2] = p.getZ(i); go[v] = off(i); }
      for (let v = 0; v < G; v++) { const l = Math.hypot(gn[v * 3], gn[v * 3 + 1], gn[v * 3 + 2]) || 1; gn[v * 3] /= l; gn[v * 3 + 1] /= l; gn[v * 3 + 2] /= l; }
      for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = gid[idx[t + e]], b = gid[idx[t + (e + 1) % 3]]; if (a === b) continue; nb[a].add(b); nb[b].add(a); const k = a < b ? a + ':' + b : b + ':' + a; edge.set(k, (edge.get(k) || 0) + 1); }
      const fixed = new Uint8Array(G); for (const [k, c] of edge) if (c === 1) { const [a, b] = k.split(':'); fixed[+a] = fixed[+b] = 1; }
      const base = gp.slice(), cur = gp.slice(), tmp = new Float64Array(G * 3);
      for (let v = 0; v < G; v++) for (let c = 0; c < 3; c++) cur[v * 3 + c] += gn[v * 3 + c] * go[v];
      for (let it = 0; it < 60; it++) {
        const lam = it % 2 ? -0.53 : 0.5;
        for (let v = 0; v < G; v++) {
          if (fixed[v] || !nb[v].size) { tmp[v * 3] = cur[v * 3]; tmp[v * 3 + 1] = cur[v * 3 + 1]; tmp[v * 3 + 2] = cur[v * 3 + 2]; continue; }
          let x = 0, y = 0, z = 0; for (const u of nb[v]) { x += cur[u * 3]; y += cur[u * 3 + 1]; z += cur[u * 3 + 2]; }
          const k = nb[v].size; tmp[v * 3] = cur[v * 3] + lam * (x / k - cur[v * 3]); tmp[v * 3 + 1] = cur[v * 3 + 1] + lam * (y / k - cur[v * 3 + 1]); tmp[v * 3 + 2] = cur[v * 3 + 2] + lam * (z / k - cur[v * 3 + 2]);
        }
        cur.set(tmp);
      }
      for (let v = 0; v < G; v++) { const d = (cur[v * 3] - base[v * 3]) * gn[v * 3] + (cur[v * 3 + 1] - base[v * 3 + 1]) * gn[v * 3 + 1] + (cur[v * 3 + 2] - base[v * 3 + 2]) * gn[v * 3 + 2]; if (d < go[v]) for (let c = 0; c < 3; c++) cur[v * 3 + c] += gn[v * 3 + c] * (go[v] - d); }
      // the front falls straight from the bust to the hips (a hide smock): no cleavage line, no fitted waist
      const inv = new THREE.Matrix4().copy(body.matrixWorld).invert(), nm = new THREE.Matrix3().getNormalMatrix(body.matrixWorld), wn = new THREE.Vector3();
      const W = []; for (let v = 0; v < G; v++) W.push(new THREE.Vector3(cur[v * 3], cur[v * 3 + 1], cur[v * 3 + 2]).applyMatrix4(body.matrixWorld));
      const yC = (bw('spine_03').y + bw('neck_01').y) / 2, yB = bw('thigh_l').y; let zM = -1e9, yM = yC;
      for (const w of W) if (w.y < yC && w.y > yB && Math.abs(w.x) < 0.12 && w.z > zM) { zM = w.z; yM = w.y; }
      for (let v = 0; v < G; v++) {
        const w = W[v]; wn.set(gn[v * 3], gn[v * 3 + 1], gn[v * 3 + 2]).applyMatrix3(nm).normalize();
        if (fixed[v] || w.y > yM || w.y < yB || wn.z < 0.1 || Math.abs(w.x) > 0.19) continue;
        const t = Math.min(1, (yM - w.y) / 0.03), zt = zM + (yM - w.y) * 0.06 - Math.max(0, Math.abs(w.x) - 0.07) * 0.3; if (w.z >= zt) continue;
        w.z += (zt - w.z) * t * Math.min(1, wn.z * 2); w.applyMatrix4(inv); cur[v * 3] = w.x; cur[v * 3 + 1] = w.y; cur[v * 3 + 2] = w.z;
      }
      for (let i = 0; i < n; i++) { const v = gid[i]; if (v >= 0) p.setXYZ(i, cur[v * 3], cur[v * 3 + 1], cur[v * 3 + 2]); }
      g.setIndex(idx); g.computeBoundingSphere(); weldNormals(g);
      cache.top = g;
    }
    const m = new THREE.SkinnedMesh(g, mat(1)); m.name = 'dressTop';
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale);
    body.parent.add(m); m.bind(body.skeleton, body.bindMatrix); out.top = m; out.parts.push(m);
  }
  // 2. the skirt (women, to the knee) or kilt (men, a hand above the knee): an open flared elliptical tube, skinned
  // (top on the pelvis, the lower sides partly on the thighs) so it swings with each stride and opens over a horse
  const fem = who === 'female', key = fem ? 'skirt' : 'kilt';
  let sg = cache[key];
  const P0 = bw('pelvis'), yW = two ? P0.y + (bw('spine_01').y - P0.y) * SENA_WAIST : bw('spine_01').y - (fem ? 0.0 : 0.035), yH = Math.min(P0.y - 0.04, bw('thigh_l').y - 0.03);
  const yK = two ? bw('thigh_l').y - (bw('thigh_l').y - bw('calf_l').y) * 0.5 : bw('calf_l').y + (fem ? 0.02 : 0.13);   // SENA-LOOK: hip-slung, mid-thigh
  const bi = (nm) => body.skeleton.bones.indexOf(bones[nm]), iP = bi('pelvis'), iL = bi('thigh_l'), iR = bi('thigh_r');
  const nB = body.skeleton.bones.length;                             // the skirt rig's bones follow the body's: front L, front R, back L, back R
  if (!sg) {
    const ext = (y0, y1, hi = false) => {
      let rx = 0, rz0 = 1e9, rz1 = -1e9;
      for (let i = 0; i < n; i++) {
        if (wy[i] < y0 || wy[i] > y1 || !(hi ? /^(pelvis|thigh_[lr]|spine_0[12])$/ : /^(pelvis|thigh_[lr]|spine_01)$/).test(main[i])) continue;
        _cv1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
        rx = Math.max(rx, Math.abs(_cv1.x - P0.x)); rz0 = Math.min(rz0, _cv1.z); rz1 = Math.max(rz1, _cv1.z);
      }
      return [rx, (rz1 - rz0) / 2, (rz1 + rz0) / 2];
    };
    const thY = bw('thigh_l').y, hip = ext(thY - 0.08, thY + 0.03), waist = ext(yW - 0.03, yW + 0.03);
    const fl = two ? 0.45 : fem ? 1 : 0.55, cz = hip[2];
    // a ring = [y, rx, rz, zc]; for the two-piece the upper rings are [fraction of the way from the top edge down to
    // the hip ring] and take their height and girth per vertex (SENA-LOOK r3, below)
    const rings = two ? [[0], [0.34], [0.67]] : [[yW, waist[0] + 0.022, waist[1] + 0.024, waist[2]]];
    rings.push([yH, hip[0] + 0.045, hip[1] + 0.05, cz]);
    for (let r = 1; r <= 4; r++) { const t = r / 4; rings.push([yH + (yK - yH) * t, hip[0] + 0.045 + (0.015 + 0.075 * fl) * t, hip[1] + 0.05 + (0.025 + 0.07 * fl) * t, cz]); }
    const SEG = 36, vs = [], uv = [], ssi = [], ssw = [];
    const lSide = Math.sign(bw('thigh_l').x - P0.x) || 1, iS = bi('spine_01'), yS = bw('spine_01').y;
    // SENA-LOOK r3 (verifier round 2): the skirt's top edge is not level. The base mesh's brief is cut low in front and
    // high over the hips and the small of the back, so a level hip-slung edge left it showing at the sides and behind
    // ("a skirt falling off"). The edge now dips in front and rises over the hip bones to the small of the back, a
    // hand above the brief all the way round; each vertex takes the body's own girth at its height, so the band lies
    // on her. The high back of the band bends with the first spine joint.
    const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    const topY = (a) => { const d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); return yW + SENA_RISE[0] + SENA_RISE[1] * sm((d - 0.2) / 1.3) + SENA_RISE[2] * (1 - Math.cos(a)) / 2; };
    const extC = new Map(), extAt = (y) => { const k = Math.round(y / 0.005); let e = extC.get(k); if (!e) { e = ext(k * 0.005 - 0.015, k * 0.005 + 0.015, true); extC.set(k, e); } return e; };
    // the thighs' fronts stand further forward than an ellipse through the hips allows (a forward thigh came through
    // the front panel as a "notch"): each vertex stands at least 3 to 5 cm outside the body's own outline at its
    // height and bearing (the widest of three neighbouring 10-degree sectors, then smoothed)
    const girC = new Map(), girth = (y, zc, k, half = 0.03) => {
      const key = Math.round(y / 0.005) + (half < 0.03 ? 0.5 : 0); let g = girC.get(key);
      if (!g) {
        const raw = new Float32Array(SEG), y0 = Math.floor(key) * 0.005;
        for (let i = 0; i < n; i++) {
          if (Math.abs(wy[i] - y0) > half || !/^(pelvis|thigh_[lr]|spine_0[12])$/.test(main[i])) continue;
          _cv1.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
          const dx = _cv1.x - P0.x, dz = _cv1.z - zc, r = Math.hypot(dx, dz), kk = Math.round(Math.atan2(dx, dz) / (Math.PI * 2) * SEG);
          for (let d = -1; d <= 1; d++) { const j = ((kk + d) % SEG + SEG) % SEG; if (r > raw[j]) raw[j] = r; }
        }
        g = new Float32Array(SEG); for (let j = 0; j < SEG; j++) g[j] = Math.max(raw[j], (raw[(j + 1) % SEG] + raw[j] * 2 + raw[(j + SEG - 1) % SEG]) / 4);
        girC.set(key, g);
      }
      return g[k];
    };
    body.parent.updateMatrixWorld(true);
    for (const ring of rings) for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2; let [y, rx, rz, zc] = ring;
      if (ring.length === 1) { const t = ring[0]; y = topY(a) + (yH - topY(a)) * t; const e = extAt(y); rx = e[0] + 0.008 + 0.037 * t; rz = e[1] + 0.008 + 0.042 * t; zc = e[2] + (cz - e[2]) * t; }
      let x = Math.sin(a) * rx, z = zc + Math.cos(a) * rz;
      if (two) { const up = ring.length === 1, g = up ? girth(y, zc, k % SEG, 0.015) + 0.014 + 0.016 * ring[0] : girth(y, zc, k % SEG) + 0.03 + 0.02 * Math.max(0, Math.min(1, (yH - y) / (yH - yK))), r = Math.hypot(x, z - zc); if (g > r) { x *= g / r; z = zc + (z - zc) * g / r; } }
      // KILT-A3 (verifier A3: a skin-coloured hole in the back of Aro's kilt mid-stride): the back panel hangs mostly
      // from the pelvis, and the leg swinging back pushed the buttock up to 3.5 cm through it just under the belt. Below
      // the belt the back now stands 4 cm further out (tapering to nothing at the sides): 0 pokes in walk, run, back,
      // strafe and sneak (body-vertex ray test, 30 frames each).
      else if (!fem && ring !== rings[0]) { const b = Math.max(0, -Math.cos(a)), r = Math.hypot(x, z - zc); if (b > 0 && r > 1e-6) { const s = (r + 0.04 * Math.sqrt(b)) / r; x *= s; z = zc + (z - zc) * s; } }
      const hem = y === yK ? -0.012 * (0.5 + 0.5 * Math.sin(a * 9)) : 0;   // a cut hide hem: not a ruler-straight line
      const L = body.parent.worldToLocal(new THREE.Vector3(P0.x + x, y + hem, z)); vs.push(L.x, L.y, L.z); uv.push(k / SEG * 3, (y - yK) * 4);
      const t = Math.max(0, Math.min(1, (yH - y) / (yH - yK)));
      if (two) {
        // SENA-LOOK r3: the front goes with the front drape bone of its side and the back with the back one (see
        // skirtRig), the sides shared between them; the small of the back bends with the first spine joint
        const fw = Math.max(0, Math.min(1, (sm(0.5 + 0.8 * (Math.cos(a) + 0.3)) - 0.15) / 0.7)),   // (the outside of the thigh goes with the front)
          tf = Math.max(0, Math.min(1, (yH + 0.05 - y) / 0.075)), wT = (SENA_WF * Math.pow(tf, 0.6)) * fw + (0.96 * Math.pow(Math.min(1, t * 1.6), 1.3)) * (1 - fw);
        const wS = Math.max(0, Math.min(0.75, (y - (yS - 0.045)) / 0.1)), left = x * lSide >= 0, sL = sm(0.5 + x * lSide / 0.16);
        // SENA-SIT A3 (verifier A3: seated, the front rose onto the lap with the thighs and opened between them on the
        // brief): the front's middle now goes with a fifth drape bone (front centre) instead of half each of the two
        // front bones. It swings as their average (the same drape as before, standing and walking), but seated it lets
        // the middle hang from the belt between the thighs (skirtRig). c: 1 at the middle, 0 where the side bone has it.
        if (fw === 1) { const own = nB + (left ? 0 : 1), c = 2 * (1 - sm(0.5 + Math.abs(x) / 0.16)), wC = wT * (1 - 0.42 * Math.max(0, 1 - Math.abs(x) / 0.08)); ssi.push(iP, nB + 4, own, iS); ssw.push(1 - wC - wS, wC * c, wC * (1 - c), wS); }
        else if (fw === 0) { const o = fw ? 0 : 2, wC = wT * (1 - 0.42 * fw * Math.max(0, 1 - Math.abs(x) / 0.08)); ssi.push(iP, nB + o, nB + o + 1, iS); ssw.push(1 - wC - wS, wC * sL, wC * (1 - sL), wS); }   // front and back: shared across the middle by the two sides' bones (no step between the halves); the front sags a little between the thighs
        else { ssi.push(iP, nB + (left ? 0 : 1), nB + (left ? 2 : 3), iS); ssw.push(1 - wT - wS, wT * fw, wT * (1 - fw), wS); }   // the sides: between their own front and back bones
      } else {
        const f = Math.min(1, Math.abs(x) / rx * 1.5), wT = Math.pow(t, 0.9) * 0.82 * f;
        ssi.push(iP, Math.sign(x) === lSide ? iL : iR, 0, 0); ssw.push(1 - wT, wT, 0, 0);
      }
    }
    const ix = [];
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < SEG; k++) { const a = r * (SEG + 1) + k, b = a + SEG + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
    sg = cache[key] = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ssi, 4)); sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ssw, 4)); sg.setIndex(ix); sg.computeVertexNormals();
  }
  const sk = new THREE.SkinnedMesh(sg, mat(fem ? 0.92 : 1)); sk.name = fem ? 'dressSkirt' : 'dressKilt';
  sk.castShadow = sk.receiveShadow = true; sk.frustumCulled = false;
  body.parent.add(sk); sk.updateMatrixWorld(true);
  const rig = two ? skirtRig(bones) : null;                          // SENA-LOOK r3: four drape bones under the pelvis
  sk.bind(new THREE.Skeleton(rig ? [...body.skeleton.bones, ...rig.bones] : body.skeleton.bones));   // inverses from the rest pose (now)
  if (rig) out.rig = rig.update;
  out.skirt = sk; out.parts.push(sk);
  if (two) out.parts.push(...senaTrinkets(bones));     // SENA-LOOK: bone-bead necklace and arm cords
  return out;
}
// SENA-LOOK r2/r3 (verifier): the skirt's top edge. SENA_WAIST: the front's base height, as a fraction of the way from
// the pelvis joint up to the first spine joint. SENA_RISE (metres): [all round, over the hips, more toward the back].
const SENA_WAIST = 0.72, SENA_RISE = [0.03, 0.06, 0.03];
// SENA-LOOK r3: the short skirt's drape. Skinned straight to the thighs, a short skirt either lets a lifted thigh
// through its front (front on the pelvis) or opens like an umbrella round it (all on the thigh). Hide hangs: the
// front is lifted by whichever thigh is further forward, the back is pushed by whichever is further back, and the
// cloth runs taut between. Four bones under the pelvis, pivoted at the hip joints, do that: front L/R take the
// forward swing of the leading thigh (their own thigh's in full, SENA_DRAPE of the way to the other's when that leads),
// back L/R the same toward the trailing thigh; each takes its own thigh's sideways spread (riding). Seated, both
// thighs are forward, so the whole skirt goes with them. update() runs as a late bone override.
const SENA_WF = 0.96, SENA_DRAPE = 0.7, SENA_LAP = [0.8, 1.15, 0.03], SENA_SEATC = 0.85;   // SENA-SIT A3: SEATC (front centre, seated)
function skirtRig(bones) {
  const pel = bones.pelvis, th = [bones.thigh_l, bones.thigh_r], V = THREE.Vector3;
  pel.updateWorldMatrix(true, false);
  const pq = pel.getWorldQuaternion(new THREE.Quaternion()).invert();
  const U = new V(0, 1, 0).applyQuaternion(pq), Z = new V(0, 0, 1).applyQuaternion(pq); Z.addScaledVector(U, -Z.dot(U)).normalize();
  const X = new V().crossVectors(U, Z), side = th.map((t) => Math.sign(t.position.dot(X)) || 1);
  const d0 = th.map((t) => { const c = t.children.find((o) => o.isBone) || t; return c.position.clone().normalize(); }), d = new V();
  const read = (i, q) => { d.copy(d0[i]).applyQuaternion(q); return [Math.atan2(d.dot(Z), -d.dot(U)), Math.asin(Math.max(-1, Math.min(1, d.dot(X) * side[i])))]; };
  const rest = th.map((t, i) => read(i, t.quaternion));
  const mk = (i, nm) => { const b = new THREE.Bone(); b.name = nm; b.position.copy(th[i].position); pel.add(b); b.updateWorldMatrix(true, false); return b; };
  const rb = [mk(0, 'skirt_fl'), mk(1, 'skirt_fr'), mk(0, 'skirt_bl'), mk(1, 'skirt_br')], qa = new THREE.Quaternion();
  // The cloth stands off the thigh at rest, so swung as far as the thigh it would stand off it still (a collar over
  // the lap when seated). A forward swing is scaled (dir < 0, the front: a little less, so the hem comes down on the
  // thigh; dir > 0, the back: a little more, so it closes up under it) and the bone lifts a little along its own
  // forward, which keeps the top of the thigh under the cloth near the hip.
  // SENA-SIT A3: the fifth bone, front centre, between the hip joints (see the skirt's front weights)
  const fc = new THREE.Bone(); fc.name = 'skirt_fc'; fc.position.copy(th[0].position).add(th[1].position).multiplyScalar(0.5); pel.add(fc); fc.updateWorldMatrix(true, false); rb.push(fc);
  const fcP = fc.position.clone(), sm01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  // SENA-SIT A3: the front's scale eases in with the swing (verifier A3: at a walk the leading thigh came through the
  // front panel, which swung only 0.8 of it): in full up to a stride's swing, 0.8 by a seat's.
  const lapF = (flex) => flex * (1 + (SENA_LAP[0] - 1) * sm01((flex - 0.55) / 0.6));
  const zr = new V(), set = (b, i, flex, abd, dir, p = th[i].position) => {
    const fl = flex > 0 ? (dir < 0 ? lapF(flex) : flex * SENA_LAP[1]) : flex;
    b.quaternion.setFromAxisAngle(X, -fl); if (abd) b.quaternion.multiply(qa.setFromAxisAngle(Z, side[i] * abd));
    b.position.copy(p); if (flex > 0) b.position.addScaledVector(zr.copy(Z).applyQuaternion(b.quaternion), SENA_LAP[2] * Math.sin(Math.min(flex, Math.PI / 2)));
  };
  const update = () => {
    const a = read(0, th[0].quaternion), b = read(1, th[1].quaternion), f = [a[0] - rest[0][0], b[0] - rest[1][0]], ab = [a[1] - rest[0][1], b[1] - rest[1][1]];
    const hi = Math.max(f[0], f[1]), lo = Math.min(f[0], f[1]), ff = [0, 0];
    for (let i = 0; i < 2; i++) { ff[i] = f[i] + (hi - f[i]) * SENA_DRAPE; set(rb[i], i, ff[i], ab[i], -1); set(rb[2 + i], i, f[i] + (lo - f[i]) * SENA_DRAPE, ab[i], 1); }
    // front centre: the front bones' average swing; seated (the trailing thigh well forward too) it lets the middle
    // hang from the belt between the knees (SENA_SEATC of the swing taken off), a fold of hide over the lap's gap
    set(fc, 0, (ff[0] + ff[1]) / 2 * (1 - SENA_SEATC * sm01((lo - 0.6) / 0.6)), 0, -1, fcP);
  };
  return { bones: rb, update };
}
// SENA-LOOK: a strand of bone and amber beads at the throat, and braided hide cords on both upper arms.
function senaTrinkets(bones) {
  const parts = [], bead = new THREE.SphereGeometry(0.0085, 8, 6), tooth = new THREE.ConeGeometry(0.006, 0.026, 6);
  const bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.6 }), amber = new THREE.MeshStandardMaterial({ color: 0xc27a22, roughness: 0.35 }), cord = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 });
  const neck = bones.neck_01, nw = neck.getWorldPosition(new THREE.Vector3()), s3 = bones.spine_03.getWorldPosition(new THREE.Vector3());
  const g = new THREE.Group(), cy = nw.y - (nw.y - s3.y) * 0.35, cz = nw.z + 0.015, R = 0.068;
  g.name = 'senaLace'; g.position.copy(nw);           // SENA-LOOK A3: pivots at the neck joint (laceRest below turns it)
  // SENA-LOOK A3: built round the bind-pose neck, the strand sat inside her chest in every real pose (the clips carry the
  // neck forward of the bind pose); tipped back 0.38 rad about the joint it lies on her collarbones and upper chest.
  g.userData.base = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.38);
  for (let k = 0; k < 22; k++) {
    const a = -Math.PI * 0.95 + (k / 21) * Math.PI * 1.9, x = Math.sin(a) * R, z = Math.cos(a) * R * 0.9, drop = Math.max(0, Math.cos(a)) * 0.05;
    const m = new THREE.Mesh(k === 11 ? tooth : bead, k % 4 === 1 ? amber : bone);
    m.position.set(x, cy - drop - nw.y, cz + z - 0.01 - nw.z); if (k === 11) m.rotation.x = Math.PI;
    g.add(m);
  }
  scene_attach(neck, g); parts.push(g);
  for (const side of ['l', 'r']) {
    const ua = bones['upperarm_' + side], lo = bones['lowerarm_' + side]; if (!ua || !lo) continue;
    const a = ua.getWorldPosition(new THREE.Vector3()), b = lo.getWorldPosition(new THREE.Vector3()), c = a.clone().lerp(b, 0.42);
    const band = new THREE.Mesh(new THREE.TorusGeometry(a.distanceTo(b) * 0.2, 0.006, 6, 18), cord);
    band.position.copy(c); band.lookAt(b); scene_attach(ua, band); parts.push(band);
  }
  return parts;
}
const _laceI = new THREE.Quaternion();
function scene_attach(boneObj, o) { boneObj.updateWorldMatrix(true, false); boneObj.attach(o); o.castShadow = true; }
