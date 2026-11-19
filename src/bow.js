// BOW: procedural self bow (ash stave, hide grip, sinew string that bends to the drawing hand) and flint arrows.
import * as THREE from 'three';

const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7 });
const hide = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.95 });
const shaftMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.8 });
const flintMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.45, metalness: 0.1 });
const featherMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1, side: THREE.DoubleSide });
const stringMat = new THREE.LineBasicMaterial({ color: 0xe6dcc4 });   // the path only (hidden): BOW-A3 draws it lit, below
const strMeshMat = new THREE.MeshStandardMaterial({ color: 0xcfc2a2, roughness: 0.9 });   // BOW-FPP: the view model's string
const strGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1, 5, 1, true), UP = new THREE.Vector3(0, 1, 0);
// BOW-A3 (verifier A3): the third-person string was a LineBasicMaterial, unlit, so it glowed white at night and indoors.
// It is now two thin lit tubes like the view model's (a touch thicker, so it still reads at third-person distance).
const strGeoT = new THREE.CylinderGeometry(0.0021, 0.0021, 1, 4, 1, true);
function stringTubes(g, geo) {
  const seg = [0, 1].map(() => { const m = new THREE.Mesh(geo, strMeshMat); m.frustumCulled = false; g.add(m); return m; });
  const tips = [new THREE.Vector3(0, BOW_HALF, BOW_TIPZ), new THREE.Vector3(0, -BOW_HALF, BOW_TIPZ)], d = new THREE.Vector3();
  return (n) => seg.forEach((m, i) => { d.subVectors(tips[i], n); m.position.copy(n).addScaledVector(d, 0.5); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(UP, d.normalize()); });
}

// The bow lies in its local YZ plane: grip at the origin, limbs along ±Y, the back (and the target) toward +Z,
// the limb tips curving back toward the archer (-Z). The string runs tip-nock-tip.
export const BOW_HALF = 0.72, BOW_TIPZ = -0.16;
// opts.thick (the first-person view model): the string is two thin tubes, so it reads at arm's length instead of a
// one-pixel line.
export function makeBow(opts = {}) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; pts.push(new THREE.Vector3(0, t * BOW_HALF, BOW_TIPZ * t * t)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const stave = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.022, 8, false), wood);
  // the limbs taper toward the tips
  const pos = stave.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), k = 1 - 0.55 * Math.abs(y) / BOW_HALF;
    const c = curve.getPoint(THREE.MathUtils.clamp((y / BOW_HALF + 1) / 2, 0, 1));
    pos.setX(i, c.x + (pos.getX(i) - c.x) * k); pos.setZ(i, c.z + (pos.getZ(i) - c.z) * k);
  }
  stave.geometry.computeVertexNormals();
  stave.castShadow = true; g.add(stave);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.13, 10), hide); g.add(grip);
  if (opts.thick) {                                   // BOW-FPP
    const seg = [0, 1].map(() => { const m = new THREE.Mesh(strGeo, strMeshMat); m.frustumCulled = false; g.add(m); return m; });
    const tips = [new THREE.Vector3(0, BOW_HALF, BOW_TIPZ), new THREE.Vector3(0, -BOW_HALF, BOW_TIPZ)], n = new THREE.Vector3(), d = new THREE.Vector3();
    g.userData.setNock = (v) => {
      if (v) n.set(v.x, THREE.MathUtils.clamp(v.y, -0.1, 0.1), Math.min(BOW_TIPZ, v.z)); else n.set(0, 0, BOW_TIPZ);
      seg.forEach((m, i) => { d.subVectors(tips[i], n); m.position.copy(n).addScaledVector(d, 0.5); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(UP, d.normalize()); });
    };
    g.userData.setNock(null);
    return g;
  }
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, BOW_HALF, BOW_TIPZ), new THREE.Vector3(0, 0, BOW_TIPZ), new THREE.Vector3(0, -BOW_HALF, BOW_TIPZ)]);
  const str = new THREE.Line(sg, stringMat); str.frustumCulled = false; str.visible = false; g.add(str);   // BOW-A3: the path (read by the clearance tests), not drawn
  const tubes = stringTubes(g, strGeoT), nk = new THREE.Vector3();
  // setNock(v): the string's middle point in bow-local space (null = at rest)
  g.userData.setNock = (v) => {
    const a = sg.attributes.position;
    if (v) a.setXYZ(1, v.x, THREE.MathUtils.clamp(v.y, -0.1, 0.1), Math.min(BOW_TIPZ, v.z)); else a.setXYZ(1, 0, 0, BOW_TIPZ);
    a.needsUpdate = true; tubes(nk.set(a.getX(1), a.getY(1), a.getZ(1)));
  };
  g.userData.setNock(null);
  return g;
}

// An arrow along local +Z: the nock at z = -ARROW_LEN, the flint tip at the origin (so lookAt aims the point).
export const ARROW_LEN = 0.78;
const shaftGeo = new THREE.CylinderGeometry(0.0055, 0.0055, ARROW_LEN - 0.05, 5).rotateX(Math.PI / 2).translate(0, 0, -(ARROW_LEN - 0.05) / 2 - 0.05);
const headGeo = new THREE.ConeGeometry(0.014, 0.06, 4).rotateX(Math.PI / 2).translate(0, 0, -0.03);
// BOW-A3 (verifier A3: "the fletching reads as flat grey cards"): three cut feather vanes, each a cut-out (alpha) of a
// barred wild feather: low at the front, rising to a squared-off back, the quill along the shaft, the barbs slanting
// back with dark bars across them. One canvas texture for every arrow; a sinew binding at each end of the fletching.
let featherTex = null;
function featherMap() {
  if (featherTex) return featherTex;
  const W = 128, H = 32, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  // u (x): 0 = the back of the vane (nock end) .. 1 = its front; v (y): the quill at the bottom (canvas y = H)
  x.beginPath(); x.moveTo(0, H);
  for (let i = 0; i <= 32; i++) { const u = i / 32, hgt = (H - 4) * (u < 0.05 ? 0.78 : Math.pow(Math.max(0, 1 - u) / 0.95, 0.55)); x.lineTo(u * W, H - 1 - hgt + (i % 2) * 1.2); }
  x.lineTo(W, H); x.closePath(); x.save(); x.clip();
  const grd = x.createLinearGradient(0, H, 0, 0); grd.addColorStop(0, '#6e604e'); grd.addColorStop(1, '#a8987e'); x.fillStyle = grd; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(40,30,22,0.75)'; for (let k = 0; k < 6; k++) { const u0 = 6 + k * 21; x.beginPath(); x.moveTo(u0, H); x.lineTo(u0 + 8, H); x.lineTo(u0 + 8 + 10, 0); x.lineTo(u0 + 10, 0); x.closePath(); x.fill(); }   // bars
  x.strokeStyle = 'rgba(30,24,18,0.35)'; x.lineWidth = 0.7; for (let i = -40; i < W; i += 3) { x.beginPath(); x.moveTo(i, H); x.lineTo(i + 14, 0); x.stroke(); }   // barbs, slanting back
  x.restore(); x.fillStyle = '#d8ccb2'; x.fillRect(0, H - 2, W, 2);   // the quill
  featherTex = new THREE.CanvasTexture(c); featherTex.colorSpace = THREE.SRGBColorSpace; featherTex.anisotropy = 4;
  return featherTex;
}
const featherGeo = new THREE.PlaneGeometry(0.1, 0.0155).translate(0, 0.0155 / 2 + 0.004, 0).rotateY(-Math.PI / 2).translate(0, 0, -ARROW_LEN + 0.075);
const bindGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 6).rotateX(Math.PI / 2), bindMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
export function makeArrow() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(headGeo, flintMat));
  if (!featherMat.map) { featherMat.map = featherMap(); featherMat.alphaTest = 0.5; featherMat.color.set(0xffffff); featherMat.needsUpdate = true; }
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(featherGeo, featherMat); f.rotation.z = i * Math.PI * 2 / 3; g.add(f); }
  for (const z of [-ARROW_LEN + 0.022, -ARROW_LEN + 0.13]) { const b = new THREE.Mesh(bindGeo, bindMat); b.position.z = z; g.add(b); }
  const hb = new THREE.Mesh(bindGeo, bindMat); hb.position.z = -0.065; hb.scale.set(1.1, 1.1, 1.4); g.add(hb);   // the point's binding
  return g;
}

// The quiver: a hide tube (0.6 m) with the arrows point-down inside, only the fletchings showing above the rim
// (setCount shows up to 6 of them).
export function makeQuiver() {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.6, 12, 1, true), hide.clone()); tube.material.side = THREE.DoubleSide; g.add(tube);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.042, 12).rotateX(Math.PI / 2), hide); base.position.y = -0.3; g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 4, 16).rotateX(Math.PI / 2), wood); rim.position.y = 0.3; g.add(rim);
  const shown = [];
  for (let i = 0; i < 6; i++) {
    const a = makeArrow(); a.rotation.x = Math.PI / 2;               // local +Z (the point) straight down into the tube
    a.position.set(Math.cos(i * 1.05) * 0.024, -0.27 + (i % 3) * 0.015, Math.sin(i * 1.05) * 0.024);   // nock ~0.2 m above the rim
    g.add(a); shown.push(a);
  }
  g.userData.setCount = (n) => shown.forEach((a, i) => (a.visible = i < Math.min(6, Math.ceil(n / 4))));
  return g;
}
