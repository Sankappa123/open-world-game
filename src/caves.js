import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';   // CAVE-LOOK: the paintings sit on the rock
import { rng, lerp, smooth, part, merge, lumpy, canvasTex } from './util.js';

// WP3 caves: "a chamber in a hillside". The heightfield cannot overhang, so each cave is a flattened disc chamber
// under a hollow rock dome set into the front of its hill, plus a short entrance tube. The hill rises behind and
// around the dome, so from outside only the arched mouth shows.
export const CAVES = [
  { id: 'echo', name: 'Echo Hollow', c: [-138, -108], R: 11, H: 6.5 },
  { id: 'flint', name: 'Flint Deep', c: [-40, -192], R: 13, H: 8 },
];
const TUBE = 3.6, RAMP = 22, SEAL = 2.4;   // FPP-world SEAL: the inner wall sits this far inside the dome rim
// Derived data needs the base land height, so world.js calls this once before it builds the terrain.
export function initCaves(land) {
  for (const k of CAVES) {
    const l = Math.hypot(k.c[0], k.c[1]);
    k.x = k.c[0]; k.z = k.c[1];
    k.dir = [-k.c[0] / l, -k.c[1] / l];                     // toward the origin (home)
    k.mouth = [k.x + k.dir[0] * (k.R + 5), k.z + k.dir[1] * (k.R + 5)];
    k.floor = land(k.mouth[0], k.mouth[1]) + 0.2;
  }
}
// s: distance from the centre along the entrance axis (outward), lat: distance off the axis.
const axis = (k, x, z) => {
  const dx = x - k.x, dz = z - k.z;
  return [dx * k.dir[0] + dz * k.dir[1], Math.abs(dx * k.dir[1] - dz * k.dir[0]), Math.hypot(dx, dz)];
};
export function caveAt(x, z) {
  for (const k of CAVES) {
    if (!k.dir) continue;
    const [s, lat, d] = axis(k, x, z);
    if (d < k.R + 8 || (lat < 6 && s > 0 && s < k.R + 5 + RAMP)) return { cave: k, d, m: Math.hypot(x - k.mouth[0], z - k.mouth[1]) };
  }
  return null;
}
// 0 outside; inside the dome or tube it rises with the distance travelled in from the mouth.
export function depthAt(x, z) {
  for (const k of CAVES) {
    if (!k.dir) continue;
    const [s, lat, d] = axis(k, x, z);
    if (d < k.R - 0.2 || (lat < TUBE && s > k.R - 1.5 && s < k.R + 5)) return smooth(0, 8, k.R + 5 - s);
  }
  return 0;
}
export function caveCarve(h, x, z) {
  for (const k of CAVES) {
    if (!k.dir) continue;
    const [s, lat, d] = axis(k, x, z);
    if (d > k.R + 30 && s < 0) continue;
    h = lerp(h, k.floor, 1 - smooth(k.R - 0.3, k.R + 2, d));
    if (s > 0 && s < k.R + 5 + RAMP + 4) {
      // the corridor: flat to the mouth, then a gentle ramp out until it meets the hillside
      // FPP-world: inside the tube the floor stays flat out to the wall (the lifted grid triangles there poked up through
      // the tube as cream ledges); from the mouth on it eases back to the old cut, so the hillside and the scatter are unchanged
      const lo = lerp(TUBE + 1.5, TUBE - 0.2, smooth(k.R + 5.5, k.R + 7.5, s));   // (the 2.5 m grid needs ~1.5 m beyond the wall to stay flat at it)
      const r = s - (k.R + 5), target = k.floor + (r < -2 ? 0 : r < 2 ? 0.03 * (r + 2) * (r + 2) : r * 0.24), m =   // FPP-world: the ramp eases in (no crease at the mouth)
        (1 - smooth(lo, TUBE + 2.2, lat)) * (1 - smooth(k.R + 5 + RAMP, k.R + 5 + RAMP + 4, s));
      h = lerp(h, Math.min(h, target), m);
    }
  }
  return h;
}
// FPP-world: 1 on a cave's floor (the dome and the entrance tube), easing to 0 a few metres out past the mouth, so the
// terrain there is dirt and rock instead of meadow grass and the tube end blends into the hillside with no seam.
export function floorMask(x, z) {
  let m = 0;
  for (const k of CAVES) {
    if (!k.dir) continue;
    const [s, lat, d] = axis(k, x, z);
    m = Math.max(m, 1 - smooth(k.R - 0.5, k.R + 2, d));
    if (s > 0) m = Math.max(m, (1 - smooth(TUBE + 0.5, TUBE + 3.5, lat)) * (1 - smooth(k.R + 4, k.R + 11, s)));
  }
  return m;
}
// Is (x, z) in a cave footprint? Scatter (trees, rocks, grass) skips these spots.
export function inCave(x, z, pad = 0) {
  for (const k of CAVES) {
    if (!k.dir) continue;
    const [s, lat, d] = axis(k, x, z);
    if (d < k.R + 2.5 + pad || (lat < TUBE + 2.5 + pad && s > 0 && s < k.R + 5 + RAMP)) return true;
  }
  return false;
}

// ---------- paintings (2D canvas, ochre on transparent) ----------
const OCH = '#b5532f';   // CAVE-LOOK: a little brighter (the pigment read near-black against the pale lit rock)
function horse(g, x, y, s, lean = 0) {
  g.save(); g.translate(x, y); g.scale(s, s); g.rotate(lean);
  g.beginPath(); g.ellipse(0, 0, 34, 13, 0, 0, 6.3); g.fill();                 // body
  g.beginPath(); g.moveTo(26, -6); g.lineTo(44, -26); g.lineTo(54, -22); g.lineTo(34, 2); g.fill();   // neck and head
  g.lineWidth = 5;
  for (const [a, b] of [[-24, -12], [-14, -30], [18, 28], [26, 10]]) { g.beginPath(); g.moveTo(a, 6); g.lineTo(b, 36); g.stroke(); }
  g.beginPath(); g.moveTo(-32, -4); g.quadraticCurveTo(-48, 0, -50, 18); g.stroke();   // tail
  g.restore();
}
function hand(g, x, y, s, rot = 0) {
  g.save(); g.translate(x, y); g.scale(s, s); g.rotate(rot);
  g.beginPath(); g.ellipse(0, 0, 13, 15, 0, 0, 6.3); g.fill();
  for (const [fx, len, a] of [[-11, 17, -0.5], [-5, 24, -0.15], [2, 26, 0], [9, 23, 0.15]]) { g.save(); g.translate(fx, -10); g.rotate(a); g.fillRect(-2.6, -len, 5.2, len); g.restore(); }
  g.save(); g.translate(12, 2); g.rotate(1.0); g.fillRect(-2.6, -16, 5.2, 16); g.restore();
  g.restore();
}
const PAINT = [
  (g) => { horse(g, 120, 140, 1.3); horse(g, 260, 120, 1.1, -0.05); horse(g, 390, 150, 1.25); horse(g, 200, 200, 0.8); },
  (g) => {
    horse(g, 250, 150, 2);
    g.beginPath(); g.arc(240, 58, 12, 0, 6.3); g.fill();                       // the rider
    g.lineWidth = 7; g.beginPath(); g.moveTo(240, 70); g.lineTo(236, 118); g.stroke();
    g.beginPath(); g.moveTo(238, 82); g.lineTo(212, 46); g.moveTo(238, 82); g.lineTo(266, 44); g.stroke();   // arms raised
    g.beginPath(); g.moveTo(236, 118); g.lineTo(222, 150); g.stroke();
  },
  (g) => {
    g.beginPath(); g.moveTo(256, 200); g.lineTo(236, 150); g.lineTo(256, 168); g.lineTo(262, 128); g.lineTo(276, 170); g.lineTo(282, 150); g.closePath(); g.fill();   // the fire
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283, big = i % 2; hand(g, 256 + Math.cos(a) * 170, 140 + Math.sin(a) * 92, big ? 1.4 : 0.85, a + 1.57); }
  },
  (g) => {
    g.beginPath(); g.moveTo(256, 170); g.lineTo(242, 136); g.lineTo(258, 148); g.lineTo(264, 120); g.lineTo(274, 166); g.closePath(); g.fill();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * 6.283, x = 256 + Math.cos(a) * 190, y = 150 + Math.sin(a) * 82;
      g.beginPath(); g.moveTo(x - 20, y + 16); g.lineTo(x, y - 18); g.lineTo(x + 20, y + 16); g.closePath(); g.fill();   // huts
    }
  },
];
// CAVE-LOOK: the pigment is laid on with a soft edge and has worn away in flecks over the ages (the fresh handprints
// the player leaves later are drawn crisp on top).
function panelTex(draw) {
  const t = canvasTex(512, (g) => {
    g.clearRect(0, 0, 512, 512); g.globalAlpha = 0.85; g.fillStyle = g.strokeStyle = OCH; g.lineCap = 'round';
    g.filter = 'blur(1.2px)'; g.save(); g.scale(1, 2); if (draw) draw(g); g.restore(); g.filter = 'none';
    if (draw) {
      const R = rng(77);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 2600; i++) { g.globalAlpha = 0.25 + R() * 0.6; g.beginPath(); g.arc(R() * 512, R() * 512, 0.6 + R() * 2.6, 0, 6.3); g.fill(); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------- CAVE-LOOK: the rock shader ----------
// Triplanar rock (no stretched UVs on the dome, tube, seal and boulders) with a baked relief (bump), iron-stain runs,
// damp walls near the floor (darker and glossier), moss on up-facing outside rock, and a floor mode (packed earth,
// stones, puddles). tex null keeps the material's own map (the paintings) and adds only the relief, so the pigment
// follows the same rock as the wall under it.
// The relief is baked once into a small tiling texture (R, G: its slope; B: height; A: a broad, slow noise for colour
// and damp patches): per-pixel 3D noise cost ~60% of the frame rate inside a cave.
let DET = null;
function detailTexture() {
  if (DET) return DET;
  const S = 256, R = rng(4242), lat = (n) => {
    const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = R();
    return (u, v) => {
      const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const i0 = ((y0 % n) + n) % n, i1 = (i0 + 1) % n, j0 = ((x0 % n) + n) % n, j1 = (j0 + 1) % n;
      return lerp(lerp(g[i0 * n + j0], g[i0 * n + j1], sx), lerp(g[i1 * n + j0], g[i1 * n + j1], sx), sy);
    };
  };
  const oct = [3, 6, 12, 24, 48].map(lat), amp = [0.5, 0.26, 0.13, 0.07, 0.035], rid = lat(9), big = [lat(2), lat(5)];
  const H = new Float32Array(S * S), L = new Float32Array(S * S);
  let lo = 1e9, hi = -1e9;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let h = 0;
    for (let o = 0; o < 5; o++) h += amp[o] * oct[o](u, v);
    h += 0.16 * (1 - Math.abs(rid(u, v) * 2 - 1));
    H[y * S + x] = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
    L[y * S + x] = 0.65 * big[0](u, v) + 0.35 * big[1](u, v);
  }
  const d = new Uint8Array(S * S * 4), at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = (at(x + 1, y) - at(x - 1, y)) * S / 2 / (hi - lo), gy = (at(x, y + 1) - at(x, y - 1)) * S / 2 / (hi - lo);   // slope per tile
    const i = (y * S + x) * 4;
    d[i] = Math.max(0, Math.min(255, (gx / 24 * 0.5 + 0.5) * 255)); d[i + 1] = Math.max(0, Math.min(255, (gy / 24 * 0.5 + 0.5) * 255));
    d[i + 2] = ((H[y * S + x] - lo) / (hi - lo)) * 255; d[i + 3] = L[y * S + x] * 255;
  }
  DET = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  DET.wrapS = DET.wrapT = THREE.RepeatWrapping; DET.magFilter = THREE.LinearFilter; DET.minFilter = THREE.LinearMipmapLinearFilter;
  DET.generateMipmaps = true; DET.anisotropy = 4; DET.needsUpdate = true;
  return DET;
}
const CV_GLSL = `varying vec3 vCW; varying vec3 vCN;
uniform sampler2D uRock, uDet; uniform float uFloor, uMoss, uWet, uBump;
float cvH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cvN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cvH(i), cvH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(cvH(i + vec3(0.0, 1.0, 0.0)), cvH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(cvH(i + vec3(0.0, 0.0, 1.0)), cvH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(cvH(i + vec3(0.0, 1.0, 1.0)), cvH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
vec3 cvTri(vec3 p, vec3 w, float b) { return texture2D(uRock, p.zy, b).rgb * w.x + texture2D(uRock, p.xz, b).rgb * w.y + texture2D(uRock, p.xy, b).rgb * w.z; }   // b: a mip bias (the fine cracks read as scribbles up close)
// the baked relief, triplanar: returns the world-space slope (per metre) and, in d, the height (x) and broad noise (y)
vec3 cvRel(vec3 q, float sc, vec3 w, out vec2 d) {
  vec3 p = q * sc; vec4 a = texture2D(uDet, p.zy), b = texture2D(uDet, p.xz), c = texture2D(uDet, p.xy);
  d = vec2(a.b * w.x + b.b * w.y + c.b * w.z, a.a * w.x + b.a * w.y + c.a * w.z);
  vec2 ga = (a.rg * 2.0 - 1.0) * 24.0, gb = (b.rg * 2.0 - 1.0) * 24.0, gc = (c.rg * 2.0 - 1.0) * 24.0;
  return (vec3(0.0, ga.y, ga.x) * w.x + vec3(gb.x, 0.0, gb.y) * w.y + vec3(gc.x, gc.y, 0.0) * w.z) * sc;
}
`;
const CV_MAP = `vec3 cvNw = normalize(vCN);
vec3 cvW = pow(abs(cvNw), vec3(4.0)); cvW /= cvW.x + cvW.y + cvW.z;
vec2 cvD1, cvD2, cvD3;
vec3 cvG = cvRel(vCW, 0.36, cvW, cvD1) * 0.55 + cvRel(vCW + 7.3, 0.12, cvW, cvD2) * 1.0;   // two scales: hand-sized and boulder-sized
cvRel(vCW, 0.035, cvW, cvD3);                                                           // only for its broad noise (~30 m)
float cvB0 = cvD1.x * 0.6 + cvD2.x * 0.4, cvBig = cvD3.y;
float cvWet = 0.0;
#ifdef CV_TEX
  vec3 cvC = mix(cvTri(vCW * 0.21, cvW, 1.6), cvTri(vCW * 0.057 + 0.31, cvW, 3.0), 0.45) * 2.5;
  cvC *= (0.68 + 0.62 * cvBig) * (0.8 + 0.3 * cvB0);
  float cvSt = smoothstep(0.56, 0.86, cvN(vec3(vCW.x * 1.1, vCW.y * 0.08, vCW.z * 1.1)));
  cvC = mix(cvC, cvC * vec3(1.2, 0.9, 0.68), cvSt * 0.6);
  cvWet = uWet * (1.0 - smoothstep(0.05, 1.5, vCW.y - uFloor + 0.6 * (cvBig - 0.5)));
  #ifdef CV_FLOOR
    float cvS = smoothstep(0.55, 0.68, cvD1.x);
    vec3 cvDirt = vec3(0.34, 0.28, 0.22) * (0.75 + 0.5 * cvD2.x);
    cvC = mix(cvDirt, cvC * 0.95, cvS);
    float cvP = smoothstep(0.62, 0.7, cvD1.y * 0.5 + cvD3.y * 0.5);
    cvWet = max(cvWet * 0.5, cvP * 0.55);
  #endif
  cvC *= 1.0 - 0.34 * cvWet;
  float cvMo = uMoss * smoothstep(0.3, 0.75, cvNw.y) * smoothstep(0.4, 0.62, cvD2.y * 0.6 + cvB0 * 0.4);
  cvC = mix(cvC, vec3(0.15, 0.2, 0.08) * (0.7 + 0.7 * cvBig), cvMo);
  diffuseColor.rgb *= cvC;
#else
  #include <map_fragment>
#endif`;
const CV_NORMAL = `#include <normal_fragment_maps>
{ vec3 cvN0 = cvNw * faceDirection; if (dot(cvN0, cameraPosition - vCW) < 0.0) cvN0 = -cvN0;   // always toward the viewer (the decals' winding can run either way)
  vec3 cvGr = cvG; cvGr -= dot(cvGr, cvN0) * cvN0;
  normal = normalize((viewMatrix * vec4(normalize(cvN0 - uBump * (1.0 - 0.75 * cvWet) * 0.5 * cvGr), 0.0)).xyz); }`;
function rockShader(m, { tex = null, floor = 0, moss = 0, wet = 0, bump = 1, floorMode = false } = {}) {
  const U = { uRock: { value: tex }, uDet: { value: detailTexture() }, uFloor: { value: floor }, uMoss: { value: moss }, uWet: { value: wet }, uBump: { value: bump } };
  m.defines = { ...(m.defines || {}), ...(tex ? { CV_TEX: '' } : {}), ...(floorMode ? { CV_FLOOR: '' } : {}) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vCW; varying vec3 vCN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 cvWp = vec4(transformed, 1.0); vec3 cvOn = objectNormal;
      #ifdef USE_INSTANCING
        cvWp = instanceMatrix * cvWp; cvOn = mat3(instanceMatrix) * cvOn;
      #endif
      vCW = (modelMatrix * cvWp).xyz; vCN = normalize(mat3(modelMatrix) * cvOn);`);
    sh.fragmentShader = CV_GLSL + sh.fragmentShader
      .replace('#include <map_fragment>', CV_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.5 * cvWet;')
      .replace('#include <normal_fragment_maps>', CV_NORMAL);
  };
  m.customProgramCacheKey = () => 'hb-cave-rock' + (tex ? '-t' : '') + (floorMode ? '-f' : '');
  return m;
}
// util.lumpy's radial factor at a point (the analytic copy lets the dressing test itself against the walls)
const lumpF = (x, y, z, amp, f) => 1 + amp * (Math.sin(x * f * 2.1 + y * f) * Math.cos(z * f * 1.7 + x) + Math.sin(y * f * 2.7 + z * 1.3) * 0.6);
const DOME_L = [[0.06, 2.6], [0.022, 6.5]];   // CAVE-LOOK: a second, finer octave breaks up the smooth bubble
const DOME_SOFT = 0.06;                          // the soft clamp that keeps the wall foot on the flat floor (below)
// CAVE-LOOK: the same wall shape in GLSL, for the terrain shader in world.js: is a point (in dome units: x / R,
// (y - base) / H, z / R) inside the hollow? lim: (R - 0.35) / R. Kept beside the JS that builds the mesh.
export const CAVE_DOME_GLSL = `
float cvLump(vec3 p, float amp, float f) { return 1.0 + amp * (sin(p.x * f * 2.1 + p.y * f) * cos(p.z * f * 1.7 + p.x) + sin(p.y * f * 2.7 + p.z * 1.3) * 0.6); }
bool cvInDome(vec3 q, float lim) {
  float ql = length(q); if (ql < 0.001) return true;
  vec3 u = q / ql; vec3 p = u * cvLump(u, ${DOME_L[0][0]}, ${DOME_L[0][1]}); p *= cvLump(p, ${DOME_L[1][0]}, ${DOME_L[1][1]});
  float hr = length(p.xz), w = 1.0 - smoothstep(0.0, 0.85, p.y), soft = lim - ${DOME_SOFT};
  if (hr > soft && w > 0.0) { float t = soft + ${DOME_SOFT} * tanh((hr - soft) / ${DOME_SOFT}); p.xz *= mix(1.0, t / hr, w); }
  p.y = max(p.y, -0.05);
  return ql < length(p) + 0.03;
}`;
// A tapering spike (stalactite / stalagmite) as a lathe: base at y 0, tip at y h, with a little irregularity.
function spike(r, h, R, seg = 7) {
  const pts = [];
  for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(new THREE.Vector2(Math.max(0.004, r * Math.pow(1 - t, 1.5) * (1 + (R() - 0.5) * 0.25)), t * h)); }
  pts.push(new THREE.Vector2(0.001, h * 1.01));
  const g = new THREE.LatheGeometry(pts, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), w = Math.sin(y * 7.3 + R() * 0.2) * 0.12 * r; p.setX(i, p.getX(i) + w); p.setZ(i, p.getZ(i) + Math.cos(y * 5.1) * 0.1 * r); }
  return g;
}
function dotTexture() {
  return canvasTex(64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}

// deps: { NAT, rockTex, addCollider, clear, Field, pmat, getH }
export function createCaves(scene, { NAT, rockTex, addCollider: addCol, clear, Field, pmat, getH }) {
  const R = rng(9123);
  const cols = [], addCollider = (c) => { c.why = c.why || 'cave'; cols.push(c); return addCol(c); };   // CAVE-LOOK: kept for G.caves.cols (tests)
  const ray = new THREE.Raycaster();
  // CAVE-LOOK: the outside boulders share one triplanar material with moss on their tops (the stretched pack UVs went)
  const boulderM = rockShader(new THREE.MeshStandardMaterial({ color: 0xcfc4b4, roughness: 0.95 }), { tex: rockTex, moss: 0.85, bump: 0.75 });
  const panels = [], bats = [], sconces = [], crystals = [], flintNodes = [], ochreNodes = [], beds = [], motes = [], shafts = [];
  const H0 = getH || (() => 0);
  let paintI = 0;
  const _v = new THREE.Vector3();
  for (const k of CAVES) {
    const g = new THREE.Group();
    g.name = 'cave-' + k.id;
    scene.add(g);
    // CAVE-LOOK: per-cave rock (its floor height drives the damp band), the calcite formations a little paler, the floor
    const rockM = rockShader(new THREE.MeshStandardMaterial({ color: 0xd6cbbb, roughness: 0.93, side: THREE.DoubleSide }), { tex: rockTex, floor: k.floor, wet: 1, bump: 0.6 });
    const formM = rockShader(new THREE.MeshStandardMaterial({ color: 0xe6d8c0, roughness: 0.72 }), { tex: rockTex, floor: k.floor, wet: 0.6, bump: 0.6 });
    const floorM = rockShader(new THREE.MeshStandardMaterial({ color: 0xd2c6b4, roughness: 0.96, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), { tex: rockTex, floor: k.floor, wet: 0.5, bump: 0.3, floorMode: true });
    const ang = Math.atan2(k.dir[0], k.dir[1]);           // heading of the entrance (x = sin, z = cos)
    const gap = Math.asin(Math.min(0.9, (TUBE + 0.3) / k.R));   // the rim colliders leave this half-angle open
    // ---- dome: upper hemisphere with an entrance gap, lumpy, scaled (R, H, R) ----
    // FPP-world: the gap is cut to the tube's own round profile on a finer mesh (it used to be a wide wedge of
    // coarse triangles reaching well above the tube, which showed the sky as white holes from inside).
    // sMin: how far out the gap starts (the seal wall below sits just in front of it).
    const src = new THREE.IcosahedronGeometry(1, 8), sp = src.attributes.position, out = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    const inTube = (v) => {                              // unit dome point -> inside the tube's cross-section (+ margin)?
      const X = v.x * k.R, Z = v.z * k.R, y = v.y * k.H - 0.05, s = X * k.dir[0] + Z * k.dir[1], lat = X * k.dir[1] - Z * k.dir[0];
      return s > 0 && lat * lat + y * y < (TUBE + 0.2) * (TUBE + 0.2) ? s : 0;
    };
    let sMin = k.R;
    for (let i = 0; i < sp.count; i += 3) {
      a.fromBufferAttribute(sp, i); b.fromBufferAttribute(sp, i + 1); c.fromBufferAttribute(sp, i + 2);
      m.copy(a).add(b).add(c).divideScalar(3);
      if (m.y < -0.05) continue;
      if (inTube(a) || inTube(b) || inTube(c) || inTube(m)) {
        for (const v of [a, b, c]) sMin = Math.min(sMin, (v.x * k.dir[0] + v.z * k.dir[1]) * k.R);
        continue;
      }
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    let dome = new THREE.BufferGeometry();
    dome.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    for (const [amp, f] of DOME_L) lumpy(dome, amp, f);
    dome = mergeVertices(dome);
    const dp = dome.attributes.position, uv = new Float32Array(dp.count * 2);
    // CAVE-LOOK: near the floor the wall never bulges past 0.97 R. Beyond R - 0.3 the terrain climbs toward the hill, and
    // where the lumpy wall stood out there that slope showed inside as a raised bank (it buried the crystals).
    const lim = (k.R - 0.35) / k.R;
    for (let i = 0; i < dp.count; i++) {
      let x = dp.getX(i), z = dp.getZ(i);
      const y = dp.getY(i), hr = Math.hypot(x, z), w = 1 - smooth(0.0, 0.85, y), soft = lim - DOME_SOFT;
      if (hr > soft && w > 0) {                       // a soft clamp over a tall band: the wall leans in gently, no ledge
        const t = soft + DOME_SOFT * Math.tanh((hr - soft) / DOME_SOFT), f = lerp(1, t / hr, w); x *= f; z *= f;
      }
      dp.setXYZ(i, x * k.R, Math.max(y, -0.05) * k.H, z * k.R);
      uv[i * 2] = (Math.atan2(z, x) / 6.283) * k.R * 0.7; uv[i * 2 + 1] = y * k.H * 0.12 + Math.hypot(x, z) * 0.1;
    }
    dome.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    dome.computeVertexNormals();
    const domeM = new THREE.Mesh(dome, rockM); domeM.name = 'dome';
    domeM.position.set(k.x, k.floor - 0.35, k.z);
    domeM.castShadow = domeM.receiveShadow = true;
    g.add(domeM);
    // ---- entrance tube: half cylinder from the inner seal (below) to the mouth ----
    // FPP-world: the seal stands just in front of the dome's gap (lumpy walls move up to ~1 m, hence the margin)
    const ss = Math.min(k.R - SEAL, sMin - 1.2);
    const s0 = ss - 0.3, s1 = k.R + 6.8, sm = (s0 + s1) / 2;   // FPP-world s1: the arch stands just proud of the hillside
    k.tube = [s0, s1, TUBE];                            // FPP-world: world.js cuts the terrain out of the tube with these
    const len = s1 - s0, tube = new THREE.CylinderGeometry(TUBE, TUBE, len, 26, 9, true, -Math.PI / 2 - 0.3, Math.PI + 0.6);   // FPP-world: walls run on below the floor (no gap under them)
    tube.rotateX(-Math.PI / 2); lumpy(tube, 0.035, 1.3); lumpy(tube, 0.015, 4.2);
    tube.computeVertexNormals();
    const tubeM = new THREE.Mesh(tube, rockM); tubeM.name = 'tube';
    tubeM.position.set(k.x + k.dir[0] * sm, k.floor - 0.3, k.z + k.dir[1] * sm);
    tubeM.rotation.y = ang;
    tubeM.castShadow = tubeM.receiveShadow = true;
    g.add(tubeM);
    // ---- FPP-world: the inner seal. A rock wall across the dome in front of its entrance gap, with the tube's arch
    // cut out, each spoke reaching exactly to the dome wall (found by a ray), so no sky shows around the arch. ----
    // CAVE-LOOK: each spoke now runs 0.25 m past the wall (it stopped 5 cm past, and the finer dome lumps left slivers
    // of sky between the two), and the face is rougher so it reads as rock, not a flat screen.
    {
      const IN = TUBE - 0.35, OUT = k.R + 1;   // IN: overlaps the lumpy tube end, so no sky shows between them
      const sl = new THREE.RingGeometry(IN, OUT, 56, 8, 0, Math.PI);   // in xy: x across the entrance, y up
      const sp2 = sl.attributes.position;
      domeM.updateMatrixWorld(true);
      const ctr = new THREE.Vector3(k.x + k.dir[0] * ss, k.floor - 0.3, k.z + k.dir[1] * ss);
      // CAVE-LOOK: the spokes lean toward the mouth (TILT), so the wall recedes into the passage like a funnel instead
      // of standing as a flat dark screen; each spoke's ray runs along its own leaning line, so it still ends just past
      // the dome wall and never pokes out through the front of the hill.
      const TILT = 0.42, side = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)), fwd = new THREE.Vector3(k.dir[0], 0, k.dir[1]);
      const dv = new THREE.Vector3(), o = new THREE.Vector3(), reach = new Map();
      for (let i = 0; i < sp2.count; i++) {
        const x = sp2.getX(i), y = sp2.getY(i), r = Math.hypot(x, y) || 1, th = Math.atan2(y, x), key = Math.round(th * 1000);
        const lx = Math.cos(th), ly = Math.sin(th), ln = Math.hypot(1, TILT);
        if (!reach.has(key)) {
          o.copy(ctr).addScaledVector(side, lx * IN).add(new THREE.Vector3(0, ly * IN, 0));
          dv.copy(side).multiplyScalar(lx).add(new THREE.Vector3(0, ly, 0)).addScaledVector(fwd, TILT).normalize();
          ray.set(o, dv); ray.far = OUT * 1.6;
          const hit = ray.intersectObject(domeM, false)[0];
          reach.set(key, hit ? hit.distance + 0.3 : k.R * 0.5);
        }
        const L = reach.get(key), u = (r - IN) / (OUT - IN), d = u * L;           // distance along the leaning spoke
        const nx = lx * (IN + d / ln), ny = Math.max(ly * (IN + d / ln), -0.05), nz = d * TILT / ln;
        const edge = Math.min(1, d / 0.6) * Math.min(1, (L - d) / 0.5 + 0.15);
        sp2.setXYZ(i, nx, ny, nz + ((Math.sin(nx * 1.7) + Math.cos(ny * 2.1)) * 0.16 + Math.sin(nx * 4.3 + ny * 3.1) * 0.07) * edge);
      }
      sl.computeVertexNormals();
      const seal = new THREE.Mesh(sl, rockM); seal.name = 'seal';
      seal.position.copy(ctr);
      seal.rotation.y = ang;
      seal.castShadow = seal.receiveShadow = true;
      g.add(seal);
    }
    g.updateMatrixWorld(true);
    // ---- colliders: the rim (leaving the gap) and both tube sides ----
    const nr = Math.ceil((Math.PI * 2 * (k.R - 0.6)) / 1.3);
    for (let i = 0; i < nr; i++) {
      const t = (i / nr) * Math.PI * 2, da = Math.abs(((t - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < gap * 0.92) continue;
      addCollider({ x: k.x + Math.sin(t) * (k.R - 0.6), z: k.z + Math.cos(t) * (k.R - 0.6), r: 0.7 });
    }
    for (let s = ss; s <= s1 + 0.01; s += 1.3) for (const side of [-1, 1]) {   // FPP-world: from the inner seal
      const lx = k.dir[1] * side, lz = -k.dir[0] * side;
      addCollider({ x: k.x + k.dir[0] * s + lx * (TUBE - 0.3), z: k.z + k.dir[1] * s + lz * (TUBE - 0.3), r: 0.7 });
      // FPP-world: and along the seal wall itself, out to the dome, so nobody walks into the pocket behind it
      if (s === ss) for (let l = TUBE + 0.9; l < Math.sqrt(Math.max(0, k.R * k.R - ss * ss)); l += 1.2) addCollider({ x: k.x + k.dir[0] * (ss - 0.4) + lx * l, z: k.z + k.dir[1] * (ss - 0.4) + lz * l, r: 0.7 });
    }
    // ---- no grass inside ----
    clear(k.x, k.z, k.R + 3);
    for (let s = k.R; s < k.R + 5 + RAMP; s += 2.5) clear(k.x + k.dir[0] * s, k.z + k.dir[1] * s, TUBE + 1);

    // ---- CAVE-LOOK: is a point inside the hollow (the dome, the tube, or the open mouth in front of it)? ----
    // The outside boulders used to sink through the thin dome and tube and showed inside as pale slabs across the
    // ceiling and the corners of the view. Each one is now pushed out until no vertex is inside.
    const hollow = (v) => {
      if (v.y < k.floor - 0.12) return false;                       // under the floor nobody sees it
      const qx = (v.x - k.x) / k.R, qy = (v.y - (k.floor - 0.35)) / k.H, qz = (v.z - k.z) / k.R, q = Math.hypot(qx, qy, qz) || 1e-4;
      const ux = qx / q, uy = qy / q, uz = qz / q;
      let d = 1, px = ux, py = uy, pz = uz;
      for (const [amp, f] of DOME_L) { const l = lumpF(px, py, pz, amp, f); d *= l; px *= l; py *= l; pz *= l; }
      if (q < d + 0.05) return true;
      const dx = v.x - k.x, dz = v.z - k.z, s = dx * k.dir[0] + dz * k.dir[1], lat = dx * k.dir[1] - dz * k.dir[0], yt = v.y - (k.floor - 0.3);
      return s > ss - 0.6 && s < s1 + 2 && lat * lat + yt * yt < (TUBE * 1.075 + 0.3) ** 2;
    };
    const intrudes = (obj) => {
      obj.updateMatrixWorld(true);
      let hit = false;
      obj.traverse((o) => {
        if (hit || !o.isMesh) return;
        const p = o.geometry.attributes.position, step = Math.max(1, (p.count / 500) | 0);
        for (let i = 0; i < p.count && !hit; i += step) if (hollow(_v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld))) hit = true;
      });
      return hit;
    };
    const pushOut = (pos) => {
      const dx = pos.x - k.x, dz = pos.z - k.z, s = dx * k.dir[0] + dz * k.dir[1];
      if (s > ss - 0.5) {                                             // round the tube: straight out from its axis
        const lat = dx * k.dir[1] - dz * k.dir[0], yt = pos.y - (k.floor - 0.3), L = Math.hypot(lat, yt) || 1;
        return new THREE.Vector3(k.dir[1] * lat / L, Math.max(0.2, yt / L), -k.dir[0] * lat / L).normalize();
      }
      const y = pos.y - (k.floor - 0.35);
      return new THREE.Vector3(dx / (k.R * k.R), y / (k.H * k.H), dz / (k.R * k.R)).normalize();   // the dome's normal there
    };
    const boulder = (x, y, z, s, sy, kind, col) => {
      const grp = new THREE.Group();
      for (const p of NAT['rock_medium_' + kind] || []) { const r = new THREE.Mesh(p.geo, boulderM); r.castShadow = r.receiveShadow = true; grp.add(r); }
      if (!grp.children.length) return null;
      grp.name = 'boulder'; grp.position.set(x, y, z); grp.scale.set(s, s * sy, s); grp.rotation.set(R() * 0.4, R() * 6.28, R() * 0.4);
      for (let i = 0; i < 48 && intrudes(grp); i++) grp.position.addScaledVector(pushOut(grp.position), 0.25);
      if (intrudes(grp)) return null;                                 // could not be cleared: leave it out
      g.add(grp);
      if (col) addCollider({ x: grp.position.x, z: grp.position.z, r: s * 0.6, why: 'boulder' });
      return grp;
    };
    // ---- rock dressing: boulders around the arch and over the dome ----
    // FPP-world: the side rocks flank the mouth (beside and in front of it, never over the arch) and one lintel rock
    // sits back on top of the arch to frame it. CAVE-LOOK: a ring of rocks round the arch itself makes a rocky portal
    // (the bare tube end read as a pipe in the hill), and the flanking rocks are solid.
    let ri = 0;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, s = k.R + 6.5 + R() * 4, sc = 1.8 + R() * 0.8, l = TUBE + 1.8 + sc * 1.15;
      boulder(k.x + k.dir[0] * s + k.dir[1] * side * l, k.floor + R() * 0.8 - 0.4 - sc * 0.15, k.z + k.dir[1] * s - k.dir[0] * side * l, sc, 0.75 + R() * 0.35, 1 + (ri++ % 3), true);
    }
    { const s = k.R + 1.5, sc = 1.6 + R() * 0.5; boulder(k.x + k.dir[0] * s, k.floor + TUBE + sc * 1.3, k.z + k.dir[1] * s, sc, 0.8 + R() * 0.3, 1 + (ri++ % 3)); }
    for (const phi of [0.18, 0.62, 1.05, 1.57, 2.09, 2.52, 2.96]) {
      const sc = 0.85 + R() * 0.55, rho = TUBE + 0.45 + sc * 0.55, s = s1 - 0.6 - R() * 0.6, lat = Math.cos(phi) * rho;
      boulder(k.x + k.dir[0] * s + k.dir[1] * lat, k.floor - 0.3 + Math.sin(phi) * rho, k.z + k.dir[1] * s - k.dir[0] * lat, sc, 0.8 + R() * 0.3, 1 + (ri++ % 3));
    }
    for (let i = 0; i < 6; i++) {
      const t = ang + Math.PI * 0.35 + R() * Math.PI * 1.3, r = k.R * (0.3 + R() * 0.65), sc = 2.5 + R() * 1.5;
      boulder(k.x + Math.sin(t) * r, k.floor + k.H * Math.sqrt(Math.max(0.05, 1 - (r / k.R) ** 2)) + sc * 0.6, k.z + Math.cos(t) * r, sc, 0.7 + R() * 0.4, 1 + (ri++ % 3));
    }
    // ---- CAVE-LOOK: ferns and leafy plants in the damp shade either side of the mouth ----
    for (const [name, n, sc0] of [['fern_1', 7, 1.1], ['plant_1', 4, 0.9]]) {
      const parts = NAT[name]; if (!parts) continue;
      for (let i = 0; i < n; i++) {
        const side = R() < 0.5 ? -1 : 1, s = s1 - 0.4 + R() * 3.2, l = TUBE + 0.5 + R() * 2.2;
        const x = k.x + k.dir[0] * s + k.dir[1] * side * l, z = k.z + k.dir[1] * s - k.dir[0] * side * l;
        for (const p of parts) { const f = new THREE.Mesh(p.geo, p.mat); f.position.set(x, H0(x, z) - 0.05, z); f.rotation.y = R() * 6.28; f.scale.setScalar(sc0 * (0.7 + R() * 0.6)); g.add(f); }
      }
    }
    // ---- inside: place things against the wall by casting a ray out from the centre ----
    const wallAt = (t, y) => {
      ray.set(new THREE.Vector3(k.x, k.floor + y, k.z), new THREE.Vector3(Math.sin(t), 0, Math.cos(t)));
      ray.far = k.R * 1.4;
      const hit = ray.intersectObject(domeM, false)[0];
      return hit ? hit.distance : k.R * 0.9;
    };
    const roofAt = (x, z) => {                                      // the ceiling straight above a floor point
      ray.set(new THREE.Vector3(x, k.floor + 0.5, z), new THREE.Vector3(0, 1, 0)); ray.far = k.H + 4;
      const hit = ray.intersectObject(domeM, false)[0];
      return hit ? hit.point.y : null;
    };
    const back = ang + Math.PI;
    // CAVE-LOOK: the paintings are decals projected onto the wall itself (flat planes floated off the curved, lumpy rock
    // and cut into it at their edges), with the same relief as the rock, so the torchlight rakes across them.
    const panelAt = (t, i, hand) => {
      const y = 2.2, dirV = new THREE.Vector3(Math.sin(t), 0, Math.cos(t));
      ray.set(new THREE.Vector3(k.x, k.floor + y, k.z), dirV); ray.far = k.R * 1.4;
      const hit = ray.intersectObject(domeM, false)[0];
      const wp = hit ? hit.point.clone() : new THREE.Vector3(k.x, k.floor + y, k.z).addScaledVector(dirV, k.R * 0.9);
      const tex = panelTex(hand ? null : PAINT[i]);
      const helper = new THREE.Object3D(); helper.position.copy(wp); helper.lookAt(k.x, k.floor + y, k.z);
      const dm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, side: THREE.DoubleSide,   // the dome's winding faces out: seen from inside it is the back face
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      dm.color.setRGB(1.6, 1.6, 1.6);                      // ochre on limestone reads red under the torch, not brown-black
      rockShader(dm, { floor: k.floor, bump: 0.6 });
      const pm = new THREE.Mesh(new DecalGeometry(domeM, wp, helper.rotation, new THREE.Vector3(3.2, 1.6, 2.4)), dm);
      pm.renderOrder = 2; pm.name = 'painting';
      g.add(pm);
      const px = wp.x - dirV.x * 0.32, pz = wp.z - dirV.z * 0.32;
      panels.push({ cave: k.id, i, hand: !!hand, x: px, z: pz, y: wp.y, tex, mesh: pm });
    };
    if (k.id === 'echo') {
      panelAt(back - 0.75, paintI++, false); panelAt(back, paintI++, false); panelAt(back + 0.75, paintI++, false);
      panelAt(back + 1.55, -1, true);
    } else panelAt(back, 3, false);
    // ---- the wall sconce (lit by Sena once a torch is carried in) ----
    const st = ang + 0.55, sr = wallAt(st, 1.9) - 0.35;
    const sx = k.x + Math.sin(st) * sr, sz = k.z + Math.cos(st) * sr;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }));
    stick.position.set(sx, k.floor + 1.8, sz); stick.rotation.set(0.35 * Math.cos(st), 0, -0.35 * Math.sin(st)); g.add(stick);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 7), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 }));   // CAVE-LOOK: a bound, charred head
    head.position.set(sx, k.floor + 2.08, sz); head.rotation.copy(stick.rotation); g.add(head);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.scale.set(1, 1.8, 1); flame.position.set(sx, k.floor + 2.2, sz); flame.visible = false; g.add(flame);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    core.scale.set(1, 1.6, 1); flame.add(core); core.position.y = -0.02;
    const light = new THREE.PointLight(0xffb060, 0, 14, 1.2);
    light.position.set(k.x + Math.sin(st) * (sr - 0.6), k.floor + 2.3, k.z + Math.cos(st) * (sr - 0.6));
    scene.add(light);
    sconces.push({ cave: k.id, light, flame, on: false });
    // ---- flint and ochre nodes along the walls (away from the entrance) ----
    const spots = (n, list) => {
      for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
        const t = back + (R() - 0.5) * Math.PI * 1.5, r = k.R * (0.55 + R() * 0.25);
        const x = k.x + Math.sin(t) * r, z = k.z + Math.cos(t) * r;
        if ([...flintNodes, ...ochreNodes].some((o) => Math.hypot(o.x - x, o.z - z) < 1.6) || panels.some((o) => Math.hypot(o.x - x, o.z - z) < 3.4)) continue;
        if (k.id === 'echo' && Math.abs(t - (back - 1.6)) < 0.55) continue;      // the sleeping spot
        list.push({ x, y: k.floor, z, s: 0.8 + R() * 0.5, r: R() * 6.283, t: R(), cave: k.id }); i++;
      }
    };
    spots(k.id === 'echo' ? 4 : 10, flintNodes);
    spots(k.id === 'echo' ? 1 : 2, ochreNodes);
    // ---- Echo Hollow: a dry sleeping spot of hides and grass ----
    let bedAt = null;
    if (k.id === 'echo') {
      const bt = back - 1.6, br = k.R * 0.55, bx = k.x + Math.sin(bt) * br, bz = k.z + Math.cos(bt) * br;
      const perp = [Math.cos(bt), -Math.sin(bt)];
      const bed = new THREE.Group();
      const hideM = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), strawM = new THREE.MeshStandardMaterial({ color: 0xa8955a, roughness: 1 });
      const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), strawM); pile.scale.set(1.14, 0.12, 0.66); bed.add(pile);   // SIT-r4: the straw is a fringe round the hides (at 1.6 m it ran 0.6 m past their foot: a pale slab beyond the blanket)
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 1.0), hideM); h1.position.set(0, 0.15, -0.5); h1.rotation.y = 0.08; bed.add(h1);
      const h2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 1.0), hideM.clone()); h2.material.color.set(0x6a4a30); h2.position.set(0.05, 0.16, 0.5); h2.rotation.y = -0.06; bed.add(h2);
      bed.position.set(bx, k.floor, bz); bed.rotation.y = bt + Math.PI / 2;
      bed.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      g.add(bed);
      beds.push({ cave: k.id, x: bx, z: bz, y: k.floor + 0.22, rot: bt, pts: [[bx + perp[0] * 0.5, bz + perp[1] * 0.5], [bx - perp[0] * 0.5, bz - perp[1] * 0.5]] });
      bedAt = [bx, bz];
      // CAVE-LOOK: an old hearth ring beside it (cold ash and stones: the people on the walls sat here)
      const hx = k.x + Math.sin(back - 0.9) * k.R * 0.42, hz = k.z + Math.cos(back - 0.9) * k.R * 0.42, hp = [];
      for (let i = 0; i < 9; i++) { const t = (i / 9) * 6.283, rr = 0.55 + R() * 0.08; hp.push(part(lumpy(new THREE.IcosahedronGeometry(0.15 + R() * 0.06, 1), 0.2, 5), 0xffffff, Math.sin(t) * rr, 0.05, Math.cos(t) * rr, R(), R() * 6, R(), 1, 0.7, 1)); }
      const rg = merge(hp); rg.computeVertexNormals(); const ring = new THREE.Mesh(rg, formM); ring.position.set(hx, k.floor, hz); ring.castShadow = ring.receiveShadow = true; g.add(ring);
      const ash = new THREE.Mesh(new THREE.CircleGeometry(0.48, 18), new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      ash.rotation.x = -Math.PI / 2; ash.position.set(hx, k.floor + 0.04, hz); ash.receiveShadow = true; g.add(ash);
      for (let i = 0; i < 3; i++) { const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 })); cl.position.set(hx + (R() - 0.5) * 0.3, k.floor + 0.08, hz + (R() - 0.5) * 0.3); cl.rotation.set(Math.PI / 2, 0, R() * 3); g.add(cl); }
      addCollider({ x: hx, z: hz, r: 0.55, why: 'hearth' });
      bedAt.push(hx, hz);
    }
    // ---- CAVE-LOOK: the floor. Packed earth and stone with damp hollows, laid over the terrain inside the walls (the
    // terrain's floor was one flat brown) and down the entrance tube. Each spoke stops just inside the wall. ----
    {
      const SEG = 96, RINGS = 16, edge = [], pos = [], idx = [];
      for (let i = 0; i < SEG; i++) {
        const t = (i / SEG) * Math.PI * 2, da = Math.abs(((t - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        let e = wallAt(t, 0.15) - 0.05;
        if (da < Math.PI / 2) e = Math.min(e, (ss - 0.05) / Math.max(0.15, Math.cos(da)));   // the seal closes the entrance side
        edge.push(e);
      }
      for (let j = 0; j <= RINGS; j++) for (let i = 0; i < SEG; i++) {
        const t = (i / SEG) * Math.PI * 2, r = edge[i] * Math.pow(j / RINGS, 0.8), x = k.x + Math.sin(t) * r, z = k.z + Math.cos(t) * r;
        pos.push(x - k.x, 0.012, z - k.z);   // flat (the 2.5 m terrain grid ramps up toward the hill well inside the wall, and a
        // floor that followed getHeight rose into a mound before the back wall); under the blood splats (+0.025)
      }
      for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) {
        const a0 = j * SEG + i, b0 = j * SEG + (i + 1) % SEG, c0 = a0 + SEG, d0 = b0 + SEG;
        idx.push(a0, b0, c0, b0, d0, c0);
      }
      // the tube floor, from the seal to the arch
      const base = pos.length / 3, NS = 22, NL = 8;
      for (let j = 0; j <= NS; j++) for (let i = 0; i <= NL; i++) {
        const s = ss - 0.05 + (s1 - 0.1 - ss + 0.05) * (j / NS), lat = (i / NL - 0.5) * 2 * (TUBE - 0.08);
        const x = k.x + k.dir[0] * s + k.dir[1] * lat, z = k.z + k.dir[1] * s - k.dir[0] * lat;
        pos.push(x - k.x, H0(x, z) - k.floor + 0.014, z - k.z);
      }
      for (let j = 0; j < NS; j++) for (let i = 0; i < NL; i++) { const a0 = base + j * (NL + 1) + i, b0 = a0 + 1, c0 = a0 + NL + 1, d0 = c0 + 1; idx.push(a0, b0, c0, b0, d0, c0); }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setIndex(idx); fg.computeVertexNormals();
      // the winding depends on the spoke order: make sure the faces look up
      let up = 0; const nn = fg.attributes.normal; for (let i = 0; i < nn.count; i++) up += nn.getY(i);
      if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; } fg.setIndex(idx); fg.computeVertexNormals(); }
      const fl = new THREE.Mesh(fg, floorM); fl.name = 'floor'; fl.position.set(k.x, k.floor, k.z); fl.receiveShadow = true; g.add(fl);
    }
    // ---- CAVE-LOOK: formations. Stalactites hang from the roof (their tips always well above head height), stalagmites
    // rise along the walls (solid, clear of the paintings, the bed, the nodes and the way in), rubble lies at the foot of
    // the walls and down the tube. ----
    const keepClear = (x, z, r) => panels.some((o) => Math.hypot(o.x - x, o.z - z) < 2.8 + r) || [...flintNodes, ...ochreNodes].some((o) => Math.hypot(o.x - x, o.z - z) < 1.1 + r)
      || Math.hypot(sx - x, sz - z) < 1.3 + r || (colAt && Math.hypot(colAt[0] - x, colAt[1] - z) < 1.2 + r) || (bedAt && (Math.hypot(bedAt[0] - x, bedAt[1] - z) < 2.4 + r || Math.hypot(bedAt[2] - x, bedAt[3] - z) < 1.6 + r));
    let colAt = null;
    const ent = (t) => Math.abs(((t - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    {
      const down = [], upP = [], rub = [];
      for (let i = 0, tries = 0; i < (k.id === 'flint' ? 46 : 32) && tries < 400; tries++) {
        const t = R() * 6.283, r = k.R * Math.sqrt(R()) * 0.82, x = k.x + Math.sin(t) * r, z = k.z + Math.cos(t) * r;
        const top = roofAt(x, z); if (top == null) continue;
        const room = top + 0.12 - (k.floor + 3.0); if (room < 0.25) continue;      // never low enough to brush a head or the camera
        const n = 1 + (R() * 3 | 0);
        for (let j = 0; j < n; j++) {
          const hh = Math.min(room, 0.25 + R() * R() * 1.9) * (j ? 0.6 : 1), rr = 0.05 + hh * (0.07 + R() * 0.05);
          const gm = spike(rr, hh, R); gm.rotateX(Math.PI);
          down.push(part(gm, 0xffffff, x - k.x + (R() - 0.5) * 0.5 * j, top - k.floor + 0.12, z - k.z + (R() - 0.5) * 0.5 * j));
        }
        i++;
      }
      for (let i = 0, tries = 0; i < (k.id === 'flint' ? 22 : 15) && tries < 500; tries++) {
        const t = R() * 6.283; if (ent(t) < gap + 0.45) continue;
        const wr = wallAt(t, 0.4), r = wr - 0.45 - R() * 1.6, x = k.x + Math.sin(t) * r, z = k.z + Math.cos(t) * r;
        const big = R() < 0.4, br = big ? 0.22 + R() * 0.2 : 0.08 + R() * 0.1, hh = big ? 0.9 + R() * 1.1 : 0.25 + R() * 0.5;
        if (keepClear(x, z, br)) continue;
        upP.push(part(spike(br, hh, R, 8), 0xffffff, x - k.x, -0.08, z - k.z));
        if (R() < 0.6) { const a2 = R() * 6.28, h2 = hh * (0.3 + R() * 0.3); upP.push(part(spike(br * 0.55, h2, R), 0xffffff, x - k.x + Math.sin(a2) * br * 1.6, -0.05, z - k.z + Math.cos(a2) * br * 1.6)); }
        if (big) addCollider({ x, z, r: br + 0.25, why: 'stalagmite' });
        i++;
      }
      // Flint Deep: one great column where a stalactite has grown down to meet its stalagmite
      if (k.id === 'flint') {
        for (let tries = 0; tries < 60; tries++) {
          const t = back + (R() < 0.5 ? -1 : 1) * (0.9 + R() * 0.7), r = k.R * (0.45 + R() * 0.15), x = k.x + Math.sin(t) * r, z = k.z + Math.cos(t) * r;
          const top = roofAt(x, z); if (top == null || keepClear(x, z, 0.8)) continue;
          const pts = [], hh = top - k.floor + 0.3;
          for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push(new THREE.Vector2(0.32 + 0.5 * Math.pow(Math.abs(u - 0.5) * 2, 2.6) + Math.sin(u * 23) * 0.03, u * hh - 0.1)); }
          upP.push(part(new THREE.LatheGeometry(pts, 12), 0xffffff, x - k.x, 0, z - k.z));
          addCollider({ x, z, r: 0.7, why: 'column' }); colAt = [x, z];
          break;
        }
      }
      for (let i = 0, tries = 0; i < 150 && tries < 700; tries++) {   // most along the foot of the wall: it hides the seam with the floor
        let x, z;
        if (i < 130) { const t = R() * 6.283; if (ent(t) < gap + 0.2) continue; const r = wallAt(t, 0.3) - 0.1 - R() * R() * 2.2; x = k.x + Math.sin(t) * r; z = k.z + Math.cos(t) * r; }
        else { const s = ss + R() * (s1 - ss), lat = (R() < 0.5 ? -1 : 1) * (TUBE - 0.4 - R() * 0.5); x = k.x + k.dir[0] * s + k.dir[1] * lat; z = k.z + k.dir[1] * s - k.dir[0] * lat; }
        const sz2 = 0.07 + R() * R() * 0.36;
        if (sz2 > 0.18 && keepClear(x, z, sz2)) continue;
        rub.push(part(lumpy(new THREE.IcosahedronGeometry(sz2, 1), 0.22, 4 + R() * 3), 0xffffff, x - k.x, (Math.hypot(x - k.x, z - k.z) < k.R - 0.3 ? 0 : H0(x, z) - k.floor) + sz2 * 0.25, z - k.z, R() * 3, R() * 6, R() * 3, 1, 0.55 + R() * 0.3, 1));
        i++;
      }
      const add = (list, mat, shadow) => {
        if (!list.length) return;
        let gm = merge(list.map((p) => { p.deleteAttribute('color'); return p; }));
        gm = mergeVertices(gm); gm.computeVertexNormals();
        const mesh = new THREE.Mesh(gm, mat); mesh.name = 'formations'; mesh.position.set(k.x, k.floor, k.z); mesh.castShadow = shadow; mesh.receiveShadow = true; g.add(mesh);
      };
      add(down, formM, false); add(upP, formM, true); add(rub, rockM, true);
    }
    // ---- Flint Deep: glowing crystal clusters and bats ----
    if (k.id === 'flint') {
      // CAVE-LOOK: hexagonal prisms with points, growing from a rock base, cold-lit from within, and one soft blue light
      // that fills the back of the chamber (the cones read as plastic spikes)
      const cm = new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x1d8fc4, emissiveIntensity: 1.25, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.88 });
      for (let i = 0; i < 9; i++) {
        const t = back + (i / 8 - 0.5) * Math.PI * 1.55, r = wallAt(t, 0.6) - 0.75, parts = [], nc = 4 + (R() * 4 | 0);
        const x = k.x + Math.sin(t) * r, z = k.z + Math.cos(t) * r;
        if (panels.some((o) => Math.hypot(o.x - x, o.z - z) < 2.0) || (colAt && Math.hypot(colAt[0] - x, colAt[1] - z) < 1.4)) continue;   // (the flint nodes may sit among them)
        for (let j = 0; j < nc; j++) {
          const hh = (0.35 + R() * 0.85) * (j ? 0.75 : 1.2), rr = 0.05 + R() * 0.06, body = new THREE.CylinderGeometry(rr, rr * 1.08, hh, 6, 1);
          const tip = new THREE.ConeGeometry(rr, rr * 2.2, 6, 1); tip.translate(0, hh / 2 + rr * 1.1, 0);
          const one = merge([body.toNonIndexed(), tip.toNonIndexed()]); one.translate(0, hh / 2, 0);
          parts.push(part(one, 0xffffff, (R() - 0.5) * 0.45, 0, (R() - 0.5) * 0.45, (R() - 0.5) * 1.0, R() * 6, (R() - 0.5) * 1.0));
        }
        const gm = merge(parts.map((p) => { p.deleteAttribute('uv'); p.deleteAttribute('color'); return p; })); gm.computeVertexNormals();
        const cr = new THREE.Mesh(gm, cm);
        cr.position.set(x, k.floor - 0.05, z);
        g.add(cr); crystals.push(cr);
        const base = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.32, 1), 0.25, 4), rockM); base.scale.set(1, 0.45, 1); base.position.set(x, k.floor, z); g.add(base);
      }
      const glow = new THREE.PointLight(0x58c6ff, 0, 11, 1.6);
      glow.position.set(k.x + Math.sin(back) * k.R * 0.55, k.floor + 1.1, k.z + Math.cos(back) * k.R * 0.55);
      scene.add(glow); k.glow = glow;
      const bm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.18), new THREE.MeshBasicMaterial({ color: 0x14100e, side: THREE.DoubleSide, fog: true }), 30);
      bm.frustumCulled = false; scene.add(bm);
      const list = Array.from({ length: 30 }, () => ({ a: R() * 6.283, r: k.R * (0.25 + R() * 0.45), y: k.floor + k.H * (0.62 + R() * 0.2), w: 0.5 + R() * 0.7, ph: R() * 6.28 }));
      bats.push({ cave: k, mesh: bm, list, burst: -1, gone: false });
    }
    // ---- CAVE-LOOK: dust hanging in the air. It shows only where light falls on it: round the player's torch and in
    // the daylight at the mouth. ----
    {
      const N = 260, mp = new Float32Array(N * 3), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        if (i < 70) { const s = ss + R() * (s1 - ss + 1), lat = (R() - 0.5) * 2 * TUBE * 0.8; mp.set([k.dir[0] * s + k.dir[1] * lat, 0.3 + R() * (TUBE - 0.6), k.dir[1] * s - k.dir[0] * lat], i * 3); }
        else { const t = R() * 6.283, r = k.R * Math.sqrt(R()) * 0.8; mp.set([Math.sin(t) * r, 0.3 + R() * k.H * 0.6, Math.cos(t) * r], i * 3); }
        seed[i] = R() * 100;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(mp, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, k.H / 2, 0), k.R + 12);
      const U = { uTime: { value: 0 }, uLamp: { value: new THREE.Vector3() }, uLampOn: { value: 0 }, uMouth: { value: new THREE.Vector3(k.dir[0] * (k.R + 4), 1.6, k.dir[1] * (k.R + 4)) }, uDay: { value: 1 }, uTex: { value: dotTexture() } };
      const mat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aSeed; uniform float uTime, uLampOn, uDay; uniform vec3 uLamp, uMouth; varying float vA;
          void main() { vec3 p = position + vec3(sin(uTime * 0.11 + aSeed) * 0.6, sin(uTime * 0.07 + aSeed * 1.7) * 0.4, cos(uTime * 0.09 + aSeed * 0.6) * 0.6);
            vec4 wp = modelMatrix * vec4(p, 1.0); vec4 mv = viewMatrix * wp;
            float dl = distance(wp.xyz, uLamp), dm = distance(p, uMouth);
            vA = uLampOn * 0.9 / (1.0 + dl * dl * 0.35) + uDay * 0.75 / (1.0 + dm * dm * 0.06);
            vA *= smoothstep(0.3, 1.2, -mv.z) * (0.55 + 0.45 * sin(uTime * 1.3 + aSeed * 5.0));
            gl_PointSize = max(1.0, (7.0 + fract(aSeed) * 9.0) / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uTex; varying float vA; void main() { float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, a); }`,
      });
      const pts = new THREE.Points(geo, mat); pts.position.set(k.x, k.floor, k.z); pts.renderOrder = 3; g.add(pts);
      motes.push({ cave: k, U, pts });
    }
    // ---- CAVE-LOOK: daylight spilling in at the mouth: a soft shaft from the arch down onto the tube floor ----
    {
      const L = 9, geo = new THREE.CylinderGeometry(TUBE * 0.78, TUBE * 1.05, L, 28, 1, true);
      geo.translate(0, -L / 2, 0); geo.rotateX(-Math.PI / 2);        // from the origin (the arch) along +z (into the cave)
      const U = { uI: { value: 0 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying float vV; varying vec3 vN, vP; void main() { vV = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uI; varying float vV; varying vec3 vN, vP;
          void main() { float f = abs(dot(normalize(vN), normalize(-vP))); float a = uI * pow(vV, 1.6) * pow(f, 2.2) * smoothstep(0.5, 2.5, length(vP));
            gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, a); }`,
      });
      const shaft = new THREE.Mesh(geo, mat); shaft.name = 'shaft';
      shaft.position.set(k.x + k.dir[0] * (s1 - 0.4), k.floor + TUBE * 0.62, k.z + k.dir[1] * (s1 - 0.4));
      shaft.lookAt(k.x + k.dir[0] * (s1 - 9), k.floor + 0.2, k.z + k.dir[1] * (s1 - 9));
      shaft.renderOrder = 3; g.add(shaft);
      shafts.push({ cave: k, U });
    }
  }
  // FPP-world: daylight spilling in at the mouth of whichever cave the player is near. One shared light, always in
  // the scene (the light count never changes, so nothing recompiles); world.setTime sets its strength from the
  // daylight and how deep the player is, so walls near the entrance glow and the way out reads from inside.
  const mouthLight = new THREE.PointLight(0xffe6c4, 0, 30, 1.1);
  mouthLight.position.set(0, -200, 0);
  scene.add(mouthLight);
  // Flint and ochre are ordinary resource fields (kinds 'flint' and 'ochre'); world.js appends them after the others.
  // CAVE-LOOK: flint as it is found: dark glassy nodules in a pale chalky rind, a few struck flakes lying by them
  const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
  const fl = (g) => { g.computeVertexNormals(); return g; };
  const flintGeo = fl(merge([
    part(lumpy(ico(0.24, 2), 0.22, 6), 0xbdb5a2, 0, 0.1, 0, 0, 0, 0, 1.2, 0.62, 0.9),
    part(lumpy(ico(0.15, 1), 0.2, 9), 0x24272d, 0.12, 0.2, 0.05, 0.3, 0.5, 0, 1, 0.6, 1),
    part(lumpy(ico(0.17, 1), 0.2, 8), 0xa9a08d, 0.27, 0.07, 0.13, 0, 0, 0, 1, 0.7, 1),
    part(new THREE.TetrahedronGeometry(0.09), 0x1b1e23, -0.17, 0.17, 0.05, 0.4, 0, 0.2, 1, 0.5, 1),
    part(new THREE.TetrahedronGeometry(0.06), 0x30343b, -0.3, 0.02, -0.15, 1.2, 0.4, 0, 1.4, 0.25, 1),
    part(new THREE.TetrahedronGeometry(0.05), 0x2a2d33, 0.36, 0.02, -0.2, 0.3, 1.1, 1.3, 1.4, 0.25, 1),
  ]));
  const ochreGeo = fl(merge([
    part(lumpy(ico(0.5, 2), 0.16, 3), 0x9a3e24, 0, 0.05, 0, 0, 0, 0, 1.1, 0.35, 1),
    part(lumpy(ico(0.2), 0.2, 6), 0xb5532e, 0.3, 0.18, 0.15), part(lumpy(ico(0.16), 0.2, 6), 0x7e3019, -0.28, 0.15, -0.2),
  ]));
  const flintF = new Field(scene, 'flint', [{ geo: flintGeo, mat: pmat }], flintNodes, { tint: 0.1 });
  const ochreF = new Field(scene, 'ochre', [{ geo: ochreGeo, mat: pmat }], ochreNodes, { tint: 0.1 });

  const _o = new THREE.Object3D();
  let time = 0, dayK = 1;
  const api = { torchOn: false };
  function update(dt, px, pz) {
    time += dt;
    const near = CAVES.find((k) => Math.hypot(px - k.x, pz - k.z) < k.R + 40);
    if (near) mouthLight.position.set(near.x + near.dir[0] * (near.R + 3), near.floor + 2.6, near.z + near.dir[1] * (near.R + 3));
    for (const s of sconces) if (s.on) { s.flame.scale.set(1 + Math.sin(time * 11) * 0.15, 1.8 + Math.sin(time * 15) * 0.3, 1); s.light.intensity = 4 + Math.sin(time * 13) * 0.6 + Math.sin(time * 31) * 0.3; }
    for (const M of motes) {
      const k = M.cave, on = Math.hypot(px - k.x, pz - k.z) < k.R + 30;
      M.pts.visible = on; if (!on) continue;
      M.U.uTime.value = time; M.U.uDay.value = dayK;
      M.U.uLamp.value.set(px, (H0 ? H0(px, pz) : k.floor) + 1.5, pz); M.U.uLampOn.value += ((api.torchOn ? 1 : 0) - M.U.uLampOn.value) * Math.min(1, dt * 3);
    }
    for (const S of shafts) { const d = Math.hypot(px - S.cave.x, pz - S.cave.z); S.U.uI.value = d < S.cave.R + 60 ? 0.24 * dayK : 0; }
    for (const k of CAVES) if (k.glow) k.glow.intensity = Math.hypot(px - k.x, pz - k.z) < k.R + 25 ? 2.2 + Math.sin(time * 0.7) * 0.25 : 0;
    for (const B of bats) {
      const k = B.cave;
      B.mesh.visible = !B.gone && Math.hypot(px - k.x, pz - k.z) < 70;
      if (!B.mesh.visible) continue;
      if (B.burst >= 0) { B.burst += dt; if (B.burst > 3.4) { B.gone = true; continue; } }
      B.list.forEach((b, i) => {
        b.a += dt * b.w * (B.burst >= 0 ? 2 : 1);
        let x = k.x + Math.sin(b.a) * b.r, y = b.y + Math.sin(time * 2 + b.ph) * 0.3, z = k.z + Math.cos(b.a) * b.r;
        if (B.burst >= 0) {
          const t = smooth(0, 3, B.burst - (i % 10) * 0.08), ex = k.mouth[0] + k.dir[0] * 40, ez = k.mouth[1] + k.dir[1] * 40;
          const mx = k.mouth[0], mz = k.mouth[1];
          const u = Math.min(1, t * 2), v = Math.max(0, t * 2 - 1);        // first to the mouth, then out and up
          x = lerp(lerp(x, mx, u), ex + Math.sin(b.ph) * 8, v); z = lerp(lerp(z, mz, u), ez + Math.cos(b.ph) * 8, v);
          y = lerp(lerp(y, k.floor + 2.4, u), k.floor + 22, v);
        }
        _o.position.set(x, y, z);
        _o.rotation.set(Math.sin(time * 18 + b.ph) * 0.9, -b.a, 0);
        _o.updateMatrix(); B.mesh.setMatrixAt(i, _o.matrix);
      });
      B.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  // ---- CAVE-NAV: people (Sena, Lio, raiders) walk straight at their target and the colliders only push them back out,
  // so with Aro inside a cave and Sena outside the dome, or round the corner of the seal wall, she ran on the spot
  // sideways along the rock. route() returns the next point to walk to: null when the straight line is clear of the
  // cave's colliders, else the first stop on the shortest clear path through a small graph of waypoints (down the
  // tube's axis, a ring round the dome outside and one inside it, round the formations). ----
  const segClear = (ax, az, bx, bz, pad, list) => {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    for (const c of list) {
      let u = ((c.x - ax) * dx + (c.z - az) * dz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = ax + dx * u - c.x, ez = az + dz * u - c.z, m = c.r + pad;
      if (ex * ex + ez * ez < m * m) return false;
    }
    return true;
  };
  for (const k of CAVES) {
    const near = cols.filter((c) => Math.hypot(c.x - k.x, c.z - k.z) < k.R + 16);
    const [s0, s1] = k.tube, px = k.dir[1], pz = -k.dir[0];
    const pts = [0.45, 0.75].flatMap((f) => [...Array(8)].map((_, i) => [k.x + Math.sin(i * 0.785 + 0.39) * k.R * f, k.z + Math.cos(i * 0.785 + 0.39) * k.R * f]));
    for (const s of [s0 - 2.4, s0 + 1.2, (s0 + s1) / 2, s1 - 0.5, s1 + 2.5]) pts.push([k.x + k.dir[0] * s, k.z + k.dir[1] * s]);
    for (const [rr, m] of [[k.R + 3.5, 18], [k.R + 7, 24]]) for (let i = 0; i < m; i++) { const t = (i / m) * Math.PI * 2; pts.push([k.x + Math.sin(t) * rr, k.z + Math.cos(t) * rr]); }
    // a fan in front of the mouth: the ring cannot see the mouth past the tube's sides and the arch boulders
    for (const s of [s1 + 3, s1 + 6, s1 + 9]) for (const l of [-10, -7, -4, 4, 7, 10]) pts.push([k.x + k.dir[0] * s + px * l, k.z + k.dir[1] * s + pz * l]);
    const nodes = pts.filter(([x, z]) => segClear(x, z, x, z, 0.45, near));
    const edge = nodes.map((a) => nodes.map((b) => (a !== b && segClear(a[0], a[1], b[0], b[1], 0.32, near) ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0)));
    k.nav = { near, nodes, edge };
  }
  function route(x, z, tx, tz) {
    for (const k of CAVES) {
      const N = k.nav; if (!N) continue;
      if (Math.hypot(x - k.x, z - k.z) > k.R + 14 && Math.hypot(tx - k.x, tz - k.z) > k.R + 14) continue;
      if (segClear(x, z, tx, tz, 0.25, N.near)) return null;
      // Dijkstra from the walker (a virtual node) to the target over the waypoints
      const n = N.nodes.length, dist = new Float32Array(n).fill(Infinity), first = new Int16Array(n).fill(-1), done = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const [nx, nz] = N.nodes[i], d = Math.hypot(nx - x, nz - z);
        if (d < 0.35) { dist[i] = 0; first[i] = -2; } else if (segClear(x, z, nx, nz, 0.25, N.near)) { dist[i] = d; first[i] = i; }
      }
      let best = Infinity, bi = -1;
      for (;;) {
        let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] >= best) break;
        done[u] = 1;
        const [ux, uz] = N.nodes[u];
        if (segClear(ux, uz, tx, tz, 0.25, N.near)) { const t = dist[u] + Math.hypot(tx - ux, tz - uz); if (t < best) { best = t; bi = u; } }
        for (let v = 0; v < n; v++) { const w = N.edge[u][v]; if (w && !done[v] && dist[u] + w < dist[v]) { dist[v] = dist[u] + w; first[v] = first[u] === -2 ? v : first[u]; } }
      }
      if (bi < 0) return null;                        // no clear way found: walk straight as before
      const f = first[bi] === -2 ? -1 : first[bi];
      return f < 0 ? [tx, tz] : N.nodes[f];
    }
    return null;
  }
  const byId = (id) => CAVES.find((k) => k.id === id);
  return Object.assign(api, {
    route,
    list: CAVES, panels, beds, sconces, bats, crystals, flintF, ochreF, update, mouthLight, cols,
    setDay(v) { dayK = v; },                         // CAVE-LOOK: world.setTime: the daylight at the mouth (shaft and dust)
    setSconce(id, on) { const s = sconces.find((s) => s.cave === id); if (!s) return; s.on = on; s.flame.visible = on; s.light.intensity = on ? 4 : 0; },
    burstBats(id) { const B = bats.find((b) => b.cave.id === id); if (B && B.burst < 0 && !B.gone) { B.burst = 0; return true; } return false; },
    batsGone(id) { const B = bats.find((b) => b.cave.id === id); if (B) { B.gone = true; B.mesh.visible = false; } },
    // Two hand prints, a big one and a small one, pressed onto the blank wall.
    drawHands(p) {
      const c = p.tex.image, g = c.getContext('2d');
      g.globalAlpha = 0.85; g.fillStyle = OCH;
      g.save(); g.scale(1, 2); hand(g, 205, 130, 2.3, -0.2); hand(g, 300, 140, 1.8, 0.25); g.restore();
      p.tex.needsUpdate = true; p.printed = true;
    },
    // ARC: the Ash People's mark on your handprints. 'ash': grey ash smeared across them (smoke chapter);
    // 'together': grey hands pressed beside the red ones (the "Ash and Hearth" epilogue). Idempotent per mode.
    smearHands(p, mode = 'ash') {
      if (!p || (p.smear || []).includes(mode)) return false;
      const c = p.tex.image, g = c.getContext('2d'), R = rng(mode === 'ash' ? 61 : 62);
      g.save(); g.scale(1, 2);
      if (mode === 'ash') {
        g.globalAlpha = 0.7; g.strokeStyle = g.fillStyle = 'rgb(118, 116, 112)'; g.lineCap = 'round';
        for (let i = 0; i < 7; i++) {                // four-finger drags across the prints
          const x0 = 150 + R() * 60, y0 = 70 + R() * 90, dx = 120 + R() * 80, dy = (R() - 0.5) * 50;
          g.lineWidth = 5 + R() * 4;
          for (let f = 0; f < 4; f++) { g.beginPath(); g.moveTo(x0, y0 + f * 9); g.quadraticCurveTo(x0 + dx * 0.5, y0 + f * 9 + dy - 10, x0 + dx, y0 + f * 9 + dy); g.stroke(); }
        }
        g.globalAlpha = 0.8; hand(g, 395, 120, 1.9, 0.5); hand(g, 120, 168, 1.5, -0.6);
      } else {
        g.globalAlpha = 0.82; g.fillStyle = 'rgb(128, 126, 122)';
        hand(g, 110, 120, 2.0, -0.35); hand(g, 405, 135, 1.6, 0.4); hand(g, 255, 60, 1.2, 0);
      }
      g.restore();
      p.tex.needsUpdate = true; (p.smear ||= []).push(mode);
      return true;
    },
    byId,
  });
}
