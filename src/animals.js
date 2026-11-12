import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Animated animals: Quaternius Ultimate Animated Animals (CC0).
const SCALE = { deer: 0.36, stag: 0.4, wolf: 0.34, fox: 0.21, cow: 0.4, horse: 0.48, horse_white: 0.48, donkey: 0.46 };   // WP4 horses
const EXT = { horse: 'glb', horse_white: 'glb', donkey: 'glb' };
const lib = {};

export async function loadAnimals() {
  const loader = new GLTFLoader();
  await Promise.all(Object.keys(SCALE).map(async (k) => {
    const g = await loader.loadAsync(`/models/animals/${k}.${EXT[k] || 'gltf'}`);
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
  const model = SkeletonUtils.clone(lib[kind].scene);
  model.scale.setScalar(scale);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
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
