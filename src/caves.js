import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, smooth, part, merge, lumpy, canvasTex } from './util.js';

// WP3 caves: "a chamber in a hillside". The heightfield cannot overhang, so each cave is a flattened disc chamber
// under a hollow rock dome set into the front of its hill, plus a short entrance tube. The hill rises behind and
// around the dome, so from outside only the arched mouth shows.
export const CAVES = [
  { id: 'echo', name: 'Echo Hollow', c: [-138, -108], R: 11, H: 6.5 },
  { id: 'flint', name: 'Flint Deep', c: [-40, -192], R: 13, H: 8 },
];
const TUBE = 3.6, RAMP = 22;
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
      const target = k.floor + Math.max(0, s - (k.R + 5)) * 0.24, m = (1 - smooth(TUBE - 0.2, TUBE + 2.2, lat)) * (1 - smooth(k.R + 5 + RAMP, k.R + 5 + RAMP + 4, s));
      h = lerp(h, Math.min(h, target), m);
    }
  }
  return h;
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
const OCH = '#a0452a';
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
function panelTex(draw) {
  const t = canvasTex(512, (g) => { g.clearRect(0, 0, 512, 512); g.globalAlpha = 0.85; g.fillStyle = g.strokeStyle = OCH; g.lineCap = 'round'; g.save(); g.scale(1, 2); if (draw) draw(g); g.restore(); });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// deps: { NAT, rockTex, addCollider, clear, Field, pmat }
export function createCaves(scene, { NAT, rockTex, addCollider, clear, Field, pmat }) {
  const R = rng(9123);
  const rockM = new THREE.MeshStandardMaterial({ map: rockTex, color: rockTex ? 0x9a9288 : 0x5a554e, roughness: 0.96, side: THREE.DoubleSide });
  const ray = new THREE.Raycaster();
  const panels = [], bats = [], sconces = [], crystals = [], flintNodes = [], ochreNodes = [], beds = [];
  let paintI = 0;
  for (const k of CAVES) {
    const g = new THREE.Group();
    g.name = 'cave-' + k.id;
    scene.add(g);
    const ang = Math.atan2(k.dir[0], k.dir[1]);           // heading of the entrance (x = sin, z = cos)
    const gap = Math.asin(Math.min(0.9, (TUBE + 0.3) / k.R));
    // ---- dome: upper hemisphere with an entrance gap, lumpy, scaled (R, H, R) ----
    const src = new THREE.IcosahedronGeometry(1, 4), sp = src.attributes.position, out = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    for (let i = 0; i < sp.count; i += 3) {
      a.fromBufferAttribute(sp, i); b.fromBufferAttribute(sp, i + 1); c.fromBufferAttribute(sp, i + 2);
      m.copy(a).add(b).add(c).divideScalar(3);
      if (m.y < -0.05) continue;
      const da = Math.abs(((Math.atan2(m.x, m.z) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < gap && m.y < 0.6) continue;
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    let dome = new THREE.BufferGeometry();
    dome.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    lumpy(dome, 0.06, 2.6);
    dome = mergeVertices(dome);
    const dp = dome.attributes.position, uv = new Float32Array(dp.count * 2);
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
      dp.setXYZ(i, x * k.R, Math.max(y, -0.05) * k.H, z * k.R);
      uv[i * 2] = (Math.atan2(z, x) / 6.283) * k.R * 0.7; uv[i * 2 + 1] = y * k.H * 0.12 + Math.hypot(x, z) * 0.1;
    }
    dome.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    dome.computeVertexNormals();
    const domeM = new THREE.Mesh(dome, rockM);
    domeM.position.set(k.x, k.floor - 0.35, k.z);
    domeM.castShadow = domeM.receiveShadow = true;
    g.add(domeM);
    // ---- entrance tube: half cylinder from just inside the rim to the mouth ----
    const len = 7.5, tube = new THREE.CylinderGeometry(TUBE, TUBE, len, 16, 4, true, -Math.PI / 2, Math.PI);
    tube.rotateX(-Math.PI / 2); lumpy(tube, 0.035, 1.3);
    const tubeM = new THREE.Mesh(tube, rockM);
    const s0 = k.R - 1.6, s1 = k.R + 5.9, sm = (s0 + s1) / 2;
    tubeM.position.set(k.x + k.dir[0] * sm, k.floor - 0.3, k.z + k.dir[1] * sm);
    tubeM.rotation.y = ang;
    tubeM.castShadow = tubeM.receiveShadow = true;
    g.add(tubeM);
    g.updateMatrixWorld(true);
    // ---- colliders: the rim (leaving the gap) and both tube sides ----
    const nr = Math.ceil((Math.PI * 2 * (k.R - 0.6)) / 1.3);
    for (let i = 0; i < nr; i++) {
      const t = (i / nr) * Math.PI * 2, da = Math.abs(((t - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < gap * 0.92) continue;
      addCollider({ x: k.x + Math.sin(t) * (k.R - 0.6), z: k.z + Math.cos(t) * (k.R - 0.6), r: 0.7 });
    }
    for (let s = k.R - 0.8; s <= s1 + 0.01; s += 1.3) for (const side of [-1, 1]) {
      const lx = k.dir[1] * side, lz = -k.dir[0] * side;
      addCollider({ x: k.x + k.dir[0] * s + lx * (TUBE - 0.3), z: k.z + k.dir[1] * s + lz * (TUBE - 0.3), r: 0.7 });
    }
    // ---- no grass inside ----
    clear(k.x, k.z, k.R + 3);
    for (let s = k.R; s < k.R + 5 + RAMP; s += 2.5) clear(k.x + k.dir[0] * s, k.z + k.dir[1] * s, TUBE + 1);
    // ---- rock dressing: boulders around the arch and over the dome ----
    const rocks = [];
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, s = k.R + 3 + R() * 5, sc = 1.8 + R() * 0.8, l = TUBE + 0.8 + sc * 1.15;
      rocks.push([k.x + k.dir[0] * s + k.dir[1] * side * l, k.floor + R() * 1.5, k.z + k.dir[1] * s - k.dir[0] * side * l, sc]);
    }
    for (let i = 0; i < 2; i++) { const s = k.R + 2 + i * 2.6, sc = 1.6 + R() * 0.5; rocks.push([k.x + k.dir[0] * s, k.floor + TUBE + sc * 0.9, k.z + k.dir[1] * s, sc]); }
    for (let i = 0; i < 6; i++) {
      const t = ang + Math.PI * 0.35 + R() * Math.PI * 1.3, r = k.R * (0.3 + R() * 0.65), sc = 2.5 + R() * 1.5;
      rocks.push([k.x + Math.sin(t) * r, k.floor + k.H * Math.sqrt(Math.max(0.05, 1 - (r / k.R) ** 2)) + sc * 0.6, k.z + Math.cos(t) * r, sc]);
    }
    rocks.forEach(([x, y, z, s], i) => {
      for (const p of NAT['rock_medium_' + (1 + (i % 3))] || []) {
        const r = new THREE.Mesh(p.geo, p.mat);
        r.position.set(x, y, z); r.scale.set(s, s * (0.7 + R() * 0.4), s); r.rotation.set(R() * 0.4, R() * 6.28, R() * 0.4);
        r.castShadow = r.receiveShadow = true; g.add(r);
      }
    });
    // ---- inside: place things against the wall by casting a ray out from the centre ----
    const wallAt = (t, y) => {
      ray.set(new THREE.Vector3(k.x, k.floor + y, k.z), new THREE.Vector3(Math.sin(t), 0, Math.cos(t)));
      ray.far = k.R * 1.4;
      const hit = ray.intersectObject(domeM, false)[0];
      return hit ? hit.distance : k.R * 0.9;
    };
    const back = ang + Math.PI;
    const panelAt = (t, i, hand) => {
      const y = 2.4, r = wallAt(t, y) - 0.32;
      const tex = panelTex(hand ? null : PAINT[i]);
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      pm.position.set(k.x + Math.sin(t) * r, k.floor + y, k.z + Math.cos(t) * r);
      pm.lookAt(k.x, k.floor + y, k.z);
      g.add(pm);
      panels.push({ cave: k.id, i, hand: !!hand, x: pm.position.x, z: pm.position.z, y: pm.position.y, tex, mesh: pm });
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
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.scale.set(1, 1.8, 1); flame.position.set(sx, k.floor + 2.15, sz); flame.visible = false; g.add(flame);
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
    if (k.id === 'echo') {
      const bt = back - 1.6, br = k.R * 0.55, bx = k.x + Math.sin(bt) * br, bz = k.z + Math.cos(bt) * br;
      const perp = [Math.cos(bt), -Math.sin(bt)];
      const bed = new THREE.Group();
      const hideM = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }), strawM = new THREE.MeshStandardMaterial({ color: 0xa8955a, roughness: 1 });
      const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), strawM); pile.scale.set(1.6, 0.14, 1.2); bed.add(pile);
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 1.0), hideM); h1.position.set(0, 0.15, -0.5); h1.rotation.y = 0.08; bed.add(h1);
      const h2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 1.0), hideM.clone()); h2.material.color.set(0x6a4a30); h2.position.set(0.05, 0.16, 0.5); h2.rotation.y = -0.06; bed.add(h2);
      bed.position.set(bx, k.floor, bz); bed.rotation.y = bt + Math.PI / 2;
      bed.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      g.add(bed);
      beds.push({ cave: k.id, x: bx, z: bz, y: k.floor + 0.22, rot: bt, pts: [[bx + perp[0] * 0.5, bz + perp[1] * 0.5], [bx - perp[0] * 0.5, bz - perp[1] * 0.5]] });
    }
    // ---- Flint Deep: glowing crystal clusters and bats ----
    if (k.id === 'flint') {
      const cm = new THREE.MeshStandardMaterial({ color: 0x6fd3ff, emissive: 0x2aa8e0, emissiveIntensity: 1.6, roughness: 0.3 });
      for (let i = 0; i < 8; i++) {
        const t = back + (i / 7 - 0.5) * Math.PI * 1.55, r = wallAt(t, 0.6) - 0.7, parts = [], nc = 3 + (R() * 3 | 0);
        for (let j = 0; j < nc; j++) { const hh = 0.5 + R() * 0.9; parts.push(part(new THREE.ConeGeometry(0.09 + R() * 0.08, hh, 5), 0xffffff, (R() - 0.5) * 0.5, hh / 2, (R() - 0.5) * 0.5, (R() - 0.5) * 0.9, 0, (R() - 0.5) * 0.9)); }
        const cr = new THREE.Mesh(merge(parts), cm);
        cr.position.set(k.x + Math.sin(t) * r, k.floor, k.z + Math.cos(t) * r);
        g.add(cr); crystals.push(cr);
      }
      const bm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.18), new THREE.MeshBasicMaterial({ color: 0x14100e, side: THREE.DoubleSide, fog: true }), 30);
      bm.frustumCulled = false; scene.add(bm);
      const list = Array.from({ length: 30 }, () => ({ a: R() * 6.283, r: k.R * (0.25 + R() * 0.45), y: k.floor + k.H * (0.62 + R() * 0.2), w: 0.5 + R() * 0.7, ph: R() * 6.28 }));
      bats.push({ cave: k, mesh: bm, list, burst: -1, gone: false });
    }
  }
  // Flint and ochre are ordinary resource fields (kinds 'flint' and 'ochre'); world.js appends them after the others.
  const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
  const fl = (g) => { g.computeVertexNormals(); return g; };
  const flintGeo = fl(merge([
    part(lumpy(ico(0.24), 0.25, 7), 0x3b3e47, 0, 0.1, 0, 0, 0, 0, 1.2, 0.6, 0.9),
    part(lumpy(ico(0.16), 0.2, 9), 0x50555f, 0.25, 0.08, 0.12, 0, 0, 0, 1, 0.7, 1),
    part(new THREE.TetrahedronGeometry(0.1), 0xb8bcc4, -0.15, 0.2, 0.05),
  ]));
  const ochreGeo = fl(merge([
    part(lumpy(ico(0.5, 2), 0.16, 3), 0x9a3e24, 0, 0.05, 0, 0, 0, 0, 1.1, 0.35, 1),
    part(lumpy(ico(0.2), 0.2, 6), 0xb5532e, 0.3, 0.18, 0.15), part(lumpy(ico(0.16), 0.2, 6), 0x7e3019, -0.28, 0.15, -0.2),
  ]));
  const flintF = new Field(scene, 'flint', [{ geo: flintGeo, mat: pmat }], flintNodes, { tint: 0.1 });
  const ochreF = new Field(scene, 'ochre', [{ geo: ochreGeo, mat: pmat }], ochreNodes, { tint: 0.1 });

  const _o = new THREE.Object3D();
  let time = 0;
  function update(dt, px, pz) {
    time += dt;
    for (const s of sconces) if (s.on) { s.flame.scale.set(1 + Math.sin(time * 11) * 0.15, 1.8 + Math.sin(time * 15) * 0.3, 1); s.light.intensity = 4 + Math.sin(time * 13) * 0.6 + Math.sin(time * 31) * 0.3; }
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
  const byId = (id) => CAVES.find((k) => k.id === id);
  return {
    list: CAVES, panels, beds, sconces, bats, crystals, flintF, ochreF, update,
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
    byId,
  };
}
