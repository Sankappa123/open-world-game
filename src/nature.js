import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Trees, rocks, bushes, grass and flowers: Quaternius Stylized Nature MegaKit (CC0).
export const NAT = {};
export const wind = { value: 0 };
const NAMES = ['commontree_3', 'commontree_4', 'commontree_5', 'pine_2', 'pine_4', 'pine_5', 'rock_medium_1', 'rock_medium_2', 'rock_medium_3',
  'bush_common', 'grass_common_short', 'grass_wispy_short', 'flower_3_single', 'flower_4_single', 'fern_1', 'clover_1', 'plant_1', 'plant_7_big', 'mushroom_common'];
const SWAY = { Grass: 0.085, Leaves: 0.05, Flowers: 0.05, Leaves_NormalTree: 0.012, Leaves_Pine: 0.01, Leaves_TwistedTree: 0.02 };
const mats = new Map();

function prepare(m) {
  if (mats.has(m.name)) return mats.get(m.name);
  mats.set(m.name, m);
  m.vertexColors = false; m.roughness = 1; m.metalness = 0;
  if (m.map) m.map.anisotropy = 4;
  const sway = SWAY[m.name];
  if (sway == null) return m;
  // Foliage: light both faces the same, cut out by alpha, and sway in the wind.
  m.side = THREE.DoubleSide; m.transparent = false; m.alphaTest = 0.4; m.normalMap = null;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
       float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
       float wgt = ${sway.toFixed(3)} * max(position.y, 0.0);
       transformed.x += (sin(uTime * 1.6 + ph) + sin(uTime * 0.55 + ph * 0.4) * 0.7) * wgt;
       transformed.z += cos(uTime * 1.25 + ph) * wgt * 0.6;
       #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  return m;
}

export async function loadNature() {
  const loader = new GLTFLoader();
  await Promise.all(NAMES.map(async (n) => {
    const g = await loader.loadAsync('/models/nature/' + n + '.gltf');
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geo.deleteAttribute('color');
      parts.push({ geo, mat: prepare(o.material) });
    });
    NAT[n] = parts;
  }));
  NAT.bush_common[0].mat = mats.get('Leaves_NormalTree');     // green leaves instead of the pack's red ones
  mats.get('Grass').color.set(0x86a84e);
}
