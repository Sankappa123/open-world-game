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
  // (GLTFLoader strips the dots from node names: the rig's "FrontUpperLeg.L" arrives as "FrontUpperLegL"; both spellings match)
  quad: { roots: { 1: 'Neck2', 2: 'FrontUpperLegL', 3: 'FrontUpperLegR', 4: 'BackUpperLegL', 5: 'BackUpperLegR', 6: 'Tail2' },
    extra: [[/^(IKFrontLeg|FF|PoleTarget)L$/, 2], [/^(IKFrontLeg|FF|PoleTarget)R$/, 3], [/^(IKBackLeg|FFB|PoleTargetBack)L$/, 4], [/^(IKBackLeg|FFB|PoleTargetBack)R$/, 5]] },
  human: { roots: { 1: 'Head', 2: 'lowerarm_l', 3: 'lowerarm_r', 4: 'calf_l', 5: 'calf_r' }, extra: [] },   // FIX gore-cmb: the head at its joint (from neck_01 the collar and the necklace left with it)
};
export const SEG_NAME = { quad: { 1: 'head', 2: 'front leg', 3: 'front leg', 4: 'hind leg', 5: 'hind leg', 6: 'tail' }, human: { 1: 'head', 2: 'arm', 3: 'arm', 4: 'leg', 5: 'leg' } };
export function segOfBone(bone, rig) {
  const R = SEG[rig]; if (!R) return 0;
  for (let b = bone; b && b.isBone; b = b.parent) { const n = b.name.replace(/\./g, ''); for (const s in R.roots) if (n === R.roots[s]) return +s; }
  const bn = bone.name.replace(/\./g, '');
  for (const [re, s] of R.extra) if (re.test(bn)) return s;
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
    if (t < 4) {                                         // FIX gore-cmb: impact splats thrown one way (canvas +y = the heading on the ground):
      // an irregular, elongated core (none on tile 3: a fine spatter field), then droplets fanning forward, each a small
      // teardrop pointing away from the core; sizes fall off with distance. Every tile differs.
      const fan = 0.3 + rnd() * 0.35, by = cy - 26 + t * 5;
      if (t < 3) for (let i = 0; i < 4 + t * 2; i++) { const y = by + rnd() * (10 + t * 6), x = cx + (rnd() - 0.5) * (8 + t * 3); blob(x, y, 5 + rnd() * (7 + t * 2)); }
      for (let i = 0; i < 34 + t * 10; i++) {
        const a = Math.PI / 2 + (rnd() - 0.5) * 2 * fan * (0.6 + rnd() * 0.8), d = 10 + Math.pow(rnd(), 0.9) * 62, x = cx + Math.cos(a) * d, y = by + Math.sin(a) * d;
        const r = (0.6 + Math.pow(rnd(), 2.4) * 3.6) * (1.25 - d / 100);
        g.save(); g.translate(x, y); g.rotate(a - Math.PI / 2); g.scale(1, 1.3 + rnd() * 1.1); blob(0, 0, r, 0.9 + rnd() * 0.1); g.restore();
      }
      if (t === 1) { const a = Math.PI / 2 + (rnd() - 0.5) * fan; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + Math.cos(a) * 12, by + Math.sin(a) * 12); g.lineTo(cx + Math.cos(a) * 44, by + Math.sin(a) * 44); g.stroke(); }
    } else if (t < 6) {                                  // trail: a few round drips and a smear
      for (let i = 0; i < 5 + t; i++) blob(cx + (rnd() - 0.5) * 70, cy + (rnd() - 0.5) * 40, 4 + rnd() * 9);
      blob(cx, cy, 14, 0.8);
    } else if (t === 6) {                                // pool: lobed, opaque in the middle; FIX gore-cmb: a feathered rim soaking into the ground
      const soft = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.45, `rgba(255,255,255,${a * 0.8})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
      for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, d = 6 + rnd() * 26; soft(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 14 + rnd() * 16, 0.35); }   // the soaked fringe
      for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = rnd() * 14; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 18 + rnd() * 12); }   // (kept inside the tile: no cut edge)
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
// Screen splatter sprites, 256 px each, drawn once: a flat, ragged splash thrown across the lens (a mask of core, spikes,
// droplets and runs, then one dark arterial colour through it), not shaded beads.
function screenSprites() {
  const out = [];
  for (let k = 0; k < 5; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 2.5;      // a soft rim
    const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
    const cx = 128 + (rnd() - 0.5) * 24, cy = 112 + (rnd() - 0.5) * 20, ph = rnd() * 6.28, N = 44;
    g.beginPath();                                       // the ragged core
    for (let i = 0; i <= N; i++) { const a = (i / N) * 6.2832, r = 22 + 8 * Math.sin(a * 3 + ph) + 6 * Math.sin(a * 7 + ph * 2) + rnd() * 8; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); }
    g.fill();
    for (let i = 0; i < 12 + k * 2; i++) {               // spikes thrown outward, a bead at each tip
      const a = rnd() * 6.28, l = 38 + rnd() * 62, w = 0.06 + rnd() * 0.07, tx = cx + Math.cos(a) * l, ty = cy + Math.sin(a) * l;
      g.beginPath(); g.moveTo(cx + Math.cos(a - w) * 20, cy + Math.sin(a - w) * 20); g.lineTo(tx, ty); g.lineTo(cx + Math.cos(a + w) * 20, cy + Math.sin(a + w) * 20); g.fill();
      dot(tx, ty, 1 + rnd() * 2.6);
    }
    for (let i = 0; i < 48; i++) { const a = rnd() * 6.28, d = 34 + Math.pow(rnd(), 0.7) * 86; dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.7 + Math.pow(rnd(), 3.2) * 6.5); }
    for (let i = 0; i < 2 + (k % 3); i++) {              // runs down the glass
      const x = cx + (rnd() - 0.5) * 44, w = 1.8 + rnd() * 3.2, h = 30 + rnd() * 90;
      g.fillRect(x - w / 2, cy, w, h); dot(x, cy + h, w * 0.9);
    }
    g.shadowBlur = 0; g.globalCompositeOperation = 'source-in';
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 128);
    gr.addColorStop(0, 'rgba(66,3,3,0.93)'); gr.addColorStop(0.3, 'rgba(98,6,5,0.88)'); gr.addColorStop(1, 'rgba(122,10,8,0.74)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,0,0,0.13)';   // clotted, uneven
    for (let i = 0; i < 26; i++) dot(cx + (rnd() - 0.5) * 90, cy + (rnd() - 0.5) * 90, 5 + rnd() * 14);
    out.push(c);
  }
  return out;
}

// ----- pools
let DR = null, SP = null, MIST = null, decalMat = null;
const decals = [], decalQ = [], pieces = [], emitters = [], carcasses = [];
function makeDrops() {
  const geo = new THREE.IcosahedronGeometry(1, 1);   // round beads (80 triangles each)
  // FIX gore-cmb: small, dark, half-matte drops (the old 0.22 gloss and bright red read as berries / jelly beans in daylight)
  const mat = new THREE.MeshStandardMaterial({ color: 0x780806, roughness: 0.45, metalness: 0, emissive: 0x260202 });
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
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.9, 0.6, vSp.z);')   // FIX gore-cmb: a wet sheen, never a mirror (0.18 caught the low sun as white blobs)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  { vec3 goreSt = vec3(0.09, 0.018, 0.014) * diffuseColor.a; reflectedLight.directSpecular *= goreSt; reflectedLight.indirectSpecular *= goreSt; }')   // FIX gore-cmb: blood's sheen is dark red, scaled by its alpha
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 fc = vColor.rgb; float br = max(fc.r, max(fc.g, fc.b)); totalEmissiveRadiance += fc * smoothstep(0.75, 1.1, br) * (0.35 + 0.35 * uPulse); }`);
  };
  mat.customProgramCacheKey = () => 'gore-splat';
  const n = POOL.splats, m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false; m.receiveShadow = true; m.renderOrder = 1;
  _m.makeScale(0, 0, 0); for (let i = 0; i < n; i++) { m.setMatrixAt(i, _m); m.setColorAt(i, _c.setRGB(0, 0, 0)); }
  const aSp = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); aSp.setUsage(THREE.DynamicDrawUsage);
  m.geometry.setAttribute('aSp', aSp);
  m.visible = false; scene.add(m);
  return { m, aSp, n, x: new Float32Array(n), y: new Float32Array(n), h: new Float32Array(n), z: new Float32Array(n), size: new Float32Array(n), s0: new Float32Array(n), s1: new Float32Array(n),
    gt: new Float32Array(n), gd: new Float32Array(n), rot: new Float32Array(n), kind: new Uint8Array(n), born: new Float32Array(n), age: new Float32Array(n),
    alpha: new Float32Array(n), trail: new Int32Array(n), seq: new Int32Array(n), live: new Uint8Array(n), focus: new Uint8Array(n), st: new Float32Array(n).fill(1), i: 0, count: 0, seqN: 0, t: 0 };
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
  const was = cfg.blood;
  if (blood !== undefined) cfg.blood = blood !== 'off' && blood !== false;
  if (was && !cfg.blood) bloodOffSwap();
  if (gore !== undefined && LEVEL[gore]) cfg.level = gore;
  if (screenBlood !== undefined) cfg.screen = !!screenBlood;
  if (reduceFlash !== undefined) cfg.reduceFlash = !!reduceFlash;
  if (quality !== undefined) cfg.quality = quality;
  cfg.k = LEVEL[cfg.level];
  G.uGore.value = cfg.k.u; G.uBloodOn.value = cfg.blood ? 1 : 0;
  if (decalMat) decalMat.color.set(cfg.blood ? 0x4a0606 : 0x5a4632);
  if (fleshMat) fleshMat.color.set(cfg.blood ? 0xffffff : 0x8a7a66);   // stump caps left from before Blood went off (FIX gore-cmb: vertex-coloured caps)
  applyCaps();
  return { ...cfg };
}
export const goreCfg = () => cfg;
// Blood switched off mid-game: settings always win, so what is already in the world changes too. Flying drops, mist, spurts
// and screen blood go; blood on the ground turns to brown scuffs; severed pieces and stump caps are removed (the limb stays cut).
function bloodOffSwap() {
  if (!ready) return;
  for (let i = 0; i < DR.n; i++) if (DR.live[i]) killDrop(i);
  for (const f of MIST.list) f.s.visible = false;
  emitters.length = 0;
  for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.kind[i] !== 3) {
    SP.kind[i] = 3; SP.alpha[i] = 0.7; SP.gd[i] = 0; SP.size[i] = Math.min(SP.size[i], 0.6);
    SP.aSp.setXYZ(i, 7, SP.alpha[i], 0); splatMatrix(i); splatColor(i);
  }
  SP.aSp.needsUpdate = true; SP.m.instanceMatrix.needsUpdate = true; if (SP.m.instanceColor) SP.m.instanceColor.needsUpdate = true;
  clearPieces();
  for (const c of carcasses) c.u.uFlesh.value = 0;
  clearScreen();
}
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
    const sp = (1 + Math.pow(rnd(), 1.4) * 4) * speed * (heavy ? 1.25 : 1) * (back ? 0.6 : 1);   // FIX gore-cmb: most drops fall near the body
    spawnDrop(pos.x + (rnd() - 0.5) * 0.06, pos.y + (rnd() - 0.5) * 0.06, pos.z + (rnd() - 0.5) * 0.06, _v.x * sp, _v.y * sp, _v.z * sp,
      (0.0025 + Math.pow(rnd(), 2.6) * 0.0075) * sz * (kill ? 1.15 : 1), 0.35);   // FIX gore-cmb: 0.5-2 cm drops (were 1-3.5 cm)
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
  // the quad lies on the plane through the ground at its own rim (a wide pool on rolling ground must not cut into a rise)
  const x = SP.x[i], z = SP.z[i], s = SP.size[i], e = Math.max(0.25, s * 0.36);
  const a = getH(x - e, z), b = getH(x + e, z), c = getH(x, z - e), d = getH(x, z + e);
  _v.set(a - b, 2 * e, c - d).normalize();
  _q.setFromUnitVectors(_UP, _v); _q2.setFromAxisAngle(_UP, SP.rot[i]); _q.multiply(_q2);
  const lift = s > 0.6 ? Math.max(0, (a + b + c + d) / 4 - SP.h[i]) : 0;
  const st = SP.st[i] || 1;                               // FIX gore-cmb: directional splats are stretched along their heading (rot)
  _m.compose(_v3.set(x, SP.y[i] + lift, z), _q, _s.set(s / Math.sqrt(st), 1, s * st)); SP.m.setMatrixAt(i, _m);
}
function splatColor(i) {
  const k = SP.kind[i], wet = Math.max(0, 1 - SP.age[i] / 120);
  _c.copy(DRY[k]).lerp(WET[k], wet);
  if (SP.focus[i]) _c.multiplyScalar(4);
  SP.m.setColorAt(i, _c);
}
// kind 'blood' | 'trail' | 'pool' | 'scuff'. o: {trail: id, grow: [to, seconds], dir: heading (atan2(x, z)), stretch}. Returns the splat index or -1.
export function groundSplat(x, z, size, kind = 'blood', o = {}) {
  if (!ready) return -1;
  if (!cfg.blood && kind !== 'scuff') kind = 'scuff';
  const y = getH(x, z); if (y < -0.3) return -1;        // blood in the river is carried away
  const i = SP.i % capSplats; SP.i = i + 1;
  if (!SP.live[i]) SP.count++;
  const k = KIND[kind] ?? 0;
  SP.x[i] = x; SP.z[i] = z; SP.h[i] = y; SP.y[i] = y + 0.025 + (SP.seqN % 7) * 0.0015;   // tiny offsets stop overlapping splats from z-fighting
  SP.rot[i] = o.dir != null ? o.dir + (rnd() - 0.5) * 0.3 : rnd() * 6.2832; SP.st[i] = o.dir != null ? (o.stretch || 1.5) : 1; SP.kind[i] = k;   // FIX gore-cmb: o.dir (heading) + o.stretch
  SP.born[i] = now; SP.age[i] = 0; SP.alpha[i] = kind === 'scuff' ? 0.7 : 0.95;
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
// FIX gore-cmb: years (or weeks) pass: every splat, flying drop, severed piece and carcass goes
export function clearAll() {
  if (!ready) return;
  for (let i = 0; i < SP.n; i++) if (SP.live[i]) killSplat(i);
  for (let i = 0; i < DR.n; i++) if (DR.live[i]) killDrop(i);
  for (const f of MIST.list) f.s.visible = false;
  emitters.length = 0; clearPieces(); while (carcasses.length) dropCarcass(carcasses[0]); clearScreen();
}
export function piecesNear(x, z, r) { return pieces.some((p) => Math.hypot(p.pivot.position.x - x, p.pivot.position.z - z) < r); }
export function clearPiecesNear(x, z, r) { for (const p of pieces.slice()) if (Math.hypot(p.pivot.position.x - x, p.pivot.position.z - z) < r) dropPiece(p); }
export function splatsNear(x, z, r) { if (!SP) return 0; let n = 0; for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.kind[i] !== 3 && Math.hypot(SP.x[i] - x, SP.z[i] - z) < r) n++; return n; }

// ----- Hunter's Focus: trail splats near `center` glow (instanceColor ×4); returns info for the arrow and Sena's line.
let focusOn = false, FPT = null, focusN = 0;
// The scent of the trail: a soft ember over every lit splat, drawn through the grass (meadow grass hides the ground).
function focusPoints() {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3)); geo.setDrawRange(0, 0);
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: puffTexture(), color: 0xff3c1e, size: 0.8, sizeAttenuation: true, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  p.frustumCulled = false; p.renderOrder = 4; p.visible = false; scene.add(p);
  return p;
}
export function setFocus(on, center, r = 40) {
  focusOn = !!on;
  if (!SP) return null;
  FPT ||= focusPoints();
  const fa = FPT.geometry.attributes.position; let fn = 0;
  let best = -1, bd = 1e9, changed = false;
  for (let i = 0; i < SP.n; i++) {
    if (!SP.live[i]) continue;
    const trailish = SP.trail[i] > 0;
    const f = on && trailish && Math.hypot(SP.x[i] - center.x, SP.z[i] - center.z) < r ? 1 : 0;
    if (f !== SP.focus[i]) { SP.focus[i] = f; splatColor(i); changed = true; }
    if (f) { const d = Math.hypot(SP.x[i] - center.x, SP.z[i] - center.z); if (d < bd) { bd = d; best = i; } if (fn < 64) fa.setXYZ(fn++, SP.x[i], SP.y[i] + 0.32, SP.z[i]); }
  }
  FPT.geometry.setDrawRange(0, fn); fa.needsUpdate = true; FPT.visible = fn > 0; FPT.material.color.set(cfg.blood ? 0xff4a2a : 0xe0b060); focusN = fn;
  if (changed && SP.m.instanceColor) SP.m.instanceColor.needsUpdate = true;
  if (best < 0) return null;
  // the trail's heading: from the nearest splat toward the next newer one of the same trail (the way the animal went)
  const id = SP.trail[best]; let nx = -1, ns = 1e12;
  for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.trail[i] === id && SP.seq[i] > SP.seq[best] && SP.seq[i] < ns) { ns = SP.seq[i]; nx = i; }
  const hx = nx >= 0 ? SP.x[nx] - SP.x[best] : 0, hz = nx >= 0 ? SP.z[nx] - SP.z[best] : 0;
  return { trail: id, x: SP.x[best], z: SP.z[best], dist: bd, head: nx >= 0 ? Math.atan2(hx, hz) : null };
}
export function splatBrightness(id, c = null, r = 40) { // tests: mean max-channel brightness of a trail's instanceColor (optionally within r of c)
  if (!SP?.m.instanceColor) return 0; const a = SP.m.instanceColor.array; let s = 0, n = 0;
  for (let i = 0; i < SP.n; i++) if (SP.live[i] && SP.trail[i] === id && (!c || Math.hypot(SP.x[i] - c.x, SP.z[i] - c.z) < r)) { s += Math.max(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]); n++; }
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
    uP: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uPN: { value: 0 }, uPC: { value: new THREE.Color(0x8c8a84) }, uFlesh: { value: 0 }, uFY: { value: new THREE.Vector2(0, 1) }, uFS: { value: 1 },
    uDown: { value: new THREE.Vector3(0, -1, 0) } };   // bind-space 'down': blood runs from a wound
}
function woundCompile(u, wounds) {
  return (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute float aSeg;\nattribute float aHand;\nvarying vec3 vGoreBind;\nflat varying float vGoreSeg;\nvarying float vGoreHand;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGoreBind = position; vGoreSeg = aSeg; vGoreHand = aHand;')
        ;   // GORE-FIX5: a morph mesh's wounds live on its rest shape (snapToSurface carries them there), so they ride every pose
    let f = 'uniform float uCut, uKeep;\nflat varying float vGoreSeg;\nvarying vec3 vGoreBind;\nvarying float vGoreHand;\n'
      + (wounds ? 'uniform vec4 uW[8];\nuniform float uWet[8];\nuniform int uWN;\nuniform float uGore, uBloodOn, uHands, uBS, uFlesh, uFS;\nuniform vec2 uFY;\nuniform vec3 uDown;\nuniform vec4 uP[4];\nuniform int uPN;\nuniform vec3 uPC;\n' : '')
      + GLSL_NOISE + '\n' + sh.fragmentShader;
    f = f.replace('void main() {', `void main() {
  { float gs = floor(vGoreSeg + 0.5);
    if (uCut > 0.5 && goreBit(uCut, gs)) discard;
    if (uKeep > 0.5 && !goreBit(uKeep, gs)) discard; }`);
    if (wounds) {
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
  float goreWet = 0.0, goreM = 0.0, goreDark = 0.0, goreFR = -1.0;
  {
    // GORE-FIX4: on dark fur (a bear, a dark aurochs) the wound reads by colour and wet sheen: brighter, redder blood and
    // raw flesh, a lighter core (a near-black core vanished into the fur), more gloss. Light skin keeps the darker set.
    goreDark = 1.0 - smoothstep(0.035, 0.16, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
    vec3 bloodWet = mix(vec3(0.21, 0.026, 0.02), vec3(0.46, 0.035, 0.026), goreDark), bloodDry = mix(vec3(0.10, 0.026, 0.018), vec3(0.24, 0.03, 0.022), goreDark), dust = vec3(0.30, 0.235, 0.165);   // FIX gore-cmb: less saturated, darker
    // tribe ash paint (CMB): rough patches around bone points
    for (int i = 0; i < 4; i++) { if (i >= uPN) break; vec3 q = (vGoreBind - uP[i].xyz) / uP[i].w;
      float d = length(q) + (goreN(q * 2.5 + 3.1) - 0.5) * 0.8; diffuseColor.rgb = mix(diffuseColor.rgb, uPC, (1.0 - smoothstep(0.6, 1.0, d)) * 0.8); }
    float core = 0.0, torn = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uWN) break;
      vec4 w = uW[i]; vec3 q = (vGoreBind - w.xyz) / w.w;
      float n = goreN(q * 2.6 + float(i) * 7.13) * 0.6 + goreN(q * 6.5 + 1.7) * 0.3;
      float d = length(q) + (n - 0.45) * 0.75;
      float m = 1.0 - smoothstep(0.42, 0.95, d);
      // FIX gore-cmb: a ragged, broken edge (spatter islands at the rim), not a clean stamp
      float brk = goreN(q * 13.0 + float(i) * 2.9);
      m *= mix(1.0, smoothstep(0.3, 0.62, brk), smoothstep(0.35, 0.8, d));
      torn = max(torn, (1.0 - smoothstep(0.14, 0.36, d)) * smoothstep(0.45, 0.75, goreN(q * 8.0 + 4.2)));
      // the run: thin streaks of blood below the wound, broken by noise across the fall line
      float dn = dot(q, uDown); vec3 ql = q - uDown * dn;
      float run = (1.0 - smoothstep(0.1, 0.34, length(ql) + (goreN(ql * 9.0 + float(i) * 3.7) - 0.5) * 0.5)) * smoothstep(0.0, 0.3, dn) * (1.0 - smoothstep(0.9, 1.7 + 0.9 * goreN(ql * 5.0 + float(i)), dn));   // FIX gore-cmb: shorter runs
      m = max(m, run * 0.85 * uBloodOn);
      goreM = max(goreM, m); goreWet = max(goreWet, m * uWet[i]);
      core = max(core, 1.0 - smoothstep(0.06, 0.3, d));
    }
    vec3 bc = mix(bloodDry, bloodWet, goreWet / max(goreM, 0.001));
    bc = mix(bc, mix(vec3(0.32, 0.075, 0.06), vec3(0.62, 0.12, 0.09), goreDark), torn * mix(0.55, 0.8, goreDark));   // FIX gore-cmb: torn flesh showing in the wound
    if (uBloodOn < 0.5) { bc = dust; core = 0.0; goreWet = 0.0; torn = 0.0; }
    diffuseColor.rgb = mix(diffuseColor.rgb, bc * (1.0 - core * mix(0.72, 0.3, goreDark)), goreM * uGore);   // a dark, clotted core
    // bloody hands (butchering): forearms down to the fingertips, patchy
    float hm = vGoreHand * uHands * (0.55 + 0.6 * goreN(vGoreBind * uBS * 22.0));
    hm = clamp(hm, 0.0, 1.0) * 0.92;
    diffuseColor.rgb = mix(diffuseColor.rgb, uBloodOn > 0.5 ? vec3(0.26, 0.016, 0.012) : dust, hm);
    goreWet = max(goreWet, hm * (uBloodOn > 0.5 ? 0.8 : 0.0));
    // a butchered carcass (GORE-FIX4): skinned to the knees and the neck. The hide stays on the head, the tail and the lower
    // legs (a ragged cut line); the rest is raw muscle in fibrous dark-to-bright red, a creamy fat cap and marbling, thin pale
    // fascia streaks, pale rib bands on the flank and a dark dried crust at the hide line; matte-moist, never glossy plastic.
    // GORE-FIX5: the pattern is sized in real metres (uFS: bind units → m): fibres a few cm long, fat seams, ribs 6 cm apart.
    // (Sized in bind units, a deer's ribs were 45 cm bands: red and white candy stripes.) Creamy fat, never white.
    if (uFlesh > 0.0) {
      vec3 bp = vGoreBind * uFS; float gs2 = floor(vGoreSeg + 0.5);
      float hy = clamp((vGoreBind.y - uFY.x) / max(uFY.y - uFY.x, 1e-4), 0.0, 1.0) + (goreN(bp * 30.0) - 0.5) * 0.05;
      float hide = max((gs2 > 0.5 && gs2 < 1.5) || gs2 > 5.5 ? 1.0 : 0.0, 1.0 - smoothstep(0.26, 0.29, hy));
      float mf = goreN(bp * vec3(16.0, 16.0, 5.0)) * 0.6 + goreN(bp * vec3(60.0, 60.0, 14.0)) * 0.4;   // muscle bundles and fibre
      vec3 flesh = mix(vec3(0.13, 0.010, 0.010), vec3(0.36, 0.045, 0.034), smoothstep(0.2, 0.85, mf));
      flesh *= 0.8 + 0.35 * goreN(bp * 140.0);                                                        // fine grain
      // fat: thin wandering marbling seams (ridges of a noise field, not round spots) and a broader cap along the back
      float seam = (1.0 - smoothstep(0.0, 0.035, abs(goreN(bp * 9.0 + 11.0) - 0.5) + (goreN(bp * 40.0) - 0.5) * 0.04)) * (0.55 + 0.45 * goreN(bp * 18.0));
      float cap = smoothstep(0.56, 0.7, goreN(bp * 6.0 + 3.0)) * smoothstep(0.74, 0.94, hy) * 0.85;
      float fat = clamp(max(seam * smoothstep(0.35, 0.6, goreN(bp * 3.0 + 1.0)), cap), 0.0, 1.0);
      flesh = mix(flesh, vec3(0.40, 0.27, 0.13) * (0.8 + 0.3 * goreN(bp * 80.0)), fat * 0.8);
      float fas = (1.0 - smoothstep(0.0, 0.03, abs(goreN(bp * 4.0 + 5.0) - 0.5))) * (1.0 - fat) * smoothstep(0.4, 0.7, goreN(bp * 12.0));   // thin pale fascia
      flesh = mix(flesh, vec3(0.34, 0.19, 0.16), fas * 0.25);
      // ribs on the lower flank only: low bands under the meat, the meat between them sitting deeper
      float ribZ = smoothstep(0.4, 0.48, hy) * (1.0 - smoothstep(0.6, 0.7, hy)) * smoothstep(0.35, 0.6, goreN(bp * 4.0 + 7.0));
      float rs = sin(bp.z * 105.0 + goreN(bp * 9.0) * 2.0);
      float rib = smoothstep(0.7, 0.98, rs) * ribZ * (1.0 - fat);
      flesh *= 1.0 - 0.35 * ribZ * smoothstep(0.1, -0.7, rs);
      flesh = mix(flesh, vec3(0.30, 0.15, 0.12), rib * 0.45);
      float crust = 1.0 - smoothstep(0.0, 0.06, hy - 0.285); crust *= 1.0 - hide;
      flesh = mix(flesh, vec3(0.08, 0.012, 0.01), crust * 0.85);
      float fl = uFlesh * (1.0 - hide);
      diffuseColor.rgb = mix(diffuseColor.rgb, flesh, fl);
      goreFR = mix(0.86, 0.7, (1.0 - fat) * (1.0 - crust)) * step(0.001, fl) + (1.0 - step(0.001, fl)) * -1.0;
      goreWet = max(goreWet, fl * (1.0 - fat) * 0.3);
    }
  }`);
      f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, mix(0.4, 0.3, goreDark), goreWet * uGore);\n  if (goreFR > 0.0) roughnessFactor = goreFR;');   // FIX gore-cmb: a wet sheen, not gloss paint · GORE-FIX4: carcass flesh matte-moist
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
  u.uBS.value = rec.bs; u.uDown.value.set(0, -1, 0).transformDirection(_m2.copy(_m).invert());   // (_m: bind → world, from bindScale)
  REC.set(model, rec);
  return rec;
}
export const goreRec = (model) => REC.get(model) || null;
// World units per bind unit (the Quaternius people carry a ×100 armature scale).
function bindScale(body) {
  body.updateWorldMatrix(true, false);
  if (!body.skeleton) { _m.copy(body.matrixWorld); return _m.getMaxScaleOnAxis() || 1; }
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
// GORE-FIX5: move a bind-space (or morph-local) point onto the nearest point of the body's surface, if it is within
// 'far'. A weapon's hit point is often a few cm inside a big body (a bear's flank): the wound sphere then only grazed
// the skin and showed as a faint speck. Skinned bodies use the bind positions. A morph mesh (the low-poly bears) is
// matched on its current posed surface and the point is carried to the same spot of its rest shape (barycentric), so the
// wound stays on the skin through every pose, the death fall included (placed in posed space it slid off the body).
const _tri = new THREE.Triangle(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3(), _tp = new THREE.Vector3(), _tbest = new THREE.Vector3(), _bary = new THREE.Vector3();
function snapToSurface(body, p, far) {
  const g = body.geometry, pos = g?.attributes.position; if (!pos) return false;
  const morph = isMorph(body);
  const get = (i, out) => (morph ? body.getVertexPosition(i, out) : out.fromBufferAttribute(pos, i));
  const idx = g.index, n = idx ? idx.count : pos.count; let bd = far * far, bt = -1;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    get(a, _ta); get(b, _tb); get(c, _tc); _tri.set(_ta, _tb, _tc).closestPointToPoint(p, _tp);
    const d = _tp.distanceToSquared(p); if (d < bd) { bd = d; _tbest.copy(_tp); bt = t; }
  }
  if (bt < 0) return false;
  if (morph) {
    const a = idx ? idx.getX(bt) : bt, b = idx ? idx.getX(bt + 1) : bt + 1, c = idx ? idx.getX(bt + 2) : bt + 2;
    get(a, _ta); get(b, _tb); get(c, _tc); _tri.set(_ta, _tb, _tc).getBarycoord(_tbest, _bary);
    _ta.fromBufferAttribute(pos, a); _tb.fromBufferAttribute(pos, b); _tc.fromBufferAttribute(pos, c);
    p.set(0, 0, 0).addScaledVector(_ta, _bary.x).addScaledVector(_tb, _bary.y).addScaledVector(_tc, _bary.z);
  } else p.copy(_tbest);
  return true;
}
const isMorph = (body) => !body.skeleton && !!body.morphTargetInfluences?.length;
// A wound at a world point (radius in metres): converted through the nearest bone into bind space; 8 slots, FIFO.
export function addWound(model, worldPt, rWorld = 0.08, { wet = 1, maxR = 0 } = {}) {   // FIX gore-cmb maxR: the most a wound may grow to (metres)
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
  snapToSurface(body, _v, isMorph(body) ? Infinity : r * 4);   // GORE-FIX5: the hit point can lie inside the body; the wound sits on the skin
  const near = rec.wounds.find((w) => w.p.distanceTo(_v) < w.r * 0.6);
  const cap = maxR > 0 ? maxR / sc : r * 2.2;
  if (near) { near.r = Math.min(near.r * 1.25, cap); near.wet = Math.max(near.wet, wet); near.t = now; }
  else { rec.wounds.push({ p: _v.clone(), r, wet, t: now }); if (rec.wounds.length > 8) rec.wounds.shift(); }
  syncWounds(rec); ACTIVE.add(rec); HAS.add(rec);
  return rec.wounds.length;
}
const ACTIVE = new Set(), HAS = new Set();   // drying wounds; models with any wound (stats)
function syncWounds(rec) {
  const u = rec.u; u.uWN.value = rec.wounds.length;
  rec.wounds.forEach((w, i) => { u.uW.value[i].set(w.p.x, w.p.y, w.p.z, w.r); u.uWet.value[i] = w.wet; });
}
// ----- arrows (BOW): where a flight line really enters a body, and the bone that carries the arrow afterwards
const _ray = new THREE.Raycaster(), _hits = [];
function recOf(model) { return REC.get(model) || null; }
// First surface point of the model along a ray (skinned meshes are tested in their current pose). Returns a Vector3 or null.
export function rayBody(model, origin, dir, far = 4, out = new THREE.Vector3()) {
  const rec = recOf(model); if (!rec) return null;
  _ray.set(origin, dir); _ray.near = 0; _ray.far = far; _hits.length = 0;
  for (const m of rec.meshes) {
    if (!m.visible) continue;
    if (m.isSkinnedMesh) m.boundingSphere = null;       // recomputed for this pose (the cached sphere is from an old one)
    m.raycast(_ray, _hits);
  }
  if (!_hits.length) return null;
  let best = _hits[0]; for (const h of _hits) if (h.distance < best.distance) best = h;
  _hits.length = 0;
  return out.copy(best.point);
}
// The bone closest to a line (origin + dir·t, t in [t0, t1]); helper/IK bones are skipped. Returns {bone, d, t} or null.
export function boneNearLine(model, origin, dir, t0 = 0, t1 = 4) {
  const rec = recOf(model); if (!rec?.body.skeleton) return null;
  let bb = null, bd = 1e9, bt = 0;
  for (const b of rec.body.skeleton.bones) {
    if (/^(IK|Pole|FF)/.test(b.name)) continue;
    const e = b.matrixWorld.elements, x = e[12] - origin.x, y = e[13] - origin.y, z = e[14] - origin.z;
    const t = Math.min(t1, Math.max(t0, x * dir.x + y * dir.y + z * dir.z));
    const d = Math.hypot(x - dir.x * t, y - dir.y * t, z - dir.z * t);
    if (d < bd) { bd = d; bb = b; bt = t; }
  }
  return bb ? { bone: bb, d: bd, t: bt } : null;
}
export function boneNear(model, p) { const rec = recOf(model); return !rec ? null : rec.body.skeleton ? rec.body.skeleton.bones[nearestBone(rec.body, p)] : rec.body; }   // (a morph mesh carries its own arrows)
export const segRoot = (model, seg) => { const rec = recOf(model); return rec ? SEG[rec.rig]?.roots[seg] || null : null; };
export const cutMask = (model) => recOf(model)?.cut || 0;
export function woundCount(model) { return REC.get(model)?.wounds.length || 0; }
export function clearWounds(model) {
  const rec = REC.get(model); if (!rec) return;
  rec.wounds.length = 0; syncWounds(rec); ACTIVE.delete(rec); HAS.delete(rec);
  rec.u.uFlesh.value = 0;
  if (rec.cut) { rec.cut = 0; rec.u.uCut.value = 0; }
  for (const c of rec.caps) { c.parent?.remove(c); }
  rec.caps.length = 0;
  if (rec.hid) { for (const m of rec.hid) m.visible = true; rec.hid = null; }
  for (let i = emitters.length - 1; i >= 0; i--) if (emitters[i].rec === rec) emitters.splice(i, 1);
}
export function setHands(model, v) { const rec = REC.get(model); if (rec) rec.u.uHands.value = v; }

// ----- dismemberment
// FIX gore-cmb: the stump is a ragged, uneven dome (displaced sphere) coloured per vertex: raw muscle with pale fat flecks
// on the cut face, darkening to clotted blood at a torn rim; matte-wet (roughness 0.62), no glow. (Was a glossy cherry button.)
const capGeo = (() => {
  const g = new THREE.SphereGeometry(1, 18, 12), pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), v = new THREE.Vector3();
  const h3 = (x, y, z) => { const t = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return t - Math.floor(t); };
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const rim = 1 - Math.abs(v.y), k = 1 + (h3(v.x, v.y, v.z) - 0.5) * 0.34 * (0.4 + rim);   // torn, lumpy, most at the rim
    v.multiplyScalar(k); if (v.y < -0.2) v.y *= 0.6;
    pos.setXYZ(i, v.x, v.y, v.z);
    const face = Math.max(0, v.y), fat = h3(v.z * 3.1, v.x * 2.7, 1.3) > 0.86 ? 1 : 0, mus = 0.75 + 0.25 * h3(v.x * 5, v.z * 5, 2);
    let r = 0.36 * mus, gg = 0.07 * mus, b = 0.055 * mus;                 // raw muscle
    if (fat && face > 0.35) { r = 0.62; gg = 0.46; b = 0.36; }             // a fleck of fat / sinew
    const clot = Math.min(1, Math.max(0, (0.55 - face) / 0.55));           // the dark clotted rim and sides
    r = r * (1 - clot) + 0.1 * clot; gg = gg * (1 - clot) + 0.012 * clot; b = b * (1 - clot) + 0.01 * clot;
    col.set([r, gg, b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
})(), stubGeo = new THREE.CylinderGeometry(1, 0.8, 1, 8);
let fleshMat = null, boneMat = null;
function capMats() {
  fleshMat ||= new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0 });
  boneMat ||= new THREE.MeshStandardMaterial({ color: 0xd2c6b0, roughness: 0.7 });
  if (!cfg.blood) fleshMat.color.set(0x8a7a66);
}
// Stump cap: wet flesh with a stub of pale bone, attached to the parent bone so it follows the body.
function makeCap(bone, r, outward) {
  capMats();
  const g = new THREE.Group(); g.userData.goreCap = 1;
  const f = new THREE.Mesh(capGeo, fleshMat); f.scale.set(r, r * 0.55, r); g.add(f);
  const b = new THREE.Mesh(stubGeo, boneMat); b.scale.set(r * 0.24, r * 0.5, r * 0.24); b.position.y = r * 0.42; g.add(b);   // a pale bone end just proud of the cut
  bone.getWorldPosition(g.position);
  g.quaternion.setFromUnitVectors(_UP, outward);
  return g;
}
function farthestChild(bone) {
  let far = bone, fd = 0; bone.getWorldPosition(_v3);
  bone.traverse((c) => { if (!c.isBone) return; c.getWorldPosition(_v); const d = _v.distanceTo(_v3); if (d > fd) { fd = d; far = c; } });
  return far;
}
// FIX gore-cmb: up to 72 posed world points of the vertices that belong to segment seg (every skinned mesh of the model)
function segSamples(rec, seg) {
  const out = [], all = [];
  for (const m of rec.meshes) {
    const sg = m.geometry.attributes.aSeg, pos = m.geometry.attributes.position; if (!sg || !m.isSkinnedMesh) continue;
    for (let i = 0; i < pos.count; i++) if (Math.round(sg.getX(i)) === seg) all.push([m, i]);
  }
  const st = Math.max(1, Math.floor(all.length / 72));
  for (let k = 0; k < all.length; k += st) { const [m, i] = all[k]; const v = new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position, i); m.applyBoneTransform(i, v); out.push(v.applyMatrix4(m.matrixWorld)); }
  return out;
}
// the lowest sample of a piece above the ground (negative: below it), with the pivot at pos/quat
function pieceLow(p) {
  let lo = 1e9; const q = p.pivot.quaternion, o = p.pivot.position;
  for (let k = 0; k < p.loc.length; k += p.loc.length > 40 ? 2 : 1) { _v.copy(p.loc[k]).applyQuaternion(q).add(o); const d = _v.y - getH(_v.x, _v.z); if (d < lo) lo = d; }
  return lo;
}
// Sever a segment (1 head, 2-5 limbs, 6 tail on animals): hide it on the body (shader discard + shadow depth material),
// cap the stump, throw a posed copy of the limb that tumbles and comes to rest, spurt from both ends.
export function sever(model, seg, { dir = null, sceneRoot = null } = {}) {
  const rec = REC.get(model); if (!rec || !ready || !cfg.blood || cfg.level !== 'high' || lowMode()) return null;
  const bit = 1 << seg; if (rec.cut & bit) return null;
  const rootName = SEG[rec.rig]?.roots[seg]; if (!rootName) return null;
  const bone = rec.body.skeleton?.bones.find((b) => b.name.replace(/\./g, '') === rootName); if (!bone?.parent) return null;
  model.updateMatrixWorld(true);
  counters.severed++;
  rec.cut |= bit; rec.u.uCut.value = rec.cut;
  for (const m of rec.meshes) if (!m.customDepthMaterial) m.customDepthMaterial = depthMat(rec.u);
  const jp = bone.getWorldPosition(new THREE.Vector3()), tip = farthestChild(bone).getWorldPosition(new THREE.Vector3());
  // FIX gore-cmb: the piece's own vertices (posed, world): its true centre, extent and long axis (a head bone has no child)
  const smp = segSamples(rec, seg), cen = new THREE.Vector3();
  for (const q of smp) cen.add(q); if (smp.length) cen.divideScalar(smp.length); else cen.copy(jp).add(tip).multiplyScalar(0.5);
  if (jp.distanceTo(tip) < 0.03) tip.copy(smp.length ? cen.clone().sub(jp).multiplyScalar(2).add(jp) : bone.parent.getWorldPosition(new THREE.Vector3()).sub(jp).negate().add(jp));
  const len = Math.max(0.12, jp.distanceTo(tip)), out = tip.clone().sub(jp).normalize();
  const r = seg === 6 && rec.rig === 'quad' ? Math.min(0.04, Math.max(0.016, len * 0.07)) : Math.min(0.11, Math.max(0.035, len * (seg === 1 ? 0.22 : 0.16)));   // (a tail is thin)
  // the stump on the body
  const cap = makeCap(bone, r, out); scene.add(cap); bone.parent.attach(cap); rec.caps.push(cap);
  emitters.push({ rec, obj: cap, t: 0, life: 2.4, rate: 46, pulse: true });
  // the severed piece: a posed, unanimated copy that shows only this segment
  const copy = SkeletonUtils.clone(model);
  const u2 = newUniforms(); u2.uKeep.value = bit; u2.uBS.value = rec.bs; u2.uDown.value.copy(rec.u.uDown.value);
  rec.wounds.forEach((w, i) => { if (i < 8) { u2.uW.value[i].set(w.p.x, w.p.y, w.p.z, w.r); u2.uWet.value[i] = w.wet; } }); u2.uWN.value = rec.wounds.length;
  const pb = copy.getObjectByName(bone.name);
  const under = (o, root) => { for (let p = o; p; p = p.parent) { if (p.userData.goreArrow || p.userData.goreCap) return false; if (p === root) return true; } return false; };
  copy.traverse((o) => {
    if (o.isSkinnedMesh) { const src = o.material; o.material = src.clone(); patchWoundMaterial(o.material, { u: u2, wounds: !SKIP_MAT.test(src.name || '') && (rec.rig !== 'human' || o.geometry === rec.body.geometry) }); o.customDepthMaterial = depthMat(u2); o.castShadow = true; o.frustumCulled = false; }
    else if (o.isMesh || o.isSprite || o.isPoints || o.isLight || o.isLine) { if (!(o.isMesh && pb && under(o, pb))) o.visible = false; }   // weapons in sockets, arrows, old caps, glows; rigid parts of the piece itself (antlers on a head) stay
  });
  // rigid parts that ride the severed bones (a stag's antlers) leave the body with the piece
  bone.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.visible && !o.userData.goreCap && under(o, bone)) { o.visible = false; (rec.hid ||= []).push(o); } });
  const center = cen;
  const pivot = new THREE.Group(); pivot.position.copy(center); (sceneRoot || scene).add(pivot); pivot.updateMatrixWorld(true);
  _m.copy(pivot.matrixWorld).invert().multiply(model.matrixWorld); _m.decompose(copy.position, copy.quaternion, copy.scale);
  pivot.add(copy);
  if (pb) { const c2 = makeCap(bone, r * 0.9, out.clone().negate()); pivot.add(c2); c2.position.copy(jp).sub(center); emitters.push({ obj: c2, t: 0, life: 1.1, rate: 30, pulse: false }); }
  const d = dir ? _v.copy(dir).setY(0).normalize() : _v.set(rnd() - 0.5, 0, rnd() - 0.5).normalize();
  const vel = new THREE.Vector3(d.x * (2.2 + rnd() * 1.8) + out.x * 1.2, 2.4 + rnd() * 1.6, d.z * (2.2 + rnd() * 1.8) + out.z * 1.2);
  const spin = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(5 + rnd() * 6);
  // FIX gore-cmb: sample points (pivot-local) for ground contact by the lowest real point, and the long axis to lay it down along
  const loc = smp.map((q) => q.clone().sub(center)); let A = loc[0] || new THREE.Vector3(0, 1, 0), B = A;
  for (const q of loc) if (q.lengthSq() > A.lengthSq()) A = q;
  for (const q of loc) if (q.distanceToSquared(A) > B.distanceToSquared(A)) B = q;
  const axis = B.clone().sub(A); if (axis.lengthSq() < 1e-6) axis.copy(out); axis.normalize();
  if (!loc.length) loc.push(new THREE.Vector3(0, -Math.max(0.06, len * 0.25) * 0.5, 0));
  // GORE-FIX4: a severed human head keeps its own frame (crown up, face forward) so it comes to rest on a cheek or the
  // back of the skull, never upright on the neck like a bust
  let head = null;
  if (seg === 1 && rec.rig === 'human') { const hq = bone.getWorldQuaternion(new THREE.Quaternion()); head = { up: new THREE.Vector3(0, 1, 0).applyQuaternion(hq), fw: new THREE.Vector3(0, 0, 1).applyQuaternion(hq) }; }
  pieces.push({ pivot, copy, u: u2, vel, spin, rest: false, t: 0, r: Math.max(0.06, len * 0.25), drip: 0, loc, axis, settle: 0, q0: null, q1: null, head });
  while (pieces.length > POOL.pieces) dropPiece(pieces[0]);
  bloodBurst(jp, out, burstCount('high', true, true) * 0.8, { heavy: true, kill: true });
  groundSplat(jp.x, jp.z, 0.5, 'pool', { grow: [1.3, 5] });
  return { seg, pivot, cap };
}
// GORE-FIX4: the resting turn of a severed head: the crown points along the ground (keeping its heading), and it lies on
// whichever side it fell nearest to: a cheek (most), the back of the skull, never the neck stump or the face.
function headRest(p, n) {
  const q0 = p.q0, up = _v.copy(p.head.up).applyQuaternion(q0), fw = _v2.copy(p.head.fw).applyQuaternion(q0);
  const rt = new THREE.Vector3().crossVectors(up, fw).normalize();
  const h = up.clone().addScaledVector(n, -up.dot(n)); if (h.lengthSq() < 0.02) h.copy(fw).addScaledVector(n, -fw.dot(n)); if (h.lengthSq() < 0.02) h.set(1, 0, 0).addScaledVector(n, -n.x); h.normalize();
  // the side facing the ground: a cheek (right or left), else the back of the skull (face up, turned a little)
  const sides = [rt.clone(), rt.clone().negate(), fw.clone().negate()].map((d, i) => ({ d, i, s: -d.dot(n) + (i === 2 ? -0.35 : 0) }));
  const down = sides.sort((a, b) => b.s - a.s)[0];
  // target frame: up → h, the chosen side → -n
  const ups = _m.makeBasis(new THREE.Vector3().crossVectors(p.head.up, p.head.fw).normalize(), p.head.up, p.head.fw);   // head frame in pivot space at sever (pivot unrotated then)
  const dl = down.i === 0 ? new THREE.Vector3(1, 0, 0) : down.i === 1 ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1);   // the side in the head frame
  const tN = n.clone().negate(), tU = h, tX = new THREE.Vector3().crossVectors(tU, tN);   // world: side → tN, up → tU
  // head-frame basis vectors (x=right, y=up, z=fwd) mapped to world
  const L = [dl, new THREE.Vector3(0, 1, 0)], W = [tN, tU];
  const lc = new THREE.Vector3().crossVectors(L[0], L[1]), wc = new THREE.Vector3().crossVectors(W[0], W[1]);
  const mL = new THREE.Matrix4().makeBasis(L[0], L[1], lc), mW = new THREE.Matrix4().makeBasis(W[0], W[1], wc);
  const R = mW.multiply(mL.transpose());                 // head frame → world rest frame
  const qH = new THREE.Quaternion().setFromRotationMatrix(ups);   // head frame → pivot space
  const tilt = new THREE.Quaternion().setFromAxisAngle(tU, (rnd() - 0.5) * 0.5);   // not perfectly square to the ground
  void tX;
  return tilt.multiply(new THREE.Quaternion().setFromRotationMatrix(R)).multiply(qH.invert());
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

// GORE-FIX5: metres per bind-space unit of a body (skinned: through its first bone, as addWound; morph: its world scale)
function bindScaleOf(body) {
  body.updateWorldMatrix(true, false);
  if (!body.skeleton) return body.matrixWorld.getMaxScaleOnAxis() || 1;
  const bone = body.skeleton.bones[0];
  _m.multiplyMatrices(body.matrixWorld, body.bindMatrixInverse).multiply(bone.matrixWorld).multiply(body.skeleton.boneInverses[0]).multiply(body.bindMatrix);
  return _m.getMaxScaleOnAxis() || 1;
}
// ----- carcass: a posed copy left where the animal was butchered, skinned flesh, 120 s, then it fades away
export function leaveCarcass(model, { flesh = true, scale = 0.9, life = 120 } = {}) {
  if (!ready) return null;
  const rec = REC.get(model);
  model.updateMatrixWorld(true);
  const copy = SkeletonUtils.clone(model);
  const u = newUniforms(); u.uFlesh.value = flesh && cfg.blood ? 0.86 : 0;
  if (rec) { u.uBS.value = rec.bs; u.uDown.value.copy(rec.u.uDown.value); u.uCut.value = rec.cut; rec.wounds.forEach((w, i) => { u.uW.value[i].set(w.p.x, w.p.y, w.p.z, w.r); u.uWet.value[i] = w.wet * 0.6; }); u.uWN.value = rec.wounds.length; }
  const bodyG = rec?.body?.geometry; if (bodyG) { bodyG.boundingBox || bodyG.computeBoundingBox(); u.uFY.value.set(bodyG.boundingBox.min.y, bodyG.boundingBox.max.y); }   // GORE-FIX4: the hide line (knees)
  if (rec?.body) u.uFS.value = bindScaleOf(rec.body);   // GORE-FIX5: bind units → metres for the flesh pattern
  const mats = [];
  copy.traverse((o) => {
    if (o.isSkinnedMesh || (rec?.rig === 'mesh' && o.isMesh)) {
      const src = o.material; o.material = src.clone(); mats.push(o.material);
      const wounds = !SKIP_MAT.test(src.name || '');
      patchWoundMaterial(o.material, { u, wounds }); if (u.uCut.value) o.customDepthMaterial = depthMat(u);
      o.castShadow = true; o.frustumCulled = false;
    } else if (o.isSprite || o.isPoints || o.isLight) o.visible = false;
  });
  const arrows = []; copy.traverse((o) => { if (o.userData.goreArrow) arrows.push(o); }); for (const a of arrows) a.removeFromParent();   // the arrows went back to the quiver or fell beside it
  const g = new THREE.Group(); scene.add(g);
  _m.copy(model.matrixWorld); _m.decompose(copy.position, copy.quaternion, copy.scale);
  // scale ×0.9 about the ground point under the body, so it sinks a little rather than floating
  const base = new THREE.Vector3().setFromMatrixPosition(model.matrixWorld);
  g.position.copy(base); copy.position.sub(base); g.scale.setScalar(scale); g.add(copy);
  g.updateMatrixWorld(true);
  carcasses.push({ g, copy, mats, t: 0, life, u, foot: footprint(copy, base.y) });
  while (carcasses.length > POOL.carcasses) dropCarcass(carcasses[0]);
  return g;
}
function dropCarcass(c) {
  const i = carcasses.indexOf(c); if (i >= 0) carcasses.splice(i, 1);
  c.g.parent?.remove(c.g); for (const m of c.mats) m.dispose();
}
// GORE-FIX4: the ground footprint of a posed body: the outline of its vertices below 1.2 m over the ground (Sena keeps clear)
export function footprint(root, gy, per = 700) {
  const out = [], v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((m) => {
    if (!m.isMesh || !m.visible || !m.geometry?.attributes.position) return;
    const pos = m.geometry.attributes.position, st = Math.max(1, Math.floor(pos.count / per));
    for (let i = 0; i < pos.count; i += st) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);   // GORE-FIX5: morphs too (the low-poly bears fall by morph: the rest shape was the standing bear)
      if (v.y < gy + 1.2) out.push(v.x, v.z); }
  });
  return hull2(out);
}
// GORE-FIX5: the convex outline (counter-clockwise [x, z, ...]) of a point cloud. Keeping clear of single vertices failed
// inside a low-poly body: its big triangles leave holes between vertices, and deep inside the pushes cancelled out.
function hull2(xz) {
  const P = []; for (let i = 0; i < xz.length; i += 2) P.push([xz[i], xz[i + 1]]);
  if (P.length < 3) return new Float32Array(xz);
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return new Float32Array(lo.concat(up).flat());
}
export const carcassFeet = () => carcasses.filter((c) => c.g.visible).map((c) => c.foot);
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
      s: (0.2 + rnd() * 0.16) * (0.8 + Math.min(1.5, amt) * 0.45), t: 0, life: 2.4 + rnd() * 0.8, a: Math.min(1, 0.55 + amt * 0.45) * (cfg.reduceFlash ? 0.5 : 1) });
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
const HB = { ph: 0, lastBeat: 0, filt: '', beat: null, edge: null, bo: '', eo: '', nb: null };
function heartUpdate(dt, env) {
  HB.beat ||= document.getElementById('hurtbeat'); HB.edge ||= document.getElementById('bleededge');
  const beat = HB.beat, edge = HB.edge, nb = !cfg.blood;
  if (HB.nb !== nb) { HB.nb = nb; beat?.classList.toggle('nb', nb); edge?.classList.toggle('nb', nb); }   // DOM writes only on a change
  const show = cfg.screen && env.playing && !env.dead;
  const { bpm, amp } = heartbeat(env.hp ?? 100);
  let o = 0;
  if (show && amp > 0) {
    const prev = HB.ph; HB.ph = (HB.ph + dt * bpm / 60) % 1;
    if (HB.ph < prev) env.thump?.(amp);                 // lub
    const lub = Math.exp(-((HB.ph - 0.04) ** 2) / 0.0025), dub = 0.6 * Math.exp(-((HB.ph - 0.24) ** 2) / 0.003);
    o = amp * (0.35 + 0.65 * Math.max(lub, dub)) * (cfg.reduceFlash ? 0.5 : 1);
  }
  const bo = o.toFixed(3); if (beat && bo !== HB.bo) { HB.bo = bo; beat.style.opacity = bo; }
  let eo = 0;
  if (show && env.bleeding) eo = (0.25 + 0.25 * Math.sin(now * 3.4)) * (cfg.reduceFlash ? 0.5 : 1);
  const es = eo.toFixed(3); if (edge && es !== HB.eo) { HB.eo = es; edge.style.opacity = es; }
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
        if (rnd() < DR.splat[i]) { const hs = Math.hypot(vx, vz); groundSplat(x, z, 0.06 + DR.r[i] * 6 + rnd() * 0.07, 'blood', { dir: hs > 0.3 ? Math.atan2(vx, vz) : null, stretch: 1 + Math.min(1.8, hs * 0.45) }); }   // FIX gore-cmb: elongated along the drop's travel
        killDrop(i); continue;
      }
      const sp = Math.hypot(vx, vy, vz), r = DR.r[i];
      if (sp > 1e-4) { _v.set(vx / sp, vy / sp, vz / sp); _q.setFromUnitVectors(_UP, _v); } else _q.identity();
      const thin = 1 / Math.sqrt(1 + Math.min(4, sp * 0.8));   // FIX gore-cmb: a streak along the velocity (motion blur), thinner as it stretches
      _m.compose(_v3.set(x, y, z), _q, _s.set(r * thin, r * (1 + Math.min(5, sp * 0.9)), r * thin)); DR.m.setMatrixAt(i, _m);
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
        spawnDrop(_v2.x, _v2.y, _v2.z, (_v.x + (rnd() - 0.5) * 0.4) * sp, (_v.y + (rnd() - 0.5) * 0.4) * sp, (_v.z + (rnd() - 0.5) * 0.4) * sp, 0.006 + rnd() * 0.008, 0.5);
      }
    }
  }
  // severed pieces: a simple tumbling body that settles on the terrain and drips
  // FIX gore-cmb: contact by the piece's lowest real point (not its centre), then it settles lying along the ground
  for (const p of pieces) {
    p.t += dt;
    if (!p.rest) {
      p.vel.y -= 9.8 * dt; p.pivot.position.addScaledVector(p.vel, dt);
      _q.setFromAxisAngle(_v2.copy(p.spin).normalize(), p.spin.length() * dt); p.pivot.quaternion.premultiply(_q);
      const lo = pieceLow(p);
      if (lo < 0) {
        p.pivot.position.y -= lo;
        if (p.vel.y < -1.2) { if (cfg.blood) groundSplat(p.pivot.position.x, p.pivot.position.z, 0.22, 'blood'); }
        p.vel.y = -p.vel.y * 0.22; p.vel.x *= 0.45; p.vel.z *= 0.45; p.spin.multiplyScalar(0.4);
        if (p.vel.length() < 0.5 || p.t > 4) {
          p.rest = true; p.settle = 0; p.q0 = p.pivot.quaternion.clone();
          // lay the long axis along the ground (the terrain's slope), keeping its heading
          const aw = _v2.copy(p.axis).applyQuaternion(p.q0), x = p.pivot.position.x, z = p.pivot.position.z;
          const n = _v3.set(getH(x - 0.3, z) - getH(x + 0.3, z), 0.6, getH(x, z - 0.3) - getH(x, z + 0.3)).normalize();
          const h = new THREE.Vector3(aw.x, 0, aw.z); if (h.lengthSq() < 0.04) h.set(Math.cos(p.t * 7), 0, Math.sin(p.t * 7));
          h.addScaledVector(n, -h.dot(n)).normalize();
          p.q1 = new THREE.Quaternion().setFromUnitVectors(aw.normalize(), h).multiply(p.q0);
          if (p.head) p.q1 = headRest(p, n);
          if (cfg.blood) groundSplat(p.pivot.position.x, p.pivot.position.z, 0.3, 'pool', { grow: [0.6, 6] });
        }
      }
    } else if (p.settle < 1) {
      p.settle = Math.min(1, p.settle + dt / 0.35);
      p.pivot.quaternion.slerpQuaternions(p.q0, p.q1, smooth(p.settle));
      p.pivot.position.y -= pieceLow(p) + 0.012;            // resting in the grass: its lowest point just under the surface
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
  if (FPT) { if (!focusOn) FPT.visible = false; else FPT.material.opacity = 0.5 + 0.35 * SPU.uPulse.value; }
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
    mist: MIST ? MIST.list.filter((f) => f.s.visible).length : 0, capDrops, capSplats, focus: focusOn, focusPts: focusOn ? focusN : 0, level: cfg.level, blood: cfg.blood };
}
// FIX gore-cmb (tests): each severed piece's lowest point above the ground and how upright its long axis stands (|y| of the unit axis)
export function pieceInfo() { return pieces.map((p) => ({ low: +pieceLow(p).toFixed(3), rest: p.rest, settle: +p.settle.toFixed(2), up: +Math.abs(_v.copy(p.axis).applyQuaternion(p.pivot.quaternion).y).toFixed(2), n: p.loc.length, at: [p.pivot.position.x, p.pivot.position.y, p.pivot.position.z].map((x) => +x.toFixed(2)) })); }
