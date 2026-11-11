import * as THREE from 'three';
import { rng, canvasTex } from './util.js';

// The river: a strip of mesh that follows the river's curve. The shader knows the terrain height under every pixel
// (from a heightmap texture), so water fades to clear in the shallows and foams along the banks; flow follows the
// bends because the strip's own coordinates (across, along) drive the ripples. No reflection pass: this is cheap.
function normalTexture() {
  const t = canvasTex(256, (g, S) => {
    const r = rng(9), waves = [];
    for (let i = 0; i < 10; i++) waves.push([((r() * 7) | 0) + 1, ((r() * 7) | 0) + 1, r() * 6.28, 0.35 + r()]);
    const im = g.createImageData(S, S), k = (Math.PI * 2) / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let dx = 0, dy = 0;
      for (const [a, b, ph, am] of waves) { const cs = Math.cos((a * x + b * y) * k + ph) * am; dx += cs * a; dy += cs * b; }
      const l = Math.hypot(dx * 0.16, dy * 0.16, 1);
      im.data.set([(-dx * 0.16 / l * 0.5 + 0.5) * 255, (-dy * 0.16 / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
function foamTexture() {
  const t = canvasTex(256, (g, S) => {
    const r = rng(19), im = g.createImageData(S, S), k = (Math.PI * 2) / S, w = [];
    for (let i = 0; i < 14; i++) w.push([((r() * 9) | 0) + 1, ((r() * 9) | 0) + 1, r() * 6.28, 0.3 + r() * 0.7]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0, n = 0;
      for (const [a, b, ph, am] of w) { v += Math.sin((a * x + b * y) * k + ph) * am; n += am; }
      const c = (v / n * 0.5 + 0.5) * 255;
      im.data.set([c, c, c, 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createRiver(scene, { SIZE, riverX, heights, N1 }) {
  const half = new Uint16Array(N1 * N1);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  const hTex = new THREE.DataTexture(half, N1, N1, THREE.RedFormat, THREE.HalfFloatType);
  hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;

  const W = 36, DX = 2, DZ = 4, cols = (W * 2) / DX + 1, rows = SIZE / DZ + 1;
  const pos = new Float32Array(cols * rows * 3), riv = new Float32Array(cols * rows * 2), idx = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const z = -SIZE / 2 + j * DZ, u = -W + i * DX, k = j * cols + i;
    pos.set([riverX(z) + u, 0, z], k * 3); riv.set([u, z], k * 2);
    if (i < cols - 1 && j < rows - 1) idx.push(k, k + cols, k + 1, k + 1, k + cols, k + cols + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('riv', new THREE.BufferAttribute(riv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uNormal: { value: normalTexture() }, uFoam: { value: foamTexture() }, uHeight: { value: hTex },
    uTime: { value: 0 }, uSize: { value: SIZE }, uTexel: { value: (N1 - 1) / N1 },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color(0.6, 0.72, 0.85) }, uLight: { value: 1 },
    uShallow: { value: new THREE.Color(0.13, 0.3, 0.28) }, uDeep: { value: new THREE.Color(0.02, 0.07, 0.1) },
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: `
      attribute vec2 riv; varying vec2 vRiv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vRiv = riv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D uNormal, uFoam, uHeight; uniform float uTime, uSize, uTexel, uLight;
      uniform vec3 uSun, uSunColor, uSky, uShallow, uDeep;
      varying vec2 vRiv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 hUV = (vWorld.xz / uSize + 0.5) * uTexel + 0.5 * (1.0 - uTexel);
        float h = texture2D(uHeight, hUV).r;
        float depth = clamp(-h, 0.0, 4.0);
        vec3 n1 = texture2D(uNormal, vRiv * 0.055 + vec2(0.0, uTime * 0.11)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, vRiv * 0.12 + vec2(uTime * 0.012, uTime * 0.21)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uNormal, vRiv * 0.021 + vec2(-uTime * 0.006, uTime * 0.03)).xyz * 2.0 - 1.0;
        vec3 n = normalize(vec3(n1.x + n2.x * 0.6 + n3.x * 1.5, 9.0, n1.y + n2.y * 0.6 + n3.y * 1.5));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 2.4, depth)) * uLight;
        vec3 c = mix(col, uSky * 0.75, fres * 0.5);
        vec3 H = normalize(uSun + V);
        float nh = max(dot(n, H), 0.0);
        c += uSunColor * (pow(nh, 320.0) * 1.1 + pow(nh, 48.0) * 0.03) * max(uSun.y, 0.0) * 1.4;
        float fn = texture2D(uFoam, vRiv * 0.09 + vec2(0.0, uTime * 0.07)).r;
        float fn2 = texture2D(uFoam, vRiv * 0.23 + vec2(uTime * 0.02, uTime * 0.16)).r;
        float shore = smoothstep(0.7, 0.0, depth);
        float foam = shore * smoothstep(0.45, 0.8, fn * 0.6 + fn2 * 0.4 + shore * 0.35);
        foam += smoothstep(0.9, 0.97, fn2 * 0.5 + fn * 0.5) * 0.25 * (1.0 - shore);    // flecks on open water
        c = mix(c, vec3(0.8, 0.86, 0.88) * uLight, clamp(foam, 0.0, 1.0) * 0.7);
        float alpha = mix(0.32, 0.94, smoothstep(0.0, 1.3, depth)) + foam * 0.5;
        alpha *= smoothstep(0.08, -0.08, h);
        gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2; mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, uniforms, update(dt) { uniforms.uTime.value += dt; } };
}
