// BOW: procedural self bow (ash stave, hide grip, sinew string that bends to the drawing hand) and flint arrows.
import * as THREE from 'three';

const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7 });
const hide = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.95 });
const shaftMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.8 });
const flintMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.45, metalness: 0.1 });
const featherMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1, side: THREE.DoubleSide });
const stringMat = new THREE.LineBasicMaterial({ color: 0xe6dcc4 });

// The bow lies in its local YZ plane: grip at the origin, limbs along ±Y, the back (and the target) toward +Z,
// the limb tips curving back toward the archer (-Z). The string runs tip-nock-tip.
export const BOW_HALF = 0.72, BOW_TIPZ = -0.16;
export function makeBow() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; pts.push(new THREE.Vector3(0, t * BOW_HALF, BOW_TIPZ * t * t)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const stave = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.016, 6, false), wood);
  // the limbs taper toward the tips
  const pos = stave.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), k = 1 - 0.55 * Math.abs(y) / BOW_HALF;
    const c = curve.getPoint(THREE.MathUtils.clamp((y / BOW_HALF + 1) / 2, 0, 1));
    pos.setX(i, c.x + (pos.getX(i) - c.x) * k); pos.setZ(i, c.z + (pos.getZ(i) - c.z) * k);
  }
  stave.geometry.computeVertexNormals();
  stave.castShadow = true; g.add(stave);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 8), hide); g.add(grip);
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, BOW_HALF, BOW_TIPZ), new THREE.Vector3(0, 0, BOW_TIPZ), new THREE.Vector3(0, -BOW_HALF, BOW_TIPZ)]);
  const str = new THREE.Line(sg, stringMat); str.frustumCulled = false; g.add(str);
  // setNock(v): the string's middle point in bow-local space (null = at rest)
  g.userData.setNock = (v) => {
    const a = sg.attributes.position;
    if (v) a.setXYZ(1, v.x, THREE.MathUtils.clamp(v.y, -0.1, 0.1), Math.min(BOW_TIPZ, v.z)); else a.setXYZ(1, 0, 0, BOW_TIPZ);
    a.needsUpdate = true;
  };
  return g;
}

// An arrow along local +Z: the nock at z = -ARROW_LEN, the flint tip at the origin (so lookAt aims the point).
export const ARROW_LEN = 0.78;
const shaftGeo = new THREE.CylinderGeometry(0.0055, 0.0055, ARROW_LEN - 0.05, 5).rotateX(Math.PI / 2).translate(0, 0, -(ARROW_LEN - 0.05) / 2 - 0.05);
const headGeo = new THREE.ConeGeometry(0.014, 0.06, 4).rotateX(Math.PI / 2).translate(0, 0, -0.03);
const featherGeo = new THREE.PlaneGeometry(0.022, 0.11).rotateX(Math.PI / 2).translate(0, 0.012, -ARROW_LEN + 0.08);
export function makeArrow() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(headGeo, flintMat));
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(featherGeo, featherMat); f.rotation.z = i * Math.PI * 2 / 3; g.add(f); }
  return g;
}

// The quiver: a hide tube with fletchings showing at the top (setCount shows up to 6).
export function makeQuiver() {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 10, 1, true), hide); tube.material.side = THREE.DoubleSide; g.add(tube);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10).rotateX(Math.PI / 2), hide); base.position.y = -0.25; g.add(base);
  const shown = [];
  for (let i = 0; i < 6; i++) {
    const a = makeArrow(); a.rotation.x = -Math.PI / 2;            // point down into the tube
    a.position.set(Math.cos(i * 1.1) * 0.022, 0.25 + 0.12 + (i % 2) * 0.02, Math.sin(i * 1.1) * 0.022);
    g.add(a); shown.push(a);
  }
  g.userData.setCount = (n) => shown.forEach((a, i) => (a.visible = i < Math.ceil(n / 4)));
  return g;
}
