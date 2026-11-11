import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { rng, lerp, clamp, smooth, mat, part, merge, lumpy, canvasTex } from './util.js';
import { NAT, wind } from './nature.js';

export const SIZE = 640, SEG = 256, CELL = SIZE / SEG, LIMIT = SIZE / 2 - 40;
const perlin = new ImprovedNoise();
const fbm = (x, z, oct = 5) => {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * perlin.noise(x * f, z * f, 7.3); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
};
export const riverX = (z) => 62 + Math.sin(z * 0.012) * 30 + Math.sin(z * 0.031 + 1.3) * 10;

function rawHeight(x, z) {
  let h = 7 + fbm(x * 0.006, z * 0.006) * 26 + fbm(x * 0.03, z * 0.03, 3) * 2.2;
  const d = Math.hypot(x, z);
  h = lerp(h, 3.4 + fbm(x * 0.02, z * 0.02, 3) * 0.9, smooth(90, 20, d));
  h += smooth(SIZE * 0.36, SIZE * 0.5, Math.max(Math.abs(x), Math.abs(z))) * 45;
  h = Math.max(h, 1.3 + fbm(x * 0.05, z * 0.05, 2) * 0.4);
  const r = 1 - smooth(5, 24, Math.abs(x - riverX(z)));
  return lerp(h, -2.4, r);
}

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
  constructor(scene, kind, parts, nodes, { shadow = true, tint = 0, cell = 0, layer = 1 } = {}) {
    this.kind = kind; this.nodes = nodes;
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
      list.forEach((n, j) => {
        n.alive = true; n.field = this; n.ms = meshes; n.j = j;
        this.write(n);
        if (tint) { const v = 1 - tint + n.t * tint * 2; c.setRGB(v, v * (0.96 + n.t * 0.08), v * 0.96); for (const m of meshes) m.setColorAt(j, c); }
      });
      for (const m of meshes) m.computeBoundingSphere();
    }
  }
  write(n) {
    const s = n.alive ? n.s : 0;
    _m.compose(_p.set(n.x, n.y, n.z), _q.setFromEuler(_e.set(0, n.r, 0)), _s.set(s, s, s));
    for (const m of n.ms) { m.setMatrixAt(n.j, _m); m.instanceMatrix.needsUpdate = true; }
  }
  set(n, alive) { n.alive = alive; if (n.col) n.col.off = !alive; this.write(n); }
}

export function createWorld(scene, renderer) {
  const R = rng(20261111);

  // ---------- terrain ----------
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const h = rawHeight(pos.getX(i), pos.getZ(i)); pos.setY(i, h); H[i] = h; }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i), ny = nor.getY(i);
    const n = fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5, n2 = fbm(x * 0.11 + 40, z * 0.11, 2) * 0.5 + 0.5;
    c.setRGB(0.2, 0.33, 0.09).lerp(c2.setRGB(0.36, 0.44, 0.14), n).lerp(c2.setRGB(0.5, 0.46, 0.2), smooth(0.55, 0.85, n2) * 0.7);
    c.lerp(c2.setRGB(0.55, 0.49, 0.33), smooth(1.5, 0.5, h));               // sandy bank
    c.lerp(c2.setRGB(0.2, 0.18, 0.13), smooth(0.3, -0.8, h));                // wet river bed
    c.lerp(c2.setRGB(0.36, 0.34, 0.31), smooth(0.86, 0.68, ny));             // rock on slopes
    c.lerp(c2.setRGB(0.48, 0.47, 0.45), smooth(30, 46, h));                  // high ground
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const grain = canvasTex(256, (g, S) => {
    const im = g.createImageData(S, S), r = rng(5);
    for (let i = 0; i < S * S; i++) { const v = 150 + r() * 105; im.data.set([v, v, v * 0.97, 255], i * 4); }
    g.putImageData(im, 0, 0);
  }, SIZE / 3);
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, bumpMap: grain, bumpScale: 0.6, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- sky, sun, fog ----------
  const sky = new Sky();
  sky.scale.setScalar(10000);
  Object.assign(sky.material.uniforms.turbidity, { value: 5 });
  sky.material.uniforms.rayleigh.value = 1.6;
  sky.material.uniforms.mieCoefficient.value = 0.004;
  sky.material.uniforms.mieDirectionalG.value = 0.82;
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 260 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.35;
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

  // ---------- river ----------
  const wn = canvasTex(256, (g, S) => {
    const r = rng(9), waves = [];
    for (let i = 0; i < 9; i++) waves.push([((r() * 7) | 0) + 1, ((r() * 7) | 0) + 1, r() * 6.28, 0.4 + r()]);
    const im = g.createImageData(S, S), k = (Math.PI * 2) / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0;
      for (const [a, b, ph, am] of waves) { const cs = Math.cos((a * x + b * y) * k + ph) * am; dx += cs * a; dy += cs * b; }
      const l = Math.hypot(dx * 0.18, dy * 0.18, 1);
      im.data.set([(-dx * 0.18 / l * 0.5 + 0.5) * 255, (-dy * 0.18 / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
  });
  wn.colorSpace = THREE.NoColorSpace;
  const water = new Water(new THREE.PlaneGeometry(SIZE, SIZE), {
    textureWidth: 512, textureHeight: 512, waterNormals: wn, sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0xffffff, waterColor: 0x16332e, distortionScale: 0.55, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 16;
  water.material.uniforms.alpha.value = 0.9;
  water.material.transparent = true;
  scene.add(water);

  // ---------- vegetation and resources ----------
  const pmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const one = (geo, material = pmat) => [{ geo, mat: material }];
  const flat = (g) => { g.computeVertexNormals(); return g; };
  const ico = (r, d = 2) => new THREE.IcosahedronGeometry(r, d);
  const scatter = (n, ok, max = LIMIT, smin = 0.8, smax = 1.3) => {
    const out = [];
    for (let t = 0; out.length < n && t < n * 60; t++) {
      const x = (R() * 2 - 1) * max, z = (R() * 2 - 1) * max, h = getHeight(x, z);
      if (ok(x, z, h, slopeY(x, z), Math.hypot(x, z))) out.push({ x, y: h, z, s: lerp(smin, smax, R()), r: R() * 6.283, t: R() });
    }
    return out;
  };
  const river = (n, band, zmax, ok, smin, smax, gap = 0) => {
    const out = [];
    for (let t = 0; out.length < n && t < n * 80; t++) {
      const z = (R() * 2 - 1) * zmax, x = riverX(z) + (R() < 0.6 ? -1 : 1) * (band + R() * 9), h = getHeight(x, z);
      if (ok(h) && !(gap && out.some((o) => Math.hypot(o.x - x, o.z - z) < gap))) out.push({ x, y: h, z, s: lerp(smin, smax, R()), r: R() * 6.283, t: R() });
    }
    return out;
  };
  const forest = (x, z) => fbm(x * 0.012 + 9, z * 0.012 - 4, 3);
  const split = (list, k) => Array.from({ length: k }, (_, i) => list.filter((_, j) => j % k === i));

  const treeNodes = scatter(400, (x, z, h, ny, d) => h > 1.6 && h < 24 && ny > 0.86 && d > 17 && forest(x, z) > -0.12 - (d < 70 ? 0.25 : 0), LIMIT, 0.75, 1.25);
  const pineNodes = scatter(270, (x, z, h, ny, d) => h > 8 && h < 40 && ny > 0.74 && d > 60, LIMIT + 25, 0.8, 1.4);
  const woods = [];
  split(treeNodes, 3).forEach((nodes, i) => woods.push(new Field(scene, 'tree', NAT[['commontree_3', 'commontree_4', 'commontree_5'][i]], nodes, { tint: 0.1, cell: 80 })));
  split(pineNodes, 3).forEach((nodes, i) => woods.push(new Field(scene, 'tree', NAT[['pine_2', 'pine_4', 'pine_5'][i]], nodes, { tint: 0.1, cell: 80 })));
  for (const f of woods) for (const n of f.nodes) { n.hp = 4; n.col = addCollider({ x: n.x, z: n.z, r: 0.42 * n.s }); n.y -= 0.12; f.write(n); }

  split(scatter(170, (x, z, h, ny, d) => h > 0.2 && d > 14 && (ny < 0.9 || R() < 0.08), LIMIT + 25, 0.3, 1.3), 3).forEach((nodes, i) => {
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
  ]);
  const stoneGeo = flat(part(lumpy(ico(0.17, 1), 0.22, 11), 0x85817a, 0, 0.07, 0, 0, 0, 0, 1, 0.65, 1));
  const stones = new Field(scene, 'stone', one(stoneGeo), [
    ...scatter(26, (x, z, h, ny, d) => land(x, z, h, ny, d) && d < 36, 36),
    ...scatter(240, (x, z, h, ny, d) => h > 0.3 && d > 30 && (h < 2 || ny < 0.93)),
  ], { tint: 0.15 });

  const br = rng(41), berryParts = [];
  for (let i = 0; i < 22; i++) {
    const a = br() * 6.283, e = 0.25 + br() * 1.15, r = 0.82;
    berryParts.push(part(ico(0.05, 1), br() > 0.3 ? 0xb01c34 : 0x6d1238, Math.cos(a) * Math.sin(e) * r, 0.4 + Math.cos(e) * r * 0.85, Math.sin(a) * Math.sin(e) * r));
  }
  const bushNodes = [
    ...scatter(5, (x, z, h, ny, d) => land(x, z, h, ny, d) && d > 9 && d < 30, 30, 0.7, 1),
    ...scatter(90, (x, z, h, ny, d) => land(x, z, h, ny, d) && d > 30 && h < 20, LIMIT, 0.7, 1),
  ];
  new Field(scene, 'bush', NAT.bush_common, bushNodes.map((n) => ({ ...n })), { tint: 0.08, cell: 160 }).nodes.forEach((n) => addCollider({ x: n.x, z: n.z, r: 0.5 * n.s }));
  const berries = new Field(scene, 'berry', one(merge(berryParts)), bushNodes, { shadow: false });

  const rr = rng(8), reedParts = [];
  for (let i = 0; i < 11; i++) {
    const x = rr() * 0.7 - 0.35, z = rr() * 0.7 - 0.35, h = 1.2 + rr() * 0.8, tx = rr() * 0.24 - 0.12, tz = rr() * 0.24 - 0.12;
    reedParts.push(part(new THREE.ConeGeometry(0.028, h, 4), rr() > 0.4 ? 0x6f8040 : 0x8c8a4c, x, h / 2, z, tx, 0, tz));
    if (i % 3 === 0) reedParts.push(part(new THREE.CapsuleGeometry(0.035, 0.16, 2, 6), 0x4e3421, x - tz * h * 0.8, h * 0.82, z + tx * h * 0.8, tx, 0, tz));
  }
  const reeds = new Field(scene, 'reed', one(merge(reedParts)), river(170, 10, LIMIT, (h) => h > -0.25 && h < 0.75, 0.8, 1.25), { tint: 0.12 });
  const clayGeo = flat(merge([
    part(lumpy(ico(1, 2), 0.14, 2.4), 0x96573a, 0, 0.05, 0, 0, 0, 0, 1.1, 0.32, 1.1),
    part(lumpy(ico(0.3, 1), 0.2, 6), 0xa7623f, 0.5, 0.25, 0.2), part(lumpy(ico(0.24, 1), 0.2, 6), 0x8a4e33, -0.4, 0.24, -0.3),
  ]));
  const clay = new Field(scene, 'clay', one(clayGeo), river(30, 12, 200, (h) => h > 0.3 && h < 1.2, 0.8, 1.2, 6));
  const gr = rng(12), grainParts = [];
  for (let i = 0; i < 16; i++) {
    const x = gr() * 0.9 - 0.45, z = gr() * 0.9 - 0.45, h = 0.7 + gr() * 0.35, t = gr() * 0.3 - 0.15;
    grainParts.push(part(new THREE.CylinderGeometry(0.008, 0.012, h, 3), 0xa89243, x, h / 2, z, t, 0, t));
    grainParts.push(part(ico(0.035, 0), 0xd2b055, x - t * h * 0.5, h, z + t * h * 0.5, 0, 0, 0, 1, 2.6, 1));
  }
  const grainF = new Field(scene, 'grain', one(merge(grainParts)),
    scatter(70, (x, z, h, ny, d) => land(x, z, h, ny, d) && d > 22 && h < 14 && forest(x, z) < 0.05, 230), { shadow: false });
  const fields = [sticks, stones, berries, reeds, clay, grainF, ...woods];

  // Flowers, ferns and mushrooms: decoration only.
  const meadow = (x, z, h, ny, d) => land(x, z, h, ny, d) && h < 26;
  const decor = (name, n, smin, smax, ok = meadow) => new Field(scene, 'decor', NAT[name], scatter(n, ok, LIMIT, smin, smax), { shadow: false, cell: 80, tint: 0.08 });
  decor('flower_3_single', 420, 0.3, 0.5, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && forest(x, z) < 0.1);
  decor('flower_4_single', 320, 0.28, 0.45, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && forest(x + 50, z) < 0);
  decor('fern_1', 380, 0.14, 0.24, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && nearTree(x, z));
  decor('clover_1', 300, 0.4, 0.7);
  decor('plant_1', 320, 0.5, 0.9);
  decor('plant_7_big', 260, 0.7, 1.2);
  decor('mushroom_common', 140, 0.8, 1.4, (x, z, h, ny, d) => meadow(x, z, h, ny, d) && nearTree(x, z));

  // ---------- grass that follows the player ----------
  const bladeTex = canvasTex(128, (g, S) => {
    const r = rng(2);
    for (let i = 0; i < 46; i++) {
      const x = 8 + r() * (S - 16), h = 40 + r() * 80, lean = r() * 30 - 15, w = 2.5 + r() * 3;
      g.fillStyle = `hsl(${78 + r() * 24},${42 + r() * 16}%,${24 + r() * 15}%)`;
      g.beginPath(); g.moveTo(x - w, S); g.quadraticCurveTo(x, S - h * 0.6, x + lean, S - h); g.quadraticCurveTo(x + w, S - h * 0.5, x + w, S); g.fill();
    }
  });
  const q = [];
  for (let i = 0; i < 6; i++) { const p = new THREE.PlaneGeometry(1, 0.5); p.translate(0, 0.25, 0); p.rotateY((i * Math.PI) / 3); q.push(p); }
  const tuft = merge(q);
  for (let i = 0; i < tuft.attributes.normal.count; i++) tuft.attributes.normal.setXYZ(i, 0, 1, 0);
  const gmat = new THREE.MeshStandardMaterial({ map: bladeTex, alphaTest: 0.5, roughness: 1 });
  gmat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
       transformed.x += (sin(uTime * 1.7 + ph) + sin(uTime * 0.6 + ph * 0.4) * 0.7) * 0.1 * uv.y;
       transformed.z += cos(uTime * 1.3 + ph) * 0.06 * uv.y;`);
  };
  const clearings = [], carpets = [];
  const clear = (x, z, r) => { clearings.push({ x, z, r }); for (const c of carpets) c.gw.fill(1e9); };
  // A patch of instances that wraps around the player, so grass is only ever drawn nearby.
  function carpet(parts, NG, L, smin, smax, tintLo) {
    const meshes = parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, NG);
      m.frustumCulled = false; m.receiveShadow = true; m.layers.set(1); scene.add(m);
      return m;
    });
    const gx = new Float32Array(NG), gz = new Float32Array(NG), gw = new Float32Array(NG * 2).fill(1e9), gs = new Float32Array(NG), gcol = new THREE.Color();
    for (let i = 0; i < NG; i++) {
      gx[i] = R() * L; gz[i] = R() * L; gs[i] = lerp(smin, smax, R());
      const v = tintLo + R() * (1 - tintLo) * 1.6; gcol.setRGB(v, v, v * 0.82);
      for (const m of meshes) m.setColorAt(i, gcol);
    }
    const mod = (a) => ((a % L) + L) % L;
    carpets.push({ gw, update(px, pz) {
      let dirty = false;
      for (let i = 0; i < NG; i++) {
        const x = px + mod(gx[i] - px) - L / 2, z = pz + mod(gz[i] - pz) - L / 2;
        if (Math.abs(x - gw[i * 2]) < 1 && Math.abs(z - gw[i * 2 + 1]) < 1) continue;
        gw[i * 2] = x; gw[i * 2 + 1] = z; dirty = true;
        const h = getHeight(x, z), ok = h > 1.1 && h < 30 && slopeY(x, z) > 0.84 && !clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
        const s = ok ? gs[i] * smooth(1.1, 2, h) : 0;
        _m.compose(_p.set(x, h - 0.04, z), _q.setFromEuler(_e.set(0, gx[i] * 7, 0)), _s.set(s, s, s));
        for (const m of meshes) m.setMatrixAt(i, _m);
      }
      if (dirty) for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    } });
  }
  carpet([{ geo: tuft, mat: gmat }], 9000, 90, 0.6, 1.4, 0.75);
  carpet(NAT.grass_common_short, 2400, 64, 0.4, 0.75, 0.8);
  carpet(NAT.grass_wispy_short, 450, 56, 0.5, 0.9, 0.8);
  const updateGrass = (px, pz) => { for (const c of carpets) c.update(px, pz); };
  // ---------- time of day ----------
  const sunDir = new THREE.Vector3(), tmp = new THREE.Color();
  const C = (h) => new THREE.Color(h);
  const cDay = C(0xfff1dc), cLow = C(0xff9550), cMoon = C(0x8ea6d6), skyD = C(0xbcd4f0), skyN = C(0x1a2a4a);
  const fogD = C(0xb4c8d6), fogN = C(0x04070d), fogS = C(0xd49468);
  const env = { day: 1, night: 0, storm: 0, sunDir };
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
      sun.intensity = 1.3 * smooth(-0.06, -0.2, y);
      sun.position.copy(focus).add(_p.set(-sunDir.x, Math.max(0.35, -sunDir.y), -sunDir.z).normalize().multiplyScalar(120));
    }
    const st = env.storm;
    sun.intensity *= 1 - st * 0.75;
    sun.target.position.copy(focus);
    hemi.color.copy(skyN).lerp(skyD, day);
    hemi.intensity = lerp(0.75, 1.25, day) * (1 - st * 0.35);
    scene.fog.color.copy(fogN).lerp(fogD, day).lerp(tmp.copy(fogS).multiplyScalar(0.35 + day * 0.65), clamp(1 - Math.abs(y - 0.03) / 0.2, 0, 1) * 0.6);
    scene.fog.color.lerp(tmp.copy(fogStorm).multiplyScalar(0.25 + day * 0.75), st * 0.85);
    scene.fog.density = lerp(0.0055, 0.0032, day) + st * 0.007;
    sky.material.uniforms.turbidity.value = 5 + st * 15;
    sky.material.uniforms.rayleigh.value = 1.6 - st * 1.2;
    stars.material.opacity = 1 - smooth(-0.2, 0.02, y);
    stars.position.copy(camera.position);
    stars.material.opacity *= 1 - st;
    overcast.position.copy(camera.position);
    overcast.visible = st > 0.01;
    overcast.material.opacity = Math.min(1, st * 1.15);
    overcast.material.color.setRGB(0.03, 0.04, 0.055).lerp(tmp.setRGB(0.36, 0.4, 0.44), day);
    water.material.uniforms.sunDirection.value.copy(sunDir);
    water.material.uniforms.sunColor.value.copy(sun.color).multiplyScalar(day * (1 - st));
    renderer.toneMappingExposure = lerp(0.8, 0.66, day);
  }
  function update(dt, px, pz) {
    wind.value += dt;
    water.material.uniforms.time.value += dt * 0.5;
    updateGrass(px, pz);
  }
  return { fields, env, setTime, update, water, clear };
}
