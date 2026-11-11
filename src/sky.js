import * as THREE from 'three';
import { rng, canvasTex, lerp, clamp } from './util.js';

// Clouds, the sun and moon discs, fireflies, pollen and birds: cheap touches that make the valley feel alive.
const glowTex = (inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)') => canvasTex(64, (g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.3, mid); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
});

function cloudTexture() {
  return canvasTex(512, (g, S) => {
    const r = rng(77), octs = [];
    for (let o = 0; o < 5; o++) { const n = 3 << o, grid = new Float32Array(n * n); for (let i = 0; i < n * n; i++) grid[i] = r(); octs.push({ n, grid }); }
    const noise = (x, y) => {
      let v = 0, a = 0.5, t = 0;
      for (const { n, grid } of octs) {
        const fx = (x / S) * n, fy = (y / S) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const q = (i, j) => grid[((j % n + n) % n) * n + ((i % n + n) % n)];
        v += a * ((q(ix, iy) * (1 - sx) + q(ix + 1, iy) * sx) * (1 - sy) + (q(ix, iy + 1) * (1 - sx) + q(ix + 1, iy + 1) * sx) * sy); t += a; a *= 0.55;
      }
      return v / t;
    };
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = noise(x, y), cover = clamp((n - 0.54) * 4.5, 0, 1), a = cover * cover * (3 - 2 * cover);
      const shade = 0.9 + clamp((noise(x, y + 6) - n) * 5, -0.22, 0.1);     // lit from above, darker underside
      im.data.set([255 * shade, 255 * shade, 255 * Math.min(1, shade + 0.04), a * 255], (y * S + x) * 4);
    }
    g.putImageData(im, 0, 0);
  });
}
function moonTexture() {
  return canvasTex(128, (g, S) => {
    const r = rng(5);
    g.fillStyle = '#e8e6dc'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 6.3); g.fill();
    for (let i = 0; i < 26; i++) { const a = r() * 6.3, d = r() * S * 0.4, rad = 2 + r() * 9; g.fillStyle = `rgba(120,118,110,${0.25 + r() * 0.3})`; g.beginPath(); g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rad, 0, 6.3); g.fill(); }
    const gr = g.createRadialGradient(S * 0.35, S * 0.35, S * 0.1, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(40,40,60,0.55)');
    g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 6.3); g.fill();
  });
}

export function createAtmosphere(scene, R, getHeight) {
  // ---------- clouds: two drifting layers that follow the camera ----------
  const cloudTex = cloudTexture();
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  const layers = [];
  const cloudLayer = (y, scale, opacity, speed) => {
    const uniforms = { map: { value: cloudTex }, uOffset: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: opacity }, uScale: { value: scale } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform vec2 uOffset; uniform vec3 uColor; uniform float uOpacity, uScale; varying vec2 vUv;
        void main() {
          vec4 t = texture2D(map, vUv * uScale + uOffset);
          vec4 d = texture2D(map, vUv * uScale * 3.1 + uOffset * 1.7 + 0.37);
          float edge = 1.0 - smoothstep(0.22, 0.47, length(vUv - 0.5));
          float a = smoothstep(0.08, 0.6, t.a * (0.55 + d.a * 0.75));
          gl_FragColor = vec4(uColor * mix(t.rgb, d.rgb, 0.3), a * edge * uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 1; m.frustumCulled = false;
    scene.add(m);
    layers.push({ m, uniforms, scale, speed, base: opacity, y });
  };
  cloudLayer(340, 4.5, 0.85, 1.6);
  cloudLayer(480, 2.6, 0.5, 0.9);

  // ---------- sun and moon ----------
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,236,200,0.9)', 'rgba(255,200,120,0.25)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,245,1)', 'rgba(255,245,220,0.7)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunHalo.scale.setScalar(520); sunCore.scale.setScalar(110);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
  moon.scale.setScalar(64);
  scene.add(sunHalo, sunCore, moon);

  // ---------- fireflies ----------
  const NF = 110, fPos = new Float32Array(NF * 3), fCol = new Float32Array(NF * 3), fBase = [];
  for (let i = 0; i < NF; i++) fBase.push({ x: 0, z: 0, h: 0, ph: R() * 6.283, sp: 0.6 + R() * 0.8, far: true });
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const flies = new THREE.Points(fGeo, new THREE.PointsMaterial({ map: glowTex(), size: 0.28, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, opacity: 0 }));
  flies.frustumCulled = false; scene.add(flies);

  // ---------- pollen / dust in sunlight ----------
  const NP = 170, pPos = new Float32Array(NP * 3), pSeed = [];
  for (let i = 0; i < NP; i++) pSeed.push({ x: R() * 24, y: R() * 7, z: R() * 24, ph: R() * 6.283 });
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pollen = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: glowTex(), color: 0xfff2c8, size: 0.07, transparent: true, depthWrite: false, opacity: 0 }));
  pollen.frustumCulled = false; scene.add(pollen);

  // ---------- birds: two flocks that circle over the valley ----------
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.12, 0.55, 0, -0.05, 0, 0, -0.14]), 3));
  wingGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1e1a16, side: THREE.DoubleSide });
  const NB = 14, wingL = new THREE.InstancedMesh(wingGeo, birdMat, NB), wingR = new THREE.InstancedMesh(wingGeo, birdMat, NB);
  wingL.frustumCulled = wingR.frustumCulled = false;
  scene.add(wingL, wingR);
  const flocks = [{ a: 0, cx: 40, cz: -30, r: 55, h: 34, w: 0.09 }, { a: 2, cx: -90, cz: 60, r: 70, h: 42, w: -0.07 }];
  const birds = [];
  for (let i = 0; i < NB; i++) birds.push({ flock: flocks[i % 2], rank: i >> 1, ph: R() * 6.283, flap: 7 + R() * 3 });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

  let t = 0;
  const tmp = new THREE.Vector3();
  function update(dt, camera, env, px, pz, sunDir) {
    t += dt;
    const { day, night, storm } = env;
    const cam = camera.position;
    // clouds
    for (const L of layers) {
      L.m.position.set(cam.x, L.y, cam.z);
      L.uniforms.uOffset.value.set(cam.x / 5200 * L.scale + t * 0.0022 * L.speed, -cam.z / 5200 * L.scale + t * 0.0009 * L.speed);
      const lit = lerp(0.12, 1, day), dusk = clamp(1 - Math.abs(sunDir.y - 0.05) / 0.22, 0, 1);
      L.uniforms.uColor.value.setRGB(lit, lit * (1 - dusk * 0.25), lit * (1 - dusk * 0.5)).lerp(tmp.set(0.42, 0.45, 0.5).multiplyScalar(lerp(0.25, 1, day)), storm);
      L.uniforms.uOpacity.value = L.base * (0.75 + storm * 0.3);
    }
    // sun and moon discs
    const sunUp = clamp((sunDir.y + 0.08) / 0.2, 0, 1);
    sunHalo.position.copy(cam).addScaledVector(sunDir, 2600); sunCore.position.copy(sunHalo.position);
    sunHalo.material.opacity = sunUp * (1 - storm * 0.9) * 0.85; sunCore.material.opacity = sunUp * (1 - storm * 0.95);
    const low = clamp(1 - sunDir.y / 0.3, 0, 1);
    sunCore.material.color.setRGB(1, 1 - low * 0.35, 1 - low * 0.6);
    tmp.set(-sunDir.x, Math.max(0.3, -sunDir.y), -sunDir.z).normalize();
    moon.position.copy(cam).addScaledVector(tmp, 2600);
    moon.material.opacity = night * (1 - storm);
    // fireflies
    const glow = night * (1 - storm);
    flies.material.opacity = glow;
    if (glow > 0.01) {
      for (let i = 0; i < NF; i++) {
        const f = fBase[i];
        if (f.far || Math.hypot(f.x - px, f.z - pz) > 48) {
          const a = R() * 6.283, d = 6 + R() * 36; f.x = px + Math.cos(a) * d; f.z = pz + Math.sin(a) * d; f.h = getHeight(f.x, f.z); f.far = f.h < 0.8;
          if (f.far) continue;
        }
        f.x += Math.sin(t * f.sp + f.ph) * dt * 0.6; f.z += Math.cos(t * f.sp * 0.8 + f.ph) * dt * 0.6;
        const y = f.h + 0.5 + Math.sin(t * 1.1 * f.sp + f.ph * 2) * 0.5;
        const b = Math.max(0, Math.sin(t * 2.2 * f.sp + f.ph * 3)) ** 3;
        fPos.set([f.x, y, f.z], i * 3); fCol.set([0.85 * b, 1 * b, 0.35 * b], i * 3);
      }
      fGeo.attributes.position.needsUpdate = fGeo.attributes.color.needsUpdate = true;
    }
    // pollen
    const sunny = day * (1 - storm) * 0.55;
    pollen.material.opacity = sunny;
    if (sunny > 0.01) {
      for (let i = 0; i < NP; i++) {
        const s = pSeed[i];
        const x = cam.x + ((s.x + t * 0.35 + Math.sin(t * 0.5 + s.ph) * 0.4 - cam.x) % 24 + 24) % 24 - 12;
        const z = cam.z + ((s.z + t * 0.2 - cam.z) % 24 + 24) % 24 - 12;
        const y = getHeight(x, z) + 0.3 + ((s.y + Math.sin(t * 0.7 + s.ph) * 0.6 + t * 0.05) % 7 + 7) % 7;
        pPos.set([x, y, z], i * 3);
      }
      pGeo.attributes.position.needsUpdate = true;
    }
    // birds
    const birdsOn = day > 0.3 && storm < 0.5;
    wingL.visible = wingR.visible = birdsOn;
    if (birdsOn) {
      for (const F of flocks) F.a += dt * F.w;
      birds.forEach((b, i) => {
        const F = b.flock, back = b.rank * 2.2, side = (i & 1 ? 1 : -1) * b.rank * 1.6;
        const a = F.a - back / F.r;
        const x = F.cx + Math.cos(a) * (F.r + side), z = F.cz + Math.sin(a) * (F.r + side);
        const y = Math.max(getHeight(x, z) + 18, F.h) + Math.sin(t * 0.9 + b.ph) * 1.5;
        const heading = a + Math.PI / 2 * Math.sign(F.w);
        const flap = Math.sin(t * b.flap + b.ph) * 0.75;
        for (const [mesh, sgn] of [[wingL, 1], [wingR, -1]]) {      // wings hinge about the body (local z), mirrored left/right
          _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, heading, flap * sgn)), _s.set(sgn, 1, 1));
          mesh.setMatrixAt(i, _m);
        }
      });
      wingL.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = true;
    }
  }
  return { update, flocks };
}
