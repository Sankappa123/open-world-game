import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSpear, makeAxe } from './entities.js';

// Rigged human models, hair and animations: Quaternius (CC0). See public/models/CREDITS.txt.
const LOOPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', sneakIdle: 'Crouch_Idle_Loop', sneak: 'Crouch_Fwd_Loop', swim: 'Swim_Fwd_Loop', swimIdle: 'Swim_Idle_Loop', jump: 'Jump_Loop' };
const SHOTS = { use: 'Interact', strike: 'Sword_Attack', jab: 'Punch_Jab', cross: 'Punch_Cross' };
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
    for (const [key, name] of Object.entries({ ...LOOPS, ...SHOTS })) {
      const src = anims.animations.find((a) => a.name === name);
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
  for (const key in LOOPS) { act[key] = mixer.clipAction(lib.clips[who][key]); act[key].play(); act[key].setEffectiveWeight(key === 'idle' ? 1 : 0); w[key] = key === 'idle' ? 1 : 0; }
  for (const key in SHOTS) { act[key] = mixer.clipAction(lib.clips[who][key]); act[key].setLoop(THREE.LoopOnce); act[key].clampWhenFinished = false; }
  for (const key in act) act[key].time = Math.random() * 0.5;
  let shot = null, shotW = 0;

  const h = { root, spear, axe, grip, bones, crouch: 0 };
  h.swing = (kind = 'use') => {
    shot = act[kind];
    for (const key in SHOTS) act[key].stop();
    shot.reset(); shot.timeScale = kind === 'use' ? 1.5 : 1.7; shot.play();
  };
  h.animate = (dt, speed, crouch = false, swim = false, air = false) => {
    const moving = speed > 0.1;
    const state = air ? 'jump' : swim ? (moving ? 'swim' : 'swimIdle') : crouch ? (moving ? 'sneak' : 'sneakIdle') : !moving ? 'idle' : speed > 5.6 ? 'sprint' : speed > 2.4 ? 'run' : 'walk';
    h.crouch += ((crouch ? 1 : 0) - h.crouch) * Math.min(1, dt * 8);
    if (shot && (!shot.isRunning() || shot.time > shot.getClip().duration - 0.25)) shot = null;
    shotW += ((shot ? 1 : 0) - shotW) * Math.min(1, dt * 12);
    for (const key in LOOPS) {
      w[key] += ((key === state ? 1 : 0) - w[key]) * Math.min(1, dt * 9);
      act[key].setEffectiveWeight(w[key] * (1 - shotW * 0.92));
    }
    for (const key in SHOTS) act[key].setEffectiveWeight(act[key] === shot ? shotW : 0);
    if (PACE[state]) act[state].timeScale = THREE.MathUtils.clamp(speed / PACE[state], 0.7, 1.5);
    mixer.update(dt);
  };
  return h;
}
