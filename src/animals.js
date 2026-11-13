import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { prepModel } from './gore.js';   // GORE: per-instance materials with the wound shader

// Animated animals: Quaternius Ultimate Animated Animals (CC0).
const SCALE = { deer: 0.36, stag: 0.4, wolf: 0.34, fox: 0.21, cow: 0.4, horse: 0.48, horse_white: 0.48, donkey: 0.46,   // WP4 horses
  aurochs: 0.44, bear: 0.0105 };                    // CMB: aurochs = Quaternius Bull (CC0); cave bear = Running Brown Bear (Google, CC-BY 3.0), cm units
const EXT = { horse: 'glb', horse_white: 'glb', donkey: 'glb', aurochs: 'glb', bear: 'glb' };
const FILE = { aurochs: 'bull' };                   // CMB: kind -> file name
const lib = {};

export async function loadAnimals() {
  const loader = new GLTFLoader();
  await Promise.all(Object.keys(SCALE).map(async (k) => {
    const g = await loader.loadAsync(`/models/animals/${FILE[k] || k}.${EXT[k] || 'gltf'}`);   // CMB FILE
    g.scene.traverse((o) => { if (o.isMesh) { o.material.roughness = 0.95; o.material.metalness = 0; } });
    // WP4: some files carry every clip twice ('Idle' and 'AnimalArmature|Idle'); keep the first of each name
    const seen = new Set();
    g.animations = g.animations.filter((c) => {
      c.name = c.name.includes('|') ? c.name.split('|').pop() : c.name;
      if (seen.has(c.name)) return false;
      seen.add(c.name); return true;
    });
    lib[k] = g;
  }));
}

export function makeAnimal(kind, scale = SCALE[kind]) {
  if (kind === 'bear') return makeBear(scale);      // CMB: morph-target bear behind the same {root, model, play, update} API
  const model = SkeletonUtils.clone(lib[kind].scene);
  model.scale.setScalar(scale);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  prepModel(model, 'quad');                          // GORE: clone each material per instance (wounds stay on one animal), then patch it
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clips = lib[kind].animations;
  const find = (name) => clips.find((c) => c.name === name) || clips.find((c) => c.name.startsWith(name)) || clips.find((c) => c.name.startsWith('Idle'));
  let cur = null, curName = '';
  const a = {
    root, kind, model, bone: (n) => model.getObjectByName(n),
    // once: true plays a single time and returns to nothing; 'hold' freezes on the last frame (death).
    play(name, once = false, speed = 1) {
      if (name === curName && !once && cur.isRunning()) { cur.timeScale = speed; return; }   // a finished one-shot restarts as a loop
      const next = mixer.clipAction(find(name));
      next.reset(); next.timeScale = speed;
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once === 'hold';
      next.fadeIn(0.2).play();
      if (cur && cur !== next) cur.fadeOut(0.2);
      cur = next; curName = name;
    },
    get clip() { return curName; },
    get busy() { return !!cur && cur.loop === THREE.LoopOnce && cur.isRunning(); },
    update(dt) { mixer.update(dt); },
  };
  a.play('Idle');
  return a;
}

// ---------- CMB cave bear ----------
// The Running Brown Bear has no skeleton: one 22-target morph run cycle (0.875 s). Everything else is procedural:
// idle (cycle paused, breathing), walk/trot/run (cycle speed), rear up (pitch about the hind feet), swipe (a lunge
// with the forequarters), hit flinch, and death (the cycle freezes, then the body topples onto its side; the
// topple angle follows θ'' = 9·sin(θ + 0.1) up to 85°). Same API as makeAnimal: {root, kind, model, bone, play, clip, busy, update}.
// Extra controls for the brain: a.rear (0..1 target), a.swipe() (one swing), a.topple (read-only angle), a.mesh.
function makeBear(scale) {
  const src = lib.bear;
  const model = src.scene.clone(true);
  let mesh = null;
  model.traverse((o) => { if (o.isMesh) { mesh = o; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; o.material = o.material.clone(); o.material.vertexColors = true; o.material.roughness = 0.95; o.material.metalness = 0; } });
  model.scale.setScalar(scale);
  // body length 2.19 m at scale 1 cm: hind feet at local z -1.05 m (scaled); rear/swipe pivot there
  const half = 105 * scale;
  const roll = new THREE.Group(), pitch = new THREE.Group(), body = new THREE.Group();
  pitch.position.z = -half; body.position.z = half;
  body.add(model); pitch.add(body); roll.add(pitch);
  const root = new THREE.Group(); root.add(roll);
  const mixer = new THREE.AnimationMixer(model);
  const run = mixer.clipAction(src.animations[0]); run.play();
  let mode = 'Idle', speed = 1, once = false, t = 0, flinch = 0, swipeT = 0, dead = false, th = 0, thv = 0;
  const a = {
    root, kind: 'bear', model, mesh, bone: () => null, rear: 0, rearW: 0,
    play(name, o = false, sp = 1) {
      if (dead && name !== 'Death') return;
      if (name === 'Death') { dead = true; mode = 'Death'; th = 0; thv = 0; return; }
      if (/HitReact/.test(name)) { flinch = 0.35; return; }
      if (name === 'Attack') { a.swipe(); return; }
      mode = name; speed = sp; once = o;
    },
    swipe() { swipeT = 0.7; },
    get clip() { return mode; },
    get busy() { return swipeT > 0 || flinch > 0; },
    get topple() { return th; },
    get dead() { return dead; },
    update(dt) {
      t += dt;
      // the run cycle: frozen mid-stride when idle, slow for a walk, full for a gallop
      const ts = dead ? 0 : mode === 'Gallop' || mode === 'Run' ? Math.max(0.6, speed) : mode === 'Walk' ? 0.45 * speed : 0;
      run.timeScale = ts;
      mixer.update(dt);
      // rear up: ease toward the target, pitch the body up about the hind feet
      a.rearW += ((dead ? 0 : a.rear) - a.rearW) * Math.min(1, dt * 3.2);
      let px = -a.rearW * 1.05;
      if (swipeT > 0) { swipeT = Math.max(0, swipeT - dt); const k = 1 - swipeT / 0.7; px += -Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.35; body.rotation.y = Math.sin(k * Math.PI * 2) * 0.22; } else body.rotation.y *= 0.9;
      if (flinch > 0) { flinch = Math.max(0, flinch - dt); px += Math.sin((flinch / 0.35) * Math.PI) * 0.08; }
      if (!dead && mode !== 'Gallop' && mode !== 'Walk') { const br = Math.sin(t * 1.7) * 0.012; body.scale.set(1 + br, 1 + br, 1); } else body.scale.set(1, 1, 1);   // breathing
      pitch.rotation.x = px;
      if (dead) {                                    // topple onto the right side
        if (th < 1.48) { thv += 9 * Math.sin(th + 0.1) * dt; th = Math.min(1.48, th + thv * dt); if (th >= 1.48) thv = 0; }
        roll.rotation.z = -th; roll.position.y = Math.sin(th) * 0.32 * (scale / 0.0105);
      }
    },
  };
  return a;
}
