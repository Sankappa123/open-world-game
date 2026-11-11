import * as THREE from 'three';
import { createWorld, getHeight, slopeY, collide, addCollider, LIMIT, SIZE, riverX } from './world.js';
import { loadNature } from './nature.js';
import { loadAnimals, makeAnimal } from './animals.js';
import { makeSpear, makeStructure, glowM } from './entities.js';
import { loadPeople, makeHuman } from './people.js';
import { clamp, lerp, mat } from './util.js';

const $ = (id) => document.getElementById(id);
const rand = Math.random;
const SAVE = 'hearthborn-save-v1';

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 5000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
camera.layers.enable(1);
await Promise.all([loadNature(), loadPeople(), loadAnimals()]);
const world = createWorld(scene, renderer);
const SWIM_Y = -0.1;

// ---------- state ----------
const ITEMS = { stick: 'Sticks', stone: 'Stones', fiber: 'Fibre', berry: 'Berries', wood: 'Timber', clay: 'Clay', brick: 'Bricks', meat: 'Raw meat', cooked: 'Cooked meat', hide: 'Hides', grain: 'Grain', bread: 'Flatbread' };
const fresh = () => ({
  ch: 0, inv: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 0])), c: {}, tools: {},
  hp: 100, food: 65, water: 65, warm: 100, stam: 100, pin: null, time: 7.5, day: 1, structs: [], village: false, px: 0, pz: 4,
});
let S = fresh();
const cnt = (k) => S.c[k] || 0;
const bump = (k, n = 1) => { S.c[k] = cnt(k) + n; };
const structs = [];
const has = (kind) => structs.some((s) => s.kind === kind && s.rise >= 1);
let playing = false, menuOpen = false, busy = false, clock = 0;

// ---------- story ----------
const CH = [
  { title: 'Awakening', goals: [['Gather 3 sticks', () => cnt('stick') >= 3], ['Gather 3 stones', () => cnt('stone') >= 3], ['Pick berries and eat (F)', () => cnt('ate') >= 1], ['Drink from the river', () => cnt('drank') >= 1]],
    lines: [['', 'Long before the first word was written, two people walked out of the cold hills into a green valley.'], ['Sena', 'The river is close, Aro. And look — berries. We could stay here.'], ['Aro', 'Then we begin with our hands. Sticks, stones, and something to eat.']] },
  { title: 'The First Fire', goals: [['Cut reeds by the river for fibre', () => cnt('fiber') >= 2], ['Craft a campfire (Tab) and place it', () => has('fire')]],
    lines: [['Sena', 'The sun will not stay. We need fire before the dark comes.'], ['Aro', 'Dry sticks and a ring of stones. I will make it.']] },
  { title: 'The Hunt', goals: [['Craft a hunting spear', () => !!S.tools.spear], ['Hunt a deer — sneak close, then throw', () => cnt('deer') >= 1], ['Cook the meat at the fire', () => cnt('cook') >= 1], ['Eat a cooked meal (F)', () => cnt('meal') >= 1]],
    lines: [['Sena', 'Berries will not carry us through the cold. There are deer beyond the trees.'], ['Aro', 'A sharp stone, a straight branch, reed to bind them. I will move low — they hear everything.']] },
  { title: 'Shelter', goals: [['Craft a stone axe', () => !!S.tools.axe], ['Fell trees for 12 timber', () => cnt('wood') >= 12], ['Build a thatch hut', () => has('hut')], ['Sleep in the hut', () => cnt('slept') >= 1]],
    lines: [['Sena', 'A fire is not a home. The rain will come, and the wind after it.'], ['Aro', 'Then I will cut timber, and we will raise a roof.']] },
  { title: 'Clay and Flame', goals: [['Dig 8 clay at the riverbank', () => cnt('clay') >= 8], ['Build a kiln', () => has('kiln')], ['Fire 24 bricks in the kiln', () => cnt('brick') >= 24]],
    lines: [['Sena', 'Look how the river mud hardens beside the fire. Like stone.'], ['Aro', 'Clay. If we bake it hot enough, we can shape our own stone.']] },
  { title: 'A Home of Brick', goals: [['Build the brick house', () => has('house')]],
    lines: [['Aro', 'Walls that no wind can push over. Walls that will stand after us.'], ['Sena', 'Build it where we can see the river.']] },
  { title: 'Seeds of Tomorrow', goals: [['Gather 6 wild grain', () => cnt('grain') >= 6], ['Till a farm plot', () => has('farm')], ['Harvest your first crop', () => cnt('harvest') >= 1], ['Build a well', () => has('well')]],
    lines: [['Sena', 'The grass with the heavy heads — its seeds fall and grow again. What if we planted them ourselves?'], ['Aro', 'Then we would never need to wander again.']] },
  { title: 'The Village', goals: [], epilogue: true,
    lines: [['', 'Seasons turned into years. Others followed the smoke of the hearth, and stayed.'], ['', 'Children were born who never knew the cold hills.'], ['', 'From one fire, a village. From a village, everything that came after.'], ['Sena', 'The valley is ours, Aro. Keep building.']] },
];
const RECIPES = [
  { id: 'fire', name: 'Campfire', desc: 'Warmth at night and a place to cook.', cost: { stick: 4, stone: 3 }, ch: 1, place: true },
  { id: 'spear', name: 'Hunting spear', desc: 'Right-click to throw. Sneak (C) to get close to deer.', cost: { stick: 2, stone: 1, fiber: 1 }, ch: 2 },
  { id: 'axe', name: 'Stone axe', desc: 'Lets you fell trees for timber.', cost: { stick: 1, stone: 2, fiber: 2 }, ch: 3 },
  { id: 'hut', name: 'Thatch hut', desc: 'Shelter from the cold. Sleep here.', cost: { wood: 12, fiber: 8 }, ch: 3, place: true },
  { id: 'kiln', name: 'Kiln', desc: 'Bakes clay into bricks.', cost: { stone: 10, clay: 6 }, ch: 4, place: true },
  { id: 'house', name: 'Brick house', desc: 'A permanent home.', cost: { brick: 24, wood: 10 }, ch: 5, place: true },
  { id: 'farm', name: 'Farm plot', desc: 'Plant grain and harvest it again and again.', cost: { wood: 4, grain: 6 }, ch: 6, place: true },
  { id: 'well', name: 'Well', desc: 'Clean water close to home.', cost: { brick: 16, stone: 6 }, ch: 6, place: true },
];

// ---------- audio ----------
const A = {
  ctx: null,
  init() {
    if (A.ctx) return;
    try {
      const c = (A.ctx = new AudioContext());
      A.out = c.createGain(); A.out.gain.value = 0.7; A.out.connect(c.destination);
      A.buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = A.buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = A.buf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      A.wind = c.createGain(); A.wind.gain.value = 0.07;
      src.connect(lp).connect(A.wind).connect(A.out); src.start();
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.035;
      lfo.connect(lg).connect(A.wind.gain); lfo.start();
      const cr = c.createOscillator(); cr.frequency.value = 4300;
      const am = c.createOscillator(), amg = c.createGain(), crg = c.createGain(); am.type = 'square'; am.frequency.value = 17;
      A.cricket = c.createGain(); A.cricket.gain.value = 0; crg.gain.value = 0;
      am.connect(amg).connect(crg.gain); amg.gain.value = 1;
      cr.connect(crg).connect(A.cricket).connect(A.out); cr.start(); am.start();
      const rs = c.createBufferSource(), hp = c.createBiquadFilter(); rs.buffer = A.buf; rs.loop = true; hp.type = 'highpass'; hp.frequency.value = 1700;
      A.rain = c.createGain(); A.rain.gain.value = 0;
      rs.connect(hp).connect(A.rain).connect(A.out); rs.start(0, 0.7);
    } catch { A.ctx = null; }
  },
  hit(freq, dur, vol) {
    if (!A.ctx) return;
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f).connect(g).connect(A.out); s.start(c.currentTime, rand()); s.stop(c.currentTime + dur);
  },
  tone(freq, dur, vol, delay = 0) {
    if (!A.ctx) return;
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(A.out); o.start(t); o.stop(t + dur);
  },
};

// ---------- HUD ----------
function toast(text) {
  const d = document.createElement('div');
  d.textContent = text; $('toasts').append(d);
  setTimeout(() => d.remove(), 3300);
  while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
}
const subs = []; let subT = 0;
const say = (who, text) => subs.push([who, text]);
function updateSubs(dt) {
  subT -= dt;
  if (subT > 0) return;
  const el = $('sub');
  if (!subs.length) { el.classList.remove('on'); return; }
  const [who, text] = subs.shift();
  el.innerHTML = (who ? `<b>${who}</b>` : '') + text;
  el.classList.add('on');
  subT = Math.max(3.8, text.length * 0.065);
}
function drawInv() {
  let h = '';
  if (S.tools.spear) h += '<span class="tool">Spear</span>';
  if (S.tools.axe) h += '<span class="tool">Axe</span>';
  for (const k in ITEMS) if (S.inv[k] > 0) h += `<span>${ITEMS[k]}<b>${S.inv[k]}</b></span>`;
  $('inv').innerHTML = h || '<span>Your hands are empty</span>';
  $('cross').style.display = 'block';
}
function drawQuest() {
  const ch = CH[S.ch];
  $('chapter').textContent = `${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'Epilogue'][S.ch]} · ${ch.title}`;
  $('goals').innerHTML = ch.goals.length
    ? ch.goals.map(([t, f]) => `<div class="${f() ? 'done' : ''}">${t}</div>`).join('')
    : '<div class="done">The story is told. The valley is yours.</div>';
}
function give(item, n, who) {
  S.inv[item] += n; bump(item, n);
  toast(who ? `${who} gathered ${ITEMS[item].toLowerCase()}` : `+${n} ${ITEMS[item]}`);
  drawInv();
}
function showChapter() {
  const ch = CH[S.ch];
  $('card-sub').textContent = S.ch < 7 ? `Chapter ${S.ch + 1}` : 'Epilogue';
  $('card-title').textContent = ch.title;
  $('card').classList.add('on');
  setTimeout(() => $('card').classList.remove('on'), 3800);
  A.tone(196, 2.5, 0.12); A.tone(294, 2.5, 0.09, 0.25); A.tone(392, 3, 0.07, 0.5);
  subT = Math.max(subT, 2.5);
  ch.lines.forEach((l) => say(...l));
  drawQuest();
}
function fadeTo(text, mid, hold = 2600) {
  busy = true;
  $('fade-text').textContent = text; $('fade').classList.add('on');
  setTimeout(() => { mid(); setTimeout(() => { $('fade').classList.remove('on'); busy = false; }, hold); }, 1300);
}
function save() {
  S.structs = structs.map((s) => ({ k: s.kind, x: s.x, z: s.z, r: s.rot, g: s.grow }));
  S.px = P.pos.x; S.pz = P.pos.z;
  try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch {}
}

// ---------- characters ----------
const P = { pos: new THREE.Vector3(0, 0, 4), face: Math.PI, h: makeHuman({ hairColor: 0x3d2f26 }), sneak: false, speed: 0, cool: 0, step: 0, vx: 0, vz: 0, vy: 0, jy: 0, air: false, auto: false, tired: false };
const N = { pos: new THREE.Vector3(2, 0, 2.5), face: 0, h: makeHuman({ female: true, hairColor: 0x4a382c }), node: null, wait: 4, speed: 0, act: 0 };
scene.add(P.h.root, N.h.root);
const villagers = [];
let camYaw = 0.4, camPitch = 0.22, camDist = 4.8, view = 'tpp', jumpTap = false;
const pitchMin = () => (view === 'fpp' ? -1.25 : -0.5);
const turn = (a, b, t) => a + ((((b - a + Math.PI) % 6.2832) + 6.2832) % 6.2832 - Math.PI) * t;
function walkTo(e, tx, tz, speed, dt, stop = 0.4) {
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
  if (d <= stop) { e.speed = 0; return true; }
  if (e.swim) speed = Math.min(speed, 2.3);
  e.pos.x += (dx / d) * speed * dt; e.pos.z += (dz / d) * speed * dt;
  collide(e.pos, 0.3);
  e.face = turn(e.face, Math.atan2(dx, dz), Math.min(1, dt * 8));
  e.speed = speed;
  return false;
}
function settle(e, dt, crouch) {
  const g = getHeight(e.pos.x, e.pos.z);
  e.swim = g < -1.15;                       // deeper than the waist: swim at the surface
  e.pos.y = (e.swim ? SWIM_Y : g) + (e.jy || 0);
  e.h.root.position.copy(e.pos);
  e.h.root.rotation.y = e.face;
  e.h.animate(dt, e.speed, crouch && !e.swim, e.swim, !!e.air);
}
// ---------- spear ----------
const proj = { m: makeSpear(), vel: new THREE.Vector3(), on: false, stuck: 0 };
proj.m.visible = false; scene.add(proj.m);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function throwSpear() {
  if (!S.tools.spear || P.cool > 0 || busy || P.swim) return;
  camera.getWorldDirection(_v);
  P.face = Math.atan2(_v.x, _v.z);
  proj.m.position.copy(P.pos).add(_v2.set(0, 1.7, 0)).addScaledVector(_v, 0.5);
  _v2.copy(camera.position).addScaledVector(_v, 34);            // the point under the crosshair
  _v.copy(_v2).sub(proj.m.position).normalize(); _v.y += 0.035; _v.normalize();
  proj.vel.copy(_v).multiplyScalar(34);
  proj.on = true; proj.stuck = 0; proj.m.visible = true;
  P.cool = 1.3; P.h.swing('strike'); P.h.spear.visible = false;
  A.hit(1400, 0.25, 0.25);
}
function updateSpear(dt) {
  if (!proj.on) return;
  const m = proj.m;
  if (proj.stuck > 0) { proj.stuck -= dt; if (proj.stuck <= 0) { proj.on = false; m.visible = false; } return; }
  proj.vel.y -= 6 * dt;
  m.position.addScaledVector(proj.vel, dt);
  m.lookAt(_v.copy(m.position).add(proj.vel));
  for (const o of animals) {
    if (o.state !== 'live') continue;
    const p = o.root.position;
    if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < 1.05 && m.position.y > p.y + 0.2 && m.position.y < p.y + 2.1) {
      proj.on = false; m.visible = false;
      hurt(o, 10);
      return;
    }
  }
  if (m.position.y < getHeight(m.position.x, m.position.z) + 0.05) { proj.stuck = 4; A.hit(500, 0.12, 0.3); }
}

// ---------- animals ----------
const animals = [], herds = [];
const HP = { deer: 4, stag: 6, wolf: 6, fox: 2, cow: 60 };
const LOOT = { deer: [3, 1], stag: [4, 2], wolf: [1, 2], fox: [0, 1], cow: [5, 2] };
const bank = (x, z) => Math.sign(x - riverX(z));
function landSpot(cx, cz, rmin, rmax, far = 0, side = 0) {
  for (let i = 0; i < 120; i++) {
    const a = rand() * 6.283, r = rmin + rand() * (rmax - rmin), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.abs(x) < LIMIT && Math.abs(z) < LIMIT && getHeight(x, z) > 1.6 && slopeY(x, z) > 0.85
      && Math.hypot(x - P.pos.x, z - P.pos.z) > far && (!side || bank(x, z) === side)) return [x, z];
  }
  return [cx, cz];
}
function spawn(kind, x, z, extra = {}) {
  const a = makeAnimal(kind);
  const o = { kind, a, root: a.root, hp: HP[kind], state: 'live', timer: rand() * 6, dir: rand() * 6.283, speed: 0, flee: 0, stun: 0, bite: 0, pending: 0, avoid: 0, looted: false, graze: rand() < 0.5, ...extra };
  o.root.position.set(x, getHeight(x, z), z);
  o.root.rotation.y = o.dir;
  scene.add(o.root); animals.push(o);
  return o;
}
function remove(o) { scene.remove(o.root); const i = animals.indexOf(o); if (i >= 0) animals.splice(i, 1); }
for (let i = 0; i < 3; i++) {
  const [x, z] = landSpot(0, 0, 55, 170, 40), herd = { x, z, tx: x, tz: z, timer: 20 + rand() * 40, flee: 0, side: bank(x, z) };
  herds.push(herd);
  for (let j = 0; j < 5; j++) { const ox = (rand() - 0.5) * 16, oz = (rand() - 0.5) * 16; spawn(j ? 'deer' : 'stag', x + ox, z + oz, { herd, ox, oz }); }
}
for (let i = 0; i < 3; i++) { const [x, z] = landSpot(0, 0, 40, 180, 30); spawn('fox', x, z); }

function alarm(o) {
  const p = o.root.position;
  if (o.herd) {
    const h = o.herd;
    if (h.flee > 0) return;
    const a = Math.atan2(h.x - P.pos.x, h.z - P.pos.z) + (rand() - 0.5);
    let x = h.x + Math.sin(a) * 60, z = h.z + Math.cos(a) * 60;
    if (getHeight(x, z) < 1.6 || Math.abs(x) > LIMIT || Math.abs(z) > LIMIT || bank(x, z) !== h.side) [x, z] = landSpot(h.x, h.z, 45, 90, 45, h.side);
    Object.assign(h, { tx: x, tz: z, flee: 7, timer: 40 + rand() * 40 });
  } else { o.flee = 5; o.dir = Math.atan2(p.x - P.pos.x, p.z - P.pos.z) + (rand() - 0.5) * 0.7; }
}
function hurt(o, dmg) {
  if (o.state !== 'live') return;
  o.hp -= dmg;
  A.hit(260, 0.2, 0.7);
  if (o.hp <= 0) {
    o.state = 'dead'; o.deadT = 0; o.a.play('Death', 'hold');
    if (o.kind === 'wolf') { bump('wolf'); toast('The wolf is dead'); }
    else if (o.kind === 'deer' || o.kind === 'stag') {
      bump('deer'); toast(`The ${o.kind} falls`);
      if (cnt('deer') === 1) say('Sena', 'You did it! We will eat well tonight. Bring the meat to the fire.');
    }
    return;
  }
  o.a.play('Idle_HitReact1', true, 1.4); o.stun = 0.45;
  if (o.kind !== 'wolf' && !o.tame) alarm(o);
}
function revive(o) {
  const [x, z] = o.herd ? [o.herd.x + o.ox, o.herd.z + o.oz] : landSpot(0, 0, 50, 180, 40);
  Object.assign(o, { state: 'live', hp: HP[o.kind], looted: false, speed: 0 });
  o.root.position.set(x, getHeight(x, z), z); o.root.visible = true; o.a.play('Idle');
}
function step(o, speed, dt) {
  const p = o.root.position, nx = p.x + Math.sin(o.dir) * speed * dt, nz = p.z + Math.cos(o.dir) * speed * dt;
  if (getHeight(nx, nz) < 0.4 || Math.abs(nx) > LIMIT || Math.abs(nz) > LIMIT || slopeY(nx, nz) < 0.6) { o.dir += 0.9 + rand() * 0.8; o.avoid = 1; return; }
  p.x = nx; p.z = nz; collide(p, 0.4); p.y = getHeight(p.x, p.z);
}
function wolfBrain(o, dist, dx, dz, dt) {
  const p = o.root.position;
  o.bite -= dt;
  o.attacking = Math.max(0, (o.attacking || 0) - dt);
  if (o.pending > 0 && (o.pending -= dt) <= 0 && dist < 2.7 && !busy) { S.hp = Math.max(0, S.hp - 6); hurtFlash = 1; A.hit(180, 0.3, 0.9); }
  if (o.leave) { if (!o.avoid) o.dir = Math.atan2(dx, dz); if (dist > 95) remove(o); return 7; }
  const safe = P.swim || structs.some((s) => s.kind === 'fire' && s.rise >= 1 && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 8);
  if (safe) {                               // fire and deep water keep them circling at a distance
    o.ang = (o.ang ?? Math.atan2(dx, dz)) + dt * 0.25;
    const tx = P.pos.x + Math.sin(o.ang) * 13, tz = P.pos.z + Math.cos(o.ang) * 13;
    if (!o.avoid) o.dir = Math.atan2(tx - p.x, tz - p.z);
    return Math.hypot(tx - p.x, tz - p.z) > 2 ? (dist < 9 ? 6 : 2.2) : 0;
  }
  o.ang = undefined;
  if (!o.avoid) o.dir = Math.atan2(-dx, -dz);
  if (dist < 1.9) {
    if (o.bite <= 0 && clock > packBite) { packBite = clock + 1.1; o.bite = 2; o.pending = 0.35; o.attacking = 0.75; o.a.play('Attack', true, 1.3); }
    return 0;
  }
  return dist > 3 ? 6.8 : 3;
}
function updateAnimal(o, dt) {
  const p = o.root.position;
  o.a.update(dt);
  if (o.state === 'dead') { o.deadT += dt; if (o.looted && clock > o.respawn) revive(o); return; }
  if (o.stun > 0) { o.stun -= dt; return; }
  o.avoid = Math.max(0, o.avoid - dt);
  const dx = p.x - P.pos.x, dz = p.z - P.pos.z, dist = Math.hypot(dx, dz);
  let want = 0;
  if (o.kind === 'wolf') want = wolfBrain(o, dist, dx, dz, dt);
  else {
    if (!o.tame && dist < (P.sneak ? 7 : P.speed > 4 ? 30 : 17)) alarm(o);
    if (o.herd) {
      const tx = o.herd.x + o.ox, tz = o.herd.z + o.oz, d = Math.hypot(tx - p.x, tz - p.z);
      want = o.herd.flee > 0 ? 9.5 : d > 18 ? 6 : d > 3 ? 1.3 : 0;
      if (want && !o.avoid) o.dir = Math.atan2(tx - p.x, tz - p.z);
    } else {
      o.flee -= dt; o.timer -= dt;
      if (o.timer <= 0) {
        o.walk = !o.walk; o.timer = 3 + rand() * 6;
        if (o.walk) o.dir += (rand() - 0.5) * 2.5;
        if (o.home && Math.hypot(p.x - o.home.x, p.z - o.home.z) > 16) { o.dir = Math.atan2(o.home.x - p.x, o.home.z - p.z); o.walk = true; }
      }
      want = o.flee > 0 ? 8.5 : o.walk ? 1.1 : 0;
    }
  }
  o.speed += (want - o.speed) * Math.min(1, dt * 4);
  if (o.speed > 0.08) step(o, o.speed, dt);
  o.root.rotation.y = turn(o.root.rotation.y, o.dir, Math.min(1, dt * 6));
  if (o.attacking) return;
  if (o.speed > 3.5) o.a.play('Gallop', false, o.speed / 8);
  else if (o.speed > 0.25) o.a.play('Walk', false, 1.1);
  else {
    o.t2 = (o.t2 || 0) - dt;
    if (o.t2 <= 0) { o.t2 = 4 + rand() * 6; o.graze = !o.graze; }
    o.a.play(o.graze && o.kind !== 'wolf' ? 'Eating' : 'Idle');
  }
}

// ---------- events ----------
const EV = { next: 140, storm: 0 };
let hurtFlash = 0, packBite = 0;
function banner(title, text) {
  const el = $('event');
  el.innerHTML = `<b>${title}</b>${text}`; el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 7000);
  A.tone(147, 2.4, 0.12); A.tone(220, 2.4, 0.08, 0.25);
}
const RAIN = 1500, rainPos = new Float32Array(RAIN * 6);
for (let i = 0; i < RAIN; i++) { const x = (rand() - 0.5) * 46, y = rand() * 26, z = (rand() - 0.5) * 46; rainPos.set([x, y, z, x + 0.06, y - 0.8, z], i * 6); }
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xb4c8d8, transparent: true, opacity: 0, depthWrite: false }));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const EVENTS = {
  storm() {
    EV.storm = 75 + rand() * 45;
    banner('Storm', 'Rain sweeps the valley. Get under a roof or stay by the fire.');
    say('Sena', 'The sky is turning. We should not be out in this.');
  },
  wolves() {
    const n = S.ch >= 5 ? 4 : 3, a = rand() * 6.283;
    for (let i = 0; i < n; i++) { const [x, z] = landSpot(P.pos.x + Math.sin(a) * 46, P.pos.z + Math.cos(a) * 46, 0, 12); spawn('wolf', x, z); }
    banner('Wolves', 'A pack has caught your scent. Stay by the fire — or fight.');
    say('Sena', has('fire') ? 'Wolves! Get to the fire — they fear it.' : 'Wolves! Stay close to me!');
  },
  herd() {
    const h = [...herds].sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0];
    const [x, z] = landSpot(P.pos.x, P.pos.z, 24, 38);
    Object.assign(h, { tx: x, tz: z, timer: 90, side: bank(x, z) });
    banner('The great herd', 'Deer are crossing close by. Move quietly.');
  },
};
function updateEvents(dt) {
  const E = world.env;
  EV.storm -= dt;
  E.storm = clamp(E.storm + (EV.storm > 0 ? dt : -dt) * 0.12, 0, 1);
  rain.visible = E.storm > 0.02;
  if (rain.visible) {
    rain.material.opacity = E.storm * 0.45;
    rain.position.set(camera.position.x, camera.position.y - 9, camera.position.z);
    for (let i = 0; i < RAIN; i++) {
      let y = rainPos[i * 6 + 1] - 30 * dt;
      if (y < 0) y += 26;
      rainPos[i * 6 + 1] = y; rainPos[i * 6 + 4] = y - 0.8;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  if (A.ctx) { A.rain.gain.value = E.storm * 0.11; if (E.storm > 0.6 && rand() < dt * 0.06) A.hit(70, 3.2, 1); }
  hurtFlash = Math.max(0, hurtFlash - dt * 1.4);
  $('hurt').style.opacity = hurtFlash;
  const wolves = animals.filter((o) => o.kind === 'wolf' && o.state === 'live');
  if (E.night < 0.3) for (const w of wolves) w.leave = true;
  for (const h of herds) {
    h.flee -= dt; h.timer -= dt;
    if (h.timer <= 0) { [h.tx, h.tz] = landSpot(h.x, h.z, 40, 110, 0, h.side); h.timer = 50 + rand() * 60; }
    const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz), sp = (h.flee > 0 ? 9.5 : 1.15) * dt;
    if (d > sp) { h.x += (dx / d) * sp; h.z += (dz / d) * sp; }
  }
  EV.next -= dt;
  if (EV.next > 0 || busy) return;
  EV.next = 160 + rand() * 130;
  if (S.ch < 1) return;
  if (E.night > 0.6) { if (S.ch >= 2 && !wolves.length) EVENTS.wolves(); else if (EV.storm <= 0) EVENTS.storm(); }
  else if (rand() < 0.45 && EV.storm <= 0) EVENTS.storm();
  else EVENTS.herd();
}

// ---------- melee ----------
let hitT = 0, hitDmg = 0, punchSide = 0;
function attack() {
  if (P.cool > 0 || busy || P.swim) return;
  camera.getWorldDirection(_v);
  P.face = Math.atan2(_v.x, _v.z);
  const axe = !!S.tools.axe;
  P.h.swing(axe ? 'strike' : (punchSide ^= 1) ? 'jab' : 'cross');
  P.h.spear.visible = false; P.h.axe.visible = axe;
  P.cool = axe ? 0.75 : 0.48; hitT = axe ? 0.3 : 0.2; hitDmg = axe ? 4 : 2;
  A.hit(1100, 0.1, 0.15);
}
function landHit() {
  const fx = Math.sin(P.face), fz = Math.cos(P.face);
  let best = null, bd = 2.5;
  for (const o of animals) {
    if (o.state !== 'live') continue;
    const dx = o.root.position.x - P.pos.x, dz = o.root.position.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = o; }
  }
  if (best) hurt(best, hitDmg);
}

// ---------- building ----------
function placeStruct(kind, x, z, rot, instant, grow) {
  const st = makeStructure(kind);
  Object.assign(st, { x, z, rot, rise: instant ? 1 : 0 });
  if (grow != null) st.grow = grow;
  st.group.position.set(x, getHeight(x, z), z);
  st.group.rotation.y = rot;
  scene.add(st.group);
  structs.push(st);
  if (st.solid) addCollider({ x, z, r: st.radius * (kind === 'house' ? 0.8 : 0.9) });
  world.clear(x, z, st.radius + 0.4);
  for (const f of world.fields) for (const n of f.nodes) if (n.alive && Math.hypot(n.x - x, n.z - z) < st.radius + 0.6) { n.gone = true; f.set(n, false); }
  return st;
}
let placing = null;
const ghost = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x9be37a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, fog: false }));
ghost.visible = false; scene.add(ghost);
const R_OF = { fire: 0.8, hut: 2.3, kiln: 1.4, house: 4.4, farm: 3.1, well: 1.3 };
function ghostSpot() {
  const r = R_OF[placing.id], d = r + 2.4;
  const x = P.pos.x - Math.sin(camYaw) * d, z = P.pos.z - Math.cos(camYaw) * d, h = getHeight(x, z);
  let ok = h > 0.9 && Math.abs(x) < LIMIT && Math.abs(z) < LIMIT;
  for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(getHeight(x + ox * 0.8, z + oz * 0.8) - h) > (r > 2 ? 0.75 : 0.5)) ok = false;
  for (const s of structs) if (Math.hypot(s.x - x, s.z - z) < s.radius + r + 0.4) ok = false;
  return { x, z, h, ok, r };
}
function confirmPlace() {
  const g = ghostSpot();
  if (!g.ok) { toast('Cannot build here — find flat, dry, open ground'); return; }
  for (const k in placing.cost) S.inv[k] -= placing.cost[k];
  placeStruct(placing.id, g.x, g.z, Math.atan2(P.pos.x - g.x, P.pos.z - g.z), false);
  toast(`Building: ${placing.name}`);
  A.hit(220, 0.5, 0.6); A.hit(700, 0.3, 0.3);
  placing = null; ghost.visible = false;
  drawInv(); save();
}
const canAfford = (r) => Object.entries(r.cost).every(([k, n]) => S.inv[k] >= n);
function craft(r) {
  if (!canAfford(r)) return;
  toggleMenu(false);
  if (r.place) { placing = r; toast('Choose a spot — click or E to build, Q to cancel'); return; }
  for (const k in r.cost) S.inv[k] -= r.cost[k];
  S.tools[r.id] = true;
  toast(`Crafted: ${r.name}`); A.hit(900, 0.2, 0.4);
  drawInv(); drawQuest();
}
function toggleMenu(on = !menuOpen) {
  if (!playing || busy || mapOpen) return;
  menuOpen = on;
  $('craft').classList.toggle('on', on);
  if (on) {
    document.exitPointerLock?.();
    const box = $('recipes'); box.innerHTML = '';
    for (const r of RECIPES) {
      if (r.ch > S.ch) continue;
      if (!r.place && S.tools[r.id]) continue;
      const b = document.createElement('button');
      b.className = 'recipe'; b.disabled = !canAfford(r);
      b.innerHTML = `<strong>${r.name}</strong><em>${r.desc}</em><span class="cost">${Object.entries(r.cost).map(([k, n]) => `<span class="${S.inv[k] >= n ? 'ok' : 'no'}">${ITEMS[k]} ${S.inv[k]}/${n}</span>`).join('<br>')}</span>`;
      b.onclick = () => craft(r);
      box.append(b);
    }
    if (!box.children.length) box.innerHTML = '<p style="color:var(--dim)">Nothing to make yet. Follow the story — new ideas will come.</p>';
  } else lock();
}

// ---------- interaction ----------
const respawns = [];
const NODE = {
  stick: ['Pick up stick', () => give('stick', 1), 260],
  stone: ['Pick up stone', () => give('stone', 1), 300],
  berry: ['Pick berries', () => give('berry', 3), 170],
  reed: ['Cut reeds', () => give('fiber', 2), 130],
  grain: ['Gather wild grain', () => give('grain', 2), 200],
  clay: ['Dig clay', () => give('clay', 2), 0],
};
function take(n) {
  n.field.set(n, false);
  if (NODE[n.field.kind]?.[2] || n.field.kind === 'tree') respawns.push({ n, at: clock + (NODE[n.field.kind]?.[2] || 420) });
}
function findTarget() {
  const p = P.pos;
  let best = null, bd = 1e9;
  for (const o of animals) {
    if (o.state !== 'dead' || o.looted || o.deadT < 1.2) continue;
    if (Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < 2.7) return { label: `Butcher the ${o.kind}`, key: true, act() {
      o.looted = true; o.root.visible = false; o.respawn = clock + 80;
      const [meat, hide] = LOOT[o.kind];
      if (meat) give('meat', meat);
      give('hide', hide); P.h.swing(); A.hit(600, 0.2, 0.4);
      if (o.kind === 'wolf' || o.tame) remove(o);
    } };
  }
  for (const f of world.fields) for (const n of f.nodes) {
    if (!n.alive) continue;
    const dx = n.x - p.x, dz = n.z - p.z;
    if (dx > 3.2 || dx < -3.2 || dz > 3.2 || dz < -3.2) continue;
    const d = Math.hypot(dx, dz) - (f.kind === 'tree' ? 0.9 : 0);
    if (d < 2 && d < bd) { bd = d; best = n; }
  }
  for (const s of structs) {
    if (s.rise < 1) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z) - s.radius;
    if (d < 1.6 && d < bd + 0.6) return structTarget(s);
  }
  if (best) {
    const k = best.field.kind;
    if (k === 'tree') {
      if (!S.tools.axe) return { label: 'You need a stone axe to fell trees' };
      return { label: 'Chop tree', key: true, act() {
        P.h.swing('strike'); P.h.axe.visible = true; P.h.spear.visible = false; P.cool = Math.max(P.cool, 0.6);
        A.hit(260, 0.18, 0.7); A.hit(1500, 0.05, 0.3);
        if (--best.hp <= 0) { best.hp = 4; take(best); give('wood', 3); give('stick', 1); A.hit(120, 0.8, 0.7); }
      } };
    }
    return { label: NODE[k][0], key: true, act() { P.h.swing(); NODE[k][1](); if (k !== 'clay') take(best); A.hit(k === 'clay' ? 300 : 1700, 0.09, 0.3); } };
  }
  if (getHeight(p.x, p.z) < 0.45) return { label: 'Drink from the river', key: true, act() { S.water = Math.min(100, S.water + 40); bump('drank'); A.hit(2600, 0.25, 0.2); toast('You drink the cold water'); } };
  return null;
}
function structTarget(s) {
  const t = (label, act) => ({ label, act, key: !!act });
  switch (s.kind) {
    case 'fire':
      if (S.inv.meat > 0) return t('Cook meat', () => { S.inv.meat--; S.inv.cooked++; bump('cook'); toast('+1 Cooked meat'); A.hit(3000, 0.6, 0.25); drawInv(); });
      if (S.inv.grain >= 2) return t('Bake flatbread (2 grain)', () => { S.inv.grain -= 2; S.inv.bread++; toast('+1 Flatbread'); A.hit(3000, 0.4, 0.2); drawInv(); });
      return t('Campfire — bring raw meat or grain to cook');
    case 'kiln':
      if (S.inv.clay >= 2 && S.inv.wood >= 1) return t('Fire bricks (2 clay + 1 timber)', () => { S.inv.clay -= 2; S.inv.wood--; s.heat = 1; give('brick', 4); A.hit(180, 0.7, 0.5); });
      return t('Kiln — needs 2 clay and 1 timber');
    case 'hut': case 'house': return t('Sleep until dawn', sleep);
    case 'farm':
      if (s.grow >= 1) return t('Harvest the crop', () => { s.grow = 0; bump('harvest'); give('grain', 10); P.h.swing(); });
      return t(`Crop is growing… ${Math.round(s.grow * 100)}%`);
    case 'well': return t('Draw water and drink', () => { S.water = 100; bump('drank'); A.hit(2600, 0.25, 0.2); toast('Fresh water'); });
  }
}
function eat() {
  const I = S.inv;
  if (I.cooked > 0) { I.cooked--; S.food = Math.min(100, S.food + 45); S.hp = Math.min(100, S.hp + 12); bump('meal'); toast('You eat cooked meat'); }
  else if (I.bread > 0) { I.bread--; S.food = Math.min(100, S.food + 30); toast('You eat flatbread'); }
  else if (I.berry > 0) { I.berry--; S.food = Math.min(100, S.food + 9); S.water = Math.min(100, S.water + 3); bump('ate'); toast('You eat berries'); }
  else { toast(I.meat > 0 ? 'Raw meat must be cooked at a fire' : 'Nothing to eat'); return; }
  A.hit(800, 0.12, 0.3); drawInv();
}
function sleep() {
  fadeTo('You sleep. The fire burns low, and the night passes…', () => {
    S.time = 6.3; S.day++; S.hp = Math.min(100, S.hp + 45); S.warm = 100;
    S.food = Math.max(12, S.food - 16); S.water = Math.max(12, S.water - 16);
    bump('slept'); save(); toast(`Day ${S.day}`);
  });
}
function die(why) {
  fadeTo(`${why} Sena carries you back to camp and tends you until morning.`, () => {
    const f = structs.find((s) => s.kind === 'fire');
    P.pos.set(f ? f.x + 1.6 : 0, 0, f ? f.z + 1.2 : 4);
    N.pos.set(P.pos.x + 1.2, 0, P.pos.z + 0.8); N.node = null;
    for (const o of animals.filter((o) => o.kind === 'wolf')) remove(o);
    Object.assign(S, { hp: 60, food: 55, water: 60, warm: 100, time: 7, day: S.day + 1 });
  }, 3800);
}

// ---------- epilogue ----------
function spawnVillagers() {
  const home = structs.find((s) => s.kind === 'house') || { x: 0, z: 0 };
  const looks = [
    { hair: 'buzz', light: true, hairColor: 0x8a6a45 }, { female: true, hair: 'buns', hairColor: 0x7a4a32 },
    { hair: 'parted', beard: false, tint: 0xd9c0b0, hairColor: 0x2e2622 }, { female: true, light: true, hairColor: 0xa88a55 },
    { hair: 'buzz', beard: false, scale: 0.62, hairColor: 0x4a382c }, { female: true, hair: 'buns', scale: 0.58, light: true, hairColor: 0x5a4030 },
  ];
  for (let i = 0; i < 3; i++) spawn('cow', home.x + 9 + i * 3, home.z + 7 - i * 2, { tame: true, home });
  looks.forEach((look, i) => {
    const v = { pos: new THREE.Vector3(home.x + Math.cos(i) * 8, 0, home.z + Math.sin(i) * 8), face: i, h: makeHuman(look), speed: 0, wait: i, tx: home.x, tz: home.z, home };
    scene.add(v.h.root); villagers.push(v);
  });
}
function epilogue() {
  fadeTo('Many winters pass…', () => {
    const home = structs.find((s) => s.kind === 'house');
    let made = 0;
    for (let i = 0; i < 40 && made < 4; i++) {
      const a = i * 1.37 + 0.6, r = 14 + i * 1.3, x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r, h = getHeight(x, z);
      if (h < 1.2 || slopeY(x, z) < 0.95 || Math.abs(getHeight(x + 3, z) - h) > 0.6 || Math.abs(getHeight(x, z + 3) - h) > 0.6) continue;
      if (structs.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + 6)) continue;
      placeStruct('house', x, z, Math.atan2(home.x - x, home.z - z), true); made++;
    }
    S.village = true; S.time = 8; S.day += 400;
    spawnVillagers(); save();
  }, 3500);
}

// ---------- map, minimap and pins ----------
const MS = 512, mapBase = document.createElement('canvas');
mapBase.width = mapBase.height = MS;
{
  const g = mapBase.getContext('2d'), im = g.createImageData(MS, MS);
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
    const x = (i / MS - 0.5) * SIZE, z = (j / MS - 0.5) * SIZE, h = getHeight(x, z);
    let c;
    if (h < 0) c = [52 + h * 9, 104 + h * 10, 132 + h * 8];
    else if (h < 1.2) c = [176, 160, 116];
    else if (slopeY(x, z) < 0.8 || h > 34) c = [128, 124, 114];
    else { const t = Math.min(1, h / 30); c = [92 + t * 40, 128 + t * 12, 62 + t * 30]; }
    const shade = h < 0 ? 1 : clamp(0.92 + (getHeight(x - 2.5, z - 2.5) - getHeight(x + 2.5, z + 2.5)) * 0.07, 0.6, 1.25);
    im.data.set([c[0] * shade, c[1] * shade, c[2] * shade, 255], (j * MS + i) * 4);
  }
  g.putImageData(im, 0, 0);
  g.fillStyle = 'rgba(34,70,30,0.8)';
  for (const f of world.fields) if (f.kind === 'tree') for (const n of f.nodes) { g.beginPath(); g.arc((n.x / SIZE + 0.5) * MS, (n.z / SIZE + 0.5) * MS, 1.7, 0, 6.3); g.fill(); }
}
const ICON = { fire: ['#ff9a3c', 'Fire'], hut: ['#d9b46a', 'Hut'], kiln: ['#c9713f', 'Kiln'], house: ['#e8dcc0', 'Home'], farm: ['#d8c04a', 'Farm'], well: ['#6fb7d9', 'Well'] };
function marker(g, x, y, kind, s = 1) {
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.75)';
  if (kind === 'player') {           // caller rotates the context
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -8 * s); g.lineTo(6 * s, 7 * s); g.lineTo(0, 4 * s); g.lineTo(-6 * s, 7 * s); g.closePath(); g.fill(); g.stroke();
  } else if (kind === 'pin') {
    g.fillStyle = '#b05cff'; g.beginPath(); g.arc(x, y - 9 * s, 6 * s, Math.PI, 0); g.lineTo(x, y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - 9 * s, 2.2 * s, 0, 6.3); g.fill();
  } else if (ICON[kind]) {
    g.fillStyle = ICON[kind][0]; g.beginPath(); g.rect(x - 4.5 * s, y - 4.5 * s, 9 * s, 9 * s); g.fill(); g.stroke();
  } else {
    g.fillStyle = { sena: '#ffd27a', wolf: '#ff4a3c', deer: '#c98f55', villager: '#9fd0ff' }[kind] || '#ccc';
    g.beginPath(); g.arc(x, y, (kind === 'sena' ? 4.5 : 3.2) * s, 0, 6.3); g.fill(); g.stroke();
  }
}
const mini = $('mini').getContext('2d'), MR = 100, RANGE = 75;
function drawMini() {
  const g = mini, k = MR / RANGE, c = Math.cos(camYaw), s = Math.sin(camYaw);
  const at = (x, z) => { const dx = (x - P.pos.x) * k, dz = (z - P.pos.z) * k; return [dx * c - dz * s, dx * s + dz * c]; };
  g.clearRect(0, 0, MR * 2, MR * 2);
  g.save();
  g.beginPath(); g.arc(MR, MR, MR - 2, 0, 6.3); g.clip();
  g.fillStyle = '#34586a'; g.fillRect(0, 0, MR * 2, MR * 2);
  g.translate(MR, MR);
  g.save(); g.rotate(camYaw); g.scale(k, k);
  g.drawImage(mapBase, -SIZE / 2 - P.pos.x, -SIZE / 2 - P.pos.z, SIZE, SIZE);
  g.restore();
  const put = (x, z, kind, edge) => {
    let [px, py] = at(x, z); const d = Math.hypot(px, py);
    if (d > MR - 9) { if (!edge) return; px *= (MR - 9) / d; py *= (MR - 9) / d; }
    marker(g, px, py, kind);
  };
  for (const st of structs) put(st.x, st.z, st.kind, st.kind === 'house' || st.kind === 'fire');
  for (const o of animals) if (o.state === 'live' && o.kind !== 'cow') put(o.root.position.x, o.root.position.z, o.kind === 'wolf' ? 'wolf' : 'deer');
  for (const v of villagers) put(v.pos.x, v.pos.z, 'villager');
  put(N.pos.x, N.pos.z, 'sena', true);
  if (S.pin) put(S.pin.x, S.pin.z, 'pin', true);
  g.save(); g.rotate(camYaw + Math.PI - P.face); marker(g, 0, 0, 'player'); g.restore();
  g.restore();
  g.lineWidth = 3; g.strokeStyle = 'rgba(243,234,217,0.55)'; g.beginPath(); g.arc(MR, MR, MR - 2, 0, 6.3); g.stroke();
  g.fillStyle = '#f3ead9'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', MR + s * (MR - 13), MR - c * (MR - 13));
  $('pinlabel').textContent = S.pin ? `Pin · ${Math.round(Math.hypot(S.pin.x - P.pos.x, S.pin.z - P.pos.z))} m${P.auto ? ' · auto-walking' : ''}` : '';
}
let mapOpen = false;
const big = $('mapcanvas'), BS = big.width, bg = big.getContext('2d');
const toMap = (x, z) => [(x / SIZE + 0.5) * BS, (z / SIZE + 0.5) * BS];
function drawMap() {
  const g = bg;
  g.drawImage(mapBase, 0, 0, BS, BS);
  g.font = '600 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
  const label = (x, y, t) => { g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(t, x, y + 8); g.fillStyle = '#f3ead9'; g.fillText(t, x, y + 8); };
  const seen = {};
  for (const st of structs) { const [x, y] = toMap(st.x, st.z); marker(g, x, y, st.kind, 1.3); if (!seen[st.kind]) { seen[st.kind] = 1; label(x, y, ICON[st.kind][1]); } }
  for (const h of herds) { const [x, y] = toMap(h.x, h.z); marker(g, x, y, 'deer', 1.6); label(x, y, 'Herd'); }
  for (const o of animals) if (o.kind === 'wolf' && o.state === 'live') { const [x, y] = toMap(o.root.position.x, o.root.position.z); marker(g, x, y, 'wolf', 1.4); }
  for (const v of villagers) { const [x, y] = toMap(v.pos.x, v.pos.z); marker(g, x, y, 'villager', 1.2); }
  { const [x, y] = toMap(N.pos.x, N.pos.z); marker(g, x, y, 'sena', 1.4); label(x, y, 'Sena'); }
  if (S.pin) { const [x, y] = toMap(S.pin.x, S.pin.z); marker(g, x, y, 'pin', 1.7); }
  const [px, py] = toMap(P.pos.x, P.pos.z);
  g.save(); g.translate(px, py); g.rotate(Math.PI - P.face); marker(g, 0, 0, 'player', 1.6); g.restore();
  $('mapinfo').textContent = S.pin ? `Pin set · ${Math.round(Math.hypot(S.pin.x - P.pos.x, S.pin.z - P.pos.z))} m away. Click it to remove, or press G in the game to auto-walk there.` : 'Click anywhere on the map to drop a pin.';
}
function toggleMap(on = !mapOpen) {
  if (!playing || busy || (menuOpen && !mapOpen)) return;
  mapOpen = menuOpen = on;
  $('map').classList.toggle('on', on);
  if (on) { document.exitPointerLock?.(); drawMap(); } else lock();
}
big.addEventListener('mousedown', (e) => {
  const r = big.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width - 0.5) * SIZE, z = ((e.clientY - r.top) / r.height - 0.5) * SIZE;
  if (S.pin && Math.hypot(S.pin.x - x, S.pin.z - z) < 12) { S.pin = null; P.auto = false; }
  else if (Math.abs(x) < LIMIT && Math.abs(z) < LIMIT) { S.pin = { x, z }; A.tone(660, 0.25, 0.08); }
  else toast('Too far — the mountains block the way');
  drawMap();
});
// A pillar of light marks the pin in the world.
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
beacon.visible = false; scene.add(beacon);
function updateMap() {
  drawMini();
  if (mapOpen) drawMap();
  beacon.visible = !!S.pin;
  if (S.pin) { beacon.position.set(S.pin.x, getHeight(S.pin.x, S.pin.z) + 35, S.pin.z); beacon.material.opacity = 0.3 + Math.sin(clock * 3) * 0.1; }
  $('b-stam').style.width = S.stam + '%';
}

// ---------- input ----------
const keys = {};
let tapE = false;
const locked = () => document.pointerLockElement === canvas;
const lock = () => { if (locked()) return; try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {} };
const lockHint = () => { $('lockhint').style.display = playing && !menuOpen && !busy && !locked() ? 'block' : 'none'; };
document.addEventListener('pointerlockchange', lockHint);
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') e.preventDefault();
  if (!playing || (e.repeat && e.code !== 'KeyE')) return;
  keys[e.code] = true;
  if (e.code === 'KeyE') tapE = true;
  if (e.code === 'KeyM' || (e.code === 'Escape' && mapOpen)) { toggleMap(); return; }
  if (mapOpen) return;
  if (e.code === 'Tab' || e.code === 'KeyB') { toggleMenu(); return; }
  if (menuOpen || busy) return;
  if (/^(Key[WASD]|Space|ShiftLeft)$/.test(e.code)) lock();      // moving always re-captures the mouse
  if (e.code === 'KeyF') eat();
  if (e.code === 'Space') { e.preventDefault(); jumpTap = true; }
  if (e.code === 'KeyV') { view = view === 'fpp' ? 'tpp' : 'fpp'; camPitch = clamp(camPitch, pitchMin(), 1.25); toast(view === 'fpp' ? 'First person' : 'Third person'); }
  if (e.code === 'KeyG') { if (S.pin) { P.auto = !P.auto; toast(P.auto ? 'Auto-walking to your pin' : 'Auto-walk stopped'); } else toast('Open the map (M) and drop a pin first'); }
  if (e.code === 'KeyC') P.sneak = !P.sneak;
  if (e.code === 'KeyQ' && placing) { placing = null; ghost.visible = false; }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (!playing || menuOpen || busy) return;
  lock();
  if (e.button === 0) placing ? confirmPlace() : attack();
  if (e.button === 2) { if (placing) { placing = null; ghost.visible = false; } else throwSpear(); }
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!playing || menuOpen) return;                 // works with or without the mouse captured
  const mx = clamp(e.movementX, -120, 120), my = clamp(e.movementY, -120, 120);
  camYaw -= mx * 0.0026;
  camPitch = clamp(camPitch + my * 0.0022, pitchMin(), 1.25);
});
addEventListener('wheel', (e) => { if (playing && !menuOpen) camDist = clamp(camDist + Math.sign(e.deltaY) * 0.5, 2.6, 9); }, { passive: true });

// ---------- per-frame updates ----------
let target = null, useCool = 0, tick = 0, saveT = 0;
function updatePlayer(dt) {
  const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  camYaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 1.8;
  camPitch = clamp(camPitch + ((keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)) * dt, pitchMin(), 1.25);
  const can = !menuOpen && !busy;
  if (mx || mz) P.auto = false;
  let dx = 0, dz = 0;
  if (can && (mx || mz)) { const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); dx = fx * mz - fz * mx; dz = fz * mz + fx * mx; }
  else if (can && P.auto && S.pin) {
    dx = S.pin.x - P.pos.x; dz = S.pin.z - P.pos.z;
    // Blocked by a wall or tree? Sidestep for a moment, then head for the pin again.
    P.chk = (P.chk || 0) + dt; P.sideT = Math.max(0, (P.sideT || 0) - dt);
    if (P.chk > 0.5) {
      if (Math.hypot(P.pos.x - (P.lx ?? 1e9), P.pos.z - (P.lz ?? 1e9)) < 1 && !P.sideT) { P.sideT = 1.4; P.side = P.side || (rand() < 0.5 ? -1 : 1); }
      else if (!P.sideT) P.side = 0;
      P.lx = P.pos.x; P.lz = P.pos.z; P.chk = 0;
    }
    if (P.sideT) { const a = P.side * 1.25, c = Math.cos(a), sn = Math.sin(a); [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c]; }
  }
  const len = Math.hypot(dx, dz), moving = len > 0.01;
  if (moving) { dx /= len; dz /= len; }
  if (P.swim) P.sneak = false;
  // Sprinting costs stamina; run dry and you have to catch your breath.
  if (S.stam <= 0) P.tired = true; else if (S.stam > 25) P.tired = false;
  const run = (keys.ShiftLeft || P.auto) && !P.sneak && moving && !P.tired;
  S.stam = clamp(S.stam + dt * (run ? (P.swim ? -8 : -10) : P.speed < 0.5 ? 18 : 10), 0, 100);
  let sp = !moving ? 0 : P.swim ? (run ? 3 : 2.1) : P.sneak ? 1.7 : run ? 6.6 : 3.3;
  if (!P.swim && !P.air && P.pos.y < 0.15) sp *= 0.6;
  // Momentum: velocity eases toward where you steer, slower to change in the air.
  const acc = Math.min(1, dt * (P.air ? 2.2 : moving ? 8 : 11));
  P.vx += (dx * sp - P.vx) * acc; P.vz += (dz * sp - P.vz) * acc;
  const v = Math.hypot(P.vx, P.vz);
  if (v > 0.05) {
    const nx = P.pos.x + P.vx * dt, nz = P.pos.z + P.vz * dt;
    if (Math.abs(nx) < LIMIT && Math.abs(nz) < LIMIT) { P.pos.x = nx; P.pos.z = nz; }
    collide(P.pos, 0.35);
    P.step += dt * v;
    if (P.step > 2.3 && !P.air) { P.step = 0; A.hit(P.pos.y < 0.1 ? 900 : 170 + rand() * 90, 0.08, P.sneak ? 0.04 : 0.13); }
  }
  P.speed = v < 0.2 ? 0 : v;
  if (view === 'fpp') P.face = Math.atan2(-Math.sin(camYaw), -Math.cos(camYaw));
  else if (moving) P.face = turn(P.face, Math.atan2(dx, dz), Math.min(1, dt * 10));
  if (jumpTap && can && !P.air && !P.swim && S.stam > 8) { P.vy = 5.6; P.air = true; P.sneak = false; S.stam -= 7; A.hit(320, 0.1, 0.2); }
  jumpTap = false;
  if (P.air) { P.vy -= 15 * dt; P.jy += P.vy * dt; if (P.jy <= 0) { P.jy = 0; P.air = false; A.hit(150, 0.12, 0.35); } }
  if (S.pin && Math.hypot(S.pin.x - P.pos.x, S.pin.z - P.pos.z) < 5) { S.pin = null; P.auto = false; toast('You have reached your pin'); A.tone(523, 0.6, 0.1); }
  P.cool = Math.max(0, P.cool - dt);
  if (P.cool <= 0) { P.h.axe.visible = false; P.h.spear.visible = !!S.tools.spear && !P.swim; }
  if (hitT > 0 && (hitT -= dt) <= 0) landHit();
  settle(P, dt, P.sneak);

  // interaction
  useCool -= dt;
  target = busy || menuOpen || placing ? null : findTarget();
  const pr = $('prompt');
  if (placing) { pr.style.display = 'block'; pr.innerHTML = `<kbd>Click</kbd> build ${placing.name} &nbsp; <kbd>Q</kbd> cancel`; }
  else if (target) { pr.style.display = 'block'; pr.innerHTML = (target.key ? '<kbd>E</kbd> ' : '') + target.label; }
  else pr.style.display = 'none';
  const use = keys.KeyE || tapE; tapE = false;
  if (use && useCool <= 0 && !busy && !menuOpen) {
    if (placing) { confirmPlace(); useCool = 0.5; }
    else if (target?.act) { target.act(); useCool = 0.42; drawQuest(); }
  }
  if (placing) {
    const g = ghostSpot();
    ghost.visible = true; ghost.position.set(g.x, g.h + 0.25, g.z); ghost.scale.set(g.r, 1, g.r);
    ghost.material.color.set(g.ok ? 0x9be37a : 0xe3604a);
  }
}
function updateSena(dt) {
  const dP = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  const fire = structs.find((s) => s.kind === 'fire');
  const night = world.env.night > 0.6 && fire && Math.hypot(fire.x - P.pos.x, fire.z - P.pos.z) < 40;
  if (N.node && (!N.node.alive || dP > 32 || night)) N.node = null;
  if (N.act > 0) {
    N.act -= dt; N.speed = 0;
    if (N.act <= 0 && N.node?.alive) {
      const k = N.node.field.kind, item = { reed: 'fiber', berry: 'berry' }[k] || k;
      give(item, k === 'stick' || k === 'stone' ? 1 : 2, 'Sena'); take(N.node); N.node = null; drawQuest();
    }
  } else if (N.node) {
    if (walkTo(N, N.node.x, N.node.z, 3.2, dt, 1.1)) { N.act = 0.7; N.h.swing(); }
  } else {
    if (night) walkTo(N, fire.x + 1.7, fire.z - 0.9, 3, dt, 0.5);
    else if (dP > 4.5) walkTo(N, P.pos.x, P.pos.z, dP > 12 ? 6.6 : 3.4, dt, 3);
    else N.speed = 0;
    N.wait -= dt;
    if (S.ch >= 1 && N.wait <= 0 && dP < 22 && !night && !busy) {
      N.wait = 5 + rand() * 6;
      const want = ['stick', 'stone', 'reed', 'berry', ...(S.ch >= 6 ? ['grain'] : [])];
      let bd = 20;
      for (const f of world.fields) {
        if (!want.includes(f.kind)) continue;
        for (const n of f.nodes) {
          if (!n.alive) continue;
          const d = Math.hypot(n.x - N.pos.x, n.z - N.pos.z);
          if (d < bd && Math.hypot(n.x - P.pos.x, n.z - P.pos.z) < 26 && getHeight(n.x, n.z) > -0.3) { bd = d; N.node = n; }
        }
      }
    }
  }
  settle(N, dt, false);
}
function updateVillagers(dt) {
  for (const v of villagers) {
    v.wait -= dt;
    if (v.wait <= 0) { v.wait = 5 + rand() * 9; const a = rand() * 6.283, r = 5 + rand() * 22; v.tx = v.home.x + Math.cos(a) * r; v.tz = v.home.z + Math.sin(a) * r; }
    if (getHeight(v.tx, v.tz) < 0.8) v.wait = 0;
    walkTo(v, v.tx, v.tz, 1.9, dt, 0.6);
    settle(v, dt, false);
  }
}
function updateStats(dt) {
  const E = world.env, p = P.pos;
  S.time += dt * (24 / 600) * (E.night > 0.7 ? 2.2 : 1);
  if (S.time >= 24) S.time -= 24;
  const effort = P.speed > 4 ? 1.7 : 1;
  S.food = Math.max(0, S.food - dt * 0.085 * effort);
  S.water = Math.max(0, S.water - dt * 0.12 * effort);
  const sheltered = structs.some((s) => s.rise >= 1 && ((s.kind === 'fire' && Math.hypot(s.x - p.x, s.z - p.z) < 8) || ((s.kind === 'hut' || s.kind === 'house') && Math.hypot(s.x - p.x, s.z - p.z) < s.radius + 2.5)));
  S.warm = clamp(S.warm + dt * ((E.night > 0.5 || E.storm > 0.5) && !sheltered ? -1.1 - (p.y < 0 ? 1.5 : 0) : 5), 0, 100);
  const hurt = (S.food <= 0 ? 0.9 : 0) + (S.water <= 0 ? 1.3 : 0) + (S.warm <= 0 ? 1.4 : 0);
  S.hp = clamp(S.hp + dt * (hurt ? -hurt : S.food > 35 && S.water > 35 ? 0.7 : 0), 0, 100);
  if (S.hp <= 0 && !busy) die(hurtFlash > 0 ? 'The wolves drag you down.' : S.warm <= 0 ? 'The cold takes you.' : S.water <= 0 ? 'Thirst overcomes you.' : 'Hunger overcomes you.');
  if (E.night > 0.6 && !S.warned && !sheltered) { S.warned = true; say('Sena', has('fire') ? 'It grows cold. Come back to the fire.' : 'Night is here and we have no fire. Stay close to me.'); }
  if (E.night < 0.1) S.warned = false;
  for (const k of ['hp', 'food', 'water', 'warm']) $('b-' + k).style.width = S[k] + '%';
  const hh = S.time | 0, mm = ((S.time % 1) * 60) | 0;
  $('clock').textContent = `Day ${S.day} · ${String(hh).padStart(2, '0')}:${String(mm - (mm % 10)).padStart(2, '0')}`;
}
function updateWorldThings(dt) {
  for (const s of structs) {
    if (s.rise < 1) {
      s.rise = Math.min(1, s.rise + dt / 2.4);
      const k = 1 - (1 - s.rise) ** 2;
      s.group.scale.set(0.9 + k * 0.1, 0.03 + k * 0.97, 0.9 + k * 0.1);
      if (s.rise >= 1) { A.hit(300, 0.4, 0.5); drawQuest(); if (s.kind === 'house' && cnt('homeLine') < 1) { bump('homeLine'); say('Sena', 'It is beautiful. No one has ever had a home like this.'); } }
    }
    s.update?.(dt);
    if (s.kind === 'fire' && A.ctx) { const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z); if (d < 12 && rand() < dt * 9) A.hit(2200 + rand() * 2500, 0.03, 0.12 * (1 - d / 12)); }
  }
  for (let i = respawns.length - 1; i >= 0; i--) {
    const r = respawns[i];
    if (clock < r.at || r.n.gone) { if (r.n.gone) respawns.splice(i, 1); continue; }
    if (Math.hypot(r.n.x - P.pos.x, r.n.z - P.pos.z) > 30) { r.n.field.set(r.n, true); respawns.splice(i, 1); }
  }
  glowM.emissiveIntensity = world.env.night * 1.8;
  if (A.ctx) A.cricket.gain.value = world.env.night * 0.012;
}
const camPos = new THREE.Vector3(0, 8, 14), look = new THREE.Vector3();
function updateCamera(dt, title) {
  if (title) {
    const a = clock * 0.04;
    camPos.set(Math.sin(a) * 15, getHeight(0, 0) + 4.5, Math.cos(a) * 15);
    camera.position.copy(camPos); camera.lookAt(0, getHeight(0, 0) + 1.2, 2);
    return;
  }
  P.h.root.visible = view !== 'fpp';
  const fovT = P.speed > 5 ? 66 : 58;
  if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  const cp = Math.cos(camPitch);
  if (view === 'fpp') {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const eye = (P.swim ? 0.3 : 1.68 - P.h.crouch * 0.55) + Math.sin(P.step * 2.7) * 0.03 * Math.min(1, P.speed / 3);
    camPos.set(P.pos.x + fx * 0.16, P.pos.y + eye, P.pos.z + fz * 0.16);
    camera.position.copy(camPos);
    camera.lookAt(camPos.x + fx * cp, camPos.y - Math.sin(camPitch), camPos.z + fz * cp);
    return;
  }
  // Third person: over the right shoulder, pulled in when sneaking, kept above the ground.
  const dist = camDist * (P.sneak ? 0.8 : 1);
  look.set(P.pos.x + Math.cos(camYaw) * 0.45, P.pos.y + 1.7 - P.h.crouch * 0.3, P.pos.z - Math.sin(camYaw) * 0.45);
  _v.set(look.x + Math.sin(camYaw) * cp * dist, look.y + Math.sin(camPitch) * dist, look.z + Math.cos(camYaw) * cp * dist);
  _v.y = Math.max(_v.y, getHeight(_v.x, _v.z) + 0.35, 0.7);
  camPos.lerp(_v, 1 - Math.exp(-dt * 16));
  camera.position.copy(camPos);
  camera.lookAt(look.x, look.y + 0.3, look.z);
}

// ---------- start ----------
function start(loadSave) {
  A.init();
  if (loadSave) {
    try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(SAVE))); } catch { S = fresh(); }
    for (const s of S.structs) placeStruct(s.k, s.x, s.z, s.r, true, s.g);
    P.pos.set(S.px, 0, S.pz); N.pos.set(S.px + 1.5, 0, S.pz + 1);
    if (S.village) spawnVillagers();
    drawQuest(); toast('Welcome back');
  } else { localStorage.removeItem(SAVE); showChapter(); }
  playing = true;
  $('title').classList.add('off'); $('hud').classList.add('on');
  drawInv(); lock();
}
$('btn-new').textContent = 'Begin the story';
$('btn-new').onclick = () => start(false);
if (localStorage.getItem(SAVE)) { $('btn-continue').style.display = ''; $('btn-continue').onclick = () => start(true); $('btn-new').textContent = 'New story'; }

let last = performance.now(), slow = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
  last = now; clock += dt;
  if (++frames > 30) { slow = raw > 0.034 ? slow + 1 : 0; if (slow > 90 && pixelRatio > 0.7) { pixelRatio -= 0.25; renderer.setPixelRatio(pixelRatio); slow = 0; } }
  if (playing) {
    updatePlayer(dt); updateSena(dt); updateVillagers(dt); updateSpear(dt); updateStats(dt); updateSubs(dt); updateEvents(dt); updateMap(); lockHint();
    tick -= dt;
    if (tick <= 0) {
      tick = 0.5;
      const ch = CH[S.ch];
      if (!busy && ch.goals.length && ch.goals.every(([, f]) => f())) {
        S.ch++; save();
        if (CH[S.ch].epilogue) { epilogue(); setTimeout(showChapter, 5200); } else showChapter();
      }
    }
    saveT += dt; if (saveT > 30 && !busy) { saveT = 0; save(); }
  } else { settle(P, dt, false); settle(N, dt, false); }
  for (const o of [...animals]) updateAnimal(o, dt);
  updateWorldThings(dt);
  updateCamera(dt, !playing);
  world.setTime(S.time, P.pos, camera);
  world.update(dt, P.pos.x, P.pos.z);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.G = { throwSpear, sleep, attack, EVENTS, EV, animals, herds, spawn, hurt, get S() { return S; }, P, N, structs, world, placeStruct, give, camera, renderer, scene, set yaw(v) { camYaw = v; }, set pitch(v) { camPitch = v; } };
