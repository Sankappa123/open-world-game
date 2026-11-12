import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { rng, lerp, clamp, smooth, part, merge, lumpy, canvasTex } from './util.js';
import { NAT, wind, windShader } from './nature.js';
import { makeTerrainMaterial } from './terrain.js';
import { createRiver } from './water.js';
import { createAtmosphere } from './sky.js';
import { PRESETS } from './quality.js';
import { CAVES, initCaves, caveCarve, inCave, depthAt, createCaves } from './caves.js';   // WP3
import { LM, FORDS, KEEP, POIS, initPOIS, createLandmarks } from './landmarks.js';     // WP3
import { rockTexture } from './terrain.js';

export const SIZE = 640, SEG = 256, CELL = SIZE / SEG, LIMIT = SIZE / 2 - 40;
const perlin = new ImprovedNoise();
const fbm = (x, z, oct = 5) => {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * perlin.noise(x * f, z * f, 7.3); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
};
export const riverX = (z) => 62 + Math.sin(z * 0.012) * 30 + Math.sin(z * 0.031 + 1.3) * 10;

// WP3 world v2: land() is the old terrain; features() adds the landmark hills, meadow, lake, hot spring and caves;
// river() cuts the river with two shallow fords.
export function land(x, z) {
  let h = 7 + fbm(x * 0.006, z * 0.006) * 26 + fbm(x * 0.03, z * 0.03, 3) * 2.2;
  const d = Math.hypot(x, z);
  h = lerp(h, 3.4 + fbm(x * 0.02, z * 0.02, 3) * 0.9, smooth(90, 20, d));
  h += smooth(SIZE * 0.36, SIZE * 0.5, Math.max(Math.abs(x), Math.abs(z))) * 45;
  return Math.max(h, 1.3 + fbm(x * 0.05, z * 0.05, 2) * 0.4);
}
// [x, z, r, height, flat-top radius]: cone-like hills (h * (1 - smooth(0, r, d))^1.6, the "triangle rule")
const HILLS = [[...LM.echoHill, 55, 30, 0], [...LM.flintHill, 60, 36, 0], [...LM.peak, 60, 42, 6], [...LM.tree, 18, 4, 5], [...LM.stones, 14, 2.2, 6]];
const dist = (x, z, p) => Math.hypot(x - p[0], z - p[1]);
const meadowMask = (x, z) => 1 - smooth(45, 75, dist(x, z, LM.meadow));
function features(h, x, z) {
  const base = h;
  for (const [hx, hz, r, hh, top] of HILLS) {
    const d = Math.max(top, Math.hypot(x - hx, z - hz));
    if (d < r) h += hh * Math.pow(1 - smooth(0, r, d), 1.6) * (0.85 + 0.3 * (fbm(x * 0.035, z * 0.035, 3) * 0.5 + 0.5));
  }
  const mm = meadowMask(x, z);
  if (mm > 0) h = lerp(h, 4.5 + fbm(x * 0.02, z * 0.02, 2) * 1.2, 0.85 * mm);
  const dl = dist(x, z, LM.lake);
  if (dl < 40) h = lerp(h, -1.8, 1 - smooth(26, 40, dl));
  const ds = dist(x, z, LM.spring);
  if (ds < 8) h = lerp(h, base - 0.9, 1 - smooth(5, 8, ds));
  return caveCarve(h, x, z);
}
function river(h, x, z) {
  const r = 1 - smooth(5, 24, Math.abs(x - riverX(z)));
  if (r <= 0) return h;
  let ford = 0;
  for (const zf of FORDS) ford = Math.max(ford, 1 - smooth(5, 16, Math.abs(z - zf)));
  return lerp(h, lerp(-2.4, -0.6, ford), r);
}
export function rawHeight(x, z) { return river(features(land(x, z), x, z), x, z); }
initCaves(land);
initPOIS(riverX, CAVES);
const forest = (x, z) => fbm(x * 0.012 + 9, z * 0.012 - 4, 3);
export { forest, CAVES, POIS, depthAt };
export function biome(x, z) {
  if (meadowMask(x, z) > 0.5) return 'meadow';
  if (dist(x, z, LM.lake) < 45) return 'lake';
  if (Math.max(Math.abs(x), Math.abs(z)) > 215 || dist(x, z, LM.echoHill) < 50 || dist(x, z, LM.flintHill) < 50) return 'high';
  if (forest(x, z) > 0.55) return 'pine';
  return 'valley';
}
// Scatter keeps out of cave footprints and landmark spots.
const keepOut = (x, z) => inCave(x, z) || KEEP.some(([kx, kz, r]) => Math.abs(x - kx) < r && Math.abs(z - kz) < r && Math.hypot(x - kx, z - kz) < r);

const N1 = SEG + 1;
const H = new Float32Array(N1 * N1);
export function getHeight(x, z) {
  const fx = clamp((x + SIZE / 2) / CELL, 0, SEG - 0.001), fz = clamp((z + SIZE / 2) / CELL, 0, SEG - 0.001);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * N1 + ix;
  return lerp(lerp(H[i], H[i + 1], tx), lerp(H[i + N1], H[i + N1 + 1], tx), tz);
}
export function slopeY(x, z) {
  const dx = getHeight(x + 1.5, z) - getHeight(x - 1.5, z), dz = getHeight(x, z + 1.5) - getHeight(x, z - 1.5);
  return 3 / Math.hypot(dx, 3, dz);
}

// ---------- colliders ----------
const grid = new Map();
const key = (x, z) => ((x / 8) | 0) + ',' + ((z / 8) | 0);
export function addCollider(c) {
  const k = key(c.x + 1000, c.z + 1000);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(c);
  return c;
}
export function collide(p, rad) {
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = grid.get(key(p.x + 1000 + i * 8, p.z + 1000 + j * 8));
    if (!list) continue;
    for (const c of list) {
      if (c.off) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
      if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
  }
}

// ---------- instanced resource fields ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export class Field {
  // parts: [{ geo, mat }] drawn together per node. Nodes are grouped into grid cells so off-screen cells are skipped.
  constructor(scene, kind, parts, nodes, { shadow = true, tint = 0, cell = 0, layer = 1, cull = null } = {}) {
    this.kind = kind; this.nodes = nodes; this.cells = [];
    const groups = new Map();
    for (const n of nodes) {
      const k = cell ? Math.floor(n.x / cell) + ',' + Math.floor(n.z / cell) : '0';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    const c = new THREE.Color();
    for (const list of groups.values()) {
      const meshes = parts.map((p) => {
        const m = new THREE.InstancedMesh(p.geo, p.mat, list.length);
        m.castShadow = shadow; m.receiveShadow = true; m.layers.set(layer);
        scene.add(m);
        return m;
      });
      let cx = 0, cz = 0;
      list.forEach((n, j) => {
        n.alive = true; n.field = this; n.ms = meshes; n.j = j; cx += n.x; cz += n.z;
        this.write(n);
        if (tint) { const v = 1 - tint + n.t * tint * 2; c.setRGB(v, v * (0.96 + n.t * 0.08), v * 0.96); for (const m of meshes) m.setColorAt(j, c); }
      });
      for (const m of meshes) m.computeBoundingSphere();
      if (cull) cull.push({ meshes, x: cx / list.length, z: cz / list.length });
    }
  }
  write(n) {
    const s = n.alive ? n.s : 0;
    _m.compose(_p.set(n.x, n.y, n.z), _q.setFromEuler(_e.set(0, n.r, 0)), _s.set(s, s, s));
    for (const m of n.ms) { m.setMatrixAt(n.j, _m); m.instanceMatrix.needsUpdate = true; }
  }
  set(n, alive) { n.alive = alive; if (n.col) n.col.off = !alive; this.write(n); }
}

export function createWorld(scene, renderer, quality = 'medium') {
  let Q = PRESETS[quality] || PRESETS.medium;
  const R = rng(20261111);

  // ---------- terrain ----------
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const h = rawHeight(pos.getX(i), pos.getZ(i)); pos.setY(i, h); H[i] = h; }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, col = new Float32Array(pos.count * 3), splat = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nor.getY(i);
    const n = fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5, n2 = fbm(x * 0.11 + 40, z * 0.11, 2) * 0.5 + 0.5;
    const rock = clamp(smooth(0.86, 0.7, ny) + smooth(30, 46, h) * 0.75, 0, 1);
    const dirt = clamp(smooth(1.0, 0.35, h) * 0.9 + smooth(0.66, 0.9, n2) * 0.5 * (1 - rock) + smooth(0.94, 0.86, ny) * 0.3, 0, 1 - rock);
    splat.set([Math.max(0, 1 - rock - dirt), dirt, rock], i * 3);
    // vertex colour is a tint over the textures: patchy brightness, wet riverbed, pale high ground
    let v = 0.86 + (n - 0.5) * 0.36 + (n2 - 0.5) * 0.12;
    v = lerp(v, 0.45, smooth(0.25, -0.9, h));
    v = lerp(v, 1.2, smooth(36, 50, h));
    const mt = meadowMask(x, z) * 0.12;                            // WP3: the meadow is a lighter yellow-green
    col.set([v * (1 + mt), v * (1 + (n - 0.5) * 0.12 + mt * 0.9), v * (0.94 + (n2 - 0.5) * 0.1)], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
  const terrain = new THREE.Mesh(geo, makeTerrainMaterial(Q.anisotropy));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- sky, sun, fog ----------
  const sky = new Sky();
  sky.scale.setScalar(10000);
  sky.material.uniforms.turbidity.value = 4;
  sky.material.uniforms.rayleigh.value = 1.8;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.85;
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 4);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
  Object.assign(sun.shadow.camera, { near: 60, far: 180 });     // a shallow slab around the player: far trees never enter the shadow pass
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4f0, 0x6a644c, 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xb9cbd8, 0.0035);
  const starGeo = new THREE.BufferGeometry(), sp = new Float32Array(1800 * 3);
  for (let i = 0; i < 1800; i++) {
    const u = R() * 2 - 1, a = R() * 6.283, r = Math.sqrt(1 - u * u);
    sp.set([r * Math.cos(a) * 2000, Math.abs(u) * 2000 + 30, r * Math.sin(a) * 2000], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  scene.add(stars);
  // Overcast lid that fades in during storms.
  const overcast = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 12), new THREE.MeshBasicMaterial({ color: 0x7d8890, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  overcast.frustumCulled = false; overcast.renderOrder = 1;
  scene.add(overcast);

  // ---------- river and atmosphere ----------
  const river = createRiver(scene, { SIZE, riverX, heights: H, N1 });
  const atmosphere = createAtmosphere(scene, R, getHeight);

  // ---------- vegetation and resources ----------
  const pmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const one = (geo, material = pmat) => [{ geo, mat: material }];
  const flat = (g) => { g.computeVertexNormals(); return g; };
  const ico = (r, d = 2) => new THREE.IcosahedronGeometry(r, d);
  const scatter = (n, ok, max = LIMIT, smin = 0.8, smax = 1.3) => {
    const out = [];
    for (let t = 0; out.length < n && t < n * 60; t++) {
      const x = (R() * 2 - 1) * max, z = (R() * 2 - 1) * max, h = getHeight(x, z);
      if (ok(x, z, h, slopeY(x, z), Math.hypot(x, z)) && !keepOut(x, z)) out.push({ x, y: h, z, s: lerp(smin, smax, R()), r: R() * 6.283, t: R() });
    }
    return out;
  };
  const river_ = (n, band, zmax, ok, smin, smax, gap = 0) => {
    const out = [];
    for (let t = 0; out.length < n && t < n * 80; t++) {
      const z = (R() * 2 - 1) * zmax, x = riverX(z) + (R() < 0.6 ? -1 : 1) * (band + R() * 9), h = getHeight(x, z);
      if (ok(h) && !keepOut(x, z) && !(gap && out.some((o) => Math.hypot(o.x - x, o.z - z) < gap))) out.push({ x, y: h, z, s: lerp(smin, smax, R()), r: R() * 6.283, t: R() });
    }
    return out;
  };
  const split = (list, k) => Array.from({ length: k }, (_, i) => list.filter((_, j) => j % k === i));
  const decorCells = [];
  const clearings = [], carpets = [];
  const clear = (x, z, r) => { clearings.push({ x, z, r }); for (const c of carpets) c.gw.fill(1e9); };

  const treeNodes = scatter(440, (x, z, h, ny, d) => h > 1.6 && h < 24 && ny > 0.86 && d > 17 && forest(x, z) > -0.12 - (d < 70 ? 0.25 : 0), LIMIT, 0.75, 1.3);
  const pineNodes = scatter(300, (x, z, h, ny, d) => h > 8 && h < 40 && ny > 0.74 && d > 60, LIMIT + 25, 0.8, 1.45);
  const twistNodes = scatter(32, (x, z, h, ny, d) => h > 3 && h < 30 && ny > 0.8 && d > 45 && forest(x + 200, z - 80) > 0.1, LIMIT, 0.8, 1.2);
  const deadNodes = scatter(45, (x, z, h, ny, d) => h > 2 && h < 30 && ny > 0.8 && d > 40, LIMIT, 0.8, 1.2);
  const woods = [];
  split(treeNodes, 5).forEach((nodes, i) => woods.push(new Field(scene, 'tree', NAT['commontree_' + (i + 1)], nodes, { tint: 0.1, cell: 160 })));
  split(pineNodes, 5).forEach((nodes, i) => woods.push(new Field(scene, 'tree', NAT['pine_' + (i + 1)], nodes, { tint: 0.1, cell: 160 })));
  split(twistNodes, 2).forEach((nodes, i) => woods.push(new Field(scene, 'tree', NAT[['twistedtree_2', 'twistedtree_4'][i]], nodes, { tint: 0.1, cell: 120 })));
  split(deadNodes, 2).forEach((nodes, i) => woods.push(new Field(scene, 'tree', NAT[['deadtree_2', 'deadtree_4'][i]], nodes, { tint: 0.1, cell: 120 })));
  for (const f of woods) for (const n of f.nodes) { n.hp = 4; n.col = addCollider({ x: n.x, z: n.z, r: 0.42 * n.s }); n.y -= 0.12; f.write(n); }

  split(scatter(180, (x, z, h, ny, d) => h > 0.2 && d > 14 && (ny < 0.9 || R() < 0.08), LIMIT + 25, 0.3, 1.3), 3).forEach((nodes, i) => {
    new Field(scene, 'boulder', NAT['rock_medium_' + (i + 1)], nodes, { tint: 0.1, cell: 160 });
    for (const n of nodes) addCollider({ x: n.x, z: n.z, r: 1.25 * n.s });
  });

  const nearTree = (x, z) => treeNodes.some((t) => Math.abs(t.x - x) < 5 && Math.abs(t.z - z) < 5);
  const stickGeo = merge([
    part(new THREE.CylinderGeometry(0.022, 0.034, 1, 5), 0x5a432c, 0, 0.04, 0, 0, 0, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.014, 0.02, 0.4, 4), 0x5a432c, 0.2, 0.05, 0.13, Math.PI / 2, 0, 0.6),
  ]);
  const land = (x, z, h, ny, d) => h > 1 && ny > 0.85 && d > 4;
  const sticks = new Field(scene, 'stick', one(stickGeo), [
    ...scatter(26, (x, z, h, ny, d) => land(x, z, h, ny, d) && d < 34, 34),
    ...scatter(260, (x, z, h, ny, d) => land(x, z, h, ny, d) && nearTree(x, z)),
  ], { cell: 128 });
  const stoneGeo = flat(part(lumpy(ico(0.17, 1), 0.22, 11), 0x85817a, 0, 0.07, 0, 0, 0, 0, 1, 0.65, 1));
  const stones = new Field(scene, 'stone', one(stoneGeo), [
    ...scatter(26, (x, z, h, ny, d) => land(x, z, h, ny, d) && d < 36, 36),
    ...scatter(240, (x, z, h, ny, d) => h > 0.3 && d > 30 && (h < 2 || ny < 0.93)),
  ], { tint: 0.15, cell: 128 });

  const br = rng(41), berryParts = [];
  for (let i = 0; i < 22; i++) {
    const a = br() * 6.283, e = 0.25 + br() * 1.15, r = 0.82;
    berryParts.push(part(ico(0.05, 0), br() > 0.3 ? 0xb01c34 : 0x6d1238, Math.cos(a) * Math.sin(e) * r, 0.4 + Math.cos(e) * r * 0.85, Math.sin(a) * Math.sin(e) * r));
  }
  const bushNodes = [
    ...scatter(5, (x, z, h, ny, d) => land(x, z, h, ny, d) && d > 9 && d < 30, 30, 0.7, 1),
    ...scatter(90, (x, z, h, ny, d) => land(x, z, h, ny, d) && d > 30 && h < 20, LIMIT, 0.7, 1),
  ];
  split(bushNodes.map((n) => ({ ...n })), 2).forEach((nodes, i) =>
    new Field(scene, 'bush', NAT[i ? 'bush_common_flowers' : 'bush_common'], nodes, { tint: 0.08, cell: 160 }).nodes.forEach((n) => addCollider({ x: n.x, z: n.z, r: 0.5 * n.s })));
  const berries = new Field(scene, 'berry', one(merge(berryParts)), bushNodes, { shadow: false, cell: 128 });

  const rr = rng(8), reedParts = [];
  for (let i = 0; i < 11; i++) {
    const x = rr() * 0.7 - 0.35, z = rr() * 0.7 - 0.35, h = 1.2 + rr() * 0.8, tx = rr() * 0.24 - 0.12, tz = rr() * 0.24 - 0.12;
    reedParts.push(part(new THREE.ConeGeometry(0.028, h, 4), rr() > 0.4 ? 0x6f8040 : 0x8c8a4c, x, h / 2, z, tx, 0, tz));
    if (i % 3 === 0) reedParts.push(part(new THREE.CapsuleGeometry(0.035, 0.16, 2, 6), 0x4e3421, x - tz * h * 0.8, h * 0.82, z + tx * h * 0.8, tx, 0, tz));
  }
  const reeds = new Field(scene, 'reed', one(merge(reedParts)), river_(190, 10, LIMIT, (h) => h > -0.25 && h < 0.75, 0.8, 1.25), { tint: 0.12, cell: 128 });
  const clayGeo = flat(merge([
    part(lumpy(ico(1, 2), 0.14, 2.4), 0x96573a, 0, 0.05, 0, 0, 0, 0, 1.1, 0.32, 1.1),
    part(lumpy(ico(0.3, 1), 0.2, 6), 0xa7623f, 0.5, 0.25, 0.2), part(lumpy(ico(0.24, 1), 0.2, 6), 0x8a4e33, -0.4, 0.24, -0.3),
  ]));
  const clay = new Field(scene, 'clay', one(clayGeo), river_(30, 12, 200, (h) => h > 0.3 && h < 1.2, 0.8, 1.2, 6));
  const gr = rng(12), grainParts = [];
  for (let i = 0; i < 16; i++) {
    const x = gr() * 0.9 - 0.45, z = gr() * 0.9 - 0.45, h = 0.7 + gr() * 0.35, t = gr() * 0.3 - 0.15;
    grainParts.push(part(new THREE.CylinderGeometry(0.008, 0.012, h, 3), 0xa89243, x, h / 2, z, t, 0, t));
    grainParts.push(part(ico(0.035, 0), 0xd2b055, x - t * h * 0.5, h, z + t * h * 0.5, 0, 0, 0, 1, 2.6, 1));
  }
  const grainF = new Field(scene, 'grain', one(merge(grainParts)),
    scatter(70, (x, z, h, ny, d) => land(x, z, h, ny, d) && d > 22 && h < 14 && forest(x, z) < 0.05, 230), { shadow: false });
  const fields = [sticks, stones, berries, reeds, clay, grainF, ...woods];
  // WP3: the caves (flint and ochre fields go after all the others so saved tree indices stay valid), landmarks, Mirror Lake
  const caves = createCaves(scene, { NAT, rockTex: rockTexture(), addCollider, clear: (x, z, r) => clear(x, z, r), Field, pmat });
  fields.push(caves.flintF, caves.ochreF);

  // Flowers, ferns, pebbles and mushrooms: decoration only, hidden beyond the quality preset's decor distance.
  const meadow = (x, z, h, ny, d) => land(x, z, h, ny, d) && h < 26;
  const decor = (name, n, smin, smax, ok = meadow, max = LIMIT) => new Field(scene, 'decor', NAT[name], scatter(n, ok, max, smin, smax), { shadow: false, cell: 60, tint: 0.08, cull: decorCells });
  decor('flower_3_single', 420, 0.3, 0.5, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && forest(x, z) < 0.1);
  decor('flower_4_single', 320, 0.28, 0.45, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && forest(x + 50, z) < 0);
  decor('flower_3_group', 160, 0.3, 0.5, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && forest(x, z) < 0 && forest(x * 3, z * 3) > 0.15);
  decor('flower_4_group', 140, 0.3, 0.45, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && forest(x - 70, z + 30) < 0 && forest(x * 3 + 9, z * 3) > 0.15);
  decor('fern_1', 420, 0.14, 0.26, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && nearTree(x, z));
  decor('clover_1', 300, 0.4, 0.7);
  decor('plant_1', 320, 0.5, 0.9);
  decor('plant_1_big', 120, 0.6, 1, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && nearTree(x, z));
  decor('plant_7_big', 260, 0.7, 1.2);
  decor('mushroom_common', 140, 0.8, 1.4, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && nearTree(x, z));
  for (const name of ['pebble_round_1', 'pebble_round_2', 'pebble_round_3'])
    new Field(scene, 'decor', NAT[name], river_(120, 6, LIMIT, (h) => h > -0.3 && h < 1.6, 0.5, 1.6), { shadow: false, cell: 80, tint: 0.1, cull: decorCells });

  // ---------- grass that follows the player ----------
  const bladeTex = canvasTex(256, (g, S) => {
    const r = rng(2);
    for (let i = 0; i < 110; i++) {
      const x = 6 + r() * (S - 12), h = 70 + r() * 150, lean = r() * 50 - 25, w = 3 + r() * 5, hue = 74 + r() * 30, sat = 40 + r() * 20;
      const gr = g.createLinearGradient(0, S, 0, S - h);
      gr.addColorStop(0, `hsl(${hue + 10},${sat}%,${24 + r() * 6}%)`);
      gr.addColorStop(0.6, `hsl(${hue},${sat}%,${32 + r() * 8}%)`);
      gr.addColorStop(1, `hsl(${hue - 8},${sat + 8}%,${46 + r() * 12}%)`);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - w, S); g.quadraticCurveTo(x + lean * 0.25, S - h * 0.55, x + lean, S - h); g.quadraticCurveTo(x + w * 0.6 + lean * 0.3, S - h * 0.5, x + w, S); g.fill();
    }
  });
  bladeTex.anisotropy = Q.anisotropy;
  const q = [];
  for (let i = 0; i < 3; i++) { const p = new THREE.PlaneGeometry(1.1, 0.55); p.translate(0, 0.27, 0); p.rotateY((i * Math.PI) / 3); q.push(p); }
  const tuft = merge(q);
  for (let i = 0; i < tuft.attributes.normal.count; i++) tuft.attributes.normal.setXYZ(i, 0, 1, 0);
  const gmat = new THREE.MeshLambertMaterial({ map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const fadeU = { value: new THREE.Vector2(36, 45) };
  gmat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind; sh.uniforms.uFade = fadeU;
    sh.vertexShader = 'uniform float uTime; uniform vec2 uFade;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
       float gust = sin(uTime * 0.8 + instanceMatrix[3].x * 0.06 + instanceMatrix[3].z * 0.09) * 0.5 + 0.5;
       transformed.x += (sin(uTime * 1.7 + ph) + sin(uTime * 0.6 + ph * 0.4) * 0.7 + gust * 1.6) * 0.09 * uv.y;
       transformed.z += cos(uTime * 1.3 + ph) * 0.06 * uv.y;
       float dcam = distance(instanceMatrix[3].xz, cameraPosition.xz);
       transformed.y *= 1.0 - smoothstep(uFade.x, uFade.y, dcam);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
  };
  gmat.customProgramCacheKey = () => 'hearthborn-grass';
  const natFade = { value: new THREE.Vector2(26, 33) };
  for (const n of ['grass_common_short', 'grass_wispy_short', 'grass_common_tall', 'grass_wispy_tall']) {
    for (const p of NAT[n]) { p.mat = p.mat.clone(); p.mat.onBeforeCompile = windShader(0.085, natFade); p.mat.customProgramCacheKey = () => 'hearthborn-natgrass'; }
  }
  // A patch of instances that wraps around the player, so grass is only ever drawn nearby.
  function carpet(parts, NG, L, smin, smax, tintLo, fade) {
    const meshes = parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, NG);
      m.frustumCulled = false; m.receiveShadow = true; m.layers.set(1); scene.add(m);
      return m;
    });
    const gx = new Float32Array(NG), gz = new Float32Array(NG), gw = new Float32Array(NG * 2).fill(1e9), gs = new Float32Array(NG), gcol = new THREE.Color();
    for (let i = 0; i < NG; i++) {
      gx[i] = R() * L; gz[i] = R() * L; gs[i] = lerp(smin, smax, R());
      const v = tintLo + R() * (1 - tintLo) * 1.5, y = R(); gcol.setRGB(v * (0.92 + y * 0.16), v, v * (0.78 + y * 0.1));
      for (const m of meshes) m.setColorAt(i, gcol);
    }
    const c = { gw, count: NG, L, update(px, pz) {
      const L = c.L, mod = (a) => ((a % L) + L) % L;
      let dirty = false;
      for (let i = 0; i < c.count; i++) {
        const x = px + mod(gx[i] - px) - L / 2, z = pz + mod(gz[i] - pz) - L / 2;
        if (Math.abs(x - gw[i * 2]) < 1 && Math.abs(z - gw[i * 2 + 1]) < 1) continue;
        gw[i * 2] = x; gw[i * 2 + 1] = z; dirty = true;
        const h = getHeight(x, z), ok = h > 1.1 && h < 30 && slopeY(x, z) > 0.84 && !clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
        const s = ok ? gs[i] * smooth(1.1, 2, h) : 0;
        _m.compose(_p.set(x, h - 0.04, z), _q.setFromEuler(_e.set(0, gx[i] * 7, 0)), _s.set(s, s, s));
        for (const m of meshes) m.setMatrixAt(i, _m);
      }
      if (dirty) for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    }, setDensity(k) {
      c.count = Math.round(NG * k); c.L = L * Math.sqrt(k);
      for (const m of meshes) m.count = c.count;
      gw.fill(1e9);
      if (fade) fade.value.set(c.L * 0.4, c.L * 0.5);
    } };
    carpets.push(c);
  }
  carpet([{ geo: tuft, mat: gmat }], 9000, 90, 0.7, 1.5, 0.72, fadeU);
  carpet(NAT.grass_common_short, 1500, 60, 0.4, 0.75, 0.8, natFade);
  carpet(NAT.grass_wispy_short, 500, 56, 0.5, 0.9, 0.8);
  carpet(NAT.grass_common_tall, 320, 60, 0.45, 0.8, 0.78);
  carpet(NAT.grass_wispy_tall, 180, 60, 0.5, 0.85, 0.8);
  const updateGrass = (px, pz) => { for (const c of carpets) c.update(px, pz); };

  const landmarks = createLandmarks(scene, NAT, getHeight, addCollider, { clear, riverX });
  const lakeGeo = new THREE.CircleGeometry(44, 48).rotateX(-Math.PI / 2), lp = lakeGeo.attributes.position, lriv = new Float32Array(lp.count * 2);
  for (let i = 0; i < lp.count; i++) { lriv[i * 2] = lp.getX(i); lriv[i * 2 + 1] = lp.getZ(i); }
  lakeGeo.setAttribute('riv', new THREE.BufferAttribute(lriv, 2));
  const lake = new THREE.Mesh(lakeGeo, river.mesh.material);
  lake.position.set(LM.lake[0], 0, LM.lake[1]); lake.renderOrder = 2;
  scene.add(lake);

  function setQuality(name) {
    Q = PRESETS[name] || PRESETS.medium;
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    Object.assign(sun.shadow.camera, { left: -Q.shadowRange, right: Q.shadowRange, top: Q.shadowRange, bottom: -Q.shadowRange });
    sun.shadow.camera.updateProjectionMatrix();
    for (const c of carpets) c.setDensity(Q.grass);
  }
  setQuality(quality);

  // ---------- time of day ----------
  const sunDir = new THREE.Vector3(), tmp = new THREE.Color();
  const C = (h) => new THREE.Color(h);
  const cDay = C(0xfff3e0), cLow = C(0xff9550), cMoon = C(0x8ea6d6), skyD = C(0xbcd4f0), skyN = C(0x1a2a4a);
  const fogD = C(0xb4c8d6), fogN = C(0x04070d), fogS = C(0xd49468);
  const env = { day: 1, night: 0, storm: 0, cave: 0, sunDir };
  const fogStorm = C(0x5d6870);
  function setTime(t, focus, camera) {
    const a = ((t - 6) / 12) * Math.PI;
    sunDir.set(Math.cos(a), Math.sin(a) * 0.95, 0.32).normalize();
    const y = sunDir.y, day = smooth(-0.1, 0.18, y);
    env.day = day; env.night = 1 - day;
    sky.material.uniforms.sunPosition.value.copy(sunDir);
    if (y > -0.06) {
      sun.color.copy(cLow).lerp(cDay, smooth(0, 0.4, y));
      sun.intensity = 4.2 * smooth(-0.06, 0.12, y);
      sun.position.copy(focus).addScaledVector(sunDir, 120);
    } else {
      sun.color.copy(cMoon);
      sun.intensity = 1.9 * smooth(-0.06, -0.2, y);
      sun.position.copy(focus).add(_p.set(-sunDir.x, Math.max(0.35, -sunDir.y), -sunDir.z).normalize().multiplyScalar(120));
    }
    const st = env.storm;
    sun.intensity *= 1 - st * 0.75;
    sun.target.position.copy(focus);
    hemi.color.copy(skyN).lerp(skyD, day);
    hemi.groundColor.setRGB(0.3, 0.32, 0.2).multiplyScalar(lerp(0.25, 1, day));
    hemi.intensity = lerp(0.95, 1.3, day) * (1 - st * 0.35);
    const dusk = clamp(1 - Math.abs(y - 0.03) / 0.2, 0, 1) * 0.6;
    scene.fog.color.copy(fogN).lerp(fogD, day).lerp(tmp.copy(fogS).multiplyScalar(0.35 + day * 0.65), dusk);
    scene.fog.color.lerp(tmp.copy(fogStorm).multiplyScalar(0.25 + day * 0.75), st * 0.85);
    scene.fog.density = lerp(0.0055, 0.003, day) + st * 0.007;
    sky.material.uniforms.turbidity.value = 4 + st * 16;
    sky.material.uniforms.rayleigh.value = 1.8 - st * 1.3;
    stars.material.opacity = (1 - smooth(-0.2, 0.02, y)) * (1 - st);
    stars.position.copy(camera.position);
    overcast.position.copy(camera.position);
    overcast.visible = st > 0.01;
    overcast.material.opacity = Math.min(1, st * 1.15);
    overcast.material.color.setRGB(0.03, 0.04, 0.055).lerp(tmp.setRGB(0.36, 0.4, 0.44), day);
    const u = river.uniforms;
    u.uSun.value.copy(sunDir);
    u.uSunColor.value.copy(sun.color).multiplyScalar((1 - st) * smooth(-0.05, 0.1, y));
    u.uSky.value.copy(scene.fog.color).lerp(tmp.copy(hemi.color), 0.5).multiplyScalar(lerp(0.4, 1, day));
    u.uLight.value = lerp(0.12, 1, day) * (1 - st * 0.45);
    renderer.toneMappingExposure = lerp(0.8, 0.68, day);
    const cave = env.cave || 0;                     // WP3: inside a cave the sky light fades out
    if (cave > 0) {
      sun.intensity *= 1 - cave;
      hemi.intensity *= 1 - 0.92 * cave;
      scene.fog.color.lerp(tmp.setHex(0x050403), cave);
      scene.fog.density += cave * 0.02;
      renderer.toneMappingExposure *= 1 + 0.25 * cave;
      u.uLight.value *= 1 - cave;
    }
  }
  function update(dt, px, pz, camera) {
    wind.value += dt;
    river.update(dt);
    updateGrass(px, pz);
    atmosphere.update(dt, camera, env, px, pz, sunDir);
    caves.update(dt, px, pz); landmarks.update(dt, px, pz);
    for (const c of decorCells) { const on = Math.hypot(c.x - px, c.z - pz) < Q.decor; for (const m of c.meshes) m.visible = on; }
  }
  return { fields, env, setTime, update, clear, setQuality, river, atmosphere, water: river.mesh, caves, landmarks, lake };
}
