// ---------- GORE: blood, wounds, dismemberment, screen blood (spec_mature.md M2, §12) ----------
// Engine-side half of the GORE package: pooled blood drops and mist, terrain-aligned ground splats (instanced),
// static decals on walls and cave rock, the bind-space wound shader for skinned bodies (animals and people),
// dismemberment (severed limbs and heads with stump caps and spurts), carcasses, and the DOM screen blood.
// The game-coupled half (hit zones, wounded prey, butchering, Hunter's Focus, sounds) is the "GORE" section of main.js.
//
// CONTENT GUARDRAILS (spec §2 as updated by §12; binding on every package):
// - Romance is strictly non-explicit: hand-holding, embrace, kiss, resting together clothed. Intimacy cuts or fades to
//   black at the embrace, then the next morning. No sex scenes, sexual sounds/text, nudity, undressing or underwear meshes.
// - No sexual violence or threat of it, anywhere.
// - Children (Lio, Pell, any child) are never harmed, targeted, endangered on screen or shown dead; no gore near them.
//   (main.js suppresses dismemberment, carcass flesh and heavy bursts while a child is within 20 m.)
// - Violence: combat and hunting violence at full 21+ intensity (blood, wounds, dismemberment of raiders, predators and
//   prey on heavy and finisher kills). No torture mechanics, no prolonged cruelty to the helpless as spectacle; close-ups
//   are short (the butcher and mercy cameras are brief cuts), a surrendered raider dies only by an explicit choice.
// - The death of a main character is non-graphic: on 'died' every wound, screen splat and nearby ground blood is cleared.
// - Settings always win: Blood off swaps every blood visual for dust and brown scuffs (mechanics unchanged), Gore low
//   halves the pools, drops decals and dismemberment, Screen blood off hides every screen effect.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ----- pure tables (unit-tested in node: scratchpad/tests/gore/unit.mjs)
export const LEVEL = {                                   // setGore multipliers per gore level
  low: { part: 0.4, size: 0.7, u: 0.5 },
  med: { part: 1, size: 1, u: 0.8 },
  high: { part: 1.8, size: 1.3, u: 1 },
};
export const POOL = { drops: 384, splats: 160, decals: 24, mist: 10, pieces: 6, carcasses: 4 };
// Hit zones on prey (spec M2 task 2). u: -1 tail .. +1 nose along the body; v: 0 ground .. 1 top of the head.
export const ZONES = {
  head: { k: 3, bleed: 0, crit: true },
  heart: { k: 2, bleed: 0.5 },
  gut: { k: 0.8, bleed: 0.08 },
  leg: { k: 1, bleed: 0, limp: true },
};
export function zoneOf(u, v) {
  if (v < 0.36) return 'leg';
  if (u > 0.5 && v > 0.5) return 'head';                // front 25 % of the length, upper half
  if (u > 0.02 && u <= 0.5 && v <= 0.68) return 'heart';  // front-mid, lower: heart and lungs
  return 'gut';                                          // belly, back and hindquarters
}
// Particles per hit: 6 / 14 / 28 by level (×2 on a kill, ×1.3 heavy).
export function burstCount(level, kill = false, heavy = false) {
  const base = { low: 6, med: 14, high: 28 }[level] ?? 14;
  return Math.round(base * (kill ? 2 : 1) * (heavy ? 1.3 : 1));
}
// Distance between trail splats: heavier bleeding drips more often (lerp(2.5, 0.8, bleedNorm)).
export function trailStep(bleed) { const n = Math.min(1, Math.max(0, bleed / 0.5)); return 2.5 + (0.8 - 2.5) * n; }
// Hide quality from the kill: a clean kill gives a prime hide (+1); five or more hits tear it (-1, never below 0).
export function hideGrade(base, clean, hits) {
  if (clean) return { n: base + 1, grade: 'prime' };
  if (hits >= 5) return { n: Math.max(0, base - 1), grade: 'poor' };
  return { n: base, grade: 'good' };
}
// A clean kill: one hit to the head or heart, or a thrown spear from 12 m or more.
export function isClean(hits, zone, weapon, dist) {
  return hits === 1 && (zone === 'head' || zone === 'heart' || (weapon === 'thrown' && (dist || 0) >= 12));
}
// Heartbeat: beats per minute and opacity from health (shown below 35).
export function heartbeat(hp) {
  const k = Math.min(1, Math.max(0, 1 - hp / 35));
  return { bpm: 70 + 40 * k, amp: hp < 35 ? 0.25 + 0.5 * k : 0 };
}
// Segment ids for dismemberment, by rig. Bones under a sever root (and IK helpers by name) belong to it.
export const SEG = {
  quad: { roots: { 1: 'Neck2', 2: 'FrontUpperLeg.L', 3: 'FrontUpperLeg.R', 4: 'BackUpperLeg.L', 5: 'BackUpperLeg.R', 6: 'Tail2' },
    extra: [[/^(IKFrontLeg|FF|PoleTarget)\.L$/, 2], [/^(IKFrontLeg|FF|PoleTarget)\.R$/, 3], [/^(IKBackLeg|FFB|PoleTargetBack)\.L$/, 4], [/^(IKBackLeg|FFB|PoleTargetBack)\.R$/, 5]] },
  human: { roots: { 1: 'neck_01', 2: 'lowerarm_l', 3: 'lowerarm_r', 4: 'calf_l', 5: 'calf_r' }, extra: [] },
};
export const SEG_NAME = { quad: { 1: 'head', 2: 'front leg', 3: 'front leg', 4: 'hind leg', 5: 'hind leg', 6: 'tail' }, human: { 1: 'head', 2: 'arm', 3: 'arm', 4: 'leg', 5: 'leg' } };
export function segOfBone(bone, rig) {
  const R = SEG[rig]; if (!R) return 0;
  for (let b = bone; b && b.isBone; b = b.parent) for (const s in R.roots) if (b.name === R.roots[s]) return +s;
  for (const [re, s] of R.extra) if (re.test(bone.name)) return s;
  return 0;
}

// ----- state
const cfg = { blood: true, level: 'high', screen: true, quality: 'medium', reduceFlash: false, k: LEVEL.high, lowCut: false };
let scene = null, getH = (x, z) => 0, ready = false, now = 0;
const G = { uGore: { value: 1 }, uBloodOn: { value: 1 } };   // shared by every patched material
const counters = { screen: 0, bursts: 0, severed: 0 };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color(), _UP = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();
const rnd = Math.random;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// ----- textures (procedural: a splat atlas, a soft puff, screen splatter sprites)
function splatAtlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const blob = (x, y, r, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.72, `rgba(255,255,255,${a * 0.9})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
  for (let t = 0; t < 8; t++) {
    const ox = (t % 4) * 128, oy = Math.floor(t / 4) * 128, cx = ox + 64, cy = oy + 64;
    g.save(); g.beginPath(); g.rect(ox, oy, 128, 128); g.clip();
    if (t < 4) {                                         // impact splats: a lobed core, droplets thrown out, a few streaks
      for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, d = rnd() * 14; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 16 + rnd() * 14); }
      for (let i = 0; i < 26 + t * 4; i++) { const a = rnd() * 6.28, d = 22 + Math.pow(rnd(), 0.6) * 38; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + Math.pow(rnd(), 3) * 7); }
      for (let i = 0; i < 4; i++) { const a = rnd() * 6.28; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2 + rnd() * 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18); g.lineTo(cx + Math.cos(a) * (36 + rnd() * 20), cy + Math.sin(a) * (36 + rnd() * 20)); g.stroke(); }
    } else if (t < 6) {                                  // trail: a few round drips and a smear
      for (let i = 0; i < 5 + t; i++) blob(cx + (rnd() - 0.5) * 70, cy + (rnd() - 0.5) * 40, 4 + rnd() * 9);
      blob(cx, cy, 14, 0.8);
    } else if (t === 6) {                                // pool: smooth, lobed, fully opaque in the middle
      for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = rnd() * 16; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 30 + rnd() * 16); }
    } else {                                             // scuff: dusty, broken, half transparent (Blood off)
      for (let i = 0; i < 40; i++) blob(cx + (rnd() - 0.5) * 80, cy + (rnd() - 0.5) * 50, 3 + rnd() * 10, 0.35);
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function decalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const blob = (x, y, r) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
  for (let i = 0; i < 6; i++) blob(64 + (rnd() - 0.5) * 24, 56 + (rnd() - 0.5) * 24, 14 + rnd() * 10);
  for (let i = 0; i < 30; i++) { const a = rnd() * 6.28, d = 24 + rnd() * 34; blob(64 + Math.cos(a) * d, 56 + Math.sin(a) * d, 1.5 + Math.pow(rnd(), 3) * 6); }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 5; i++) { const x = 44 + rnd() * 40, w = 2 + rnd() * 3, h = 20 + rnd() * 40; g.fillRect(x, 60, w, h); blob(x + w / 2, 60 + h, w * 1.2); }   // runs down the wall
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Screen splatter sprites (dark arterial red, droplets, drips), 256 px each, drawn once.
function screenSprites() {
  const out = [];
  for (let k = 0; k < 5; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const blob = (x, y, r, a) => { const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r); gr.addColorStop(0, `rgba(150,14,10,${a})`); gr.addColorStop(0.6, `rgba(105,6,4,${a})`); gr.addColorStop(0.92, `rgba(60,0,0,${a * 0.95})`); gr.addColorStop(1, 'rgba(40,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
    for (let i = 0; i < 6; i++) blob(128 + (rnd() - 0.5) * 50, 120 + (rnd() - 0.5) * 50, 18 + rnd() * 22, 0.85);
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, d = 40 + Math.pow(rnd(), 0.7) * 80; blob(128 + Math.cos(a) * d, 120 + Math.sin(a) * d, 1.5 + Math.pow(rnd(), 3) * 9, 0.8); }
    for (let i = 0; i < 3 + k; i++) {                    // drips running down the lens
      const x = 90 + rnd() * 76, w = 3 + rnd() * 5, h = 30 + rnd() * 90;
      const gr = g.createLinearGradient(0, 120, 0, 120 + h); gr.addColorStop(0, 'rgba(110,6,4,0.85)'); gr.addColorStop(1, 'rgba(80,0,0,0.6)');
      g.fillStyle = gr; g.fillRect(x - w / 2, 120, w, h); blob(x, 120 + h, w * 0.9, 0.85);
    }
    out.push(c);
  }
  return out;
}

// ----- pools
let DR = null, SP = null, MIST = null, decalMat = null;
const decals = [], decalQ = [], pieces = [], emitters = [], carcasses = [];
function makeDrops() {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b0907, roughness: 0.22, metalness: 0, emissive: 0x160000 });
  const m = new THREE.InstancedMesh(geo, mat, POOL.drops);
  m.frustumCulled = false; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _m.makeScale(0, 0, 0); for (let i = 0; i < POOL.drops; i++) m.setMatrixAt(i, _m);
  m.visible = false; scene.add(m);
  const n = POOL.drops;
  return { m, n, p: new Float32Array(n * 3), v: new Float32Array(n * 3), r: new Float32Array(n), life: new Float32Array(n), live: new Uint8Array(n), splat: new Float32Array(n), i: 0, count: 0, dirty: false };
}
function makeSplats() {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: splatAtlas(), transparent: true, depthWrite: false, roughness: 0.35, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPulse = SPU.uPulse;
    sh.vertexShader = 'attribute vec3 aSp;\nvarying vec3 vSp;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
  vSp = aSp;
  vMapUv = vec2((uv.x + mod(aSp.x, 4.0)) * 0.25, (uv.y + 1.0 - floor(aSp.x / 4.0)) * 0.5);   // 4 x 2 atlas, row 0 on top`);
    sh.fragmentShader = 'uniform float uPulse;\nvarying vec3 vSp;\n' + sh.fragmentShader
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vSp.y;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.9, 0.18, vSp.z);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float br = max(vColor.r, max(vColor.g, vColor.b)); totalEmissiveRadiance += vColor * smoothstep(0.75, 1.1, br) * (0.35 + 0.35 * uPulse); }`);
  };
  mat.customProgramCacheKey = () => 'gore-splat';
  const n = POOL.splats, m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 1;
  _m.makeScale(0, 0, 0); for (let i = 0; i < n; i++) { m.setMatrixAt(i, _m); m.setColorAt(i, _c.setRGB(0, 0, 0)); }
  const aSp = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); aSp.setUsage(THREE.DynamicDrawUsage);
  m.geometry.setAttribute('aSp', aSp);
  m.visible = false; scene.add(m);
  return { m, aSp, n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), size: new Float32Array(n), s0: new Float32Array(n), s1: new Float32Array(n),
    gt: new Float32Array(n), gd: new Float32Array(n), rot: new Float32Array(n), kind: new Uint8Array(n), born: new Float32Array(n), age: new Float32Array(n),
    alpha: new Float32Array(n), trail: new Int32Array(n), seq: new Int32Array(n), live: new Uint8Array(n), focus: new Uint8Array(n), i: 0, count: 0, seqN: 0, t: 0 };
}
const SPU = { uPulse: { value: 0 } };
const KIND = { blood: 0, trail: 1, pool: 2, scuff: 3 };
const WET = [new THREE.Color(0x4a0606), new THREE.Color(0x4a0606), new THREE.Color(0x3e0404), new THREE.Color(0x5a4632)];
const DRY = [new THREE.Color(0x2a0d08), new THREE.Color(0x2a0d08), new THREE.Color(0x240a06), new THREE.Color(0x4e3d2c)];
function makeMist() {
  const tex = puffTexture(), list = [];
  for (let i = 0; i < POOL.mist; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x7a0c0c, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s); list.push({ s, t: 0, life: 0.4, v: new THREE.Vector3(), s0: 0.15, s1: 0.6 });
  }
  return { list, i: 0 };
}

// ----- init / settings
export function initGore(sc, heightFn, quality = 'medium') {
  scene = sc; getH = heightFn; cfg.quality = quality;
  DR = makeDrops(); SP = makeSplats(); MIST = makeMist();
  decalMat = new THREE.MeshStandardMaterial({ map: decalTexture(), color: 0x4a0606, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  ready = true; applyCaps();
}
export function setGore({ blood, gore, screenBlood, reduceFlash, quality } = {}) {
  if (blood !== undefined) cfg.blood = blood !== 'off' && blood !== false;
  if (gore !== undefined && LEVEL[gore]) cfg.level = gore;
  if (screenBlood !== undefined) cfg.screen = !!screenBlood;
  if (reduceFlash !== undefined) cfg.reduceFlash = !!reduceFlash;
  if (quality !== undefined) cfg.quality = quality;
  cfg.k = LEVEL[cfg.level];
  G.uGore.value = cfg.k.u; G.uBloodOn.value = cfg.blood ? 1 : 0;
  if (decalMat) decalMat.color.set(cfg.blood ? 0x4a0606 : 0x5a4632);
  applyCaps();
  return { ...cfg };
}
export const goreCfg = () => cfg;
// Gore low or quality low: half the drop and splat pools, no static decals, no dismemberment.
function lowMode() { return cfg.level === 'low' || cfg.quality === 'low'; }
let capDrops = POOL.drops, capSplats = POOL.splats;
function applyCaps() {
  if (!ready) return;
  const low = lowMode();
  capDrops = low ? POOL.drops / 2 : POOL.drops; capSplats = low ? POOL.splats / 2 : POOL.splats;
  for (let i = capDrops; i < DR.n; i++) if (DR.live[i]) killDrop(i);
  for (let i = capSplats; i < SP.n; i++) if (SP.live[i]) killSplat(i);
  if (low) while (decals.length) dropDecal();
}

// ----- drops
function killDrop(i) { DR.live[i] = 0; DR.count--; _m.makeScale(0, 0, 0); DR.m.setMatrixAt(i, _m); DR.dirty = true; }
function spawnDrop(x, y, z, vx, vy, vz, r, splatP) {
  let i = DR.i % capDrops; DR.i = i + 1;
  if (DR.live[i]) DR.count--;                           // the oldest drop is recycled
  DR.p[i * 3] = x; DR.p[i * 3 + 1] = y; DR.p[i * 3 + 2] = z; DR.v[i * 3] = vx; DR.v[i * 3 + 1] = vy; DR.v[i * 3 + 2] = vz;
  DR.r[i] = r; DR.life[i] = 2.5; DR.live[i] = 1; DR.splat[i] = splatP; DR.count++;
}
// A burst of blood around dir (a 35° cone, 2-5 m/s), with back-spatter toward the attacker and a puff of mist.
export function bloodBurst(pos, dir, n, { heavy = false, kill = false, spread = 0.61, speed = 1, mist = true, size = 1 } = {}) {
  if (!ready || !cfg.blood) return 0;
  counters.bursts++;
  const cnt = Math.min(capDrops, Math.max(1, Math.round(n)));
  _v2.copy(dir); if (_v2.lengthSq() < 1e-6) _v2.set(0, 0.3, 1); _v2.normalize();
  const sz = cfg.k.size * size;
  for (let k = 0; k < cnt; k++) {
    const back = rnd() < 0.3;                            // back-spatter out of the entry wound
    _v.copy(_v2); if (back) _v.negate();
    // a random direction inside the cone: tilt by up to `spread` around a random axis
    _v3.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(_v).normalize();
    _q.setFromAxisAngle(_v3, rnd() * spread * (back ? 1.3 : 1)); _v.applyQuaternion(_q);
    _v.y += 0.25 + rnd() * 0.35;                         // blood arcs up before it falls
    const sp = (2 + rnd() * 3) * speed * (heavy ? 1.25 : 1) * (back ? 0.6 : 1);
    spawnDrop(pos.x + (rnd() - 0.5) * 0.06, pos.y + (rnd() - 0.5) * 0.06, pos.z + (rnd() - 0.5) * 0.06, _v.x * sp, _v.y * sp, _v.z * sp,
      (0.008 + Math.pow(rnd(), 2.2) * 0.022) * sz * (kill ? 1.2 : 1), 0.35);
  }
  if (mist) puffMist(pos, _v2, heavy || kill ? 2 : 1);
  return cnt;
}
function puffMist(pos, dir, n) {
  for (let k = 0; k < n; k++) {
    const f = MIST.list[MIST.i++ % MIST.list.length];
    f.s.position.set(pos.x + (rnd() - 0.5) * 0.1, pos.y + (rnd() - 0.5) * 0.1, pos.z + (rnd() - 0.5) * 0.1);
    f.v.copy(dir).multiplyScalar(0.6 + rnd() * 0.6); f.v.y += 0.15;
    f.t = 0; f.life = 0.35 + rnd() * 0.2; f.s0 = 0.12 * cfg.k.size; f.s1 = (0.45 + rnd() * 0.3) * cfg.k.size;
    f.s.visible = true;
  }
}

// ----- ground splats
function killSplat(i) { SP.live[i] = 0; SP.count--; _m.makeScale(0, 0, 0); SP.m.setMatrixAt(i, _m); SP.m.instanceMatrix.needsUpdate = true; SP.aSp.setY(i, 0); SP.aSp.needsUpdate = true; }
function splatMatrix(i) {
  const x = SP.x[i], z = SP.z[i], e = 0.25;
  _v.set(getH(x - e, z) - getH(x + e, z), 2 * e, getH(x, z - e) - getH(x, z + e)).normalize();
  _q.setFromUnitVectors(_UP, _v); _q2.setFromAxisAngle(_UP, SP.rot[i]); _q.multiply(_q2);
  const s = SP.size[i];
  _m.compose(_v3.set(x, SP.y[i], z), _q, _s.set(s, 1, s)); SP.m.setMatrixAt(i, _m);
}
function splatColor(i) {
  const k = SP.kind[i], wet = Math.max(0, 1 - SP.age[i] / 120);
  _c.copy(DRY[k]).lerp(WET[k], wet);
  if (SP.focus[i]) _c.multiplyScalar(4);
  SP.m.setColorAt(i, _c);
}
// kind 'blood' | 'trail' | 'pool' | 'scuff'. o: {trail: id, grow: [to, seconds]}. Returns the splat index or -1.
export function groundSplat(x, z, size, kind = 'blood', o = {}) {
  if (!ready) return -1;
  if (!cfg.blood && kind !== 'scuff') kind = 'scuff';
  const y = getH(x, z); if (y < -0.3) return -1;        // blood in the river is carried away
  const i = SP.i % capSplats; SP.i = i + 1;
  if (!SP.live[i]) SP.count++;
  const k = KIND[kind] ?? 0;
  SP.x[i] = x; SP.z[i] = z; SP.y[i] = y + 0.025 + (SP.seqN % 7) * 0.0015;   // tiny offsets stop overlapping splats from z-fighting
  SP.rot[i] = rnd() * 6.2832; SP.kind[i] = k; SP.born[i] = now; SP.age[i] = 0; SP.alpha[i] = kind === 'scuff' ? 0.7 : 0.95;
  SP.trail[i] = o.trail || 0; SP.seq[i] = ++SP.seqN; SP.live[i] = 1; SP.focus[i] = 0;
  const sz = size * (kind === 'scuff' ? 1 : cfg.k.size);
  if (o.grow) { SP.s0[i] = sz; SP.s1[i] = o.grow[0] * cfg.k.size; SP.gt[i] = 0; SP.gd[i] = o.grow[1]; } else SP.gd[i] = 0;
  SP.size[i] = sz;
  const tile = k === 0 ? (rnd() * 4) | 0 : k === 1 ? 4 + ((rnd() * 2) | 0) : k === 2 ? 6 : 7;
  SP.aSp.setXYZ(i, tile, SP.alpha[i], 1); SP.aSp.needsUpdate = true;
  splatMatrix(i); splatColor(i);
  SP.m.instanceMatrix.needsUpdate = true; if (SP.m.instanceColor) SP.m.instanceColor.needsUpdate = true;
  SP.m.visible = true;
  return i;
}
export function trailCount(id) { if (!SP || !id) return 0; let n = 0; for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.trail[i] === id) n++; return n; }
// Remove ground blood near a point (the grief scene must never show blood).
export function clearSplatsNear(x, z, r) { if (!SP) return; for (let i = 0; i < SP.n; i++) if (SP.live[i] && Math.hypot(SP.x[i] - x, SP.z[i] - z) < r) killSplat(i); }

// ----- Hunter's Focus: trail splats near `center` glow (instanceColor ×4); returns info for the arrow and Sena's line.
let focusOn = false;
export function setFocus(on, center, r = 40) {
  focusOn = !!on;
  if (!SP) return null;
  let best = -1, bd = 1e9, changed = false;
  for (let i = 0; i < SP.n; i++) {
    if (!SP.live[i]) continue;
    const trailish = SP.trail[i] > 0;
    const f = on && trailish && Math.hypot(SP.x[i] - center.x, SP.z[i] - center.z) < r ? 1 : 0;
    if (f !== SP.focus[i]) { SP.focus[i] = f; splatColor(i); changed = true; }
    if (f) { const d = Math.hypot(SP.x[i] - center.x, SP.z[i] - center.z); if (d < bd) { bd = d; best = i; } }
  }
  if (changed && SP.m.instanceColor) SP.m.instanceColor.needsUpdate = true;
  if (best < 0) return null;
  // the trail's heading: from the nearest splat toward the next newer one of the same trail (the way the animal went)
  const id = SP.trail[best]; let nx = -1, ns = 1e12;
  for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.trail[i] === id && SP.seq[i] > SP.seq[best] && SP.seq[i] < ns) { ns = SP.seq[i]; nx = i; }
  const hx = nx >= 0 ? SP.x[nx] - SP.x[best] : 0, hz = nx >= 0 ? SP.z[nx] - SP.z[best] : 0;
  return { trail: id, x: SP.x[best], z: SP.z[best], dist: bd, head: nx >= 0 ? Math.atan2(hx, hz) : null };
}
export function splatBrightness(id) {                   // tests: mean max-channel brightness of a trail's instanceColor
  if (!SP?.m.instanceColor) return 0; const a = SP.m.instanceColor.array; let s = 0, n = 0;
  for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.trail[i] === id) { s += Math.max(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]); n++; }
  return n ? s / n : 0;
}
export function splatKinds(id) { const out = {}; if (!SP) return out; for (let i = 0; i < SP.n; i++) if (SP.live[i] && (!id || SP.trail[i] === id)) { const k = Object.keys(KIND)[SP.kind[i]]; out[k] = (out[k] || 0) + 1; } return out; }

// ----- static decals (walls, cave rock, landmark stones): queued, built one per frame, at most 24
export function staticDecal(mesh, point, normal, size = 0.5) {
  if (!ready || lowMode() || !mesh?.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return false;
  if (decalQ.length > 4) decalQ.shift();
  decalQ.push({ mesh, p: point.clone(), n: normal.clone(), size });
  return true;
}
function dropDecal() { const d = decals.shift(); if (!d) return; scene.remove(d); d.geometry.dispose(); }
function buildDecal() {
  const q = decalQ.shift(); if (!q) return;
  _v.copy(q.p).add(q.n);
  const helper = new THREE.Object3D(); helper.position.copy(q.p); helper.lookAt(_v); helper.rotateZ(rnd() * 0.6 - 0.3 + Math.PI);
  try {
    const geo = new DecalGeometry(q.mesh, q.p, helper.rotation, _v.set(q.size, q.size, q.size * 1.4));
    if (!geo.attributes.position || geo.attributes.position.count === 0) { geo.dispose(); return; }
    const m = new THREE.Mesh(geo, decalMat); m.renderOrder = 2; m.receiveShadow = true;
    scene.add(m); decals.push(m);
    while (decals.length > POOL.decals) dropDecal();
  } catch (err) { console.warn('[gore] decal failed', err?.message); }
}

// ----- the wound shader (bind space, pre-skinning), hands, dismemberment cut/keep masks, tribe paint
const REC = new WeakMap();                              // model -> {rig, meshes, body, u, wounds, cut, caps, bs}
const GLSL_NOISE = `
float goreH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float goreN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(goreH(i), goreH(i + vec3(1,0,0)), f.x), mix(goreH(i + vec3(0,1,0)), goreH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(goreH(i + vec3(0,0,1)), goreH(i + vec3(1,0,1)), f.x), mix(goreH(i + vec3(0,1,1)), goreH(i + vec3(1,1,1)), f.x), f.y), f.z); }
bool goreBit(float mask, float seg) { return mod(floor(mask / exp2(seg)), 2.0) >= 1.0; }`;
function newUniforms() {
  return { uW: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uWet: { value: new Float32Array(8) }, uWN: { value: 0 },
    uGore: G.uGore, uBloodOn: G.uBloodOn, uHands: { value: 0 }, uBS: { value: 1 }, uCut: { value: 0 }, uKeep: { value: 0 },
    uP: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uPN: { value: 0 }, uPC: { value: new THREE.Color(0x8c8a84) }, uFlesh: { value: 0 } };
}
function woundCompile(u, wounds) {
  return (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aSeg;\nattribute float aHand;\nvarying vec3 vGoreBind;\nflat varying float vGoreSeg;\nvarying float vGoreHand;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGoreBind = position; vGoreSeg = aSeg; vGoreHand = aHand;');
    let f = 'uniform float uCut, uKeep;\nflat varying float vGoreSeg;\nvarying vec3 vGoreBind;\nvarying float vGoreHand;\n'
      + (wounds ? 'uniform vec4 uW[8];\nuniform float uWet[8];\nuniform int uWN;\nuniform float uGore, uBloodOn, uHands, uBS, uFlesh;\nuniform vec4 uP[4];\nuniform int uPN;\nuniform vec3 uPC;\n' : '')
      + GLSL_NOISE + '\n' + sh.fragmentShader;
    f = f.replace('void main() {', `void main() {
  { float gs = floor(vGoreSeg + 0.5);
    if (uCut > 0.5 && goreBit(uCut, gs)) discard;
    if (uKeep > 0.5 && !goreBit(uKeep, gs)) discard; }`);
    if (wounds) {
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
  float goreWet = 0.0, goreM = 0.0;
  {
    vec3 bloodWet = vec3(0.30, 0.018, 0.014), bloodDry = vec3(0.17, 0.02, 0.012), dust = vec3(0.30, 0.235, 0.165);
    // tribe ash paint (CMB): rough patches around bone points
    for (int i = 0; i < 4; i++) { if (i >= uPN) break; vec3 q = (vGoreBind - uP[i].xyz) / uP[i].w;
      float d = length(q) + (goreN(q * 2.5 + 3.1) - 0.5) * 0.8; diffuseColor.rgb = mix(diffuseColor.rgb, uPC, (1.0 - smoothstep(0.6, 1.0, d)) * 0.8); }
    float core = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uWN) break;
      vec4 w = uW[i]; vec3 q = (vGoreBind - w.xyz) / w.w;
      float n = goreN(q * 2.6 + float(i) * 7.13) * 0.6 + goreN(q * 6.5 + 1.7) * 0.3;
      float d = length(q) + (n - 0.45) * 0.75;
      float m = 1.0 - smoothstep(0.5, 1.0, d);
      goreM = max(goreM, m); goreWet = max(goreWet, m * uWet[i]);
      core = max(core, 1.0 - smoothstep(0.08, 0.26, d));
    }
    vec3 bc = mix(bloodDry, bloodWet, goreWet / max(goreM, 0.001));
    if (uBloodOn < 0.5) { bc = dust; core = 0.0; goreWet = 0.0; }
    diffuseColor.rgb = mix(diffuseColor.rgb, bc * (1.0 - core * 0.6), goreM * uGore);
    // bloody hands (butchering): forearms down to the fingertips, patchy
    float hm = vGoreHand * uHands * (0.55 + 0.6 * goreN(vGoreBind * uBS * 22.0));
    hm = clamp(hm, 0.0, 1.0) * 0.92;
    diffuseColor.rgb = mix(diffuseColor.rgb, uBloodOn > 0.5 ? vec3(0.26, 0.016, 0.012) : dust, hm);
    goreWet = max(goreWet, hm * (uBloodOn > 0.5 ? 0.8 : 0.0));
    // a butchered carcass: skinned, raw flesh with fat and darker muscle
    if (uFlesh > 0.0) { float fn = goreN(vGoreBind * uBS * 9.0); vec3 flesh = mix(vec3(0.48, 0.09, 0.07), vec3(0.62, 0.42, 0.34), smoothstep(0.62, 0.8, fn));
      flesh = mix(flesh, vec3(0.28, 0.03, 0.025), smoothstep(0.35, 0.15, fn)); diffuseColor.rgb = mix(diffuseColor.rgb, flesh, uFlesh); goreWet = max(goreWet, uFlesh * 0.7); }
  }`);
      f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.22, goreWet * uGore);');
    }
    sh.fragmentShader = f;
  };
}
// Patch a (per-instance) material with the wound shader. Chains any onBeforeCompile already there (FPP masks).
// opts: {u: shared uniform set, wounds: false for eyes/hair (cut masks only), paint: [{p:[x,y,z], r}] in bind space}
export function patchWoundMaterial(mat, opts = {}) {
  if (!mat || mat._gore) return mat?._gore || null;
  const u = opts.u || newUniforms(), wounds = opts.wounds !== false;
  if (opts.paint) setPaint(u, opts.paint, opts.paintColor);
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  const ours = woundCompile(u, wounds);
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  mat.onBeforeCompile = function (sh, r) { if (hasPrev) prev.call(this, sh, r); ours(sh); };
  const base = hasPrev && prevKey !== THREE.Material.prototype.customProgramCacheKey ? prevKey.call(mat) : hasPrev ? prev.toString() : '';
  mat.customProgramCacheKey = () => base + '|gore' + (wounds ? 'W' : 'C');
  Object.defineProperty(mat, '_gore', { value: u, enumerable: false, configurable: true });
  mat.needsUpdate = true;
  return u;
}
function setPaint(u, list, color) {
  u.uPN.value = Math.min(4, list.length);
  list.slice(0, 4).forEach((p, i) => u.uP.value[i].set(p.p[0], p.p[1], p.p[2], p.r));
  if (color != null) u.uPC.value.set(color);
}
// Per-vertex attributes on a (shared) geometry: aSeg (sever segment of the dominant bone), aHand (hand + forearm weight).
function prepGeometry(mesh, rig) {
  const g = mesh.geometry;
  if (g.attributes.aSeg && g.userData.goreRig === rig) return;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton?.bones;
  const n = g.attributes.position.count, seg = new Float32Array(n), hand = new Float32Array(n);
  if (si && sw && bones) {
    const bs = bones.map((b) => segOfBone(b, rig));
    const hk = bones.map((b) => (/^(hand|thumb|index|middle|ring|pinky)_/.test(b.name) ? 1 : /^lowerarm_/.test(b.name) ? 0.55 : 0));
    for (let v = 0; v < n; v++) {
      let best = 0, bw = -1, h = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k), b = si.getComponent(v, k); if (w > bw) { bw = w; best = b; } h += w * (hk[b] || 0); }
      seg[v] = bs[best] || 0; hand[v] = h;
    }
  }
  g.setAttribute('aSeg', new THREE.BufferAttribute(seg, 1)); g.setAttribute('aHand', new THREE.BufferAttribute(hand, 1));
  g.userData.goreRig = rig;
}
const SKIP_MAT = /eye|hoove|nose|black|teeth|tongue|horn/i;
// Register a skinned model: clones every mesh material per instance (SkeletonUtils.clone shares them, so otherwise
// every deer would bleed together), prepares the vertex attributes and patches the materials. rig: 'quad' | 'human'.
export function prepModel(model, rig = 'quad', { clone = true, paint = null, paintColor = null, hands = null } = {}) {
  if (!model) return null;
  if (REC.has(model)) return REC.get(model);
  const u = newUniforms(); if (hands) u.uHands = hands;
  const meshes = []; let body = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    meshes.push(o);
    if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) body = o;
  });
  if (!body) {                                          // no skeleton (the CMB cave bear is one morph-target mesh): wounds live in mesh space
    model.traverse((o) => { if (o.isMesh && !body) body = o; });
    if (!body) return null;
    meshes.push(body); rig = 'mesh';
  }
  for (const o of meshes) {
    if (clone) o.material = o.material.clone();
    prepGeometry(o, rig);
    // the body (and, on animals, every fur/skin primitive) carries wounds; eyes, hair and hooves only the cut masks
    const wounds = rig === 'human' ? o === body : !SKIP_MAT.test(o.material.name || '');
    if (o.material._gore) continue;                     // already patched (shared uniforms are per model)
    patchWoundMaterial(o.material, { u, wounds });
  }
  if (paint) setPaint(u, paint, paintColor);
  const rec = { rig, meshes, body, u, wounds: [], cut: 0, caps: [], bs: bindScale(body) };
  u.uBS.value = rec.bs;
  REC.set(model, rec);
  return rec;
}
export const goreRec = (model) => REC.get(model) || null;
// World units per bind unit (the Quaternius people carry a ×100 armature scale).
function bindScale(body) {
  body.updateWorldMatrix(true, false);
  if (!body.skeleton) return body.matrixWorld.getMaxScaleOnAxis() || 1;
  const b = body.skeleton.bones[0], i = 0;
  b.updateWorldMatrix(true, false);
  _m.multiplyMatrices(body.matrixWorld, body.bindMatrixInverse).multiply(b.matrixWorld).multiply(body.skeleton.boneInverses[i]).multiply(body.bindMatrix);
  return _m.getMaxScaleOnAxis() || 1;
}
// Bind-space point of a bone (for tribe paint): bindMatrix⁻¹ · boneInverse⁻¹ · origin.
export function bonePaint(model, list) {
  const rec = REC.get(model); if (!rec) return [];
  const sk = rec.body.skeleton, out = [];
  for (const { bone, r } of list) {
    const i = sk.bones.findIndex((b) => b.name === bone); if (i < 0) continue;
    _m.copy(sk.boneInverses[i]).invert(); _m2.copy(rec.body.bindMatrix).invert().multiply(_m);
    _v.setFromMatrixPosition(_m2); out.push({ p: [_v.x, _v.y, _v.z], r: r / rec.bs });
  }
  setPaint(rec.u, out); return out;
}
function nearestBone(body, p) {
  let bi = 0, bd = 1e9; const bones = body.skeleton.bones;
  for (let i = 0; i < bones.length; i++) {
    const e = bones[i].matrixWorld.elements, d = (e[12] - p.x) ** 2 + (e[13] - p.y) ** 2 + (e[14] - p.z) ** 2;
    if (d < bd && !/^(IK|Pole|FF)/.test(bones[i].name)) { bd = d; bi = i; }
  }
  return bi;
}
// A wound at a world point (radius in metres): converted through the nearest bone into bind space; 8 slots, FIFO.
export function addWound(model, worldPt, rWorld = 0.08, { wet = 1 } = {}) {
  const rec = REC.get(model); if (!rec) return -1;
  const body = rec.body; body.updateWorldMatrix(true, false);
  if (!body.skeleton) _m.copy(body.matrixWorld);       // a morph mesh: its own local space (the rest pose before morphs)
  else {
    const bi = nearestBone(body, worldPt), bone = body.skeleton.bones[bi];
    _m.multiplyMatrices(body.matrixWorld, body.bindMatrixInverse).multiply(bone.matrixWorld).multiply(body.skeleton.boneInverses[bi]).multiply(body.bindMatrix);
  }
  const sc = _m.getMaxScaleOnAxis() || 1;
  _v.copy(worldPt).applyMatrix4(_m2.copy(_m).invert());
  const r = (rWorld * (0.8 + cfg.k.size * 0.25)) / sc;
  const near = rec.wounds.find((w) => w.p.distanceTo(_v) < w.r * 0.6);
  if (near) { near.r = Math.min(near.r * 1.25, r * 2.2); near.wet = Math.max(near.wet, wet); near.t = now; }
  else { rec.wounds.push({ p: _v.clone(), r, wet, t: now }); if (rec.wounds.length > 8) rec.wounds.shift(); }
  syncWounds(rec); ACTIVE.add(rec); HAS.add(rec);
  return rec.wounds.length;
}
const ACTIVE = new Set(), HAS = new Set();   // drying wounds; models with any wound (stats)
function syncWounds(rec) {
  const u = rec.u; u.uWN.value = rec.wounds.length;
  rec.wounds.forEach((w, i) => { u.uW.value[i].set(w.p.x, w.p.y, w.p.z, w.r); u.uWet.value[i] = w.wet; });
}
export function woundCount(model) { return REC.get(model)?.wounds.length || 0; }
export function clearWounds(model) {
  const rec = REC.get(model); if (!rec) return;
  rec.wounds.length = 0; syncWounds(rec); ACTIVE.delete(rec); HAS.delete(rec);
  rec.u.uFlesh.value = 0;
  if (rec.cut) { rec.cut = 0; rec.u.uCut.value = 0; }
  for (const c of rec.caps) { c.parent?.remove(c); }
  rec.caps.length = 0;
  for (let i = emitters.length - 1; i >= 0; i--) if (emitters[i].rec === rec) emitters.splice(i, 1);
}
export function setHands(model, v) { const rec = REC.get(model); if (rec) rec.u.uHands.value = v; }

// ----- dismemberment
const capGeo = new THREE.SphereGeometry(1, 12, 8), stubGeo = new THREE.CylinderGeometry(1, 0.8, 1, 8);
let fleshMat = null, boneMat = null;
function capMats() {
  fleshMat ||= new THREE.MeshStandardMaterial({ color: 0x5a0a07, roughness: 0.28, metalness: 0, emissive: 0x0c0000 });
  boneMat ||= new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 0.6 });
}
// Stump cap: wet flesh with a stub of pale bone, attached to the parent bone so it follows the body.
function makeCap(bone, r, outward) {
  capMats();
  const g = new THREE.Group();
  const f = new THREE.Mesh(capGeo, fleshMat); f.scale.set(r, r * 0.55, r); g.add(f);
  const b = new THREE.Mesh(stubGeo, boneMat); b.scale.set(r * 0.28, r * 0.9, r * 0.28); b.position.y = r * 0.35; g.add(b);
  bone.getWorldPosition(g.position);
  g.quaternion.setFromUnitVectors(_UP, outward);
  return g;
}
function farthestChild(bone) {
  let far = bone, fd = 0; bone.getWorldPosition(_v3);
  bone.traverse((c) => { if (!c.isBone) return; c.getWorldPosition(_v); const d = _v.distanceTo(_v3); if (d > fd) { fd = d; far = c; } });
  return far;
}
// Sever a segment (1 head, 2-5 limbs, 6 tail on animals): hide it on the body (shader discard + shadow depth material),
// cap the stump, throw a posed copy of the limb that tumbles and comes to rest, spurt from both ends.
export function sever(model, seg, { dir = null, sceneRoot = null } = {}) {
  const rec = REC.get(model); if (!rec || !ready || !cfg.blood || cfg.level !== 'high' || lowMode()) return null;
  const bit = 1 << seg; if (rec.cut & bit) return null;
  const rootName = SEG[rec.rig]?.roots[seg]; if (!rootName) return null;
  const bone = rec.body.skeleton.bones.find((b) => b.name === rootName); if (!bone?.parent) return null;
  model.updateMatrixWorld(true);
  counters.severed++;
  rec.cut |= bit; rec.u.uCut.value = rec.cut;
  for (const m of rec.meshes) if (!m.customDepthMaterial) m.customDepthMaterial = depthMat(rec.u);
  const jp = bone.getWorldPosition(new THREE.Vector3()), tip = farthestChild(bone).getWorldPosition(new THREE.Vector3());
  const len = Math.max(0.12, jp.distanceTo(tip)), out = tip.clone().sub(jp).normalize();
  const r = Math.min(0.11, Math.max(0.035, len * (seg === 1 ? 0.22 : 0.16)));
  // the stump on the body
  const cap = makeCap(bone, r, out); scene.add(cap); bone.parent.attach(cap); rec.caps.push(cap);
  emitters.push({ rec, obj: cap, t: 0, life: 2.4, rate: 46, pulse: true });
  // the severed piece: a posed, unanimated copy that shows only this segment
  const copy = SkeletonUtils.clone(model);
  const u2 = newUniforms(); u2.uKeep.value = bit; u2.uBS.value = rec.bs;
  rec.wounds.forEach((w, i) => { if (i < 8) { u2.uW.value[i].set(w.p.x, w.p.y, w.p.z, w.r); u2.uWet.value[i] = w.wet; } }); u2.uWN.value = rec.wounds.length;
  copy.traverse((o) => {
    if (o.isSkinnedMesh) { const src = o.material; o.material = src.clone(); patchWoundMaterial(o.material, { u: u2, wounds: !SKIP_MAT.test(src.name || '') && (rec.rig !== 'human' || o.geometry === rec.body.geometry) }); o.customDepthMaterial = depthMat(u2); o.castShadow = true; o.frustumCulled = false; }
    else if (o.isMesh || o.isSprite || o.isPoints || o.isLight) o.visible = false;   // weapons in sockets, old caps, glows
  });
  const center = jp.clone().add(tip).multiplyScalar(0.5);
  const pivot = new THREE.Group(); pivot.position.copy(center); (sceneRoot || scene).add(pivot); pivot.updateMatrixWorld(true);
  _m.copy(pivot.matrixWorld).invert().multiply(model.matrixWorld); _m.decompose(copy.position, copy.quaternion, copy.scale);
  pivot.add(copy);
  const pb = copy.getObjectByName(rootName);
  if (pb) { const c2 = makeCap(bone, r * 0.9, out.clone().negate()); pivot.add(c2); c2.position.copy(jp).sub(center); emitters.push({ obj: c2, t: 0, life: 1.1, rate: 30, pulse: false }); }
  const d = dir ? _v.copy(dir).setY(0).normalize() : _v.set(rnd() - 0.5, 0, rnd() - 0.5).normalize();
  const vel = new THREE.Vector3(d.x * (2.2 + rnd() * 1.8) + out.x * 1.2, 2.4 + rnd() * 1.6, d.z * (2.2 + rnd() * 1.8) + out.z * 1.2);
  const spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(5 + rnd() * 6);
  pieces.push({ pivot, copy, u: u2, vel, spin, rest: false, t: 0, r: Math.max(0.06, len * 0.25), drip: 0 });
  while (pieces.length > POOL.pieces) dropPiece(pieces[0]);
  bloodBurst(jp, out, burstCount('high', true, true) * 0.8, { heavy: true, kill: true });
  groundSplat(jp.x, jp.z, 0.5, 'pool', { grow: [1.3, 5] });
  return { seg, pivot, cap };
}
function depthMat(u) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCut = u.uCut; sh.uniforms.uKeep = u.uKeep;
    sh.vertexShader = 'attribute float aSeg;\nflat varying float vGoreSeg;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGoreSeg = aSeg;');
    sh.fragmentShader = 'uniform float uCut, uKeep;\nflat varying float vGoreSeg;\nbool goreBit(float mask, float seg) { return mod(floor(mask / exp2(seg)), 2.0) >= 1.0; }\n'
      + sh.fragmentShader.replace('void main() {', 'void main() {\n  { float gs = floor(vGoreSeg + 0.5); if (uCut > 0.5 && goreBit(uCut, gs)) discard; if (uKeep > 0.5 && !goreBit(uKeep, gs)) discard; }');
  };
  m.customProgramCacheKey = () => 'gore-depth';
  return m;
}
function dropPiece(p) {
  const i = pieces.indexOf(p); if (i >= 0) pieces.splice(i, 1);
  p.pivot.parent?.remove(p.pivot);
  p.copy.traverse((o) => { if (o.isSkinnedMesh) { o.material.dispose(); o.customDepthMaterial?.dispose(); } });
  for (let k = emitters.length - 1; k >= 0; k--) if (emitters[k].obj.parent === p.pivot) emitters.splice(k, 1);
}
export function clearPieces() { while (pieces.length) dropPiece(pieces[0]); }

// ----- carcass: a posed copy left where the animal was butchered, skinned flesh, 120 s, then it fades away
export function leaveCarcass(model, { flesh = true, scale = 0.9, life = 120 } = {}) {
  if (!ready) return null;
  const rec = REC.get(model);
  model.updateMatrixWorld(true);
  const copy = SkeletonUtils.clone(model);
  const u = newUniforms(); u.uFlesh.value = flesh && cfg.blood ? 0.86 : 0;
  if (rec) { u.uBS.value = rec.bs; u.uCut.value = rec.cut; rec.wounds.forEach((w, i) => { u.uW.value[i].set(w.p.x, w.p.y, w.p.z, w.r); u.uWet.value[i] = w.wet * 0.6; }); u.uWN.value = rec.wounds.length; }
  const mats = [];
  copy.traverse((o) => {
    if (o.isSkinnedMesh || (rec?.rig === 'mesh' && o.isMesh)) {
      const src = o.material; o.material = src.clone(); mats.push(o.material);
      const wounds = !SKIP_MAT.test(src.name || '');
      if (flesh && cfg.blood && wounds) { o.material.roughness = 0.45; }
      patchWoundMaterial(o.material, { u, wounds }); if (u.uCut.value) o.customDepthMaterial = depthMat(u);
      o.castShadow = true; o.frustumCulled = false;
    } else if (o.isMesh || o.isSprite || o.isPoints) o.visible = false;
  });
  const g = new THREE.Group(); scene.add(g);
  _m.copy(model.matrixWorld); _m.decompose(copy.position, copy.quaternion, copy.scale);
  // scale ×0.9 about the ground point under the body, so it sinks a little rather than floating
  const base = new THREE.Vector3().setFromMatrixPosition(model.matrixWorld);
  g.position.copy(base); copy.position.sub(base); g.scale.setScalar(scale); g.add(copy);
  carcasses.push({ g, copy, mats, t: 0, life, u });
  while (carcasses.length > POOL.carcasses) dropCarcass(carcasses[0]);
  return g;
}
function dropCarcass(c) {
  const i = carcasses.indexOf(c); if (i >= 0) carcasses.splice(i, 1);
  c.g.parent?.remove(c.g); for (const m of c.mats) m.dispose();
}
export const carcassList = () => carcasses.map((c) => ({ visible: c.g.visible, flesh: c.u.uFlesh.value, t: c.t, opacity: c.mats[0]?.opacity ?? 1 }));

// ----- screen blood (DOM canvas #splat, half resolution)
let SC = null;
function screenInit() {
  const el = document.getElementById('splat'); if (!el) return null;
  const s = { el, g: el.getContext('2d'), sprites: screenSprites(), list: [], w: 0, h: 0, dirty: false };
  const fit = () => { s.w = el.width = Math.max(2, Math.round(innerWidth / 2)); s.h = el.height = Math.max(2, Math.round(innerHeight / 2)); s.dirty = true; };
  fit(); addEventListener('resize', fit);
  return s;
}
// angle: 0 = the top edge (attacker ahead), +π/2 = the right edge; amt about dmg/12.
export function screenSplat(angle, amt = 0.5) {
  if (!ready || !cfg.screen || !cfg.blood) return 0;
  SC ||= screenInit(); if (!SC) return 0;
  const n = Math.min(6, Math.max(1, Math.round(1 + amt * 3)));
  for (let k = 0; k < n; k++) {
    const a = angle + (rnd() - 0.5) * 0.9, rx = 0.43 + rnd() * 0.06, ry = 0.40 + rnd() * 0.08;
    SC.list.push({ img: SC.sprites[(rnd() * SC.sprites.length) | 0], x: 0.5 + Math.sin(a) * rx, y: 0.5 - Math.cos(a) * ry, rot: rnd() * 6.28,
      s: (0.18 + rnd() * 0.16) * (0.8 + Math.min(1.5, amt) * 0.5), t: 0, life: 2.4 + rnd() * 0.8, a: Math.min(1, 0.55 + amt * 0.45) * (cfg.reduceFlash ? 0.5 : 1) });
  }
  while (SC.list.length > 14) SC.list.shift();
  counters.screen += n;
  return n;
}
export function clearScreen() { if (SC) { SC.list.length = 0; SC.dirty = true; } }
function screenUpdate(dt) {
  if (!SC || (!SC.list.length && !SC.dirty)) return;
  const { g, w, h } = SC; g.clearRect(0, 0, w, h); SC.dirty = false;
  for (let i = SC.list.length - 1; i >= 0; i--) {
    const p = SC.list[i]; p.t += dt;
    if (p.t >= p.life) { SC.list.splice(i, 1); SC.dirty = true; continue; }
    const fade = 1 - smooth((p.t - p.life * 0.45) / (p.life * 0.55)), slide = Math.min(1, p.t / 2) * 15;   // 30 px at full res
    const sz = p.s * Math.min(w, h) * (1 + Math.min(0.12, p.t * 0.4));
    g.save(); g.globalAlpha = p.a * fade; g.translate(p.x * w, p.y * h + slide); g.rotate(p.rot); g.drawImage(p.img, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  if (SC.list.length) SC.dirty = true;
}

// ----- heartbeat, bleeding edge, desaturation (DOM layers #hurtbeat, #bleededge; the WebGL canvas filter on high)
const HB = { ph: 0, lastBeat: 0, filt: '' };
function heartUpdate(dt, env) {
  const beat = document.getElementById('hurtbeat'), edge = document.getElementById('bleededge');
  const show = cfg.screen && env.playing && !env.dead;
  const { bpm, amp } = heartbeat(env.hp ?? 100);
  let o = 0;
  if (show && amp > 0) {
    const prev = HB.ph; HB.ph = (HB.ph + dt * bpm / 60) % 1;
    if (HB.ph < prev) env.thump?.(amp);                 // lub
    const lub = Math.exp(-((HB.ph - 0.04) ** 2) / 0.0025), dub = 0.6 * Math.exp(-((HB.ph - 0.24) ** 2) / 0.003);
    o = amp * (0.35 + 0.65 * Math.max(lub, dub)) * (cfg.reduceFlash ? 0.5 : 1);
  }
  if (beat) { beat.style.opacity = o.toFixed(3); beat.classList.toggle('nb', !cfg.blood); }
  let eo = 0;
  if (show && env.bleeding) eo = (0.25 + 0.25 * Math.sin(now * 3.4)) * (cfg.reduceFlash ? 0.5 : 1);
  if (edge) { edge.style.opacity = eo.toFixed(3); edge.classList.toggle('nb', !cfg.blood); }
  const f = show && cfg.quality === 'high' && (env.hp ?? 100) < 35 ? `saturate(${(0.4 + 0.6 * (env.hp / 35)).toFixed(2)})` : '';
  if (f !== HB.filt && env.canvas) { HB.filt = f; env.canvas.style.filter = f; }
}

// ----- per frame
// env: {playing, hp, dead, bleeding, rain, canvas, thump(amp), focusCenter}
export function updateGore(dt, env = {}) {
  if (!ready) return;
  now += dt;
  // drops: gravity, drag, streak along the velocity, ground contact → splat
  if (DR.count > 0) {
    const drag = Math.max(0, 1 - 0.8 * dt);
    for (let i = 0; i < capDrops; i++) {
      if (!DR.live[i]) continue;
      const j = i * 3; let vx = DR.v[j], vy = DR.v[j + 1], vz = DR.v[j + 2];
      vy -= 9.8 * dt; vx *= drag; vy *= drag; vz *= drag;
      const x = DR.p[j] + vx * dt, y = DR.p[j + 1] + vy * dt, z = DR.p[j + 2] + vz * dt;
      DR.v[j] = vx; DR.v[j + 1] = vy; DR.v[j + 2] = vz; DR.p[j] = x; DR.p[j + 1] = y; DR.p[j + 2] = z;
      if ((DR.life[i] -= dt) <= 0) { killDrop(i); continue; }
      const gy = getH(x, z);
      if (y <= gy + 0.01) {
        if (rnd() < DR.splat[i]) groundSplat(x, z, 0.07 + DR.r[i] * 6 + rnd() * 0.08, 'blood');
        killDrop(i); continue;
      }
      const sp = Math.hypot(vx, vy, vz), r = DR.r[i];
      if (sp > 1e-4) { _v.set(vx / sp, vy / sp, vz / sp); _q.setFromUnitVectors(_UP, _v); } else _q.identity();
      _m.compose(_v3.set(x, y, z), _q, _s.set(r, r * (1 + Math.min(4, sp * 0.45)), r)); DR.m.setMatrixAt(i, _m);
      DR.dirty = true;
    }
  }
  DR.m.visible = DR.count > 0;
  if (DR.dirty) { DR.m.instanceMatrix.needsUpdate = true; DR.dirty = false; }
  // mist
  for (const f of MIST.list) {
    if (!f.s.visible) continue;
    f.t += dt; const k = f.t / f.life;
    if (k >= 1) { f.s.visible = false; continue; }
    f.s.position.addScaledVector(f.v, dt); const s = f.s0 + (f.s1 - f.s0) * Math.sqrt(k); f.s.scale.set(s, s, 1);
    f.s.material.opacity = 0.55 * (1 - k);
  }
  // spurting stumps
  for (let i = emitters.length - 1; i >= 0; i--) {
    const e = emitters[i]; e.t += dt;
    if (e.t >= e.life || !e.obj.parent) { emitters.splice(i, 1); continue; }
    const pulse = e.pulse ? Math.max(0, Math.sin(e.t * 7.5)) ** 2 : 1, fall = 1 - e.t / e.life;
    e.acc = (e.acc || 0) + dt * e.rate * pulse * fall;
    if (e.acc >= 1 && cfg.blood) {
      e.obj.getWorldPosition(_v2); _v.set(0, 1, 0).applyQuaternion(e.obj.getWorldQuaternion(_q));
      const n = e.acc | 0; e.acc -= n;
      for (let k = 0; k < n; k++) {
        const sp = (1.2 + rnd() * 1.6) * (0.5 + pulse * 0.7);
        spawnDrop(_v2.x, _v2.y, _v2.z, (_v.x + (rnd() - 0.5) * 0.4) * sp, (_v.y + (rnd() - 0.5) * 0.4) * sp, (_v.z + (rnd() - 0.5) * 0.4) * sp, 0.01 + rnd() * 0.012, 0.5);
      }
    }
  }
  // severed pieces: a simple tumbling body that settles on the terrain and drips
  for (const p of pieces) {
    p.t += dt;
    if (!p.rest) {
      p.vel.y -= 9.8 * dt; p.pivot.position.addScaledVector(p.vel, dt);
      _q.setFromAxisAngle(_v.copy(p.spin).normalize(), p.spin.length() * dt); p.pivot.quaternion.premultiply(_q);
      const gy = getH(p.pivot.position.x, p.pivot.position.z) + p.r * 0.5;
      if (p.pivot.position.y < gy) {
        p.pivot.position.y = gy;
        if (p.vel.y < -1.2) { if (cfg.blood) groundSplat(p.pivot.position.x, p.pivot.position.z, 0.22, 'blood'); }
        p.vel.y = -p.vel.y * 0.22; p.vel.x *= 0.45; p.vel.z *= 0.45; p.spin.multiplyScalar(0.4);
        if (p.vel.length() < 0.5) { p.rest = true; if (cfg.blood) groundSplat(p.pivot.position.x, p.pivot.position.z, 0.3, 'pool', { grow: [0.6, 6] }); }
      }
    }
    if (p.t > 240) { dropPiece(p); break; }
  }
  // splats: pools grow; every 0.25 s wet → dry colour, the long fade (rain ×4)
  if (SP.count > 0) {
    let mat = false;
    for (let i = 0; i < capSplats; i++) if (SP.live[i] && SP.gd[i] > 0 && SP.gt[i] < SP.gd[i]) {
      SP.gt[i] += dt; SP.size[i] = SP.s0[i] + (SP.s1[i] - SP.s0[i]) * smooth(SP.gt[i] / SP.gd[i]); splatMatrix(i); mat = true;
    }
    if (mat) SP.m.instanceMatrix.needsUpdate = true;
    SP.t += dt;
    if (SP.t > 0.25) {
      const step = SP.t * (env.rain > 0.4 ? 4 : 1); SP.t = 0; let col = false, al = false;
      for (let i = 0; i < capSplats; i++) {
        if (!SP.live[i]) continue;
        SP.age[i] += step;
        if (SP.age[i] < 125 || SP.focus[i]) { splatColor(i); col = true; }
        const fadeAt = SP.kind[i] === 1 ? 420 : 600;    // trails fade first; blood stays for ten minutes (×4 faster in rain)
        if (SP.age[i] > fadeAt) {
          const a = SP.alpha[i] * (1 - (SP.age[i] - fadeAt) / 240);
          if (a <= 0.01) { killSplat(i); continue; }
          SP.aSp.setY(i, a); al = true;
        }
        SP.aSp.setZ(i, Math.max(0, 1 - SP.age[i] / 150)); al = true;
      }
      if (col && SP.m.instanceColor) SP.m.instanceColor.needsUpdate = true;
      if (al) SP.aSp.needsUpdate = true;
    }
  }
  SP.m.visible = SP.count > 0;
  SPU.uPulse.value = focusOn ? 0.5 + 0.5 * Math.sin(now * 4) : 0;
  // static decals: one build per frame
  if (decalQ.length) buildDecal();
  // wounds dry: wet 1 → 0.15 over 90 s
  for (const rec of ACTIVE) {
    let ch = false;
    for (const w of rec.wounds) if (w.wet > 0.15) { w.wet = Math.max(0.15, w.wet - dt / 90); ch = true; }
    if (ch) rec.wounds.forEach((w, i) => { rec.u.uWet.value[i] = w.wet; }); else ACTIVE.delete(rec);
  }
  // carcasses: 120 s, then a 2 s fade
  for (let i = carcasses.length - 1; i >= 0; i--) {
    const c = carcasses[i]; c.t += dt;
    if (c.t > c.life) {
      const k = 1 - (c.t - c.life) / 2;
      if (k <= 0) { dropCarcass(c); continue; }
      for (const m of c.mats) { if (!m.transparent) { m.transparent = true; m.needsUpdate = true; } m.opacity = k; }
    }
  }
  screenUpdate(dt);
  heartUpdate(dt, env);
}

export function stats() {
  return { drops: DR ? DR.count : 0, splats: SP ? SP.count : 0, decals: decals.length, queued: decalQ.length, wounds: [...HAS].reduce((n, r) => n + r.wounds.length, 0),
    screen: counters.screen, screenLive: SC ? SC.list.length : 0, bursts: counters.bursts, severed: counters.severed, pieces: pieces.length, carcasses: carcasses.length,
    mist: MIST ? MIST.list.filter((f) => f.s.visible).length : 0, capDrops, capSplats, focus: focusOn, level: cfg.level, blood: cfg.blood };
}
