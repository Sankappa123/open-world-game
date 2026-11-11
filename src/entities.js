import * as THREE from 'three';
import { rng, mat, part, merge, lumpy, canvasTex, streakTex, brickTex, boxM } from './util.js';

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

export function makeSpear() {
  const g = new THREE.Group();
  mesh(g, cyl(0.016, 0.02, 1.9, 6), woodM).rotation.x = Math.PI / 2;
  const tip = mesh(g, new THREE.ConeGeometry(0.035, 0.2, 5), stoneM, 0, 0, 1.03);
  tip.rotation.x = Math.PI / 2;
  return g;
}
export function makeAxe() {
  const g = new THREE.Group();
  mesh(g, cyl(0.018, 0.022, 0.6, 6), woodM, 0, 0, 0.2).rotation.x = Math.PI / 2;
  mesh(g, new THREE.BoxGeometry(0.04, 0.2, 0.11), stoneM, 0, -0.04, 0.46);
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
    mesh(g, cyl(2, 2.05, 1.6, 18), plankM, 0, 0.6, 0);
    mesh(g, new THREE.ConeGeometry(2.75, 2.5, 18), thatchM, 0, 2.6, 0);
    mesh(g, new THREE.ConeGeometry(0.5, 0.5, 8), plankM, 0, 3.95, 0);
    mesh(g, new THREE.BoxGeometry(0.95, 1.5, 0.5), darkM, 0, 0.55, 1.83).castShadow = false;
    for (const s of [-1, 1]) mesh(g, cyl(0.07, 0.08, 1.7, 6), woodM, s * 0.55, 0.65, 2.05);
    mesh(g, cyl(0.07, 0.07, 1.3, 6), woodM, 0, 1.48, 2.05).rotation.z = Math.PI / 2;
    return { radius: 2.3, label: 'Thatch hut' };
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
    const wall = (ww, h, dd, x, y, z) => mesh(g, boxM(ww, h, dd), brickM, x, y, z);
    wall(w, hh, t, 0, hh / 2 + 0.15, -d / 2 + t / 2);
    wall(t, hh, d, -w / 2 + t / 2, hh / 2 + 0.15, 0);
    wall(t, hh, d, w / 2 - t / 2, hh / 2 + 0.15, 0);
    const z = d / 2 - t / 2;
    wall(2.3, hh, t, -2.05, hh / 2 + 0.15, z);
    wall(2.3, hh, t, 2.05, hh / 2 + 0.15, z);
    wall(1.8, 0.6, t, 0, hh - 0.15, z);
    mesh(g, new THREE.BoxGeometry(1.8, 2.1, 0.1), darkM, 0, 1.2, z - 0.25).castShadow = false;
    const door = mesh(g, new THREE.BoxGeometry(0.95, 2.05, 0.07), plankM, -0.85, 1.2, z + 0.5);
    door.rotation.y = -1.25;
    for (const x of [-2.05, 2.05]) {
      mesh(g, new THREE.BoxGeometry(0.9, 0.9, t + 0.04), glowM, x, 1.75, z).castShadow = false;
      mesh(g, new THREE.BoxGeometry(1.1, 0.09, t + 0.12), plankM, x, 1.25, z);
      mesh(g, new THREE.BoxGeometry(1.1, 0.09, t + 0.12), plankM, x, 2.25, z);
      mesh(g, new THREE.BoxGeometry(0.06, 0.9, t + 0.1), plankM, x, 1.75, z);
    }
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.45, 0), new THREE.Vector2(w / 2 + 0.45, 0), new THREE.Vector2(0, 2.1)]);
    const roof = mesh(g, new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false }), tileM, 0, hh + 0.13, -d / 2 - 0.4);
    roof.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 0.5; });
    mesh(g, boxM(0.7, 1.9, 0.7), brickM, 2, hh + 1.3, -1.2);
    const sm = smoke(g, hh + 2.3, 6, 0.9);
    return { radius: 4.4, label: 'Brick house', update(dt) { sm(dt, 0.8); } };
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
};

export function makeStructure(kind) {
  const g = new THREE.Group();
  const info = BUILD[kind](g);
  return Object.assign(info, { kind, group: g, solid: info.solid ?? true, rise: 0 });
}
