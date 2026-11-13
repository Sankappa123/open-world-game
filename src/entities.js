import * as THREE from 'three';
import { rng, mat, part, merge, lumpy, canvasTex, streakTex, brickTex, boxM } from './util.js';
import { NAT } from './nature.js';

const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 5, 12);
const cyl = (a, b, h, n = 10) => new THREE.CylinderGeometry(a, b, h, n);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
function mesh(parent, geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true;
  parent.add(o);
  return o;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

const woodM = mat(0x6a4a2c, 0.9), stoneM = mat(0x8a867e, 0.95), darkM = mat(0x0c0a08, 1);

// WPN: both tools have a flint variant (darker, keener head). userData.setFlint(on) swaps it on an existing mesh.
const flintM = mat(0x3b3e45, 0.55), lashM = mat(0x8a6a44, 1), wrapM = mat(0x4a3424, 1);
const spearTip = new THREE.ConeGeometry(0.035, 0.2, 5), flintTip = new THREE.ConeGeometry(0.04, 0.24, 6);
export function makeSpear({ flint = false } = {}) {
  const g = new THREE.Group();
  mesh(g, cyl(0.016, 0.02, 1.9, 6), woodM).rotation.x = Math.PI / 2;
  const tip = mesh(g, spearTip, stoneM, 0, 0, 1.03);
  tip.rotation.x = Math.PI / 2;
  mesh(g, cyl(0.024, 0.024, 0.07, 7), lashM, 0, 0, 0.9).rotation.x = Math.PI / 2;    // lashing under the head
  mesh(g, cyl(0.023, 0.023, 0.16, 7), wrapM, 0, 0, -0.35).rotation.x = Math.PI / 2;  // hide grip where the fist goes
  g.userData.setFlint = (on) => { tip.geometry = on ? flintTip : spearTip; tip.material = on ? flintM : stoneM; tip.position.z = on ? 1.05 : 1.03; g.userData.flint = !!on; };
  g.userData.setFlint(flint);
  return g;
}
export function makeAxe({ flint = false } = {}) {
  const g = new THREE.Group();
  mesh(g, cyl(0.018, 0.022, 0.6, 6), woodM, 0, 0, 0.2).rotation.x = Math.PI / 2;
  const head = mesh(g, new THREE.BoxGeometry(0.04, 0.2, 0.11), stoneM, 0, -0.04, 0.46);
  mesh(g, cyl(0.026, 0.026, 0.05, 7), lashM, 0, 0, 0.385).rotation.x = Math.PI / 2;
  g.userData.setFlint = (on) => { head.material = on ? flintM : stoneM; head.scale.set(on ? 0.85 : 1, on ? 1.12 : 1, 1); g.userData.flint = !!on; };
  g.userData.setFlint(flint);
  return g;
}

// A hand torch: a stick with a resin-soaked fibre head. Held like the spear (along +z). The light is not a
// child of the torch: the caller keeps it in the scene and only dims it, so it still shines in first person
// (when the body is hidden) and lighting it never forces every material to recompile.
export function makeTorch() {
  const g = new THREE.Group();
  mesh(g, cyl(0.02, 0.026, 0.62, 6), woodM, 0, 0, 0.16).rotation.x = Math.PI / 2;
  mesh(g, cyl(0.045, 0.035, 0.12, 7), mat(0x3a2a1a, 1), 0, 0, 0.46).rotation.x = Math.PI / 2;
  const fl = new THREE.Group(); fl.position.z = 0.56; g.add(fl);
  const flames = [0, 1].map((i) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.075 - i * 0.025, 8, 6), new THREE.MeshBasicMaterial({ color: i ? 0xffd66a : 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    f.scale.set(1, 1, 1.9); f.position.z = 0.03 + i * 0.03; fl.add(f); return f;
  });
  const light = new THREE.PointLight(0xff8f40, 0, 16, 1.6);
  let t = 0;
  return { root: g, light, flame: fl, set lit(on) { fl.visible = on; light.intensity = on ? 9 : 0; },
    update(dt) { t += dt; flames.forEach((f, i) => f.scale.set(1 + Math.sin(t * 12 + i) * 0.2, 1 + Math.cos(t * 9 + i) * 0.2, 1.9 + Math.sin(t * 15 + i * 2) * 0.5)); if (fl.visible) light.intensity = 8.5 + Math.sin(t * 13) * 1.5 + Math.sin(t * 29) * 1; } };
}

// WPN: Sena's woven carry basket (worn on the back). Origin at its centre; the open top is +y, straps on the -z side
// (against the back) run up and forward over the shoulders.
export function makeCarryBasket() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.32, 14, 1, true), reedM.clone());
  wall.material.side = THREE.DoubleSide;
  wall.castShadow = true; g.add(wall);
  mesh(g, cyl(0.14, 0.14, 0.02, 14), reedM, 0, -0.15, 0);
  for (const y of [-0.1, 0, 0.1]) mesh(g, new THREE.TorusGeometry(0.155 + y * 0.09, 0.008, 4, 18), lashM, 0, y, 0).rotation.x = Math.PI / 2;   // woven bands
  mesh(g, new THREE.TorusGeometry(0.172, 0.014, 5, 18), lashM, 0, 0.16, 0).rotation.x = Math.PI / 2;                                             // rim
  for (let i = 0; i < 5; i++) { const s = mesh(g, cyl(0.008, 0.008, 0.3, 4), woodM, -0.08 + i * 0.04, 0.2, -0.03 + (i % 2) * 0.05); s.rotation.z = (i - 2) * 0.12; }   // sticks poking out
  for (const x of [-0.08, 0.08]) {                                   // straps: up the side against the back, then over the shoulders
    const st = mesh(g, new THREE.BoxGeometry(0.035, 0.42, 0.012), wrapM, x, 0.12, 0.17); st.rotation.x = 0.3;
  }
  return g;
}

// ---------- people ----------
export function makeHuman({ female = false, skin = 0xc08a62, hair = 0x1a110a, cloth = 0x8a7a63, scale = 1 } = {}) {
  const root = new THREE.Group();
  const sk = mat(skin, 0.7), cl = mat(cloth, 1), hr = mat(hair, 0.85);
  const W = female ? 0.88 : 1;
  const body = pivot(root, 0, 0.95, 0);
  if (female) {
    mesh(body, cyl(0.15, 0.23, 0.62, 14), cl, 0, -0.2, 0);
    mesh(body, cap(0.15, 0.3), cl, 0, 0.34, 0).scale.z = 0.72;
  } else {
    mesh(body, cyl(0.175, 0.205, 0.36, 14), cl, 0, -0.07, 0).scale.z = 0.8;
    mesh(body, cap(0.17, 0.3), sk, 0, 0.36, 0).scale.z = 0.7;
    const sash = mesh(body, cyl(0.178, 0.185, 0.34, 14), cl, 0, 0.26, 0);
    sash.scale.z = 0.76;
    const strap = mesh(body, cap(0.035, 0.52), cl, 0.02, 0.42, 0.105);
    strap.rotation.z = 0.75; strap.scale.z = 0.5;
  }
  mesh(body, cyl(0.05, 0.06, 0.12, 8), sk, 0, 0.63, 0);
  const head = pivot(body, 0, 0.77, 0);
  mesh(head, sph(0.112, 18, 14), sk).scale.set(0.9, 1.1, 0.98);
  const hairCap = mesh(head, new THREE.SphereGeometry(0.122, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), hr, 0, 0.015, -0.014);
  hairCap.scale.set(0.95, 1.08, 1.02);
  mesh(head, sph(0.016, 6, 5), darkM, -0.04, 0.01, 0.098);
  mesh(head, sph(0.016, 6, 5), darkM, 0.04, 0.01, 0.098);
  mesh(head, sph(0.02, 6, 5), sk, 0, -0.022, 0.112).scale.y = 1.4;
  if (female) {
    mesh(head, cap(0.1, 0.26), hr, 0, -0.15, -0.075).scale.z = 0.5;
  } else {
    mesh(head, sph(0.085, 10, 8), hr, 0, -0.085, 0.035).scale.set(0.95, 0.75, 0.8);
  }
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = pivot(body, s * 0.215 * W, 0.53, 0);
    mesh(sh, cap(0.046, 0.22), sk, 0, -0.14, 0);
    mesh(sh, sph(0.058, 8, 6), sk, 0, 0, 0);
    const el = pivot(sh, 0, -0.29, 0);
    mesh(el, sph(0.043, 8, 6), sk);
    mesh(el, cap(0.038, 0.2), sk, 0, -0.13, 0);
    mesh(el, sph(0.046, 8, 6), sk, 0, -0.27, 0);
    arms.push({ sh, el });
    const hip = pivot(body, s * 0.09 * W, 0, 0);
    mesh(hip, cap(0.078, 0.3), sk, 0, -0.22, 0);
    const kn = pivot(hip, 0, -0.45, 0);
    mesh(kn, sph(0.062, 8, 6), sk);
    mesh(kn, cap(0.058, 0.3), sk, 0, -0.21, 0);
    mesh(kn, new THREE.BoxGeometry(0.09, 0.06, 0.23), cl, 0, -0.44, 0.05);
    legs.push({ hip, kn });
  }
  const hand = pivot(arms[1].el, 0, -0.27, 0);
  const spear = makeSpear(), axe = makeAxe();
  spear.position.z = 0.25; spear.visible = axe.visible = false;
  hand.add(spear, axe);
  root.scale.setScalar(scale * (female ? 0.94 : 1));

  const h = { root, spear, axe, phase: 0, act: 0, crouch: 0, amp: 0 };
  h.swing = () => { h.act = 1; };
  h.animate = (dt, speed, crouch = false) => {
    const tAmp = Math.min(1, speed / 5) * 0.75 + (speed > 0.1 ? 0.2 : 0);
    h.amp += (tAmp - h.amp) * Math.min(1, dt * 10);
    h.crouch += ((crouch ? 1 : 0) - h.crouch) * Math.min(1, dt * 8);
    h.phase += dt * (speed > 0.1 ? 5 + speed * 1.5 : 1.2);
    const s = Math.sin(h.phase), a = h.amp, c = h.crouch;
    legs.forEach((l, i) => {
      const sg = i ? -1 : 1;
      l.hip.rotation.x = -s * sg * a - c * 0.75;
      l.kn.rotation.x = Math.max(0, Math.sin(h.phase * 1 + (i ? Math.PI : 0) - 1.1)) * a * 1.4 + c * 1.3;
    });
    arms.forEach((ar, i) => {
      const sg = i ? -1 : 1;
      ar.sh.rotation.x = s * sg * a * 0.8;
      ar.sh.rotation.z = (i ? 1 : -1) * 0.07;
      ar.el.rotation.x = -(0.15 + a * 0.6);
    });
    if (h.spear.visible && h.act <= 0) { arms[1].sh.rotation.x = -0.25; arms[1].el.rotation.x = -1.2; h.spear.rotation.x = -0.25; }
    if (h.act > 0) {
      h.act = Math.max(0, h.act - dt * 2.6);
      const k = Math.sin(h.act * Math.PI);
      arms[1].sh.rotation.x = -2.6 * k + 0.5 * (1 - k) * h.act;
      arms[1].el.rotation.x = -0.9 * k;
    }
    body.position.y = 0.95 + Math.abs(Math.cos(h.phase)) * 0.035 * a - c * 0.2 + (speed < 0.1 ? Math.sin(h.phase) * 0.004 : 0);
    body.rotation.x = a * 0.09 + c * 0.42;
    head.rotation.x = -c * 0.35;
  };
  return h;
}

// ---------- deer ----------
const deerBody = (() => {
  const tan = 0x8b6a45, dark = 0x5c452e, pale = 0xcdb999;
  return (antlers) => merge([
    part(cap(0.27, 0.72), tan, 0, 0.98, 0, Math.PI / 2),
    part(cap(0.2, 0.5), pale, 0, 0.9, 0, Math.PI / 2, 0, 0, 1, 1, 0.9),
    part(cyl(0.085, 0.14, 0.58, 8), tan, 0, 1.28, 0.58, 0.62),
    part(sph(0.13), tan, 0, 1.55, 0.78, 0.2, 0, 0, 0.72, 0.78, 1.25),
    part(sph(0.06), dark, 0, 1.51, 0.94, 0, 0, 0, 0.8, 0.7, 1),
    part(new THREE.ConeGeometry(0.04, 0.14, 5), tan, 0.1, 1.67, 0.7, 0, 0, -0.7),
    part(new THREE.ConeGeometry(0.04, 0.14, 5), tan, -0.1, 1.67, 0.7, 0, 0, 0.7),
    part(sph(0.07), pale, 0, 1.08, -0.62),
    ...(antlers ? [-1, 1].flatMap((s) => [
      part(cyl(0.012, 0.02, 0.42, 4), 0xd8c9a8, s * 0.11, 1.84, 0.68, -0.25, 0, -s * 0.45),
      part(cyl(0.008, 0.012, 0.22, 4), 0xd8c9a8, s * 0.2, 1.95, 0.75, 0.9, 0, -s * 0.2),
      part(cyl(0.008, 0.012, 0.2, 4), 0xd8c9a8, s * 0.15, 1.82, 0.78, 1.1, 0, -s * 0.3),
    ]) : []),
  ]);
})();
const deerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const deerLeg = mat(0x5c452e, 0.9);
let deerGeos;
export function makeDeer(i) {
  deerGeos ||= [deerBody(true), deerBody(false)];
  const root = new THREE.Group(), inner = pivot(root, 0, 0, 0);
  mesh(inner, deerGeos[i % 2], deerMat);
  const legs = [];
  for (const [x, z] of [[-0.14, 0.36], [0.14, 0.36], [-0.14, -0.38], [0.14, -0.38]]) {
    const p = pivot(inner, x, 0.86, z);
    mesh(p, cyl(0.045, 0.024, 0.86, 6), deerLeg, 0, -0.43, 0);
    legs.push(p);
  }
  const s = i % 2 ? 0.9 : 1.05;
  root.scale.setScalar(s);
  return { root, inner, legs, phase: i, state: 'graze', timer: 0, dir: i, speed: 0, fall: 0 };
}

// ---------- structures ----------
const brickT = brickTex();
const brickM = new THREE.MeshStandardMaterial({ map: brickT, bumpMap: brickT, bumpScale: 1.5, roughness: 0.88 });
const thatchT = streakTex(42, 42, 46), plankT = streakTex(28, 38, 26), tileT = streakTex(14, 48, 34, false, 500);
const thatchM = new THREE.MeshStandardMaterial({ map: thatchT, bumpMap: thatchT, bumpScale: 2, roughness: 1 });
const plankM = new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.9 });
const tileM = new THREE.MeshStandardMaterial({ map: tileT, bumpMap: tileT, bumpScale: 2, roughness: 0.8 });
const soilM = mat(0x33241a, 1), clayM = mat(0x8d5a3d, 0.95);
export const glowM = new THREE.MeshStandardMaterial({ color: 0x1a120a, emissive: 0xffa24a, emissiveIntensity: 0, roughness: 1 });
const rockGeo = (() => { const g = part(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.2, 3), 0xffffff); g.computeVertexNormals(); return g; })();
const smokeT = canvasTex(64, (g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(200,200,200,0.55)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
});
const flameM = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameM2 = flameM.clone(); flameM2.color.set(0xffd66a);
// WP2 materials: open hut wall/roof seen from inside, bedding, embers, woven basket
const plankDM = plankM.clone(); plankDM.side = THREE.DoubleSide;
const thatchDM = thatchM.clone(); thatchDM.side = THREE.DoubleSide;
const reedM = mat(0xb8a46a, 1), hideM = mat(0x7a5236, 0.95), linenM = mat(0xd8ccb0, 1), fiberM = mat(0xb89a5e, 1), hayM = mat(0xd9bf5a, 1), meatM = mat(0x6e2f22, 0.8), driedM = mat(0x4a2618, 0.9);
const emberM = new THREE.MeshStandardMaterial({ color: 0x2a140a, emissive: 0xff6a20, emissiveIntensity: 1.6, roughness: 1 });

function smoke(g, y, n = 8, spread = 1) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.t = i / n; g.add(s); list.push(s);
  }
  return (dt, on = 1) => {
    for (const s of list) {
      const u = (s.userData.t = (s.userData.t + dt * 0.16) % 1);
      s.position.set(Math.sin(u * 5 + s.id) * 0.3 * u * spread + u * u * 1.4, y + u * 4.5 * spread, Math.cos(u * 4 + s.id) * 0.25 * u);
      s.scale.setScalar(0.4 + u * 1.9 * spread);
      s.material.opacity = Math.sin(u * Math.PI) * 0.4 * on;
    }
  };
}

export const BUILD = {
  fire(g) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283, r = mesh(g, rockGeo, stoneM, Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
      r.scale.set(0.17 + (i % 3) * 0.03, 0.13, 0.16); r.rotation.y = i * 2;
    }
    for (let i = 0; i < 5; i++) {
      const l = mesh(g, cyl(0.055, 0.065, 0.85, 6), woodM, 0, 0.2, 0);
      l.rotation.set(0.95, (i / 5) * 6.283, 0, 'YXZ');
      l.position.set(Math.sin((i / 5) * 6.283) * 0.2, 0.26, Math.cos((i / 5) * 6.283) * 0.2);
    }
    mesh(g, cyl(0.5, 0.5, 0.04, 12), mat(0x161310, 1), 0, 0.02, 0).castShadow = false;
    // Two log benches at local x = ±1.6 (main.js fireSeats sits Aro and Sena here), top at 0.45 m, on stone chocks.
    for (const sx of [-1.6, 1.6]) {
      mesh(g, cyl(0.18, 0.18, 1.3, 8), woodM, sx, 0.27, 0).rotation.x = Math.PI / 2;
      for (const sz of [-0.42, 0.42]) mesh(g, rockGeo, stoneM, sx, 0.06, sz).scale.set(0.16, 0.1, 0.13);
    }
    const flames = [0, 1, 2, 3].map((i) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.03, 0.75 - i * 0.1, 7, 1, true), i % 2 ? flameM2 : flameM);
      f.position.set(Math.sin(i * 2) * 0.1, 0.55, Math.cos(i * 2) * 0.1); g.add(f); return f;
    });
    const light = new THREE.PointLight(0xff8336, 30, 26, 1.6);
    light.position.y = 1; g.add(light);
    const sm = smoke(g, 1.1);
    let t = 0;
    return { radius: 0.8, label: 'Campfire', update(dt) {
      t += dt; sm(dt);
      flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 9 + i * 2) * 0.2, 1 + Math.sin(t * 13 + i) * 0.28, 1 + Math.cos(t * 8 + i) * 0.2); f.rotation.y = t * (i + 1); });
      light.intensity = 28 + Math.sin(t * 11) * 5 + Math.sin(t * 23) * 4;
    } };
  },
  hut(g) {
    // WP2: open doorway (a 50° gap in the wall facing +Z) and a reed sleeping mat inside.
    mesh(g, new THREE.CylinderGeometry(2, 2.05, 1.6, 18, 1, true, 0.436, 6.283 - 0.873), plankDM, 0, 0.6, 0);
    mesh(g, new THREE.ConeGeometry(2.75, 2.5, 18, 1, true), thatchDM, 0, 2.6, 0);   // open base: seen from inside
    mesh(g, new THREE.ConeGeometry(0.5, 0.5, 8), plankM, 0, 3.95, 0);
    for (const s of [-1, 1]) mesh(g, cyl(0.07, 0.08, 1.7, 6), woodM, s * 0.82, 0.65, 1.8);
    mesh(g, cyl(0.07, 0.07, 1.8, 6), woodM, 0, 1.48, 1.8).rotation.z = Math.PI / 2;
    mesh(g, cyl(1.97, 1.97, 0.06, 18), soilM, 0, 0.01, 0).castShadow = false;                 // packed earth floor
    mesh(g, new THREE.BoxGeometry(1.4, 0.06, 2), reedM, 0, 0.05, -0.4).castShadow = false;
    const bedHide = mesh(g, new THREE.BoxGeometry(1.36, 0.07, 1.2), hideM, 0, 0.1, 0.0);   // RST: becomes the blanket while they sleep
    for (const x of [-0.35, 0.35]) mesh(g, new THREE.BoxGeometry(0.42, 0.1, 0.26), reedM, x, 0.12, -1.22);
    // bedPts: where each sleeper's feet go (local); heads point to -Z. camPt/lookPt: the cinematic rest shot.
    return { radius: 2.3, label: 'Thatch hut', bedPts: [[-0.35, 0.14, 0.42], [0.35, 0.14, 0.42]], camPt: [0, 1.45, 2.55], lookPt: [0, 0.2, -0.5], bedHide };   // RST bedHide
  },
  kiln(g) {
    mesh(g, new THREE.SphereGeometry(1.15, 18, 12, 0, 6.283, 0, Math.PI / 2), clayM, 0, 0.35, 0).scale.y = 1.25;
    mesh(g, cyl(1.2, 1.3, 0.5, 18), stoneM, 0, 0.15, 0);
    mesh(g, cyl(0.22, 0.3, 0.45, 10), clayM, 0, 1.85, 0);
    const mouth = mesh(g, new THREE.BoxGeometry(0.6, 0.6, 0.4), glowM.clone(), 0, 0.6, 1.02);
    mouth.castShadow = false;
    const sm = smoke(g, 2, 6, 0.8);
    const o = { radius: 1.4, label: 'Kiln', heat: 0, update(dt) { o.heat = Math.max(0, o.heat - dt * 0.25); mouth.material.emissiveIntensity = o.heat * 3; sm(dt, Math.min(1, o.heat * 2)); } };
    return o;
  },
  house(g) {
    const w = 6.4, d = 5.2, hh = 2.7, t = 0.28;
    mesh(g, new THREE.BoxGeometry(w + 0.5, 1.6, d + 0.5), stoneM, 0, -0.65, 0);
    // WP2: walls/roof are staged while the house is built (stage(p)); interior groups toggled by setHome(home).
    const wallsG = pivot(g, 0, 0, 0), roofG = pivot(g, 0, 0, 0);
    const wall = (ww, h, dd, x, y, z, p = wallsG) => mesh(p, boxM(ww, h, dd), brickM, x, y, z);
    wall(w, hh, t, 0, hh / 2 + 0.15, -d / 2 + t / 2);
    const wallW = wall(t, hh, d, -w / 2 + t / 2, hh / 2 + 0.15, 0);       // replaced by a doorway when the nursery exists
    const doorW = pivot(wallsG, 0, 0, 0);
    wall(t, hh, 1.6, -w / 2 + t / 2, hh / 2 + 0.15, -1.8, doorW); wall(t, hh, 1.6, -w / 2 + t / 2, hh / 2 + 0.15, 1.8, doorW);
    wall(t, 0.6, 2.0, -w / 2 + t / 2, hh - 0.15, 0, doorW);
    doorW.visible = false;
    wall(t, hh, d, w / 2 - t / 2, hh / 2 + 0.15, 0);
    const z = d / 2 - t / 2;
    wall(2.3, hh, t, -2.05, hh / 2 + 0.15, z);
    wall(2.3, hh, t, 2.05, hh / 2 + 0.15, z);
    wall(1.8, 0.6, t, 0, hh - 0.15, z);
    mesh(g, new THREE.BoxGeometry(w - 2 * t, 0.04, d - 2 * t), plankM, 0, 0.17, 0).castShadow = false;   // interior floor
    // hearth: stone ring with an ember disc, under the chimney
    const hearthG = pivot(g, 1.9, 0.15, -1.2);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; mesh(hearthG, rockGeo, stoneM, Math.cos(a) * 0.45, 0.1, Math.sin(a) * 0.45).scale.set(0.15, 0.12, 0.14); }
    mesh(hearthG, cyl(0.36, 0.38, 0.05, 12), emberM, 0, 0.06, 0).castShadow = false;
    for (let i = 0; i < 3; i++) mesh(hearthG, cyl(0.04, 0.05, 0.6, 6), woodM, 0, 0.14, 0).rotation.set(Math.PI / 2, i * 1.05, 0, 'YXZ');
    // double bed: frame 1.6 x 2.1, mattress top at y 0.55, two pillows, hide blanket over the lower 70%
    const bedG = pivot(g, -0.9, 0.15, -1.25);
    mesh(bedG, new THREE.BoxGeometry(1.6, 0.25, 2.1), plankM, 0, 0.125, 0);
    mesh(bedG, new THREE.BoxGeometry(1.5, 0.15, 2.0), reedM, 0, 0.325, 0);
    for (const x of [-0.38, 0.38]) mesh(bedG, new THREE.BoxGeometry(0.55, 0.1, 0.3), linenM, x, 0.45, -0.8);
    const bedHide = mesh(bedG, new THREE.BoxGeometry(1.56, 0.06, 1.45), hideM, 0, 0.43, 0.3);   // RST: becomes the blanket while they sleep
    mesh(bedG, new THREE.BoxGeometry(1.6, 0.6, 0.08), plankM, 0, 0.3, -1.05);
    // cradle: a little rocking box
    const cradleG = pivot(g, 1.8, 0.15, 1.2);
    mesh(cradleG, new THREE.BoxGeometry(0.5, 0.28, 0.8), plankM, 0, 0.3, 0);
    mesh(cradleG, new THREE.BoxGeometry(0.42, 0.06, 0.72), hideM, 0, 0.42, 0);
    for (const z2 of [-0.35, 0.35]) mesh(cradleG, new THREE.TorusGeometry(0.3, 0.025, 4, 10, Math.PI), woodM, 0, 0.32, z2).rotation.set(0, Math.PI / 2, Math.PI);
    // nursery: a 3.2 x 3.2 brick annex on local -X with its own lean-to roof
    const nurseryG = pivot(g, -w / 2 - 1.6, 0, 0), aw = 3.2;
    mesh(nurseryG, new THREE.BoxGeometry(aw + 0.3, 1.6, aw + 0.3), stoneM, 0, -0.65, 0);
    mesh(nurseryG, boxM(t, 2.2, aw), brickM, -aw / 2 + t / 2, 1.25, 0);
    for (const s of [-1, 1]) mesh(nurseryG, boxM(aw, 2.2, t), brickM, 0, 1.25, s * (aw / 2 - t / 2));
    mesh(nurseryG, new THREE.BoxGeometry(aw - 0.3, 0.04, aw - 0.3), plankM, 0, 0.17, 0).castShadow = false;
    const nr = mesh(nurseryG, new THREE.BoxGeometry(aw + 0.6, 0.14, aw + 0.6), tileM, 0, 2.62, 0); nr.rotation.z = 0.22;
    for (const o of [hearthG, bedG, cradleG, nurseryG]) o.visible = false;
    const setHome = (h = {}) => { hearthG.visible = !!h.hearth; bedG.visible = !!h.bed; cradleG.visible = !!h.cradle; nurseryG.visible = !!h.nursery; wallW.visible = !h.nursery; doorW.visible = !!h.nursery; };
    const door = mesh(g, new THREE.BoxGeometry(0.95, 2.05, 0.07), plankM, -0.85, 1.2, z + 0.5);
    door.rotation.y = -1.25;
    for (const x of [-2.05, 2.05]) {
      mesh(g, new THREE.BoxGeometry(0.9, 0.9, t + 0.04), glowM, x, 1.75, z).castShadow = false;
      mesh(g, new THREE.BoxGeometry(1.1, 0.09, t + 0.12), plankM, x, 1.25, z);
      mesh(g, new THREE.BoxGeometry(1.1, 0.09, t + 0.12), plankM, x, 2.25, z);
      mesh(g, new THREE.BoxGeometry(0.06, 0.9, t + 0.1), plankM, x, 1.75, z);
    }
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.45, 0), new THREE.Vector2(w / 2 + 0.45, 0), new THREE.Vector2(0, 2.1)]);
    const roof = mesh(roofG, new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false }), tileM, 0, hh + 0.13, -d / 2 - 0.4);
    roof.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 0.5; });
    mesh(roofG, boxM(0.7, 1.9, 0.7), brickM, 2, hh + 1.3, -1.2);
    const sm = smoke(g, hh + 2.3, 6, 0.9);
    let built = 1;
    return { radius: 4.4, label: 'Brick house', setHome, hearthPt: [1.9, 0.7, -1.2], bedHide,   // RST bedHide
      bedPts: [[-1.3, 0.62, -0.32], [-0.5, 0.62, -0.32]], camPt: [0.6, 2.15, 2.1], lookPt: [-0.9, 0.5, -1.2],
      stage(p) { built = p; wallsG.visible = p >= 0.3; roofG.visible = p >= 0.8; door.visible = p >= 0.8; },
      update(dt) { sm(dt, built >= 1 ? 0.8 : 0); } };
  },
  farm(g) {
    mesh(g, new THREE.BoxGeometry(5.4, 0.5, 4.4), soilM, 0, -0.14, 0).castShadow = false;
    for (let i = 0; i < 8; i++) mesh(g, cyl(0.16, 0.2, 5.2, 5), soilM, 0, 0.1, -1.75 + i * 0.5).rotation.z = Math.PI / 2;
    for (const [x, z] of [[-2.7, -2.2], [2.7, -2.2], [-2.7, 2.2], [2.7, 2.2]]) mesh(g, cyl(0.06, 0.07, 1, 5), woodM, x, 0.4, z);
    for (const zz of [-2.2, 2.2]) mesh(g, cyl(0.035, 0.035, 5.4, 5), woodM, 0, 0.7, zz).rotation.z = Math.PI / 2;
    const stalk = merge([part(cyl(0.012, 0.016, 0.9, 4), 0xa8963f, 0, 0.45, 0), part(new THREE.IcosahedronGeometry(0.04, 0), 0xd9b34f, 0, 0.95, 0, 0, 0, 0, 1, 3, 1)]);
    const N = 220, crop = new THREE.InstancedMesh(stalk, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), N);
    crop.castShadow = true; g.add(crop);
    const r = rng(6), P = [];
    for (let i = 0; i < N; i++) P.push([r() * 5 - 2.5, -1.75 + ((i % 8) * 0.5) + r() * 0.16 - 0.08, 0.75 + r() * 0.5, r() * 6]);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const o = { radius: 3.1, solid: false, label: 'Farm plot', grow: 0, shown: -1, update(dt) {
      o.grow = Math.min(1, o.grow + dt / 75);
      if (Math.abs(o.grow - o.shown) < 0.02 && o.grow < 1) return;
      if (o.shown === o.grow) return;
      o.shown = o.grow;
      const c = new THREE.Color().setRGB(0.45, 0.8, 0.3).lerp(new THREE.Color(1, 1, 1), Math.max(0, o.grow * 2 - 1));
      for (let i = 0; i < N; i++) {
        const k = P[i][2] * o.grow;
        m.compose(v.set(P[i][0], 0.15, P[i][1]), q.setFromEuler(e.set(0.08, P[i][3], 0.08)), s.set(k, k, k));
        crop.setMatrixAt(i, m); crop.setColorAt(i, c);
      }
      crop.instanceMatrix.needsUpdate = true; crop.instanceColor.needsUpdate = true;
    } };
    return o;
  },
  well(g) {
    const ring = new THREE.CylinderGeometry(0.95, 0.95, 1.5, 20, 1, true);
    ring.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? 1.5 : 6); });
    mesh(g, ring, brickM, 0, 0.2, 0).material = brickM.clone();
    g.children[0].material.side = THREE.DoubleSide;
    const rim = mesh(g, new THREE.TorusGeometry(0.95, 0.1, 6, 20), stoneM, 0, 0.95, 0);
    rim.rotation.x = Math.PI / 2;
    mesh(g, cyl(0.9, 0.9, 0.05, 20), mat(0x0d2a2c, 0.15), 0, 0.45, 0).castShadow = false;
    for (const s of [-1, 1]) mesh(g, cyl(0.07, 0.08, 2.4, 6), woodM, s * 1.02, 1.3, 0);
    mesh(g, cyl(0.06, 0.06, 2.3, 6), woodM, 0, 2.1, 0).rotation.z = Math.PI / 2;
    const rf = mesh(g, new THREE.ConeGeometry(1.6, 0.8, 4), thatchM, 0, 2.85, 0);
    rf.rotation.y = Math.PI / 4;
    mesh(g, cyl(0.012, 0.012, 1, 4), woodM, 0, 1.6, 0);
    mesh(g, cyl(0.16, 0.13, 0.26, 10), plankM, 0, 1.05, 0);
    return { radius: 1.3, label: 'Well' };
  },
  // ---------- WP2 placeables ----------
  // cols: local [x, z, r] colliders added by main.placeStruct instead of one solid circle.
  rack(g) {
    for (const x of [-0.8, 0.8]) mesh(g, cyl(0.05, 0.06, 1.5, 6), woodM, x, 0.75, 0);
    for (const y of [0.75, 1.1, 1.42]) mesh(g, cyl(0.03, 0.03, 1.7, 5), woodM, 0, y, 0).rotation.z = Math.PI / 2;
    const strips = [0, 1, 2, 3].map((i) => { const m = mesh(g, new THREE.BoxGeometry(0.16, 0.42, 0.05), meatM, -0.54 + i * 0.36, 1.18, 0); m.visible = false; return m; });
    const o = { radius: 0.9, solid: false, label: 'Drying rack', hang: [], update(dt) {
      strips.forEach((m, i) => { const h = o.hang[i]; m.visible = !!h; if (h) { h[1] += dt; m.material = h[1] >= 90 ? driedM : meatM; m.scale.y = h[1] >= 90 ? 0.8 : 1; } });
    } };
    return o;
  },
  stable(g) {
    const W = 5, D = 4;
    for (const [x, z, h] of [[-W / 2, -D / 2, 2.3], [W / 2, -D / 2, 2.3], [-W / 2, D / 2, 2.9], [W / 2, D / 2, 2.9]]) mesh(g, cyl(0.1, 0.12, h, 6), woodM, x, h / 2, z);
    const roof = mesh(g, new THREE.BoxGeometry(W + 0.6, 0.12, D + 0.9), thatchM, 0, 2.65, 0); roof.rotation.x = -0.15;
    for (const y of [0.45, 0.95]) {
      mesh(g, cyl(0.045, 0.045, W, 5), woodM, 0, y, -D / 2).rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) mesh(g, cyl(0.045, 0.045, D, 5), woodM, s * W / 2, y, 0).rotation.x = Math.PI / 2;
    }
    mesh(g, new THREE.BoxGeometry(1.6, 0.4, 0.5), plankM, -1.1, 0.3, -D / 2 + 0.45);
    mesh(g, new THREE.BoxGeometry(1.4, 0.06, 0.38), mat(0x24383a, 0.2), -1.1, 0.48, -D / 2 + 0.45).castShadow = false;
    mesh(g, new THREE.BoxGeometry(1.2, 0.7, 0.9), hayM, 1.4, 0.35, -D / 2 + 0.6);
    return { radius: 2.8, solid: false, label: 'Stable', cols: [[-1.7, -D / 2, 0.6], [0, -D / 2, 0.6], [1.7, -D / 2, 0.6]] };
  },
  fence(g) {
    for (const x of [-1.15, 1.15]) mesh(g, cyl(0.06, 0.07, 1.1, 6), woodM, x, 0.55, 0);
    for (const y of [0.45, 0.85]) mesh(g, cyl(0.035, 0.035, 2.4, 5), woodM, 0, y, 0).rotation.z = Math.PI / 2;
    return { radius: 1.3, solid: false, label: 'Fence', cols: [[-0.8, 0, 0.25], [0, 0, 0.25], [0.8, 0, 0.25]] };
  },
  path(g) {
    if (NAT.RockPath_Round_Wide) { for (const p of NAT.RockPath_Round_Wide) mesh(g, p.geo, p.mat, 0, 0.02, 0).castShadow = false; }
    else for (let i = 0; i < 5; i++) {
      const a = i * 2.4, r = i ? 0.75 : 0, m = mesh(g, rockGeo, stoneM, Math.cos(a) * r, 0.02, Math.sin(a) * r);
      m.scale.set(0.42, 0.06, 0.36); m.rotation.y = i; m.castShadow = false;
    }
    return { radius: 1.2, solid: false, label: 'Stone path' };
  },
  flowers(g) {
    for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; mesh(g, rockGeo, stoneM, Math.cos(a) * 0.8, 0.05, Math.sin(a) * 0.8).scale.set(0.12, 0.08, 0.1); }
    mesh(g, cyl(0.75, 0.78, 0.08, 14), mat(0x3a2a1c, 1), 0, 0.03, 0).castShadow = false;
    const kinds = ['flower_3_group', 'flower_4_group'];
    for (let i = 0; i < 5; i++) {
      const parts = NAT[kinds[i % 2]], a = i * 1.3, r = i ? 0.42 : 0;
      if (parts) { const fg = pivot(g, Math.cos(a) * r, 0.05, Math.sin(a) * r); fg.rotation.y = i * 2; fg.scale.setScalar(0.4); for (const p of parts) mesh(fg, p.geo, p.mat); }
      else mesh(g, sph(0.12, 8, 6), mat(i % 2 ? 0xd77ab0 : 0xf2d24a, 0.8), Math.cos(a) * r, 0.2, Math.sin(a) * r);
    }
    return { radius: 0.9, solid: false, label: 'Flower bed' };
  },
  basket(g) {
    mesh(g, new THREE.CylinderGeometry(0.36, 0.3, 0.55, 14), fiberM, 0, 0.28, 0);
    mesh(g, new THREE.TorusGeometry(0.36, 0.03, 5, 14), woodM, 0, 0.55, 0).rotation.x = Math.PI / 2;
    mesh(g, new THREE.CylinderGeometry(0.38, 0.38, 0.06, 14), fiberM, 0, 0.6, 0);
    mesh(g, sph(0.05, 6, 5), woodM, 0, 0.66, 0);
    return { radius: 0.5, solid: false, label: 'Storage basket', cols: [[0, 0, 0.4]] };
  },
  // ARC: a grave cairn: river stones stacked knee-high, a flat stone leaning on it with an ochre handprint.
  cairn(g) {
    const R = rng(4141);
    const stack = [[0.55, 0.26, 0.5], [0.46, 0.22, 0.42], [0.36, 0.2, 0.33], [0.27, 0.17, 0.25], [0.17, 0.13, 0.16]];
    let y = 0.02;
    stack.forEach(([sx, sy, sz], i) => {
      for (let k = 0; k < (i < 2 ? 3 : 1); k++) {
        const a = (k / 3) * 6.283 + i, r = i < 2 ? sx * 0.42 : 0;
        const m = mesh(g, rockGeo, stoneM, Math.cos(a) * r, y + sy * 0.6, Math.sin(a) * r);
        m.scale.set(sx * (i < 2 ? 0.55 : 1), sy, sz * (i < 2 ? 0.55 : 1)); m.rotation.set(R() * 0.3, R() * 6, R() * 0.3);
      }
      y += sy * 1.05;
    });
    const slab = mesh(g, new THREE.BoxGeometry(0.42, 0.56, 0.07), stoneM, 0, 0.3, 0.62);
    slab.rotation.x = -0.32;
    const print = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.38), new THREE.MeshStandardMaterial({ map: handTex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    print.position.set(0, 0, 0.037); slab.add(print);
    return { radius: 0.75, label: 'Cairn' };
  },
  // ARC: a brazier: a stone fire bowl on a short post. Lights itself at dusk (reads glowM, which main drives by the night);
  // emissive flames only, no PointLight (spec §5.9 budget).
  brazier(g) {
    mesh(g, cyl(0.07, 0.09, 1.0, 7), woodM, 0, 0.5, 0);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; const l = mesh(g, cyl(0.035, 0.045, 0.75, 6), woodM, Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2); l.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); }
    mesh(g, new THREE.SphereGeometry(0.34, 14, 8, 0, 6.283, Math.PI / 2, Math.PI / 2), stoneM, 0, 1.2, 0).scale.y = 0.55;
    const coals = mesh(g, cyl(0.28, 0.28, 0.05, 12), emberM, 0, 1.12, 0); coals.castShadow = false;
    const flames = [0, 1, 2].map((i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.03, 0.55 - i * 0.08, 7, 1, true), i % 2 ? flameM2 : flameM); f.position.set(Math.sin(i * 2.1) * 0.07, 1.4, Math.cos(i * 2.1) * 0.07); g.add(f); return f; });
    const sm = smoke(g, 1.6, 5, 0.6);
    let t = rng(77)() * 9, lit = 0;
    return { radius: 0.5, label: 'Brazier', update(dt) {
      t += dt; lit += ((glowM.emissiveIntensity > 0.45 ? 1 : 0) - lit) * Math.min(1, dt * 1.5);
      flames.forEach((f, i) => { f.visible = lit > 0.05; f.scale.set(lit * (1 + Math.sin(t * 9 + i * 2) * 0.2), lit * (1 + Math.sin(t * 13 + i) * 0.3), lit * (1 + Math.cos(t * 8 + i) * 0.2)); f.rotation.y = t * (i + 1); });
      coals.visible = lit > 0.05; sm(dt, lit);
    } };
  },
};
// ARC: the ochre handprint on a cairn's slab
const handTex = canvasTex(128, (g, S) => {
  g.clearRect(0, 0, S, S); g.fillStyle = 'rgba(176, 72, 40, 0.92)';
  g.translate(S / 2, S * 0.62); g.scale(1.6, 1.6);
  g.beginPath(); g.ellipse(0, 0, 13, 15, 0, 0, 6.3); g.fill();
  for (const [fx, len, a] of [[-11, 17, -0.5], [-5, 24, -0.15], [2, 26, 0], [9, 23, 0.15]]) { g.save(); g.translate(fx, -10); g.rotate(a); g.fillRect(-2.6, -len, 5.2, len); g.restore(); }
  g.save(); g.translate(12, 2); g.rotate(1.0); g.fillRect(-2.6, -16, 5.2, 16); g.restore();
});
handTex.wrapS = handTex.wrapT = THREE.ClampToEdgeWrapping;

// WP2: a building scaffold (4 stick posts + 2 cross bars) around a construction site, shown while rise < 1.
export function makeScaffold(r) {
  const g = new THREE.Group(), h = Math.min(4.2, 1.6 + r * 0.6), q = r * 0.78;
  for (const [x, z] of [[-q, -q], [q, -q], [-q, q], [q, q]]) mesh(g, cyl(0.05, 0.06, h, 5), woodM, x, h / 2, z);
  mesh(g, cyl(0.04, 0.04, q * 2.1, 5), woodM, 0, h * 0.85, -q).rotation.z = Math.PI / 2;
  mesh(g, cyl(0.04, 0.04, q * 2.1, 5), woodM, 0, h * 0.6, q).rotation.z = Math.PI / 2;
  return g;
}

export function makeStructure(kind) {
  const g = new THREE.Group();
  const info = BUILD[kind](g);
  return Object.assign(info, { kind, group: g, solid: info.solid ?? true, rise: 0 });
}

// RST: the blanket pulled over the sleepers: a soft, mottled hide plane (1 x 1, scaled to the bed), with a darker
// stitched border. userData.drape(heightAt) re-shapes it: heightAt(localX, localZ) returns the local height.
const blanketT = canvasTex(256, (g, S) => {
  g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, S, S);
  const r = rng(77);
  for (let i = 0; i < 2600; i++) { const l = 30 + r() * 26; g.fillStyle = `hsla(28, 32%, ${l}%, 0.16)`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 4 + r() * 7); }
  g.strokeStyle = 'rgba(52, 34, 20, 0.85)'; g.lineWidth = 10; g.strokeRect(5, 5, S - 10, S - 10);
  g.strokeStyle = 'rgba(214, 190, 150, 0.55)'; g.lineWidth = 2; g.setLineDash([7, 6]); g.strokeRect(17, 17, S - 34, S - 34);
});
export function makeBlanket(w = 1, l = 1) {
  const geo = new THREE.PlaneGeometry(w, l, 22, 18); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: blanketT, color: 0xffffff, roughness: 1, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  const pos = geo.attributes.position, base = pos.array.slice(), C = 23, Rw = 19, hs = new Float32Array(pos.count), tmp = new Float32Array(pos.count);
  // heights from heightAt, then a few smoothing passes so it falls like cloth rather than a tent of peaks
  m.userData.drape = (heightAt, passes = 2) => {
    for (let i = 0; i < pos.count; i++) hs[i] = heightAt(base[i * 3], base[i * 3 + 2]);
    for (let k = 0; k < passes; k++) {
      for (let r = 0; r < Rw; r++) for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (r === 0 || c === 0 || r === Rw - 1 || c === C - 1) { tmp[i] = hs[i]; continue; }
        tmp[i] = hs[i] * 0.5 + (hs[i - 1] + hs[i + 1] + hs[i - C] + hs[i + C]) * 0.125;
      }
      hs.set(tmp);
    }
    for (let i = 0; i < pos.count; i++) pos.setY(i, hs[i]);
    pos.needsUpdate = true; geo.computeVertexNormals();
  };
  return m;
}
// RST: a bedroll for a bare floor (a hide mat and two rolled-hide pillows) or just the pillows (the cave's hide bed).
// Origin on the floor at the middle of the mat; the pillows are positioned by the caller (userData.pillows).
export function makeBedroll(withMat = true) {
  const g = new THREE.Group(), m2 = hideM.clone(); m2.color.set(0x6a4a30);
  if (withMat) {
    mesh(g, new THREE.BoxGeometry(1.7, 0.03, 2.1), hideM, 0, 0.015, 0).castShadow = false;
    mesh(g, new THREE.BoxGeometry(1.5, 0.012, 1.9), reedM, 0, 0.031, 0).castShadow = false;
  }
  g.userData.pillows = [0, 1].map(() => { const p = mesh(g, cyl(0.075, 0.075, 0.44, 10), m2); p.rotation.z = Math.PI / 2; p.scale.set(0.7, 1, 1); return p; });
  return g;
}
