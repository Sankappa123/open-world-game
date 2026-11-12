import * as THREE from 'three';
import { createWorld, getHeight, slopeY, collide, addCollider, LIMIT, SIZE, riverX } from './world.js';
import { loadNature, NAT, DEBUG } from './nature.js';
import { loadAnimals, makeAnimal } from './animals.js';
import { makeSpear, makeTorch, makeStructure, glowM, BUILD, makeScaffold } from './entities.js';
import { loadPeople, makeHuman, samplePose, applyPose, clipDuration, BONESETS, ik2 } from './people.js';
import { clamp, lerp, mat } from './util.js';
import { loadGame, saveGame, deleteGame, saveState, settings, saveSettings } from './save.js';
import { PRESETS, detectQuality } from './quality.js';
import { CAVES, depthAt, biome as biomeAt, POIS } from './world.js';   // WP3 caves and landmarks

const $ = (id) => document.getElementById(id);
const rand = Math.random;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const quality = () => (settings.quality === 'auto' ? detectQuality(renderer) : settings.quality);
let Q = PRESETS[quality()], pixelRatio = Math.min(devicePixelRatio, Q.pr);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;        // refreshed from the frame loop: every frame on high, every other frame otherwise
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
const [, , , found] = await Promise.all([loadNature(), loadPeople(), loadAnimals(), loadGame()]);
const world = createWorld(scene, renderer, quality());
const SWIM_Y = -0.1;

// ---------- state ----------
const ITEMS = { stick: 'Sticks', stone: 'Stones', fiber: 'Fibre', berry: 'Berries', wood: 'Timber', clay: 'Clay', brick: 'Bricks', meat: 'Raw meat', cooked: 'Cooked meat', hide: 'Hides', grain: 'Grain', bread: 'Flatbread', fish: 'Raw fish', grilled: 'Grilled fish', poultice: 'Herbal poultices', flint: 'Flint', ochre: 'Ochre' };
const fresh = () => ({
  ch: 0, inv: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 0])), c: {}, tools: {},
  hp: 100, food: 65, water: 65, warm: 100, stam: 100, pin: null, time: 7.5, day: 1, structs: [], village: false, px: 0, pz: 4, skin: 0, fuel: 0,
  storyV: 2, worldV: 2,
  close: 10,                                               // Closeness with Sena, 0..100
  home: { hearth: false, bed: false, cradle: false, nursery: false },
  horse: null,                                             // {kind,x,z,face,stam,bond,name,riding,nRide,fedDay}
  found: {},                                               // POI id -> 1
  seen: '',                                                // fog of war, base64 of a 64*64 bit grid
  stash: {},                                               // storage basket contents
  kids: [],                                                // [{name, born, female}]
  rested: 0,                                               // seconds of "Well rested" left
});
const STORY = true;                                        // the only mode for now; horse systems gate on STORY && reached('herd')
let S = fresh();
const cnt = (k) => S.c[k] || 0;
const bump = (k, n = 1) => { S.c[k] = cnt(k) + n; };
const structs = [];
const has = (kind) => structs.some((s) => s.kind === kind && s.rise >= 1);
let playing = false, menuOpen = false, busy = false, clock = 0, paused = false;

// ---------- story ----------
// Chapters have stable ids: gate features with reached(id), never with raw indices. onEnter must be idempotent
// (it runs on entering the chapter AND again on load). where() is the quest marker target [x, z] or null.
const houseAt = () => { const h = structs.find((s) => s.kind === 'house'); return h ? [h.x, h.z] : null; };
const horseName = () => S.horse?.name || 'The horse';
const CH = [
  { id: 'awaken', title: 'Awakening', goals: [['Gather 3 sticks', () => cnt('stick') >= 3], ['Gather 3 stones', () => cnt('stone') >= 3], ['Pick berries and eat (F)', () => cnt('ate') >= 1], ['Drink from the river', () => cnt('drank') >= 1]],
    lines: [['', 'Long before the first word was written, two people walked out of the cold hills into a green valley.'], ['Sena', 'The river is close, Aro. And look — berries. We could stay here.'], ['Aro', 'Then we begin with our hands. Sticks, stones, and something to eat.']] },
  { id: 'fire', title: 'The First Fire', goals: [['Cut reeds by the river for fibre', () => cnt('fiber') >= 2], ['Craft a campfire (Tab) and place it', () => has('fire')], ['Sit by the fire with Sena (E at the fire)', () => cnt('sat_fire') >= 1]],
    lines: [['Sena', 'The sun will not stay. We need fire before the dark comes.'], ['Aro', 'Dry sticks and a ring of stones. I will make it.'], ['Sena', 'Sit with me a while. The fire is better with two.']] },
  { id: 'hunt', title: 'The Hunt', goals: [['Craft a hunting spear', () => !!S.tools.spear], ['Hunt a deer — sneak close, then throw', () => cnt('deer') >= 1], ['Cook the meat at the fire', () => cnt('cook') >= 1], ['Eat a cooked meal (F)', () => cnt('meal') >= 1]],
    lines: [['Sena', 'Berries will not carry us through the cold. There are deer beyond the trees.'], ['Aro', 'A sharp stone, a straight branch, reed to bind them. I will move low — they hear everything.']] },
  { id: 'shelter', title: 'Shelter', goals: [['Craft a stone axe', () => !!S.tools.axe], ['Fell trees for 12 timber', () => cnt('wood') >= 12], ['Raise the thatch hut with Sena', () => has('hut')], ['Rest together in the hut', () => cnt('slept') >= 1]],
    lines: [['Sena', 'A fire is not a home. The rain will come, and the wind after it.'], ['Aro', 'Then we raise a roof, the two of us. You weave, I will cut.']] },
  { id: 'cave', title: 'Into the Dark', goals: [['Light a torch (T)', () => cnt('torchlit') >= 1], ['Find the hollow in the western hills', () => !!S.found.echo], ['Look at the old paintings (E)', () => cnt('painting') >= 3], ['Leave your handprints beside theirs', () => cnt('handprint') >= 1], ['Chip 6 flint', () => cnt('flint') >= 6]],
    lines: [['Sena', 'The wind smells of stone and old smoke. There is a hollow in the western hills. I saw it from the ridge.'], ['Aro', 'Then we take fire with us. Whatever is in the dark, we will see it first.']],
    where: () => (S.found.echo ? CAVES[0].c : CAVES[0].mouth) },        // WP3: the Echo Hollow mouth, then its chamber
  { id: 'herd', title: 'The Wild Herd', goals: [['Craft a saddle', () => !!S.tools.saddle], ['Find the wild herd east of the river', () => !!S.found.meadow], ['Win a horse\'s trust: sneak close and offer food (E) ×3', () => cnt('horse_fed') >= 3], ['Calm the horse and ride her', () => !!S.horse], ['Ride with Sena to Lookout Peak', () => cnt('peak_ride') >= 1]],
    lines: [['Sena', 'Across the river, on the open grass, I saw them running. Horses, like on the cave wall.'], ['Aro', 'They will not come to a stranger. We go slow, and we bring them something sweet.']],
    onEnter() { if (!S.found.meadow && !S.rumour?.includes('meadow')) S.rumour = [...(S.rumour || []), 'meadow']; spawnWildHerd(); },
    where: () => (S.horse ? [-185, 70] : [175, 40]) },
  { id: 'clay', title: 'Clay and Flame', goals: [['Dig 8 clay at the riverbank', () => cnt('clay') >= 8], ['Build a kiln', () => has('kiln')], ['Fire 24 bricks in the kiln', () => cnt('brick') >= 24]],
    lines: [['Sena', 'Look how the river mud hardens beside the fire. Like stone.'], ['Aro', 'Clay. If we bake it hot enough, we can shape our own stone.']],
    extra: () => (S.horse ? [['Aro', `${horseName()} can carry the clay. We will need a great deal of it.`]] : []) },
  { id: 'house', title: 'A Home of Brick', goals: [['Build the brick house with Sena', () => has('house')]],
    lines: [['Aro', 'Walls that no wind can push over. We build them together.'], ['Sena', 'Build it where we can see the river.']] },
  { id: 'hearth', title: 'Hearth and Home', goals: [['Build a hearth inside the house', () => !!S.home.hearth], ['Make a bed for two', () => !!S.home.bed], ['Build a stable for your horse', () => has('stable')], ['Rest at home together', () => cnt('slept_home') >= 1]],
    lines: [['Sena', 'Walls are not enough. A home needs a fire inside, and a bed where we can both rest.']],
    extra: () => [['Aro', `And a roof for ${S.horse?.name || 'the horse'}, so she does not stand in the rain.`]],
    where: houseAt },
  { id: 'seeds', title: 'Seeds of Tomorrow', goals: [['Gather 6 wild grain', () => cnt('grain') >= 6], ['Till a farm plot', () => has('farm')], ['Harvest your first crop', () => cnt('harvest') >= 1], ['Build a well', () => has('well')], ['Make the home cosy (Homeliness 6)', () => homeliness() >= 6]],
    lines: [['Sena', 'The grass with the heavy heads — its seeds fall and grow again. What if we planted them ourselves?'], ['Aro', 'Then we would never need to wander again.']] },
  { id: 'newlife', title: 'A New Life', goals: [['Grow close to Sena (Closeness 60)', () => S.close >= 60], ['Build a cradle', () => !!S.home.cradle], ['Add a nursery room to the house', () => !!S.home.nursery], ['Rest at home three nights', () => cnt('slept_home') - (S.c.lifeStart ?? 0) >= 3], ['Welcome your child', () => cnt('born') >= 1]],
    lines: [['Sena', 'Come and sit with me by the hearth, Aro. By the time the grain is tall again, there will be three of us.'], ['Aro', 'Three. Then I had better build another room, and a cradle.']],
    onEnter() { S.c.lifeStart ??= cnt('slept_home'); },
    where: houseAt },
  { id: 'village', title: 'The Village', goals: [], epilogue: true,
    lines: [['', 'Seasons turned into years. Others followed the smoke of the hearth, and stayed.']],
    extra: () => [['', `Lio learned to ride on old ${S.horse?.name || 'Dawn'} before she could run.`], ['', 'From one fire, a village. From a village, everything that came after.'], ['Sena', 'The valley is ours, Aro. Keep building.']] },
];
const chIdx = (id) => CH.findIndex((c) => c.id === id);
const reached = (id) => S.ch >= chIdx(id);
const roman = (n) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n - 1];
// Short exchanges while sitting together at the fire, one pair per sit, by chapter.
const VIGNETTES = {
  awaken: [[['Sena', 'Do you remember the cold hills?'], ['Aro', 'Only that you were there.']], [['Aro', 'Listen. The river never stops talking.'], ['Sena', 'Then it will never be quiet here. Good.']]],
  fire: [[['Sena', 'Do you remember the cold hills?'], ['Aro', 'Only that you were there.']], [['Aro', 'Look how the sparks climb.'], ['Sena', 'Like they want to be stars.']], [['Sena', 'Warm hands at last.'], ['Aro', 'Give them here. Mine are warmer.']]],
  hunt: [[['Sena', 'You walked so quietly today. Even I did not hear you.'], ['Aro', 'I learned it from watching you pick berries.']], [['Aro', 'Tomorrow we eat well again.'], ['Sena', 'Tomorrow, and the day after.']]],
  shelter: [[['Sena', 'When the roof is up, the rain can sing all it likes.'], ['Aro', 'And we will listen to it, warm and dry.']], [['Aro', 'My arms ache from the axe.'], ['Sena', 'Then rest them. The trees will still be there tomorrow.']]],
  cave: [[['Sena', 'The people on the wall… do you think they sat like this?'], ['Aro', 'By a fire, side by side. I am sure of it.']], [['Aro', 'Were you afraid in the dark?'], ['Sena', 'A little. Then I saw your torch.']]],
  herd: [[['Sena', 'Did you see how she shook her mane?'], ['Aro', 'She is as stubborn as you.'], ['Sena', 'Then she will be loyal too.']], [['Aro', 'If we could ride, the valley would be small.'], ['Sena', 'And the world beyond it a little bigger.']]],
  clay: [[['Sena', 'Your hands are red with clay.'], ['Aro', 'And yours with berries. We match.']], [['Aro', 'Every brick is a little piece of the river.'], ['Sena', 'Then our house will be made of the place we love.']]],
  house: [[['Sena', 'Where will we put the door?'], ['Aro', 'Facing the morning, so the sun wakes us.']], [['Aro', 'No hut has ever stood as long as this house will.'], ['Sena', 'Then we must fill it with good days.']]],
  hearth: [[['Sena', 'A fire inside the house. Imagine the winters.'], ['Aro', 'I will keep it fed. You keep it company.']], [['Aro', 'Some nights I still dream of the cold hills.'], ['Sena', 'And then you wake, and I am here.']]],
  seeds: [[['Sena', 'The first green shoots came up today.'], ['Aro', 'Our own grain. Nobody has ever done this.']], [['Aro', 'Do you ever miss wandering?'], ['Sena', 'No. Everything I wanted to find is right here.']]],
  newlife: [[['Sena', 'What shall we teach them first?'], ['Aro', 'How to make fire. And how to sit beside it.']], [['Aro', 'Will they like the valley?'], ['Sena', 'They will love it. It is where we were happy.']], [['Sena', 'You will be a gentle father, Aro.'], ['Aro', 'I learned gentle from you.']]],
  village: [[['Sena', 'So many fires now, all across the valley.'], ['Aro', 'And it started with this one.']], [['Aro', 'Listen to the children laughing.'], ['Sena', 'The valley is never quiet any more.']]],
};
const RECIPES = [
  { id: 'fire', name: 'Campfire', desc: 'Warmth at night and a place to cook. Two log benches: sit there with Sena.', cost: { stick: 4, stone: 3 }, ch: 'fire', place: true },
  { id: 'torch', name: 'Torch', desc: 'T lights it: carry light into the dark, and wolves keep their distance. Burns about 3 minutes; relighting costs 1 stick.', cost: { stick: 2, fiber: 2 }, ch: 'fire' },
  { id: 'poultice', item: 'poultice', name: 'Herbal poultice', desc: 'Crushed berries bound in reed. H treats your wounds (+35 health).', cost: { berry: 4, fiber: 1 }, ch: 'fire' },
  { id: 'spear', name: 'Hunting spear', desc: 'Right-click to throw. Sneak (C) to get close to deer — or throw it into the river to catch fish.', cost: { stick: 2, stone: 1, fiber: 1 }, ch: 'hunt' },
  { id: 'cloak', name: 'Fur cloak', desc: 'Made from the hides of your hunts. You lose warmth half as fast at night and in storms.', cost: { hide: 3, fiber: 3 }, ch: 'hunt' },
  { id: 'waterskin', name: 'Waterskin', desc: 'Holds 3 drinks. Fills when you drink at the river or the well. R to drink.', cost: { hide: 1, fiber: 2 }, ch: 'hunt' },
  { id: 'rack', name: 'Drying rack', desc: 'Hang raw meat or fish to dry. After a while it is ready to eat.', cost: { stick: 6, fiber: 4 }, ch: 'hunt', place: true },
  { id: 'axe', name: 'Stone axe', desc: 'Lets you fell trees for timber.', cost: { stick: 1, stone: 2, fiber: 2 }, ch: 'shelter' },
  { id: 'hut', name: 'Thatch hut', desc: 'Shelter from the cold. Build it together, and rest there side by side.', cost: { wood: 12, fiber: 8 }, ch: 'shelter', place: true },
  { id: 'flintaxe', name: 'Flint axe', desc: 'A flint edge bites deep: trees fall in half the strokes.', cost: { flint: 3, stick: 2, fiber: 2 }, ch: 'cave' },
  { id: 'flintspear', name: 'Flint spear', desc: 'A flint point: your thrown spear strikes twice as hard.', cost: { flint: 2, stick: 2, fiber: 1 }, ch: 'cave' },
  { id: 'saddle', name: 'Saddle', desc: 'A hide seat bound with reed. Needed to canter and gallop.', cost: { hide: 3, fiber: 4, wood: 2 }, ch: 'herd' },
  { id: 'stable', name: 'Stable', desc: 'A roof for your horse. She rests there at night and trusts you more.', cost: { wood: 14, fiber: 6, stone: 4 }, ch: 'herd', place: true },
  { id: 'kiln', name: 'Kiln', desc: 'Bakes clay into bricks.', cost: { stone: 10, clay: 6 }, ch: 'clay', place: true },
  { id: 'house', name: 'Brick house', desc: 'A permanent home, raised together.', cost: { brick: 24, wood: 10 }, ch: 'house', place: true },
  { id: 'hearth', name: 'Hearth', desc: 'A fire ring inside the house. Warmth and light at home.', cost: { stone: 8, clay: 4 }, ch: 'hearth', up: true },
  { id: 'bed', name: 'Bed for two', desc: 'A wide straw bed with a hide blanket.', cost: { wood: 6, hide: 3, fiber: 6 }, ch: 'hearth', up: true },
  { id: 'fence', name: 'Fence', desc: 'A 2.4 m fence segment. Segments snap together end to end.', cost: { wood: 1 }, ch: 'hearth', place: true },
  { id: 'path', name: 'Stone path', desc: 'Flat stones to walk on. You walk a little faster on them.', cost: { stone: 2 }, ch: 'hearth', place: true },
  { id: 'flowers', name: 'Flower bed', desc: 'Once a day, pick flowers for Sena.', cost: { berry: 2, fiber: 2 }, ch: 'hearth', place: true },
  { id: 'basket', name: 'Storage basket', desc: 'Store your food here, and take it back when you need it.', cost: { fiber: 8, stick: 4 }, ch: 'hearth', place: true },
  { id: 'farm', name: 'Farm plot', desc: 'Plant grain and harvest it again and again.', cost: { wood: 4, grain: 6 }, ch: 'seeds', place: true },
  { id: 'well', name: 'Well', desc: 'Clean water close to home.', cost: { brick: 16, stone: 6 }, ch: 'seeds', place: true },
  { id: 'cradle', name: 'Cradle', desc: 'A little rocking bed, made with care.', cost: { wood: 4, hide: 2, fiber: 4 }, ch: 'newlife', up: true },
  { id: 'nursery', name: 'Nursery room', desc: 'A small room added to the side of the house.', cost: { brick: 12, wood: 6 }, ch: 'newlife', up: true },
];
// Homeliness: small comforts near the house plus the home upgrades.
function homeliness() {
  const h = structs.find((s) => s.kind === 'house');
  if (!h) return 0;
  const n = {};
  for (const s of structs) if (s.rise >= 1 && Math.hypot(s.x - h.x, s.z - h.z) < 25) n[s.kind] = (n[s.kind] || 0) + 1;
  let v = ['rack', 'flowers', 'basket', 'stable', 'well', 'farm'].reduce((a, k) => a + (n[k] || 0), 0) + ((n.fence || 0) / 3 | 0) + ((n.path || 0) / 3 | 0);
  for (const k in S.home) if (S.home[k]) v++;
  return v;
}

// ---------- audio ----------
const A = {
  ctx: null,
  init() {
    if (A.ctx) return;
    try {
      const c = (A.ctx = new AudioContext());
      A.out = c.createGain(); A.out.gain.value = settings.volume; A.out.connect(c.destination);
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
      // the river: filtered noise that gets louder near the water
      const ws = c.createBufferSource(), wb = c.createBiquadFilter(); ws.buffer = A.buf; ws.loop = true; wb.type = 'bandpass'; wb.frequency.value = 900; wb.Q.value = 0.5;
      A.river = c.createGain(); A.river.gain.value = 0;
      ws.connect(wb).connect(A.river).connect(A.out); ws.start(0, 1.3);
    } catch { A.ctx = null; }
  },
  // a short two-note bird call, slightly different every time
  chirp(vol = 0.05) {
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime, base = 2200 + rand() * 1800;
    for (let i = 0; i < 2 + (rand() * 3 | 0); i++) {
      const o = c.createOscillator(), g = c.createGain(), t0 = t + i * (0.09 + rand() * 0.08);
      o.frequency.setValueAtTime(base * (1 + rand() * 0.3), t0); o.frequency.exponentialRampToValueAtTime(base * (0.7 + rand() * 0.2), t0 + 0.07);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      o.connect(g).connect(A.out); o.start(t0); o.stop(t0 + 0.1);
    }
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
  if (S.tools.torch) h += `<span class="tool">Torch${torchOn ? ` · lit ${Math.ceil(S.fuel)}s` : ''}</span>`;
  if (S.tools.cloak) h += '<span class="tool">Fur cloak</span>';
  if (S.tools.waterskin) h += `<span class="tool">Waterskin<b>${S.skin}/3</b></span>`;
  for (const k in ITEMS) if (S.inv[k] > 0) h += `<span>${ITEMS[k]}<b>${S.inv[k]}</b></span>`;
  $('inv').innerHTML = h || '<span>Your hands are empty</span>';
  $('cross').style.display = 'block';
}
function drawQuest() {
  const ch = CH[S.ch];
  $('chapter').textContent = `${ch.epilogue ? 'Epilogue' : roman(S.ch + 1)} · ${ch.title}`;
  $('goals').innerHTML = ch.goals.length
    ? ch.goals.map(([t, f]) => `<div class="${f() ? 'done' : ''}">${t}</div>`).join('')
    : sideGoals();                                     // WP6 free play after the epilogue
}
function give(item, n, who) {
  S.inv[item] += n; bump(item, n);
  toast(who ? `${who} gathered ${ITEMS[item].toLowerCase()}` : `+${n} ${ITEMS[item]}`);
  drawInv();
}
function showChapter() {
  const ch = CH[S.ch];
  $('card-sub').textContent = ch.epilogue ? 'Epilogue' : `Chapter ${S.ch + 1}`;
  $('card-title').textContent = ch.title;
  $('card').classList.add('on');
  setTimeout(() => $('card').classList.remove('on'), 3800);
  A.tone(196, 2.5, 0.12); A.tone(294, 2.5, 0.09, 0.25); A.tone(392, 3, 0.07, 0.5);
  subT = Math.max(subT, 2.5);
  [...ch.lines, ...(ch.extra?.() || [])].forEach((l) => say(...l));
  drawQuest();
}
// Move into a chapter (story advance and G.setCh): run its onEnter, save, then the card (after the epilogue fade).
function enterChapter() {
  CH[S.ch].onEnter?.(); save();
  if (CH[S.ch].epilogue) { const first = !S.village; epilogue(); setTimeout(showChapter, first ? 9800 : 5200); } else showChapter();   // WP6: 5 s final shot before the card
}
let fadeExtra = 0;                                   // WP6: mid() may lengthen its own hold (the birth card)
function fadeTo(text, mid, hold = 2600) {
  busy = true;
  $('fade-text').textContent = text; $('fade').classList.add('on');
  setTimeout(() => { fadeExtra = 0; mid(); const h = hold + fadeExtra; fadeExtra = 0; setTimeout(() => { $('fade').classList.remove('on'); busy = false; }, h); }, 1300);
}
let saveFlash = 0;
function save(opts = {}) {
  if (!playing) return;
  S.structs = structs.map((s) => ({ k: s.kind, x: s.x, z: s.z, r: s.rot, g: s.grow, p: s.timed && s.rise < 1 ? +s.rise.toFixed(3) : undefined, h: s.hang?.length ? s.hang.map(([k, t]) => [k, +t.toFixed(1)]) : undefined }));   // WP2 p: site progress, h: rack
  S.px = P.pos.x; S.pz = P.pos.z; S.nx = N.pos.x; S.nz = N.pos.z;
  horseSave();                                       // WP4 horse position, riding
  S.yaw = camYaw; S.pitch = camPitch; S.view = view; S.evNext = EV.next; S.storm = EV.storm;
  S.felled = [];
  world.fields.forEach((f, fi) => { if (f.kind === 'tree') f.nodes.forEach((n, ni) => { if (!n.alive && !n.gone) S.felled.push([fi, ni]); }); });
  S.seen = encodeSeen();                               // WP5 fog of war
  saveGame(S, opts);
  saveFlash = 2.5; $('savechip').textContent = 'Saving…'; $('savechip').className = 'panel';
}
saveState.listeners.push((st) => {
  const el = $('savechip');
  el.textContent = st.where === 'db' ? 'Saved to database' : 'Saved in browser only (server unreachable)';
  el.className = 'panel ' + (st.where === 'db' ? 'ok' : 'warn');
});
// Save when the tab is hidden or closed, so nothing is lost when the machine is switched off.
addEventListener('visibilitychange', () => { if (document.hidden) save({ beacon: true }); });
addEventListener('pagehide', () => save({ beacon: true }));
addEventListener('beforeunload', () => save({ beacon: true }));

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
  const root = e.h.root;
  // Lying down (resting in bed): body flat on its back at restPos.
  if (e.rest > 0) { root.position.copy(e.restPos); root.rotation.order = 'YXZ'; root.rotation.set(-Math.PI / 2, e.face, 0); e.h.animate(dt, 0, false, false, false); return; }
  root.rotation.x = 0;
  // Seated on something that moves (horse rider): the caller supplies the world seat point.
  if (e.seat) { root.position.copy(e.seat); root.rotation.y = e.face; e.h.animate(dt, 0, false, false, false); return; }
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
  if (!S.tools.spear || P.cool > 0 || busy || P.swim || P.sit > 0) return;
  camera.getWorldDirection(_v);
  P.face = Math.atan2(_v.x, _v.z);
  proj.m.position.copy(P.pos).add(_v2.set(0, 1.7, 0)).addScaledVector(_v, 0.5);
  _v2.copy(camera.position).addScaledVector(_v, 34);            // the point under the crosshair
  _v.copy(_v2).sub(proj.m.position).normalize(); _v.y += 0.035; _v.normalize();
  proj.vel.copy(_v).multiplyScalar(34);
  proj.on = true; proj.stuck = 0; proj.wet = false; proj.m.visible = true;
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
    if (o.state !== 'live' || o.horse) continue;     // WP4: the spear never hurts a horse
    const p = o.root.position;
    if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < 1.05 && m.position.y > p.y + 0.2 && m.position.y < p.y + 2.1) {
      proj.on = false; m.visible = false;
      hurt(o, 10);
      return;
    }
  }
  const gy = getHeight(m.position.x, m.position.z);
  if (!proj.wet && gy < -0.25 && m.position.y < 0) { proj.wet = true; A.hit(1800, 0.3, 0.35); }   // splash
  if (m.position.y < gy + 0.05) {
    proj.stuck = 4; A.hit(500, 0.12, 0.3);
    // Spear fishing: the deeper the water, the better the odds.
    if (gy < -0.25 && rand() < clamp(0.3 - gy * 0.12, 0.3, 0.6)) {
      give('fish', 1); bump('fished');
      if (cnt('fished') === 1) say('Sena', 'A fish! Bring it to the fire — it cooks quickly.');
    } else if (gy < -0.25 && cnt('fished') < 1 && !cnt('missLine')) { bump('missLine'); say('Sena', 'Missed. Aim a little below where they seem to be — the water lies.'); }
  }
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
  const a = makeAnimal(kind, extra.scale);          // WP4: extra.scale (the foal)
  const o = { kind, a, root: a.root, hp: HP[kind], state: 'live', timer: rand() * 6, dir: rand() * 6.283, speed: 0, flee: 0, stun: 0, bite: 0, pending: 0, avoid: 0, looted: false, graze: rand() < 0.5, ...extra };
  o.root.position.set(x, getHeight(x, z), z);
  o.root.rotation.y = o.dir;
  scene.add(o.root); animals.push(o);
  return o;
}
// ---------- WP4 horses ----------
// A wild herd on Horse Meadow. Sneak close with food and offer it (trust), then calm her by tapping E (taming).
// The tame horse is ridden (gaits, stamina, fords, slopes), called with X, bonds with you, and sleeps in the stable.
// While riding P.pos is the horse's ground position; updateHorses() seats Aro (and Sena behind) on the horse's back.
HP.horse = HP.horse_white = HP.donkey = 999;
const MEADOW = [175, 40];
const CALM_DECAY = 5;                        // calm lost per second while taming (spec 6; 5 lets 12 quick taps win)
let horseHerd = null, heart = null, hTick = 0, hTired = false, hStepT = 0, hIdle = 0, hRefuseT = 0, noSaddleToast = false, rideDist = 0, kickCool = 0, wHeld = 0, eTap = false;
const _hs = new THREE.Vector3(), _hp = new THREE.Vector3(), _hn = new THREE.Vector3();
const tameHorse = () => animals.find((o) => o.horse && o.tame);
const hLvl = () => 1 + Math.min(3, ((S.horse?.bond || 0) / 100) | 0);
const hName = () => S.horse?.name || 'The horse';
const hMaxStam = () => 100 + 15 * (hLvl() - 1);
const horseFood = () => (S.inv.grain >= 2 ? 'grain' : S.inv.berry >= 3 ? 'berry' : null);
const horseCurious = () => P.sneak && !P.ride && !!horseFood();
const nFree = () => !(N.sit > 0) && !(N.rest > 0) && !(N.work > 0) && !N.working && !(N.dance > 0) && !N.soak && !busy;
function spawnWildHerd() {
  if (!STORY || !reached('herd')) return;
  if (animals.some((o) => o.horse && !o.tame && o.state === 'live')) return;
  const [cx, cz] = MEADOW;
  horseHerd = { x: cx, z: cz, tx: cx, tz: cz, timer: 30, flee: 0, side: bank(cx, cz) };
  for (const [kind, ox, oz, sc] of [['horse', -3, 0], ['horse', 3, 2.5], ['horse_white', 0.5, -4], ['horse', -1.6, 1.4, 0.3]])
    spawn(kind, cx + ox, cz + oz, { herd: horseHerd, ox, oz, horse: true, wild: true, trust: 0, foal: !!sc, scale: sc });
}
function horseHome() {
  const st = structs.find((s) => s.kind === 'stable' && s.rise >= 1) || structs.find((s) => s.kind === 'house' && s.rise >= 1) || structs.find((s) => s.kind === 'fire');
  return st ? { x: st.x, z: st.z, kind: st.kind } : { x: 0, z: 0 };
}
function addBond(n) {
  const H = S.horse; if (!H) return;
  const l0 = hLvl(); H.bond = clamp((H.bond || 0) + n, 0, 400);
  if (hLvl() > l0) { toast(`${H.name} trusts you more (Bond ${hLvl()})`); A.tone(660, 0.5, 0.08); A.tone(880, 0.6, 0.06, 0.15); }
}
function showHeart(o) {
  if (!heart) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const tex = new THREE.CanvasTexture(c), spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(1.6, 0.4, 1); spr.renderOrder = 10; scene.add(spr);
    heart = { c, tex, spr, t: 0, o: null };
  }
  const g = heart.c.getContext('2d'), txt = '♥'.repeat(clamp(o.trust, 1, 5));
  g.clearRect(0, 0, 256, 64); g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(40,10,15,0.7)'; g.strokeText(txt, 128, 34); g.fillStyle = '#ff6b8a'; g.fillText(txt, 128, 34);
  heart.tex.needsUpdate = true; heart.t = 3; heart.o = o; heart.spr.visible = true;
}
function offerFood(o, f) {
  S.inv[f] -= f === 'grain' ? 2 : 3; drawInv();
  o.trust = (o.trust || 0) + 1; bump('horse_fed');
  o.a.play('Eating', true); o.stun = 2.4; o.speed = 0;
  o.dir = o.root.rotation.y = Math.atan2(P.pos.x - o.root.position.x, P.pos.z - o.root.position.z);
  P.h.swing(); showHeart(o); A.tone(740, 0.3, 0.06);
  if (cnt('horse_fed') === 1) say('Sena', 'She is curious. Keep your hand low.');
  toast(o.trust >= 3 ? 'She trusts you. Climb on her back (E)' : `She eats the ${f === 'grain' ? 'grain' : 'berries'} from your hand`);
}
function startTame(o) {
  P.ride = o; P.taming = { calm: 0, t: 10, ph: 0, i: 0 }; P.sneak = false; P.auto = false; P.vx = P.vz = 0; P.hv = 0;
  P.face = o.root.rotation.y; P.pos.copy(o.root.position); P.h.spear.visible = false; P.h.axe.visible = false;
  o.speed = 0; o.stun = 0; eTap = false;
  $('bar-calm').style.display = ''; $('b-calm').style.width = '0%';
  toast('Press E again and again to calm her'); A.hit(200, 0.3, 0.5);
}
function tameStep(dt, o) {
  const tm = P.taming;
  if (eTap) { tm.calm += S.tools.saddle ? 10 : 7; S.stam = Math.max(0, S.stam - 4); A.hit(700 + tm.calm * 4, 0.05, 0.12); }
  eTap = false; tapE = false;
  tm.calm = clamp(tm.calm - dt * CALM_DECAY, 0, 100); tm.t -= dt;
  if ((tm.ph -= dt) <= 0) {                  // bucking: kick, flinch, a burst of gallop in place
    const k = ['Attack_Kick', 'Idle_HitReact_Left', 'Gallop', 'Idle_HitReact_Right'][tm.i++ % 4];
    o.a.play(k, k !== 'Gallop', k === 'Gallop' ? 1.4 : 1.1); tm.ph = k === 'Gallop' ? 0.9 : 0.75;
  }
  o.root.rotation.y = P.face + Math.sin(clock * 6) * 0.3 * (1 - tm.calm / 100);
  $('b-calm').style.width = tm.calm + '%';
  if (tm.calm >= 100) tameSuccess(o);
  else if (tm.t <= 0 || S.stam <= 0) thrownOff(o);
}
function tameSuccess(o) {
  Object.assign(o, { tame: true, herd: null, wild: false, foal: false, trust: 3, call: false });
  o.home = horseHome(); o.root.rotation.y = P.face;
  S.horse = { kind: o.kind, name: o.kind === 'horse_white' ? 'Mist' : 'Dawn', bond: 0, stam: 100, fedDay: -1 };
  P.taming = null; $('bar-calm').style.display = 'none'; $('bar-horse').style.display = '';
  o.a.play('Idle'); bump('tamed');
  banner('Tamed', `She lets you sit on her back. Her name is ${S.horse.name}.`);
  say('Sena', `She chose you. Let us call her ${S.horse.name}.`);
  addClose(3, 'a horse of our own'); drawQuest(); save();
}
function thrownOff(o) {
  P.taming = null; $('bar-calm').style.display = 'none';
  dismount(true);
  S.hp = Math.max(0, S.hp - 5); hurtFlash = 0.7; o.trust = Math.max(0, (o.trust || 0) - 1);
  toast('Thrown off! She trusts you a little less.'); A.hit(160, 0.3, 0.8);
  alarm(o);
}
function mount(o) {
  if (!o) return;
  P.ride = o; P.taming = null; P.sneak = false; P.air = false; P.jy = 0; P.vy = 0; P.vx = P.vz = 0; P.hv = 0; P.auto = false; P.sit = 0;
  P.face = o.root.rotation.y; P.pos.copy(o.root.position);
  P.h.spear.visible = false; P.h.axe.visible = false; useCool = 0.8; wHeld = 0; hIdle = 0;
  Object.assign(o, { call: false, speed: 0, stun: 0, flee: 0 });
  if (placing) { placing = null; ghost.visible = false; }
  if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 10 && nFree()) { N.ride = true; N.node = null; N.act = 0; N.speed = 0; }
  $('bar-horse').style.display = ''; A.hit(300, 0.15, 0.25);
}
const clearSeat = (e) => { e.seat = null; e.saddle = null; e.pOff = null; e.h.pose = null; e.h.straddle = false; };
function dismount(thrown = false) {
  const o = P.ride; if (!o) return;
  const f = P.face, rx = Math.cos(f), rz = -Math.sin(f), hp = o.root.position;
  P.ride = null; P.taming = null; P.jy = 0; P.vy = 0; P.air = false; P.vx = P.vz = 0; P.hv = 0; P.speed = 0;
  P.pos.set(hp.x + rx * (thrown ? 1.8 : 1.3), 0, hp.z + rz * (thrown ? 1.8 : 1.3)); collide(P.pos, 0.35);
  clearSeat(P);
  if (N.ride) { N.ride = false; N.pos.set(hp.x - rx * 1.3, 0, hp.z - rz * 1.3); collide(N.pos, 0.3); clearSeat(N); N.face = f; N.wait = 4; }
  Object.assign(o, { speed: 0, walk: false, timer: 8, dir: f });
  o.root.rotation.y = f; o.root.position.y = getHeight(hp.x, hp.z);
  if (o.tame) { o.home = horseHome(); o.a.play('Idle'); }
  useCool = 0.8; camDist = Math.min(camDist, 9);
  $('bar-horse').style.display = 'none'; $('bar-calm').style.display = 'none';
}
function callHorse() {
  const o = tameHorse();
  if (!STORY || !S.horse || !o || P.ride) return;
  A.tone(1480, 0.18, 0.05); A.tone(1980, 0.3, 0.05, 0.16);
  const hp = o.root.position, d = Math.hypot(hp.x - P.pos.x, hp.z - P.pos.z);
  if (depthAt(P.pos.x, P.pos.z) > 0.05 || depthAt(hp.x, hp.z) > 0.05) { o.call = false; toast(`${hName()} cannot hear you in here.`); return; }
  if (d > [80, 140, 220, Infinity][hLvl() - 1]) { o.call = false; toast(`${hName()} is too far away to hear you.`); return; }
  if (d < 3) return;
  Object.assign(o, { call: true, callT: 0, callBest: d, stun: 0 }); toast(`You whistle. ${hName()} is coming.`);
}
function horseCatchUp(o) {          // stuck on the way: appear 25 m behind you, out of view, on dry ground
  for (let i = 0; i < 14; i++) {
    const a = camYaw + (i % 2 ? 1 : -1) * (i >> 1) * 0.3, x = P.pos.x + Math.sin(a) * 25, z = P.pos.z + Math.cos(a) * 25;
    if (Math.abs(x) < LIMIT && Math.abs(z) < LIMIT && getHeight(x, z) > 0.4 && depthAt(x, z) <= 0) {
      o.root.position.set(x, getHeight(x, z), z); o.callT = 0; o.callBest = 25; return;
    }
  }
}
// Called in updateAnimal for horses, after the normal brain: curiosity (wild), whistle, wolves (tame).
function horseWant(o, want, dist, dx, dz, dt) {
  const p = o.root.position;
  if (!o.tame) {
    if (horseCurious() && dist < 6) { o.dir = Math.atan2(-dx, -dz); return 0; }   // curious: stands still and looks at you
    return want;
  }
  const w = animals.find((a) => a.kind === 'wolf' && a.state === 'live' && Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z) < 10);
  if (w && !o.call) {
    const h = o.home || { x: 0, z: 0 };
    if (!o.avoid) o.dir = Math.hypot(h.x - p.x, h.z - p.z) > 6 ? Math.atan2(h.x - p.x, h.z - p.z) : Math.atan2(p.x - w.root.position.x, p.z - w.root.position.z);
    return 8.5;
  }
  if (o.call) {
    if (dist < 3) { o.call = false; return 0; }
    if (!o.avoid) o.dir = Math.atan2(-dx, -dz);
    o.callT += dt;
    if (dist < o.callBest - 0.5) { o.callBest = dist; o.callT = 0; }
    if (o.callT > 4) horseCatchUp(o);
    return dist > 12 ? 11 : 5;
  }
  return want;
}
function wp4Target(p) {
  if (!STORY || P.taming) return null;
  if (P.ride) return { label: `Dismount${S.horse ? ' ' + hName() : ''}`, key: true, act() { if (eTap) dismount(); } };
  let o = null, bd = 3;
  for (const a of animals) {
    if (!a.horse || a.state !== 'live' || a.foal) continue;
    const d = Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z);
    if (d < bd) { bd = d; o = a; }
  }
  if (!o) return null;
  if (o.tame) {
    if (bd > 2.6) return null;
    const f = horseFood();
    if (f && S.horse && S.horse.fedDay !== S.day) return { label: `Feed ${hName()} (${f === 'grain' ? '2 grain' : '3 berries'})`, key: true, act() {
      S.inv[f] -= f === 'grain' ? 2 : 3; drawInv(); S.horse.fedDay = S.day; addBond(10); o.a.play('Eating', true); o.stun = 2; showHeart({ ...o, trust: 3 }); toast(`${hName()} eats from your hand`);
    } };
    return { label: `Ride ${hName()}`, key: true, act() { if (eTap) mount(o); } };
  }
  if (o.foal || S.horse || bd > 2.8) return null;
  if (!P.sneak) return { label: 'Sneak (C) to come closer to the wild horse' };
  if ((o.trust || 0) >= 3) return { label: 'Climb on her back', key: true, act() { if (eTap) startTame(o); } };
  const f = horseFood();
  if (!f) return { label: 'Bring 2 grain or 3 berries to offer her' };
  return { label: f === 'grain' ? 'Offer grain' : 'Offer berries', key: true, act() { offerFood(o, f); } };
}
function refuse(o, why) {
  P.hv = 0;
  if (hRefuseT > 0) return;
  hRefuseT = 2.5; toast(why); o.a.play(rand() < 0.5 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right', true); A.hit(240, 0.2, 0.3);
}
// The ride branch of updatePlayer: gaits, steering, limits, jump, clips, then the prompt (only "Dismount").
function updateRide(dt, mx, mz) {
  const o = P.ride, H = S.horse || { stam: 100 };
  P.sneak = false; P.swim = false; P.auto = false; P.sit = 0;
  if (placing) { placing = null; ghost.visible = false; }
  hRefuseT -= dt;
  if (P.taming) {
    tameStep(dt, o);
    P.speed = 0; o.root.position.copy(P.pos);
    settle(P, dt, false); target = null; $('prompt').style.display = 'none'; jumpTap = false;
    return;
  }
  S.stam = clamp(S.stam + dt * 18 * (S.rested > 0 ? 1.5 : 1), 0, 100);   // sitting on the horse: like standing still
  const can = !menuOpen && !busy, saddle = !!S.tools.saddle, shift = keys.ShiftLeft || keys.ShiftRight;
  const fwd = Math.max(mz, 0), steer = can && (mx || fwd);
  wHeld = steer ? wHeld + dt : 0;
  let want = 0;
  if (steer) {
    want = 5.5;
    if (wHeld > 1.5) want = 9;
    if (shift && !hTired && H.stam > 0) want = 13 * (1 + 0.05 * (hLvl() - 1));
    if (hTired) want = Math.min(want, 5.5);
    if (!saddle && want > 5.5) { want = 5.5; if (!noSaddleToast) { noSaddleToast = true; toast('Without a saddle you can only trot.'); } }
  } else if (can && mz < 0) want = P.hv > 0.3 ? 0 : -1.5;          // S brakes, then backs up
  const galloping = want > 9.5 && P.hv > 7;
  H.stam = clamp(H.stam + dt * (galloping ? -12 : 10), 0, hMaxStam());
  if (H.stam <= 0) hTired = true; else if (H.stam >= 30) hTired = false;
  if (steer) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), dx = fx * fwd - fz * mx, dz = fz * fwd + fx * mx;
    const d = ((Math.atan2(dx, dz) - P.face + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI, rate = lerp(2.4, 1.1, clamp(Math.abs(P.hv) / 13, 0, 1)) * dt;
    P.face += clamp(d, -rate, rate);
  }
  P.hv += (want - P.hv) * Math.min(1, dt * 2.5);
  const gh = getHeight(P.pos.x, P.pos.z);
  if (gh < -0.3) P.hv = clamp(P.hv, -1.5, 3);                       // wading: slow
  const fx = Math.sin(P.face), fz = Math.cos(P.face), sg = Math.sign(P.hv) || 1;
  if (Math.abs(P.hv) > 0.05) {
    const nx = P.pos.x + fx * P.hv * dt, nz = P.pos.z + fz * P.hv * dt;
    const ahead = getHeight(P.pos.x + fx * sg, P.pos.z + fz * sg);
    if (getHeight(nx, nz) < -0.9) refuse(o, `${hName()} will not go into deep water. Find a ford.`);
    else if (ahead - gh > 0.75) refuse(o, `It is too steep for ${hName()} here.`);
    else if (depthAt(nx, nz) > 0.05) refuse(o, `${hName()} will not go into the dark.`);
    else if (Math.abs(nx) > LIMIT || Math.abs(nz) > LIMIT) P.hv = 0;
    else {
      P.pos.x = nx; P.pos.z = nz; collide(P.pos, 0.75);
      _hn.set(P.pos.x + fx * 1.1 * sg, 0, P.pos.z + fz * 1.1 * sg); const px = _hn.x, pz = _hn.z; collide(_hn, 0.5);
      if (Math.hypot(_hn.x - px, _hn.z - pz) > 0.02) P.hv *= Math.max(0, 1 - dt * 10);   // nose against a tree or wall
      rideDist += Math.abs(P.hv) * dt;
      if (rideDist >= 25) { rideDist -= 25; addBond(1); }
    }
  }
  const v = Math.abs(P.hv);
  if (jumpTap && can && !P.air && v > 4 && H.stam >= 20) { P.vy = 5.6; P.air = true; H.stam -= 20; o.a.play('Gallop_Jump', true, 1.1); A.hit(300, 0.12, 0.25); }
  jumpTap = false;
  if (P.air) { P.vy -= 15 * dt; P.jy += P.vy * dt; if (P.jy <= 0) { P.jy = 0; P.vy = 0; P.air = false; A.hit(120, 0.15, 0.4); } }
  P.pos.y = getHeight(P.pos.x, P.pos.z) + P.jy;
  o.root.position.copy(P.pos); o.root.rotation.y = P.face;
  hIdle = v < 0.3 ? hIdle + dt : 0;
  if (!o.a.busy) {
    if (v < 0.3) o.a.play(hIdle > 8 ? 'Eating' : 'Idle');
    else if (v < 3.5) o.a.play('Walk', false, P.hv / 2.2);
    else if (v < 7) o.a.play('Gallop', false, 0.55);
    else o.a.play('Gallop', false, v / 13 + 0.2);
  }
  hStepT += dt;
  if (v > 0.5 && !P.air && hStepT > Math.max(0.13, 2.2 / v)) { hStepT = 0; A.hit(gh < -0.2 ? 900 : 110 + rand() * 50, 0.05, 0.1); }
  P.speed = v; P.vx = fx * P.hv; P.vz = fz * P.hv;
  P.cool = Math.max(0, P.cool - dt);
  settle(P, dt, false);
  useCool -= dt;
  target = busy || menuOpen ? null : findTarget();
  const pr = $('prompt');
  if (target) { pr.style.display = 'block'; pr.innerHTML = (target.key ? '<kbd>E</kbd> ' : '') + target.label; } else pr.style.display = 'none';
  const use = keys.KeyE || tapE; tapE = false;
  if (use && useCool <= 0 && !busy && !menuOpen && target?.act) { target.act(); useCool = Math.max(useCool, 0.42); drawQuest(); }
}
// Seat a rider: the pelvis goes onto the horse's back at the named bone; returns the saddle point.
function seatOn(e, o, boneName, back) {
  o.root.updateMatrixWorld(true);
  o.a.bone(boneName).getWorldPosition(_hs);
  _hs.y += 0.65 * o.a.model.scale.y + 0.1;          // the back surface (measured by raycast) is at Torso2 + 0.31; the hip joint sits 0.1 above it
  _hs.x -= Math.sin(P.face) * back; _hs.z -= Math.cos(P.face) * back;
  const root = e.h.root;
  root.updateMatrixWorld(true);
  e.h.bones.pelvis.getWorldPosition(_hp); root.worldToLocal(_hp);
  e.pOff = e.pOff ? e.pOff.lerp(_hp, 0.5) : _hp.clone();
  root.position.copy(_hs); root.rotation.set(0, P.face, 0); root.updateMatrixWorld(true);
  _hp.copy(e.pOff); root.localToWorld(_hp);
  root.position.sub(_hp.sub(_hs)); root.updateMatrixWorld(true);
  e.seat = (e.seat || new THREE.Vector3()).copy(root.position); e.face = P.face;
  e.saddle = (e.saddle || new THREE.Vector3()).copy(_hs);
}
// After the animals loop: the herd's wandering, the heart, the riders' seats, kicks, the 0.5 s tick.
function updateHorses(dt) {
  eTap = false;
  if (!STORY) return;
  const h = horseHerd;
  if (h) {
    h.flee -= dt; h.timer -= dt;
    if (h.timer <= 0) { [h.tx, h.tz] = landSpot(MEADOW[0], MEADOW[1], 0, 32); h.timer = 40 + rand() * 40; }
    const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz), sp = (h.flee > 0 ? 9.5 : 1.1) * dt;
    if (d > sp) { h.x += (dx / d) * sp; h.z += (dz / d) * sp; }
  }
  if (heart && heart.t > 0) {
    heart.t -= dt; heart.spr.visible = heart.t > 0; heart.spr.material.opacity = Math.min(1, heart.t * 2);
    heart.spr.position.copy(heart.o.root.position); heart.spr.position.y += 2.3 + (3 - heart.t) * 0.15;
  }
  const o = P.ride;
  if (o) {
    if (P.taming) { o.root.updateMatrixWorld(true); }
    seatOn(P, o, 'Torso2', 0); P.h.pose = 'ride';
    if (N.ride) { seatOn(N, o, 'Torso', 0.15); N.h.pose = 'sit'; N.h.straddle = true; N.pos.copy(P.pos); }
    if (S.horse) $('b-horse').style.width = (S.horse.stam / hMaxStam() * 100) + '%';
  }
  const th = tameHorse();
  if (th) {
    kickCool -= dt;
    const hp = th.root.position, f = th.root.rotation.y;
    for (const w of animals) {
      if (w.kind !== 'wolf' || w.state !== 'live' || kickCool > 0) continue;
      const dx = w.root.position.x - hp.x, dz = w.root.position.z - hp.z, d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * Math.sin(f) + dz * Math.cos(f)) / (d || 1) < -0.2) { th.a.play('Attack_Kick', true, 1.2); hurt(w, 3); kickCool = 2; }
    }
  }
  hTick -= dt;
  if (hTick > 0) return;
  hTick = 0.5;
  if (th && th !== P.ride && !th.call) th.home = horseHome();
  if (S.horse && !P.ride) S.horse.stam = clamp(S.horse.stam + 5, 0, hMaxStam());
  const pk = LMK?.peak;
  if (pk && P.ride && N.ride && !cnt('peak_ride') && Math.hypot(pk.x - P.pos.x, pk.z - P.pos.z) < 10) {
    bump('peak_ride');
    say('Sena', 'From up here the whole valley is ours to see.'); say('Aro', 'And there is our smoke. Home.');
    addClose(3, 'rode to the peak together'); drawQuest();
  }
}
// sleep(): the horse spends the night in the stable (stamina full, +5 bond).
function horseNight() {
  const o = tameHorse(); if (!o || !S.horse) return;
  S.horse.stam = hMaxStam();
  const st = structs.find((s) => s.kind === 'stable' && s.rise >= 1);
  if (!st || o === P.ride) return;
  o.root.position.set(st.x, getHeight(st.x, st.z), st.z); o.root.rotation.y = o.dir = st.rot || 0;
  Object.assign(o, { call: false, speed: 0, walk: false, timer: 10, home: horseHome() });
  addBond(5); bump('stable_night');
}
function horseSave() {
  const o = tameHorse();
  if (!S.horse || !o) return;
  Object.assign(S.horse, { x: +o.root.position.x.toFixed(2), z: +o.root.position.z.toFixed(2), face: +o.root.rotation.y.toFixed(3), riding: !!P.ride && !P.taming, nRide: !!N.ride });
}
function wp4Load() {
  if (!STORY) return;
  const H = S.horse;
  if (H && !tameHorse()) {
    const home = horseHome(), x = H.x ?? home.x + 3, z = H.z ?? home.z + 3;
    const o = spawn(H.kind || 'horse', x, z, { tame: true, horse: true, home, trust: 3 });
    o.root.rotation.y = o.dir = H.face ?? 0;
    H.stam = H.stam ?? 100; H.bond = H.bond ?? 0;
    if (H.riding) { mount(o); if (!H.nRide) N.ride = false; else if (!N.ride) N.ride = true; }
  }
  if (reached('herd')) spawnWildHerd();
}
function remove(o) { scene.remove(o.root); const i = animals.indexOf(o); if (i >= 0) animals.splice(i, 1); }
// Live wolves that are not leaving, within r of p (rest rules, auto-draw, auto-sheathe)
function hostileNear(r, p = P.pos) { return animals.some((o) => o.kind === 'wolf' && o.state === 'live' && !o.leave && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < r); }
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
  if (o.pending > 0 && (o.pending -= dt) <= 0 && dist < 2.7 && !busy && !(P.ride && P.speed > 6)) {   // WP4: no bite at a gallop
    S.hp = Math.max(0, S.hp - 6); hurtFlash = 1; A.hit(180, 0.3, 0.9); }
  if (o.leave) { if (!o.avoid) o.dir = Math.atan2(dx, dz); if (dist > 95) remove(o); return 7; }
  const safe = P.swim || torchOn || structs.some((s) => s.kind === 'fire' && s.rise >= 1 && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 8);
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
  if (o === P.ride) { o.a.update(dt); return; }     // WP4: the ridden horse is moved by updateRide
  o.a.update(dt);
  if (o.state === 'dead') { o.deadT += dt; if (o.looted && clock > o.respawn) revive(o); return; }
  if (o.stun > 0) { o.stun -= dt; return; }
  o.avoid = Math.max(0, o.avoid - dt);
  const dx = p.x - P.pos.x, dz = p.z - P.pos.z, dist = Math.hypot(dx, dz);
  let want = 0;
  if (o.kind === 'wolf') want = wolfBrain(o, dist, dx, dz, dt);
  else {
    if (!o.tame && dist < (P.sneak ? 7 : P.speed > 4 ? 30 : 17) && !(o.horse && horseCurious())) alarm(o);   // WP4: food in hand, sneaking: curious horses
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
  if (o.horse) want = horseWant(o, want, dist, dx, dz, dt);   // WP4 curiosity, whistle, wolves
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
    const n = reached('house') ? 4 : 3, a = rand() * 6.283;
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
  rain.visible = E.storm > 0.02 && !(E.cave > 0.3);          // WP3: no rain inside a cave
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
  if (!reached('fire')) return;
  if (E.night > 0.6) { if (reached('hunt') && !wolves.length) EVENTS.wolves(); else if (EV.storm <= 0) EVENTS.storm(); }
  else if (rand() < 0.45 && EV.storm <= 0) EVENTS.storm();
  else EVENTS.herd();
}

// ---------- melee ----------
let hitT = 0, hitDmg = 0, punchSide = 0;
function attack() {
  if (P.cool > 0 || busy || P.swim || P.sit > 0 || P.ride) return;   // WP4: no melee from the saddle
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
    if (o.state !== 'live' || o.horse) continue;     // WP4: no punching horses
    const dx = o.root.position.x - P.pos.x, dz = o.root.position.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = o; }
  }
  if (best) hurt(best, hitDmg);
}

// ---------- building ----------
// WP2 construction sites: timed kinds are raised by hand (Aro holds E, Sena works on the far side; faster together).
const BUILD_TIME = { hut: 16, kiln: 10, house: 36, farm: 5, well: 12, stable: 14 };
const toWorld = (s, [lx, ly, lz]) => { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); return new THREE.Vector3(s.x + lx * c + lz * sn, s.group.position.y + ly, s.z - lx * sn + lz * c); };
function placeStruct(kind, x, z, rot, instant, grow, p) {
  const st = makeStructure(kind);
  if (p != null && BUILD_TIME[kind]) instant = false;            // WP2: a half-built site from a save
  Object.assign(st, { x, z, rot, rise: instant ? 1 : 0 });
  if (grow != null) st.grow = grow;
  st.group.position.set(x, getHeight(x, z), z);
  st.group.rotation.y = rot;
  scene.add(st.group);
  structs.push(st);
  if (st.solid) st.col = addCollider({ x, z, r: st.radius * (kind === 'house' ? 0.8 : 0.9) });
  // WP2: small local colliders (stable back wall, fence, basket) instead of one solid circle
  if (st.cols) st.colList = st.cols.map(([lx, lz, r]) => { const w = toWorld(st, [lx, 0, lz]); return addCollider({ x: w.x, z: w.z, r }); });
  if (BUILD_TIME[kind] && !instant) {
    Object.assign(st, { timed: true, rise: clamp(p || 0, 0, 0.999), byA: 0, byN: 0 });
    st.scaf = makeScaffold(st.radius); st.scaf.position.copy(st.group.position); st.scaf.rotation.y = rot; scene.add(st.scaf);
    siteLook(st);
  } else st.stage?.(1);
  world.clear(x, z, st.radius + 0.4);
  for (const f of world.fields) for (const n of f.nodes) if (n.alive && Math.hypot(n.x - x, n.z - z) < st.radius + 0.6) { n.gone = true; f.set(n, false); }
  return st;
}
let placing = null;
const ghost = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x9be37a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, fog: false }));
ghost.visible = false; scene.add(ghost);
const R_OF = { fire: 0.8, hut: 2.3, kiln: 1.4, house: 4.4, farm: 3.1, well: 1.3, rack: 1, stable: 3, fence: 1.3, path: 1.2, flowers: 1, basket: 0.6 };
function ghostSpot() {
  const r = R_OF[placing.id], d = r + 2.4;
  let x = P.pos.x - Math.sin(camYaw) * d, z = P.pos.z - Math.cos(camYaw) * d, rot = null, snap = null;
  // WP2 fence: snap to the free end of a fence within 1.5 m (same rotation, continuing the line)
  if (placing.id === 'fence') {
    let bd = 1.5 + 1.2;
    for (const s of structs) if (s.kind === 'fence') for (const sg of [-1, 1]) {
      const dx = Math.cos(s.rot) * sg, dz = -Math.sin(s.rot) * sg, nx = s.x + dx * 2.4, nz = s.z + dz * 2.4;
      if (structs.some((o) => o.kind === 'fence' && Math.hypot(o.x - nx, o.z - nz) < 0.5)) continue;
      const dd = Math.hypot(nx - x, nz - z);
      if (dd < bd) { bd = dd; snap = s; x = nx; z = nz; rot = s.rot; }
    }
  }
  const h = getHeight(x, z);
  let ok = h > 0.9 && Math.abs(x) < LIMIT && Math.abs(z) < LIMIT;
  for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(getHeight(x + ox * 0.8, z + oz * 0.8) - h) > (r > 2 ? 0.75 : 0.5)) ok = false;
  for (const s of structs) {
    if (placing.id === 'fence' && s.kind === 'fence' && Math.hypot(s.x - x, s.z - z) > 2) continue;   // fences may touch end to end
    if (placing.id === 'path' && s.kind === 'path' && Math.hypot(s.x - x, s.z - z) > 1.6) continue;  // paths may line up closely
    if (Math.hypot(s.x - x, s.z - z) < s.radius + r + 0.4) ok = false;
  }
  return { x, z, h, ok, r, rot, snap };
}
function confirmPlace() {
  const g = ghostSpot();
  if (!g.ok) { toast('Cannot build here — find flat, dry, open ground'); return; }
  for (const k in placing.cost) S.inv[k] -= placing.cost[k];
  placeStruct(placing.id, g.x, g.z, g.rot ?? Math.atan2(P.pos.x - g.x, P.pos.z - g.z), false);
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
  if (r.up) { homeUpgrade(r); return; }                                   // WP2 house upgrades
  for (const k in r.cost) S.inv[k] -= r.cost[k];
  if (r.item) S.inv[r.item]++; else S.tools[r.id] = true;
  toast(`Crafted: ${r.name}`); A.hit(900, 0.2, 0.4);
  drawInv(); drawQuest(); save();
}
// Recipes the craft menu offers now: chapter reached, not yet owned (tools), and actually buildable in this build.
const menuRecipes = () => RECIPES.filter((r) => reached(r.ch) && (r.place || r.item || r.up || !S.tools[r.id])
  && !(r.place && !BUILD[r.id]) && !(r.up && S.home[r.id]));      // WP2: house upgrades show until built
// WP2 home: the first brick house is "home" (village houses from the epilogue get no interior).
const homeHouse = () => structs.find((s) => s.kind === 'house' && !s.village);
function applyHome() {
  const h = homeHouse();
  if (!h) return;
  h.setHome?.(S.home);
  if (S.home.nursery && !h.annexCol) { const w = toWorld(h, [-4.8, 0, 0]); h.annexCol = addCollider({ x: w.x, z: w.z, r: 1.7 }); }
}
function homeUpgrade(r) {
  const h = homeHouse();
  if (!h || h.rise < 1) { toast('Build the brick house first'); return; }
  if (Math.hypot(h.x - P.pos.x, h.z - P.pos.z) > 16) { toast('Go home to the house to build this'); return; }
  for (const k in r.cost) S.inv[k] -= r.cost[k];
  drawInv();
  fadeTo(`Aro and Sena build the ${r.name.toLowerCase()} together…`, () => {
    S.home[r.id] = true; applyHome();
    bump('built_together'); addClose(3, 'built together');
    S.time = (S.time + 2) % 24;
    drawQuest(); save();
  });
}
// WP2 site look: the building grows up out of the ground (house: foundation, walls, roof); scaffold while unfinished.
function siteLook(s) {
  const k = 1 - (1 - s.rise) ** 2;
  s.group.scale.set(1, 0.06 + 0.94 * k, 1);
  s.stage?.(s.rise);
  if (s.scaf) s.scaf.visible = s.rise < 1;
}
function completeSite(s) {
  s.rise = 1; s.group.scale.set(1, 1, 1); s.stage?.(1);
  if (s.scaf) { scene.remove(s.scaf); s.scaf = null; }
  if (P.workSite === s) { P.work = 0; P.workSite = null; }
  if (P.h.pose === 'work') P.h.pose = null;
  if (N.workSite === s) { N.working = false; N.workSite = null; if (N.h.pose === 'work') N.h.pose = null; }
  if (s.byN > 1.5 && s.byA > 1.5) {
    bump('built_together'); addClose(5, 'built together'); toast(`Built together: ${s.label}`);
    P.dance = N.dance = 3; P.h.pose = 'dance'; N.h.pose = 'dance'; P.vx = P.vz = 0; P.auto = false;
  }
  if (s.kind === 'house') applyHome();
}
const SITE_LINE = { house: 'One more row and we can see the river through the window.' };
function updateSites(dt) {
  for (const s of structs) {
    if (!s.timed || s.rise >= 1) continue;
    const a = P.work > 0 && P.workSite === s ? 1 : 0, n = N.workSite === s && N.working ? 1 : 0;
    const rate = a && n ? 2.2 : a ? 1 : n ? 0.6 : 0;
    if (!rate) continue;
    s.rise = Math.min(1, s.rise + (dt * rate) / BUILD_TIME[s.kind]); s.byA += dt * a; s.byN += dt * n;
    if (!s.said && s.rise >= 0.3 && n) { s.said = true; say('Sena', SITE_LINE[s.kind] || 'Hold that beam steady, I will tie it.'); }
    siteLook(s);
    if (s.rise >= 1) { completeSite(s); A.hit(300, 0.4, 0.5); drawQuest(); if (s.kind === 'house' && cnt('homeLine') < 1) { bump('homeLine'); say('Sena', 'It is beautiful. No one has ever had a home like this.'); } }
  }
}
// Sena walks to the side of the site opposite Aro, kneels and works; returns true while she is busy building.
function senaBuild(dt) {
  const s = structs.find((o) => o.timed && o.rise < 1 && Math.hypot(o.x - P.pos.x, o.z - P.pos.z) < 45);
  if (!s) {
    if (N.workSite || N.h.pose === 'work') { N.working = false; N.workSite = null; if (N.h.pose === 'work') N.h.pose = null; }
    return false;
  }
  if (N.workSite !== s) {
    const ang = Math.atan2(P.pos.x - s.x, P.pos.z - s.z) + Math.PI, r = s.radius + 0.8;
    Object.assign(N, { workSite: s, working: false, workSpot: [s.x + Math.sin(ang) * r, s.z + Math.cos(ang) * r], pickT: 6, walkT: 0 });
  }
  N.node = null; N.act = 0;
  if (!N.working) {
    if (N.h.pose === 'work') N.h.pose = null;
    const [wx, wz] = N.workSpot, d = Math.hypot(wx - N.pos.x, wz - N.pos.z);
    N.walkT += dt;
    if (N.walkT > 14) N.pos.set(wx, 0, wz);                     // stuck behind something: step there
    if (walkTo(N, wx, wz, d > 12 ? 6.6 : 3.4, dt, 0.4) || (N.walkT > 7 && Math.hypot(s.x - N.pos.x, s.z - N.pos.z) < s.radius + 3)) { N.working = true; N.speed = 0; N.h.pose = 'work'; }
  } else {
    N.speed = 0; N.h.pose = 'work';
    N.face = Math.atan2(s.x - N.pos.x, s.z - N.pos.z);
    if ((N.pickT -= dt) <= 0) { N.pickT = 6; N.h.swing('pick'); }
  }
  return true;
}
// WP2 home light: the one hearth light, created at startup (lights are never added later), placed when the hearth exists.
const homeLight = new THREE.PointLight(0xffa860, 0, 9);
scene.add(homeLight);
function updateHome(dt) {
  if (playing && S.rested > 0) S.rested = Math.max(0, S.rested - dt);
  const h = S.home.hearth && homeHouse();
  if (h && h.rise >= 1) {
    h.hearthW ??= toWorld(h, h.hearthPt);
    homeLight.position.copy(h.hearthW); homeLight.intensity = 1 + 2 * world.env.night;
  } else homeLight.intensity = 0;
}
function toggleMenu(on = !menuOpen) {
  if (!playing || busy || mapOpen) return;
  menuOpen = on;
  $('craft').classList.toggle('on', on);
  if (on) {
    document.exitPointerLock?.();
    const box = $('recipes'); box.innerHTML = '';
    for (const r of menuRecipes()) {
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
  flint: ['Chip flint', () => give('flint', 1), 300],          // WP3 (cave nodes)
  ochre: ['Dig red ochre', () => give('ochre', 1), 400],
};
function take(n) {
  n.field.set(n, false);
  if (NODE[n.field.kind]?.[2] || n.field.kind === 'tree') respawns.push({ n, at: clock + (NODE[n.field.kind]?.[2] || 420) });
}
function findTarget() {
  const p = P.pos;
  const w4 = wp4Target(p); if (w4 || P.ride) return w4;   // WP4 horses: ride, feed, offer, tame; only "Dismount" while riding
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
  // Share a meal with Sena, once a day.
  if (S.c.mealDay !== S.day && !N.sit && Math.hypot(N.pos.x - p.x, N.pos.z - p.z) < 2.2) {
    const k = ['cooked', 'grilled', 'bread'].find((k) => S.inv[k] > 0);
    if (k) return { label: 'Share a meal with Sena', key: true, act() { shareMeal(k); } };
  }
  for (const f of world.fields) for (const n of f.nodes) {
    if (!n.alive) continue;
    const dx = n.x - p.x, dz = n.z - p.z;
    if (dx > 3.2 || dx < -3.2 || dz > 3.2 || dz < -3.2) continue;
    const d = Math.hypot(dx, dz) - (f.kind === 'tree' ? 0.9 : 0);
    if (d < 2 && d < bd) { bd = d; best = n; }
  }
  // WP2 construction site: hold E to build
  for (const s of structs) {
    if (!s.timed || s.rise >= 1 || Math.hypot(s.x - p.x, s.z - p.z) > s.radius + 2.5) continue;
    return { label: `Build the ${s.label}: ${Math.floor(s.rise * 100)}% (hold E)`, key: true, act() { P.work = 0.5; P.workSite = s; } };
  }
  for (const s of structs) {
    if (s.rise < 1) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z) - s.radius;
    if (d < 1.6 && d < bd + 0.6) { const t = structTarget(s); if (t) return t; }   // WP2: fence/path have no action
  }
  const w3 = wp3Target(p, best ? bd : 9);            // WP3 caves and landmarks
  if (w3) return w3;
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
  if (getHeight(p.x, p.z) < 0.45) return { label: 'Drink from the river', key: true, act() { S.water = Math.min(100, S.water + 40); bump('drank'); A.hit(2600, 0.25, 0.2); toast('You drink the cold water'); fillSkin(); } };
  return null;
}
// ---------- WP3 caves and landmarks ----------
const caves = world.caves, LMK = world.landmarks;
const senaTorch = makeTorch();                     // Sena carries her own light in the caves
senaTorch.root.position.set(0.02, 0.06, 0.02); senaTorch.root.rotation.x = 1.25;
N.h.bones.hand_l.add(senaTorch.root); scene.add(senaTorch.light);
senaTorch.lit = false; senaTorch.root.visible = false;
let senaLit = false, wp3T = 0, wp3Init = false, darkToast = 0;
const PAINT_LORE = ['Horses run across the stone, red as embers.', 'A person sits on a horse\'s back, arms raised.', 'Small hands, and big ones, around a fire.', 'Many huts around one fire.'];
const POI_LORE = {
  stones: 'Someone raised these, long ago. The shadows point toward the hills.',
  ruins: 'A house of brick… older than any we have made.',
};
const caveOf = (x, z) => CAVES.find((k) => Math.hypot(x - k.x, z - k.z) < k.R + 8);
// First visit to a point of interest (WP5 adds the fog reveal and the horse bond on top of this).
function discoverPOI(id) {
  if (S.found[id]) return false;
  const p = POIS.find((q) => q.id === id);
  if (!p) return false;
  S.found[id] = 1; bump('found_' + id);
  if (POI_LORE[id]) banner(p.name, POI_LORE[id]); else banner('Discovered', p.name);
  A.tone(784, 0.5, 0.06); A.tone(1046, 0.7, 0.04, 0.15);
  if (id === 'ruins') give('brick', 6);
  // WP5 map: reveal the fog around the place (the peak and stones see far), +1 bond when found on horseback
  reveal(p.x ?? P.pos.x, p.z ?? P.pos.z, id === 'peak' ? 230 : id === 'stones' ? 80 : p.r + 20);
  if (P.ride && S.horse) S.horse.bond = Math.min(400, (S.horse.bond || 0) + 1);
  drawQuest();
  return true;
}
function soakTogether() {
  const sp = LMK.spring, a = Math.atan2(P.pos.x - sp.x, P.pos.z - sp.z);
  const seat = (e, off) => {
    const x = sp.x + Math.sin(a + off) * 2.2, z = sp.z + Math.cos(a + off) * 2.2;
    e.pos.set(x, sp.y + 0.2, z); e.seat = new THREE.Vector3(x, sp.y + 0.2, z); e.soak = true;
    e.face = Math.atan2(sp.x - x, sp.z - z); e.sit = 8; e.vx = e.vz = 0;
  };
  seat(P, 0); seat(N, 0.45);
  P.auto = false; N.node = null; N.act = 0;
  P.h.pose = 'sit'; N.h.pose = N.h.has('sitTalk') ? 'sitTalk' : 'sit';
  S.warm = 100; S.hp = Math.min(100, S.hp + 20); bump('soak');
  say('Sena', ['Warm water in the cold hills. The earth is kind to us today.', 'Stay a while. My feet have walked enough for one day.'][cnt('soak') % 2]);
  if (S.c.springDay !== S.day) { S.c.springDay = S.day; addClose(2, 'rested in the hot spring'); }
  drawQuest();
}
// E targets for the caves and landmarks; only used when nothing closer (a resource node) wins.
function wp3Target(p, bd) {
  const t = (d, label, act) => (d < bd + 0.3 ? { label, act, key: !!act } : null);
  const dN = Math.hypot(N.pos.x - p.x, N.pos.z - p.z);
  if (depthAt(p.x, p.z) > 0) {
    for (const pn of caves.panels) {
      const d = Math.hypot(pn.x - p.x, pn.z - p.z);
      if (d > 2.5) continue;
      if (!pn.hand) return t(d, 'Look at the painting', () => {
        banner('Cave painting', PAINT_LORE[pn.i]);
        if (!S.c['p_' + pn.i]) { S.c['p_' + pn.i] = 1; bump('painting'); drawQuest(); }
      });
      if (pn.printed) return t(d, 'Your handprints, beside the old ones');
      if (S.inv.ochre < 1) return t(d, 'A bare patch of wall: bring red ochre to leave your mark');
      if (dN > 6) return t(d, 'Leave your handprints: wait for Sena');
      return t(d, 'Leave your handprints (with Sena)', () => {
        S.inv.ochre--; caves.drawHands(pn); bump('handprint'); P.h.swing(); N.h.swing();
        say('Sena', 'There. Our hands beside theirs, for whoever comes after us.');
        addClose(5, 'left your handprints'); drawInv(); drawQuest();
      });
    }
    for (const b of caves.beds) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 2.2) return t(d, 'Shelter here until dawn', () => sleep({ kind: 'cave', x: b.x, z: b.z, rot: b.rot + Math.PI, radius: 1.2,
        group: { position: { y: b.y - 0.22 } }, bedPts: [[-0.5, 0.22, 0], [0.5, 0.22, 0]], camPt: [2.4, 2.0, 2.4], lookPt: [0, 0.3, 0] }));
    }
    return null;
  }
  const tr = LMK.tree, dT = Math.hypot(tr.x - p.x, tr.z - p.z) - 2.4;
  if (dT < 2) {
    if (cnt('carved')) return t(dT, 'The Great Tree. Your names are carved in its bark');
    if (dN > 8) return t(dT, 'Carve your names: wait for Sena');
    return t(dT, 'Carve your names', () => {
      bump('carved'); P.h.swing(); A.hit(1500, 0.08, 0.3);
      say('Sena', 'So the tree will remember, long after us.');
      addClose(5, 'carved your names'); drawQuest();
    });
  }
  const sp = LMK.spring, dS = Math.hypot(sp.x - p.x, sp.z - p.z);
  if (dS < 7.5 && !P.soak) {
    if (dN > 12) return t(0, 'Rest in the warm water: wait for Sena');
    return t(0, 'Rest in the warm water (with Sena)', soakTogether);
  }
  return null;
}
function updateWP3(dt) {
  const E = world.env, cave = E.cave;
  if (!wp3Init) {
    wp3Init = true;
    for (const k of CAVES) if (S.c['sconce_' + k.id]) caves.setSconce(k.id, true);
    if (S.c.bats) caves.batsGone('flint');
    if (cnt('handprint')) for (const pn of caves.panels) if (pn.hand && !pn.printed) caves.drawHands(pn);
  }
  // Sena's torch: lit while she is inside a cave
  const nIn = depthAt(N.pos.x, N.pos.z) > 0.2;
  if (nIn !== senaLit) { senaLit = nIn; senaTorch.lit = nIn; senaTorch.root.visible = nIn; }
  if (nIn) { senaTorch.update(dt); senaTorch.flame.getWorldPosition(senaTorch.light.position); }
  const free = !(N.sit > 0) && !(N.rest > 0) && !N.seat;
  if (nIn && free && N.speed < 0.3 && (!N.h.pose || N.h.pose === 'torchIdle')) N.h.pose = 'torchIdle';
  else if (N.h.pose === 'torchIdle' && (!nIn || N.speed >= 0.3)) N.h.pose = null;
  // in a cave: discovery, the first lines, Sena's wall torch, the bats, and a nudge to light the torch
  const k = cave > 0.2 ? caveOf(P.pos.x, P.pos.z) : null;
  if (k) {
    discoverPOI(k.id);
    if (!S.c.caveLine) { S.c.caveLine = 1; say('Sena', 'Stay close. I have a light too.'); }
    if (torchOn && !S.c['sconce_' + k.id] && cave > 0.5) {
      S.c['sconce_' + k.id] = 1; caves.setSconce(k.id, true); toast('Sena sets a torch in the wall');
    }
    if (k.id === 'flint' && torchOn && !S.c.bats && caves.burstBats('flint')) {
      S.c.bats = 1; banner('Bats!', 'A cloud of wings pours out toward the light of day.');
      for (let i = 0; i < 8; i++) setTimeout(() => A.hit(3000 + rand() * 3000, 0.25, 0.25), i * 80);
      say('Sena', 'Only bats. My heart is still racing.');
    }
    darkToast -= dt;
    if (cave > 0.6 && !torchOn && darkToast <= 0) { darkToast = 9; toast('It is too dark: light your torch (T)'); }
  }
  // the hot spring soak ends with the sit (timer or a movement key)
  for (const e of [P, N]) if (e.soak && !(e.sit > 0)) { e.soak = false; e.seat = null; e.h.pose = null; }
  if (P.soak) P.pos.y = P.seat.y;
  wp3T -= dt;
  if (wp3T <= 0) {
    wp3T = 0.5;
    for (const q of POIS) if (!S.found[q.id] && q.x != null && Math.hypot(q.x - P.pos.x, q.z - P.pos.z) < q.r) discoverPOI(q.id);
  }
}
// Keep the third-person camera inside the dome and the entrance tube.
function caveCam(v) {
  const k = caveOf(P.pos.x, P.pos.z);
  if (!k || depthAt(P.pos.x, P.pos.z) <= 0) return;
  for (let i = 0; i < 12; i++) {
    const dx = v.x - k.x, dz = v.z - k.z, s = dx * k.dir[0] + dz * k.dir[1], lat = Math.abs(dx * k.dir[1] - dz * k.dir[0]);
    const inDome = Math.hypot(dx, dz) < k.R - 0.9, inTube = s > k.R - 1.5 && s < k.R + 5.5 && lat < 2.8;
    if (inDome || inTube) break;
    v.x = lerp(v.x, P.pos.x, 0.3); v.z = lerp(v.z, P.pos.z, 0.3);
  }
  const dx = v.x - k.x, dz = v.z - k.z, d = Math.hypot(dx, dz);
  const roof = d < k.R ? k.floor + k.H * Math.min(0.85, Math.sqrt(Math.max(0, 1 - (d / k.R) ** 2)) * 0.95) : k.floor + 2.8;
  v.y = Math.min(v.y, Math.max(roof, P.pos.y + 1.2));
}
function structTarget(s) {
  const t = (label, act) => ({ label, act, key: !!act });
  switch (s.kind) {
    case 'fire':
      if (S.inv.meat > 0) return t('Cook meat', () => { S.inv.meat--; S.inv.cooked++; bump('cook'); toast('+1 Cooked meat'); A.hit(3000, 0.6, 0.25); drawInv(); });
      if (S.inv.fish > 0) return t('Grill fish', () => { S.inv.fish--; S.inv.grilled++; bump('cook'); toast('+1 Grilled fish'); A.hit(3000, 0.6, 0.25); drawInv(); });
      // Sit together (once a day it brings you closer); it gives way to baking once you have sat today.
      if (Math.hypot(N.pos.x - s.x, N.pos.z - s.z) < 15 && !busy && (S.inv.grain < 2 || S.c.satDay !== S.day)) return t('Sit with Sena', () => sitTogether(s));
      if (S.inv.grain >= 2) return t('Bake flatbread (2 grain)', () => { S.inv.grain -= 2; S.inv.bread++; toast('+1 Flatbread'); A.hit(3000, 0.4, 0.2); drawInv(); });
      return t('Campfire — bring raw meat, fish or grain to cook');
    case 'kiln':
      if (S.inv.clay >= 2 && S.inv.wood >= 1) return t('Fire bricks (2 clay + 1 timber)', () => { S.inv.clay -= 2; S.inv.wood--; s.heat = 1; give('brick', 4); A.hit(180, 0.7, 0.5); });
      return t('Kiln — needs 2 clay and 1 timber');
    case 'hut': case 'house': return t('Rest until dawn', () => sleep(s));   // WP2 rest together
    // WP2 placeables
    case 'rack': {
      const ready = s.hang.filter((h) => h[1] >= 90).length;
      if (ready) return t(`Take dried food (${ready})`, () => {
        for (const h of s.hang.filter((h) => h[1] >= 90)) give(h[0] === 'fish' ? 'grilled' : 'cooked', 1);
        s.hang = s.hang.filter((h) => h[1] < 90); bump('dried', ready); A.hit(800, 0.12, 0.3); drawInv();
      });
      if ((S.inv.meat > 0 || S.inv.fish > 0) && s.hang.length < 4) return t('Hang meat to dry', () => {
        while (s.hang.length < 4 && (S.inv.meat > 0 || S.inv.fish > 0)) { const k = S.inv.meat > 0 ? 'meat' : 'fish'; S.inv[k]--; s.hang.push([k, 0]); }
        toast('Hung up to dry (ready in about 90 s)'); A.hit(500, 0.1, 0.3); drawInv();
      });
      return t(s.hang.length ? `Drying… ${Math.round(Math.max(...s.hang.map((h) => h[1])) / 0.9)}%` : 'Drying rack — bring raw meat or fish');
    }
    case 'basket': {
      const FOOD = ['berry', 'meat', 'cooked', 'fish', 'grilled', 'bread'];
      if (FOOD.some((k) => S.stash[k] > 0)) return t('Take the food from the basket', () => { for (const k of FOOD) if (S.stash[k] > 0) { S.inv[k] += S.stash[k]; delete S.stash[k]; } toast('You take the food back'); drawInv(); });
      if (FOOD.some((k) => S.inv[k] > 0)) return t('Store food in the basket', () => { for (const k of FOOD) if (S.inv[k] > 0) { S.stash[k] = (S.stash[k] || 0) + S.inv[k]; S.inv[k] = 0; } toast('Food stored in the basket'); drawInv(); });
      return t('Storage basket (empty)');
    }
    case 'flowers':
      if (S.c.flowerDay !== S.day) return t('Pick flowers for Sena', () => {
        S.c.flowerDay = S.day; bump('flowers'); P.h.swing('pick');
        say('Sena', ['For me? They smell like the meadow after rain.', 'You remembered. I will put them by the bed.', 'Thank you, Aro. Every day you find a new colour.'][cnt('flowers') % 3]);
        addClose(3, 'flowers');
      });
      return t('Flower bed — the flowers will open again tomorrow');
    case 'stable': return t(S.horse ? `Stable — ${hName()} sleeps here at night` : 'Stable — a dry home for your horse');   // WP4
    case 'farm':
      if (s.grow >= 1) return t('Harvest the crop', () => { s.grow = 0; bump('harvest'); give('grain', 10); P.h.swing(); });
      return t(`Crop is growing… ${Math.round(s.grow * 100)}%`);
    case 'well': return t('Draw water and drink', () => { S.water = 100; bump('drank'); A.hit(2600, 0.25, 0.2); toast('Fresh water'); fillSkin(); });
  }
}
// ---------- closeness with Sena ----------
function addClose(n, why) {
  const was = S.close;
  S.close = clamp(S.close + n, 0, 100);
  if (S.close !== was) { toast(`♥ Closeness ${n >= 0 ? '+' : ''}${n}${why ? ` (${why})` : ''}`); A.tone(660, 0.5, 0.05); A.tone(880, 0.6, 0.04, 0.12); }
  $('b-close').style.width = S.close + '%';
  drawQuest();
}
// The campfire's two log benches sit at local x = ±1.6 m (see BUILD.fire); rotation.y = rot maps local +x to (cos, -sin).
const fireSeats = (s) => { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); return [[s.x - 1.6 * c, s.z + 1.6 * sn], [s.x + 1.6 * c, s.z - 1.6 * sn]]; };
function sitTogether(s) {
  let [a, b] = fireSeats(s);
  if (Math.hypot(b[0] - P.pos.x, b[1] - P.pos.z) < Math.hypot(a[0] - P.pos.x, a[1] - P.pos.z)) [a, b] = [b, a];   // Aro takes the nearer bench
  P.pos.set(a[0], 0, a[1]); N.pos.set(b[0], 0, b[1]);
  P.face = Math.atan2(s.x - a[0], s.z - a[1]); N.face = Math.atan2(s.x - b[0], s.z - b[1]);
  P.vx = P.vz = 0; P.auto = false; P.sneak = false; N.node = null; N.act = 0;
  P.sit = N.sit = 8; P.fire = N.fire = [s.x, s.z];
  P.h.pose = 'sit'; N.h.pose = N.h.has('sitTalk') ? 'sitTalk' : 'sit';
  const v = VIGNETTES[CH[S.ch].id];
  if (v) v[cnt('sat_fire') % v.length].forEach((l) => say(...l));
  S.time = (S.time + 1) % 24;
  if (S.c.satDay !== S.day) { S.c.satDay = S.day; addClose(3, 'sat by the fire'); }
  bump('sat_fire'); drawQuest();
}
// Called both early (a key) and when the timer has already run out, so key it on the pose, not on e.sit.
function endSit(e) {
  e.sit = 0;
  if (e.h.pose !== 'sit' && e.h.pose !== 'sitTalk') return;
  e.h.pose = null; e.h.swing('standUp');
  if (e.fire) { const a = Math.atan2(e.pos.x - e.fire[0], e.pos.z - e.fire[1]); e.pos.x += Math.sin(a) * 0.5; e.pos.z += Math.cos(a) * 0.5; e.fire = null; }   // stand clear of the bench log
}
const MEAL_LINES = ['Mm. It tastes better when we share it.', 'Here, you take the bigger half. You worked harder today.', 'Eat slowly, Aro. The day is not going anywhere.', 'Thank you. Sit with me while we eat.'];
function shareMeal(k) {
  S.inv[k]--; S.food = Math.min(100, S.food + 15); S.c.mealDay = S.day;
  if (k !== 'bread') bump('meal');
  bump('meal_shared');
  N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z); N.h.swing(); P.h.swing();
  say('Sena', MEAL_LINES[cnt('meal_shared') % MEAL_LINES.length]);
  addClose(3, 'shared a meal'); A.hit(800, 0.12, 0.3); drawInv();
}
function eat() {
  const I = S.inv;
  if (I.cooked > 0) { I.cooked--; S.food = Math.min(100, S.food + 45); S.hp = Math.min(100, S.hp + 12); bump('meal'); toast('You eat cooked meat'); }
  else if (I.grilled > 0) { I.grilled--; S.food = Math.min(100, S.food + 35); S.hp = Math.min(100, S.hp + 8); bump('meal'); toast('You eat grilled fish'); }
  else if (I.bread > 0) { I.bread--; S.food = Math.min(100, S.food + 30); toast('You eat flatbread'); }
  else if (I.berry > 0) { I.berry--; S.food = Math.min(100, S.food + 9); S.water = Math.min(100, S.water + 3); bump('ate'); toast('You eat berries'); }
  else { toast(I.meat > 0 || I.fish > 0 ? 'Raw meat and fish must be cooked at a fire' : 'Nothing to eat'); return; }
  A.hit(800, 0.12, 0.3); drawInv();
}
function fillSkin() {
  if (!S.tools.waterskin || S.skin >= 3) return;
  S.skin = 3; toast('Waterskin filled'); drawInv();
}
function drinkSkin() {
  if (!S.tools.waterskin) return;
  if (S.skin <= 0) { toast('The waterskin is empty — fill it at the river or well'); return; }
  if (S.water >= 98) { toast('You are not thirsty'); return; }
  S.skin--; S.water = Math.min(100, S.water + 30); bump('drank'); A.hit(2600, 0.25, 0.2); toast(`You drink from the waterskin (${S.skin}/3 left)`); drawInv();
}
function heal() {
  if (S.inv.poultice <= 0) { toast('No poultices — craft one from berries and fibre (Tab)'); return; }
  if (S.hp >= 99) { toast('You are not hurt'); return; }
  S.inv.poultice--; S.hp = Math.min(100, S.hp + 35); hurtFlash = 0; P.h.swing(); A.hit(500, 0.3, 0.25); toast('You press the poultice to your wounds (+35 health)'); drawInv();
}
// ---------- torch ----------
const torch = makeTorch();
let torchOn = false;
torch.root.position.set(0.02, 0.06, 0.02); torch.root.rotation.x = 1.25;   // held upright in the left hand
P.h.bones.hand_l.add(torch.root); scene.add(torch.light);
torch.lit = false; torch.root.visible = false;
function setTorch(on) {
  torchOn = on; torch.lit = on;
  torch.root.visible = !!S.tools.torch;
  drawInv();
}
function toggleTorch() {
  if (!S.tools.torch) { toast('Craft a torch first (Tab)'); return; }
  if (torchOn) { setTorch(false); toast('You put out the torch'); return; }
  if (P.swim) { toast('Not while swimming'); return; }
  if (S.fuel <= 0) {
    if (S.inv.stick < 1) { toast('You need 1 stick to make a fresh torch head'); return; }
    S.inv.stick--; S.fuel = 180;
  }
  setTorch(true); bump('torchlit'); A.hit(2400, 0.4, 0.3); toast('The torch catches'); drawQuest();
}
function updateTorch(dt) {
  torch.root.visible = !!S.tools.torch;
  if (!torchOn) return;
  torch.update(dt);
  torch.flame.getWorldPosition(torch.light.position);
  S.fuel -= dt * (world.env.storm > 0.5 ? 2 : 1);           // rain makes it burn down faster
  if (P.swim) { S.fuel = 0; setTorch(false); toast('The water puts out your torch'); A.hit(3000, 0.5, 0.3); }
  else if (S.fuel <= 0) { S.fuel = 0; setTorch(false); toast('Your torch has burnt out'); }
  else if ((S.fuel | 0) !== (S.fuel + dt | 0) && (S.fuel | 0) % 5 === 0) drawInv();
}
// WP2 rest together: both lie side by side in the hut or house bed, fade, dawn, "Well rested".
let camShot = null;
const REST_T = 5;
const doorPt = (s) => [s.x + Math.sin(s.rot || 0) * (s.radius + 0.6), s.z + Math.cos(s.rot || 0) * (s.radius + 0.6)];
function sleep(s) {
  const together = !!(s && s.bedPts && Math.hypot(N.pos.x - s.x, N.pos.z - s.z) < 40);
  fadeTo(together ? 'Aro and Sena rest side by side as the fire burns low…' : 'You sleep. The fire burns low, and the night passes…', () => {
    S.time = 6.3; S.day++; S.hp = Math.min(100, S.hp + 45); S.warm = 100;
    S.food = Math.max(12, S.food - 16); S.water = Math.max(12, S.water - 16);
    bump('slept');
    horseNight();                                    // WP4: the horse rests in the stable
    if (together) {
      for (const e of [P, N]) { e.sit = 0; e.work = 0; e.dance = 0; e.h.pose = null; e.vx = e.vz = 0; }
      const pts = (s.kind === 'house' && !S.home.bed ? [[-1.3, 0.24, -0.4], [-0.5, 0.24, -0.4]] : s.bedPts).map((p) => toWorld(s, p));
      P.rest = N.rest = REST_T; P.restPos = pts[0]; N.restPos = pts[1]; P.restAt = N.restAt = s;
      P.face = N.face = s.rot || 0;                              // feet toward the door, heads toward the back wall
      P.auto = false; N.node = null; N.working = false;
      camShot = { pos: toWorld(s, s.camPt), look: toWorld(s, s.lookPt), t: REST_T };
      if (s.kind === 'house') {
        bump('slept_home'); addClose(4, 'rested at home');
        if (cnt('slept_home') === 1) say('Sena', 'Our own bed, under our own roof. I could stay like this until the snow melts.');
      } else addClose(2, 'rested together');
      S.rested = 180; toast('Well rested: stamina comes back faster');
      if (typeof maybeBirth === 'function') maybeBirth();     // WP6 hook
    }
    save(); toast(`Day ${S.day}`);
  }, together ? 2200 : 2600);
}
function endRest() {
  const s = P.restAt;
  for (const e of [P, N]) { e.rest = 0; e.restAt = null; e.h.root.rotation.x = 0; }
  camShot = null;
  if (!s) return;
  const [dx, dz] = doorPt(s), c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0);
  P.pos.set(dx - c * 0.6, 0, dz + sn * 0.6); N.pos.set(dx + c * 0.6, 0, dz - sn * 0.6);
  collide(P.pos, 0.35); collide(N.pos, 0.3);
  P.face = N.face = s.rot || 0;
}
function die(why) {
  if (P.ride) dismount();                            // WP4
  fadeTo(`${why} Sena carries you back to camp and tends you until morning.`, () => {
    const f = structs.find((s) => s.kind === 'fire');
    P.pos.set(f ? f.x + 1.6 : 0, 0, f ? f.z + 1.2 : 4);
    N.pos.set(P.pos.x + 1.2, 0, P.pos.z + 0.8); N.node = null;
    for (const e of [P, N]) { e.sit = 0; e.h.pose = null; e.rest = 0; e.work = 0; e.dance = 0; e.seat = null; e.h.root.rotation.x = 0; }   // WP2 also clears rest/work/dance/seat
    P.workSite = null; N.working = false; N.workSite = null; camShot = null;
    for (const o of animals.filter((o) => o.kind === 'wolf')) remove(o);
    Object.assign(S, { hp: 60, food: 55, water: 60, warm: 100, time: 7, day: S.day + 1 });
    save();
  }, 3800);
}

// ---------- epilogue ----------
function spawnVillagers() {
  const home = structs.find((s) => s.kind === 'house') || structs.find((s) => s.kind === 'fire') || { x: 0, z: 0 };
  const looks = [
    { hair: 'buzz', light: true, hairColor: 0x8a6a45 }, { female: true, hair: 'buns', hairColor: 0x7a4a32 },
    { hair: 'parted', beard: false, tint: 0xd9c0b0, hairColor: 0x2e2622 }, { female: true, light: true, hairColor: 0xa88a55 },
    { hair: 'buzz', beard: false, scale: 0.62, hairColor: 0x4a382c }, { female: true, hair: 'buns', scale: 0.58, light: true, hairColor: 0x5a4030 },
  ];
  for (let i = 0; i < 3; i++) spawn('cow', home.x + 9 + i * 3, home.z + 7 - i * 2, { tame: true, home });
  for (let i = 0; i < 2; i++) { try { spawn('donkey', home.x + 8 + i * 3, home.z + 12 - i * 2, { tame: true, home, hp: 40 }); } catch { break; } }   // WP6 (the donkey model comes with WP4)
  looks.forEach((look, i) => {
    const v = { pos: new THREE.Vector3(home.x + Math.cos(i) * 8, 0, home.z + Math.sin(i) * 8), face: i, h: makeHuman(look), speed: 0, wait: i, tx: home.x, tz: home.z, home };
    scene.add(v.h.root); villagers.push(v);
  });
}
const spawnVillagersIfMissing = () => { if (!villagers.length) spawnVillagers(); };
function epilogue() {
  if (S.village) { spawnVillagersIfMissing(); return; }    // never place the village or skip 400 days twice
  fadeTo('Many winters pass…', () => {
    if (S.village) { spawnVillagersIfMissing(); return; }
    const home = structs.find((s) => s.kind === 'house') || structs.find((s) => s.kind === 'fire') || { x: 0, z: 0 };
    let made = 0;
    for (let i = 0; i < 40 && made < 4; i++) {
      const a = i * 1.37 + 0.6, r = 14 + i * 1.3, x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r, h = getHeight(x, z);
      if (h < 1.2 || slopeY(x, z) < 0.95 || Math.abs(getHeight(x + 3, z) - h) > 0.6 || Math.abs(getHeight(x, z + 3) - h) > 0.6) continue;
      if (structs.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + 6)) continue;
      placeStruct('house', x, z, Math.atan2(home.x - x, home.z - z), true); made++;
    }
    S.village = true; S.time = 8; S.day += 400;
    Object.assign(S, { food: 90, water: 90, warm: 100, hp: 100 });   // final test: the years-long skip left hunger/thirst near empty
    spawnVillagers(); epilogueExtras(home); save();   // WP6: Lio grown, on the horse; final camera shot
  }, 3500);
}

// ---------- WP6 family: Lio the child, the birth in sleep(), epilogue extras, free-play goals ----------
const kids = [];                                     // live child humans, one per S.kids entry
const liveTameHorse = () => animals.find((o) => o.horse && o.tame && o.state === 'live') || null;   // WP4's horse (null until it lands)
const kidScale = (k) => (S.village ? 0.62 : 0.5 + 0.1 * clamp((S.day - k.born) / 30, 0, 1));
function spawnKid(k) {
  if (kids.some((c) => c.k === k)) return null;
  const c = { k, h: makeHuman({ female: true, hair: 'buns', light: true, beard: false, hairColor: 0x4a382c, scale: kidScale(k) }),
    pos: new THREE.Vector3(N.pos.x - 1.2, 0, N.pos.z - 1.2), face: N.face || 0, speed: 0, wait: 3, play: 0, rest: 0, seat: null };
  scene.add(c.h.root); kids.push(c);
  return c;
}
// Where the child sleeps (local to the hut/house, feet point; heads toward -Z like the parents)
const kidBed = (s, i) => s.kind === 'house'
  ? (S.home.cradle && i === 0 ? [1.8, 0.58, 1.58] : S.home.bed ? [-0.9, 0.66, -0.5] : [-0.9, 0.26, -0.55])
  : [0, 0.16, 0.55];
function kidsToBed(s) {
  kids.forEach((c, i) => {
    c.rest = 1; c.restPos = toWorld(s, kidBed(s, i)); c.face = s.rot || 0;
    c.seat = null; c.play = 0; c.h.pose = null; c.h.straddle = false;
  });
}
// Called from sleep() mid when Aro and Sena rest together (WP2 hook).
function maybeBirth() {
  const s = P.restAt;
  if (s) kidsToBed(s);
  if (CH[S.ch].id !== 'newlife' || cnt('born') || s?.kind !== 'house') return;
  if (!CH[S.ch].goals.slice(0, 4).every(([, f]) => f())) return;
  $('fade-text').textContent = 'Spring came, and with it a daughter. They named her Lio.';
  fadeExtra = 4000; P.rest += 4; N.rest += 4; if (camShot) camShot.t += 4;   // hold the card 4 s longer
  S.time = 9; S.day += 20; S.food = Math.max(S.food, 70); S.water = Math.max(S.water, 70);   // final test: fed through the 20-day skip
  const k = { name: 'Lio', female: true, born: S.day };
  S.kids.push(k); bump('born');
  const c = spawnKid(k);
  if (c) { c.rest = 1; c.restPos = toWorld(s, kidBed(s, 0)); c.face = s.rot || 0; }
  addClose(10, 'Lio is born');
  setTimeout(() => { say('Sena', 'Look at her hands, Aro. Like the little ones on the cave wall.'); say('Aro', 'Then she will leave her mark too.'); }, 5200);
}
// Seat point on the horse's back for a small rider (WP4 gives animals a bone() helper; else a fixed back height).
const _kv = new THREE.Vector3();
function horseSeat(o, out, scale) {
  const b = o.a?.bone?.('Torso2') || o.bone?.('Torso2');
  if (b) { b.getWorldPosition(out); out.y += 0.31; } else out.set(o.root.position.x, o.root.position.y + 1.62, o.root.position.z);
  out.y -= 0.56 * scale;                             // pelvis height of the sit pose above the root
  return out;
}
let kidTick = 0;
function updateKids(dt) {
  kidTick -= dt;
  if (kidTick <= 0) { kidTick = 0.5; if (CH[S.ch].epilogue) drawQuest(); }   // live side goals in free play
  if (!kids.length) return;
  const horse = S.village ? liveTameHorse() : null, home = structs.find((s) => s.kind === 'house');
  kids.forEach((c, i) => {
    const sc = kidScale(c.k); c.h.root.scale.setScalar(sc);
    if (c.rest > 0) {
      if (P.rest > 0) { settle(c, dt, false); return; }
      c.rest = 0; c.h.root.rotation.x = 0; c.pos.set(N.pos.x - 1, 0, N.pos.z - 1);   // wake with them at the door
    }
    // Epilogue: Lio rides the old horse at a walk around the house (unless Aro has taken the reins).
    if (i === 0 && horse && P.ride !== horse && !busy && S.time > 8 && S.time < 11.5) {   // final test: mornings only, else Lio follows Sena
      c.seat = horseSeat(horse, c.seat || new THREE.Vector3(), sc);
      c.face = horse.root.rotation.y; c.h.pose = 'sit'; c.h.straddle = true; c.play = 0;
      c.pos.set(horse.root.position.x, 0, horse.root.position.z);
      settle(c, dt, false); return;
    }
    if (c.seat) {
      c.seat = null; c.h.straddle = false; c.h.pose = null;
      if (horse) { _kv.set(Math.cos(horse.root.rotation.y), 0, -Math.sin(horse.root.rotation.y)); c.pos.addScaledVector(_kv, 1.2); collide(c.pos, 0.25); }
    }
    // Follow Sena: a little behind and to her left.
    const a = N.face || 0, ox = -1.2 - i * 0.6, oz = -1.2;
    const tx = N.pos.x + ox * Math.cos(a) + oz * Math.sin(a), tz = N.pos.z - ox * Math.sin(a) + oz * Math.cos(a);
    const d = Math.hypot(tx - c.pos.x, tz - c.pos.z);
    if (d > 40) c.pos.set(tx, 0, tz);
    if (c.play > 0) {
      c.play -= dt; c.speed = 0;
      if (c.play <= 0 || d > 6) { c.play = 0; c.h.pose = null; }
    } else if (_kv.copy(c.pos), !walkTo(c, tx, tz, d > 5 ? 4.5 : 2.2, dt, 0.6)) {
      // blocked by a wall or a rock for 1.5 s: hop to Sena
      c.stuck = c.pos.distanceTo(_kv) < dt * 0.8 ? (c.stuck || 0) + dt : 0;
      if (c.stuck > 1.5) { c.pos.set(tx, 0, tz); collide(c.pos, 0.3); c.stuck = 0; }
    } else {
      c.wait -= dt;
      const eve = S.time > 17 && S.time < 21.5;
      if (eve && c.wait <= 0 && home && Math.hypot(c.pos.x - home.x, c.pos.z - home.z) < 25 && !N.sit) {
        c.wait = 6 + rand() * 6; c.play = 3 + rand() * 2;
        c.h.pose = rand() < 0.5 && c.h.has?.('dance') ? 'dance' : 'talk';
      }
    }
    settle(c, dt, false);
  });
}
function epilogueExtras(home) {
  if (P.rest > 0) endRest();
  for (const c of kids) { c.rest = 0; c.h.root.rotation.x = 0; c.pos.set(home.x + 3, 0, home.z + 4); }
  const h = liveTameHorse();
  if (h && P.ride !== h) { const x = home.x + 6, z = home.z + 5; h.root.position.set(x, getHeight(x, z), z); }
  const t = S.found.tree && POIS.find((p) => p.id === 'tree');
  if (t) {
    const gy = getHeight(t.x, t.z);
    camShot = { pos: new THREE.Vector3(t.x + 16, gy + 7, t.z + 16), look: new THREE.Vector3(t.x, gy + 6, t.z), t: 3.5 + 5 };
  } else {
    const r = home.rot || 0, gy = getHeight(home.x, home.z);
    camShot = { pos: new THREE.Vector3(home.x + Math.sin(r) * 15 + Math.cos(r) * 6, gy + 6, home.z + Math.cos(r) * 15 - Math.sin(r) * 6), look: new THREE.Vector3(home.x, gy + 2, home.z), t: 3.5 + 5 };
  }
}
function sideGoals() {
  const lvl = S.horse ? 1 + Math.min(3, ((S.horse.bond || 0) / 100) | 0) : 0, d = POIS.filter((p) => S.found[p.id]).length;
  const row = (t, n, m) => `<div class="${n >= m ? 'done' : ''}">${t} ${Math.min(n, m)}/${m}</div>`;
  return row('Discoveries', d, POIS.length) + row('Bond', lvl, 4) + row('Homeliness', homeliness(), 12) + row('Closeness', Math.round(S.close), 100);
}

// ---------- map, minimap and pins ----------
const MS = 512, mapBase = document.createElement('canvas');
mapBase.width = mapBase.height = MS;
{
  // WP5 map: parchment base (paper mixed with the height colours, biome tints, contours, hill shading), drawn once.
  const g = mapBase.getContext('2d'), im = g.createImageData(MS, MS);
  const HM = new Float32Array(MS * MS);
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) HM[j * MS + i] = getHeight((i / MS - 0.5) * SIZE, (j / MS - 0.5) * SIZE);
  const BR = 128, BIO = [];
  for (let j = 0; j < BR; j++) for (let i = 0; i < BR; i++) BIO.push(biomeAt(((i + 0.5) / BR - 0.5) * SIZE, ((j + 0.5) / BR - 0.5) * SIZE));
  const TINT = { meadow: [201, 210, 122], high: [157, 149, 138], pine: [111, 127, 78] };
  const hash = (i, j) => { const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return s - Math.floor(s); };
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
    const x = (i / MS - 0.5) * SIZE, z = (j / MS - 0.5) * SIZE, h = HM[j * MS + i];
    // paper: #e9dcbc in the middle, #c9b88f towards the edges, with faint blotches
    const vig = clamp(Math.hypot(i / MS - 0.5, j / MS - 0.5) * 1.5 + (Math.sin(i * 0.031 + Math.cos(j * 0.023) * 2) * 0.5 + 0.5) * 0.18 + hash(i, j) * 0.06, 0, 1);
    const paper = [233 - 32 * vig, 220 - 36 * vig, 188 - 45 * vig];
    let c;
    if (h < 0) c = [111, 159, 176];
    else {
      if (h < 1.2) c = [176, 160, 116];
      else if (slopeY(x, z) < 0.8 || h > 34) c = [128, 124, 114];
      else { const t = Math.min(1, h / 30); c = [92 + t * 40, 128 + t * 12, 62 + t * 30]; }
      const b = TINT[BIO[(Math.min(BR - 1, (j * BR / MS) | 0)) * BR + Math.min(BR - 1, (i * BR / MS) | 0)]];
      if (b) c = [lerp(c[0], b[0], 0.6), lerp(c[1], b[1], 0.6), lerp(c[2], b[2], 0.6)];
      c = [lerp(paper[0], c[0], 0.45), lerp(paper[1], c[1], 0.45), lerp(paper[2], c[2], 0.45)];
    }
    if (h < 0) c = [lerp(c[0], paper[0], 0.2), lerp(c[1], paper[1], 0.2), lerp(c[2], paper[2], 0.2)];
    let shade = 1;
    if (h >= 0) {
      const hl = HM[j * MS + Math.max(0, i - 2)] , hu = HM[Math.max(0, j - 2) * MS + i], hr = HM[j * MS + Math.min(MS - 1, i + 2)], hd = HM[Math.min(MS - 1, j + 2) * MS + i];
      shade = clamp(1 + ((hl - hr) + (hu - hd)) * 0.045, 0.7, 1.15);
      const k = Math.floor(h / 6), r = i < MS - 1 ? HM[j * MS + i + 1] : h, d = j < MS - 1 ? HM[(j + 1) * MS + i] : h;
      if (h > 1.2 && (Math.floor(r / 6) !== k || Math.floor(d / 6) !== k)) shade *= 0.78;
    } else if (i < MS - 1 && HM[j * MS + i + 1] >= 0 || j < MS - 1 && HM[(j + 1) * MS + i] >= 0) shade = 0.7;   // ink shoreline
    im.data.set([c[0] * shade, c[1] * shade, c[2] * shade, 255], (j * MS + i) * 4);
  }
  g.putImageData(im, 0, 0);
  g.fillStyle = 'rgba(92,104,50,0.75)';
  for (const f of world.fields) if (f.kind === 'tree') for (const n of f.nodes) { g.beginPath(); g.arc((n.x / SIZE + 0.5) * MS, (n.z / SIZE + 0.5) * MS, 1.5, 0, 6.3); g.fill(); }
}
// WP5 fog of war: a 64x64 bit grid of 10 m cells, saved as base64 in S.seen.
const FOG_N = 64, SEEN = new Uint8Array(FOG_N * FOG_N / 8), fog64 = document.createElement('canvas'), fogBig = document.createElement('canvas');
fog64.width = fog64.height = FOG_N; fogBig.width = fogBig.height = 512;
let fogDirty = true, fogT = 0;
const seenBit = (i, j) => (SEEN[(j * FOG_N + i) >> 3] >> ((j * FOG_N + i) & 7)) & 1;
function reveal(x, z, r) {
  const C = SIZE / FOG_N, i0 = Math.max(0, Math.floor((x - r) / C + FOG_N / 2)), i1 = Math.min(FOG_N - 1, Math.floor((x + r) / C + FOG_N / 2));
  const j0 = Math.max(0, Math.floor((z - r) / C + FOG_N / 2)), j1 = Math.min(FOG_N - 1, Math.floor((z + r) / C + FOG_N / 2));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = (i + 0.5 - FOG_N / 2) * C, cz = (j + 0.5 - FOG_N / 2) * C, b = j * FOG_N + i;
    if (Math.hypot(cx - x, cz - z) <= r && !((SEEN[b >> 3] >> (b & 7)) & 1)) { SEEN[b >> 3] |= 1 << (b & 7); fogDirty = true; }
  }
}
const seenFrac = () => { let n = 0; for (const v of SEEN) for (let k = v; k; k &= k - 1) n++; return n / (FOG_N * FOG_N); };
const seenAt = (x, z) => { const i = Math.floor(x / (SIZE / FOG_N) + FOG_N / 2), j = Math.floor(z / (SIZE / FOG_N) + FOG_N / 2); return i >= 0 && j >= 0 && i < FOG_N && j < FOG_N && seenBit(i, j); };
const encodeSeen = () => { let s = ''; for (const v of SEEN) s += String.fromCharCode(v); return btoa(s); };
function wp5Load(fromSave) {   // called from start(): decode the saved fog, or reveal the home valley for an old save
  SEEN.fill(0); fogDirty = true;
  if (fromSave && S.seen) { try { const s = atob(S.seen); for (let k = 0; k < SEEN.length && k < s.length; k++) SEEN[k] = s.charCodeAt(k); return; } catch (e) { SEEN.fill(0); } }
  if (fromSave) { reveal(0, 0, 130); for (const st of structs) reveal(st.x, st.z, 40); }
  for (const id in S.found || {}) { const p = POIS.find((q) => q.id === id); if (p && p.x != null) reveal(p.x, p.z, p.r + 15); }
}
const hatch = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 12; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(90,70,40,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 12); g.lineTo(12, 0); g.moveTo(-6, 6); g.lineTo(6, -6); g.moveTo(6, 18); g.lineTo(18, 6); g.stroke();
  return c;
})();
function updateFog() {
  if (!fogDirty) return;
  fogDirty = false;
  const g = fog64.getContext('2d'), im = g.createImageData(FOG_N, FOG_N);
  for (let j = 0; j < FOG_N; j++) for (let i = 0; i < FOG_N; i++) if (!seenBit(i, j)) im.data.set([216, 200, 164, 240], (j * FOG_N + i) * 4);
  g.putImageData(im, 0, 0);
  const b = fogBig.getContext('2d');
  b.clearRect(0, 0, 512, 512);
  b.globalCompositeOperation = 'source-over'; b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
  b.drawImage(fog64, 0, 0, 512, 512);
  b.globalCompositeOperation = 'source-atop'; b.fillStyle = b.createPattern(hatch, 'repeat'); b.fillRect(0, 0, 512, 512);
  b.globalCompositeOperation = 'source-over';
}
const ICON = { fire: ['#ff9a3c', 'Fire'], hut: ['#d9b46a', 'Hut'], kiln: ['#c9713f', 'Kiln'], house: ['#e8dcc0', 'Home'], farm: ['#d8c04a', 'Farm'], well: ['#6fb7d9', 'Well'],
  rack: ['#a0784a', 'Rack'], stable: ['#8a5a2e', 'Stable'], fence: ['#7a5a3a', 'Fence'], path: ['#9a958c', 'Path'], flowers: ['#d77ab0', 'Flowers'], basket: ['#b89a5e', 'Basket'] };   // WP2 kinds
// WP5 map: POI and horse icons
Object.assign(ICON, { cave: ['#4a4550', 'Cave'], ford: ['#6fb0c8', 'Ford'], lake: ['#4f8fb0', 'Lake'], peak: ['#7a6a5a', 'Peak'], tree: ['#c07a30', 'Great Tree'], stones: ['#8a8a8a', 'Stones'],
  ruins: ['#a05a3a', 'Ruins'], spring: ['#8fd0d0', 'Hot Spring'], meadow: ['#b0c060', 'Meadow'], horse: ['#c08850', 'Horse'] });
const GLYPH = new Set(['cave', 'ford', 'lake', 'peak', 'tree', 'stones', 'ruins', 'spring', 'meadow', 'horse', 'quest', 'rumour']);
function glyph(g, x, y, kind, s) {   // small hand-drawn ink glyphs
  const col = ICON[kind]?.[0] || '#d4a838';
  g.lineWidth = 1.6 * Math.max(0.8, s); g.strokeStyle = '#3a2c1c'; g.fillStyle = col; g.lineJoin = 'round';
  const P2 = (a, b) => [x + a * s, y + b * s];
  g.beginPath();
  if (kind === 'peak') { g.moveTo(...P2(-7, 5)); g.lineTo(...P2(0, -7)); g.lineTo(...P2(7, 5)); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(...P2(-2.5, -3)); g.lineTo(...P2(0, -7)); g.lineTo(...P2(2.5, -3)); g.fillStyle = '#f4eee0'; g.fill(); }
  else if (kind === 'cave') { g.moveTo(...P2(-7, 5)); g.lineTo(...P2(-7, -1)); g.arc(x, y - 1 * s, 7 * s, Math.PI, 0); g.lineTo(...P2(7, 5)); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(...P2(-3, 5)); g.lineTo(...P2(-3, 0)); g.arc(x, y, 3 * s, Math.PI, 0); g.lineTo(...P2(3, 5)); g.fillStyle = '#16121a'; g.fill(); }
  else if (kind === 'stones') { for (const [a, b] of [[-5, 2], [0, -4], [5, 2]]) { g.beginPath(); g.arc(...P2(a, b), 2.6 * s, 0, 6.3); g.fill(); g.stroke(); } }
  else if (kind === 'tree') { g.moveTo(...P2(0, 7)); g.lineTo(...P2(0, 1)); g.stroke(); g.beginPath(); g.arc(...P2(0, -2), 5.5 * s, 0, 6.3); g.fill(); g.stroke(); }
  else if (kind === 'ford' || kind === 'lake') {
    if (kind === 'lake') { g.ellipse(x, y, 8 * s, 5.5 * s, 0, 0, 6.3); g.fill(); g.stroke(); g.beginPath(); }
    g.strokeStyle = kind === 'lake' ? '#e8f2f4' : '#2f5f78';
    for (const b of [-3, 0.5, 4]) { g.moveTo(...P2(-6, b)); g.bezierCurveTo(...P2(-3, b - 3), ...P2(-1, b + 3), ...P2(1.5, b)); g.bezierCurveTo(...P2(3.5, b - 3), ...P2(5, b + 2), ...P2(6.5, b)); }
    g.stroke();
  }
  else if (kind === 'ruins') { g.rect(...P2(-7, -1), 3.5 * s, 6 * s); g.rect(...P2(-2, -5), 3.5 * s, 10 * s); g.rect(...P2(3.5, 1), 3.5 * s, 4 * s); g.fill(); g.stroke(); }
  else if (kind === 'spring') { g.ellipse(x, y + 2 * s, 6.5 * s, 3.5 * s, 0, 0, 6.3); g.fill(); g.stroke(); g.beginPath(); for (const a of [-3, 0, 3]) { g.moveTo(...P2(a, -1)); g.quadraticCurveTo(...P2(a - 2, -4), ...P2(a, -7)); } g.stroke(); }
  else if (kind === 'meadow') { for (const a of [-5, -1.5, 2, 5.5]) { g.moveTo(...P2(a - 1.5, 5)); g.lineTo(...P2(a, -3)); g.lineTo(...P2(a + 1.5, 5)); } g.strokeStyle = '#4a5a20'; g.stroke(); }
  else if (kind === 'horse') {   // horseshoe
    g.arc(x, y - 1 * s, 5 * s, Math.PI * 0.95, Math.PI * 2.05); g.lineWidth = 4 * s; g.strokeStyle = '#3a2c1c'; g.stroke();
    g.beginPath(); g.arc(x, y - 1 * s, 5 * s, Math.PI * 0.95, Math.PI * 2.05); g.lineWidth = 2.4 * s; g.strokeStyle = col; g.stroke();
  }
  else if (kind === 'quest') {
    const k = 1 + Math.sin(clock * 5) * 0.18;
    g.moveTo(x, y - 8 * s * k); g.lineTo(x + 6 * s * k, y); g.lineTo(x, y + 8 * s * k); g.lineTo(x - 6 * s * k, y); g.closePath();
    g.fillStyle = '#e8b830'; g.fill(); g.stroke();
  }
  else if (kind === 'rumour') { g.font = `bold ${Math.round(16 * s)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#f0e4c4'; g.strokeText('?', x, y); g.fillStyle = '#6a3a1a'; g.fillText('?', x, y); }
}
// The tame horse: the live object from WP4 if there is one, else the saved position.
const mapHorse = () => { const o = animals.find((a) => a.horse && a.tame && a.state !== 'dead'); return o ? { x: o.root.position.x, z: o.root.position.z } : (S.horse && S.horse.x != null ? { x: S.horse.x, z: S.horse.z } : null); };
const questAt = () => { try { const w = CH[S.ch]?.where?.(); return w && isFinite(w[0]) && isFinite(w[1]) ? w : null; } catch (e) { return null; } };
function marker(g, x, y, kind, s = 1) {
  if (GLYPH.has(kind)) { glyph(g, x, y, kind, s); return; }   // WP5
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,0.75)';
  if (kind === 'player') {           // caller rotates the context
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -8 * s); g.lineTo(6 * s, 7 * s); g.lineTo(0, 4 * s); g.lineTo(-6 * s, 7 * s); g.closePath(); g.fill(); g.stroke();
  } else if (kind === 'pin') {
    g.fillStyle = '#b05cff'; g.beginPath(); g.arc(x, y - 9 * s, 6 * s, Math.PI, 0); g.lineTo(x, y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - 9 * s, 2.2 * s, 0, 6.3); g.fill();
  } else if (ICON[kind]) {
    g.fillStyle = ICON[kind][0]; g.beginPath(); g.rect(x - 4.5 * s, y - 4.5 * s, 9 * s, 9 * s); g.fill(); g.stroke();
  } else {
    g.fillStyle = { sena: '#ff8fb8', wolf: '#ff4a3c', deer: '#c98f55', villager: '#9fd0ff' }[kind] || '#ccc';
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
  g.fillStyle = '#c9b88f'; g.fillRect(0, 0, MR * 2, MR * 2);   // WP5 parchment beyond the map edge
  g.translate(MR, MR);
  g.save(); g.rotate(camYaw); g.scale(k, k);
  g.drawImage(mapBase, -SIZE / 2 - P.pos.x, -SIZE / 2 - P.pos.z, SIZE, SIZE);
  updateFog(); g.imageSmoothingEnabled = true; g.drawImage(fogBig, -SIZE / 2 - P.pos.x, -SIZE / 2 - P.pos.z, SIZE, SIZE);   // WP5 fog
  g.restore();
  const put = (x, z, kind, edge, sc = 1) => {
    let [px, py] = at(x, z); const d = Math.hypot(px, py);
    if (d > MR - 9) { if (!edge) return; px *= (MR - 9) / d; py *= (MR - 9) / d; }
    marker(g, px, py, kind, sc);
  };
  // WP5: discovered POIs, rumours, the horse and the quest diamond (edge-clamped)
  for (const q of POIS) if (q.x != null) { if (S.found[q.id]) put(q.x, q.z, q.icon, false, 0.8); else if (S.rumour?.includes(q.id)) put(q.x, q.z, 'rumour', false, 0.8); }
  { const h = mapHorse(); if (h && !P.ride) put(h.x, h.z, 'horse', true, 0.8); }
  { const w = questAt(); if (w) put(w[0], w[1], 'quest', true, 0.8); }
  for (const st of structs) put(st.x, st.z, st.kind, st.kind === 'house' || st.kind === 'fire');
  for (const o of animals) if (o.state === 'live' && o.kind !== 'cow' && !o.horse) put(o.root.position.x, o.root.position.z, o.kind === 'wolf' ? 'wolf' : 'deer');   // WP4: horses are not deer (WP5 draws the tame one)
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
  updateFog(); g.imageSmoothingEnabled = true; g.drawImage(fogBig, 0, 0, BS, BS);   // WP5 fog of war
  const label = (x, y, t, big2) => {   // WP5: serif italic ink labels on the parchment
    g.font = `italic ${big2 ? 600 : 500} ${big2 ? 23 : 18}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = 3.5; g.strokeStyle = 'rgba(240,228,198,0.85)'; g.strokeText(t, x, y + 10); g.fillStyle = '#3a2a18'; g.fillText(t, x, y + 10);
  };
  for (const q of POIS) if (q.x != null) {
    const [x, y] = toMap(q.x, q.z);
    if (S.found[q.id]) { marker(g, x, y, q.icon, 2); label(x, y, q.name, true); }
    else if (S.rumour?.includes(q.id)) marker(g, x, y, 'rumour', 1.4);
  }
  const seen = {}, home = structs.find((s) => s.kind === 'house') || structs.find((s) => s.kind === 'hut');
  for (const st of structs) {
    const [x, y] = toMap(st.x, st.z); marker(g, x, y, st.kind, 1.3);
    if (st === home) label(x, y, 'Home', true);
    else if (!seen[st.kind] && st.kind !== 'house' && st.kind !== 'hut' && st.kind !== 'fence' && st.kind !== 'path') { seen[st.kind] = 1; label(x, y, ICON[st.kind]?.[1] || st.kind); }
  }
  { const h = mapHorse(); if (h) { const [x, y] = toMap(h.x, h.z); marker(g, x, y, 'horse', 1.4); if (!P.ride) label(x, y, horseName()); } }
  { const w = questAt(); if (w) { const [x, y] = toMap(w[0], w[1]); marker(g, x, y, 'quest', 1.5); } }
  for (const h of herds) if (seenAt(h.x, h.z)) { const [x, y] = toMap(h.x, h.z); marker(g, x, y, 'deer', 1.6); label(x, y, 'Herd'); }   // WP5: only in seen land
  for (const o of animals) if (o.kind === 'wolf' && o.state === 'live' && seenAt(o.root.position.x, o.root.position.z)) { const [x, y] = toMap(o.root.position.x, o.root.position.z); marker(g, x, y, 'wolf', 1.4); }
  for (const v of villagers) { const [x, y] = toMap(v.pos.x, v.pos.z); marker(g, x, y, 'villager', 1.2); }
  { const [x, y] = toMap(N.pos.x, N.pos.z); marker(g, x, y, 'sena', 1.4); label(x, y, 'Sena'); }
  if (S.pin) { const [x, y] = toMap(S.pin.x, S.pin.z); marker(g, x, y, 'pin', 1.7); }
  const [px, py] = toMap(P.pos.x, P.pos.z);
  g.save(); g.translate(px, py); g.rotate(Math.PI - P.face); marker(g, 0, 0, 'player', 1.6); g.restore();
  // WP5 journal
  const names = POIS.filter((q) => S.found[q.id]).map((q) => q.name);
  const jr = `Discoveries ${names.length}/${POIS.length}${names.length ? ': ' + names.join(', ') : ''} · Homeliness ${homeliness()} · Closeness ${Math.round(S.close)}`;
  const pin = S.pin ? `Pin set · ${Math.round(Math.hypot(S.pin.x - P.pos.x, S.pin.z - P.pos.z))} m away. Click it to remove, or press G in the game to auto-walk there.` : 'Click anywhere on the map to drop a pin.';
  const el = $('mapinfo'); if (el.dataset.t !== jr + pin) { el.dataset.t = jr + pin; el.innerHTML = ''; const a = document.createElement('div'); a.className = 'journal'; a.textContent = jr; el.append(a, pin); }
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
  // WP5 fog tick: reveal around the player every 0.5 s (wider while riding)
  if (clock >= fogT) { fogT = clock + 0.5; reveal(P.pos.x, P.pos.z, P.ride ? 70 : 45); }
  drawMini();
  if (mapOpen) drawMap();
  beacon.visible = !!S.pin;
  if (S.pin) { beacon.position.set(S.pin.x, getHeight(S.pin.x, S.pin.z) + 35, S.pin.z); beacon.material.opacity = 0.3 + Math.sin(clock * 3) * 0.1; }
  $('b-stam').style.width = S.stam + '%';
}

// ---------- input ----------
const keys = {};
let tapE = false, lockedAt = 0, unlockTime = 0, mouseX = -1, mouseY = -1;
const locked = () => document.pointerLockElement === canvas;
function lock() {
  if (locked() || !playing || menuOpen || paused || busy) return;
  try {
    // unadjustedMovement switches off the OS mouse acceleration, so aiming is consistent
    const r = canvas.requestPointerLock({ unadjustedMovement: true });
    r?.catch?.(() => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {} });
  } catch { try { canvas.requestPointerLock(); } catch {} }
}
const lockHint = () => { $('lockhint').style.display = playing && !menuOpen && !paused && !busy && !locked() ? 'block' : 'none'; };
document.addEventListener('pointerlockchange', () => {
  if (locked()) { lockedAt = performance.now(); lockBroken = false; }
  else {
    unlockTime = performance.now();
    // Esc released the mouse while playing: that is the pause menu. (Chrome swallows the Esc key itself.)
    if (playing && !menuOpen && !busy && !paused && performance.now() - lockedAt > 300) pause(true);
  }
  lockHint();
});
let lockBroken = false;                 // pointer lock refused (embedded preview, some browsers): clicks act straight away
document.addEventListener('pointerlockerror', () => { lockBroken = true; lockHint(); });
// In fullscreen the browser hands every key to the game, so Ctrl+W, Tab, Alt and Esc cannot hit the browser.
async function fullscreen(on) {
  try {
    if (on && !document.fullscreenElement) { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await navigator.keyboard?.lock?.(); setTimeout(lock, 150); }
    else if (!on && document.fullscreenElement) { navigator.keyboard?.unlock?.(); await document.exitFullscreen(); }
  } catch {}
  $('opt-full').checked = !!document.fullscreenElement;
}
document.addEventListener('fullscreenchange', () => { $('opt-full').checked = !!document.fullscreenElement; });
const GAME_KEYS = /^(Key[WASDEFCVGMQBTRHX]|Digit[1-4]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Tab|Escape|Arrow(Up|Down|Left|Right))$/;
addEventListener('keydown', (e) => {
  if (!playing) return;
  if (GAME_KEYS.test(e.code) && !(e.ctrlKey && /^Key[RL]$/.test(e.code))) e.preventDefault();   // keep browser shortcuts out of the game (reload stays)
  if (e.code === 'Escape') {
    if (e.repeat) return;
    if (paused) pause(false); else if (mapOpen) toggleMap(false); else if (menuOpen) toggleMenu(false); else if (!busy) pause(true);
    return;
  }
  if (paused || (e.repeat && e.code !== 'KeyE')) return;
  keys[e.code] = true;
  if (e.code === 'KeyE') { tapE = true; if (!e.repeat) eTap = true; }   // WP4 eTap: a fresh press (taming, mount, dismount)
  if (e.code === 'KeyM') { toggleMap(); return; }
  if (mapOpen) return;
  if (e.code === 'Tab' || e.code === 'KeyB') { toggleMenu(); return; }
  if (menuOpen || busy) return;
  if (/^(Key[WASD]|Space|ShiftLeft|ControlLeft)$/.test(e.code)) lock();      // moving always re-captures the mouse
  if (e.code === 'KeyF') eat();
  if (e.code === 'KeyT') toggleTorch();
  if (e.code === 'KeyX') callHorse();                // WP4 whistle
  if (e.code === 'KeyR') drinkSkin();
  if (e.code === 'KeyH') heal();
  if (e.code === 'Space') jumpTap = true;
  if (e.code === 'KeyV') { view = view === 'fpp' ? 'tpp' : 'fpp'; camPitch = clamp(camPitch, pitchMin(), 1.25); toast(view === 'fpp' ? 'First person' : 'Third person'); }
  if (e.code === 'KeyG') { if (S.pin) { P.auto = !P.auto; toast(P.auto ? 'Auto-walking to your pin' : 'Auto-walk stopped'); } else toast('Open the map (M) and drop a pin first'); }
  if (e.code === 'KeyC') P.sneak = !P.sneak;
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') P.sneak = true;        // hold Ctrl to sneak, C toggles it
  if (e.code === 'KeyQ' && placing) { placing = null; ghost.visible = false; }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !keys.ControlLeft && !keys.ControlRight) P.sneak = false;
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (!playing || menuOpen || busy || paused) return;
  if (!locked()) { lock(); if (!lockBroken) return; }   // the first click only captures the mouse
  if (e.button === 0) placing ? confirmPlace() : attack();
  if (e.button === 2) { if (placing) { placing = null; ghost.visible = false; } else throwSpear(); }
});
addEventListener('contextmenu', (e) => e.preventDefault());
// Mouse look. Coalesced events are summed so nothing is lost at low frame rates; the first event after the
// pointer is captured is dropped because browsers report a huge jump there.
let lookX = 0, lookY = 0;
addEventListener('mousemove', (e) => {
  mouseX = e.clientX; mouseY = e.clientY;
  if (!playing || menuOpen || paused) return;
  let mx = 0, my = 0;
  const list = e.getCoalescedEvents?.() || [];
  if (list.length) for (const c of list) { mx += c.movementX; my += c.movementY; }
  else { mx = e.movementX; my = e.movementY; }
  if (locked() && performance.now() - lockedAt < 80) return;
  if (Math.abs(mx) > 600 || Math.abs(my) > 600) return;
  lookX += mx; lookY += my;
});
addEventListener('wheel', (e) => { if (playing && !menuOpen && !paused) camDist = clamp(camDist + Math.sign(e.deltaY) * 0.5, 2.6, P.ride ? 12 : 9); }, { passive: true });   // WP4: further out on horseback
function applyLook(dt) {
  const k = 0.0024 * settings.sens, inv = settings.invertY ? -1 : 1;
  // Without the mouse captured the cursor hits the window edge: keep turning while it rests near an edge.
  if (!locked() && mouseX >= 0 && !menuOpen && !paused) {
    const ex = mouseX < 40 ? -1 : mouseX > innerWidth - 40 ? 1 : 0, ey = mouseY < 40 ? -1 : mouseY > innerHeight - 40 ? 1 : 0;
    lookX += ex * dt * 700; lookY += ey * dt * 500;
  }
  camYaw -= lookX * k;
  camPitch = clamp(camPitch + lookY * k * 0.9 * inv, pitchMin(), 1.25);
  lookX = lookY = 0;
}

// ---------- pause menu and settings ----------
function pause(on) {
  if (!playing || (on && (busy || menuOpen))) return;
  paused = on;
  $('pause').classList.toggle('on', on);
  if (on) { document.exitPointerLock?.(); save(); for (const k in keys) keys[k] = false; }
  else lock();
  lockHint();
}
function bindSettings() {
  const sens = $('opt-sens'), inv = $('opt-inv'), qual = $('opt-qual'), full = $('opt-full'), vol = $('opt-vol');
  sens.value = settings.sens; $('opt-sens-v').textContent = settings.sens.toFixed(2) + '×';
  inv.checked = settings.invertY; qual.value = settings.quality; full.checked = settings.fullscreen; vol.value = settings.volume;
  sens.oninput = () => { settings.sens = +sens.value; $('opt-sens-v').textContent = settings.sens.toFixed(2) + '×'; saveSettings(); };
  inv.onchange = () => { settings.invertY = inv.checked; saveSettings(); };
  vol.oninput = () => { settings.volume = +vol.value; if (A.out) A.out.gain.value = settings.volume; saveSettings(); };
  qual.onchange = () => { settings.quality = qual.value; saveSettings(); applyQuality(); };
  full.onchange = () => { settings.fullscreen = full.checked; saveSettings(); fullscreen(full.checked); };
  $('btn-resume').onclick = () => pause(false);
  $('btn-save').onclick = () => { save({ now: true }); toast('Game saved'); };
  $('btn-quit').onclick = () => { save({ now: true }); location.reload(); };
}
function applyQuality() {
  Q = PRESETS[quality()];
  pixelRatio = Math.min(devicePixelRatio, Q.pr); renderer.setPixelRatio(pixelRatio);
  world.setQuality(quality());
  $('opt-qual-v').textContent = settings.quality === 'auto' ? `auto → ${quality()}` : '';
}
bindSettings();

// ---------- per-frame updates ----------
let target = null, useCool = 0, tick = 0, saveT = 0;
function updatePlayer(dt) {
  applyLook(dt);
  const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  camYaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 1.8;
  camPitch = clamp(camPitch + ((keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)) * dt, pitchMin(), 1.25);
  // Sitting: any movement key (or jump) stands you up early; it ends by itself after a while.
  if (P.sit > 0) { P.sit -= dt; if (mx || mz || jumpTap || P.sit <= 0) { endSit(P); endSit(N); } }
  // WP2: resting in bed (input ignored), kneeling at a construction site (movement stops it), dancing after a shared build
  if (P.rest > 0) {
    P.rest -= dt; P.vx = P.vz = 0; P.speed = 0; jumpTap = false;
    if (P.rest <= 0) endRest();
    settle(P, dt, false); target = null; $('prompt').style.display = 'none'; return;
  }
  if (P.work > 0) {
    P.work -= dt;
    if (mx || mz || jumpTap || !P.workSite || P.workSite.rise >= 1) P.work = 0;
    if (P.work > 0) { P.h.pose = 'work'; P.face = Math.atan2(P.workSite.x - P.pos.x, P.workSite.z - P.pos.z); }
  }
  if (!(P.work > 0) && P.h.pose === 'work') { P.h.pose = null; P.workSite = null; }
  if (P.dance > 0) { P.dance -= dt; if (P.dance <= 0 && P.h.pose === 'dance') P.h.pose = null; }
  if (P.ride) { updateRide(dt, mx, mz); return; }   // WP4 riding (and the taming minigame)
  const can = !menuOpen && !busy && !(P.sit > 0) && !(P.work > 0) && !(P.dance > 0);
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
  const run = (keys.ShiftLeft || keys.ShiftRight || P.auto) && !P.sneak && moving && !P.tired;
  S.stam = clamp(S.stam + dt * (run ? (P.swim ? -8 : -10) : (P.speed < 0.5 ? 18 : 10) * (S.rested > 0 ? 1.5 : 1)), 0, 100);   // WP2 well rested
  let sp = !moving ? 0 : P.swim ? (run ? 3 : 2.1) : P.sneak ? 1.7 : run ? 6.6 : 3.3;
  if (!P.swim && !P.air && P.pos.y < 0.15) sp *= 0.6;
  if (moving && structs.some((s) => s.kind === 'path' && s.rise >= 1 && Math.abs(s.x - P.pos.x) < 1.2 && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 1.2)) sp *= 1.1;   // WP2 stone path
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
  target = busy || menuOpen || placing || P.sit > 0 || camShot ? null : findTarget();   // final test: no prompts during the rest/epilogue camera shots
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
  if (N.ride && !P.ride) { N.ride = false; N.seat = null; N.h.pose = null; N.h.straddle = false; }
  if (N.ride) { N.speed = 0; N.node = null; settle(N, dt, false); return; }   // WP4: riding behind Aro (seated by updateHorses)
  if (N.sit > 0) { N.sit -= dt; N.speed = 0; if (N.sit <= 0) endSit(N); settle(N, dt, false); return; }
  // WP2: resting (endRest wakes her with Aro), dancing after a shared build, then working at a construction site
  if (N.rest > 0) { N.speed = 0; settle(N, dt, false); return; }
  if (N.dance > 0) { N.dance -= dt; N.speed = 0; if (N.dance <= 0 && N.h.pose === 'dance') N.h.pose = null; settle(N, dt, false); return; }
  if (senaBuild(dt)) { settle(N, dt, false); return; }
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
    if (reached('fire') && N.wait <= 0 && dP < 22 && !night && !busy) {
      N.wait = 5 + rand() * 6;
      const want = ['stick', 'stone', 'reed', 'berry', ...(reached('seeds') ? ['grain'] : [])];
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
  const effort = P.speed > 4 && !P.ride ? 1.7 : 1;   // WP4: the horse does the work
  S.food = Math.max(0, S.food - dt * 0.085 * effort);
  S.water = Math.max(0, S.water - dt * 0.12 * effort);
  const sheltered = world.env.cave > 0.5 || structs.some((s) => s.rise >= 1 &&((s.kind === 'fire' && Math.hypot(s.x - p.x, s.z - p.z) < 8) || ((s.kind === 'hut' || s.kind === 'house') && Math.hypot(s.x - p.x, s.z - p.z) < s.radius + 2.5)));
  const chill = (1.1 + (p.y < 0 ? 1.5 : 0)) * (S.tools.cloak ? 0.5 : 1) * (torchOn ? 0.75 : 1);
  S.warm = clamp(S.warm + dt * ((E.night > 0.5 || E.storm > 0.5) && !sheltered ? -chill : 5), 0, 100);
  const hurt = (S.food <= 0 ? 0.9 : 0) + (S.water <= 0 ? 1.3 : 0) + (S.warm <= 0 ? 1.4 : 0);
  S.hp = clamp(S.hp + dt * (hurt ? -hurt : S.food > 35 && S.water > 35 ? 0.7 : 0), 0, 100);
  if (S.hp <= 0 && !busy) die(hurtFlash > 0 ? 'The wolves drag you down.' : S.warm <= 0 ? 'The cold takes you.' : S.water <= 0 ? 'Thirst overcomes you.' : 'Hunger overcomes you.');
  if (E.night > 0.6 && !S.warned && !sheltered) { S.warned = true; say('Sena', has('fire') ? 'It grows cold. Come back to the fire.' : 'Night is here and we have no fire. Stay close to me.'); }
  if (E.night < 0.1) S.warned = false;
  for (const k of ['hp', 'food', 'water', 'warm', 'close']) $('b-' + k).style.width = S[k] + '%';
  const hh = S.time | 0, mm = ((S.time % 1) * 60) | 0;
  $('clock').textContent = `Day ${S.day} · ${String(hh).padStart(2, '0')}:${String(mm - (mm % 10)).padStart(2, '0')}`;
}
function updateWorldThings(dt) {
  updateSites(dt); updateHome(dt);                 // WP2 construction sites, hearth light, well rested
  for (const s of structs) {
    if (s.rise < 1 && !s.timed) {
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
  if (A.ctx) {
    const E = world.env;
    A.cricket.gain.value = E.night * 0.012;
    A.river.gain.value = clamp(1 - Math.abs(P.pos.x - riverX(P.pos.z)) / 40, 0, 1) ** 2 * 0.16;
    if (E.day > 0.5 && E.storm < 0.4 && rand() < dt * 0.35) A.chirp(0.012 + rand() * 0.03);
  }
  saveFlash = Math.max(0, saveFlash - dt);
  $('savechip').style.opacity = Math.min(1, saveFlash);
}
const camPos = new THREE.Vector3(0, 8, 14), look = new THREE.Vector3();
function updateCamera(dt, title) {
  if (title) {
    const a = clock * 0.04;
    camPos.set(Math.sin(a) * 15, getHeight(0, 0) + 4.5, Math.cos(a) * 15);
    camera.position.copy(camPos); camera.lookAt(0, getHeight(0, 0) + 1.2, 2);
    return;
  }
  // WP2 rest shot: a fixed view from the doorway onto the bed, in third person
  if (camShot) {
    camShot.t -= dt; P.h.root.visible = true;
    camPos.lerp(camShot.pos, 1 - Math.exp(-dt * 6)); if (camShot.snap !== false) { camPos.copy(camShot.pos); camShot.snap = false; }
    camera.position.copy(camPos); camera.lookAt(camShot.look);
    if (camShot.t <= 0) camShot = null;
    return;
  }
  P.h.root.visible = view !== 'fpp';
  const fovT = P.speed > 5 ? 66 : 58;
  if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  const cp = Math.cos(camPitch);
  if (view === 'fpp') {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const eye = P.ride && P.saddle ? P.saddle.y + 0.75 - P.pos.y : (P.swim ? 0.3 : 1.68 - P.h.crouch * 0.55)   // WP4 eye on horseback
      + Math.sin(P.step * 2.7) * 0.03 * Math.min(1, P.speed / 3);
    camPos.set(P.pos.x + fx * 0.16, P.pos.y + eye, P.pos.z + fz * 0.16);
    camera.position.copy(camPos);
    camera.lookAt(camPos.x + fx * cp, camPos.y - Math.sin(camPitch), camPos.z + fz * cp);
    return;
  }
  // Third person: over the right shoulder, pulled in when sneaking, kept above the ground.
  const dist = Math.min(camDist * (P.sneak ? 0.8 : 1) * (P.ride ? 1.45 : 1), world.env.cave > 0.15 ? 3 : 99);   // WP4: further back when riding   // WP3: closer in caves
  look.set(P.pos.x + Math.cos(camYaw) * 0.45, P.pos.y + (P.ride ? 2.6 : 1.7 - P.h.crouch * 0.3), P.pos.z - Math.sin(camYaw) * 0.45);   // WP4 ride height
  _v.set(look.x + Math.sin(camYaw) * cp * dist, look.y + Math.sin(camPitch) * dist, look.z + Math.cos(camYaw) * cp * dist);
  _v.y = Math.max(_v.y, getHeight(_v.x, _v.z) + 0.35, 0.7);
  camPos.lerp(_v, 1 - Math.exp(-dt * 16));
  caveCam(camPos);                                   // WP3: never outside the dome while inside a cave
  if (P.taming) { camPos.x += (rand() - 0.5) * 0.07; camPos.y += (rand() - 0.5) * 0.07; }   // WP4: a bucking horse shakes the view
  camera.position.copy(camPos);
  camera.lookAt(look.x, look.y + 0.3, look.z);
}

// ---------- start ----------
function start(loadSave) {
  A.init();
  if (loadSave && found) {
    const data = found.data;
    S = Object.assign(fresh(), data);
    S.inv = { ...fresh().inv, ...S.inv };              // older saves lack the newer items
    S.tools = S.tools || {}; S.c = S.c || {};
    S.home = { ...fresh().home, ...S.home }; S.found = S.found || {}; S.stash = S.stash || {}; S.kids = S.kids || [];
    // Story v1 had 8 chapters by index. An old index means "the chapters before it are finished": go to the first
    // NEW chapter after the last finished one, so players on clay/house/seeds still meet the cave/herd/hearth content.
    const OLD = ['awaken', 'fire', 'hunt', 'shelter', 'clay', 'house', 'seeds', 'village'];
    if ((data.storyV || 1) < 2) {
      const o = Math.max(0, Math.min(7, data.ch | 0));
      S.ch = o === 7 ? chIdx('village') : o === 0 ? 0 : chIdx(OLD[o - 1]) + 1;   // 1-3 stay, 4 clay->cave, 5 house->house, 6 seeds->hearth, 7->village
      S.storyV = 2;
      if (S.ch >= 3) S.close = Math.max(S.close, 30);
    }
    S.ch = Math.max(0, Math.min(CH.length - 1, S.ch | 0));
    if ((data.worldV || 1) < 2) { S.felled = []; S.worldV = 2; }   // new terrain features shift the node scatter; trees regrow (cosmetic)
    for (const s of S.structs) { const st = placeStruct(s.k, s.x, s.z, s.r, true, s.g, s.p); if (s.h && st.hang) st.hang.push(...s.h); }   // WP2 site progress, rack
    applyHome();                                       // WP2 home upgrades on the house mesh
    for (const [fi, ni] of S.felled || []) { const n = world.fields[fi]?.nodes[ni]; if (n && n.alive) { world.fields[fi].set(n, false); respawns.push({ n, at: clock + 300 }); } }
    P.pos.set(S.px, 0, S.pz); N.pos.set(S.nx ?? S.px + 1.5, 0, S.nz ?? S.pz + 1);
    if (S.yaw != null) camYaw = S.yaw; if (S.pitch != null) camPitch = S.pitch; if (S.view) view = S.view;
    if (S.evNext) EV.next = S.evNext; if (S.storm) EV.storm = S.storm;
    if (S.village) spawnVillagers();
    wp4Load();                                       // WP4: the tame horse (remounted if saved riding), the wild herd
    for (const k of S.kids) spawnKid(k);               // WP6 children
    wp5Load(true);                                     // WP5 fog of war
    CH[S.ch].onEnter?.();
    if (CH[S.ch].epilogue && !S.village) epilogue();   // saved mid-fade: finish the epilogue (guarded, runs once)
    drawQuest(); toast(`Welcome back · day ${S.day} (loaded from ${found.from})`);
  } else { deleteGame(); showChapter(); }
  playing = true;
  $('title').classList.add('off'); $('hud').classList.add('on');
  drawInv(); applyQuality();
  if (settings.fullscreen) fullscreen(true);
  lock();
  setTimeout(() => toast('Esc opens the menu · settings, save and quit'), 1500);
}
$('btn-new').textContent = 'Begin the story';
$('btn-new').onclick = () => { if (!found || confirm('Start over? The saved story will be deleted.')) start(false); };
if (found) {
  const d = found.data, when = d.savedAt ? new Date(d.savedAt).toLocaleString() : '';
  $('btn-continue').style.display = ''; $('btn-continue').onclick = () => start(true); $('btn-new').textContent = 'New story';
  $('btn-continue').textContent = `Continue · day ${d.day || 1}`;
  $('savenote').textContent = `Saved ${when} · ${found.from === 'database' ? 'from the save database' : 'from this browser'}`;
}

let last = performance.now(), frames = 0, ftAcc = 0, ftN = 0, fpsShown = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = paused ? 0 : Math.min(0.05, raw);
  last = now; clock += dt;
  // Adaptive resolution: nudge the internal render size inside the preset's range to hold a smooth frame rate.
  if (++frames > 60 && !paused && !document.hidden) {
    ftAcc += raw; ftN++;
    if (ftN >= 45) {
      const avg = ftAcc / ftN; ftAcc = ftN = 0; fpsShown = 1 / avg;
      if (avg > 0.03 && pixelRatio > Q.prMin + 0.01) { pixelRatio = Math.max(Q.prMin, pixelRatio - 0.1); renderer.setPixelRatio(pixelRatio); }
      else if (avg < 0.014 && pixelRatio < Math.min(Q.prMax, devicePixelRatio) - 0.01) { pixelRatio = Math.min(Q.prMax, devicePixelRatio, pixelRatio + 0.05); renderer.setPixelRatio(pixelRatio); }
      $('fps').textContent = `${fpsShown.toFixed(0)} fps · ${Math.round(pixelRatio * 100)}%`;
    }
  }
  renderer.shadowMap.needsUpdate = Q === PRESETS.high || frames % 2 === 0;
  if (playing && !paused) {
    updatePlayer(dt); updateTorch(dt); updateSena(dt); updateVillagers(dt); updateKids(dt); updateSpear(dt); updateStats(dt); updateSubs(dt); updateEvents(dt); updateMap(); lockHint();
    tick -= dt;
    if (tick <= 0) {
      tick = 0.5;
      const ch = CH[S.ch];
      if (!busy && ch.goals.length && ch.goals.every(([, f]) => f())) {
        S.ch++; enterChapter();
      }
    }
    saveT += dt; if (saveT > 20 && !busy) { saveT = 0; save(); }
  } else if (!playing) { settle(P, dt, false); settle(N, dt, false); }
  for (const o of [...animals]) updateAnimal(o, dt);
  updateHorses(dt);                                  // WP4: riders' seats, herd, heart, kicks, peak ride
  updateWorldThings(dt);
  world.env.cave = playing ? depthAt(P.pos.x, P.pos.z) : 0;   // WP3 cave darkness
  if (playing && !paused) updateWP3(dt);
  updateCamera(dt, !playing);
  world.setTime(S.time, P.pos, camera);
  world.update(dt, P.pos.x, P.pos.z, camera);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.THREE = THREE; window.NAT = NAT; window.DEBUG = DEBUG;
window.G = { torch, throwSpear, sleep, attack, EVENTS, EV, animals, herds, spawn, hurt, get S() { return S; }, P, N, CH, structs, world, placeStruct, camera, renderer, scene, save, pause, set yaw(v) { camYaw = v; }, set pitch(v) { camPitch = v; }, get fps() { return fpsShown; }, get pr() { return pixelRatio; },
  // WP1 debug and test hooks
  setCh(id) { const i = chIdx(id); if (i < 0) throw new Error('no chapter ' + id); S.ch = i; enterChapter(); return CH[S.ch].id; },
  give: (k, n = 1) => give(k, n),
  tp(x, z) { P.pos.set(x, 0, z); N.pos.set(x + 2, 0, z); P.vx = P.vz = 0; P.auto = false; N.node = null; },
  time(h) { S.time = h; },
  chId: () => CH[S.ch].id,
  goals: () => CH[S.ch].goals.map(([l, f]) => [l, !!f()]),
  cnt, bump, reached, chIdx, addClose, sitTogether, homeliness, findTarget, structTarget, toggleMenu, craft, RECIPES,
  menu: () => menuRecipes().map((r) => r.id),
  // WP2 hooks
  sites: () => structs.filter((s) => s.timed).map((s) => ({ k: s.kind, rise: s.rise })),
  finishSites() { for (const s of structs) if (s.timed && s.rise < 1) completeSite(s); drawQuest(); },
  sleep() { let b = null, bd = 1e9; for (const s of structs) if ((s.kind === 'hut' || s.kind === 'house') && s.rise >= 1) { const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z); if (d < bd) { bd = d; b = s; } } sleep(b); return b?.kind; },
  place: (kind, x, z, rot = 0) => placeStruct(kind, x, z, rot, false),
  skip(sec) { for (const s of structs) if (s.hang) for (const h of s.hang) h[1] += sec; },
  homeUpgrade: (id) => homeUpgrade(RECIPES.find((r) => r.id === id)), applyHome, endRest,
  get camShot() { return camShot; }, get stash() { return S.stash; },
  get target() { return target; }, get keys() { return keys; }, get torchOn() { return torchOn; }, toggleTorch,
};
// WP3 debug and test hooks
Object.assign(window.G, {
  caves, landmarks: LMK, POIS, discoverPOI, wp3Target: () => wp3Target(P.pos, 9),
  depth: () => world.env.cave, biome: (x, z) => biomeAt(x, z), h: (x, z) => getHeight(x, z), riverX,
});
// P0 pose / IK hooks (weapons + rest packages)
Object.assign(window.G, { hostileNear, samplePose, applyPose, clipDuration, BONESETS, ik2 });
// WP5 map hooks
Object.assign(window.G, { reveal, seenFrac, found: () => ({ ...S.found }), seenAt, toggleMap, drawMap, encodeSeen });
// WP6 family hooks
Object.assign(window.G, { kids, spawnKid, maybeBirth, liveTameHorse, sideGoals, kidScale });
// WP4 horse hooks
Object.assign(window.G, {
  horse: () => tameHorse() || null, horses: () => animals.filter((a) => a.horse),
  mount: (o) => mount(o || tameHorse()), dismount: () => dismount(), callHorse, addBond, wp4Target: () => wp4Target(P.pos),
  tapE() { tapE = true; eTap = true; },
  // skip the minigame: the nearest wild horse (or the one being tamed) becomes yours, and you are on her back
  tame(o) {
    o = o || P.ride || animals.filter((a) => a.horse && !a.tame && !a.foal).sort((a, b) => a.root.position.distanceTo(P.pos) - b.root.position.distanceTo(P.pos))[0];
    if (!o) return null; o.trust = 3; if (P.ride !== o) startTame(o); tameSuccess(o); return S.horse.name;
  },
  // hold virtual keys for secs: dx -1/1 = A/D, dz 1/-1 = W/S; shift: gallop
  ride(dx = 0, dz = 1, secs = 2, shift = false) {
    const k = [dx < 0 && 'KeyA', dx > 0 && 'KeyD', dz > 0 && 'KeyW', dz < 0 && 'KeyS', shift && 'ShiftLeft'].filter(Boolean);
    for (const c of k) keys[c] = true;
    return new Promise((r) => setTimeout(() => { for (const c of k) keys[c] = false; r(P.speed); }, secs * 1000));
  },
  rideState() { return { ride: !!P.ride, taming: P.taming && { ...P.taming }, hv: P.hv, speed: P.speed, nRide: !!N.ride, seat: P.saddle && P.saddle.toArray(), face: P.face }; },
});
