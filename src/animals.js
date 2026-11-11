import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Animated animals: Quaternius Ultimate Animated Animals (CC0).
const SCALE = { deer: 0.36, stag: 0.4, wolf: 0.34, fox: 0.21, cow: 0.4 };
const lib = {};

export async function loadAnimals() {
  const loader = new GLTFLoader();
  await Promise.all(Object.keys(SCALE).map(async (k) => {
    const g = await loader.loadAsync(`/models/animals/${k}.gltf`);
    g.scene.traverse((o) => { if (o.isMesh) { o.material.roughness = 0.95; o.material.metalness = 0; } });
    lib[k] = g;
  }));
}

export function makeAnimal(kind) {
  const model = SkeletonUtils.clone(lib[kind].scene);
  model.scale.setScalar(SCALE[kind]);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clips = lib[kind].animations;
  const find = (name) => clips.find((c) => c.name === name) || clips.find((c) => c.name.startsWith(name)) || clips.find((c) => c.name.startsWith('Idle'));
  let cur = null, curName = '';
  const a = {
    root, kind,
    // once: true plays a single time and returns to nothing; 'hold' freezes on the last frame (death).
    play(name, once = false, speed = 1) {
      if (name === curName && !once) { cur.timeScale = speed; return; }
      const next = mixer.clipAction(find(name));
      next.reset(); next.timeScale = speed;
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once === 'hold';
      next.fadeIn(0.2).play();
      if (cur && cur !== next) cur.fadeOut(0.2);
      cur = next; curName = name;
    },
    get clip() { return curName; },
    update(dt) { mixer.update(dt); },
  };
  a.play('Idle');
  return a;
}
