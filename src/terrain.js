import * as THREE from 'three';
import { rng, canvasTex } from './util.js';

// Ground material: grass, dirt and rock textures blended per vertex (by slope and height), tiled in world
// metres, with a large-scale variation map and a fade to flat colour in the distance so tiling never shows.
const tileNoise = (S, r, oct = 4) => {           // periodic value noise, so the canvas tiles seamlessly
  const grids = [];
  for (let o = 0; o < oct; o++) { const n = 4 << o, g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = r(); grids.push({ n, g }); }
  return (x, y) => {
    let v = 0, a = 0.55, t = 0;
    for (const { n, g } of grids) {
      const fx = (x / S) * n, fy = (y / S) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const q = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
      v += a * ((q(ix, iy) * (1 - sx) + q(ix + 1, iy) * sx) * (1 - sy) + (q(ix, iy + 1) * (1 - sx) + q(ix + 1, iy + 1) * sx) * sy);
      t += a; a *= 0.5;
    }
    return v / t;
  };
};
const wrapStroke = (g, S, draw) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); draw(); g.restore(); } };

function grassTexture() {
  return canvasTex(512, (g, S) => {
    const r = rng(31), n = tileNoise(S, r), n2 = tileNoise(S, rng(32), 3);
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = n(x, y), b = n2(x * 3, y * 3);
      const l = 0.19 + a * 0.16 + (b - 0.5) * 0.08, hue = 0.21 + (a - 0.5) * 0.06, sat = 0.42 - (a - 0.5) * 0.15;
      const c = new THREE.Color().setHSL(hue, sat, l);
      im.data.set([c.r * 255, c.g * 255, c.b * 255, 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
    for (let i = 0; i < 2600; i++) {                  // tiny blade strokes
      const x = r() * S, y = r() * S, len = 4 + r() * 9, lean = (r() - 0.5) * 6, light = r() > 0.45;
      g.strokeStyle = light ? `hsla(${72 + r() * 30},${40 + r() * 20}%,${36 + r() * 16}%,${0.22 + r() * 0.3})` : `hsla(${90 + r() * 30},40%,${12 + r() * 10}%,${0.25 + r() * 0.3})`;
      g.lineWidth = 0.8 + r() * 1.2;
      wrapStroke(g, S, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - len); g.stroke(); });
    }
  });
}
function dirtTexture() {
  return canvasTex(512, (g, S) => {
    const r = rng(41), n = tileNoise(S, r), n2 = tileNoise(S, rng(42), 5);
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = n(x, y), b = n2(x * 2, y * 2);
      const c = new THREE.Color().setHSL(0.085 + (a - 0.5) * 0.03, 0.28 + (b - 0.5) * 0.15, 0.3 + a * 0.18 + (b - 0.5) * 0.1);
      im.data.set([c.r * 255, c.g * 255, c.b * 255, 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
    for (let i = 0; i < 900; i++) {                   // pebbles and grit
      const x = r() * S, y = r() * S, rad = 1 + r() * 3.5, l = 30 + r() * 30;
      wrapStroke(g, S, () => {
        g.fillStyle = `hsla(${25 + r() * 20},${12 + r() * 15}%,${l}%,0.75)`; g.beginPath(); g.ellipse(x, y, rad, rad * (0.6 + r() * 0.4), r() * 3, 0, 6.3); g.fill();
        g.fillStyle = `hsla(25,15%,${l - 18}%,0.5)`; g.beginPath(); g.ellipse(x + rad * 0.3, y + rad * 0.4, rad * 0.9, rad * 0.5, 0, 0, 6.3); g.fill();
      });
    }
  });
}
function rockTexture() {
  return canvasTex(512, (g, S) => {
    const r = rng(51), n = tileNoise(S, r, 5), n2 = tileNoise(S, rng(52), 2);
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const strata = Math.sin((y + n(x * 0.5, y * 0.5) * 60) * 0.11) * 0.5 + 0.5;       // horizontal rock bands
      const a = n(x, y), b = n2(x, y);
      const l = 0.26 + a * 0.3 + strata * 0.1 + (b - 0.5) * 0.08;
      const c = new THREE.Color().setHSL(0.08 + (b - 0.5) * 0.05, 0.08 + a * 0.08, l);
      im.data.set([c.r * 255, c.g * 255, c.b * 255, 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
    g.lineCap = 'round';
    for (let i = 0; i < 160; i++) {                   // cracks
      const x = r() * S, y = r() * S, segs = 3 + (r() * 5 | 0);
      g.strokeStyle = `rgba(20,16,12,${0.25 + r() * 0.35})`; g.lineWidth = 0.6 + r() * 1.4;
      wrapStroke(g, S, () => { g.beginPath(); g.moveTo(x, y); let px = x, py = y; for (let k = 0; k < segs; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; g.lineTo(px, py); } g.stroke(); });
    }
  });
}
function macroTexture() {
  return canvasTex(256, (g, S) => {
    const n = tileNoise(S, rng(61), 3), im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = n(x, y) * 255; im.data.set([v, v, v, 255], (y * S + x) * 4); }
    g.putImageData(im, 0, 0);
  });
}

export function makeTerrainMaterial(anisotropy = 4) {
  const tex = { tGrass: grassTexture(), tDirt: dirtTexture(), tRock: rockTexture(), tMacro: macroTexture() };
  for (const t of Object.values(tex)) t.anisotropy = anisotropy;
  tex.tMacro.colorSpace = THREE.NoColorSpace;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGrass: { value: tex.tGrass }, tDirt: { value: tex.tDirt }, tRock: { value: tex.tRock }, tMacro: { value: tex.tMacro } });
    sh.vertexShader = `attribute vec3 aSplat; varying vec3 vSplat; varying vec3 vWp; varying vec3 vNrm;\n` + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = aSplat; vWp = position; vNrm = normal;');
    sh.fragmentShader = `uniform sampler2D tGrass, tDirt, tRock, tMacro; varying vec3 vSplat; varying vec3 vWp; varying vec3 vNrm;\n` + sh.fragmentShader
      .replace('#include <map_fragment>', `
        float dist = distance(vWp, cameraPosition);
        float mac = texture2D(tMacro, vWp.xz * 0.004).r;
        vec3 w = vSplat / max(vSplat.x + vSplat.y + vSplat.z, 0.001);
        vec3 cg = texture2D(tGrass, vWp.xz * 0.33 + mac * 0.3).rgb;
        vec3 cd = texture2D(tDirt, vWp.xz * 0.28).rgb;
        vec3 an = abs(normalize(vNrm)); an /= (an.x + an.y + an.z);
        vec3 cr = texture2D(tRock, vWp.zy * 0.09).rgb * an.x + texture2D(tRock, vWp.xz * 0.09).rgb * an.y + texture2D(tRock, vWp.xy * 0.09).rgb * an.z;
        vec3 tex = cg * w.x + cd * w.y + cr * w.z;
        vec3 flatCol = vec3(0.235, 0.33, 0.12) * w.x + vec3(0.36, 0.28, 0.2) * w.y + vec3(0.42, 0.4, 0.37) * w.z;
        tex = mix(tex, flatCol, smoothstep(50.0, 260.0, dist));
        tex *= 0.82 + mac * 0.36;
        diffuseColor.rgb *= tex;`);
  };
  m.customProgramCacheKey = () => 'hearthborn-terrain';
  return m;
}
