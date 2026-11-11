import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

// Tree trunks come with ~3000 triangles each. The models are full of texture seams, so an attribute-aware
// simplifier barely touches them; instead vertices are welded by position only, the index is simplified, and each
// result index maps back to one of the original vertices (the noisy bark texture hides the tiny UV shifts).
async function simplifyTrunk(geo, keep = 0.32) {
  await MeshoptSimplifier.ready;
  const pos = geo.attributes.position, n = pos.count, seen = new Map(), remap = new Uint32Array(n), back = [], uniq = [];
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = seen.get(k);
    if (j === undefined) { j = uniq.length / 3; seen.set(k, j); uniq.push(pos.getX(i), pos.getY(i), pos.getZ(i)); back.push(i); }
    remap[i] = j;
  }
  const src = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  const index = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) index[i] = remap[src[i]];
  const target = Math.max(3, Math.floor((index.length * keep) / 3) * 3);
  const [res] = MeshoptSimplifier.simplify(index, new Float32Array(uniq), 3, target, 0.05, []);
  const out = new Uint32Array(res.length);
  for (let i = 0; i < res.length; i++) out[i] = back[res[i]];
  const g = geo.clone();
  g.setIndex(new THREE.BufferAttribute(out, 1));
  return g;
}
export const DEBUG = { simplifyTrunk };

// Trees, rocks, bushes, grass and flowers: Quaternius Stylized Nature MegaKit (CC0).
export const NAT = {};
export const wind = { value: 0 };
const NAMES = ['commontree_1', 'commontree_2', 'commontree_3', 'commontree_4', 'commontree_5', 'pine_1', 'pine_2', 'pine_3', 'pine_4', 'pine_5',
  'twistedtree_2', 'twistedtree_4', 'deadtree_2', 'deadtree_4', 'rock_medium_1', 'rock_medium_2', 'rock_medium_3', 'pebble_round_1', 'pebble_round_2', 'pebble_round_3',
  'bush_common', 'bush_common_flowers', 'grass_common_short', 'grass_wispy_short', 'grass_common_tall', 'grass_wispy_tall',
  'flower_3_single', 'flower_4_single', 'flower_3_group', 'flower_4_group', 'fern_1', 'clover_1', 'plant_1', 'plant_1_big', 'plant_7_big', 'mushroom_common'];
const SWAY = { Grass: 0.085, Leaves: 0.05, Flowers: 0.05, Leaves_NormalTree: 0.012, Leaves_Pine: 0.01, Leaves_TwistedTree: 0.02 };
const mats = new Map();

// Foliage sways in the wind and is lit the same on both faces. Instance colours tint it (grass fades into the
// ground colour that way) and the far end of each patch sinks into the ground instead of popping.
export function windShader(sway, fade = false) {
  return (sh) => {
    sh.uniforms.uTime = wind;
    if (fade) sh.uniforms.uFade = fade;
    sh.vertexShader = 'uniform float uTime;\n' + (fade ? 'uniform vec2 uFade;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
       float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
       float wgt = ${sway.toFixed(3)} * max(position.y, 0.0);
       float gust = sin(uTime * 0.7 + instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.08) * 0.5 + 0.5;
       transformed.x += (sin(uTime * 1.6 + ph) + sin(uTime * 0.55 + ph * 0.4) * 0.7 + gust * 1.2) * wgt;
       transformed.z += cos(uTime * 1.25 + ph) * wgt * 0.6;
       ${fade ? 'float dcam = distance(instanceMatrix[3].xz, cameraPosition.xz); transformed.y *= 1.0 - smoothstep(uFade.x, uFade.y, dcam);' : ''}
       #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
}

function prepare(m) {
  if (mats.has(m.name)) return mats.get(m.name);
  const sway = SWAY[m.name];
  if (sway == null) {
    m.vertexColors = false; m.roughness = 1; m.metalness = 0;
    if (m.map) m.map.anisotropy = 4;
    mats.set(m.name, m);
    return m;
  }
  // Leaves and grass: a cheaper lighting model (they are mostly overdraw), cut out by alpha, both faces lit alike.
  const l = new THREE.MeshLambertMaterial({ name: m.name, map: m.map, color: m.color, side: THREE.DoubleSide, alphaTest: 0.4 });
  if (l.map) l.map.anisotropy = 4;
  l.onBeforeCompile = windShader(sway);
  l.customProgramCacheKey = () => 'foliage-' + m.name;
  mats.set(m.name, l);
  return l;
}

export async function loadNature() {
  const loader = new GLTFLoader();
  await Promise.all(NAMES.map(async (n) => {
    const g = await loader.loadAsync('/models/nature/' + n + '.gltf');
    g.scene.updateMatrixWorld(true);
    const parts = [];
    const meshes = [];
    g.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geo.deleteAttribute('color');
      const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (/^Bark/.test(o.material.name) && tris > 900) {
        try { geo = await simplifyTrunk(geo); } catch (e) { console.warn('simplify failed', n, e); }
      }
      parts.push({ geo, mat: prepare(o.material) });
    }
    NAT[n] = parts;
  }));
  for (const p of NAT.bush_common) if (p.mat.name === 'Leaves_TwistedTree') p.mat = mats.get('Leaves_NormalTree');   // green leaves instead of the pack's red ones
  mats.get('Grass').color.set(0x8fb052);
  mats.get('Leaves').color.set(0xa9c86a);
  // The pack's twisted-tree leaves are pure red; repaint the texture to a golden autumn orange.
  const tw = mats.get('Leaves_TwistedTree');
  tw.color.set(0xffffff);
  const src = tw.map?.image;
  if (src && src.width) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2]; d[i] = Math.min(255, r * 1.05); d[i + 1] = Math.min(255, gg * 0.6 + r * 0.42); d[i + 2] = Math.min(255, b * 0.5 + r * 0.06); }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.flipY = tw.map.flipY; t.colorSpace = tw.map.colorSpace; t.wrapS = tw.map.wrapS; t.wrapT = tw.map.wrapT; t.anisotropy = 4;
    tw.map = t; tw.needsUpdate = true;
  }
}
