import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const mat = (color, roughness = 0.9, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

// Paint a geometry with one colour (as vertex colours) and place it. Returns non-indexed geometry.
export function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export const merge = (parts) => mergeGeometries(parts, false);

// Lumpy displacement that keeps duplicated vertices together.
export function lumpy(geo, amp, freq = 3) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + amp * (Math.sin(x * freq * 2.1 + y * freq) * Math.cos(z * freq * 1.7 + x) + Math.sin(y * freq * 2.7 + z * 1.3) * 0.6);
    p.setXYZ(i, x * d, y * d, z * d);
  }
  return geo;
}

export function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Streaky texture for wood, thatch and roofing.
export function streakTex(h, s, l, vertical = true, n = 900) {
  return canvasTex(256, (g, S) => {
    g.fillStyle = `hsl(${h},${s}%,${l}%)`;
    g.fillRect(0, 0, S, S);
    const r = rng(h * 31 + l);
    for (let i = 0; i < n; i++) {
      g.strokeStyle = `hsla(${h + r() * 10 - 5},${s}%,${l + r() * 26 - 13}%,${0.25 + r() * 0.5})`;
      g.lineWidth = 1 + r() * 2;
      const a = r() * S, b = r() * S, len = 20 + r() * 90;
      g.beginPath();
      if (vertical) { g.moveTo(a, b); g.lineTo(a + r() * 4 - 2, b + len); }
      else { g.moveTo(b, a); g.lineTo(b + len, a + r() * 4 - 2); }
      g.stroke();
    }
  });
}

export function brickTex() {
  return canvasTex(512, (g, S) => {
    g.fillStyle = '#b3a590';
    g.fillRect(0, 0, S, S);
    const r = rng(77), bh = S / 8, bw = S / 4;
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 4; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
        g.fillStyle = `hsl(${10 + r() * 12},${42 + r() * 14}%,${30 + r() * 14}%)`;
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        for (let k = 0; k < 60; k++) {
          g.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 220 : 0},${r() > 0.5 ? 200 : 0},${r() * 0.07})`;
          g.fillRect(x + 3 + r() * (bw - 10), y + 3 + r() * (bh - 10), 2 + r() * 5, 2 + r() * 3);
        }
      }
    }
  });
}

// Box whose UVs are in metres, so tiling textures keep their real size.
export function boxM(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
  return g;
}
