import * as THREE from 'three';
import { rng, part, merge, lumpy, canvasTex, brickTex, boxM } from './util.js';

// WP3 landmarks. Every feature is more than 95 m from home (the origin), so player-built homes never move.
export const LM = {
  meadow: [175, 40], stones: [168, -45], ruins: [125, -140], spring: [-105, -62], peak: [-185, 70], tree: [-62, 80], lake: [-95, 178],
  echoHill: [-150, -120], flintHill: [-40, -215],
};
export const FORDS = [30, -150];                    // z of the two river fords
// Points of interest, shared with the map (WP5). x/z for the fords and caves are filled in by initPOIS.
export const POIS = [
  { id: 'ford', name: 'Ford of Reeds', r: 18, icon: 'ford' },
  { id: 'nford', name: 'North Ford', r: 18, icon: 'ford' },
  { id: 'meadow', name: 'Horse Meadow', x: 175, z: 40, r: 45, icon: 'meadow' },
  { id: 'stones', name: 'Standing Stones', x: 168, z: -45, r: 16, icon: 'stones' },
  { id: 'ruins', name: 'Old Ruins', x: 125, z: -140, r: 16, icon: 'ruins' },
  { id: 'echo', name: 'Echo Hollow', r: 14, icon: 'cave' },
  { id: 'flint', name: 'Flint Deep', r: 14, icon: 'cave' },
  { id: 'spring', name: 'Hot Spring', x: -105, z: -62, r: 12, icon: 'spring' },
  { id: 'peak', name: 'Lookout Peak', x: -185, z: 70, r: 10, icon: 'peak' },
  { id: 'tree', name: 'Great Tree', x: -62, z: 80, r: 14, icon: 'tree' },
  { id: 'lake', name: 'Mirror Lake', x: -95, z: 178, r: 40, icon: 'lake' },
];
export function initPOIS(riverX, caves) {
  const P = (id) => POIS.find((p) => p.id === id);
  Object.assign(P('ford'), { x: riverX(FORDS[0]), z: FORDS[0] });
  Object.assign(P('nford'), { x: riverX(FORDS[1]), z: FORDS[1] });
  for (const k of caves) Object.assign(P(k.id), { x: k.mouth[0], z: k.mouth[1] });
}
// ARC: the Ash People's winter camp is a dynamic POI (S.arc.campPos, chosen once east of Horse Meadow and saved).
export function setCampPOI(pos) {
  let p = POIS.find((q) => q.id === 'camp');
  if (!pos) { if (p) POIS.splice(POIS.indexOf(p), 1); return null; }
  if (!p) POIS.push((p = { id: 'camp', name: 'Ash Camp', r: 22, icon: 'ruins' }));
  p.x = pos[0]; p.z = pos[1];
  return p;
}
// Spots kept free of scattered trees, boulders and grass: [x, z, r]
export const KEEP = [[...LM.tree, 14], [...LM.stones, 13], [...LM.ruins, 11], [...LM.spring, 9], [...LM.peak, 8]];

export function createLandmarks(scene, NAT, getHeight, addCollider, { clear, riverX }) {
  const R = rng(5150);
  const root = new THREE.Group(); root.name = 'landmarks'; scene.add(root);
  const shade = (m) => { m.castShadow = m.receiveShadow = true; return m; };
  const nat = (name, x, y, z, sx, sy = sx, sz = sx, ry = R() * 6.28, rx = 0, rz = 0, matFn) => {
    const g = new THREE.Group();
    for (const p of NAT[name] || []) g.add(shade(new THREE.Mesh(p.geo, matFn ? matFn(p.mat) : p.mat)));
    g.position.set(x, y, z); g.scale.set(sx, sy, sz); g.rotation.set(rx, ry, rz);
    root.add(g); return g;
  };
  for (const [x, z, r] of KEEP) clear(x, z, r * 0.6);

  // ---- Great Tree: a huge autumn oak on its knoll ----
  // Autumn leaves: reuse the twisted trees' leaf material, which nature.js already repaints golden orange.
  const twisted = (NAT.twistedtree_2 || []).find((p) => /Leaves/.test(p.mat.name))?.mat;
  const autumn = (m) => (/Leaves/.test(m.name) && twisted ? twisted : m);
  const [tx, tz] = LM.tree;
  nat('commontree_3', tx, getHeight(tx, tz) - 0.3, tz, 3.2, 3.2, 3.2, 0.6, 0, 0, autumn);
  addCollider({ x: tx, z: tz, r: 2.4 });

  // ---- Standing Stones: a ring of eight, one fallen, a flat stone in the middle ----
  const [sx, sz] = LM.stones;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, x = sx + Math.cos(a) * 9, z = sz + Math.sin(a) * 9, y = getHeight(x, z);
    if (i === 5) nat('rock_medium_2', x, y + 0.5, z, 1.3, 3.8, 1.3, a, 0, Math.PI / 2 - 0.1);
    else { nat('rock_medium_2', x, y - 0.4, z, 1.3, 3.8, 1.3, a, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08); addCollider({ x, z, r: 0.9 }); }
  }
  nat('rock_medium_1', sx, getHeight(sx, sz) - 0.1, sz, 1.6, 0.35, 1.6);

  // ---- Old Ruins: broken brick walls and a fallen beam ----
  const [rx, rz] = LM.ruins, ry = getHeight(rx, rz);
  const brickT = brickTex(), brickM = new THREE.MeshStandardMaterial({ map: brickT, bumpMap: brickT, bumpScale: 1.5, roughness: 0.9, color: 0xbfb0a0 });
  const ruins = new THREE.Group(); ruins.position.set(rx, ry, rz); ruins.rotation.y = 0.4; root.add(ruins);
  const walls = [[5.4, 2.2, 0, -2.6, 0], [3.2, 1.3, -2.7, 0.2, Math.PI / 2], [2.4, 0.6, 2.7, 1.2, Math.PI / 2], [2.2, 1.6, 1.2, 2.6, 0]];
  for (const [w, h, x, z, r] of walls) {
    const m = shade(new THREE.Mesh(boxM(w, h, 0.4), brickM)); m.position.set(x, h / 2 - 0.15, z); m.rotation.y = r; ruins.add(m);
    for (let k = 0; k < 3; k++) { const c = shade(new THREE.Mesh(boxM(0.5, 0.25, 0.3), brickM)); c.position.set(x + (R() - 0.5) * 2, 0.08, z + (R() - 0.5) * 2 + 0.7); c.rotation.y = R() * 3; ruins.add(c); }
  }
  const beam = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.5, 8), new THREE.MeshStandardMaterial({ color: 0x4e3b2a, roughness: 1 })));
  beam.position.set(0.3, 0.9, -0.2); beam.rotation.set(0.1, 0.5, Math.PI / 2 - 0.35); ruins.add(beam);
  ruins.updateMatrixWorld(true);
  const wv = new THREE.Vector3();
  for (const [w, , x, z, r] of walls) for (let t = -w / 2 + 0.3; t <= w / 2; t += 0.8) {
    wv.set(x + Math.cos(r) * t, 0, z - Math.sin(r) * t).applyMatrix4(ruins.matrixWorld);
    addCollider({ x: wv.x, z: wv.z, r: 0.35 });
  }

  // ---- Lookout Peak: a cairn and a tall pole with a hide banner ----
  const [px, pz] = LM.peak, py = getHeight(px, pz);
  const stoneParts = [];
  for (let i = 0; i < 9; i++) { const l = Math.floor(i / 4), a = i * 1.7; stoneParts.push(part(lumpy(new THREE.IcosahedronGeometry(0.45 - l * 0.1, 1), 0.2, 4), 0x8a857c, Math.cos(a) * (0.55 - l * 0.25), 0.3 + l * 0.55, Math.sin(a) * (0.55 - l * 0.25), 0, 0, 0, 1, 0.7, 1)); }
  const cairnG = merge(stoneParts); cairnG.computeVertexNormals();
  const cairn = shade(new THREE.Mesh(cairnG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  cairn.position.set(px + 1.6, py - 0.1, pz); root.add(cairn);
  const pole = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 7), new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 1 })));
  pole.position.set(px, py + 3, pz); root.add(pole);
  const bannerGeo = new THREE.PlaneGeometry(1.8, 1.1, 8, 2); bannerGeo.translate(0.9, 0, 0);
  const banner = shade(new THREE.Mesh(bannerGeo, new THREE.MeshStandardMaterial({ color: 0x8a3a24, roughness: 1, side: THREE.DoubleSide, emissive: 0x2a0c04 })));
  banner.position.set(px + 0.08, py + 5.3, pz); root.add(banner);
  addCollider({ x: px, z: pz, r: 0.25 }); addCollider({ x: px + 1.6, z: pz, r: 0.8 });

  // ---- Hot Spring: warm water in a ring of stones, with steam ----
  const [hx, hz] = LM.spring, basin = getHeight(hx, hz);
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.6, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7fc6c8, transparent: true, opacity: 0.8, roughness: 0.15, depthWrite: false }));
  water.position.set(hx, basin + 0.6, hz); water.renderOrder = 2; root.add(water);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.2, r = 7.3 + R() * 0.6, x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
    nat('rock_medium_' + (1 + (i % 3)), x, getHeight(x, z) - 0.15, z, 0.45 + R() * 0.25);
  }
  const steamT = canvasTex(64, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  const steam = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamT, transparent: true, opacity: 0.22, depthWrite: false, color: 0xeef4f4 }));
    s.userData = { a: R() * 6.28, r: R() * 4.5, t: R() * 6 }; root.add(s); steam.push(s);
  }

  // ---- Fords: stepping stones across, a few stones on the banks ----
  for (const zf of FORDS) {
    const cx = riverX(zf);
    for (let u = -13; u <= 13; u += 2.4) {
      const x = cx + u, z = zf + (R() - 0.5) * 1.6, h = getHeight(x, z);
      if (h > 0.6) continue;
      nat('rock_medium_1', x, Math.max(h, -0.7) - 0.05, z, 0.6, 0.45 + R() * 0.2, 0.6);
    }
    for (let i = 0; i < 6; i++) { const side = i % 2 ? 1 : -1, x = cx + side * (17 + R() * 6), z = zf + (R() - 0.5) * 14; nat('rock_medium_' + (1 + (i % 3)), x, getHeight(x, z) - 0.1, z, 0.6 + R() * 0.4); }
  }

  let time = 0;
  return {
    root, banner,
    spring: { x: hx, z: hz, y: basin, water: basin + 0.6 },
    tree: { x: tx, z: tz }, ruins: { x: rx, z: rz }, stones: { x: sx, z: sz }, peak: { x: px, z: pz, y: py },
    update(dt, cx, cz) {
      time += dt;
      const near = Math.hypot(cx - hx, cz - hz) < 140;
      for (const s of steam) {
        s.visible = near; if (!near) continue;
        const u = s.userData; u.t += dt * 0.35; if (u.t > 6) { u.t = 0; u.a = R() * 6.28; u.r = R() * 4.5; }
        s.position.set(hx + Math.cos(u.a) * u.r + u.t * 0.2, basin + 0.7 + u.t * 0.6, hz + Math.sin(u.a) * u.r);
        s.scale.setScalar(1.2 + u.t * 0.5); s.material.opacity = 0.22 * Math.sin((u.t / 6) * Math.PI);
      }
      if (Math.hypot(cx - px, cz - pz) < 260) { const p = bannerGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(time * 3 + x * 2.5) * 0.12 * x); } p.needsUpdate = true; }
    },
  };
}
