import * as THREE from 'three';
import { createWorld, getHeight, slopeY, collide, addCollider, LIMIT, SIZE, riverX } from './world.js';
import { loadNature, NAT, DEBUG } from './nature.js';
import { loadAnimals, makeAnimal } from './animals.js';
import { makeSpear, makeAxe, makeTorch, makeStructure, glowM, BUILD, makeScaffold, makeCarryBasket, windowLight } from './entities.js';
import { makeBlanket, makeBedroll } from './entities.js';   // RST bed props
import { makeBow, makeArrow, makeQuiver, ARROW_LEN, BOW_TIPZ } from './bow.js';   // BOW
import { loadPeople, makeHuman, samplePose, applyPose, clipDuration, BONESETS, ik2, ikLeg, FIT } from './people.js';   // WH ikLeg: riders' legs
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';   // WPN viewmodel fists
import { clamp, lerp, mat } from './util.js';
import { loadGame, saveGame, deleteGame, saveState, settings, saveSettings, holdServer, releaseServer, abandonSession } from './save.js';
import { PRESETS, detectQuality } from './quality.js';
import { CAVES, depthAt, biome as biomeAt, POIS, forest } from './world.js';   // WP3 caves and landmarks
import * as MATD from './mature.js';
import * as CB from './combat.js'; import { createPredators } from './enemies.js'; import { createTribe } from './tribe.js';   // CMB combat v2, predators, raiders                // MAT mature foundation: difficulty tables, bus, memorial, choice panel
import * as ROMD from './romance.js';               // ROM romance v2: tiers, lines, rules, pose overrides
import * as MUSD from './music.js';                 // MUS adaptive procedural score
import * as SURV from './survival.js';              // SURV injuries, illness, spoilage, cooking: pure rules and tables
import * as GR from './gore.js';                    // GORE blood, wounds, dismemberment, screen blood
import * as ARCD from './arc_data.js';              // ARC mature story: chapter order, lines, vignettes, recaps, epilogue variants
import { LM, FORDS, setCampPOI } from './landmarks.js';   // ARC: landmark spots for the story beats, the Ash Camp POI

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
renderer.shadowMap.autoUpdate = false;        // refreshed from the frame loop: every other frame (every third on low)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 5000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();   // WPN viewmodel
});
camera.layers.enable(1);
// SAVE-PERF: every asset load retries (util loadRetry); if one still fails, say so on the title and offer a retry
// instead of leaving a dead "Loading…" button.
let [, , , found] = await Promise.all([loadNature(), loadPeople(), loadAnimals(), loadGame()]).catch((e) => {   // SAVE-PERF: let: a slow server's save can arrive after the title is up (titleSave)
  const b = $('btn-new');
  b.textContent = 'Some files failed to load · Retry'; b.onclick = () => location.reload();
  $('savenote').textContent = 'Check your connection, then retry. Your saved game is safe.';
  console.error('Boot stopped: assets failed to load', e);
  return new Promise(() => {});                      // the boot stops here, cleanly (loadRetry already logged which file)
});
const world = createWorld(scene, renderer, quality());
const SWIM_Y = -0.1;

// ---------- state ----------
const ITEMS = { stick: 'Sticks', stone: 'Stones', fiber: 'Fibre', berry: 'Berries', wood: 'Timber', clay: 'Clay', brick: 'Bricks', meat: 'Raw meat', cooked: 'Cooked meat', hide: 'Hides', grain: 'Grain', bread: 'Flatbread', fish: 'Raw fish', grilled: 'Grilled fish', poultice: 'Herbal poultices', flint: 'Flint', ochre: 'Ochre',
  // MAT: every mature-package item exists from the start so any package can give() it (drawInv shows counts > 0 only)
  bandage: 'Fibre bandages', hidebandage: 'Hide bandages', splint: 'Splints', yarrow: 'Yarrow', willow: 'Willow bark', mint: 'Mint', moss: 'Cave moss',   // SURV
  minttea: 'Mint tea', willowtea: 'Willow-bark tea', ypoultice: 'Yarrow poultices', dried: 'Dried meat', driedfish: 'Dried fish', spoiled: 'Spoiled meat',   // SURV
  pelt: 'Alpha pelt', bearhide: 'Bear hide', horn: 'Aurochs horn', claws: 'Bear claws',   // CMB
  beads: 'Ochre beads', carving: 'Carved figure', cord: 'Ochre cord',   // ROM / ARC
  arrow: 'Arrows' };                                                                        // BOW                     // ROM / ARC
const fresh = () => ({
  ch: 0, inv: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 0])), c: {}, tools: {},
  hp: 100, food: 65, water: 65, warm: 100, stam: 100, pin: null, time: 7.5, day: 1, structs: [], village: false, px: 0, pz: 4, skin: 0, fuel: 0,
  storyV: 3, worldV: 2, chId: 'awaken',                    // MAT: story v3 (chapter ids are saved; ARC owns CH)
  // MAT mature foundation (spec §4.1): every mature-package field, so no package edits fresh()
  gh: 0,                                                   // monotonic game hours (matClock / skipHours)
  diff: { mode: 'survivor', perma: false, softened: false, custom: null, graceUntil: 0 },
  downedDay: -1, weakUntil: 0,                             // MAT: Hardcore revive once a day; Survivor penalty weakness (S.gh)
  nhp: 100,                                                // CMB Sena's health
  aff: [], naff: [],                                       // SURV afflictions [{id, part, sev, t, tr, risk}] for Aro / Sena
  risk: { hypo: 0 }, skinQ: 'safe',                        // SURV
  age: {}, stashAge: {},                                   // SURV food ages {meat:[gh,...]} FIFO
  legend: {},                                              // CMB {alpha, bear:{state,hp}, aurochs:{...}}
  arc: { season: 'summer', tribe: 'unknown', choices: {}, tamu: 'none', wena: 'none', senaWound: 'none',
    horseFate: 'safe', graves: [], approve: 0, mercy: 0, rift: 0, riftCause: null, bonded: false,
    fever: 0, memory: [], coldCamp: false, campPos: null, winterStart: null, doorDay: null, raidDay: null,
    raid: { done: false, wave: 0 }, home: { burned: false }, legacy: false },   // ARC
  rom: { firstKiss: null, held: 0, embraces: 0, kisses: 0, nights: 0, lastShared: 0, heart: {},
    dayCaps: {}, gifts: {}, vow: null },                   // ROM
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
  { id: 'hunt', title: 'The Hunt', goals: [['Craft a hunting spear', () => !!S.tools.spear], ['Hunt a deer — sneak close, then throw', () => cnt('deer') >= 1, 'find the deer beyond the trees'], ['Cook the meat at the fire', () => cnt('cook') >= 1], ['Eat a cooked meal (F)', () => cnt('meal') >= 1]],
    lines: [['Sena', 'Berries will not carry us through the cold. There are deer beyond the trees.'], ['Aro', 'A sharp stone, a straight branch, reed to bind them. I will move low — they hear everything.']] },
  { id: 'shelter', title: 'Shelter', goals: [['Craft a stone axe', () => !!S.tools.axe], ['Fell trees for 12 timber', () => cnt('wood') >= 12, 'fell some timber'], ['Raise the thatch hut with Sena', () => has('hut')], ['Rest together in the hut', () => cnt('slept') >= 1]],
    lines: [['Sena', 'A fire is not a home. The rain will come, and the wind after it.'], ['Aro', 'Then we raise a roof, the two of us. You weave, I will cut.']] },
  { id: 'cave', title: 'Into the Dark', goals: [['Light a torch (T)', () => cnt('torchlit') >= 1], ['Find the hollow in the western hills', () => !!S.found.echo, 'go and find that hollow in the western hills'], ['Look at the old paintings (E)', () => cnt('painting') >= 3], ['Leave your handprints beside theirs', () => cnt('handprint') >= 1], ['Chip 6 flint', () => cnt('flint') >= 6, 'chip some flint in the cave']],
    lines: [['Sena', 'The wind smells of stone and old smoke. There is a hollow in the western hills. I saw it from the ridge.'], ['Aro', 'Then we take fire with us. Whatever is in the dark, we will see it first.']],
    where: () => (S.found.echo ? CAVES[0].c : CAVES[0].mouth) },        // WP3: the Echo Hollow mouth, then its chamber
  { id: 'herd', title: 'The Wild Herd', goals: [['Craft a saddle', () => !!S.tools.saddle, 'make a saddle'], ['Find the wild herd east of the river', () => !!S.found.meadow, 'look for the horses east of the river'], ['Win a horse\'s trust: sneak close and offer food (E) ×3', () => cnt('horse_fed') >= 3, 'bring the horses something sweet'], ['Calm the horse and ride her', () => !!S.horse], ['Ride with Sena to Lookout Peak', () => cnt('peak_ride') >= 1, 'ride up to Lookout Peak']],
    lines: [['Sena', 'Across the river, on the open grass, I saw them running. Horses, like on the cave wall.'], ['Aro', 'They will not come to a stranger. We go slow, and we bring them something sweet.']],
    onEnter() { if (!S.found.meadow && !S.rumour?.includes('meadow')) S.rumour = [...(S.rumour || []), 'meadow']; spawnWildHerd(); },
    where: () => (S.horse ? [-185, 70] : [175, 40]) },
  // ARC: Autumn, "Other Fires". ★ mature chapters (mature: true) are skipped with Mature story off; skipFx keeps the world sane.
  // goals may be a function (branch-dependent goals): always read them through goalsOf(ch).
  { id: 'smoke', title: ARCD.TITLES.smoke, mature: true, goals: [['Find where the strange smoke rises', () => !!S.arc.coldCamp], ['Go back to Echo Hollow', () => cnt('ash_seen') >= 1], ['Meet the strangers at the north ford, by day', () => !!S.arc.choices.ford]],
    lines: ARCD.L.smoke.enter, onEnter: () => arcEnter('smoke'), skipFx: () => arcSkip('smoke'), where: () => arcWhere('smoke') },
  { id: 'outcast', title: ARCD.TITLES.outcast, mature: true, goals: () => arcGoals('outcast'),
    lines: ARCD.L.outcast.enter, onEnter: () => arcEnter('outcast'), skipFx: () => arcSkip('outcast'), where: () => arcWhere('outcast') },
  { id: 'clay', title: 'Clay and Flame', goals: [['Dig 8 clay at the riverbank', () => cnt('clay') >= 8, 'dig clay at the riverbank'], ['Build a kiln', () => has('kiln'), 'build the kiln'], ['Fire 24 bricks in the kiln', () => cnt('brick') >= 24, 'fire more bricks']],
    lines: [['Sena', 'Look how the river mud hardens beside the fire. Like stone.'], ['Aro', 'Clay. If we bake it hot enough, we can shape our own stone.']],
    extra: () => [...(S.horse ? [['Aro', `${horseName()} can carry the clay. We will need a great deal of it.`]] : []), ...(arcTamuGuest() ? [ARCD.L.outcast.dig] : [])],
    onEnter: () => arcEnter('clay') },
  { id: 'house', title: 'A Home of Brick', goals: () => [['Build the brick house with Sena', () => has('house'), 'work on the house'], ...arcGoals('house')],
    lines: [['Aro', 'Walls that no wind can push over. We build them together.'], ['Sena', 'Build it where we can see the river.']],
    onEnter: () => arcEnter('house'), where: () => arcWhere('house') },
  // ARC: Winter, "The Long Cold"
  { id: 'winter', title: ARCD.TITLES.winter, mature: true, goals: () => arcGoals('winter'),
    lines: ARCD.L.winter.enter, onEnter: () => arcEnter('winter'), skipFx: () => arcSkip('winter'), where: () => arcWhere('winter') },
  { id: 'raid', title: ARCD.TITLES.raid, mature: true, goals: () => arcGoals('raid'),
    lines: [['Sena', 'The snow is trampled at the edge of the trees. Many feet, and none of them ours.'], ['Aro', 'Then we get ready. Fire around the house, and the spear by the door.']],
    onEnter: () => arcEnter('raid'), skipFx: () => arcSkip('raid'), where: houseAt },
  { id: 'fever', title: ARCD.TITLES.fever, mature: true, goals: () => arcGoals('fever'),
    lines: ARCD.L.fever.enter, onEnter: () => arcEnter('fever'), skipFx: () => arcSkip('fever'), where: () => arcWhere('fever') },
  { id: 'reckoning', title: ARCD.TITLES.reckoning, mature: true, goals: () => arcGoals('reckoning'),
    lines: [], extra: () => (S.arc.horseFate === 'taken' ? ARCD.L.reckoning.enterHorse : ARCD.L.reckoning.enter),
    onEnter: () => arcEnter('reckoning'), skipFx: () => arcSkip('reckoning'), where: () => arcWhere('reckoning') },
  // Spring, "What Grows"
  { id: 'hearth', title: 'Hearth and Home', goals: () => [...arcGoals('hearth'), ['Build a hearth inside the house', () => !!S.home.hearth, 'build a hearth inside'], ['Make a bed for two', () => !!S.home.bed, 'make a proper bed'], ['Build a stable for your horse', () => has('stable'), 'build a stable for the horse'], ['Rest at home together', () => cnt('slept_home') >= 1]],
    lines: [['Sena', 'Walls are not enough. A home needs a fire inside, and a bed where we can both rest.']],
    extra: () => [...(S.arc.home.burned ? [ARCD.L.hearth.scorch] : []), ['Aro', `And a roof for ${S.horse?.name || 'the horse'}, so she does not stand in the rain.`]],
    onEnter: () => arcEnter('hearth'), where: houseAt },
  { id: 'seeds', title: 'Seeds of Tomorrow', goals: () => { const n = S.arc.tribe === 'allied' && !S.arc.skipped ? 3 : 6; return [[`Gather ${n} wild grain`, () => cnt('grain') >= n], ['Till a farm plot', () => has('farm'), 'till a plot for the seeds'], ['Harvest your first crop', () => cnt('harvest') >= 1], ['Build a well', () => has('well'), 'dig a well'], ['Make the home cosy (Homeliness 6)', () => homeliness() >= 6]]; },
    lines: [['Sena', 'The grass with the heavy heads — its seeds fall and grow again. What if we planted them ourselves?'], ['Aro', 'Then we would never need to wander again.']],
    onEnter: () => arcEnter('seeds') },
  { id: 'bond', title: ARCD.TITLES.bond, goals: () => arcGoals('bond'),
    lines: ARCD.L.bond.enter, onEnter: () => arcEnter('bond'), where: () => arcWhere('bond') },
  { id: 'newlife', title: 'A New Life', goals: () => [S.arc.bonded || !S.arc.legacy ? ['Speak your vows at the Standing Stones', () => !!S.arc.bonded, 'walk up to the Standing Stones together'] : ['Grow close to Sena (Closeness 60)', () => S.close >= 60], ['Build a cradle', () => !!S.home.cradle, 'make the cradle'], ['Add a nursery room to the house', () => !!S.home.nursery, 'build the little room'], ['Rest at home three nights', () => cnt('slept_home') - (S.c.lifeStart ?? 0) >= 3], ['Welcome your child', () => cnt('born') >= 1]],
    lines: [['Sena', 'Come and sit with me by the hearth, Aro. By the time the grain is tall again, there will be three of us.'], ['Aro', 'Three. Then I had better build another room, and a cradle.']],
    extra: () => (S.arc.raid.done ? [['Sena', 'After the winter… I did not think I would want this again. I want it.']] : []),
    onEnter() { S.c.lifeStart ??= cnt('slept_home'); arcEnter('newlife'); },
    where: houseAt },
  { id: 'village', title: 'The Village', goals: [], epilogue: true,
    lines: [['', 'Seasons turned into years. Others followed the smoke of the hearth, and stayed.']],
    extra: () => [...ARCD.epilogueLines(S.arc, S.rom).lines, ['', `Lio learned to ride on old ${S.horse?.name || 'Dawn'} before she could run.`], ['', 'From one fire, a village. From a village, everything that came after.'], ['Sena', 'The valley is ours, Aro. Keep building.']],
    onEnter: () => arcEnter('village') },
];
// STORY: quest markers for the early chapters (questAt): the river bank to drink or cut reeds, the nearest herd, the clay
// and the wild grain, then whatever was built for the next goal. Read lazily, every minimap frame, so it stays cheap.
function nearNode(kind, far = 260) {
  let best = null, bd = far;
  for (const f of world.fields) if (f.kind === kind) for (const n of f.nodes) { if (!n.alive) continue; const d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z); if (d < bd) { bd = d; best = n; } }
  return best ? [best.x, best.z] : null;
}
const structAt = (kind) => { const s = structs.find((t) => t.kind === kind && !t.village); return s ? [s.x, s.z] : null; };
const bankAt = () => nearNode('reed', 120) || [riverX(P.pos.z), P.pos.z];
const QUEST_WHERE = {
  awaken: () => (cnt('drank') < 1 ? bankAt() : null),
  fire: () => (cnt('fiber') < 2 ? bankAt() : structAt('fire')),
  hunt: () => {
    if (cnt('deer') < 1) { let best = null, bd = 1e9; for (const h of herds) { const d = Math.hypot(h.x - P.pos.x, h.z - P.pos.z); if (d < bd) { bd = d; best = h; } } return S.tools.spear ? (best ? [best.x, best.z] : null) : (structAt('fire') || (best ? [best.x, best.z] : null)); }   // STORY: craft the spear at the fire first
    return cnt('cook') < 1 ? structAt('fire') : null;
  },
  shelter: () => (!has('hut') && cnt('wood') < 12 ? nearNode('tree') || structAt('hut') : structAt('hut')),   // STORY: the trees, then the hut site
  clay: () => (cnt('clay') < 8 ? nearNode('clay') : structAt('kiln')),
  seeds: () => (!goalsOf()[0]?.[1]() ? nearNode('grain') : houseAt()),
};
for (const c of CH) if (QUEST_WHERE[c.id] && !c.where) c.where = QUEST_WHERE[c.id];
const chIdx = (id) => CH.findIndex((c) => c.id === id);
const reached = (id) => S.ch >= chIdx(id);
const roman = ARCD.roman;                            // ARC: 19 chapters (general roman numerals)
// STORY: the chapter's number among the chapters actually played (Mature story off skips the mature ones).
const chNo = (i = S.ch) => { let n = 0; for (let k = 0; k <= i && k < CH.length; k++) if (!(CH[k].mature && settings.matureStory === false) || k === i) n++; return n; };
// ARC: a chapter's goals ([label, done()] pairs); `goals` may be a function for branch-dependent goals.
const goalsOf = (ch = CH[S.ch]) => { const g = typeof ch?.goals === 'function' ? ch.goals() : ch?.goals; return Array.isArray(g) ? g : []; };
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
  { id: 'bow', name: 'Hunting bow', desc: 'An ash stave with a twisted-fibre string and a hide grip. Key 5, hold right mouse to draw, left click to loose; let go of right mouse to ease the string down.', cost: { wood: 2, fiber: 3, hide: 1 }, ch: 'herd' },   // BOW
  { id: 'quiver', name: 'Quiver', desc: 'A hide tube slung on the back: carry 24 arrows instead of 8.', cost: { hide: 1, fiber: 2 }, ch: 'herd' },   // BOW
  { id: 'arrows', item: 'arrow', n: 3, name: 'Flint arrows ×3', desc: 'Straight shafts, flint points, fibre bindings. Arrows can be picked up again (E).', cost: { stick: 1, flint: 1, fiber: 1 }, ch: 'herd' },   // BOW
  { id: 'flintspear', name: 'Flint spear', desc: 'A flint point: your thrown spear strikes twice as hard.', cost: { flint: 2, stick: 2, fiber: 1 }, ch: 'cave' },
  { id: 'saddle', name: 'Saddle', desc: 'A hide seat bound with reed. Needed to canter and gallop.', cost: { hide: 3, fiber: 4, wood: 2 }, ch: 'herd' },
  { id: 'stable', name: 'Stable', desc: 'A roof for your horse. She rests there at night and trusts you more.', cost: { wood: 14, fiber: 6, stone: 4 }, ch: 'herd', place: true },
  { id: 'kiln', name: 'Kiln', desc: 'Bakes clay into bricks.', cost: { stone: 10, clay: 6 }, ch: 'clay', place: true },
  { id: 'house', name: 'Brick house', desc: 'A permanent home, raised together.', cost: { brick: 24, wood: 10 }, ch: 'house', place: true },
  { id: 'hearth', name: 'Hearth', desc: 'A fire ring inside the house. Warmth and light at home.', cost: { stone: 8, clay: 4 }, ch: 'hearth', up: true },
  { id: 'bed', name: 'Bed for two', desc: 'A wide straw bed with a hide blanket.', cost: { wood: 6, hide: 3, fiber: 6 }, ch: 'hearth', up: true },
  { id: 'fence', name: 'Fence', desc: 'A 2.4 m fence segment. Segments snap together end to end. A ring of them makes a palisade.', cost: { wood: 1 }, ch: 'house', place: true },   // ARC: the palisade comes with the house
  { id: 'path', name: 'Stone path', desc: 'Flat stones to walk on. You walk a little faster on them.', cost: { stone: 2 }, ch: 'hearth', place: true },
  { id: 'flowers', name: 'Flower bed', desc: 'Once a day, pick flowers for Sena.', cost: { berry: 2, fiber: 2 }, ch: 'hearth', place: true },
  { id: 'basket', name: 'Storage basket', desc: 'Store your food here, and take it back when you need it.', cost: { fiber: 8, stick: 4 }, ch: 'hunt', place: true },   // ARC: needed for the winter stockpile
  { id: 'farm', name: 'Farm plot', desc: 'Plant grain and harvest it again and again.', cost: { wood: 4, grain: 6 }, ch: 'seeds', place: true },
  { id: 'well', name: 'Well', desc: 'Clean water close to home.', cost: { brick: 16, stone: 6 }, ch: 'seeds', place: true },
  { id: 'cradle', name: 'Cradle', desc: 'A little rocking bed, made with care.', cost: { wood: 4, hide: 2, fiber: 4 }, ch: 'newlife', up: true },
  { id: 'nursery', name: 'Nursery room', desc: 'A small room added to the side of the house.', cost: { brick: 12, wood: 6 }, ch: 'newlife', up: true },
  // ARC: story crafts (gifts for Sena, the raid braziers, the handfasting cord)
  { id: 'beads', item: 'beads', name: 'Ochre beads', desc: 'A string of clay beads stained red with ochre. A gift for Sena.', cost: { clay: 2, ochre: 1, fiber: 1 }, ch: 'house' },
  { id: 'carving', item: 'carving', name: 'Carved figure', desc: 'A small horse, cut from timber with a flint edge. A gift for Sena.', cost: { wood: 1, flint: 1 }, ch: 'house' },
  { id: 'brazier', name: 'Brazier', desc: 'A stone fire bowl on a post. It lights itself at dusk and keeps the dark back from the house.', cost: { stick: 3, stone: 2 }, ch: 'raid', place: true },
  { id: 'cord', item: 'cord', name: 'Ochre cord', desc: 'Reed braided with red ochre. Tied around two wrists at the standing stones, it cannot be cut by any knife.', cost: { fiber: 4, ochre: 1 }, ch: 'bond' },
];
// Homeliness: small comforts near the house plus the home upgrades.
function homeliness() {
  const h = structs.find((s) => s.kind === 'house');
  if (!h) return 0;
  const n = {};
  for (const s of structs) if (s.rise >= 1 && Math.hypot(s.x - h.x, s.z - h.z) < 25) n[s.kind] = (n[s.kind] || 0) + 1;
  let v = ['rack', 'flowers', 'basket', 'stable', 'well', 'farm'].reduce((a, k) => a + (n[k] || 0), 0) + ((n.fence || 0) / 3 | 0) + ((n.path || 0) / 3 | 0);
  for (const k in S.home) if (S.home[k]) v++;
  if (S.c.figurine) v++;                             // ROM heart 80: Sena's carved horse by the hearth
  return v - (S.arc?.home?.burned ? 3 : 0);          // ARC: a house scorched in the raid
}

// ---------- audio ----------
const A = {
  ctx: null,
  init() {
    if (A.ctx) return;
    try {
      const c = (A.ctx = new AudioContext());
      A.out = c.createGain(); A.out.gain.value = settings.volume; A.out.connect(c.destination);
      A.sfx = c.createGain(); A.amb = c.createGain(); A.mus = c.createGain(); for (const g of [A.sfx, A.amb, A.mus]) g.connect(A.out);   // MUS volume buses: effects, ambience, music
      A.buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = A.buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = A.buf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      A.wind = c.createGain(); A.wind.gain.value = 0.07;
      src.connect(lp).connect(A.wind).connect(A.amb); src.start();   // MUS amb bus
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.035;
      lfo.connect(lg).connect(A.wind.gain); lfo.start();
      const cr = c.createOscillator(); cr.frequency.value = 4300;
      const am = c.createOscillator(), amg = c.createGain(), crg = c.createGain(); am.type = 'square'; am.frequency.value = 17;
      A.cricket = c.createGain(); A.cricket.gain.value = 0; crg.gain.value = 0;
      am.connect(amg).connect(crg.gain); amg.gain.value = 1;
      cr.connect(crg).connect(A.cricket).connect(A.amb); cr.start(); am.start();   // MUS amb bus
      const rs = c.createBufferSource(), hp = c.createBiquadFilter(); rs.buffer = A.buf; rs.loop = true; hp.type = 'highpass'; hp.frequency.value = 1700;
      A.rain = c.createGain(); A.rain.gain.value = 0;
      rs.connect(hp).connect(A.rain).connect(A.amb); rs.start(0, 0.7);   // MUS amb bus
      // the river: filtered noise that gets louder near the water
      const ws = c.createBufferSource(), wb = c.createBiquadFilter(); ws.buffer = A.buf; ws.loop = true; wb.type = 'bandpass'; wb.frequency.value = 900; wb.Q.value = 0.5;
      A.river = c.createGain(); A.river.gain.value = 0;
      ws.connect(wb).connect(A.river).connect(A.amb); ws.start(0, 1.3);   // MUS amb bus
      musicVolumes();                                // MUS: Music / Effects / Ambience sliders
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
      o.connect(g).connect(A.amb); o.start(t0); o.stop(t0 + 0.1);   // MUS amb bus
    }
  },
  hit(freq, dur, vol) {
    if (!A.ctx) return;
    const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f).connect(g).connect(A.sfx); s.start(c.currentTime, rand()); s.stop(c.currentTime + dur);   // MUS sfx bus
  },
  tone(freq, dur, vol, delay = 0) {
    if (!A.ctx) return;
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(A.sfx); o.start(t); o.stop(t + dur);   // MUS sfx bus
  },
};

// ---------- HUD ----------
let toastMute = false;                               // MAT-SV: set by permadeath (no toasts over the death beat and the memorial)
function toast(text, key = text) {
  if (toastMute) return;
  const box = $('toasts');
  let d = [...box.children].find((c) => c.dataset.k === key);   // MAT-SV: the same message (or key) again: refresh it, never stack it
  if (d) { clearTimeout(d._t); d.textContent = text; d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; box.append(d); }
  else { d = document.createElement('div'); d.dataset.k = key; d.textContent = text; box.append(d); }
  d._t = setTimeout(() => d.remove(), 3300);
  while (box.children.length > 4) box.firstChild.remove();
}
function clearToasts() { $('toasts').replaceChildren(); }   // MAT-SV
const subs = []; let subT = 0;
const say = (who, text) => subs.push([who, text]);
function updateSubs(dt) {
  subT -= dt;
  if (subT > 0) return;
  const el = $('sub');
  if (!subs.length) { el.classList.remove('on'); return; }
  const [who, text] = subs.shift();
  el.innerHTML = (who ? `<b class="${ARCD.SPEAKER_CLASS[who] || ''}">${who}</b>` : '') + text;   // ARC: speaker colours (Korr, Tamu, Wena, Pell)
  el.classList.add('on');
  subT = Math.max(3.8, text.length * 0.065);
}
function drawInv() {
  let h = '';
  if (hasSpear()) h += `<span class="tool">${S.tools.flintspear ? 'Flint spear' : 'Spear'}${W.spearOut && spearWhere() ? ' · ' + spearWhere() : ''}</span>`;   // FPP-world: flint tools are named too; WH: the thrown spear
  if (hasAxe()) h += `<span class="tool">${S.tools.flintaxe ? 'Flint axe' : 'Axe'}</span>`;
  if (S.tools.bow) h += `<span class="tool">Bow${BOW.on ? ' (ready)' : ''} <b>${S.inv.arrow || 0}${(S.inv.arrow || 0) > bowCap() ? '' : '/' + bowCap()}</b> arrows</span>`;   // BOW: a stock above the carry cap shows just the count
  if (S.tools.torch) h += `<span class="tool">Torch${torchOn ? ` · lit ${Math.ceil(S.fuel)}s` : ''}</span>`;
  if (S.tools.cloak) h += '<span class="tool">Fur cloak</span>';
  if (S.tools.waterskin) h += `<span class="tool">Waterskin<b>${S.skin}/3</b>${survSkinTag()}</span>`;   // SURV: where the water came from
  h += matToolsHud();                                // MAT: the mature packages' tools (boil bag, pot, mantle, bear cloak)
  for (const k in ITEMS) if (S.inv[k] > 0 && !(k === 'arrow' && S.tools.bow)) h += `<span>${ITEMS[k]}<b>${S.inv[k]}</b></span>`;   // BOW: with a bow the arrows show on its chip only
  $('inv').innerHTML = h || '<span>Nothing carried</span>';   // FPP-world: describes the pack, not the hands (fists may be raised)
  const sig = h.replace(/<b>[^<]*<\/b>/g, '').replace(/lit \d+s/, 'lit');   // FHW-r4: an entry appearing or running out shows the stowed first-person pack (counts already toast, e.g. Sena's gathering)
  if (sig !== FPH.sig) { FPH.sig = sig; FPH.until = clock + 4; const bg = $('bag'); bg.classList.remove('pulse'); void bg.offsetWidth; bg.classList.add('pulse'); }   // BOW-UI: a new kind of thing in the bag pulses the icon
  $('bag-ar').textContent = S.tools.bow ? `${S.inv.arrow || 0} arrows` : '';
  wpnHud();                                          // WPN chip (owned weapons may have changed)
  $('cross').style.display = 'block';
}
// FHW-r4: the first-person HUD. The bottom of the view belongs to the hands: the spear fist and shaft, the torch, the
// rein fists and the horse's neck all sat under the pack, the E prompt, the fps readout and the F1 chip. In first person
// (#hud.fpp) the pack stows (fades out, its space handed to the prompt and subtitles) 3 s after it last changed and
// comes back for 4 s on any change and while a menu is open; the F1 chip and fps readout move up under the weapon chip.
const FPH = { sig: '', until: 0, on: false, stow: false };
const BAG = { open: false };                         // BOW-UI: hold B opens the bag (the pack); otherwise only the bag icon shows
function bagOpen(on) { if (BAG.open === on) return; BAG.open = on; $('hud').classList.toggle('bagopen', on); }
function fppHud() {
  const fp = view === 'fpp' && FP.act && playing && !camShot;
  if (fp !== FPH.on) { FPH.on = fp; $('hud').classList.toggle('fpp', fp); if (fp) FPH.until = Math.max(FPH.until, clock + 3); }
  const stow = playing && !camShot && !menuOpen && !paused && !BAG.open;   // BOW-UI: the pack stays in the bag unless B is held or Tab is open
  if (stow !== FPH.stow) { FPH.stow = stow; $('hud').classList.toggle('stow', stow); }
}
// FPP-world: --invH tracks the pack's height (it wraps to 2-3 rows with a full pack or a narrow window) so the
// E prompt, the subtitles and the open F1 list stack above it instead of drawing over its chips.
if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--invH', $('inv').offsetHeight + 'px')).observe($('inv'));
if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--subH', $('sub').offsetHeight + 'px')).observe($('sub'));   // FPW-r3: the open F1 list clears the subtitle
function drawQuest() {
  const ch = CH[S.ch];
  $('chapter').textContent = `${ch.epilogue ? 'Epilogue' : roman(chNo())} · ${ch.title}`;
  const gl = goalsOf(ch);                            // ARC: goals may be branch-dependent
  $('goals').innerHTML = gl.length
    ? gl.map(([t, f]) => `<div class="${f() ? 'done' : ''}">${t}</div>`).join('') + bowQuestHtml()   // BOW side quest
    : sideGoals() + bowQuestHtml();                    // WP6 free play after the epilogue
  bowQuestFit();                                     // BOW-Q: fold or hide the side line so it never reaches the minimap
}
function give(item, n, who) {
  S.inv[item] += n; bump(item, n);
  survGive(item, n);                                 // SURV: a new perishable starts fresh
  toast(who ? `${who} gathered ${ITEMS[item].toLowerCase()}` : `+${n} ${ITEMS[item]}`);
  drawInv();
}
function showChapter() {
  const ch = CH[S.ch];
  $('card-sub').textContent = ch.epilogue ? 'Epilogue' : `Chapter ${roman(chNo())}`;   // ARC: roman numerals; STORY chNo skips unplayed mature chapters
  $('card-title').textContent = ch.title;
  const recap = arcCard(ch);                         // ARC: the season line and last chapter's choices recap
  $('card').classList.add('on');
  setTimeout(() => $('card').classList.remove('on'), recap ? 6200 : 3800);
  if (!musicSting('chapter')) { A.tone(196, 2.5, 0.12); A.tone(294, 2.5, 0.09, 0.25); A.tone(392, 3, 0.07, 0.5); }   // MUS chapter stinger (the old triad when music is off)
  subT = Math.max(subT, 2.5);
  [...ch.lines, ...(ch.extra?.() || [])].forEach((l) => say(...l));
  drawQuest();
}
// Move into a chapter (story advance and G.setCh): run its onEnter, save, then the card (after the epilogue fade).
function enterChapter() {
  matSkipMature();                                   // MAT: Mature story off skips chapters flagged mature (their skipFx runs)
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
  if (!playing || MAT.dead) return;                  // MAT: never write a save after a permadeath (pagehide/beforeunload too)
  if (!opts.force && matHoldSave()) { MAT.saveHeld = true; matFightMark(); return; }   // MAT-SV: Hardcore keeps the last calm save while a fight is on (pagehide, pause, autosave, quit); MAT-SV r2: the fight mark beside it
  MAT.saveHeld = false; matFightClear();             // MAT-SV r2: a calm save supersedes any fight mark
  S.chId = CH[S.ch]?.id || S.chId;                   // MAT: story v3 saves the chapter id
  S.structs = structs.map((s) => ({ k: s.kind, x: s.x, z: s.z, r: s.rot, g: s.grow, p: s.timed && s.rise < 1 ? +s.rise.toFixed(3) : undefined, h: s.hang?.length ? s.hang.map(([k, t]) => [k, +t.toFixed(1)]) : undefined }));   // WP2 p: site progress, h: rack
  S.px = P.pos.x; S.pz = P.pos.z; S.nx = N.pos.x; S.nz = N.pos.z;
  horseSave();                                       // WP4 horse position, riding
  wpnSave();                                         // WPN selected weapon, the spear lying out
  S.yaw = camYaw; S.pitch = camPitch; S.view = view; S.evNext = EV.next; S.storm = EV.storm;
  S.felled = [];
  world.fields.forEach((f, fi) => { if (f.kind === 'tree') f.nodes.forEach((n, ni) => { if (!n.alive && !n.gone) S.felled.push([fi, ni]); }); });
  S.seen = encodeSeen();                               // WP5 fog of war
  rstSaveFix();                                        // SAVE-PERF: mid-rest saves wake at the door and finish the night on load
  saveGame(S, opts);
  saveFlash = 2.5; $('savechip').textContent = 'Saving…'; $('savechip').className = 'panel';
}
saveState.listeners.push((st) => {
  const el = $('savechip');
  el.textContent = st.where === 'db' ? 'Saved to database' : 'Saved in browser only (server unreachable)';
  el.className = 'panel ' + (st.where === 'db' ? 'ok' : 'warn');
});
// SAVE-PERF r3: the save server answered late with a newer story than the one being played (this session started from
// an older browser copy, or as a new story, while the server was silent). Nothing has been sent over it; the player chooses.
let conflictAsked = false, sessionBase = { day: 0, at: 0 };
saveState.listeners.push((st) => {
  if (!st.conflict || conflictAsked || !playing) return;
  conflictAsked = true;
  const d = st.conflict, when = d.savedAt ? new Date(d.savedAt).toLocaleString() : 'earlier';
  const here = sessionBase.day ? `the copy from this browser you are playing (started at day ${sessionBase.day})` : 'the new story you started';
  setTimeout(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    if (confirm(`The save server answered late. It has a newer saved story (day ${d.day || 1}, saved ${when}) than ${here}.\n\nOK: switch to the newer story. This session is kept as a backup in this browser.\nCancel: keep playing this one. It will replace the newer story on the server.`)) {
      abandonSession(); location.reload();
    } else { releaseServer(); save(); }
  }, 0);
});
// Save when the tab is hidden or closed, so nothing is lost when the machine is switched off.
addEventListener('visibilitychange', () => { if (document.hidden) save({ beacon: true }); });
addEventListener('pagehide', () => save({ beacon: true }));
addEventListener('beforeunload', () => save({ beacon: true }));

// ---------- characters ----------
const P = { pos: new THREE.Vector3(0, 0, 4), face: Math.PI, h: makeHuman({ hairColor: 0x3d2f26 }), sneak: false, speed: 0, cool: 0, step: 0, vx: 0, vz: 0, vy: 0, jy: 0, air: false, auto: false, tired: false };
const N = { pos: new THREE.Vector3(2, 0, 2.5), face: 0, h: makeHuman({ female: true, hairColor: 0x4a382c, dress: { color: 0x6e4a2e, style: 'twopiece' } }), node: null   /* SENA-LOOK: the user's choice (2026-11-17): an attractive hide two-piece, not the dress */, wait: 4, speed: 0, act: 0 };
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
  collide(e.pos, 0.3, false, !!e.foe);              // SIT-r3: raiders never walk through the walls of an open house
  e.face = turn(e.face, Math.atan2(dx, dz), Math.min(1, dt * 8));
  e.speed = speed;
  return false;
}
function settle(e, dt, crouch) {
  const root = e.h.root;
  if (e.floorSit || e.fsW > 0) floorSitEase(e, dt);  // STORY hearth: easing onto / off the planks
  if (rstSettle(e, dt)) return;                     // RST: Aro and Sena lying in bed, walking in, standing up, kept indoors
  // Lying down (resting in bed): body flat on its back at restPos.
  if (e.rest > 0) { root.position.copy(e.restPos); root.rotation.order = 'YXZ'; root.rotation.set(-Math.PI / 2, e.face, 0); e.h.animate(dt, 0, false, false, false); return; }
  root.rotation.x = 0;
  if (e.sitIn) sitInStep(e, dt);                    // SIT-r3: walking onto a seat (fire bench, hot spring)
  if (e.standOff) standOffStep(e, dt);              // SIT-r3: easing off the bench log
  // Seated on something that moves (horse rider): the caller supplies the world seat point.
  if (e.seat) { root.position.copy(e.seat); if (e.fsW > 0) root.position.y -= FS.drop * smooth01(e.fsW); root.rotation.y = e.face; e.h.animate(dt, 0, false, false, false); return; }
  const g = getHeight(e.pos.x, e.pos.z);
  e.swim = g < -1.15;                       // deeper than the waist: swim at the surface
  e.pos.y = (e.swim ? SWIM_Y : g) + (e.jy || 0);
  e.h.root.position.copy(e.pos);
  if (e.fsW > 0) e.h.root.position.y -= FS.drop * smooth01(e.fsW);   // STORY hearth: rising off the floor
  e.h.root.rotation.y = e.face;
  e.h.animate(dt, e.speed, crouch && !e.swim, e.swim, !!e.air);
}
// ---------- spear ----------
// WPN: the thrown spear (proj, throwSpear, updateSpear) lives in the WPN weapons section.
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ---------- animals ----------
const animals = [], herds = [];
const HP = { deer: 8, stag: 12, wolf: 14, fox: 3, cow: 60, aurochs: 90, bear: 120 };   // CMB rebalance (× foeHpK for predators)
const LOOT = { deer: [3, 1], stag: [4, 2], wolf: [1, 2], fox: [0, 1], cow: [5, 2], aurochs: [12, 3], bear: [8, 0] };   // CMB aurochs, bear (+ horn / bear hide, claws)
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
  if (o.kind === 'wolf' || o.hostile) o.hp = HP[kind] * matFoeHpK(o);   // MAT foeHpK (wolves, predators)
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
  P.face = o.root.rotation.y; P.pos.copy(o.root.position); wpnStowAll('ride', true);   // WPN
  P.tr = null; P.rideW = 1;                                 // WH
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
  playerHurt({ dmg: 5, kind: 'blunt', from: o }); o.trust = Math.max(0, (o.trust || 0) - 1);   // MAT (was a direct hp write)
  toast('Thrown off! She trusts you a little less.'); A.hit(160, 0.3, 0.8);
  alarm(o);
}
// anim: the E-key mount climbs on over MOUNT_T (input locked, see rideTrans); loads and story calls seat at once.
function mount(o, anim = false) {
  if (!o) return;
  const r0 = P.h.root.position.clone(), f0 = P.h.root.rotation.y, n0 = N.h.root.position.clone(), nf0 = N.h.root.rotation.y;
  P.ride = o; P.taming = null; P.sneak = false; P.air = false; P.jy = 0; P.vy = 0; P.vx = P.vz = 0; P.hv = 0; P.auto = false; P.sit = 0;
  P.face = o.root.rotation.y; P.pos.copy(o.root.position);
  wpnStowAll('ride'); useCool = 0.8; wHeld = 0; hIdle = 0;   // WPN
  Object.assign(o, { call: false, speed: 0, stun: 0, flee: 0, stay: null });
  if (placing) { placing = null; ghost.visible = false; }
  N.board = null;
  if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 10 && nFree()) {
    N.node = null; N.act = 0; N.speed = 0;
    // RIDE-r4: the E-key mount: Sena walks (or jogs) to the horse's flank on the ground first and climbs on from there
    // (senaBoard); she used to glide up to 10 m through the air in her seated pose. Loads and story calls seat her at once.
    if (anim) N.board = { o, t: 0, wp: null }; else N.ride = true;
  }
  P.tr = anim ? { on: true, t: 0, dur: MOUNT_T, p0: r0, f0 } : null; P.rideW = anim ? 0 : 1; rideShowT = 4;   // WH
  N.tr = null; N.rideW = N.ride ? 1 : 0;
  $('bar-horse').style.display = ''; A.hit(300, 0.15, 0.25);
}
const clearSeat = (e) => { e.seat = null; e.saddle = null; e.pOff = null; e.h.pose = null; e.h.straddle = false; e.tr = null; e.rideW = 0; e.h.legIK = false; };
// ---------- WH: mounting and dismounting motion ----------
// The E-key mount: from where Aro stands he steps up and swings onto the saddle along a short arc while the straddle
// (leg IK, reins) blends in; Sena follows 0.3 s later. The E-key dismount is the reverse: the horse stops, Aro slides
// down her left side (Sena her right) and lands with a small knee dip; dismount() itself runs when the slide ends.
// Input is locked for the duration (updateRide reads rideBusy). Story and load paths still mount / dismount at once.
const RIDE_BOUGH = 0.5;                             // RIDE-r4: a rider's head clearance from a pine's bough radius (updateRide)
const MOUNT_T = 0.75, DISMOUNT_T = 0.9, DIS_SWING = 0.42;   // WH: DIS_SWING = the share of the dismount spent swinging the far leg over
let rideShowT = 0;                                  // seconds the "Dismount" prompt stays up after mounting or stopping
const rideBusy = () => !!(P.tr || N.board || (N.ride && N.tr && N.tr.on && N.tr.t < N.tr.dur * 0.5));   // RIDE-r4: + Sena on her way to the flank
function dismountStart() {
  const o = P.ride; if (!o || P.taming || P.tr) return;
  const f = P.face, lx = Math.cos(f), lz = -Math.sin(f), hp = o.root.position;
  const end = (x, z) => { const v = new THREE.Vector3(x, 0, z); collide(v, 0.35); v.y = getHeight(v.x, v.z); return v; };
  P.tr = { on: false, t: 0, dur: DISMOUNT_T, end: end(hp.x + lx * 1.3, hp.z + lz * 1.3) };
  if (N.ride) N.tr = { on: false, t: 0, dur: DISMOUNT_T, end: end(hp.x - lx * 1.3, hp.z - lz * 1.3) };
  useCool = 0.8;                                    // WH: the ride pose holds while the far leg swings over (rideTrans)
  A.hit(260, 0.12, 0.2);
}
// RIDE-r4: Sena boards for two-up. On foot (walk, or a jog from further off) to the flank on the side she is on, level
// with her seat; from ahead of the chest or behind the rump she goes out to the side first, never through the horse,
// and round trees (walkTo collides). There the climb starts (rideTrans, tr.up). Stuck for BOARD.give s: she stays afoot.
const BOARD = { side: 0.74, run: 4.6, walk: 2.3, near: 1.2, give: 6, dur: 0.9 };
const _bd1 = new THREE.Vector3(), _bd2 = new THREE.Vector3(), _bd3 = new THREE.Vector3();
function senaBoard(dt) {
  const b = N.board, o = b.o;
  if (P.ride !== o || P.taming || !nFree()) { N.board = null; return false; }
  if ((b.t += dt) > BOARD.give) { N.board = null; N.speed = 0; return false; }
  const f = o.root.rotation.y, Fx = Math.sin(f), Fz = Math.cos(f), Lx = Math.cos(f), Lz = -Math.sin(f), hp = o.root.position;
  o.root.updateMatrixWorld(true); o.a.bone('Torso2').getWorldPosition(_bd3);
  const sf = (_bd3.x - hp.x) * Fx + (_bd3.z - hp.z) * Fz - RIDE_SEAT.N.back;          // her seat, along the horse from its root
  const dx = N.pos.x - hp.x, dz = N.pos.z - hp.z, fw = dx * Fx + dz * Fz, lat = dx * Lx + dz * Lz;
  b.sd ??= lat >= 0 ? 1 : -1;                                                        // +1: the horse's left
  const at = (a, l, out) => out.set(hp.x + Fx * a + Lx * l, 0, hp.z + Fz * a + Lz * l);
  const spot = at(sf, b.sd * BOARD.side, _bd1);
  const round = b.sd * lat < 0.9 && (fw > sf + 1.1 || fw < sf - 1.3);               // ahead of the chest / behind the rump
  const goal = round ? at(fw, b.sd * 1.2, _bd2) : spot, d = Math.hypot(spot.x - N.pos.x, spot.z - N.pos.z);
  if (round || d > Math.max(0.1, BOARD.walk * dt)) { walkTo(N, goal.x, goal.z, d > BOARD.near ? BOARD.run : BOARD.walk, dt, round ? 0.3 : 0.1); return true; }
  N.pos.x = spot.x; N.pos.z = spot.z; N.board = null; N.ride = true; N.speed = 0; N.rideW = 0;
  N.h.root.position.copy(N.pos); N.h.root.position.y = getHeight(N.pos.x, N.pos.z);
  N.tr = { on: true, up: true, t: 0, dur: BOARD.dur, p0: N.h.root.position.clone(), f0: N.h.root.rotation.y };
  return false;
}
// After seatOn (the root sits on the saddle): move the root along the arc between the ground and the seat.
function rideTrans(e, dt) {
  const tr = e.tr; if (!tr) return;
  tr.t += dt;
  const k = clamp(tr.t / tr.dur, 0, 1), s = smooth01(k), root = e.h.root;
  if (tr.on) {
    if (tr.t < 0) { root.position.copy(tr.p0); root.rotation.y = tr.f0; e.rideW = 0; e.h.legIK = false; return; }
    if (tr.up) {                                     // RIDE-r4: Sena from beside the flank (senaBoard)
      // a beat on the ground facing the flank, a hop up (the jump pose) to the seat height, and over onto the back as the
      // seated pose and the straddle come in; never the seated pose while she is beside the horse or on the grass
      const u = clamp((k - 0.1) / 0.9, 0, 1), kv = smooth01(Math.min(1, u / 0.6)), kh = smooth01(clamp((u - 0.1) / 0.9, 0, 1));
      _hn.copy(root.position);
      root.position.set(tr.p0.x + (_hn.x - tr.p0.x) * kh, tr.p0.y + (_hn.y - tr.p0.y) * kv + Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.14, tr.p0.z + (_hn.z - tr.p0.z) * kh);
      root.rotation.y = tr.f0 + wrapA(e.face - tr.f0) * smooth01(Math.min(1, k * 1.5));
      e.h.pose = u <= 0 ? null : u < 0.42 ? 'jump' : 'ride';
      e.rideW = smooth01(clamp((u - 0.3) / 0.6, 0, 1)); e.h.legIK = u > 0.45;
      if (k >= 1) e.tr = null;
      root.updateMatrixWorld(true);
      return;
    }
    const lift = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.32;            // up over the horse's back, then down onto it
    _hn.copy(root.position); root.position.lerpVectors(tr.p0, _hn, s); root.position.y += lift;
    root.rotation.y = tr.f0 + wrapA(e.face - tr.f0) * smooth01(k * 1.6);
    e.rideW = smooth01(k * 1.4); e.h.legIK = k > 0.25;
    if (k >= 1) e.tr = null;
  } else {
    if (tr.t < 0) return;
    // WH: two phases. To DIS_SWING the rider rises a little and slides his hips out over the near side of the back
    // (still seated, the far leg swinging over the croup: riderOverride); then he drops down the flank, already
    // clear of the barrel (0.27 m half width), the straddle blending out as the feet reach for the ground.
    _hn.copy(tr.end).sub(root.position); const dy = _hn.y; _hn.y = 0;
    const D = _hn.length() || 1, a = smooth01(k / DIS_SWING), k2 = clamp((k - DIS_SWING) / (1 - DIS_SWING), 0, 1);
    const out = Math.min(0.48, D), lat = out * a + (D - out) * smooth01(Math.min(1, k2 * 1.5));   // the side step leads the drop
    root.position.addScaledVector(_hn, lat / D);
    root.position.y += 0.1 * a * (1 - k2) + dy * k2 * k2 * (3 - 2 * k2);
    e.h.pose = k < DIS_SWING ? 'ride' : null;
    e.rideW = 1 - smooth01(k2 / 0.75); e.h.legIK = e.rideW > 0.05;
    if (e === N && k >= 1) N.tr = null;
    if (e === P && k >= 1) {
      const nEnd = N.tr && !N.tr.on ? N.tr.end : null;
      dismount(false, tr.end, nEnd); P.h.crouch = 0.55; if (N.h) N.h.crouch = 0.45;   // the landing dip (animate eases crouch back to 0)
    }
  }
  root.updateMatrixWorld(true);
}
function dismount(thrown = false, at = null, nAt = null) {
  const o = P.ride; if (!o) return;
  N.board = null;                                    // RIDE-r4: she was still on her way to climb on
  const f = P.face, rx = Math.cos(f), rz = -Math.sin(f), hp = o.root.position;
  P.ride = null; P.taming = null; P.jy = 0; P.vy = 0; P.air = false; P.vx = P.vz = 0; P.hv = 0; P.speed = 0;
  if (at) P.pos.set(at.x, 0, at.z); else { P.pos.set(hp.x + rx * (thrown ? 1.8 : 1.3), 0, hp.z + rz * (thrown ? 1.8 : 1.3)); collide(P.pos, 0.35); }   // WH: at = where the slide-down landed
  clearSeat(P);
  if (N.ride) { N.ride = false; if (nAt) N.pos.set(nAt.x, 0, nAt.z); else { N.pos.set(hp.x - rx * 1.3, 0, hp.z - rz * 1.3); collide(N.pos, 0.3); } clearSeat(N); N.face = f; N.wait = 4; }
  Object.assign(o, { speed: 0, walk: false, timer: 8, dir: f });
  o.root.rotation.y = f; o.root.position.y = getHeight(hp.x, hp.z);
  if (o.tame) { o.home = horseHome(); o.stay = { x: hp.x, z: hp.z }; o.a.play('Idle'); }   // WH: she stays where you left her
  useCool = 0.8; camDist = Math.min(camDist, 9);
  $('bar-horse').style.display = 'none'; $('bar-calm').style.display = 'none';
}
function callHorse() {
  const o = tameHorse();
  if (STORY && !S.horse && !P.ride) { toast('You have no horse yet. Tame one at Horse Meadow, across the river to the east'); return; }
  if (!STORY || !S.horse || !o || P.ride) return;
  A.tone(1480, 0.18, 0.05); A.tone(1980, 0.3, 0.05, 0.16);
  const hp = o.root.position, d = Math.hypot(hp.x - P.pos.x, hp.z - P.pos.z);
  if (depthAt(P.pos.x, P.pos.z) > 0.05 || depthAt(hp.x, hp.z) > 0.05) { o.call = false; toast(`${hName()} cannot hear you in here.`); return; }
  if (d > [80, 140, 220, Infinity][hLvl() - 1]) { o.call = false; toast(`${hName()} is too far away to hear you.`); return; }
  if (d < 3) return;
  Object.assign(o, { call: true, callT: 0, callBest: d, stun: 0, stay: null }); toast(`You whistle. ${hName()} is coming.`);
}
function horseCatchUp(o) {          // stuck on the way: appear 25 m behind you, out of view, on dry ground
  for (let i = 0; i < 14; i++) {
    const a = camYaw + (i % 2 ? 1 : -1) * (i >> 1) * 0.3, x = P.pos.x + Math.sin(a) * 25, z = P.pos.z + Math.cos(a) * 25;
    if (Math.abs(x) < LIMIT && Math.abs(z) < LIMIT && getHeight(x, z) > 0.4 && depthAt(x, z) <= 0) {
      o.root.position.set(x, getHeight(x, z), z); o.callT = 0; o.callBest = 25; return;
    }
  }
}
// WH: where the tame horse keeps to. Left somewhere (dismounted, or arrived at a whistle) she grazes within 6 m of that
// spot (o.stay) and is still there when you come back; she goes home only at night when she has a stable, or when you
// are far away (250 m+). Mounting or whistling clears the spot; a night in the stable (horseNight) too.
function horseAnchor(o, dist) {
  if (o.stay && (dist > 250 || (world.env.night > 0.6 && structs.some((s) => s.kind === 'stable' && s.rise >= 1)))) o.stay = null;
  return o.stay || o.home;
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
    if (dist < 3) { o.call = false; o.stay = { x: p.x, z: p.z }; return 0; }   // WH: she waits here for you
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
  if (P.ride) return { label: `Dismount${S.horse ? ' ' + hName() : ''}`, key: true, act() { if (eTap) dismountStart(); } };   // WH: slides down
  let o = null, bd = 3;
  for (const a of animals) {
    if (!a.horse || a.state !== 'live' || a.foal) continue;
    const d = Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z);
    if (d < bd) { bd = d; o = a; }
  }
  if (!o) return null;
  if (o.tame) {                                     // WH: tap E rides; hold E feeds her (once a day) when there is food
    if (bd > 2.6) return null;
    const f = horseFood(), hungry = !!(f && S.horse && S.horse.fedDay !== S.day);
    return { label: `Ride ${hName()}${hungry ? ` <span style="opacity:.75;font-size:.86em">· hold E to feed her (${f === 'grain' ? '2 grain' : '3 berries'})</span>` : ''}`, key: true, horse: o, dist: bd,
      act() { if (!eTap) return; if (hungry) horseE = { o, f, t0: clock }; else mount(o, true); } };
  }
  if (o.foal || S.horse || bd > 2.8) return null;
  if (!P.sneak) return { label: 'Sneak (C) to come closer to the wild horse' };
  if ((o.trust || 0) >= 3) return { label: 'Climb on her back', key: true, act() { if (eTap) startTame(o); } };
  const f = horseFood();
  if (!f) return { label: 'Bring 2 grain or 3 berries to offer her' };
  return { label: f === 'grain' ? 'Offer grain' : 'Offer berries', key: true, act() { offerFood(o, f); } };
}
// WH: the E press on the tame horse resolves here (updateHorses): released before 0.45 s rides, held feeds.
let horseE = null;
function horseETick() {
  const he = horseE; if (!he) return;
  if (P.ride || busy || target?.horse !== he.o) { horseE = null; return; }
  if (!keys.KeyE) { horseE = null; mount(he.o, true); }
  else if (clock - he.t0 >= 0.45) { horseE = null; feedHorse(he.o, he.f); }
}
function feedHorse(o, f) {
  S.inv[f] -= f === 'grain' ? 2 : 3; drawInv(); S.horse.fedDay = S.day; addBond(10);
  o.a.play('Eating', true); o.stun = 4.5; o.speed = 0; o.call = false;          // she stands and eats; still there for the ride after
  o.dir = o.root.rotation.y; P.h.swing(); showHeart({ ...o, trust: 3 }); toast(`${hName()} eats from your hand`); A.tone(740, 0.3, 0.06);
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
  const can = !menuOpen && !busy && !rideBusy(), saddle = !!S.tools.saddle, shift = keys.ShiftLeft || keys.ShiftRight;   // WH: no steering while climbing on or off
  if (P.tr && !P.tr.on) P.hv *= Math.max(0, 1 - dt * 6);                       // WH: she stops under him as he slides down
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
      P.pos.x = nx; P.pos.z = nz; collide(P.pos, 0.75); collide(P.pos, 0.3, true);   // WH: and the riders out of low pine boughs
      // RIDE-r4: the riders' heads are not over the horse's root (Aro sits ~0.5 m ahead of it, Sena behind him): each seat
      // (last frame's, moved with the horse) is kept out of the boughs too, with a head's margin, so riding past a young
      // pine no longer puts his head 1.6 m from the trunk inside a 1.9 m spread of needles (an all-green first-person view)
      for (const e of N.ride ? [P, N] : [P]) {
        if (!e.saddle) continue;
        const ox = e.saddle.x - o.root.position.x, oz = e.saddle.z - o.root.position.z;
        _hn.set(P.pos.x + ox, 0, P.pos.z + oz); collide(_hn, RIDE_BOUGH, true);
        P.pos.x = _hn.x - ox; P.pos.z = _hn.z - oz;
      }
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
    if (v < 0.3) o.a.play('Idle');                 // WH: a ridden horse keeps her head up (no grazing under the rider)
    else if (v < 3.5) o.a.play('Walk', false, P.hv / 2.2);
    else if (v < 7) o.a.play('Gallop', false, 0.55);
    else o.a.play('Gallop', false, v / 13 + 0.2);
  }
  hStepT += dt;
  if (v > 0.5 && !P.air && hStepT > Math.max(0.13, 2.2 / v)) { hStepT = 0; A.hit(gh < -0.2 ? 900 : 110 + rand() * 50, 0.05, 0.1); }
  P.speed = v; P.vx = fx * P.hv; P.vz = fz * P.hv;
  P.cool = Math.max(0, P.cool - dt);
  wpnUpdate(dt);                                   // WPN stow, aim and throw from the saddle
  settle(P, dt, false);
  useCool -= dt;
  target = busy || menuOpen || rideBusy() ? null : findTarget();
  // WH: "Dismount" shows for a few seconds after mounting and again once she has stood still a moment; E always works
  rideShowT = v < 0.3 ? (hIdle > 1.2 ? Math.max(rideShowT, 0.5) : rideShowT - dt) : rideShowT - dt;
  const pr = $('prompt');
  if (target && rideShowT > 0) { pr.style.display = 'block'; pr.innerHTML = (target.key ? '<kbd>E</kbd> ' : '') + target.label; } else pr.style.display = 'none';
  const use = keys.KeyE || tapE; tapE = false;
  if (use && useCool <= 0 && !busy && !menuOpen && target?.act) { target.act(); useCool = Math.max(useCool, 0.42); drawQuest(); }
}
// Seat a rider: the pelvis goes onto the horse's back at the named bone; returns the saddle point.
function seatOn(e, o, boneName, back, up = 0) {
  o.root.updateMatrixWorld(true);
  o.a.bone(boneName).getWorldPosition(_hs);
  _hs.y += 0.65 * o.a.model.scale.y + 0.1 + up;     // the back surface (measured by raycast) is at Torso2 + 0.31; the hip joint sits 0.1 above it
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
// ---------- WH: the riders' bodies ----------
// Order 29 (before the WPN aim at 30, so a spear aim from the saddle still owns the arms). Targets are in each rider's
// own frame (root: +x left, +y up, +z forward), measured from the hip joints and the pelvis, so they stay on the horse
// whatever the gait does to the seat: legs straddle the barrel (feet down the ribs, knees forward and out), the body
// leans into the pace and rocks with the stride, Aro's fists hold the reins over the withers (unless a weapon or the lit
// torch has that hand), Sena's hands rest on Aro's hips. rideW (0..1) blends it in and out with the mount motion.
const RIDE_SEAT = { P: { back: -0.32, up: -0.03 }, N: { back: 0.08, up: 0 } };   // along the back from Torso2 (+ = toward the tail): Aro in the dip behind the withers (Torso2 +0.36 m), Sena 0.4 m behind him
// The ride clip (Driving_Loop) hunches over a wheel: the riders' spine, neck and head come from the standing idle instead.
const RIDE_UPRIGHT = (b) => /^(spine_0[123]|neck_01|Head)$/.test(b);
const RIDE_UP = { P: samplePose(P.h, 'idle', 0, RIDE_UPRIGHT), N: samplePose(N.h, 'idle', 0, RIDE_UPRIGHT) };
const _rA = new THREE.Vector3(), _rB = new THREE.Vector3(), _rC = new THREE.Vector3(), _rL = new THREE.Vector3();
// RIDE-r3: the riders' foot line (ankle -> ball) in the rider's frame: out to the side and down (standing flat it runs
// 31 degrees down; 14 here drops the heel about 17 degrees below the ball, the weight in the heel)
const RIDE_FOOT = { out: 0.22, down: -0.26 };
const _rq4 = new THREE.Quaternion(), _rL2 = new THREE.Vector3();
function riderOverride(e) {
  return (h, dt) => {
    const on = e === P ? !!P.ride && !P.taming : !!N.ride;
    const w = on ? clamp(e.rideW ?? 1, 0, 1) : 0;
    if (!(w > 0.01) || !h.legIK) return;
    const root = h.root, b = h.bones, v = Math.abs(P.hv || 0), g = clamp(v / 13, 0, 1), trot = clamp((v - 2.5) / 3, 0, 1);
    e.ridePh = ((e.ridePh || 0) + (dt || 0) * 6.283 * (v < 0.3 ? 0.25 : 0.7 + v * 0.13)) % 6.283;
    const ph = e.ridePh, sn = Math.sin(ph), s2 = Math.sin(ph * 2);
    applyPose(h, RIDE_UP[e === P ? 'P' : 'N'], w);                                // sit up straight
    root.updateMatrixWorld(true);
    _rL.set(1, 0, 0).transformDirection(root.matrixWorld);                       // the rider's left: the pitch axis
    const lean = ((e === N ? 0.16 : 0.07) + 0.2 * g + 0.035 * trot * s2) * w;
    rotW(b.spine_01, _rL, lean * 0.6); rotW(b.spine_02, _rL, lean * 0.4);
    yawBone(b.spine_01, sn * 0.05 * (0.3 + g) * w);                              // the hips follow the stride
    rotW(b.neck_01, _rL, -lean * 0.75);                                          // eyes stay on the road
    const leg = b.thigh_l.getWorldPosition(_rA).distanceTo(b.calf_l.getWorldPosition(_rB)) + _rB.distanceTo(b.foot_l.getWorldPosition(_rC));
    // WH dismount: Aro gets off on his left, Sena on her right. The far leg swings up behind and over the croup to
    // the near side while the near leg straightens into the stirrup; both hang together by the end of the swing.
    const dis = e.tr && !e.tr.on && e.tr.t > 0 ? clamp(e.tr.t / (e.tr.dur * DIS_SWING), 0, 1) : -1, near = e === P ? 1 : -1;
    for (const sd of ['l', 'r']) {
      const s = sd === 'l' ? 1 : -1;
      root.worldToLocal(b['thigh_' + sd].getWorldPosition(_rA));
      _rB.set(_rA.x + s * 0.2 * leg / 0.9, _rA.y - 0.74 * leg / 0.9 + 0.02 * sn * trot, _rA.z + 0.04 + 0.03 * sn * g);
      _rC.set(_rA.x + s * 0.55, _rA.y - 0.3, _rA.z + 1);
      if (dis >= 0) {
        const u = smooth01(dis), arc = Math.sin(Math.PI * u);
        if (s === near) { _rB.set(lerp(_rB.x, _rA.x + s * 0.06, u), lerp(_rB.y, _rA.y - 0.93 * leg, u), lerp(_rB.z, _rA.z + 0.05, u)); }
        else {
          _rB.set(lerp(_rB.x, _rA.x + near * 0.3, u), lerp(_rB.y, _rA.y - 0.86 * leg, u) + arc * 0.5 * leg, lerp(_rB.z, _rA.z - 0.02, u) - arc * 0.62 * leg);
          _rC.set(lerp(_rC.x, _rA.x + near * 0.4, u), _rC.y - arc * 0.7, lerp(_rC.z, _rA.z + 1, u) - arc * 1.2);   // knee down and back over the croup
        }
      }
      ikLeg(h, sd, root.localToWorld(_rB), root.localToWorld(_rC), w);
      // RIDE-r3: the foot is set in the rider's frame, not left at the clip's angle on the bent calf (that pointed the
      // toes down, and at speed back under the barrel): toes forward and a little out, the heel just below the ball
      const ft = b['foot_' + sd], ball = b['ball_' + sd];
      if (ball && dis < 0) {
        root.updateMatrixWorld(true); ft.updateWorldMatrix(true, true);
        ball.getWorldPosition(_rC).sub(ft.getWorldPosition(_rB)).normalize();
        _rB.set(s * RIDE_FOOT.out, RIDE_FOOT.down, 1).normalize().transformDirection(root.matrixWorld);
        _rq4.setFromUnitVectors(_rC, _rB);
        _rL2.set(_rq4.x, _rq4.y, _rq4.z); const sa = _rL2.length();
        if (sa > 1e-6) rotW(ft, _rL2.divideScalar(sa), 2 * Math.atan2(sa, _rq4.w) * w);
      }
    }
    root.worldToLocal(b.pelvis.getWorldPosition(_rA));
    const py = _rA.y, pz = _rA.z;
    if (e === P) {
      const busyR = W.aimW > 0.02 || (W.held && W.held !== 'fists' && W.st !== 'sheathed'), busyL = W.aimW > 0.02 || torchOn || W.torchW > 0.05;
      for (const sd of ['l', 'r']) {
        if (sd === 'r' ? busyR : busyL) continue;
        const s = sd === 'l' ? 1 : -1;
        _rB.set(s * 0.11, py + 0.27 + 0.02 * s2 * trot, pz + 0.33 + 0.05 * g + 0.025 * sn * (0.3 + g));
        _rC.set(s * 0.5, py + 0.02, pz - 0.3);
        ik2(h, sd, root.localToWorld(_rB), root.localToWorld(_rC), w);
        applyPose(h, h.fist[sd], w);
      }
    } else if (P.h && P.ride) {                                                  // Sena: hands on Aro's hips
      const pr = P.h.root; pr.updateMatrixWorld(true);
      for (const sd of ['l', 'r']) {
        const s = sd === 'l' ? 1 : -1;
        pr.worldToLocal(P.h.bones.spine_01.getWorldPosition(_rB));
        _rB.x += s * 0.15; _rB.y += 0.02; _rB.z -= 0.02;
        pr.localToWorld(_rB);
        _rC.set(s * 0.45, py - 0.05, pz + 0.05);
        ik2(h, sd, _rB, root.localToWorld(_rC), w);
      }
    }
  };
}
P.h.addOverride('ride', 29, riderOverride(P)); N.h.addOverride('ride', 29, riderOverride(N));
// ---------- WH: tack (S.tools.saddle): a hide pad on a woven blanket with a girth, a rope bridle and reins ----------
// The group follows the tame horse's Torso2 bone (about the barrel's centre line) with the back's pitch; the barrel is
// an ellipse of half width 0.27 and half height 0.36 there (raycast). Reins run from Aro's fists to the bit while he rides.
const tack = (() => {
  const g = new THREE.Group(); g.visible = false;
  const hide = new THREE.MeshStandardMaterial({ color: 0x80593a, roughness: 0.92, side: THREE.DoubleSide });
  const weave = new THREE.MeshStandardMaterial({ color: 0x6e3b2a, roughness: 1, side: THREE.DoubleSide });
  const rope = new THREE.MeshStandardMaterial({ color: 0x9a8258, roughness: 1 });
  const shell = (len, th, mat, sx, sy, z) => {
    const geo = new THREE.CylinderGeometry(1, 1, len, 24, 1, true, -th / 2, th); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, 1); m.position.z = z; m.castShadow = true; g.add(m); return m;
  };
  shell(0.82, 2.0, weave, 0.278, 0.368, 0.16);                                   // blanket (under both seats: Aro at +0.36, Sena at -0.08)
  shell(0.42, 1.7, hide, 0.29, 0.38, 0.34);                                      // pad under Aro
  const girth = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.055, 24, 1, true), weave);
  girth.geometry.rotateX(-Math.PI / 2); girth.scale.set(0.282, 0.372, 1); girth.position.set(0, 0, 0.44); g.add(girth);
  const rein = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 5), rope); m.geometry.translate(0, 0.5, 0); m.geometry.rotateX(Math.PI / 2); m.visible = false; scene.add(m); return m; };
  const nose = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 5, 14), rope); nose.visible = false; scene.add(nose);
  scene.add(g);
  return { g, reins: [rein(), rein()], nose };
})();
// Head-bone-local noseband (centre, orientation, radius) and bit point; measured on the Quaternius horse (G.tackFit).
// Offsets are metres in the Head bone's orientation (its world scale is ~48, so localToWorld is not used): +y runs down
// the face to the muzzle, +z out of the forehead, +x the horse's right. The ring's axis lies along the face (+y).
const TACK_NOSE = { p: new THREE.Vector3(0, 0.42, 0.0), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), r: 0.085, bit: new THREE.Vector3(0, 0.47, -0.05) };
const headPt = (hd, off, out) => { hd.getWorldPosition(out); hd.getWorldQuaternion(_tq); return out.add(_tU.copy(off).applyQuaternion(_tq)); };
const _tq = new THREE.Quaternion(), _tm = new THREE.Matrix4(), _tF = new THREE.Vector3(), _tB = new THREE.Vector3(), _tU = new THREE.Vector3();
// FPW-r3: in first person the neck is set to one carriage whatever the gait: the head (Neck1 -> Head) rises FPP_NECK_EL
// above level. The Walk clip dropped her head ~0.5 m and it left the view (riding ahead showed only grass);
// WH's fixed 0.32 rad reach kept that drop. Most of the clip's own nod stays (FPP_NECK_K), so she still moves.
const FPP_NECK_EL = 0.68, FPP_NECK_K = 0.85;
const _nkA = new THREE.Vector3(), _nkB = new THREE.Vector3();
function fppNeck(th) {
  const nk = th.a.bone('Neck1'), hd = th.a.bone('Head');
  nk.updateWorldMatrix(true, false); hd.updateWorldMatrix(true, false);
  nk.getWorldPosition(_nkA); hd.getWorldPosition(_nkB).sub(_nkA);
  const fh = Math.hypot(_tF.x, _tF.z) || 1;                        // her heading, level (the gallop pitches the back forward: the carriage is held against the horizon)
  const el = Math.atan2(_nkB.y, (_nkB.x * _tF.x + _nkB.z * _tF.z) / fh);   // the neck's rise above level (_tF/_tB: updateTack's horse frame)
  const w = smooth01(((P.rideW ?? 1) - 0.4) / 0.5);                // eases in with the mount blend
  rotW(nk, _tB, clamp(el - FPP_NECK_EL, -0.6, 0.7) * FPP_NECK_K * w);   // + about the horse's left: forward and down
}
// RIDE-r3: two-up, Aro's sheathed spear rides on Sena's back (diagonal, tip up and behind her left shoulder): her own
// spear and basket are put away on the horse, and nothing sits behind her. The old horse-shoulder rest pointed the stone
// tip forward past the horse's jaw. Scaled by the two spines' world scale so it keeps its size.
const _srS = new THREE.Vector3();
// Her spine_03 socket frame, fitted in game: the butt by her right hip over the croup, the shaft flat on her shoulder
// blades, the tip 0.95 m over her pelvis (0.3 m over her head), 0.8 m to her left and 0.5 m behind: 54 degrees across her
// back from behind, leaning back from the side.
const SPEAR_ON_SENA = { p: [0.001, -0.048, -0.144], r: [-2.224, 0.857, 0.391], s: 0.92 };
function spearRestTick(live) {
  const sp = P.h.spear, inRest = sp.userData.slot === 'rest';
  const want = live && P.ride && N.ride && !(P.tr && !P.tr.on) && W.st === 'sheathed' && !W.aim && !W.spearOut && !W.props;   // WH: into the rest as the climb starts
  if (want && !inRest && P.h.slotOf(sp) === 'back') {
    const i = P.h.blends.findIndex((x) => x.m === sp); if (i >= 0) P.h.blends.splice(i, 1);
    const k = P.h.bones.spine_03.getWorldScale(_srS).x / N.h.bones.spine_03.getWorldScale(_srS).x;
    N.h.place(sp, 'back', 0.4, { ...SPEAR_ON_SENA, s: SPEAR_ON_SENA.s * k });
    sp.userData.slot = 'rest';                       // not Aro's 'back': his draw and stow code leave it alone until it returns
  } else if (!want && inRest) {
    const i = N.h.blends.findIndex((x) => x.m === sp); if (i >= 0) N.h.blends.splice(i, 1);
    P.h.place(sp, 'back', 0.3);
  }
}
function updateTack(th) {
  const live = !!(th && th.root.visible && th.state === 'live'), on = live && !!S.tools.saddle;
  tack.g.visible = on; tack.nose.visible = on;
  if (live) {
    th.root.updateMatrixWorld(true);
    th.a.bone('Torso3').getWorldPosition(_tF); th.a.bone('Torso').getWorldPosition(_tB);
    _tF.sub(_tB).normalize();                                                    // along the back, tail to withers
    _tU.set(0, 1, 0).addScaledVector(_tF, -_tF.y).normalize();
    _tB.crossVectors(_tU, _tF);                                                  // the horse's left
    _tm.makeBasis(_tB, _tU, _tF); tack.g.quaternion.setFromRotationMatrix(_tm);
    th.a.bone('Torso2').getWorldPosition(tack.g.position);
    // WH: in first person her ridden head-up carriage put the ears right under the rider's eye and hid the neck: the
    // neck reaches forward and down a little (first person only; the third-person look keeps the proud head)
    if (P.ride === th && !P.taming && view === 'fpp') fppNeck(th);   // FPW-r3: a set carriage in every gait (the Walk clip dropped the head out of view)
  }
  spearRestTick(live);
  if (!on) { tack.reins.forEach((r) => (r.visible = false)); return; }
  // bridle: a rope noseband round the muzzle (Head bone frame, measured), the bit at its front
  const hd = th.a.bone('Head'); hd.updateWorldMatrix(true, false);
  headPt(hd, TACK_NOSE.p, tack.nose.position);
  tack.nose.quaternion.copy(_tq).multiply(TACK_NOSE.q); tack.nose.scale.setScalar(TACK_NOSE.r);
  const riding = P.ride === th && !P.taming && (P.rideW ?? 1) > 0.6;
  tack.reins.forEach((r, i) => {
    const hand = P.h.bones[i ? 'hand_r' : 'hand_l'];
    r.visible = riding && !(i ? W.aimW > 0.02 || (W.held && W.held !== 'fists' && W.st !== 'sheathed') : W.aimW > 0.02 || torchOn || W.torchW > 0.05);
    if (!r.visible) return;
    hand.localToWorld(_rA.set(i ? -0.03 : 0.03, 0.09, 0));                       // through the fist
    headPt(hd, TACK_NOSE.bit, _rB); _rB.addScaledVector(_tB, i ? -TACK_NOSE.r : TACK_NOSE.r);
    r.position.copy(_rA); r.lookAt(_rB); r.scale.set(1, 1, _rA.distanceTo(_rB));
  });
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
    const sp = S.tools.saddle ? 0.03 : 0;                                         // WH: the pad lifts the seat a little
    seatOn(P, o, 'Torso2', RIDE_SEAT.P.back, RIDE_SEAT.P.up + sp); if (!(P.tr && !P.tr.on)) P.h.pose = 'ride';
    if (P.taming) P.h.legIK = false; else if (!P.tr) { P.h.legIK = true; P.rideW = 1; }
    rideTrans(P, dt);
    if (N.ride) {
      seatOn(N, o, 'Torso2', RIDE_SEAT.N.back, RIDE_SEAT.N.up + sp); if (!(N.tr && !N.tr.on)) N.h.pose = 'ride'; N.h.straddle = true; N.pos.copy(P.pos);
      if (!N.tr) { N.h.legIK = true; N.rideW = 1; }
      rideTrans(N, dt);
    }
    if (S.horse) $('b-horse').style.width = (S.horse.stam / hMaxStam() * 100) + '%';
  }
  const th = tameHorse();
  updateTack(th); horseETick();                      // WH saddle, bridle, reins; tap/hold E on the horse
  if (th) {
    kickCool -= dt;
    const hp = th.root.position, f = th.root.rotation.y;
    for (const w of animals) {
      if (w.kind !== 'wolf' || w.state !== 'live' || kickCool > 0) continue;
      const dx = w.root.position.x - hp.x, dz = w.root.position.z - hp.z, d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * Math.sin(f) + dz * Math.cos(f)) / (d || 1) < -0.2) { th.a.play('Attack_Kick', true, 1.2); hurt(w, 3, { kind: 'kick', from: th, point: _v.set(w.root.position.x, w.root.position.y + 0.6, w.root.position.z), dir: _v2.set(dx, 0, dz).normalize() }); kickCool = 2; }   // MAT hit info
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
  Object.assign(o, { call: false, speed: 0, walk: false, timer: 10, home: horseHome(), stay: null });
  addBond(5); bump('stable_night');
}
function horseSave() {
  const o = tameHorse();
  if (!S.horse || !o) return;
  Object.assign(S.horse, { x: +o.root.position.x.toFixed(2), z: +o.root.position.z.toFixed(2), face: +o.root.rotation.y.toFixed(3), riding: !!P.ride && !P.taming, nRide: !!N.ride,
    stay: o.stay ? { x: +o.stay.x.toFixed(1), z: +o.stay.z.toFixed(1) } : null });   // WH
}
function wp4Load() {
  if (!STORY) return;
  const H = S.horse;
  if (H && !tameHorse()) {
    const home = horseHome(), x = H.x ?? home.x + 3, z = H.z ?? home.z + 3;
    const o = spawn(H.kind || 'horse', x, z, { tame: true, horse: true, home, trust: 3, stay: H.stay || (H.x != null && !H.riding ? { x, z } : null) });   // WH: where she was left
    o.root.rotation.y = o.dir = H.face ?? 0;
    H.stam = H.stam ?? 100; H.bond = H.bond ?? 0;
    if (H.riding) { mount(o); if (!H.nRide) N.ride = false; else if (!N.ride) N.ride = true; }
  }
  if (reached('herd')) spawnWildHerd();
}
function remove(o) { if (proj.m.parent === o.root) wpnDropSpear(o);   // WPN
  scene.remove(o.root); const i = animals.indexOf(o); if (i >= 0) animals.splice(i, 1);
  freeGpu(o.root); }
// SAVE-PERF: a removed animal's per-instance GPU resources are released: each SkeletonUtils clone owns its skeleton's
// bone texture and GORE clones its materials per instance. Geometry and textures from the GLTF are shared: kept.
function freeGpu(root) {
  const sk = new Set(), mats = new Set();
  root.traverse((m) => { if (m.isSkinnedMesh && m.skeleton) sk.add(m.skeleton); if (m.isSkinnedMesh || m.isMesh && m.morphTargetInfluences) for (const x of [].concat(m.material)) if (x) mats.add(x); });
  for (const s of sk) s.dispose();
  for (const x of mats) x.dispose();
}
// Live wolves that are not leaving, within r of p (rest rules, auto-draw, auto-sheathe)
function hostileNear(r, p = P.pos) { return animals.some((o) => (o.kind === 'wolf' || o.hostile) && o.state === 'live' && !o.leave && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < r)
  || foes.some((f) => f.live && !f.fled && Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < r); }   // MAT: predators (o.hostile) and raiders (foes)
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
function hurt(o, dmg, info = {}) {                  // MAT: info {kind, point, dir, from, ...} feeds the animalHit bus events
  if (o.foe) return TRIBE.hurtFoe(o, dmg, info);   // CMB raiders take their own hits (blocks, posture, surrender; GORE via foeHit)
  if (o.state !== 'live') return;
  const e = matHitPre(o, dmg, info); if (e.cancel || !(e.dmg > 0)) return; dmg = e.dmg;   // MAT: GORE zones, CMB posture
  o.hp -= dmg;
  A.hit(260, 0.2, 0.7);
  wpnKnock(o);                                       // WPN knockback, flinch, dust
  if (o.hp <= 0) {
    o.state = 'dead'; o.deadT = 0; o.a.play('Death', 'hold');
    if (o.kind === 'wolf') { bump('wolf'); toast('The wolf is dead'); }
    else if (o.kind === 'deer' || o.kind === 'stag') {
      bump('deer'); toast(`The ${o.kind} falls`);
      if (cnt('deer') === 1) say('Sena', 'You did it! We will eat well tonight. Bring the meat to the fire.');
    }
    matHitPost(e, true);                             // MAT: animalHit + animalDie
    return;
  }
  o.a.play('Idle_HitReact1', true, 1.4); o.stun = 0.45;
  if (o.kind !== 'wolf' && !o.tame) alarm(o);
  matHitPost(e, false);                              // MAT: animalHit
}
function revive(o) {
  const [x, z] = o.herd ? [o.herd.x + o.ox, o.herd.z + o.oz] : landSpot(0, 0, 50, 180, 40);
  Object.assign(o, { state: 'live', hp: HP[o.kind] * matFoeHpK(o), looted: false, speed: 0 });   // MAT foeHpK
  o.root.position.set(x, getHeight(x, z), z); o.root.visible = true; o.a.play('Idle');
  goreRevive(o);                                     // GORE: no wounds, bleeding or butcher state on the new animal
}
function step(o, speed, dt) {
  const p = o.root.position, nx = p.x + Math.sin(o.dir) * speed * dt, nz = p.z + Math.cos(o.dir) * speed * dt;
  if (getHeight(nx, nz) < 0.4 || Math.abs(nx) > LIMIT || Math.abs(nz) > LIMIT || slopeY(nx, nz) < 0.6) { o.dir += 0.9 + rand() * 0.8; o.avoid = 1; return; }
  p.x = nx; p.z = nz; collide(p, 0.4, false, !o.tame); p.y = getHeight(p.x, p.z);   // SIT-r3: wild animals never pass the home's walls
}
function wolfBrain(o, dist, dx, dz, dt) {
  const p = o.root.position;
  o.bite -= dt;
  o.attacking = Math.max(0, (o.attacking || 0) - dt);
  if (o.pending > 0 && (o.pending -= dt) <= 0 && dist < 2.7 && !busy && !(P.ride && P.speed > 6)) {   // WP4: no bite at a gallop
    if (playerHurt({ dmg: 8, kind: 'bite', from: o }).applied) { A.hit(180, 0.3, 0.9); wpnBitten(); } }   // MAT playerHurt (6 -> 8 × dmgK); WPN shake
  if (o.leave) {                                     // WH: dawn: away from Aro, back into the nearest pines
    if (o.den === undefined) o.den = pineNear(p.x, p.z);
    if (!o.avoid) o.dir = o.den && Math.hypot(o.den[0] - p.x, o.den[1] - p.z) > 6 && dist > 10 ? Math.atan2(o.den[0] - p.x, o.den[1] - p.z) : Math.atan2(dx, dz);
    if (o.den && Math.hypot(o.den[0] - p.x, o.den[1] - p.z) <= 6) o.den = [o.den[0] + dx / (dist || 1) * 30, o.den[1] + dz / (dist || 1) * 30];   // deeper in, still away from him
    if (dist > 95) remove(o); return 7;
  }
  const safe = P.swim || torchOn || !!R.inside || structs.some((s) => s.rise >= 1 && (s.kind === 'fire' && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 8
    || (s.kind === 'house' || s.kind === 'hut') && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < s.radius * 0.8));   // SIT-r3: indoors (the walls stop them; no bites through a wall)
  if (safe) {                               // fire and deep water keep them circling at a distance
    o.ang = (o.ang ?? Math.atan2(dx, dz)) + dt * 0.25;
    const tx = P.pos.x + Math.sin(o.ang) * 13, tz = P.pos.z + Math.cos(o.ang) * 13;
    if (!o.avoid) o.dir = Math.atan2(tx - p.x, tz - p.z);
    return Math.hypot(tx - p.x, tz - p.z) > 2 ? (dist < 9 ? 6 : 2.2) : 0;
  }
  o.ang = undefined;
  { const cw = cmbWolf(o, dist, dx, dz, dt); if (cw != null) return cw; }   // CMB glint, stagger, the alpha's pack
  if (!o.avoid) o.dir = Math.atan2(-dx, -dz);
  if (dist < 1.9) {
    if (o.bite <= 0 && clock > packBite) { packBite = clock + 1.1; o.bite = 2; o.pending = 0.35; o.attacking = 0.75; o.a.play('Attack', true, 1.3); }
    return 0;
  }
  return dist > 3 ? 6.8 : 3;
}
// SAVE-PERF: animal level of detail. Every animal used to be animated, skinned and drawn wherever it was (their meshes
// have frustumCulled off), shadows included. Now an animal is drawn only within 45 m or on screen within 230 m (past
// that the fog hides it). One that is not drawn animates at a low rate (the skipped time is caught up, so one-shot
// clips still end), and beyond 70 m its bone matrices are not refreshed. Brains still run every frame.
const _af = new THREE.Frustum(), _afm = new THREE.Matrix4(), _afs = new THREE.Sphere();
let afFrame = -1;
function animLodDt(o, dt) {
  if (afFrame !== frames) { afFrame = frames; _af.setFromProjectionMatrix(_afm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)); }
  const p = o.root.position, d = Math.hypot(p.x - camera.position.x, p.z - camera.position.z);
  const show = d < 45 || (d < 230 && _af.intersectsSphere(_afs.set(p, 6)));
  if (o.a.model.visible !== show) o.a.model.visible = show;
  o.root.matrixWorldAutoUpdate = show || d < 70;
  o.lodDt = (o.lodDt || 0) + dt;
  const every = show ? (d > 90 ? 2 : 1) : 8;
  if ((frames + (o.lodK ??= (Math.random() * 8) | 0)) % every) return 0;   // staggered so the far ones don't all land on one frame
  const t = o.lodDt; o.lodDt = 0; return t;
}
// SAVE-PERF: each unbutchered wolf lying in the world keeps its clone's skeleton bone textures (4 per wolf) and cloned
// materials, so their number is capped. Beyond WOLF_CORPSES the oldest go: at once when out of sight, otherwise they
// sink into the ground over CORPSE_SINK s (no pop), then remove() frees them. An alpha (the mantle pelt) is kept 2 min
// longer than its pack, a kill under 30 s old stays while in view, and the one being butchered is never taken.
const WOLF_CORPSES = 6, CORPSE_SINK = 2.5;
let corpseCapT = 0;
function wolfCorpseCap(dt) {
  if ((corpseCapT += dt) < 1) return; corpseCapT = 0;
  const c = animals.filter((o) => o.kind === 'wolf' && o.state === 'dead' && !o.looted && o.sinkT == null && GS.butch?.o !== o);
  if (c.length <= WOLF_CORPSES) return;
  const age = (o) => o.deadT - (o.alpha ? 120 : 0);   // an alpha counts as 2 min younger
  c.sort((a, b) => age(b) - age(a));                 // oldest first
  for (let i = 0, n = c.length - WOLF_CORPSES; i < c.length && n > 0; i++) {
    const o = c[i]; if (!o.a.model.visible) { remove(o); n--; } else if (o.deadT > 30) { o.sinkT = 0; n--; }   // a fresh kill in view stays
  }
}
function corpseSink(o, dt) {
  if (GS.butch?.o === o) { o.sinkT = null; return; }   // (butchering began in the last second: it stays)
  o.sinkT += dt; o.root.position.y -= dt * 0.4;
  if (o.sinkT >= CORPSE_SINK) remove(o);
}
function updateAnimal(o, dt) {
  const p = o.root.position;
  if (o === P.ride) { if (!o.a.model.visible) o.a.model.visible = true; o.root.matrixWorldAutoUpdate = true; o.lodDt = 0; o.a.update(dt); return; }     // WP4: the ridden horse is moved by updateRide
  { const ad = animLodDt(o, dt * hsK(o)); if (ad > 0 && !(o.state === 'dead' && o.deadT > 6)) o.a.update(ad); } wpnAnimalFx(o, dt);   // WPN hitstop, knockback, flinch · SAVE-PERF animal LOD · WH: a settled corpse's mixer stops
  if (o.state === 'dead') {
    o.deadT += dt; if (o.looted && clock > o.respawn) revive(o);
    else if (o.sinkT != null) corpseSink(o, dt);   // SAVE-PERF: over the corpse cap, sinking away
    else if (o.kind === 'wolf' && !o.looted) {      // WH: unbutchered wolves go (and free their GPU clones) once out of sight, 15 min at most
      const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
      if ((o.deadT > 300 && d > 60 && !o.a.model.visible) || (o.deadT > 900 && d > 25)) remove(o);
    }
    return;
  }
  if ((o.kind === 'wolf' || o.hostile) && !o.tame && !o.horse && predKidGuard(o, dt)) return;   // GORE-FIX GUARDRAIL: predators never close on a child
  if (o.brain) { o.brain(o, dt); return; }           // CMB predators (bear, aurochs) own their movement and clips
  if (o.stun > 0) { o.stun -= dt; return; }
  o.avoid = Math.max(0, o.avoid - dt);
  const dx = p.x - P.pos.x, dz = p.z - P.pos.z, dist = Math.hypot(dx, dz);
  if (o.wounded && goreBrain(o, dist, dx, dz, dt)) return;   // GORE: wounded prey flee, bed down, bleed out (trail)
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
        const an = o.tame ? horseAnchor(o, dist) : o.home, ar = an === o.stay ? 6 : 16;   // WH: a tame horse grazes where she was left
        if (an && Math.hypot(p.x - an.x, p.z - an.z) > ar) { o.dir = Math.atan2(an.x - p.x, an.z - p.z); o.walk = true; }
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
// WH: wolves live in the pine forest. A pack comes out of the trees: of 12 bearings, the one whose spawn point and the
// line in toward Aro cross the most pine wins (a little randomness among near-equal ones); none on the ring sends them
// from the side the nearest woods lie (random only with no woods within 200 m). pineNear() is where a leaving wolf heads at dawn.
// The 'pine' biome itself is rare (forest noise > 0.55); the pine woods the trees grow in start well below that.
const pineWoods = (x, z) => Math.abs(x) < LIMIT && Math.abs(z) < LIMIT && (forest(x, z) > 0.2 || biomeAt(x, z) === 'pine') && biomeAt(x, z) !== 'meadow' && biomeAt(x, z) !== 'lake';
function wolfBearing(cx, cz, r) {
  let best = rand() * 6.283, bs = 0, pine = false;
  const a0 = rand() * 6.283;
  for (let i = 0; i < 12; i++) {
    const a = a0 + i * 0.5236, sx = Math.sin(a), sz = Math.cos(a);
    let sc = 0;
    for (const [k, wt] of [[1, 3], [0.85, 1.5], [1.2, 1.5], [0.65, 1], [0.45, 0.5]]) {
      const x = cx + sx * r * k, z = cz + sz * r * k;
      if (pineWoods(x, z)) sc += wt;
    }
    if (sc > 0) pine = true;
    sc += rand() * 0.4;
    if (sc > bs) { bs = sc; best = a; }
  }
  if (!pine) { const pn = pineNear(cx, cz, 200); if (pn) best = Math.atan2(pn[0] - cx, pn[1] - cz) + (rand() - 0.5) * 0.7; }   // no pines on the ring: from the side the nearest forest lies
  return best;
}
// WH: where the pack starts: along bearing a, the first point in the pines 46-110 m out (so they come out of the trees,
// not out of the open meadow); failing that, the nearest woods themselves when within 130 m; else 46 m out on the bearing.
function wolfDen(cx, cz, a) {
  for (let r = 46; r <= 110; r += 8) { const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r; if (pineWoods(x, z)) return [x, z]; }
  // RIDE-r3: the nearest woods 46-130 m out, tested at the spot itself (clamping a nearer pine out to 46 m on its
  // bearing left the den in the open meadow); then any woods within 200 m, even nearer than 46 m
  const pn = pineNear(cx, cz, 130, 46) || pineNear(cx, cz, 200);
  if (pn) return pn;
  return [cx + Math.sin(a) * 46, cz + Math.cos(a) * 46];
}
// RIDE-r3: a wolf's start spot: on land inside the pines near the den (random tries, then a ring search out to 30 m),
// else the den itself when it is woods; open ground only when there are no woods anywhere near.
function wolfSpot(cx, cz) {
  const ok = (x, z) => pineWoods(x, z) && getHeight(x, z) > 1.6 && slopeY(x, z) > 0.85;
  for (let t = 0; t < 16; t++) { const [x, z] = landSpot(cx, cz, 0, t < 10 ? 12 : 6); if (ok(x, z)) return [x, z]; }
  for (let r = 3; r <= 30; r += 3) for (let i = 0; i < 12; i++) {
    const b = i * 0.5236 + r, x = cx + Math.sin(b) * r, z = cz + Math.cos(b) * r;
    if (ok(x, z)) return [x, z];
  }
  return pineWoods(cx, cz) ? [cx, cz] : landSpot(cx, cz, 0, 12);
}
function pineNear(x, z, max = 120, min = 20) {    // RIDE-r3: min (the den's 46 m floor)
  for (let r = min; r <= max; r += min > 20 ? 8 : 20) for (let i = 0; i < 10; i++) {
    const a = i * 0.628 + r * 0.1, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (pineWoods(px, pz) && getHeight(px, pz) > 1.6) return [px, pz];   // RIDE-r3: on land
  }
  return null;
}
const EVENTS = {
  storm() {
    EV.storm = 75 + rand() * 45;
    // STORY: sheltered (resting, in the hut, house or a cave) gets a calmer line than the "get inside" warning
    const roof = R.on || !!R.inside || world.env.cave > 0.5 || structs.some((s) => s.rise >= 1 && (s.kind === 'hut' || s.kind === 'house') && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < s.radius + 1.5);
    if (roof) { banner('Storm', 'Rain sweeps the valley. Good thing you are under a roof.'); say('Sena', world.env.cave > 0.5 ? 'Listen to it out there. The stone keeps us dry.' : 'Rain again. Good thing we have a roof.'); return; }
    // SIT-r4: just outside a hut or the house (the hut's morning hand-back leaves him 4-5 m out of its door): the roof is
    // a few steps away, so she points him back to it instead of warning that they are caught out in the open
    const near = structs.some((s) => s.rise >= 1 && (s.kind === 'hut' || s.kind === 'house') && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < s.radius + 7);
    if (near) { banner('Storm', 'Rain sweeps the valley. Your roof is a few steps away.'); say('Sena', 'The sky is turning. Back under the roof until it passes.'); return; }
    banner('Storm', 'Rain sweeps the valley. Get under a roof or stay by the fire.');
    say('Sena', 'The sky is turning. We should not be out in this.');
  },
  wolves() {
    const n = MATD.packSize(D(), reached('house')), a = wolfBearing(P.pos.x, P.pos.z, 46);   // MAT: pack size by difficulty (+1 after the house); WH: out of the pines
    const [cx, cz] = wolfDen(P.pos.x, P.pos.z, a);
    for (let i = 0; i < n; i++) {                    // WH: each wolf on land inside the trees (a few tries), else beside the pack
      const [x, z] = wolfSpot(cx, cz);              // RIDE-r3: never the open meadow while woods are near
      spawn('wolf', x, z);
    }
    PRED.pack(animals.slice(-n));                    // CMB: an alpha leads the pack after the house (always on Hardcore)
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
  rain.visible = E.storm > 0.02 && !(E.cave > 0.3) && !arcSnow();   // WP3: no rain inside a cave; ARC: winter storms fall as snow
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
  EV.next -= dt * survScent();                       // SURV: blood on the wind at night, the wolves find you twice as fast
  if (EV.next > 0 || busy) return;
  if (arcCalm()) { EV.next = 15 + rand() * 20; return; }   // ARC-FIX: no pack, herd or storm banner over a story or romance scene (nor just after)
  if (clock - R.wokeAt < 45) { EV.next = 45 - (clock - R.wokeAt) + rand() * 20; return; }   // SIT-r4: no storm or pack in the first moments after waking (the night's clock ran out behind the rest)
  EV.next = 160 + rand() * 130;
  if (!reached('fire')) return;
  if (E.night > 0.6) { if (reached('hunt') && !wolves.length) EVENTS.wolves(); else if (EV.storm <= 0) EVENTS.storm(); }
  else if (rand() < 0.45 && EV.storm <= 0) EVENTS.storm();
  else EVENTS.herd();
}

// ---------- melee ----------
let hitT = 0, hitDmg = 0, punchSide = 0, hitReach = 1.2, hitCone = 0.2, hitKind = 'fists';
function attack() { wpnPrimary(); }                 // WPN: the left click, by weapon (kept as G.attack)
function landHit() {
  const fx = Math.sin(P.face), fz = Math.cos(P.face);
  let best = null, bd = hitReach;                    // WPN: reach and cone come from the weapon
  for (const o of animals) {
    if (o.state !== 'live' || o.horse) continue;     // WP4: no punching horses
    if (Math.hypot(o.root.position.x - P.pos.x, o.root.position.z - P.pos.z) > 7) continue;
    const d = goreMeleeD(o, fx, fz, hitCone);        // GORE-FIX: reach to the body's near surface (an aurochs' flank, not its centre)
    if (d < bd) { bd = d; best = o; }
  }
  best = cmbFoeInReach(best, bd, fx, fz);           // CMB raiders in reach
  if (best) wpnHitFx(best, hitDmg, hitKind);
  else goreCorpseHit(fx, fz);                        // GORE: striking a corpse: a small burst and a flinch
}

// ---------- WPN weapons ----------
// Assassin's Creed-style carry. Weapons live in body sockets when not in use (spear diagonal on the back, axe on
// the left hip, unlit torch on the right hip). They are drawn into the hand with a short reach (and a closed fist),
// and put themselves away after combat, near home, or when Aro sits, rides, swims, builds or sleeps.
// Spear: hold right mouse to aim (over-the-shoulder zoom, charge, arc), release to throw; it stays where it lands.
const W = { sel: 'fists', last: 'fists', st: 'sheathed', t: 0, T: 1, idleT: 0, sprintT: 0, homeT: 0, queued: null, aim: null, spearOut: false, spearLeftT: 0,
  held: null, moved: true, stW: 0, torchW: 0, lhW: 0, aimW: 0, camK: 0, punch: 0, lunge: 0, manualT: 0, qDown: 0, qFired: false, rmb: false, relEarly: false,
  returnedOvernight: false, ownKey: '', props: false, sw: null, pend: null, wasRide: false, vmDraw: 0, guard: 0 };
let hitStop = 0, hsWho = null, trauma = 0;
const hsK = (who) => (hitStop > 0 && (who === P || who === hsWho) ? 0.05 : 1);
const hasAxe = () => !!(S.tools.axe || S.tools.flintaxe);
const hasSpear = () => !!(S.tools.spear || S.tools.flintspear);
const owns = (k) => k === 'fists' || (k === 'axe' ? hasAxe() : k === 'spear' && hasSpear());
const wMesh = (k) => (k === 'axe' ? P.h.axe : k === 'spear' ? P.h.spear : null);
const SHEATH = { axe: 'hipL', spear: 'back' };
const T_DRAW = { axe: 0.32, spear: 0.38, fists: 0.15 };
const WNAME = { fists: 'Fists', axe: 'Axe', spear: 'Spear' };
const camFace = () => camYaw + Math.PI;                         // the heading the camera looks along
const wrapA = (a) => ((a + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI;
const wBusy = () => P.work > 0 || menuOpen || !!placing || P.dance > 0 || !!P.taming || busy || P.sit > 0 || P.rest > 0;
const nearHome = () => structs.some((s) => (s.kind === 'house' || s.kind === 'fire') && s.rise >= 1 && !s.village && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 25);
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _w4 = new THREE.Vector3(), _w5 = new THREE.Vector3();
const _wq = new THREE.Quaternion(), _wq2 = new THREE.Quaternion(), _we = new THREE.Euler(), _wm = new THREE.Matrix4(), _UP = new THREE.Vector3(0, 1, 0);

// Poses sampled once: the Sword_Idle ready stance (right arm + chest), a fists guard, the raised torch arm.
const WPOSE = { ready: samplePose(P.h, 'ready', 0), guard: samplePose(P.h, 'jab', 0), torch: samplePose(P.h, 'torchHold', 0, BONESETS.armL) };
const WTILT = { axe: 0.55, spear: 0.25 };            // wrist tilt in the ready stance (radians about the palm normal)
const READY_BONES = (b) => BONESETS.armR(b) || b === 'spine_02' || b === 'spine_03';
const GUARD_BONES = (b) => BONESETS.armR(b) || BONESETS.armL(b);
// Female grip centres sit a little closer to the wrist (smaller hands); her spear rides behind the basket.
N.h.fitAdj = { spear: { hand: { p: [-0.029, 0.161, 0.34], r: [-0.243, 0, 0], s: 1 }, back: { p: [-0.132, 0.101, -0.384], r: [-1.832, -0.376, 0.218], s: 0.84 } },
  torch: { handL: { p: [0.032, 0.081, -0.019], r: [-0.243, 0.01, 0], s: 1 } } };
// WH: Aro's spear lies flatter across his back in the saddle (on foot's steep carry stood up past his head like a pole
// from the side) and along his spine while swimming (it stuck up out of the water). wpnBackFit swaps the variant in.
const SPEAR_BACK = { ride: { p: [-0.09, 0.17, -0.2], r: [-1.777, -0.748, 0.219], s: 0.92 }, swim: { p: [-0.05, -0.35, -0.19], r: [1.744, -0.1, 0], s: 0.92 } };
// In the saddle the hip axe hangs straight down the horse's flank (its on-foot carry angles back into Sena's knee).
const AXE_RIDE = { p: [0.155, 0.048, -0.08], r: [1.493, 0.326, -0.26], s: 0.95 };
const AXE_SWIM = { p: [0.15, 0.048, -0.02], r: [1.45, 0.15, -0.26], s: 0.95 };   // swimming: along the thigh toward the feet, head tipped to the belly side (under water)
P.h.fitAdj = { spear: {}, axe: {} };
// WH: the sprint's forward lean and a seated body's lean back both stood the diagonal carry up into a pole above the
// head: those use the flatter 'lean' carry (sprint with a little hysteresis so it does not flicker at the threshold).
SPEAR_BACK.lean = { p: [-0.09, 0.18, -0.21], r: [-1.72, -0.9, 0.219], s: 0.92 };
const seatedPose = (h) => h.pose === 'sit' || h.pose === 'sitTalk';
function wpnBackFit() {
  const run = !P.air && !P.sneak && P.speed > (W.backFit === 'lean' ? 4.6 : 5.6);
  // RIDE-r4: two-up (and while Sena is on her way to climb on, or as the two of them get down) the spear is on its way
  // to or from her back (spearRestTick): it travels between the two diagonals, his seated 'lean' carry and her rest,
  // instead of standing up into the saddle pole first (the dismount showed it fly to him and stand vertical).
  const twoUp = P.ride && (N.ride || N.board);
  const k = P.swim ? 'swim' : P.ride && !twoUp ? 'ride' : run || twoUp || P.sit > 0 || seatedPose(P.h) ? 'lean' : '';
  const ka = P.swim ? 'swim' : P.ride ? 'ride' : '';  // the axe keeps the saddle carry two-up too (on foot's angles back into Sena's knee)
  if (k === (W.backFit || '') && ka === (W.axeFit || '')) return;
  const bl = k === 'ride' ? 0.2 : 0.35;              // the mount climb is short: the saddle carry comes in quickly
  if (k !== (W.backFit || '')) {
    W.backFit = k;
    if (k) P.h.fitAdj.spear.back = SPEAR_BACK[k]; else delete P.h.fitAdj.spear.back;
    if (P.h.slotOf(P.h.spear) === 'back') P.h.place(P.h.spear, 'back', bl);
  }
  if (ka !== (W.axeFit || '')) {
    W.axeFit = ka;
    if (ka) P.h.fitAdj.axe.hipL = ka === 'ride' ? AXE_RIDE : AXE_SWIM; else delete P.h.fitAdj.axe.hipL;
    if (P.h.slotOf(P.h.axe) === 'hipL') P.h.place(P.h.axe, 'hipL', ka === 'ride' ? 0.2 : 0.35);
  }
}
const senaBasket = makeCarryBasket(); senaBasket.userData.kind = 'basket'; senaBasket.visible = false;
N.h.place(senaBasket, 'back'); N.h.place(N.h.spear, 'back');
P.h.useGrip(); N.h.useGrip();
// RIDE-r4: the sprint clip swings spine_03 (the back socket's bone) through a wide arc every stride, so the sheathed
// spear waggled between lying across the shoulders (tip past his head) and standing up (top 0.16-0.86 m over the head).
// At a run its world orientation follows a smoothed copy of the socket's, kept in Aro's own yaw frame so turns are not
// lagged: the stride's swing is filtered out, the body's lean is kept. Order 45: after the stance, grip and IK passes.
const STEADY = { tau: 0.55, v0: 3.0, v1: 5.2, back: 0.3 };   // back: the sprint's forward lean also tipped it ahead of his head: tilted back (rad, in his frame)
const _ssR = new THREE.Quaternion(), _ssS = new THREE.Quaternion(), _ssT = new THREE.Quaternion(), _ssB = new THREE.Quaternion(), _ssX = new THREE.Vector3(1, 0, 0);
const SS = { q: null, base: new THREE.Quaternion(), out: new THREE.Quaternion(), wrote: false };
P.h.addOverride('spearSteady', 45, (h, dt) => {
  const sp = h.spear, sk = h.sock.back;
  if (SS.wrote && sp.quaternion.equals(SS.out)) sp.quaternion.copy(SS.base);   // undo last frame's correction (nothing re-placed it since)
  SS.wrote = false;
  if (sp.parent !== sk || sp.userData.slot !== 'back' || h.blends.some((b) => b.m === sp)) { SS.q = null; return; }
  sk.updateWorldMatrix(true, false);
  h.root.getWorldQuaternion(_ssR); sk.getWorldQuaternion(_ssS);
  const loc = _ssT.copy(_ssR).invert().multiply(_ssS);                       // the socket in Aro's own frame
  if (!SS.q) SS.q = loc.clone(); else SS.q.slerp(loc, 1 - Math.exp(-(dt || 0) / STEADY.tau));
  const w = P.ride || P.swim || P.air || P.sit > 0 ? 0 : smooth01((P.speed - STEADY.v0) / (STEADY.v1 - STEADY.v0));
  if (!(w > 0.001)) return;
  SS.base.copy(sp.quaternion);
  _ssB.setFromAxisAngle(_ssX, -STEADY.back);
  _ssT.copy(_ssS).invert().multiply(_ssR).multiply(_ssB).multiply(SS.q).multiply(SS.base);   // the fit under the steadied socket, in the live socket
  sp.quaternion.slerp(_ssT, w); SS.out.copy(sp.quaternion); SS.wrote = true;
});

// World point of mesh-local (0, 0, z) if `kind` sat in `slot` (draw targets: where the hand grabs it).
function slotPoint(h, kind, slot, z, out) {
  const f = h.fitAdj?.[kind]?.[slot] || FIT[kind][slot];
  out.set(0, 0, z * (f.s ?? 1)).applyEuler(_we.set(f.r[0], f.r[1], f.r[2])).add(_w5.set(f.p[0], f.p[1], f.p[2]));
  return h.sock[slot === 'low' ? 'hand' : slot].localToWorld(out);
}
// Turn a bone about the world up axis by a radians (spine twists).
const _wq3 = new THREE.Quaternion();
function yawBone(b, a) {
  if (!a) return;
  b.parent.getWorldQuaternion(_wq); _wq2.setFromAxisAngle(_UP, a);
  b.quaternion.premultiply(_wq3.copy(_wq).invert().multiply(_wq2).multiply(_wq));
  b.updateWorldMatrix(false, true);
}

// ----- overrides on Aro (stance 15, fingers 20 via useGrip, IK 30, reach 40)
P.h.addOverride('wpnStance', 15, (h) => {
  const k = 1 - h.shotW();                          // a swing owns the arms while it plays
  if (W.stW > 0.002 && W.held !== 'spear') {
    applyPose(h, W.held === 'fists' ? WPOSE.guard : WPOSE.ready, W.stW * k, W.held === 'fists' ? GUARD_BONES : READY_BONES);
    const tl = WTILT[W.held]; if (tl) h.bones.hand_r.rotateX(tl * W.stW * k);   // cock the wrist: axe head up
  }
  if (W.torchW > 0.002) applyPose(h, WPOSE.torch, W.torchW * (W.held === 'fists' ? 1 - W.stW : 1), BONESETS.armL);
});
P.h.addOverride('wpnIK', 30, (h) => {
  const sp = h.spear;
  h.bones.spine_02.updateWorldMatrix(false, true);    // the stance moved the chest and arms: refresh before reading them
  if (W.held === 'spear' && sp.parent === h.sock.hand && sp.userData.slot === 'hand' && !h.blends.some((b) => b.m === sp)) {
    if (W.lhW > 0.002 && W.aimW < 0.99) spearStance(h, W.lhW * (1 - W.aimW));
    if (W.aimW > 0.002) wpnAimPose(h, W.aimW);
  }
});
// Two-handed spear stance, built procedurally: chest bladed, right fist at the hip, the shaft forward and a little
// across and up, the left fist further up the shaft. Thumbs toward the point. A thrust drives the right fist forward
// and turns the chest into it while the left hand slides on the shaft.
const SPR_R = new THREE.Vector3(-0.17, 1.0, 0.1), SPR_D = new THREE.Vector3(0.13, 0.2, 1).normalize();
const GRIP_R = new THREE.Vector3(-0.034, 0.098, 0), GRIP_L = new THREE.Vector3(0.036, 0.105, 0);
const AX_R = new THREE.Vector3(0, 0.24, 0.97).normalize(), AX_L = new THREE.Vector3(0.01, 0.24, 0.97).normalize();
const _sd = new THREE.Vector3(), _sg = new THREE.Vector3(), _st = new THREE.Vector3(), _sr = new THREE.Vector3(), _sp = new THREE.Vector3();
function alignGrip(hand, axisLocal, dirW, w) {        // turn the fist so its grip axis runs along dirW
  hand.getWorldQuaternion(_wq); _w4.copy(axisLocal).applyQuaternion(_wq);
  _wq2.setFromUnitVectors(_w4, dirW); _wq3.copy(_wq2).multiply(_wq);
  hand.parent.getWorldQuaternion(_wq2); _wq2.invert().multiply(_wq3);
  hand.quaternion.slerp(_wq2, w); hand.updateWorldMatrix(false, true);
}
function ikGrip(h, side, gripW, pole, w, gripLocal, axisLocal, dirW) {   // the fist (not the wrist) onto gripW
  const hand = h.bones['hand_' + side];
  ik2(h, side, gripW, pole, w); alignGrip(hand, axisLocal, dirW, w);
  hand.localToWorld(_sg.copy(gripLocal)); hand.getWorldPosition(_sr);
  _st.copy(gripW).sub(_sg).add(_sr);                  // where the wrist must go so the fist lands on the target
  ik2(h, side, _st, pole, w); alignGrip(hand, axisLocal, dirW, w);
}
function spearStance(h, w) {
  const root = h.root, lun = W.lunge > 0 ? Math.sin(Math.PI * (1 - W.lunge / 0.3)) : 0;
  yawBone(h.bones.spine_02, (-0.3 + 0.38 * lun) * w);
  _sd.copy(SPR_D).transformDirection(root.matrixWorld);
  root.localToWorld(_sp.set(SPR_R.x + 0.06 * lun, SPR_R.y + 0.08 * lun, SPR_R.z + 0.36 * lun));
  ikGrip(h, 'r', _sp, root.localToWorld(_w2.set(-0.75, 0.85, -0.35)), w, GRIP_R, AX_R, _sd);
  // the shaft: through the right fist along the stance direction (blended with the plain hand fit)
  const sp = h.spear, fh = FIT.spear.hand;
  _wm.lookAt(_sd, _w5.set(0, 0, 0), _UP); _wq.setFromRotationMatrix(_wm);
  h.sock.hand.getWorldQuaternion(_wq2); _wq2.invert().multiply(_wq);
  _wq.setFromEuler(_we.set(fh.r[0], fh.r[1], fh.r[2])).slerp(_wq2, w);
  sp.quaternion.copy(_wq); sp.position.copy(GRIP_R).add(_w1.set(0, 0, 0.35).applyQuaternion(_wq));
  _w3.set(fh.p[0], fh.p[1], fh.p[2]); sp.position.lerpVectors(_w3, sp.position, w); sp.scale.setScalar(1);
  sp.updateMatrixWorld(true);
  // left fist 0.42 m up the shaft
  sp.localToWorld(_sp.set(0, 0, -0.35 + 0.42 - 0.3 * lun)); _w4.set(0, 0, 1).transformDirection(sp.matrixWorld); _sd.copy(_w4);
  ikGrip(h, 'l', _sp, root.localToWorld(_w2.set(0.75, 0.6, 0.05)), w, GRIP_L, AX_L, _sd);
}
P.h.addOverride('wpnReach', 40, (h) => {
  if (W.st !== 'drawing' && W.st !== 'sheathing') return;
  const k = W.held;
  if (!k || k === 'fists') return;
  const e = Math.sin(Math.PI * Math.min(1, W.t / W.T));
  if (k === 'spear') {                                // up and back over the right shoulder
    yawBone(h.bones.spine_02, -0.18 * e);
    slotPoint(h, 'spear', 'back', 0.4, _w1); _w1.y += 0.05;
    h.root.localToWorld(_w2.set(-0.7, 1.0, -0.5));
    ik2(h, 'r', _w1, _w2, e);
  } else {                                            // across the body to the left hip
    yawBone(h.bones.spine_02, 0.25 * e);
    slotPoint(h, 'axe', 'hipL', -0.04, _w1);
    h.root.localToWorld(_w2.set(-0.8, 1.0, 0.3));
    ik2(h, 'r', _w1, _w2, e);
  }
});
// Aim: spear raised over the right shoulder along the aim, left arm pointing, chest wound up (or twisted in the saddle).
const aimDir = new THREE.Vector3(0, 0, 1);
function wpnAimPose(h, k) {
  const ride = !!P.ride;
  let f = P.face;
  if (ride) {                                         // horse heading stays; the rider twists toward the camera
    const tw = THREE.MathUtils.clamp(wrapA(camFace() - P.face), -1.7, 1.7) * k;
    for (const b of ['spine_01', 'spine_02', 'spine_03']) yawBone(h.bones[b], tw / 3);
    f += tw;
  } else yawBone(h.bones.spine_02, -0.2 * k);
  const fx = Math.sin(f), fz = Math.cos(f), rx = -fz, rz = fx;                 // forward, right (heading frame)
  const ch = W.aim ? W.aim.charge : 0;
  h.bones.upperarm_r.getWorldPosition(_w1);
  _w1.x += rx * 0.1 - fx * 0.22; _w1.z += rz * 0.1 - fz * 0.22; _w1.y += 0.16;
  _w1.addScaledVector(aimDir, -0.08 * ch);
  _w2.copy(_w1); _w2.x += rx * 0.5 - fx * 0.1; _w2.z += rz * 0.5 - fz * 0.1; _w2.y -= 0.35;
  ik2(h, 'r', _w1, _w2, k);
  h.bones.upperarm_l.getWorldPosition(_w3);           // the left arm points down the throw line
  _w4.set(aimDir.x, 0, aimDir.z).normalize();
  _w3.addScaledVector(_w4, 0.52).addScaledVector(_w5.set(rx, 0, rz), 0.06); _w3.y += 0.08 + aimDir.y * 0.4;
  _w4.copy(_w3); _w4.y -= 0.6; _w4.x -= rx * 0.25; _w4.z -= rz * 0.25;
  ik2(h, 'l', _w3, _w4, k);
  // spear along the aim, gripped at the same point of the fist
  const sp = h.spear;
  if (sp.parent !== h.sock.hand) return;
  h.bones.hand_r.updateWorldMatrix(false, true);
  _wm.lookAt(aimDir, _w5.set(0, 0, 0), _UP); _wq.setFromRotationMatrix(_wm);
  h.sock.hand.getWorldQuaternion(_wq2); _wq2.invert().multiply(_wq);
  _wq.copy(sp.quaternion).slerp(_wq2, k);              // from wherever it was (stance or plain grip)
  _w3.copy(GRIP_R).add(_w1.set(0, 0, 0.35).applyQuaternion(_wq));
  sp.quaternion.copy(_wq); sp.position.lerp(_w3, k); sp.scale.setScalar(1);
  sp.updateMatrixWorld(true);
}

// ----- state machine
function wpnDraw(fast = false) {
  if (W.st === 'drawn' || W.st === 'drawing') return;
  if (!owns(W.sel) || (W.sel === 'spear' && W.spearOut)) W.sel = 'fists';
  const T = T_DRAW[W.sel] * (fast || W.queued ? 0.65 : 1);
  if (W.st === 'sheathing' && W.held === W.sel) { const u = W.t / W.T; W.st = 'drawing'; W.T = T; W.t = (1 - u) * T; W.moved = u < 0.55; wpnHud(); return; }   // reverse mid-way
  if (W.st === 'sheathing') wpnSnapAway();
  W.held = W.sel; W.st = 'drawing'; W.t = 0; W.T = T; W.moved = W.sel === 'fists';
  W.idleT = W.homeT = W.sprintT = 0;
  if (W.sel !== 'fists') A.hit(650 + rand() * 250, 0.14, 0.12);
  wpnHud();
}
function wpnSheathe(mul = 1) {
  if (W.st === 'sheathed' || W.st === 'sheathing') return;
  if (W.aim) wpnCancelAim();
  if (W.st === 'drawing' && !W.moved) { W.st = 'sheathed'; W.held = null; wpnHud(); wpnAfterSheathe(); return; }   // not grabbed yet
  W.st = 'sheathing'; W.t = 0; W.T = T_DRAW[W.held] / mul; W.moved = W.held === 'fists';
  if (W.held !== 'fists') A.hit(500 + rand() * 200, 0.12, 0.09);
  wpnHud();
}
function wpnSnapAway() {                             // put whatever is in the hand straight into its socket
  const m = wMesh(W.held);
  if (m && W.held !== 'fists') P.h.place(m, SHEATH[W.held]);
  W.st = 'sheathed'; W.held = null; W.moved = true;
}
function wpnAfterSheathe() {
  const q = W.queued; W.queued = null;
  if (typeof q === 'string' && q.startsWith('switch:')) { W.sel = q.slice(7); wpnDraw(); }
}
function wpnRun(q) {
  if (!q) return;
  if (q === 'attack') wpnPrimary();
  else if (q === 'aim') {
    if (W.held !== 'spear') return;
    if (W.relEarly || !W.rmb) { W.aim = { t: 0.21, charge: 0.35 }; wpnRelease(); }   // a quick click-throw
    else W.aim = { t: 0, charge: 0 };
  } else if (q.k === 'chop') q.fn();
}
function wpnToggle(manual = false) {
  if (W.st === 'drawn' || W.st === 'drawing') { wpnSheathe(); if (manual) W.manualT = 8; }
  else if (!P.ride && !P.swim && !wBusy()) wpnDraw();
}
function wpnSelect(k) {
  bowOff();                                          // BOW: another weapon puts the bow away
  if (!owns(k)) { toast(k === 'axe' ? 'You have no axe yet' : 'You have no spear yet'); return; }
  if (k === 'spear' && W.spearOut) { toast('Your spear is lying where it landed (see the map)'); return; }
  if (W.aim) wpnCancelAim();
  const canDraw = !P.ride && !P.swim && !wBusy();
  if (k === W.sel) { if (W.st === 'sheathed' && canDraw) wpnDraw(); return; }
  W.last = W.sel;
  if ((W.st === 'drawn' || W.st === 'drawing') && !P.ride) { W.queued = 'switch:' + k; wpnSheathe(1.6); if (W.st === 'sheathed') wpnAfterSheathe(); }
  else { W.sel = k; if (W.st === 'sheathed' && canDraw) wpnDraw(); }   // WH: from sheathed one press selects and draws (select only in the saddle, the water or busy)
  A.hit(1800, 0.03, 0.04);
  wpnHud();
}
// RST and context hooks: cancel the aim, then put everything away (animated unless instant or not visible).
function wpnStowAll(reason = 'busy', instant = false) {
  if (W.aim) wpnCancelAim();
  if (typeof W.queued !== 'string' || !W.queued.startsWith('switch:')) W.queued = null;
  if (W.st === 'sheathed') return;
  if (instant || P.swim) { wpnSnapAway(); W.queued = null; W.stW = 0; W.lhW = 0; wpnHud(); return; }
  W.queued = null; wpnSheathe(reason === 'ride' ? 1.3 : 1);
}

// ----- left click by weapon
function wpnPrimary() {
  if (W.aim) { wpnCancelAim(); return; }
  if (P.cool > 0 || busy || P.swim || P.sit > 0 || P.ride) return;   // WP4: no melee from the saddle
  if (W.st !== 'drawn') {                             // the first click draws and swings in one motion
    W.queued = 'attack';
    if (W.st === 'sheathed' || W.st === 'sheathing') wpnDraw(true);
    return;
  }
  camera.getWorldDirection(_w1); P.wantFace = Math.atan2(_w1.x, _w1.z);
  W.idleT = W.homeT = 0;
  const k = W.held;
  if (cmbSwing(k)) return;                           // CMB combos, heavy, stamina, damage table
  if (k === 'axe') { P.h.swing('strikeU', 1.5); P.cool = 0.75; hitT = 0.3; hitDmg = S.tools.flintaxe ? 6 : 4; hitReach = 1.2; hitCone = 0.2; }
  else if (k === 'spear') { P.h.swing('jabU', 1.3); W.lunge = 0.3; P.cool = 0.6; hitT = 0.22; hitDmg = S.tools.flintspear ? 5 : 3; hitReach = 2.1; hitCone = 0.35; }
  else { P.h.swing((punchSide ^= 1) ? 'jabU' : 'crossU'); P.cool = 0.48; hitT = 0.2; hitDmg = 2; hitReach = 0.9; hitCone = 0.2; }
  hitKind = k; W.sw = { k: k === 'fists' ? (punchSide ? 'jab' : 'cross') : k, t: 0, dur: P.cool };
  A.hit((700 + rand() * 300) * (0.9 + rand() * 0.2), 0.12, 0.07);   // whoosh
}
// Hit feedback: hitstop, trauma shake, knockback (wpnKnock via hurt), dust, sounds. A whiff is only the whoosh.
function wpnHitFx(o, dmg, kind, info) {
  const wasLive = o.state === 'live';
  hurt(o, dmg, info || matHitInfo(o, kind));         // MAT: hit point, attacker forward, weapon kind
  const kill = wasLive && o.state === 'dead', r = 0.9 + rand() * 0.2;
  hitStop = W.hsLast = kill ? 0.12 : kind === 'fists' ? 0.045 : kind === 'thrown' ? 0.06 : 0.07; hsWho = o;
  trauma = W.trLast = Math.min(1, trauma + (kill ? 0.7 : kind === 'fists' ? 0.25 : kind === 'thrown' ? 0.2 : 0.4));
  A.hit(170 * r, 0.16, 0.45); A.hit(1300 * r, 0.04, 0.2);
  if (kill) A.tone(110, 0.3, 0.08);
  W.idleT = 0; W.recoil = 0.12;
}
function wpnKnock(o, from = P.pos) {                 // hurt(): knockback, a flinch and a dust puff (GORE: blood comes from the animalHit listener)
  if (o.bleedOut) return;                            // GORE: a bleed-out death is not a blow
  const p = o.root.position, dx = p.x - from.x, dz = p.z - from.z, d = Math.hypot(dx, dz) || 1;
  o.kb = { x: (dx / d) * 2.2, z: (dz / d) * 2.2, t: 0.25 }; o.flinch = 0.3;
  if (settings.blood === 'off') wpnPuff(p.x - (dx / d) * 0.3, p.y + 0.9, p.z - (dz / d) * 0.3, 0x8a7458);   // GORE: dust only when Blood is off
}
function wpnAnimalFx(o, dt) {                        // updateAnimal: knockback slide and flinch tilt
  if (o.kb) {
    const p = o.root.position, k = o.kb.t / 0.25;
    p.x += o.kb.x * k * dt * 1.6; p.z += o.kb.z * k * dt * 1.6; collide(p, 0.4, false, !o.tame); p.y = getHeight(p.x, p.z);
    if ((o.kb.t -= dt) <= 0) o.kb = null;
  }
  if (o.flinch > 0) { o.flinch = Math.max(0, o.flinch - dt); o.root.rotation.z = Math.sin((o.flinch / 0.3) * Math.PI) * 0.12; }
  else if (o.root.rotation.z) o.root.rotation.z = 0;
}
function wpnBitten() { trauma = Math.min(1, trauma + 0.35); W.idleT = 0; }   // wolfBrain: a bite lands (6 hp, below the 8 that cancels an aim)
// Pooled dust/chip puffs: 6 soft sprites that rise and fade over 0.4 s.
const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const puffs = Array.from({ length: 8 }, () => {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8a7458, size: 0.26, map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
  p.visible = false; p.frustumCulled = false; scene.add(p);
  return { p, t: 0, v: new Float32Array(18) };
});
let puffI = 0;
function wpnPuff(x, y, z, col) {
  GS.puffs++;                                        // GORE (tests: Blood off still gives dust)
  const f = puffs[puffI++ % puffs.length], a = f.p.geometry.attributes.position.array;
  for (let i = 0; i < 6; i++) { a.set([x + (rand() - 0.5) * 0.3, y + (rand() - 0.5) * 0.3, z + (rand() - 0.5) * 0.3], i * 3); f.v.set([(rand() - 0.5) * 1.2, 0.6 + rand() * 0.8, (rand() - 0.5) * 1.2], i * 3); }
  f.p.geometry.attributes.position.needsUpdate = true; f.p.material.color.set(col); f.t = 0.4; f.p.visible = true;
}
function wpnPuffs(dt) {
  for (const f of puffs) {
    if (!f.p.visible) continue;
    f.t -= dt; const a = f.p.geometry.attributes.position.array;
    for (let i = 0; i < 18; i++) a[i] += f.v[i] * dt;
    f.p.geometry.attributes.position.needsUpdate = true;
    f.p.material.opacity = Math.max(0, f.t / 0.4) * 0.8; f.p.material.size = 0.26 + (0.4 - f.t) * 0.5;
    if (f.t <= 0) f.p.visible = false;
  }
}
// The chop (findTarget's tree action): draw the axe if needed, face the tree, strike, and the wood at contact.
function wpnChop(n) {
  const fn = () => {
    if (P.cool > 0) return;
    P.wantFace = Math.atan2(n.x - P.pos.x, n.z - P.pos.z);
    P.h.swing('strikeU', 1.5); P.cool = 0.6; W.idleT = W.homeT = 0; W.sw = { k: 'axe', t: 0, dur: 0.6 };
    A.hit(700 + rand() * 300, 0.12, 0.07);
    W.pend = { t: 0.27, fn() {
      A.hit(260, 0.18, 0.7); A.hit(1500, 0.05, 0.3);
      hitStop = W.hsLast = 0.02; hsWho = null; trauma = Math.min(1, trauma + 0.1); W.recoil = 0.1;
      wpnPuff(n.x - Math.sin(P.wantFace) * 0.35, P.pos.y + 1.1, n.z - Math.cos(P.wantFace) * 0.35, 0x9a7a4a);
      if (!n.alive) return;
      if (--n.hp <= 0) { n.hp = 4; take(n); give('wood', 3); give('stick', 1); A.hit(120, 0.8, 0.7); }
    } };
  };
  if (W.aim) wpnCancelAim();
  if (W.held === 'axe' && W.st === 'drawn') { fn(); return; }
  if (W.held === 'axe' && W.st === 'drawing') { W.queued = { k: 'chop', fn }; return; }
  if (W.st !== 'sheathed') wpnStowAll('switch', true);
  if (W.sel !== 'axe') { W.last = W.sel; W.sel = 'axe'; }
  W.queued = { k: 'chop', fn }; wpnDraw(true);
}

// ----- spear aim, arc and throw
function aimSolve(charge, spawn, dir) {             // the same numbers for the arc and the throw, so the arc never lies
  camera.getWorldDirection(_w4);
  P.h.bones.hand_r.getWorldPosition(spawn); spawn.addScaledVector(_w4, 0.35);
  const v = BOW.on ? 30 + 28 * charge : 22 + 16 * charge;   // BOW: arrows fly faster and flatter
  if (BOW.on) bowAimAt(spawn, dir, v);               // BOW-AIM: onto the thing under the crosshair, at any range
  else { dir.copy(camera.position).addScaledVector(_w4, 40).sub(spawn).normalize(); dir.y += 0.035; dir.normalize(); }
  survWobble(dir);                                   // SURV: hurt arms, fever and cold shake the aim
  return v;
}
// ----- BOW-AIM (verifier round 2). The arrow left the string hand, and in third person the camera sits over the
// shoulder, more than half a metre from it. Aimed at a fixed point 40 m down the camera's line, the arrow crossed that
// line only out there: at 6 m it passed 0.6 m beside the crosshair. Now the arrow's flight (what the hit tests see)
// runs on the camera's own line, from the point on it abreast of the string hand, so it passes through whatever the
// crosshair covers at any range. The line is followed out to the first thing it meets (game, a raider, a trunk, a
// boulder, a wall, the ground; 60 m of open air otherwise) and the drop over the flight to that point is paid for, up
// to BOW_ZERO metres. Past that the shot keeps the BOW_ZERO elevation and falls short, as before: the arc shows it.
// What is drawn (the arrow in the air, the arc) starts at the hand and eases onto the true line over the first
// BOW_EASE metres (BOW.off = hand minus line at the start). The arc and the shot both come through here.
const BOW_ZERO = 40, BOW_EASE = 10, _baO = new THREE.Vector3(), _baP = new THREE.Vector3(), _baQ = new THREE.Vector3(), _baNear = [];
function bowSight(out) {                             // _w4 = the camera's direction (aimSolve has just set it)
  const o = _baO.copy(camera.position), d = _w4;
  const t0 = Math.max(0, (P.pos.x - o.x) * d.x + (P.pos.y + 1.3 - o.y) * d.y + (P.pos.z - o.z) * d.z) + 1.6, t1 = t0 + 60;   // from just past Aro
  _baNear.length = 0;                                // bodies within 3 m of the line
  const near = (x, y, z) => { const t = (x - o.x) * d.x + (y - o.y) * d.y + (z - o.z) * d.z; return t > t0 - 3 && t < t1 + 3 && (x - o.x - d.x * t) ** 2 + (y - o.y - d.y * t) ** 2 + (z - o.z - d.z * t) ** 2 < 9; };
  for (const a of animals) if (a.state === 'live' && !a.horse && near(a.root.position.x, a.root.position.y + 0.6, a.root.position.z)) _baNear.push(a);
  for (const f of foes) if (f.live && f.state === 'live' && near(f.pos.x, f.pos.y + 0.9, f.pos.z)) _baNear.push(f);
  const sk = BOWOB.k, sn = BOWOB.n;
  let hit = t1;
  _baP.copy(o).addScaledVector(d, t0);
  for (let t = t0; t < t1 && hit === t1; t += 0.25) {
    const p = _baQ.copy(o).addScaledVector(d, t + 0.25);
    if (p.y < getHeight(p.x, p.z)) { hit = t + 0.125; break; }
    for (const b of _baNear) {
      const by = b.foe ? b.pos.y : b.root.position.y, top = b.foe ? 1.8 : goreBody(b).top * b.root.scale.x;
      if (p.y > by && p.y < by + top && goreBodyGap(b, p.x, p.z).d < 0) { hit = t + 0.125; break; }
    }
    if (hit !== t1) break;
    if (!BOW.noObst) { const ob = bowSweep(_baP, p); if (ob) { hit = o.distanceTo(ob); break; } }
    _baP.copy(p);
  }
  BOWOB.k = sk; BOWOB.n = sn;                         // (bowSweep notes what it struck for the arrow that struck it)
  return out.copy(o).addScaledVector(d, hit);
}
const bowEase = (dist) => { const k = clamp(1 - dist / BOW_EASE, 0, 1); return k * k * (3 - 2 * k); };
function bowAimAt(spawn, dir, v) {
  const o = camera.position, t = (spawn.x - o.x) * _w4.x + (spawn.y - o.y) * _w4.y + (spawn.z - o.z) * _w4.z;
  (BOW.off ||= new THREE.Vector3()).copy(spawn); spawn.copy(o).addScaledVector(_w4, t); BOW.off.sub(spawn);
  const A = bowSight(dir), L = Math.max(0.5, A.distanceTo(spawn));
  const drop = (l) => { const t = Math.max(0, l - SP_TIP) / v; return 3 * t * t + SP_TIP * 6 * t / v; };   // the point leads the grip by SP_TIP along a falling line
  A.y += L <= BOW_ZERO ? drop(L) : drop(BOW_ZERO) * L / BOW_ZERO;
  dir.sub(spawn).normalize();
}
const SP_DT = 1 / 60, SP_TIP = 1.48;                // the projectile point is the grip; the tip leads it by 1.48 m
function spearStep(pos, vel, tip) {                  // one fixed step, shared by updateSpear and the arc
  vel.y -= 6 * SP_DT; pos.addScaledVector(vel, SP_DT);
  tip.copy(vel).normalize().multiplyScalar(SP_TIP).add(pos);
  for (const o of animals) {
    if (o.state !== 'live' || o.horse) continue;     // WP4: the spear never hurts a horse
    const p = o.root.position;
    if (Math.hypot(p.x - tip.x, p.z - tip.z) < 1.05 && tip.y > p.y + 0.2 && tip.y < p.y + 2.1) return o;
  }
  const fh = cmbSpearFoe(tip); if (fh) return fh;    // CMB the spear finds raiders too
  return tip.y < getHeight(tip.x, tip.z) + 0.05 ? 'ground' : null;
}
function tipToGround(pos, vel, tip) {                // slide back along the flight line to the surface, then 0.14 in
  const gy = getHeight(tip.x, tip.z); _w4.copy(vel).normalize();
  if (_w4.y < -0.05) tip.addScaledVector(_w4, -(tip.y - gy) / _w4.y);
  tip.y = Math.max(tip.y, gy); pos.copy(tip).addScaledVector(_w4, -SP_TIP + 0.14);
  return gy;
}
const ARC_N = 182, arcPos = new Float32Array(ARC_N * 3), arcLen = new Float32Array(ARC_N);
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3)); arcGeo.setAttribute('lineDistance', new THREE.BufferAttribute(arcLen, 1));
const arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, dashSize: 0.3, gapSize: 0.18, fog: false }));
const arcDots = new THREE.Points(arcGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, map: puffTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
const arcRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, fog: false }));
arcRing.rotation.x = -Math.PI / 2;
// WH: a soft dark halo under the dots and the ring, so the arc reads against a bright sky and sunlit grass alike
const arcHalo = new THREE.Points(arcGeo, new THREE.PointsMaterial({ color: 0x14100c, size: 0.36, map: puffTex, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
const arcRingHalo = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, fog: false }));
arcRing.add(arcRingHalo); arcRingHalo.position.z = -0.005;   // a child: lies in the ring's plane, just under it
arcRing.material.depthTest = arcRingHalo.material.depthTest = false;   // the landing mark shows through the tall grass arcRingHalo.renderOrder = 4;
arcLine.add(arcHalo); arcHalo.renderOrder = 4; arcHalo.frustumCulled = false;
for (const o of [arcLine, arcDots, arcRing]) { o.visible = false; o.frustumCulled = false; o.renderOrder = 5; scene.add(o); }
const ARC = { n: 0, hit: null, end: new THREE.Vector3() };
const _arcP = new THREE.Vector3(), _arcP0 = new THREE.Vector3();
const _ap = new THREE.Vector3(), _av = new THREE.Vector3(), _at = new THREE.Vector3(), _ad = new THREE.Vector3();
function arcUpdate(charge) {
  const v = aimSolve(charge, _ap, _ad); _av.copy(_ad).multiplyScalar(v);
  let n = 0, hit = null, len = 0;
  const off = W.aim?.bow && view !== 'fpp' ? BOW.off : null, p0 = off && _arcP0.copy(_ap);   // BOW-AIM: the drawn arc leaves the hand and eases onto the true line
  const push = (q) => { const p = _arcP.copy(q); if (off) p.addScaledVector(off, bowEase(q.distanceTo(p0))); if (n) len += _w3.set(arcPos[n * 3 - 3], arcPos[n * 3 - 2], arcPos[n * 3 - 1]).distanceTo(p); arcPos[n * 3] = p.x; arcPos[n * 3 + 1] = p.y; arcPos[n * 3 + 2] = p.z; arcLen[n++] = len; };
  push(_ap);
  for (let i = 0; i < 180 && !hit; i++) { hit = W.aim?.bow ? bowStep(_ap, _av, _at) : spearStep(_ap, _av, _at); if (!hit) push(_ap); }   // BOW: trees, boulders, walls stop the arrow's arc
  if (hit === 'ground') tipToGround(_ap, _av, _at);
  if (hit) push(_at);
  const obst = hit === 'obst';                        // BOW
  ARC.n = n; ARC.hit = hit ? (hit === 'ground' || obst ? 'ground' : 'animal') : null; ARC.end.copy(hit && hit !== 'ground' && !obst ? hit.root.position : _at);
  let n0 = 0;                                         // BOW-ARC: in first person the arc leaves from the eye: its near run piles up round the crosshair (a blurred disc of dots and halos)
  if (view === 'fpp') for (let i = 0; i < n; i++) {  // so it starts only past the last point still within 4 m of the eye or within ~45 px of the crosshair
    _w3.set(arcPos[i * 3], arcPos[i * 3 + 1], arcPos[i * 3 + 2]);
    const far = _w3.distanceToSquared(camera.position) > 16; _w3.project(camera);
    if (!far || _w3.z > 1 || Math.hypot(_w3.x * camera.aspect, _w3.y) < 0.125) n0 = i + 1;
  }
  ARC.n0 = n0;
  arcGeo.setDrawRange(n0, Math.max(0, n - n0)); arcGeo.attributes.position.needsUpdate = true; arcGeo.attributes.lineDistance.needsUpdate = true;
  const mode = settings.arc ?? 'on', op = mode === 'off' ? 0 : mode === 'fade' ? 1 - THREE.MathUtils.clamp((charge - 0.7) / 0.3, 0, 1) : 1;
  const ok = !P.ride || Math.abs(wrapA(camFace() - P.face)) <= 2.1;
  arcLine.visible = arcDots.visible = op > 0.01 && ok && n - n0 > 1; arcRing.visible = !!hit && op > 0.01 && ok;
  arcLine.material.opacity = 0.85 * op; arcDots.material.opacity = 0.95 * op; arcRing.material.opacity = 0.95 * op;
  arcHalo.material.opacity = 0.55 * op; arcRingHalo.material.opacity = 0.5 * op;
  arcRing.material.color.set(ARC.hit === 'animal' ? 0xff5a4a : 0xffd27a);       // WH: warm amber on the ground, red on game
  arcRing.scale.setScalar(1 + 0.12 * Math.sin(clock * 7));                       // a slow pulse draws the eye to the landing
  arcRing.position.set(ARC.end.x, getHeight(ARC.end.x, ARC.end.z) + 0.04, ARC.end.z);
  if (obst) { arcRing.position.copy(ARC.end); arcRing.lookAt(_ap.copy(ARC.end).sub(_av)); } else arcRing.rotation.set(-Math.PI / 2, 0, 0);   // BOW: the mark stands on the trunk or stone it will strike
}
function wpnAimStart() {
  if (!hasSpear() || W.spearOut || P.swim || P.sit > 0 || (wBusy() && !P.ride) || P.taming || busy) return false;
  W.rmb = true;
  if (W.held === 'spear' && W.st === 'drawn') { W.aim = { t: 0, charge: 0 }; W.idleT = 0; return true; }
  if (W.st !== 'sheathed' && W.held !== 'spear') wpnStowAll('switch', true);
  if (W.sel !== 'spear') { W.last = W.sel; W.sel = 'spear'; }
  W.queued = 'aim'; W.relEarly = false;
  if (W.st !== 'drawing') wpnDraw(true);
  return true;
}
function wpnCancelAim() {
  if (!W.aim) { if (W.queued === 'aim') W.queued = null; return; }
  W.aim = null; W.rmb = false;
  for (const o of [arcLine, arcDots, arcRing]) o.visible = false;
  if (P.h.spear.parent === P.h.sock.hand) P.h.place(P.h.spear, 'hand', 0.15);
  wpnHud();
}
const proj = { m: makeSpear(), vel: new THREE.Vector3(), pos: new THREE.Vector3(), st: null, acc: 0, dmg: 10, o: null, t: 0, wet: false, steps: 0 };
proj.m.userData.kind = 'spear'; proj.m.visible = false; scene.add(proj.m);
const _tip = new THREE.Vector3();
function wpnRelease() {
  const a = W.aim; if (!a) return;
  if (P.ride && Math.abs(wrapA(camFace() - P.face)) > 2.1) { wpnCancelAim(); toast('Turn a little to throw from the saddle'); return; }
  const v = aimSolve(a.charge, proj.pos, _ad);
  proj.vel.copy(_ad).multiplyScalar(v); proj.dmg = S.tools.flintspear ? 22 : 12;   // CMB thrown 12 / 22
  proj.st = 'air'; proj.acc = 0; proj.wet = false; proj.steps = 0; proj.o = null;
  proj.m.userData.setFlint(!!S.tools.flintspear); proj.m.scale.setScalar(1);
  if (proj.m.parent !== scene) scene.attach(proj.m);
  proj.m.visible = true; poseProj();
  W.aim = null; W.rmb = false; W.spearOut = true; W.spearLeftT = 0; S.spearAt = null;
  P.h.spear.visible = false; P.h.place(P.h.spear, 'back'); W.held = null; W.st = 'sheathed'; W.stW = 0; W.lhW = 0;
  W.last = 'spear'; W.sel = 'fists';
  for (const o of [arcLine, arcDots, arcRing]) o.visible = false;
  if (!P.ride) P.wantFace = camFace();
  P.h.swing('throwU', 1.4); W.punch = 0.12; W.sw = { k: 'throw', t: 0, dur: 0.5 };
  A.hit(900, 0.18, 0.18); P.cool = 0.5; W.idleT = 0;
  wpnHud();
}
// Legacy / test throw (G.throwSpear): an instant throw at charge 0.6 with no aim.
function throwSpear() {
  if (!hasSpear() || W.spearOut || P.cool > 0 || busy || P.swim || P.sit > 0) return;
  if (W.held !== 'spear') { if (W.st !== 'sheathed') wpnSnapAway(); W.held = 'spear'; W.st = 'drawn'; W.sel = 'spear'; P.h.place(P.h.spear, 'hand'); P.h.spear.visible = true; }
  if (!P.ride) P.face = camFace();
  W.aim = { t: 0.36, charge: 0.6 }; wpnRelease();
}
function poseProj() {
  _w1.copy(proj.vel).normalize();
  proj.m.position.copy(proj.pos).addScaledVector(_w1, 0.35);
  proj.m.lookAt(_w2.copy(proj.m.position).add(_w1));
}
function recordSpear() {
  const m = proj.m; m.updateMatrixWorld(true); m.getWorldPosition(_w1); m.getWorldQuaternion(_wq);
  S.spearAt = { x: +_w1.x.toFixed(3), y: +_w1.y.toFixed(3), z: +_w1.z.toFixed(3), qx: +_wq.x.toFixed(4), qy: +_wq.y.toFixed(4), qz: +_wq.z.toFixed(4), qw: +_wq.w.toFixed(4), f: proj.st === 'float' ? 1 : undefined };
}
function updateSpear(dt) {
  if (proj.st !== 'air') return;
  proj.acc += dt;
  while (proj.acc >= SP_DT && proj.st === 'air') {
    proj.acc -= SP_DT;
    const hit = spearStep(proj.pos, proj.vel, _tip);
    const gy = getHeight(_tip.x, _tip.z);
    if (!proj.wet && gy < -0.25 && _tip.y < 0) { proj.wet = true; A.hit(1800, 0.3, 0.35); }   // splash
    if (hit && hit !== 'ground') landSpearAnimal(hit);
    else if (hit === 'ground') landSpearGround();
    else if (++proj.steps > 900) { proj.pos.y = getHeight(proj.pos.x, proj.pos.z) + 0.1; proj.vel.set(Math.sin(P.face), -0.3, Math.cos(P.face)); landSpearGround(); }
  }
  if (proj.st === 'air') poseProj();
}
// WH: where the thrown spear is, for the pack line and the weapon chip ('' while it flies).
function spearWhere() {
  const st = proj.st;
  return st === 'float' ? 'in the river' : st === 'ground' ? 'on the ground' : st === 'sena' ? 'with Sena'
    : st === 'animal' ? `in the ${(proj.o?.kind || 'animal').replace(/_.*/, '')}` : '';
}
function landSpearGround() {
  const gy = tipToGround(proj.pos, proj.vel, _tip);
  const hv = Math.hypot(proj.vel.x, proj.vel.z), minDip = 0.42;             // a flat throw still ends stuck in, not lying down
  if (gy >= -0.9 && Math.atan2(-proj.vel.y, hv) < minDip) { proj.vel.y = -Math.tan(minDip) * hv; proj.pos.copy(_tip).addScaledVector(_w4.copy(proj.vel).normalize(), -SP_TIP + 0.14); }
  poseProj();
  if (gy < -0.9) {                                   // deep water: it floats at the surface
    proj.st = 'float'; proj.m.position.set(_tip.x, -0.05, _tip.z).addScaledVector(_w1.set(proj.vel.x, 0, proj.vel.z).normalize(), -0.8);
    proj.m.lookAt(_w2.copy(proj.m.position).add(_w1));
  } else { proj.st = 'ground'; A.hit(500, 0.12, 0.3); wpnPuff(_tip.x, gy + 0.1, _tip.z, gy < -0.25 ? 0x9ab0b8 : 0x8a7458); }
  recordSpear();
  // Spear fishing: the deeper the water, the better the odds.
  if (gy < -0.25 && rand() < clamp(0.3 - gy * 0.12, 0.3, 0.6)) {
    give('fish', 1); bump('fished');
    if (cnt('fished') === 1) say('Sena', 'A fish! Bring it to the fire — it cooks quickly.');
  } else if (gy < -0.25 && cnt('fished') < 1 && !cnt('missLine')) { bump('missLine'); say('Sena', 'Missed. Aim a little below where they seem to be — the water lies.'); }
}
function landSpearAnimal(o) {
  poseProj(); _w1.copy(proj.vel).normalize();
  proj.m.position.addScaledVector(_w1, 0.4);         // the point sinks into the body
  o.root.attach(proj.m);
  proj.st = 'animal'; proj.o = o; proj.t = 0;
  wpnHitFx(o, proj.dmg, 'thrown', matSpearInfo(o));  // MAT: the spear-tip world point and the flight velocity
  wpnKnock(o, _w2.copy(o.root.position).addScaledVector(_w1, -1));
}
function wpnDropSpear(o) {                           // off the animal onto the ground at its feet, tilted 70°
  const p = o ? o.root.position : proj.m.position;
  scene.attach(proj.m);
  const yaw = rand() * 6.283, x = p.x + Math.sin(yaw) * 0.4, z = p.z + Math.cos(yaw) * 0.4;
  proj.m.position.set(x, getHeight(x, z) + 0.12, z);
  proj.m.rotation.set(0, 0, 0); proj.m.rotation.order = 'YXZ'; proj.m.rotation.y = yaw + Math.PI / 2; proj.m.rotation.x = -0.12;
  proj.m.updateMatrixWorld(true); proj.m.rotation.order = 'XYZ'; proj.m.quaternion.setFromRotationMatrix(proj.m.matrixWorld);
  proj.st = getHeight(x, z) < -0.9 ? 'float' : 'ground'; proj.o = null;
  if (proj.st === 'float') proj.m.position.y = -0.05;
  recordSpear();
}
function wpnPickup(fromSena = false) {
  if (!W.spearOut) return;
  if (proj.m.parent !== scene) scene.attach(proj.m);
  proj.st = null; proj.o = null; proj.m.visible = false; W.spearOut = false; W.spearLeftT = 0; S.spearAt = null; N.fetch = null;
  const sp = P.h.spear; sp.visible = true;
  P.h.place(sp, 'back');
  if (!fromSena && !P.ride && !P.swim) P.h.swing('pickU', 1.6);
  A.hit(500, 0.1, 0.15); A.hit(2200, 0.05, 0.05);
  if (W.sel === 'fists' && W.last === 'spear' && W.st === 'sheathed') { W.sel = 'spear'; W.last = 'fists'; }
  toast(fromSena ? 'Sena hands you your spear' : 'You take back your spear');
  wpnHud();
}
// findTarget (top): the spear lying out, within 2.2 m.
function wpnTarget(p) {
  if (!W.spearOut || !(proj.st === 'ground' || proj.st === 'float' || proj.st === 'animal')) return null;
  proj.m.getWorldPosition(_w1);
  if (Math.hypot(_w1.x - p.x, _w1.z - p.z) > 2.2 || Math.abs(_w1.y - p.y) > 2.5) return null;
  return { label: 'Take back your spear', key: true, act() { wpnPickup(); } };
}
function wpnSpearTick(dt) {
  if (!W.spearOut) return;
  W.spearLeftT += dt;
  if (proj.st === 'animal') {
    proj.t += dt; const o = proj.o;
    if (!o || !o.root.parent || !o.root.visible || o.looted || (o.state === 'live' && proj.t > 1.2)) wpnDropSpear(o);
  }
  if (proj.st === 'ground' || proj.st === 'float' || proj.st === 'animal') {
    proj.m.getWorldPosition(_w1);
    if (Math.hypot(_w1.x - P.pos.x, _w1.z - P.pos.z) < 1.0 && Math.abs(_w1.y - P.pos.y) < 1.8 && !P.ride) wpnPickup();
    else if (!N.fetch && W.spearLeftT > 60 && Math.hypot(_w1.x - P.pos.x, _w1.z - P.pos.z) > 25 && nFree() && !N.ride && reached('fire')
      && Math.hypot(_w1.x - N.pos.x, _w1.z - N.pos.z) < 60 && proj.st !== 'animal') N.fetch = { x: _w1.x, z: _w1.z, ph: 'go', t: 0 };
  }
}
// updateSena: she walks to the forgotten spear, picks it up, brings it and hands it over.
function wpnSenaFetch(dt) {
  const f = N.fetch;
  if (!W.spearOut || !(proj.st === 'ground' || proj.st === 'float' || proj.st === 'sena')) { N.fetch = null; return false; }
  f.t += dt;
  if (f.ph === 'go') {
    proj.m.getWorldPosition(_w1);
    if (walkTo(N, _w1.x, _w1.z, 3.3, dt, 0.8) || f.t > 40) { f.ph = 'pick'; f.t = 0; N.speed = 0; N.h.swing('pick'); }
    return true;
  }
  if (f.ph === 'pick') {
    N.speed = 0;
    if (f.t > 0.5 && proj.st !== 'sena') { proj.st = 'sena'; S.spearAt = null; N.h.place(proj.m, 'hand', 0.15); N.h.gripR = 1; }
    if (f.t > 1.1) { f.ph = 'bring'; f.t = 0; }
    return true;
  }
  const d = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  if (d < 2.2 || walkTo(N, P.pos.x, P.pos.z, d > 12 ? 6.6 : 3.4, dt, 2) || f.t > 60) {
    N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z); N.h.swing('use');
    say('Sena', 'You forgot this.');
    wpnPickup(true); N.h.gripR = 0;
  }
  return true;
}

// ----- BOW: bow and arrows. Key 5 readies the bow; hold right mouse to draw (reuses the spear's aim: camera, crosshair,
// arc, strafe), click left to loose; letting go of right mouse eases the string down, no arrow spent. Arrows fly on the aim arc, stick in game, the ground and
// raiders, and are picked up with E. Friendlies are never in the hit test (spearStep only sees wild animals and raiders).
const BOW = { on: false, arrows: [], drawT: 0 };
const bowMesh = makeBow(), quiverMesh = makeQuiver(), nockArrow = makeArrow();
for (const m of [bowMesh, quiverMesh, nockArrow]) { m.visible = false; scene.add(m); }
const bowCap = () => (S.tools.quiver ? 24 : 8);
const CAVE_I = CH.findIndex((c) => c.id === 'cave');
const bowUnlocked = () => S.ch > CAVE_I || !!S.tools.bow;
const _bA = new THREE.Vector3(), _bB = new THREE.Vector3(), _bC = new THREE.Vector3(), _bD = new THREE.Vector3(), _bM = new THREE.Matrix4(), _bQ = new THREE.Quaternion();
function bowToggle() {
  if (!S.tools.bow) { toast(bowUnlocked() ? 'You have no bow yet: craft one (Tab)' : 'You have no bow yet'); return; }
  BOW.on = !BOW.on;
  if (BOW.on) {
    if (W.aim) wpnCancelAim();
    if (W.st !== 'sheathed') wpnStowAll('switch', true);
    if (torchOn) toggleTorch();
    W.sel = 'fists';
    toast(S.inv.arrow > 0 ? `Bow ready · ${S.inv.arrow} arrows · hold right mouse to draw, click to loose` : 'Bow ready, but you have no arrows');
  } else { if (W.aim) wpnCancelAim(); }
  A.hit(1500, 0.05, 0.06); drawInv();
}
function bowOff() { if (BOW.on) { BOW.on = false; if (W.aim) wpnCancelAim(); drawInv(); } }
function bowAimStart() {
  BOW.tire = 0;
  if (P.swim || P.ride || P.sit > 0 || wBusy() || busy) return;
  if (!(S.inv.arrow > 0)) { toast('No arrows'); A.hit(300, 0.05, 0.05); return; }
  W.aim = { t: 0, charge: 0, bow: true }; W.rmb = true; W.idleT = 0;
  A.hit(160, 0.5, 0.05);                            // the stave creaks as it bends
}
function bowLoose() {
  const a = W.aim; if (!a) return;
  if (a.charge < 0.12) { wpnCancelAim(); return; }   // a twitch lets the string down, no arrow spent
  const ar = { m: makeArrow(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), tip: new THREE.Vector3(), st: 'air', acc: 0, steps: 0, o: null, from: P.pos.clone() };
  const v = aimSolve(a.charge, ar.pos, ar.vel);
  const wob = 0.045 * (1 - a.charge) ** 1.5 + 0.02 * (BOW.tire || 0);   // a quick or a shaking shot strays
  ar.vel.x += (rand() - 0.5) * 2 * wob; ar.vel.y += (rand() - 0.5) * 2 * wob; ar.vel.z += (rand() - 0.5) * 2 * wob; ar.vel.normalize().multiplyScalar(v);
  ar.dmg = Math.round(4 + 10 * a.charge);
  if (BOW.off && view !== 'fpp') { ar.off = BOW.off.clone(); ar.p0 = ar.pos.clone(); }   // BOW-AIM
  BOW.relT = clock; BOW.relCh = a.charge;            // BOW-FPP: the release follow-through
  scene.add(ar.m); BOW.arrows.push(ar); bowPoseArrow(ar);
  S.inv.arrow--;
  wpnCancelAim(); P.cool = 0.35; W.punch = 0.08;
  A.hit(220, 0.08, 0.3); A.hit(1400, 0.05, 0.12);   // twang and the whoosh
  bowTrim(); drawInv();
}
// Full draw held past ~4 s: stamina drains, the aim starts to shake (and the shot strays); spent, the string comes down.
function bowHold(dt) {
  const over = W.aim.t - 4.6;
  BOW.tire = clamp(over / 3, 0, 1);
  if (over <= 0) return;
  S.stam = Math.max(0, S.stam - dt * ((P.speed < 0.5 ? 18 : 10) * (S.rested > 0 ? 1.5 : 1) + 8));   // no regen while straining, and 8/s more
  const k = (0.004 + 0.012 * BOW.tire) * (settings.reduceMotion ? 0.4 : 1);
  camYaw += Math.sin(clock * 9.3) * k * dt * 9 + (rand() - 0.5) * k * 0.5; camPitch += Math.sin(clock * 7.1 + 1) * k * dt * 9;
  if (S.stam <= 0.5) { wpnCancelAim(); toast('Your arms give out: the string comes down'); }
}
function bowPoseArrow(ar) {
  ar.m.position.copy(ar.tip.lengthSq() ? ar.tip : ar.pos);
  if (ar.off) { const k = bowEase(ar.m.position.distanceTo(ar.p0)); if (k > 0) ar.m.position.addScaledVector(ar.off, k); else ar.off = null; }   // BOW-AIM: seen leaving the hand
  ar.m.lookAt(_bA.copy(ar.m.position).add(ar.vel));
}
function bowTrim() {                                  // at most 40 loose arrows in the world: the oldest go
  const loose = BOW.arrows.filter((a) => a.st !== 'air');
  for (let i = 0; i < loose.length - 40; i++) bowRemove(loose[i]);
}
function bowRemove(ar) { ar.m.removeFromParent(); const i = BOW.arrows.indexOf(ar); if (i >= 0) BOW.arrows.splice(i, 1); }
function bowLandGround(ar) {
  const gy = tipToGround(ar.pos, ar.vel, ar.tip);
  if (gy < -0.25) { A.hit(1800, 0.25, 0.25); wpnPuff(ar.tip.x, 0, ar.tip.z, 0x9ab0b8); bowRemove(ar); return; }   // lost in the water
  if (ar.bounced) { bowLie(ar, ar.tip.x, ar.tip.z); return; }   // after a ricochet it falls flat
  if (bowRocky(ar.tip.x, ar.tip.z)) { _bD.set(0, 1, 0); bowRock(ar, _bD); return; }   // stone under the grass: clack, 30% it breaks
  _bA.copy(ar.vel).normalize(); ar.m.position.copy(ar.tip).addScaledVector(_bA, 0.12); ar.m.lookAt(_bB.copy(ar.m.position).add(_bA));
  ar.st = 'ground'; A.hit(480, 0.08, 0.25); wpnPuff(ar.tip.x, gy + 0.08, ar.tip.z, 0x8a7458);
  bowRecord();
}
// The arrow's own step: the spear's (game, raiders, ground), then tree trunks, boulders and buildings. The arc preview
// uses it too while the bow is drawn, so the arc stops where the arrow will.
const BOWOB = { k: null, n: null, stamp: 0 };
const _bS0 = new THREE.Vector3(), _bS1 = new THREE.Vector3(), _bSp = new THREE.Vector3();
// BOW-SWEEP: an arrow covers ~1 m per 1/60 s step, more than a trunk is wide, so the obstacles are tested against the
// whole segment the point swept this step (from where it was to where it is), not just where it ends up.
function bowStep(pos, vel, tip, ar) {
  const a = _bS0.copy(vel).normalize().multiplyScalar(SP_TIP).add(pos);   // the point before the step
  const r = spearStep(pos, vel, tip); if (r && r !== 'ground') return r;
  if ((ar && ar.noOb > 0 && ar.noOb--) || BOW.noObst) return r;   // noObst: test switch (G.bow.BOW) for damage tests in wooded spots
  const b = _bS1.copy(tip);                          // the point after it (spearStep may have stopped short at the ground: still tested to here)
  const ob = bowSweep(a, b);
  if (ob) { tip.copy(ob); pos.copy(tip).addScaledVector(_bSp.copy(vel).normalize(), -SP_TIP); return 'obst'; }
  return r;
}
// The first obstacle the segment a->b meets (trunk, boulder, building wall), or null; its entry point in a shared vector.
const _bSh = new THREE.Vector3();
function bowSweep(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  let best = 2, bk = null, bn = null;
  // a vertical cylinder (centre cx,cz, radius rr, from y0 to y1): first u in [0,1] where the segment is inside it
  const cyl = (cx, cz, rr, y0, y1) => {
    const fx = a.x - cx, fz = a.z - cz, c = fx * fx + fz * fz - rr * rr;
    let u;
    if (c <= 0) u = 0;
    else {
      if (L2 < 1e-9) return 2;
      const bb = fx * dx + fz * dz, disc = bb * bb - L2 * c;
      if (disc < 0) return 2;
      u = (-bb - Math.sqrt(disc)) / L2;
      if (u < 0 || u > 1) return 2;
    }
    const y = a.y + dy * u;
    if (y > y0 && y < y1) return u;
    return 2;
  };
  const stamp = ++BOWOB.stamp;                       // each obstacle once, though it sits in several cells
  for (const cell of [bowCell(a.x, a.z), bowCell(b.x, b.z), bowCell(a.x, b.z), bowCell(b.x, a.z)]) if (cell) for (const e of cell) {
    if (e.st === stamp) continue; e.st = stamp;
    const [k, n] = e;
    if (!n.alive) continue;
    if (k === 'rock') {                              // an ellipsoid-topped mound: sampled every 0.2 m along the segment
      const steps = Math.max(1, Math.ceil(Math.sqrt(L2 + dy * dy) / 0.2));
      for (let i = 1; i <= steps; i++) {
        const u = i / steps; if (u >= best) break;
        _bSh.set(a.x + dx * u, a.y + dy * u, a.z + dz * u);
        if (bowInObst('rock', n, _bSh) && _bSh.y - n.y < 1.05 * n.s) { best = u; bk = 'rock'; bn = n; break; }
      }
    } else {
      const u = cyl(n.x, n.z, 0.27 * n.s, n.y - 0.2, n.y + 5 * n.s);
      if (u < best) { best = u; bk = 'tree'; bn = n; }
    }
  }
  for (const st of structs) {
    const c = st.col; if (!c || c.off) continue;
    if ((a.x - c.x) ** 2 + (a.z - c.z) ** 2 > (c.r + 2) ** 2 && (b.x - c.x) ** 2 + (b.z - c.z) ** 2 > (c.r + 2) ** 2) continue;
    const u = cyl(c.x, c.z, c.r, -1e9, st.group.position.y + 2.3);
    if (u < best) { best = u; bk = 'wood'; bn = c; }
  }
  if (!bk) return null;
  BOWOB.k = bk; BOWOB.n = bn;
  const u = Math.min(1, best + 0.02);                // just inside the surface (bowLandObst backs out to it)
  return _bSh.set(a.x + dx * u, a.y + dy * u, a.z + dz * u);
}
// Trunks and boulders bucketed on a 6 m grid (built on first use; felled trees stay in it, skipped by n.alive), so a
// step tests a handful of obstacles, not every tree in the valley (the arc preview runs up to 180 steps a frame).
let bowGrid = null;
function bowCell(x, z) {
  if (!bowGrid) {
    bowGrid = new Map();
    const add = (k, n, r) => { for (let i = Math.floor((n.x - r) / 6); i <= Math.floor((n.x + r) / 6); i++) for (let j = Math.floor((n.z - r) / 6); j <= Math.floor((n.z + r) / 6); j++) { const key = i * 4096 + j; if (!bowGrid.has(key)) bowGrid.set(key, []); bowGrid.get(key).push([k, n]); } };
    for (const b of world.boulders || []) add('rock', b, 1.2 * b.s);
    for (const f of world.fields) if (f.kind === 'tree') for (const n of f.nodes) add('tree', n, 0.3 * n.s);
  }
  return bowGrid.get(Math.floor(x / 6) * 4096 + Math.floor(z / 6));
}
const bowInObst = (k, n, p) => k === 'rock' ? ((p.x - n.x) ** 2 + (p.z - n.z) ** 2) / (1.15 * n.s) ** 2 + Math.max(0, (p.y - n.y) / (1.05 * n.s)) ** 2 < 1
  : (p.x - n.x) ** 2 + (p.z - n.z) ** 2 < (k === 'tree' ? 0.27 * n.s : n.r) ** 2;
// Rocky ground, by the same weights the terrain shader paints rock with (steep or high), or a loose stone at the spot.
function bowRocky(x, z) {
  const ny = slopeY(x, z), h = getHeight(x, z);
  if (clamp((0.86 - ny) / 0.16, 0, 1) + clamp((h - 30) / 16, 0, 1) * 0.75 > 0.5) return true;
  for (const f of world.fields) if (f.kind === 'stone') for (const n of f.nodes) if (n.alive && Math.abs(n.x - x) < 0.3 && Math.abs(n.z - z) < 0.3) return true;
  return false;
}
function bowLandObst(ar) {
  const k = BOWOB.k, n = BOWOB.n;
  _bA.copy(ar.vel).normalize();
  for (let i = 0; i < 20 && bowInObst(k, n, ar.tip); i++) ar.tip.addScaledVector(_bA, -0.04);   // back to the surface it struck
  ar.pos.copy(ar.tip).addScaledVector(_bA, -SP_TIP);
  if (k === 'rock') {
    _bD.set(ar.tip.x - n.x, Math.max(0.2, ar.tip.y - n.y), ar.tip.z - n.z).normalize();
    bowRock(ar, _bD); return;
  }
  ar.m.position.copy(ar.tip).addScaledVector(_bA, k === 'tree' ? 0.07 : 0.05); ar.m.lookAt(_bB.copy(ar.m.position).add(_bA));
  ar.st = 'ground'; ar.inObst = k; ar.ob = k === 'tree' ? n : null;
  A.hit(380, 0.07, 0.32); A.hit(140, 0.09, 0.2);     // a thunk in wood
  wpnPuff(ar.tip.x, ar.tip.y, ar.tip.z, 0x7a5a3a);
  bowRecord();
}
// Stone: a clack and a spark of grit; 30% the shaft snaps, otherwise it glances off and drops.
function bowRock(ar, nrm) {
  A.hit(2400, 0.035, 0.3); A.hit(1650, 0.05, 0.18);
  wpnPuff(ar.tip.x, ar.tip.y + 0.05, ar.tip.z, 0xa8a49a);
  if (ar.bounced || rand() < 0.3) {
    if (ar.bounced) { bowLie(ar, ar.tip.x, ar.tip.z); return; }
    A.hit(2900, 0.05, 0.14); bowRemove(ar); BOW.broke = (BOW.broke || 0) + 1; return;   // snapped on the stone
  }
  const d = ar.vel.dot(nrm); ar.vel.addScaledVector(nrm, -2 * d).multiplyScalar(0.11); ar.vel.y += 1.5;   // most of its speed is lost on the stone
  ar.bounced = true; ar.noOb = 8; ar.pos.copy(ar.tip).addScaledVector(_bA.copy(ar.vel).normalize(), -SP_TIP);
  ar.tip.addScaledVector(nrm, 0.05); ar.pos.addScaledVector(nrm, 0.05);
  BOW.glanced = (BOW.glanced || 0) + 1;
}
function bowLie(ar, x, z) {                           // flat on the ground, a little askew
  ar.m.position.set(x, getHeight(x, z) + 0.025, z); ar.m.rotation.set(0.035, rand() * 6.28, 0.3, 'YXZ');   // the shaft (local +z) level, the point just touching
  ar.st = 'ground'; ar.ob = null; A.hit(900, 0.04, 0.08); bowRecord();
}
function bowLandAnimal(ar, o) {
  _bA.copy(ar.vel).normalize();
  if (!goreArrowStick(ar, o, _bA)) { ar.m.position.copy(ar.tip).addScaledVector(_bA, 0.18); ar.m.lookAt(_bB.copy(ar.m.position).add(_bA)); o.root.attach(ar.m); }   // GORE: the arrow stands in the body where it went in, on the bone it struck
  ar.st = 'animal'; ar.o = o;
  const dist = Math.hypot(o.root.position.x - ar.from.x, o.root.position.z - ar.from.z);
  const live = o.state === 'live';
  wpnHitFx(o, ar.dmg, 'thrown', { kind: 'pierce', weapon: 'thrown', arrow: true, from: P, point: (ar.hitPt || ar.tip).clone(), dir: _bA.clone(), vel: ar.vel.clone(), dist });   // GORE: the true entry point, arrow flag
  goreArrowAfter(ar, o);                             // GORE: a raider's block turns the arrow aside
  wpnKnock(o, _bB.copy(o.root.position).addScaledVector(_bA, -1));
  A.hit(260, 0.1, 0.3);
  bump('arrow_hit'); if (dist >= 15) bump('arrow_far');
  if (live && o.state === 'dead' && /deer|stag/.test(o.kind || '')) bump('arrow_deer');
  drawQuest();
}
function bowTick(dt) {
  for (const ar of BOW.arrows.slice()) {
    if (ar.st === 'air') {
      ar.acc += dt;
      while (ar.acc >= SP_DT && ar.st === 'air') {
        ar.acc -= SP_DT;
        const hit = bowStep(ar.pos, ar.vel, ar.tip, ar);
        if (hit === 'obst') bowLandObst(ar);
        else if (hit === 'ground') bowLandGround(ar);
        else if (hit && ar.skip !== hit && goreArrowAim(ar, hit)) bowLandAnimal(ar, hit);   // GORE: only a line that really meets the body
        else if (hit) { ar.skip = hit; if (ar.tip.y < getHeight(ar.tip.x, ar.tip.z) + 0.05) bowLandGround(ar); }   // GORE: a near miss flies on
        else if (++ar.steps > 600) bowRemove(ar);
      }
      if (ar.st === 'air') bowPoseArrow(ar);
    } else if (ar.st === 'animal') {
      const o = ar.o;
      if (!o || !o.root.parent || !o.root.visible || o.looted) {   // the body is gone: the arrow falls at its feet
        ar.m.getWorldPosition(_bA); scene.attach(ar.m);
        ar.o = null; bowLie(ar, _bA.x + (rand() - 0.5) * 0.6, _bA.z + (rand() - 0.5) * 0.6);   // BOW: lies flat (it used to stand point-up, buried)
      }
    } else if (ar.ob && !ar.ob.alive) { ar.m.getWorldPosition(_bA); bowLie(ar, _bA.x, _bA.z); }   // the tree it stood in was felled
  }
  bowSideQuest();
}
// E: pick up every arrow within 2.5 m (in the ground, or in a body that is no longer alive).
const bowNear = (p) => BOW.arrows.filter((a) => (a.st === 'ground' || (a.st === 'animal' && a.o?.state !== 'live')) && a.m.getWorldPosition(_bC) && Math.hypot(_bC.x - p.x, _bC.z - p.z) < 2.5 && Math.abs(_bC.y - p.y) < 2.5);
function bowTarget(p) {
  const n = bowNear(p).length; if (!n) return null;
  return { label: `Pick up arrows (${n})`, key: true, act() { bowPickup(); } };
}
function bowPickup() {
  let got = 0, full = false;
  for (const a of bowNear(P.pos)) { if (S.inv.arrow >= bowCap()) { full = true; break; } bowRemove(a); S.inv.arrow++; got++; }
  if (got) { bump('arrow_pick', got); A.hit(2200, 0.05, 0.05); toast(`+${got} arrows${full ? ' · quiver full' : ''}`); if (!P.ride && !P.swim) P.h.swing('pickU', 1.6); }
  else if (full) toast(S.tools.quiver ? 'Quiver full' : 'You can carry only 8 arrows without a quiver');
  bowRecord(); drawInv(); drawQuest();
}
function bowRecord() {
  S.arrowsAt = BOW.arrows.filter((a) => a.st === 'ground').map((a) => { a.m.getWorldPosition(_bA); a.m.getWorldQuaternion(_bQ); return [_bA.x, _bA.y, _bA.z, _bQ.x, _bQ.y, _bQ.z, _bQ.w].map((v) => +v.toFixed(3)); });
}
function bowLoad() {
  S.inv.arrow ??= 0; BOW.on = false;
  for (const a of BOW.arrows.slice()) bowRemove(a);
  for (const r of S.arrowsAt || []) {
    const ar = { m: makeArrow(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), tip: new THREE.Vector3(), st: 'ground', acc: 0, steps: 0, o: null };
    ar.m.position.set(r[0], r[1], r[2]); ar.m.quaternion.set(r[3], r[4], r[5], r[6]); scene.add(ar.m); BOW.arrows.push(ar);
  }
}
// The look direction from the view angles (the same as the play camera's; a story or test camera does not bend the draw)
const bowAimDir = (v) => { const cp = Math.cos(camPitch); return v.set(-Math.sin(camYaw) * cp, -Math.sin(camPitch), -Math.cos(camYaw) * cp).normalize(); };
// ----- BOW-CARRY (verifier round 2: no clipping in any pose). Three placements, each built from the body's own frames
// so they move with it:
//  - slung: on the torso frame (shoulder line and spine), so it leans and turns with the back. The stave touches only
//    behind the shoulder blades; it is turned about its own length so both limb tips and the string stand off the
//    back, and leant so the lower limb clears the seat and the kilt.
//  - quiver: on the torso frame too, a back quiver right of the spine with its mouth past the right shoulder. (At
//    either hip the walking arm, the kilt or the heel swept through it: a search over hip placements against the
//    skinned body in walk, run, sneak, strafe and back-step found none that stayed clear.)
//  - in hand, not drawn: the left arm holds the bow still at the hip (IK, not the walk cycle's swing), the stave level
//    and fore-and-aft outside the thigh, the string turned outward, clear of the forearm.
// All lengths in metres in the frame named; BOWC is exported on G.bow for the clearance tests.
const BOWC = {
  sl: { u: 0, b: 0.21, s: 0.04, roll: 0.62, lean: 0.06, twist: 0.9 },
  qv: { u: 0, b: 0.22, s: 0.2, roll: 0.6, lean: -0.1 },
  hand: { r: -0.36, f: 0.05, y: -0.02, pitch: 0.2, toe: 0.08, spin: 1.2 },
  draw: { r: 0.05, f: 0, y: -0.06 },
};
const _bwU = new THREE.Vector3(), _bwR = new THREE.Vector3(), _bwF = new THREE.Vector3(), _bhR = new THREE.Vector3(), _bhF = new THREE.Vector3(), _bwX = new THREE.Vector3(), _bwY = new THREE.Vector3(), _bwZ = new THREE.Vector3(), _bwQ = new THREE.Quaternion();
function bowTorso(h) {                               // _bwU up the spine, _bwR toward the right shoulder, _bwF out of the chest
  wp(h.bones.neck_01, _bwU).sub(wp(h.bones.spine_01, _bwF)).normalize();
  wp(h.bones.upperarm_r, _bwR).sub(wp(h.bones.upperarm_l, _bwF)); _bwR.addScaledVector(_bwU, -_bwR.dot(_bwU)).normalize();
  _bwF.crossVectors(_bwU, _bwR);
}
function bowHips(h) {                                // _bhR toward the right hip (level), _bhF forward (level)
  wp(h.bones.thigh_r, _bhR).sub(wp(h.bones.thigh_l, _bhF)); _bhR.y = 0;
  if (_bhR.lengthSq() < 1e-6) _bhR.set(-Math.cos(P.face), 0, Math.sin(P.face)); _bhR.normalize();
  _bhF.set(_bhR.z, 0, -_bhR.x);                         // up x right
}
function bowBasis(o, y, zHint) {                     // stave along y, the bow's back as near zHint as it can be
  _bwY.copy(y).normalize(); _bwZ.copy(zHint).addScaledVector(_bwY, -zHint.dot(_bwY)).normalize(); _bwX.crossVectors(_bwY, _bwZ);
  _bM.makeBasis(_bwX, _bwY, _bwZ); return o.setFromRotationMatrix(_bM);
}
function bowCarryQuat(q) {                           // the bow's attitude carried in the hanging left hand (bowHips first)
  const c = BOWC.hand;
  _bA.copy(_bhF).multiplyScalar(Math.cos(c.pitch)); _bA.y = Math.sin(c.pitch); _bA.addScaledVector(_bhR, c.toe);
  _bB.copy(_bhR).multiplyScalar(Math.sin(c.spin)); _bB.y = -Math.cos(c.spin);   // the bow's back: inward and down, so the string lies outward and up
  return bowBasis(q, _bA, _bB);
}
function bowCarryArm(h, w) {
  const c = BOWC.hand; bowHips(h);
  wp(h.bones.pelvis, _bA).addScaledVector(_bhR, c.r).addScaledVector(_bhF, c.f); _bA.y += c.y;
  _bB.copy(_bA).addScaledVector(_bhF, -0.5).addScaledVector(_bhR, -0.12); _bB.y += 0.3;   // the elbow a little back and out
  ik2(h, 'l', _bA, _bB, w * (1 - smooth01(W.aimW)));
}
// Pose (override 31, after the weapon IK): bow arm out at the grip, right hand drawing the string to the cheek.
P.h.addOverride('bowIK', 31, (h, dt) => {
  const hold = BOW.on && !P.ride && !P.swim && !(P.sit > 0) && !wBusy();
  BOW.cw = clamp((BOW.cw || 0) + (hold ? 1 : -1) * Math.min(0.1, dt || 0.016) * 6, 0, 1);
  if (BOW.cw > 0.002 && !P.ride && !P.swim) bowCarryArm(h, smooth01(BOW.cw));   // BOW-CARRY: the bow hand rides still at the left hip
  if (!BOW.on || W.aimW < 0.002 || P.ride || P.swim) return;
  const k = W.aimW, ch = W.aim ? W.aim.charge : 1;
  yawBone(h.bones.spine_02, -0.55 * k);              // side-on: the bow shoulder toward the mark
  h.bones.spine_02.updateWorldMatrix(false, true);
  bowAimDir(_bD);
  const fx = _bD.x, fz = _bD.z, hl = Math.hypot(fx, fz) || 1, rx = -fz / hl, rz = fx / hl;
  h.bones.upperarm_l.getWorldPosition(_bA);          // left fist out along the line of sight
  _bA.addScaledVector(_bD, 0.6); _bA.x += rx * 0.04; _bA.z += rz * 0.04;
  _bB.copy(_bA); _bB.y -= 0.5; _bB.x -= rx * 0.2; _bB.z -= rz * 0.2;
  ik2(h, 'l', _bA, _bB, k);
  h.bones.Head.getWorldPosition(_bC);                // right fist: from the nocking point to the cheek with the draw
  { const c = BOWC.draw; _bC.y += c.y; _bC.x += rx * c.r + _bD.x * c.f; _bC.z += rz * c.r + _bD.z * c.f; }   // BOW-CARRY r3: the anchor at the jaw, out from the neck
  _bB.copy(_bA).addScaledVector(_bD, -0.32);
  _bC.lerp(_bB, 1 - ch);
  _bB.copy(_bC).addScaledVector(_bD, -0.35); _bB.x += rx * 0.22; _bB.z += rz * 0.22; _bB.y += 0.08;
  ik2(h, 'r', _bC, _bB, k);
});
// After every other override (order 99): the bow in the left fist or across the back, the quiver on the back,
// the string pulled to the right fist and the nocked arrow along it.
const wp = (b, v) => { b.updateWorldMatrix(true, false); return v.setFromMatrixPosition(b.matrixWorld); };
P.h.addOverride('bowProps', 99, (h) => {
  const body = h.root.visible && !(P.rest > 0);
  bowMesh.visible = !!S.tools.bow && body; quiverMesh.visible = !!S.tools.quiver && body; nockArrow.visible = false;
  if (P.sit > 0 && body) {                            // seated: leaning at the bench end, or (other seats) set aside like the spear
    if (BOW.bench) { const b = BOW.bench; bowMesh.position.copy(b.bp); bowMesh.quaternion.copy(b.bq); bowMesh.userData.setNock(null); quiverMesh.position.copy(b.qp); quiverMesh.quaternion.copy(b.qq); quiverMesh.userData.setCount(S.inv.arrow || 0); }
    else bowMesh.visible = quiverMesh.visible = false;
    return;
  }
  BOW.bench = null;
  const f = P.face, fx = Math.sin(f), fz = Math.cos(f), rx = -fz, rz = fx;
  if (quiverMesh.visible) {
    const c = BOWC.qv; bowTorso(h);                   // BOW-CARRY: on the back, right of the spine, the mouth past the right shoulder
    _bA.copy(_bwU).multiplyScalar(Math.cos(c.roll)).addScaledVector(_bwR, Math.sin(c.roll)).addScaledVector(_bwF, c.lean);
    bowBasis(quiverMesh.quaternion, _bA, _bwR);
    wp(h.bones.spine_03, _bA).addScaledVector(_bwU, c.u).addScaledVector(_bwF, -c.b).addScaledVector(_bwR, c.s); quiverMesh.position.copy(_bA);
    quiverMesh.userData.setCount(S.inv.arrow || 0);
  }
  // the spear on the back stands right in the over-the-shoulder view while drawing: hide it until the bow comes down
  const hideSp = BOW.on && W.aimW > 0.05 && !W.spearOut && h.slotOf(h.spear) === 'back';
  if (hideSp && h.spear.visible) { h.spear.visible = false; BOW.hidSpear = true; }
  else if (!hideSp && BOW.hidSpear) { BOW.hidSpear = false; if (!W.spearOut && !W.seatHid && !W.props) h.spear.visible = true; }
  if (!bowMesh.visible) return;
  const inHand = BOW.on && !P.ride && !P.swim && !(P.sit > 0) && !wBusy();
  const zx = _bD, up = _bB, xAx = _bC;
  if (inHand) {
    const drawn = W.aimW > 0.3;
    bowAimDir(zx);
    up.set(0, 1, 0).addScaledVector(xAx.set(rx, 0, rz), -0.18).normalize();   // a slight cant when drawn
    xAx.crossVectors(up, zx).normalize(); up.crossVectors(zx, xAx).normalize();
    _bM.makeBasis(xAx, up, zx); bowMesh.quaternion.setFromRotationMatrix(_bM);
    const rz01 = smooth01((W.aimW - 0.05) / 0.5);    // BOW-CARRY: carried level at the hip; it turns up into the draw as the arm rises
    if (rz01 < 1) { bowHips(h); bowMesh.quaternion.slerp(bowCarryQuat(_bwQ), 1 - rz01); }
    wp(h.bones.hand_l, _bA); bowMesh.position.copy(_bA);
    bowMesh.updateMatrixWorld(true);
    if (W.aim && drawn) {
      const hr = wp(h.bones.hand_r, new THREE.Vector3());
      bowMesh.userData.setNock(bowMesh.worldToLocal(hr.clone()));
      const dir = _bA.clone().sub(hr).normalize();     // from the string hand through the grip
      nockArrow.visible = true; nockArrow.position.copy(hr).addScaledVector(dir, ARROW_LEN); nockArrow.lookAt(_bA.copy(nockArrow.position).add(dir));
    } else bowMesh.userData.setNock(null);
  } else {                                            // slung across the back, right shoulder to left hip (BOW-CARRY)
    const c = BOWC.sl; bowTorso(h);
    _bA.copy(_bwU).multiplyScalar(Math.cos(c.roll)).addScaledVector(_bwR, Math.sin(c.roll)).addScaledVector(_bwF, c.lean);   // the top over the right shoulder and a little forward: the lower limb stands off the seat
    _bB.copy(_bwR).multiplyScalar(Math.cos(c.twist)).addScaledVector(_bwF, Math.sin(c.twist));   // turned about the stave: the tips and the string ride behind it, off the back
    bowBasis(bowMesh.quaternion, _bA, _bB);
    wp(h.bones.spine_03, _bA).addScaledVector(_bwU, c.u).addScaledVector(_bwF, -c.b).addScaledVector(_bwR, c.s);
    bowMesh.position.copy(_bA); bowMesh.userData.setNock(null);
  }
});
// Sitting on a fire's bench: the bow stands upright at the far end of the log (the spear is planted at the near end),
// tipped 12 degrees away from the fire, and the quiver leans against it, mouth up.
function bowBench(s) {
  if (!S.tools.bow && !S.tools.quiver) return;
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), lx = sn, lz = c;
  const ox = P.pos.x - s.x, oz = P.pos.z - s.z, od = Math.hypot(ox, oz) || 1, ax = ox / od, az = oz / od;
  const x = P.pos.x - lx * 0.72 + ax * 0.3, z = P.pos.z - lz * 0.72 + az * 0.3, y = getHeight(x, z);
  const up = new THREE.Vector3(ax * Math.sin(0.21), Math.cos(0.21), az * Math.sin(0.21)), back = new THREE.Vector3(ax, 0, az), side = new THREE.Vector3().crossVectors(up, back).normalize();
  const bq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, new THREE.Vector3().crossVectors(side, up)));   // the limbs upright, the string toward the fire
  const bp = new THREE.Vector3(x, y + 0.7, z);
  const qp = new THREE.Vector3(x - lx * 0.16 + ax * 0.06, y + 0.29, z - lz * 0.16 + az * 0.06);
  const qq = new THREE.Quaternion().setFromAxisAngle(side, 0.0).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ax * 0.25 + lx * 0.1, 1, az * 0.25 + lz * 0.1).normalize()));
  BOW.bench = { bp, bq, qp, qq };
}
// Side quest "The Hunter's Bow": offered by Sena after the cave, shown under the chapter goals.
const BOWQ = () => [
  ['Craft a bow', () => !!S.tools.bow], ['Craft a quiver', () => !!S.tools.quiver], ['Make 6 flint arrows', () => cnt('arrow_made') >= 6],
  ['Hit an animal from 15 m', () => cnt('arrow_far') >= 1], ['Bring down a deer with an arrow', () => cnt('arrow_deer') >= 1], ['Pick up 3 arrows', () => cnt('arrow_pick') >= 3]];
// BOW-Q: the side line shows only once Sena has offered the quest. drawQuest() calls bowQuestFit() after it renders:
// in a long chapter (5+ goals), or when the panel would reach down to the minimap, the line folds to a short
// "Side · Hunter's Bow 2/6"; if even that does not fit, it hides (the toasts still mark each step).
function bowQuestHtml() {
  if (!bowUnlocked() || S.c.bowQDone || !S.c.bowOffer) return '';
  const q = BOWQ(), n = q.filter(([, f]) => f()).length, next = q.find(([, f]) => !f());
  return `<div class="bowq" data-short="Side · Hunter's Bow ${n}/${q.length}" style="margin-top:4px;opacity:.85;font-style:italic">Side · The Hunter's Bow ${n}/${q.length}: ${next ? next[0] : 'done'}</div>`;
}
function bowQuestFit() {
  const el = $('goals').querySelector('.bowq');
  if (!el) return;
  const goals = $('goals').children.length - 1;
  if (goals >= 5) el.textContent = el.dataset.short;
  const over = () => { const b = $('bars').getBoundingClientRect(); return b.height > 0 && $('quest').getBoundingClientRect().bottom + 6 > b.top; };
  if (over() && el.textContent !== el.dataset.short) el.textContent = el.dataset.short;
  if (over()) el.style.display = 'none';
}
addEventListener('resize', () => { if (S?.c) drawQuest(); });
// BOW-Q: Sena makes the offer only in a quiet stretch: 6 s with no lines playing or queued for her, no banner,
// chapter card, choice or ARC scene, out of the caves, and well away from the story spots and from places not yet
// found (their discovery banner and the chapter's beat would land on top of her words).
const BOWQ_SPOTS = { smoke: ['camp0', 'ford'], outcast: ['trail', 'tree', 'grave'], sling: ['sling'], winter: ['sling'], clay: ['lake'], house: ['lake'], bond: ['stones'] };   // each chapter's own story spots
function bowQuiet() {
  if (subT > 0 || subs.length || arcHold() || MAT.choice || camShot || S.arc?.pending?.length) return false;
  if ($('event').classList.contains('on') || $('card').classList.contains('on') || world.env.cave > 0.05) return false;
  if (CH[S.ch].id === 'fever' && !S.arc.feverDone) return false;   // ARC: never while Sena lies in fever
  const p = P.pos;
  for (const q of POIS) if (!S.found[q.id] && q.x != null && Math.hypot(q.x - p.x, q.z - p.z) < q.r + 25) return false;
  for (const id of BOWQ_SPOTS[CH[S.ch].id] || []) { const v = arcSpot(id); if (v && Math.hypot(v[0] - p.x, v[1] - p.z) < 70) return false; }
  const w = arcWhere(CH[S.ch].id), h = arcHome();
  if (w && !(h && Math.hypot(w[0] - h.x, w[1] - h.z) < 12) && Math.hypot(w[0] - p.x, w[1] - p.z) < 70) return false;
  return Math.hypot(N.pos.x - p.x, N.pos.z - p.z) < 14;               // she says it beside him
}
function bowSideQuest() {
  if (!playing || busy || !bowUnlocked() || S.c.bowQDone) return;
  if (!S.c.bowOffer) {
    if (!bowQuiet()) { BOW.quietT = clock; return; }
    if (clock - (BOW.quietT ?? clock) < 6) return;
    S.c.bowOffer = 1;
    say('Sena', 'The flint we chipped in the hollow... bind a point to a straight shaft and you could take a deer from twice a spear\'s throw. Let me show you how to string a bow.');
    toast('New side quest: The Hunter\'s Bow'); drawQuest();
  } else if (BOWQ().every(([, f]) => f())) {
    S.c.bowQDone = 1; addClose(3, 'learned the bow together');
    say('Sena', 'Look at you. The herds will have to learn to fear us from further off now.');
    toast('Side quest complete: The Hunter\'s Bow'); drawQuest();
  }
}

// ----- per-frame (updatePlayer end, updateRide)
function wpnUpdate(dt) {
  const h = P.h;
  W.manualT -= dt; W.punch = Math.max(0, W.punch - dt); W.recoil = Math.max(0, (W.recoil || 0) - dt);
  trauma = Math.max(0, trauma - 1.5 * dt);
  const ok = `${hasAxe()}${hasSpear()}${!!S.tools.flintaxe}${!!S.tools.flintspear}${!!S.tools.torch}`;
  if (ok !== W.ownKey) { W.ownKey = ok; wpnSync(); }
  { const ik = W.spearOut && spearWhere(); if (ik !== W.invOut) { W.invOut = ik; drawInv(); wpnHud(); } }   // WH: the pack line says where the thrown spear is
  wpnBackFit();                                      // WH: the spear's carry on the back (on foot, saddle, water)
  { const sh = (P.sit > 0 && !P.sitIn || seatedPose(P.h)) && P.h.slotOf(P.h.spear) === 'back' && !W.spearOut;   // WH: seated, the spear is set down (as Sena's is) (SIT-r3: not while he walks to the seat)
    if (sh !== !!W.seatHid && !W.props) { W.seatHid = sh; if (!W.spearOut) P.h.spear.visible = !sh; } }   // (cinematics with W.props own the carry)
  if (W.restoreDrawn && clock > 0.2) { W.restoreDrawn = false; if (W.st === 'sheathed' && !P.ride && !P.swim && !wBusy() && !W.props) wpnSnapDrawn(); }
  if (!!P.ride !== W.wasRide) { W.wasRide = !!P.ride; if (W.aim) wpnCancelAim(); }
  if (P.cool > 0 && P.wantFace != null && !P.ride && view !== 'fpp') P.face = turn(P.face, P.wantFace, Math.min(1, dt * 18));
  if (keys.KeyQ && W.qDown && !W.qFired && performance.now() - W.qDown >= 300) { W.qFired = true; wpnToggle(true); }
  if (W.pend && (W.pend.t -= dt) <= 0) { const p = W.pend; W.pend = null; p.fn(); }
  if (W.lunge > 0) W.lunge = Math.max(0, W.lunge - dt);
  if (W.sw) { W.sw.t += dt; if (W.sw.t > W.sw.dur) W.sw = null; }
  const sprint = P.speed > 5.6 && !P.ride && !P.swim;
  // context stow
  if (P.swim) { if (W.st !== 'sheathed' || W.aim) wpnStowAll('swim', true); }
  else if (wBusy()) { if (W.st === 'drawn' || W.st === 'drawing' || W.aim) wpnStowAll('busy'); }
  else if (P.ride && !W.aim && W.st === 'drawn' && P.cool <= 0 && !W.queued) wpnSheathe(1.3);
  if (W.aim && (W.lastHp ?? S.hp) - S.hp >= 8) wpnCancelAim();                 // a heavy hit (8+) spoils the throw
  W.lastHp = S.hp;
  // draw / sheathe motion
  if (W.st === 'drawing') {
    W.t += dt; const u = W.t / W.T, m = wMesh(W.held);
    if (!W.moved && u >= 0.45) { W.moved = true; if (m) { m.visible = true; h.place(m, sprint && W.held === 'spear' ? 'low' : 'hand', 0.12); } A.hit(2400, 0.04, 0.05); }
    if (u >= 1) { W.st = 'drawn'; W.idleT = 0; wpnHud(); const q = W.queued; W.queued = null; wpnRun(q); }
  } else if (W.st === 'sheathing') {
    W.t += dt; const u = W.t / W.T, m = wMesh(W.held);
    if (!W.moved && u >= 0.55) { W.moved = true; if (m) h.place(m, SHEATH[W.held], 0.12); A.hit(420, 0.08, 0.08); }
    if (u >= 1) { W.st = 'sheathed'; W.held = null; wpnHud(); wpnAfterSheathe(); }
  }
  // auto rules
  if (W.st === 'drawn' && !W.aim && !P.ride) {
    W.idleT += dt;
    if (W.idleT > 6 && !hostileNear(20)) wpnSheathe();
    W.sprintT = sprint ? W.sprintT + dt : 0;
    if (W.sprintT > 2 && !hostileNear(20)) wpnSheathe();
    if (nearHome() && !hostileNear(20)) { W.homeT += dt; if (W.homeT > 2) wpnSheathe(); } else W.homeT = 0;
  }
  if (W.st === 'sheathed' && settings.autoDraw !== false && W.manualT <= 0 && !P.ride && !P.swim && !wBusy() && hostileNear(15)) {
    if (W.sel === 'fists' && hasAxe()) { W.last = W.sel; W.sel = 'axe'; }
    if (W.sel === 'spear' && W.spearOut) W.sel = hasAxe() ? 'axe' : 'fists';
    wpnDraw();
  }
  // aim
  if (W.aim) {
    W.aim.t += dt; W.aim.charge = Math.min(1, W.aim.t / 0.6); W.idleT = 0;
    if (W.aim.bow) bowHold(dt);                        // BOW: a long hold at full draw tires the arms
    camera.getWorldDirection(aimDir);
    if (W.aim) arcUpdate(W.aim.charge);                // BOW: spent arms let the string down (W.aim cleared)
  }
  W.aimW += ((W.aim ? 1 : 0) - W.aimW) * Math.min(1, dt / 0.15 * 1.6);
  W.camK += ((W.aim ? 1 : 0) - W.camK) * (1 - Math.exp(-dt * 12));
  // the spear's carry: low (one-handed) when sprinting or with a lit torch
  const sp = h.spear;
  if (W.held === 'spear' && W.st === 'drawn' && !W.aim && sp.parent === h.sock.hand) {
    const want = sprint || torchOn ? 'low' : 'hand';
    if (sp.userData.slot !== want) h.place(sp, want, 0.2);
  }
  // stance weights
  const inHand = W.held && (W.st === 'drawn' || (W.st === 'drawing' && W.moved) || (W.st === 'sheathing' && !W.moved));
  const lowCarry = W.held === 'spear' && sp.userData.slot === 'low';
  const stT = inHand && W.st !== 'sheathing' && !sprint && !P.swim && !P.ride && !W.aim && !lowCarry ? (P.speed > 0.5 ? 0.5 : 0.85) : 0;
  W.stW += (stT - W.stW) * Math.min(1, dt * 8);
  W.torchW += ((torchOn && !P.swim && !W.aim ? (P.ride ? 0.55 : 0.9) : 0) - W.torchW) * Math.min(1, dt * 6);
  const lhT = W.held === 'spear' && inHand && W.st !== 'sheathing' && sp.userData.slot === 'hand' && !torchOn && !P.ride && !sprint && !P.swim ? (P.speed > 2.4 ? 0.8 : P.speed > 0.5 ? 0.92 : 1) : 0;
  W.lhW += (lhT - W.lhW) * Math.min(1, dt * 8);      // the two-handed spear stance
  h.gripR += ((inHand && W.held !== 'fists') || W.aim || (W.held === 'fists' && W.stW > 0.2) ? 1 - h.gripR : -h.gripR) * Math.min(1, dt * 10);
  h.gripL += ((torchOn || W.lhW > 0.3 || (W.held === 'fists' && W.stW > 0.2)) ? 1 - h.gripL : -h.gripL) * Math.min(1, dt * 10);
  W.vmDraw = inHand ? (W.st === 'drawing' ? THREE.MathUtils.clamp((W.t / W.T - 0.3) / 0.7, 0, 1) : W.st === 'sheathing' ? 1 - THREE.MathUtils.clamp(W.t / W.T / 0.55, 0, 1) : 1) : 0;
  if (W.benchSpear && !(P.sit > 0)) wpnUnSit();     // the sit ended some other way (die, a fade)
  if (W.props && !busy) { W.propsT = (W.propsT || 0) + dt; if (W.propsT > 1.5) wpnWake(); } else W.propsT = 0;   // a rest that never woke us
  if (!!W.aim !== W.crossAim) { W.crossAim = !!W.aim; $('cross').classList.toggle('aim', W.crossAim); }
  wpnTorch(); wpnSpearTick(dt); wpnSena(dt); wpnPuffs(dt); bowTick(dt);   // BOW
}
// The torch: in the left hand when lit, on the right hip when not (whenever Aro owns one).
function wpnTorch() {
  if (W.props) return;
  const t = torch.root;
  t.visible = !!S.tools.torch;
  const want = torchOn ? 'handL' : 'hipR';
  if (t.userData.slot !== want || !t.parent?.name?.startsWith('sock_')) P.h.place(t, want, t.parent?.name?.startsWith('sock_') ? 0.22 : 0);
}
// Sena: the carry basket on her back from the Shelter chapter; the old stone spear behind it once Aro has flint.
function wpnSena(dt) {
  const hide = (N.rest > 0 && !R.nOut) || !!N.ride || N.sit > 0 || seatedPose(N.h) || !!N.soak || !!N.soakOut || !!N.working || N.h.pose === 'work' || N.h.pose === 'dance' || !!ROM.fkHold;   // ARC-FIX4: no basket in the first-kiss beat; integration: R.nOut = walking out after a night, carrying them again
  if (!W.props) senaBasket.visible = reached('shelter') && !hide;
  N.h.spear.visible = !!S.tools.flintspear && !hide && !W.props;
  if (N.h.spear.userData.slot !== 'back') N.h.place(N.h.spear, 'back');
  N.h.gripL += ((senaLit ? 1 : 0) - N.h.gripL) * Math.min(1, dt * 10);
  if (proj.st !== 'sena') N.h.gripR += (0 - N.h.gripR) * Math.min(1, dt * 10);
  if (!senaTorch.root.userData.kind) { senaTorch.root.userData.kind = 'torch'; N.h.place(senaTorch.root, 'handL'); }
}
// Meshes into their sockets after a load or an ownership change (crafting a flint tool).
function wpnSync() {
  P.h.spear.userData.setFlint(!!S.tools.flintspear); P.h.axe.userData.setFlint(!!S.tools.flintaxe); proj.m.userData.setFlint(!!S.tools.flintspear);
  vmSpear.userData.setFlint(!!S.tools.flintspear); vmAxe.userData.setFlint(!!S.tools.flintaxe);
  torch.root.userData.kind = 'torch';
  if (!owns(W.sel)) W.sel = 'fists';
  if (!owns(W.last)) W.last = 'fists';
  if (W.held && !owns(W.held)) wpnSnapAway();
  if (!W.props) {
    for (const k of ['spear', 'axe']) {
      const m = wMesh(k);
      if (W.held !== k) P.h.place(m, SHEATH[k]);
      m.visible = owns(k) && !(k === 'spear' && W.spearOut);
    }
    wpnTorch();
  }
  wpnHud();
}
function wpnSave() { S.equip = W.sel; S.lastEquip = W.last; S.drawn = W.st === 'drawn' || W.st === 'drawing'; if (!W.spearOut) S.spearAt = null; }
function wpnLoad() {
  S.equip ??= 'fists'; S.lastEquip ??= 'fists';
  W.sel = owns(S.equip) ? S.equip : 'fists'; W.last = owns(S.lastEquip) ? S.lastEquip : 'fists';
  Object.assign(W, { st: 'sheathed', held: null, aim: null, queued: null, spearOut: false, props: false, stW: 0, lhW: 0, aimW: 0, camK: 0, invOut: undefined });
  proj.st = null; proj.m.visible = false; if (proj.m.parent !== scene) scene.attach(proj.m);
  const a = S.spearAt;
  if (a && hasSpear()) {
    proj.m.position.set(a.x, a.y, a.z); proj.m.quaternion.set(a.qx, a.qy, a.qz, a.qw); proj.m.scale.setScalar(1);
    proj.m.visible = true; proj.st = a.f ? 'float' : 'ground'; W.spearOut = true;
  } else S.spearAt = null;
  if (W.sel === 'spear' && W.spearOut) W.sel = 'fists';
  W.ownKey = ''; wpnSync();
  bowLoad();                                         // BOW
  W.restoreDrawn = !!S.drawn;                        // WH: drawn at save time: back in the hand on the first free frame (wpnUpdate)
}
// WH: snap the selected weapon into the hand (no draw motion, never the aim): a load that was saved with it drawn.
function wpnSnapDrawn() {
  if (!owns(W.sel) || (W.sel === 'spear' && W.spearOut)) return;
  const m = wMesh(W.sel);
  if (m) { m.visible = true; P.h.place(m, 'hand'); }
  W.held = W.sel; W.st = 'drawn'; W.moved = true; W.t = W.T = T_DRAW[W.sel]; W.idleT = W.homeT = W.sprintT = 0; W.manualT = 8;
  wpnHud();
}
// Sitting by the fire: the spear is planted in the ground at the end of Aro's bench (wpnUnSit takes it back).
function wpnBench(s) {
  wpnStowAll('sit', true);
  bowBench(s);                                       // BOW: the bow and quiver lean at the other end of the bench
  if (!hasSpear() || W.spearOut) return;
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), lx = sn, lz = c;               // the log runs along the fire's local Z
  const ox = P.pos.x - s.x, oz = P.pos.z - s.z, od = Math.hypot(ox, oz) || 1;
  const x = P.pos.x + lx * 0.45 + (ox / od) * 0.3, z = P.pos.z + lz * 0.45 + (oz / od) * 0.3, y = getHeight(x, z);
  const sp = P.h.spear; scene.attach(sp); sp.scale.setScalar(1);
  _w2.set((ox / od) * Math.sin(0.21), Math.cos(0.21), (oz / od) * Math.sin(0.21));                 // upright, 12° away from the fire
  sp.position.set(x, y - 0.12, z).addScaledVector(_w2, 0.95);                                         // butt planted in the ground
  sp.lookAt(_w1.copy(sp.position).add(_w2));
  W.benchSpear = true;
}
function wpnUnSit() {
  if (!W.benchSpear) return;
  W.benchSpear = false;
  if (!W.props) P.h.place(P.h.spear, 'back', 0.3);
}
// RST: the night. Everything goes away; axe, spear and torch become props by the bed; the basket on the floor.
function wpnRest(s, layPts = {}) {
  wpnStowAll('rest', true);
  if (W.spearOut) { if (proj.m.parent !== scene) scene.attach(proj.m); proj.st = null; proj.m.visible = false; W.spearOut = false; S.spearAt = null; N.fetch = null; P.h.spear.visible = true; W.returnedOvernight = true; }
  W.benchSpear = false; W.props = true;
  const put = (m, at, yaw, pitch, up = 0, roll = 0) => { if (!m || !at) return; scene.attach(m); m.scale.setScalar(1); m.rotation.set(pitch, yaw, roll, 'YXZ'); m.position.set(at.x, at.y + up, at.z); m.visible = true; };
  const rot = s?.rot || 0;
  const rack = structs.find((r) => r.kind === 'rack' && r.rise >= 1 && Math.hypot(r.x - (s?.x ?? P.pos.x), r.z - (s?.z ?? P.pos.z)) < 8);
  if (hasSpear()) {
    if (rack) put(P.h.spear, toWorld(rack, [0, 1.47, 0.06]), (rack.rot || 0) + Math.PI / 2, 0);
    else if (layPts.spear && s && s.cave !== undefined) put(P.h.spear, new THREE.Vector3(Math.sin(rot) * 0.9, 0, Math.cos(rot) * 0.9).add(layPts.spear), rot, 0, 0.04);   // integration: no wall in a cave, so it lies flat along the bed
    else if (layPts.spear) put(P.h.spear, layPts.spear, rot + Math.PI, -Math.PI / 2 + 0.26, 0.9);   // upright, leaning 15° toward the head wall
  }
  if (hasAxe() && layPts.axe) put(P.h.axe, layPts.axe, rot + 1.2, 0, 0.035, Math.PI / 2);          // flat on the floor
  if (S.tools.torch && layPts.axe) put(torch.root, _w1.copy(layPts.axe).add(_w2.set(Math.cos(rot) * 0.3, 0, -Math.sin(rot) * 0.3)), rot + 1.4, 0, 0.045);
  if (layPts.basket && senaBasket.visible) put(senaBasket, layPts.basket, rot, 0, 0.16);
  else senaBasket.visible = false;
  N.h.spear.visible = false;                         // integration: Sena's old spear off her back in bed (wpnSena shows it again after waking)
  wpnHud();
}
function wpnWake() {
  if (!W.props) return;
  P.h.swing('pickU', 1.4);
  const items = [[P.h.spear, 'back', P.h], [P.h.axe, 'hipL', P.h], [torch.root, 'hipR', P.h], [senaBasket, 'back', N.h]];
  items.forEach(([m, slot, h], i) => setTimeout(() => { h.place(m, slot, 0.25); if (i === items.length - 1) { W.props = false; wpnSync(); } }, i * 150));
  if (W.returnedOvernight) { W.returnedOvernight = false; setTimeout(() => toast('Sena brought your spear home last night'), 900); }
}
function wpnSpeed(sp, run) {                         // updatePlayer: drawn walk ×0.8, run ×0.9; aiming strafe ≤ 1.8
  if (W.aim) return Math.min(sp, 1.8);
  if (W.st === 'drawn' && W.held && !P.swim) return sp * (run ? 0.9 : 0.8);
  return sp;
}
// keys: 1 2 3 select, 4 torch, Q tap/hold
function wpnKey(code) {
  if (code === 'Digit1') wpnSelect('fists');
  else if (code === 'Digit2') wpnSelect('axe');
  else if (code === 'Digit3') wpnSelect('spear');
  else if (code === 'Digit4') toggleTorch();
}
function wpnQDown() { W.qDown = performance.now(); W.qFired = false; }
function wpnQUp() {
  if (!W.qDown) return;
  const tap = !W.qFired && performance.now() - W.qDown < 300;
  W.qDown = 0;
  if (tap && playing && !paused && !menuOpen && !busy) { if (W.last !== W.sel && owns(W.last) && !(W.last === 'spear' && W.spearOut)) wpnSelect(W.last); else toast('Nothing to swap to'); }
}
// HUD chip (state changes only)
function wpnHud() {
  const el = $('wpn'); if (!el) return;
  const out = W.spearOut, key = [W.sel, W.st === 'drawn' || W.st === 'drawing', hasAxe(), hasSpear(), out, !!S.tools.flintaxe, !!S.tools.flintspear, out && spearWhere(), !!S.tools.bow, BOW.on, S.inv.arrow > 0].join();   // BOW
  if (el.dataset.k === key) return; el.dataset.k = key;
  for (const s of el.querySelectorAll('[data-k]')) {
    const k = s.dataset.k; if (k === 'bow') continue;   // BOW: set below
    s.classList.toggle('cur', k === W.sel && !BOW.on); s.classList.toggle('off', !owns(k) || (k === 'spear' && out));
    s.classList.toggle('drawn', k === W.sel && (W.st === 'drawn' || W.st === 'drawing'));
    const n = s.querySelector('i');
    if (n) n.textContent = k === 'spear' ? (out ? 'Spear' + (spearWhere() ? ' — ' + spearWhere() : ' — thrown') : S.tools.flintspear ? 'Flint spear' : 'Spear') : k === 'axe' ? (S.tools.flintaxe ? 'Flint axe' : 'Axe') : 'Fists';
  }
  const bs = el.querySelector('[data-k="bow"]');      // BOW: the bow's slot (key 5), lit while it is out
  if (bs) { bs.style.display = S.tools.bow ? '' : 'none'; bs.classList.toggle('cur', BOW.on); bs.classList.toggle('drawn', BOW.on); bs.classList.toggle('off', !(S.inv.arrow > 0)); }
  el.style.display = hasAxe() || hasSpear() || S.tools.bow ? '' : 'none';
}

// ----- first-person viewmodel: its own scene and camera, drawn over the world after a depth clear
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.01, 10);
const vmHemi = new THREE.HemisphereLight(0xfff1dc, 0x4a3a28, 1), vmKey = new THREE.DirectionalLight(0xfff0d8, 0.9), vmFire = new THREE.PointLight(0xff9a4a, 0, 2.5, 1.2);
vmKey.position.set(-0.6, 1, 0.5); vmFire.position.set(-0.24, 0.05, -0.5);
vmScene.add(vmHemi, vmKey, vmFire);
const vmSkin = new THREE.MeshStandardMaterial({ color: 0xa87a5c, roughness: 0.85 }), vmWrap = new THREE.MeshStandardMaterial({ color: 0x5a4433, roughness: 1 });
function vmArm(side) {                               // origin at the fist; the forearm runs back, down and out off screen
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new RoundedBoxGeometry(0.078, 0.07, 0.1, 3, 0.024), vmSkin);
  const dir = new THREE.Vector3(side * 0.42, -0.5, 0.76).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.42, 14), vmSkin); fa.quaternion.copy(q); fa.position.copy(dir).multiplyScalar(0.25);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 14), vmWrap); cuff.quaternion.copy(q); cuff.position.copy(dir).multiplyScalar(0.075);
  g.add(fist, fa, cuff); vmScene.add(g);
  return g;
}
const vmR = vmArm(1), vmL = vmArm(-1);
const vmSpear = makeSpear(), vmAxe = makeAxe(), vmTorch = makeTorch();
vmTorch.lit = true; vmTorch.light.intensity = 0;
vmR.add(vmSpear, vmAxe); vmL.add(vmTorch.root);
// mesh +z along `dir`, mesh +y toward `up`; the mesh point at local z = `at` sits in the fist
function vmHold(m, dir, up, at) {
  const z = new THREE.Vector3(...dir).normalize(), x = new THREE.Vector3().crossVectors(new THREE.Vector3(...up), z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); m.position.copy(z).multiplyScalar(-at);
}
vmHold(vmSpear, [-0.1, 0.1, -1], [0, 1, 0], -0.35);           // tip forward, a little in and up
vmHold(vmAxe, [0.12, 0.6, -0.79], [0, 0.79, 0.6], 0.02);     // haft up and forward, head at the upper right, edge away (FPP-world: tipped further forward, so the head shows whole)
vmHold(vmTorch.root, [-0.07, 0.6, -0.8], [0, 0.8, 0.6], 0.12);   // FPP-world: gripped ~40% up the shaft, not at its butt like a broom
vmTorch.glow.visible = false;                                    // FPP-world: the viewmodel keeps its own tuned glow (vmGlow)
const vmGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffa040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
vmGlow.scale.setScalar(0.42); vmTorch.flame.add(vmGlow);
const VM = { r: new THREE.Vector3(0.16, -0.16, -0.42), l: new THREE.Vector3(-0.21, -0.18, -0.44) };
let vmYaw = 0, vmPitch = 0, vmSx = 0, vmSy = 0, vmOn = false;
function wpnVm(dt) {
  const fpp = view === 'fpp' && playing && !camShot && !P.swim && (!P.ride || !!W.aim);
  const showR = fpp && !BOW.on && (W.st !== 'sheathed' || !!W.aim || (W.sw && W.sw.k === 'throw'));   // BOW: no spear view model while the bow is out
  const showL = fpp && (torchOn || (W.held === 'fists' && W.st !== 'sheathed'));
  vmOn = showR || showL;
  vmR.visible = showR; vmL.visible = showL;
  if (!vmOn) { vmYaw = camYaw; vmPitch = camPitch; return; }
  vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();
  const E = world.env, day = (0.35 + 0.65 * (1 - E.night)) * (1 - 0.6 * E.cave);
  vmHemi.intensity = day * 1.1; vmKey.intensity = day * 0.9;
  vmFire.intensity = torchOn ? 2.4 + Math.sin(clock * 13) * 0.35 + Math.sin(clock * 29) * 0.2 : 0;
  // sway lags the look; bob follows the steps
  const dy = wrapA(camYaw - vmYaw), dp = camPitch - vmPitch; vmYaw = camYaw; vmPitch = camPitch;
  vmSx += (THREE.MathUtils.clamp(-dy * 0.9, -0.05, 0.05) - vmSx) * Math.min(1, dt * 9);
  vmSy += (THREE.MathUtils.clamp(dp * 0.9, -0.04, 0.04) - vmSy) * Math.min(1, dt * 9);
  const sk = Math.min(1, P.speed / 3), bob = Math.sin(P.step * 2.7) * 0.012 * sk, bx = Math.cos(P.step * 1.35) * 0.006 * sk;
  const k = W.held || (W.aim ? 'spear' : W.sw?.k === 'throw' ? 'spear' : 'fists');
  vmSpear.visible = k === 'spear' && !(W.sw?.k === 'throw' && W.sw.t > 0.12);
  vmAxe.visible = k === 'axe'; vmTorch.root.visible = torchOn;
  if (torchOn) { vmTorch.update(dt); vmGlow.material.opacity = 0.45 + Math.sin(clock * 17) * 0.08; }
  const drop = -0.45 * (1 - W.vmDraw), rec = (W.recoil || 0) / 0.12;
  vmR.position.set(VM.r.x + vmSx + bx, VM.r.y + vmSy + bob + drop, VM.r.z + rec * 0.03);
  vmR.rotation.set(0, 0, 0);
  vmL.position.set(VM.l.x + vmSx - bx, VM.l.y + vmSy + bob, VM.l.z);
  vmL.rotation.set(0, 0, 0);
  const sw = W.sw, u = sw ? Math.min(1, sw.t / Math.max(0.01, sw.dur)) : 0, ss = THREE.MathUtils.smoothstep;
  if (k === 'axe') {
    if (sw && sw.k === 'axe') {                        // wind up (head back), chop forward and down, recover
      const a = u < 0.35 ? ss(u, 0, 0.35) * 0.65 : u < 0.5 ? 0.65 - ss(u, 0.35, 0.5) * 1.75 : -1.1 + ss(u, 0.5, 1) * 1.1;
      vmR.rotation.x = a; vmR.position.y += a * 0.07; vmR.position.z -= Math.max(0, -a) * 0.1; vmR.position.x -= Math.max(0, -a) * 0.04;
    }
  } else if (k === 'spear') {
    if (sw && sw.k === 'spear') vmR.position.z -= Math.sin(Math.PI * u) * 0.3;
    if (W.aimW > 0.01) {                               // raised over the shoulder, pointing forward; charge pulls it back
      const a = W.aimW, ch = W.aim ? W.aim.charge : 0;
      vmR.position.lerp(_w1.set(0.2 + vmSx, -0.03 + vmSy, -0.3 + ch * 0.08), a);
      vmR.rotation.x = THREE.MathUtils.lerp(vmR.rotation.x, -0.08, a);
    }
    if (sw && sw.k === 'throw') { vmR.position.z -= Math.min(1, sw.t / 0.15) * 0.4; vmR.position.y += 0.05; }
  } else if (sw && (sw.k === 'jab' || sw.k === 'cross')) {
    const g = sw.k === 'jab' ? vmR : vmL;
    g.position.z -= Math.sin(Math.PI * u) * 0.22; g.position.x += (g === vmR ? -1 : 1) * Math.sin(Math.PI * u) * 0.06;
  }
  if (k === 'fists' && W.st !== 'sheathed') { vmR.position.y += 0.03; vmL.position.y = VM.l.y + 0.03 + vmSy + bob + drop; vmR.rotation.z = 0.2; vmL.rotation.z = -0.2; }
  if (!showR) vmR.visible = false;
}
// G hooks
function wpnState() {
  const par = (m) => (m.parent && m.parent.name?.startsWith('sock_') ? m.userData.slot : m.parent === scene ? 'world' : m.parent ? 'other' : null);
  return { sel: W.sel, last: W.last, st: W.st, held: W.held, aim: W.aim && { t: W.aim.t, charge: W.aim.charge }, spearOut: W.spearOut, spearAt: S.spearAt, proj: proj.st,
    parents: { spear: W.spearOut ? (proj.st === 'sena' ? 'sena' : 'out') : par(P.h.spear), axe: hasAxe() ? par(P.h.axe) : null, torch: S.tools.torch ? par(torch.root) : null },
    vis: { spear: P.h.spear.visible, axe: P.h.axe.visible, torch: torch.root.visible, proj: proj.m.visible }, gripR: P.h.gripR, gripL: P.h.gripL, stW: W.stW, lhW: W.lhW };
}

// ---------- building ----------
// WP2 construction sites: timed kinds are raised by hand (Aro holds E, Sena works on the far side; faster together).
const BUILD_TIME = { hut: 16, kiln: 10, house: 36, farm: 5, well: 12, stable: 14 };
const toWorld = (s, [lx, ly, lz]) => { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); return new THREE.Vector3(s.x + lx * c + lz * sn, s.group.position.y + ly, s.z - lx * sn + lz * c); };
// SAVE-PERF: campfire lights come from a fixed pool of two, always in the scene. Each campfire used to bring its own
// PointLight, and a new light changes every lit shader, so building a fire (or loading near one) recompiled them all in
// the middle of play. The fires keep their own lights (out of the scene, still flickered by their update()); the pool
// copies the two nearest to the camera, which is all the light's 26 m reach ever needs.
const FIRE_LIGHTS = [0, 1].map(() => { const l = new THREE.PointLight(0xff8336, 0, 26, 1.6); l.position.set(0, -300, 0); scene.add(l); return l; });
const fireSrc = [];
function poolFireLight(st) {
  const ls = []; st.group.traverse((o) => { if (o.isPointLight) ls.push(o); });
  if (ls.length) st.group.updateMatrixWorld(true);
  for (const l of ls) { const pos = st.group.localToWorld(l.position.clone()); l.removeFromParent(); fireSrc.push({ st, light: l, pos }); }
}
function updateFireLights() {
  for (let i = fireSrc.length - 1; i >= 0; i--) if (!structs.includes(fireSrc[i].st)) fireSrc.splice(i, 1);
  const c = camera.position, d2 = (f) => (f.pos.x - c.x) ** 2 + (f.pos.z - c.z) ** 2;
  const near = fireSrc.length > 2 ? [...fireSrc].sort((a, b) => d2(a) - d2(b)) : fireSrc;
  FIRE_LIGHTS.forEach((l, i) => {
    const f = near[i];
    if (!f) { l.intensity = 0; return; }
    if (f.st.rise < 1) f.pos = f.st.group.localToWorld(f.light.position.clone());   // still rising out of the ground
    l.position.copy(f.pos); l.color.copy(f.light.color); l.distance = f.light.distance; l.decay = f.light.decay;
    l.intensity = f.st.group.visible ? f.light.intensity : 0;
  });
}
function placeStruct(kind, x, z, rot, instant, grow, p) {
  const st = makeStructure(kind);
  if (p != null && BUILD_TIME[kind]) instant = false;            // WP2: a half-built site from a save
  Object.assign(st, { x, z, rot, rise: instant ? 1 : 0 });
  if (grow != null) st.grow = grow;
  st.group.position.set(x, getHeight(x, z), z);
  if (kind === 'house') { const c = Math.cos(rot || 0), n = Math.sin(rot || 0), y0 = st.group.position.y; let m = y0; for (const [a, b] of [[3.1, 2.5], [-3.1, 2.5], [3.1, -2.5], [-3.1, -2.5], [0, 2.5], [0, -2.5], [3.1, 0], [-3.1, 0]]) m = Math.max(m, getHeight(x + a * c + b * n, z - a * n + b * c) - 0.13); st.group.position.y = Math.min(m, y0 + 0.9); }   // ARC-FIX: the floor sits above the ground at every corner (uphill ground showed through the floor in the vigil shot)
  st.group.rotation.y = rot;
  scene.add(st.group);
  poolFireLight(st);                                   // SAVE-PERF: the campfire's light joins the fixed pool (no recompile)
  structs.push(st);
  if (st.solid) st.col = addCollider({ x, z, r: st.radius * (kind === 'house' ? 0.8 : 0.9) });
  // WP2: small local colliders (stable back wall, fence, basket) instead of one solid circle
  if (st.cols) st.colList = st.cols.map(([lx, lz, r]) => { const w = toWorld(st, [lx, 0, lz]); return addCollider({ x: w.x, z: w.z, r }); });
  if (kind === 'house') fppHouseCols(st);             // FPP wall colliders: no more walking into the corners
  if (BUILD_TIME[kind] && !instant) {
    Object.assign(st, { timed: true, rise: clamp(p || 0, 0, 0.999), byA: 0, byN: 0 });
    st.scaf = makeScaffold(st.radius); st.scaf.position.copy(st.group.position); st.scaf.rotation.y = rot; scene.add(st.scaf);
    siteLook(st);
  } else st.stage?.(1);
  world.clear(x, z, st.radius + 0.4);
  for (const f of world.fields) for (const n of f.nodes) if (n.alive && Math.hypot(n.x - x, n.z - z) < st.radius + 0.6) { n.gone = true; f.set(n, false); }
  for (const f of world.decor || []) for (const n of f.nodes) if (n.alive && Math.hypot(n.x - x, n.z - z) < st.radius + 0.5 + 0.8 * n.s) f.set(n, false);   // the berry bush bodies (and their colliders) go too
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
  if (r.item === 'arrow' && (S.inv.arrow || 0) >= bowCap()) { for (const k in r.cost) S.inv[k] += r.cost[k]; toast(S.tools.quiver ? 'Your quiver is full' : 'You can carry only 8 arrows without a quiver'); drawInv(); return; }   // BOW
  if (r.item) { const n = r.item === 'arrow' ? Math.min(r.n || 1, bowCap() - (S.inv.arrow || 0)) : 1; S.inv[r.item] = (S.inv[r.item] || 0) + n; if (r.item === 'arrow') bump('arrow_made', n); } else S.tools[r.id] = true;   // BOW: arrows come 3 at a time, up to the carry cap
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
  if (S.home.nursery && !h.annexCol) {
    const w = toWorld(h, [-4.8, 0, 0]); h.annexCol = addCollider({ x: w.x, z: w.z, r: 1.7 });
    world.clear(w.x, w.z, 2.4);                                                    // no grass through the nursery floor
    for (const f of world.fields) for (const n of f.nodes) if (n.alive && Math.hypot(n.x - w.x, n.z - w.z) < 2.3) { n.gone = true; f.set(n, false); }
    for (const f of world.decor || []) for (const n of f.nodes) if (n.alive && Math.hypot(n.x - w.x, n.z - w.z) < 2.4 + 0.8 * n.s) f.set(n, false);
  }
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
  rstTick(dt);                                     // RST: the rested buff and its chip, Sena's line after a night apart
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
  if (NODE[n.field.kind]?.[2] || n.field.kind === 'tree') respawns.push({ n, at: clock + (NODE[n.field.kind]?.[2] ? matRespawnAt(n.field.kind) : 420) });   // MAT nodeK scarcity
}
// STORY: a horse standing by must not steal the fire, the hearth or the bed. Its prompt wins only when Aro faces it.
function horseFaced(p) {
  const fx = Math.sin(P.face), fz = Math.cos(P.face);
  return animals.some((a) => {
    if (!a.horse || a.state !== 'live') return false;
    const dx = a.root.position.x - p.x, dz = a.root.position.z - p.z, d = Math.hypot(dx, dz);
    return d < 3 && (d < 0.8 || (dx * fx + dz * fz) / d > 0.5);
  });
}
function findTarget() {
  const p = P.pos;
  if (!P.ride) { const bt = bowTarget(p); if (bt) return bt; }   // BOW: arrows to pick up
  const w4 = wp4Target(p); if (P.ride) return w4;     // WP4 horses: ride, feed, offer, tame; only "Dismount" while riding
  if (w4) { const ct = cmbTarget(p); if (ct) return ct; }   // WH: reviving a downed Sena always beats the horse
  if (w4 && horseFaced(p)) return w4;
  const o = findOtherTarget(p);                       // STORY: sit with Sena, a meal, a revive or a story beat beats a horse he is not facing
  return w4 && !o?.key ? w4 : o;
}
function findOtherTarget(p) {
  const wt = wpnTarget(p); if (wt) return wt;          // WPN take back the thrown spear
  const ct = cmbTarget(p); if (ct) return ct;          // CMB revive Sena, decide a surrender, finish
  let best = null, bd = 1e9;
  const gt = goreTarget(p); if (gt) return gt;        // GORE: mercy kill (bedded prey), hold-E butchering (keeps MAT's respawn and loot)
  const arcT = arcTarget(p); if (arcT?.key) return arcT;   // ARC: story beats (Tamu, the bed, cairns, herbs, the scorched walls, give your share); ARC-FIX: before the meal (it masked 'Tend Tamu')
  // Share a meal with Sena, once a day.
  if (S.c.mealDay !== S.day && !N.sit && Math.hypot(N.pos.x - p.x, N.pos.z - p.z) < 2.2 && !svSpitAt(p)) {   // SURV-FIX: food on the spit in reach comes first (it burns)
    const k = ['cooked', 'grilled', 'bread'].find((k) => S.inv[k] > 0);
    if (k) return { label: 'Share a meal with Sena', key: true, act() { shareMeal(k); } };
  }
  if (arcT) return arcT;                              // ARC-FIX: a story hint (no action) still beats the rest
  { const sv = survTarget(p); if (sv) return sv; }   // SURV: bandage Sena, ask her to tend your wounds, lean on her (when ROM's menu is absent)
  { const hp = !cnt('handprint') && S.inv.ochre >= 1 && depthAt(p.x, p.z) > 0 && wp3Target(p, 9); if (hp?.key && /handprints/.test(hp.label)) return hp; }   // MAT-SV r3: at the bare wall with ochre, the handprints (they need Sena beside him) beat her own menu (play.json flaked here)
  { const rt = romTarget(p); if (rt) return rt; }   // ROM: Sena (hold E) menu, after the shared meal and SURV
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
      if (!hasAxe()) return { label: 'You need a stone axe to fell trees' };   // WPN: the flint axe counts too
      return { label: 'Chop tree', key: true, act() { wpnChop(best); } };   // WPN: draws the axe, faces the tree, wood at contact
    }
    return { label: NODE[k][0], key: true, act() { P.h.swing(); NODE[k][1](); if (k !== 'clay') take(best); A.hit(k === 'clay' ? 300 : 1700, 0.09, 0.3); } };
  }
  if (getHeight(p.x, p.z) < 0.45) return survRiverTarget(p);   // SURV: river or lake water (dysentery roll by biome), fills the skin raw
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
  if (!musicSting('poi')) { A.tone(784, 0.5, 0.06); A.tone(1046, 0.7, 0.04, 0.15); }   // MUS discovery stinger
  if (id === 'ruins') give('brick', 6);
  // WP5 map: reveal the fog around the place (the peak and stones see far), +1 bond when found on horseback
  reveal(p.x ?? P.pos.x, p.z ?? P.pos.z, id === 'peak' ? 230 : id === 'stones' ? 80 : p.r + 20);
  if (P.ride && S.horse) S.horse.bond = Math.min(400, (S.horse.bond || 0) + 1);
  drawQuest();
  return true;
}
function soakTogether() {
  // SIT-r3: they wade in and sit on the pool floor with their legs out (the hearth floor sit: hips on the bottom, chest
  // and shoulders out of the water), side by side and facing the middle. The chair-sit pose sank the shins through the
  // floor, and both used to pop into the pool and out of it. Standing up eases the root back up (fsW).
  const sp = LMK.spring, a = Math.atan2(P.pos.x - sp.x, P.pos.z - sp.z), wl = sp.water ?? sp.y + 0.6;
  const seats = [[a, 0.1], [a + 0.45, -0.1]].map(([an, tw]) => {
    const x = sp.x + Math.sin(an) * 2.4, z = sp.z + Math.cos(an) * 2.4;
    return [x, z, Math.atan2(sp.x - x, sp.z - z) + tw];                  // a little toward each other
  });
  const far = sitApproach(P, seats[0]) | sitApproach(N, seats[1]);
  if (far) dipCut();
  const pose = (e) => (e === N && N.h.has('sitTalk') ? 'sitTalk' : 'sit');
  const sit = (e) => { const v = new THREE.Vector3(e.pos.x, getHeight(e.pos.x, e.pos.z), e.pos.z); e.pos.copy(v); e.seat = v; e.floorSit = 1; };
  for (const [e, st] of [[P, seats[0]], [N, seats[1]]]) {
    e.vx = e.vz = 0; e.soak = true; e.fire = null;
    sitWalkIn(e, st[0], st[1], st[2], pose(e), sit);
    e.sit = 600 + e.sitIn.dur;                       // STORY: soak until a movement key, Space or E (like the hearth sit)
  }
  P.auto = false; P.sneak = false; N.node = null; N.act = 0;
  if (view !== 'fpp') {                              // SIT-r3: a held two-shot from across the pool (the follow camera looked at his back)
    const am = a + 0.225, mx = sp.x + Math.sin(am) * 2.4, mz = sp.z + Math.cos(am) * 2.4;
    camShot = { pos: new THREE.Vector3(sp.x - Math.sin(am) * 1.7, wl + 1.25, sp.z - Math.cos(am) * 1.7), look: new THREE.Vector3(mx, wl + 0.3, mz), t: 1e9, hearthSit: true, ease: true, snap: false };
  }
  S.warm = 100; S.hp = Math.min(100, S.hp + 20); bump('soak');
  survSoak();                                        // SURV: the hot water cures hypothermia and eases a sprain
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
      if (d < 2.2) { const r = rstPrompt(rstCaveStruct(b), (l, a) => t(d, l === 'Rest until dawn' ? 'Shelter here until dawn' : l, a)); if (r) return r; }   // RST: the rest menu, same rules as hut/house
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
  for (const e of [P, N]) if (e.soak && !(e.sit > 0)) {
    e.soak = false; e.seat = null; e.floorSit = 0; if (seatedPose(e.h)) { e.h.pose = null; e.h.swing('standUp', 1.15); }   // SIT-r3: up off the pool floor (fsW eases the root)
    if (e === N) {                                   // round 2: she wades out to the first dry ground on her side, not left standing in the pool
      const sp = LMK.spring, a = Math.atan2(N.pos.x - sp.x, N.pos.z - sp.z), wl = sp.water ?? sp.y + 0.6;
      let r = Math.hypot(N.pos.x - sp.x, N.pos.z - sp.z);
      while (r < 9 && getHeight(sp.x + Math.sin(a) * r, sp.z + Math.cos(a) * r) < wl - 0.05) r += 0.25;
      N.soakOut = true; N.soakT = 0; N.path = [new THREE.Vector3(sp.x + Math.sin(a) * (r + 0.7), 0, sp.z + Math.cos(a) * (r + 0.7))];
    }
  }
  if (P.soak && P.seat) P.pos.y = P.seat.y;         // SIT-r3: no seat yet while he wades in
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
    case 'fire': return survFire(s, t);              // SURV: the spit (Survivor/Hardcore), boiling, teas, sit, bake; Story keeps the instant cook
    case 'kiln':
      if (S.inv.clay >= 2 && S.inv.wood >= 1) return t('Fire bricks (2 clay + 1 timber)', () => { S.inv.clay -= 2; S.inv.wood--; s.heat = 1; give('brick', 4); A.hit(180, 0.7, 0.5); });
      return t('Kiln — needs 2 clay and 1 timber');
    case 'hut': case 'house': return (s.kind === 'house' && hearthTarget(s, t)) || rstPrompt(s, t);   // STORY: sit by the hearth first, then rest   // RST rest menu (rules: wolves, just woke, nap by day)
    // WP2 placeables
    case 'rack': return survRack(s, t);              // SURV: dried meat that never spoils; 3 game hours on Survivor/Hardcore, rain stops it
    case 'basket': return survBasket(s, t);          // SURV: food ages travel with it (spoils x0.5, x0.35 in a cave)
    case 'flowers':
      if (S.c.flowerDay !== S.day) return t('Pick flowers for Sena', () => {
        S.c.flowerDay = S.day; bump('flowers'); P.h.swing('pick');
        say('Sena', ['For me? They smell like the meadow after rain.', 'You remembered. I will put them by the bed.', 'Thank you, Aro. Every day you find a new colour.'][cnt('flowers') % 3]);
        addClose(3, 'flowers');
      });
      return t('Flower bed — the flowers will open again tomorrow');
    case 'stable': return t(S.horse ? `Stable — ${hName()} sleeps here at night` : 'Stable — a dry home for your horse');   // WP4
    case 'farm':
      if (S.inv.spoiled > 0 && s.grow < 0.95) return t('Mulch the plot with spoiled food (+25% growth)', () => survMulch(s));   // SURV compost
      if (s.grow >= 1) return t('Harvest the crop', () => { s.grow = 0; bump('harvest'); give('grain', 10); P.h.swing(); });
      return t(`Crop is growing… ${Math.round(s.grow * 100)}%`);
    case 'well': return t('Draw water and drink', () => { S.water = 100; bump('drank'); A.hit(2600, 0.25, 0.2); toast('Fresh water'); svDrink('well'); fillSkin('well'); });   // SURV: well water is safe
  }
}
// ---------- closeness with Sena ----------
function addClose(n, why) {
  n = romCloseK(n);                                  // ROM: a rift halves the gains
  const was = S.close;
  S.close = clamp(S.close + n, 0, 100);
  if (S.close !== was) { toast(`♥ Closeness ${n >= 0 ? '+' : ''}${n}${why ? ` (${why})` : ''}`); A.tone(660, 0.5, 0.05); A.tone(880, 0.6, 0.04, 0.12); }
  $('b-close').style.width = S.close + '%';
  drawQuest();
}
// The campfire's two log benches sit at local x = ±1.6 m (see BUILD.fire); rotation.y = rot maps local +x to (cos, -sin).
const fireSeats = (s) => { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); return [[s.x - 1.6 * c, s.z + 1.6 * sn], [s.x + 1.6 * c, s.z - 1.6 * sn]]; };
function sitTogether(s) {
  const p0 = [P.pos.x, P.pos.z], n0 = [N.pos.x, N.pos.z];                // SIT-r3: where they stand now (they walk to the benches)
  let [a, b] = fireSeats(s);
  if (Math.hypot(b[0] - P.pos.x, b[1] - P.pos.z) < Math.hypot(a[0] - P.pos.x, a[1] - P.pos.z)) [a, b] = [b, a];   // Aro takes the nearer bench
  P.pos.set(a[0], 0, a[1]); N.pos.set(b[0], 0, b[1]);
  P.face = Math.atan2(s.x - a[0], s.z - a[1]); N.face = Math.atan2(s.x - b[0], s.z - b[1]);
  P.vx = P.vz = 0; P.auto = false; P.sneak = false; N.node = null; N.act = 0;
  P.sit = N.sit = 8; P.fire = N.fire = [s.x, s.z];
  romBench(s);                                       // ROM: one bench together (40+), before the spear is planted
  wpnStowAll('sit', true);                           // WPN stow (SIT-r3: the spear is planted by the bench when he gets there, below)
  // SIT-r3: no teleport onto the logs. The seats are set (above); each of them now walks there around the fire, turns
  // and sits down (Sitting_Enter). From further than a few steps away a quick dip hides the first part of the walk.
  const fp = [P.pos.x, P.pos.z, P.face], fn = [N.pos.x, N.pos.z, N.face];
  P.pos.set(p0[0], P.pos.y, p0[1]); N.pos.set(n0[0], N.pos.y, n0[1]);
  const far = sitApproach(P, fp, s) | sitApproach(N, fn, s);
  if (far) dipCut();
  sitWalkIn(P, fp[0], fp[1], fp[2], 'sit', (e) => { e.h.swing('sitDown', 1.25); wpnBench(s); }, s); sitWalkIn(N, fn[0], fn[1], fn[2], N.h.has('sitTalk') ? 'sitTalk' : 'sit', null, s);
  const lag = Math.max(P.sitIn.dur, N.sitIn.dur) + 0.9;                  // walking + turning + sitting down
  P.sit = N.sit = 8 + lag;
  if (view !== 'fpp') camShot = fireSitShot(s, fp, fn);                  // SIT-r3: a held two-shot across the fire (the follow camera hid her)
  const v = VIGNETTES[CH[S.ch].id];
  if (v) v[cnt('sat_fire') % v.length].forEach((l) => say(...l));
  S.time = (S.time + 1) % 24;
  if (S.c.satDay !== S.day) { S.c.satDay = S.day; addClose(3, 'sat by the fire'); }
  bump('sat_fire'); drawQuest();
  setTimeout(() => { if (P.sit > 0 && !P.sitIn) romSat(s); }, lag * 1000);   // ROM: heart events, the first-kiss fallback (once they are seated)
}
// SIT-r3: the held two-shot for the fire sit (camShot.ease: the camera glides there and back, see updateCamera).
// Two benches: from the side, between the logs and a little behind Aro, so both faces and the flames share the frame.
// One bench (ROM): from across the fire, a little off its axis, looking at the two of them past the flames.
function fireSitShot(s, fp, fn) {
  const g = getHeight(s.x, s.z), mx = (fp[0] + fn[0]) / 2, mz = (fp[1] + fn[1]) / 2;
  const ax = fp[0] - s.x, az = fp[1] - s.z, al = Math.hypot(ax, az) || 1, ux = ax / al, uz = az / al;   // fire -> Aro
  const one = Math.hypot(fp[0] - fn[0], fp[1] - fn[1]) < 1.6;
  let best = null;
  for (const sg of [1, -1]) {
    const px = -uz * sg, pz = ux * sg;               // across the line fire-Aro
    let dx, dz, dist;
    if (one) { dx = -ux * 0.88 + px * 0.47; dz = -uz * 0.88 + pz * 0.47; dist = 3.7; }   // past the fire, ~28 degrees off its axis
    else { dx = px * 0.92 + ux * 0.38; dz = pz * 0.92 + uz * 0.38; dist = 4.5; }          // side-on, eased toward Aro's shoulder
    const cx = s.x + dx * dist, cz = s.z + dz * dist, gy = getHeight(cx, cz);
    const pos = new THREE.Vector3(cx, Math.max(g, gy) + (one ? 1.9 : 1.7), cz);
    const lk = one ? new THREE.Vector3(mx, g + 0.8, mz) : new THREE.Vector3(s.x, g + 0.75, s.z);
    structCam(lk, pos);                              // never inside a hut or house wall
    const score = -Math.abs(gy - g) * 3 - pos.distanceTo(camPos) * 0.15 + pos.distanceTo(lk) * 0.5;
    if (!best || score > best.score) best = { pos, lk, score };
  }
  return { pos: best.pos, look: best.lk, t: 1e9, hearthSit: true, ease: true, snap: false };
}
// SIT-r3: the walk onto a seat. A start further than SIT_REACH from the seat is pulled in along the line (under a dipCut,
// returns true), so nobody walks for seconds. e.sitIn is stepped in settle(): an eased walk (around the fire, never
// through it), a turn to the seat's facing, then the sit pose with Sitting_Enter; `then` runs on arrival (floor sits).
const SIT_REACH = 4.8;
function sitApproach(e, to, fire) {
  const dx = e.pos.x - to[0], dz = e.pos.z - to[1], d = Math.hypot(dx, dz);
  if (d <= SIT_REACH) return false;
  let x = to[0] + (dx / d) * SIT_REACH, z = to[1] + (dz / d) * SIT_REACH;
  if (fire && Math.hypot(x - fire.x, z - fire.z) < 1.3) { const a = Math.atan2(to[0] - fire.x, to[1] - fire.z) + 0.9; x = fire.x + Math.sin(a) * 2.4; z = fire.z + Math.cos(a) * 2.4; }
  e.pos.x = x; e.pos.z = z; e.face = Math.atan2(to[0] - x, to[1] - z);
  return true;
}
function sitWalkIn(e, x1, z1, f1, pose, then = null, fire = null) {
  const x0 = e.pos.x, z0 = e.pos.z, d = Math.hypot(x1 - x0, z1 - z0);
  const si = { x0, z0, x1, z1, f1, pose, then, t: 0, turnT: 0, dur: clamp(d / 1.55, 0.4, 3.1), arc: null };
  if (fire) {                                        // the straight line passes the flames: walk the ring around them instead
    const ux = x1 - x0, uz = z1 - z0, L2 = ux * ux + uz * uz || 1, k = clamp(((fire.x - x0) * ux + (fire.z - z0) * uz) / L2, 0, 1);
    if (Math.hypot(x0 + ux * k - fire.x, z0 + uz * k - fire.z) < 1.25) {
      const a0 = Math.atan2(x0 - fire.x, z0 - fire.z), a1 = Math.atan2(x1 - fire.x, z1 - fire.z);
      const da = wrapA(a1 - a0), r0 = Math.hypot(x0 - fire.x, z0 - fire.z), r1 = Math.hypot(x1 - fire.x, z1 - fire.z);
      si.arc = { cx: fire.x, cz: fire.z, a0, da, r0: Math.max(r0, 1.3), r1 };
      si.dur = clamp((Math.abs(da) * Math.max(r0, r1, 1.6) + Math.abs(r1 - r0)) / 1.55, 0.5, 3.3);
    }
  }
  e.sitIn = si; e.h.pose = null; e.speed = 0; e.seat = null;
}
function sitInStep(e, dt) {
  const si = e.sitIn;
  if (!(e.sit > 0)) { e.sitIn = null; if (seatedPose(e.h)) e.h.pose = null; return; }   // the sit was ended some other way (a fade, a mount, a fall)
  if (si.t < si.dur) {
    si.t = Math.min(si.dur, si.t + dt);
    const k = si.t / si.dur, m = smooth01(k), px = e.pos.x, pz = e.pos.z;
    if (si.arc) {
      const A = si.arc, a = A.a0 + A.da * m, r = A.r0 + (A.r1 - A.r0) * m + 0.35 * Math.sin(Math.PI * m) * (A.r0 < 1.7 ? 1 : 0);
      e.pos.x = A.cx + Math.sin(a) * r; e.pos.z = A.cz + Math.cos(a) * r;
    } else { e.pos.x = si.x0 + (si.x1 - si.x0) * m; e.pos.z = si.z0 + (si.z1 - si.z0) * m; }
    const mx = e.pos.x - px, mz = e.pos.z - pz, v = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    e.speed = v > 0.25 ? Math.max(1.1, v) : 0;       // the walk clip (never a skate at a crawl)
    if (k < 0.8 && v > 0.25) e.face = turn(e.face, Math.atan2(mx, mz), Math.min(1, dt * 10));
    else e.face = turn(e.face, si.f1, Math.min(1, dt * 9));
    return;
  }
  e.speed = 0; e.pos.x = si.x1; e.pos.z = si.z1;
  si.turnT += dt;
  const left = Math.abs(wrapA(si.f1 - e.face));
  if (left > 0.04 && si.turnT < 0.4) { e.face = turn(e.face, si.f1, Math.min(1, dt * 11)); return; }
  e.face = si.f1; e.sitIn = null;
  e.h.pose = si.pose;
  if (si.then) si.then(e);                           // a floor sit: the seat and fsW lower the root (no chair clip)
  else e.h.swing('sitDown', 1.25);
}
// Called both early (a key) and when the timer has already run out, so key it on the pose, not on e.sit.
function endSit(e) {
  e.sit = 0;
  if (e === P) wpnUnSit();                           // WPN the spear back on the back
  if (e.sitIn) { e.sitIn = null; e.h.pose = null; e.fire = null; e.soak = false; return; }   // SIT-r3: stopped on the way to the seat: just stop walking
  if (e.floorSit) {                                  // STORY hearth: she keeps her place by the hearth; else ease up off the floor (no chair clip)
    if (e === N && N.hearth?.phase === 'sit') return;
    e.floorSit = 0; e.seat = null; e.hearthSeat = false;
    if (e.h.pose === 'sit' || e.h.pose === 'sitTalk') { e.h.pose = null; e.h.swing('standUp', 1.15); }   // the root rises with fsW (SIT-r3: unhurried)
    return;
  }
  if (e.h.pose !== 'sit' && e.h.pose !== 'sitTalk') return;
  e.h.pose = null; e.h.swing('standUp', 1.05);      // SIT-r3: an unhurried rise (1.7 was over in 0.35 s)
  if (e.fire) { const a = Math.atan2(e.pos.x - e.fire[0], e.pos.z - e.fire[1]); e.standOff = { x: Math.sin(a) * 0.5, z: Math.cos(a) * 0.5, t: 0 }; e.fire = null; }   // stand clear of the bench log: SIT-r3 eased in settle() (it was a one-frame 0.5 m pop)
}
// SIT-r3: the step off the bench as he rises: 0.5 m over 0.8 s, added to whatever else moves him (so keys still steer).
function standOffStep(e, dt) {
  const o = e.standOff, k0 = smooth01((o.t - 0.12) / 0.7);
  o.t += dt;
  const k = smooth01((o.t - 0.12) / 0.7);
  e.pos.x += o.x * (k - k0); e.pos.z += o.z * (k - k0);
  if (k - k0 > 0) collide(e.pos, 0.3);
  if (o.t > 0.85) e.standOff = null;
}
// ---------- STORY hearth: Sena's evenings by the hearth, and "Sit with Sena by the hearth" ----------
// Two floor seats on an arc 1.65 m from the hearth (house-local; the hearth is at 1.9, -1.2), both facing it: Aro on the
// room side, Sena toward the bed. The floor sit is the chair-sit clip with the legs stretched toward the fire (an override)
// and the root lowered onto the planks; it eases in and out (fsW), so nobody snaps onto or off the floor.
const HEARTH_SEATS = [[0.79, 0.02], [0.32, -0.72]], FS = { drop: 0.45, hip: 0.32, knee: 1.0 };
const _fsA = new THREE.Vector3();
function floorSitOverride(e) {
  return (h) => {
    const w = smooth01(e.fsW || 0);
    if (!(w > 0)) { if (e.fpQ) { fpBase(e, h); e.fpQ = null; } return; }   // SIT-r4: the back and head as the clip left them
    const b = h.bones, yaw = h.root.rotation.y;
    applyPose(h, e.fsLegs ??= samplePose(h, 'sitHold', 0, RST_LEGS), w);   // SIT-r3: the legs held still (the sit loops lift a knee now and then: a foot out of the hot spring)
    _fsA.set(Math.cos(yaw), 0, -Math.sin(yaw));
    if (e.hearthSeat && e.seat) { hearthFloorPose(e, h, w, yaw); return; }   // SIT-r4: a relaxed floor sit by the hearth
    for (const sd of ['l', 'r']) { rotW(b['thigh_' + sd], _fsA, -FS.hip * w); rotW(b['calf_' + sd], _fsA, -FS.knee * w); }
  };
}
// SIT-r4: the hearth floor sit was the chair clip with both legs pushed out straight (a stiff L, hands flat on the thighs).
// Now, with leg and arm IK on the planks: Aro sits with his outer knee up, his forearm hanging over it, and the inner
// leg folded flat under it, his other hand resting on that shin; Sena draws both knees up and wraps her arms round
// them, leaning in a little, her head turned toward him. Both breathe and sway a touch. HFP tunes it (G.hfp).
const HFP = { lean: 0.2, nLean: 0.3, upF: 0.4, upS: 0.17, foldF: 0.36, foldS: 0.05, nF: 0.38, nS: 0.09, hug: 0.42, look: 0.32 };
const _fpF = new THREE.Vector3(), _fpR = new THREE.Vector3(), _fpT = new THREE.Vector3(), _fpP = new THREE.Vector3(), _fpK = new THREE.Vector3(), _fpQ = new THREE.Vector3();
// The sit clips do not key the spine, neck and head every frame, so a turn added on top would pile up frame after frame
// (he folded over until his head touched the planks). Each frame starts from the clip's own value, or from the last
// one it wrote when it has not rewritten the bone since our turn.
const FP_BONES = ['spine_01', 'spine_02', 'neck_01', 'Head'];
function fpBase(e, h) {
  const st = e.fpQ ??= {};
  for (const n of FP_BONES) {
    const q = h.bones[n].quaternion, k = st[n];
    if (!k) st[n] = { base: q.clone(), out: q.clone(), has: false };
    else if (k.has && q.equals(k.out)) q.copy(k.base);
    else k.base.copy(q);
  }
  h.bones.spine_01.updateWorldMatrix(false, true);
}
function fpMark(e, h) { for (const n of FP_BONES) { const k = e.fpQ[n]; k.out.copy(h.bones[n].quaternion); k.has = true; } }
function hearthFloorPose(e, h, w, yaw) {
  fpBase(e, h);
  const b = h.bones, fy = e.seat.y, isN = e === N, t = clock;
  _fpF.set(Math.sin(yaw), 0, Math.cos(yaw));                                  // forward (toward the hearth)
  _fpR.copy(_fsA);                                                            // the body's left (+X model)
  const o = isN ? P : N, toO = Math.sign((o.pos.x - e.pos.x) * _fpR.x + (o.pos.z - e.pos.z) * _fpR.z) || 1;   // +1: the partner is on his/her left
  h.root.updateMatrixWorld(true);
  const pv = b.pelvis.getWorldPosition(_fpQ), sgn = (sd) => (sd === 'l' ? 1 : -1);
  if (!isN) {
    const upSd = toO > 0 ? 'r' : 'l', fdSd = upSd === 'l' ? 'r' : 'l';     // the knee away from Sena is up
    _fpT.copy(pv).addScaledVector(_fpF, HFP.upF).addScaledVector(_fpR, sgn(upSd) * HFP.upS); _fpT.y = fy + 0.09;
    b['thigh_' + upSd].getWorldPosition(_fpP).addScaledVector(_fpF, 0.35).addScaledVector(_fpR, sgn(upSd) * 0.12); _fpP.y += 0.7;
    ikLeg(h, upSd, _fpT, _fpP, w);
    _fpT.copy(pv).addScaledVector(_fpF, HFP.foldF).addScaledVector(_fpR, sgn(upSd) * HFP.foldS); _fpT.y = fy + 0.07;   // the folded foot tucks in under the raised knee
    b['thigh_' + fdSd].getWorldPosition(_fpP).addScaledVector(_fpR, sgn(fdSd) * 0.7).addScaledVector(_fpF, 0.25); _fpP.y = fy - 0.1;
    ikLeg(h, fdSd, _fpT, _fpP, w);
  } else {
    for (const sd of ['l', 'r']) {
      _fpT.copy(pv).addScaledVector(_fpF, HFP.nF).addScaledVector(_fpR, sgn(sd) * HFP.nS); _fpT.y = fy + 0.08;
      b['thigh_' + sd].getWorldPosition(_fpP).addScaledVector(_fpF, 0.3).addScaledVector(_fpR, sgn(sd) * 0.04); _fpP.y += 0.8;
      ikLeg(h, sd, _fpT, _fpP, w);
    }
  }
  // the back rounds forward a little (the chair clip sits bolt upright); a slow breath and sway
  const br = Math.sin(t * 1.4 + (isN ? 1.1 : 0));
  rotW(b.spine_01, _fpR, (isN ? HFP.nLean : HFP.lean) * 0.55 * w);
  rotW(b.spine_02, _fpR, ((isN ? HFP.nLean : HFP.lean) * 0.45 + br * 0.012) * w);
  rotW(b.Head, _fpR, -(isN ? 0.18 : 0.12) * w);                               // the eyes back up to the fire
  rotW(b.neck_01, _V_UP, toO * HFP.look * (isN ? 0.55 : 0.15) * w * (0.85 + 0.15 * Math.sin(t * 0.37)));   // she turns her head toward him
  rotW(b.Head, _V_UP, toO * HFP.look * (isN ? 0.45 : 0.1) * w);
  if (!isN) {
    const upSd = toO > 0 ? 'r' : 'l', fdSd = upSd === 'l' ? 'r' : 'l';
    b['calf_' + upSd].getWorldPosition(_fpK);                                 // the forearm over the raised knee, the hand hanging loose past it
    _fpT.copy(_fpK).addScaledVector(_fpF, 0.13).addScaledVector(_fpR, -sgn(upSd) * 0.03); _fpT.y -= 0.12 - br * 0.01;
    b['upperarm_' + upSd].getWorldPosition(_fpP).addScaledVector(_fpR, sgn(upSd) * 0.45).addScaledVector(_fpF, -0.1); _fpP.y -= 0.2;
    ik2(h, upSd, _fpT, _fpP, w);
    b['calf_' + fdSd].getWorldPosition(_fpK); b['foot_' + fdSd].getWorldPosition(_fpT);   // the other hand on the folded shin
    _fpT.lerp(_fpK, 0.5); _fpT.y += 0.09;
    b['upperarm_' + fdSd].getWorldPosition(_fpP).addScaledVector(_fpR, sgn(fdSd) * 0.5).addScaledVector(_fpF, -0.25); _fpP.y -= 0.3;
    ik2(h, fdSd, _fpT, _fpP, w);
  } else {
    for (const sd of ['l', 'r']) {                                           // arms round her shins, hands crossed in front
      b['calf_' + sd].getWorldPosition(_fpK); b['foot_' + sd].getWorldPosition(_fpT);
      _fpT.lerp(_fpK, HFP.hug + 0.3).addScaledVector(_fpF, 0.09).addScaledVector(_fpR, -sgn(sd) * 0.11); _fpT.y += br * 0.006;
      b['upperarm_' + sd].getWorldPosition(_fpP).addScaledVector(_fpR, sgn(sd) * 0.5).addScaledVector(_fpF, 0.05); _fpP.y -= 0.25;
      ik2(h, sd, _fpT, _fpP, w);
    }
  }
  fpMark(e, h);
}
function floorSitEase(e, dt) {
  if (!e.fsOv) { e.fsOv = true; e.h.addOverride('floorSit', 12, floorSitOverride(e)); }
  e.fsW = clamp((e.fsW || 0) + (e.floorSit && e.seat ? dt / 0.55 : -dt / 0.85), 0, 1);   // SIT-r3: up off the floor a little slower than down (0.55 s read as a spring)
}
const hearthHouse = () => { const h = S.home.hearth && homeHouse(); return h && h.rise >= 1 ? h : null; };
const hearthSeat = (h, i) => { const v = toWorld(h, [HEARTH_SEATS[i][0], 0, HEARTH_SEATS[i][1]]); v.y = h.group.position.y + 0.19; return v; };
const hearthFace = (h, v) => { const c = h.hearthW ??= toWorld(h, h.hearthPt); return Math.atan2(c.x - v.x, c.z - v.z); };
const hearthEve = () => (S.time < 6 ? S.day - 1 : S.day);                  // the evening a late-night hour belongs to
const hearthNight = () => S.time >= 19 || S.time < 5.5;
// a floor sit: the seat point, facing the hearth, the sit pose (the root lowering and the legs come from fsW in settle)
function hearthPlace(e, h, i) {
  const v = hearthSeat(h, i);
  e.pos.set(v.x, v.y, v.z); e.seat = v; e.face = hearthFace(h, v);   // STORY: y on the floor (the third-person camera looks from P.pos.y; 0 put it under the ground) e.vx = e.vz = 0; e.speed = 0; e.path = null;
  e.floorSit = 1; e.hearthSeat = true; e.fire = null;
  e.h.pose = e === N && N.h.has('sitTalk') && P.sit > 0 ? 'sitTalk' : 'sit';
}
const HEARTH_LINES = [
  [['Sena', 'Come, sit. The fire is warmest right here.'], ['Aro', 'Our own fire, under our own roof.']],
  [['Sena', 'Listen to it crackle. Like the first fire by the river, only it never rains on this one.']],
  [['Sena', 'When the little one comes, we will sit here, all three of us.'], ['Aro', 'And I will tell her how we made the first fire.']],
  [['Sena', 'Warm hands, a full belly, and you. I have everything.']],
];
// E target at the home house: offered while Sena sits by the hearth, or in the evening with her close, once per evening
// (so the rest prompt comes back for the night); never from beside the bed when he is already inside.
function hearthTarget(s, t) {
  const h = hearthHouse();
  if (!h || s !== h || busy || P.ride || N.ride || romApart()) return null;
  const by = N.hearth?.phase === 'sit', near = Math.hypot(N.pos.x - h.x, N.pos.z - h.z) < 15 && nFreeish();
  if (!(by || (near && S.time >= 17 && S.time < 23.5))) return null;
  if (S.c.hearthEve === hearthEve() && !by) return null;
  if (S.c.hearthEve === hearthEve() && rstNight()) return null;            // already sat tonight: E rests instead
  if (R.inside === h) { const [x, z] = rstLocal(h, P.pos); if (Math.hypot(x + 0.9, z + 1.25) < Math.hypot(x - 1.9, z + 1.2)) return null; }
  return t('Sit with Sena by the hearth', () => hearthSitTogether(h));
}
const nFreeish = () => !(N.rest > 0) && !N.working && !(N.downed > 0) && !N.soak && !N.ride;
function hearthSitTogether(h) {
  if (busy || P.ride) return;
  dipCut();                                                                // a quick fade from black hides the step inside
  N.hearth = { phase: 'sit', t: 0 }; N.node = null; N.act = 0; N.working = false; N.workSite = null; N.dance = 0;
  hearthPlace(P, h, 0); hearthPlace(N, h, 1);
  P.auto = false; P.sneak = false; P.sit = N.sit = 10; P.sitT = 0;
  R.inside = h; if (h.col) h.col.off = true;                               // he stands up inside and leaves by the door (rstInside)
  wpnStowAll('sit', true);
  if (hasSpear() && !W.spearOut && !W.props) {                             // the spear lies on the planks beside him
    const sp = P.h.spear, sv = P.seat.clone().addScaledVector(_fsA.set(Math.cos(P.face), 0, -Math.sin(P.face)), -0.55);
    scene.attach(sp); sp.scale.setScalar(1); sp.position.set(sv.x, sv.y + 0.03, sv.z); sp.rotation.set(Math.PI / 2, P.face, 0, 'YXZ');
    W.benchSpear = true;
  }
  N.h.pose = N.h.has('sitTalk') ? 'sitTalk' : 'sit';
  if (view !== 'fpp') {
    const c = toWorld(h, [1.7, 0, 2.3]); camYaw = Math.atan2(c.x - P.pos.x, c.z - P.pos.z); camPitch = 0.38;   // the follow camera he gets back on standing up
    // round 2: a held two-shot from the hearth corner, past the flames: both faces lit by the fire (the follow camera
    // looked past his back and hid her). Inside the walls; it ends with the sit (updatePlayer).
    const m = toWorld(h, [(HEARTH_SEATS[0][0] + HEARTH_SEATS[1][0]) / 2, 0.78, (HEARTH_SEATS[0][1] + HEARTH_SEATS[1][1]) / 2]);
    camShot = { pos: toWorld(h, [2.8, 1.5, -1.8]), look: m.setY(m.y + 0.1), t: 1e9, hearthSit: true };
  }
  const L = HEARTH_LINES[cnt('sat_hearth') % HEARTH_LINES.length];
  L.forEach((l) => say(...l));
  S.time = (S.time + 1) % 24; S.c.hearthEve = hearthEve();
  if (S.c.hearthDay !== S.day) { S.c.hearthDay = S.day; addClose(3, 'sat by the hearth'); }
  bump('sat_hearth'); drawQuest();
}
function dipCut() {
  const el = $('restdip');
  el.style.transition = 'none'; el.classList.add('on'); void el.offsetWidth;
  el.style.transition = 'opacity 0.45s'; setTimeout(() => { el.classList.remove('on'); setTimeout(() => { el.style.transition = ''; }, 500); }, 90);
}
// Sena's evening at home (updateSena): at night, with the hearth built and Aro within 40 m of the house, she goes in by the
// door, sits on her side of the hearth and stays until morning, until he is far away, or until the rest takes her to bed.
// Inside, her feet stand on the floor (jy) and she walks a fixed path (the house collider is solid from outside).
function senaHearth(dt) {
  const h = hearthHouse(), H = N.hearth;
  const want = h && hearthNight() && Math.hypot(P.pos.x - h.x, P.pos.z - h.z) < 40 && !N.fetch && !romApart();
  if (!H) {
    if (!want || !nFree()) return false;
    N.hearth = { phase: 'go', t: 0 }; N.node = null; N.act = 0;
    return senaHearth(dt);
  }
  H.t += dt;
  const out = toWorld(h || { x: N.pos.x, z: N.pos.z, rot: 0 }, [0, 0, 4.25]);
  if (!h) { N.hearth = null; N.floorSit = 0; N.seat = null; N.jy = 0; return false; }
  if (!want && H.phase !== 'out') {                                        // morning, or Aro walked off: up and out by the door
    if (H.phase === 'go') { N.hearth = null; return false; }
    N.floorSit = 0; N.seat = null; N.hearthSeat = false; if (N.h.pose === 'sit' || N.h.pose === 'sitTalk') N.h.pose = null;
    Object.assign(H, { phase: 'out', t: 0, up: 0.6 });
    N.path = [toWorld(h, [0, 0, 1.7]), toWorld(h, [0, 0, 3.4]), out];
  }
  const floorY = h.group.position.y + 0.19;
  const inJy = () => { N.jy = rstIn(h, N.pos) ? floorY - getHeight(N.pos.x, N.pos.z) : 0; };
  if (H.phase === 'go') {                                                  // to the doorstep (outside the walls' collider)
    const d = Math.hypot(out.x - N.pos.x, out.z - N.pos.z);
    if (walkTo(N, out.x, out.z, d > 12 ? 6.6 : 3.2, dt, 0.35) || H.t > 25) {
      if (H.t > 25) N.pos.set(out.x, 0, out.z);
      Object.assign(H, { phase: 'in', t: 0 }); N.path = [toWorld(h, [0, 0, 3.4]), toWorld(h, [0, 0, 1.7]), toWorld(h, [HEARTH_SEATS[1][0] - 0.25, 0, HEARTH_SEATS[1][1] + 0.55]), hearthSeat(h, 1)];
    }
    N.jy = 0;
  } else if (H.phase === 'in') {
    if (rstWalk(N, dt, 1.5) || H.t > 12) {
      hearthPlace(N, h, 1); H.phase = 'sit'; H.t = 0; N.jy = 0;
      if (S.c.hearthLine !== hearthEve() && Math.hypot(P.pos.x - h.x, P.pos.z - h.z) < 25) { S.c.hearthLine = hearthEve(); say('Sena', ['I have the fire going. Come in when you are ready.', 'Come and sit with me by the hearth, Aro.'][cnt('hearth_eve') % 2]); bump('hearth_eve'); }
    } else inJy();
  } else if (H.phase === 'sit') {
    N.speed = 0;
    if (!N.seat) hearthPlace(N, h, 1);
    if (!(N.sit > 0) && N.h.pose !== 'sit') N.h.pose = 'sit';
  } else if (H.phase === 'out') {
    if ((H.up -= dt) > 0) { N.speed = 0; N.jy = floorY - getHeight(N.pos.x, N.pos.z); return true; }   // getting up off the floor first
    if (rstWalk(N, dt, 1.6) || H.t > 12) { N.hearth = null; N.jy = 0; N.path = null; N.speed = 0; N.wait = 2; return false; }
    inJy();
  }
  return true;
}
// Leave the hearth state cleanly when something else takes Sena (the rest, a scene, a fight, a rescue).
function senaHearthDrop() {
  if (!N.hearth) return;
  N.hearth = null; N.hearthSeat = false; N.floorSit = 0; N.seat = null; N.jy = 0; N.path = null;
  if (N.h.pose === 'sit' || N.h.pose === 'sitTalk') N.h.pose = null;
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
function eat() { survEat(); }                       // SURV: cooked, grilled, bread, dried, berries; hold F to eat raw (risky)
function fillSkin(src = 'river') { survFill(src); }  // SURV: the well (and boiling) gives clean water, the river and lake do not
function drinkSkin() { survDrinkSkin(); }           // SURV: unboiled water can give dysentery
function heal() { survHeal(); }                     // SURV: H treats the worst wound with the best item, else the berry poultice
// ---------- torch ----------
const torch = makeTorch();
let torchOn = false;
torch.root.userData.kind = 'torch'; P.h.place(torch.root, 'hipR'); scene.add(torch.light);   // WPN: hip when unlit, left hand when lit (wpnTorch)
torch.lit = false; torch.root.visible = false;
function setTorch(on) {
  torchOn = on; torch.lit = on;
  drawInv();
}
function toggleTorch() {
  if (BOW.on && !torchOn) bowOff();                  // BOW: the torch takes the bow hand
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
  if (!torchOn) return;                              // WPN: visibility and socket follow wpnTorch()
  torch.update(dt);
  torch.flame.getWorldPosition(torch.light.position);
  S.fuel -= dt * (world.env.storm > 0.5 ? 2 : 1);           // rain makes it burn down faster
  if (P.swim) { S.fuel = 0; setTorch(false); toast('The water puts out your torch'); A.hit(3000, 0.5, 0.3); }
  else if (S.fuel <= 0) { S.fuel = 0; setTorch(false); toast('Your torch has burnt out'); }
  else if ((S.fuel | 0) !== (S.fuel + dt | 0) && (S.fuel | 0) % 5 === 0) drawInv();
}
// ---------- RST rest ----------
// Resting is a short, skippable cinematic: walk to the bed, sit on its edge (or kneel at a floor bed), lie down side by
// side under a blanket (Aro on his back, Sena rolled onto her side toward him, holding hands), a time-lapse of the night
// under a vignette with a dream line, then wake: sit up, stand beside the bed, stretch, and Sena's morning line.
// Poses are a sampled clip frame plus bone overrides (people.js P0 API); the roots stay upright (yaw only).
let camShot = null;
// R: the one rest sequence. freeze = G.restHold's phase; hold4 = the birth card; inside = the shelter Aro is standing in
// after waking (its solid collider is off until he leaves by the door); nOut = Sena's walk out of the door.
const R = { on: false, phase: null, t: 0, s: null, mode: 'dawn', together: false, tier: null, comfort: 0, t0: 0, t1: 0, hours: 0,
  skip: false, hold4: 0, line: null, wokeAt: -1e9, menu: false, freeze: null, L: null, applied: false, storm: false, log: [],
  inside: null, menuS: null, menuAt: 0, opts: [], speed: 1, waiters: [], out: null, hp0: 0, close0: 0, eve: false, dayDone: false,
  dream: false, morning: false, wpnWoke: false, kidsIn: false, nOut: null, first: false, props: [], blanket: null, bedHide: null, nightDur: 3, nDelay: 0.5 };
const V3 = THREE.Vector3;
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const angTo = (a, b) => ((((b - a + Math.PI) % 6.2832) + 6.2832) % 6.2832) - Math.PI;
// Bed layouts in the shelter's local frame (metres; heads toward -Z, Aro on the -X side, Sena on +X). head: where the
// Head bone rests; sit: the feet point while sitting on the edge (raised bed) or kneeling (floor bed); door: outside and
// inside the doorway; cam: walk-in, lying (end) and waking shots with their look points.
const RST_LAY = {
  hut: { mat: 0.09, pillow: 0.17, floor: 0.04, low: true, head: [[-0.36, -1.1], [0.36, -1.1]], solo: [0, -1.1], sit: [[-0.62, -0.3], [0.62, -0.3]],
    via: [[], []], exit: [[-0.05, 1.05], [0, 1.95], [0, 3.4], [0.35, 4.6]], door: [[0, 3.0], [0, 1.25]], bed: [1.4, 2.0, -0.4], clear: [0.1, 0.15],   // STORY: he steps out of the door into the morning, so the hand-back is outside, not up into the thatch
    cam: { walk: [0.05, 2.2, -1.5], walkLook: [0, 0.5, 1.2], end: [-1.42, 1.38, -0.3], look: [0.15, 0.12, -0.85], wake: [0.4, 2.0, 1.9], wakeLook: [0, 1.25, -0.6], ext: [4.2, 1.5, 7.5], extLook: [0, 3.0, 0] } },   // STORY: the wake shot frames the stretch
  house: { mat: 0.565, pillow: 0.65, floor: 0.19, low: false, head: [[-1.28, -1.93], [-0.52, -1.93]], solo: [-1.28, -1.93], sit: [[-1.95, -1.05], [0.15, -1.05]],
    via: [[[-2.2, 0.15]], []], exit: [[-2.0, 0.15], [-1.15, 0.9]], door: [[0, 3.4], [0, 1.7]], bed: [1.62, 2.1, -1.25], clear: [0.1, 0.15],
    cam: { walk: [1.75, 2.2, -1.75], walkLook: [-0.4, 1.0, 1.6], end: [-2.5, 2.1, 0.6], look: [-0.8, 0.55, -1.5], wake: [1.1, 1.9, 1.3], wakeLook: [-1.0, 0.95, -0.9], ext: [6.5, 1.8, 11], extLook: [0, 4.2, 0] } },
  houseFloor: { mat: 0.225, pillow: 0.3, floor: 0.19, low: true, head: [[-1.3, -1.85], [-0.5, -1.85]], solo: [-0.9, -1.85], sit: [[-1.58, -1.15], [-0.22, -1.15]],
    via: [[], []], exit: [[-1.1, -0.1]], door: [[0, 3.4], [0, 1.7]], bed: [1.7, 2.1, -1.15], clear: [0.1, 0.15], roll: 'mat',
    cam: { walk: [1.75, 2.2, -1.75], walkLook: [-0.4, 1.0, 1.6], end: [-2.5, 1.9, 0.5], look: [-0.8, 0.25, -1.45], wake: [1.1, 1.9, 1.3], wakeLook: [-1.0, 0.85, -0.9], ext: [6.5, 1.8, 11], extLook: [0, 4.2, 0] } },
  cave: { mat: 0.17, pillow: 0.24, floor: 0, low: true, head: [[-0.39, -0.72], [0.39, -0.72]], solo: [0, -0.72], sit: [[-0.68, 0.1], [0.68, 0.1]],
    via: [[], []], exit: [[-0.5, 1.2]], door: null, bed: [2.0, 2.0, 0], clear: [0.1, 0.15], roll: 'pillows',
    cam: { walk: [2.2, 1.9, 2.4], walkLook: [0, 0.6, 0], end: [-1.45, 1.35, -0.1], look: [0.15, 0.15, -0.65], wake: [1.9, 1.7, 1.7], wakeLook: [0, 0.8, -0.2] } },
};
// Pose tuning (G.restTune live-edits it): legs blend toward the standing legs (less splay), knee bend, head turn,
// Aro's small roll toward Sena, Sena's roll onto her side and her curled legs ([down leg, upper leg]).
const RT = { legIdle: 0.5, hip: 0.05, knee: 0.08, turn: 0.45, rollA: 0.12, rollN: 1.42, sHip: [0.4, 0.8], sKnee: [0.6, 1.1], sHead: 0.22, sAdd: 0.85,
  hold: [0.1, 0.07, 0.57], belly: [0.11, 0.06, -0.03], cheek: [0.16, 0.05, 0.22], breathe: 0.03, ankle: 0.065, footP: 0.5, stack: 0.09, dSheet: 0.05, dCap: 0.3, dDrop: 0.15, dTop: 1.0, dReach: 0.55, dPass: 6,
  dRun: 0.32, dDome: 0.15, dSide: 1.4, dSag: 0.2, dGuard: 0.55 };   // SIT-r3 drape: cover sized to the sleepers; SIT-r4: a ridge per sleeper (dRun down the body, dDome across, dSide the fall off its sides, dSag the dip between two)
const RST_LEGS = (b) => /^(thigh|calf|foot|ball)_/.test(b), RST_FINGERS = (b) => /^(thumb|index|middle|ring|pinky)_0[1-3]_/.test(b), _V_UP = new THREE.Vector3(0, 1, 0);
const DREAM = {
  awaken: [['Sena', '…warm… the sparks look like little stars…'], ['Aro', '(The river never stops talking. Neither does she, in her sleep.)']],
  fire: [['Sena', '…warm… the sparks look like little stars…'], ['Aro', '(The fire held. We held.)']],
  hunt: [['Sena', '…quiet feet… the deer by the water…'], ['Aro', '(Tomorrow I will throw truer.)']],
  shelter: [['Sena', '…a roof of reeds… no more rain on my face…'], ['Aro', '(A roof over her. That is something.)']],
  cave: [['Sena', '…the painted hands… they\'re waving at us…'], ['Aro', '(Who were they, the people on the wall?)']],
  herd: [['Sena', '…the horses in the meadow… so fast…'], ['Aro', '(Manes like wind in the grass.)']],
  clay: [['Sena', '…red clay… a house that stands for our children\'s children…'], ['Aro', '(Bricks. Hundreds of them. I can already feel my back.)']],
  house: [['Sena', '…red clay… a house that stands for our children\'s children…'], ['Aro', '(Walls that no wind can push over.)']],
  hearth: [['Sena', '…the hearth crackling… home…'], ['Aro', '(Home. I never had a word for it before.)']],
  seeds: [['Sena', '…green shoots… bread from our own field…'], ['Aro', '(Seeds in the ground, and us beside them.)']],
  newlife: [['Sena', '…small hands… a lullaby…'], ['Aro', '(Three of us. I will build another room.)']],
  village: [['Sena', '…so many fires in the valley now…'], ['Aro', '(From one fire, all of this.)']],
};
const APART = ['You didn\'t come home last night. I kept the fire going for you.', 'Next time, sleep where I can hear you breathing.'];
const APART_HOME = ['I couldn\'t get back before dark. Was the bed cold without me?', 'I was too far from home when the night came. I missed you, Aro.'];   // STORY: Aro slept at home, Sena was away
const WOLF_LINE = 'Not now — I can hear them out there.', FIRST_HOME = 'Our own bed, under our own roof. I could stay like this until the snow melts.';
const rstNight = () => S.time >= 18 || S.time < 5.5;
const rstKind = (s) => (s.kind === 'house' && !S.home.bed ? 'houseFloor' : s.kind);
function rstComfort(s, together) {
  let c = s.kind === 'cave' ? 1 : s.kind === 'hut' ? 2 : 3;
  if (s.kind === 'house') { if (S.home.bed) c += 2; if (S.home.hearth) c += 2; c += Math.min(3, (homeliness() / 3) | 0); }
  if (structs.some((f) => f.kind === 'fire' && f.rise >= 1 && Math.hypot(f.x - s.x, f.z - s.z) < 8)) c += 1;
  if (together) c += 1;
  if (s.kind === 'hut' && world.env.storm > 0.5) c -= 1;              // the thatch leaks
  return Math.max(0, c);
}
const rstTier = (c) => (c <= 2 ? 'Rested' : c <= 5 ? 'Well rested' : 'Snug');
const rstMins = (c) => { const m = (120 + 30 * c) / 60, w = m | 0; return w + (m - w >= 0.5 ? '½' : ''); };
const rstTogether = (s) => !!(s && s.bedPts && Math.hypot(N.pos.x - s.x, N.pos.z - s.z) < 40 && !N.ride && !romApart());   // ROM: a rift, she sleeps by the fire
// null when resting is allowed; else why not (wolves, just woke, or only a nap in daylight)
function rstBlock(s) {
  if (hostileNear(35, s ? { x: s.x, z: s.z } : P.pos)) return 'wolves';
  if (clock - R.wokeAt < 90) return 'recent';
  return rstNight() ? null : 'nap-only';
}
function rstPrompt(s, t) {
  const b = rstBlock(s);
  if (b === 'recent') return null;                          // just woke: no rest prompt at all
  if (b === 'wolves') {
    if (R.warnDay !== S.day && Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 20) { R.warnDay = S.day; say('Sena', WOLF_LINE); }
    return t('You can\'t rest with wolves prowling nearby');
  }
  return t(b === 'nap-only' ? 'Nap for a while' : 'Rest until dawn', () => rstOpen(s));
}
// the public entry (the cave bed and G.sleep): the rest menu
function sleep(s) { rstOpen(s); }
function rstOpen(s) {
  if (!s || R.on || R.menu || busy || !playing) return;
  if (rstBlock(s) === 'wolves') { toast('You can\'t rest with wolves prowling nearby'); return; }
  const night = rstNight(), tog = rstTogether(s), c = rstComfort(s, tog);
  R.opts = night ? [['dawn', 'Sleep until dawn', `${rstTier(c)} · stamina returns faster for ${rstMins(c)} min`], ['nap', 'Nap 2 hours', 'a little health, no buff']]
    : [['nap', 'Nap 2 hours', 'a little health, no buff']];
  R.menuS = s; R.menu = true; R.menuAt = performance.now(); busy = true;
  $('rm-title').textContent = s.kind === 'cave' ? 'Shelter in the cave' : `Rest in the ${s.label ? s.label.toLowerCase() : s.kind}`;
  $('rm-note').textContent = tog ? 'Sena will rest beside you.' : 'Sena is too far away to join you.';
  romRestOpts(s, tog);                               // ROM: option 3 (a night together), or Sena sleeps apart
  const box = $('rm-opts'); box.innerHTML = '';
  R.opts.forEach(([, name, sub], i) => {
    const b = document.createElement('button');
    b.innerHTML = `<kbd>${i + 1}</kbd><span><strong>${name}</strong><em>${sub}</em></span>`;
    b.onclick = () => rstChoose(i); box.append(b);
  });
  const x = document.createElement('button'); x.className = 'rm-no'; x.innerHTML = '<kbd>Esc</kbd><span><strong>Not now</strong></span>'; x.onclick = rstClose; box.append(x);
  $('restmenu').classList.add('on');
  document.exitPointerLock?.();
}
function rstClose() {
  if (!R.menu) return;
  R.menu = false; busy = false; $('restmenu').classList.remove('on'); lock();
}
function rstChoose(i) {
  const o = R.opts[i], s = R.menuS;
  if (!o || !R.menu) return;
  rstClose();
  if (o[0] === 'together') romNight(s); else rstBegin(s, o[0]);   // ROM: the fade-to-black night
}
// keydown: the menu takes 1/2/E/Esc; during the sequence any key skips (after the first time) and nothing else acts
function rstKey(e) {
  if (paused) return false;
  if (R.menu) {
    if (e.repeat) return true;
    if (e.code === 'Escape') rstClose();
    else if ((e.code === 'Digit1' || e.code === 'KeyE') && performance.now() - R.menuAt > 250) rstChoose(0);
    else if (e.code === 'Digit2' && R.opts[1]) rstChoose(1);
    else if (e.code === 'Digit3' && R.opts[2]) rstChoose(2);   // ROM
    return true;
  }
  if (R.on) { if (!e.repeat && S.c.restSeen && /^(walk|sit|lie|night)$/.test(R.phase)) R.skip = true; return true; }
  return false;
}
function rstLayout(s) {
  const kind = rstKind(s), D = RST_LAY[kind] || RST_LAY.hut, yaw = s.rot || 0, gy = s.group.position.y;
  const W = (p, y = 0) => toWorld(s, [p[0], y, p[1]]), W3 = (p) => toWorld(s, p);
  const L = { s, kind, D, yaw, gy, low: D.low, matY: gy + D.mat, pillowY: gy + D.pillow, floorY: gy + D.floor,
    right: new V3(Math.cos(yaw), 0, -Math.sin(yaw)), fwd: new V3(Math.sin(yaw), 0, Math.cos(yaw)) };
  L.back = L.fwd.clone().negate();
  L.cam = {}; for (const k in D.cam) L.cam[k] = W3(D.cam[k]);
  L.door = D.door && D.door.map((p) => W(p));
  return L;
}
// Per-sleeper plan: i 0 = Aro (left), 1 = Sena (right); solo puts Aro in the middle of the bed.
function rstPlan(e, i, L, solo) {
  const D = L.D, hp = solo ? D.solo : D.head[i], side = solo ? 0 : i === 0 ? 1 : -1;    // side: +1 when the partner lies to the +right
  const sit = solo && L.low ? [hp[0] - 0.26, D.sit[0][1]] : D.sit[i];
  const out = i === 0 ? -1 : 1;                                                        // outward across the bed
  e.L = { i, side, solo, pillow: W2(L, hp, L.pillowY), sitPos: W2(L, sit, 0), standPos: W2(L, i === 0 ? D.exit[D.exit.length - 1] : sit, 0),   // Aro ends a step or two toward the door
    sitYaw: L.low ? L.yaw : L.yaw + out * Math.PI / 2, lieYaw: L.yaw, base: L.low ? 'work' : 'sit', clear: D.clear[i] ?? 0.1,
    roll: i === 0 || solo ? RT.rollA : RT.rollN, cal: null, liePos: null, sitRoot: null, down: side >= 0 ? 'l' : 'r', hand: null, hold: 0, rollW: 0, sat: false, up: false };
  e.L.LIE = samplePose(e.h, 'death', 99); e.L.IDLE = samplePose(e.h, 'idle', 0);
  e.lie = false; e.lieW = 0;
}
const W2 = (L, p, y) => { const v = toWorld(L.s, [p[0], 0, p[1]]); v.y = y; return v; };
// World-space bone rotation: turn `bone` about the world `axis` by `ang` (keeps its children attached).
const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rq3 = new THREE.Quaternion();
const _ra = new V3(), _rb = new V3(), _rc = new V3(), _rd = new V3(), _re = new V3(), _rf = new V3();
function rotW(bone, axis, ang) {
  if (!ang) return;
  bone.getWorldQuaternion(_rq); bone.parent.getWorldQuaternion(_rq2);
  _rq3.setFromAxisAngle(axis, ang).multiply(_rq);
  bone.quaternion.copy(_rq2.invert().multiply(_rq3));
  bone.updateWorldMatrix(false, true);
}
// The lying override (order 10): Death01's last frame (on the back), legs eased toward the standing legs and bent at
// the knee, then a roll about the bed axis (small for Aro, onto her side for Sena), the head turned toward the partner,
// and arms placed with IK (the outer hand on the belly or under the cheek).
function rstLieOverride(e) {
  return (h) => {
    const L = e.L, Lay = R.L, cal = L.calib, w = cal ? 1 : smooth01(e.lieW), w2 = cal ? 1 : smooth01(L.rollW);
    if (!(w > 0) || !Lay) return;
    const isN = e === N && !L.solo, b = h.bones, right = Lay.right, back = Lay.back;
    applyPose(h, L.LIE, w); applyPose(h, L.IDLE, w * RT.legIdle, RST_LEGS);
    for (const sd of ['l', 'r']) {
      const k = isN ? (sd === L.down ? 0 : 1) : 0;
      rotW(b['thigh_' + sd], right, -(isN ? RT.sHip[k] * w2 + RT.hip * (1 - w2) : RT.hip) * w);
      rotW(b['calf_' + sd], right, (isN ? RT.sKnee[k] * w2 + RT.knee * (1 - w2) : RT.knee) * w);
    }
    if (isN) rotW(b['thigh_' + (L.down === 'l' ? 'r' : 'l')], back, L.side * RT.sAdd * w2 * w);   // her upper knee drops onto the lower one
    rotW(b.pelvis, back, L.side * L.roll * (isN ? w2 : w) * w);
    rotW(b.neck_01, back, L.side * RT.turn * 0.4 * w * (isN ? 1 - w2 * 0.6 : 1));
    rotW(b.Head, back, L.side * RT.turn * 0.6 * w * (isN ? 1 - w2 * 0.6 : 1));
    if (isN) { _ra.copy(right).multiplyScalar(L.side); rotW(b.Head, _ra, RT.sHead * w2 * w); }
    // feet rest on the mattress, never in it: lift a sunken leg at the hip (about the axis across hip→foot and up)
    for (const sd of ['l', 'r']) {
      b['thigh_' + sd].getWorldPosition(_ra); b['foot_' + sd].getWorldPosition(_rb);
      const lack = Lay.matY + RT.ankle - _rb.y;
      if (lack <= 0) continue;
      _rc.subVectors(_rb, _ra); const d = _rc.length(); _rc.divideScalar(d);
      _rd.crossVectors(_rc, _V_UP); if (_rd.lengthSq() < 1e-6) continue; _rd.normalize();
      rotW(b['thigh_' + sd], _rd, Math.asin(clamp(lack / d, 0, 0.6)) * w);
    }
    // SIT-r4: relaxed feet (the toes tip forward and fall a little outward, not straight up into the blanket), and on
    // her side Sena's upper leg rests on the lower one, foot on foot (the hip turn lifted that foot 0.26 m off the mat,
    // a peak in the cover)
    for (const sd of ['l', 'r']) if (!isN || w2 < 1) rotW(b['foot_' + sd], right, RT.footP * w * (isN ? 1 - w2 : 1));
    if (isN && w2 > 0) {
      const up = L.down === 'l' ? 'r' : 'l';
      b['foot_' + L.down].getWorldPosition(_ra); _ra.y += RT.stack; _ra.addScaledVector(Lay.fwd, -0.03);
      b['thigh_' + up].getWorldPosition(_rb); b['calf_' + up].getWorldPosition(_rc);
      _rd.addVectors(_rb, _ra).multiplyScalar(0.5); _rc.sub(_rd).multiplyScalar(2).add(_rd);   // the knee stays where the hip turn put it
      ikLeg(h, up, _ra, _rc, w * w2);
    }
    // arms: both hands rest on the belly (the hold override then takes the near/upper hand); rolled onto her side,
    // Sena's upper hand rests in front of her and her lower hand slides under her cheek
    if (cal) return;
    const up = L.down === 'l' ? 'r' : 'l';
    for (const sd of ['l', 'r']) {
      const sg = sd === 'r' ? -1 : 1;                                        // on the back, the right side lies toward -right
      b.spine_02.getWorldPosition(_ra); _ra.addScaledVector(right, sg * RT.belly[0]); _ra.y += RT.belly[1]; _ra.addScaledVector(Lay.fwd, RT.belly[2]);
      _rb.copy(_ra).addScaledVector(right, sg * 0.6); _rb.y -= 0.3;
      if (isN && sd === up && w2 > 0) {
        b.spine_02.getWorldPosition(_rc).addScaledVector(right, L.side * 0.17); _rc.y += 0.03; _rc.addScaledVector(Lay.fwd, 0.12);
        _ra.lerp(_rc, w2); _rc.y += 0.5; _rb.lerp(_rc, w2);
      }
      ik2(h, sd, _ra, _rb, w);
    }
    if (isN && w2 > 0) {                                                     // SIT-r4: her lower hand lies on the bed in front of her chest, not up by her face
      b.Head.getWorldPosition(_ra); _ra.addScaledVector(right, L.side * RT.cheek[0]); _ra.y = Lay.matY + RT.cheek[1]; _ra.addScaledVector(Lay.fwd, RT.cheek[2]);
      _rb.copy(_ra).addScaledVector(Lay.fwd, 0.45); _rb.addScaledVector(right, -L.side * 0.1); _rb.y -= 0.25;
      ik2(h, L.down, _ra, _rb, w * w2);
    }
    applyPose(h, L.IDLE, w, RST_FINGERS);                                    // SIT-r4: relaxed, curled fingers (the death clip's last frame splays them)
  };
}
// Holding hands (order 30): Aro's near hand and Sena's upper hand meet on the blanket between them.
function rstHoldOverride(e) {
  return (h) => {
    const L = e.L, w = smooth01(L.hold);
    if (!(w > 0) || !R.L || !R.holdPt || !L.hand) return;
    _ra.copy(R.holdPt).addScaledVector(R.L.right, -L.side * 0.035);
    _rb.copy(_ra); _rb.y += 0.6; _rb.addScaledVector(R.L.right, -L.side * 0.4);
    ik2(h, L.hand, _ra, _rb, w);
  };
}
// Breathing (order 40): a slow rise of the chest, Sena's out of step with his.
function rstBreathOverride(e) {
  return (h) => {
    const w = e.lie ? smooth01(e.lieW) : 0;
    if (!(w > 0)) return;
    const a = Math.sin(clock * 6.2832 * 0.22 + (e === N ? 1.3 : 0)) * RT.breathe * w;
    h.bones.spine_02.rotation.x += a; h.bones.spine_03.rotation.x += a * 0.5;
  };
}
// The morning stretch (order 40): both arms up over the head, the back arched a little, the head tipped back.
function rstStretchOverride(e) {
  return (h) => {
    const st = e.stretch;
    if (!(st >= 0) || st > 1) return;
    const env = Math.sin(Math.PI * st), b = h.bones, yaw = h.root.rotation.y;
    _rc.set(Math.cos(yaw), 0, -Math.sin(yaw));                          // the body's left (+X model)
    rotW(b.spine_03, _rc, -0.14 * env); rotW(b.Head, _rc, -0.2 * env);
    for (const [sd, sg] of [['l', 1], ['r', -1]]) {
      b['upperarm_' + sd].getWorldPosition(_ra); _ra.y += 0.55; _ra.addScaledVector(_rc, sg * 0.14);
      _rb.copy(_ra).addScaledVector(_rc, sg * 0.5); _rb.y -= 0.2;
      ik2(h, sd, _ra, _rb, env);
    }
  };
}
// The head/pelvis offsets of the full lying pose, measured once with the root at the pillow (then the root is placed
// so the head rests on the pillow and the pelvis just above the mattress).
function rstCalibrate(e) {
  const L = e.L, root = e.h.root;
  root.position.set(L.pillow.x, R.L.matY, L.pillow.z); root.rotation.set(0, L.lieYaw, 0);
  L.calib = true; e.h.animate(0, 0, false, false, false); L.calib = false;
  root.updateMatrixWorld(true);
  const hd = e.h.bones.Head.getWorldPosition(new V3()), pv = e.h.bones.pelvis.getWorldPosition(new V3());
  L.liePos = new V3(root.position.x + L.pillow.x - hd.x, root.position.y + R.L.matY + L.clear - pv.y, root.position.z + L.pillow.z - hd.z);
  L.cal = { head: hd.sub(root.position), pelvis: pv.sub(root.position) };
}
// settle() hook for Aro and Sena: lying in bed, walking to it / standing up (upright on the shelter floor), and after
// waking (kept inside the walls until they leave by the door). Returns true when it placed the body itself.
function rstSettle(e, dt) {
  if (e !== P && e !== N) return false;
  if (e.rest > 0 && e.lie && e.L) {
    const L = e.L, root = e.h.root;
    root.rotation.order = 'YXZ';
    if (!L.sitRoot) L.sitRoot = new V3(e.pos.x, rstFloorY(e) ?? getHeight(e.pos.x, e.pos.z), e.pos.z);
    if (!L.cal) rstCalibrate(e);
    const w = smooth01(e.lieW);
    root.position.lerpVectors(L.sitRoot, L.liePos, w);
    root.position.y = lerp(L.sitRoot.y, L.liePos.y, smooth01(e.lieW * 1.25 - 0.25));   // lean back first, then sink
    root.rotation.set(0, L.sitYaw + angTo(L.sitYaw, L.lieYaw) * w, 0);
    e.h.pose = L.base;
    e.h.animate(dt, 0, false, false, false);
    return true;
  }
  if (e.rest > 0) {
    if (e === N && R.nOut) rstNOut(dt);
    const root = e.h.root;
    e.pos.y = rstFloorY(e) ?? getHeight(e.pos.x, e.pos.z);
    root.rotation.set(0, e.face, 0); root.position.copy(e.pos);
    e.h.animate(dt, e.speed, false, false, false);
    return true;
  }
  if (e === P && R.inside) rstInside(dt);
  return false;
}
// Shelter interiors (local frame): which walls hold you in, the door corridor, and the furniture you walk around.
function rstLocal(s, p) { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), dx = p.x - s.x, dz = p.z - s.z; return [dx * c - dz * sn, dx * sn + dz * c]; }
function rstWorldXZ(s, lx, lz, out) { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); out.x = s.x + lx * c + lz * sn; out.z = s.z - lx * sn + lz * c; return out; }
function rstIn(s, p) {
  const [x, z] = rstLocal(s, p);
  return s.kind === 'hut' ? Math.hypot(x, z) < 2.0 : s.kind === 'house' ? Math.abs(x) < 2.95 && Math.abs(z) < 2.6 : false;
}
function rstFloorY(e) {
  const s = R.s || R.inside;
  if (!s || s.kind === 'cave' || !rstIn(s, e.pos)) return null;
  return s.group.position.y + (s.kind === 'house' ? 0.19 : 0.04);
}
function rstInside(dt) {
  const s = R.inside;
  if (!s || !structs.includes(s)) { rstLeave(); return; }
  let [x, z] = rstLocal(s, P.pos);
  const door = Math.abs(x) < 0.5 && z > 0;
  if (s.kind === 'hut') {
    const r = Math.hypot(x, z);
    if (r > 2.5) { rstLeave(); return; }
    if (!door && r > 1.6 && r < 2.45) { const k = (r < 2.02 ? 1.6 : 2.45) / r; x *= k; z *= k; }
    if (door && z > 1.6) x = clamp(x, -0.5, 0.5);
  } else {
    if (Math.hypot(x, z) > 3.95) { rstLeave(); return; }
    const inX = 2.62, inZ = 2.02, outX = 3.5, outZ = 2.92;
    const inner = Math.abs(x) <= inX && Math.abs(z) <= inZ, inBox = Math.abs(x) < outX && Math.abs(z) < outZ;
    if (!inner && inBox && !(door && z > 0)) {
      if (Math.abs(z) <= inZ + 0.3 && Math.abs(x) <= inX + 0.3) { x = clamp(x, -inX, inX); z = clamp(z, -inZ, inZ); }   // pressed into a wall from inside
      else {                                                                                              // outside: push to the nearest outer face
        const dx = outX - Math.abs(x), dz = outZ - Math.abs(z);
        if (dx < dz) x = Math.sign(x) * outX; else z = Math.sign(z) * outZ;
      }
    }
    if (door && z > inZ) x = clamp(x, -0.5, 0.5);
    const box = (cx, cz, hx, hz) => {                                                                   // furniture: step around it
      const ox = hx + 0.3 - Math.abs(x - cx), oz = hz + 0.3 - Math.abs(z - cz);
      if (ox > 0 && oz > 0) { if (ox < oz) x += Math.sign(x - cx || 1) * ox; else z += Math.sign(z - cz || 1) * oz; }
    };
    if (S.home.bed) box(-0.9, -1.25, 0.8, 1.05);
    if (S.home.cradle) box(1.8, 1.2, 0.25, 0.4);
    if (S.home.hearth) box(1.9, -1.2, 0.5, 0.5);
  }
  rstWorldXZ(s, x, z, P.pos);
  if (!P.air) P.jy = rstIn(s, P.pos) ? s.group.position.y + (s.kind === 'house' ? 0.19 : 0.04) - getHeight(P.pos.x, P.pos.z) : 0;
}
function rstLeave() {
  const s = R.inside;
  R.inside = null;
  if (s?.col) s.col.off = false;
  if (!P.air) P.jy = 0;
}
// Walk e along e.path (world points) at speed; true once at the end.
function rstWalk(e, dt, speed) {
  const p = e.path;
  while (p && p.length && Math.hypot(p[0].x - e.pos.x, p[0].z - e.pos.z) < 0.06) p.shift();
  if (!p || !p.length) { e.speed = 0; return true; }
  const t = p[0], dx = t.x - e.pos.x, dz = t.z - e.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, speed * dt);
  e.pos.x += (dx / d) * st; e.pos.z += (dz / d) * st;
  e.face = turn(e.face, Math.atan2(dx, dz), Math.min(1, dt * 8));
  e.speed = speed;
  return false;
}
// Path to the bed: outside → in front of the door → inside the doorway → the sit or kneel spot. Too far: a cut to the door.
function rstPath(e, L, start, delayOut, via = []) {
  const s = L.s, pts = [];
  const inside = s.kind === 'cave' || rstIn(s, e.pos);
  let cut = false;
  if (!inside && L.door) {
    const dOut = L.door[0], far = Math.hypot(dOut.x - e.pos.x, dOut.z - e.pos.z);
    const [, lz] = rstLocal(s, e.pos);
    if (far > 4 || lz < 1.5) { cut = true; e.pos.copy(dOut).addScaledVector(L.fwd, 0.9 + delayOut); e.pos.y = 0; e.face = L.yaw + Math.PI; }
    pts.push(dOut.clone(), L.door[1].clone());
  }
  for (const v of via) pts.push(W2(L, v, 0));
  pts.push(start.clone());
  e.path = pts;
  return cut;
}
// Sena leaves by the door after waking (she keeps rest = 1 until she is outside, so her own logic waits).
function rstNOut(dt) {
  R.nOut.t += dt;
  if (rstWalk(N, dt, 1.6) || R.nOut.t > 9) { R.nOut = null; N.rest = 0; N.speed = 0; N.path = null; N.wait = 2; }
}
// Kids sleep in their own beds (WP6 kidsToBed / kidBed): the baby in her cradle, the girl in her nursery bedroll, or
// (no cradle / no nursery) on her own small mat with her own cover beside the parents' bed.
// GUARDRAIL: a child never sleeps in the parents' bed or under their blanket.
function rstKids(L) {
  kidsToBed(L.s);
  R.kidsIn = false; for (const c of kids) c.inBed = false;
}
// Bed props: the blanket (always), and a bedroll (hide mat + pillows) for the bare house floor or rolled hides in the cave.
function rstProps(L) {
  if (!R.blanket) { R.blanket = makeBlanket(1, 1, 34, 28); scene.add(R.blanket); }   // SIT-r3: a finer grid (6 cm): an upturned foot no longer slips between two vertices
  for (const p of R.props) p.visible = false;
  R.blanket.visible = true;
  if (R.bedHide) R.bedHide.visible = true;
  R.bedHide = L.s.bedHide || null;                                                         // the shelter's own cover is the blanket now
  if (R.bedHide) R.bedHide.visible = false;
  if (L.D.roll) {
    let g = R.props.find((p) => p.userData.kind === L.D.roll);
    if (!g) { g = makeBedroll(L.D.roll === 'mat'); g.userData.kind = L.D.roll; scene.add(g); R.props.push(g); }
    g.position.copy(W2(L, [(L.D.head[0][0] + L.D.head[1][0]) / 2, L.D.bed[2]], L.floorY)); g.rotation.y = L.yaw; g.visible = true;
    g.userData.pillows?.forEach((pl, i) => { const hp = L.D.head[i]; pl.position.set(hp[0] - (L.D.head[0][0] + L.D.head[1][0]) / 2, L.D.mat - L.D.floor + 0.035, hp[1] - L.D.bed[2] - 0.13); });
  }
  rstDrape(0);
}
// STORY: the floor-bed kneel (the 'work' clip is Fixing_Kneeling, bent over with the hands on the ground): the spine is
// pitched back until the torso stands almost upright and the hands rest on the thighs, so going down to the mat (and
// getting up) reads as kneeling, not crawling. Only while the base pose shows; the lie override blends it away.
const _kp = new V3(), _kn = new V3(), _kr = new V3(), _kf = new V3(), _kt = new V3(), _kpole = new V3();
function rstKneelOverride(e) {
  return (h) => {
    if (!R.on || !(e.rest > 0) || h.pose !== 'work' || !R.L?.low) return;
    const w = 1 - smooth01(e.lieW || 0);
    if (!(w > 0.01)) return;
    const b = h.bones, yaw = h.root.rotation.y;
    _kr.set(Math.cos(yaw), 0, -Math.sin(yaw)); _kf.set(Math.sin(yaw), 0, Math.cos(yaw));
    b.pelvis.getWorldPosition(_kp); b.neck_01.getWorldPosition(_kn); _kn.sub(_kp);
    const tilt = Math.atan2(_kn.dot(_kf), _kn.y);                                   // forward lean of the torso
    rotW(b.spine_01, _kr, -(tilt - 0.1) * w);
    for (const sd of ['l', 'r']) {                                                  // hands on the thighs, elbows out and back
      const th = b['thigh_' + sd].getWorldPosition(_kt), ca = b['calf_' + sd].getWorldPosition(_kpole);
      _kt.lerp(ca, 0.6); _kt.y += 0.07; _kt.addScaledVector(_kr, (sd === 'l' ? 1 : -1) * 0.02);
      b['upperarm_' + sd].getWorldPosition(_kpole); _kpole.addScaledVector(_kf, -0.4).addScaledVector(_kr, (sd === 'l' ? 1 : -1) * 0.3);
      ik2(h, sd, _kt, _kpole, w);
    }
  };
}
// Shape the blanket over the sleepers' hips and legs (from the waist down), centred between them and aligned to the bed.
const DRAPE_BONES = [['spine_01', 0.11], ['pelvis', 0.12], ['thigh_l', 0.105], ['thigh_r', 0.105], ['calf_l', 0.075], ['calf_r', 0.075], ['foot_l', 0.08], ['foot_r', 0.08], ['ball_l', 0.07], ['ball_r', 0.07], ['ball_leaf_l', 0.065], ['ball_leaf_r', 0.065], ['hand_l', 0.05], ['hand_r', 0.05]];   // SIT-r4: the limbs' real thickness (the old radii stood the cover 0.4 m up); a hand resting under the cover's edge
const DRAPE_MIDS = [['thigh_l', 'calf_l', 0.08], ['thigh_r', 'calf_r', 0.08], ['calf_l', 'foot_l', 0.07], ['calf_r', 'foot_r', 0.07], ['foot_l', 'ball_leaf_l', 0.07], ['foot_r', 'ball_leaf_r', 0.07]];   // SIT-r3: + the instep
const _dp = [], DRAPE_NZ = 40;                    // STORY: a thin cloth laid over the bodies, never a tent of lumps (SIT-r4: NZ rows per sleeper's ridge)
function rstDrape(k) {
  const L = R.L, bl = R.blanket;
  if (!L || !bl) return;
  const D = L.D, solo = !R.together, [bw, bl2, bz] = D.bed, low = !!D.low;
  let x0 = solo ? D.solo[0] : (D.head[0][0] + D.head[1][0]) / 2;                                              // blanket centre
  const bx = (D.head[0][0] + D.head[1][0]) / 2;                                                                // bed centre
  const span = solo ? 0 : Math.abs(D.head[1][0] - D.head[0][0]);
  // round 2: from the waist (head + 0.5) to just past the toes; on a raised bed it overhangs the sides a little, on a
  // floor bed or the cave hides it is only as wide and long as the sleepers need (no cover running far past the feet)
  let wid = solo ? 1.05 : low ? Math.min(bw + 0.3, span + 1.25) : bw + 0.26;
  const zTop = D.head[0][1] + 0.5;
  let zEnd = low ? Math.min(bz + bl2 / 2 + 0.12, D.head[0][1] + 1.86) : bz + bl2 / 2 + 0.14;
  const drop = Math.min(RT.dDrop, D.mat - D.floor - 0.01);                                                    // the skirt hangs ~0.15 m, never to the floor
  // SIT-r3: the cover lies on the bodies like cloth: each limb's top is its bone plus most of its own thickness (dTop),
  // and only a thin sheet (dSheet) between the sleepers (SIT-r4: the ridges below). Sena's knees, curled on her side, reach past a fixed-width cover: on a floor bed it
  // grows (shelter-local) to reach dReach past the furthest knee or foot, so nothing pokes out of its edge.
  _dp.length = 0;
  const O = W2(L, [0, 0], 0);
  let xa = 1e9, xb = -1e9, zb = -1e9;
  const pts = [[], []];                                                        // SIT-r4: shelter-local [x, z, top, r] per sleeper
  const add = (v, r, si) => {
    const top = v.y - L.matY + r * RT.dTop + 0.02;
    _dp.push([v.x, v.z, top, r]);
    const dx = v.x - O.x, dz = v.z - O.z, lx = dx * L.right.x + dz * L.right.z, lz = dx * L.fwd.x + dz * L.fwd.z;
    pts[si].push([lx, lz, top, r]);
    if (lz > zTop) { xa = Math.min(xa, lx - r); xb = Math.max(xb, lx + r); zb = Math.max(zb, lz + r); }
  };
  if (k > 0) (R.together ? [P, N] : [P]).forEach((e, si) => {
    if (!e.lie) return;
    for (const [n, r] of DRAPE_BONES) add(e.h.bones[n].getWorldPosition(_re), r, si);
    for (const [a, b2, r] of DRAPE_MIDS) add(e.h.bones[b2].getWorldPosition(_rf).add(e.h.bones[a].getWorldPosition(_re)).multiplyScalar(0.5), r, si);
  });
  if (low && xb > xa) {
    const a = Math.min(x0 - wid / 2, xa - RT.dReach), b = Math.max(x0 + wid / 2, xb + RT.dReach);
    x0 = (a + b) / 2; wid = b - a; zEnd = Math.max(zEnd, Math.min(zb + RT.dReach + 0.22, bz + bl2 / 2 + 0.6));   // past the toes by more than the soft run-out below
  }
  bl.position.copy(W2(L, [x0, (zTop + zEnd) / 2], L.matY)); bl.rotation.y = L.yaw; bl.scale.set(wid, 1, zEnd - zTop);
  bl.updateMatrixWorld(true);
  rstCradleCover(1);                                 // the baby stays tucked in while her parents get up
  const kk = smooth01(k), half = bw / 2, end = bz + bl2 / 2;
  // SIT-r4: one smooth ridge per sleeper instead of a bump per bone (the bumps read as a lumpy mound with peaks at the
  // knees and feet). Down the bed, each row takes the highest limb within reach (a soft fall of dRun along the body),
  // and across it the ridge spans the limbs' width with a low dome, then falls off the sides at a cloth angle (dSide).
  // A ridge never rises above dCap; the limb guard below (needAt) still keeps every foot and knee under the cloth.
  const NZ = DRAPE_NZ, pz0 = zTop - 0.1, pdz = (zEnd + 0.2 - pz0) / (NZ - 1), profs = [];
  for (const ps of pts) {
    if (!ps.length) continue;
    const top = new Float32Array(NZ), xl = new Float32Array(NZ), xr = new Float32Array(NZ), tmp = new Float32Array(NZ);
    let cx = 0; for (const p of ps) cx += p[0]; cx /= ps.length;
    for (let j = 0; j < NZ; j++) {
      const z = pz0 + j * pdz;
      let t = 0, a = 1e9, b = -1e9;
      for (const [px, pz, pt, r] of ps) {
        if (pz < zTop - r) continue;                                            // above the waist: not under the cover
        const dd = Math.max(0, Math.abs(pz - z) - r);
        if (dd < RT.dRun) t = Math.max(t, Math.min(RT.dCap, pt) * (1 - smooth01(dd / RT.dRun)));
        if (dd < 0.12) { a = Math.min(a, px - r); b = Math.max(b, px + r); }
      }
      top[j] = t; xl[j] = a < b ? a : cx; xr[j] = a < b ? b : cx;
    }
    for (let j = 0; j < NZ; j++) if (xl[j] === cx && xr[j] === cx) {           // rows past the toes: keep the last width
      let m = j; while (m > 0 && xl[m] === cx && xr[m] === cx) m--; xl[j] = xl[m]; xr[j] = xr[m];
    }
    for (const A of [top, xl, xr]) for (let p = 0; p < 3; p++) {
      for (let j = 0; j < NZ; j++) tmp[j] = (A[Math.max(0, j - 1)] + 2 * A[j] + A[Math.min(NZ - 1, j + 1)]) / 4;
      A.set(tmp);
    }
    profs.push({ top, xl, xr });
  }
  const ridge = (sx, sz) => {
    const f = clamp((sz - pz0) / pdz, 0, NZ - 1.001), j = Math.floor(f), u = f - j;
    let h = 0, ca = 0, cb = 0, ta = 0, tb = 0;
    profs.forEach(({ top, xl, xr }, n) => {
      const t = top[j] + (top[j + 1] - top[j]) * u;
      const a = xl[j] + (xl[j + 1] - xl[j]) * u, b = xr[j] + (xr[j + 1] - xr[j]) * u, c = (a + b) / 2, hw = Math.max(0.06, (b - a) / 2);
      if (n) { cb = c; tb = t; } else { ca = c; ta = t; }
      if (!(t > 0.005)) return;
      const q = Math.abs(sx - c) / hw;
      const v = q <= 1 ? t * (1 - RT.dDome * q * q) : t * (1 - RT.dDome) * (1 - smooth01((q - 1) * hw / (0.06 + t * RT.dSide)));
      h = Math.max(h, v);
    });
    // between the two sleepers the cloth spans the gap from one body to the other (sagging a little), not down to the mattress
    if (profs.length > 1 && (sx - ca) * (sx - cb) < 0) {
      const m = Math.abs(sx - ca) / Math.abs(cb - ca), lo = ta + (tb - ta) * m;
      h = Math.max(h, lo * (1 - RT.dDome) * (1 - RT.dSag * Math.sin(Math.PI * m)));
    }
    return h;
  };
  bl.userData.drape((lx, lz) => {
    const sx = x0 + lx * wid, sz = (zTop + zEnd) / 2 + lz * (zEnd - zTop);                // shelter-local
    const ex = Math.abs(sx - bx) - half, ez = sz - end;
    const out = low ? 0 : Math.max(ex, ez, 0);
    // a flat sheet a hand above the mattress over the whole sleeping area (bridges the gap between the two bodies) ...
    let h = 0.02 + RT.dSheet * kk * (1 - smooth01(Math.max(ex + 0.12, ez + 0.1, 0) / 0.18));
    // ... raised along each sleeper's ridge (SIT-r4)
    h = Math.max(h, ridge(sx, sz) * kk + 0.02);
    if (low) {                                                                       // floor bed / cave hides: the cover thins out over its last 20 cm onto the mat
      const ebx = Math.abs(lx) * wid - wid / 2, ebz = Math.abs(lz) * (zEnd - zTop) - (zEnd - zTop) / 2, eb = Math.max(ebx, ebz);
      const o2 = Math.max(ex, ez, 0);                                                // past the hides' own edge it drapes down to the ground
      const hem = Math.min(smooth01(-ebx / 0.2), smooth01(-ebz / (lz > 0 ? 0.3 : 0.05)));   // SIT-r4: no long run-out at the waist (the cover lay flat across his hips there)            // SIT-r3: a 20 cm hem at the sides, a long soft run-out past the feet (no wall at the foot)
      return 0.012 + (h - 0.012) * hem - (eb > -0.04 ? Math.min(drop, 0.04 + eb) : 0) - (o2 > 0 ? Math.min(drop, o2 * 0.9) : 0);   // SIT-r3: off the hides' edge in a slope, not a step
    }
    if (out > 0) { const hang = -Math.min(drop, out * 1.6) + 0.01; return Math.max(hang, h - out * 2.4); }   // raised bed: the edge rolls over and hangs a short skirt
    return h;
  }, RT.dPass, (lx, lz) => {                         // SIT-r3: smoothed hard (dPass), then never below a limb's own surface (a round limb of radius r)
    if (!(kk > 0) || !RT.dGuard) return -1;      // SIT-r4: dGuard (how much of each limb's radius the cloth must clear after smoothing; 0 = off)
    _re.set(lx, 0, lz); bl.localToWorld(_re);
    let n = -1;
    for (const [x, z, top, r] of _dp) {
      const d2 = (_re.x - x) ** 2 + (_re.z - z) ** 2;
      const R2 = r * r * 2.3;                        // a little wider than the bone's radius (a foot or a knee is not a sphere)
      if (d2 < R2) n = Math.max(n, (top - r * RT.dTop - 0.02 + r * RT.dGuard * Math.sqrt(1 - d2 / R2) + 0.012) * kk);   // SIT-r4: only a real poke-through (the ridge already clears each limb by its radius; the full-radius guard raised a spike at every toe)
    }
    return n;
  });
}
// STORY: the child's own bed. The baby is a swaddled bundle in her cradle (no cover: the swaddle is her wrap); the girl
// has a hide bedroll (makeBedroll, scaled to her) with her own small cover to her chest, in the nursery or, without
// one, on her own mat beside the parents' bed (kidBed). Never the parents' blanket.
const _cv = [];
function rstCradleCover(k) {
  const c = kids[0], s = R.s, cr = s && inCradle(s, 0), roll = !!(s && c && !cr && c.rest > 0);
  if (R.kidRoll) R.kidRoll.visible = roll;
  if (!s || !c || !(c.rest > 0) || cr) { if (R.kidBl) R.kidBl.visible = false; return; }
  if (!R.kidBl) { R.kidBl = makeBlanket(1, 1); scene.add(R.kidBl); }
  // round 3: the mat and the cover reach well past her feet (the cover's foot edge used to end at her toes, where it
  // folded up round the wrapped feet and tore)
  if (!R.kidRoll) { R.kidRoll = makeBedroll(true); R.kidRoll.scale.set(0.5, 1, 0.66); for (const p of R.kidRoll.userData.pillows) { p.position.set(0, 0.07, -0.78); p.scale.set(0.7, 0.75, 1); } scene.add(R.kidRoll); }
  const F = kidBed(s, 0), gy = s.group?.position.y ?? 0;
  R.kidRoll.visible = true; R.kidRoll.position.copy(toWorld(s, [F[0], F[1] - 0.045, F[2] - 0.47])); R.kidRoll.rotation.y = s.rot || 0;
  if (c.baby) { R.kidBl.visible = false; return; }                                   // a swaddled baby on her mat: already wrapped
  const bl = R.kidBl, base = gy + F[1] - 0.005, W = 0.84, Lz = 0.94;
  bl.visible = true; bl.position.copy(toWorld(s, [F[0], F[1] - 0.005, F[2] - 0.25])); bl.rotation.y = s.rot || 0; bl.scale.set(W, 1, Lz); bl.updateMatrixWorld(true);
  // what the cover must clear: her body and legs by their thickness, and the wrapped feet to the tips of the toes
  // (sampled along the foot: the ankle, the ball and past it; the foot wraps are a centimetre proud of the skin)
  _cv.length = 0;
  for (const [n, r] of [['spine_01', 0.08], ['pelvis', 0.08], ['thigh_l', 0.07], ['thigh_r', 0.07], ['calf_l', 0.06], ['calf_r', 0.06], ['foot_l', 0.065], ['foot_r', 0.065], ['ball_l', 0.05], ['ball_r', 0.05]]) {
    const b = c.h.bones[n]; if (!b) continue;
    const v = b.getWorldPosition(_re); _cv.push([v.x, v.z, Math.max(0, v.y - base) + r * 1.1, r]);   // over her, not through: each limb's own thickness and more
    if (/^ball_/.test(n)) { const f = c.h.bones['foot_' + n.slice(-1)].getWorldPosition(_rb), tip = _re.clone().lerp(f, -0.7); _cv.push([tip.x, tip.z, Math.max(0, tip.y - base) + 0.05, 0.045]); }   // the toe tips
  }
  const kk = smooth01(k), need = (wx, wz) => { let h = 0; for (const [x, z, top, r] of _cv) { const d = Math.hypot(wx - x, wz - z); if (d < r) h = Math.max(h, (top + 0.01) * kk); } return h; };
  bl.userData.drape((lx, lz) => {
    _re.set(lx, 0, lz); bl.localToWorld(_re);
    let h = 0.012;
    for (const [x, z, top, r] of _cv) { const d = Math.hypot(_re.x - x, _re.z - z); if (d < r + 0.14) h = Math.max(h, top * (1 - smooth01((d - r) / 0.14)) * kk + 0.012); }
    return 0.012 + (h - 0.012) * smooth01((0.5 - lz) * Lz / 0.13);                // on the floor bedroll: lies flat at the edges, and falls flat to the mat past her feet (no lifted, folded foot edge)
  }, 3, (lx, lz) => { _re.set(lx, 0, lz); bl.localToWorld(_re); return need(_re.x, _re.z); });   // never through her, after the smoothing
}
// The shelter's camera shot: from where the camera is now to pos/look over dur (cut = jump straight there).
function rstShot(pos, lookPt, dur, cut = false) {
  const lf = R.lastLook || camera.getWorldDirection(new V3()).multiplyScalar(4).add(camera.position);
  camShot = { dolly: true, from: camPos.clone(), lookFrom: lf.clone(), pos: pos.clone(), look: lookPt.clone(), k: cut ? 1 : 0, dur };
}
function rstCamera() {
  const c = camShot, now = performance.now(), dt = Math.min(0.15, c.last ? (now - c.last) / 1000 : 0.016);
  c.last = now;
  c.k = Math.min(1, c.k + dt / c.dur);
  const k = smooth01(c.k);
  if (c.release) {
    // ease from the bedside shot into the normal third-person camera behind Aro (same formula as updateCamera)
    const cp = Math.cos(camPitch);
    if (view === 'fpp') {                                   // first person: ease into Aro's eyes
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      _rf.set(P.pos.x + fx * 0.16, P.pos.y + 1.68, P.pos.z + fz * 0.16);
      look.set(_rf.x + fx * cp, _rf.y - Math.sin(camPitch) - 0.3, _rf.z + fz * cp);
    } else {
      look.set(P.pos.x + Math.cos(camYaw) * 0.45, P.pos.y + 1.7, P.pos.z - Math.sin(camYaw) * 0.45);
      _rf.set(look.x + Math.sin(camYaw) * cp * camDist, look.y + Math.sin(camPitch) * camDist, look.z + Math.cos(camYaw) * cp * camDist);
      _rf.y = Math.max(_rf.y, getHeight(_rf.x, _rf.z) + 0.35, 0.7);
      structCam(look, _rf);
    }
    if (view !== 'fpp') {
      // SIT-r3: orbit around him (yaw, height and distance eased separately) instead of a straight line from the old shot:
      // the line cut past his shoulder (4.7 m -> 2.3 m -> 5.4 m at the hut: head-only crop, the spear across the frame).
      if (!c.orb) { _rd.subVectors(c.from, look); c.orb = { yaw: Math.atan2(_rd.x, _rd.z), d: Math.hypot(_rd.x, _rd.z), y: _rd.y }; }
      _rd.subVectors(_rf, look);
      const o = c.orb, yaw = o.yaw + wrapA(Math.atan2(_rd.x, _rd.z) - o.yaw) * k, d = o.d + (Math.hypot(_rd.x, _rd.z) - o.d) * k;
      camPos.set(look.x + Math.sin(yaw) * d, look.y + o.y + (_rd.y - o.y) * k, look.z + Math.cos(yaw) * d);
      camPos.y = Math.max(camPos.y, getHeight(camPos.x, camPos.z) + 0.35);
      structCam(look, camPos);
    } else
    camPos.lerpVectors(c.from, _rf, k);
    _rd.set(look.x, look.y + 0.3, look.z).sub(c.lookFrom).multiplyScalar(k).add(c.lookFrom);
    camera.position.copy(camPos); camera.lookAt(_rd);
    if (c.k >= 1) camShot = null;
    return;
  }
  camPos.lerpVectors(c.from, c.pos, k);
  (R.lastLook ||= new V3()).lerpVectors(c.lookFrom, c.look, k);
  camera.position.copy(camPos); camera.lookAt(R.lastLook);
  if (R.on && typeof wpnRest !== 'function') { torch.root.visible = false; P.h.spear.visible = P.h.axe.visible = false; }   // no weapon package: just hide the tools in bed
  if (R.on && senaLit && R.glowPos) {                                // in a cave Sena's torch is set down by the bed: its light becomes the glow
    senaTorch.root.visible = false; senaTorch.light.position.copy(R.glowPos); senaTorch.light.intensity = torch.light.intensity * 0.9; torch.light.intensity = 0;
  }
}
// Pull the third-person camera in front of hut/house/stable walls and roofs (a ray from the look point to the camera).
const _rcast = new THREE.Raycaster(), _rdir = new V3();
const CAM_KINDS = { hut: 1, house: 1, stable: 1, kiln: 1, well: 1 };
const shown = (o, top) => { for (; o && o !== top; o = o.parent) if (!o.visible) return false; return true; };
function structCam(lk, cp) {
  let n = 0;
  for (const s of structs) {
    if (!CAM_KINDS[s.kind] || s.rise < 1 || Math.hypot(s.x - lk.x, s.z - lk.z) > s.radius + 6) continue;
    if (++n > 3) break;
    if (!s.camMeshes) { s.camMeshes = []; s.group.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.userData.noCam) s.camMeshes.push(o); }); }
    _rdir.subVectors(cp, lk); const d = _rdir.length(); if (d < 0.55) continue;
    _rdir.divideScalar(d); _rcast.set(lk, _rdir); _rcast.far = d;
    const hit = _rcast.intersectObjects(s.camMeshes, false).find((h) => shown(h.object, s.group));
    if (hit) cp.copy(lk).addScaledVector(_rdir, Math.max(0.5, hit.distance - 0.2));
  }
}
const cine = (on) => { $('hud').classList.toggle('cine', on); $('restbars').classList.toggle('on', on); if (!on) $('hud').classList.remove('cinew'); };
function rstLog(ph) { R.phase = ph; R.t = 0; R.log.push([ph, +(performance.now() / 1000).toFixed(2)]); }
// Start the sequence. mode 'dawn' (until 06:20) or 'nap' (2 hours). o.force skips the rules (old tests, G.sleep).
function rstBegin(s, mode = 'dawn', o = {}) {
  if (R.on || !s || !playing || busy) return false;                                       // never over a fade or another scene
  if (!o.force && rstBlock(s) === 'wolves') { toast('You can\'t rest with wolves prowling nearby'); return false; }
  if (P.ride) dismount();
  if (R.nOut) { R.nOut = null; N.rest = 0; N.path = null; }                               // Sena was still on her way out from last time
  if (typeof wpnStowAll === 'function') wpnStowAll('rest', true);                       // WPN: weapons away, aim cancelled
  R.torchWas = torchOn;
  if (torchOn) setTorch(false);                                                           // the torch goes out (no toast)
  rstAbort();
  const together = rstTogether(s), L = rstLayout(s);
  Object.assign(R, { on: true, s, mode, together, L, applied: false, skip: false, hold4: 0, line: null, log: [], storm: world.env.storm > 0.5, speed: 1,
    t0: S.time, hours: mode === 'nap' ? 2 : (((6.3 - S.time) % 24) + 24) % 24 || 24, dayDone: false, dream: false, morning: false, wpnWoke: false,
    hp0: S.hp, close0: S.close, eve: S.c.mealDay === S.day || S.c.satDay === S.day, first: !S.c.restSeen, out: null, nOut: null, comfort: rstComfort(s, together),
    dolly: false, skipping: false, dip: 0, holdPt: null, lastLook: null, kidsIn: false, released: false, hutOut: false, glowPos: null, skipSpeed: 0, lastNow: 0, ext: false });
  R.t1 = (R.t0 + R.hours) % 24; R.tier = rstTier(R.comfort);
  rstLog('prep');
  busy = true; cine(true); $('prompt').style.display = 'none';
  subs.length = 0; subT = 0; $('sub').classList.remove('on');                              // a clean slate for the night's lines
  P.restAt = N.restAt = s;
  if (N.hearth?.phase === 'sit' && N.seat) { N.pos.x = N.seat.x; N.pos.z = N.seat.z; }   // round 2: sitting by the hearth, she gets up from there (never staged at the door)
  senaHearthDrop(); for (const e of [P, N]) { e.floorSit = 0; e.fsW = 0; e.hearthSeat = false; }   // STORY hearth: up off the floor and to bed
  for (const e of together ? [P, N] : [P]) {
    e.sit = 0; e.work = 0; e.dance = 0; e.h.pose = null; e.vx = e.vz = 0; e.seat = null; e.soak = false; e.soakOut = false; e.h.straddle = false; e.stretch = -1; e.path = null; e.jy = 0;
    e.rest = 1;
  }
  P.auto = false; P.workSite = null; N.node = null; N.working = false; N.workSite = null;
  if (!together && !N.ride) { N.rest = 1; N.speed = 0; N.path = null; N.lie = false; }      // alone: Sena keeps to wherever she is for the night
  if (together && N.ride) { N.ride = false; N.seat = null; }
  rstPlan(P, 0, L, !together);
  if (together) rstPlan(N, 1, L, false);
  P.L.hand = null; if (together) N.L.hand = null;
  for (const e of together ? [P, N] : [P]) {
    e.h.addOverride('lie', 10, rstLieOverride(e)); e.h.addOverride('hold', 30, rstHoldOverride(e));
    e.h.addOverride('breath', 40, rstBreathOverride(e)); e.h.addOverride('stretch', 40, rstStretchOverride(e));
    if (L.low) e.h.addOverride('kneelUp', 9, rstKneelOverride(e));                    // STORY: kneel upright on a floor bed, not on all fours
  }
  if (s.col) s.col.off = true;                                                             // walk in through the doorway
  const cutP = rstPath(P, L, P.L.sitPos, 0, together ? L.D.via[0] : []), cutN = together && rstPath(N, L, N.L.sitPos, 1.1, L.D.via[1]);
  let farN = false;                                                                       // Sena some way off: she joins him at the door (under the cut)
  if (together && !cutN && Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) > 9) { farN = true; N.pos.copy(P.pos).addScaledVector(L.fwd, 1.1); N.path = [...(L.door ? [L.door[0].clone(), L.door[1].clone()] : []), ...L.D.via[1].map((v) => W2(L, v, 0)), N.L.sitPos.clone()]; }
  R.nDelay = 0.55;
  rstProps(L);
  // WPN: weapons become props by the bed for the night (spear at the bed head, axe and torch on the floor, the basket)
  const lay = { spear: W2(L, [L.D.head[0][0] - 0.55, L.D.head[0][1] - 0.25], L.floorY), axe: P.L.sitPos.clone().addScaledVector(L.right, -0.45).addScaledVector(L.fwd, 0.35),
    basket: together ? N.L.sitPos.clone().addScaledVector(L.right, 0.45).addScaledVector(L.fwd, -0.35) : null };   // integration: alone, Sena keeps her basket
  lay.axe.y = L.floorY; if (lay.basket) lay.basket.y = L.floorY;
  if (typeof wpnRest === 'function') wpnRest(s, lay);
  if (kids.length) rstKids(L);                                                             // Lio is already asleep when they come in
  const cut = cutP || cutN || farN || kids.length > 0;
  if (cut) { $('restdip').classList.add('on'); R.dip = 0.35; }
  rstShot(L.cam.walk, L.cam.walkLook, cut ? 0.01 : 1.0, cut);
  rstLog('walk');
  return true;
}
// One frame of the sequence (from updatePlayer's rest branch).
function rstUpdate(dt) {
  if (!R.on) { P.rest = 0; return; }
  const now = performance.now();                                                  // the scene runs on the wall clock (smooth at any frame rate)
  dt = Math.min(0.15, R.lastNow ? (now - R.lastNow) / 1000 : dt); R.lastNow = now;
  if (R.dip > 0 && (R.dip -= dt) <= 0) $('restdip').classList.remove('on');
  const L = R.L, tog = R.together, s = R.s, D = L.D;
  const hold = R.freeze === R.phase && R.t >= ({ walk: 0.9, sit: 0.9, lie: tog ? 1.85 : 1.1, night: R.nightDur * 0.5, wake: 2.0 }[R.phase] ?? 0);
  if (hold) { if (R.phase === 'night') rstNightTick(0); if (tog && R.phase !== 'walk') rstHoldTick(dt); if (P.lie) rstDrape(1); rstGlow(); return; }
  if (R.skip && /^(walk|sit|lie|night)$/.test(R.phase) && !R.skipping) { R.skipping = true; $('restdip').classList.add('on'); R.skipT = 0.32; }
  if (R.skipping) {
    if ((R.skipT -= dt) > 0) { rstWalk(P, dt, 1.7); return; }
    // jump to the end of the night: everyone lying, the time and outcome applied, then wake at 1.5×
    R.skipping = false; R.skip = false; $('restdip').classList.remove('on');
    for (const e of tog ? [P, N] : [P]) { e.pos.copy(e.L.sitPos); e.face = e.L.sitYaw; e.path = null; e.speed = 0; e.lie = true; e.lieW = 1; e.L.rollW = 1; e.h.pose = e.L.base; e.L.sitRoot = null; e.L.cal = null; }
    if (tog) { P.L.hold = N.L.hold = 1; }
    rstKids(L); rstTimeLapse(1); R.dream = true; rstApply(); R.speed = R.skipSpeed || 1.5;
    if (R.hold4 > 0) { rstShot(L.cam.end, L.cam.look, 0.01, true); $('fade').classList.add('on'); rstLog('birth'); return; }
    rstStartWake();
    return;
  }
  R.t += dt * R.speed;
  const t = R.t;
  switch (R.phase) {
    case 'walk': {
      const a = rstWalk(P, dt, 1.9);
      let b = true;
      if (tog) { if (t > R.nDelay) b = rstWalk(N, dt, a ? 2.3 : 1.9); else N.speed = 0; }
      if ((a && b) || t > 4.5) {
        for (const e of tog ? [P, N] : [P]) { e.pos.copy(e.L.sitPos); e.path = null; e.speed = 0; }
        // cut to the bedside, a little wide, and push in slowly while they settle
        _ra.subVectors(L.cam.end, L.cam.look).normalize();
        camShot = { dolly: true, from: L.cam.end.clone().addScaledVector(_ra, 0.75), lookFrom: L.cam.look.clone(), pos: L.cam.end.clone(), look: L.cam.look.clone(), k: 0, dur: 6.5 };
        camPos.copy(camShot.from); R.dolly = true;
        rstLog('sit');
      }
      break;
    }
    case 'sit': {
      for (const [e, t0] of tog ? [[P, 0], [N, 0.25]] : [[P, 0]]) {
        const u = t - t0;
        if (u < 0) continue;
        e.face = turn(e.face, e.L.sitYaw, Math.min(1, dt * 10));
        if (!e.L.sat) { e.L.sat = true; if (!L.low) e.h.swing('sitDown'); e.h.pose = e.L.base; }
      }
      if (t > 1.05) {
        for (const e of tog ? [P, N] : [P]) { e.face = e.L.sitYaw; e.L.sat = false; }
        rstLog('lie');
      }
      break;
    }
    case 'lie': {
      P.lie = true; P.lieW = Math.min(1, t / 1.0); P.L.rollW = P.lieW;
      if (tog) {
        if (t > 0.3) { N.lie = true; N.lieW = Math.min(1, (t - 0.3) / 1.0); }
        N.L.rollW = clamp((t - 1.1) / 0.7, 0, 1);
      }
      rstDrape(1);
      if (!R.dolly) { R.dolly = true; rstShot(L.cam.end, L.cam.look, 2.4); }
      if (t > (tog ? 2.0 : 1.2)) { R.dolly = false; rstStartNight(); }
      break;
    }
    case 'night': rstNightTick(dt); break;
    case 'birth':
      if (t > 4) { $('fade').classList.remove('on'); rstStartWake(); }
      break;
    case 'wake': rstWakeTick(dt); break;
  }
  if (tog && R.phase !== 'walk') rstHoldTick(dt);
  if (/^(night|birth)$/.test(R.phase)) rstDrape(1);
  rstGlow();
}
// A low, warm glow by the bed (the dying embers) so the night scene reads; it borrows the unlit torch's light.
function rstGlow() {
  if (torchOn || !R.L) return;
  const L = R.L, u = R.phase === 'night' ? Math.min(1, R.t / R.nightDur) : R.phase === 'wake' ? 1 : 0;
  const k = R.phase === 'wake' ? Math.max(0, 1 - R.t / 2.5) : 1;
  if (!R.glowPos) { R.glowPos = L.cam.end.clone().lerp(W2(L, [(L.D.head[0][0] + L.D.head[1][0]) / 2, L.D.head[0][1] + 0.5], 0), 0.45); R.glowPos.y = L.floorY + 1.25; }   // a low key light on the camera side
  torch.light.position.copy(R.glowPos);
  torch.light.color.setHex(0xffc08a);
  torch.light.intensity = (L.kind === 'cave' ? 5.5 : 5) * (1 - 0.2 * Math.sin(Math.PI * u)) * k * (0.94 + Math.sin(clock * 7) * 0.04 + Math.sin(clock * 17) * 0.03);
}
function rstStartNight() {
  rstLog('night');
  R.t0 = S.time; R.hours = R.mode === 'nap' ? 2 : (((6.3 - S.time) % 24) + 24) % 24 || 24; R.t1 = (R.t0 + R.hours) % 24;   // the night runs from now
  R.nightDur = R.mode === 'nap' ? 2.4 : R.first ? 3.8 : 3.0;
  $('restvig').classList.add('on');
  A.tone(262, 2.2, 0.015); A.tone(330, 2.2, 0.012, 0.6);                               // a soft lullaby pair
  const ch = CH[S.ch].id, pool = DREAM[ch] || DREAM.village, odd = cnt('slept') % 2 === 1;
  R.line = !R.together ? ['Aro', pool[1][1]] : odd ? pool[1] : pool[0];
}
// The time-lapse: S.time from t0 to t1 (06:20 or +2 h); the day turns once (dawn mode).
function rstTimeLapse(u) {
  const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
  const tt = R.t0 + e * R.hours;
  if (!R.dayDone && tt >= 24) { R.dayDone = true; S.day++; }   // only when the clock crosses midnight (a nap too); after midnight the day has already turned
  S.time = ((tt % 24) + 24) % 24;
}
function rstNightTick(dt) {
  const u = Math.min(1, R.t / R.nightDur);
  rstTimeLapse(u);
  if (world.env.storm > 0.5) R.storm = true;
  if (!R.dream && u > 0.25) { R.dream = true; if (R.line) say(...R.line); }
  // the sky: a cut outside to the shelter under the turning stars, held until the sun comes up, then back in at the wake
  if (!R.ext && u > 0.36 && R.L.cam.ext && dt > 0) {
    R.ext = true; $('restdip').classList.add('on');
    setTimeout(() => { if (R.on && R.phase === 'night') { const L = R.L; camShot = { dolly: true, from: L.cam.ext.clone(), lookFrom: L.cam.extLook.clone(), pos: L.cam.ext.clone().lerp(L.cam.extLook, 0.12), look: L.cam.extLook.clone(), k: 0, dur: R.nightDur * 0.7 }; } $('restdip').classList.remove('on'); }, 300);
  }
  if (A.ctx && dt > 0 && structs.some((f) => (f.kind === 'fire' || (f.kind === 'house' && S.home.hearth)) && f.rise >= 1 && Math.hypot(f.x - P.pos.x, f.z - P.pos.z) < 10) && rand() < dt * 5) A.hit(300 + rand() * 600, 0.05, 0.025);
  if (u >= 1) {
    rstApply();
    if (R.hold4 > 0) { $('fade').classList.add('on'); rstLog('birth'); return; }   // WP6: Lio's birth card (text set by maybeBirth)
    rstStartWake();
  }
}
function rstStartWake() {
  rstLog('wake');
  $('restvig').classList.remove('on'); $('restvig').classList.add('warm');
  setTimeout(() => $('restvig').classList.remove('warm'), 900);
  $('hud').classList.add('cinew');                                                         // toasts come back for the outcome; the rest of the HUD waits
  rstShot(R.L.cam.wake, R.L.cam.wakeLook, 0.01, true);                                    // morning: a cut to the wider view
  if (R.birth && R.L.kind === 'house' && kids.length && inCradle(R.s, 0)) {               // STORY: the birth morning opens on Lio in her cradle
    // round 2: from the front corner of the room, inside the walls: Lio in her cradle in the foreground, the hearth, and
    // her parents waking in the bed behind (the old close shot showed a closed box in a dark corner and no one else)
    rstShot(toWorld(R.s, [2.72, 1.6, 2.15]), toWorld(R.s, [0.85, 0.48, 0.15]), 0.01, true);
    setTimeout(() => { if (R.on && R.phase === 'wake') rstShot(R.L.cam.wake, R.L.cam.wakeLook, 0.01, true); }, 3200);   // then a cut back to the parents (round 3: a slow move crossed Sena's path to the door: a frame of her hair)
  }
  if (R.ext) { $('restdip').classList.add('on'); setTimeout(() => $('restdip').classList.remove('on'), 120); }
}
function rstWakeTick(dt) {
  const L = R.L, t = R.t, tog = R.together;
  dt *= R.speed;                                                                    // a skipped night wakes at 1.5×
  for (const [e, t0] of tog ? [[P, 0], [N, 0.6]] : [[P, 0]]) {
    const u = t - t0;
    if (u < 0) continue;
    const pl = e.L;
    if (e === N && !pl.solo) pl.rollW = Math.max(0, 1 - u / 0.4);
    const u2 = e === N ? u - 0.3 : u;
    if (e.lie) {                                                                    // sit up (or kneel up) out of the blanket
      pl.hold = Math.max(0, pl.hold - dt * 4);
      e.lieW = clamp(1 - u2 / 0.8, 0, 1);
      if (e.lieW <= 0) { e.lie = false; e.pos.copy(pl.sitPos); e.face = pl.sitYaw; e.h.pose = pl.base; }
    } else if (!pl.up && u2 > 0.85) {                                               // stand up beside the bed
      pl.up = true; if (!L.low) e.h.swing('standUp'); e.h.pose = null;
    } else if (pl.up) {
      if (e.stretch < 0 && u2 > 1.45) { e.stretch = 0; if (e === P) A.tone(180, 0.6, 0.02); else A.tone(240, 0.6, 0.015); }
      if (e.stretch >= 0 && e.stretch <= 1) { e.stretch = Math.min(1.01, e.stretch + dt / 1.1); e.face = turn(e.face, L.yaw, Math.min(1, dt * 2.5)); }
      // Aro then takes a few steps toward the door, where the camera hands back to the player
      if (e === P && e.stretch > 1 && !pl.exit) { pl.exit = true; e.path = L.D.exit.map((q) => W2(L, q, 0)); }
      if (e === P && pl.exit && e.path) { if (rstWalk(e, dt, 1.4)) { e.path = null; e.speed = 0; } }
      else if (e === P && pl.exit) e.face = turn(e.face, L.yaw, Math.min(1, dt * 4));
    }
  }
  rstDrape(Math.max(0, 1 - t / 1.2));
  if (!R.wpnWoke && (P.L.exit || t > 3.2)) { R.wpnWoke = true; if (typeof wpnWake === 'function') wpnWake(); }   // WPN: he gathers his things as he heads out
  if (!R.morning && t > 1.5) {
    R.morning = true;
    if (R.birth) birthLines();                                                       // STORY: the birth morning
    else { const m = rstMorningLine(); if (m) say('Sena', m); if (R.out) R.out.line = m; }
  }
  // round 2, the hut: the room is too small for a camera behind him (it was pulled in to ~1 m: torso crops, the spear
  // across the screen). As he ducks out of the door, cut to a wide shot outside; hand back once he is clear of the hut.
  const hut = L.kind === 'hut';
  if (hut && P.L.exit && !R.hutOut && (rstLocal(L.s, P.pos)[1] > 1.5 || Math.hypot(camPos.x - P.pos.x, camPos.y - P.pos.y - 1.5, camPos.z - P.pos.z) < 1.8)) { R.hutOut = true; R.lastLook = null; rstShot(toWorld(L.s, [2.7, 1.5, 7.4]), toWorld(L.s, [0, 1.0, 3.3]), 0.01, true); }   // SIT-r3: or as he nears the lens (he walked to 0.7 m of it: a face-filling crop)
  if (P.L.exit && !R.released && (!hut || rstLocal(L.s, P.pos)[1] > 3.9 || !P.path)) {
    R.released = true; camYaw = hut ? rstHandYaw(L.s, Math.atan2(camPos.x - P.pos.x, camPos.z - P.pos.z)) : L.yaw + Math.PI;   // SIT-r3: the clear side nearest the wide shot camPitch = hut ? 0.2 : 0.2;
    camShot = { release: true, from: camPos.clone(), lookFrom: (R.lastLook || look).clone(), k: 0, dur: hut ? 1.4 : 1.1 };
  }
  if (P.L.exit && !P.path && !camShot) rstDone();
  else if (t > (hut ? 10 : 7)) { camShot = null; rstDone(); }
}
// round 2: the hand-back camera when Aro is outside a shelter: behind him and looking away from it, swung to whichever
// side keeps the camera clear of the walls (straight behind him was inside the hut: wedged against it, spear in view).
// SIT-r3: pref (the yaw the camera is at now): of the clear sides, the one nearest it, so the hand-back swings the least.
function rstHandYaw(s, pref = null) {
  const base = (s.rot || 0) + Math.PI, dist = Math.max(3.5, camDist);
  let best = base, bd = -1e9, pick = null, pc = 1e9;
  for (const off of [0, 0.55, -0.55, 0.9, -0.9, 1.25, -1.25, 1.6, -1.6]) {
    const a = base + off, cx = P.pos.x + Math.sin(a) * dist, cz = P.pos.z + Math.cos(a) * dist, d = Math.hypot(cx - s.x, cz - s.z) - (s.radius + 0.9);
    if (d > 0) { if (pref == null) return a; const c = Math.abs(off) * 0.5 + Math.abs(wrapA(a - pref)); if (c < pc) { pc = c; pick = a; } }
    if (d > bd) { bd = d; best = a; }
  }
  return pick ?? best;
}
function rstHoldTick(dt) {
  if (!P.L || !N.L) return;
  // the hands: Aro's near hand (closer to Sena) and her upper hand (higher), chosen once both lie still
  if (P.lieW >= 1 && N.lieW >= 1 && N.L.rollW >= 1 && R.phase !== 'wake') {
    if (!P.L.hand) { P.L.hand = P.L.down; N.L.hand = N.L.down === 'l' ? 'r' : 'l'; }   // his near hand, her upper hand
    const a = P.h.bones.spine_02.getWorldPosition(_ra), b = N.h.bones.spine_02.getWorldPosition(_rb);
    R.holdPt = (R.holdPt || new V3()).copy(a).lerp(b, RT.hold[2]).addScaledVector(R.L.fwd, RT.hold[0]);
    R.holdPt.y = R.L.matY + RT.hold[1];
    P.L.hold = N.L.hold = Math.min(1, P.L.hold + dt);
  }
}
// The outcome, applied once at the end of the night (or by a skip / endRest).
function rstApply() {
  if (R.applied) return;
  R.applied = true;
  if (R.phase !== 'wake') rstTimeLapse(1);
  const s = R.s, dawn = R.mode === 'dawn', h = R.hours, C = R.comfort;
  const hp0 = S.hp; S.hp = Math.min(100, S.hp + 6 * h); R.hpGain = S.hp - hp0;
  S.food = Math.max(12, S.food - 1.8 * h); S.water = Math.max(12, S.water - 1.8 * h); S.warm = 100;
  if (dawn) {
    S.rested = 120 + 30 * C; S.restTier = R.tier;
    toast(`${R.tier}: stamina returns faster (${rstMins(C)} min)`);
    bump('slept');
    horseNight();                                                                         // WP4: the horse rests in the stable
  } else toast('A short nap: you feel a little better');
  if (R.together) {
    if (dawn) {
      if (s.kind === 'house') {
        bump('slept_home'); addClose(4, 'rested at home');
        if (cnt('slept_home') === 1 && S.home.bed) { say('Sena', FIRST_HOME); R.morning = FIRST_HOME; }   // that is her morning line
      } else addClose(2, 'rested together');
      if (R.eve) addClose(1, 'a good evening together');
    } else if (S.c.napDay !== S.day) { S.c.napDay = S.day; addClose(1, 'a quiet rest together'); }
    if (dawn && typeof maybeBirth === 'function') { maybeBirth(); rstKids(R.L); }          // WP6: kids, and Lio's birth
  } else if (dawn) { S.c.apartDay = S.day; S.c.apartHome = s === homeHouse() ? 1 : 0; }   // STORY: where Aro slept picks her line
  emit('rested', { hours: h, mode: R.mode, together: R.together, tier: dawn ? R.tier : null });   // MAT bus: SURV healing, ROM night, ARC vigil
  // save with everyone standing outside the door, so a reload never starts inside a solid hut or house
  const kp = P.pos.clone(), kn = N.pos.clone();
  if (R.L.door) { P.pos.copy(R.L.door[0]); N.pos.copy(R.L.door[0]).addScaledVector(R.L.right, 1.2); }
  save();
  P.pos.copy(kp); N.pos.copy(kn);
  if (dawn) toast(dayLabel());                       // STORY: "Year 8 · Day 3" after the epilogue jump
  R.out = { tier: dawn ? R.tier : null, comfort: C, hours: h, hp: +R.hpGain.toFixed(2), close: S.close - R.close0, line: typeof R.morning === 'string' ? R.morning : null, phaseLog: R.log };
}
// Sena's morning line: by shelter, weather, closeness and family; with an open goal as a hint every other morning.
function rstMorningLine() {
  if (!R.together) return null;
  const s = R.s, k = R.L.kind;
  let line;
  if (R.mode === 'nap') line = 'Mm… just a little longer… all right, I\'m up.';
  else if (R.storm) line = s.kind === 'hut' ? 'The rain found a hole in the thatch — right on my nose.' : 'The rain sang on the roof all night.';
  else if (k === 'houseFloor') line = 'A floor is still a floor, even under a roof. A bed would be nice.';
  else if (kids.length && cnt('slept') % 3 === 0) line = `${kids[0].k.name || 'Lio'} slept the night through in her own little bed. She dreams of running.`;   // GUARDRAIL: her own bed, never theirs
  else if (R.tier === 'Snug') line = 'Warm hearth, soft furs… I could stay here forever.';
  else if (k === 'cave') line = 'Stone is a cold pillow. I miss our bed.';
  else if (k === 'hut') line = 'My back aches a little from the ground — but I slept.';
  else line = 'I slept like a stone. Our own bed, Aro.';
  if (S.close >= 60) line = 'Good morning, you. ' + line;
  if (R.mode === 'dawn' && cnt('slept') % 2 === 0) {
    const g = goalsOf().find(([, f]) => !f());                                        // ARC goalsOf
    if (g?.[2] && !(/bed/i.test(g[2]) && /bed/.test(line))) line += ` Let's ${g[2]} today.`;   // STORY: only a goal's own spoken hint (3rd element), never its label
  }
  return arcMorningLine(line);                       // ARC: story mornings (a quiet night, the sling, the winter)
}
function rstDone() {
  const s = R.s, tog = R.together;
  birthLines();                                      // STORY: never leave the birth lines (and the chapter hold) pending
  for (const e of [P, N]) {
    for (const id of ['lie', 'hold', 'breath', 'stretch', 'kneelUp']) e.h.removeOverride(id);
    e.lie = false; e.lieW = 0; e.stretch = -1; e.h.pose = null; e.restAt = null; e.h.root.rotation.x = 0;
  }
  P.rest = 0; P.speed = 0; P.path = null;
  if (tog && s.kind !== 'cave' && R.L.door) { R.nOut = { t: 0 }; N.path = [R.L.door[1].clone(), R.L.door[0].clone(), R.L.door[0].clone().addScaledVector(R.L.fwd, 1.6).addScaledVector(R.L.right, 1.2)]; }
  else if (N.rest > 0) N.rest = 0;
  busy = false; cine(false); $('restvig').classList.remove('on', 'warm'); $('restbars').classList.remove('on'); $('restdip').classList.remove('on');
  R.on = false; R.wokeAt = clock; R.skip = false; R.speed = 1;
  if (!torchOn) torch.light.intensity = 0;
  senaTorch.root.visible = senaLit;
  if (s.kind === 'cave' && R.torchWas && S.fuel > 0) setTorch(true);                        // still dark in the cave: the torch is lit again
  S.c.restSeen = 1; S.c.lastSleepDay = S.day;
  if (s.kind === 'hut' || s.kind === 'house') { R.inside = s; if (s.col) s.col.off = true; } else rstLeave();
  if (!camShot?.release && !R.released) { camYaw = s.kind !== 'cave' && !rstIn(s, P.pos) ? rstHandYaw(s) : (s.rot || 0) + Math.PI; camPitch = 0.18; camShot = null; }   // round 2: outside, never wedged against the walls (SIT-r3: not after the hand-back already set it: that re-aim snapped the camera 1.9 m)
  rstLog('done');
  const out = R.out || { phaseLog: R.log }; out.phaseLog = R.log;
  R.waiters.splice(0).forEach((f) => f(out));
  drawQuest();
}
// endRest (epilogue, G.endRest): finish at once, standing beside the bed
function endRest() {
  if (!R.on) return;
  if (!R.applied) rstApply();
  if (R.hold4 > 0) $('fade').classList.remove('on');
  for (const e of R.together ? [P, N] : [P]) { e.pos.copy(e.L.standPos); e.face = R.L.yaw; e.path = null; }
  camShot = null;
  rstDone();
  if (R.nOut) { N.pos.copy(N.path?.at(-1) || N.pos); R.nOut = null; N.rest = 0; }
}
// die(): reset without applying anything
function rstAbort() {
  if (!R.on && !R.menu) { for (const e of [P, N]) if (e.lie) e.lie = false; return; }
  if (R.menu) { R.menu = false; $('restmenu').classList.remove('on'); }
  for (const e of [P, N]) { for (const id of ['lie', 'hold', 'breath', 'stretch', 'kneelUp']) e.h.removeOverride(id); e.lie = false; e.lieW = 0; e.stretch = -1; e.rest = 0; e.path = null; e.h.pose = null; }
  if (R.on && !MAT.dead) busy = false;              // STORY: rstBegin took busy; an abort hands the controls back (permadeath keeps it)
  birthLines();                                      // STORY: an aborted birth night still gets its lines and releases the chapter hold
  R.on = false; R.nOut = null; cine(false); if (!torchOn) torch.light.intensity = 0; senaTorch.root.visible = senaLit; $('restvig').classList.remove('on', 'warm'); $('restdip').classList.remove('on');
  if (R.s?.col) R.s.col.off = false;
  if (R.blanket) R.blanket.visible = false;
  for (const p of R.props) p.visible = false;
  if (R.bedHide) R.bedHide.visible = true;
  if (camShot?.dolly || camShot?.release) camShot = null;
  R.waiters.splice(0).forEach((f) => f(null));
}
// Per frame (from updateHome): the buff timer and chip, Sena's line after a night apart.
let rstBuffT = 0;
function rstTick(dt) {
  if (!playing) return;
  if (S.rested > 0) { S.rested = Math.max(0, S.rested - dt); if (S.rested <= 0) S.restTier = null; }
  if ((rstBuffT -= dt) <= 0) {
    rstBuffT = 0.5;
    const b = $('buff');
    if (S.rested > 0 && S.restTier) {
      const m = (S.rested / 60) | 0, sec = (S.rested % 60) | 0;
      b.textContent = `${S.restTier} · ${m}:${String(sec).padStart(2, '0')}`; b.style.display = 'block';
      b.style.right = ($('clock').offsetWidth + 26) + 'px';
    } else b.style.display = 'none';
  }
  if (R.kidBl?.visible && !(kids[0]?.rest > 0)) { R.kidBl.visible = false; if (R.kidRoll) R.kidRoll.visible = false; }   // STORY: the cradle / nursery cover goes when Lio is up
  if (!R.on && R.s && R.blanket?.visible && Math.hypot(P.pos.x - R.s.x, P.pos.z - R.s.z) > R.s.radius + 7) { R.blanket.visible = false; for (const p of R.props) p.visible = false; if (R.bedHide) R.bedHide.visible = true; }
  if (S.c.apartDay != null && !R.on && !busy && Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 6) {
    say('Sena', (S.c.apartHome ? APART_HOME : APART)[(S.c.apartDay | 0) % 2]); delete S.c.apartDay; delete S.c.apartHome;
  }
}
function rstLoad() {
  S.restTier ??= S.rested > 0 ? 'Well rested' : null;
  rstBuffT = 0;
  for (const s of structs) if ((s.kind === 'hut' || s.kind === 'house') && s.rise >= 1 && rstIn(s, P.pos)) {
    R.inside = s; if (s.col) s.col.off = true;
    camYaw = (s.rot || 0) + Math.PI; camPitch = 0.18;  // SAVE-PERF: loaded indoors, the camera looks across the room to the door, not into a corner
    break;
  }
}
// SAVE-PERF: a save written during a rest (the page closed mid-night) must not lose the night or reload with the
// camera wedged in the bed corner: everyone is saved standing at the door, and an unfinished night is recorded
// as restPend so start() plays the rest again from the door and skips straight to the morning.
function rstSaveFix() {
  if (!R.on || !R.L) { S.restPend = undefined; return; }
  if (R.L.door) { const d = R.L.door[0]; S.px = d.x; S.pz = d.z; S.nx = d.x + R.L.right.x * 1.2; S.nz = d.z + R.L.right.z * 1.2; }
  S.yaw = R.L.yaw + Math.PI; S.pitch = 0.18;
  S.restPend = R.applied ? undefined : { mode: R.mode, t0: R.t0, day: R.dayDone ? S.day - 1 : S.day };   // the time-lapse replays from when they lay down
}
function rstResume() {                                 // start(): finish a night that a closed page interrupted
  const p = S.restPend; S.restPend = undefined;
  if (!p || !Number.isFinite(p.t0)) return;
  S.gh = Math.max(0, S.gh - MATD.clockDelta(p.t0, S.time));   // undo the part of the night already played, so nothing counts twice
  S.time = p.t0; S.day = p.day ?? S.day; MAT.lastT = S.time;
  const s = rstNearest();
  if (s && rstBegin(s, p.mode === 'nap' ? 'nap' : 'dawn', { force: true })) { S.c.restSeen = 1; R.skip = true; }
}

// The nearest finished hut or house (or the cave bed within 6 m) for G.rest / G.sleep.
const rstCaveStruct = (b) => ({ kind: 'cave', x: b.x, z: b.z, rot: b.rot + Math.PI, radius: 1.2, group: { position: { y: b.y - 0.22 } }, bedPts: [[-0.5, 0.22, 0], [0.5, 0.22, 0]] });
function rstNearest() {
  let b = null, bd = 1e9;
  for (const s of structs) if ((s.kind === 'hut' || s.kind === 'house') && s.rise >= 1) { const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z); if (d < bd) { bd = d; b = s; } }
  for (const c of caves.beds) { const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); if (d < 6 && d < bd) { bd = d; b = rstCaveStruct(c); } }
  return b;
}
// Lie down at once (tuning, G.lie): both in bed, the night frozen half way.
function rstLieNow(s) {
  if (!rstBegin(s, 'dawn', { force: true })) return false;
  for (const e of R.together ? [P, N] : [P]) { e.pos.copy(e.L.sitPos); e.face = e.L.sitYaw; e.path = null; e.speed = 0; e.lie = true; e.lieW = 1; e.L.rollW = 1; e.h.pose = e.L.base; e.L.sitRoot = null; e.L.cal = null; }
  $('restdip').classList.remove('on'); R.dip = 0;
  rstShot(R.L.cam.end, R.L.cam.look, 0.01, true);
  rstStartNight(); R.freeze = 'night'; R.t = R.nightDur * 0.5;
  return true;
}
// ---------- MAT mature foundation ----------
// Spec M1 (spec_mature.md §3-§7, §12). Shared contracts every mature package codes against:
//   D() / diffK(k)      the difficulty preset merged with S.diff.custom (cached; MATD.DIFF holds the table)
//   on / emit           the event bus (playerHitPre/playerHit, animalHitPre/animalHit/animalDie, land, rested, hours,
//                       downed/revived/died/rescued, settings, chose). Listener order per spec §5.1.
//   playerHurt(e)       every hit on Aro (who 'P') or Sena (who 'N'); hurt(o, dmg, info) for animals
//   choose(...)         the modal choice panel (Promise of the picked index)
//   skipHours(h)        moves the clock and S.gh forward and emits 'hours'
//   foes                the raider list (CMB pushes {pos: Vector3, live, fled, ...}); hostileNear() reads it
// Death: die() -> downed (Sena can reach you) -> revive, or by mode: rescue / rescue + penalty / permadeath + memorial.
const MAT = { dead: false, endT: 0, choice: null, lastT: null, downWhy: '', downHits: 0, rescueT: 0, rescuing: false, cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), t: 1 },
  lie: null, end: null, chip: '', diffToast: false, deadSave: false, airTop: null };
const foes = [];                                     // CMB raiders: {pos, live, fled, ...}
const on = MATD.on, emit = MATD.emit;
const STAM_CAPS = [];                                // other packages: G.mat.stamCap(fn) adds a stamina cap source
let _dMode, _dCustom, _dVal;
function D() {
  const d = S.diff || {};
  if (_dVal === undefined || d.mode !== _dMode || d.custom !== _dCustom) { _dMode = d.mode; _dCustom = d.custom; _dVal = MATD.diffOf(d.mode, d.custom); }
  return _dVal;
}
function diffK(k) { return D()[k]; }
function matFoeHpK() { return D().foeHpK; }
function matRespawnAt(k) { return (NODE[k]?.[2] || 0) * D().nodeK; }
function matLoot(kind) { const L = LOOT[kind] || [0, 0], m = D().meat; return kind === 'deer' ? [m[0], L[1]] : kind === 'stag' ? [m[1], L[1]] : L; }
function matRegenK() { return P.downed > 0 || MAT.rescuing || MAT.dead ? 0 : S.weakUntil > S.gh ? 0.5 : 1; }
function matStamCap() { let c = S.weakUntil > S.gh ? 70 : 100; for (const f of STAM_CAPS) { const v = f(); if (v < c) c = v; } return c; }
// Afflictions grace (read by SURV): Survivor until the hunt chapter, Hardcore for the first 24 game hours.
function matGrace() { const g = D().grace; return g === 'hunt' ? !reached('hunt') || S.gh < (S.diff.graceUntil || 0) : g === '24h' ? S.gh < (S.diff.graceUntil || 0) : false; }
const MAT_TOOLS = { boilbag: 'Boiling bag', pot: 'Clay pot', mantle: 'Wolf-pelt mantle', bearcloak: 'Bear cloak' };
function matToolsHud() { let h = ''; for (const k in MAT_TOOLS) if (S.tools[k]) h += `<span class="tool">${MAT_TOOLS[k]}</span>`; return h; }
const matPick = (a) => a[(rand() * a.length) | 0];
const matPos = (x) => x?.root?.position || x?.pos || (x?.isVector3 ? x : null);

// ----- hits. Hit events reuse preallocated vectors: copy e.point / e.dir if a listener keeps them.
const _mPt = new THREE.Vector3(), _mDir = new THREE.Vector3(), _mPt2 = new THREE.Vector3(), _mDir2 = new THREE.Vector3(), _mPD = new THREE.Vector3();
const MELEE_KIND = { axe: 'cut', spear: 'pierce', fists: 'blunt', thrown: 'pierce' };
function matHitInfo(o, weapon) {                     // melee: the target's chest point, the attacker's forward
  const p = o.root.position;
  return { kind: MELEE_KIND[weapon] || 'blunt', weapon, from: P, heavy: weapon === 'axe', point: _mPt.set(p.x, p.y + 0.9, p.z), dir: _mDir.set(Math.sin(P.face), 0, Math.cos(P.face)) };
}
function matSpearInfo(o) {                           // thrown spear: the tip's world point, the flight direction, the distance thrown
  _mDir.copy(proj.vel).normalize();
  proj.m.getWorldPosition(_mPt).addScaledVector(_mDir, 1.13);
  const p = o.root.position;
  return { kind: 'pierce', weapon: 'thrown', from: P, point: _mPt, dir: _mDir, vel: proj.vel, dist: Math.hypot(p.x - P.pos.x, p.z - P.pos.z) };
}
function matHitPre(o, dmg, info) {
  const p = o.root.position;
  const e = { o, dmg, kind: info.kind || 'blunt', weapon: info.weapon || null, from: info.from || null, heavy: !!info.heavy, dist: info.dist, vel: info.vel || null,
    point: info.point ? _mPt2.copy(info.point) : _mPt2.set(p.x, p.y + 0.9, p.z),
    dir: info.dir ? _mDir2.copy(info.dir) : _mDir2.set(p.x - P.pos.x, 0, p.z - P.pos.z).normalize(),
    zone: info.zone || null, crit: false, kill: false, cancel: false, arrow: !!info.arrow };   // GORE: arrow = a lodged arrow (puncture wound)
  return emit('animalHitPre', e);
}
function matHitPost(e, kill) { e.kill = kill; emit('animalHit', e); if (kill) emit('animalDie', e); }
// Every hit on Aro or Sena. e: {who:'P'|'N', dmg, kind, from, dir?, part?}. Returns e (e.applied once hp moved).
function playerHurt(ev = {}) {
  const e = { who: 'P', dmg: 0, kind: 'blunt', from: null, dir: null, part: null, cancel: false, blocked: false, applied: false, ...ev };
  if (MAT.dead || MAT.endT) return e;
  const tgt = e.who === 'N' ? N.pos : P.pos, fp = matPos(e.from);
  if (!e.dir) e.dir = fp ? _mPD.set(tgt.x - fp.x, 0, tgt.z - fp.z).normalize() : _mPD.set(0, 0, 0);   // the blow's direction (attacker -> victim)
  emit('playerHitPre', e);
  if (e.cancel || !(e.dmg > 0)) return e;
  e.applied = true;
  if (e.who === 'N') { S.nhp = clamp(S.nhp - e.dmg, 0, 100); emit('playerHit', e); return e; }   // CMB reacts (Sena downed, fate)
  if (P.downed > 0) {                                // a hit on a downed Aro: the third one is the end
    MAT.downHits++; hurtFlash = settings.reduceFlash ? 0.4 : 0.8; e.downed = true;
    emit('playerHit', e);
    if (MAT.downHits >= 3) matDeath(MAT.downWhy || matCause('', e));
    return e;
  }
  S.hp = Math.max(0, S.hp - e.dmg);
  hurtFlash = Math.min(1, 0.35 + e.dmg / 14) * (settings.reduceFlash ? 0.5 : 1);
  S.lastHurt = e.kind; MAT.lastFrom = e.from;
  emit('playerHit', e);
  return e;
}
on('playerHitPre', (e) => {                          // order 20: difficulty scaling (CMB block/dodge/parry run at 10)
  const d = D();
  if (e.who === 'N' && (d.senaFate === 'never')) { e.dmg = 0; return; }
  e.dmg *= d.dmgK;
}, 20);
function matCause(why, e = null) {
  const f = (e && e.from) || (hurtFlash > 0 ? MAT.lastFrom : null), k = f?.kind;
  if (k === 'bear') return 'The bear drags you down.';
  if (k === 'bull' || k === 'aurochs') return 'The aurochs tramples you.';
  if (f && (f.raider || f.foe)) return 'The raiders cut you down.';
  return why || (k === 'wolf' ? 'The wolves drag you down.' : 'You collapse.');
}

// ----- the monotonic game clock (spec §4.3)
function matClock() {
  if (MAT.lastT == null) { MAT.lastT = S.time; return; }
  const d = MATD.clockDelta(MAT.lastT, S.time); MAT.lastT = S.time;
  if (d > 0) { const h0 = Math.floor(S.gh); S.gh += d; const n = Math.floor(S.gh) - h0; if (n > 0) emit('hours', { h: n }); }
  const weak = S.weakUntil > S.gh ? `Weak · ${Math.ceil(S.weakUntil - S.gh)} h` : '';
  if (weak !== MAT.chip) { MAT.chip = weak; $('matchip').textContent = weak; $('matchip').style.display = weak ? 'block' : 'none'; }
}
function skipHours(h) { S.time = (S.time + h) % 24; S.gh += h; MAT.lastT = S.time; emit('hours', { h }); return S.gh; }
// Landing after a jump or a drop: SURV turns big drops into sprains and fractures.
function matAirTrack() { const y = P.pos.y; if (MAT.airTop == null || y > MAT.airTop) MAT.airTop = y; }
function matLand() {
  const g = getHeight(P.pos.x, P.pos.z), drop = Math.max(0, (MAT.airTop ?? g) - g); MAT.airTop = null;
  emit('land', { drop, speed: Math.hypot(P.vx, P.vz), water: g < -0.3 });
}

// ----- death: downed first, then by mode
function die(why) {
  if (P.downed > 0 || MAT.rescuing || MAT.dead || MAT.endT) return;   // MAT: one death at a time
  if (P.ride) dismount();                            // WP4
  rstAbort();                                        // RST: drop any rest sequence, no outcome
  why = matCause(why);
  if (canBeDowned()) { downed(why); return; }
  if (P.swim && canBeDowned(true)) {                 // MAT-SV: cut down in the water: he drifts to the nearest bank, then the downed phase
    const b = matBankSpot(P.pos.x, P.pos.z);
    if (b) { downed(why); P.matBank = b; $('downed-note').textContent = 'You drift into the shallows · ' + $('downed-note').textContent; return; }
    why = (why ? why + ' ' : '') + 'In the deep water, Sena could not reach you in time.';
  }
  matDeath(why);
}
// MAT-SV: a fight is on: Aro or Sena down, a hostile within 30 m, or raiders in combat. Hardcore (saves 'auto') writes no save
// then, so closing the tab, reloading or quitting mid-fight returns to the last calm save instead of dropping the fight.
function matInFight() { return P.downed > 0 || N.downed > 0 || MAT.rescuing || hostileNear(30) || foes.some((f) => f.live && !f.fled && f.mode === 'combat'); }
function matHoldSave() { return playing && D().saves === 'auto' && matInFight(); }
function matQuitUi() {                               // MAT-SV: the pause menu's quit button during a Hardcore fight
  const b = $('btn-quit'), f = matHoldSave(); b.disabled = f;
  b.textContent = f ? 'Save & quit: not during a fight' : 'Save & quit to title';
  b.title = f ? 'Hardcore saves only when no enemy is near. Closing the game now returns you to your last calm save.' : '';
}
// MAT-SV r2: closing or reloading the tab mid-fight in Hardcore. The calm save stays as it is and a fight mark goes beside it
// (localStorage, tied to that save's savedAt): Aro's hp, downed time and position, Sena's state and every hostile within 45 m.
// Continue from that save puts the fight back exactly (downed stays downed), so a reload is never a way out of a losing fight.
const HC_FIGHT_KEY = 'hearthborn-hc-fight';
function matFightMark() {
  if (!matHoldSave() || MAT.dead || !S.savedAt) return;
  const near = (x, z) => Math.hypot(x - P.pos.x, z - P.pos.z) < 45;
  const beasts = animals.filter((o) => (o.kind === 'wolf' || o.hostile) && o.state === 'live' && !o.leave && near(o.root.position.x, o.root.position.z))
    .map((o) => ({ k: o.kind, a: o.alpha ? 1 : 0, x: +o.root.position.x.toFixed(2), z: +o.root.position.z.toFixed(2), hp: Number.isFinite(o.hp) ? +o.hp.toFixed(1) : null }));
  const men = ARCS.raidFight ? [] : foes.filter((f) => f.live && !f.fled && near(f.pos.x, f.pos.z))   // the story raid resumes itself (arcRaidFight)
    .map((f) => ({ x: +f.pos.x.toFixed(2), z: +f.pos.z.toFixed(2), hp: Number.isFinite(f.hp) ? +f.hp.toFixed(1) : null, chief: f.chief ? 1 : 0 }));
  const m = { base: S.savedAt, at: Date.now(), hp: +Math.max(0, S.hp).toFixed(1), down: P.downed > 0 ? +P.downed.toFixed(1) : 0, why: MAT.downWhy || null,
    nhp: +S.nhp.toFixed(1), ndown: N.downed > 0 ? 1 : 0, px: +P.pos.x.toFixed(2), pz: +P.pos.z.toFixed(2), nx: +N.pos.x.toFixed(2), nz: +N.pos.z.toFixed(2), beasts, men };
  try { localStorage.setItem(HC_FIGHT_KEY, JSON.stringify(m)); } catch {}
}
function matFightClear() { try { localStorage.removeItem(HC_FIGHT_KEY); } catch {} }
function matFightResume(data) {                      // start(), after matStart: Continue from a save that was left mid-fight
  let m = null; try { m = JSON.parse(localStorage.getItem(HC_FIGHT_KEY) || 'null'); } catch {}
  if (!m) return null;
  if (!data || m.base !== data.savedAt || D().saves !== 'auto') { matFightClear(); return null; }
  P.pos.set(m.px, 0, m.pz); N.pos.set(m.nx, 0, m.nz); P.vx = P.vz = 0;
  if (P.ride) dismount();
  S.hp = Math.min(S.hp, m.hp); S.nhp = Math.min(S.nhp, m.nhp);
  world.setTime(S.time, P.pos, camera);             // the title's daylight is still in env: by day the wolves would turn for the pines at once
  const wolves = [];
  for (const b of [...(m.beasts || [])].sort((p, q) => q.a - p.a)) {   // the alpha first: PRED.pack makes the first wolf the alpha
    let o = null;
    if (b.k === 'bear') o = cmbSpawn('bear', b.x, b.z, { keepHp: true });
    else if (b.k === 'aurochs') o = cmbSpawn('aurochs', b.x, b.z);
    else o = spawn(b.k, b.x, b.z, b.k === 'wolf' ? {} : { hostile: true });
    if (!o) continue;
    if (b.k === 'wolf') wolves.push([o, b]);
    else if (Number.isFinite(b.hp)) o.hp = Math.min(o.hp ?? b.hp, b.hp);
  }
  if (wolves.length) {
    PRED.pack(wolves.map((w) => w[0]));
    if (wolves[0][1].a && !wolves[0][0].alpha) PRED.makeAlpha(wolves[0][0]);
    for (const [o, b] of wolves) { if (Number.isFinite(b.hp)) o.hp = Math.min(o.hp ?? b.hp, b.hp); o.hostile = true; }
  }
  for (const f of m.men || []) { const r = spawnRaider(f.x, f.z, { mode: 'combat', chief: !!f.chief }); if (r && Number.isFinite(f.hp)) r.hp = Math.min(r.hp ?? f.hp, f.hp); }
  if (m.ndown) cmbSenaDown(null);
  if (m.down > 0) { S.hp = 1; die(m.why || 'The fight you left was still waiting.'); if (P.downed > 0) P.downed = Math.max(4, m.down); }
  MAT.saveHeld = true;
  setTimeout(() => toast('Hardcore: you left in the middle of a fight. It is still here.'), 900);
  return m;
}
function matDressing() { return ['bandage', 'hidebandage', 'ypoultice', 'poultice'].find((k) => S.inv[k] > 0) || null; }
function canBeDowned(inWater = false) {
  if ((P.swim && !inWater) || P.ride || N.downed > 0 || N.ride && P.ride) return false;
  if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) > 40) return false;
  if (D().revive === 'daily') return S.downedDay !== S.day && !!matDressing();
  return true;
}
function matBankSpot(x, z) {                       // MAT-SV: nearest dry shore within 16 m
  for (let rr = 1; rr <= 16; rr += 1) for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, bx = x + Math.sin(a) * rr, bz = z + Math.cos(a) * rr;
    if (getHeight(bx, bz) > 0.02) return { x: bx, z: bz };   // the water line: he lies on the shore, not under the surface
  }
  return null;
}
function matDeath(why) {
  const mode = D().death;
  if (mode === 'perma') { permadeath(why, 'P'); return; }
  rescue(why, mode === 'penalty');
}
const DOWN_LINES = ['Aro! Stay with me, I am coming!', 'Aro! No. No, hold on!', 'Aro! Do not close your eyes!'];
const REVIVE_LINES = ['Breathe. Just breathe. I have you.', 'Up. Lean on me. Slowly.', 'Do not do that to me again, Aro.', 'Look at me. There. You are still here.'];
function downed(why) {
  P.downed = 25; MAT.downWhy = why; MAT.downHits = 0; MAT.rescueT = 0;
  S.hp = 0; P.speed = 0; P.vx = P.vz = 0; P.sneak = false; P.auto = false; P.air = false; P.jy = 0; P.work = 0; P.dance = 0;
  if (P.sit > 0) { endSit(P); endSit(N); }
  wpnStowAll('downed', true); if (torchOn) setTorch(false);
  matLieStart(P);
  for (const e of [N]) { e.sit = 0; e.node = null; e.act = 0; e.fetch = null; e.dance = 0; e.working = false; e.workSite = null; if (e.h.pose === 'work' || e.h.pose === 'dance') e.h.pose = null; }
  if (N.ride) { N.ride = false; N.seat = null; N.h.pose = null; N.h.straddle = false; }
  $('downed').classList.toggle('nb', settings.blood === 'off'); $('downed').classList.add('on');
  $('downed-note').textContent = D().revive === 'daily' ? `Sena is coming · she has ${ITEMS[matDressing()].toLowerCase()}` : 'Sena is coming';
  subs.length = 0; subT = 0; clearToasts(); say('Sena', matPick(DOWN_LINES));   // MAT-SV: toasts cleared too
  A.hit(90, 0.6, 0.6); A.tone(65, 1.4, 0.12);
  emit('downed', { who: 'P', cause: why });
}
function matDownEnd() {
  P.downed = 0; P.matBank = null; $('downed').classList.remove('on');
  if (camShot === MAT.cam) camShot = null;
}
function matRevive() {
  matDownEnd();
  S.hp = Math.max(S.hp, 25);
  S.food = Math.max(S.food, 15); S.water = Math.max(S.water, 20); S.warm = Math.max(S.warm, 30);   // she makes you drink and warms your hands
  let used = null;
  if (D().revive === 'daily') { used = matDressing(); if (used) { S.inv[used]--; drawInv(); } S.downedDay = S.day; }
  P.matUp = 1.1;                                     // the lie pose blends out: he gets up
  if (P.h.has?.('getUp')) P.h.swing('getUp');
  N.h.pose = null; MAT.rescueT = 0;
  packBite = Math.max(packBite, clock + 3);          // a moment's grace before the next bite
  say('Sena', matPick(REVIVE_LINES));
  if (used) toast(`Sena bound your wounds (−1 ${ITEMS[used].toLowerCase()})`);
  emit('revived', { who: 'P', by: 'N', item: used });
}
// Rescue: Sena carries you back to camp (today's death), optionally with the Survivor penalty.
function rescue(why, penalty = false) {
  MAT.rescuing = true; P.downed = 0; $('downed').classList.remove('on');
  if (!(P.matW > 0)) matLieStart(P);               // he falls where he stands; the fade covers the rest
  fadeTo(`${why} Sena carries you back to camp and tends you until morning.${penalty ? ' The food you carried is gone.' : ''}`, () => {
    matDownEnd(); MAT.rescuing = false; P.matW = 0; P.matUp = 0; P.h.removeOverride('matLie');
    const f = structs.find((s) => s.kind === 'fire');
    P.pos.set(f ? f.x + 1.6 : 0, 0, f ? f.z + 1.2 : 4);
    N.pos.set(P.pos.x + 1.2, 0, P.pos.z + 0.8); N.node = null;
    for (const e of [P, N]) { e.sit = 0; e.h.pose = null; e.rest = 0; e.work = 0; e.dance = 0; e.seat = null; e.h.root.rotation.x = 0; }   // WP2 also clears rest/work/dance/seat
    P.workSite = null; N.working = false; N.workSite = null; camShot = null;
    for (const o of animals.filter((o) => o.kind === 'wolf')) remove(o);
    skipHours(((7 - S.time + 24) % 24) || 24);      // MAT: the night passes (S.gh and 'hours' included)
    Object.assign(S, { hp: 60, food: 55, water: 60, warm: 100, time: 7, day: S.day + 1 });
    let lost = null;
    if (penalty) {
      lost = MATD.penaltyLoss(S.inv);
      for (const k in lost) S.inv[k] -= lost[k];
      S.weakUntil = S.gh + 24;                       // one game day from the morning
      drawInv();
    }
    emit('rescued', { who: 'P', cause: why, penalty, lost });
    save();
    if (penalty) setTimeout(() => toast('You are weak for a day: less stamina, slower healing'), 4200);
  }, 3800);
}

// ----- lying pose (Death01 frames, order 10) and the get-up blend
function matLieFrames(h) {
  MAT.lie ||= {};
  if (MAT.lie[h.who]) return MAT.lie[h.who];
  const dur = clipDuration(h, 'death') || 1.5, f = [];
  for (let i = 0; i < 12; i++) f.push(samplePose(h, 'death', (dur * i) / 11));
  return (MAT.lie[h.who] = { dur, f });
}
const _mq = new THREE.Quaternion(), _mAx = new THREE.Vector3(1, 0, 0);
function matLieStart(e, fallen = false) {
  matLieFrames(e.h); e.matW = 1; e.matFallT = fallen ? 99 : 0; e.matUp = 0; e.h.pose = null;
  e.h.addOverride('matLie', 10, (h) => {
    const L = MAT.lie[h.who], w = e.matUp > 0 ? smooth01(e.matUp / 1.1) : e.matW;
    if (!L || !(w > 0)) return;
    const ft = clamp(e.matFallT / L.dur, 0, 1) * (L.f.length - 1), i = Math.floor(ft), fr = ft - i;
    applyPose(h, L.f[i], w); if (fr > 0.001 && L.f[i + 1]) applyPose(h, L.f[i + 1], w * fr);
    const b = h.bones.spine_03;                      // shallow breathing while he is still with us
    if (b && !e.matStill) { _mq.setFromAxisAngle(_mAx, Math.sin(clock * 2.6) * 0.03 * w); b.quaternion.multiply(_mq); }
  });
}
// Where to kneel beside someone lying down: 0.7 m to the side of the chest, on the side nearer `from`. [x, z, chestX, chestZ]
const _kA = new THREE.Vector3(), _kB = new THREE.Vector3(), _kOut = [0, 0, 0, 0];
function matKneelSpot(f, from) {
  const b = f.h.bones;
  if (b.spine_03 && b.pelvis) { b.spine_03.getWorldPosition(_kA); b.pelvis.getWorldPosition(_kB); } else { _kA.copy(f.pos); _kB.copy(f.pos); }
  let ax = _kA.x - _kB.x, az = _kA.z - _kB.z; const l = Math.hypot(ax, az);
  if (l < 0.05) { ax = Math.sin(f.face); az = Math.cos(f.face); } else { ax /= l; az /= l; }
  let px = az, pz = -ax;
  if ((from.x - _kA.x) * px + (from.z - _kA.z) * pz < 0) { px = -px; pz = -pz; }
  _kOut[0] = _kA.x + px * 0.7; _kOut[1] = _kA.z + pz * 0.7; _kOut[2] = _kA.x; _kOut[3] = _kA.z;
  return _kOut;
}
// updatePlayer: true while Aro is down (or in the death beat); input is ignored and the camera stays low.
function matDownedTick(dt) {
  if (MAT.choice) matChoiceTick();
  if (P.matUp > 0) { P.matUp -= dt; if (P.matUp <= 0) { P.matUp = 0; P.matW = 0; P.h.removeOverride('matLie'); } }
  if (MAT.endT) { matEndTick(dt); return true; }
  // hp reached 0 since the last frame (a bite, a fall): die now, before updateStats can regenerate it back above 0
  if (S.hp <= 0 && !(P.downed > 0) && !MAT.rescuing && !busy) die(hurtFlash > 0 ? '' : S.warm <= 0 ? 'The cold takes you.' : S.water <= 0 ? 'Thirst overcomes you.' : S.food <= 0 ? 'Hunger overcomes you.' : '');
  if (!(P.downed > 0) && !MAT.rescuing) return false;
  P.matFallT += dt; P.speed = 0; P.vx = P.vz = 0;
  target = null; $('prompt').style.display = 'none';
  if (P.matBank) {                                   // MAT-SV: drifting to the bank, slowly, face up
    const dx = P.matBank.x - P.pos.x, dz = P.matBank.z - P.pos.z, d = Math.hypot(dx, dz), st = Math.min(d, 2.2 * dt);
    if (d < 0.1 || !(P.downed > 0)) P.matBank = null; else { P.pos.x += (dx / d) * st; P.pos.z += (dz / d) * st; }
  }
  settle(P, dt, false);
  if (MAT.rescuing) return true;
  P.downed -= dt;
  $('downed-bar').style.width = clamp(P.downed / 25, 0, 1) * 100 + '%';
  // low camera beside him; the mouse orbits it. Frames Sena too once she is close.
  const c = MAT.cam, dN = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  c.look.set(P.pos.x, P.pos.y + 0.35, P.pos.z);
  if (dN < 10) c.look.lerp(_mPD.set(N.pos.x, N.pos.y + 0.6, N.pos.z), 0.35);
  const ox = P.pos.x + Math.sin(camYaw) * 2.5, oz = P.pos.z + Math.cos(camYaw) * 2.5;   // high enough to see him over the grass
  c.pos.set(ox, Math.max(P.pos.y + 2.1, getHeight(ox, oz) + 0.8), oz);
  c.t = 1; if (camShot !== c) { camShot = c; c.snap = undefined; }
  if (P.downed <= 0) matDeath(MAT.downWhy);
  return true;
}
// updateSena: she runs to him, kneels for 2.5 s and he is back on his feet.
function matSenaRescue(dt) {
  if (MAT.endT) { matEndSena(dt); return true; }
  if (!(P.downed > 0) || MAT.rescuing || N.downed > 0) return false;
  if (N.ride) { N.ride = false; N.seat = null; N.h.straddle = false; }
  N.sit = 0; N.rest = 0; N.node = null; N.act = 0; N.fetch = null; N.dance = 0;
  const [tx, tz, cx, cz] = matKneelSpot(P, N.pos);   // beside his chest, on her side of him
  if (MAT.rescueT <= 0 && !walkTo(N, tx, tz, Math.hypot(tx - N.pos.x, tz - N.pos.z) > 3 ? 6.6 : 2.6, dt, 0.35)) N.h.pose = null;
  else {
    N.speed = 0; N.h.pose = 'work'; N.face = turn(N.face, Math.atan2(cx - N.pos.x, cz - N.pos.z), Math.min(1, dt * 8));
    if (MAT.rescueT <= 0) $('downed-note').textContent = 'Sena is with you';
    MAT.rescueT += dt;
    if (MAT.rescueT >= 2.5) matRevive();
  }
  settle(N, dt, false);
  return true;
}

// ----- permadeath (Hardcore) and the end of a run: a non-graphic grief beat, the memorial, #obit
const GRIEF = {
  P: [['Sena', 'Aro? Aro. Look at me.'], ['Sena', 'You said we would watch the snow melt. You said.'], ['', 'She stayed with him until the fire went out.']],
  N: [['Aro', 'Sena. Stay. Please, stay.'], ['Aro', 'You never let me sit by the fire alone. Not once.'], ['', 'The hearth burned down to embers.']],
};
function matStoneEntry(why, who) {
  const e = { name: who === 'N' ? 'Sena' : 'Aro', sena: S.close, days: S.day, chapterTitle: CH[S.ch]?.title || '', close: Math.round(S.close), deer: cnt('deer'), wolves: cnt('wolf'),
    found: Object.keys(S.found || {}).length, kids: (S.kids || []).length, house: has('house'), cause: who === 'N' ? 'sena' : MATD.causeLine(why, who), mode: S.diff.mode, softened: !!S.diff.softened, date: new Date().toISOString() };
  e.epitaph = MATD.epitaph({ ...e, cause: who === 'N' ? 'sena' : e.cause });
  delete e.house;
  return e;
}
function permadeath(why, who = 'P') {
  if (MAT.dead) return false;
  if (who === 'N' && settings.matureStory === false) return false;   // Mature story off: Sena cannot die
  MAT.dead = true; S.dead = true; busy = true; MAT.endT = 0.001;
  matDownEnd(); MAT.rescuing = false;
  subs.length = 0; subT = 0; $('sub').classList.remove('on'); clearToasts(); toastMute = true;   // MAT-SV: no combat lines or toasts over the death fade
  if (P.ride) dismount(); rstAbort();
  if (W.aim) wpnCancelAim();
  const fallen = who === 'N' ? N : P, mourner = who === 'N' ? P : N;
  const entry = matStoneEntry(why, who);
  MATD.pushStone(entry);                             // the memorial first, then the save goes
  try { localStorage.setItem('hearthborn-perma-dead', String(Date.now())); } catch {}   // a tombstone: an older server copy can never be continued
  deleteGame(); matFightClear();                     // MAT-SV r2
  MAT.end = { who, fallen, mourner, entry, placed: false, lines: GRIEF[who === 'N' ? 'N' : 'P'], said: 0, hold: 0 };
  emit('died', { who, cause: why });
  $('fade-text').textContent = ''; $('fade').classList.add('on');
  document.exitPointerLock?.();
  return true;
}
function endRun(cause = 'P') { return permadeath(cause === 'sena' ? 'sena' : cause, cause === 'sena' || cause === 'N' ? 'N' : 'P'); }
function matEndSena(dt) {                            // the mourner/fallen roles while the beat runs (settles N)
  const E = MAT.end; if (!E) return;
  if (E.fallen === N) { N.speed = 0; N.matFallT = 99; } else { N.speed = 0; }
  settle(N, dt, false);
}
function matEndTick(dt) {
  const E = MAT.end; MAT.endT = MAT.endHold > 0 && MAT.endT >= MAT.endHold ? MAT.endT : MAT.endT + dt;   // MAT-GRIEF r3: G.mat.griefHold(t) freezes the beat at t (tests)
  const T0 = 1.6, T1 = T0 + 10, T2 = T1 + 1.5;       // black, the shot, black again, then the stone (MAT-GRIEF r3: 10 s, the two spoken lines on the faces)
  const { fallen, mourner } = E;
  fallen.speed = 0; mourner.speed = 0;
  if (!E.placed && MAT.endT > 0.2) {                 // in the dark: lay the fallen down
    E.placed = true; $('hud').classList.add('cine'); subs.length = 0; subT = 0; $('sub').classList.remove('on');
    for (const e of [P, N]) { e.sit = 0; e.rest = 0; e.work = 0; e.dance = 0; e.seat = null; e.node = null; e.fetch = null; e.h.straddle = false; }
    for (const o of animals.filter((o) => o.kind === 'wolf' || o.hostile)) remove(o);
    if (torchOn) setTorch(false); ARCS.doorLamp = null;   // MAT-GRIEF r3: the torch light becomes the soft key on the faces below
    if (fallen !== P) P.h.removeOverride('matLie');
    matLieStart(fallen, true); fallen.matStill = true; fallen.h.pose = null;
  }
  if (E.placed && !E.knelt && MAT.endT > 0.8) {      // still dark, the body has settled: the other kneels at the chest
    E.knelt = true;
    const k = matKneelSpot(fallen, mourner.pos); E.kneel = [...k];   // MAT-GRIEF r2: the shot is built on this line
    mourner.pos.set(k[0], 0, k[1]); mourner.face = Math.atan2(k[2] - k[0], k[3] - k[1]);
    mourner.h.pose = 'work';
    // MAT-GRIEF r3: Fixing_Kneeling starts standing, kneels, works with its hands and stands up again every 5.2 s: the
    // mourner rose to her feet mid-line. One still kneeling frame, held, with slow shaky breaths.
    const kp = samplePose(mourner.h, 'work', 2.1);
    mourner.h.addOverride('matKneel', 25, (h) => {
      applyPose(h, kp, 1);
      const b = h.bones.spine_03; if (b) { _mq.setFromAxisAngle(_mAx, 0.06 + Math.sin(clock * 1.9) * 0.025 + Math.sin(clock * 7.3) * 0.004); b.quaternion.multiply(_mq); }
    });
    mourner.h.addOverride('matHold', 30, (h) => {    // a hand finds theirs
      const w = clamp((MAT.endT - T0) / 1.5, 0, 1); if (!(w > 0)) return;
      // MAT-GRIEF r3: the hand on the head's side cradles their cheek. It used to stretch for their right hand, across
      // the body, and hover over the chest.
      const fb = fallen.h.bones; if (!fb.Head) return;
      const a = mourner.face, rX = -Math.cos(a), rZ = Math.sin(a), mp = mourner.pos;
      fb.Head.getWorldPosition(_mPt);
      const cs = (_mPt.x - mp.x) * rX + (_mPt.z - mp.z) * rZ > 0 ? 'r' : 'l', sg = cs === 'r' ? 1 : -1;
      _mPt.x += (mp.x - _mPt.x) * 0.2; _mPt.z += (mp.z - _mPt.z) * 0.2; _mPt.y += 0.07;
      _mDir.copy(_mPt); _mDir.y += 0.5; _mDir.x += rX * sg * 0.35; _mDir.z += rZ * sg * 0.35;
      ik2(h, cs, _mPt, _mDir, smooth01(clamp((MAT.endT - T0 - 0.4) / 1.6, 0, 1)));
      // (the other hand stays on her knee, as the kneeling frame has it: reaching it across to a hand or shoulder folded the arm)
    });
  }
  if (fallen === P) settle(P, dt, false); else { P.h.pose = 'work'; settle(P, dt, false); }
  if (MAT.endT > T0 && !E.lit) { E.lit = true; $('fade').classList.remove('on'); }
  if (E.lit && E.said < E.lines.length && MAT.endT > T0 + 0.6 + E.said * 2.6) say(...E.lines[E.said++]);
  // the camera: MAT-GRIEF r2. Low, across the fallen body, on the mourner's face (she or he kneels at the chest and looks
  // down at it, so a lens behind or above them saw only the back of a bowed head); a slow push in, then up and away to the
  // sky. The long grass is trodden flat round the two of them and along the lens line (blades used to fill the frame).
  const hd = mourner.h.bones.Head;
  if (hd) hd.getWorldPosition(_mPt2); else _mPt2.set(mourner.pos.x, mourner.pos.y + 0.9, mourner.pos.z);
  if (!E.hd) E.hd = _mPt2.clone(); else E.hd.lerp(_mPt2, Math.min(1, dt * 1.2));   // MAT-GRIEF r3: the kneeling loop bobs the head; the lens follows it slowly
  if (MAT.endT < T0) E.hd.copy(_mPt2);
  _mPt2.copy(E.hd);
  if (!E.fx && E.knelt) {
    const k = E.kneel || [mourner.pos.x, mourner.pos.z, fallen.pos.x, fallen.pos.z];
    let fx = k[2] - k[0], fz = k[3] - k[1]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;   // mourner -> the chest
    let side = 1;                                    // three-quarter: the side with a clear line (no trunk, boulder or wall)
    for (const sd of [1, -1]) { const cx = k[0] + fx * 1.9 + fz * 0.7 * sd, cz = k[1] + fz * 1.9 - fx * 0.7 * sd; if (!arcCamBlocked(k[0], k[1], cx, cz)) { side = sd; break; } }
    E.fx = [fx, fz]; E.side = side;
    world.clear(k[2], k[3], 2.8);                    // round the two of them
    for (let t = 1.2; t <= 3.4; t += 0.7) world.clear(k[0] + fx * t + fz * 0.36 * t * side, k[1] + fz * t - fx * 0.36 * t * side, 1.3);   // the lens line
  }
  const [fx, fz] = E.fx || [Math.sin(mourner.face), Math.cos(mourner.face)], rx = fz * (E.side || 1), rz = -fx * (E.side || 1);
  // MAT-GRIEF r3: the push in holds on the faces through both spoken lines; then a slow crane up and back that keeps the
  // two of them in frame (it used to swing the lens off to an empty sky while she was still speaking), tilting a little
  // towards the sky only at the end. The torch light is a soft low key beside the lens so the faces read at night.
  const u1 = smooth01(clamp((MAT.endT - T0) / 5.5, 0, 1)), u2 = smooth01(clamp((MAT.endT - T0 - 6.2) / (T1 - T0 - 6.2), 0, 1));
  const c = MAT.cam, d = 2.05 - u1 * 0.4 + u2 * 2.6, gy = Math.max(getHeight(_mPt2.x + fx * d, _mPt2.z + fz * d), 0.1);
  c.pos.set(_mPt2.x + fx * d + rx * (0.72 - u1 * 0.12 + u2 * 0.5), Math.max(gy + 0.62, _mPt2.y - 0.22) + u2 * 3.4, _mPt2.z + fz * d + rz * (0.72 - u1 * 0.12 + u2 * 0.5));
  const mx = _mPt2.x + fx * 0.45 * u2, mz = _mPt2.z + fz * 0.45 * u2;   // from her face to the middle of the two of them
  c.look.set(mx - fx * u2 * u2 * 3, _mPt2.y - 0.12 - u2 * 0.35 + u2 * u2 * 2.2, mz - fz * u2 * u2 * 3);
  c.t = 1; if (camShot !== c) { camShot = c; c.snap = undefined; }
  if (!torchOn && E.knelt) {
    const kw = clamp((MAT.endT - T0 + 0.6) / 1.2, 0, 1) * (1 - 0.35 * u2), nt = world.env.night ?? 0;
    torch.light.position.set(_mPt2.x + fx * 1.15 + rx * 0.85, _mPt2.y + 0.75, _mPt2.z + fz * 1.15 + rz * 0.85);
    torch.light.color.setHex(0xffb37a);
    torch.light.intensity = kw * (1.1 + 2.6 * nt) * (0.95 + Math.sin(clock * 5) * 0.03 + Math.sin(clock * 13) * 0.02);   // an ember glow, not a lamp
  }
  if (MAT.endT > T1 && !E.dark) { E.dark = true; $('fade').classList.add('on'); }
  if (MAT.endT > T2 && !E.obit) { E.obit = true; matShowObit(E.entry); }
}
function matShowObit(e) {
  $('obit-sub').textContent = e.cause === 'sena' ? 'Embers' : 'Here lies';
  $('obit-name').textContent = e.cause === 'sena' ? 'Sena' : 'Aro';
  $('obit-epi').textContent = e.epitaph;
  const st = [['Days', e.days], ['Chapter', e.chapterTitle], ['Closeness', e.close], ['Deer', e.deer], ['Wolves', e.wolves], ['Places found', e.found]];
  if (e.kids) st.push(['Children', e.kids]);
  $('obit-stats').innerHTML = st.map(([k, v]) => `<div><b></b>${k}</div>`).join('');
  [...$('obit-stats').children].forEach((d, i) => { d.querySelector('b').textContent = st[i][1]; });
  $('obit-cause').textContent = `${e.cause === 'sena' ? 'Sena could not be saved' : e.cause} · ${MATD.MODES[e.mode]?.name || e.mode}${e.softened ? ' (softened)' : ''}`;
  $('obit').classList.add('on'); A.tone(147, 4, 0.08); A.tone(110, 5, 0.06, 0.6);
}
$('obit-go').onclick = () => location.reload();

// ----- choose(): a modal choice panel. Keys 1-4, E = the first enabled option, Esc = def (when def is not null).
function choose(id, title, options, { timer = 0, def = 0, note = '' } = {}) {
  return new Promise((res) => {
    if (MAT.choice) MAT.choice.finish(MAT.choice.fallback());
    const el = $('choice'), timed = timer > 0 && settings.choiceTimer !== false;
    const { btns, bar } = MATD.renderChoice(el, title, options, note, timed ? timer : 0);
    const ok = (i) => !!options[i] && (!options[i].req || !!options[i].req());
    const c = MAT.choice = {
      id, options, def, timed, bar, t0: performance.now(), T: timer * 1000, wasBusy: busy,
      fallback: () => (def != null && ok(def) ? def : Math.max(0, options.findIndex((o, i) => ok(i)))),
      pick(i) { if (!ok(i)) { A.hit(200, 0.08, 0.12); return false; } c.finish(i); return true; },
      finish(i) {
        if (MAT.choice !== c) return;
        MAT.choice = null; el.classList.remove('on'); busy = c.wasBusy;
        A.tone(523, 0.3, 0.05);
        emit('chose', { id, i, label: options[i]?.label });
        if (playing && !busy && !paused) lock();
        res(i);
      },
    };
    btns.forEach((b) => { b.onclick = () => c.pick(+b.dataset.i); });
    busy = true; for (const k in keys) keys[k] = false;
    document.exitPointerLock?.();
    el.classList.add('on'); A.tone(392, 0.5, 0.05);
    if (timed) { const loop = () => { if (MAT.choice !== c) return; matChoiceTick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  });
}
function matChoiceTick() {
  const c = MAT.choice; if (!c || !c.timed) return;
  const k = 1 - (performance.now() - c.t0) / c.T;
  if (c.bar) c.bar.style.width = clamp(k, 0, 1) * 100 + '%';
  if (k <= 0) c.finish(c.fallback());
}
// keydown (first in line): the choice panel, then the downed/death input lock.
function matKey(e) {
  const c = MAT.choice;
  if (c) {
    if (e.repeat) return true;
    const m = /^Digit([1-4])$/.exec(e.code);
    if (m) c.pick(+m[1] - 1);
    else if (e.code === 'KeyE') { const i = c.options.findIndex((o) => !o.req || o.req()); if (i >= 0) c.pick(i); }
    else if (e.code === 'Escape' && c.def != null) c.pick(c.def);
    return true;
  }
  if (MAT.endT) return true;
  if (P.downed > 0 || MAT.rescuing) return !/^(Escape|KeyM)$/.test(e.code);
  return false;
}

// ----- Mature story off: skip chapters flagged mature (ARC sets mature/skipFx on its CH entries)
function matSkipMature() {
  if (settings.matureStory !== false) return;
  while (CH[S.ch]?.mature && S.ch < CH.length - 1) { try { CH[S.ch].skipFx?.(); } catch (err) { console.error(err); } S.ch++; }
}

// ----- difficulty: new game, load, mid-run changes
function matNew(choice) {
  const mode = MATD.DIFF[choice?.mode] ? choice.mode : 'survivor', custom = choice?.custom || null;
  S.diff = { mode, perma: MATD.diffOf(mode, custom).death === 'perma', softened: false, custom, graceUntil: S.gh + 24 };
}
function matLoad(data) {                             // start(): deep merges, old saves without diff, story v2 -> v3
  const F = fresh();
  S.diff = { ...F.diff, ...(data.diff || {}) };
  S.arc = { ...F.arc, ...(data.arc || {}) };
  S.arc.choices = { ...(data.arc?.choices || {}) }; S.arc.raid = { ...F.arc.raid, ...(data.arc?.raid || {}) }; S.arc.home = { ...F.arc.home, ...(data.arc?.home || {}) };
  for (const k of ['graves', 'memory']) if (!Array.isArray(S.arc[k])) S.arc[k] = [];
  S.rom = { ...F.rom, ...(data.rom || {}) };
  S.rom.heart = { ...(data.rom?.heart || {}) }; S.rom.dayCaps = { ...(data.rom?.dayCaps || {}) }; S.rom.gifts = { ...(data.rom?.gifts || {}) };
  S.risk = { ...F.risk, ...(data.risk || {}) };
  for (const k of ['age', 'stashAge', 'legend']) S[k] = data[k] && typeof data[k] === 'object' ? data[k] : {};
  for (const k of ['aff', 'naff']) if (!Array.isArray(S[k])) S[k] = [];
  S.gh = +S.gh || 0;
  if (!data.diff) { S.diff.mode = 'survivor'; S.diff.graceUntil = S.gh + 24; MAT.diffToast = true; }
  // story v2 -> v3 (ARC owns CH; the v1 -> v2 block above already ran)
  const V2 = ['awaken', 'fire', 'hunt', 'shelter', 'cave', 'herd', 'clay', 'house', 'hearth', 'seeds', 'newlife', 'village'];
  if ((data.storyV || 1) < 3) {
    const id = V2[clamp(S.ch | 0, 0, 11)], i = chIdx(id);
    if (i >= 0) { S.ch = i; S.chId = id; }
    S.storyV = 3;
    if (chIdx(id) >= chIdx('hearth')) { S.arc.legacy = true; if (S.close >= 60 && S.rom.firstKiss == null) S.rom.firstKiss = S.day; }
  } else if (data.chId && chIdx(data.chId) >= 0) S.ch = chIdx(data.chId);
  S.chId = CH[S.ch].id;
}
function matStart() {                                // after a new game or a load: clocks, UI, scarcity
  MAT.dead = false; MAT.endT = 0; MAT.lastT = S.time; MAT.chip = null; P.downed = 0; toastMute = false;   // MAT-SV
  const d = D();
  if (d.herdK < 1) for (const h of herds) {          // Hardcore: thinner herds
    const deer = animals.filter((o) => o.herd === h), keep = Math.ceil(deer.length * d.herdK);
    for (const o of deer.slice(keep)) remove(o);
  }
  matDiffUi();
  if (MAT.diffToast) { MAT.diffToast = false; setTimeout(() => toast('Difficulty: Survivor (you can lower it in Esc › Game)'), 2600); }
}
function setDiff(mode, custom = S.diff.custom) {
  const cur = S.diff.mode;
  if (!MATD.canSetMode(cur, mode)) return false;
  if (cur === 'hardcore' && mode !== 'hardcore') { S.diff.softened = true; if (custom?.perma) custom = { ...custom, perma: false }; }
  S.diff.mode = mode; S.diff.custom = custom; S.diff.perma = MATD.diffOf(mode, custom).death === 'perma';
  matDiffUi(); save(); emit('settings', { key: 'diff', mode });
  toast(`Difficulty: ${MATD.MODES[mode].name}`);
  return true;
}
function canLower(mode) { return MATD.canSetMode(S.diff.mode, mode); }
function matDiffUi() {
  const d = D(), sel = $('opt-diff');
  $('btn-save').style.display = d.saves === 'auto' ? 'none' : '';
  sel.value = S.diff.mode;
  for (const o of sel.options) o.disabled = !MATD.canSetMode(S.diff.mode, o.value);
  $('opt-diff-note').textContent = S.diff.mode === 'hardcore' ? 'One life. It can only be lowered, which ends permadeath for this run'
    : S.diff.softened ? 'Softened from Hardcore. Story and Survivor can be swapped' : d.custom ? 'Custom settings. Story and Survivor can be swapped' : 'Story and Survivor can be swapped at any time';
}

// ----- settings UI: pause tabs, Game/Video/Audio/Content rows, the content notice
const TAB_OF = { 'opt-sens': 'controls', 'opt-inv': 'controls', 'opt-autodraw': 'controls', 'opt-arc': 'controls', 'opt-qual': 'video', 'opt-full': 'video', 'opt-shake': 'video',
  'opt-bob': 'video', 'opt-fov': 'video', 'opt-rm': 'video', 'opt-flash': 'video', 'opt-vol': 'audio' };
function matContentChanged(key) {
  saveSettings(); matContentUi();
  if (typeof setGore === 'function') setGore({ blood: settings.blood, gore: settings.gore, screenBlood: settings.screenBlood });   // GORE
  emit('settings', { key });
}
function matContentUi() {
  $('opt-blood').value = settings.blood; $('opt-gore').value = settings.gore; $('opt-gore').disabled = settings.blood === 'off';
  $('opt-gore-note').textContent = settings.blood === 'off' ? 'Blood is off: hits leave dust and scuffs' : 'High includes dismemberment on heavy and finishing blows';
  $('opt-sblood').checked = !!settings.screenBlood; $('opt-fcam').checked = !!settings.finisherCam; $('opt-rom').value = settings.romance;
  $('opt-mstory').checked = settings.matureStory !== false; $('opt-ctimer').checked = settings.choiceTimer !== false; $('opt-flash').checked = !!settings.reduceFlash;
  $('opt-music').value = settings.music; $('opt-sfx').value = settings.sfx; $('opt-amb').value = settings.amb;
}
function matBindSettings() {
  const box = $('pause').querySelector('.box'), tabs = $('pause-tabs');
  const pane = document.createElement('div'); pane.className = 'pane'; tabs.after(pane);
  let credits = null;
  for (const r of [...box.querySelectorAll('.row')]) {
    if (!r.dataset.tab) r.dataset.tab = TAB_OF[r.querySelector('input,select,button')?.id] || 'game';
    if (r.querySelector('.credits')) credits = r; else pane.append(r);
  }
  if (credits) pane.append(credits);
  const show = (t) => { for (const r of pane.children) r.classList.toggle('hide', r.dataset.tab !== t); for (const b of tabs.children) b.classList.toggle('cur', b.dataset.t === t); pane.scrollTop = 0; };
  for (const b of tabs.children) b.onclick = () => show(b.dataset.t);
  show('game');
  const chk = (id, key) => { $(id).onchange = () => { settings[key] = $(id).checked; matContentChanged(key); }; };
  const val = (id, key) => { $(id).onchange = () => { settings[key] = $(id).value; matContentChanged(key); }; };
  val('opt-blood', 'blood'); val('opt-gore', 'gore'); val('opt-rom', 'romance');
  chk('opt-sblood', 'screenBlood'); chk('opt-fcam', 'finisherCam'); chk('opt-mstory', 'matureStory'); chk('opt-ctimer', 'choiceTimer'); chk('opt-flash', 'reduceFlash');
  for (const [id, key] of [['opt-music', 'music'], ['opt-sfx', 'sfx'], ['opt-amb', 'amb']]) $(id).oninput = () => { settings[key] = +$(id).value; saveSettings(); if (typeof musicVolumes === 'function') musicVolumes(); emit('settings', { key }); };   // MUS buses
  $('opt-full-preset').onclick = () => { Object.assign(settings, MATD.FULL); matContentChanged('preset'); toast('Content: full intensity'); };
  $('opt-toned-preset').onclick = () => { Object.assign(settings, MATD.TONED); matContentChanged('preset'); toast('Content: toned down'); };
  $('opt-notice').onclick = () => matGate(true);
  $('opt-diff').onchange = () => {
    const m = $('opt-diff').value;
    if (S.diff.mode === 'hardcore' && m !== 'hardcore' && !confirm(`Lower this run to ${MATD.MODES[m].name}? Death will no longer be permanent, and the memorial will mark the run as softened. It cannot be raised again.`)) { matDiffUi(); return; }
    if (!setDiff(m)) matDiffUi();
  };
  $('gate-text').textContent = MATD.NOTICE;
  $('gate-ok').onclick = () => { settings.ageOk = MATD.CONTENT_V; Object.assign(settings, MATD.FULL); matContentChanged('notice'); matGate(false); };
  $('gate-toned').onclick = () => { settings.ageOk = MATD.CONTENT_V; Object.assign(settings, MATD.TONED); matContentChanged('notice'); matGate(false); toast('Toned-down mode: change it any time in Esc › Content'); };
  matContentUi();
}
function matGate(show) {
  $('gate').classList.toggle('on', show);
  $('title').classList.toggle('gated', show && !playing);
  for (const id of ['btn-new', 'btn-continue', 'btn-stones']) { const b = $(id); if (show && !playing) { b.tabIndex = -1; b.setAttribute('aria-disabled', 'true'); } else { b.removeAttribute('tabindex'); b.removeAttribute('aria-disabled'); } }
  $('btn-new').disabled = !!(show && !playing);      // MAT-GATE (spec M1.1): disabled while the 21+ notice is up
  if (show) setTimeout(() => $('gate-ok').focus(), 50);
}

// ----- title: the 21+ gate, the new-game modal, the Stones
let ngMode = 'survivor', ngTouched = false;
function matTitle() {
  let tomb = 0; try { tomb = +localStorage.getItem('hearthborn-perma-dead') || 0; } catch {}
  if (found?.data?.diff?.perma && (found.data.dead || (found.data.savedAt || 0) <= tomb)) { MAT.deadSave = true; deleteGame(); $('btn-continue').style.display = 'none'; $('btn-new').textContent = 'Begin the story'; $('savenote').textContent = ''; }
  const stones = MATD.readStones();
  $('btn-stones').style.display = stones.length ? '' : 'none';
  $('btn-stones').onclick = () => matStones(true);
  $('stones-close').onclick = () => matStones(false);
  matGate((settings.ageOk || 0) < MATD.CONTENT_V);
  // the new-game cards
  $('ng-modes').innerHTML = '';
  for (const m of MATD.MODE_ORDER) {
    const M = MATD.MODES[m], b = document.createElement('button');
    b.className = 'mode'; b.dataset.m = m;
    b.innerHTML = '<strong></strong><em></em><ul></ul>';
    b.querySelector('strong').textContent = M.name; b.querySelector('em').textContent = M.tag;
    for (const l of M.lines) { const li = document.createElement('li'); li.textContent = l; b.querySelector('ul').append(li); }
    b.onclick = () => { ngMode = m; ngTouched = false; ngSync(); };
    $('ng-modes').append(b);
  }
  for (const id of ['ng-aff', 'ng-ill', 'ng-spoil', 'ng-perma']) $(id).onchange = () => { ngTouched = true; ngSync(true); };
  for (const id of ['ng-drain', 'ng-node', 'ng-dmg']) $(id).oninput = () => { ngTouched = true; ngSync(true); };
  $('ng-back').onclick = () => $('newgame').classList.remove('on');
  $('ng-go').onclick = () => {
    $('newgame').classList.remove('on');
    if (found && !ngSaw && !MAT.deadSave) { titleSave(); return; }   // SAVE-PERF r3: a save turned up after the modal opened: ask again
    start(false, { mode: ngMode, custom: ngTouched ? ngCustom() : null });
  };
}
const ngCustom = () => ({ aff: $('ng-aff').checked, ill: $('ng-ill').checked, spoil: $('ng-spoil').checked, perma: $('ng-perma').checked, drainK: +$('ng-drain').value, nodeK: +$('ng-node').value, dmgK: +$('ng-dmg').value });
function ngSync(keep = false) {
  for (const b of $('ng-modes').children) b.classList.toggle('sel', b.dataset.m === ngMode);
  if (!keep) {
    const d = MATD.DIFF[ngMode];
    $('ng-aff').checked = d.aff !== 'off'; $('ng-ill').checked = d.ill !== 'off'; $('ng-spoil').checked = d.spoil !== 'off'; $('ng-perma').checked = d.death === 'perma';
    $('ng-drain').value = d.drainK; $('ng-node').value = d.nodeK; $('ng-dmg').value = d.dmgK;
  }
  $('ng-drain-v').textContent = '×' + (+$('ng-drain').value).toFixed(2); $('ng-node-v').textContent = '×' + (+$('ng-node').value).toFixed(1); $('ng-dmg-v').textContent = '×' + (+$('ng-dmg').value).toFixed(2);
  $('ng-go').textContent = `Begin · ${MATD.MODES[ngMode].name}${ngTouched ? ' (custom)' : ''}`;
}
function matNewGame(ev) {
  // A scripted click while the notice is still up (older test harnesses) starts a Survivor game straight away;
  // a person cannot reach the button then: the notice covers it and it is out of the tab order.
  if ((settings.ageOk || 0) < MATD.CONTENT_V) { if (ev?.isTrusted) return; if (newGameOk()) start(false, { mode: 'survivor' }); return; }
  if (!newGameOk()) return;   // SAVE-PERF: also asks while the save server has not answered
  ngSaw = !!found;            // SAVE-PERF r3
  ngMode = 'survivor'; ngTouched = false; $('ng-custom').open = false; ngSync();
  $('newgame').classList.add('on');
}
function matStones(show) {
  $('stones').classList.toggle('on', show);
  if (!show) return;
  const list = $('stones-list'); list.innerHTML = '';
  for (const e of MATD.readStones().slice().reverse()) {
    const d = document.createElement('div'); d.className = 'stone';
    d.innerHTML = '<h4><span></span></h4><p></p><small></small>';
    d.querySelector('h4').prepend(e.cause === 'sena' ? 'Sena' : e.name || 'Aro');
    d.querySelector('h4 span').textContent = `${e.days} ${e.days === 1 ? "day" : "days"} · ${e.chapterTitle}`;
    d.querySelector('p').textContent = e.epitaph;
    d.querySelector('small').textContent = `${e.cause === 'sena' ? 'Sena could not be saved' : e.cause} · ${MATD.MODES[e.mode]?.name || e.mode}${e.softened ? ' (softened)' : ''} · closeness ${e.close} · ${e.deer} deer · ${e.wolves} wolves${e.kids ? ` · ${e.kids} children` : ''} · ${new Date(e.date).toLocaleDateString()}`;
    list.append(d);
  }
}

// ---------- GORE ----------
// Spec M2 (spec_mature.md §7 M2, §12). The engine half lives in src/gore.js (pools, splats, wound shader, severing,
// carcasses, screen blood); this section couples it to the game:
//   hit zones on prey (animalHitPre 20) · blood, wounds, bleeding, dismemberment (animalHit 50) · screen blood and
//   wounds on Aro/Sena (playerHit 70) · wounded prey that flee, bed down and bleed out with a trail (goreBrain) ·
//   mercy kill · hold-E butchering with the carcass left behind and bloody hands · Hunter's Focus (hold Z) ·
//   terrain-conforming corpses · flesh/bone/spatter sounds. Raiders (CMB): goreFoeHit(f, e) or emit('foeHit', e).
// Guardrails: see the block at the top of gore.js. No dismemberment, carcass flesh or heavy bursts within 20 m of a child.
const GS = { init: false, puffs: 0, focus: false, focusSneak: false, said: {}, butch: null, mercy: null, ids: 0, ext: {}, hands: { value: 0 }, q: '', arrow: null, ray: null, el: {} };
const PREY = new Set(['deer', 'stag', 'fox']);
const _gA = new THREE.Vector3(), _gB = new THREE.Vector3(), _gC = new THREE.Vector3(), _gN = new THREE.Vector3(), _gQ = new THREE.Quaternion(), _gQ2 = new THREE.Quaternion(), _gH = new THREE.Vector3();
function setGore(o = {}) {                           // MAT's Content rows call this; also on 'settings' and quality changes
  return GR.setGore({ blood: settings.blood, gore: settings.gore, screenBlood: settings.screenBlood, ...o, reduceFlash: settings.reduceFlash, quality: quality() });
}
const goreBloodOn = () => settings.blood !== 'off';
const goreLevel = () => settings.gore || 'high';
const goreKidNear = (p, r = 20) => goreKids().some((c) => Math.hypot(c.x - p.x, c.z - p.z) < r);   // GORE-FIX: every visible child (Lio, Pell, village children)
function gorePatchHuman(h, { hands = false, paint = null } = {}) {   // also used by CMB for raiders (tribe paint via G.gore.paint)
  if (!h?.root || !GR.goreRec(h.root)) GR.prepModel(h.root, 'human', { clone: false, hands: hands ? GS.hands : null });
  if (paint) GR.bonePaint(h.root, paint);
  return GR.goreRec(h.root);
}
function goreInit() {
  if (GS.init) return; GS.init = true;
  GR.initGore(scene, getHeight, quality()); setGore(); GS.q = settings.quality;
  gorePatchHuman(P.h, { hands: true }); gorePatchHuman(N.h);
  try { if (AR?.root) GR.prepModel(AR.root, 'human', { clone: false, hands: GS.hands }); } catch {}   // FPP viewmodel arms: bloody hands in first person too
  for (const id of ['hurtbeat', 'bleededge', 'gorefocus', 'gorebar']) GS.el[id] = $(id);
  // Hunter's Focus arrow: a flat glowing chevron on the ground
  const sh = new THREE.Shape(); sh.moveTo(0, 0.55); sh.lineTo(0.32, 0.05); sh.lineTo(0.12, 0.05); sh.lineTo(0.12, -0.45); sh.lineTo(-0.12, -0.45); sh.lineTo(-0.12, 0.05); sh.lineTo(-0.32, 0.05); sh.closePath();
  const ag = new THREE.ShapeGeometry(sh); ag.rotateX(-Math.PI / 2);
  GS.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));   // drawn over meadow grass
  GS.arrow.visible = false; GS.arrow.renderOrder = 3; scene.add(GS.arrow);
  GS.ray = new THREE.Raycaster(); GS.ray.far = 2.6;
  Object.assign(window.G, { gore: goreHooks() });
}
on('settings', () => setGore(), 50);

// ----- sounds (WebAudio, routed to the Effects bus when MUS adds it)
function goreSfx(kind, vol = 1, at = null) {
  if (!A.ctx || !(vol > 0)) return;
  if (at) vol *= clamp(1 - Math.hypot(at.x - P.pos.x, at.z - P.pos.z) / 45, 0, 1);
  if (vol < 0.02) return;
  const c = A.ctx, out = A.sfx || A.out, t = c.currentTime;
  const noise = (type, f, q, dur, v, f1 = 0, off = 0) => {
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.buf; fl.type = type; fl.frequency.setValueAtTime(f, t + off); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + off + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0, t + off); g.gain.linearRampToValueAtTime(v, t + off + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + off + dur);
    s.connect(fl).connect(g).connect(out); s.start(t + off, rand() * 1.5); s.stop(t + off + dur + 0.02);
  };
  const drop = (f0, f1, dur, v, off = 0) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t + off); o.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
    g.gain.setValueAtTime(0, t + off); g.gain.linearRampToValueAtTime(v, t + off + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + off + dur);
    o.connect(g).connect(out); o.start(t + off); o.stop(t + off + dur + 0.02);
  };
  if (kind === 'flesh') { noise('lowpass', 400, 0.8, 0.16, 0.55 * vol); drop(140, 70, 0.14, 0.35 * vol); }
  else if (kind === 'crack') { noise('highpass', 2000, 0.7, 0.035, 0.45 * vol); noise('bandpass', 2600, 4, 0.02, 0.3 * vol, 0, 0.012); }
  else if (kind === 'spatter') noise('bandpass', 1500 + rand() * 1500, 1.4, 0.06, 0.22 * vol, 0, 0.03);
  else if (kind === 'squelch') { noise('lowpass', 300, 3, 0.22, 0.4 * vol, 1100); noise('bandpass', 700, 2, 0.12, 0.18 * vol, 0, 0.05); }
  else if (kind === 'sever') { noise('lowpass', 500, 0.8, 0.22, 0.7 * vol); drop(120, 55, 0.2, 0.4 * vol); noise('highpass', 2200, 0.7, 0.045, 0.5 * vol, 0, 0.01); noise('bandpass', 1800, 1.2, 0.35, 0.18 * vol, 600, 0.08); }
}

// ----- hit zones: where on the body a hit lands (root-local, normalised by the body extent from its bones)
function goreExt(o) {
  const key = o.kind + ':' + (o.a.model?.scale?.x || 1).toFixed(3);
  if (GS.ext[key]) return GS.ext[key];
  const hb = o.a.bone?.('Head'), tb = o.a.bone?.('Tail1') || o.a.bone?.('Tail2'), cb = o.a.bone?.('Torso') || o.a.bone?.('Body');
  let X = { mid: 0, half: 0.9, top: 1.2, cy: 0.75, w: 0.3 };
  if (hb && tb && cb) {
    o.root.updateMatrixWorld(true);
    const h = o.root.worldToLocal(hb.getWorldPosition(_gA)).clone(), t = o.root.worldToLocal(tb.getWorldPosition(_gA)).clone(), cc = o.root.worldToLocal(cb.getWorldPosition(_gA)).clone();
    const len = Math.max(0.3, Math.abs(h.z - t.z));
    X = { mid: (h.z + t.z) / 2, half: len / 2, top: Math.max(h.y, cc.y * 1.55) + 0.04, cy: cc.y, w: len * 0.17 };
  }
  return (GS.ext[key] = X);
}
function goreZoneOf(o, pt) {
  const X = goreExt(o), lp = o.root.worldToLocal(_gB.copy(pt));
  return GR.zoneOf((lp.z - X.mid) / X.half, lp.y / X.top);
}
on('animalHitPre', (e) => {                          // order 20: the zone and its damage multiplier
  const o = e.o; if (!o?.root || !o.a || e.kind === 'bleed') return;
  const X = o.a.bone?.('Head') ? goreExt(o) : goreBody(o), fp = matPos(e.from) || P.pos;   // GORE-FIX: the boneless cave bear uses its mesh extents
  if (e.weapon && e.weapon !== 'thrown' && e.weapon !== 'mercy' && !e.zone) {   // melee: the body surface facing the attacker, at torso height
    o.root.updateMatrixWorld(true);
    const ap = o.root.worldToLocal(_gA.copy(fp)); let dx = ap.x, dz = ap.z - X.mid; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    _gB.set(dx * X.w, X.cy * (0.82 + rand() * 0.4), X.mid + dz * X.half * 0.8 + (rand() - 0.5) * X.half * 0.5);
    e.point.copy(o.root.localToWorld(_gB));
    goreInit(); if (!GR.goreRec(o.a.model)) GR.prepModel(o.a.model, o.a.bone?.('Head') ? 'quad' : 'mesh', { clone: false });
    goreSurfacePt(o.a.model, _gA.set(fp.x, e.point.y, fp.z), e.point);   // GORE-FIX: onto the real skin (the placed point could sit inside the body)
  }
  const z = e.zone === 'neck' || e.zone === 'head' ? 'head' : e.zone && GR.ZONES[e.zone] ? e.zone : goreZoneOf(o, e.point);
  e.zone = z;
  if (o.horse || o.tame || e.weapon === 'mercy' || e.kind === 'finisher') return;
  if (PREY.has(o.kind)) { e.dmg *= GR.ZONES[z].k; e.crit = !!GR.ZONES[z].crit; }
  else if (z === 'head') { e.dmg *= 1.5; e.crit = true; }   // predators: a head blow still counts
}, 20);

// ----- on every animal hit: blood, a wound, bleeding and limping prey, a clean kill, dismemberment on heavy kills
on('animalHit', (e) => {
  const o = e.o; if (!o?.root || !o.a) return;
  goreInit(); o.gid ||= ++GS.ids;
  if (!GR.goreRec(o.a.model)) GR.prepModel(o.a.model, o.a.bone?.('Head') ? 'quad' : 'mesh', { clone: false });   // the CMB cave bear (morph mesh) is patched on its first hit
  if (e.kind !== 'bleed' && e.weapon !== 'mercy') o.hits = (o.hits || 0) + 1;
  const kid = goreKidNear(o.root.position), blood = goreBloodOn(), small = o.kind === 'fox' ? 0.6 : 1;
  if (e.kind !== 'bleed') {
    if (blood) {
      const n = GR.burstCount(goreLevel(), e.kill, e.heavy) * small * (kid ? 0 : 1) * (e.arrow && !e.kill ? 0.6 : 1);   // an arrow punctures: less spray, a tighter cone · GORE-FIX: none near a child
      if (n > 0) GR.bloodBurst(e.point, e.dir, n, { heavy: e.heavy, kill: e.kill, size: small * (e.arrow ? 0.85 : 1), spread: e.arrow ? 0.42 : 0.61 });
      if ((e.heavy || e.kill) && !kid) goreWallDecal(e.point, e.dir);
      goreSfx('spatter', 0.8, e.point);
    }
    const r = (e.arrow ? 0.045 : e.kind === 'blunt' ? 0.05 : e.weapon === 'axe' ? 0.085 : 0.06) * small * (e.kill ? 1.25 : 1) * (o.kind === 'bear' || o.kind === 'aurochs' ? 1.8 : 1);   // GORE-FIX: a big body takes a big wound (read at 5 m on dark fur) · GORE-FIX5 1.5→1.8
    GR.addWound(o.a.model, e.point, r, { wet: e.kind === 'blunt' ? 0.5 : 1 });
    goreSfx('flesh', e.kill ? 1 : 0.75, e.point); if (e.heavy || e.crit || (e.weapon === 'thrown' && !e.arrow)) goreSfx('crack', e.kill ? 0.9 : 0.6, e.point);
  }
  const prey = PREY.has(o.kind) && !o.tame && !o.horse;
  if (prey && e.kill) { if (GR.isClean(o.hits, e.zone, e.arrow ? 'arrow' : e.weapon, e.dist)) o.clean = true; }   // an arrow is clean only through the head or the heart
  else if (prey && e.kind !== 'bleed') {
    const z = GR.ZONES[e.zone] || GR.ZONES.gut;
    if (z.bleed) o.bleed = Math.min(0.8, Math.max(o.bleed || 0, z.bleed) + (o.bleed ? 0.04 : 0));
    if (e.arrow) o.bleed = Math.max(o.bleed || 0, 0.12);   // a lodged arrowhead keeps any wound open: there is always a trail to follow
    if (z.limp) o.limp = true;
    Object.assign(o, { wounded: true, fleeT: 7, trailD: 0, bed: null });
    if (o.bedded) goreBolt(o);
  } else if (!prey && !e.kill && e.kind !== 'bleed' && blood) o.drip = 5;   // predators drip for a while
  if (e.kill) goreKill(o, e, kid);
}, 50);
// Severing on kills: finishers and heavy axe kills, Gore high, Blood on, no child near.
function goreKill(o, e, kid) {
  if (o.lying) o.a.play('Death', 'hold', 1, 0.35);   // it was lying with its head up: the clip runs on from there (no standing up to fall again)
  o.drip = 0; o.wounded = false; o.bleed = 0; o.bedded = o.lying = o.frozen = false;
  if (!goreBloodOn() || goreLevel() !== 'high' || kid || o.horse || o.tame) return;
  const axe = e.weapon === 'axe';
  let seg = 0;
  if (e.kind === 'finisher' && e.weapon !== 'spear' && e.weapon !== 'fists') seg = 1;   // CMB finisher: the head comes off
  else if (axe && e.heavy) {
    const z = e.zone;
    if (z === 'head' && rand() < 0.55) seg = 1;
    else if (z === 'leg' && rand() < 0.6) seg = goreNearestLeg(o, e.point);
    else if (rand() < 0.12) seg = 6;                  // the tail
  }
  if (!seg) return;
  if (GR.sever(o.a.model, seg, { dir: e.dir })) { goreSfx('sever', 1, e.point); goreArrowsOff(o, o.a.model, seg); if (seg === 1 && PREY.has(o.kind)) o.clean = false; }
}
function goreNearestLeg(o, pt) {
  const names = { 2: 'FrontUpperLegL', 3: 'FrontUpperLegR', 4: 'BackUpperLegL', 5: 'BackUpperLegR' };   // (GLTFLoader drops the dots of the rig's names)
  let best = 0, bd = 1e9;
  for (const s in names) { const b = o.a.bone?.(names[s]); if (!b) continue; const d = b.getWorldPosition(_gA).distanceTo(pt); if (d < bd) { bd = d; best = +s; } }
  return best;
}
// A hit next to a wall or in a cave leaves blood on the rock (one ray along the blow).
function goreWallDecal(pt, dir) {
  if (!GS.ray) return;
  const list = [];
  for (const s of structs) if (s.group && s.rise >= 1 && Math.hypot(s.x - pt.x, s.z - pt.z) < s.radius + 3) list.push(s.group);
  if (depthAt(pt.x, pt.z) > 0) for (const c of scene.children) if (c.name?.startsWith('cave-')) list.push(c);
  if (!list.length) return;
  GS.ray.set(pt, _gC.copy(dir).setY(Math.min(dir.y, 0) - 0.1).normalize());
  const hit = GS.ray.intersectObjects(list, true).find((h) => h.object.isMesh && !h.object.isInstancedMesh && !h.object.isSkinnedMesh && h.object.visible && h.face);
  if (hit) GR.staticDecal(hit.object, hit.point, _gN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld), 0.45 + rand() * 0.4);
}

// ----- Aro and Sena hit: a wound where the blow landed, a spray, screen blood facing the attacker
on('playerHit', (e) => {
  goreInit();
  const who = e.who === 'N' ? N : P, fp = matPos(e.from);
  const H = { bite: [0.45, 1.15], claw: [0.9, 1.45], gore: [0.7, 1.2], cut: [0.9, 1.5], pierce: [0.9, 1.4], blunt: [1.0, 1.55], kick: [0.8, 1.3], fall: [0.15, 0.5] }[e.kind] || [0.8, 1.4];
  const bx = fp ? fp.x - who.pos.x : -(e.dir?.x || 0), bz = fp ? fp.z - who.pos.z : -(e.dir?.z || 0), bl = Math.hypot(bx, bz) || 1;
  _gA.set(who.pos.x + (bx / bl) * 0.16 + (rand() - 0.5) * 0.1, who.pos.y + H[0] + rand() * (H[1] - H[0]), who.pos.z + (bz / bl) * 0.16 + (rand() - 0.5) * 0.1);
  const r = e.kind === 'blunt' || e.kind === 'fall' ? 0.05 : e.kind === 'claw' || e.kind === 'gore' ? 0.09 : 0.06;
  goreHumanPt(who.h, fp || who.pos, _gA, false);     // GORE-FIX: a bite at the hips marks the flank above
  const kidN = goreKidNear(who.pos);                 // GORE-FIX: no spray and no screen blood with a child near
  if (e.kind !== 'fall' || e.dmg >= 8) GR.addWound(who.h.root, _gA, r, { wet: e.kind === 'blunt' ? 0.45 : 1, maxR: 0.12 });
  if (goreBloodOn() && e.kind !== 'blunt' && e.kind !== 'fall' && !kidN) {
    _gB.set(-bx / bl, 0.2, -bz / bl);
    GR.bloodBurst(_gA, _gB, GR.burstCount(goreLevel(), false, e.dmg >= 14) * 0.45, { heavy: e.dmg >= 14, mist: true });
  }
  goreSfx('flesh', Math.min(1, 0.4 + e.dmg / 20), who.pos);
  if (who === P && !e.downed && !kidN) GR.screenSplat(camFace() - Math.atan2(bx, bz), e.dmg / 12);
}, 70);
on('downed', () => GR.clearScreen?.(), 50);
on('revived', () => GR.clearScreen?.(), 50);
on('died', () => {                                   // the grief beat and the memorial are never bloody
  if (!GS.init) return;
  GR.clearScreen(); GR.clearWounds(P.h.root); GR.clearWounds(N.h.root); GS.hands.value = 0;
  GR.clearSplatsNear(P.pos.x, P.pos.z, 14); GR.clearSplatsNear(N.pos.x, N.pos.z, 14); GR.clearPieces();
}, 50);
on('rescued', () => { if (!GS.init) return; GR.clearScreen(); GR.clearWounds(P.h.root); GS.hands.value = 0; }, 50);   // Sena tended him through the night
on('rested', () => { if (!GS.init) return; GR.clearWounds(P.h.root); GR.clearWounds(N.h.root); GS.hands.value = 0; }, 50);   // washed and slept

// ----- wounded prey: flee, slow as it weakens, bed down in cover at ≤ 35 % hp, bleed out; a blood trail behind it
function goreHpMax(o) { return (HP[o.kind] || 4) * (o.kind === 'wolf' || o.hostile ? matFoeHpK() : 1); }
function goreBedSpot(o) {
  const p = o.root.position; let spot = null;
  for (let i = 0; i < 10; i++) {
    const s = landSpot(p.x, p.z, 60, 150, 0);
    const away = (s[0] - p.x) * (p.x - P.pos.x) + (s[1] - p.z) * (p.z - P.pos.z) > 0;
    if (!spot || (away && biomeAt(s[0], s[1]) === 'pine')) spot = s;
    if (away && biomeAt(s[0], s[1]) === 'pine') break;
  }
  return spot;
}
function goreBedDown(o) {
  Object.assign(o, { bedded: true, bed: null, bedT: 0, speed: 0 });
  o.a.play(o.kind === 'fox' ? 'Idle_2_HeadLow' : 'Idle_Headlow');
}
function goreBolt(o) {
  Object.assign(o, { bedded: false, bed: goreBedSpot(o), fleeT: 6 });
  o.a.play('Gallop', false, 0.9);
}
function goreBleedOut(o) {
  o.bleedOut = true; o.hp = Math.max(o.hp, 0);
  hurt(o, o.hp + 0.01, { kind: 'bleed', point: _gA.set(o.root.position.x, o.root.position.y + 0.4, o.root.position.z), dir: _gB.set(0, -1, 0) });
  o.bleedOut = false;
}
function goreBrain(o, dist, dx, dz, dt) {            // updateAnimal: replaces the normal brain while o.wounded
  if (o.state !== 'live') return false;
  const p = o.root.position, frac = clamp(o.hp / goreHpMax(o), 0, 1);
  if (o.bleed > 0) {
    o.hp -= o.bleed * dt * (o.bedded ? 0.25 : 1);
    if (o.hp <= 0) { goreBleedOut(o); return true; }
    o.trailD = (o.trailD || 0) + o.speed * dt + (o.bedded ? dt * 0.05 : 0);
    if (o.trailD >= GR.trailStep(o.bleed)) {
      o.trailD = 0;
      GR.groundSplat(p.x + (rand() - 0.5) * 0.35, p.z + (rand() - 0.5) * 0.35, 0.1 + o.bleed * 0.3 + rand() * 0.06, goreBloodOn() ? 'trail' : 'scuff', { trail: o.gid });
    }
  }
  if (o.bedded) {
    o.speed = 0; o.bedT += dt;
    if (dist < (P.sneak ? 0.9 : 14) && !P.ride) { goreBolt(o); return true; }   // it hears you coming
    if (o.bedT > 1.3 && !o.lying) { o.lying = true; o.a.play('Death', 'hold', 1); }
    if (o.lying && o.bedT > 1.65 && !o.frozen) { o.frozen = true; o.a.play('Death', false, 0); }   // the Death clip paused at about 0.35 s: lying, head up
    return true;
  }
  o.lying = o.frozen = false;
  if (o.bleed > 0 && frac <= 0.35 && !o.bed) o.bed = goreBedSpot(o);
  let want = 0;
  const run = 2.4 + 6.6 * frac;
  if (o.bed) {
    const tx = o.bed[0], tz = o.bed[1];
    if (Math.hypot(tx - p.x, tz - p.z) < 2.5) { goreBedDown(o); return true; }
    want = run; if (!o.avoid) o.dir = Math.atan2(tx - p.x, tz - p.z);
  } else if ((o.fleeT -= dt) > 0 || dist < (P.sneak ? 8 : 24)) {
    want = run; if (!o.avoid) o.dir = Math.atan2(dx, dz) + Math.sin(clock * 0.7 + o.gid) * 0.35;
  } else if (!(o.bleed > 0)) {                       // a limping animal that got away: wander and graze, slowly
    o.timer -= dt; if (o.timer <= 0) { o.walk = !o.walk; o.timer = 3 + rand() * 5; if (o.walk) o.dir += (rand() - 0.5) * 2; }
    want = o.walk ? 0.9 : 0;
  } else want = run * 0.5;
  if (o.limp) want *= 0.6;
  o.speed += (want - o.speed) * Math.min(1, dt * 4);
  if (o.speed > 0.08) step(o, o.speed, dt);
  o.root.rotation.y = turn(o.root.rotation.y, o.dir, Math.min(1, dt * 6));
  const ts = o.limp ? 0.7 : 1;
  if (o.speed > 3.5) o.a.play('Gallop', false, (o.speed / 8) * ts);
  else if (o.speed > 0.25) o.a.play('Walk', false, 1.1 * ts);
  else o.a.play(o.bleed > 0 ? (o.kind === 'fox' ? 'Idle_2_HeadLow' : 'Idle_Headlow') : 'Eating');
  return true;
}
function goreRevive(o) {                             // revive(): a fresh animal, no wounds or old state
  Object.assign(o, { wounded: false, bleed: 0, limp: false, bedded: false, bed: null, lying: false, frozen: false, clean: false, hits: 0, drip: 0, conf: null, butchT: 0, cuts: 0, gid: ++GS.ids });
  if (GS.init) GR.clearWounds(o.a.model);
  o.a.model.quaternion.identity();
}

// ----- mercy kill (sneak up on bedded prey) and butchering (hold E)
function goreTarget(p) {
  for (const o of animals) {
    if (o.state !== 'live' || !o.bedded || !P.sneak) continue;
    if (Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < 2.5) return { label: 'End its suffering', key: true, act() { goreMercy(o); } };
  }
  for (const o of animals) {
    if (o.state !== 'dead' || o.looted || o.deadT < 1.2 || o.sinkT != null) continue;   // SAVE-PERF: not one sinking away
    if (Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < 2.7) {
      const pc = o.butchT ? ` ${Math.floor((o.butchT / goreNeed(o)) * 100)}%` : '';
      return { label: `Butcher the ${o.kind}${pc} (hold E)`, key: true, act() { goreButcherStart(o); } };
    }
  }
  return null;
}
const goreNeed = (o) => (o.kind === 'fox' || o.kind === 'wolf' ? 2.5 : 4);
function goreCam(o, close) {                         // a short three-quarter shot over Aro's shoulder onto the animal (wide on Gore Low); none in first person
  if (view === 'fpp' || !settings.finisherCam && !close) return null;
  const p = o.root.position, ax = p.x - P.pos.x, az = p.z - P.pos.z, l = Math.hypot(ax, az) || 1, fx = ax / l, fz = az / l, sx = -fz, sz = fx;
  const low = goreLevel() === 'low', back = low ? 3.2 : close ? 1.5 : 1.8, side = low ? 3.4 : close ? 1.9 : 2.2, gy = getHeight(p.x, p.z);
  // high enough to look down over meadow grass (lower shots sat inside the grass and lost the carcass)
  const pos = new THREE.Vector3(P.pos.x - fx * back + sx * side, Math.max(gy, P.pos.y) + (low ? 2.9 : close ? 1.75 : 1.55), P.pos.z - fz * back + sz * side);
  const k = close ? 0.75 : 0.6;                       // frame on the animal, Aro in the near third
  return { pos, look: new THREE.Vector3(p.x * k + P.pos.x * (1 - k), gy + (close ? 0.3 : 0.55), p.z * k + P.pos.z * (1 - k)), t: 99, gore: true };
}
function goreButcherStart(o) {
  goreInit();
  if (GS.butch?.o === o) return;
  const site = { x: o.root.position.x, z: o.root.position.z, rise: 0, label: o.kind, gore: true };
  GS.butch = { o, need: goreNeed(o), site, cut: o.cuts || 0, cam: null };
  o.butchT ||= 0;
  P.work = 0.5; P.workSite = site;
  if (!o.pooled) { o.pooled = true; GR.groundSplat(o.root.position.x, o.root.position.z, 0.2, 'pool', { grow: [1.2, 6] }); }
  const cam = goreCam(o, true); if (cam) { GS.butch.cam = cam; camShot = cam; }
}
function goreButcherEnd() {
  const B = GS.butch; GS.butch = null; GS.el.gorebar?.classList.remove('on');
  if (B?.cam && camShot === B.cam) camShot = null;
  if (P.workSite === B?.site) { P.work = 0; P.workSite = null; }
}
function goreButcherTick(dt) {
  const B = GS.butch; if (!B) return;
  const o = B.o;
  if (!(keys.KeyE || B.auto) || o.state !== 'dead' || o.looted || P.workSite !== B.site || busy) { goreButcherEnd(); return; }
  P.work = 0.5;
  o.butchT += dt; B.site.rise = Math.min(0.999, o.butchT / B.need);
  GS.el.gorebar?.classList.add('on'); const bv = $('gorebar-v'); if (bv) bv.style.width = (B.site.rise * 100).toFixed(1) + '%';
  const k = o.butchT / B.need;
  if (B.cut < 3 && k > 0.12 + B.cut * 0.3) {         // three cuts, each a spurt and a squelch
    B.cut++; o.cuts = B.cut;
    P.h.swing('strikeU', 1.2);
    _gA.set(o.root.position.x, o.root.position.y + 0.3, o.root.position.z);
    if (goreBloodOn()) GR.bloodBurst(_gA, _gB.set(rand() - 0.5, 0.8, rand() - 0.5), 6, { speed: 0.55, mist: false, size: 0.8 });
    goreSfx('squelch', 0.9);
  }
  if (o.butchT >= B.need) { goreButcherDone(o); goreButcherEnd(); }
}
function goreButcherDone(o) {
  o.looted = true; o.root.visible = false; o.respawn = clock + D().animalRespawn;   // MAT animalRespawn (GORE keeps this expression)
  const [meat, hide] = matLoot(o.kind);          // MAT: deer/stag meat by difficulty
  if (meat) give('meat', meat);
  const g = GR.hideGrade(hide, !!o.clean, o.hits || 0);
  if (g.n) give('hide', g.n);
  if (g.grade === 'prime' && hide) toast('Prime hide: a clean kill');
  else if (g.grade === 'poor' && hide) toast('Poor hide: too many cuts in it');
  P.h.swing(); A.hit(600, 0.2, 0.4); goreSfx('squelch', 1);
  goreArrowsBack(o);
  GR.leaveCarcass(o.a.model, { flesh: goreBloodOn() && !goreKidNear(o.root.position) });
  GR.clearWounds(o.a.model);
  if (goreBloodOn()) GS.hands.value = 1;
  bump('butchered');
  if (o.kind === 'wolf' || o.tame) remove(o);
}
function goreMercy(o) {
  goreInit();
  P.wantFace = P.face = Math.atan2(o.root.position.x - P.pos.x, o.root.position.z - P.pos.z);
  P.h.swing('strikeU', 1.4); A.hit(700, 0.1, 0.08);
  const cam = goreCam(o, false);
  if (cam) { cam.t = 0.75; if (goreLevel() === 'low') cam.look.y += 6; camShot = cam; }   // Gore Low: the camera turns to the sky
  GS.mercy = { o, t: 0 };
}
function goreMercyTick(dt) {
  const M = GS.mercy; if (!M) return;
  M.t += dt;
  if (M.t >= 0.25 && !M.done) {
    M.done = true; const o = M.o;
    if (o.state === 'live') {
      const hb = o.a.bone?.('Neck2') || o.a.bone?.('Head');
      hurt(o, 999, { kind: 'cut', weapon: 'mercy', zone: 'head', from: P, point: hb ? hb.getWorldPosition(_gA) : _gA.set(o.root.position.x, o.root.position.y + 0.5, o.root.position.z), dir: _gB.set(0, -0.6, 0).add(_gC.set(Math.sin(P.face), 0, Math.cos(P.face))).normalize() });
      bump('mercy');
      if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 25 && cnt('mercy') === 1) say('Sena', 'Quick. That was kind.');
    }
  }
  if (M.t > 0.8) GS.mercy = null;
}
// Hitting a corpse: a small burst and a flinch (landHit when no live animal is in reach)
function goreCorpseHit(fx, fz) {
  if (!GS.init) return;
  let best = null, bd = hitReach;
  for (const o of animals) {
    if (o.state !== 'dead' || o.looted || !o.root.visible || Math.hypot(o.root.position.x - P.pos.x, o.root.position.z - P.pos.z) > 7) continue;
    const d = goreMeleeD(o, fx, fz, hitCone);        // GORE-FIX: to the body, not the root
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return;
  const p = best.root.position; _gA.set(p.x, p.y + 0.3, p.z);
  if (goreBloodOn()) GR.bloodBurst(_gA, _gB.set(fx, 0.4, fz), 5, { speed: 0.7, mist: false });
  GR.addWound(best.a.model, _gA, 0.06);
  best.cfl = 0.3; best.hits = (best.hits || 0) + 1;
  goreSfx('flesh', 0.6); hitStop = 0.04; hsWho = best;
}

// ----- per frame (after updateWorldThings): focus, butcher, mercy, corpses, drips, hands, then gore.js
function goreFrame(dt) {
  goreInit();
  if (GS.q !== settings.quality) { GS.q = settings.quality; setGore(); }   // (quality() 'auto' queries GL: only on a change)
  const live = playing && !paused;
  if (live) {
    goreButcherTick(dt); goreMercyTick(dt); goreFocus(dt);
    // bloody hands wash off in water (5 s) or slowly wear off (4 min)
    if (GS.hands.value > 0) GS.hands.value = Math.max(0, GS.hands.value - dt * (P.pos.y < 0 || P.swim ? 0.2 : 1 / 240));
    goreKidSweep(dt);                                // GORE-FIX GUARDRAIL: no wounds or blood beside a child
  }
  if (RAIDTORCH.length) raidTorchTick(dt);           // GORE-FIX: the raid's torches
  for (const o of animals) {
    if (o.drip > 0 && o.state === 'live') {          // a wounded predator drips as it moves
      o.drip -= dt; o.dripD = (o.dripD || 0) + o.speed * dt;
      if (o.dripD > 2.2) { o.dripD = 0; GR.groundSplat(o.root.position.x, o.root.position.z, 0.1, 'trail', { trail: o.gid }); }
    }
    if (o.state === 'dead' && o.root.visible && o.kind !== 'bear') goreConform(o, dt);   // the bear topples on its own
  }
  GR.updateGore(dt, { playing: live, hp: S.hp, dead: MAT.dead || MAT.endT > 0, bleeding: typeof survBleeding === 'function' && survBleeding(), rain: world.env.storm, canvas,
    thump: (amp) => A.tone(55, 0.2, 0.06 + amp * 0.1) });
}
// Corpses settle onto the slope (head/tail/sides sampled), and flinch when struck.
function goreConform(o, dt) {
  const m = o.a.model;
  if (o.deadT > 0.95 && !o.conf) {
    const X = goreExt(o), p = o.root.position, yaw = o.root.rotation.y, L = X.half * 1.2 * 0.6 * 2, W = X.w * 1.8;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const hf = getHeight(p.x + fx * L, p.z + fz * L), hb = getHeight(p.x - fx * L, p.z - fz * L), hr = getHeight(p.x + fz * W, p.z - fx * W), hl = getHeight(p.x - fz * W, p.z + fx * W);
    const pitch = Math.atan2(hf - hb, 2 * L), roll = Math.atan2(hl - hr, 2 * W);
    o.conf = { q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-clamp(pitch, -0.5, 0.5), 0, clamp(roll, -0.5, 0.5))), t: 0 };
  }
  if (o.conf && o.conf.t < 0.3) { o.conf.t += dt; m.quaternion.slerpQuaternions(_gQ.identity(), o.conf.q, smooth01(o.conf.t / 0.3)); }
  if (o.cfl > 0) {
    o.cfl = Math.max(0, o.cfl - dt);
    _gQ2.setFromAxisAngle(_gN.set(1, 0, 0), Math.sin((o.cfl / 0.3) * Math.PI * 2) * 0.06 * (o.cfl / 0.3));
    m.quaternion.copy(o.conf ? o.conf.q : _gQ.identity()).multiply(_gQ2);
  }
}
// ----- GORE-FIX (gore-cmb fixer, 2026-11-17): body extents, melee reach to the body, hit points on the surface, children
// Body extents of an animal from its posed vertices (root-local, cached per kind and scale): the reach test, the wound
// point and Sena's personal space use these, not the root (an aurochs is 3.5 m long; a blow at its flank must land).
const GBODY = {};
function goreBody(o) {
  const key = o.kind + ':' + (o.a.model?.scale?.x || 1).toFixed(4) + ':' + o.root.scale.x.toFixed(3);
  if (GBODY[key]) return GBODY[key];
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = new THREE.Vector3(), ry = o.root.rotation.y;
  o.root.rotation.y = 0; o.root.updateMatrixWorld(true);
  o.a.model.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes.position) return;
    const pos = m.geometry.attributes.position, st = Math.max(1, Math.floor(pos.count / 500));
    for (let i = 0; i < pos.count; i += st) {
      v.fromBufferAttribute(pos, i); if (m.isSkinnedMesh) m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); o.root.worldToLocal(v);
      mn[0] = Math.min(mn[0], v.x); mn[1] = Math.min(mn[1], v.y); mn[2] = Math.min(mn[2], v.z); mx[0] = Math.max(mx[0], v.x); mx[1] = Math.max(mx[1], v.y); mx[2] = Math.max(mx[2], v.z);
    }
  });
  o.root.rotation.y = ry; o.root.updateMatrixWorld(true);
  if (mn[0] > mx[0]) return { mid: 0, half: 0.6, w: 0.3, top: 1, cy: 0.6 };   // (no mesh yet: not cached)
  const w = Math.max(0.12, (mx[0] - mn[0]) / 2), half = Math.max(w, (mx[2] - mn[2]) / 2) * (o.kind === 'wolf' || o.kind === 'fox' ? 0.82 : 0.92);   // (the tail and the nose tip are thin)
  return (GBODY[key] = { mid: (mn[2] + mx[2]) / 2, half, w, top: mx[1], cy: mx[1] * 0.58 });
}
// The nearest point of the body capsule (the spine line, rounded by its half-width) to (x, z): {d: gap to the surface, x, z}
const _gbp = { d: 0, x: 0, z: 0 };
function goreBodyGap(o, x, z) {
  if (o.foe) { const dx = o.pos.x - x, dz = o.pos.z - z; _gbp.x = o.pos.x; _gbp.z = o.pos.z; _gbp.d = Math.hypot(dx, dz) - 0.3; return _gbp; }
  const B = goreBody(o), p = o.root.position, yaw = o.root.rotation.y, s = o.root.scale.x, fx = Math.sin(yaw), fz = Math.cos(yaw);
  const seg = Math.max(0, B.half - B.w) * s, cx = p.x + fx * B.mid * s, cz = p.z + fz * B.mid * s;
  const t = clamp((x - cx) * fx + (z - cz) * fz, -seg, seg);
  _gbp.x = cx + fx * t; _gbp.z = cz + fz * t; _gbp.d = Math.hypot(x - _gbp.x, z - _gbp.z) - B.w * s;
  return _gbp;
}
// Melee: the gap from Aro's centre to the body's near surface (GC-FIX5: the plain gap; the weapon's reach is the blade's
// real reach now, see combat.js COMBO), or Infinity when the nearest part of the body is outside the swing's cone.
function goreMeleeD(o, fx, fz, cone) {
  const g = goreBodyGap(o, P.pos.x, P.pos.z), dx = g.x - P.pos.x, dz = g.z - P.pos.z, d = Math.hypot(dx, dz);
  if (g.d > 0.05 && (dx * fx + dz * fz) / (d || 1) <= cone) return Infinity;
  return Math.max(0, g.d);
}
// A melee hit point on the body's real surface: the line from the attacker's chest to the placed point, first skin it meets.
function goreSurfacePt(model, from, pt) {
  if (!GR.goreRec(model)) return false;
  _gC.copy(pt).sub(from); const L = _gC.length(); if (L < 0.05) return false; _gC.divideScalar(L);
  const hit = GR.rayBody(model, from, _gC, L + 1.6, _gN);
  if (!hit) return false;
  pt.copy(hit).addScaledVector(_gC, 0.015); return true;   // a little under the skin, so the wound sphere meets the surface
}
// People: a melee blow lands on the chest, belly, flank or arm that faced the attacker, never the groin or seat
// (matHitInfo gives the body's centre at 0.9 m: a wound there spread round the pelvis like painted shorts).
function goreHumanPt(h, from, pt, melee) {
  const root = h.root.position, sc = h.root.scale.y || 1, rel = (pt.y - root.y) / sc;
  if (melee) {
    const dx = from.x - root.x, dz = from.z - root.z, l = Math.hypot(dx, dz) || 1, side = (rand() - 0.5) * 0.24 * sc;
    pt.set(root.x + (dx / l) * 0.12 * sc + (-dz / l) * side, root.y + (1.12 + rand() * 0.36) * sc, root.z + (dz / l) * 0.12 * sc + (dx / l) * side);
    goreSurfacePt(h.root, _gA.set(from.x, pt.y, from.z), pt);
  } else if (rel > 0.66 && rel < 1.08) pt.y = root.y + (1.12 + rand() * 0.2) * sc;   // a bite or a claw at the hips: the flank above
  return pt;
}
// ----- children (GUARDRAIL): every child that can be seen (Lio, Pell, the village children)
const GKIDS = [];
function goreKids() {
  GKIDS.length = 0;
  for (const c of kids) if (c.h.root.visible !== false && !c.hid) GKIDS.push(c.pos);
  for (const e of ARCS.npcs) if (e.child && !e.hidden) GKIDS.push(e.pos);
  for (const v of villagers) if (v.h.kid && v.h.root.visible !== false) GKIDS.push(v.pos);
  return GKIDS;
}
// Predators never close on a child: within 16 m of one, or hunting Aro while he stands within 15 m of one, a wolf or a
// bear (or a provoked aurochs) breaks off and backs away to 24 m from the child, circles there, and gives up after 25 s.
function predKidGuard(o, dt) {
  const ks = goreKids(); if (!ks.length) { o.kidT = 0; return false; }
  const p = o.root.position; let k = null, kd = 1e9;
  for (const c of ks) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < kd) { kd = d; k = c; } }
  const aroNear = ks.some((c) => Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 15) && kd < 30;
  if (kd > 16 && !aroNear) { if (o.kidT > 0) o.kidT = Math.max(0, o.kidT - dt * 4); return false; }
  o.kidT = (o.kidT || 0) + dt; o.pending = 0; o.attacking = 0; o.go = 0;
  if (o.kidT > 25 && o.kind === 'wolf') o.leave = true;   // wolfBrain: back to the pines
  const ax = (p.x - k.x) / (kd || 1), az = (p.z - k.z) / (kd || 1);
  o.kidA = (o.kidA ?? Math.atan2(ax, az)) + dt * 0.12 * (o.kidS ||= rand() < 0.5 ? -1 : 1);
  const tx = k.x + Math.sin(o.kidA) * 24, tz = k.z + Math.cos(o.kidA) * 24, td = Math.hypot(tx - p.x, tz - p.z);
  const want = kd < 14 ? 7.5 : td > 2 ? 3 : 0;
  if (!o.avoid || kd < 14) o.dir = kd < 14 ? Math.atan2(ax, az) : Math.atan2(tx - p.x, tz - p.z);
  o.avoid = Math.max(0, (o.avoid || 0) - dt);
  o.speed += (want - (o.speed || 0)) * Math.min(1, dt * 5);
  if (o.speed > 0.08) step(o, o.speed, dt);
  o.root.rotation.y = turn(o.root.rotation.y, o.dir, Math.min(1, dt * 6));
  o.a.play(o.speed > 3.5 ? 'Gallop' : o.speed > 0.25 ? 'Walk' : 'Idle', false, o.speed > 3.5 ? o.speed / 8 : 1);
  return true;
}
// The child hides: a predator or a raider within 25 m sends Lio running into the house (or behind Sena when there is
// none); she stays in until nothing hostile is within 40 m of the house for 4 s, then comes out at the door.
function kidHide(c, dt) {
  const home = homeHouse(), door = home && home.rise >= 1 ? toWorld(home, [0, 0, 3.6]) : null;
  if (c.hid) {
    if (!door) { c.hid = false; c.h.root.visible = !ARCS.raidOn; return false; }
    c.hidClear = arcThreat(door, 40) ? 0 : (c.hidClear || 0) + dt;
    c.pos.set(door.x, 0, door.z); c.speed = 0;
    if (c.hidClear > 4) { c.hid = false; c.hidClear = 0; if (!ARCS.raidOn) c.h.root.visible = true; return false; }
    return true;
  }
  if (!(c.hideT > 0) && !arcThreat(c.pos, 25)) return false;
  c.hideT = arcThreat(c.pos, 32) ? 2 : (c.hideT || 0) - dt;
  c.seat = null; c.play = 0; c.h.pose = null;
  if (door && Math.hypot(door.x - c.pos.x, door.z - c.pos.z) < 70) {
    if (villagerWalk(c, door.x, door.z, 4.6, dt, 0.7, home)) { c.hid = true; c.hidClear = 0; c.h.root.visible = false; c.hideT = 0; }   // round the walls to the front door
  } else {                                           // no house: behind Sena, away from the danger
    let tx = 0, tz = 0; for (const o of animals) if ((o.kind === 'wolf' || o.hostile) && o.state === 'live') { tx = o.root.position.x; tz = o.root.position.z; break; }
    for (const f of foes) if (f.live && !f.fled) { tx = f.pos.x; tz = f.pos.z; break; }
    const ax = N.pos.x - tx, az = N.pos.z - tz, l = Math.hypot(ax, az) || 1;
    walkTo(c, N.pos.x + (ax / l) * 1.3, N.pos.z + (az / l) * 1.3, 4.6, dt, 0.3);
  }
  settle(c, dt, false);
  return true;
}
// No gore where a child can see it: Aro's and Sena's wounds are washed, blood and severed pieces near the child go
// (twice a second, while a child is within 20 m of them).
let gkT = 0;
function goreKidSweep(dt) {
  if ((gkT += dt) < 0.5) return; gkT = 0;
  const ks = goreKids(); if (!ks.length) return;
  for (const c of ks) {
    if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && GR.woundCount(P.h.root)) { GR.clearWounds(P.h.root); GS.hands.value = 0; }
    if (Math.hypot(c.x - N.pos.x, c.z - N.pos.z) < 20 && GR.woundCount(N.h.root)) GR.clearWounds(N.h.root);
    if (GR.splatsNear(c.x, c.z, 20)) GR.clearSplatsNear(c.x, c.z, 20);
    if (GR.piecesNear(c.x, c.z, 25)) GR.clearPiecesNear(c.x, c.z, 25);
  }
}
// Years or weeks pass (the epilogue, the birth): every wound, splat, piece and carcass is gone.
function goreTimeSkip() {
  if (!GS.init) return;
  GR.clearAll(); GR.clearWounds(P.h.root); GR.clearWounds(N.h.root); GS.hands.value = 0;
  for (const o of animals) if (GR.goreRec(o.a.model)) GR.clearWounds(o.a.model);
}
// Gore Low with no finisher camera (or in first person): a quick dip to black at the finisher's impact.
function goreLookAway() {
  let el = GS.el.dip;
  if (!el) { el = GS.el.dip = document.createElement('div'); el.id = 'goredip'; el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:5;transition:opacity .25s'; document.body.appendChild(el); }
  el.style.transition = 'none'; el.style.opacity = '1';
  clearTimeout(GS.dipT); GS.dipT = setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 420);
}
// Sena never stands inside an animal, live or dead: pushed out of its body ellipse (plus 0.3 m).
// GORE-FIX4: a dead body (and a butchered carcass) is not the standing ellipse: a toppled bear's legs and back spread past
// it. GORE-FIX5: she keeps 0.4 m outside the convex outline of its posed footprint (sampled while it settles, then cached);
// inside it she is walked straight out across the nearest edge (up to 0.3 m a frame).
function senaFootPush(f) {
  const R = 0.4, x = N.pos.x, z = N.pos.z, n = f.length >> 1; if (n < 3) return;
  let inside = true, bd = 1e9, bx = 0, bz = 0, ex = 0, ez = 0;
  for (let i = 0; i < n; i++) {
    const ax = f[i * 2], az = f[i * 2 + 1], cx = f[((i + 1) % n) * 2], cz = f[((i + 1) % n) * 2 + 1];
    const dx = cx - ax, dz = cz - az, L2 = dx * dx + dz * dz || 1e-9;
    if (dx * (z - az) - dz * (x - ax) < 0) inside = false;          // counter-clockwise: the inside is on the left of every edge
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; bx = px; bz = pz; const l = Math.sqrt(L2); ex = dz / l; ez = -dx / l; }   // outward normal of that edge
  }
  if (!inside && bd >= R) return;
  let nx, nz;
  if (inside || bd < 1e-4) { nx = ex; nz = ez; } else { nx = (x - bx) / bd; nz = (z - bz) / bd; }
  const tx = bx + nx * R, tz = bz + nz * R, mx = tx - x, mz = tz - z, m = Math.hypot(mx, mz), k = Math.min(1, 0.3 / (m || 1));
  N.pos.x += mx * k; N.pos.z += mz * k;
}
function senaBodyPush() {
  if (N.rest > 0 || N.sit > 0 || N.ride || N.board || N.seat || N.downed > 0 || MAT.rescuing || N.swim) return;
  for (const o of animals) {
    if (o === P.ride || o.looted || !o.root.visible || Math.hypot(o.root.position.x - N.pos.x, o.root.position.z - N.pos.z) > (o.state === 'dead' ? 5 : 4)) continue;
    if (o.state === 'dead') {                       // GORE-FIX4: the fallen body's real footprint
      if (!o.gfoot || (o.gfootT || 0) < 6 && o.deadT - (o.gfootT || 0) > (o.deadT < 2.5 ? 0.1 : 0.4)) {   // GORE-FIX5: often while it falls
        o.gfoot = GR.footprint(o.a.model, getHeight(o.root.position.x, o.root.position.z)); o.gfootT = o.deadT; }
      senaFootPush(o.gfoot); continue;
    }
    o.gfoot = null; o.gfootT = 0;
    const g = goreBodyGap(o, N.pos.x, N.pos.z), m = 0.3 - g.d;
    if (m > 0) {
      const dx = N.pos.x - g.x, dz = N.pos.z - g.z, l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l;
      N.pos.x += nx * m; N.pos.z += nz * m;
      // and round it, toward Aro's side (pushed straight back she stood stuck against the carcass)
      const sd = Math.sign(-nz * (P.pos.x - N.pos.x) + nx * (P.pos.z - N.pos.z)) || 1, k = Math.min(0.06, (N.speed || 0) * 0.02 + m * 0.5);
      if ((P.pos.x - N.pos.x) * nx + (P.pos.z - N.pos.z) * nz < 0) { N.pos.x += -nz * sd * k; N.pos.z += nx * sd * k; }
    }
  }
  if (GS.init) for (const f of GR.carcassFeet()) senaFootPush(f);   // GORE-FIX4: a butchered carcass too
}
// The first raid wave carries lit torches down the hill (Sena: "Only the torches"). No new lights (CMB §5.9: a light
// recompiles every material); the flame and a wide glow read from 40 m in the dark, the lead two carry a bigger glow.
// A man drops his torch, still burning, when he closes to fight. They burn out on the ground.
const RAIDTORCH = [];
function raidTorch(f, light) {
  if (!f || f.wpn === 'torch' || f.raidTorch) return;
  const t = makeTorch(); t.lit = true; f.raidTorch = t;
  t.light.intensity = 0; t.glow.scale.setScalar(light ? 2.2 : 1.6);
  f.h.place(t.root, 'handL'); f.h.gripL = 1;
  f.h.addOverride('raidTorch', 16, (hh) => { if (f.raidTorch && f.state === 'live') cmbCtx.torchPose?.(hh, 1); });
  RAIDTORCH.push({ t, f, ground: 0, light });
}
function raidTorchTick(dt) {
  for (let i = RAIDTORCH.length - 1; i >= 0; i--) {
    const r = RAIDTORCH[i], f = r.f; r.t.update(dt); r.t.light.intensity = 0;
    if (!r.ground && (f.state !== 'live' || !f.live || f.fled || Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z) < 9 || Math.hypot(f.pos.x - N.pos.x, f.pos.z - N.pos.z) < 9)) {
      scene.attach(r.t.root); const a = rand() * 6.283, x = f.pos.x + Math.sin(a) * 0.5, z = f.pos.z + Math.cos(a) * 0.5;
      r.t.root.position.set(x, getHeight(x, z) + 0.05, z); r.t.root.rotation.set(-0.1, a, 0); r.ground = 0.001;
      f.raidTorch = null; f.h.gripL = 0;
    }
    if (r.ground) { r.ground += dt; if (r.ground > 50 || !ARCS.raidFight && r.ground > 8) { r.t.lit = false; r.t.root.parent?.remove(r.t.root); RAIDTORCH.splice(i, 1); } else if (r.ground > 40) r.t.flame.scale.setScalar(Math.max(0.05, (50 - r.ground) / 10)); }
  }
}
// Hunter's Focus (hold Z): sneak speed, trail splats nearby glow, a chevron points the way, Sena reads the sign.
function goreFocus(dt) {
  const on = keys.KeyZ && !busy && !menuOpen && !P.ride && !(P.downed > 0) && !(P.rest > 0);
  if (on && !GS.focus) { GS.focus = true; GS.focusSneak = P.sneak; }
  if (!on && GS.focus) { GS.focus = false; P.sneak = GS.focusSneak; GR.setFocus(false, P.pos); }
  const el = GS.el.gorefocus; if (el) el.style.opacity = GS.focus ? '1' : '0';
  if (!GS.focus) { if (GS.arrow) GS.arrow.visible = false; return; }
  if (!P.swim) P.sneak = true;
  const f = GR.setFocus(true, P.pos, 40), A2 = GS.arrow;
  if (!f) { A2.visible = false; return; }
  let x, z, head;
  if (f.dist > 6 || f.head == null) { head = Math.atan2(f.x - P.pos.x, f.z - P.pos.z); x = P.pos.x + Math.sin(head) * 1.6; z = P.pos.z + Math.cos(head) * 1.6; }
  else { head = f.head; x = f.x; z = f.z; }
  A2.visible = true; A2.position.set(x, getHeight(x, z) + 0.3, z); A2.rotation.y = head;   // knee height: readable above the grass
  A2.material.opacity = 0.45 + 0.3 * Math.sin(clock * 5);
  if (!GS.said[f.trail] && Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 25) { GS.said[f.trail] = 1; say('Sena', 'It is bleeding. This way.'); }
}

// ----- arrows (BOW hooks): a shot counts only when its flight line really meets the body; the arrow then stands in the
// entry wound, carried by the bone it struck (it follows the gallop, the fall and the corpse), and comes back on butchering.
const goreModelOf = (o) => (o.foe ? o.h?.root : o.a?.model);
function goreArrowAim(ar, o) {                       // bowTick: false = a near miss inside the wide hit cylinder (the arrow flies on)
  goreInit();
  const model = goreModelOf(o); if (!model) return true;
  if (o.foe) gorePatchHuman(o.h); else if (!GR.goreRec(model)) GR.prepModel(model, o.a.bone?.('Head') ? 'quad' : 'mesh', { clone: false });
  const d = _gN.copy(ar.vel).normalize(), org = _gA.copy(ar.tip).addScaledVector(d, -1.4);
  let pt = GR.rayBody(model, org, d, 4.4, _gC);
  if (!pt) {                                          // a little aim help: a line that passes close to a bone is pulled onto it
    const nb = GR.boneNearLine(model, org, d, 0, 4.4), tol = o.foe ? 0.24 : o.kind === 'fox' ? 0.18 : 0.3;
    if (nb && nb.d > tol) return false;
    if (nb) { nb.bone.getWorldPosition(_gB); pt = GR.rayBody(model, org.copy(_gB).addScaledVector(d, -1.2), d, 2.4, _gC) || _gC.copy(_gB).addScaledVector(d, -0.08); }
    else pt = _gC.copy(ar.tip);
  }
  ar.hitPt = pt.clone();
  return true;
}
function goreArrowStick(ar, o, dir) {                // bowLandAnimal: the point sunk 10-16 cm past the entry, the shaft along the flight
  const model = goreModelOf(o); if (!ar.hitPt || !model) return false;
  const bone = GR.boneNear(model, ar.hitPt);
  ar.m.position.copy(ar.hitPt).addScaledVector(dir, 0.1 + rand() * 0.06); ar.m.lookAt(_gB.copy(ar.m.position).add(dir));
  (bone || o.root).attach(ar.m); ar.bone = bone; ar.hp0 = o.hp; ar.m.userData.goreArrow = 1;
  return true;
}
function goreArrowAfter(ar, o) {                     // bowLandAnimal, after the hit: a blocked arrow glances off and falls
  if (o.foe && o.state === 'live' && ar.hp0 != null && o.hp >= ar.hp0) ar.o = null;
}
function goreArrowsOff(o, model, seg) {              // arrows standing in a severed limb or head fall to the ground
  const rn = GR.segRoot(model, seg); if (!rn) return;
  for (const ar of BOW.arrows) if (ar.st === 'animal' && ar.o === o && ar.bone) for (let b = ar.bone; b && b.isBone; b = b.parent) if (b.name.replace(/\./g, '') === rn) { ar.o = null; break; }
}
function goreArrowsBack(o) {                         // butchering pulls the arrows out of the carcass (what does not fit drops beside it)
  let n = 0;
  for (const ar of BOW.arrows.slice()) if (ar.st === 'animal' && ar.o === o && (S.inv.arrow || 0) < bowCap()) { bowRemove(ar); S.inv.arrow = (S.inv.arrow || 0) + 1; n++; }
  if (n) { bump('arrow_pick', n); toast(`+${n} arrow${n > 1 ? 's' : ''} pulled from the carcass`); drawInv(); drawQuest(); }
}

// ----- raiders (CMB): call goreFoeHit(f, e) or emit('foeHit', e) with e = {f, point, dir, kill, heavy, weapon, kind}
function goreFoeHit(f, e = {}) {
  const h = f?.h || f?.human || (f?.root && f.bones ? f : null); if (!h?.root) return;
  goreInit(); gorePatchHuman(h);
  const pt = _gH.copy(e.point || _gA.set(h.root.position.x, h.root.position.y + 1.2, h.root.position.z)), dir = e.dir || _gB.set(0, 0, 1);
  const melee = !e.arrow && e.weapon !== 'thrown' && e.kind !== 'finisher' && e.kind !== 'execution' && e.kind !== 'bleed';
  goreHumanPt(h, matPos(e.from) || P.pos, pt, melee);   // GORE-FIX: the chest, belly, flank or arm that faced the blow (never the groin)
  const kid = goreKidNear(h.root.position);
  if (goreBloodOn() && !kid) GR.bloodBurst(pt, dir, GR.burstCount(goreLevel(), e.kill, e.heavy) * (e.arrow && !e.kill ? 0.6 : 1), { heavy: e.heavy, kill: e.kill, spread: e.arrow ? 0.42 : 0.61 });   // GORE-FIX: none near a child
  GR.addWound(h.root, pt, e.arrow ? 0.045 : e.weapon === 'axe' ? 0.075 : 0.06, { maxR: 0.12 });   // GORE-FIX: a person's wound never spreads past 12 cm
  goreSfx('flesh', 1, pt); if (e.heavy) goreSfx('crack', 0.7, pt);
  if (e.kill && goreBloodOn() && goreLevel() === 'high' && !kid && !f.goreQuick && (e.weapon === 'axe' || e.kind === 'finisher')) {   // a captive's death (the surrender choice) is quick, never a spectacle
    let seg = 0;
    if (e.kind === 'finisher' && e.weapon === 'axe') seg = 1;                    // decapitation finisher
    else if (e.heavy && e.weapon === 'axe') {
      if (pt.y > h.root.position.y + 1.45 && rand() < 0.5) seg = 1;
      else if (rand() < 0.35) { const names = { 2: 'lowerarm_l', 3: 'lowerarm_r', 4: 'calf_l', 5: 'calf_r' }; let bd = 1e9; for (const s in names) { const b = h.bones?.[names[s]]; if (b) { const d = b.getWorldPosition(_gC).distanceTo(pt); if (d < bd) { bd = d; seg = +s; } } } }
    }
    if (seg && GR.sever(h.root, seg, { dir })) { goreSfx('sever', 1, pt); goreArrowsOff(f, h.root, seg); }
  }
}
on('foeHit', (e) => goreFoeHit(e.f || e.foe || e.o, e), 50);
on('surrender', (e) => { if (e.f && e.choice === 'kill') e.f.goreQuick = true; }, 40);   // §2.4/§12: no dismemberment of a surrendered man
const goreM = (o) => o.h?.root || o.a?.model || o.root || o;   // the registered model of an animal, a person or a raider
function goreHooks() {
  return {
    stats: () => ({ ...GR.stats(), puffs: GS.puffs, hands: GS.hands.value }),
    burst: (p, d, n = 14, o) => GR.bloodBurst(p, d || new THREE.Vector3(0, 0.3, 1), n, o),
    splat: (x, z, s = 0.4, k = 'blood', o) => GR.groundSplat(x, z, s, k, o),
    wound: (o, p, r) => GR.addWound(goreM(o), p, r),
    woundsOf: (o) => GR.woundCount(goreM(o)),
    clear: (o) => GR.clearWounds(goreM(o)),
    focus: () => GS.focus, trail: (o) => GR.trailCount(o.gid), trailBright: (o, near) => GR.splatBrightness(o.gid, near ? P.pos : null), kinds: (o) => GR.splatKinds(o?.gid),
    hands: () => GS.hands.value, setHands: (v) => { GS.hands.value = v; },
    zone: (o, p) => goreZoneOf(o, p), ext: (o) => goreExt(o),
    body: (o) => goreBody(o), gap: (o, x, z) => ({ ...goreBodyGap(o, x, z) }), pieces: () => GR.pieceInfo(), kids: () => goreKids().map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]), rec: (o) => GR.goreRec(goreM(o)), raidTorch: (f, l = true) => raidTorch(f, l),   // GORE-FIX test hooks
    bed: (o) => { o.wounded = true; o.bleed ||= 0.08; goreBedDown(o); o.bedT = 2; o.lying = true; o.a.play('Death', 'hold', 1); },
    butcher: () => GS.butch && { kind: GS.butch.o.kind, t: GS.butch.o.butchT, need: GS.butch.need },
    sever: (o, seg = 1, dir) => { const m = goreM(o), r = GR.sever(m, seg, { dir }); if (r && o.root) goreArrowsOff(o, m, seg); return r; }, cut: (o) => GR.cutMask(goreM(o)), carcasses: () => GR.carcassList(),
    screen: (a = 0, amt = 1) => GR.screenSplat(a, amt), foeHit: goreFoeHit, patchHuman: gorePatchHuman,
    paint: (h, list) => GR.bonePaint(h.root, list), cfg: () => GR.goreCfg(),
    autoButcher: (o) => { goreButcherStart(o); if (GS.butch) GS.butch.auto = true; return !!GS.butch; },   // tests: butcher without holding E
    wallHit: (p, d) => goreWallDecal(p, d),
    cam: (p, l, t = 1e9) => { camShot = p ? { pos: new THREE.Vector3().copy(p), look: new THREE.Vector3().copy(l), t } : null; },   // tests: a fixed camera for screenshots
    // tests: an arrow in flight from world point `from` toward `at` (no camera aim needed); arrowsIn(o): the arrows standing in a body
    arrow: (from, at, speed = 45, dmg = 14) => { const ar = { m: makeArrow(), pos: new THREE.Vector3(), vel: new THREE.Vector3().copy(at).sub(from).normalize(), tip: new THREE.Vector3().copy(from), st: 'air', acc: 0, steps: 0, o: null, from: new THREE.Vector3().copy(from), dmg };
      ar.pos.copy(from).addScaledVector(ar.vel, -SP_TIP); ar.vel.multiplyScalar(speed); scene.add(ar.m); BOW.arrows.push(ar); return ar; },
    arrowsIn: (o) => BOW.arrows.filter((a) => a.st === 'animal' && a.o === o).map((a) => { const w = a.m.getWorldPosition(new THREE.Vector3()); return { bone: a.bone?.name || null, pos: [w.x, w.y, w.z].map((v) => +v.toFixed(2)), zone: goreZoneOf(o, w) }; }),
    set: (o = {}) => { Object.assign(settings, o); setGore(); return { ...GR.goreCfg() }; },   // tests: Content settings without the pause UI
  };
}

// ---------- ROM romance v2 ----------
// Spec M6 (spec_mature.md §7 M6, §12). Strictly non-explicit; the full guardrail block is at the top of src/romance.js
// and again above romNight(). Tiers on S.close; the Sena menu (hold E): Talk, Hold hands, Embrace, Kiss, Give a gift
// (+ acts other packages register with romRegister); scenes (embrace, kiss, forehead kiss, almost-kiss, first kiss,
// handfasting) run on the wall clock with pose overrides from romance.js; the fade-to-black night is an RST option.
const ROMP = ROMD.makePoses(THREE, ik2);
const ROM = {
  // pose and camera tuning (G.rom.T live-edits it). lips/brow/cheek: points in each Head bone's local frame.
  T: { handY: -0.04, handFwd: 0.08, handGap: 0.55, apart: 0.26, lean: 0.06, leanN: 0.02, kissLean: 0.05, headYaw: 0.45, headRoll: 0.1, pitchP: 0.18, pitchN: 0.1, tilt: 0.14,
    handUpP: -0.12, handSideP: 0.14, handBackP: 0.09, handUpN: 0.1, handSideN: 0.12, handBackN: 0.08,
    lipsP: [0, 0.07, 0.11], lipsN: [0, 0.07, 0.1], browP: [0, 0.15, 0.1], browN: [0, 0.14, 0.09], cheekN: [0.06, 0.1, 0.06], gap: 0.015, shoulderUp: 0.1, armUp: 0.05, armBack: 0.04,
    camDist: 1.9, camY: 1.5, kissDist: 1.5, hideBack: true },
  P, N, w: 0, mode: null, kissK: 0, browK: 0, armsW: 1, peck: false, handW: 0, benchW: 0, benchHead: false, benchSideP: 'l', bench: false,
  freeHands: (who) => (who === 'P' && torchOn ? ['r'] : ['r', 'l']),
  hand: null, scene: null, talk: null, eAt: 0, last: 0, tierT: 0, tier: null, awayT: 0, homeAway: 0, satN: -1, mealN: -1, inited: false, fk: false,
  hint40: false, nightPending: false, menuOpen: false, peakT: 0, hidden: [], ochre: [], cord: null, log: [],
};
P.h.addOverride('romBody', 16, ROMP.body(ROM, 'P')); N.h.addOverride('romBody', 16, ROMP.body(ROM, 'N'));
P.h.addOverride('romHand', 30, ROMP.hand(ROM, 'P')); N.h.addOverride('romHand', 30, ROMP.hand(ROM, 'N'));
P.h.addOverride('romArms', 31, ROMP.arms(ROM, 'P')); N.h.addOverride('romArms', 31, ROMP.arms(ROM, 'N'));
N.h.addOverride('romMeet', 35, ROMP.meet(ROM));
N.h.addOverride('romShoulder', 15, ROMP.shoulder(ROM, 'N')); P.h.addOverride('romShoulder', 32, ROMP.shoulder(ROM, 'P'));
const romDist = () => Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
const romKidNear = () => kids.some((c) => c.h.root.visible !== false && (Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 15 || Math.hypot(c.pos.x - N.pos.x, c.pos.z - N.pos.z) < 15));
const romSetting = () => settings.romance || 'full';
const romApart = () => (S.arc?.rift || 0) > 0;
const romWall = () => { const now = performance.now(), d = Math.min(0.15, ROM.last ? (now - ROM.last) / 1000 : 0.016); ROM.last = now; return d; };
const romSleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function romWaitSubs(max = 40000) { const t0 = performance.now(); while ((subs.length || subT > 0.5) && performance.now() - t0 < max) await romSleep(150); }
function romShared() { S.rom.lastShared = S.gh; }
function romDayOnce(key) { if (S.rom.dayCaps[key] === S.day) return false; S.rom.dayCaps[key] = S.day; return true; }
// addClose hook: a rift halves every gain
function romCloseK(n) { return ROMD.riftK(n, S.arc?.rift || 0); }
function romTier() { return ROMD.tierOf(S.close); }
function romRift(n = 1, cause = null) {
  S.arc.rift = clamp(n | 0, 0, 2); S.arc.riftCause = S.arc.rift ? cause || S.arc.riftCause || 'rift' : null;
  if (S.arc.rift && ROM.hand) romHandOff();
  return S.arc.rift;
}
// Sena stepping back: the rift answer
function romNotNow() {
  say('Sena', ROMD.L.notNow);
  const a = Math.atan2(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  N.pos.x += Math.sin(a) * 0.6; N.pos.z += Math.cos(a) * 0.6; collide(N.pos, 0.3);
  N.face = a + Math.PI; N.wait = 4;
  return ROMD.L.notNow;
}

// ----- the Sena menu (findTarget entry after the shared meal; hold E 0.3 s)
const SENA_ACTS = [];                                // other packages: romRegister({id, label, when|ok, req?, hint?, act}) or push (SURV does)
function romRegister(def) { const i = SENA_ACTS.findIndex((a) => a.id === def.id); if (i >= 0) SENA_ACTS[i] = def; else SENA_ACTS.push(def); return def; }
function romTarget(p) {
  if (busy || P.ride || N.ride || P.sit > 0 || N.sit > 0 || P.rest > 0 || N.rest > 0 || P.downed > 0 || N.downed || MAT.rescuing || ROM.scene || P.swim) return null;
  const dx = N.pos.x - p.x, dz = N.pos.z - p.z, d = Math.hypot(dx, dz);
  if (d > 2.2 || hostileNear(20) || (ROM.hand && P.speed > 0.5)) return null;   // walking hand in hand: no prompt bobbing over them
  // only when Aro looks her way, so gathering beside her still works
  if (d > 0.6 && Math.abs(angTo(camFace(), Math.atan2(dx, dz))) > 0.85) return null;
  return ROM.tgt = { label: 'Sena (hold E)', key: true, rom: true, act() { if (!ROM.eAt) ROM.eAt = performance.now(); } };
}
function romSnap() {
  const has = ['beads', 'carving', 'meat'].some((k) => S.inv[k] > 0);
  return { close: S.close, firstKiss: S.rom.firstKiss, romance: romSetting(), rift: S.arc?.rift || 0, kidNear: romKidNear(), gift: has, giftToday: S.rom.dayCaps.gift === S.day, holding: !!ROM.hand, arms: !!kidHeld };
}
const ROM_LABEL = { talk: 'Talk', hand: 'Hold her hand', letgo: 'Let go of her hand', embrace: 'Embrace her', kiss: 'Kiss her', gift: 'Give a gift…' };
const ROM_ACT = { talk: () => romTalk(), hand: () => romHand(true), letgo: () => romHand(false), embrace: () => romEmbrace(), kiss: () => romKiss(), gift: () => romGiftMenu() };
function romActs() {
  const list = ROMD.menuRules(romSnap()).map((r) => ({ id: r.id, label: ROM_LABEL[r.id], ok: r.ok, hint: r.hint, act: ROM_ACT[r.id] }));
  for (const a of SENA_ACTS) {
    try { if (a.when ? !a.when() : a.ok ? !a.ok() : false) continue; } catch (err) { console.error(err); continue; }   // SURV registers {ok}: shown only when ok
    const ok = !a.req || !!a.req();
    list.push({ id: a.id, label: typeof a.label === 'function' ? a.label() : a.label, ok, hint: ok ? a.hint || '' : a.hint || 'Not possible now', act: a.act });
  }
  return list;
}
async function romMenu(page = 0) {
  if (ROM.menuOpen || busy) return null;
  const acts = romActs();
  let list = acts, more = null;
  if (acts.length > 4) { list = page === 0 ? acts.slice(0, 3) : acts.slice(3, 6); more = page === 0 ? 'More…' : 'Back'; }
  const opts = list.map((a) => ({ label: a.label, req: a.ok === false ? () => false : undefined, hint: a.hint || undefined }));
  if (more) opts.push({ label: more });
  opts.push({ label: 'Leave' });
  N.speed = 0; N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z); N.node = null; N.act = 0;
  ROM.menuOpen = true;
  const pr = choose('sena', 'Sena', opts, { def: opts.length - 1, note: `${romTier().name} · Closeness ${Math.round(S.close)}` });
  const btn = $('choice').querySelectorAll('button'); const kb = btn[btn.length - 1]?.querySelector('kbd'); if (kb) kb.textContent = 'Esc';
  const i = await pr; ROM.menuOpen = false;
  if (i === opts.length - 1) return null;
  if (more && i === list.length) return romMenu(page === 0 ? 1 : 0);
  const a = list[i]; if (!a) return null;
  ROM.log.push(a.id);
  return a.act?.();
}

// ----- talk: a chapter vignette, standing face to face
function romTalk() {
  const v = VIGNETTES[CH[S.ch]?.id] || VIGNETTES.village || [];
  const pair = v.length ? v[cnt('rom_talk') % v.length] : [['Sena', 'Sit with me a while, when the work is done.']];
  bump('rom_talk'); pair.forEach((l) => say(...l));
  ROM.talk = { t: 0, dur: Math.max(6, pair.length * 3.6) };
  N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z); P.face = N.face + Math.PI;
  if (N.h.has('talk')) N.h.pose = 'talk';
  return 'ok';
}
function romTalkTick(dt) {
  const k = ROM.talk; k.t += dt;
  if (k.t > k.dur || romDist() > 4 || busy) { ROM.talk = null; if (N.h.pose === 'talk') N.h.pose = null; return false; }
  N.speed = 0; N.face = turn(N.face, Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z), Math.min(1, dt * 6));
  settle(N, dt, false);
  return true;
}

// ----- hand in hand (25+): Sena at Aro's right, 0.55 m, matching his heading and pace
function romCanHand() {
  if (romSetting() === 'off') return 'off';
  if (P.swim || P.ride || N.ride || P.sit > 0 || P.rest > 0 || senaLit || W.st === 'drawn' || W.aim || hostileNear(20) || N.downed || P.downed > 0) return 'busy';
  if (kidHeld) return 'busy';                        // the newborn is in both her arms
  return null;
}
function romHand(on = true, force = false) {
  if (!on) { romHandOff(); return 'ok'; }
  if (ROM.hand) return 'ok';
  if (!force && S.close < ROMD.GATE.hand) return 'close';
  const why = romCanHand(); if (why) return why;
  if (romApart()) return romNotNow();
  ROM.hand = { t: 0, walk: 0, paid: false };
  S.rom.held = (S.rom.held || 0) + 1; romShared();
  N.node = null; N.act = 0; N.h.pose = null;
  if (N.h.pose === 'talk') N.h.pose = null;
  if (!force || rand() < 0.5) say('Sena', ROMD.L.hand[(S.rom.held - 1) % ROMD.L.hand.length]);
  return 'ok';
}
function romHandOff() { ROM.hand = null; }
function romSpeed(sp) { return ROM.hand && !ROM.scene && !P.swim ? Math.min(sp, 1.9) : sp; }
function romHandTick(dt) {
  const H = ROM.hand;
  const sprint = (keys.ShiftLeft || keys.ShiftRight || P.auto) && P.speed > 0.5;
  if (!H.rite && (sprint || P.air || romCanHand() || romDist() > 3.5 || busy)) { romHandOff(); return false; }
  H.t += dt;
  const fx = Math.sin(P.face), fz = Math.cos(P.face), rx = -fz, rz = fx;   // Aro's right
  const tx = P.pos.x + rx * 0.55, tz = P.pos.z + rz * 0.55;
  const k = H.t < 0.5 ? Math.min(1, dt * 8) : 1;
  N.pos.x += (tx - N.pos.x) * k; N.pos.z += (tz - N.pos.z) * k; collide(N.pos, 0.25);
  N.face = turn(N.face, P.face, Math.min(1, dt * 10)); N.speed = P.speed; N.node = null; N.act = 0;
  if (P.speed > 0.5) H.walk += dt;
  if (H.walk >= 60 && !H.paid) { H.paid = true; if (romDayOnce('hand')) addClose(1, 'walked hand in hand'); romShared(); }
  settle(N, dt, false);
  return true;
}

// ----- scenes: embrace, kiss, forehead kiss, almost-kiss (wall clock; busy; their own camera)
const _rv = new THREE.Vector3(), _rv2 = new THREE.Vector3(), _rv3 = new THREE.Vector3();
function romPlace(sc) {
  // face to face, `apart` metres between the pelvises, on the line they already stand on
  const ax = N.pos.x - P.pos.x, az = N.pos.z - P.pos.z, d = Math.hypot(ax, az) || 1, ux = ax / d, uz = az / d;
  const mx = sc.o.mid ? sc.o.mid.x : (P.pos.x + N.pos.x) / 2, mz = sc.o.mid ? sc.o.mid.z : (P.pos.z + N.pos.z) / 2, h = (sc.kind === 'peck' ? 0.4 : ROM.T.apart) / 2;
  sc.u = new THREE.Vector3(ux, 0, uz);
  sc.p0 = P.pos.clone(); sc.n0 = N.pos.clone();
  sc.pT = new THREE.Vector3(mx - ux * h, 0, mz - uz * h); sc.nT = new THREE.Vector3(mx + ux * h, 0, mz + uz * h);
  if (sc.kind === 'peck') sc.pT.copy(P.pos), sc.nT.set(P.pos.x + ux * h * 2, 0, P.pos.z + uz * h * 2);
  sc.pf = Math.atan2(ux, uz); sc.nf = sc.pf + Math.PI;
  sc.mid = new THREE.Vector3((sc.pT.x + sc.nT.x) / 2, 0, (sc.pT.z + sc.nT.z) / 2);
}
function romCam(sc, kind) {
  // a side-on two-shot at shoulder height; for the kiss a lower profile against the fire (behind them) or the sky
  const m = sc.mid, gy = Math.max(getHeight(m.x, m.z), P.pos.y), sx = -sc.u.z, sz = sc.u.x;
  const fire = structs.find((f) => (f.kind === 'fire' || (f.kind === 'house' && S.home.hearth)) && f.rise >= 1 && Math.hypot(f.x - m.x, f.z - m.z) < 18);
  const dist = kind === 'kiss' ? ROM.T.kissDist : ROM.T.camDist, y = kind === 'kiss' ? 1.42 : ROM.T.camY;
  let best = null, bs = -1e9;
  for (const sg of [1, -1]) {
    const px = m.x + sx * sg * dist, pz = m.z + sz * sg * dist;
    let score = -Math.max(0, getHeight(px, pz) - (gy + y - 0.5)) * 10;
    if (fire) score += ((fire.x - m.x) * -sx * sg + (fire.z - m.z) * -sz * sg) > 0 ? 2 : 0;   // the fire behind the couple
    for (const s of structs) if (s.rise >= 1 && s.radius > 1 && Math.hypot(s.x - px, s.z - pz) < s.radius) score -= 5;
    if (score > bs) { bs = score; best = sg; }
  }
  if (sc.o.camSide) best = sc.o.camSide;
  const pos = new THREE.Vector3(m.x + sx * best * dist, gy + y, m.z + sz * best * dist), lk = new THREE.Vector3(m.x, gy + (kind === 'kiss' ? 1.56 : 1.38), m.z);
  if (sc.o.camPos) pos.copy(sc.o.camPos); if (sc.o.camLook) lk.copy(sc.o.camLook);
  structCam(lk, pos);
  return [pos, lk];
}
function romSceneStart(kind, o = {}) {
  if (ROM.scene || !playing) return null;
  if (kind !== 'peck') arcCalmClear();               // ARC-FIX: no event pack in the shot
  if (ROM.hand) romHandOff();
  if (ROM.talk) { ROM.talk = null; if (N.h.pose === 'talk') N.h.pose = null; }
  if (typeof wpnStowAll === 'function') wpnStowAll('rom', true);
  for (const e of [P, N]) { if (e.sit > 0) endSit(e); e.h.pose = null; e.vx = e.vz = 0; e.speed = 0; e.node = null; }
  P.auto = false;
  const dur = { embrace: 3.5, kiss: 5.3, peck: 1.7, almost: 4.6 }[kind] || o.dur || 4;
  const sc = { kind, o, t: 0, dur: o.dur || dur, cam: o.cam !== false && kind !== 'peck', fade: o.fade ?? (romSetting() === 'fade' && kind !== 'peck'), lines: o.lines || null, said: false, sting: false, howl: false };
  romPlace(sc);
  ROM.scene = sc; busy = true; ROM.mode = kind; ROM.peck = kind === 'peck'; ROM.armsW = kind === 'peck' || kind === 'almost' ? 0 : 1;
  ROM.w = 0; ROM.kissK = 0; ROM.browK = 0;
  $('prompt').style.display = 'none';
  if (sc.cam) { const [pos, lk] = romCam(sc, kind === 'kiss' || kind === 'almost' ? 'kiss' : 'embrace'); R.lastLook = null; rstShot(pos, lk, o.cut ? 0.01 : 0.9, !!o.cut); sc.camPos = pos; sc.camLook = lk; }
  if (sc.cam && !ROM.nightOn && !R.on && !$('hud').classList.contains('cine')) { sc.cine = true; cine(true); }   // letterbox, HUD away
  if (sc.fade) { $('fade-text').textContent = ''; $('fade').classList.add('on'); }
  return new Promise((res) => { sc.done = res; });
}
function romSceneTick(dt, gdt) {
  const sc = ROM.scene; sc.t += dt; const t = sc.t, T = ROM.T, D = sc.dur;
  // approach (0.6 s), then hold; Sena turns to him, Aro to her
  const k = smooth01(t / 0.6);
  P.pos.x = lerp(sc.p0.x, sc.pT.x, k); P.pos.z = lerp(sc.p0.z, sc.pT.z, k);
  N.pos.x = lerp(sc.n0.x, sc.nT.x, k); N.pos.z = lerp(sc.n0.z, sc.nT.z, k);
  P.face = turn(P.face, sc.pf, Math.min(1, dt * 9)); N.face = turn(N.face, sc.nf, Math.min(1, dt * 9));
  P.vx = P.vz = 0; P.speed = N.speed = 0;
  const wIn = sc.kind === 'peck' ? 0.35 : 0.6, wOut = sc.kind === 'almost' ? 0.35 : 0.6;
  let w = Math.min(smooth01(t / wIn), smooth01((D - t) / wOut));
  let kk = 0, bk = 0;
  if (sc.kind === 'kiss') { kk = Math.min(smooth01((t - 1.1) / 0.5), smooth01((3.2 - t) / 0.4)); bk = Math.min(smooth01((t - 2.8) / 0.4), smooth01((D - 0.3 - t) / 0.4)); }
  else if (sc.kind === 'peck') bk = w;
  else if (sc.kind === 'almost') { kk = 0.62 * Math.min(smooth01((t - 0.9) / 1.4), t < 2.5 ? 1 : smooth01((2.85 - t) / 0.35)); if (t > 2.5) w = Math.min(w, smooth01((2.95 - t) / 0.45)); }
  ROM.w = w; ROM.kissK = kk; ROM.browK = bk;
  if (sc.kind === 'kiss' && !sc.sting && t > 1.35) { sc.sting = true; A.tone(587, 1.4, 0.035); A.tone(880, 1.8, 0.025, 0.22); }
  if (sc.kind === 'almost' && !sc.howl && t > 2.25) { sc.howl = true; if (A.ctx) MUSD.howl(A.ctx, A.sfx || A.out, A.ctx.currentTime, 0.1); }
  if (sc.lines && !sc.said && t > (sc.o.lineAt ?? 0.8)) { sc.said = true; sc.lines.forEach((l) => say(...l)); }
  if (T.hideBack && sc.kind !== 'peck' && w > 0.05) { senaBasket.visible = false; N.h.spear.visible = false; if (P.h.spear.visible && P.h.spear.parent?.name === 'sock_back') { P.h.spear.visible = false; ROM.hidden.push(P.h.spear); } }
  P.h.root.position.set(P.pos.x, P.pos.y, P.pos.z); P.h.root.rotation.y = P.face;
  settle(N, gdt, false);
  if (t >= D) romSceneEnd();
}
function romSceneEnd(cut = false) {
  const sc = ROM.scene; if (!sc) return;
  ROM.scene = null; ROM.mode = null; ROM.w = ROM.kissK = ROM.browK = 0; ROM.peck = false; busy = false;
  for (const m of ROM.hidden.splice(0)) m.visible = true;
  if (sc.kind !== 'peck') {                          // ARC-FIX: they let go: a half step apart (the embrace pose ended with them 0.2 m apart, clipped)
    const ux = N.pos.x - P.pos.x, uz = N.pos.z - P.pos.z, ul = Math.hypot(ux, uz);
    if (ul < 0.75) { const k = (0.8 - ul) / 2, nx = ul > 0.01 ? ux / ul : Math.sin(P.face), nz = ul > 0.01 ? uz / ul : Math.cos(P.face); N.pos.x += nx * k; N.pos.z += nz * k; P.pos.x -= nx * k; P.pos.z -= nz * k; collide(N.pos, 0.3); collide(P.pos, 0.3); }
  }
  if (sc.fade) $('fade').classList.remove('on');
  if (sc.cine && !ROM.nightOn && !R.on) cine(false);
  if (sc.cam && !sc.o.keepCam && (camShot?.dolly || camShot?.release)) camShot = cut ? null : { release: true, from: camPos.clone(), lookFrom: (R.lastLook || sc.camLook || look).clone(), k: 0, dur: 1.1 };
  sc.done?.(sc);
}

// ----- embrace (40+), kiss (60+ after the first kiss), forehead kiss (40+, automatic)
function romGuard(min, kiss = false) {
  if (romSetting() === 'off') return 'off';
  if (ROM.scene || busy) return 'busy';
  if (romKidNear()) return 'kids';
  if (P.ride || N.ride || P.swim || P.downed > 0 || N.downed || P.rest > 0 || N.rest > 0) return 'busy';
  if (kiss && S.rom.firstKiss == null) return 'firstKiss';
  if (S.close < min) return 'close';
  return null;
}
function romEmbrace(force = false) {
  const why = romGuard(force ? 0 : ROMD.GATE.embrace); if (why) return why;
  if (romApart()) return romNotNow();
  if (romDist() > 6) N.pos.set(P.pos.x + Math.sin(P.face) * 0.9, 0, P.pos.z + Math.cos(P.face) * 0.9);
  S.rom.embraces = (S.rom.embraces || 0) + 1; romShared();
  if (romDayOnce('embrace')) addClose(2, 'an embrace');
  romSceneStart('embrace', { lines: [['Sena', ROMD.L.embrace[(S.rom.embraces - 1) % ROMD.L.embrace.length]]] });
  return 'ok';
}
function romKiss(force = false) {
  const why = romGuard(force ? 0 : ROMD.GATE.kiss, !force); if (why) return why;
  if (romApart()) return romNotNow();
  if (romDist() > 6) N.pos.set(P.pos.x + Math.sin(P.face) * 0.9, 0, P.pos.z + Math.cos(P.face) * 0.9);
  S.rom.kisses = (S.rom.kisses || 0) + 1; romShared();
  if (romDayOnce('kiss')) addClose(2, 'a kiss');
  romSceneStart('kiss', { lines: [['Sena', ROMD.L.kiss[(S.rom.kisses - 1) % ROMD.L.kiss.length]]], lineAt: 3.4 });
  return 'ok';
}
function romPeck(line) {
  if (romSetting() !== 'full' || romGuard(0) || romApart()) return false;
  romSceneStart('peck', { lines: line ? [['Sena', line]] : null, lineAt: 0.3 });
  return true;
}

// ----- gifts (one a day)
async function romGiftMenu() {
  const items = ['beads', 'carving', 'meat'].filter((k) => S.inv[k] > 0);
  if (!items.length) return 'none';
  if (S.rom.dayCaps.gift === S.day) { say('Sena', 'You already gave me something today. Keep the rest for tomorrow.'); return 'today'; }
  const names = { beads: 'Ochre beads', carving: 'The carved figure', meat: 'Raw meat' };
  const i = await choose('gift', 'Give Sena…', [...items.map((k) => ({ label: names[k], hint: `${S.inv[k]} in your pack` })), { label: 'Never mind' }], { def: items.length });
  if (i >= items.length) return null;
  return romGift(items[i]);
}
function romGift(k) {
  if (!(S.inv[k] > 0)) return 'none';
  if (S.rom.dayCaps.gift === S.day) return 'today';
  const winter = S.arc?.season === 'winter', n = ROMD.giftValue(k, S.rom.gifts, winter);
  S.inv[k]--; S.rom.dayCaps.gift = S.day; drawInv();
  const seen = S.rom.gifts[k] || 0; S.rom.gifts[k] = seen + 1;
  N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z); N.h.swing(); P.h.swing();
  const lines = ROMD.L.gift[k]; say('Sena', lines[Math.min(seen, lines.length - 1)]);
  if (winter && k !== 'meat' && !S.rom.gifts.snow) { S.rom.gifts.snow = 1; say('Sena', ROMD.L.gift.snow); }
  if (k !== 'meat') romShared();
  addClose(n, k === 'meat' ? 'an odd gift' : 'a gift');
  return n;
}

// ----- heart events: once each, at the next fire sit or rest after crossing 20/40/60/80/100 (+2 each)
function romHeartDue(atFire = true) {
  for (const n of ROMD.HEARTS) {
    if (S.rom.heart[n] || S.close < n) continue;
    if (n === 40 && !(world.env.night > 0.55 && atFire) && S.close < 50) return null;   // Dain waits for a starry night (or the peak)
    return n;
  }
  return null;
}
async function romHeart(n, o = {}) {
  if (!ROMD.HEARTS.includes(+n) || S.rom.heart[n]) return false;
  n = +n; S.rom.heart[n] = S.day || 1; romShared();
  const lines = ROMD.heartLines(n, kids.length);
  ROM.music = true;
  if (n === 60) {
    if (romDist() > 5) N.pos.set(P.pos.x + Math.sin(P.face) * 0.9, 0, P.pos.z + Math.cos(P.face) * 0.9);
    if (romSetting() === 'full' && !romKidNear()) {
      say(...lines[0]); say(...lines[1]);
      await romSceneStart('almost', { lines: [lines[2]], lineAt: 2.4, keepCam: true });
      lines.slice(3).forEach((l) => say(...l));
      romCamHold(5);
    } else lines.forEach((l) => say(...l));
  } else if (n === 40) {
    lines.forEach((l) => say(...l));
    romStarShot(o.peak);
  } else {
    lines.forEach((l) => say(...l));
    if (n === 80) { S.c.figurine = 1; setTimeout(() => toast('Sena\'s carved horse stands by the hearth now (+1 homeliness)'), 6000); }
  }
  addClose(2, 'a moment with Sena');
  setTimeout(() => { ROM.music = false; }, 14000);
  return true;
}
// a slow look up at the stars over the two of them (heart 40)
function romStarShot(peak) {
  const m = new THREE.Vector3((P.pos.x + N.pos.x) / 2, 0, (P.pos.z + N.pos.z) / 2), gy = getHeight(m.x, m.z);
  const a = (peak ? Math.atan2(m.x - peak.x, m.z - peak.z) : P.face) + 0.5;
  const pos = new THREE.Vector3(m.x - Math.sin(a) * 3.2, gy + 1.2, m.z - Math.cos(a) * 3.2), lk = new THREE.Vector3(m.x + Math.sin(a) * 6, gy + 7, m.z + Math.cos(a) * 6);
  R.lastLook = null; rstShot(pos, lk, 4); romCamHold(14);
}
function romCamHold(sec) {
  clearTimeout(ROM.camT);
  ROM.camT = setTimeout(() => { if (!ROM.scene && camShot?.dolly && !R.on) camShot = { release: true, from: camPos.clone(), lookFrom: (R.lastLook || look).clone(), k: 0, dur: 1.4 }; }, sec * 1000);
}

// ----- the first kiss: ARC calls it at the fever recovery; else the first fire sit at 60+ (fallback)
function romFirstKissFallback() {
  if (S.rom.firstKiss != null || romSetting() === 'off') return false;   // ARC-FIX: never with Romance Off
  if (S.rom.kissOffer) return true;
  const fv = chIdx('fever');
  return fv < 0 || settings.matureStory === false || !!S.arc?.legacy || S.ch > fv;
}
// ARC-FIX4: the first kiss is one staged beat, start to end: letterbox and HUD away, the two of them held face to face
// in a side-on two-shot (Sena no longer walks off to gather stones), the choice over that shot, the kiss, and the
// lines after it; only then do the camera, the HUD and Sena go back to the game (and the chapter may turn).
function romFkCam() {
  if (view === 'fpp' || (P.sit > 0 && camShot)) return;   // first person keeps his eyes; a fire sit keeps its own two-shot
  const ux = N.pos.x - P.pos.x, uz = N.pos.z - P.pos.z, d = Math.hypot(ux, uz) || 1;
  const sc = { mid: new THREE.Vector3((P.pos.x + N.pos.x) / 2, 0, (P.pos.z + N.pos.z) / 2), u: new THREE.Vector3(ux / d, 0, uz / d), o: {} };
  const [pos, lk] = romCam(sc, 'embrace');
  R.lastLook = null; rstShot(pos, lk, 1.1);
}
function romFkStage(on) {
  if (on) {
    if (P.sit <= 0 && N.sit <= 0) {                 // standing: a step apart, face to face
      const ux = N.pos.x - P.pos.x, uz = N.pos.z - P.pos.z, d = Math.hypot(ux, uz);
      if (d < 0.9 || d > 1.6) { const nx = d > 0.01 ? ux / d : Math.sin(P.face), nz = d > 0.01 ? uz / d : Math.cos(P.face); N.pos.set(P.pos.x + nx * 1.15, 0, P.pos.z + nz * 1.15); collide(N.pos, 0.3); }
      P.face = Math.atan2(N.pos.x - P.pos.x, N.pos.z - P.pos.z); N.face = P.face + Math.PI;
      P.vx = P.vz = 0; P.speed = 0; P.auto = false; N.path = null; N.node = null; N.act = 0; N.fetch = null; N.speed = 0; if (N.h.pose !== 'sit') N.h.pose = null;
    }
    ROM.fkHold = true; busy = true; for (const k in keys) keys[k] = false;
    $('prompt').style.display = 'none';
    if (!$('hud').classList.contains('cine')) { ROM.fkCine = true; cine(true); }
    romFkCam();
  } else {
    ROM.fkHold = false; busy = false; $('choice').classList.remove('low');
    if (ROM.fkCine) { ROM.fkCine = false; if (!ROM.nightOn && !R.on) cine(false); }
    if (camShot?.dolly) camShot = { release: true, from: camPos.clone(), lookFrom: (R.lastLook || look).clone(), k: 0, dur: 1.2 };
    if (playing && !paused && !MAT.choice) lock();
  }
}
// updateSena (from arcSena): while the beat is on she stays where she is, turned to him
function romFkHoldTick(dt) {
  if (!ROM.fkHold || ROM.scene) return false;
  N.speed = 0; N.path = null; N.node = null; N.act = 0; N.fetch = null;
  if (!(N.sit > 0)) N.face = turn(N.face, Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z), Math.min(1, dt * 5));
  settle(N, dt, false);
  return true;
}
async function romFirstKiss(ctx = 'fever') {
  if (S.rom.firstKiss != null || ROM.fk) return false;
  ROM.fk = true; ROM.music = true;
  arcCalmClear();                                    // ARC-FIX
  let staged = false;
  try {
    while (busy && !ROM.fkHold && (ARCS.vigilOn || MAT.choice || ROM.scene || R.on)) await romSleep(200);   // ARC-FIX4: the vigil hands over first (its fade stands them at the door)
    if (romDist() > 6) N.pos.set(P.pos.x + Math.sin(P.face) * 1.1, 0, P.pos.z + Math.cos(P.face) * 1.1);
    romFkStage(true); staged = true;
    const lead = ctx === 'fever' ? ROMD.L.firstFever : S.rom.kissOffer ? ROMD.L.firstAgain : ROMD.L.firstFire;
    if (romSetting() !== 'off' || ctx === 'fever') lead.forEach((l) => say(...l));   // ARC-FIX: Romance Off: only the fever morning's (tender, not romantic) lines
    await romWaitSubs();
    if (romSetting() === 'off') {                     // ARC-FIX: Romance Off (spec 2.6): no kiss or hand choice; a quiet beat, the story carries on
      S.rom.kissOffer = false; S.rom.fkQuiet = S.day || 1; romShared();   // (firstKiss stays unset: with romance back on, the fire offers it later)
      addClose(5, 'a quiet morning together');
      say('Sena', 'Stay a while. Just sit with me.'); say('Aro', 'As long as you want.');
      emit('romance', { kind: 'firstKiss', off: true });
      await romWaitSubs();
      return false;
    }
    $('choice').classList.add('low');                // ARC-FIX4: the panel sits under their faces, not over them
    const i = await choose('firstkiss', 'Sena', [{ label: 'Kiss her' }, { label: 'Hold her hand' }], { def: 1, note: 'She is waiting for you.' });
    $('choice').classList.remove('low');
    if (i === 0) {
      S.rom.firstKiss = S.day || 1; S.rom.kissOffer = false; S.rom.kisses = (S.rom.kisses || 0) + 1; S.rom.dayCaps.kiss = S.day; romShared();
      addClose(10, 'your first kiss');
      if (romSetting() !== 'off' && !romKidNear()) { ROM.fkHold = false; busy = false; await romSceneStart('kiss', { lines: null, keepCam: true }); romFkStage(true); }
      ROMD.L.firstKissAfter.forEach((l) => say(...l));
      emit('romance', { kind: 'firstKiss' });
      await romWaitSubs();                           // ARC-FIX4: the lines after the kiss stay inside the beat
    } else {
      S.rom.kissOffer = true; addClose(5, 'held her hand'); romShared();
      ROMD.L.firstHandAfter.forEach((l) => say(...l));
      await romWaitSubs();
      romFkStage(false); staged = false;
      if (romSetting() !== 'off') romHand(true, true);
    }
    return i === 0;
  } finally { if (staged) romFkStage(false); ROM.fk = false; setTimeout(() => { ROM.music = false; }, 8000); }
}

// ----- the fire: one shared bench (40+), her head on his shoulder (80+); heart events and the first-kiss fallback
function romBench(s) {
  ROM.bench = false; ROM.benchHead = false;
  if (S.close < ROMD.GATE.bench || romSetting() === 'off' || romApart()) return;
  const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), lx = sn, lz = c;                 // the log runs along the fire's local Z
  const ax = P.pos.x, az = P.pos.z, h = S.close >= ROMD.GATE.beloved ? 0.27 : 0.35;
  P.pos.set(ax + lx * h, 0, az + lz * h); N.pos.set(ax - lx * h, 0, az - lz * h);
  P.face = Math.atan2(s.x - P.pos.x, s.z - P.pos.z); N.face = Math.atan2(s.x - N.pos.x, s.z - N.pos.z);
  N.fire = [s.x, s.z];
  ROM.bench = true; ROM.benchHead = S.close >= ROMD.GATE.beloved;
  const rx = -Math.cos(P.face), rz = Math.sin(P.face);
  ROM.benchSideP = (N.pos.x - P.pos.x) * rx + (N.pos.z - P.pos.z) * rz > 0 ? 'r' : 'l';
}
function romSat(s) {
  romShared();
  if (ROM.scene || ROM.fk) return;
  const n = romHeartDue(true);
  if (n) { P.sit = N.sit = Math.max(P.sit, 14); setTimeout(() => romHeart(n), 1600); return; }
  if (S.close >= ROMD.GATE.kiss && romFirstKissFallback()) { P.sit = N.sit = Math.max(P.sit, 14); setTimeout(() => romFirstKiss('fire'), 2200); return; }
  if (S.close >= 40 && !S.rom.heart[40] && !ROM.hint40) { ROM.hint40 = true; setTimeout(() => say('Sena', ROMD.L.heart['40hint']), 9000); }
}

// ----- the fade-to-black night (RST option 3) -----------------------------------------------------------------
// CONTENT GUARDRAILS (spec §2 verbatim, §12 applied):
// 1. Romance is strictly non-explicit.
//    - Affection is limited to hand-holding, embrace, kiss (lips or forehead) and resting together clothed.
//    - Intimacy is always shown as embrace, then kiss, then a cut or fade to black, then the next morning.
//    - No sex scenes. No sexual sounds, text or innuendo beyond warm, adult tenderness.
//    - No undressing API, and no nude or underwear meshes or textures. Never swap the Quaternius clothed bodies.
//    - In bed, only show sleeping: clothed, under the blanket, holding hands (the existing RST look).
//    - Romance happens only between Aro and Sena, both adults.
//    - No romance option is available when a child is within 15 m or awake in the house.
// 2. No sexual violence or threat of it, anywhere. Korr wants Sena as a healer. Never write or imply anything else.
// 3. Children (Lio, Pell) are never harmed, targeted, endangered on screen or shown dead.
// 4. Violence is realistic, not torture porn (§12: combat/hunting dismemberment allowed; no torture mechanics).
// 5. Death of a main character is non-graphic.
// 6. Settings always win: Romance "Fade early" cuts at the embrace; "Off" hides kiss, embrace, hand-holding and night options.
// 7. The 21+ content notice is shown on the title screen until accepted.
// GUARDRAIL: the parents' night together only when every child is in her own room: the baby in her cradle, the girl in
// her nursery. A child on her own mat beside their bed (no nursery, or the annex on sloped ground) blocks it.
const romKidsOk = () => { if (!kids.length) return true; const h = structs.find((s) => s.kind === 'house' && s.rise >= 1); return !!h && kids.every((c, i) => inCradle(h, i) || inNursery(h, i)); };
function romNightBlock(s) {
  return ROMD.nightBlock({ romance: romSetting(), close: S.close, firstKiss: S.rom.firstKiss, house: s?.kind === 'house' && s === homeHouse(), bed: !!S.home.bed,
    time: S.time, rift: S.arc?.rift || 0, hostile: hostileNear(35, s ? { x: s.x, z: s.z } : P.pos), day: S.day, lastNight: S.rom.dayCaps.night ?? null, kidsOk: romKidsOk() });
}
// rstOpen hook: option 3, and the note when Sena sleeps apart
function romRestOpts(s, tog) {
  if (romApart() && Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 40) {
    $('rm-note').textContent = 'Sena will sleep by the fire tonight.';
    if (romDayOnce('apartLine')) say('Sena', ROMD.L.apart);
    return;
  }
  if (!tog || romNightBlock(s)) return;
  R.opts.push(['together', 'Go to bed early, together', 'Snug and content · the cold bites less tomorrow']);
}
async function romNight(s) {
  if (!s || romNightBlock(s) || ROM.scene || R.on) return false;
  const L = rstLayout(s), W3 = (p) => toWorld(s, p);
  busy = true; ROM.music = true; ROM.nightOn = true;
  if (P.ride) dismount();
  if (typeof wpnStowAll === 'function') wpnStowAll('rest', true);
  if (torchOn) setTorch(false);
  for (const c of kids) c.h.root.visible = false;                                         // the little one is asleep in the cradle / nursery
  // a dip, then inside by the hearth: Sena crouched at the embers, Aro behind her
  $('restdip').classList.add('on'); cine(true);
  await romSleep(380);
  if (s.col) s.col.off = true;
  ROM.nightFloor = s.group.position.y + 0.19;                                              // both on the planks (the house can sit on a slope)
  const hx = s.hearthPt || [1.9, 0.7, -1.2];
  N.pos.copy(W3([hx[0] - 0.75, 0, hx[2] + 0.62])); P.pos.copy(W3([hx[0] - 1.55, 0, hx[2] + 1.45]));
  N.face = Math.atan2(W3(hx).x - N.pos.x, W3(hx).z - N.pos.z); P.face = Math.atan2(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  for (const e of [P, N]) { e.vx = e.vz = 0; e.speed = 0; e.sit = 0; e.h.pose = null; e.node = null; }
  ROM.nightCrouch = true;
  R.lastLook = null;
  // side-on to the two of them with the hearth glowing past Sena (the old over-the-shoulder spot hid her behind Aro)
  const cp = W3([hx[0] + 0.29, 1.5, hx[2] + 2.41]), cl = W3([hx[0] - 0.8, 0.95, hx[2] + 0.65]);
  rstShot(cp, cl, 0.01, true);
  $('restdip').classList.remove('on');
  const Ln = ROMD.L.night;
  subs.length = 0; subT = 0; $('sub').classList.remove('on');                           // a clean slate: only their lines tonight
  say(...Ln[0]); say(...Ln[1]);
  await romWaitSubs(16000);
  ROM.nightCrouch = false;
  N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z);
  say(...Ln[2]);
  await romSleep(900);
  busy = false;                                                                            // the scene takes busy itself
  S.rom.kisses = (S.rom.kisses || 0) + 1;
  const mid = new THREE.Vector3().addVectors(P.pos, N.pos).multiplyScalar(0.5);
  // side-on two-shot at 1.5 m, on whichever side of the couple stays inside the room (a fixed spot ended up behind Aro)
  const ux = N.pos.x - P.pos.x, uz = N.pos.z - P.pos.z, ul = Math.hypot(ux, uz) || 1, room = (q) => { const [x, z] = rstLocal(s, q); return Math.min(2.5 - Math.abs(x), 1.9 - Math.abs(z)); };
  const sides = [1, -1].map((sg) => new THREE.Vector3(mid.x + (uz / ul) * sg * 1.5, ROM.nightFloor + 1.45, mid.z - (ux / ul) * sg * 1.5));
  const kissCam = room(sides[0]) >= room(sides[1]) ? sides[0] : sides[1];
  const scP = romSceneStart('kiss', { mid, keepCam: true, fade: false, camPos: kissCam, camLook: new THREE.Vector3(mid.x, ROM.nightFloor + 1.5, mid.z), dur: 3.6 });
  // the kiss is cut short by the fade: black over the embrace, then the card
  await romSleep(2300);
  $('fade-text').textContent = S.arc?.season === 'winter' ? ROMD.L.nightCardWinter : ROMD.L.nightCard; $('fade').classList.add('on');
  await scP;
  await romSleep(1300);
  busy = false;
  ROM.nightFloor = null; N.jy = 0; P.jy = 0;
  const ok = romBedNow(s);
  for (const c of kids) c.h.root.visible = true;
  if (ok) {
    for (const c of kids) c.inBed = false;                                               // GUARDRAIL: the children keep their own beds
    R.kidsIn = false;
    const order = ['Rested', 'Well rested', 'Snug'], ti = Math.min(2, order.indexOf(R.tier) + 1);
    R.tier = order[ti]; R.comfort = Math.max(R.comfort, [0, 3, 6][ti]);
    ROM.nightPending = true; S.rom.nights = (S.rom.nights || 0) + 1; S.rom.dayCaps.night = S.day; romShared();
  }
  await romSleep(3500);                                                                     // the card holds 3.5 s over the bed
  $('fade').classList.remove('on');
  ROM.nightOn = false; setTimeout(() => { ROM.music = false; }, 4000);
  return ok;
}
// Into bed at once (RST rstLieNow without the freeze): both lying, holding hands, the night time-lapse starting
function romBedNow(s) {
  if (!rstBegin(s, 'dawn', { force: true })) { cine(false); return false; }
  for (const e of R.together ? [P, N] : [P]) { e.pos.copy(e.L.sitPos); e.face = e.L.sitYaw; e.path = null; e.speed = 0; e.lie = true; e.lieW = 1; e.L.rollW = 1; e.h.pose = e.L.base; e.L.sitRoot = null; e.L.cal = null; }
  $('restdip').classList.remove('on'); R.dip = 0;
  rstShot(R.L.cam.end, R.L.cam.look, 0.01, true);
  rstStartNight();
  return true;
}
on('rested', (e) => {
  if (e.together) romShared();
  // a heart event that was waiting for a quiet moment: the morning after a rest together (the fire sit is the other one)
  if (e.together && !ROM.nightPending) { const n = romHeartDue(false); if (n) setTimeout(() => { if (!busy && !ROM.scene && !R.on && playing && romDist() < 6 && !hostileNear(20) && romHeartDue(false) === n) romHeart(n); }, 5000); }
  if (!ROM.nightPending) return;
  ROM.nightPending = false;
  S.rom.contentUntil = S.gh + 16;
  addClose(3, 'a night together');
  say('Sena', ROMD.L.nightMorning); R.morning = ROMD.L.nightMorning;
  setTimeout(() => toast('Content: the cold bites less today'), 2500);
}, 90);
function romChillK() { return S.rom?.contentUntil > S.gh ? 0.8 : 1; }

// ----- handfasting (ARC bond): at the stones, ochre on the cheeks, a cord around the joined hands, vows, kiss, dance
const _rq0 = new THREE.Quaternion();
function romOchre(on) {
  for (const m of ROM.ochre) m.parent?.remove(m);
  ROM.ochre.length = 0;
  if (!on) return;
  for (const [h, side] of [[P.h, 1], [N.h, -1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.012), new THREE.MeshBasicMaterial({ color: 0x9a2a18, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    for (const sd of [1, -1]) {
      const s = m.clone(); s.position.set(sd * 0.052, 0.085, 0.085); s.rotation.y = sd * 0.9; h.bones.Head.add(s); ROM.ochre.push(s);
    }
  }
}
// the cord: two loops of ochre-red braid around both joined wrists (a straight rod between the hands vanished when they touched)
function romCordMake() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xa8341c, roughness: 0.85 });
  for (const o of [-0.42, 0.42]) { const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.14, 6, 18), m); t.position.z = o; t.rotation.z = o; g.add(t); }   // unit size: scaled to the wrists
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 3, 5), m); tail.position.set(0.3, -1.9, 0.2); tail.rotation.z = 0.25; g.add(tail);   // the loose end
  return g;
}
function romCordTick() {
  if (!ROM.cord || !ROM.cord.visible) return;
  const a = P.h.bones.hand_r.getWorldPosition(_rv), b = N.h.bones.hand_l.getWorldPosition(_rv2);
  const r = Math.max(0.045, a.distanceTo(b) / 2 + 0.035);
  P.h.bones.lowerarm_r.getWorldPosition(_rv3);
  ROM.cord.position.addVectors(a, b).multiplyScalar(0.5).addScaledVector(_rv3.sub(a).normalize(), 0.035);   // just above the wrists
  ROM.cord.lookAt(_rv3.multiplyScalar(-1).add(ROM.cord.position));                                         // loops round the forearms
  ROM.cord.scale.setScalar(r);
}
async function romScene(kind = 'handfast', o = {}) {
  if (kind !== 'handfast' || ROM.scene) return null;
  ROM.music = true;
  try {
    const st = o.at || LMK?.stones || null, joined = romSetting() !== 'off';
    if (st && Math.hypot(st.x - P.pos.x, st.z - P.pos.z) < 60) { P.pos.set(st.x + 2.2, 0, st.z + 1.2); }
    if (ROM.talk) { ROM.talk = null; if (N.h.pose === 'talk') N.h.pose = null; }
    if (typeof wpnStowAll === 'function') wpnStowAll('rom', true);
    for (const e of [P, N]) { if (e.sit > 0) endSit(e); e.h.pose = null; e.vx = e.vz = 0; e.speed = 0; e.node = null; }
    if (st) P.face = Math.atan2(st.x - P.pos.x, st.z - P.pos.z);                         // side by side, facing the stones
    const fx = Math.sin(P.face), fz = Math.cos(P.face), rx = -fz, rz = fx;
    N.pos.set(P.pos.x + rx * 0.55, 0, P.pos.z + rz * 0.55); N.face = P.face;
    romOchre(true);
    if (!ROM.cord) { ROM.cord = romCordMake(); scene.add(ROM.cord); }
    ROM.cord.visible = joined;
    if (joined) { ROM.hand = { t: 1, walk: 0, paid: true, rite: true }; ROM.handW = 1; }            // rite: held through the vow choice (busy)
    // a front three-quarter two-shot: their faces, the joined hands and the cord, the stones behind them
    const mx = P.pos.x + rx * 0.28, mz = P.pos.z + rz * 0.28, gy = getHeight(mx, mz);
    const cp = new THREE.Vector3(mx + fx * 3.1 + rx * 1.1, gy + 1.5, mz + fz * 3.1 + rz * 1.1), cl = new THREE.Vector3(mx, gy + 1.15, mz);
    structCam(cl, cp); R.lastLook = null; rstShot(cp, cl, 1.2); cine(true); ROM.riteCam = true;
    say('Sena', 'Here, where the old ones stood. Tie it, Aro. Both our hands.');
    await romWaitSubs(12000);
    while (busy && !MAT.choice) await romSleep(200);
    const V = ['Where you walk, I walk.', 'I will keep the fire, and the fire will keep you.', 'I have nothing to give you but every day I have left.'];
    const i = await choose('vow', 'Your vow', V.map((v) => ({ label: v })), { def: 0, timer: 0 });
    S.rom.vow = i; say('Aro', V[i]);
    say('Sena', 'Then I will hold you to it. Every day of it.');
    await romWaitSubs(16000);
    ROM.hand = null; ROM.cord.visible = false;
    if (romSetting() !== 'off') await romSceneStart('kiss', { lines: null, keepCam: true });
    // the dance: a step apart (the clip is a solo dance), a wider shot held over it, then the camera goes home
    { const ux = N.pos.x - P.pos.x, uz = N.pos.z - P.pos.z, ul = Math.hypot(ux, uz) || 1; N.pos.x += (ux / ul) * 0.42; N.pos.z += (uz / ul) * 0.42; P.pos.x -= (ux / ul) * 0.42; P.pos.z -= (uz / ul) * 0.42; collide(N.pos, 0.3); collide(P.pos, 0.3); }
    for (const e of [P, N]) { e.dance = 6; e.h.pose = e.h.has('dance') ? 'dance' : null; }
    const dx = (P.pos.x + N.pos.x) / 2, dz = (P.pos.z + N.pos.z) / 2, dg = getHeight(dx, dz), da = P.face + Math.PI / 2;
    const dp = new THREE.Vector3(dx + Math.sin(da) * 4.2, dg + 1.9, dz + Math.cos(da) * 4.2), dl = new THREE.Vector3(dx, dg + 1.0, dz);
    structCam(dl, dp); R.lastLook = null; rstShot(dp, dl, 1.4);
    emit('romance', { kind: 'handfast', vow: i });
    await romSleep(6000);
    return i;
  } finally {
    ROM.hand = null; if (ROM.cord) ROM.cord.visible = false;
    if (ROM.riteCam) { ROM.riteCam = false; if (!R.on && !ROM.scene) { cine(false); if (camShot?.dolly) camShot = { release: true, from: camPos.clone(), lookFrom: (R.lastLook || look).clone(), k: 0, dur: 1.4 }; } }
    setTimeout(() => { ROM.music = false; romOchre(false); }, 30000);
  }
}

// ----- the per-frame tick (updateSena hook): menu hold, tier label, neglect, Beloved hand, homecoming, the peak
function romTick(dt) {
  if (!ROM.inited) {
    ROM.inited = true; ROM.satN = cnt('sat_fire'); ROM.mealN = cnt('meal_shared');
    if (!(S.rom.lastShared > 0) || S.rom.lastShared > S.gh) S.rom.lastShared = S.gh;
  }
  // hold E on Sena
  if (target?.rom && keys.KeyE && !busy && !ROM.menuOpen) { if (!ROM.eAt) ROM.eAt = performance.now(); if (performance.now() - ROM.eAt >= 300) { ROM.eAt = 0; romMenu(); } }
  else if (!keys.KeyE) ROM.eAt = 0;
  if ((ROM.tierT -= dt) <= 0) {
    ROM.tierT = 0.5;
    const t = romTier();
    if (t !== ROM.tier) {                            // the bar label is the tier (the 66 px label column fits one word); the tooltip says what it is
      ROM.tier = t; const el = $('bar-close');
      if (el?.firstChild?.nodeType === 3) { el.firstChild.nodeValue = t.name; el.style.whiteSpace = 'nowrap'; el.title = `Closeness with Sena: ${t.name}`; }
    }
    // shared acts the game already counts (fire sits, shared meals)
    if (cnt('sat_fire') !== ROM.satN || cnt('meal_shared') !== ROM.mealN) { ROM.satN = cnt('sat_fire'); ROM.mealN = cnt('meal_shared'); romShared(); }
    // neglect: three days with nothing shared, then -1 a day and one line
    if (CH[S.ch].id === 'fever' || (S.arc?.feverOn && !S.arc.feverDone) || arcCalmNow()) romShared();   // ARC-FIX: nursing her through the fever, or a story scene together, is shared time
    const nd = ROMD.neglectDays(S.gh, S.rom.lastShared || 0), dk = Math.floor(S.gh / 24);
    if (nd > 0 && S.close >= 20 && !busy && S.rom.dayCaps.neglect !== dk) {
      S.rom.dayCaps.neglect = dk; addClose(-1, 'feeling far apart');
      if (S.rom.dayCaps.neglectLine !== S.rom.lastShared && romDist() < 15) { S.rom.dayCaps.neglectLine = S.rom.lastShared; say('Sena', ROMD.L.neglect); }
    }
  }
  const d = romDist();
  // Beloved: she takes his hand by herself after he has been away a minute or more
  if (d > 25) ROM.awayT += dt;
  else if (d < 3) {
    if (ROM.awayT >= 60 && S.close >= ROMD.GATE.beloved && !ROM.hand && !busy && !ROM.scene && !romApart() && !romCanHand()) { romHand(true, true); say('Sena', ROMD.L.handTake); }
    ROM.awayT = 0;
  }
  // homecoming: a forehead kiss when they come back to the house after time away; one in the morning on the way out
  const h = homeHouse();
  if (h && h.rise >= 1 && S.close >= ROMD.GATE.peck && !busy && !ROM.scene && !R.on && N.rest <= 0 && !N.ride && !P.ride) {
    const dh = Math.hypot(h.x - P.pos.x, h.z - P.pos.z);
    if (dh > 45) ROM.homeAway += dt;
    else if (dh < h.radius + 4) {
      if (ROM.homeAway > 90 && d < 4 && romPeck(ROMD.L.peckHome[cnt('rom_home') % ROMD.L.peckHome.length])) bump('rom_home');
      ROM.homeAway = 0;
    }
    if (S.c.lastSleepDay === S.day && R.inside == null && dh > h.radius + 6 && dh < h.radius + 14 && d < 3 && S.rom.dayCaps.leave !== S.day && clock - R.wokeAt < 240) {
      S.rom.dayCaps.leave = S.day; romPeck(ROMD.L.peckLeave[S.day % ROMD.L.peckLeave.length]);
    }
  }
  // heart 40 at Lookout Peak under the stars
  const pk = LMK?.peak;
  if (pk && !S.rom.heart[40] && S.close >= 40 && world.env.night > 0.55 && !busy && !ROM.scene && d < 8 && Math.hypot(pk.x - P.pos.x, pk.z - P.pos.z) < 16 && !hostileNear(30)) {
    if ((ROM.peakT += dt) > 2) { ROM.peakT = 0; N.face = P.face; romHeart(40, { peak: pk }); }
  } else ROM.peakT = 0;
  // the bench: her lean (and head on his shoulder at Beloved), only while both sit
  const benchOn = ROM.bench && P.sit > 0 && N.sit > 0 && !P.sitIn && !N.sitIn;   // SIT-r3: not while they walk to the bench
  ROM.benchW += ((benchOn ? 1 : 0) - ROM.benchW) * Math.min(1, dt * 2.5);
  if (!benchOn && !(P.sit > 0) && !(N.sit > 0)) ROM.bench = false;
  if (benchOn && ROM.benchHead && N.h.pose === 'sitTalk') N.h.pose = 'sit';
  ROM.handW += ((ROM.hand && !ROM.scene ? 1 : 0) - ROM.handW) * Math.min(1, dt * 6);
  if (ROM.handW < 0.01 && !ROM.hand) ROM.handW = 0;
  romCordTick();
}
// updateSena hook: true while ROM moves Sena (a scene, hand in hand, a talk)
function romSena(dt) {
  if (!playing) return false;
  const wdt = romWall();
  romTick(dt);
  if (ROM.nightFloor != null) { N.jy = ROM.nightFloor - getHeight(N.pos.x, N.pos.z); P.pos.y = ROM.nightFloor; P.h.root.position.y = P.pos.y; }   // the night scene: on the house floor
  if (ROM.scene) { romSceneTick(wdt, dt); return true; }
  if (ROM.nightCrouch) { N.speed = 0; settle(N, dt, true); return true; }
  if (ROM.nightOn) { N.speed = 0; settle(N, dt, false); return true; }
  if (ROM.hand && romHandTick(dt)) return true;
  if (ROM.talk && romTalkTick(dt)) return true;
  return false;
}
function romState() {
  return { tier: romTier().name, close: S.close, hand: !!ROM.hand, handW: +ROM.handW.toFixed(2), scene: ROM.scene?.kind || null, t: ROM.scene ? +ROM.scene.t.toFixed(2) : 0, w: +ROM.w.toFixed(2),
    kissK: +ROM.kissK.toFixed(2), browK: +ROM.browK.toFixed(2), bench: ROM.bench, benchW: +ROM.benchW.toFixed(2), benchHead: ROM.benchHead, talk: !!ROM.talk, rift: S.arc?.rift || 0, rom: { ...S.rom }, menu: ROM.menuOpen, log: ROM.log.slice(-10) };
}

// ---------- MUS adaptive music and volume buses ----------
// A.out is the master (settings.volume); A.sfx, A.amb and A.mus feed it (built in A.init). Music: src/music.js.
// States (3 s crossfade): title, day, night, cave, danger, combat, fire, romance, grief, raid. Any package can emit
// 'music' {state, dur} on the bus to force a state for dur seconds (ARC grief beats, the raid); 'died' plays the lament.
const MUS = { m: null, state: 'title', cand: 'title', candT: 0, forced: null, forceUntil: 0, hitAt: -Infinity, dangerAt: -Infinity, griefUntil: -Infinity, season: null, iv: 0, woke: false };
function musicVolumes() {
  if (!A.ctx || !A.mus) return;
  const t = A.ctx.currentTime, set = (g, v) => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(clamp(+v || 0, 0, 1), t, 0.03); g.gain.value = clamp(+v || 0, 0, 1); };
  set(A.mus, settings.music ?? 0.6); set(A.sfx, settings.sfx ?? 1); set(A.amb, settings.amb ?? 1);
  A.out.gain.value = settings.volume;
}
function musicInit() {
  if (!A.ctx || MUS.m || !A.mus) return;
  MUS.m = MUSD.createMusic(A.ctx, A.mus, A.buf);
  musicVolumes();
  MUS.iv = setInterval(() => { try { MUS.m.tick(); } catch (err) { console.error(err); } }, 100);
}
// title music needs a user gesture to start the audio
function musicWake() { if (playing || MUS.woke) return; MUS.woke = true; A.init(); musicInit(); }
addEventListener('pointerdown', musicWake); addEventListener('keydown', musicWake);
// music timers run on the wall clock (seconds), like the score itself
const musNow = () => performance.now() / 1000;
function musicForce(s, dur = 20) { MUS.forced = s || null; MUS.forceUntil = s ? musNow() + dur : 0; }
function musicSting(kind) {
  if (!MUS.m || !(settings.music > 0)) return false;
  return MUS.m.sting(kind);
}
on('playerHit', () => { MUS.hitAt = musNow(); }, 80);
on('animalHit', (e) => { if (e.o && (e.o.kind === 'wolf' || e.o.hostile)) MUS.hitAt = musNow(); }, 80);
on('died', () => { MUS.griefUntil = musNow() + 120; musicSting('lament'); }, 80);
on('rescued', () => { MUS.griefUntil = musNow() + 20; musicSting('lament'); }, 80);
on('music', (e) => musicForce(e.state, e.dur ?? 20));
function musicSnap() {
  const E = world.env, now = musNow();
  if (MUS.forced && now > MUS.forceUntil) MUS.forced = null;
  if (playing && hostileNear(30)) MUS.dangerAt = now;
  const raid = !!(S.arc?.raid && !S.arc.raid.done && S.arc.raid.wave > 0 && foes.some((f) => f.live && !f.fled));
  return { playing, forced: MUS.forced, grief: MAT.dead || !!MAT.endT || P.downed > 0 || now < MUS.griefUntil, romance: !!(ROM.scene && ROM.scene.kind !== 'peck') || ROM.music || ROM.nightOn,
    raid, combat: now - MUS.hitAt < 6, danger: now - MUS.dangerAt < 4, fire: P.sit > 0, cave: E.cave > 0.5, night: E.night > 0.5 };
}
function updateMusic(dt) {
  // the score runs on the wall clock (a 1 fps frame must not stretch a 2 s settle into a minute)
  const now = performance.now(); dt = MUS.wall ? Math.min(0.5, (now - MUS.wall) / 1000) : dt; MUS.wall = now;
  const sn = musicSnap(), want = MUSD.pickState(sn);
  if (want !== MUS.cand) { MUS.cand = want; MUS.candT = 0; MUS.why = { ...sn, downed: P.downed, endT: MAT.endT, gu: MUS.griefUntil, clock }; } else MUS.candT += dt;
  MUS.state = MUSD.settleState(MUS.state, MUS.cand, MUS.candT);
  // the thaw: winter gives way to spring
  const se = S.arc?.season || null;
  if (MUS.season === 'winter' && se && se !== 'winter') musicSting('thaw');
  MUS.season = se;
  if (!A.ctx) return;
  musicInit();
  if (!MUS.m) return;
  MUS.m.setState(MUS.state);
  MUS.m.tick();
  MUS.m.duck($('sub').classList.contains('on'));
}

// ---------- CMB combat v2 ----------
// Spec M4 (spec_mature.md §7 M4, §9, §12). Tables and pure rules live in src/combat.js, the predators in src/enemies.js,
// the Ash People raiders in src/tribe.js; this section couples them to the game:
//   stamina economy (light 10, heavy 22, dodge 18, block dmg×1.5, regen after 0.8 s) · combos with a 0.25 s buffer and
//   a hold-LMB heavy · RMB block / parry (axe, fists, torch; the spear keeps aim and brace) · Alt dodge roll with
//   i-frames and a perfect-dodge counter · telegraph glints (white = parry, red = dodge) · posture and stagger ·
//   finishers (E) with a side camera and slow motion · spear brace against chargers · hit reactions and knockdown ·
//   the bear's maul QTE · Sena's health, her stones in a fight, downed and revived (her fate by difficulty).
// Children are never targets: raiders pick only Aro, Sena or structures (asserted in tribe.js).
const C = { block: false, blockAt: null, blockW: 0, blockWpn: 'fists', rollAt: null, roll: null, counterUntil: 0, combo: -1, comboT: -9, buf: 0,
  lmbAt: null, heavyDone: false, heavyNext: false, swingHeavy: false, stamT: -9, stamAfter: 100, slow: 0, slowK: 1, knock: null, maul: null,
  brace: false, fin: null, revive: 0, revSite: null, nThrowT: 3, breathT: 0, init: false, tick: 0, lastHurtT: -9, finCam: null, hint: '' };
const CMB_TORCHPOSE = {}, CMB_READYPOSE = {};
const cmbGlints = CB.createGlints(scene, 12);
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
const cmbCtx = {
  scene, P, N, animals, foes, structs, CAVES,
  S: () => S, D: () => D(), clock: () => clock, reached: (id) => reached(id), env: () => world.env,
  spawn, remove: (o) => remove(o), hurt: (o, d, i) => hurt(o, d, i), playerHurt: (e) => playerHurt(e), landSpot, getHeight, slopeY, step: (o, sp, dt) => step(o, sp, dt), turn,
  walkTo, settle, collide, depthAt, biome: biomeAt, makeHuman, makeSpear, makeAxe, makeTorch, hsK: (o) => hsK(o),
  glint: (at, red, life) => cmbGlints.spawn(at, red, life),
  say: (who, t) => say(who, t), toast: (t) => toast(t), emit: (ev, e) => emit(ev, e), choose: (...a) => choose(...a),
  torchLit: () => torchOn, kids: () => kids, senaSafe: () => N.rest > 0 || !!N.indoor, aroDown: () => !!C.knock,
  knockdown: (from) => cmbKnock(from), downed: () => !!C.knock || P.downed > 0, maul: (o) => cmbMaulStart(o), mauling: () => !!C.maul,
  braced: (o) => cmbBraced(o), onBrace: (o) => cmbOnBrace(o), lie: (f) => { f.matFallT = 0; f.matStill = true; matLieStart(f, false); },
  blockPose: (f, w) => cmbBlockPose(f.h, w, f.wpn === 'axe' ? 'axe' : f.wpn === 'torch' ? 'torch' : f.wpn === 'spear' ? 'axe' : 'fists'), onBlocked: (f) => { trauma = Math.min(1, trauma + 0.12); W.recoil = 0.14; hitStop = 0.05; hsWho = null; },
  execute: (f) => cmbExecute(f), foeHitPre: (e) => cmbFoeHitPre(e),
  // the Ash People: grey wood-ash rubbed over the face, the chest and both hands to the elbow (GORE's paint layer has 4 slots)
  paint: (h, chief) => { if (typeof gorePatchHuman !== 'function') return false; try { gorePatchHuman(h, { paint: [{ bone: 'Head', r: chief ? 0.2 : 0.17 }, { bone: 'hand_l', r: 0.2 }, { bone: 'hand_r', r: 0.2 }, { bone: 'spine_03', r: chief ? 0.3 : 0.21 }] }); return true; } catch { return false; } },
  torchPose: (h, w) => { if (w > 0) applyPose(h, CMB_TORCHPOSE[h.who] ||= samplePose(h, 'torchHold', 0, BONESETS.armL), w, BONESETS.armL); },   // a raider's torch held up, not at his thigh
  readyPose: (h, w) => { if (w > 0) applyPose(h, CMB_READYPOSE[h.who] ||= samplePose(h, 'ready', 0), w, READY_BONES); },   // weapon up in a fight
  sfx: {},
};
const PRED = createPredators(cmbCtx);
const TRIBE = createTribe(cmbCtx);

// ----- sounds (procedural, routed to the Effects bus when MUS adds it)
function cmbSnd(kind, at = null, vol = 1) {
  if (!A.ctx) return;
  if (at) vol *= clamp(1 - Math.hypot(at.x - P.pos.x, at.z - P.pos.z) / 70, 0, 1);
  if (vol < 0.02) return;
  const c = A.ctx, out = A.sfx || A.out, t = c.currentTime;
  const nz = (type, f, q, dur, v, f1 = 0, off = 0) => {
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A.buf; fl.type = type; fl.frequency.setValueAtTime(f, t + off); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + off + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0, t + off); g.gain.linearRampToValueAtTime(v * vol, t + off + Math.min(0.03, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.001, t + off + dur);
    s.connect(fl).connect(g).connect(out); s.start(t + off, rand() * 1.5); s.stop(t + off + dur + 0.02);
  };
  const osc = (type, f0, f1, dur, v, off = 0, vib = 0) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t + off); o.frequency.exponentialRampToValueAtTime(f1, t + off + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.04; l.connect(lg).connect(o.frequency); l.start(t + off); l.stop(t + off + dur); }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(400, f0 * 6);
    g.gain.setValueAtTime(0, t + off); g.gain.linearRampToValueAtTime(v * vol, t + off + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + off + dur);
    o.connect(lp).connect(g).connect(out); o.start(t + off); o.stop(t + off + dur + 0.02);
  };
  switch (kind) {
    case 'clack': nz('bandpass', 1900, 3, 0.07, 0.55); nz('bandpass', 900, 2, 0.12, 0.35); osc('triangle', 520, 380, 0.09, 0.12); break;   // wood on bone/stone
    case 'parry': nz('bandpass', 2400, 4, 0.09, 0.6); osc('triangle', 880, 620, 0.25, 0.14); nz('lowpass', 300, 1, 0.2, 0.3); break;
    case 'whoosh': nz('bandpass', 900, 0.9, 0.22, 0.16, 400); break;
    case 'heavy': nz('bandpass', 600, 0.8, 0.35, 0.22, 260); break;
    case 'roll': nz('lowpass', 500, 0.7, 0.3, 0.25); nz('bandpass', 1400, 1, 0.15, 0.08, 0, 0.1); break;
    case 'thud': nz('lowpass', 220, 1, 0.3, 0.6); osc('sine', 90, 45, 0.3, 0.3); break;
    case 'roar': osc('sawtooth', 95, 70, 1.5, 0.22, 0, 7); osc('sawtooth', 142, 98, 1.3, 0.12, 0.05, 5); nz('lowpass', 700, 0.7, 1.4, 0.3, 300); break;
    case 'growl': osc('sawtooth', 70, 62, 0.9, 0.12, 0, 13); nz('lowpass', 380, 1.2, 0.8, 0.12); break;
    case 'snort': nz('bandpass', 700, 1.2, 0.35, 0.45, 300); nz('bandpass', 500, 1, 0.25, 0.3, 0, 0.45); break;
    case 'howl': osc('sine', 380, 520, 0.6, 0.12, 0, 5); osc('sine', 520, 330, 1.6, 0.12, 0.55, 5); break;
    case 'shout': osc('sawtooth', vol > 1 ? 120 : 165, 140, 0.45, 0.13, 0, 6); nz('bandpass', 1100, 1.5, 0.4, 0.12); break;
    case 'grunt': osc('sawtooth', 130, 95, 0.22, 0.1); nz('bandpass', 800, 1.2, 0.18, 0.08); break;
    case 'pain': osc('sawtooth', 210, 140, 0.3, 0.12, 0, 9); nz('bandpass', 1200, 1.5, 0.25, 0.1); break;
    case 'death': osc('sawtooth', 160, 70, 0.9, 0.12, 0, 5); nz('lowpass', 500, 0.8, 0.8, 0.12); break;
    case 'huh': osc('triangle', 190, 260, 0.25, 0.08); break;
    case 'fire': nz('bandpass', 2400, 0.6, 1.2, 0.18); nz('lowpass', 300, 0.6, 1.4, 0.25); break;
    case 'breath': nz('bandpass', 650, 1.2, 0.45, 0.06, 450); nz('bandpass', 900, 1.2, 0.35, 0.05, 600, 0.55); break;
    case 'stone': nz('bandpass', 1500, 2, 0.08, 0.35); break;
    case 'brace': nz('lowpass', 260, 1, 0.4, 0.7); nz('bandpass', 1800, 2, 0.08, 0.4); osc('sine', 70, 40, 0.4, 0.35); break;
  }
}
Object.assign(cmbCtx.sfx, {
  roar: (p, v = 1) => cmbSnd('roar', p, v), growl: (p, v = 0.7) => cmbSnd('growl', p, v), snort: (p) => cmbSnd('snort', p), howl: (p) => cmbSnd('howl', p, 1.2),
  shout: (p, chief) => cmbSnd('shout', p, chief ? 1.1 : 1), grunt: (p, heavy) => cmbSnd('grunt', p, heavy ? 1.2 : 0.8), whoosh: (p) => cmbSnd('whoosh', p, 0.8),
  clack: (p, big) => cmbSnd(big ? 'parry' : 'clack', p), pain: (p) => cmbSnd('pain', p, 0.8), death: (p) => cmbSnd('death', p), thud: (p) => cmbSnd('thud', p, 0.6),
  fire: (s) => cmbSnd('fire', _c3.set(s.x, 0, s.z)), huh: (p) => cmbSnd('huh', p),
});

// ----- tables onto the game (HP and LOOT live in the animals section; the extras are given after the butcher)
const CMB_LOOT = { alpha: [['pelt', 1]], aurochs: [['horn', 1]], bear: [['bearhide', 3], ['claws', 1]] };
RECIPES.push(
  { id: 'mantle', name: 'Wolf-pelt mantle', desc: 'The alpha\'s grey pelt over the shoulders. You lose warmth less than half as fast in the cold (replaces the fur cloak).', cost: { pelt: 1, fiber: 2 }, ch: 'hunt' },
  { id: 'bearcloak', name: 'Bear cloak', desc: 'The cave bear\'s hide. The warmest thing in the valley: the cold barely reaches you.', cost: { bearhide: 2, fiber: 3 }, ch: 'hunt' });
function cmbCloakK() { return S.tools.bearcloak ? 0.3 : S.tools.mantle ? 0.4 : S.tools.cloak ? 0.5 : 1; }   // updateStats chill

// ----- stamina
function cmbSpend(n) { S.stam = Math.max(0, S.stam - n); C.stamT = clock; C.stamAfter = S.stam; }
function cmbRegenOk() { return clock - C.stamT >= CB.STAM.delay; }
const cmbBlockable = () => (W.held === 'axe' || W.held === 'fists') && (W.st === 'drawn' || W.st === 'drawing') || (torchOn && W.held !== 'spear');
function cmbBlockWpn() { return W.held === 'axe' && W.st !== 'sheathed' ? 'axe' : torchOn ? 'torch' : 'fists'; }

// ----- the left click: combos, heavy, buffer (wpnPrimary hook; returns true when it handled the swing)
function cmbSwing(k) {
  if (P.stagger > 0 || C.knock || C.roll || C.fin) return true;
  if (C.block) cmbBlock(false);
  const heavy = C.heavyNext; C.heavyNext = false;
  if (S.stam < 3) { cmbSnd('breath'); return true; }                       // too spent to swing
  const flint = k === 'axe' ? !!S.tools.flintaxe : k === 'spear' ? !!S.tools.flintspear : false;
  const base = CB.WEAPON_DMG[flint ? 'flint' + k : k] ?? 2;
  let row;
  if (heavy) row = [...CB.HEAVY[k], 1.8];
  else { C.combo = clock - C.comboT < 1.05 ? (C.combo + 1) % 3 : 0; row = CB.COMBO[k][C.combo]; }
  const [clip, ts, cool, hit, reach, cone, mul] = row, sk = CB.swingK(S.stam);
  P.h.swing(clip, ts * sk); P.cool = cool / sk; hitT = hit / sk; hitReach = reach; hitCone = cone; hitKind = k;
  hitDmg = base * mul * (clock < C.counterUntil ? 1.5 : 1);
  C.swingHeavy = heavy; C.comboT = clock;
  if (clock < C.counterUntil) C.counterUntil = 0;
  if (k === 'spear') W.lunge = heavy ? 0.45 : 0.3;
  cmbStepIn(k, reach, cone, hitT);                   // GC-FIX5: close the gap during the wind-up
  W.sw = { k: k === 'fists' ? (clip === 'crossU' ? 'cross' : 'jab') : k, t: 0, dur: P.cool };
  cmbSpend(heavy ? CB.STAM.heavy : CB.STAM.light);
  cmbSnd(heavy ? 'heavy' : 'whoosh', null, heavy ? 1 : 0.7);
  return true;
}
// ----- GC-FIX5: the step in. The blade only reaches as far as it really does (COMBO reach), so a swing at something a
// little further off carries Aro forward during the wind-up: he closes to just inside the reach, and the blow lands
// when the blade is there. No step when the target is already in reach, or further than reach + STEP (a clean miss).
function cmbStepIn(k, reach, cone, t) {
  C.step = null;
  if (P.ride || P.swim || P.air || C.fin) return;
  const face = P.wantFace ?? P.face, fx = Math.sin(face), fz = Math.cos(face), max = CB.STEP[k] ?? 1;
  let bd = reach + max, bx = 0, bz = 0, who = null;
  for (const o of animals) {
    if (o.state !== 'live' || o.horse || Math.hypot(o.root.position.x - P.pos.x, o.root.position.z - P.pos.z) > 7) continue;
    const d = goreMeleeD(o, fx, fz, cone);
    if (d < bd) { bd = d; who = o; bx = _gbp.x; bz = _gbp.z; }
  }
  for (const f of foes) {
    if (!f.live || f.state !== 'live' || f.fled) continue;
    const dx = f.pos.x - P.pos.x, dz = f.pos.z - P.pos.z, d = Math.hypot(dx, dz), gap = Math.max(0, d - 0.3);
    if (gap < bd && (dx * fx + dz * fz) / (d || 1) > cone) { bd = gap; who = f; bx = f.pos.x; bz = f.pos.z; }
  }
  const dist = who ? CB.stepIn(bd, reach, max) : 0;
  if (!(dist > 0.04)) return;
  const dx = bx - P.pos.x, dz = bz - P.pos.z, l = Math.hypot(dx, dz) || 1, T = Math.max(0.12, t * 0.85);
  C.step = { who, x: dx / l, z: dz / l, left: dist, v: dist / T, stop: reach - CB.STEP.keep };
}
function cmbStepTick(dt) {                           // updatePlayer hook, just before the hit lands
  const s = C.step; if (!s) return;
  const o = s.who, alive = o.root ? o.state === 'live' : o.live && o.state === 'live';
  const gap = !alive ? 0 : o.root ? goreBodyGap(o, P.pos.x, P.pos.z).d : Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z) - 0.3;
  if (gap <= s.stop || P.stagger > 0 || C.knock || C.roll || P.downed > 0) { C.step = null; return; }   // it came to him, or he was hit out of it
  const m = Math.min(s.left, s.v * dt), nx = P.pos.x + s.x * m, nz = P.pos.z + s.z * m;
  if (Math.abs(nx) < LIMIT && Math.abs(nz) < LIMIT) { P.pos.x = nx; P.pos.z = nz; collide(P.pos, 0.35); }
  P.speed = Math.max(P.speed, Math.min(4.5, s.v));   // the legs carry the step (settle blends the stride in)
  if ((s.left -= m) <= 1e-4) C.step = null;
}
// mouse hooks: LMB press/release (light on release, heavy at 0.4 s held), RMB guard / brace
function cmbLmbDown() {
  if (placing || W.aim || W.st !== 'drawn' || !['axe', 'fists', 'spear'].includes(W.held) || P.ride || P.swim) return false;
  if (P.cool > 0) { if (P.cool <= CB.T.buffer) C.buf = clock; C.lmbAt = clock; C.heavyDone = false; C.lmbBuffered = true; return true; }
  C.lmbAt = clock; C.heavyDone = false; C.lmbBuffered = false; return true;
}
function cmbMouseUp(e) {
  if (e.button === 0) {
    if (C.lmbAt != null && !C.heavyDone) { if (P.cool > 0) C.buf = clock; else wpnPrimary(); }
    C.lmbAt = null; return false;
  }
  if (e.button === 2) {
    if (C.block) { cmbBlock(false); return true; }
    if (C.brace) { C.brace = false; W.rmb = false; wpnCancelAim(); return true; }   // a brace never turns into a throw
  }
  return false;
}
function cmbRmbDown() {
  if (placing || P.ride || P.swim || busy || C.knock || C.roll) return false;
  if (cmbBlockable()) { cmbBlock(true); return true; }
  return false;                                      // the spear: aim (and brace, see cmbUpdate)
}
function cmbBlock(on) {
  if (on && (C.knock || P.stagger > 0)) return false;
  if (on && !C.block) { C.blockAt = clock; C.blockWpn = cmbBlockWpn(); if (W.st === 'sheathed' && W.held !== 'fists' && !torchOn) { W.sel = 'fists'; wpnDraw(true); } }
  C.block = !!on; return C.block;
}
// The guard, built procedurally with the weapon IK (UAL2's Sword_Block is a wide outward parry: frozen mid-clip it
// read as open arms). Root space: +z forward, -x his right. Axe: the haft held up and across in front of the face,
// the left forearm braced behind it. Fists: both forearms up, chin behind them. Torch: the brand thrust out in the
// left fist, the right fist by the jaw. The chest turns a little side-on and curls behind the guard.
const GUARD = {
  axe: { r: [-0.2, 1.2, 0.36], rd: [0.55, 0.8, 0.22], l: [0.0, 1.5, 0.4], ld: [-0.2, 0.95, 0.2], yaw: -0.16 },
  fists: { r: [-0.17, 1.3, 0.3], rd: [0.12, 0.97, 0.2], l: [0.15, 1.36, 0.38], ld: [-0.12, 0.97, 0.2], yaw: 0.2 },
  torch: { r: [-0.17, 1.3, 0.26], rd: [0.12, 0.97, 0.2], l: [0.12, 1.3, 0.5], ld: [0.0, 0.9, 0.42], yaw: 0.3 },
};
const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3();
function cmbBlockPose(h, w, kind = 'axe') {
  if (!(w > 0)) return;
  const gp = GUARD[kind] || GUARD.fists, root = h.root;
  yawBone(h.bones.spine_02, gp.yaw * w);
  h.bones.spine_02.updateWorldMatrix(false, true);
  root.localToWorld(_g1.set(gp.r[0], gp.r[1], gp.r[2])); _g2.set(gp.rd[0], gp.rd[1], gp.rd[2]).normalize().transformDirection(root.matrixWorld);
  ikGrip(h, 'r', _g1, root.localToWorld(_g3.set(-0.7, 0.75, 0.0)), w, GRIP_R, AX_R, _g2);
  root.localToWorld(_g1.set(gp.l[0], gp.l[1], gp.l[2])); _g2.set(gp.ld[0], gp.ld[1], gp.ld[2]).normalize().transformDirection(root.matrixWorld);
  ikGrip(h, 'l', _g1, root.localToWorld(_g3.set(0.7, 0.75, 0.0)), w, GRIP_L, AX_L, _g2);
  h.gripR = Math.max(h.gripR, w); h.gripL = Math.max(h.gripL, kind === 'axe' ? 0.35 * w : w);
}
P.h.addOverride('cmbBlock', 32, (h) => cmbBlockPose(h, C.blockW, C.blockWpn));   // after the weapon IK (30) and the bow (31)

// ----- dodge roll (AltLeft)
function cmbDodge() {
  if (C.roll || C.knock || C.fin || busy || P.ride || P.swim || P.sit > 0 || P.rest > 0 || P.downed > 0 || P.stagger > 0) return false;
  if (S.stam < CB.STAM.dodge) { cmbSnd('breath'); toast('Too tired to roll'); return false; }
  if (C.block) cmbBlock(false);
  if (W.aim) wpnCancelAim();
  const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  let dx, dz;
  if (mx || mz) { const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); dx = fx * mz - fz * mx; dz = fz * mz + fx * mx; }
  else { dx = -Math.sin(P.face); dz = -Math.cos(P.face); }                  // idle: a roll backwards
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  C.roll = { t: 0, dx, dz, back: !(mx || mz) }; C.rollAt = clock;
  if (!C.roll.back) P.face = Math.atan2(dx, dz);
  P.h.swing('roll', 2.6); cmbSpend(CB.STAM.dodge); cmbSnd('roll');
  return true;
}
// updatePlayer hook: rolls, knockdowns, a guard break and finishers own Aro for their duration (input ignored)
function cmbPlayerTick(dt) {
  if (C.fin) { cmbFinTick(dt); P.speed = 0; P.vx = P.vz = 0; settle(P, dt * hsK(P), false); P.cool = Math.max(0, P.cool - dt); if (hitT > 0 && (hitT -= dt) <= 0) landHit(); return true; }
  if (C.roll) {
    const r = C.roll; r.t += dt;
    const k = clamp(r.t / CB.T.roll, 0, 1), v = (CB.T.rollDist / CB.T.roll) * 2.222 * (1 - k) * (1 - k * 0.3);   // the easing integrates to 0.45: 3.2 m in all
    const nx = P.pos.x + r.dx * v * dt, nz = P.pos.z + r.dz * v * dt;
    if (Math.abs(nx) < LIMIT && Math.abs(nz) < LIMIT) { P.pos.x = nx; P.pos.z = nz; }
    collide(P.pos, 0.35); P.vx = r.dx * v; P.vz = r.dz * v; P.speed = 0;
    settle(P, dt, false);
    if (r.t >= CB.T.roll) { C.roll = null; P.vx *= 0.4; P.vz *= 0.4; }
    return true;
  }
  if (P.stagger > 0) { P.stagger -= dt; P.speed = 0; P.vx = P.vz = 0; settle(P, dt, false); return true; }
  if (C.knock) { cmbKnockTick(dt); P.speed = 0; P.vx = P.vz = 0; settle(P, dt, false); return true; }
  return false;
}

// ----- knockdown: Hit_Knockback, 1.2 s on the ground (the bear may maul), then LayToIdle
const CMB_LIE = {};
function cmbKnock(from) {
  if (C.knock || P.downed > 0 || P.ride || P.swim) return;
  if (C.block) cmbBlock(false);
  if (W.aim) wpnCancelAim();
  C.roll = null; C.fin = null;
  const fp = matPos(from); if (fp) P.face = Math.atan2(fp.x - P.pos.x, fp.z - P.pos.z);
  C.knock = { t: 0, ph: 'fall', w: 0 };
  P.h.swing('knock', 1); trauma = Math.min(1, trauma + 0.6); cmbSnd('thud', null, 0.9);
  CMB_LIE[P.h.who] ||= samplePose(P.h, 'getUp', 0);
  P.h.addOverride('cmbLie', 11, (h) => { if (C.knock && C.knock.w > 0) applyPose(h, CMB_LIE[h.who], C.knock.w); });
}
function cmbKnockTick(dt) {
  const k = C.knock; k.t += dt;
  if (k.ph === 'fall') { k.w = clamp((k.t - 0.45) / 0.3, 0, 1); if (k.t > 0.8) { k.ph = 'down'; k.t = 0; } }
  else if (k.ph === 'down') { k.w = 1; if (k.t > CB.T.knockDown && !C.maul) { k.ph = 'up'; k.t = 0; P.h.swing('getUp', 1.35); } }
  else { k.w = clamp(1 - k.t / 0.18, 0, 1); if (k.t > 1.05) { C.knock = null; P.h.removeOverride('cmbLie'); } }
}
// the bear's maul: mash E 8 times in 2.5 s or take 30
function cmbMaulStart(o) {
  if (C.maul || !C.knock) return;
  C.knock.ph = 'down'; C.knock.t = 0; C.maul = { o, n: 0, t: CB.MAUL.time };
  cmbHint('<b>Mash E!</b> Push it off', true);
}
function cmbMaulTick(dt) {
  const m = C.maul; m.t -= dt;
  cmbHint(`<b>Mash E!</b> ${'●'.repeat(m.n)}${'○'.repeat(Math.max(0, CB.MAUL.need - m.n))}`, true);
  if (m.n >= CB.MAUL.need) {
    const o = m.o; C.maul = null; cmbHint('');
    if (o.state === 'live') {
      hurt(o, 8, { kind: 'pierce', weapon: 'spear', from: P, heavy: true }); o.stagger = 1.6;
      const dx = o.root.position.x - P.pos.x, dz = o.root.position.z - P.pos.z, d = Math.hypot(dx, dz) || 1; o.kb = { x: (dx / d) * 9, z: (dz / d) * 9, t: 0.25 };
    }
    say('Aro', 'Get off!'); trauma = Math.min(1, trauma + 0.5);
  } else if (m.t <= 0) {
    C.maul = null; cmbHint('');
    playerHurt({ dmg: CB.FOE_DMG.maul, kind: 'claw', from: m.o, red: true, sev: 3 });
    trauma = 1;
  }
}
// an on-screen hint line (Brace!, the maul) under the crosshair
const cmbHintEl = (() => { const d = document.createElement('div'); d.id = 'cmbhint'; d.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:6;font:600 15px/1.3 system-ui,sans-serif;color:#fff4dc;text-shadow:0 1px 3px #000,0 0 10px rgba(0,0,0,.6);letter-spacing:.04em;pointer-events:none;display:none;text-align:center'; document.body.appendChild(d); return d; })();
function cmbHint(html, urgent = false) {
  if (html === C.hint) return; C.hint = html;
  cmbHintEl.innerHTML = html; cmbHintEl.style.display = html ? 'block' : 'none'; cmbHintEl.style.color = urgent ? '#ffd2b8' : '#fff4dc';
}

// ----- the spear brace: RMB held with the spear while a charger comes on inside 6 m and the front 50° cone
function cmbChargers() { return animals.filter((o) => o.state === 'live' && (o.kind === 'bear' && (o.st === 'charge' || o.st === 'bluff' || o.st === 'windup') || o.kind === 'aurochs' && (o.st === 'charge' || o.st === 'paw'))); }
function cmbBraceCheck() {
  const ok = W.held === 'spear' && (W.st === 'drawn') && W.rmb && !C.knock && !P.ride;
  let near = false;
  if (ok) for (const o of cmbChargers()) { const dx = o.root.position.x - P.pos.x, dz = o.root.position.z - P.pos.z; if (Math.hypot(dx, dz) < 6 && CB.inFront(P.face, dx, dz, 50)) { near = true; break; } }
  if (near && !C.brace) { C.brace = true; cmbSnd('grunt', null, 0.8); }
  else if (!ok) C.brace = false;
  if (C.brace) { arcLine.visible = arcDots.visible = arcRing.visible = false; }
  return C.brace;
}
function cmbBraced(o) {
  if (!C.brace) return false;
  const dx = o.root.position.x - P.pos.x, dz = o.root.position.z - P.pos.z;
  return Math.hypot(dx, dz) < 2.6 && CB.inFront(P.face, dx, dz, 60);
}
function cmbOnBrace(o) {
  C.brace = false; W.rmb = false; wpnCancelAim();
  P.h.swing('jabU', 1.6);
  _c1.set(o.root.position.x, o.root.position.y + 0.9, o.root.position.z);
  hurt(o, CB.FOE_DMG.brace, { kind: 'pierce', weapon: 'spear', from: P, heavy: true, brace: true, point: _c1, dir: _c2.set(Math.sin(P.face), 0, Math.cos(P.face)) });
  if (o.state === 'live') { o.stagger = 2.2; o.st = o.kind === 'bear' ? o.st : 'stagger'; const d = 1 / (Math.hypot(o.root.position.x - P.pos.x, o.root.position.z - P.pos.z) || 1); o.kb = { x: (o.root.position.x - P.pos.x) * d * 5, z: (o.root.position.z - P.pos.z) * d * 5, t: 0.25 }; }
  cmbSnd('brace'); trauma = Math.min(1, trauma + 0.7); hitStop = 0.1; hsWho = o;
  cmbSlow(0.35, 0.3);
  toast(o.state === 'live' ? 'Braced! It is staggered: finish it (E)' : 'Braced!');
}

// ----- slow motion (frame dt × k while it lasts, real time)
function cmbSlow(k, t) { if (settings.finisherCam === false && k < 1 && t > 0.3) return; C.slowK = Math.min(C.slow > 0 ? C.slowK : 1, k); C.slow = Math.max(C.slow, t); }
function cmbTimeK(raw) { if (C.slow <= 0) return 1; C.slow -= raw; if (C.slow <= 0) { C.slowK = 1; return 1; } return C.slowK; }

// ----- incoming hits on Aro and Sena: retarget (Hardcore), dodge i-frames, parry, block (order 10, before MAT's dmgK)
on('playerHitPre', (e) => {
  const f = e.from;
  if (e.who === 'P' && f?.alpha && e.kind === 'bite') e.dmg = CB.FOE_DMG.alphaBite;
  // Hardcore: 30% of wolf bites go for Sena when she is within 3 m of the wolf
  if (e.who === 'P' && f?.kind === 'wolf' && D().senaFate === 'die' && !(N.downed > 0) && f.root && Math.hypot(N.pos.x - f.root.position.x, N.pos.z - f.root.position.z) < 3 && rand() < 0.3) {
    e.cancel = true; playerHurt({ who: 'N', dmg: e.dmg, kind: e.kind, from: f }); return;
  }
}, 5);
on('playerHitPre', (e) => {
  if (e.who !== 'P' || e.cancel || P.downed > 0) return;
  const fp = matPos(e.from);
  // dodge: i-frames 0.10-0.40 s; a perfect dodge (inside 0.15 s) slows time and opens a counter
  if (C.rollAt != null && C.roll) {
    const ds = CB.dodgeState(C.rollAt, clock);
    if (ds.iframe || ds.perfect && fp) {
      e.cancel = true; e.dodged = true;
      if (ds.perfect && !C.perfectAt) { C.perfectAt = clock; C.counterUntil = clock + CB.T.counter; cmbSlow(0.3, CB.T.perfectSlow); cmbSnd('whoosh', null, 1); }
      return;
    }
  }
  if (!C.block || e.red || !fp || e.kind === 'fall') return;
  const dx = fp.x - P.pos.x, dz = fp.z - P.pos.z;
  if (!CB.inFront(P.face, dx, dz, 120)) return;      // the guard covers the front 120°
  if (CB.isParry(C.blockAt, clock)) {                // parry: nothing gets through, the attacker reels
    e.cancel = true; e.parried = true; C.blockAt = null;
    const o = e.from;
    if (o) {
      o.stagger = Math.max(o.stagger || 0, 1.2); o.atk = null; o.pending = 0;
      if (CB.postureAdd(o, CB.POSTURE.parry, clock)) o.stagger = CB.POSTURE.stagger;
      if (o.kind === 'wolf' && o.root) { const d = Math.hypot(dx, dz) || 1; o.kb = { x: (dx / d) * 10, z: (dz / d) * 10, t: 0.25 }; o.flinch = 0.3; }
      if (o.foe) o.h.swing('stagger', 1.2);
    }
    cmbSlow(0.3, CB.T.parrySlow); cmbSnd('parry'); trauma = Math.min(1, trauma + 0.25); W.recoil = 0.16;
    emit('parry', { from: o });
    return;
  }
  const b = CB.blockHit(e.dmg, C.blockWpn, S.stam);   // block: most of it is stopped, the guard pays in stamina
  e.dmg = b.dmg; e.blocked = true; S.stam = b.stam; C.stamT = clock; C.stamAfter = S.stam;
  cmbSnd('clack'); trauma = Math.min(1, trauma + 0.15); W.recoil = 0.12;
  if (e.from && CB.postureAdd(e.from, CB.POSTURE.blocked, clock)) e.from.stagger = CB.POSTURE.stagger;
  if (b.broken) {                                    // guard break
    cmbBlock(false); P.stagger = CB.T.guardBreak; P.h.swing('stagger', 1.1); toast('Guard broken'); cmbSnd('clack', null, 1.2);
  }
}, 10);
// after a hit lands: reactions, knockdown, Sena's state
on('playerHit', (e) => {
  if (e.who === 'N') { cmbSenaHit(e); return; }
  if (P.downed > 0 || e.downed) return;
  C.lastHurtT = clock;
  if ((e.kind === 'gore' || e.kind === 'claw') && e.dmg > 0) { cmbKnock(e.from); return; }
  if (e.dmg >= 6 && !C.knock && !C.roll && !(P.stagger > 0)) { P.h.swing(rand() < 0.5 ? 'hitChest' : 'hitHead', 1.25); trauma = Math.min(1, trauma + Math.min(0.5, e.dmg / 30)); }
}, 65);
on('downed', (e) => { if (e.who === 'P') { C.knock = null; C.maul = null; C.roll = null; C.fin = null; cmbBlock(false); P.h.removeOverride('cmbLie'); cmbHint(''); } }, 30);
on('rescued', () => { C.knock = null; C.maul = null; P.stagger = 0; P.h.removeOverride('cmbLie'); cmbHint(''); for (const f of foes) if (f.live && f.mode === 'combat') TRIBE.flee(f); }, 30);

// ----- outgoing hits: heavy flag, counter bonus, posture (animalHitPre order 30) and raider hits
function cmbHitPre(e) {
  const o = e.o, mine = e.from === P, melee = mine && e.weapon && e.weapon !== 'thrown';
  const real = melee ? (e.kind === 'finisher' || C.swingHeavy || (e.heavy && e.weapon !== 'axe')) : !!e.heavy;   // MAT marks every axe blow heavy (for GORE); posture wants the held swing
  if (melee) e.heavy = e.heavy || C.swingHeavy;
  if (!mine || e.kind === 'finisher' || e.kind === 'bleed') return;
  if (e.arrow) cmbArrowPre(e);                       // BOW: thick hides, head shots
  if (o.kind === 'deer' || o.kind === 'stag' || o.kind === 'fox' || o.horse || o.tame) return;   // prey: no posture game
  // posture: a light blow 16, a held heavy 32, a thrown spear 40, an arrow by its bite (8-40)
  const add = e.arrow ? clamp(e.dmg * 1.6, 8, 40) : e.weapon === 'thrown' ? 40 : CB.POSTURE.light * (real ? CB.POSTURE.heavyK : 1);
  if (e.arrow && e.zone === 'head' && o.kind === 'wolf') o.stagger = Math.max(o.stagger || 0, 0.9);   // an arrow in the face stops a wolf mid-lunge
  if (e.arrow || e.weapon === 'thrown' || real) { if (o.pending > 0) o.pending = 0; }   // a hard hit breaks the lunge
  if (CB.postureAdd(o, add, clock)) { o.stagger = CB.POSTURE.stagger; if (!o.foe) { o.pending = 0; o.attacking = 0; } cmbSnd('clack', o.root?.position, 1.2); }
}
// BOW against predators (spec_bow §4: a wolf takes two full-draw body shots, a bear takes many; head or neck doubles).
// GORE (order 20) has already applied ×1.5 for a predator's head; this brings it to ×2 and applies the hide factor.
const CMB_ARROW_K = { wolf: 0.75, bear: 0.6, aurochs: 0.7 };
function cmbArrowPre(e) {
  const o = e.o, k = CMB_ARROW_K[o.kind]; if (!k) return;
  e.dmg *= k * (e.zone === 'head' ? 2 / 1.5 : 1);
}
on('animalHitPre', cmbHitPre, 30);
function cmbFoeHitPre(e) {
  if (e.from === P && clock < C.counterUntil && e.kind !== 'finisher') { e.dmg *= 1.5; C.counterUntil = 0; }
  const melee = e.from === P && e.weapon && e.weapon !== 'thrown' && e.weapon !== 'stone';
  if (melee) { e.real = e.kind === 'finisher' || e.kind === 'execution' || C.swingHeavy || (e.heavy && e.weapon !== 'axe'); e.heavy = e.heavy || C.swingHeavy; }   // e.real: a held heavy (MAT marks every axe blow heavy for GORE)
  else e.real = !!e.heavy;
  if (e.from === P && e.arrow) {                     // BOW: the head doubles; a man who has not seen you takes half again
    const f = e.f; f.h.bones.Head.getWorldPosition(_c3);
    e.head = e.point.y > _c3.y - 0.13; if (e.head) { e.dmg *= 2; e.zone = 'head'; }
    e.unaware = f.mode !== 'combat' && f.mode !== 'downed' && f.mode !== 'flee'; if (e.unaware) e.dmg *= 1.5;
  }
}
on('animalHit', (e) => { if (e.o?.kind === 'aurochs') PRED.aurochsHit(e); if (e.o?.kind === 'wolf' && !e.kill && e.o.pack?.alpha && e.o.pack.alpha.state === 'live') e.o.go = Math.max(e.o.go || 0, 2); }, 60);
on('animalDie', (e) => { const o = e.o; if (o.kind === 'wolf') PRED.wolfDied(o); if (o.kind === 'bear') PRED.bearDied(o); if (o === C.fin?.o) C.fin.done = true; }, 60);
// melee reach and the thrown spear also find raiders (landHit / spearStep hooks)
function cmbFoeInReach(best, bd, fx, fz) {
  for (const f of foes) {
    if (!f.live || f.state !== 'live' || f.fled) continue;
    const dx = f.pos.x - P.pos.x, dz = f.pos.z - P.pos.z, d = Math.hypot(dx, dz), gap = Math.max(0, d - 0.3);   // GC-FIX5: to his body, like the animals
    if (gap < bd && (dx * fx + dz * fz) / (d || 1) > hitCone) { bd = gap; best = f; }
  }
  return best;
}
function cmbSpearFoe(tip) {
  for (const f of foes) {
    if (!f.live || f.state !== 'live' || f.fled) continue;
    const p = f.pos; if (Math.hypot(p.x - tip.x, p.z - tip.z) < 0.55 && tip.y > p.y + 0.2 && tip.y < p.y + 1.95) return f;
  }
  return null;
}

// ----- wolves: telegraphs, stagger, the alpha's pack (wolfBrain hook, after the fire/torch circling)
function cmbWolf(o, dist, dx, dz, dt) {
  if (o.pending > 0 && !o.cmbGl) { o.cmbGl = true; cmbGlints.spawn(cmbJaw(o), false, o.pending + 0.1); }
  if (!(o.pending > 0)) o.cmbGl = false;
  const r = PRED.wolf(o, dist, dx, dz, dt);
  return r;
}
const cmbJaw = (o) => () => { const b = o.a.bone?.('Head'); if (b) return b.getWorldPosition(_c3); const p = o.root.position, f = o.root.rotation.y; return _c3.set(p.x + Math.sin(f) * 0.6, p.y + 0.55, p.z + Math.cos(f) * 0.6); };

// ----- finishers
function cmbFinishable(o) {
  if (!o) return false;
  if (o.foe) return o.live && o.state === 'live' && (o.stagger > 0 || (o.mode !== 'combat' && o.mode !== 'downed' && P.sneak && !CB.inFront(o.face, P.pos.x - o.pos.x, P.pos.z - o.pos.z, 200)));
  return o.state === 'live' && o.stagger > 0 && !o.horse && !o.tame && (o.kind === 'wolf' || o.hostile || o.kind === 'aurochs' || o.kind === 'bear');
}
function cmbFinish(o) {
  if (C.fin || !cmbFinishable(o)) return;
  if (W.held !== 'axe' && W.held !== 'spear' && !o.foe) return;   // fists finish only people
  if (C.block) cmbBlock(false);
  if (W.aim) wpnCancelAim();
  const k = W.st === 'drawn' ? W.held : 'fists', fx = Math.sin(P.face), fz = Math.cos(P.face);
  // the victim is pulled into place in front of Aro, facing him
  const op = o.foe ? o.pos : o.root.position;
  const dx = op.x - P.pos.x, dz = op.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
  P.face = Math.atan2(dx / l, dz / l);
  const px = P.pos.x + Math.sin(P.face) * 0.95, pz = P.pos.z + Math.cos(P.face) * 0.95;
  if (o.foe) { o.pos.set(px, o.pos.y, pz); o.face = P.face + Math.PI; o.stagger = 9; o.atk = null; }
  else { o.root.position.set(px, getHeight(px, pz), pz); o.root.rotation.y = o.dir = P.face + Math.PI; o.stagger = 9; o.pending = 0; }
  const moves = { spear: [['jabU', 0.95]], axe: [['swordC', 1.25]], fists: [['hookU', 1.2], ['crossU', 1.6]] }[k];
  P.h.swing(moves[0][0], moves[0][1]);
  C.fin = { o, k, t: 0, impact: k === 'axe' ? 0.5 : k === 'spear' ? 0.32 : 0.28, second: moves[1] || null, dur: k === 'fists' ? 1.25 : 1.05, hit: false, done: false, cam: null };
  if (settings.finisherCam !== false && view !== 'fpp') {
    const sx = Math.cos(P.face), sz = -Math.sin(P.face), mx = (P.pos.x + px) / 2, mz = (P.pos.z + pz) / 2, gy = getHeight(mx, mz);
    const side = rand() < 0.5 ? 1 : -1;
    C.fin.cam = { pos: new THREE.Vector3(mx + sx * 2.2 * side - fx * 0.4, gy + 1.25, mz + sz * 2.2 * side - fz * 0.4), look: new THREE.Vector3(mx, gy + 0.95, mz), t: C.fin.dur + 0.2, snap: undefined, cmb: true };
    camShot = C.fin.cam; camera.fov = 45; camera.updateProjectionMatrix();
    cmbSlow(CB.T.finisherK, CB.T.finisherSlow);
  }
  cmbSnd(k === 'axe' ? 'heavy' : 'whoosh');
}
function cmbFinTick(dt) {
  const F = C.fin; F.t += dt;
  const o = F.o, op = o.foe ? o.pos : o.root.position;
  if (o.foe) o.face = P.face + Math.PI; else o.root.rotation.y = P.face + Math.PI;
  if (F.second && F.t > 0.42) { P.h.swing(F.second[0], F.second[1]); F.second = null; }
  if (!F.hit && F.t >= F.impact) {
    F.hit = true;
    _c1.set(op.x, op.y + (o.foe ? 1.45 : 0.75), op.z); _c2.set(Math.sin(P.face), -0.2, Math.cos(P.face)).normalize();
    const weapon = F.k === 'axe' ? 'axe' : F.k === 'spear' ? 'spear' : 'fists';
    o.stagger = 0;
    if (o.foe) { o.stagger = 0; TRIBE.hurtFoe(o, 999, { kind: 'finisher', zone: 'neck', weapon, heavy: true, from: P, point: _c1, dir: _c2 }); }
    else hurt(o, 999, { kind: 'finisher', zone: 'neck', weapon, heavy: true, from: P, point: _c1, dir: _c2 });
    hitStop = 0.12; hsWho = o; trauma = Math.min(1, trauma + 0.8); W.recoil = 0.2;
    A.hit(170, 0.2, 0.6); A.hit(1300, 0.05, 0.25);
    // Gore Low: the camera looks away to the sky at the moment of impact
    if (settings.gore === 'low') {
      if (F.cam && camShot === F.cam) { F.cam.look.set(F.cam.pos.x - Math.sin(P.face) * 2, F.cam.pos.y + 9, F.cam.pos.z - Math.cos(P.face) * 2); F.cam.snap = undefined; }
      else goreLookAway();                           // GORE-FIX: no finisher camera / first person: a dip to black instead
    }
    emit('finisher', { o, weapon });
  }
  if (F.t >= F.dur) {
    if (F.cam && camShot === F.cam) camShot = null;
    C.fin = null;
  }
}
// surrender, Kill him: the same finisher with whatever is in hand, quick, no camera and no slow motion
function cmbExecute(f) { f.mode = 'combat'; f.h.pose = null; f.stagger = 9; if (C.block) cmbBlock(false); if (W.aim) wpnCancelAim(); cmbFinishForce(f); }
function cmbFinishForce(f) {
  const k = W.st === 'drawn' || W.st === 'drawing' ? W.held : 'fists';
  const dx = f.pos.x - P.pos.x, dz = f.pos.z - P.pos.z; P.face = Math.atan2(dx, dz);
  const moves = { spear: ['jabU', 0.95], axe: ['swordC', 1.25], fists: ['hookU', 1.2] }[k] || ['hookU', 1.2];
  P.h.swing(moves[0], moves[1]);
  C.fin = { o: f, k, t: 0, impact: k === 'axe' ? 0.5 : 0.3, second: null, dur: 0.95, hit: false, cam: null };
}

// ----- findTarget hook (spec §5.5 position 3): revive Sena, decide a surrender, finish
function cmbTarget(p) {
  if (C.fin || C.knock) return null;
  if (N.downed > 0 && !MAT.endT && Math.hypot(N.pos.x - p.x, N.pos.z - p.z) < 2.4) {
    const item = ['ypoultice', 'poultice'].find((k) => S.inv[k] > 0);
    return { label: `Revive Sena (hold E)${item ? ` · uses a ${ITEMS[item].toLowerCase().replace(/s$/, '')}` : ''}`, key: true, act() {
      C.revSite ||= { x: N.pos.x, z: N.pos.z, rise: 0 }; C.revSite.x = N.pos.x; C.revSite.z = N.pos.z; P.work = 0.5; P.workSite = C.revSite;
    } };
  }
  let best = null, bd = 2.6;
  for (const f of foes) {
    if (f.mode === 'downed' && f.live && !f.deciding) { const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (d < 2.6) return { label: `Decide: ${f.name}`, key: true, act() { TRIBE.decide(f); } }; }
    if (cmbFinishable(f)) { const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (d < bd) { bd = d; best = f; } }
  }
  if (W.held === 'axe' || W.held === 'spear') for (const o of animals) if (cmbFinishable(o)) { const d = Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z); if (d < bd) { bd = d; best = o; } }
  if (best) return { label: 'Finish', key: true, act() { cmbFinish(best); } };
  return null;
}

// ----- Sena: health, her stones in a fight, downed, revived, her fate by difficulty
const cmbSenaBar = CB.makeBar(0.62, 0.075); scene.add(cmbSenaBar);
// posture bars over predators in a fight (raiders draw their own in tribe.js): a pool of 4, shown while posture > 0
const cmbPBars = Array.from({ length: 4 }, () => { const b = CB.makeBar(0.7, 0.07); scene.add(b); return b; });
function cmbPostureBars(dt) {
  let i = 0;
  for (const o of animals) {
    if (o.posture > 0) CB.postureTick(o, dt, clock);   // regen 15/s after 2 s without a hit
    if (i >= cmbPBars.length || !(o.posture > 1) || o.state !== 'live' || o.horse || o.tame) continue;
    const p = o.root.position; if (Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > 25) continue;
    const b = cmbPBars[i++], hgt = o.kind === 'bear' ? 2.0 : o.kind === 'aurochs' ? (o.calf ? 1.1 : 2.0) : 1.15 * (o.root.scale.x || 1);
    b.visible = true; b.position.set(p.x, p.y + hgt, p.z); b.userData.set(o.posture / 100, o.posture > 75 ? '#ffcf4a' : '#e8e2d2');
  }
  for (; i < cmbPBars.length; i++) cmbPBars[i].visible = false;
}
const cmbStones = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 1 })); m.visible = false; m.castShadow = true; scene.add(m); return { m, t: 0, T: 0, o: null, a: new THREE.Vector3(), b: new THREE.Vector3() }; });
function cmbSenaHit(e) {
  if (!(e.dmg > 0)) return;
  C.nHurtT = clock;
  if (S.nhp <= 0 && !(N.downed > 0)) { cmbSenaDown(e); return; }
  if (e.dmg >= 5 && !(N.downed > 0)) { N.h.swing(rand() < 0.5 ? 'hitChest' : 'hitHead', 1.25); if (rand() < 0.35) say('Sena', rand() < 0.5 ? 'Aro!' : 'I am all right. Keep going!'); }
}
function cmbSenaDown(e) {
  N.downed = 60; S.nhp = 0; N.speed = 0; N.node = null; N.act = 0; N.fetch = null; N.sit = 0; N.dance = 0;
  if (N.ride) { N.ride = false; N.seat = null; N.h.straddle = false; }
  N.h.pose = null; N.matUp = 0; matLieStart(N, false);
  say('Aro', rand() < 0.5 ? 'Sena! No!' : 'Sena! Stay down, I am coming!');
  toast(D().senaFate === 'die' && settings.matureStory !== false ? 'Sena is down. Reach her in time (hold E beside her).' : 'Sena is down. Hold E beside her to help her up.');
  emit('downed', { who: 'N', cause: matCause('', e) });
}
function cmbSenaRevive(by, item = null) {
  N.downed = 0; S.nhp = item ? 50 : by === 'P' ? 30 : 25; N.matUp = 1.1; N.matW = 1;
  if (item) { S.inv[item]--; drawInv(); }
  if (N.h.has('getUp')) N.h.swing('getUp', 1.35);
  if (by === 'P') { say('Sena', rand() < 0.5 ? 'I am here. I am still here.' : 'You came back for me.'); addClose(2, 'you reached her in time'); }
  else { say('Sena', 'I… I can stand. Do not look at me like that.'); if (D().senaFate === 'recover') addClose(-5, 'you were not there'); }
  emit('revived', { who: 'N', by, item });
}
// updateSena hook: downed (lying, timer, Aro's revive), fighting (stay close, throw stones), regen out of combat
function cmbSena(dt) {
  if (N.matUp > 0) { N.matUp -= dt; if (N.matUp <= 0) { N.matUp = 0; N.matW = 0; N.h.removeOverride('matLie'); } }
  if (N.downed > 0) {
    N.matFallT = (N.matFallT || 0) + dt; N.speed = 0;
    if (!(P.work > 0 && P.workSite === C.revSite)) N.downed -= dt;
    settle(N, dt, false);
    if (N.downed <= 0) {
      if (D().senaFate === 'die' && settings.matureStory !== false && !MAT.dead) { N.downed = 0.001; if (!endRun('sena')) cmbSenaRevive('self'); }
      else cmbSenaRevive('self');
    }
    return true;
  }
  if (S.nhp < 100 && clock - (C.nHurtT || -99) > 8 && !hostileNear(30)) S.nhp = Math.min(100, S.nhp + dt * 0.6);
  // in a fight she keeps near Aro and throws (stones, or her old spear once he has flint)
  const fight = !N.ride && !(N.rest > 0) && !(N.sit > 0) && !busy && (foes.some((f) => f.live && f.mode === 'combat' && Math.hypot(f.pos.x - N.pos.x, f.pos.z - N.pos.z) < 30) || animals.some((o) => o.state === 'live' && (o.kind === 'wolf' && !o.leave || o.kind === 'bear' && o.st !== 'forage' && o.st !== 'calm') && Math.hypot(o.root.position.x - N.pos.x, o.root.position.z - N.pos.z) < 18));
  if (!fight) return false;
  N.node = null; N.act = 0;
  const dP = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  if (dP > 5) walkTo(N, P.pos.x - Math.sin(P.face) * 2.2, P.pos.z - Math.cos(P.face) * 2.2, dP > 12 ? 6.4 : 3.6, dt, 0.6); else N.speed = 0;
  C.nThrowT -= dt;
  const tgt = cmbNearestFoe(N.pos, 12);
  if (tgt) {
    const tp = tgt.foe ? tgt.pos : tgt.root.position;
    if (N.speed < 0.5) N.face = turn(N.face, Math.atan2(tp.x - N.pos.x, tp.z - N.pos.z), Math.min(1, dt * 6));
    if (C.nThrowT <= 0) { C.nThrowT = 3; N.h.swing(N.h.has('overU') ? 'overU' : 'throwU', 1.35); C.nThrowQ = { t: 0.42, o: tgt }; }
  }
  if (C.nThrowQ && (C.nThrowQ.t -= dt) <= 0) { cmbSenaThrow(C.nThrowQ.o); C.nThrowQ = null; }
  settle(N, dt, false);
  return true;
}
function cmbNearestFoe(p, r) {
  let best = null, bd = r;
  for (const f of foes) if (f.live && f.state === 'live' && !f.fled && f.mode !== 'downed') { const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z); if (d < bd) { bd = d; best = f; } }
  for (const o of animals) if (o.state === 'live' && (o.kind === 'wolf' || o.hostile) && !o.leave && !o.horse) { const d = Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z); if (d < bd) { bd = d; best = o; } }
  return best;
}
function cmbSenaThrow(o) {
  const s = cmbStones.find((x) => !x.m.visible); if (!s || !o) return;
  N.h.bones.hand_r.getWorldPosition(s.a);
  const tp = o.foe ? o.pos : o.root.position; s.b.set(tp.x, tp.y + (o.foe ? 1.2 : 0.6), tp.z);
  s.o = o; s.t = 0; s.T = Math.max(0.25, s.a.distanceTo(s.b) / 16); s.m.visible = true; cmbSnd('whoosh', N.pos, 0.5);
}
function cmbStonesTick(dt) {
  for (const s of cmbStones) {
    if (!s.m.visible) continue;
    s.t += dt; const k = Math.min(1, s.t / s.T);
    s.m.position.lerpVectors(s.a, s.b, k); s.m.position.y += Math.sin(k * Math.PI) * s.T * 1.6; s.m.rotation.x += dt * 14;
    if (k >= 1) {
      s.m.visible = false; const o = s.o;
      if (o && (o.foe ? o.state === 'live' : o.state === 'live')) {
        _c2.copy(s.b).sub(s.a).setY(0).normalize();
        if (o.foe) TRIBE.hurtFoe(o, CB.FOE_DMG.senaThrow, { kind: 'blunt', weapon: 'stone', from: N, point: s.b, dir: _c2 });
        else hurt(o, CB.FOE_DMG.senaThrow, { kind: 'blunt', weapon: 'stone', from: N, point: s.b, dir: _c2 });
        cmbSnd('stone', s.b);
      }
    }
  }
}

// ----- the frame (after the animals): AI, glints, brace, buffer and heavy timing, stamina gate, Sena, loot extras
function cmbUpdate(dt) {
  if (!playing) return;
  if (!C.init) { C.init = true; cmbHintEl.style.display = 'none'; }
  PRED.tick(dt);
  TRIBE.updateFoes(dt);
  cmbGlints.update(dt, settings.reduceFlash);
  cmbStonesTick(dt);
  if (C.maul) cmbMaulTick(dt);
  // the guard: weight, facing the camera, needs the weapon still in hand
  if (C.block && (!cmbBlockable() || P.ride || P.swim || P.downed > 0 || busy)) cmbBlock(false);
  C.blockW += ((C.block ? 1 : 0) - C.blockW) * Math.min(1, dt * 14);
  if (C.block && view !== 'fpp') P.face = turn(P.face, camFace(), Math.min(1, dt * 14));
  if (C.block) { P.h.gripR = Math.max(P.h.gripR, 1); }
  // heavy (held 0.4 s) and the click buffer
  if (C.lmbAt != null && !C.heavyDone && clock - C.lmbAt >= CB.T.heavyHold && P.cool <= 0 && W.st === 'drawn') { C.heavyDone = true; C.heavyNext = true; wpnPrimary(); C.lmbAt = null; C.buf = 0; }
  if (C.buf && P.cool <= 0 && C.lmbAt == null) { const b = C.buf; C.buf = 0; if (clock - b < 0.5 && W.st === 'drawn') wpnPrimary(); }
  // stamina: no regen for 0.8 s after spending; below 20% the breathing gets heavy
  if (!cmbRegenOk() && S.stam > C.stamAfter) S.stam = C.stamAfter;
  if (S.stam < CB.STAM.low && (C.breathT -= dt) <= 0) { C.breathT = 1.15; cmbSnd('breath', null, 0.8); }
  // brace prompt
  const br = cmbBraceCheck();
  cmbHint(C.maul ? C.hint : br ? '<b>Brace!</b> hold right mouse' : '', !!C.maul);
  if (C.roll && C.rollAt != null && clock - C.rollAt > CB.T.roll + 0.1) C.perfectAt = 0;
  // revive Sena: progress while Aro kneels beside her
  if (N.downed > 0 && P.work > 0 && P.workSite === C.revSite) {
    const item = ['ypoultice', 'poultice'].find((k) => S.inv[k] > 0);
    C.revive += dt;
    if (C.revive >= (item ? 1.2 : 2)) { C.revive = 0; P.work = 0; P.workSite = null; cmbSenaRevive('P', item); }
  } else C.revive = 0;
  cmbPostureBars(dt);
  // Sena's health bar over her head when hurt
  const cineNow = MAT.endT > 0 || MAT.dead || $('hud').classList.contains('cine');   // MAT-SV: no overhead bars over the death beat or a cinematic
  if (cineNow) { for (const b of cmbPBars) b.visible = false; for (const f of foes) { if (f.meter) f.meter.visible = false; if (f.pbar) f.pbar.visible = false; } }
  const showN = (S.nhp < 99.5 || N.downed > 0) && !(N.rest > 0) && D().senaFate !== 'never' && !cineNow;
  cmbSenaBar.visible = showN;
  if (showN) { N.h.bones.Head.getWorldPosition(_c1); cmbSenaBar.position.set(_c1.x, _c1.y + 0.42, _c1.z); cmbSenaBar.userData.set(N.downed > 0 ? clamp(N.downed / 60, 0, 1) : S.nhp / 100, N.downed > 0 ? '#e0281c' : '#e8d8b8'); }
  // loot extras after the butcher (pelt, horn, bear hide and claws); the bear never comes back
  for (const o of animals) {
    if (!o.looted) { o.cmbLoot = false; continue; }
    if (o.cmbLoot) continue; o.cmbLoot = true;
    const L = CMB_LOOT[o.alpha ? 'alpha' : o.kind]; if (!L) continue;
    for (const [k, n] of L) give(k, n);
    toast(o.alpha ? 'The alpha\'s pelt: a mantle against the cold (Tab)' : o.kind === 'bear' ? 'Bear hide and claws' : 'An aurochs horn');
    if (o.kind === 'bear') setTimeout(() => remove(o), 0);
  }
}
// spawn helper for tests and the story: kinds bear, aurochs, alpha (+ pack), wolf, raider, korr
function cmbSpawn(kind, x, z, opts = {}) {
  if (kind === 'bear') { if (PRED.R.bear?.state === 'live') remove(PRED.R.bear); PRED.R.bear = null; const L = PRED.bearDen(); if (L.state === 'dead') L.state = 'alive'; if (!opts.keepHp) L.hp = null; return PRED.spawnBear(x, z); }
  if (kind === 'aurochs') { if (PRED.R.aur) { for (const o of PRED.R.aur.members) remove(o); PRED.R.aur = null; } return PRED.spawnAurochs(x, z).members[0]; }
  if (kind === 'alpha' || kind === 'pack') {
    const n = opts.n ?? 3, list = [];
    for (let i = 0; i < n; i++) list.push(spawn('wolf', x + (rand() - 0.5) * 4, z + (rand() - 0.5) * 4));
    const pk = PRED.pack(list); if (pk && !pk.alpha) pk.alpha = PRED.makeAlpha(list[0]);
    return list[0];
  }
  if (kind === 'raider' || kind === 'korr') return TRIBE.spawnRaider(x, z, { ...opts, chief: kind === 'korr' || opts.chief });
  return spawn(kind, x, z, opts);
}
const cmbG = {                                       // CMB test hooks; published as G.cmb after window.G exists (end of file)
  block: (on) => cmbBlock(on), dodge: () => cmbDodge(), heavy: () => { C.heavyNext = true; wpnPrimary(); return C.swingHeavy; },
  posture: (o) => o?.posture || 0, state: (o) => (o?.foe ? o.mode : o?.st || o?.state), spawn: cmbSpawn, brace: () => !!C.brace, stam: () => S.stam,
  glints: () => cmbGlints.total, glintsActive: () => cmbGlints.active(), C, knock: (from) => cmbKnock(from), finish: (o) => cmbFinish(o),
  maul: () => C.maul && { n: C.maul.n, t: C.maul.t }, mash: () => { if (C.maul) C.maul.n++; }, senaDown: () => N.downed || 0, senaHp: () => S.nhp,
  reviveSena: () => cmbSenaRevive('P'), decide: (f) => TRIBE.decide(f), pred: PRED, tribe: TRIBE, cloakK: cmbCloakK, finishable: (o) => cmbFinishable(o),
  slow: () => (C.slow > 0 ? C.slowK : 1), timeK: () => C.slowK, settings: () => settings, duel: (x, z, o) => cmbDuel(x, z, o),
  remove: (o) => remove(o), camShot: () => camShot, targets: () => ({ ...TRIBE.stats }),
};
// module-level API for ARC (spec §7 M4 task 12: spawnRaider(x, z, opts) -> foe, foes[], updateFoes(dt), clearFoes())
function spawnRaider(x, z, opts = {}) { return settings.matureStory === false ? null : TRIBE.spawnRaider(x, z, opts); }   // Mature story Off: no raiders (§5.6)
function updateFoes(dt) { TRIBE.updateFoes(dt); }
function clearFoes() { TRIBE.clearFoes(); }
// a fight to the end with one raider (ARC's Korr duel): resolves 'dead' | 'downed' | 'fled' | 'spared' | 'lost' (Aro down)
function cmbDuel(x, z, opts = {}) {
  const f = spawnRaider(x, z, { mode: 'combat', ...opts });
  if (!f) return Promise.resolve('none');
  return new Promise((res) => {
    const iv = setInterval(() => {
      if (!playing) return;
      const r = f.state === 'dead' ? 'dead' : f.spared ? 'spared' : f.fled ? 'fled' : f.mode === 'downed' && !f.surrender ? 'downed' : P.downed > 0 || MAT.dead ? 'lost' : null;
      if (r) { clearInterval(iv); res(r); }
    }, 250);
  });
}
const cmbHooks = (G) => Object.assign(G, { cmb: cmbG, spawnRaider, clearFoes, updateFoes, cmbDuel });   // called after window.G is created
// keydown hook: Alt dodge, E mash in the maul
function cmbKey(e) {
  if (!playing || paused) return false;
  if (e.code === 'AltLeft') { e.preventDefault(); if (!e.repeat) cmbDodge(); return true; }
  if (e.code === 'KeyE' && C.maul) { if (!e.repeat) C.maul.n++; return true; }
  return false;
}

// ---------- ARC ----------
// M5 mature story (spec_mature.md §7 M5, phase B). 19 chapters in 4 seasonal acts (CH above, goals via goalsOf), choices
// with delayed consequences (arcChoose: approve, mercy, memory, recap), the Ash People, Tamu, Wena and Pell, the winter,
// a narrated raid, the fever, the reckoning, the handfasting, the epilogue variants and the seasons (autumn leaves,
// winter snow). Lines live in src/arc_data.js. Phase C wires the CMB raid fight, SURV herb fields and ROM scenes: every
// cross-package call is typeof-guarded so this section works alone.
// GUARDRAILS (the full block is at the top of arc_data.js): children are never harmed, targeted or shown in danger (Pell
// is hidden indoors whenever anything hostile is near and for the whole raid); romance is non-explicit and obeys
// settings.romance; a surrendered human dies only by an explicit, non-default choice, and quickly (a cut, not a show).
// Every arcEnter() is idempotent (it also runs on load); arcSync() rebuilds the props and NPCs from S.arc.
Object.assign(VIGNETTES, ARCD.VIGNETTES);
R_OF.brazier = 0.5;
const ARCS = { npcs: [], props: {}, ch: -1, t: 0, slow: 0, boot: false, scene: null, holdUntil: 0, defs: {}, waits: [], spots: {}, q: '',
  season: { a: 0, w: 0, snap: true, mats: null }, uSnow: { value: 0 }, uAutumn: { value: 0 }, snow: null, raidOn: false, vigil: false, shot: null, herdCut: false, frozen: false };
const ARC_HERB = {
  willow: { n: 2, label: 'Strip willow bark (2)', give: 'Brew willow bark for Sena (fever −30)', where: 'by the river' },
  yarrow: { n: 2, label: 'Pick yarrow (2)', give: 'Press yarrow into her wound (fever −30)', where: 'on Horse Meadow' },
  moss: { n: 1, label: 'Scrape the grey cave moss', give: 'Pack the cave moss on her wound (fever −30)', where: 'in Flint Deep' },
};
const arcDist = (p, x, z) => Math.hypot(p.x - x, p.z - z);
const arcSfx = (f, d, v) => A.hit(f, d, v);          // the audio A (story functions name S.arc `A` locally)
const arcSeasonOf = (id) => (S.arc.thaw && ARCD.SEASON_OF[id] === 'winter' ? 'spring' : ARCD.SEASON_OF[id] || 'summer');
const arcWinterNow = () => S.arc.season === 'winter';
function arcChillK() { return arcWinterNow() ? 1.8 : 1; }
function arcSnow() { return arcWinterNow(); }
const arcStored = () => ARCD.countFood(S.stash);
const arcTamuGuest = () => S.arc.tamu === 'guest' || S.arc.tamu === 'friend';
const arcHome = () => homeHouse() || structs.find((s) => s.kind === 'hut' && s.rise >= 1) || structs.find((s) => s.kind === 'fire') || null;
function arcBraziers() { const h = arcHome(); return h ? structs.filter((s) => s.kind === 'brazier' && s.rise >= 1 && Math.hypot(s.x - h.x, s.z - h.z) < 35).length : 0; }
// Deterministic dry ground near (x, z): a spiral search (same answer every load).
function arcLand(x, z, rmax = 12) {
  for (let i = 0; i < 90; i++) {
    const r = (i / 90) * rmax, a = i * 2.4, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (getHeight(px, pz) > 1.0 && slopeY(px, pz) > 0.9 && Math.abs(px) < LIMIT && Math.abs(pz) < LIMIT && !inCaveRock(px, pz)) return [px, pz];
  }
  return [x, z];
}
function inCaveRock(x, z) { return depthAt(x, z) > 0.02; }
function arcSpot(id) {
  if (ARCS.spots[id]) return ARCS.spots[id];
  let v = null;
  const [tx, tz] = LM.tree, ta = Math.atan2(-tx, -tz);   // from the Great Tree toward home
  switch (id) {
    case 'camp0': v = arcLand(LM.ruins[0] + 8, LM.ruins[1] + 8, 8); break;                       // the cold camp, east of the ruin walls
    case 'sling': v = arcLand(LM.ruins[0] - 9, LM.ruins[1] + 11, 8); break;                       // Wena's snow camp
    case 'ford': v = [riverX(FORDS[1]), FORDS[1]]; break;                                          // the north ford
    case 'tree': v = [tx + Math.sin(ta) * 3.3, tz + Math.cos(ta) * 3.3]; break;                    // Tamu, against the trunk on the home side
    case 'trail': v = arcLand(tx + Math.sin(ta + 0.35) * 46, tz + Math.cos(ta + 0.35) * 46, 6); break;
    case 'grave': v = arcLand(tx + Math.sin(ta + 1.2) * 4.6, tz + Math.cos(ta + 1.2) * 4.6, 3); break;
    case 'lake': {
      const L = POIS.find((p) => p.id === 'lake'), a = Math.atan2(-L.x, -L.z);
      let r = 4; while (r < 70 && getHeight(L.x + Math.sin(a) * r, L.z + Math.cos(a) * r) < 0.6) r += 1;
      v = [L.x + Math.sin(a) * (r + 2.5), L.z + Math.cos(a) * (r + 2.5)]; break;
    }
    case 'willow': { const z = 14; v = arcLand(riverX(z) - 9, z, 10); break; }
    case 'yarrow': v = arcLand(LM.meadow[0] - 22, LM.meadow[1] + 14, 10); break;
    case 'moss': { const k = CAVES.find((c) => c.id === 'flint') || CAVES[1] || CAVES[0]; v = [k.c[0] + 1.5, k.c[1] + 1.5]; break; }
    case 'stones': v = [LM.stones[0], LM.stones[1]]; break;
    default: return null;
  }
  return (ARCS.spots[id] = v);
}
function arcCampPos() {
  if (!S.arc.campPos) { const [x, z] = arcLand(LM.meadow[0] + 58, LM.meadow[1] - 14, 26); S.arc.campPos = [+x.toFixed(1), +z.toFixed(1)]; }
  setCampPOI(S.arc.campPos);
  if (!S.found.camp && !(S.rumour || []).includes('camp')) S.rumour = [...(S.rumour || []), 'camp'];
  return S.arc.campPos;
}

// ----- lines, waits, scenes
const arcSay = (lines) => { for (const l of lines || []) if (l) say(l[0], l[1]); };
const arcWait = (s) => new Promise((r) => ARCS.waits.push({ t: clock + s, r }));
const arcSubsDone = () => new Promise((r) => ARCS.waits.push({ subs: true, r }));
function arcFade(text, mid, hold = 2600) {
  return new Promise((res) => { fadeTo(text, () => { try { mid?.(); } catch (err) { console.error(err); } }, hold); setTimeout(res, 1300 + hold + 1000); });
}
// Sena's lines that need her beside you: now if she is, else the next time she is (saved).
function arcSenaSays(lines) { if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 9) arcSay(lines); else (S.arc.pending ||= []).push(...lines); }
async function arcScene(id, fn) {
  if (ARCS.scene) return false;
  ARCS.scene = id;
  if (id !== 'raid') arcCalmClear();                 // ARC-FIX: no event pack inside a story scene
  try { await fn(); } catch (err) { console.error('ARC scene', id, err); }
  finally {
    ARCS.scene = null; ARCS.focus = null; ARCS.holdUntil = clock + 1.5; ARCS.ch = -1;
    if (camShot && camShot === ARCS.shot) camShot = null; ARCS.shot = null;
    for (const e of ARCS.npcs) if (e.mode === 'talk') e.mode = 'stand';
    drawQuest(); save();
  }
  return true;
}
function arcHold() { return !!ARCS.scene || clock < ARCS.holdUntil; }
// ARC-FIX: a story or romance moment is playing (an ARC scene, a ROM kiss/embrace/handfast, the first-kiss beat, a choice
// panel, a rest), or ended less than a few seconds ago. Random world events and the chapter advance wait for it.
function arcCalmNow() { return !!ARCS.scene || !!ROM.scene || !!ROM.fk || !!ROM.nightOn || !!MAT.choice || !!R.on; }
function arcCalm() { return arcHold() || arcCalmNow() || clock < (ARCS.calmUntil || 0); }
// ARC-FIX: a cinematic is starting: event wolves within 45 m are sent off (those in or near the shot are gone at once),
// so no pack walks into a vow, a kiss or a story beat. Story NPCs and the raid's own fighters are never touched.
function arcCalmClear(r = 45) {
  for (const o of [...animals]) {
    if (o.kind !== 'wolf' || o.state !== 'live' || o.tame) continue;
    const d = Math.hypot(o.root.position.x - P.pos.x, o.root.position.z - P.pos.z);
    if (d < 28) remove(o); else if (d < r) o.leave = true;
  }
  ARCS.calmUntil = Math.max(ARCS.calmUntil || 0, clock + 8);
}
// A conversation shot: over Aro's shoulder toward `at` (a Vector3 or an NPC).
function arcShot(at, t = 40, side = 1) {
  const tp = at.pos || at, dx = tp.x - P.pos.x, dz = tp.z - P.pos.z, d = Math.hypot(dx, dz) || 1, fx = dx / d, fz = dz / d;
  const pos = new THREE.Vector3(P.pos.x - fx * 3.1 + fz * 1.3 * side, P.pos.y + 2.1, P.pos.z - fz * 3.1 - fx * 1.3 * side);
  if (arcCamBlocked(tp.x, tp.z, pos.x, pos.z)) pos.set(P.pos.x - fx * 3.1 - fz * 1.3 * side, P.pos.y + 2.1, P.pos.z - fz * 3.1 + fx * 1.3 * side);   // ARC-FIX: the other shoulder
  if (arcCamBlocked(tp.x, tp.z, pos.x, pos.z)) pos.set(P.pos.x - fx * 1.2, P.pos.y + 2.3, P.pos.z - fz * 1.2);   // ARC-FIX: tight behind him
  const lk = new THREE.Vector3(tp.x, (tp.y || getHeight(tp.x, tp.z)) + 1.35, tp.z);
  if (view === 'fpp') return;                        // first person: keep the player's own eyes
  camShot = ARCS.shot = { pos, look: lk, t };
}
// A spoken exchange as shot / reverse shot: each line is framed on its speaker, from the side of whoever they speak to.
const ARC_WHO = { Korr: 'korr', Tamu: 'tamu', Wena: 'wena', Pell: 'pell' };
function arcCloseUp(who, other, d = 3.6, side = 1) {
  if (view === 'fpp' || !who || !other) return;
  const a = who.pos, b = other.pos || other, dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
  const k = who.child ? 0.72 : 1, gy = Math.max(getHeight(a.x, a.z), 0.2);
  // ARC-FIX: a seated speaker (Tamu or Sena on the fire bench) is framed from in front of their own face, low and
  // close, on the near side of the fire (the shot through the fire and the grass showed a headless figure on a log)
  const seated = who.mode === 'sit' || (who === N && (N.sit > 0 || N.h.pose === 'sit' || N.h.pose === 'sitTalk' || !!N.seat));
  const fr = seated && structs.find((q) => q.kind === 'fire' && Math.hypot(q.x - a.x, q.z - a.z) < 3.2);   // ARC-FIX4: on a fire bench: shot round the ring, never across the flames
  if (fr) { arcFireCloseUp(who, fr); return; }
  const ang0 = seated ? who.face : Math.atan2(dx, dz), low = seated ? 0.55 : 0;
  if (seated) { d = 1.9; side *= 0.65; } else d = Math.min(d, Math.max(2.2, L - 1.2));
  // ARC-FIX: never inside or behind a trunk, a boulder or a wall (the outcast shot was inside the Great Tree): swing
  // round the speaker until the line from their face to the lens is clear
  let cx = 0, cz = 0;
  for (const sw of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, Math.PI]) {
    const an = ang0 + sw, fx = Math.sin(an), fz = Math.cos(an);
    cx = a.x + fx * d + fz * 1.25 * side; cz = a.z + fz * d - fx * 1.25 * side;
    if (!arcCamBlocked(a.x, a.z, cx, cz)) break;
  }
  const cy = Math.max(getHeight(cx, cz), 0.25) + (seated ? 1.05 : 1.5);   // never under the bank or the water
  camShot = ARCS.shot = { pos: new THREE.Vector3(cx, Math.max(cy, gy + 1.45 * k - low * 0.55), cz), look: new THREE.Vector3(a.x, gy + (seated ? 1.1 : 1.42 * k), a.z), t: 60 };
}
// ARC-FIX4: someone seated at a fire, framed from a point on a ring round the fire ~60 degrees round from them: a
// three-quarter face at eye level, the flames off to the side (not in front), nobody else in the line, the trodden
// ring round the fire clear of tall grass (a blade covered Sena's face).
function arcFireGrass(f) { if (!f.arcGrass) { f.arcGrass = true; world.clear(f.x, f.z, 4.8); } }
function arcLineHits(ax, az, cx, cz, skip) {        // a person within 0.5 m of the segment (subject excluded)
  const L = Math.hypot(cx - ax, cz - az) || 1;
  for (const e of [P, N, ...ARCS.npcs.filter((q) => !q.hidden && q.mode !== 'dead')]) {
    if (e === skip || !e.pos) continue;
    const t = clamp(((e.pos.x - ax) * (cx - ax) + (e.pos.z - az) * (cz - az)) / (L * L), 0, 1);
    if (t > 0.12 && Math.hypot(ax + (cx - ax) * t - e.pos.x, az + (cz - az) * t - e.pos.z) < 0.5) return true;
  }
  return false;
}
function arcFireCloseUp(who, f, tw = null) {         // ARC-FIX7: tw = who they speak to: the lens goes on that side (her eyes come toward it)
  arcFireGrass(f);
  const a = who.pos, th = Math.atan2(a.x - f.x, a.z - f.z), r = Math.hypot(a.x - f.x, a.z - f.z), rc = Math.max(1.4, r * 0.78);   // inside their ring: the face, not the back
  const gy = Math.max(getHeight(a.x, a.z), 0.2);
  let best = null, bs = -1e9;
  for (const d of [0.95, -0.95, 1.2, -1.2, 0.75, -0.75]) {
    const an = th + d, cx = f.x + Math.sin(an) * rc, cz = f.z + Math.cos(an) * rc;
    let sc = -Math.abs(Math.abs(d) - 0.95);
    if (arcLineHits(a.x, a.z, cx, cz, who)) sc -= 4;
    if (arcCamBlocked(a.x, a.z, cx, cz)) sc -= 6;
    if (tw) sc -= 0.2 * Math.hypot(cx - tw.x, cz - tw.z);
    if (sc > bs) { bs = sc; best = [cx, cz]; }
  }
  const lo = who.jy < -0.2 ? 0.34 : 0;               // ARC-FIX7: sitting on the ground (Tamu): the lens and the aim come down to his face (he sat in the bottom third, under the subtitle)
  const cy = Math.max(gy + 1.2 - lo, getHeight(best[0], best[1]) + 0.9 - lo);
  camShot = ARCS.shot = { pos: new THREE.Vector3(best[0], cy, best[1]), look: new THREE.Vector3(a.x + (f.x - a.x) * 0.06, gy + 0.98 - lo * 1.25, a.z + (f.z - a.z) * 0.06), t: 60 };
}
// The two of them on the benches, from across the fire and a little above it (the flames low in the frame, between them).
function arcFireTwoShot(f, e1, e2) {
  arcFireGrass(f);
  const bx = (e1.pos.x + e2.pos.x) / 2 - f.x, bz = (e1.pos.z + e2.pos.z) / 2 - f.z, th = Math.atan2(bx, bz) + Math.PI, gy = Math.max(getHeight(f.x, f.z), 0.2);
  let best = null;
  for (const d of [0, 0.3, -0.3, 0.6, -0.6]) {
    const an = th + d, cx = f.x + Math.sin(an) * 3.6, cz = f.z + Math.cos(an) * 3.6;
    best ||= [cx, cz];
    if (!arcLineHits(f.x, f.z, cx, cz, null) && !arcCamBlocked(f.x, f.z, cx, cz)) { best = [cx, cz]; break; }
  }
  camShot = ARCS.shot = { pos: new THREE.Vector3(best[0], Math.max(gy + 1.75, getHeight(best[0], best[1]) + 1.4), best[1]), look: new THREE.Vector3(f.x + bx, gy + 0.72, f.z + bz), t: 60 };
}
// ARC-FIX: is the line from a subject at (ax, az) to a lens at (cx, cz) inside a collider (trunk, rock, wall)?
const _acb = new THREE.Vector3();
function arcCamBlocked(ax, az, cx, cz) {
  const L = Math.hypot(cx - ax, cz - az); if (L < 0.8) return false;
  for (let t = 0.75; t <= L + 1e-3; t += 0.35) {
    const q = Math.min(1, t / L), x0 = ax + (cx - ax) * q, z0 = az + (cz - az) * q;
    _acb.set(x0, 0, z0); collide(_acb, t > L - 0.36 ? 0.8 : 0.2);
    if (Math.abs(_acb.x - x0) + Math.abs(_acb.z - z0) > 1e-3) return true;
  }
  return false;
}
async function arcTalk(lines, other = ARCS.focus) {
  for (const l of lines || []) {
    if (!l) continue;
    const npc = ARC_WHO[l[0]] ? arcGet(ARC_WHO[l[0]]) : null;
    if (npc && !npc.hidden) { arcCloseUp(npc, P, 3.6, 1); if (!P.ride && !keys.KeyW && !keys.KeyS && !keys.KeyA && !keys.KeyD) arcFace(P, npc.pos); }   // Aro looks at whoever speaks to him
    else if ((l[0] === 'Sena' || l[0] === 'Aro') && other && other !== N) arcCloseUp(l[0] === 'Sena' ? N : P, other, 3.4, l[0] === 'Sena' ? -1 : 1);
    else if (l[0] === 'Sena' && other === N) { arcStandFace(N, P.pos); arcCloseUp(N, P, 3.2, 1); }   // ARC-FIX: she turns to him (not her back to the lens)
    else if (l[0] === 'Aro' && other === N) { arcStandFace(P, N.pos); arcCloseUp(P, N, 3.2, -1); }
    ARCS.nGaze = l[0] === 'Sena' ? (other && other !== N ? other : P) : null;   // ARC-FIX5: she lifts her eyes to whoever she speaks to
    say(l[0], l[1]); await arcSubsDone();
  }
  ARCS.nGaze = null;
}
// ARC-FIX5: Sena's head and neck turn toward ARCS.nGaze (an NPC, P, or a point), eased, clamped to a natural range
// (seated at the fire she spoke to her hands, eyes down, with Aro standing beside her).
const _agH = new THREE.Vector3(), _agR = new THREE.Vector3();
function arcGazeOv(h) {
  const g = ARCS.nGaze;
  ARCS.nGazeW = clamp((ARCS.nGazeW || 0) + (g ? 0.04 : -0.04), 0, 1);
  if (ARCS.nGazeW <= 0) return;
  if (g) { const tp = g.pos || g, hy = g === P ? (P.h.bones.Head.getWorldPosition(_agR), _agR.y) : (tp.y || getHeight(tp.x, tp.z)) + (g.child ? 1.0 : 1.5); ARCS.nGazeAt = [tp.x, hy, tp.z]; }
  const at = ARCS.nGazeAt; if (!at) return;
  h.bones.Head.getWorldPosition(_agH);
  const w = smooth01(ARCS.nGazeW), dx = at[0] - _agH.x, dz = at[2] - _agH.z, dh = Math.hypot(dx, dz) || 1;
  let yaw = Math.atan2(dx, dz) - N.face; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  yaw = clamp(yaw, -1.1, 1.1) * w;
  const pitch = clamp(Math.atan2(at[1] - _agH.y, dh), -0.3, 0.45) * w;
  rotW(h.bones.neck_01, _V_UP, yaw * 0.45); rotW(h.bones.Head, _V_UP, yaw * 0.55);
  const fa = N.face + yaw; _agR.set(Math.cos(fa), 0, -Math.sin(fa));   // the head's own right axis after the turn
  rotW(h.bones.neck_01, _agR, -pitch * 0.4); rotW(h.bones.Head, _agR, -pitch * 0.6);
}
N.h.addOverride('arcGaze', 50, arcGazeOv);
function arcFace(e, tp) { e.face = Math.atan2(tp.x - e.pos.x, tp.z - e.pos.z); }
function arcStandFace(e, tp) { if (e.ride || e.sit > 0 || e.seat || e.mode === 'sit' || (e === P && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD))) return; arcFace(e, tp); }   // ARC-FIX: standing speakers only

// ----- choices: arcChoose wraps choose() and records the consequences
const arcAxis = (k, n) => { if (!n) return 0; const was = S.arc[k] || 0; S.arc[k] = ARCD.clampAxis(was + n); return S.arc[k] - was; };
function arcMem(id, text) { if (!text) return; S.arc.memory.push({ day: S.day, id, ch: CH[S.ch].id, text }); if (S.arc.memory.length > 60) S.arc.memory.shift(); }
// opts: [{label, hint?, req?, value, approve?, mercy?, mem?, fx?}]. Resolves with the picked index once recorded.
async function arcChoose(id, title, opts, cfg = {}) {
  const had = S.arc.choices[id];                     // already decided (G.arcChoose mid-scene, or a scene re-run after a load): never apply twice
  if (had != null) return Math.max(0, opts.findIndex((o, i) => (o.value ?? i) === had));
  ARCS.defs[id] = { opts, title };
  const i = await choose(id, title, opts.map((o) => ({ label: o.label, hint: o.hint, req: o.req })), cfg);
  return arcApply(id, i);
}
function arcApply(id, i) {
  const d = ARCS.defs[id]; if (!d) return -1;
  delete ARCS.defs[id];
  const o = d.opts[i] || d.opts[0];
  S.arc.choices[id] = o.value ?? i;
  const da = arcAxis('approve', o.approve || 0); arcAxis('mercy', o.mercy || 0);
  arcMem(id, o.mem || ARCD.memText(id, o.value ?? i) || o.label);
  if (Math.abs(da) >= 2) toast('Sena will remember that.');
  try { o.fx?.(); } catch (err) { console.error(err); }
  drawQuest(); save();
  return i;
}
// Every story choice's options: label, hint, req, the axes and the STATE change (fx). Scenes add the presentation
// (lines, fades, camera); G.arcChoose(id, i) applies one directly when no panel is open (tests, debugging).
const arcKeepFood = () => ARCD.countFood(S.inv);
const ARC_OPTS = {
  ford() {
    const A = S.arc, food = () => arcKeepFood() >= 2;
    return [
      { label: 'Share our food', value: 'share', mercy: 1, req: food, hint: food() ? 'Give them 2 cooked meat. They leave as wary strangers.' : 'You need 2 cooked meat (or other food that keeps)', fx() { ARCD.takeFood({}, S.inv, 2); A.tribe = 'wary'; drawInv(); } },
      { label: 'Threaten them', value: 'threaten', mercy: -1, approve: -1, hint: 'Raise the spear. They will remember it.', fx() { A.tribe = 'hostile'; } },
      { label: 'Hold your spear and say nothing', value: 'hold', hint: 'Let the silence answer.', fx() { A.tribe = 'wary'; } },
      { label: 'Let Sena answer', value: 'sena', approve: 2, req: () => S.close >= 40, hint: S.close >= 40 ? 'She speaks for herself.' : 'Needs Closeness 40', fx() { A.tribe = 'wary'; A.healOffer = true; } },
    ];
  },
  outcast() {
    const A = S.arc;
    return [
      { label: 'Help him', value: 'help', approve: 2, mercy: 2, hint: 'Pull the spear, bind the wound, bring him home.', fx() { A.tamu = 'guest'; } },
      { label: 'Kill him', value: 'kill', approve: -3, mercy: -3, hint: 'Quick. Then there is one less of them.', fx() { A.tamu = 'dead'; } },
      { label: 'Leave him', value: 'leave', mercy: -1, hint: 'Walk away. It is not your fight.', fx() { A.tamu = 'gone'; } },
    ];
  },
  jealous() {
    const A = S.arc;
    return [
      { label: 'Join them', value: 'join', approve: 1, hint: 'Sit down. Hear the story.', fx() { A.tamu = 'friend'; addClose(2, 'laughed together at the fire'); } },
      { label: 'Walk away', value: 'walk', hint: 'Leave them to it.' },
      { label: 'Tell her to keep away from him', value: 'forbid', approve: -2, hint: 'Say what you feel. Badly.', fx() { arcRift(1, 'jealous'); A.riftDay = S.day + 1; } },
    ];
  },
  reconcile() {
    const A = S.arc, mend = (n) => () => { arcRift(0); A.riftCause = null; addClose(n, 'made peace at the lake'); };
    return [
      { label: '"I was afraid."', value: 'afraid', approve: 2, fx: mend(5) },
      { label: '"I was wrong."', value: 'wrong', approve: 1, fx: mend(3) },
      { label: '"I will not be sorry for caring."', value: 'proud', approve: -1, fx() { A.riftDay = S.day + 1; } },
    ];
  },
  door() {
    const A = S.arc, n = arcStored() + arcKeepFood();
    return [
      { label: 'Share what we have', value: 'share', approve: 3, mercy: 2, req: () => arcStored() + arcKeepFood() >= 6, hint: n >= 6 ? 'They winter with you. Six meals from the basket.' : `You need 6 meals that keep (you have ${n})`, fx() { ARCD.takeFood(S.stash, S.inv, 6); A.wena = 'saved'; drawInv(); } },
      { label: 'Refuse them', value: 'refuse', approve: -4, mercy: -2, hint: 'Close the door. Keep the food for the two of you.', fx() { A.wena = 'lost'; A.slingDay = S.day + 2; } },
      { label: 'Trade food for knowledge', value: 'trade', req: () => arcStored() + arcKeepFood() >= 2, hint: 'Two meals, for where the Ash People camp.', fx() { ARCD.takeFood(S.stash, S.inv, 2); A.wena = 'traded'; arcCampPos(); drawInv(); } },
    ];
  },
  raid() {
    const warned = !!S.arc.warned && !S.arc.raid.wave;
    return [
      { label: 'Stand and defend the home', value: 'stand', hint: warned ? 'A day to build braziers and wait for them.' : 'Light the braziers. Meet them at the edge of the light.' },
      { label: warned ? 'Run to Echo Hollow when they come' : 'Run to Echo Hollow with Sena', value: 'flee', hint: warned ? 'Leave the home to them. Keep Sena out of it.' : 'Leave the home to them. Take what you can carry.' },
    ];
  },
  guard: () => [
    { label: 'Guard the stable', value: 'stable', hint: `Save ${horseName()}. The house will burn.` },
    { label: 'Guard the house', value: 'house', hint: `Save the house. They will take ${horseName()}.` },
  ],
  tamu() {                                           // a beaten Tamu on his knees: sparing him is the default; killing him is only ever an explicit pick
    const A = S.arc;
    return [
      { label: 'Let him go', value: 'spare', mercy: 2, approve: 1, hint: 'He came with them. He is beaten.', fx() { A.tamu = 'traitor'; } },
      { label: 'Kill him', value: 'kill', mercy: -3, approve: -2, hint: 'He came to burn your home.', fx() { A.tamu = 'dead'; } },
    ];
  },
  korr() {
    const A = S.arc, ok = ARCD.canPeace(A);
    return [
      { label: 'Kill him', value: 'kill', mercy: -3, approve: -1, hint: 'Fight him to the end. He will not yield.', fx() { A.tribe = 'hostile'; } },
      { label: 'Beat him, and spare him', value: 'spare', mercy: 2, approve: 1, hint: 'Fight, then let him live.', fx() { A.tribe = 'wary'; } },
      { label: 'Make peace', value: 'peace', mercy: 3, approve: 2, req: () => ARCD.canPeace(A), hint: ok ? 'Offer seed, and Sena\'s medicine for their sick.' : 'Needs Sena\'s trust, an open door in winter, or her offer at the ford', fx() { A.tribe = 'allied'; const g = Math.min(2, S.inv.grain); if (g) { S.inv.grain -= g; drawInv(); } } },
    ];
  },
  vow: () => ARCD.VOWS.map((v, i) => ({ label: `"${v}"`, value: i, fx() { S.rom.vow = i; } })),
};
// G.arcChoose: pick option i of the open panel `id` (the scene carries on), or apply it directly when none is open.
function arcPick(id, i = 0) {
  if (MAT.choice?.id === id) { MAT.choice.finish(i); return i; }
  if (!ARC_OPTS[id]) return -1;
  ARCS.defs[id] = { opts: ARC_OPTS[id](), title: id };
  return arcApply(id, i);
}

// ----- NPCs: Korr and the Ash hunters, Tamu, Wena and Pell (people.js humans; Pell is a child: never in any fight)
const ARC_LOOK = {
  korr: { hair: 'parted', beard: true, tint: 0x8b8680, hairColor: 0x181412, scale: 1.07, ash: 0.9, fur: 0x4a4038 },   // a dark wolf-pelt mantle
  tamu: { hair: 'buzz', beard: false, tint: 0xaaa49d, hairColor: 0x2b221c, ash: 0.35 },   // cast out: the ash on his hands is fading
  wena: { female: true, hair: 'buns', tint: 0xd6ccc2, hairColor: 0x3b2a20, fur: 0x6a5a4a, furO: { wrap: true, skirt: 0x5a4636 }, dress: false },   // a worn hide wrap and skirt (ADULT-DRESS off: her own wrap covers her)
  pell: { child: 'boy', hair: 'buzz', tint: 0xeee4da, hairColor: 0x4a3828, scale: 0.83 },   // CHILD: a boy's body and tunic (about 1.27 m)
};
const arcHunterLook = (i) => ({ ash: 0.85, fur: [0x6b5a48, 0x5d5044, 0x7a6650, 0x625548][i % 4], hair: i % 2 ? 'buzz' : 'parted', beard: i !== 1, tint: [0x9d978f, 0x8e8983, 0xa49e96, 0x96918a][i % 4], hairColor: [0x2a2420, 0x1c1916, 0x3a2e26, 0x231d19][i % 4] });
const arcGet = (id) => ARCS.npcs.find((n) => n.id === id) || null;
function arcNpc(id, look, x, z, face = 0, o = {}) {
  const old = arcGet(id); if (old) return old;
  const h = makeHuman(look);
  const e = { id, h, pos: new THREE.Vector3(x, 0, z), face, speed: 0, mode: 'stand', jy: 0, look: null, ...o };
  if (o.spear) { h.spear.visible = true; h.place(h.spear, o.spear); }
  if (look.ash) arcAshHands(h, look.ash);
  if (look.fur) arcFurMantle(h, look.fur, look.furO);
  scene.add(h.root); ARCS.npcs.push(e);
  return e;
}
// The Ash People's mark: hands grey to the wrist (ash rubbed in), fading up the forearm. A per-vertex weight from the
// skin weights of the hand and finger bones, mixed toward ash grey in the body shader (the geometry is cloned per NPC).
const ARC_ASH_B = /^(hand|thumb|index|middle|ring|pinky)_/;
function arcAshHands(h, k) {
  let body = null;
  h.root.traverse((o) => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
  if (!body || body.userData.arcAsh) return;
  body.userData.arcAsh = true;
  const g = body.geometry = body.geometry.clone(), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count;
  const names = body.skeleton.bones.map((b) => b.name), w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (let j = 0; j < 4; j++) { const b = names[si.getComponent(i, j)] || '', v = sw.getComponent(i, j); if (ARC_ASH_B.test(b)) a += v; else if (/^lowerarm_/.test(b)) a += v * 0.45; }
    w[i] = Math.min(1, a) * k;
  }
  g.setAttribute('aAsh', new THREE.BufferAttribute(w, 1));
  const m = body.material, prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = 'attribute float aAsh;\nvarying float vAsh;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAsh = aAsh;');
    sh.fragmentShader = 'varying float vAsh;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.57, 0.55), vAsh);');
  };
  const key0 = m.customProgramCacheKey?.() || '';
  m.customProgramCacheKey = () => key0 + '-arcash';
  m.needsUpdate = true;
}
// A shaggy hide mantle over the shoulders (the Ash People live in the cold hills): rides the upper spine
// (spine_03 frame: x left, y up, z forward), open at the front, drawn over the upper arms.
const ARC_FUR = {};
// o.wrap: a long wrap closed over the chest down to the waist (Wena), with a hide skirt to the knee on the pelvis.
function arcFurGeo(key, rTop, rBot, len, gap) {
  if (ARC_FUR[key]) return ARC_FUR[key];
  const g = new THREE.CylinderGeometry(rTop, rBot, len, 16, 5, true, gap / 2, 6.283 - gap), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {                // shaggy: a ragged hem and a tufted surface
    const y = p.getY(i), a = Math.atan2(p.getX(i), p.getZ(i)), j = 1 + 0.06 * Math.sin(a * 11 + y * 30) * (0.5 - y / len);
    p.setX(i, p.getX(i) * j); p.setZ(i, p.getZ(i) * j);
    if (y < -len / 2 + 0.01) p.setY(i, y - 0.05 * (0.5 + 0.5 * Math.sin(a * 7.3)));
  }
  g.computeVertexNormals(); g.rotateY(Math.PI);        // the opening faces forward (+z)
  return (ARC_FUR[key] = g);
}
function arcFurMantle(h, col, o = {}) {
  const mat = (c) => (ARC_FUR['m' + c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide, flatShading: true }));
  const m = new THREE.Mesh(o.wrap ? arcFurGeo('wrap', 0.12, 0.25, 0.62, 0.16) : arcFurGeo('mantle', 0.13, 0.3, 0.4, 1.1), mat(col));
  m.position.set(0, o.wrap ? -0.01 : 0.1, o.wrap ? 0.0 : -0.015); m.scale.set(1, 1, o.wrap ? 0.86 : 0.78); m.castShadow = true;
  h.sock.back.add(m);
  if (o.wrap) {                                      // the skirt: waist to knee, hung from the pelvis
    const k = new THREE.Mesh(arcFurGeo('skirt', 0.17, 0.25, 0.56, 0.0), mat(o.skirt || col));
    k.position.set(0, -0.2, 0); k.scale.set(1, 1, 0.8); k.castShadow = true;
    h.sock.hipL.add(k);
  }
  return m;
}
function arcDrop(id) {
  const e = arcGet(id); if (!e) return;
  scene.remove(e.h.root); ARCS.npcs.splice(ARCS.npcs.indexOf(e), 1);
}
function arcDead(e) { if (!e || e.mode === 'dead') return; e.mode = 'dead'; e.jy = 0; e.matStill = true; matLieStart(e, true); }
function arcNpcTick(dt) {
  for (let i = ARCS.npcs.length - 1; i >= 0; i--) {
    const e = ARCS.npcs[i];
    if (e.child) e.hidden = ARCS.raidOn || arcThreat(e.pos, 45) || (e.nightIn && world.env.night > 0.75);   // GUARDRAIL: Pell goes indoors
    const far = camera.position.distanceToSquared(e.pos) > 180 * 180;
    e.h.root.visible = !e.hidden && !far;
    if ((e.mode === 'leave' || e.dropFar) && (far || Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > 70)) { arcDrop(e.id); continue; }
    if (far || e.hidden) continue;
    if (e.mode === 'walk' || e.mode === 'leave') {
      if (walkTo(e, e.tx, e.tz, e.spd || 1.7, dt, 0.6) && e.mode === 'walk') { e.mode = e.then || 'stand'; e.then = null; }
    } else e.speed = 0;
    if ((e.mode === 'stand' || e.mode === 'talk') && e.look) { const t = e.look === 'P' ? P.pos : e.look === 'N' ? N.pos : e.look; e.face = turn(e.face, Math.atan2(t.x - e.pos.x, t.z - e.pos.z), Math.min(1, dt * 4)); }
    e.h.pose = e.mode === 'sit' ? (e.talk ? 'sitTalk' : 'sit') : e.mode === 'talk' ? 'talk' : e.mode === 'work' ? 'work' : null;
    settle(e, dt, false);
  }
}
// GUARDRAIL: anything that could hurt a child counts, even a wolf that is already slinking off (hostileNear ignores those).
function arcThreat(p, r) {
  return animals.some((o) => (o.kind === 'wolf' || o.hostile) && o.state === 'live' && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < r)
    || foes.some((f) => f.live && Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < r);
}
// Everyone in a scene turns to listen (talk poses while the lines play).
function arcTalkers(ids, on = true) { for (const id of ids) { const e = arcGet(id); if (e && e.mode !== 'dead' && e.mode !== 'sit') { e.mode = on ? 'talk' : 'stand'; e.look = 'P'; } } }

// ----- props (each a THREE.Group in ARCS.props[key]; arcProp(key, on) builds or removes it; update(dt) if it has one)
const ARCM = {
  stone: mat(0x77726a, 0.95), ash: mat(0x2b2724, 1), char: mat(0x1c1612, 1), bone: mat(0xd8d0bc, 0.8), wood: mat(0x5a4330, 0.95), hide: mat(0x8a6a4c, 0.95),
  snow: mat(0xe9eef3, 0.85), leaf: mat(0x6f8a3e, 0.9), white: mat(0xf1eee2, 0.85), moss: mat(0x6f7a58, 1), strap: mat(0x6a4a30, 0.9),
  ember: new THREE.MeshStandardMaterial({ color: 0x2a140a, emissive: 0xff6a20, emissiveIntensity: 1.2, roughness: 1 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
};
const arcTex = (draw, s = 128) => { const c = document.createElement('canvas'); c.width = c.height = s; draw(c.getContext('2d'), s); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const ARCT = {
  smoke: arcTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(190,190,190,0.6)'); gr.addColorStop(1, 'rgba(190,190,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 64),
  blood: arcTex((g, s) => {   // a dried blood splat: a dark core and a few drops
    let r = 7; const R = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    g.fillStyle = 'rgba(92, 10, 8, 0.92)';
    g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.2, s * 0.14, 0.4, 0, 6.3); g.fill();
    for (let i = 0; i < 14; i++) { const a = R() * 6.3, d = s * (0.18 + R() * 0.26), q = s * (0.012 + R() * 0.04); g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, q, 0, 6.3); g.fill(); }
  }),
  scuff: arcTex((g, s) => { g.fillStyle = 'rgba(70, 52, 34, 0.55)'; for (let i = 0; i < 5; i++) { g.save(); g.translate(s / 2, s / 2); g.rotate(i * 0.7); g.fillRect(-s * 0.3, -s * 0.02 + i * 4 - 8, s * 0.6, s * 0.05); g.restore(); } }),
  ashHands: arcTex((g, s) => {
    g.clearRect(0, 0, s, s); g.fillStyle = 'rgba(120, 118, 114, 0.85)';
    const hand = (x, y, k, rot) => { g.save(); g.translate(x, y); g.scale(k, k); g.rotate(rot); g.beginPath(); g.ellipse(0, 0, 13, 15, 0, 0, 6.3); g.fill(); for (const [fx, len, a] of [[-11, 17, -0.5], [-5, 24, -0.15], [2, 26, 0], [9, 23, 0.15]]) { g.save(); g.translate(fx, -10); g.rotate(a); g.fillRect(-2.6, -len, 5.2, len); g.restore(); } g.save(); g.translate(12, 2); g.rotate(1.0); g.fillRect(-2.6, -16, 5.2, 16); g.restore(); g.restore(); };
    hand(s * 0.28, s * 0.6, s / 120, -0.3); hand(s * 0.55, s * 0.45, s / 105, 0.15); hand(s * 0.8, s * 0.62, s / 130, 0.45);
  }, 256),
};
function arcSmokeCol(g, y, height = 18, n = 12) {
  const list = [];
  for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ARCT.smoke, transparent: true, depthWrite: false, opacity: 0, color: 0x9a9690 })); s.userData.t = i / n; g.add(s); list.push(s); }
  return (dt) => { for (const s of list) { const u = (s.userData.t = (s.userData.t + dt * 0.045) % 1); s.position.set(Math.sin(u * 4 + s.id) * 0.6 * u + u * u * 3, y + u * height, Math.cos(u * 3 + s.id) * 0.5 * u); s.scale.setScalar(0.8 + u * 5); s.material.opacity = Math.sin(u * Math.PI) * 0.42; } };
}
function arcRock(g, x, y, z, sx, sy = sx * 0.7, sz = sx, m = ARCM.stone) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), m); r.position.set(x, y, z); r.scale.set(sx, sy, sz); r.rotation.set(x * 3, z * 5, y * 2); r.castShadow = r.receiveShadow = true; g.add(r); return r; }
function arcStick(g, x, y, z, len, rx, ry, rz, r = 0.035, m = ARCM.wood) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, len, 5), m); c.position.set(x, y, z); c.rotation.set(rx, ry, rz); c.castShadow = true; g.add(c); return c; }
function arcFirePit(g, lit) {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; arcRock(g, Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62, 0.16, 0.12, 0.14); }
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.04, 12), lit ? ARCM.ember : ARCM.ash); ash.position.y = 0.02; g.add(ash);
  for (let i = 0; i < 4; i++) arcStick(g, Math.cos(i * 1.6) * 0.2, 0.08, Math.sin(i * 1.6) * 0.2, 0.7, 1.35, i * 1.6, 0, 0.04, ARCM.char);
  if (!lit) return null;
  const fl = [0, 1, 2].map((i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.04, 0.7 - i * 0.12, 7, 1, true), ARCM.flame); f.position.set(Math.sin(i * 2) * 0.1, 0.42, Math.cos(i * 2) * 0.1); g.add(f); return f; });
  let t = 0;
  return (dt) => { t += dt; fl.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 9 + i * 2) * 0.2, 1 + Math.sin(t * 13 + i) * 0.28, 1); f.rotation.y = t * (i + 1); }); };
}
// Flat decals on the ground (one InstancedMesh): blood (Blood on) or brown scuffs (Blood off).
function arcDecals(g, pts, size = 0.7) {
  const blood = settings.blood !== 'off';
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: blood ? ARCT.blood : ARCT.scuff, transparent: true, depthWrite: false, roughness: blood ? 0.35 : 1, polygonOffset: true, polygonOffsetFactor: -4 }), pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([x, z, s = 1], i) => { o.position.set(x, getHeight(x, z) + 0.04, z); o.rotation.set(-Math.PI / 2, 0, (x * 13 + z * 7) % 6.28); o.scale.setScalar(size * s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.receiveShadow = true; m.frustumCulled = false; g.add(m); return m;
}
const ARC_PROPS = {
  coldcamp(g) {                                      // the Ash People's cold camp at the ruins: ashes still warm, bones, a windbreak, grey hands
    const [x, z] = arcSpot('camp0'); g.position.set(x, getHeight(x, z), z);
    arcFirePit(g, false);
    const smokeOn = CH[S.ch].id === 'smoke';
    const sm = smokeOn ? arcSmokeCol(g, 0.3, 22) : null;
    for (let i = 0; i < 5; i++) arcStick(g, 1.6 + i * 0.25, 0.9, -1.2 + i * 0.1, 2.2, 0.6, 0.2, 0.15, 0.05);   // a leaning windbreak
    for (let i = 0; i < 6; i++) { const b = arcStick(g, -0.9 + Math.cos(i) * 0.5, 0.04, 0.9 + Math.sin(i * 2) * 0.4, 0.3 + (i % 3) * 0.1, Math.PI / 2, i, 0, 0.025, ARCM.bone); b.castShadow = false; }
    const rz = LM.ruins[1], rx = LM.ruins[0], ry = getHeight(rx, rz);   // grey hands on the ruin's long wall (local z -2.6, group rot 0.4)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: ARCT.ashHands, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    const c = Math.cos(0.4), s = Math.sin(0.4), lx = 0, lz = -2.6 + 0.215;
    wall.position.set(rx + lx * c + lz * s - x, ry + 1.05 - g.position.y, rz - lx * s + lz * c - z); wall.rotation.y = 0.4; g.add(wall);
    return { update: sm };
  },
  trail(g) {                                         // Tamu's trail: drops every ~1.6 m from the trail start to the tree, a pool where he sits
    const [sx, sz] = arcSpot('trail'), [ex, ez] = arcSpot('tree'), pts = [];
    const n = Math.max(12, Math.round(Math.hypot(ex - sx, ez - sz) / 1.6));
    for (let i = 0; i <= n; i++) { const k = i / n, wob = Math.sin(k * 9) * 1.4 * (1 - k); pts.push([sx + (ex - sx) * k + wob * 0.6, sz + (ez - sz) * k - wob * 0.4, 0.55 + ((i * 37) % 10) / 22]); }
    pts.push([ex, ez, 2.2]);
    if (!ARCS.trailCut) { ARCS.trailCut = true; for (const [x, z] of pts) world.clear(x, z, 0.8); }   // a dragged swath through the grass (the drops were hidden under the blades)
    arcDecals(g, pts, 0.85);
    return {};
  },
  snowcamp(g) {                                      // Wena's camp, found empty: a snowed-in windbreak, a dead fire, her sling. No one.
    const [x, z] = arcSpot('sling'); g.position.set(x, getHeight(x, z), z);
    arcFirePit(g, false);
    for (let i = 0; i < 7; i++) arcStick(g, -1.4 + i * 0.42, 0.75, -1.1, 1.9, 0.75, 0, 0.1, 0.045);
    for (let i = 0; i < 5; i++) arcRock(g, -1.5 + i * 0.75, 0.05, -0.75 + (i % 2) * 0.2, 0.6, 0.25, 0.45, ARCM.snow);
    world.clear(x, z, 4.6);                          // ARC-FIX7: trodden ground: no tall grass over the dead fire and the sling (blades hid the sling in its own shot)
    const sy = (lx, lz) => Math.max(0, getHeight(x + lx, z + lz) - g.position.y);   // on its own patch of ground (a slope buried it)
    const sling = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 18, 4.4), ARCM.strap); sling.position.set(0.55, sy(0.55, 0.65) + 0.07, 0.65); sling.rotation.x = -Math.PI / 2; g.add(sling);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), ARCM.hide); pouch.scale.set(1.3, 0.5, 1); pouch.position.set(0.5, sy(0.5, 0.38) + 0.08, 0.38); g.add(pouch);
    return {};
  },
  ashcamp(g) {                                       // the Ash People's winter camp: hide lean-tos with grey hands, a low fire, smoke
    const [x, z] = S.arc.campPos; g.position.set(x, getHeight(x, z), z);
    const tick = arcFirePit(g, S.arc.choices.korr !== 'kill');
    const sm = arcSmokeCol(g, 0.6, 14, 9);
    const mark = new THREE.MeshStandardMaterial({ map: ARCT.ashHands, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 3; i++) {
      const a = 0.9 + i * 1.7, tx = Math.cos(a) * 6, tz = Math.sin(a) * 6, t = new THREE.Group(); t.position.set(tx, getHeight(x + tx, z + tz) - g.position.y, tz); t.rotation.y = -a + Math.PI / 2; g.add(t);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.6, 7, 1, true), ARCM.hide); tent.position.y = 1.25; tent.castShadow = true; t.add(tent);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), mark); pl.position.set(0, 1.1, 1.2); pl.rotation.x = -0.55; t.add(pl);
      for (let k = 0; k < 3; k++) arcStick(t, Math.cos(k * 2.1) * 0.2, 2.5, Math.sin(k * 2.1) * 0.2, 0.9, 0.3 * Math.cos(k * 2.1), 0, 0.3 * Math.sin(k * 2.1), 0.03);
    }
    return { update: (dt) => { tick?.(dt); sm(dt); } };
  },
  herb_willow(g) {
    const [x, z] = arcSpot('willow'); g.position.set(x, getHeight(x, z), z);
    for (let i = 0; i < 9; i++) { const a = i * 0.7; const s = arcStick(g, Math.cos(a) * 0.25, 0.75, Math.sin(a) * 0.25, 1.5 + (i % 3) * 0.3, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25, 0.025, ARCM.wood); s.castShadow = false; }
    for (let i = 0; i < 14; i++) { const a = i * 1.9, l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), ARCM.leaf); l.scale.set(0.5, 1.3, 0.35); l.position.set(Math.cos(a) * 0.45, 1.0 + (i % 5) * 0.22, Math.sin(a) * 0.45); g.add(l); }
    return {};
  },
  herb_yarrow(g) {
    const [x, z] = arcSpot('yarrow'); g.position.set(x, getHeight(x, z), z);
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.15 + (i % 3) * 0.2, h = 0.45 + (i % 4) * 0.08; arcStick(g, Math.cos(a) * r, h / 2, Math.sin(a) * r, h, 0.08, 0, 0.08, 0.012, ARCM.leaf).castShadow = false; const f = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.04, 9), ARCM.white); f.position.set(Math.cos(a) * r, h, Math.sin(a) * r); g.add(f); }
    return {};
  },
  herb_moss(g) {
    const [x, z] = arcSpot('moss'); g.position.set(x, getHeight(x, z), z);
    arcRock(g, 0, 0.25, 0, 0.55, 0.45, 0.5);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; arcRock(g, Math.cos(a) * 0.35, 0.5 + (i % 2) * 0.08, Math.sin(a) * 0.3, 0.22, 0.08, 0.2, ARCM.moss); }
    return {};
  },
  vowfire(g) {                                       // bond: Sena's small fire inside the ring, so the vows at dusk are seen
    const [sx, sz] = LM.stones, x = sx + 4.4, z = sz + 3.4; g.position.set(x, getHeight(x, z), z);
    const tick = arcFirePit(g, true);
    const l = new THREE.PointLight(0xff9a50, 0, 20, 1.5); l.position.set(0, 1.1, 0); g.add(l);
    let t = 0;
    return { update: (dt) => { t += dt; tick(dt); l.intensity = (0.25 + world.env.night * 0.75) * (26 + Math.sin(t * 11) * 2.5 + Math.sin(t * 5.3) * 2); } };
  },
  sling(g) {                                         // epilogue: Wena's sling hung from a low bough of the Great Tree
    const [tx, tz] = LM.tree; g.position.set(tx + 2.1, getHeight(tx, tz) + 2.6, tz + 1.1);
    arcStick(g, 0, 0.35, 0, 0.7, 0, 0, 0, 0.012, ARCM.strap);
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 5, 14, 3.4), ARCM.strap); s.rotation.z = Math.PI; g.add(s);
    return {};
  },
};
function arcProp(key, on) {
  const cur = ARCS.props[key];
  if (!on) { if (cur) { scene.remove(cur.g); delete ARCS.props[key]; } return null; }
  if (cur) return cur;
  const g = new THREE.Group(); scene.add(g);
  const o = ARC_PROPS[key](g) || {};
  const p = (ARCS.props[key] = { g, x: g.position.x, z: g.position.z, update: o.update || null });
  return p;
}

// ----- seasons: autumn gold on grass and leaves, winter snow on the ground and in the air (one shader patch, one Points)
function arcSeasonBoot() {
  let t = null;
  scene.traverse((o) => { if (!t && o.isMesh && !o.isInstancedMesh && String(o.material?.customProgramCacheKey?.() || '').startsWith('hearthborn-terrain')) t = o; });   // (world.js re-keys it '-cave')
  if (t) {
    const m = t.material, prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.uSnow = ARCS.uSnow; sh.uniforms.uAutumn = ARCS.uAutumn;
      sh.fragmentShader = 'uniform float uSnow, uAutumn;\n' + sh.fragmentShader.replace('diffuseColor.rgb *= tex;', `diffuseColor.rgb *= tex;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.2, 0.97, 0.62), uAutumn * w.x * 0.85);
        float arcN = normalize(vNrm).y, arcM = texture2D(tMacro, vWp.xz * 0.013).r;
        float arcS = uSnow * smoothstep(0.6, 0.88, arcN) * smoothstep(-0.1, 0.7, vWp.y) * smoothstep(0.25, 0.5, arcM * 0.55 + uSnow * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.83, 0.88), arcS);`);
    };
    const key0 = m.customProgramCacheKey();
    m.customProgramCacheKey = () => key0 + '-arc';
    m.needsUpdate = true;
  }
  const n = 1600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(rand() - 0.5) * 56, rand() * 26, (rand() - 0.5) * 56], i * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = arcTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, size: 0.12, color: 0xf2f5fa, transparent: true, opacity: 0, depthWrite: false }));
  pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  ARCS.snow = { pts, pos, n };
}
// Snow on the foliage: grass and leaves take the same uSnow as the ground (grass also lies lower under it).
const ARC_SNOWK = { grass: 0.74, leaf: 0.5, pine: 0.46, flower: 0.8 };
function arcSnowMat(m, kind) {
  if (m.userData.arcSnow) return;
  m.userData.arcSnow = true;
  const prev = m.onBeforeCompile, key0 = (() => { try { return m.customProgramCacheKey?.() || m.name || ''; } catch { return m.name || ''; } })();
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uSnow = ARCS.uSnow;
    if (kind === 'grass' || kind === 'flower') sh.vertexShader = 'uniform float uSnow;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed.y *= 1.0 - uSnow * ${kind === 'grass' ? '0.5' : '0.7'};`);
    sh.fragmentShader = 'uniform float uSnow;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.92), uSnow * ${ARC_SNOWK[kind].toFixed(2)});`);
  };
  m.customProgramCacheKey = () => key0 + '-arcsnow-' + kind;
  m.needsUpdate = true;
}
function arcSeasonMats() {
  const list = [], seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.color || seen.has(m)) continue;
      seen.add(m);
      let key = ''; try { key = m.customProgramCacheKey?.() || ''; } catch { key = ''; }
      const kind = key === 'hearthborn-grass' || key === 'hearthborn-natgrass' || m.name === 'Grass' ? 'grass' : m.name === 'Leaves' || m.name === 'Leaves_NormalTree' || m.name === 'Leaves_TwistedTree' ? 'leaf'
        : m.name === 'Leaves_Pine' ? 'pine' : m.name === 'Flowers' ? 'flower' : null;
      if (kind) { list.push({ m, kind, base: m.color.clone() }); arcSnowMat(m, kind); }
    }
  });
  return list;
}
const ARC_TINT = { grass: { a: [1.18, 0.95, 0.6], w: [0.98, 0.92, 0.74] }, leaf: { a: [1.5, 0.8, 0.36], w: [0.72, 0.6, 0.44] }, pine: { a: [1, 1, 1], w: [0.9, 0.94, 0.96] }, flower: { a: [1, 0.95, 0.8], w: [0.9, 0.9, 0.9] } };
function arcSeasonTick(dt) {
  const s = ARCS.season, se = S.arc.season, ta = se === 'autumn' ? 1 : 0, tw = se === 'winter' ? 1 : 0;
  const k = s.snap ? 1 : Math.min(1, dt * 0.06);
  s.snap = false;
  const a0 = s.a, w0 = s.w;
  s.a += (ta - s.a) * k; s.w += (tw - s.w) * k;
  if (Math.abs(s.a - ta) < 0.002) s.a = ta; if (Math.abs(s.w - tw) < 0.002) s.w = tw;
  ARCS.uSnow.value = s.w; ARCS.uAutumn.value = s.a;
  if (s.a !== a0 || s.w !== w0 || !s.mats) {
    s.mats ||= arcSeasonMats();
    for (const { m, kind, base } of s.mats) { const T = ARC_TINT[kind]; m.color.setRGB(base.r * lerp(1, T.a[0], s.a) * lerp(1, T.w[0], s.w), base.g * lerp(1, T.a[1], s.a) * lerp(1, T.w[1], s.w), base.b * lerp(1, T.a[2], s.a) * lerp(1, T.w[2], s.w)); }
  }
  const sn = ARCS.snow; if (!sn) return;
  const E = world.env, on = s.w > 0.05 && E.cave < 0.3;
  sn.pts.visible = on;
  if (!on) return;
  const storm = E.storm, fall = (1.3 + storm * 2.2) * dt, wind = (0.35 + storm * 3.2) * dt;
  sn.pts.material.opacity = Math.min(0.95, s.w * (0.7 + storm * 0.25));
  sn.pts.material.size = 0.15 + storm * 0.05;
  sn.pts.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
  const p = sn.pos;
  for (let i = 0; i < sn.n; i++) {
    let y = p[i * 3 + 1] - fall * (0.7 + (i % 7) * 0.08), x = p[i * 3] + wind + Math.sin(clock * 0.7 + i) * dt * 0.3;
    if (y < 0) y += 26; if (x > 28) x -= 56;
    p[i * 3] = x; p[i * 3 + 1] = y;
  }
  sn.pts.geometry.attributes.position.needsUpdate = true;
}
// Winter: no berries on the bushes, thinner herds (once per page load), a blizzard every other night (winter chapter).
function arcWinterWorld() {
  const w = arcWinterNow();
  if (w !== ARCS.frozen) {
    ARCS.frozen = w;
    for (const f of world.fields) if (f.kind === 'berry') for (const n of f.nodes) { if (w && n.alive) { f.set(n, false); n.arcFrozen = true; } else if (!w && n.arcFrozen && !n.gone) { f.set(n, true); n.arcFrozen = false; } }
  } else if (w) for (const f of world.fields) if (f.kind === 'berry') for (const n of f.nodes) if (n.alive) { f.set(n, false); n.arcFrozen = true; }
  if (w && !ARCS.herdCut) {
    ARCS.herdCut = true;
    for (const h of herds) { const deer = animals.filter((o) => o.herd === h && o.state === 'live'); for (const o of deer.slice(Math.ceil(deer.length / 2))) remove(o); }
  }
}

// ----- chapter entry (idempotent; CH onEnter, also on load) and Mature story off (skipFx)
function arcEnter(id) {
  const A = S.arc;
  A.season = arcSeasonOf(id);
  if (id === 'winter') { A.winterStart ??= cnt('slept'); A.winterDay ??= S.day; A.doorDay ??= S.day + 2; if (!A.winterSeen) { A.winterSeen = true; setTimeout(() => banner(...ARCD.L.winter.banner), 4200); } }
  if (id === 'raid' && A.raidDay == null) A.raidDay = A.wena === 'saved' ? S.day + 1 : S.time < 19 ? S.day : S.day + 1;
  if (id === 'fever' && !A.feverOn && !A.feverDone) { A.feverOn = true; A.fever = Math.max(A.fever || 0, ARCD.FEVER.start); if (A.senaWound === 'none' || A.senaWound === 'healed') A.senaWound = 'bleeding'; A.rem ||= {}; }
  if (id === 'reckoning') arcCampPos();
  if (id === 'clay' && arcTamuGuest()) A.jealousDay ??= S.day + 1;
  if (id === 'seeds' && A.tribe === 'allied' && !A.skipped && !A.grainGift && A.choices.korr === 'peace') { A.grainGift = true; setTimeout(() => { banner(...ARCD.L.seeds.gift); give('grain', 3); }, 5200); }
  ARCS.ch = -1;
}
// ARC-FIX: the story advance (frame loop). A chapter that turns the season (autumn into winter, the thaw) comes in
// behind a short fade, and the season's look is set while the screen is dark instead of snapping under the player.
function arcAdvance() {
  const nx = CH[S.ch + 1]?.id, from = arcSeasonOf(CH[S.ch].id), to = nx && arcSeasonOf(nx);
  if (!nx || !S.arc || from === to || CH[S.ch + 1]?.epilogue || !playing) { S.ch++; enterChapter(); return; }
  fadeTo('', () => { S.ch++; enterChapter(); ARCS.season.snap = true; }, 900);
}
function arcSkip(id) {
  const A = S.arc;
  A.skipped = true;
  if (A.tribe === 'unknown') A.tribe = 'allied';
  if (id === 'outcast' && !A.choices.outcast) A.tamu = 'none';
  if (id === 'winter' && !A.choices.door) A.wena = 'none';
}

// ----- quest marker targets
function arcWhere(id) {
  const A = S.arc, c = A.choices;
  switch (id) {
    case 'smoke': return !A.coldCamp ? arcSpot('camp0') : !cnt('ash_seen') ? (arcHandPanel() ? [arcHandPanel().x, arcHandPanel().z] : CAVES[0].c) : arcSpot('ford');
    case 'outcast': { const t = arcGet('tamu'); return !A.tamuFound ? arcSpot('trail') : !c.outcast ? arcSpot('tree') : c.outcast === 'kill' && !A.graves.some((g) => g.who === 'Tamu') ? arcSpot('tree') : t ? [t.pos.x, t.pos.z] : houseAt(); }
    case 'house': return A.rift > 0 ? (S.time > 16 || S.time < 4 ? arcSpot('lake') : houseAt()) : houseAt();
    case 'winter': { const h = arcHome(); return h ? [h.x, h.z] : null; }
    case 'fever': {
      const r = A.rem || {};
      if (A.feverDone || A.senaWound === 'scarred' || !r.bled) { const b = arcBed(); return b ? [b.x, b.z] : null; }
      for (const k of ['willow', 'yarrow', 'moss']) if (!r[k]) return S.inv[k] >= ARC_HERB[k].n ? (arcBed() ? [arcBed().x, arcBed().z] : null) : arcSpot(k);
      const b = arcBed(); return b ? [b.x, b.z] : null;
    }
    case 'reckoning': return A.campPos && !c.korr ? A.campPos : houseAt();
    case 'bond': return S.inv.cord > 0 && S.close >= 75 ? arcSpot('stones') : houseAt();
  }
  return null;
}
const arcHandPanel = () => caves.panels.find((p) => p.hand && p.cave === 'echo') || caves.panels.find((p) => p.hand) || null;

// ----- branch-dependent goals (CH entries call arcGoals(id); goalsOf() reads them)
function arcGoals(id) {
  const A = S.arc, c = A.choices;
  switch (id) {
    case 'outcast': {
      const g = [['Follow the crows to the Great Tree', () => !!A.tamuFound || !!c.outcast], ['Decide the stranger\'s fate', () => !!c.outcast]];
      if (c.outcast === 'help') g.push(['Tend Tamu\'s wound with a poultice (E)', () => !!A.tamuTended]);
      if (c.outcast === 'kill') g.push(['Bury him beneath the Great Tree (E)', () => A.graves.some((x) => x.who === 'Tamu')]);
      return g;
    }
    case 'house': return A.rift > 0 || c.reconcile ? [['Make peace with Sena (Mirror Lake, at dusk)', () => !(A.rift > 0)]] : [];
    case 'winter': {
      const k = () => cnt('slept') - (A.winterStart ?? cnt('slept'));
      return [[`Store food that keeps in the basket (${Math.min(arcStored(), 8)}/8)`, () => arcStored() >= 8], [`Survive five winter nights (${clamp(k(), 0, 5)}/5)`, () => k() >= 5], ['Answer the strangers at the door', () => !!c.door]];
    }
    case 'raid': return [[`Build braziers around your home (${Math.min(arcBraziers(), 4)}/4, Tab)`, () => arcBraziers() >= 4 || !!A.raid.done], ['Face the night of the raid', () => !!A.raid.done]];
    case 'fever': {
      const r = A.rem || {}, ok = (k) => () => !!(A.rem || {})[k] || A.senaWound === 'scarred' || !!A.feverDone;
      return [['Stop her bleeding: a poultice on the wound (E at the bed)', ok('bled')],
        [`Willow bark, by the river (${Math.min(S.inv.willow, 2)}/2)`, ok('willow')], [`Yarrow, on Horse Meadow (${Math.min(S.inv.yarrow, 2)}/2)`, ok('yarrow')], ['Grey cave moss, in Flint Deep', ok('moss')],
        ['Sit with her through the night (E at the bed, evening)', () => !!A.feverDone]].map((g, i) => (i && (r[['', 'willow', 'yarrow', 'moss'][i]] || A.senaWound === 'scarred' || A.feverDone) ? [g[0].replace(/ \(\d\/\d\)/, ''), g[1]] : g));
    }
    case 'reckoning': {
      const g = [['Find the Ash camp, east of Horse Meadow', () => !!S.found.camp || !!c.korr], ['Face Korr', () => !!c.korr]];
      if (S.horse && (A.horseFate === 'taken' || A.horseFate === 'returned')) g.push([`Bring ${horseName()} home`, () => A.horseFate !== 'taken']);
      g.push(['Wait out the last of the winter', () => !!A.thaw]);
      return g;
    }
    case 'hearth': return A.home.scorched ? [['Repair the scorched walls (E outside the house)', () => !A.home.burned]] : [];
    case 'bond': return [['Grow close to Sena (Closeness 75)', () => S.close >= 75 || !!A.bonded], ['Braid an ochre cord (Tab)', () => S.inv.cord > 0 || !!A.bonded],
      ['Go to the Standing Stones with Sena at dusk', () => !!A.bonded || !!A.stonesDusk], ['Speak your vow', () => !!A.bonded]];
  }
  return [];
}

// ----- the chapter card: season line and last chapter's choices (TWD-style recap)
function arcCard(ch) {
  const se = ch.id === 'reckoning' && S.arc.thaw ? 'spring' : ARCD.SEASON_OF[ch.id] || 'summer';
  const el = $('card-season'), rc = $('card-recap');
  if (el) el.textContent = ch.epilogue ? '' : `${ARCD.SEASON_NAME[se]} · ${ARCD.ACT_NAME[se]}`;
  const prev = S.arc.lastCh; S.arc.lastCh = ch.id;
  const recap = prev && prev !== ch.id ? ARCD.recapLine(S.arc.memory, prev) : '';
  if (rc) rc.textContent = recap;
  return recap;
}
function arcMorningLine(line) {
  const A = S.arc;
  if (A.choices.jealous === 'walk' && !A.walkSaid) { A.walkSaid = true; return ARCD.L.jealous.walk[0][1]; }
  if (CH[S.ch].id === 'reckoning' && !A.choices.korr && !S.found.camp && !A.hintSaid) { A.hintSaid = true; return ARCD.L.reckoning.hint[1]; }   // ARC-FIX: the authored hint, as her morning line
  if (A.choices.door === 'refuse' && !A.refuseSaid) { A.refuseSaid = true; return ARCD.L.winter.refuseAfter[0][1]; }
  if (A.wena === 'lost' && S.day >= (A.slingDay ?? 1e9) && !A.slingSeen && !A.slingHint) { A.slingHint = true; return ARCD.L.winter.slingHint[1]; }
  if (A.senaWound === 'scarred' && A.feverDone && cnt('slept') % 4 === 0) return 'My leg remembers the winter before I do, these mornings. ' + line;
  if (arcWinterNow() && cnt('slept') % 3 === 1) return 'Frost on the blanket. Stay under it one breath longer. ' + line;
  return line;
}

// ----- per-frame (spec §5.8: after the chapter check)
function arcBoot() {
  ARCS.boot = true;
  arcSeasonBoot();
  ICON.brazier ||= ['#ff8a3c', 'Brazier']; ICON.cairn ||= ['#9a948c', 'Cairn'];
  arcMemTabs();
  on('hours', (e) => arcHours(e.h), 90);
  if (S.arc.campPos) setCampPOI(S.arc.campPos);
}
function updateArc(dt) {
  if (!ARCS.boot) arcBoot();
  if (arcCalmNow()) ARCS.calmUntil = Math.max(ARCS.calmUntil || 0, clock + 6);   // ARC-FIX: a grace after every scene
  for (let i = ARCS.waits.length - 1; i >= 0; i--) { const w = ARCS.waits[i]; if (w.subs ? subs.length === 0 && subT <= 0.35 : clock >= w.t) { ARCS.waits.splice(i, 1); w.r(); } }
  if (ARCS.ch !== S.ch) { ARCS.ch = S.ch; arcSync(); }
  arcNpcTick(dt);
  arcSeasonTick(dt);
  for (const k in ARCS.props) ARCS.props[k].update?.(dt);
  ARCS.doorLamp?.();
  if (mapOpen && !ARCS.mapWas && !$('memories').hidden) arcDrawMemories();   // the Memories tab, fresh each time the map opens
  ARCS.mapWas = mapOpen;
  ARCS.t -= dt; if (ARCS.t > 0) return;
  ARCS.t = 0.25;
  arcWinterWorld();
  if ((ARCS.slow -= 0.25) <= 0) {                    // every 2 s: refresh goal counters on the HUD
    ARCS.slow = 2;
    const q = goalsOf().map((g) => g[0] + (g[1]() ? 1 : 0)).join('|');
    if (q !== ARCS.q) { ARCS.q = q; drawQuest(); }
  }
  if (busy || paused || MAT.choice || P.downed > 0 || MAT.dead || ARCS.scene || R.on) return;
  if (S.arc.pending?.length && Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 7) arcSay(S.arc.pending.splice(0));
  if (CH[S.ch].mature && settings.matureStory === false && !S.village) { enterChapter(); return; }   // Mature story turned off mid-chapter (or an old save): skip on
  arcSling();
  arcBeats(CH[S.ch].id);
}
// Wena's empty snow camp: two days after the door was shut, by the ruins (no one there; her sling in the snow).
function arcSling() {
  const A = S.arc;
  if (A.wena !== 'lost' || S.day < (A.slingDay ?? 1e9) || S.ch > chIdx('reckoning')) return;
  const pr = ARCS.props.snowcamp || arcProp('snowcamp', true);
  if (A.slingSeen || arcDist(P.pos, pr.x, pr.z) > 9) return;
  A.slingSeen = true;
  banner(...ARCD.L.winter.slingBanner); arcSenaSays(ARCD.L.winter.sling);
  if (view !== 'fpp' && (!camShot || camShot.release)) {   // ARC-FIX: a held look at the frozen sling in the snow (ARC-FIX4: from the open side, the windbreak behind it)
    // ARC-FIX7: close and low on the sling itself (1.7 m, knee height), the snowed windbreak behind it; the letterbox lasts as long as the shot does
    const sx = pr.x + 0.55, sz = pr.z + 0.65, gy = Math.max(pr.g.position.y, getHeight(sx, sz)), a = 0.3, cx = sx + Math.sin(a) * 1.7, cz = sz + Math.cos(a) * 1.7;
    camShot = ARCS.shot = { pos: new THREE.Vector3(cx, Math.max(gy, getHeight(cx, cz)) + 0.85, cz), look: new THREE.Vector3(sx - 0.03, gy + 0.1, sz - 0.14), t: 5.5, ease: true, untilSubs: true, story: true };   // ARC-FIX4: story: the not-sitting branch of updatePlayer dropped every ease shot (sitShotOff) on its first frame
    if (!$('hud').classList.contains('cine')) {     // ARC-FIX5: letterboxed, HUD away for the held look
      const sh = camShot, t0 = performance.now(); cine(true);
      const iv = setInterval(() => {
        if (camShot === sh && performance.now() - t0 < 30000) return;
        clearInterval(iv);
        if (!ARCS.scene && !ROM.scene && !ROM.fk && !R.on && !MAT.choice) cine(false); else if (camShot === sh) camShot = null;
      }, 200);
    }
  }
  arcMem('sling', 'You found Wena\'s sling in an empty camp.');
  save();
}
// Rebuild the story props and NPCs from S.arc (chapter change, load, after a scene).
function arcSync() {
  const A = S.arc, id = CH[S.ch].id, at = (c) => S.ch >= chIdx(c);
  A.season = arcSeasonOf(id);
  if (A.ashHands) arcSmear('ash');
  if (A.campPos) setCampPOI(A.campPos);
  // Tamu: wounded at the tree, a body until buried, or a guest at home until the raid
  if (id === 'outcast' && !A.choices.outcast) arcTamuWounded();
  else if (A.choices.outcast === 'kill' && !A.graves.some((g) => g.who === 'Tamu')) arcTamuBody();
  else if (arcTamuGuest() && !A.raid.done && at('outcast')) arcTamuHome();
  else if (!ARCS.scene && !arcGet('tamu')?.dropFar) arcDrop('tamu');
  // Wena and Pell winter with you when the door was opened
  if (A.wena === 'saved' && at('winter')) arcWenaHome(); else { arcDrop('wena'); arcDrop('pell'); }
  // props
  arcProp('coldcamp', at('smoke') && !(A.skipped && !A.coldCamp) && S.ch <= chIdx('reckoning'));
  if (ARCS.props.coldcamp && id !== 'smoke') ARCS.props.coldcamp.update = null;
  arcProp('trail', id === 'outcast' && !A.choices.outcast);
  arcProp('snowcamp', A.wena === 'lost' && S.day >= (A.slingDay ?? 1e9) && S.ch <= chIdx('reckoning'));
  arcProp('ashcamp', !!A.campPos && at('reckoning') && !S.village);
  arcProp('vowfire', id === 'bond' || (id === 'newlife' && ARCS.scene === 'bond'));
  for (const k of ['willow', 'yarrow', 'moss']) arcProp('herb_' + k, id === 'fever' && !A.feverDone && A.senaWound !== 'scarred' && !A.rem?.[k] && !(S.inv[k] >= ARC_HERB[k].n));
  if (id === 'reckoning' && !A.choices.korr && A.campPos) arcKorrCamp();
  else if (!ARCS.scene) for (const e of [...ARCS.npcs]) if (/^(korr|hunter)/.test(e.id) && e.mode !== 'leave') arcDrop(e.id);
  arcScorch(!!A.home.burned);
  if (A.thaw && A.choices.korr && !S.village) arcFoalSpawn();
  if (A.horseFate === 'taken') { const o = tameHorse(); if (o) { if (P.ride === o) dismount(); remove(o); } }
  if (S.village) arcEpilogueProps();
  arcSenaFur(A.season === 'winter');                 // ARC-FIX: a heavier hide mantle over her dress for the winter chapters
}
function arcSenaFur(on) {
  if (on && !ARCS.senaFur) ARCS.senaFur = arcFurMantle(N.h, 0x5e4c3c);
  if (ARCS.senaFur) ARCS.senaFur.visible = on;
}

// ----- Tamu
function arcTamuWounded() {
  const [x, z] = arcSpot('tree'), [tx, tz] = LM.tree;
  const e = arcNpc('tamu', ARC_LOOK.tamu, x, z, 0);
  e.pos.set(x, 0, z); e.face = Math.atan2(x - tx, z - tz); e.mode = 'sit'; e.jy = -0.44; e.look = null;
  if (!e.wound) {                                    // Korr's spear, still in his side
    const sp = makeSpear(); sp.scale.setScalar(0.9);
    e.h.bones.spine_01.add(sp); sp.position.set(0.16, 0.05, 0.12); sp.rotation.set(0.5, 0, 1.15); e.wound = sp;
  }
}
function arcTamuBody() {
  const [x, z] = arcSpot('tree');
  const e = arcNpc('tamu', ARC_LOOK.tamu, x, z, 0);
  if (e.wound) { e.wound.parent?.remove(e.wound); e.wound = null; }
  arcDead(e);
}
function arcTamuHome() {
  const f = structs.find((s) => s.kind === 'fire') || arcHome(); if (!f) return;
  const w = f.kind === 'fire' ? toWorld(f, [0, 0, 2.45]) : new THREE.Vector3(f.x + 3, 0, f.z + 3);
  const e = arcNpc('tamu', ARC_LOOK.tamu, w.x, w.z, 0);
  if (e.wound) { e.wound.parent?.remove(e.wound); e.wound = null; }
  if (e.mode === 'dead') return;
  e.pos.set(w.x, 0, w.z); e.face = Math.atan2(f.x - w.x, f.z - w.z); e.mode = 'sit'; e.jy = -0.44; e.talk = false;
}
async function arcTamuFound() {
  const A = S.arc, L = ARCD.L.outcast, t = arcGet('tamu');
  A.tamuFound = true;
  await arcScene('outcast', async () => {
    ARCS.focus = t; arcShot(t, 60); t.talk = true;
    await arcTalk(L.found);
    t.talk = false;
    await arcChoose('outcast', 'The Wounded Stranger', ARC_OPTS.outcast(), { def: null, note: 'Tamu, of the Ash People. Korr\'s spear is still in him.' });
    const c = A.choices.outcast;
    if (c === 'help') {
      await arcTalk(L.help);
      await arcFade(L.helpFade, () => { arcTamuHome(); const h = arcHome(); if (h) { P.pos.set(h.x + 3.5, 0, h.z + 4); N.pos.set(h.x + 4.5, 0, h.z + 3); } S.time = (S.time + 3) % 24; }, 2800);
      toast('Tend his wound: E beside Tamu, with a poultice');
    } else if (c === 'kill') {
      say('Sena', 'Aro, wait—');
      await arcFade('', () => { arcTamuBody(); arcSfx(140, 0.25, 0.7); }, 600);   // a hard cut: it is over before the screen comes back
      arcSay(L.kill); await arcSubsDone();
    } else {
      await arcTalk(L.leave);
      t.mode = 'sit'; t.dropFar = true;              // he stays against the tree; gone once you are out of sight
    }
  });
}
function arcBuryTamu() {
  arcScene('bury', async () => {
    await arcFade('You dig into the roots of the Great Tree, and lay him there, and cover him with river stones.', () => {
      arcDrop('tamu'); arcCairn('Tamu'); S.time = (S.time + 2) % 24;
    }, 3000);
    arcSay(ARCD.L.outcast.buried); await arcSubsDone();
  });
}
function arcCairn(who) {
  const A = S.arc;
  if (A.graves.some((g) => g.who === who)) return;
  const [x, z] = arcSpot('grave'), off = A.graves.length * 1.8;
  const st = placeStruct('cairn', x + off, z, Math.atan2(LM.tree[0] - x, LM.tree[1] - z) + Math.PI, true);
  A.graves.push({ who, x: +st.x.toFixed(1), z: +st.z.toFixed(1), day: S.day });
}

// ----- Korr and the Ash hunters
function arcAsh(n, x, z, face, side = 1, spear = 'back') {
  const k = arcNpc('korr', ARC_LOOK.korr, x, z, face, { spear: 'low' });
  const out = [k];
  for (let i = 0; i < n; i++) {
    const a = face + Math.PI / 2, s = i - (n - 1) / 2;
    out.push(arcNpc('hunter' + i, arcHunterLook(i), x + Math.sin(a) * s * 2.4 - Math.sin(face) * 1.6 * side, z + Math.cos(a) * s * 2.4 - Math.cos(face) * 1.6 * side, face, { spear }));
  }
  return out;
}
function arcAshLeave(dist = 60) {
  for (const e of ARCS.npcs) if (/^(korr|hunter)/.test(e.id) && e.mode !== 'dead') {
    const a = e.face + Math.PI; e.mode = 'leave'; e.spd = 2.2; e.tx = e.pos.x + Math.sin(a) * dist; e.tz = e.pos.z + Math.cos(a) * dist;
  }
}
async function arcFord() {
  const A = S.arc, L = ARCD.L.smoke, [fx, fz] = arcSpot('ford'), side = -Math.sign(P.pos.x - fx) || 1;
  let x = fx, i = 0; while (i++ < 40 && getHeight(x, fz) < 0.7) x += side; x += side * 3;   // the far bank
  const face = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  arcAsh(3, x, fz, face, 1);
  discoverPOI('nford');                              // first, so "Discovered" never covers the Ash People's banner
  banner(...L.fordBanner);
  await arcScene('ford', async () => {
    const k = arcGet('korr');
    ARCS.focus = k; arcShot(k, 80); arcTalkers(['korr', 'hunter0', 'hunter1', 'hunter2']);
    if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) > 25) N.pos.set(P.pos.x - side * 1.5, 0, P.pos.z + 1.2);
    await arcTalk(L.fordArrive);
    await arcChoose('ford', 'The Ford', ARC_OPTS.ford(), { timer: 12, def: 2, note: 'Korr waits on the far bank. His hunters watch your hands.' });
    const c = A.choices.ford;
    await arcTalk(L[c]);
    arcAshLeave(70); arcShot(k, 80);
    arcSay([L.after[c]]); await arcSubsDone();
  });
}
function arcKorrCamp() {
  const [x, z] = S.arc.campPos;
  const ks = arcAsh(3, x + 2.2, z, 0, 1, 'back');
  ks.forEach((e, i) => { const a = (i / ks.length) * 6.283 + 0.4; e.pos.set(x + Math.cos(a) * 2.5, 0, z + Math.sin(a) * 2.5); e.face = Math.atan2(x - e.pos.x, z - e.pos.z); e.mode = 'sit'; e.jy = -0.44; });
}
async function arcReckoning() {
  const A = S.arc, L = ARCD.L.reckoning, k = arcGet('korr');
  await arcScene('reckoning', async () => {
    for (const e of ARCS.npcs) if (/^(korr|hunter)/.test(e.id)) { e.mode = 'stand'; e.jy = 0; e.look = 'P'; }
    k.mode = 'walk'; k.tx = P.pos.x + (k.pos.x - P.pos.x) * 0.45; k.tz = P.pos.z + (k.pos.z - P.pos.z) * 0.45; k.then = 'talk'; k.look = 'P';
    await arcWait(1.5);
    ARCS.focus = k; arcShot(k, 90);
    await arcTalk(Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 15 ? L.meetWith : L.meet);   // ARC-FIX: never 'You came alone' with Sena beside him
    await arcChoose('korr', 'Korr', ARC_OPTS.korr(), { def: null, note: 'His hunters are on their feet around the fire. Korr has not reached for his spear. Yet.' });
    const c = A.choices.korr;
    const duel = c !== 'peace' && typeof cmbDuel === 'function' && settings.matureStory !== false ? await arcKorrDuel(k, c) : null;   // phase C: a real CMB fight
    const c2 = A.choices.korr;                       // a duel meant to spare him can still end with him dead
    if (c2 === 'kill') {
      if (duel === 'dead') { for (const e of ARCS.npcs) if (/^hunter/.test(e.id)) { e.mode = 'leave'; e.spd = 4; e.tx = e.pos.x + (e.pos.x - P.pos.x) * 8; e.tz = e.pos.z + (e.pos.z - P.pos.z) * 8; } await arcWait(2.5); }
      else await arcFade(L.killFade, () => { arcDead(arcGet('korr') || k); for (const e of ARCS.npcs) if (/^hunter/.test(e.id)) { e.mode = 'leave'; e.spd = 4; e.tx = e.pos.x + (e.pos.x - P.pos.x) * 8; e.tz = e.pos.z + (e.pos.z - P.pos.z) * 8; } }, 2600);
      arcSenaSays(L.kill);
    } else if (c2 === 'spare') {
      if (duel !== 'downed') await arcFade(L.spareFade, () => { const kk = arcGet('korr') || k; kk.mode = 'sit'; kk.jy = -0.44; }, 2400);
      ARCS.focus = arcGet('korr') || k;
      await arcTalk(L.spare);
    } else { await arcTalk(L.peace); }
    if (A.horseFate === 'taken') { arcHorseBack(); arcSay([L.horseBack]); await arcSubsDone(); }
    await arcFade(L.thawFade, () => { A.thaw = true; A.season = 'spring'; if (c !== 'kill') arcAshLeave(0.01); arcFoal(); ARCS.foalShot = ARCS.shot; }, 3200);
    if (ARCS.foalShot && camShot === ARCS.foalShot) camShot.t = Math.max(camShot.t, 6);
    arcSay(L.foal); await arcSubsDone(); await arcWait(1.5);
  });
}
// The duel (phase C): the story's Korr steps out and CMB's Korr (a chief: no flight; for "spare", he yields at 0) fights
// Aro on the same spot, his hunters watching. Resolves 'dead' | 'downed' | 'lost' | null (no fight). Aro down: the old cut.
async function arcKorrDuel(k, c) {
  const A = S.arc, x = k.pos.x, z = k.pos.z, face = k.face;
  for (const e of ARCS.npcs) if (/^hunter/.test(e.id)) { e.mode = 'stand'; e.look = 'P'; e.jy = 0; }
  arcDrop('korr');
  if (camShot && camShot === ARCS.shot) camShot = null; ARCS.shot = null; ARCS.focus = null;
  ARCS.duel = true;
  { const ax = P.pos.x - x, az = P.pos.z - z, d = Math.hypot(ax, az) || 1; N.pos.set(P.pos.x + ax / d * 4.5 + az / d * 1.5, 0, P.pos.z + az / d * 4.5 - ax / d * 1.5); N.path = null; N.speed = 0; }   // Sena steps back behind Aro (she stood inside Korr)
  const p = cmbDuel(x, z, { chief: true, name: 'Korr', face, surrender: c === 'spare', noFlee: true });
  const f = [...foes].reverse().find((o) => o.chief && o.state === 'live') || null;
  if (f) { f.arcDuel = true; arcRaiderLook(f); }
  say('Korr', c === 'spare' ? 'You want to beat me and walk away? Try.' : 'Good. No more talking.');
  let res = null;
  p.then((r) => { res ??= r; });
  try {                                              // cmbDuel waits on a yielded man for a surrender choice; the story decides here instead
    while (!res) { await arcWait(0.25); if (f?.mode === 'downed') res = 'downed'; else if (MAT.dead) res = 'lost'; }
  } finally { ARCS.duel = false; }
  if (res === 'lost') {                              // Aro went down: wait for him to be back on his feet, then the old hard cut
    while ((P.downed > 0 || MAT.rescuing) && !MAT.dead) await arcWait(0.5);
    if (MAT.dead) return res;
    if (f) f.spared = true; arcFoeGone(f); arcNpc('korr', ARC_LOOK.korr, x, z, face, { spear: 'low' });
    return res;
  }
  if (res === 'dead') {
    if (A.choices.korr !== 'kill') {               // he was to be spared, and died: the choice is rewritten as it happened
      A.choices.korr = 'kill'; A.tribe = 'hostile'; arcAxis('mercy', -3);
      const m = A.memory.findLast?.((e) => e.id === 'korr'); if (m) m.text = 'You meant to spare Korr. He died under your hands.';
    }
    return res;
  }
  if (res === 'downed' && f) {                       // spared: on his knees, beaten; the story's Korr sits where he fell
    await arcWait(1.2);
    const px = f.pos.x, pz = f.pos.z, fa = f.face;
    f.spared = true; arcFoeGone(f);                  // (spared: cmbDuel's own watch ends too)
    const kk = arcNpc('korr', ARC_LOOK.korr, px, pz, fa); kk.pos.set(px, 0, pz); kk.mode = 'sit'; kk.jy = -0.44; kk.look = 'P';
  }
  return res;
}
function arcHorseTaken() {
  const A = S.arc; if (!S.horse) return;
  A.horseFate = 'taken';
  const o = tameHorse(); if (o) { horseSave(); if (P.ride === o) dismount(); remove(o); }
}
function arcHorseBack() {
  const A = S.arc; A.horseFate = 'returned';
  if (!S.horse || tameHorse()) return;
  const x = P.pos.x + 2.5, z = P.pos.z + 1.5, o = spawn(S.horse.kind || 'horse', x, z, { tame: true, horse: true, home: horseHome(), trust: 3 });
  o.root.rotation.y = o.dir = P.face; S.horse.riding = false;
}
// The newborn (idempotent: also after a load, for as long as the story runs): a second, smaller foal with the wild herd.
function arcFoalSpawn() {
  const [mx, mz] = LM.meadow, [x, z] = arcLand(mx - 6, mz + 4, 10);
  if (!horseHerd) spawnWildHerd();
  if (horseHerd && !animals.some((o) => o.arcFoal && o.state === 'live')) spawn('horse', x, z, { herd: horseHerd, ox: x - horseHerd.x, oz: z - horseHerd.z, horse: true, wild: true, trust: 0, foal: true, arcFoal: true, scale: 0.26 });
  return [x, z];
}
function arcFoal() {                                 // the thaw: a foal on Horse Meadow (WP4's wild herd), and a long look at it
  try {
    const [x, z] = arcFoalSpawn();
    const gy = getHeight(x, z);
    camShot = ARCS.shot = { pos: new THREE.Vector3(x + 5.5, gy + 1.9, z + 5.5), look: new THREE.Vector3(x, gy + 0.6, z), t: 9, untilSubs: true };   // ARC-FIX: held over the lines (it timed out under the fade and cut back to the camp)
    if (P.pos.distanceTo(new THREE.Vector3(x, P.pos.y, z)) > 150) { const h = arcHome(); if (h) { P.pos.set(h.x + 3, 0, h.z + 4); N.pos.set(h.x + 4, 0, h.z + 3); } }
  } catch (err) { console.error('ARC foal', err); }
}

// ----- Wena and Pell (Pell is a child: hidden indoors when anything hostile is near, and for the whole raid)
function arcWenaHome() {
  const h = structs.find((s) => s.kind === 'hut' && s.rise >= 1) || arcHome(); if (!h) return;
  const d = h.kind === 'hut' ? toWorld(h, [0.9, 0, 3.0]) : new THREE.Vector3(h.x - 5, 0, h.z + 4);
  const w = arcNpc('wena', ARC_LOOK.wena, d.x, d.z, 0), p = arcNpc('pell', ARC_LOOK.pell, d.x + 1.2, d.z + 0.6, 0, { child: true, nightIn: true });
  w.pos.set(d.x, 0, d.z); w.face = (h.rot || 0); w.mode = 'sit'; w.jy = -0.44; w.nightIn = true;
  p.home = d; p.mode = 'stand'; p.look = 'P';
}
function arcPellTick() {                             // Pell potters about near Wena by day
  const p = arcGet('pell'); if (!p || p.hidden || p.mode === 'walk' || p.still) return;   // still: tests hold him for a portrait
  if (rand() >= 0.15) return;
  // only to open ground: the spot and the way there clear of every wall (he never walks into the house)
  const clear = (x, z) => { _kv.set(x, 0, z); collide(_kv, 0.5); return Math.hypot(_kv.x - x, _kv.z - z) < 0.01; };
  for (let t = 0; t < 6; t++) {
    const a = rand() * 6.283, r = 1.5 + rand() * 3, tx = p.home.x + Math.cos(a) * r, tz = p.home.z + Math.sin(a) * r;
    if (![0.25, 0.5, 0.75, 1].every((k) => clear(p.pos.x + (tx - p.pos.x) * k, p.pos.z + (tz - p.pos.z) * k))) continue;
    p.tx = tx; p.tz = tz; p.mode = 'walk'; p.spd = 1.3; p.then = 'stand'; return;
  }
}
async function arcDoor() {
  const A = S.arc, L = ARCD.L.winter, h = arcHome();
  const door = h.kind === 'house' ? toWorld(h, [0, 0, 3.6]) : h.kind === 'hut' ? toWorld(h, [0, 0, 2.8]) : new THREE.Vector3(h.x + 2, 0, h.z + 2);
  const a = Math.atan2(door.x - h.x, door.z - h.z), sx = door.x + Math.sin(a) * 2.2, sz = door.z + Math.cos(a) * 2.2;
  const w = arcNpc('wena', ARC_LOOK.wena, sx, sz, a + Math.PI), p = arcNpc('pell', ARC_LOOK.pell, sx + Math.cos(a) * 0.9, sz - Math.sin(a) * 0.9, a + Math.PI, { child: true });
  w.look = p.look = 'P'; w.mode = 'talk';
  if (Math.hypot(P.pos.x - door.x, P.pos.z - door.z) > 6) { P.pos.set(door.x - Math.sin(a) * 1.0, 0, door.z - Math.cos(a) * 1.0); P.face = a; }
  if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) > 6) N.pos.set(P.pos.x + Math.cos(a) * 1.3, 0, P.pos.z - Math.sin(a) * 1.3);
  const lamp = !torchOn && world.env.night > 0.3;   // night: the hearth's glow spills out of the open door onto them (Aro's idle torch light)
  if (lamp) { torch.light.position.set(door.x - Math.sin(a) * 0.6, getHeight(door.x, door.z) + 1.7, door.z - Math.cos(a) * 0.6); torch.light.color.setHex(0xffa25a); }
  await arcScene('door', async () => {
    if (lamp) ARCS.doorLamp = () => { if (!torchOn) torch.light.intensity = 7.5 * (0.94 + Math.sin(clock * 6) * 0.04 + Math.sin(clock * 15) * 0.02); };
    arcKnock();
    ARCS.focus = w; arcShot(w, 80);
    await arcTalk(L.door);
    const n = arcStored() + ARCD.countFood(S.inv);
    await arcChoose('door', 'Strangers at the Door', ARC_OPTS.door(), { def: null, note: `A woman and a small boy, white with snow. You have ${n} meals that keep.` });
    const c = A.choices.door;
    await arcTalk(L[c]);
    if (c === 'share') { await arcFade('That night there were four by the fire.', () => { arcDrop('wena'); arcDrop('pell'); arcWenaHome(); }, 2200); }
    else { for (const e of [w, p]) { e.mode = 'leave'; e.spd = 1.2; e.tx = e.pos.x + Math.sin(a) * 80; e.tz = e.pos.z + Math.cos(a) * 80; } }
  });
  if (ARCS.doorLamp) { ARCS.doorLamp = null; if (!torchOn) { torch.light.intensity = 0; torch.light.color.setHex(0xff8f40); } }
}
function arcKnock() { for (let i = 0; i < 3; i++) setTimeout(() => arcSfx(160, 0.12, 0.6), i * 260); setTimeout(() => { for (let i = 0; i < 2; i++) setTimeout(() => arcSfx(150, 0.12, 0.5), i * 260); }, 1300); }

// ----- the raid (phase C: CMB waves via spawnRaider; narrated when fleeing, with Mature story Off, or without CMB)
function arcKidsIndoors(on) { ARCS.raidOn = on; for (const e of ARCS.npcs) if (e.child || e.id === 'wena') e.hidden = on; for (const c of kids) c.h.root.visible = !on; if (on) arcTamuGuard(true); }   // Wena stays in with Pell; ARC-FIX: a guest Tamu stands by Sena, seen (he was hidden, then died off-screen)
// ARC-FIX: a guest Tamu on his feet with a spear, keeping between Sena and the dark through the raid (scripted, not a CMB fighter)
function arcTamuGuard(start = false) {
  const t = arcGet('tamu'); if (!t || t.mode === 'dead' || !arcTamuGuest()) return;
  if (start) { t.hidden = false; t.jy = 0; t.talk = false; t.h.spear.visible = true; t.h.place(t.h.spear, 'hand'); }
  const tx = N.pos.x + Math.sin(N.face) * 1.4 + Math.cos(N.face) * 0.9, tz = N.pos.z + Math.cos(N.face) * 1.4 - Math.sin(N.face) * 0.9;
  if (start && Math.hypot(t.pos.x - tx, t.pos.z - tz) > 15) t.pos.set(tx, 0, tz);
  if (Math.hypot(t.pos.x - tx, t.pos.z - tz) > 1.2) { t.mode = 'walk'; t.tx = tx; t.tz = tz; t.spd = 3.4; t.then = 'stand'; }
  else if (t.mode !== 'walk') t.mode = 'stand';
  const f = foes.filter((o) => o.live).sort((a, b) => Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) - Math.hypot(b.pos.x - t.pos.x, b.pos.z - t.pos.z))[0];
  t.look = f ? f.pos : 'N';
}
// Phase C: when CMB is present (spawnRaider) and the home is defended, the raid is a real fight in two waves; fleeing,
// Mature story Off and a missing CMB keep the narrated version. The consequences are the same either way (arcRaidAfter).
const ARC_WAVE = { story: 3, survivor: 5, hardcore: 6, custom: 5 };
const ARC_ROLES = [['brawler', 'thrower', 'brawler', 'brawler', 'thrower'], ['torchbearer', 'brawler', 'torchbearer', 'thrower', 'brawler']];   // wave 2 brings the torches
function arcRaid() {
  const A = S.arc;
  if (A.raid.done || ARCS.scene) return false;
  if (R.on) endRest();
  arcScene('raid', async () => {
    const L = ARCD.L.raid, resumed = (A.raid.wave || 0) > 0;
    arcKidsIndoors(true);                            // GUARDRAIL: children first, before anything else happens
    A.raid.wave = Math.max(1, A.raid.wave || 0);
    if (!resumed) { banner(...L.banner); await arcWait(3.2); }   // GORE-FIX: the banner is read before the timed choice opens over it
    if (!A.choices.raid) {
      arcSay(L.surprise); await arcSubsDone();
      $('event').classList.remove('on');
      await arcChoose('raid', 'Fire in the Night', ARC_OPTS.raid(), { timer: 10, def: 0 });
    }
    if (A.choices.raid !== 'flee' && typeof spawnRaider === 'function' && settings.matureStory !== false) await arcRaidFight(resumed);
    else await arcRaidNarrated();
  });
  return true;
}
// The Ash People's look on a CMB raider: grey hands to the wrist and a hide mantle (they came down out of the snow).
function arcRaiderLook(f, i = 0) {
  try { arcAshHands(f.h, f.chief ? 0.9 : 0.85); arcFurMantle(f.h, f.chief ? 0x4a4038 : [0x6b5a48, 0x5d5044, 0x7a6650, 0x625548][i % 4]); } catch (err) { console.error('ARC raider look', err); }
}
// A raider the story is done with (a spared Korr, the duel's stand-in): out of the world and out of foes[].
function arcFoeGone(f) {
  if (!f) return;
  scene.remove(f.h.root); if (f.meter) scene.remove(f.meter); if (f.pbar) scene.remove(f.pbar);
  const i = foes.indexOf(f); if (i >= 0) foes.splice(i, 1);
}
const arcFoeDone = (f) => f.state === 'dead' || f.fled || f.spared || f.mode === 'flee' || !foes.includes(f);
function arcRaidSpawn(n, a0, cx, cz, wave) {
  const first = wave === 1;
  const A = S.arc, out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i - (n - 1) / 2) * 0.3, r = 32 + (i % 2) * 5, [x, z] = arcLand(cx + Math.sin(a) * r, cz + Math.cos(a) * r, 8);
    const tamu = first && i === 0 && A.tamu === 'gone' && !A.choices.tamu && !A.raid.tamuSpawned;
    const k = (A.raid.spawned = (A.raid.spawned || 0) + 1) - 1, roles = ARC_ROLES[first ? 0 : 1];
    const f = spawnRaider(x, z, tamu ? { name: 'Tamu', role: 'brawler', surrender: true, noFlee: true, mode: 'combat', face: a + Math.PI, band: 'raid' + wave } : { role: roles[i % roles.length], mode: 'combat', face: a + Math.PI, band: 'raid' + wave });
    if (!f) continue;
    f.arcRaid = true; arcRaiderLook(f, k);
    if (first && !tamu) raidTorch(f, out.length < 2);   // GORE-FIX: the first wave comes down the hill with lit torches
    if (tamu) { f.arcTamu = true; A.raid.tamuSpawned = true; }
    out.push(f);
  }
  return out;
}
async function arcRaidFight(resumed) {
  const A = S.arc, L = ARCD.L.raid, RD = A.raid, h = arcHome();
  const cx = h ? h.x : P.pos.x, cz = h ? h.z : P.pos.z, camp = arcCampPos(), a0 = Math.atan2(camp[0] - cx, camp[1] - cz);
  const lit = arcBraziers();
  RD.left ??= (ARC_WAVE[S.diff.mode] ?? 5) + (lit < 4 ? 1 : 0) + (A.tamu === 'gone' && !A.choices.tamu ? 1 : 0);   // the dark lets one more torch through
  RD.lit = lit;
  if (Math.hypot(P.pos.x - cx, P.pos.z - cz) > 45) { P.pos.set(cx + 3.2, 0, cz + 4.2); P.face = a0; }
  if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) > 12) N.pos.set(P.pos.x - Math.cos(a0) * 1.6, 0, P.pos.z + Math.sin(a0) * 1.6);
  if (P.ride) dismount();
  ARCS.raidFight = true; ARCS.focus = null;
  const all = [];
  try {
    for (let wave = RD.wave; wave <= 2 && RD.left > 0; wave++) {
      RD.wave = wave;
      if (wave === 2 && !A.choices.guard) {          // they split up: the stable or the house (spec "mid-fight")
        if (S.horse && A.horseFate !== 'taken') await arcChoose('guard', 'They split up', ARC_OPTS.guard(), { timer: 10, def: 1, note: 'More torches on the hill. Two run for the stable, two for the house.' });
        else A.choices.guard = 'house';
      }
      const n = wave === 1 && RD.left > 2 ? Math.ceil(RD.left / 2) : RD.left, rest = RD.left - n;   // wave 2 waits for wave 1
      const list = arcRaidSpawn(n, a0 + (wave === 2 ? (A.choices.guard === 'stable' ? 0.5 : -0.5) : 0), cx, cz, wave);
      all.push(...list);
      if (!list.length) { RD.left = 0; break; }
      if (wave === 1 && !resumed) {                  // a look up the hill at the torches coming down
        const f0 = list[0], gy = getHeight(P.pos.x, P.pos.z);
        if (view !== 'fpp') camShot = ARCS.shot = { pos: new THREE.Vector3(P.pos.x - Math.sin(a0) * 4, gy + 2.6, P.pos.z - Math.cos(a0) * 4), look: new THREE.Vector3(f0.pos.x, getHeight(f0.pos.x, f0.pos.z) + 1.4, f0.pos.z), t: 3.5 };
        say('Sena', RD.lit >= 4 ? 'The braziers! I can see them coming. Aro, there!' : 'I cannot see them, Aro. Only the torches.');
        await arcWait(3.2);
        if (camShot === ARCS.shot) camShot = null; ARCS.shot = null;
      }
      RD.left = list.length + rest; save();
      let t0 = clock;
      for (;;) {                                     // the fight: until every raider of this wave is dead, gone or spared
        await arcWait(0.25);
        if (MAT.dead) return;
        arcTamuGuard();                              // ARC-FIX: Tamu keeps by Sena
        const open = list.filter((f) => !arcFoeDone(f));
        const tm = open.find((f) => f.arcTamu && f.mode === 'downed' && !f.deciding && !A.choices.tamu);
        if (tm && open.length === 1 && !(P.downed > 0) && !MAT.choice) TRIBE.decide(tm);   // the last one standing is Tamu on his knees: Aro must answer
        if (MAT.choice) for (const f of open) if (f.state === 'live') f.stun = Math.max(f.stun || 0, 0.3);   // nobody strikes while a choice is open
        if (open.length + rest !== RD.left) { RD.left = open.length + rest; save(); }   // a reload mid-raid brings back only those still fighting
        if (!open.length) break;
        if (clock - t0 > 300) { for (const f of open) if (f.state === 'live' && f.mode !== 'downed') TRIBE.flee(f); t0 = clock; }   // a long stand-off: the rest lose heart
      }
      RD.left = rest;
    }
  } finally { ARCS.raidFight = false; }
  while ((P.downed > 0 || MAT.rescuing) && !MAT.dead) await arcWait(0.5);   // Aro back on his feet before the morning comes
  if (MAT.dead) return;
  for (const f of all) if (f.arcTamu && f.state === 'dead' && !A.choices.tamu) { A.choices.tamu = 'fell'; A.tamu = 'dead'; arcMem('tamu', 'Tamu came with the raiders, and died in the fight.'); }
  if (A.tamu === 'dead' && A.raid.tamuSpawned) arcCairn('Tamu');
  await arcWait(1.5);
  // the consequences of the guard choice: the house, or the horse
  if (A.choices.guard === 'stable') await arcFade(L.stableFade, () => arcBurn(), 2600);
  else if (S.horse && A.horseFate !== 'taken') await arcFade(L.houseFade, () => arcHorseTaken(), 2600);
  if (RD.lit < 4) { arcRaidStash(0.5); toast('They took half the basket in the dark. More braziers would have kept them back.'); }
  await arcRaidAfter();
}
async function arcRaidNarrated() {
  const A = S.arc, L = ARCD.L.raid, stand = A.choices.raid !== 'flee', lit = arcBraziers();
  A.raid.narrated = true;
  if (stand) {
    await arcFade(L.standFade, null, 2800);
    if (!A.choices.guard) {
      if (S.horse && A.horseFate !== 'taken') await arcChoose('guard', 'They split up', ARC_OPTS.guard(), { timer: 10, def: 1, note: 'Two run for the stable with torches, two for the house.' });
      else A.choices.guard = 'house';
    }
    if (A.choices.guard === 'stable') await arcFade(L.stableFade, () => arcBurn(), 2600);
    else if (S.horse) await arcFade(L.houseFade, () => arcHorseTaken(), 2600);
    if (lit < 4) { arcRaidStash(0.5); toast('They took half the basket. More braziers would have kept them back.'); }
  } else {
    await arcFade(L.fleeFade, () => { arcRaidStash(1); arcBurn(); if (!P.ride) arcHorseTaken(); }, 3400);
  }
  await arcRaidAfter();
}
// The same in every version: Tamu's fate, Sena's spear wound (always), dawn.
async function arcRaidAfter() {
  const A = S.arc, L = ARCD.L.raid;
  if (arcTamuGuest()) {                              // Tamu dies shielding Sena
    A.tamu = 'dead'; arcMem('tamu', 'Tamu died shielding Sena.');
    const cineOn = !$('hud').classList.contains('cine'); if (cineOn) cine(true);   // ARC-FIX4: letterboxed, HUD away
    await arcFade('', () => arcTamuFall(), 700);     // ARC-FIX4: a dip to black: he is down at Sena's side, on open ground, in the shot
    await arcWait(1.2);
    arcSay(L.tamuDies); await arcSubsDone();
    await arcWait(1.2);
    await arcFade(L.tamuBuried, () => { ARCS.nHold = null; N.h.pose = null; arcDrop('tamu'); arcCairn('Tamu'); }, 2600);
    if (cineOn) ARCS.dawnCine = true;               // ARC-FIX5: the letterbox stays through to the dawn (no HUD flash between the two fades)
  } else if (A.tamu === 'gone' && !A.choices.tamu) { // he came with them; he is on his knees. Only an explicit pick kills him (never the default)
    await arcChoose('tamu', 'Tamu', ARC_OPTS.tamu(), { def: 0, note: L.tamuSeen });
    if (A.choices.tamu === 'kill') { await arcFade('', () => arcSfx(140, 0.25, 0.7), 500); arcSay(L.tamuKill); await arcSubsDone(); arcCairn('Tamu'); }   // a hard cut, never shown
    else { arcSay(L.tamuSpare); await arcSubsDone(); }
  }
  A.senaWound = 'bleeding';
  if (ARCS.raidFoes) ARCS.raidFoes = null;
  await arcFade('', () => {
    const h = arcHome(), hrs = ((6.5 - S.time) % 24 + 24) % 24;
    if (S.time + hrs >= 24) S.day++; skipHours(hrs);
    for (const f of [...foes]) if (f.arcRaid) arcFoeGone(f);   // whoever is still out there is long gone by morning; the dead are carried off
    if (h) { GR.clearSplatsNear(h.x, h.z, 60); GR.clearPieces(); }   // GUARDRAIL: the children come out at dawn: no bodies or blood left by the home
    arcUnscorch();
    if (A.home.burned) arcScorch(true);
    if (h) { P.pos.set(h.x + 3.2, 0, h.z + 4.2); N.pos.set(h.x + 4.2, 0, h.z + 3.4); }
    if (N.downed > 0) { N.downed = 0; S.nhp = Math.max(S.nhp, 30); }   // ARC-FIX4: no revive line: the dawn lines carry it
    S.nhp = Math.min(S.nhp, 45);
    if (h) { ARCS.focus = null; arcDawnStage(h); if (!$('hud').classList.contains('cine')) { ARCS.dawnCine = true; cine(true); } }   // ARC-FIX4: dawn opens on Sena wounded on the ground, Aro kneeling over her
  }, 1400);
  if (ARCS.nHold?.lie) busy = true;                 // ARC-FIX4: he stays knelt over her through the lines
  await arcWait(0.6);
  arcSay(L.dawn); arcSay(L.wound); await arcSubsDone();   // ARC-FIX: Aro's 'Stay awake' line was never played
  arcDawnUp(); await arcWait(1.6);                   // ARC-FIX4: she gets up, slowly
  if (ARCS.dawnCine) { ARCS.dawnCine = false; cine(false); }
  if (camShot && camShot === ARCS.shot) { camShot = null; ARCS.shot = null; }
  A.raid.done = true; A.raid.wave = 0; A.raid.left = 0;
  arcKidsIndoors(false);
}
// ARC-FIX4: the end of the raid: behind a dip to black, Tamu lies on clear, open ground at Sena's side (never across a
// fire bench, a brazier or a wall: his whole length is tested), Sena kneels at his chest, raiders who fell on the fire
// or in the shot are moved off it, and a low side-on shot holds the two of them, letterboxed, for his last line.
function arcClearAt(x, z, r) {
  for (const q of structs) {
    if (!(q.rise > 0.2)) continue;
    const R = q.kind === 'fire' ? 3.1 : q.kind === 'house' || q.kind === 'hut' || q.kind === 'stable' ? (q.radius || 3) + 0.4 : (q.radius || 0.9);
    if (Math.hypot(q.x - x, q.z - z) < R + r) return false;
  }
  _acb.set(x, 0, z); collide(_acb, r);
  if (Math.abs(_acb.x - x) + Math.abs(_acb.z - z) > 1e-3) return false;
  return true;
}
// A body lying from (x, z) along angle a: the root is at the hips' end, the clip lays it out up to ~1.7 m either way.
function arcBodyClear(x, z, a) {
  const dx = Math.sin(a), dz = Math.cos(a);
  for (const k of [0, 0.85, -0.85, 1.6, -1.6]) if (!arcClearAt(x + dx * k, z + dz * k, k ? 0.32 : 0.45)) return false;
  return true;
}
// Sena's spot near (x, z) and an angle round her where a body lies clear (spec: he falls in front of her).
function arcPairSpot(x, z, bodyD = 1.1) {
  for (const rr of [0, 1.5, 3, 4.5, 6, 8]) for (let k = 0; k < (rr ? 10 : 1); k++) {
    const nx = x + Math.sin(k * 0.628) * rr, nz = z + Math.cos(k * 0.628) * rr;
    if (!arcClearAt(nx, nz, 0.45)) continue;
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4, bx = nx + Math.sin(a) * bodyD, bz = nz + Math.cos(a) * bodyD;
      if (arcBodyClear(bx, bz, a + Math.PI / 2)) return { nx, nz, bx, bz, a };
    }
  }
  return null;
}
// Fallen raiders on a fire or within r of a point are carried clear (they read as props through the logs and flames).
function arcClearBodies(pts, r = 2.4) {
  for (const f of foes) if (f.dropped && Math.hypot(f.dropped.position.x - pts[0][0], f.dropped.position.z - pts[0][1]) < 8) f.dropped.visible = false;   // ARC-FIX7: no dropped axe or spear standing in the shot
  for (const f of foes) {
    if (f.state !== 'dead') continue;
    const onFire = structs.some((q) => q.kind === 'fire' && Math.hypot(q.x - f.pos.x, q.z - f.pos.z) < 3.1);
    if (!onFire && !pts.some(([x, z]) => Math.hypot(x - f.pos.x, z - f.pos.z) < r)) continue;
    const a0 = Math.atan2(f.pos.x - pts[0][0], f.pos.z - pts[0][1]);
    for (const rr of [5, 6.5, 8, 10]) {
      let done = false;
      for (const sw of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
        const x = pts[0][0] + Math.sin(a0 + sw) * rr, z = pts[0][1] + Math.cos(a0 + sw) * rr;
        if (arcBodyClear(x, z, f.face) && !pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < r + 1)) { f.pos.set(x, getHeight(x, z), z); f.h.root.position.copy(f.pos); done = true; break; }
      }
      if (done) break;
    }
  }
}
// A low side-on shot of a kneeling one and a lying one (from the side away from walls and trunks).
function arcLowShot(x1, z1, x2, z2, t = 60) {
  if (view === 'fpp') return;
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, gy = Math.max(getHeight(mx, mz), 0.2), a = Math.atan2(x2 - x1, z2 - z1);
  let best = null, bs = -1e9;
  for (const sw of [0, Math.PI, 0.5, -0.5, Math.PI + 0.5, Math.PI - 0.5, 1.0, -1.0]) {
    const b = a + Math.PI / 2 + sw, px = mx + Math.sin(b) * 2.7, pz = mz + Math.cos(b) * 2.7;
    let sc = -Math.abs(Math.sin(sw)) * 2;
    if (!arcClearAt(px, pz, 0.3)) sc -= 5;
    if (arcCamBlocked(mx, mz, px, pz)) sc -= 6;
    if (arcLineHits(mx, mz, px, pz, null)) sc -= 3;
    if (sc > bs) { bs = sc; best = [px, pz]; }
  }
  camShot = ARCS.shot = { pos: new THREE.Vector3(best[0], Math.max(getHeight(best[0], best[1]), 0.2) + 1.35, best[1]), look: new THREE.Vector3(mx, gy + 0.4, mz), t, untilSubs: true };
}
function arcTamuFall() {
  const t = arcGet('tamu') || (arcTamuHome(), arcGet('tamu')); if (!t) return;
  t.hidden = false; t.h.spear.visible = false;
  const sp = arcPairSpot(N.pos.x, N.pos.z) || { nx: N.pos.x, nz: N.pos.z, bx: N.pos.x + 1.1, bz: N.pos.z, a: Math.PI / 2 };
  N.pos.set(sp.nx, 0, sp.nz); N.speed = 0; N.path = null; N.node = null;
  t.pos.set(sp.bx, 0, sp.bz); t.face = sp.a + Math.PI / 2; t.mode = 'stand'; arcDead(t);
  arcClearBodies([[sp.bx, sp.bz], [sp.nx, sp.nz]]);
  arcFace(N, t.pos); ARCS.nHold = { at: t.pos, pose: null };
  setTimeout(() => {                                 // his body has settled (one frame): she kneels at his chest
    if (!ARCS.nHold) return;
    const k = matKneelSpot(t, N.pos); N.pos.set(k[0], 0, k[1]); collide(N.pos, 0.25);
    ARCS.nHold = { at: new THREE.Vector3(k[2], 0, k[3]), pose: 'work' };
    arcLowShot(N.pos.x, N.pos.z, k[2], k[3], 8);
  }, 120);
}
// updateSena (arcSena): Sena held in a staged pose (kneeling at Tamu, lying wounded at dawn)
function arcNHoldTick(dt) {
  const H = ARCS.nHold; if (!H) return false;
  N.speed = 0; N.path = null; N.node = null; N.act = 0; N.fetch = null; N.vx = N.vz = 0;
  if (H.lie) { settle(N, dt, false); return true; }
  N.face = turn(N.face, Math.atan2(H.at.x - N.pos.x, H.at.z - N.pos.z), Math.min(1, dt * 6));
  N.h.pose = H.pose || null;
  settle(N, dt, false);
  return true;
}
// ARC-FIX4: the raid's dawn: Sena on the ground with the spear wound, Aro kneeling over her ('Sena, look at me. Stay
// awake.'); after her line she gets up, slowly, insisting it is nothing (the fever chapter opens on 'only a scratch').
function arcDawnStage(h) {
  const sp = arcPairSpot(h.x + 4, h.z + 3.8, 0.01) || { nx: h.x + 4, nz: h.z + 3.8 };
  N.pos.set(sp.nx, 0, sp.nz); N.speed = 0; N.path = null; N.node = null;
  for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; if (arcBodyClear(sp.nx, sp.nz, a)) { N.face = a; break; } }
  N.h.pose = null; N.matUp = 0; matLieStart(N, true); N.matStill = false;
  ARCS.nHold = { lie: true };
  P.pos.set(sp.nx + Math.cos(N.face) * 0.8, 0, sp.nz - Math.sin(N.face) * 0.8);
  setTimeout(() => {                                 // her body has settled: he kneels at her chest
    if (!ARCS.nHold?.lie) return;
    const k = matKneelSpot(N, P.pos); P.pos.set(k[0], 0, k[1]); collide(P.pos, 0.25);
    ARCS.dawnSite = { x: k[2], z: k[3], rise: 0 }; P.work = 60; P.workSite = ARCS.dawnSite; P.face = Math.atan2(k[2] - P.pos.x, k[3] - P.pos.z);
    arcLowShot(P.pos.x, P.pos.z, k[2], k[3], 30);
  }, 150);
}
function arcDawnUp() {
  if (!ARCS.nHold?.lie) return;
  ARCS.nHold = null; busy = false;
  if (P.workSite === ARCS.dawnSite) { P.work = 0; P.workSite = null; } ARCS.dawnSite = null;
  N.matUp = 1.1; N.matW = 1; if (N.h.has('getUp')) N.h.swing('getUp', 1.35);
}
// CMB torch scorch marks on the buildings fade into the morning's repair (the house keeps ARC's own scorch if it burned).
function arcUnscorch() {
  for (const s of structs) {
    if (!s.scorch) continue;
    s.scorch = 0;
    s.group?.traverse((o) => { if (o.isMesh && o.userData.cmbBase) o.material.color.copy(o.userData.cmbBase); });
  }
}
// Tamu on his knees in the fight (CMB's surrender choice, E beside him): ARC records it as the story's choice.
on('surrender', (e) => {
  if (!e.f?.arcTamu || S.arc.choices.tamu) return;
  ARCS.defs.tamu = { opts: ARC_OPTS.tamu(), title: 'Tamu' };
  arcApply('tamu', e.choice === 'kill' ? 1 : 0);
  if (e.choice !== 'kill') setTimeout(() => arcSay(ARCD.L.raid.tamuSpare), 1800);
}, 50);
// GUARDRAIL (spec: "Sena takes a spear wound, not killable here"): through the raid her health never drops below 12.
on('playerHitPre', (e) => { if ((ARCS.raidFight || ARCS.duel) && e.who === 'N' && e.dmg > 0) e.dmg = Math.min(e.dmg, Math.max(0, S.nhp - 12)); }, 25);
function arcRaidStash(frac) { for (const k in S.stash) S.stash[k] = Math.floor((S.stash[k] | 0) * (1 - frac)); }
function arcBurn() { const A = S.arc; A.home.burned = true; A.home.scorched = true; arcScorch(true); }
// The scorched house (or hut): its materials darkened until repaired (cloned once, so other buildings keep theirs).
function arcScorch(on) {
  const h = homeHouse() || structs.find((s) => s.kind === 'hut'); if (!h) return;
  if (!!h.arcScorch === on) return;
  h.arcScorch = on;
  h.group.traverse((o) => {
    if (!o.isMesh || !o.material?.color) return;
    if (on) { if (!o.userData.arcMat) { o.userData.arcMat = o.material; o.material = o.material.clone(); } o.material.color.copy(o.userData.arcMat.color).multiplyScalar(0.42); }
    else if (o.userData.arcMat) { o.material = o.userData.arcMat; o.userData.arcMat = null; }
  });
}

// ----- Sena's fever (phase B core; phase C: SURV herb fields, the RST vigil, ROM's first kiss)
function arcBed() {
  const h = homeHouse(), hut = structs.find((s) => s.kind === 'hut' && s.rise >= 1), s = h && S.home.bed ? h : hut || h;
  if (s && s.bedPts) { const v = toWorld(s, s.bedPts[1]); return { x: v.x, z: v.z, y: v.y, face: s.rot || 0, s }; }
  const f = structs.find((q) => q.kind === 'fire'); if (f) { const v = toWorld(f, [0, 0, -2.2]); return { x: v.x, z: v.z, y: getHeight(v.x, v.z) + 0.05, face: f.rot || 0, s: null }; }
  return null;
}
// A short look at Sena on the bed from the room's own rest camera (the follow camera only sees the roof from outside).
function arcBedShot(t = 3.6) {
  const s = arcBed()?.s;
  if (!s?.camPt || view === 'fpp' || camShot) return;
  camShot = ARCS.shot = { pos: toWorld(s, s.camPt), look: toWorld(s, s.lookPt), t };
}
function arcHours(h) {
  const A = S.arc;
  if (CH[S.ch]?.id !== 'fever' || A.feverDone || ARCS.vigil || !(A.senaWound === 'bleeding' || A.senaWound === 'fever')) return;
  const was = A.fever || 0;
  A.fever = Math.min(100, was + ARCD.feverRise(S.diff.mode, A.rem?.bled) * h);
  if (A.senaWound === 'bleeding' && A.rem?.bled) A.senaWound = 'fever';
  for (const [v, l] of ARCD.L.fever.rising) if (was < v && A.fever >= v) arcSenaSays([l]);
  if (A.fever >= 100) arcFeverFail();
}
function arcFeverFail() {
  const A = S.arc;
  if (S.diff.perma && D().senaFate === 'die' && settings.matureStory !== false) { A.senaWound = 'dead'; endRun('sena'); return; }
  A.senaWound = 'scarred'; A.fever = 0; arcMem('fever', 'The fever burned through. Sena lived, and it left her limping.');
  arcSay(ARCD.L.fever.scarred); ARCS.ch = -1; drawQuest(); save();
}
function arcFeverSet(v) {
  const A = S.arc;
  A.fever = clamp(+v || 0, 0, 100);
  if (CH[S.ch]?.id !== 'fever' || A.feverDone) return A.fever;
  if (A.fever >= 100) arcFeverFail(); else if (A.fever <= 0) arcFeverCure();
  return A.fever;
}
function arcRemedy(k, item) {
  const A = S.arc, F = ARCD.FEVER, L = ARCD.L.fever;
  A.rem ||= {};
  S.inv[item] -= k === 'bled' || item !== k ? 1 : ARC_HERB[k].n; A.rem[k] = true;
  A.fever = Math.max(F.floor, (A.fever || 0) - (k === 'bled' ? F.bleed : F.remedy));
  if (k === 'bled') { A.senaWound = 'fever'; arcSay(L.bled); } else arcSay([L.remedy[['willow', 'yarrow', 'moss'].indexOf(k)]]);
  arcBedSide(); P.h.swing(); arcSfx(500, 0.3, 0.25); arcBedShot();
  if (typeof romShared === 'function') romShared();   // ARC-FIX: tending her counts as time together
  drawInv(); drawQuest(); save();
}
// Tending her: Aro steps to her side of the bed, facing her (out of the room camera's way; he stood in its lens).
function arcBedSide() {
  const b = arcBed(), s = b?.s; if (!s?.bedPts || P.ride || view === 'fpp') return;
  const bp = s.bedPts, side = bp[1][0] - (bp[0][0] + bp[1][0]) / 2 > 0 ? 1 : -1, v = toWorld(s, [bp[1][0] + side * 0.62, 0, bp[1][2] - 1.05]);   // on the floor at her side, by her shoulder
  P.pos.set(v.x, P.pos.y, v.z); P.vx = P.vz = 0; P.face = Math.atan2(N.pos.x - v.x, N.pos.z - v.z);
  if (torchOn || ARCS.doorLamp || world.env.night < 0.3) return;
  const lp = toWorld(s, [bp[1][0] + side * 1.3, bp[1][1] + 1.1, bp[1][2] + 0.7]), fn = () => { if (!torchOn) torch.light.intensity = 5.5 * (0.92 + Math.sin(clock * 5) * 0.05); };   // the low fire's glow for the shot
  torch.light.position.copy(lp); torch.light.color.setHex(0xff9a50); ARCS.doorLamp = fn;
  setTimeout(() => { if (ARCS.doorLamp === fn) { ARCS.doorLamp = null; if (!torchOn) { torch.light.intensity = 0; torch.light.color.setHex(0xff8f40); } } }, 4200);
}
function arcBedTarget() {
  const A = S.arc, r = A.rem || {};
  if (A.senaWound === 'scarred' || (r.bled && r.willow && r.yarrow && r.moss)) {
    return S.time >= 18 || S.time < 5 ? { label: 'Sit with Sena through the night', key: true, act: arcVigil } : { label: 'Sena sleeps. Sit with her when the night comes (after 18:00)' };
  }
  if (!r.bled) {
    const k = ['ypoultice', 'poultice', 'hidebandage', 'bandage'].find((q) => S.inv[q] > 0);
    return k ? { label: `Press a ${ITEMS[k].toLowerCase().replace(/s$/, '')} to Sena's wound`, key: true, act: () => arcRemedy('bled', k) } : { label: 'Her wound is bleeding: you need a poultice (Tab: berries and fibre)' };
  }
  for (const k of ['willow', 'yarrow', 'moss']) if (!r[k] && S.inv[k] >= ARC_HERB[k].n) return { label: ARC_HERB[k].give, key: true, act: () => arcRemedy(k, k) };
  if (!r.willow && S.inv.willowtea > 0) return { label: 'Give Sena the willow-bark tea (fever −30)', key: true, act: () => arcRemedy('willow', 'willowtea') };   // SURV: a brewed tea counts
  const need = ['willow', 'yarrow', 'moss'].filter((k) => !r[k]).map((k) => `${k === 'moss' ? 'cave moss' : k === 'willow' ? 'willow bark' : 'yarrow'} ${ARC_HERB[k].where}`);
  return { label: `Fever ${Math.round(A.fever || 0)}. She needs ${need.join(', ')}` };
}
function arcVigil() {
  if (typeof rstVigil === 'function') { rstVigil(arcBed()?.s, arcFeverCure); return; }   // an RST-owned vigil, if one ever lands
  arcScene('vigil', async () => {
    const L = ARCD.L.fever, b = arcBed();
    ARCS.vigil = true; ARCS.vigilDone = false;
    const sat = arcVigilSit(b);
    if (sat) arcVigilCam(b); else arcBedShot(40);
    // the night goes by: the sky turns over the roof while she talks, to him and to people long dead
    const scar = S.arc.senaWound === 'scarred';      // ARC-FIX: the fever already burned out: a night of pain and talk, not fever ravings
    const hrs = ((6.5 - S.time) % 24 + 24) % 24, steps = 24, lines = scar ? [...L.scarredVigil] : [...L.rising.map((x) => x[1]).filter((l, i, a) => a.findIndex((q) => q[1] === l[1]) === i), ...(L.vigil || [])];
    let li = 0;
    for (let i = 0; i < steps; i++) {
      if (S.time + hrs / steps >= 24) S.day++;
      skipHours(hrs / steps);
      if (i % 5 === 1 && li < lines.length && subs.length === 0) say(...lines[li++]);
      await arcWait(0.42);
    }
    bump('vigil');
    await arcSubsDone();
    romShared();                                     // ARC-FIX: a night at her side is shared time (no neglect line next morning)
    let vb = false;                                  // ARC-FIX5: the letterbox stays on from the vigil through the first kiss (no HUD flash between them)
    await arcFade(scar ? L.scarredFade : L.vigilFade, () => {               // morning: the two of them just outside the door, in the first light
      vb = ARCS.vigilBusy; ARCS.vigilBusy = false; arcVigilSit(null); ARCS.vigilDone = true;
      const h = b.s, d = h ? toWorld(h, [0, 0, h.kind === 'house' ? 4.6 : 3.8]) : null;
      if (d) { const a = Math.atan2(d.x - h.x, d.z - h.z), rx = Math.cos(a), rz = -Math.sin(a);
        P.pos.set(d.x - rx * 0.6, 0, d.z - rz * 0.6); N.pos.set(d.x + rx * 0.6, 0, d.z + rz * 0.6); P.face = Math.atan2(N.pos.x - P.pos.x, N.pos.z - P.pos.z); N.face = P.face + Math.PI; N.path = null; N.speed = 0; }
    }, 3400);
    ARCS.vigil = false;
    await arcFeverCure();                            // ARC-FIX4: the first kiss plays inside the vigil scene (no chapter turn under it)
    await arcSubsDone();
    if (vb) { busy = false; cine(false); }   // ARC-FIX5
  });
}
// Aro on the bed beside her, sitting up, her near hand in his (floor-sit mechanics at the mattress, a two-bone reach).
const _avA = new THREE.Vector3(), _avB = new THREE.Vector3(), _avC = new THREE.Vector3();
function arcVigilSit(b) {
  if (!b) {                                          // stand him up again (also after a load or a cut)
    if (!ARCS.vigilOn) return false;
    ARCS.vigilOn = false; ARCS.vigilW = 0;
    P.sit = 0; P.seat = null; P.floorSit = 0; P.hearthSeat = false; P.h.pose = null; P.fsLegs = null;
    ARCS.doorLamp = null; if (!torchOn) { torch.light.intensity = 0; torch.light.color.setHex(0xff8f40); }
    if (b === null && ARCS.vigilBusy) { busy = false; cine(false); ARCS.vigilBusy = false; }
    const bb = arcBed(); if (bb) { const a = (bb.face || 0); P.pos.set(bb.x - Math.cos(a) * 1.3, 0, bb.z + Math.sin(a) * 1.3); }
    if (typeof wpnUnSit === 'function') wpnUnSit();
    return true;
  }
  if (!b.s) return false;
  const a = b.face || 0, bp = b.s.bedPts, mid = (bp[0][0] + bp[1][0]) / 2, side = bp[1][0] - mid > 0 ? 1 : -1;   // side: her outer edge (local x), away from his half
  if (typeof wpnStowAll === 'function') wpnStowAll('rest', true);
  if (P.ride) dismount();
  if (torchOn) setTorch(false);
  const [kx, kz] = ARCS.vigilAt || [0.85, -0.5];   // measured: clear of the bed edge, hands 0.12 m apart
  const seat = toWorld(b.s, [bp[1][0] + side * kx, 0, bp[1][2] + kz]);   // on the floor at her side of the bed, by her hip, facing the foot of the bed
  seat.y = b.s.group.position.y + (b.s.kind === 'house' ? 0.19 : 0.04);
  ARCS.vigilBedY = b.y;
  P.pos.copy(seat); P.seat = seat; P.floorSit = 1; P.hearthSeat = true; P.fire = null; P.vx = P.vz = 0; P.speed = 0;   // the relaxed floor sit (one knee up)
  P.face = a; P.h.pose = 'sit'; P.sit = 1e6; P.fsLegs = null;
  ARCS.vigilOn = true; ARCS.vigilW = 0; ARCS.vigilSide = side; ARCS.vigilBusy = !busy;
  const lp = toWorld(b.s, [bp[1][0] + side * 1.3, bp[1][1] + 1.1, bp[1][2] + 0.7]);   // a low fire's glow on the two of them (Aro's idle torch light)
  torch.light.position.copy(lp); torch.light.color.setHex(0xff9a50);
  ARCS.doorLamp = () => { if (!torchOn) torch.light.intensity = 5.5 * (0.92 + Math.sin(clock * 5) * 0.05 + Math.sin(clock * 13) * 0.03); };
  if (ARCS.vigilBusy) { busy = true; cine(true); }
  if (!P.arcVigilOv) { P.arcVigilOv = true; P.h.addOverride('arcVigil', 31, arcVigilOv); }
  if (!N.arcVigilOv) { N.arcVigilOv = true; N.h.addOverride('arcVigil', 31, arcVigilOvN); }
  return true;
}
// order 31 (after RST's hold at 30): their near hands meet over the edge of his lap, hers lifted off the blanket into his
const _avM = new THREE.Vector3();
function arcVigilMeet() {                           // a fixed spot by his hip on her side (her hand moves; a target read off it would drift)
  P.h.bones.pelvis.getWorldPosition(_avC);
  const a = P.face, sx = -Math.cos(a) * ARCS.vigilSide, sz = Math.sin(a) * ARCS.vigilSide, k = ARCS.vigilReach || [0.4, 0, 0.02];
  _avM.set(_avC.x + sx * k[0] + Math.sin(a) * k[1], Math.max(_avC.y + 0.1, (ARCS.vigilBedY ?? _avC.y) + 0.06) + k[2], _avC.z + sz * k[0] + Math.cos(a) * k[1]);
  return _avM;
}
function arcVigilOv(h) {
  if (!ARCS.vigilOn) return;
  ARCS.vigilW = Math.min(1, (ARCS.vigilW || 0) + 0.015);
  const w = smooth01(ARCS.vigilW), sd = ARCS.vigilSide > 0 ? 'r' : 'l', m = w > 0 && arcVigilMeet();
  if (!m) return;
  h.bones.pelvis.getWorldPosition(_avC);
  _avB.copy(m).lerp(_avC, 0.4); _avB.y += 0.5;
  ik2(h, sd, m, _avB, w);
}
function arcVigilOvN(h) {
  if (!ARCS.vigilOn) return;
  const w = smooth01(ARCS.vigilW || 0), m = w > 0 && arcVigilMeet();
  if (!m) return;
  _avB.copy(m); _avB.y -= 0.35; _avB.lerp(N.pos, 0.3);   // her elbow stays down on the blanket
  ik2(h, ARCS.vigilSide > 0 ? 'l' : 'r', _avB.set(m.x, m.y - 0.015, m.z), _avA.copy(m).setY(m.y - 0.4), w * 0.95);
}
// The two of them from the foot of the bed, a little to his side, low: her face, his hand on hers.
function arcVigilCam(b) {
  if (view === 'fpp') return;
  const s = b.s;
  if (s.bedPts) {                                    // low, from her side of the foot of the bed: both faces and the joined hands
    const bp = s.bedPts, mid = (bp[0][0] + bp[1][0]) / 2, side = bp[1][0] - mid > 0 ? 1 : -1, z0 = bp[1][2], [cx, cy, cz] = ARCS.vigilCam || [0.5, -0.25, -0.35], cp = s.camPt || [0, 1.45, 2.4];
    camShot = ARCS.shot = { pos: toWorld(s, [cp[0] + side * cx, cp[1] + cy, cp[2] + cz]), look: toWorld(s, [bp[1][0] + side * 0.25, bp[1][1] + 0.2, z0 - 0.55]), t: 60 }; return;
  }
  arcBedShot(60);
}
function arcFeverCure() {
  const A = S.arc;
  if (A.feverDone) return;
  A.feverDone = true; A.fever = 0;
  if (typeof romShared === 'function') romShared();   // ARC-FIX
  if (A.senaWound !== 'scarred') A.senaWound = 'healed';
  ARCS.ch = -1;
  addClose(5, 'sat with her through the fever');
  if (A.senaWound !== 'scarred') arcMem('fever', 'You sat with Sena until her fever broke.');
  drawQuest(); save();
  if (typeof romFirstKiss === 'function') return romFirstKiss();   // ROM (phase C): the consent-gated first kiss (ARC-FIX4: the vigil scene waits for it)
  arcSay(ARCD.L.fever.firstKiss);
}

// ----- scripted Sena (updateSena, after MAT's rescue): sick in bed, at the lake, at the fire with Tamu, in scenes
function arcSena(dt) {
  const A = S.arc, id = CH[S.ch].id;
  const b = id === 'fever' && !A.feverDone && A.senaWound !== 'dead' && !R.on && !ARCS.vigilDone ? arcBed() : null;   // ARC-FIX7: with no bed she is not sent off gathering (the wounded rule below keeps her by him)
  if (b) {
    if (R.nOut) { R.nOut = null; N.path = null; }
    N.rest = 0; N.sit = 0; N.node = null; N.speed = 0; N.ride = false; N.h.pose = null; N.h.straddle = false;
    N.pos.set(b.x, b.y, b.z); N.face = b.face;
    const r = N.h.root; r.position.set(b.x, b.y + 0.02, b.z); r.rotation.order = 'YXZ'; r.rotation.set(-Math.PI / 2, b.face, 0);
    N.h.animate(dt, 0, false, false, false);
    arcStraightLegs(N.h);                            // the idle's knee-forward stance, laid flat, lifted one knee and sank the other foot into the bed
    arcSickCover(b);
    return true;
  }
  if (ARCS.sick?.visible) arcSickCover(null);
  if (ROM.scene) return false;                      // ARC-FIX: a ROM kiss or embrace moves her (the lake embrace runs inside the scene)
  if (romFkHoldTick(dt)) return true;              // ARC-FIX4: the first-kiss beat holds her face to face with him
  if (arcNHoldTick(dt)) return true;               // ARC-FIX4: kneeling at Tamu, lying wounded at dawn
  if (A.senaWound === 'bleeding' && !A.feverDone && (id === 'fever' || (id === 'raid' && A.raid?.done)) && !N.ride && !(N.sit > 0) && !(N.rest > 0) && !R.on) {   // ARC-FIX7: wounded, she keeps by him, slowly (she went off gathering stones a breath after 'I cannot feel my hand')
    const dP = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
    N.node = null; N.act = 0; N.fetch = null; N.working = false;
    if (dP > 2.6) walkTo(N, P.pos.x + 1.0, P.pos.z + 0.6, dP > 14 ? 3.4 : 1.5, dt, 0.5);
    else { N.speed = 0; N.face = turn(N.face, Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z), Math.min(1, dt * 3)); }
    N.h.pose = null; settle(N, dt, false); return true;
  }
  if (ARCS.lake) {                                   // she walks by Mirror Lake at dusk (a rift to mend)
    const [x, z] = arcSpot('lake'), d = Math.hypot(N.pos.x - x, N.pos.z - z);
    if (d > 2) { if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) > 45 && d > 30) N.pos.set(x + 1.5, 0, z + 1.5); else walkTo(N, x, z, 2.6, dt, 0.8); }
    else { N.speed = 0; const L = ARCS.scene === 'reconcile' ? P.pos : POIS.find((p) => p.id === 'lake'); N.face = turn(N.face, Math.atan2(L.x - N.pos.x, L.z - N.pos.z), Math.min(1, dt * 3)); }   // ARC-FIX: in the scene she turns to him
    settle(N, dt, false); return true;
  }
  if (ARCS.jealous) {                                // laughing with Tamu on the far bench
    const f = structs.find((s) => s.kind === 'fire'); if (!f) { ARCS.jealous = false; return false; }
    const [, b] = fireSeats(f); N.pos.set(b[0], 0, b[1]); N.face = Math.atan2(f.x - b[0], f.z - b[1]); N.speed = 0; N.h.pose = N.h.has('sitTalk') ? 'sitTalk' : 'sit';
    settle(N, dt, false); return true;
  }
  if (ARCS.scene && ARCS.focus && ARCS.scene !== 'vigil') {   // stand by Aro and face whoever is talking
    const dP = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
    if (dP > 2.4) walkTo(N, P.pos.x + 1.1, P.pos.z + 0.6, dP > 10 ? 5 : 2.8, dt, 0.5);
    else { N.speed = 0; const t = ARCS.focus === N ? P.pos : ARCS.focus.pos || ARCS.focus; N.face = turn(N.face, Math.atan2(t.x - N.pos.x, t.z - N.pos.z), Math.min(1, dt * 4)); }
    N.h.pose = null; settle(N, dt, false); return true;
  }
  return false;
}

// Lying still: the legs go back to the rig's bind pose (straight and together), read once from the skeleton's inverses.
const ARC_LEGS = ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
function arcStraightLegs(h) {
  if (!h.arcLegQ) {
    let sk = null; h.root.traverse((o) => { if (!sk && o.isSkinnedMesh && o.skeleton.bones.includes(h.bones.thigh_l)) sk = o.skeleton; });
    if (!sk) { h.arcLegQ = []; return; }
    const M = new THREE.Matrix4(), W = new THREE.Matrix4(), t = new THREE.Vector3(), sc = new THREE.Vector3();
    h.arcLegQ = ARC_LEGS.map((n) => {
      const b = h.bones[n], i = sk.bones.indexOf(b), j = sk.bones.indexOf(b.parent), q = new THREE.Quaternion();
      if (i < 0 || j < 0) return null;
      W.copy(sk.boneInverses[i]).invert(); M.copy(sk.boneInverses[j]).multiply(W).decompose(t, q, sc);   // parent-bind⁻¹ · bind
      return [b, q];
    }).filter(Boolean);
  }
  for (const [b, q] of h.arcLegQ) b.quaternion.copy(q);
}
// The sick bed: a hide blanket over Sena from under the ribs to past her feet while the fever has her (draped over her
// body like cloth, re-shaped once a second as she breathes and as the vigil lifts her hand).
const _sbA = new THREE.Vector3(), _sbB = new THREE.Vector3(), _sbC = new THREE.Vector3(), _sbP = [];
const SICK_BONES = [['spine_02', 0.12], ['spine_01', 0.12], ['pelvis', 0.14], ['thigh_l', 0.11], ['thigh_r', 0.11], ['calf_l', 0.075], ['calf_r', 0.075], ['foot_l', 0.08], ['foot_r', 0.08], ['ball_l', 0.07], ['ball_r', 0.07], ['hand_l', 0.05], ['hand_r', 0.05], ['lowerarm_l', 0.04], ['lowerarm_r', 0.04]];   // her hands rest under the cover
function arcSickCover(b) {
  let m = ARCS.sick;
  if (!b) { if (m) m.visible = false; return; }
  if (!m) { m = ARCS.sick = makeBlanket(1, 1, 22, 30); scene.add(m); m.userData.t = -1e9; m.onBeforeRender = () => arcSickDrape(m); }   // shaped at render time, on the pose actually drawn
  if (!m.visible) m.userData.t = -1e9;
  m.visible = true; m.userData.y0 = b.y + 0.01;
}
function arcSickDrape(m) {
  if (clock - m.userData.t < 1) return;
  m.userData.t = clock;
  const B = N.h.bones, y0 = m.userData.y0;
  B.spine_02.getWorldPosition(_sbA);
  B.foot_l.getWorldPosition(_sbB).add(B.foot_r.getWorldPosition(_sbC)).multiplyScalar(0.5);
  const dx = _sbB.x - _sbA.x, dz = _sbB.z - _sbA.z, dl = Math.hypot(dx, dz) || 1, len = dl + 0.2, wid = 0.9, fx = dx / dl, fz = dz / dl;
  const cx = _sbA.x + fx * len / 2, cz = _sbA.z + fz * len / 2;
  _sbP.length = 0;
  for (const [n, r] of SICK_BONES) { B[n].getWorldPosition(_sbC); _sbP.push([_sbC.x, _sbC.z, _sbC.y - y0 + r * 1.1 + 0.03, r]); }
  for (const [n1, n2, r] of DRAPE_MIDS) for (const k of [0.33, 0.66]) {   // along the thighs and shins too, not only at the joints
    B[n1].getWorldPosition(_sbB); B[n2].getWorldPosition(_sbC); _sbC.lerp(_sbB, 1 - k);
    _sbP.push([_sbC.x, _sbC.z, _sbC.y - y0 + r * 1.3 + 0.03, r]);
  }
  for (const sd of ['l', 'r']) { B['pelvis'].getWorldPosition(_sbB); B['thigh_' + sd].getWorldPosition(_sbC); _sbC.lerp(_sbB, 0.3); _sbP.push([_sbC.x, _sbC.z, _sbC.y - y0 + 0.17, 0.12]); }   // the hips
  m.position.set(cx, y0, cz); m.rotation.y = Math.atan2(fx, fz); m.scale.set(wid, 1, len); m.updateMatrixWorld(true);
  const body = (lx, lz) => {                         // plane-local (-0.5..0.5) to the world, then the highest limb in reach
    const x = cx + fz * lx * wid + fx * lz * len, z = cz - fx * lx * wid + fz * lz * len;
    let h = 0.012;
    for (const [px, pz, top, r] of _sbP) { const d = Math.hypot(px - x, pz - z); h = Math.max(h, top - Math.max(0, d - r * 0.8) * 1.3); }
    return h;
  };
  const hem = (lx, lz) => Math.max(0, Math.min(1, (0.5 - Math.abs(lx)) / 0.06, lz < 0 ? (0.5 + lz) / 0.06 : 1, (0.5 - lz) / 0.09));   // the hems fall flat on the mattress
  m.userData.drape((lx, lz) => 0.012 + (body(lx, lz) - 0.012) * hem(lx, lz), 2, (lx, lz) => (Math.abs(lx) < 0.42 && lz < 0.38 ? body(lx, lz) : 0));
}

// ----- the beats, by chapter (4 Hz, never during a fade, a choice, a rest or a scene)
function arcBeats(id) {
  const A = S.arc, c = A.choices, p = P.pos, E = world.env;
  arcPellTick();
  switch (id) {
    case 'smoke': {
      const [cx, cz] = arcSpot('camp0');
      if (!A.coldCamp && arcDist(p, cx, cz) < 15) {
        A.coldCamp = true; A.ashHands = true; arcSmear('ash');
        discoverPOI('ruins');                        // the ruin's own banner first: the cold camp's replaces it
        banner(...ARCD.L.smoke.campBanner); arcSenaSays(ARCD.L.smoke.camp); drawQuest(); save();
      }
      const hp = arcHandPanel();
      if (A.coldCamp && !cnt('ash_seen') && hp && arcDist(p, hp.x, hp.z) < 4.5) {
        bump('ash_seen'); arcSmear('ash'); banner(...ARCD.L.smoke.ashBanner); arcSenaSays(ARCD.L.smoke.ash); drawQuest(); save();
      }
      const [fx, fz] = arcSpot('ford');
      if (cnt('ash_seen') && !c.ford && arcDist(p, fx, fz) < 30) {
        if (E.day > 0.5) arcFord();
        else if (!ARCS.fordNight) { ARCS.fordNight = true; toast('No one comes to the ford in the dark. Come back by daylight.'); }
      }
      break;
    }
    case 'outcast': {
      const [sx, sz] = arcSpot('trail'), [tx, tz] = arcSpot('tree');
      if (!A.trailSeen && !c.outcast && arcDist(p, sx, sz) < 14) { A.trailSeen = true; banner(...(settings.blood === 'off' ? ARCD.L.outcast.trailBannerOff : ARCD.L.outcast.trailBanner)); }
      if (!c.outcast && arcGet('tamu') && arcDist(p, tx, tz) < 7) arcTamuFound();
      break;
    }
    case 'clay': case 'house': arcJealousBeat(); if (id === 'house') arcLakeBeat(); break;
    case 'winter': {
      const h = arcHome();
      if (!c.door && h && S.day >= (A.doorDay ?? 1e9) && (S.time >= 17.5 || S.time < 5) && arcDist(p, h.x, h.z) < 22) { arcDoor(); break; }   // the knock comes first: no blizzard banner over it
      if (!c.door && S.day >= (A.doorDay ?? 1e9)) break;   // the door night stays calm until they have been answered
      if (E.night > 0.6 && (S.day - (A.winterDay ?? S.day)) % 2 === 0 && A.stormDay !== S.day && EV.storm <= 0) {
        A.stormDay = S.day; EV.storm = 95 + rand() * 40; banner(...ARCD.L.winter.blizzard); say(...ARCD.L.winter.blizzardLine);
      }
      break;
    }
    case 'raid': {
      if (A.wena === 'saved' && !A.warned) {
        A.warned = true;
        arcScene('warn', async () => {
          const pl = arcGet('pell'); if (pl) { pl.hidden = false; pl.mode = 'stand'; pl.pos.set(p.x + 1.6, 0, p.z + 1.2); pl.look = 'P'; ARCS.focus = pl; }
          await arcTalk(ARCD.L.raid.warn);
          await arcChoose('raid', 'Korr is coming', ARC_OPTS.raid(), { def: 0, note: 'Pell heard them at the ruins. Tomorrow night.' });
          A.raidDay = Math.max(A.raidDay ?? 0, S.time < 5 ? S.day : S.day + 1);   // "tomorrow night": a full day to light the braziers
        });
        break;
      }
      if (!A.raid.done && (A.raid.wave > 0 || S.day > A.raidDay || (S.day === A.raidDay && S.time >= 20))) arcRaid();   // wave > 0: a raid already under way when the game was saved
      break;
    }
    case 'reckoning': {
      if (!A.campPos) arcCampPos();
      const [x, z] = A.campPos;
      if (!S.found.camp && arcDist(p, x, z) < 26) { S.found.camp = 1; ARCS.campT = clock; reveal(x, z, 60); banner(...ARCD.L.reckoning.campBanner); drawQuest(); }
      if (!c.korr && arcGet('korr') && arcDist(p, x, z) < 13 && clock - (ARCS.campT ?? -1e9) > 4.5) arcReckoning();   // let the camp's banner pass first
      if (c.korr && A.horseFate === 'taken') arcHorseBack();   // the horse comes home in every branch (direct picks too)
      if (c.korr && !A.thaw) A.thaw = true;
      break;
    }
    case 'bond': {
      const [x, z] = arcSpot('stones'), dusk = S.time >= 17 && S.time < 22;
      if (A.bonded || arcDist(p, x, z) > 13) { ARCS.stonesHint = false; break; }
      if (discoverPOI('stones')) ARCS.stonesWait = clock + 8;   // a first visit: let the place's own banner pass before the scene
      if (clock < (ARCS.stonesWait || 0)) break;
      if (!dusk) { if (!ARCS.stonesHint) { ARCS.stonesHint = true; toast('Come back at dusk, with Sena'); } break; }
      if (Math.hypot(N.pos.x - p.x, N.pos.z - p.z) > 14) { if (!ARCS.stonesHint) { ARCS.stonesHint = true; toast('Bring Sena to the stones'); } break; }
      if (!(S.inv.cord > 0) || S.close < 75) { if (!ARCS.stonesHint) { ARCS.stonesHint = true; say(...ARCD.L.bond.notReady); if (S.close < 75) toast('Closeness 75 needed'); } break; }
      if (ARCS.npcs.some((e) => e.child && !e.hidden && arcDist(e.pos, p.x, p.z) < 15) || kids.some((k) => k.h.root.visible && k.pos.distanceTo(p) < 15)) break;   // GUARDRAIL: no romance scene near a child
      arcHandfast();
      break;
    }
  }
}
function arcJealousBeat() {
  const A = S.arc, c = A.choices;
  if (!arcTamuGuest() || c.jealous || S.day < (A.jealousDay ?? 1e9)) { ARCS.jealous = false; return; }
  const f = structs.find((s) => s.kind === 'fire'), t = arcGet('tamu');
  if (!f || !t) return;
  const eve = S.time >= 18 && S.time < 22.5, d = arcDist(P.pos, f.x, f.z);
  ARCS.jealous = eve && d < 50;
  if (ARCS.jealous) t.talk = true;
  if (!ARCS.jealous || d > 9) return;
  arcScene('jealous', async () => {
    const L = ARCD.L.jealous;
    ARCS.focus = N; arcFireGrass(f);
    const cineOn = !$('hud').classList.contains('cine'); if (cineOn) cine(true);   // ARC-FIX4: letterbox, HUD away for the scene
    try {
    arcFireTwoShot(f, N, t); await arcWait(1.6);
    await arcTalk(L.scene, arcGet('tamu'));
    arcFireTwoShot(f, N, t);                         // ARC-FIX4: the choice over the two of them laughing (not a blurred back under the panel)
    $('choice').classList.add('low');
    await arcChoose('jealous', 'At the Fire', ARC_OPTS.jealous(), { def: null, note: 'Sena and Tamu are laughing together by the fire.' });
    $('choice').classList.remove('low');
    const ch = A.choices.jealous;                    // ARC-FIX: she stays on the bench through the answer, each line framed on its speaker (the shot held on an empty log)
    if (ch === 'join' || ch === 'forbid') {          // ARC-FIX7: Aro comes up to the fire for his answer, lit by it, in a medium shot (he stood small in the dark grass); Sena answers looking up at him
      arcJealAro(f);
      for (const l of L[ch]) {
        const sp = l[0] === 'Aro' ? P : l[0] === 'Sena' ? N : t;
        ARCS.nGaze = sp === N ? P : sp === P ? null : t;
        if (sp === P) arcJealAroShot(f); else arcFireCloseUp(sp, f, P.pos);
        say(l[0], l[1]); await arcSubsDone();
      }
      ARCS.nGaze = null;
    }
    await arcSubsDone();
    } finally { if (cineOn) cine(false); }
    ARCS.jealous = false; t.talk = false;
  });
}
// ARC-FIX7: Aro's place for his answer: standing at the fire ring on the open side (the benches are at local x = +-1.6,
// Tamu sits at local z = +2.45), turned to Sena; and his medium shot from her side of the fire, the flames out of frame.
function arcJealAro(f) {
  if (P.ride) return;
  const w = toWorld(f, [-0.9, 0, -2.3]);
  P.pos.set(w.x, 0, w.z); collide(P.pos, 0.3); P.vx = P.vz = 0; P.speed = 0; P.auto = false;
  arcFace(P, N.pos);
}
function arcJealAroShot(f) {
  if (view === 'fpp') return;
  const c = toWorld(f, [1.05, 0, -2.0]), gy = Math.max(getHeight(P.pos.x, P.pos.z), 0.2);
  camShot = ARCS.shot = { pos: new THREE.Vector3(c.x, Math.max(gy, getHeight(c.x, c.z)) + 1.5, c.z), look: new THREE.Vector3(P.pos.x, gy + 1.4, P.pos.z), t: 60 };
}
function arcRift(n, cause) {
  if (typeof romRift === 'function') return romRift(n, cause);   // ROM owns the rift's romance effects (0 mends it)
  S.arc.rift = clamp(n | 0, 0, 2); S.arc.riftCause = S.arc.rift ? cause : null;
  return S.arc.rift;
}
function arcLakeBeat() {
  const A = S.arc;
  if (!(A.rift > 0) || S.day < (A.riftDay ?? 0)) { ARCS.lake = false; return; }
  const dusk = S.time >= 16.5 && S.time < 22;
  if (dusk && !ARCS.lake) { ARCS.lake = true; if (Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z) < 12) say('Sena', 'I am going to walk by the lake. Alone, Aro.'); }
  if (!dusk) { ARCS.lake = false; return; }
  const [x, z] = arcSpot('lake');
  if (arcDist(N.pos, x, z) > 3 || arcDist(P.pos, N.pos.x, N.pos.z) > 6) return;
  arcScene('reconcile', async () => {
    const L = ARCD.L.reconcile, again = A.choices.reconcile === 'proud';
    if (again) {                                     // ARC-FIX: "Ask me again tomorrow": the answer is asked for again (it softlocked: arcChoose kept the old one)
      delete A.choices.reconcile; A.proudOnce = true;
      const i = A.memory.findLastIndex?.((m) => m.id === 'reconcile') ?? -1; if (i >= 0) A.memory.splice(i, 1);
    }
    arcLakeStage();                                  // ARC-FIX: they face each other, side-lit by the low sun, with a warm fill at dusk
    ARCS.focus = N; arcShot(N, 60);
    await arcTalk(A.proudOnce ? L.again : L.scene);
    const opts = ARC_OPTS.reconcile().filter((o) => !(A.proudOnce && o.value === 'proud'));   // the second time, pride is no longer on offer
    await arcChoose('reconcile', 'At Mirror Lake', opts, { def: null, note: A.proudOnce ? 'She asked you to ask again. She is waiting.' : 'Sena does not look at you. She is waiting.' });
    const ch = A.choices.reconcile;
    arcLakeStage();
    await arcTalk(L[ch]);
    if (ch === 'proud') { say(...L.away); await arcSubsDone(); }   // she sleeps by the fire tonight (romApart while the rift is open)
    if (ch === 'afraid' && settings.romance !== 'off' && typeof romEmbrace === 'function') {   // ROM: the embrace scene, held inside this scene
      romEmbrace(true); await arcWait(0.3); while (ROM.scene) await arcWait(0.2);
    }
    arcLakeLight(false);
    ARCS.lake = false;
  });
}
// ARC-FIX: the lake two-shot: Aro and Sena turned to each other (she stood facing the water, her back to the camera),
// and a warm low key light on their faces at dusk (the 'I was afraid' frame was black).
function arcLakeStage() {
  if (!P.ride) arcFace(P, N.pos); arcFace(N, P.pos); N.wait = Math.max(N.wait || 0, 6); N.speed = 0; N.path = null;
  arcLakeLight(world.env.night > 0.2 || world.env.day < 0.6);
}
function arcLakeLight(on) {
  if (!on) { if (ARCS.doorLamp === ARCS.lakeLamp) { ARCS.doorLamp = null; if (!torchOn) { torch.light.intensity = 0; torch.light.color.setHex(0xff8f40); } } ARCS.lakeLamp = null; return; }
  if (torchOn) return;
  const mx = (P.pos.x + N.pos.x) / 2, mz = (P.pos.z + N.pos.z) / 2, a = Math.atan2(N.pos.x - P.pos.x, N.pos.z - P.pos.z) + Math.PI / 2;
  torch.light.position.set(mx + Math.sin(a) * 2.2, Math.max(getHeight(mx, mz), 0) + 2, mz + Math.cos(a) * 2.2); torch.light.color.setHex(0xffb070);
  const fn = () => { if (!torchOn) torch.light.intensity = 3.2; };
  ARCS.doorLamp = ARCS.lakeLamp = fn;
}
function arcHandfast() {
  const A = S.arc;
  A.stonesDusk = true;
  arcScene('bond', async () => {
    const L = ARCD.L.bond;
    let vow = null;
    if (typeof romScene === 'function') {            // ROM: the full scene (ochre marks, the cord on both hands, vows, kiss, dance)
      vow = await romScene('handfast');
      if (vow != null) await arcWait(5);
    }
    if (vow == null) {                               // ARC fallback (ROM absent or busy)
      ARCS.focus = N; arcShot(N, 90);
      N.pos.set(P.pos.x + Math.sin(P.face) * 1.0, 0, P.pos.z + Math.cos(P.face) * 1.0); arcFace(N, P.pos); arcFace(P, N.pos);
      arcSay(L.marks); await arcSubsDone();
      ARCS.defs.vow = { opts: ARCD.VOWS.map((v, i) => ({ label: `"${v}"`, value: i })), title: 'The Vow' };
      vow = await choose('vow', 'The Vow', ARCS.defs.vow.opts, { def: null, note: 'The cord is round both your wrists. Sena waits for your words.' });
      delete ARCS.defs.vow;
      say('Aro', ARCD.VOWS[vow]); say('Sena', 'Then I will hold you to it. Every day of it.');
      if (settings.romance === 'full') arcSay(L.kiss);   // Fade early / Off: the scene cuts here
      await arcSubsDone();
    }
    S.rom.vow = vow; A.choices.vow = vow; arcMem('vow', ARCD.memText('vow', vow));
    await arcFade(L.fade, () => { arcBonded(); const hrs = ((7 - S.time) % 24 + 24) % 24; if (S.time + hrs >= 24) S.day++; skipHours(hrs); }, 3600);
  });
}
function arcBonded() {
  const A = S.arc; if (A.bonded) return;
  A.bonded = true; if (S.inv.cord > 0) S.inv.cord--;
  addClose(5, 'bound at the stones'); drawInv(); drawQuest(); save();
}
function arcGiveShare() {
  S.food = Math.max(0, S.food - 15); S.c.giveDay = S.day; bump('gave_share');
  N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z); N.h.swing(); P.h.swing();
  arcSay(cnt('gave_share') === 1 ? ARCD.L.winter.give : [ARCD.L.winter.give[0]]);
  addClose(2, 'gave her your share');
}
// E targets (findTarget, after "Share a meal")
function arcTarget(p) {
  if (ARCS.scene) return null;
  const A = S.arc, id = CH[S.ch].id, dN = Math.hypot(N.pos.x - p.x, N.pos.z - p.z);
  if (id === 'fever' && !A.feverDone) { const b = arcBed(); if (b && Math.hypot(b.x - p.x, b.z - p.z) < 2.4) return arcBedTarget(); }
  for (const k of ['willow', 'yarrow', 'moss']) {
    const pr = ARCS.props['herb_' + k];
    if (pr && arcDist(p, pr.x, pr.z) < 2.3) return { label: ARC_HERB[k].label, key: true, act() { S.inv[k] += ARC_HERB[k].n; bump(k, ARC_HERB[k].n); toast(`+${ARC_HERB[k].n} ${ITEMS[k]}`); arcProp('herb_' + k, false); P.h.swing(); arcSfx(1700, 0.09, 0.3); drawInv(); drawQuest(); } };
  }
  const t = arcGet('tamu');
  if (t && arcDist(p, t.pos.x, t.pos.z) < 2.4) {
    if (t.mode === 'dead' && A.choices.outcast === 'kill' && !A.graves.some((g) => g.who === 'Tamu')) return { label: 'Bury him beneath the Great Tree', key: true, act: arcBuryTamu };
    if (A.tamu === 'guest' && !A.tamuTended) {
      const k = ['ypoultice', 'poultice'].find((q) => S.inv[q] > 0);
      return k ? { label: 'Tend Tamu\'s wound with a poultice', key: true, act() { S.inv[k]--; A.tamuTended = true; P.h.swing(); arcSay(ARCD.L.outcast.tended); drawInv(); drawQuest(); save(); } } : { label: 'Tamu\'s wound needs a poultice (Tab: berries and fibre)' };
    }
  }
  for (const s of structs) if (s.kind === 'cairn' && Math.hypot(s.x - p.x, s.z - p.z) < 2.4) {
    if (S.c.remDay === S.day) return { label: 'A cairn. You remembered today.' };
    if (dN > 8) return { label: 'A cairn. Bring Sena, to remember together' };
    return { label: 'Remember, together', key: true, act() { S.c.remDay = S.day; N.face = Math.atan2(s.x - N.pos.x, s.z - N.pos.z); say(...ARCD.L.remember[cnt('remembered') % ARCD.L.remember.length]); bump('remembered'); addClose(1, 'remembered together'); } };
  }
  if (A.home.burned) {
    const h = homeHouse() || structs.find((s) => s.kind === 'hut');
    const d = h ? Math.hypot(h.x - p.x, h.z - p.z) : 1e9;
    if (h && d > h.radius - 1.2 && d < h.radius + 2) {
      const ok = S.inv.wood >= 4 && S.inv.clay >= 2;
      return ok ? { label: 'Repair the scorched walls (4 timber, 2 clay)', key: true, act() { S.inv.wood -= 4; S.inv.clay -= 2; P.h.swing(); arcScene('repair', async () => { await arcFade('You scrape the soot away and patch every crack with fresh clay.', () => { A.home.burned = false; arcScorch(false); S.time = (S.time + 3) % 24; }, 2400); say(...ARCD.L.hearth.repaired); drawInv(); }); } } : { label: 'The walls are scorched: 4 timber and 2 clay to repair them' };
    }
  }
  if (arcWinterNow() && id !== 'fever' && S.c.giveDay !== S.day && S.c.mealDay === S.day && dN < 2.2 && !N.sit && !(N.rest > 0) && S.food >= 25) return { label: 'Give your share to Sena', key: true, act: arcGiveShare };
  return null;
}
function arcSmear(mode) { const pn = arcHandPanel(); if (pn) caves.smearHands?.(pn, mode); }
// The epilogue's variant props (village; idempotent): grey and ochre hands together, the palisade, the sling on the tree.
function arcEpilogueProps() {
  const A = S.arc, ids = ARCD.epilogueLines(A, S.rom).ids;
  if (ids.includes('ash-and-hearth')) arcSmear('together');
  arcProp('sling', ids.includes('sling'));
  if (ids.includes('palisade') && !A.palisade) {
    const h = homeHouse();
    if (h) {
      A.palisade = true;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * 6.283 + (h.rot || 0), r = 15, x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
        if (i === 0 || getHeight(x, z) < 0.9 || structs.some((s) => s.kind !== 'fence' && Math.hypot(s.x - x, s.z - z) < s.radius + 1.4)) continue;   // a gate facing the door
        placeStruct('fence', x, z, a + Math.PI / 2, true);
      }
    }
  }
}
// ----- the map's Memories tab ("What Sena remembers")
function arcMemTabs() {
  const tabs = $('maptabs'); if (!tabs) return;
  tabs.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const mem = b.dataset.mt === 'mem';
    for (const x of tabs.querySelectorAll('button')) x.classList.toggle('on', x === b);
    $('mapview').hidden = mem; $('memories').hidden = !mem;
    if (mem) arcDrawMemories();
  };
}
function arcDrawMemories() {
  const el = $('memories'); if (!el) return;
  el.innerHTML = '';
  const h = document.createElement('h4'); h.className = 'serif'; h.textContent = ARCD.L.memories; el.append(h);
  const list = S.arc.memory || [];
  if (!list.length) { const p = document.createElement('p'); p.className = 'mem-empty'; p.textContent = 'Nothing yet. What you choose, she will remember.'; el.append(p); return; }
  for (const m of [...list].reverse()) {
    const row = document.createElement('div'); row.className = 'mem-row';
    const d = document.createElement('b'); d.textContent = `Day ${m.day}`;
    const t = document.createElement('span'); t.textContent = m.text;
    row.append(d, t); el.append(row);
  }
}
// ----- G hooks (spec M5): G.arc (live getter), setArc (deep merge), arcChoose, raid, fever, goalsOf, plus test probes
function arcDeep(t, p) {
  for (const k in p) {
    const v = p[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) arcDeep(t[k], v); else t[k] = v;
  }
  return t;
}
function arcHooks(G) {
  Object.defineProperty(G, 'arc', { get: () => S.arc, configurable: true });
  Object.assign(G, {
    setArc(patch = {}) { arcDeep(S.arc, patch); ARCS.ch = -1; ARCS.q = ''; drawQuest(); return S.arc; },
    arcChoose: (id, i = 0) => arcPick(id, i),
    raid: () => arcRaid(),
    fever: (v) => (v == null ? S.arc.fever : arcFeverSet(v)),
    goalsOf: (id) => goalsOf(id ? CH[chIdx(id)] : CH[S.ch]).map(([l, f]) => [l, !!f()]),
    arcDbg: {
      state: () => ({ scene: ARCS.scene, season: S.arc.season, snow: +ARCS.uSnow.value.toFixed(2), autumn: +ARCS.uAutumn.value.toFixed(2), raidOn: ARCS.raidOn, vigil: ARCS.vigil,
        npcs: ARCS.npcs.map((e) => ({ id: e.id, mode: e.mode, hidden: !!e.hidden, child: !!e.child, x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1) })), props: Object.keys(ARCS.props),
        choice: MAT.choice?.id || null, card: [$('card-sub')?.textContent, $('card-season')?.textContent, $('card-recap')?.textContent] }),
      spot: (id) => arcSpot(id), opts: (id) => ARC_OPTS[id]?.().map((o) => ({ label: o.label, value: o.value, ok: !o.req || !!o.req() })),
      epilogue: () => ARCD.epilogueLines(S.arc, S.rom), memories: () => S.arc.memory.map((m) => m.text), bed: () => arcBed(), camp: () => arcCampPos(),
      target: () => arcTarget(P.pos), sync: () => { ARCS.ch = -1; }, npc: (id) => arcGet(id),   // tests: the live arc NPC (e.g. Pell for a portrait)
      skip: () => { subs.length = 0; subT = 0; $('sub').classList.remove('on'); for (const w of ARCS.waits) if (!w.subs) w.t = clock; },   // tests: fast-forward lines and waits
      season: () => { ARCS.season.snap = true; },    // tests: jump the season tint instead of easing it
      vigil: (o) => Object.assign(ARCS, o),          // tests: tune the vigil seat (vigilAt: [lateral k, along])
      sick: () => { const m = ARCS.sick; if (!m) return null; const p = m.geometry.attributes.position, B = N.h.bones, V = THREE.Vector3; return { vis: m.visible, pos: m.position.toArray(), sc: m.scale.toArray(), maxY: Math.max(...p.array.filter((_, i) => i % 3 === 1)), bones: ['pelvis', 'calf_l', 'foot_l', 'ball_l'].map((n) => B[n].getWorldPosition(new V()).toArray().map((v) => +v.toFixed(2))) }; },   // tests: the sick-bed blanket
      cam: (p, l, t = 60) => { camShot = p ? { pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l), t } : null; return !!camShot; }, shot: () => camShot && { pos: camShot.pos?.toArray().map((v) => +v.toFixed(2)), look: camShot.look?.toArray().map((v) => +v.toFixed(2)) },   // tests: frame a portrait
      beats: () => arcBeats(CH[S.ch].id), memTab: () => { $('maptabs').querySelector('[data-mt="mem"]').click(); },
    },
  });
  return G;
}

// ---------- epilogue ----------
function spawnVillagers() {
  const home = structs.find((s) => s.kind === 'house') || structs.find((s) => s.kind === 'fire') || { x: 0, z: 0 };
  const looks = [
    { hair: 'buzz', light: true, hairColor: 0x8a6a45 }, { female: true, hair: 'buns', hairColor: 0x7a4a32 },
    { hair: 'parted', beard: false, tint: 0xd9c0b0, hairColor: 0x2e2622 }, { female: true, light: true, hairColor: 0xa88a55 },
    { child: 'boy', hair: 'buzz', scale: 0.8, hairColor: 0x4a382c }, { child: 'girl', hair: 'buns', scale: 0.76, hairColor: 0x5a4030 },   // CHILD: children's bodies and tunics
  ];
  for (let i = 0; i < 3; i++) spawn('cow', home.x + 9 + i * 3, home.z + 7 - i * 2, { tame: true, home });
  for (let i = 0; i < 2; i++) { try { spawn('donkey', home.x + 8 + i * 3, home.z + 12 - i * 2, { tame: true, home, hp: 40 }); } catch { break; } }   // WP6 (the donkey model comes with WP4)
  looks.forEach((look, i) => {
    const v = { pos: new THREE.Vector3(home.x + Math.cos(i) * 8, 0, home.z + Math.sin(i) * 8), face: i, h: makeHuman(look), speed: 0, wait: i, tx: home.x, tz: home.z, home };
    scene.add(v.h.root); villagers.push(v);
  });
}
const spawnVillagersIfMissing = () => { if (!villagers.length) spawnVillagers(); };
// STORY: the epilogue skips seven winters (Lio is a girl of seven who rides; Book II picks her up at eighteen).
const EPI_YEARS = 7;
function ensureLio() {                                // a migrated or skipped save reaching the epilogue without its daughter
  if (!S.kids.length) { S.kids.push({ name: 'Lio', female: true, born: S.day - (S.village ? EPI_YEARS * 365 : 0) }); if (!cnt('born')) bump('born'); }
  for (const k of S.kids) spawnKid(k);                // no-op for kids already in the world
  for (const c of kids) kidLook(c);                  // CHILD: the girl's body, if she was spawned as a baby
}
// STORY: after the seven-winters jump the HUD reads "Year 8 · Day 3" instead of "Day 2565" (S.day itself keeps counting for ages).
function dayLabel() {
  if (!S.village) return `Day ${S.day}`;
  if (S.c.epiDay == null) S.c.epiDay = Math.min(S.day, S.kids?.[0]?.born != null ? S.kids[0].born + EPI_YEARS * 365 : S.day);   // older saves
  const d = Math.max(0, S.day - S.c.epiDay);
  return `Year ${EPI_YEARS + 1 + Math.floor(d / 365)} · Day ${(d % 365) + 1}`;
}
function epilogue() {
  if (S.village) { spawnVillagersIfMissing(); ensureLio(); return; }    // never place the village or skip the years twice
  fadeTo('Many winters pass…', () => {
    if (S.village) { spawnVillagersIfMissing(); ensureLio(); return; }
    const home = structs.find((s) => s.kind === 'house') || structs.find((s) => s.kind === 'fire') || { x: 0, z: 0 };
    let made = 0;
    for (let i = 0; i < 40 && made < 4; i++) {
      const a = i * 1.37 + 0.6, r = 14 + i * 1.3, x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r, h = getHeight(x, z);
      if (h < 1.2 || slopeY(x, z) < 0.95 || Math.abs(getHeight(x + 3, z) - h) > 0.6 || Math.abs(getHeight(x, z + 3) - h) > 0.6) continue;
      if (structs.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + 6)) continue;
      placeStruct('house', x, z, Math.atan2(home.x - x, home.z - z), true); made++;
    }
    goreTimeSkip();                                  // GORE-FIX: seven winters: no wound or blood survives to the family portrait
    S.village = true; S.time = 8; S.day += EPI_YEARS * 365; S.c.epiDay = S.day; ensureLio();   // STORY epiDay: the HUD counts from the jump
    Object.assign(S, { food: 90, water: 90, warm: 100, hp: 100 });   // final test: the years-long skip left hunger/thirst near empty
    spawnVillagers(); epilogueExtras(home); save();   // WP6: Lio grown, on the horse; final camera shot
  }, 3500);
}

// ---------- SURV ----------
// Spec M3 (spec_mature.md §7 M3): injuries, illness, water quality, food spoilage and cooking on the spit. The rules and
// tables are pure in survival.js (unit-tested); this section is the glue: S.aff / S.naff, the per-frame and 1 Hz ticks,
// the moodle row, the body screen (I), the spit and boiling at the fire, the rack, the basket, Sena tending and leaning,
// and the modifiers the rest of the game reads. Difficulty: D().aff (off|gentle|full), D().ill (off|low|high),
// D().spoil (off|survivor|hardcore), D().cook (instant|spit); matGrace() blocks rolled afflictions early in a run.
// One-line // SURV hooks elsewhere: give, findTarget (survTarget, the river drink), structTarget (fire, rack, basket,
// well, farm mulch), updatePlayer (survSpeed), updateStats (survStats), updateSena (survSena), keydown (survKey),
// soakTogether (survSoak), aimSolve (survWobble), drawInv (survSkinTag). eat/drinkSkin/fillSkin/heal are SURV-owned.
const SV = { gh: null, ghF: 0, sec: 0, m: SURV.affMods([]), rng: Math.random, fArm: false, fT: 0, fArmAt: 0, retch: 0, kneelW: 0, kneelT: 0, kneelPose: null,
  limpW: 0, limpPh: 0, limpSide: 1, lean: false, leanSide: 1, leanW: 0, tend: null, boil: null, body: false, bodyFlag: null, bodySel: null, bodyT: 0, hold: null,
  mdSig: null, mdPrev: {}, drip: 0, visBleed: 0, sheltered: false, fxT: 0, romActs: false, actsTry: 0, hypoWarn: 0, burnWarn: 0 };
const SV_SRC = { river: 'river', lake: 'lake', marsh: 'marsh', well: 'well', boiled: 'boiled' };
const svCtx = (o = {}) => { const d = D(); return { aff: d.aff, ill: d.ill, mode: d.mode, gh: S.gh, last: S.risk?.last ?? null, grace: matGrace(), hp: S.hp, rng: SV.rng, ...o }; };
const svSkin = () => (S.tools.waterskin ? { n: S.skin, q: S.skinQ } : null);
const svNear = (pos, r) => Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z) < r;
function svMods() { SV.m = SURV.affMods(S.aff, { lean: SV.lean, aff: D().aff, warm: S.warm }); return SV.m; }
STAM_CAPS.push(() => SV.m.stamCap);                  // MAT stamina-cap hook: poison 50, hypothermia 50, dysentery 60, fever 70
// GORE reads this for the bleeding edge pulse (typeof-guarded there).
function survBleeding() { return SV.m.bleed || 0; }
// Wolves smell blood: while Aro bleeds at night (after the hunt chapter), the next pack comes twice as fast.
function survScent() { return SV.m.bleed && world.env.night > 0.6 && reached('hunt') ? 1 : 0; }

// ----- recipes and herb nodes (spec M3 tables)
RECIPES.splice(RECIPES.findIndex((r) => r.id === 'poultice') + 1, 0,
  { id: 'bandage', item: 'bandage', name: 'Fibre bandage', desc: 'Stops light bleeding. Twisted reed fibre, bound tight. H treats your worst wound.', cost: { fiber: 3 }, ch: 'fire' },
  { id: 'splint', item: 'splint', name: 'Splint', desc: 'Two straight sticks and fibre. A splinted ankle can run again; a broken leg needs one to mend.', cost: { stick: 2, fiber: 2 }, ch: 'fire' },
  { id: 'hidebandage', item: 'hidebandage', name: 'Hide bandage', desc: 'A strip of hide: stops heavy bleeding that fibre cannot.', cost: { hide: 1, fiber: 1 }, ch: 'hunt' },
  { id: 'ypoultice', item: 'ypoultice', name: 'Yarrow poultice', desc: 'Crushed yarrow stops bleeding and keeps a wound clean. Also treats a fever.', cost: { yarrow: 2, fiber: 1 }, ch: 'hunt' },
  { id: 'boilbag', name: 'Boiling bag', desc: 'A hide bag for water and hot stones from the fire: boiled water is safe to drink.', cost: { hide: 1, fiber: 2 }, ch: 'hunt' },
  { id: 'pot', name: 'Clay pot', desc: 'Shaped from river clay and hardened in the campfire. Boils water fast and brews mint and willow-bark teas.', cost: { clay: 3 }, ch: 'clay' });
Object.assign(NODE, {
  yarrow: ['Pick yarrow', () => give('yarrow', 2), 260],     // meadow and valley
  mint: ['Pick mint', () => give('mint', 2), 240],           // within 6 m of the river
  willow: ['Strip willow bark', () => give('willow', 1), 300],   // riverbank willows
});

// ----- adding afflictions, and what the player hears about it
const SV_LINES = {
  bleed: ['You are bleeding, Aro. Bind it, quickly.', 'That is deep. Press on it, hard.'],
  sprain: ['Your ankle? Lean on me if you need to.', 'Careful on that foot.'],
  fracture: ['Do not move it. It is broken. We need a splint.'],
  infection: ['The wound is hot. That is fever coming. Willow bark, Aro, or yarrow.'],
  hypo: ['You are shaking. Come to the fire, now.'],
  dysentery: ['Bad water. Boil it from now on, or drink at the well.'],
};
function survAdd(id, part, sev = 1, who = 'P', o = {}) {
  if (who === 'N' && D().aff !== 'full') return false;  // Sena's own wounds: Hardcore only
  const list = who === 'N' ? S.naff : S.aff;
  const before = new Map(list.map((a) => [a, a.sev]));   // MAT-SV: did a re-hit make it worse?
  const r = SURV.addAff(list, id, part, sev, svCtx({ force: !!o.force, src: o.src || null }));
  if (!r.a) return false;
  r.rose = r.fresh || r.a.sev > (before.get(r.a) ?? 0);
  if (r.fresh && who === 'P') S.risk.last = S.gh;
  svMods(); svMoodles(true);
  if (who === 'P' && !o.quiet) svNotify(r.a, r.fresh, r.rose);
  return true;
}
function svNotify(a, fresh, rose = fresh) {
  const name = SURV.AFF[a.id].name, where = SURV.PART_NAME[a.part];
  if (a.id === 'poison') return;                     // silent until the onset
  if (MAT.dead || MAT.endT > 0 || MAT.rescuing) return;   // MAT-SV: nothing over the death or rescue fade
  if (!fresh && !rose && a.id !== 'sprain') return;  // MAT-SV: a re-hit that did not make it worse says nothing (the moodle pulses)
  const tk = 'aff_' + a.id + (a.part || '');
  if (a.id === 'bleed') toast(`Bleeding (${SURV.AFF.bleed.sevName[a.sev]}) · ${where} · H to treat`, tk);
  else if (a.id === 'sprain') toast(fresh ? 'Your ankle twists under you: sprained' : 'The ankle hurts again');
  else if (a.id === 'fracture') toast('Something snaps in your leg: it is broken');
  else if (a.id === 'dysentery') toast('Your gut cramps. The water was bad');
  else if (a.id === 'hypo') toast('Hypothermia: you cannot stop shaking');
  else toast(name);
  A.tone(a.id === 'bleed' ? 110 : 150, 0.5, 0.06);
  const k = 'svl_' + a.id;
  if (SV_LINES[a.id] && svNear(N.pos, 25) && !(N.downed > 0) && !(P.downed > 0) && cnt(k) < 3 && fresh) { bump(k); say('Sena', SV_LINES[a.id][cnt(k) % SV_LINES[a.id].length]); }
}
function svCause() {
  const k = S.aff.find((a) => a.id === 'bleed') ? 'bleed' : S.aff.find((a) => a.id === 'infection') ? 'infection' : S.aff.find((a) => a.id === 'hypo') ? 'hypo' : null;
  return k === 'bleed' ? 'You bleed out.' : k === 'infection' ? 'The fever takes you.' : k === 'hypo' ? 'The cold takes you.' : '';
}
function svEvent(e) {
  const a = e.a;
  switch (e.type) {
    case 'clot': toast('The bleeding has stopped. Keep the wound clean'); break;
    case 'infect': toast(`The wound on your ${SURV.PART_NAME[a.part]} is hot and swollen: infected`); A.tone(98, 1.2, 0.07); svNotify(a, true); break;
    case 'closed': toast('The wound has closed'); break;
    case 'heal': toast(a.id === 'sprain' ? 'Your ankle feels strong again' : a.id === 'fracture' ? 'Your leg has mended' : a.id === 'infection' ? 'The fever has broken' : a.id === 'hypo' ? 'The warmth is back in your bones' : a.id === 'wound' ? 'The wound has healed' : `${SURV.AFF[a.id].name}: better`); break;
    case 'onset': toast('Your stomach turns. Something you ate was bad'); A.tone(120, 0.8, 0.05); svMoodles(true); break;
    case 'retch': svRetchStart(); break;
  }
  svMods(); svMoodles(true);
}

// ----- the per-frame tick (called at the end of updateStats, so it runs right after the base drains and regen)
function survStats(dt, sheltered) {
  if (!playing || MAT.dead || MAT.endT) return;
  if (SV.gh == null) svInit();
  const d = D(), m = SV.m, E = world.env, out = P.downed > 0 || MAT.rescuing;
  SV.sheltered = sheltered;
  // modifiers applied on top of what updateStats just did (dysentery drains, hypothermia warmth, slower regen)
  if (m.foodK > 1) S.food = Math.max(0, S.food - dt * 0.085 * d.drainK * (m.foodK - 1));
  if (m.waterK > 1) S.water = Math.max(0, S.water - dt * 0.12 * d.drainK * (m.waterK - 1));
  if (m.warmGainK < 1 && !((E.night > 0.5 || E.storm > 0.5) && !sheltered) && S.warm < 100) S.warm = Math.max(0, S.warm - dt * 5 * (1 - m.warmGainK));
  if (m.regenK < 1 && S.food > 35 && S.water > 35 && S.warm > 0) S.hp = Math.max(0, S.hp - dt * 0.7 * matRegenK() * (1 - m.regenK));
  if (m.stamRegen < 1 && P.speed < 4 && S.stam > 0) S.stam = Math.max(0, S.stam - dt * 12 * (1 - m.stamRegen));   // hypothermia: slower breath back
  if (m.fever) { const w = clock * 0.07; S.warm = clamp(S.warm + 15 * m.fever * (Math.sin(w) - Math.sin(w - dt * 0.07)), 0, 100); }   // fever: warmth swings ±15
  if (!out) {
    const r = SURV.realTick(S.aff, dt, { aff: d.aff, warm: S.warm, rng: SV.rng });
    if (r.hp > 0 && S.hp > m.hpFloor) { S.hp = Math.max(m.hpFloor, S.hp - r.hp); if (S.hp <= 0 && !busy) die(svCause()); }
    for (const e of r.events) svEvent(e);
    if (S.naff.length) {                               // Sena's wounds drain her health (never below 20: her fate is CMB's)
      const rn = SURV.realTick(S.naff, dt, { aff: 'gentle', warm: 60, rng: () => 0.5 });
      if (rn.hp > 0 && S.nhp > 20) S.nhp = Math.max(20, S.nhp - rn.hp);
      if (rn.events.length) svMoodles(true);
    }
  }
  svRetch(dt); svFHold(dt); svDrip(dt); svSpits(dt); svBoil(dt); svRacks(dt); svTendCheck(dt);
  SV.sec += dt;
  if (SV.sec >= 1) { SV.sec = 0; svSecond(); }
  svFx(dt);
}
function svInit() {
  SV.gh = S.gh; SV.ghF = S.gh;
  S.risk ||= { hypo: 0 }; S.risk.under ||= {};
  SURV.reconcile(S.age, S.inv); SURV.reconcile(S.stashAge, S.stash);
  for (const [x, z, items] of S.risk.spits || []) {      // what was on the spit when the game was saved
    const s = structs.find((f) => f.kind === 'fire' && Math.hypot(f.x - x, f.z - z) < 1);
    if (s && items?.length) { s.spit = { items: items.map(([k, t]) => ({ k, t })), putAt: 0 }; svSpitFx(s); }
  }
  SV.kneelPose = samplePose(P.h, 'work', 0.6);
  P.h.addOverride('survKneel', 12, (h) => { if (SV.kneelW > 0.01) applyPose(h, SV.kneelPose, SV.kneelW); });
  P.h.addOverride('survLimp', 40, svLimpPose);
  P.h.addOverride('survLean', 30, (h) => svLeanArm(h, true));
  N.h.addOverride('survLean', 30, (h) => svLeanArm(h, false));
  svRegisterSena(); svMods(); SV.mdSig = null; svMoodles(true);
}
// 1 Hz: game hours (spoilage, afflictions, hypothermia risk), bookkeeping, the moodles
function svSecond() {
  const d = D();
  if (d.aff === 'off' && S.aff.some((a) => SURV.INJURY.has(a.id))) S.aff = S.aff.filter((a) => !SURV.INJURY.has(a.id));   // lowered to Story: only skin deep
  if (d.ill === 'off' && S.aff.some((a) => SURV.ILLNESS.has(a.id))) S.aff = S.aff.filter((a) => !SURV.ILLNESS.has(a.id));
  if (d.aff !== 'full' && S.naff.length) S.naff = [];
  survHours();
  SURV.reconcile(S.age, S.inv);
  for (const k of ['cooked', 'grilled']) if (S.risk.under[k] > (S.inv[k] | 0)) S.risk.under[k] = S.inv[k] | 0;
  S.risk.spits = structs.filter((s) => s.kind === 'fire' && s.spit?.items.length).map((s) => [+s.x.toFixed(2), +s.z.toFixed(2), s.spit.items.map((it) => [it.k, +it.t.toFixed(1)])]);
  if (S.risk.hypo > 0.5 && !SURV.find(S.aff, 'hypo') && clock - SV.hypoWarn > 60) { SV.hypoWarn = clock; toast('You are freezing: get to a fire or shelter'); if (svNear(N.pos, 25)) say('Sena', 'Your lips are blue. The fire, Aro. Now.'); }
  if (!SV.romActs && ++SV.actsTry % 10 === 0) svRegisterSena();
  svMods(); svMoodles();
}
// Game hours since the last call (the 1 Hz tick and every 'hours' event, so skipHours lands at once). Never counted twice.
function survHours() {
  if (SV.gh == null) return;
  const dh = S.gh - SV.gh; if (!(dh > 0)) return;
  SV.gh = S.gh;
  const d = D();
  const sp = SURV.ageFood(S.age, S.inv, dh, d.spoil);
  const bk = structs.find((s) => s.kind === 'basket' && s.rise >= 1);
  SURV.ageFood(S.stashAge, S.stash, dh, d.spoil, bk && depthAt(bk.x, bk.z) > 0.5 ? 0.35 : 0.5);
  const lost = Object.entries(sp);
  if (lost.length) { toast(`Spoiled: ${lost.map(([k, n]) => `${n} ${ITEMS[k].toLowerCase()}`).join(', ')}`); drawInv(); if (cnt('svl_spoil') < 1 && svNear(N.pos, 25)) { bump('svl_spoil'); say('Sena', 'That meat has turned. Dry it on the rack next time, or keep it in the basket.'); } }
  const ctx = { aff: d.aff, mode: d.mode, rng: SV.rng, bed: R.on && R.s?.kind === 'house' ? 'house' : null, sheltered: SV.sheltered, warm: S.warm };
  for (const e of SURV.hoursTick(S.aff, dh, ctx)) svEvent(e);
  SURV.hoursTick(S.naff, dh, { ...ctx, aff: 'gentle', rng: () => 1 });   // Sena is the healer: her wounds never go bad
  if (d.aff !== 'off' && !SURV.find(S.aff, 'hypo')) {
    S.risk.hypo = SURV.hypoRisk(S.risk.hypo || 0, dh, S.warm, d.aff);
    if (S.risk.hypo >= 1 && survAdd('hypo', 'body', 1)) S.risk.hypo = 0;
  } else if (d.aff === 'off') S.risk.hypo = 0;
  svMods();
}
on('hours', () => survHours(), 40);

// ----- bus listeners: hits, falls, sleep, rescue
on('playerHit', (e) => {                             // order 60 (spec §5.1): the affliction roll
  if (e.downed || !(e.dmg > 0)) return;
  if (e.who === 'N') {
    if (D().aff !== 'full') return;
    for (const [id, part, sev] of SURV.hitRolls(e, { aff: 'full', hp: S.nhp, rng: SV.rng })) if (id === 'bleed') survAdd(id, part, sev, 'N');
    return;
  }
  if (e.kind === 'fall') return;                      // the landing handles its own
  if (D().aff === 'off') { if (/bite|claw|gore|cut|pierce/.test(e.kind || '')) SV.visBleed = 10; return; }   // Story: the bleeding is only visual, 10 s
  for (const [id, part, sev] of SURV.hitRolls(e, { aff: D().aff, hp: S.hp, rng: SV.rng })) survAdd(id, part, sev);
}, 60);
on('land', (e) => survLand(e.drop, e.water, e.speed), 50);
function survLand(drop, water = false) {
  const r = SURV.landRolls(drop, { aff: D().aff, rng: SV.rng, water });
  if (r.dmg > 0) playerHurt({ dmg: r.dmg, kind: 'fall' });
  let any = false;
  for (const [id, part, sev] of r.add) any = survAdd(id, part, sev, 'P', { force: drop > 4 }) || any;   // a big drop is not a dice roll: no grace
  if (r.dmg > 0 || any) { A.hit(110, 0.3, 0.5); trauma = Math.min(1, trauma + 0.45); }
  return r;
}
on('rested', (e) => {                                // sleep heals: timers run 2 h per slept hour; Snug cures hypothermia
  const had = S.aff.map((a) => a.id + a.part);
  const ev = SURV.restBonus(S.aff, e.hours || 0, { together: e.together, tier: e.tier });
  SURV.restBonus(S.naff, e.hours || 0, { together: true });
  if (e.tier === 'Snug') S.risk.hypo = 0;
  svMods(); svMoodles(true);
  const sp = SURV.find(S.aff, 'sprain'), fr = SURV.find(S.aff, 'fracture');
  const line = ev.length ? ev.map((x) => (x.a.id === 'sprain' ? 'The ankle has healed.' : x.a.id === 'fracture' ? 'The leg has mended.' : x.a.id === 'hypo' ? 'You are warm again.' : x.a.id === 'infection' ? 'The fever broke in the night.' : x.a.id === 'poison' ? 'Your stomach has settled.' : 'The wound has closed.'))[0]
    : sp ? 'The ankle feels stronger.' : fr ? 'The leg aches, but it is knitting.' : had.length ? 'You feel a little better.' : null;
  R.healLine = line;
  if (line) setTimeout(() => toast(line), 2600);
}, 60);
function svStopBleeds(clean) {
  for (const a of S.aff.filter((x) => x.id === 'bleed')) SURV.treat(S.aff, a, clean ? 'ypoultice' : 'hidebandage', { gh: S.gh });
  svMods(); svMoodles(true);
}
on('revived', (e) => { if (e.who === 'P') svStopBleeds(false); }, 60);   // Sena binds the wounds as she gets him up
on('rescued', () => { svStopBleeds(true); S.aff = S.aff.filter((a) => a.id !== 'hypo'); S.risk.hypo = 0; SV.retch = 0; SV.lean = false; SV.tend = null; SV.boil = null; svMods(); }, 60);
function survSoak() {                                // the hot spring: hypothermia gone, a sprain heals twice as fast
  S.aff = S.aff.filter((a) => a.id !== 'hypo'); S.risk.hypo = 0;
  const sp = SURV.find(S.aff, 'sprain'); if (sp && S.c.svSoakDay !== S.day) { S.c.svSoakDay = S.day; sp.tr *= 0.5; toast('The hot water eases the ankle'); }
  svMods(); svMoodles(true);
}

// ----- movement: speed, sprint, jump (updatePlayer), the spear's aim wobble (aimSolve), the limp and the kneel
function survSpeed(sp, run, dt) {
  const m = SV.m;
  if (SV.retch > 0) { jumpTap = false; return 0; }
  if (m.noJump && !P.swim) jumpTap = false;
  if (!sp) return sp;
  if (run && m.noSprint) { sp = Math.min(sp, P.swim ? 2.1 : 3.3); S.stam = Math.min(matStamCap(), S.stam + dt * 20); }   // no sprint: jog, and give back the sprint's stamina cost
  return sp * (P.swim ? Math.max(0.7, m.speed) : m.speed);
}
function survWobble(dir) {
  const w = SV.m.aimWobble; if (!(w > 0)) return;
  const t = clock;
  dir.x += (Math.sin(t * 2.3) + Math.sin(t * 5.7) * 0.4) * w; dir.z += (Math.cos(t * 1.9) + Math.sin(t * 4.3) * 0.4) * w; dir.y += Math.sin(t * 1.7 + 1) * w * 0.8;
  dir.normalize();
}
const _svAx = new THREE.Vector3(), _svA = new THREE.Vector3(), _svB = new THREE.Vector3(), _svC = new THREE.Vector3();
function svLimpPose(h) {                             // order 40: the body dips and leans over the bad leg once a stride
  const w = SV.limpW; if (w < 0.02) return;
  const s = Math.max(0, Math.sin(SV.limpPh)), k = w * s * s;
  h.bones.pelvis.position.multiplyScalar(1 - 0.045 * k);
  _svAx.set(Math.sin(P.face), 0, Math.cos(P.face));
  rotW(h.bones.spine_01, _svAx, SV.limpSide * 0.14 * k);
  rotW(h.bones.spine_03, _svAx, -SV.limpSide * 0.06 * k);
}
function svFx(dt) {
  const m = SV.m, moving = P.speed > 0.4 && !P.ride && !P.swim && !P.air && !(P.sit > 0) && !(P.rest > 0);
  SV.limpW += ((moving ? m.limp : 0) - SV.limpW) * Math.min(1, dt * 4);
  SV.limpPh += dt * P.speed * 3.4;
  const leg = S.aff.find((a) => (a.id === 'fracture' || a.id === 'sprain'));
  SV.limpSide = leg?.part === 'legR' ? -1 : 1;
  const kneel = (SV.retch > 0 || SV.kneelT > 0) && P.speed < 0.3 && !P.ride && !P.swim && !(P.sit > 0) && !(P.rest > 0) && !(P.downed > 0);
  SV.kneelT = Math.max(0, SV.kneelT - dt);
  SV.kneelW += ((kneel ? 1 : 0) - SV.kneelW) * Math.min(1, dt * 6);
  if ((SV.fxT -= dt) > 0) return;
  SV.fxT = 0.2;
  const el = $('survfx'); if (!el) return;
  const fev = m.fever ? m.fever * (0.55 + 0.25 * Math.sin(clock * 0.9)) : 0, pain = m.pain * (0.6 + 0.2 * Math.sin(clock * 2.1)), sick = m.nausea && SV.retch > 0 ? 0.6 : m.nausea * 0.15;
  const v = Math.max(fev, pain, sick, SURV.find(S.aff, 'hypo') ? 0.45 : 0);
  el.className = fev >= pain && fev >= sick && fev > 0 ? 'fever' : sick > pain ? 'sick' : SURV.find(S.aff, 'hypo') && pain < 0.3 ? 'cold' : '';
  el.style.opacity = (v * (settings.reduceFlash ? 0.6 : 1)).toFixed(2);
}

// ----- poison episodes (no vomit visuals: he stops, kneels, the view sways)
function svRetchStart() {
  if (P.ride || P.swim || busy || P.downed > 0 || P.sit > 0 || P.rest > 0) { const a = SURV.find(S.aff, 'poison'); if (a) a.ep = 8; return; }
  SV.retch = 1.6; P.vx = P.vz = 0; P.auto = false;
  S.food = Math.max(0, S.food - 10); S.water = Math.max(0, S.water - 12);
  A.hit(140, 0.35, 0.25); A.hit(90, 0.5, 0.2);
  if (cnt('svl_retch') < 2 && svNear(N.pos, 20)) { bump('svl_retch'); say('Sena', cnt('svl_retch') === 1 ? 'Let it out. Then water, slowly.' : 'Something you ate. Mint tea will settle it.'); }
}
function svRetch(dt) {
  if (!(SV.retch > 0)) return;
  SV.retch -= dt;
  camYaw += Math.sin(clock * 3.1) * dt * 0.08; camPitch = clamp(camPitch + Math.sin(clock * 2.3) * dt * 0.05, pitchMin(), fppPitchMax());
  trauma = Math.max(trauma, 0.18);
}
// ----- eating raw: hold F for 0.6 s (eat() arms it when only raw food is left)
function svFHold(dt) {
  if (!SV.fArm) return;
  if (keys.KeyF) { SV.fT += dt; if (SV.fT >= 0.6) { SV.fArm = false; SV.fT = 0; survEatRaw(); } }
  else { SV.fT = 0; if (performance.now() - SV.fArmAt > 5000) SV.fArm = false; }
}
function survEatRaw() {
  const I = S.inv, k = I.meat > 0 ? 'meat' : I.fish > 0 ? 'fish' : I.spoiled > 0 ? 'spoiled' : null;
  if (!k) { toast('Nothing to eat'); return false; }
  I[k]--; S.food = Math.min(100, S.food + (k === 'spoiled' ? 12 : 20)); bump('ate_raw');
  const p = SURV.poisonChance(k === 'spoiled' ? 'spoiled' : 'raw', D().ill);
  if (p > 0 && !matGrace() && SV.rng() < p) survAdd('poison', 'gut', 1, 'P', { src: k });
  toast(k === 'spoiled' ? 'You choke down the spoiled meat' : `You force down the raw ${k === 'fish' ? 'fish' : 'meat'} (+20 food)`);
  P.h.swing('useU'); A.hit(500, 0.15, 0.25); drawInv();
  return true;
}
// ----- blood drips while bleeding (GORE's trail splats when GORE is built; dust when Blood is off)
function svDrip(dt) {
  if (SV.visBleed > 0) SV.visBleed -= dt;
  const b = SV.m.bleed || (SV.visBleed > 0 ? 1 : 0); if (!b || P.downed > 0) return;
  if ((SV.drip -= dt) > 0) return;
  SV.drip = [0, 1.6, 0.9, 0.45][b];
  try { const g = window.G?.gore; if (g?.splat) g.splat(P.pos.x + (rand() - 0.5) * 0.4, P.pos.z + (rand() - 0.5) * 0.4, 0.06 + 0.04 * b, settings.blood === 'off' ? 'scuff' : 'trail'); } catch (err) { /* GORE not ready */ }
}

// ----- the moodle row (#moodles in #bars): one round icon per affliction, ring by severity, draining arc
const MD_COL = ['#c9bda6', '#e6c34a', '#e08a3a', '#d0443a'];
const MD_ICON = {
  bleed: '<path d="M12 2.5C9 7.5 6 11 6 14.6a6 6 0 0 0 12 0C18 11 15 7.5 12 2.5z" fill="var(--md-blood)"/><path d="M9.2 15.2a3 3 0 0 0 2.4 2.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
  wound: '<g transform="rotate(-35 12 12)"><rect x="2.5" y="8.4" width="19" height="7.2" rx="2.4" fill="#e8dcc0"/><rect x="9" y="8.4" width="6" height="7.2" fill="#c9b48e"/><g fill="#7a5a40"><circle cx="10.6" cy="10.7" r=".75"/><circle cx="13.4" cy="10.7" r=".75"/><circle cx="10.6" cy="13.3" r=".75"/><circle cx="13.4" cy="13.3" r=".75"/></g></g>',
  infection: '<circle cx="12" cy="12" r="8.6" fill="none" stroke="#c4cf4a" stroke-width="1.8" stroke-dasharray="2.6 2"/><path d="M7.6 15.6l8.8-7.2" stroke="#e05a3a" stroke-width="2.8" stroke-linecap="round"/><path d="M8.6 9.4l1.4 1.2M14 14.6l1.4 1.2" stroke="#e8dcc0" stroke-width="1.4" stroke-linecap="round"/>',
  sprain: '<path d="M8.5 2.5h4.6v9.6l5.6 4c1.5 1.1 1 3.9-1 3.9H6.6c-.9 0-1.6-.7-1.6-1.6v-3.2l3.5-3z" fill="#e8dcc0"/><path d="M15.5 7.4l3-1.8M16.4 10.6h3.2" stroke="#e08a3a" stroke-width="1.6" stroke-linecap="round"/>',
  fracture: '<g transform="rotate(45 12 12)" fill="#e8dcc0"><rect x="10" y="4.5" width="4" height="15"/><circle cx="10" cy="4.8" r="2.5"/><circle cx="14" cy="4.8" r="2.5"/><circle cx="10" cy="19.2" r="2.5"/><circle cx="14" cy="19.2" r="2.5"/></g><path d="M9.2 14.4l2.6-.6-1 2 2.8-1.1" stroke="#3a2618" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
  poison: '<path d="M10 2.8c0 3 1.2 4.2 1.2 6.2 0 2.2-5.4 2-5.4 7 0 3.1 2.6 5.2 6.2 5.2 5.1 0 8.2-3.7 8.2-8.2 0-3.6-2.5-5.3-5.1-5.3-1.7 0-2.2-1.6-2.2-4.9z" fill="#a9c45a"/><path d="M10.2 15.4c1.2-1.6 3.2-1.6 4.4 0" stroke="#3a4a1a" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  dysentery: '<path d="M9 2.8c0 3 1.2 4.2 1.2 6.2 0 2.2-5.4 2-5.4 7 0 3.1 2.6 5.2 6.2 5.2 5.1 0 8.2-3.7 8.2-8.2 0-3.6-2.5-5.3-5.1-5.3-1.7 0-2.2-1.6-2.2-4.9z" fill="#c49a5a"/><path d="M17.6 13.2c-1.4 2.2-2.4 3.4-2.4 4.6a2.4 2.4 0 0 0 4.8 0c0-1.2-1-2.4-2.4-4.6z" fill="#6fb7d9" stroke="#1e2a30" stroke-width=".8"/>',
  hypo: '<g stroke="#bfe3f7" stroke-width="2" stroke-linecap="round" fill="none"><path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2"/><path d="M9.4 4.4L12 7l2.6-2.6M9.4 19.6L12 17l2.6 2.6M4.6 11l3.4 1-1 3.4M19.4 13l-3.4-1 1-3.4"/></g>',
};
const MD_SHORT = { bleed: 'Bleeding', wound: 'Wound', infection: 'Infected', sprain: 'Sprain', fracture: 'Broken', poison: 'Poisoned', dysentery: 'Sick', hypo: 'Freezing', hyporisk: 'Cold' };   // MAT-SV
// MAT-SV: UI scale for big windows: 1 at 1280x720, up to 1.5 at 1920x1080 (index.html applies it with CSS zoom)
function uiScale() { document.documentElement.style.setProperty('--ui', clamp(Math.min(innerHeight / 720, innerWidth / 1280), 1, 1.5).toFixed(3)); }
uiScale(); addEventListener('resize', uiScale);
function svMoodleHtml(a, who, faint = false) {
  const t = a.id === 'hyporisk' ? 1 : SURV.tier(a), col = MD_COL[t], C = 69.1, k = a.id === 'hyporisk' ? S.risk.hypo : SURV.arc(a);
  const icon = MD_ICON[a.id === 'hyporisk' ? 'hypo' : a.id] || '';
  const lab = (who === 'N' ? 'Sena: ' : '') + (MD_SHORT[a.id] || '');   // MAT-SV: a tinted face, a bold ring and a short label
  return `<div class="md${who === 'N' ? ' sena' : ''}${faint ? ' faint' : ''}" data-k="${who}${a.id}${a.part || ''}"><svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="12.4" fill="rgba(14,10,8,.9)"/><circle cx="13" cy="13" r="12.4" fill="${col}" fill-opacity=".2"/>`
    + `<circle cx="13" cy="13" r="11" fill="none" stroke="${col}" stroke-opacity=".4" stroke-width="2.4"/><circle class="arc" cx="13" cy="13" r="11" fill="none" stroke="${col}" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - k)).toFixed(1)}" transform="rotate(-90 13 13)"/>`
    + `<g transform="translate(4.4 4.4) scale(.717)">${icon}</g></svg><small>${lab}</small></div>`;
}
function svMoodles(force = false) {
  const el = $('moodles'); if (!el) return;
  const L = [...S.aff.map((a) => [a, 'P']), ...S.naff.map((a) => [a, 'N'])];
  const hr = !SURV.find(S.aff, 'hypo') && (S.risk?.hypo || 0) > 0.15 ? [{ id: 'hyporisk', part: 'body' }, 'P'] : null;
  if (hr) L.push(hr);
  const sig = L.map(([a, w]) => w + a.id + (a.part || '') + (a.id === 'hyporisk' ? 1 : SURV.tier(a))).join('|') + settings.blood;
  if (force || sig !== SV.mdSig) {
    const prev = SV.mdPrev, next = {};
    el.innerHTML = L.map(([a, w]) => svMoodleHtml(a, w, a.id === 'hyporisk' || (a.id === 'poison' && a.onset > 0))).join('');
    [...el.children].forEach((c, i) => {
      const [a] = L[i], key = c.dataset.k, t = a.id === 'hyporisk' ? 0 : SURV.tier(a);
      next[key] = t;
      if (SV.mdSig != null && (prev[key] == null || t > prev[key])) { c.classList.add('worse'); }
    });
    el.style.setProperty('--md-blood', settings.blood === 'off' ? '#9a948a' : '#c8322a');
    SV.mdPrev = next; SV.mdSig = sig;
  }
  [...el.children].forEach((c, i) => {                // live arcs and tooltips
    const [a, w] = L[i] || []; if (!a) return;
    const k = a.id === 'hyporisk' ? S.risk.hypo : SURV.arc(a);
    c.querySelector('.arc')?.setAttribute('stroke-dashoffset', (69.1 * (1 - k)).toFixed(1));
    c.title = a.id === 'hyporisk' ? `Getting dangerously cold (${Math.round(k * 100)}%). Find a fire or shelter.` : (w === 'N' ? 'Sena: ' : '') + SURV.describe(a, S.gh);
  });
}

// ----- water: the river/lake drink, the waterskin, the well
function survRiverTarget(p) {
  const src = SURV.waterSource(biomeAt(p.x, p.z));
  return { label: src === 'lake' ? 'Drink from the lake' : 'Drink from the river', key: true, act() {
    S.water = Math.min(100, S.water + 40); bump('drank'); A.hit(2600, 0.25, 0.2); toast(src === 'lake' ? 'You drink the still lake water' : 'You drink the cold water');
    svDrink(src); fillSkin(src);
  } };
}
// Each drink: unsafe water rolls dysentery; clean water (well, boiled) counts toward curing it.
function svDrink(src) {
  const dy = SURV.find(S.aff, 'dysentery'), po = SURV.find(S.aff, 'poison');
  if (po && !(po.onset > 0)) po.tr = Math.max(0, po.tr - 0.5);   // rest plus water
  if (src === 'well' || src === 'boiled') { if (dy) { SURV.treat(S.aff, dy, 'boiled', { gh: S.gh }); svMoodles(true); } return; }
  const p = SURV.waterChance(src, D().ill);
  if (p > 0 && !matGrace() && SV.rng() < p) survAdd('dysentery', 'gut', 1, 'P', { src });
}
function survSkinTag() {
  if (!S.tools.waterskin || S.skin <= 0) return '';
  const src = S.skinQ === 'safe' ? (S.risk?.skinSrc === 'well' ? 'well' : 'boiled') : SV_SRC[S.risk?.skinSrc] || 'river';
  return ` <em class="${S.skinQ === 'safe' ? 'safe' : 'raw'}">(${src})</em>`;
}

// ----- food: the basket keeps ages with it; the rack makes dried meat; mulching a plot with spoiled food
function survBasket(s, t) {
  const FOOD = ['berry', 'meat', 'cooked', 'fish', 'grilled', 'bread', 'dried', 'driedfish', 'spoiled'];
  const cave = depthAt(s.x, s.z) > 0.5, spoil = D().spoil !== 'off';
  if (FOOD.some((k) => S.stash[k] > 0)) return t('Take the food from the basket', () => {
    SURV.reconcile(S.age, S.inv); SURV.reconcile(S.stashAge, S.stash);
    for (const k of FOOD) if (S.stash[k] > 0) { SURV.moveAges(S.stashAge, S.age, k, S.stash[k]); S.inv[k] += S.stash[k]; delete S.stash[k]; }
    toast(S.inv.spoiled > 0 && spoil ? 'You take the food back (some of it has spoiled)' : 'You take the food back'); drawInv();
  });
  if (FOOD.some((k) => k !== 'spoiled' && S.inv[k] > 0)) return t('Store food in the basket', () => {
    SURV.reconcile(S.age, S.inv); SURV.reconcile(S.stashAge, S.stash);
    for (const k of FOOD) if (k !== 'spoiled' && S.inv[k] > 0) { SURV.moveAges(S.age, S.stashAge, k, S.inv[k]); S.stash[k] = (S.stash[k] || 0) + S.inv[k]; S.inv[k] = 0; }
    toast(spoil ? (cave ? 'Food stored in the basket: the cool cave keeps it three times as long' : 'Food stored in the basket: it keeps twice as long here') : 'Food stored in the basket'); drawInv();
  });
  return t('Storage basket (empty)');
}
function survRack(s, t) {
  const ready = s.hang.filter((h) => h[1] >= 90).length, slow = D().cook !== 'instant', storm = world.env.storm > 0.5;
  if (ready) return t(`Take dried food (${ready})`, () => {
    for (const h of s.hang.filter((h) => h[1] >= 90)) give(h[0] === 'fish' ? 'driedfish' : 'dried', 1);
    s.hang = s.hang.filter((h) => h[1] < 90); bump('dried', ready); A.hit(800, 0.12, 0.3); drawInv();
  });
  if ((S.inv.meat > 0 || S.inv.fish > 0) && s.hang.length < 4) return t(S.inv.meat > 0 ? 'Hang meat to dry' : 'Hang fish to dry', () => {
    while (s.hang.length < 4 && (S.inv.meat > 0 || S.inv.fish > 0)) { const k = S.inv.meat > 0 ? 'meat' : 'fish'; S.inv[k]--; s.hang.push([k, 0]); }
    toast(slow ? 'Hung up to dry: about 3 hours, and it keeps for good (rain stops it)' : 'Hung up to dry (ready in about 90 s)'); A.hit(500, 0.1, 0.3); drawInv();
  });
  return t(s.hang.length ? `Drying… ${Math.round(Math.max(...s.hang.map((h) => h[1])) / 0.9)}%${slow && storm ? ' · the rain has stopped it' : ''}` : 'Drying rack — bring raw meat or fish');
}
function svRacks(dt) {                               // Survivor/Hardcore: 3 game hours (the rack's own update adds real seconds)
  const dg = S.gh - SV.ghF; SV.ghF = S.gh;
  if (D().cook === 'instant') return;
  const storm = world.env.storm > 0.5;
  for (const s of structs) if (s.kind === 'rack' && s.hang?.length) for (const h of s.hang) if (h[1] < 90) h[1] = Math.max(0, h[1] - dt + (storm ? 0 : 30 * Math.max(0, dg)));
}
function survMulch(s) {
  S.inv.spoiled--; s.grow = Math.min(1, s.grow + 0.25); bump('mulch'); P.h.swing('pickU'); toast('You dig the spoiled food into the soil: the crop grows faster'); drawInv();
}

// ----- the fire: the spit (Survivor/Hardcore), boiling water, teas; Story keeps the instant cook
const SV_WOOD = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.95 });
const SV_GEO = { post: new THREE.CylinderGeometry(0.022, 0.03, 1.14, 5), fork: new THREE.CylinderGeometry(0.012, 0.018, 0.22, 4), bar: new THREE.CylinderGeometry(0.014, 0.014, 1.5, 5),
  meat: new THREE.IcosahedronGeometry(0.085, 1).scale(1, 0.8, 1.35), fish: new THREE.CapsuleGeometry(0.04, 0.2, 2, 6).rotateX(Math.PI / 2).scale(0.8, 1.1, 1),
  pot: new THREE.CylinderGeometry(0.15, 0.11, 0.2, 12), bag: new THREE.SphereGeometry(0.15, 10, 8).scale(1, 0.85, 1) };
const SV_COL = { meat: [0x9b3b33, 0x8a4630, 0x6b3a1f, 0x46271a, 0x1a1310], fish: [0xb9b29c, 0xb09a6a, 0x9a7442, 0x6a4a2a, 0x1a1310] };
const SV_DN = ['raw', 'under', 'cooked', 'well', 'burnt'];
const _svCol = new THREE.Color(), _svCol2 = new THREE.Color();
function svSpitFx(s) {
  if (s.spitFx) return s.spitFx;
  const g = new THREE.Group();
  for (const z of [-0.66, 0.66]) {
    const p = new THREE.Mesh(SV_GEO.post, SV_WOOD); p.position.set(0, 0.55, z); p.rotation.x = z * 0.08; p.castShadow = true; g.add(p);
    for (const sx of [-1, 1]) { const f = new THREE.Mesh(SV_GEO.fork, SV_WOOD); f.position.set(sx * 0.04, 1.14, z); f.rotation.z = -sx * 0.5; g.add(f); }
  }
  const rot = new THREE.Group(); rot.position.set(0, 1.08, 0); g.add(rot);
  const bar = new THREE.Mesh(SV_GEO.bar, SV_WOOD); bar.rotation.x = Math.PI / 2; rot.add(bar);
  const lumps = [-0.28, 0, 0.28].map((z) => { const m = new THREE.Mesh(SV_GEO.meat, new THREE.MeshStandardMaterial({ color: 0x9b3b33, roughness: 0.55 })); m.position.set(0, -0.01, z); m.visible = false; m.castShadow = true; rot.add(m); return m; });
  const vessel = new THREE.Mesh(SV_GEO.pot, new THREE.MeshStandardMaterial({ color: 0x9a5a3a, roughness: 0.8 })); vessel.position.set(0.5, 0.12, 0.42); vessel.visible = false; g.add(vessel);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sprite.scale.set(1.5, 0.375, 1); sprite.position.set(0, 1.95, 0); sprite.renderOrder = 10; sprite.visible = false;
  s.group.add(g, sprite);
  g.visible = false;
  return (s.spitFx = { g, rot, lumps, vessel, sprite, cv, cx: cv.getContext('2d'), tex, sig: '', drawT: 0, steam: 0 });
}
function svDoneIdx(t) { return SV_DN.indexOf(SURV.doneness(t)); }
function svBarDraw(fx, s) {
  const items = s.spit?.items || [], b = SV.boil?.s === s ? SV.boil : null;
  const g = fx.cx, W = 256, H = 64, X0 = 14, X1 = W - 14, T = 22, tx = (t) => X0 + (X1 - X0) * Math.min(1, t / T);
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(18,14,10,0.78)'; g.beginPath(); g.roundRect(2, 2, W - 4, H - 4, 10); g.fill();
  g.font = '600 17px Georgia, serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  if (b && !items.length) {
    const k = clamp(b.t / b.T, 0, 1);
    g.fillStyle = '#f3ead9'; g.fillText(b.kind === 'water' ? 'Boiling water' : b.kind === 'minttea' ? 'Brewing mint tea' : 'Brewing willow tea', X0, 20);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(X0, 36, X1 - X0, 14);
    g.fillStyle = '#6fb7d9'; g.fillRect(X0, 36, (X1 - X0) * k, 14);
  } else {
    const worst = items.reduce((m, it) => Math.max(m, it.t), 0), dn = SURV.doneness(worst);
    g.fillStyle = dn === 'burnt' ? '#e0703a' : dn === 'cooked' ? '#9be37a' : dn === 'well' ? '#e6c34a' : '#f3ead9';
    g.fillText({ raw: 'Raw', under: 'Undercooked', cooked: 'Cooked: take it off', well: 'Well done: take it off!', burnt: 'Burning!' }[dn], X0, 20);
    const zones = [[0, SURV.SPIT.under, '#7a3a2a'], [SURV.SPIT.under, SURV.SPIT.done, '#5f9e44'], [SURV.SPIT.done, SURV.SPIT.burn, '#c9973a'], [SURV.SPIT.burn, T, '#2a1d17']];
    for (const [a, z, c] of zones) { g.fillStyle = c; g.fillRect(tx(a), 36, tx(z) - tx(a), 14); }
    g.strokeStyle = 'rgba(243,234,217,0.5)'; g.lineWidth = 1; g.strokeRect(X0 + 0.5, 36.5, X1 - X0 - 1, 13);
    for (const it of items) { const x = tx(it.t); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, 34); g.lineTo(x - 5, 27); g.lineTo(x + 5, 27); g.closePath(); g.fill(); g.fillRect(x - 1, 34, 2, 18); }
    if (b) { g.fillStyle = '#6fb7d9'; g.fillRect(X0, 54, (X1 - X0) * clamp(b.t / b.T, 0, 1), 4); }
  }
  fx.tex.needsUpdate = true;
}
function svSpits(dt) {
  for (const s of structs) {
    if (s.kind !== 'fire') continue;
    const fx = s.spitFx, items = s.spit?.items;
    if (!fx) continue;
    const near = svNear(s, 30), boiling = SV.boil?.s === s;
    fx.g.visible = !!items?.length || boiling;
    fx.vessel.visible = boiling;
    if (boiling) { fx.vessel.geometry = S.tools.pot ? SV_GEO.pot : SV_GEO.bag; fx.vessel.material.color.set(S.tools.pot ? 0x9a5a3a : 0x7a5236); if ((fx.steam -= dt) <= 0) { fx.steam = 0.35; fx.vessel.getWorldPosition(_svA); wpnPuff(_svA.x, _svA.y + 0.2, _svA.z, 0xe8e4dc); } }
    if (items?.length) {
      fx.rot.rotation.z += dt * 0.9;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i], was = it.t; it.t += dt;
        if (was <= SURV.SPIT.burn && it.t > SURV.SPIT.burn) { if (near && clock - SV.burnWarn > 4) { SV.burnWarn = clock; toast('The food on the spit is burning!'); } }
        if (it.t > SURV.SPIT.burn && rand() < dt * 2) { fx.rot.getWorldPosition(_svA); wpnPuff(_svA.x, _svA.y + 0.1, _svA.z, 0x3a3430); }
        if (it.t > 40) { items.splice(i, 1); if (near) toast('It burned to charcoal and fell into the fire'); }
      }
      fx.lumps.forEach((m, i) => {
        const it = items[i]; m.visible = !!it; if (!it) return;
        m.geometry = it.k === 'fish' ? SV_GEO.fish : SV_GEO.meat;
        const c = SV_COL[it.k] || SV_COL.meat, x = clamp(it.t / SURV.SPIT.burn, 0, 1.25) * 3, j = Math.min(3, x | 0);
        m.material.color.copy(_svCol.setHex(c[j]).lerp(_svCol2.setHex(c[Math.min(4, j + 1)]), x - j));
        m.material.roughness = it.t > SURV.SPIT.under ? 0.4 : 0.6;
      });
      if (near && rand() < dt * 5) A.hit(2400 + rand() * 2200, 0.04, 0.05 * (1 - Math.hypot(s.x - P.pos.x, s.z - P.pos.z) / 30));
    }
    const show = (items?.length || boiling) && svNear(s, 14);
    fx.sprite.visible = !!show;
    if (show) { fx.g.getWorldPosition(_svB); const w = clamp(camera.position.distanceTo(_svB) * 0.34, 1.5, 3.6); fx.sprite.scale.set(w, w / 4, 1); fx.sprite.position.y = 1.95 + (w - 1.5) * 0.22; }   // readable from the third-person camera
    if (show && (fx.drawT -= dt) <= 0) { fx.drawT = 0.15; svBarDraw(fx, s); }
  }
}
function svSpitPut(s) {
  const sp = (s.spit ||= { items: [], putAt: 0 });
  let n = 0;
  while (sp.items.length < SURV.SPIT.max && (S.inv.meat > 0 || S.inv.fish > 0)) { const k = S.inv.meat > 0 ? 'meat' : 'fish'; S.inv[k]--; sp.items.push({ k, t: 0 }); n++; }
  sp.putAt = clock; svSpitFx(s); P.h.swing('useU'); A.hit(3000, 0.4, 0.15);
  toast(`${n} on the spit · take it off in the green`);
  if (cnt('svl_spit') < 1) { bump('svl_spit'); if (svNear(N.pos, 20)) say('Sena', 'Turn it, and do not walk off. It burns faster than you think.'); }
  drawInv();
}
function svSpitTake(s) {
  const sp = s.spit; if (!sp?.items.length) return;
  let cooked = 0, under = 0, raw = 0, burnt = 0;
  for (const it of sp.items) {
    const d = SURV.doneness(it.t), out = SURV.SPIT_OUT[it.k] || 'cooked';
    if (d === 'raw') { S.inv[it.k]++; raw++; continue; }
    if (d === 'burnt') { burnt++; continue; }
    S.inv[out]++; survGive(out, 1);
    if (d === 'under') { under++; S.risk.under[out] = (S.risk.under[out] || 0) + 1; } else cooked++;
  }
  sp.items = []; bump('cook', cooked + under);
  const msg = [cooked && `${cooked} cooked`, under && `${under} undercooked`, raw && `${raw} still raw`, burnt && `${burnt} burnt to charcoal`].filter(Boolean).join(', ');
  toast(`Off the spit: ${msg}`); A.hit(3000, 0.6, 0.25); P.h.swing('useU'); drawInv();
}
function svSpitWord(items) { const t = items.reduce((m, it) => Math.max(m, it.t), 0); return { raw: 'still raw', under: 'undercooked', cooked: 'cooked', well: 'well done', burnt: 'burning' }[SURV.doneness(t)]; }
// SURV-FIX: a fire in E reach with food on its spit (findOtherTarget: "Share a meal" no longer takes E from the spit)
function svSpitAt(p) { return structs.some((s) => s.kind === 'fire' && s.rise >= 1 && s.spit?.items?.length > 0 && Math.hypot(s.x - p.x, s.z - p.z) - s.radius < 1.6); }
// Boiling and brewing: start at the fire, stay within a few steps (he kneels) until it is done.
function svBoilStart(s, kind) {
  SV.boil = { s, kind, t: 0, T: kind === 'water' && !S.tools.pot ? 20 : 8 };
  svSpitFx(s); P.vx = P.vz = 0;
  toast(kind === 'water' ? (S.tools.pot ? 'The pot is on the fire (about 8 s): stay close' : 'Hot stones into the bag (about 20 s): stay close') : `Brewing ${kind === 'minttea' ? 'mint' : 'willow-bark'} tea: stay close`);
  A.hit(400, 0.3, 0.2);
}
function svBoil(dt) {
  const b = SV.boil; if (!b) return;
  const d = Math.hypot(b.s.x - P.pos.x, b.s.z - P.pos.z);
  if (d > 9) { SV.boil = null; toast(b.kind === 'water' ? 'You walked away: the water went cold' : 'You walked away: the tea went cold'); return; }
  if (d > 3.4) return;                               // paused while you wander a few steps
  b.t += dt; if (P.speed < 0.3) SV.kneelT = 0.25;
  if (b.t < b.T) return;
  SV.boil = null;
  if (b.kind === 'water') { S.skin = 3; S.skinQ = 'safe'; S.risk.skinSrc = 'boiled'; toast('Boiled water: the waterskin is full and safe'); }
  else {
    const herb = b.kind === 'minttea' ? 'mint' : 'willow';
    if (S.inv[herb] > 0 && S.skin > 0) { S.inv[herb]--; S.skin--; S.inv[b.kind]++; toast(`+1 ${ITEMS[b.kind]}`); } else toast('You need the herb and water in the skin');
  }
  bump('boiled'); A.tone(660, 0.4, 0.05); drawInv();
}
function survFire(s, t) {
  const I = S.inv, d = D(), items = s.spit?.items || [];
  const sit = Math.hypot(N.pos.x - s.x, N.pos.z - s.z) < 15 && !busy && (I.grain < 2 || S.c.satDay !== S.day);
  const acts = [];
  if (items.length && clock - (s.spit.putAt || 0) > 1.2 && items.some((it) => it.t >= SURV.SPIT.raw)) acts.push([`Take the food off the spit (${svSpitWord(items)})`, () => svSpitTake(s)]);
  const boilOk = (S.tools.boilbag || S.tools.pot) && S.tools.waterskin && !SV.boil;
  if (d.cook === 'instant') {                        // Story: the original chain, first match wins
    if (acts.length) return t(...acts[0]);
    if (I.meat > 0) return t('Cook meat', () => { I.meat--; I.cooked++; survGive('cooked', 1); bump('cook'); toast('+1 Cooked meat'); A.hit(3000, 0.6, 0.25); drawInv(); });
    if (I.fish > 0) return t('Grill fish', () => { I.fish--; I.grilled++; survGive('grilled', 1); bump('cook'); toast('+1 Grilled fish'); A.hit(3000, 0.6, 0.25); drawInv(); });
    if (sit) return t('Sit with Sena', () => sitTogether(s));
    if (I.grain >= 2) return t('Bake flatbread (2 grain)', () => { I.grain -= 2; I.bread++; survGive('bread', 1); toast('+1 Flatbread'); A.hit(3000, 0.4, 0.2); drawInv(); });
    if (boilOk && (S.skin < 3 || S.skinQ !== 'safe')) return t('Boil water', () => svBoilStart(s, 'water'));
    if (SV.boil?.s === s) return t(`Boiling… ${Math.round(SV.boil.t / SV.boil.T * 100)}%`);
    return t('Campfire — bring raw meat, fish or grain to cook');
  }
  if ((I.meat > 0 || I.fish > 0) && items.length < SURV.SPIT.max) acts.push([I.meat > 0 ? 'Put meat on the spit' : 'Put fish on the spit', () => svSpitPut(s)]);
  if (boilOk && (S.skin < 3 || S.skinQ !== 'safe')) acts.push([`Boil water (${S.tools.pot ? 'clay pot' : 'hot stones in the bag'})`, () => svBoilStart(s, 'water')]);
  if (S.tools.pot && !SV.boil && S.tools.waterskin && S.skin > 0) {
    if (I.mint > 0) acts.push(['Brew mint tea', () => svBoilStart(s, 'minttea')]);
    if (I.willow > 0) acts.push(['Brew willow-bark tea', () => svBoilStart(s, 'willowtea')]);
  }
  if (sit && !acts.some(([l]) => /the spit/.test(l))) acts.push(['Sit with Sena', () => sitTogether(s)]);   // food to put on or take off comes first (as on Story): E does it at once, no menu
  if (I.grain >= 2) acts.push(['Bake flatbread (2 grain)', () => { I.grain -= 2; I.bread++; survGive('bread', 1); toast('+1 Flatbread'); A.hit(3000, 0.4, 0.2); drawInv(); }]);
  const status = items.length ? `Spit: ${items.length} ${svSpitWord(items)}` : SV.boil?.s === s ? `Boiling… ${Math.round(SV.boil.t / SV.boil.T * 100)}%` : '';
  if (!acts.length) return t(status || 'Campfire — bring raw meat or fish for the spit, or grain to bake');
  if (items.length && acts[0][1] && /cooked|well done|burning/.test(svSpitWord(items)) && acts[0][0].startsWith('Take')) return t(acts[0][0], acts[0][1]);   // in the green: E takes it off at once, no menu
  if (acts.length === 1) return t(acts[0][0] + (status && !/spit/.test(acts[0][0]) ? ` · ${status}` : ''), acts[0][1]);
  return t(`${acts[0][0]} · ${acts.length - 1} more`, () => {
    choose('fire', 'At the fire', [...acts.map(([label]) => ({ label })), { label: 'Leave it' }], { def: acts.length, note: status })
      .then((i) => { if (i < acts.length) acts[i][1](); });
  });
}

// ----- eating, drinking, healing (SURV owns eat / drinkSkin / fillSkin / heal)
const SV_EAT = [['cooked', 45, 12, 'cooked meat'], ['grilled', 35, 8, 'grilled fish'], ['bread', 30, 0, 'flatbread'], ['dried', 30, 4, 'dried meat'], ['driedfish', 30, 4, 'dried fish'], ['berry', 9, 0, 'berries']];
function survEat() {
  const I = S.inv, e = SV_EAT.find(([k]) => I[k] > 0);
  if (!e) {
    if (I.meat > 0 || I.fish > 0 || I.spoiled > 0) { SV.fArm = true; SV.fArmAt = performance.now(); toast(`Hold F to eat it raw${D().ill !== 'off' ? ' (it may make you sick)' : ''} · or cook it at a fire`); }
    else toast('Nothing to eat');
    return;
  }
  const [k, food, hp, name] = e;
  I[k]--; S.food = Math.min(100, S.food + food); if (hp) S.hp = Math.min(100, S.hp + hp);
  if (k === 'berry') { S.water = Math.min(100, S.water + 3); bump('ate'); } else if (k !== 'bread') bump('meal');
  let msg = `You eat ${name}`;
  const u = S.risk.under?.[k] || 0;
  if (u > 0 && SV.rng() < u / (I[k] + 1)) {             // one of the undercooked pieces
    S.risk.under[k]--; msg += ': it was not cooked through';
    const p = SURV.poisonChance('under', D().ill); if (p > 0 && !matGrace() && SV.rng() < p) survAdd('poison', 'gut', 1, 'P', { src: 'under' });
  }
  toast(msg); A.hit(800, 0.12, 0.3); drawInv();
}
function survFill(src = 'river') {
  if (!S.tools.waterskin) return;
  const safe = src === 'well' || src === 'boiled';
  if (S.skin >= 3 && (S.skinQ === 'safe' || !safe)) return;   // full (clean water replaces unsafe water)
  S.skin = 3; S.skinQ = safe ? 'safe' : 'raw'; S.risk.skinSrc = src;
  toast(D().ill === 'off' ? 'Waterskin filled' : `Waterskin filled (${SV_SRC[src] || src}${safe ? ', clean' : ''})`); drawInv();
}
function survDrinkSkin() {
  if (!S.tools.waterskin) return;
  if (S.skin <= 0) { toast('The waterskin is empty — fill it at the river or well'); return; }
  if (S.water >= 98) { toast('You are not thirsty'); return; }
  S.skin--; S.water = Math.min(100, S.water + 30); bump('drank'); A.hit(2600, 0.25, 0.2);
  svDrink(S.skinQ === 'safe' ? 'boiled' : S.risk.skinSrc || 'river');
  toast(`You drink from the waterskin (${S.skin}/3 left)`); drawInv();
}
// Treat: consume the item, apply it, tell the player. plan: [{a, item}] (from SURV.treatPlan or the body screen).
function svApply(plan, who = 'P') {
  const list = who === 'N' ? S.naff : S.aff, msgs = [];
  let used = 0;
  for (const { a, item } of plan) {
    if (item !== 'sena' && !SURV.have(S.inv, svSkin(), item)) continue;
    const r = SURV.treat(list, a, item, { gh: S.gh });
    if (r.used && item !== 'sena') {
      if (item === 'boiled') S.skin--; else S.inv[item]--;
      if (item === 'minttea' || item === 'willowtea') { S.water = Math.min(100, S.water + 20); S.warm = Math.min(100, S.warm + 15); }
      if (item === 'poultice') S.hp = Math.min(100, S.hp + 15);
      bump('treated');
    }
    if (r.used) used++;
    if (r.msg) msgs.push(r.msg);
  }
  if (msgs.length) toast(msgs.length > 2 ? `${msgs[0]} (+${msgs.length - 1} more)` : msgs.join('. '));
  A.hit(500, 0.3, 0.25); drawInv(); svMods(); svMoodles(true);
  return used;
}
function svNeedHint() {
  const order = [...S.aff].sort((a, b) => (a.id === 'bleed' ? -1 : 0) - (b.id === 'bleed' ? -1 : 0));
  for (const a of order) {
    const it = SURV.itemsFor(a, S.gh); if (!it.length) continue;
    return `${SURV.AFF[a.id].name}: you need ${it.map((k) => (k === 'boiled' ? 'boiled water in the skin' : `a ${SURV.ITEM_NAME[k]}`)).join(' or ')} (Tab)`;
  }
  return null;
}
function survHeal() {                                // H: worst bleed first with the best item, else the old poultice
  const plan = SURV.treatPlan(S.aff, S.inv, svSkin(), S.gh);
  if (plan.length) { P.h.swing('pickU'); svApply([plan[0]]); SV.kneelT = 0.6; return; }
  const hint = S.aff.length ? svNeedHint() : null;
  if (S.inv.poultice <= 0 || S.hp >= 99) { toast(hint || (S.inv.poultice <= 0 ? 'No poultices — craft one from berries and fibre (Tab)' : 'You are not hurt')); return; }
  S.inv.poultice--; S.hp = Math.min(100, S.hp + 35); hurtFlash = 0; P.h.swing(); A.hit(500, 0.3, 0.25); toast('You press the poultice to your wounds (+35 health)'); drawInv();
}

// ----- Sena: tending (she treats what she can with the pack and cleans wounds herself), leaning, her own wounds
function svTendable() {
  if (hostileNear(18)) return false;
  return S.aff.some((a) => (a.id === 'wound' && !a.clean) || ((a.id === 'bleed' || a.id === 'sprain' || a.id === 'fracture' || a.id === 'infection') && SURV.bestItem(a, S.inv, null, S.gh)));
}
function svTendStart() {
  if (!svTendable()) { say('Sena', 'There is nothing I can do for it now. Rest.'); return false; }
  SV.tend = { ph: 'go', t: 0 }; N.node = null; N.act = 0; N.sit = 0;
  const leg = S.aff.some((a) => a.part === 'legL' || a.part === 'legR'), arm = S.aff.some((a) => a.part === 'armL' || a.part === 'armR');
  say('Sena', leg ? 'Sit. Let me see that leg.' : arm ? 'Give me your arm. Hold still.' : 'Hold still. Let me look at it.');
  return true;
}
function svTendDo() {
  const plan = [];
  for (const a of [...S.aff]) {
    if (a.id === 'wound' && !a.clean) { plan.push({ a, item: 'sena' }); continue; }
    if (a.id === 'bleed' || a.id === 'sprain' || a.id === 'fracture' || a.id === 'infection') { const k = SURV.bestItem(a, S.inv, null, S.gh); if (k) plan.push({ a, item: k }); }
  }
  const n = svApply(plan);
  for (const a of S.aff.filter((x) => x.id === 'wound' && !x.clean)) SURV.treat(S.aff, a, 'sena', { gh: S.gh });   // a stopped bleed: she dresses it too
  if (n && S.c.svTendDay !== S.day) { S.c.svTendDay = S.day; addClose(1, 'she tended your wounds'); }
  bump('tended'); say('Sena', ['There. Keep it clean and it will close.', 'Done. Next time, let the wolf have the berries.', 'You are lucky I like you, Aro.'][cnt('tended') % 3]);
  svMods(); svMoodles(true);
}
function svTendTick(dt) {
  const tn = SV.tend, d = Math.hypot(N.pos.x - P.pos.x, N.pos.z - P.pos.z);
  tn.t += dt;
  if (hostileNear(15) || N.downed > 0 || busy && tn.ph === 'go' || tn.t > 18) { SV.tend = null; N.h.pose = null; if (hostileNear(15)) say('Sena', 'Not now. Later, if we live.'); return false; }
  if (tn.ph === 'go') {
    const a = P.face + 0.9, tx = P.pos.x + Math.sin(a) * 0.85, tz = P.pos.z + Math.cos(a) * 0.85;
    if (walkTo(N, tx, tz, d > 6 ? 6 : 3, dt, 0.25)) { tn.ph = 'kneel'; tn.t = 0; N.h.pose = 'work'; }
  } else {
    N.speed = 0; N.face = Math.atan2(P.pos.x - N.pos.x, P.pos.z - N.pos.z);
    if (d > 2.5) { SV.tend = null; N.h.pose = null; say('Sena', 'Hold still! I was not finished.'); return false; }
    if (tn.t > 2.6) { SV.tend = null; N.h.pose = null; N.h.swing('use'); svTendDo(); }
  }
  settle(N, dt, false);
  return true;
}
function svTendCheck() { if (SV.tend && P.speed > 0.5 && SV.tend.ph === 'kneel') SV.kneelT = 0; else if (SV.tend?.ph === 'kneel') SV.kneelT = 0.25; }
function svLeanStart() {
  if (!SURV.find(S.aff, 'fracture')) return false;
  SV.lean = true; N.node = null; N.act = 0; N.sit = 0;
  const fr = SURV.find(S.aff, 'fracture'); SV.leanSide = fr.part === 'legR' ? 1 : -1;   // she takes the broken side
  say('Sena', 'Arm over my shoulders. Slowly. Together.'); svMods(); return true;
}
function svLeanStop(line = true) { SV.lean = false; svMods(); if (line) say('Sena', 'All right. I am right here.'); }
function svLeanTick(dt) {
  if (!SURV.find(S.aff, 'fracture') || P.ride || P.swim || P.downed > 0 || N.downed > 0 || busy || P.rest > 0) { svLeanStop(false); return false; }
  const f = P.face, rx = -Math.cos(f), rz = Math.sin(f), side = SV.leanSide;
  const tx = P.pos.x - rx * 0.62 * side, tz = P.pos.z - rz * 0.62 * side, d = Math.hypot(N.pos.x - tx, N.pos.z - tz);
  if (d > 8) { svLeanStop(false); return false; }
  if (d > 1.2) { walkTo(N, tx, tz, d > 4 ? 6 : 3.4, dt, 0.1); SV.leanW = Math.max(0, SV.leanW - dt * 3); }
  else { N.pos.x += (tx - N.pos.x) * Math.min(1, dt * 8); N.pos.z += (tz - N.pos.z) * Math.min(1, dt * 8); N.face = turn(N.face, f, Math.min(1, dt * 8)); N.speed = P.speed; SV.leanW = Math.min(1, SV.leanW + dt * 2); }
  settle(N, dt, false);
  return true;
}
// Arm over her shoulders / hers round his back (order 30, IK). Both sides read the same lean weight.
function svLeanArm(h, isP) {
  const w = SV.lean ? SV.leanW : 0; if (w < 0.02) return;
  const side = SV.leanSide, f = P.face, rx = -Math.cos(f), rz = Math.sin(f), fx = Math.sin(f), fz = Math.cos(f);
  if (isP) {                                         // Aro's arm on her side goes over her far shoulder
    const s = side > 0 ? 'l' : 'r';
    N.h.bones.spine_03.getWorldPosition(_svA); _svA.y += 0.16; _svA.x -= rx * 0.12 * side; _svA.z -= rz * 0.12 * side;
    P.h.bones['upperarm_' + s].getWorldPosition(_svB); _svB.y -= 0.1; _svB.x -= fx * 0.3; _svB.z -= fz * 0.3;
    ik2(h, s, _svA, _svB, w * 0.9);
  } else {                                           // her near arm round his waist
    const s = side > 0 ? 'r' : 'l';
    P.h.bones.spine_01.getWorldPosition(_svA); _svA.x -= fx * 0.14 + rx * 0.1 * side; _svA.z -= fz * 0.14 + rz * 0.1 * side;
    N.h.bones['upperarm_' + s].getWorldPosition(_svB); _svB.y -= 0.35; _svB.x -= fx * 0.25; _svB.z -= fz * 0.25;
    ik2(h, s, _svA, _svB, w * 0.85);
  }
}
function survSena(dt) {                              // updateSena: tending and leaning take her over (after MAT's rescue)
  if (SV.tend) return svTendTick(dt);
  if (SV.lean) return svLeanTick(dt);
  return false;
}
// ROM's Sena menu (hold E): register "Tend my wounds" and "Lean on me" when ROM exists; until then E on Sena does it.
const SURV_SENA_ACTS = [
  { id: 'tend', label: 'Tend my wounds', ok: () => svTendable() && !SV.tend, act: () => svTendStart() },
  { id: 'lean', label: () => (SV.lean ? 'Let go (walk alone)' : 'Lean on Sena'), ok: () => !!SURV.find(S.aff, 'fracture'), act: () => (SV.lean ? svLeanStop() : svLeanStart()) },
];
for (const a of SURV_SENA_ACTS) a.run = a.act;
function svRegisterSena() {
  try {
    // eslint-disable-next-line no-undef
    if (typeof SENA_ACTS !== 'undefined' && Array.isArray(SENA_ACTS)) { for (const a of SURV_SENA_ACTS) if (!SENA_ACTS.includes(a)) SENA_ACTS.push(a); SV.romActs = true; }
  } catch (err) { SV.romActs = false; }               // ROM's const not initialised yet: try again later
}
const svFacing = (pos, k = 0.9) => Math.abs(wrapA(Math.atan2(pos.x - P.pos.x, pos.z - P.pos.z) - (view === 'fpp' ? camFace() : P.face))) < k;
function survTarget(p) {                             // findTarget (after the shared meal): Sena's wound, tending, leaning
  const dN = Math.hypot(N.pos.x - p.x, N.pos.z - p.z);
  if (dN > 2.2 || N.downed > 0 || N.ride || busy || SV.tend) return null;
  const nb = SURV.worst(S.naff, 'bleed');
  if (nb && svFacing(N.pos, 1.2)) {
    const k = SURV.bestItem(nb, S.inv, null, S.gh);
    if (!k) return { label: 'Sena is bleeding — craft a bandage (Tab)' };
    return { label: `Bandage Sena's wound (${SURV.ITEM_NAME[k]})`, key: true, act() {
      svApply([{ a: nb, item: k }], 'N'); P.h.swing('pickU'); addClose(2, 'you bound her wound');
      say('Sena', ['Thank you. Your hands are gentle, for a hunter.', 'Tighter. There. Thank you, Aro.'][cnt('svl_bandN') % 2]); bump('svl_bandN');
    } };
  }
  if (SV.romActs || !svFacing(N.pos)) return null;
  if (SV.lean) return null;
  if (SURV.find(S.aff, 'fracture')) return { label: 'Lean on Sena', key: true, act() { svLeanStart(); } };
  if (svTendable()) return { label: 'Ask Sena to tend your wounds', key: true, act() { svTendStart(); } };
  return null;
}

// ----- keys: I opens the body screen; while it is open, 1-6 run its buttons and I / Esc close it
const BODY_ACTS = ['bandage', 'splint', 'poultice', 'clean', 'tea', 'all'];
function survKey(e) {
  if (SV.body) {
    if (e.repeat) return true;
    if (e.code === 'KeyI' || e.code === 'Escape') { if (SV.hold && e.code === 'Escape') svHoldCancel(); else survBody(false); return true; }
    const m = /^Digit([1-6])$/.exec(e.code); if (m) { svBodyAct(BODY_ACTS[+m[1] - 1]); return true; }
    if (!SV.bodyFlag && /^(Key[WASD]|Space|ShiftLeft)$/.test(e.code)) { survBody(false); return false; }   // Hardcore: moving closes it
    return true;
  }
  if (e.code === 'KeyI' && !e.repeat && !paused && !menuOpen && !mapOpen && !busy && !(P.downed > 0) && !MAT.rescuing) { survBody(true); return true; }
  return false;
}
// ----- the body screen (#body): paper doll, afflictions with timers, treatment buttons (1.5-2.5 s holds)
function survBody(on = !SV.body) {
  if (on === SV.body) return SV.body;
  SV.body = on; $('body').classList.toggle('on', on);
  if (on) {
    SV.bodyFlag = D().death === 'perma' ? null : 'paused';   // Story/Survivor pause; Hardcore runs on in real time
    if (SV.bodyFlag) paused = true; else menuOpen = true;
    for (const k in keys) keys[k] = false;
    document.exitPointerLock?.();
    SV.bodySel = null; svBodyDraw(); SV.bodyT = setInterval(svBodyDraw, 400);
    A.hit(900, 0.08, 0.08);
  } else {
    clearInterval(SV.bodyT); svHoldCancel();
    if (SV.bodyFlag) paused = false; else menuOpen = false;
    SV.bodyFlag = null; lock();
  }
  lockHint();
  return on;
}
const ACT_ITEMS = { bandage: ['hidebandage', 'bandage'], splint: ['splint'], poultice: ['ypoultice', 'poultice'], clean: ['boiled'], tea: ['minttea', 'willowtea'] };
function svPlanFor(act, part) {
  const L = S.aff.filter((a) => !part || a.part === part || (part === 'torso' && (a.part === 'gut' || a.part === 'body')));
  if (act === 'all') return SURV.treatPlan(L, S.inv, svSkin(), S.gh);
  const left = { ...S.inv }, sk = svSkin() && { ...svSkin() }, out = [];
  for (const a of [...L].sort((x, y) => (x.id === 'bleed' ? -1 : 0) - (y.id === 'bleed' ? -1 : 0) || y.sev - x.sev)) {
    const k = SURV.itemsFor(a, S.gh).filter((i) => ACT_ITEMS[act].includes(i)).find((i) => SURV.have(left, sk, i));
    if (!k) continue;
    out.push({ a, item: k }); if (k === 'boiled') sk.n--; else left[k]--;
    if (act === 'tea') break;                          // one cup at a time
  }
  return out;
}
function svBodyAct(act) {
  if (SV.hold || !act) return;
  const plan = svPlanFor(act, SV.bodySel);
  if (!plan.length) { $('bd-msg').textContent = act === 'clean' && !(S.skin > 0 && S.skinQ === 'safe') ? 'You need boiled or well water in the skin.' : 'Nothing that needs it, or nothing in your pack for it.'; A.hit(200, 0.08, 0.1); return; }
  const T = act === 'all' ? 2500 : act === 'tea' ? 1500 : act === 'clean' ? 1800 : 2000;
  P.h.swing('pickU'); A.hit(700, 0.1, 0.12);
  SV.hold = { act, plan, t0: performance.now(), T };
  $('bd-msg').textContent = { bandage: 'Binding…', splint: 'Setting the splint…', poultice: 'Pressing the poultice…', clean: 'Rinsing with boiled water…', tea: 'Drinking…', all: 'Treating everything you can…' }[act];
  const loop = () => {
    const h = SV.hold; if (!h || h.act !== act) return;
    const k = (performance.now() - h.t0) / h.T;
    $('bd-hold').firstElementChild.style.width = Math.min(100, k * 100) + '%';
    if (k < 1) { requestAnimationFrame(loop); return; }
    SV.hold = null; $('bd-hold').firstElementChild.style.width = '0%';
    svApply(h.plan); SV.kneelT = 0.4;
    $('bd-msg').textContent = ''; svBodyDraw();
  };
  requestAnimationFrame(loop);
  svBodyDraw();
}
function svHoldCancel() { if (!SV.hold) return; SV.hold = null; const b = $('bd-hold')?.firstElementChild; if (b) b.style.width = '0%'; const m = $('bd-msg'); if (m) m.textContent = 'Stopped.'; }
function svPartOf(a) { return a.part === 'gut' || a.part === 'body' ? 'torso' : a.part; }
function svAffRow(a, who) {
  const D0 = SURV.AFF[a.id], sev = a.id === 'bleed' ? ` (${D0.sevName[a.sev]})` : '';
  const where = SURV.PART_NAME[a.part] || '';
  let time = '';
  if (a.id === 'bleed') time = `−${SURV.AFF.bleed.rate[a.sev]} health/s`;
  else if (a.id === 'wound') time = a.clean ? `clean · closes in ${Math.ceil(a.tr)} h` : `infection risk ${Math.round(a.risk * 100)}%`;
  else if (a.id === 'poison' && a.onset > 0) time = 'something is wrong';
  else if (a.id === 'fracture' && !a.splint) time = 'will not mend unsplinted';
  else if (a.id === 'infection' && a.doses < 2) time = `doses ${a.doses}/2${a.lastDose != null && S.gh - a.lastDose < 12 ? ` · next in ${Math.ceil(12 - (S.gh - a.lastDose))} h` : ''}`;
  else if (a.id === 'hypo') time = `warming ${Math.round(Math.min(1, a.tr / 10) * 100)}%`;
  else if (a.tr > 0) time = `${Math.ceil(a.tr)} h left`;
  return `<div class="af t${SURV.tier(a)}"><i>${svMoodleHtml(a, who)}</i><span><b>${who === 'N' ? 'Sena · ' : ''}${D0.name}${sev}</b><em>${where}${where && time ? ' · ' : ''}${time}</em><small>${D0.cure(a, S.gh)}</small></span></div>`;
}
function svBodyDraw() {
  if (!SV.body) return;
  const sel = SV.bodySel;
  for (const part of SURV.PARTS) {
    const el = document.querySelector(`#bd-doll [data-part="${part}"]`); if (!el) continue;
    const t = S.aff.filter((a) => svPartOf(a) === part).reduce((m, a) => Math.max(m, SURV.tier(a)), 0);
    el.setAttribute('class', `pt t${t}${sel === part ? ' sel' : ''}`);
  }
  const L = S.aff.filter((a) => !sel || svPartOf(a) === sel);
  const nm = { head: 'head', torso: 'body', armL: 'left arm', armR: 'right arm', legL: 'left leg', legR: 'right leg' };
  $('bd-list').innerHTML = (sel ? `<h4>${nm[sel][0].toUpperCase() + nm[sel].slice(1)} <a data-all="1">show all</a></h4>` : '<h4>Aro</h4>')
    + (L.length ? L.map((a) => svAffRow(a, 'P')).join('') : `<p class="none">${D().aff === 'off' && !sel ? 'On Story difficulty, wounds are only skin deep.' : sel ? `Nothing wrong with your ${nm[sel]}.` : 'No injuries, no illness. Keep it that way.'}</p>`)
    + (S.naff.length && !sel ? '<h4>Sena</h4>' + S.naff.map((a) => svAffRow(a, 'N')).join('') : '');
  const E = world.env, air = E.cave > 0.5 ? 'cave air' : E.storm > 0.5 ? 'cold rain' : E.night > 0.5 ? 'night chill' : 'daylight';
  const feel = S.warm > 70 ? 'warm' : S.warm > 40 ? 'cool' : S.warm > 20 ? 'cold' : 'freezing';
  const skin = S.tools.waterskin ? `Waterskin ${S.skin}/3${S.skin > 0 ? ` · ${S.skinQ === 'safe' ? 'clean' : `${SV_SRC[S.risk.skinSrc] || 'river'} water, unboiled`}` : ''}` : 'No waterskin';
  const food = D().spoil === 'off' ? [] : SURV.FOODS.filter((k) => S.inv[k] > 0).map((k) => { const L2 = S.age[k], h = L2?.length ? Math.max(0, SURV.spoilHours(k, D().spoil) - L2[0]) : SURV.spoilHours(k, D().spoil); return `${ITEMS[k]} ${S.inv[k]} <i>${h < 6 ? 'spoils soon' : `keeps ~${Math.round(h)} h`}</i>`; });
  $('bd-info').innerHTML = `<div><b>Health</b> ${Math.round(S.hp)} · <b>Feels</b> ${feel} (${air}${SV.sheltered ? (E.cave > 0.5 ? ', sheltered' : ', by fire or shelter') : ''})${S.risk.hypo > 0.15 ? ` · <span class="warn">getting dangerously cold</span>` : ''}</div><div>${skin}</div>${food.length ? `<div class="food">${food.join(' · ')}</div>` : ''}`;
  for (const b of $('bd-acts').querySelectorAll('button')) {
    const n = svPlanFor(b.dataset.act, sel).length;
    b.disabled = !n || !!SV.hold; b.classList.toggle('has', n > 0);
  }
}
function svBodyBind() {
  const doll = $('bd-doll'); if (!doll) return;
  doll.addEventListener('click', (ev) => { const p = ev.target.closest('[data-part]')?.dataset.part || null; SV.bodySel = SV.bodySel === p ? null : p; svBodyDraw(); });
  $('bd-list').addEventListener('click', (ev) => { if (ev.target.dataset.all) { SV.bodySel = null; svBodyDraw(); } });
  for (const b of $('bd-acts').querySelectorAll('button')) b.onclick = () => svBodyAct(b.dataset.act);
  $('bd-close').onclick = () => survBody(false);
}
svBodyBind();

// give() hook: a new perishable starts fresh (the oldest are eaten and spoil first)
function survGive(k, n) { if (SURV.SPOIL[k] && n > 0) { const L = (S.age[k] ||= []); for (let i = 0; i < n && L.length < SURV.AGE_CAP; i++) L.push(0); } }

// ---------- WP6 family: Lio the child, the birth in sleep(), epilogue extras, free-play goals ----------
const kids = [];                                     // live child humans, one per S.kids entry
const liveTameHorse = () => animals.find((o) => o.horse && o.tame && o.state === 'live') || null;   // WP4's horse (null until it lands)
// CHILD / GUARDRAIL: Lio is never an adult body scaled down. Before the epilogue she is a newborn: a swaddled bundle
// (makeSwaddle) in her cradle or in Sena's arms. In the epilogue she is a girl of about seven: people.js makeHuman's
// child body (male base mesh, child proportions, a knee-length tunic and foot wraps), about 1.2 m tall.
const KID_ROOT = 0.745;                              // root scale of the child body: about 1.2 m tall (people.js CHILD.girl is 1.61 m at scale 1)
const kidBaby = () => !S.village;
const kidScale = () => (kidBaby() ? 1 : KID_ROOT);  // the child human's root scale (the bundle is life-size at 1)
// A newborn swaddled in hide: built upright (bottom at the origin, head up +Y, face toward +Z, back on z = 0), so the
// lying rotation in settle() lays it on its back like the sleepers. About 0.53 m long.
function makeSwaddle() {
  const g = new THREE.Group(); g.name = 'swaddle';
  const wrapM = new THREE.MeshStandardMaterial({ color: 0xcdb48e, roughness: 1 }), bandM = new THREE.MeshStandardMaterial({ color: 0x8a6847, roughness: 1 });
  const skinM = new THREE.MeshStandardMaterial({ color: 0xe9b99a, roughness: 0.9 }), eyeM = new THREE.MeshStandardMaterial({ color: 0x4a3226, roughness: 1 });
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.CapsuleGeometry(0.085, 0.27, 6, 14), wrapM, 0, 0.215, 0.085, 1.18, 1, 0.92);           // the wrapped body
  for (const [y, t] of [[0.1, 0.18], [0.21, -0.22], [0.31, 0.15]]) { const b = add(new THREE.CylinderGeometry(0.089, 0.089, 0.032, 20, 1, true), bandM, 0, y, 0.085, 1.2, 1, 0.95); b.rotation.x = t; b.material.side = THREE.DoubleSide; }   // the broad hide binding strips
  add(new THREE.SphereGeometry(0.083, 16, 12), wrapM, 0, 0.43, 0.07, 1.08, 1.05, 1);                    // the hood around the head
  add(new THREE.SphereGeometry(0.06, 18, 14), skinM, 0, 0.428, 0.112, 1, 1.06, 0.85);                  // the little face
  for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.0045, 0.014, 2, 6), eyeM, sx * 0.021, 0.44, 0.161).rotation.z = Math.PI / 2;   // closed, sleeping eyes
  add(new THREE.SphereGeometry(0.009, 8, 6), skinM, 0, 0.424, 0.164);                                   // nose
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0xeea08a, roughness: 0.9 }), sx * 0.032, 0.418, 0.148, 1, 0.8, 0.5);   // round cheeks
  add(new THREE.CapsuleGeometry(0.003, 0.01, 2, 6), new THREE.MeshStandardMaterial({ color: 0xb0645a, roughness: 1 }), 0, 0.404, 0.158).rotation.z = Math.PI / 2;   // a tiny mouth
  const hem = add(new THREE.TorusGeometry(0.066, 0.014, 6, 18), wrapM, 0, 0.428, 0.118, 1, 1.12, 1);   // the hood's rim framing the face
  hem.rotation.x = -0.12;
  return g;
}
function spawnKid(k) {
  if (kids.some((c) => c.k === k)) return null;
  const h = makeHuman({ child: 'girl', hair: 'buns', hairColor: 0x4a382c }), model = h.root.children[0], bundle = makeSwaddle();
  h.root.add(bundle);
  const c = { k, h, model, bundle, baby: null, pos: new THREE.Vector3(N.pos.x - 1.2, 0, N.pos.z - 1.2), face: N.face || 0, speed: 0, wait: 3, play: 0, rest: 0, seat: null };
  scene.add(h.root); kids.push(c); kidLook(c);
  return c;
}
// The child's look for the story stage: the bundle (a newborn) or the girl's body (the epilogue). On horseback her skinned
// skirt stays on: it opens with her thighs over the horse's back.
function kidLook(c) {
  const baby = kidBaby();
  c.baby = baby; c.model.visible = !baby; c.bundle.visible = baby && !c.away;
  c.h.root.scale.setScalar(kidScale());
  c.h.kidLie = !baby && c.rest > 0;                              // asleep on her own bed: lying straight (people.js childHip)
  if (c.h.kid) c.h.kid.skirt.visible = !c.h.kidLie;              // the flared skirt off in bed (the tunic covers her to the knee; her own cover over that)
}
// Where the child sleeps (local to the shelter, feet point; heads toward -Z like the parents). Always her own bed:
// the baby's cradle; the girl's nursery bedroll; or, without those, her own small mat beside the parents' bed.
const inCradle = (s, i) => s.kind === 'house' && S.home.cradle && i === 0 && kidBaby();
// (the annex floor is not levelled: on a slope the ground can rise through it; then she has her own mat in the main room)
const nurseryOk = (s) => { const a = toWorld(s, [-4.8, 0, -0.3]), b = toWorld(s, [-4.8, 0, 0.5]); return Math.max(getHeight(a.x, a.z), getHeight(b.x, b.z)) < s.group.position.y + 0.2; };
const inNursery = (s, i) => s.kind === 'house' && S.home.nursery && i === 0 && !kidBaby() && nurseryOk(s);
const KID_MAT = { house: [0.45, 0.45], houseFloor: [0.45, 0.45], hut: [1.0, -0.35], cave: [1.05, 0.25] };   // feet point of her own mat: beside the bed, clear of it and well back from the hearth
const kidBed = (s, i) => {
  if (inCradle(s, i)) return [1.8, 0.6, 1.5];
  if (inNursery(s, i)) return [-4.8, 0.235, 0.5];
  const kind = rstKind(s), m = KID_MAT[kind] || KID_MAT.hut;
  return [m[0] + i * 0.75, (RST_LAY[kind]?.floor ?? 0.04) + 0.045, m[1]];
};
function kidsToBed(s) {
  kids.forEach((c, i) => {
    c.rest = 1; c.restPos = toWorld(s, kidBed(s, i)); c.face = s.rot || 0;
    c.seat = null; c.play = 0; c.h.pose = null; c.h.straddle = false;
  });
}
let birthHold = 0;                                   // STORY: clock time until which the newlife -> village advance waits
function birthLines() {                              // the wake's morning lines on the birth night (or at rstDone / rstAbort if the wake was cut short)
  if (!R.birth) return;
  R.birth = false;
  say('Sena', 'Look at her hands, Aro. Like the little ones on the cave wall.'); say('Aro', 'Then she will leave her mark too.');
  birthHold = clock + 9;
}
// Called from sleep() mid when Aro and Sena rest together (WP2 hook).
function maybeBirth() {
  const s = P.restAt;
  if (s) kidsToBed(s);
  if (CH[S.ch].id !== 'newlife' || cnt('born') || s?.kind !== 'house') return;
  if (!goalsOf().slice(0, 4).every(([, f]) => f())) return;   // ARC goalsOf (goal 0 is the Standing Stones vows)
  $('fade-text').textContent = 'Spring came, and with it a daughter. They named her Lio.';
  R.hold4 = 4;                                       // RST: hold the card 4 s before the wake
  S.time = 9; S.day += 20; S.food = Math.max(S.food, 70); S.water = Math.max(S.water, 70);   // final test: fed through the 20-day skip
  goreTimeSkip();                                    // GORE-FIX: twenty days on: the old blood is gone
  const k = { name: 'Lio', female: true, born: S.day };
  S.kids.push(k); bump('born');
  const c = spawnKid(k);
  if (c) { c.rest = 1; c.restPos = toWorld(s, kidBed(s, 0)); c.face = s.rot || 0; }
  addClose(10, 'Lio is born');
  R.birth = true; birthHold = Infinity;              // STORY: the lines play in the wake (rstWakeTick), over a shot of the cradle; the chapter waits for them
}
// Seat point on the horse's back for a small rider (WP4 gives animals a bone() helper; else a fixed back height).
const _kv = new THREE.Vector3();
function horseSeat(o, out, scale, legK = 1) {
  const b = o.a?.bone?.('Torso2') || o.bone?.('Torso2');
  if (b) { b.getWorldPosition(out); out.y += 0.31; } else out.set(o.root.position.x, o.root.position.y + 1.62, o.root.position.z);
  out.y -= 0.56 * scale * legK;                      // pelvis height of the sit pose above the root (CHILD: her shorter legs)
  return out;
}
let kidTick = 0;
function updateKids(dt) {
  kidTick -= dt;
  if (kidTick <= 0) { kidTick = 0.5; if (CH[S.ch].epilogue) drawQuest(); }   // live side goals in free play
  if (!kids.length) return;
  const horse = S.village ? liveTameHorse() : null, home = structs.find((s) => s.kind === 'house');
  kids.forEach((c, i) => {
    const sc = kidScale(); kidLook(c);
    if (c.baby) { kidBabyTick(c, i, home, dt); return; }
    kidHold(null);
    if (c.rest > 0) {
      if (P.rest > 0) { settle(c, dt, false); return; }
      c.rest = 0; c.h.root.rotation.x = 0; c.pos.set(N.pos.x - 1, 0, N.pos.z - 1);   // wake with them at the door
    }
    if (kidHide(c, dt)) return;                      // GORE-FIX GUARDRAIL: a predator or raider near: she runs indoors (or behind Sena)
    if (kidEpiHold(c, dt)) return;
    // Epilogue: Lio rides the old horse at a walk around the house (unless Aro has taken the reins).
    if (i === 0 && horse && P.ride !== horse && !busy && S.time > 8 && S.time < 11.5) {   // final test: mornings only, else Lio follows Sena
      c.seat = horseSeat(horse, c.seat || new THREE.Vector3(), sc, c.h.kid?.legK);
      c.face = horse.root.rotation.y; c.h.pose = 'sit'; c.h.straddle = true; c.play = 0;
      c.pos.set(horse.root.position.x, 0, horse.root.position.z);
      settle(c, dt, false);
      // CHILD: seat her by her own pelvis (the child body's sit pose is not the adult's): hips on the horse's back
      const b = horse.a?.bone?.('Torso2') || horse.bone?.('Torso2');
      if (b) { b.getWorldPosition(_kv); const want = _kv.y + 0.31 + 0.04, hip = c.h.bones.pelvis.getWorldPosition(_kv).y; c.h.root.position.y += want - hip; c.seat.y += want - hip; }
      return;
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
// The newborn: in her cradle at home (asleep; the birth morning opens on her there), on her own mat while her parents
// sleep without a cradle, and otherwise in Sena's arms. GUARDRAIL: with anything hostile near, she is indoors (hidden),
// like Pell, so a baby is never on screen in danger.
function kidBabyTick(c, i, home, dt) {
  c.seat = null; c.h.straddle = false; c.h.pose = null; c.play = 0;
  const cradle = i === 0 && home && home.rise >= 1 && S.home.cradle;
  if (cradle && !(P.rest > 0)) { c.rest = 1; c.restPos = toWorld(home, kidBed(home, 0)); c.face = home.rot || 0; }
  if (c.rest > 0 && (cradle || P.rest > 0)) {
    c.away = false; kidLook(c); kidHold(null);
    c.pos.set(c.restPos.x, 0, c.restPos.z); settle(c, dt, false); return;
  }
  c.rest = 0;
  c.away = i > 0 || hostileNear(45, N.pos) || !N.h.root.visible || !c.h.root.visible; kidLook(c);
  kidHold(c.away ? null : c);
  c.pos.set(N.pos.x, 0, N.pos.z);
  if (c.away) c.h.root.position.copy(N.pos);
}
// Sena holds the baby: the bundle across her chest, head in the crook of her left arm, both hands under it (arm IK).
let kidHeld = null;
const _kb = { C: new THREE.Vector3(), A: new THREE.Vector3(), F: new THREE.Vector3(), Y: new THREE.Vector3(), Z: new THREE.Vector3(), X: new THREE.Vector3(), t: new THREE.Vector3(), p: new THREE.Vector3(), m: new THREE.Matrix4() };
function kidHold(c) {
  if (kidHeld === c) return;
  kidHeld = c;
  if (!c) { N.h.removeOverride('holdBaby'); return; }
  N.h.addOverride('holdBaby', 35, (h) => {
    const k = kidHeld; if (!k) return;
    const { C, A, F, Y, Z, X, t, p, m } = _kb, f = N.face || 0, up = _V_UP;
    F.set(Math.sin(f), 0, Math.cos(f)); A.set(Math.cos(f), 0, -Math.sin(f));        // her forward and her left
    h.bones.spine_03.getWorldPosition(C).addScaledVector(F, 0.21); C.y -= 0.06;
    Y.copy(A).multiplyScalar(0.86).addScaledVector(up, 0.5).normalize();             // head in the crook of her left arm, raised
    Z.copy(up).addScaledVector(F, 0.35); Z.addScaledVector(Y, -Z.dot(Y)).normalize();  // face up and a little out
    X.crossVectors(Y, Z);
    m.makeBasis(X, Y, Z); k.h.root.quaternion.setFromRotationMatrix(m);
    k.h.root.position.copy(C).addScaledVector(Y, -0.265).addScaledVector(Z, -0.085);
    k.h.root.updateMatrixWorld(true);
    t.copy(C).addScaledVector(Y, 0.1).addScaledVector(Z, -0.1); p.copy(C).addScaledVector(A, 0.4).addScaledVector(up, -0.3);
    ik2(h, 'l', t, p, 1);
    t.copy(C).addScaledVector(Y, -0.13).addScaledVector(Z, -0.09); p.copy(C).addScaledVector(A, -0.4).addScaledVector(up, -0.3);
    ik2(h, 'r', t, p, 1);
  });
}
function epilogueExtras(home) {
  if (P.rest > 0) endRest();
  arcEpilogueProps(home);                            // ARC: the variant props (sling on the Great Tree, the palisade, ash and ochre hands)
  // round 2: the family steps out into the morning: in front of the house (the epilogue used to resume inside the dim
  // room, facing the door, with a horse prompt through the wall), Lio and the old horse beside them
  const isHouse = home.kind === 'house', at = (lx, lz) => (isHouse ? toWorld(home, [lx, 0, lz]) : new THREE.Vector3(home.x + lx, 0, home.z + lz));
  if (isHouse && !P.ride) {
    rstLeave(); senaHearthDrop(); N.rest = 0; N.sit = 0; N.path = null; N.seat = null; N.jy = 0; P.jy = 0; P.sit = 0; P.path = null;
    const a = at(0, 9.4), b = at(1.25, 9.9); P.pos.set(a.x, 0, a.z); N.pos.set(b.x, 0, b.z);
    P.face = N.face = (home.rot || 0); camYaw = (home.rot || 0) + Math.PI; camPitch = 0.16; N.node = null; N.act = 0; N.wait = 40;   // she stays beside him for the lines
  }
  for (const c of kids) { c.rest = 0; c.h.root.rotation.x = 0; const v = at(-1.3, 10.3); c.pos.set(v.x, 0, v.z); c.epiHold = isHouse && !P.ride ? { v, face: home.rot || 0 } : null; }
  const h = liveTameHorse();
  if (h && P.ride !== h) { const v = at(-3.4, 11.2); h.root.position.set(v.x, getHeight(v.x, v.z), v.z); }
  const t = S.found.tree && POIS.find((p) => p.id === 'tree');
  if (t) {
    const gy = getHeight(t.x, t.z);
    camShot = { pos: new THREE.Vector3(t.x + 16, gy + 7, t.z + 16), look: new THREE.Vector3(t.x, gy + 6, t.z), t: 3.5 + 5 };
  } else {
    const r = home.rot || 0, gy = getHeight(home.x, home.z);
    camShot = { pos: new THREE.Vector3(home.x + Math.sin(r) * 15 + Math.cos(r) * 6, gy + 6, home.z + Math.cos(r) * 15 - Math.sin(r) * 6), look: new THREE.Vector3(home.x, gy + 2, home.z), t: 3.5 + 5 };
  }
  // then a held shot of the three of them with the house behind, while the epilogue card and lines play (no prompts);
  // any movement key hands the camera back early
  if (isHouse && !P.ride) {
    // round 3: straight on and closer, so Lio (-1.3), Aro (0) and Sena (1.25) all stand in frame with the house behind;
    // the long grass is trodden down where they stand (it hid the little one to the waist)
    const c = at(0.15, 13.4), l = at(0, 9.9); c.y = getHeight(c.x, c.z) + 1.35; l.y = getHeight(l.x, l.z) + 0.95;
    const yard = at(0, 10.6); world.clear(yard.x, yard.z, 3.2);
    camShot.next = famShot = { pos: c, look: l, t: 6, untilSubs: true, family: true };
  } else famShot = null;
}
// round 3: the family shot shows all three. Lio stands beside her parents at (-1.3, 10.3) for the flyover and the held
// family shot (the morning rides and following Sena used to take her out of frame before the camera got there).
let famShot = null;
function kidEpiHold(c, dt) {
  const h = c.epiHold;
  if (!h) return false;
  if (!famShot || !(camShot === famShot || camShot?.next === famShot)) { c.epiHold = null; return false; }
  if (c.seat) { c.seat = null; c.h.straddle = false; }
  c.pos.set(h.v.x, 0, h.v.z); c.face = h.face; c.speed = 0; c.play = 0; c.h.pose = null;
  settle(c, dt, false);
  return true;
}
function sideGoals() {
  const lvl = S.horse ? 1 + Math.min(3, ((S.horse.bond || 0) / 100) | 0) : 0, d = POIS.filter((p) => S.found[p.id]).length;
  const row = (t, n, m) => `<div class="${n >= m ? 'done' : ''}">${t} ${Math.min(n, m)}/${m}</div>`;
  return row('Discoveries', d, POIS.length) + row('Bond', lvl, 4) + row('Homeliness', homeliness(), 12) + row('Closeness', Math.round(S.close), 100);
}

// ---------- map, minimap and pins ----------
const MS = 512, mapBase = document.createElement('canvas');
mapBase.width = mapBase.height = MS;
// SAVE-PERF: the parchment base is painted into a CPU-backed canvas (willReadFrequently) so a GPU reset cannot wipe
// it (it used to leave a blank map and minimap for the rest of the session), and it is repainted on a 2D
// contextrestored event or after a WebGL restore just in case.
const mapBaseG = mapBase.getContext('2d', { willReadFrequently: true });
let mapBaseImg = null;
function paintMapBase(check = false) {
  if (check && mapBaseImg && !mapBaseG.isContextLost?.() && mapBaseG.getImageData(MS >> 1, MS >> 1, 1, 1).data[3] === 255) return;
  if (mapBaseImg) { mapBaseG.putImageData(mapBaseImg, 0, 0); return; }
  // WP5 map: parchment base (paper mixed with the height colours, biome tints, contours, hill shading), drawn once.
  const g = mapBaseG, im = g.createImageData(MS, MS);
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
  mapBaseImg = g.getImageData(0, 0, MS, MS);           // kept, so a repaint is one putImageData
}
paintMapBase();
mapBase.addEventListener?.('contextrestored', () => paintMapBase());
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
    g.fillStyle = { sena: '#ff8fb8', wolf: '#ff4a3c', deer: '#c98f55', villager: '#9fd0ff', kid: '#7fe0a0' }[kind] || '#ccc';   // FPP-world: kid = Lio
    g.beginPath(); g.arc(x, y, (kind === 'sena' ? 4.5 : kind === 'kid' ? 3.8 : 3.2) * s, 0, 6.3); g.fill(); g.stroke();
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
  for (const v of villagers) if (!v.indoor) put(v.pos.x, v.pos.z, 'villager');   // STORY: not while indoors for the night
  for (const c of kids) put(c.pos.x, c.pos.z, 'kid', true);   // FPP-world: Lio
  put(N.pos.x, N.pos.z, 'sena', true);
  if (S.pin) put(S.pin.x, S.pin.z, 'pin', true);
  if (S.spearAt) put(S.spearAt.x, S.spearAt.z, 'pin', false, 0.8);   // WPN the thrown spear
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
  // WP5: serif italic ink labels on the parchment. FPP-world: they are queued and drawn after the markers, each
  // moved to the first free slot around its marker (below, above, right, left) so names never print on top of each other.
  const labels = [];
  const label = (x, y, t, big2) => labels.push({ x, y, t, big2 });
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
  for (const h of herds) if (seenAt(h.x, h.z)) { const [x, y] = toMap(h.x, h.z); marker(g, x, y, 'deer', 1.6); label(x, y, 'Herd'); }   // WP5: only in seen land
  for (const o of animals) if (o.kind === 'wolf' && o.state === 'live' && seenAt(o.root.position.x, o.root.position.z)) { const [x, y] = toMap(o.root.position.x, o.root.position.z); marker(g, x, y, 'wolf', 1.4); }
  for (const v of villagers) { if (v.indoor) continue; const [x, y] = toMap(v.pos.x, v.pos.z); marker(g, x, y, 'villager', 1.2); }
  for (const c of kids) { const [x, y] = toMap(c.pos.x, c.pos.z); marker(g, x, y, 'kid', 1.3); label(x, y, c.k.name || 'Lio'); }   // FPP-world
  { const [x, y] = toMap(N.pos.x, N.pos.z); marker(g, x, y, 'sena', 1.4); label(x, y, 'Sena'); }
  if (S.pin) { const [x, y] = toMap(S.pin.x, S.pin.z); marker(g, x, y, 'pin', 1.7); }
  if (S.spearAt) { const [x, y] = toMap(S.spearAt.x, S.spearAt.z); marker(g, x, y, 'pin', 0.8); label(x, y, 'Spear'); }   // WPN
  const [px, py] = toMap(P.pos.x, P.pos.z), qw = questAt(), qm = qw && toMap(qw[0], qw[1]);
  { // FPP-world: place the labels; the player arrow and the quest diamond count as taken
    const taken = [[px - 13, py - 13, px + 13, py + 13]];
    if (qm) taken.push([qm[0] - 10, qm[1] - 13, qm[0] + 10, qm[1] + 13]);
    const free = (r) => r[0] >= 0 && r[2] <= BS && r[1] >= 0 && r[3] <= BS && !taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1]);
    g.textAlign = 'center'; g.textBaseline = 'top'; g.lineWidth = 3.5;
    for (const L of labels) {
      g.font = `italic ${L.big2 ? 600 : 500} ${L.big2 ? 23 : 18}px Georgia, 'Times New Roman', serif`;
      const w = g.measureText(L.t).width + 4, h = L.big2 ? 25 : 20, hw = w / 2 + 14;
      let at = null;
      for (const [dx, dy] of [[0, 10], [0, -10 - h], [hw, -h / 2], [-hw, -h / 2], [0, 12 + h], [0, -12 - 2 * h]]) {
        const r = [L.x + dx - w / 2, L.y + dy, L.x + dx + w / 2, L.y + dy + h];
        if (free(r)) { at = r; break; }
      }
      if (!at) { if (!L.big2) continue; at = [L.x - w / 2, L.y + 10, L.x + w / 2, L.y + 10 + h]; }   // place names always show
      taken.push(at);
      const cx = (at[0] + at[2]) / 2;
      g.strokeStyle = 'rgba(240,228,198,0.85)'; g.strokeText(L.t, cx, at[1]); g.fillStyle = '#3a2a18'; g.fillText(L.t, cx, at[1]);
    }
  }
  if (qm) marker(g, qm[0], qm[1], 'quest', 1.5);    // FPP-world: the quest diamond sits above the labels
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
  if (on) { document.exitPointerLock?.(); $('lg-kid').style.display = kids.length ? '' : 'none'; drawMap(); } else lock();   // FPP-world: Lio's legend row once she is born
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
let miniT = 0, miniX = 1e9, miniZ = 0, miniYaw = 0;
function updateMap() {
  // WP5 fog tick: reveal around the player every 0.5 s (wider while riding)
  if (clock >= fogT) { fogT = clock + 0.5; reveal(P.pos.x, P.pos.z, P.ride ? 70 : 45); }
  // SAVE-PERF: the minimap redraws at ~12 Hz, and at once when the player moves 0.5 m or the camera turns 2°
  const nowMs = performance.now();
  if (nowMs >= miniT || Math.abs(P.pos.x - miniX) + Math.abs(P.pos.z - miniZ) > 0.5 || Math.abs(camYaw - miniYaw) > 0.035) {
    miniT = nowMs + 80; miniX = P.pos.x; miniZ = P.pos.z; miniYaw = camYaw;
    drawMini();
  }
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
// MAT-SV: the capture hint shows for 6 s when the mouse is free, then fades; a click without capture brings it back. Never in a cinematic.
let lockHintAt = 0, lockHintFree = false, lockHintMenu = false;
const lockHint = () => {
  const free = playing && !locked(), menu = paused || menuOpen;   // the timer restarts when the mouse becomes free, a menu closes without capture, or on a click; not after a cinematic
  if (free && (!lockHintFree || (lockHintMenu && !menu))) lockHintAt = performance.now();
  lockHintFree = free; lockHintMenu = menu;
  const want = free && !menuOpen && !paused && !busy && !$('hud').classList.contains('cine') && !$('hud').classList.contains('cinew') && !(P.downed > 0);
  const el = $('lockhint'), show = want && performance.now() - lockHintAt < 6000;
  el.style.display = want ? 'block' : 'none'; el.classList.toggle('off', !show);
};
const lockHintPing = () => { lockHintAt = performance.now(); lockHint(); };
document.addEventListener('pointerlockchange', () => {
  if (locked()) { lockedAt = performance.now(); lockBroken = false; lockHad = true; }   // ARC-FIX5: lockHad
  else if (!lockHad) { /* ARC-FIX5: a refused or doubled request (no lock was ever held): not an Esc, no pause */ }
  else { lockHad = false;
    unlockTime = performance.now();
    // Esc released the mouse while playing: that is the pause menu. (Chrome swallows the Esc key itself.)
    if (playing && !menuOpen && !busy && !paused && performance.now() - lockedAt > 300) pause(true);
  }
  lockHint();
});
let lockHad = false;   // ARC-FIX5
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
const GAME_KEYS = /^(Key[WASDEFCVGMQBTRHXIZ]|Digit[1-5]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|Tab|Escape|Arrow(Up|Down|Left|Right))$/;   // MAT: I body, Z focus, AltLeft dodge
addEventListener('keydown', (e) => {
  if (!playing) return;
  if (GAME_KEYS.test(e.code) && !(e.ctrlKey && /^Key[RL]$/.test(e.code))) e.preventDefault();   // keep browser shortcuts out of the game (reload stays)
  if (matKey(e)) return;                             // MAT: the choose() panel (1-4, E, Esc) and the downed/death input lock
  if (rstKey(e)) return;                             // RST: the rest menu (1/2/E/Esc) and skipping the sequence
  if (cmbKey(e)) return;                             // CMB: Alt dodge roll, E mash in the bear's maul
  if (survKey(e)) return;                            // SURV: I opens the body screen (1-6 treat, I/Esc close)
  if (e.code === 'F1') { e.preventDefault(); if (!e.repeat) toggleHelp(); return; }   // FPP-world: the controls list
  if (e.code === 'Escape') {
    if (W.aim) { wpnCancelAim(); return; }            // WPN: Esc first cancels a spear aim
    if (!$('help').classList.contains('min')) { toggleHelp(false); return; }   // FPP-world: Esc closes the open controls list first
    if (e.repeat) return;
    if (paused) pause(false); else if (mapOpen) toggleMap(false); else if (menuOpen) toggleMenu(false); else if (!busy) pause(true);
    return;
  }
  if (paused || (e.repeat && e.code !== 'KeyE')) return;
  keys[e.code] = true;
  if (e.code === 'KeyE') { tapE = true; if (!e.repeat) { eTap = true; eLatch = false; } }   // WP4 eTap: a fresh press (taming, mount, dismount)
  if (e.code === 'KeyM') { toggleMap(); return; }
  if (mapOpen) return;
  if (e.code === 'Tab') { toggleMenu(); return; }
  if (e.code === 'KeyB') { bagOpen(true); return; }   // BOW-UI: hold B to look in the bag
  if (menuOpen || busy) return;
  if (/^(Key[WASD]|Space|ShiftLeft|ControlLeft)$/.test(e.code)) lock();      // moving always re-captures the mouse
  if (e.code === 'KeyF') eat();
  if (e.code === 'KeyT') toggleTorch();
  if (e.code === 'KeyX') callHorse();                // WP4 whistle
  if (e.code === 'KeyR') drinkSkin();
  if (e.code === 'KeyH') heal();
  if (e.code === 'Space') jumpTap = true;
  if (e.code === 'KeyV') { view = view === 'fpp' ? 'tpp' : 'fpp'; camPitch = clamp(camPitch, pitchMin(), fppPitchMax()); toast(view === 'fpp' ? 'First person' : 'Third person'); }   // FPP pitch limit
  if (e.code === 'KeyG') { if (S.pin) { P.auto = !P.auto; toast(P.auto ? 'Auto-walking to your pin' : 'Auto-walk stopped'); } else toast('Open the map (M) and drop a pin first'); }
  if (e.code === 'KeyC') P.sneak = !P.sneak;
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') P.sneak = true;        // hold Ctrl to sneak, C toggles it
  if (e.code === 'KeyQ' && placing) { placing = null; ghost.visible = false; }
  else if (e.code === 'KeyQ') wpnQDown();           // WPN tap Q: swap to the last weapon, hold: draw / sheathe
  if (/^Digit[1-4]$/.test(e.code)) wpnKey(e.code);
  if (e.code === 'Digit5') bowToggle();             // BOW   // WPN 1 fists, 2 axe, 3 spear, 4 torch
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyE') eLatch = false;             // STORY
  if (e.code === 'KeyQ') wpnQUp();                   // WPN
  if (e.code === 'KeyB') bagOpen(false);             // BOW-UI
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !keys.ControlLeft && !keys.ControlRight) P.sneak = false;
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; bagOpen(false); });
canvas.addEventListener('mousedown', (e) => {
  if (!playing || menuOpen || busy || paused || P.downed > 0) return;   // MAT: no attacks while downed
  if (!locked()) { lockHintPing(); lock(); if (!lockBroken) return; }   // the first click only captures the mouse (MAT-SV: and shows the hint again)
  if (BOW.on && !placing && (e.button === 2 || (e.button === 0 && W.aim))) { if (e.button === 2) bowAimStart(); else bowLoose(); return; }   // BOW
  if (BOW.on && !placing && e.button === 0) return;   // BOW: left click does nothing until drawn
  if (!placing && ((e.button === 0 && cmbLmbDown()) || (e.button === 2 && cmbRmbDown()))) return;   // CMB: hold for a heavy, right mouse guards (axe, fists, torch)
  if (e.button === 0) placing ? confirmPlace() : wpnPrimary();   // WPN: by weapon (cancels an aim)
  if (e.button === 2) { if (placing) { placing = null; ghost.visible = false; } else wpnAimStart(); }   // WPN: hold to aim
});
addEventListener('mouseup', (e) => {                 // WPN: release right mouse to throw
  if (BOW.on && e.button === 2) { W.rmb = false; if (W.aim) { if (W.aim.charge > 0.3) A.hit(150, 0.35, 0.04); wpnCancelAim(); } return; }   // BOW (spec §3): letting go of right mouse eases the string down, no arrow spent; left click looses
  if (cmbMouseUp(e)) return;                         // CMB: light attack on release, guard down, a brace never throws
  if (e.button !== 2) return;
  W.rmb = false;
  if (!W.aim) { if (W.queued === 'aim') W.relEarly = true; return; }
  if (!playing || paused || menuOpen || busy) wpnCancelAim(); else wpnRelease();
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
addEventListener('wheel', (e) => { if (playing && !menuOpen && !paused && !W.aim /* WPN: not while aiming */) camDist = clamp(camDist + Math.sign(e.deltaY) * 0.5, 2.6, P.ride ? 12 : 9); }, { passive: true });   // WP4: further out on horseback
function applyLook(dt) {
  const k = 0.0024 * settings.sens, inv = settings.invertY ? -1 : 1;
  // Without the mouse captured the cursor hits the window edge: keep turning while it rests near an edge.
  if (!locked() && mouseX >= 0 && !menuOpen && !paused) {
    const ex = mouseX < 40 ? -1 : mouseX > innerWidth - 40 ? 1 : 0, ey = mouseY < 40 ? -1 : mouseY > innerHeight - 40 ? 1 : 0;
    lookX += ex * dt * 700; lookY += ey * dt * 500;
  }
  camYaw -= lookX * k;
  camPitch = clamp(camPitch + lookY * k * 0.9 * inv, pitchMin(), fppPitchMax());   // FPP: 1.45 in first person
  lookX = lookY = 0;
  fppYawLimit(dt);                                   // FPP-world: seated / riding head-turn limit
}
// FPP-world: in first person while riding, sitting or seated, the head turns at most ~110 degrees (riding) or ~120
// (seated) from the body; a soft spring at the edge, a hard stop a little past it. Turn the horse or stand up to look
// further. Third person stays free.
function fppYawLimit(dt) {
  if (view !== 'fpp' || camShot || !Number.isFinite(P.face) || !(P.ride || P.sit > 0 || P.seat)) return;
  const lim = P.ride ? 1.92 : 2.09, rel = wrapA(camFace() - P.face), over = Math.abs(rel) - lim;
  // FHW-r4: riding, the chest turns with the look (a rider twists in the saddle to look aside). The head bone stayed
  // square to the horse, so looking ~110 degrees aside put the eye 10 cm from his own shoulder: the cut-off neck and
  // trapezius filled the view as dark jagged planes around a see-through hole. 75% of the turn goes to the spine.
  if (P.ride) FP.tw += ((P.taming ? 0 : clamp(rel * 0.75, -1.4, 1.4)) - FP.tw) * Math.min(1, dt * 10);
  if (over <= 0) return;
  const sg = Math.sign(rel), back = Math.max(over - 0.12, over * Math.min(1, dt * 10));   // never more than 0.12 rad past the edge
  camYaw -= sg * back;
}

// ---------- pause menu and settings ----------
function pause(on) {
  if (!playing || (on && (busy || menuOpen)) || GFX.lost) return;   // SAVE-PERF: no unpausing behind the graphics-reset panel
  paused = on;
  $('pause').classList.toggle('on', on);
  if (on) { document.exitPointerLock?.(); save(); for (const k in keys) keys[k] = false; matQuitUi(); }   // MAT-SV
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
  const oad = $('opt-autodraw'), osh = $('opt-shake'), oarc = $('opt-arc');   // WPN
  oad.checked = settings.autoDraw ?? true; osh.checked = settings.shake ?? true; oarc.value = settings.arc ?? 'on';   // WPN
  oad.onchange = () => { settings.autoDraw = oad.checked; saveSettings(); }; osh.onchange = () => { settings.shake = osh.checked; saveSettings(); }; oarc.onchange = () => { settings.arc = oarc.value; saveSettings(); };   // WPN
  $('btn-resume').onclick = () => pause(false);
  $('btn-save').onclick = () => { save({ now: true }); toast('Game saved'); };
  $('btn-quit').onclick = () => { if (matHoldSave()) return; save({ now: true }); location.reload(); };   // MAT-SV: not during a Hardcore fight
  matBindSettings();                                 // MAT: tabs, Game/Audio/Content rows, difficulty, content notice, credits
}
function applyQuality() {
  Q = PRESETS[quality()];
  pixelRatio = Math.min(devicePixelRatio, Q.pr); renderer.setPixelRatio(pixelRatio);
  world.setQuality(quality());
  $('opt-qual-v').textContent = settings.quality === 'auto' ? `auto → ${quality()}` : '';
}
bindSettings();

// SAVE-PERF: WebGL context loss (GPU driver reset, laptop sleep/wake, memory pressure). Without a handler the screen
// stayed white while the game kept running. Now the game pauses, saves, and says what happened; three.js re-uploads
// everything when the browser restores the context, and if it never comes back the player reloads from the save.
const GFX = { lost: false, wasPaused: false, timer: 0, el: null };
function gfxPanel(msg, ready) {
  if (!GFX.el) {
    GFX.el = document.createElement('div'); GFX.el.id = 'gfxlost';
    GFX.el.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;background:rgba(0,0,0,0.72);z-index:20;text-align:center';
    GFX.el.innerHTML = '<div class="panel" style="padding:22px 26px;width:min(440px,92vw)"><h3 class="serif" style="margin:0 0 8px;font-size:24px;font-weight:normal;color:var(--gold)">Graphics were reset</h3>'
      + '<p id="gfx-msg" style="margin:0 0 14px;color:var(--dim)"></p><div style="display:flex;gap:8px;justify-content:center">'
      + '<button id="gfx-go" class="mat-btn">Continue</button><button id="gfx-reload" class="mat-btn quiet">Reload</button></div></div>';
    document.body.append(GFX.el);
    GFX.el.querySelector('#gfx-go').onclick = gfxResume;
    GFX.el.querySelector('#gfx-reload').onclick = () => { save({ now: true }); location.reload(); };
  }
  GFX.el.style.display = 'grid';
  GFX.el.querySelector('#gfx-msg').textContent = msg;
  GFX.el.querySelector('#gfx-go').style.display = ready ? '' : 'none';
}
function gfxResume() {
  if (GFX.lost) return;
  GFX.el.style.display = 'none';
  paused = GFX.wasPaused; last = performance.now();
  if (!paused) lock();
}
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();                                  // tells the browser we want the context back
  GFX.lost = true; GFX.wasPaused = paused; paused = true;
  document.exitPointerLock?.(); for (const k in keys) keys[k] = false;
  save({ now: true });
  gfxPanel(playing ? 'The game is paused and saved. Waiting for the graphics to come back…' : 'Waiting for the graphics to come back…', false);
  clearTimeout(GFX.timer);
  GFX.timer = setTimeout(() => { if (GFX.lost) gfxPanel('The graphics did not come back. Reload to carry on from your save.', false); }, 6000);
});
canvas.addEventListener('webglcontextrestored', () => {
  GFX.lost = false; clearTimeout(GFX.timer);
  renderer.shadowMap.needsUpdate = true;
  paintMapBase(true);                                  // the 2D map canvases may have been reset with the GPU too
  warmShaders();                                       // every program is rebuilt: do it behind the panel, not in play
  gfxPanel(playing ? 'Everything is back. Your game is paused and saved.' : 'Everything is back.', true);
});

// ---------- per-frame updates ----------
let target = null, useCool = 0, tick = 0, saveT = 0;
let eLatch = false;                                 // STORY: an E press that stood you up can't also re-sit you
// SIT-r3: leaving a sit two-shot, the follow camera starts on the shot's side of him (it then eases behind; no whip-pan)
function sitShotOff() {
  camYaw = Math.atan2(camPos.x - P.pos.x, camPos.z - P.pos.z); camPitch = clamp(Math.atan2(camPos.y - P.pos.y - 1.7, Math.hypot(camPos.x - P.pos.x, camPos.z - P.pos.z)), 0.05, 0.45);
  camBack = { lk: (camShot.lk || camShot.look).clone(), t: 0 };
  camShot = null;
}
let camBack = null;                                  // SIT-r3: the aim eases back from a sit shot to Aro (updateCamera)
function updatePlayer(dt) {
  applyLook(dt);
  if (matDownedTick(dt)) return;                     // MAT: downed (lying, input ignored, Sena on her way) or the death beat
  if (cmbPlayerTick(dt)) return;                     // CMB dodge roll, knockdown, guard break, finisher
  const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  camYaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 1.8;
  camPitch = clamp(camPitch + ((keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)) * dt, pitchMin(), fppPitchMax());   // FPP
  // Sitting: any movement key, jump or a fresh E press (STORY; not the press that sat him down) stands you up early; it ends by itself after a while.
  if (P.sit > 0) {
    P.sitSince ??= clock; P.sit -= dt;
    const eUp = eTap && clock - P.sitSince > 0.6;
    if (mx || mz || jumpTap || eUp || P.sit <= 0) { endSit(P); endSit(N); P.sitSince = null; if (camShot?.ease && !camShot.story) sitShotOff(); if (camShot?.hearthSit) camShot = null; if (eUp) { tapE = false; eLatch = true; useCool = Math.max(useCool, 0.5); } }   // STORY: the stand-up press is used up until E is released
  } else { P.sitSince = null; if (camShot?.ease && !camShot.story) sitShotOff(); if (camShot?.hearthSit) camShot = null; }   // round 2: the hearth two-shot never outlives the sit
  // WP2: resting in bed (input ignored), kneeling at a construction site (movement stops it), dancing after a shared build
  if (P.rest > 0) { P.vx = P.vz = 0; jumpTap = false; rstUpdate(dt); if (P.rest > 0) { settle(P, dt, false); target = null; $('prompt').style.display = 'none'; return; } }   // RST
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
  S.stam = clamp(S.stam + dt * (run ? (P.swim ? -8 : -10) : (P.speed < 0.5 ? 18 : 10) * (S.rested > 0 ? 1.5 : 1)), 0, matStamCap());   // WP2 well rested   // MAT stamina cap (weak, SURV)
  let sp = !moving ? 0 : P.swim ? (run ? 3 : 2.1) : P.sneak ? 1.7 : run ? 6.6 : 3.3;
  if (!P.swim && !P.air && P.pos.y < 0.15) sp *= 0.6;
  sp = wpnSpeed(sp, run);                            // WPN drawn: walk x0.8, run x0.9; aiming: strafe at 1.8
  sp = survSpeed(sp, run, dt);                       // SURV: sprain/fracture speed, no sprint or jump, Sena's shoulder, poison episodes
  sp = romSpeed(sp);                                 // ROM: hand in hand they stroll (the walk loop, not the jog)
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
    if (P.step > 2.3 && !P.air) { P.step = 0; if (!FP.own) A.hit(P.pos.y < 0.1 ? 900 : 170 + rand() * 90, 0.08, P.sneak ? 0.04 : 0.13); }   // FPP: steps come from the feet
  }
  P.speed = v < 0.2 ? 0 : v;
  if (view === 'fpp') P.face = fppFace(dt, moving, dx, dz);   // FPP: legs follow the movement, the chest turns to the view
  else if (W.aim || (W.st === 'drawn' && hostileNear(12))) P.face = turn(P.face, camFace(), Math.min(1, dt * 14));   // WPN: aim / strafe facing wolves
  else if (moving) P.face = turn(P.face, Math.atan2(dx, dz), Math.min(1, dt * 10));
  if (jumpTap && can && !P.air && !P.swim && S.stam > 8) { P.vy = 4.4; P.air = true; P.sneak = false; S.stam -= 7; A.hit(320, 0.1, 0.2); }   // FPP: a 0.65 m human jump (was 5.6, 1.05 m)
  jumpTap = false;
  if (P.air) { P.vy -= 15 * dt; P.jy += P.vy * dt; matAirTrack(); if (P.jy <= 0) { P.jy = 0; P.air = false; A.hit(150, 0.12, 0.35); matLand(); } }   // MAT: 'land' event {drop, speed, water}
  if (S.pin && Math.hypot(S.pin.x - P.pos.x, S.pin.z - P.pos.z) < 5) { S.pin = null; P.auto = false; toast('You have reached your pin'); A.tone(523, 0.6, 0.1); }
  P.cool = Math.max(0, P.cool - dt);
  wpnUpdate(dt);                                     // WPN draw/sheathe, aim, auto rules, carried things
  cmbStepTick(dt);                                   // GC-FIX5: the step in toward the target
  if (hitT > 0 && (hitT -= dt) <= 0) landHit();
  settle(P, dt * hsK(P), P.sneak);                   // WPN hitstop

  // interaction
  useCool -= dt;
  target = busy || menuOpen || placing || P.sit > 0 || camShot ? null : findTarget();   // final test: no prompts during the rest/epilogue camera shots
  const pr = $('prompt');
  if (placing) { pr.style.display = 'block'; pr.innerHTML = `<kbd>Click</kbd> build ${placing.name} &nbsp; <kbd>Q</kbd> cancel`; }
  else if (target && (!W.aim || /^Take back/.test(target.label))) { pr.style.display = 'block'; pr.innerHTML = (target.key ? '<kbd>E</kbd> ' : '') + target.label; }
  else pr.style.display = 'none';
  const use = (keys.KeyE || tapE) && !eLatch; tapE = false;   // STORY eLatch
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
  senaBodyPush();                                    // GORE-FIX: never inside an animal's body, live or dead
  if (matSenaRescue(dt)) return;                     // MAT: she runs to a downed Aro, kneels and revives him (or the grief beat)
  if (cmbSena(dt)) return;                           // CMB: Sena downed (timer, revive) or fighting beside Aro
  if (survSena(dt)) return;                          // SURV: she tends Aro's wounds, or walks him with his arm over her shoulders
  if (arcSena(dt)) return;                           // ARC: scripted Sena (the lake at dusk, the fire with Tamu, sick in bed)
  if (romSena(dt)) return;                           // ROM: scenes, hand in hand, a talk
  if (N.board && senaBoard(dt)) { settle(N, dt, false); return; }   // RIDE-r4: on foot to the horse's flank, then the climb
  if (N.ride && !P.ride) { N.ride = false; N.seat = null; N.h.pose = null; N.h.straddle = false; }
  if (N.ride) { N.speed = 0; N.node = null; settle(N, dt, false); return; }   // WP4: riding behind Aro (seated by updateHorses)
  if (N.sit > 0) { N.sit -= dt; N.speed = 0; if (N.hearth) N.hearth.seen = clock; if (N.sit <= 0) endSit(N); settle(N, dt, false); return; }
  if (N.soakOut) { N.soakT = (N.soakT || 0) + dt; if (N.soakT < 0.7) { N.speed = 0; settle(N, dt, false); return; }   // SIT-r3: she stands up before wading out
    if (rstWalk(N, dt, 1.2) || N.soakT > 6.7) { N.soakOut = false; N.soakT = 0; N.path = null; N.speed = 0; N.wait = 2; } settle(N, dt, false); return; }   // STORY: out of the hot spring
  // WP2: resting (endRest wakes her with Aro), dancing after a shared build, then working at a construction site
  if (N.rest > 0) { if (!R.on && !R.nOut) N.speed = 0; settle(N, dt, false); return; }   // RST: the sequence walks her
  if (N.dance > 0) { N.dance -= dt; N.speed = 0; if (N.dance <= 0 && N.h.pose === 'dance') N.h.pose = null; settle(N, dt, false); return; }
  if (senaBuild(dt)) { settle(N, dt, false); return; }
  if (N.fetch && wpnSenaFetch(dt)) { settle(N, dt, false); return; }   // WPN: she brings back a forgotten spear
  if (N.hearth && clock - (N.hearth.seen ?? clock) > 0.5) senaHearthDrop();   // STORY: something else had her (a scene, the rest): start over
  if (senaHearth(dt)) { N.hearth && (N.hearth.seen = clock); settle(N, dt, false); return; }   // STORY: evenings by the home hearth
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
    else if (dP > (S.close >= 20 ? 2.4 : 4.5)) walkTo(N, P.pos.x, P.pos.z, dP > 12 ? 6.6 : 3.4, dt, S.close >= 20 ? 1.3 : 3);   // ROM Fond: she walks closer
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
// STORY: villagers wander the village by day (never through a house: targets inside a hut or house are refused) and
// at night each goes in at the door of one of the village houses until morning (hidden inside), so nobody strolls
// through Aro's home while the family sleeps.
const inAnyHouse = (x, z) => structs.some((s) => (s.kind === 'house' || s.kind === 'hut') && Math.hypot(s.x - x, s.z - z) < s.radius + 1);
function updateVillagers(dt) {
  const night = S.time >= 20.5 || S.time < 6, home = homeHouse(), vh = structs.filter((s) => s.kind === 'house' && s !== home && s.rise >= 1);
  villagers.forEach((v, i) => {
    const vhouse = vh.length ? vh[i % vh.length] : null;
    if (night && vhouse) {
      const door = toWorld(vhouse, [0, 0, 3.6]);
      if (!v.indoor) {
        const d = Math.hypot(door.x - v.pos.x, door.z - v.pos.z);
        if (d > 70) v.pos.set(door.x, 0, door.z);                            // far away (or just loaded): already home
        if (villagerWalk(v, door.x, door.z, 2.2, dt, 0.5, vhouse) || d > 70) { v.indoor = true; v.h.root.visible = false; v.speed = 0; }   // round 2: round the houses, not through them
        settle(v, dt, false);
      }
      return;
    }
    if (v.indoor) { v.indoor = false; v.h.root.visible = true; v.wait = 0; if (vhouse) { const k = Math.floor(i / vh.length), door = toWorld(vhouse, [(k % 2 ? 1 : -1) * 0.9 * Math.ceil(k / 2), 0, 3.6 + 0.5 * k]); v.pos.set(door.x, 0, door.z); } }   // two sharing a house step out side by side, never inside each other
    v.wait -= dt;
    if (v.wait <= 0) {
      v.wait = 5 + rand() * 9;
      for (let k = 0; k < 6; k++) { const a = rand() * 6.283, r = 5 + rand() * 22; v.tx = v.home.x + Math.cos(a) * r; v.tz = v.home.z + Math.sin(a) * r; if (!inAnyHouse(v.tx, v.tz)) break; }
    }
    if (getHeight(v.tx, v.tz) < 0.8 || inAnyHouse(v.tx, v.tz)) v.wait = 0;
    if (R.on && home && Math.hypot(v.pos.x - home.x, v.pos.z - home.z) < home.radius + 12) { v.speed = 0; villagerOut(v, null); villagerApart(v, i); settle(v, dt, false); return; }   // round 2: nobody wanders past the bed while the family rests
    villagerWalk(v, v.tx, v.tz, 1.9, dt, 0.6);
    villagerApart(v, i);
    settle(v, dt, false);
  });
}
// Villagers keep a step apart: two whose ways meet (at a house corner, a shared door) never stand inside each other,
// so a village child is never drawn inside an adult's body.
function villagerApart(v, i) {
  for (const o of villagers) {
    if (o === v || o.indoor) continue;
    let dx = v.pos.x - o.pos.x, dz = v.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d >= 0.65) continue;
    if (d < 1e-3) { dx = Math.cos(i * 2.4); dz = Math.sin(i * 2.4); d = 1; }
    v.pos.x = o.pos.x + (dx / d) * 0.65; v.pos.z = o.pos.z + (dz / d) * 0.65;
  }
}
// STORY round 2: villagers walk AROUND every hut and house (walkTo alone went in a straight line through the walls,
// and the home's collider is off while the family is inside). The next waypoint is the point beside the nearest
// building whose circle (radius + 0.8) blocks the straight line; a villager going in at a door first walks round to
// the front. Anyone found inside a building's walls is pushed out to its edge.
const vRad = (s) => s.radius + (s.kind === 'house' && !s.village && S.home?.nursery ? 2.3 : 0);   // the nursery annex reaches 6.4 m out
function villagerSteer(v, tx, tz, target) {
  let best = null, bt = 2;
  for (const s of structs) {
    if (s.kind !== 'house' && s.kind !== 'hut') continue;
    const R0 = vRad(s) + 0.8, dx = tx - v.pos.x, dz = tz - v.pos.z, L2 = dx * dx + dz * dz || 1;
    if (Math.hypot(tx - s.x, tz - s.z) < R0) continue;                         // the target itself is at this building (its door)
    const t = clamp(((s.x - v.pos.x) * dx + (s.z - v.pos.z) * dz) / L2, 0, 1), cx = v.pos.x + dx * t, cz = v.pos.z + dz * t;
    const d = Math.hypot(cx - s.x, cz - s.z);
    if (d >= R0 || t >= bt) continue;
    let nx = cx - s.x, nz = cz - s.z;
    if (d < 0.05) { nx = -dz; nz = dx; }                                        // dead centre: go round either side
    const n = Math.hypot(nx, nz) || 1;
    bt = t; best = [s.x + (nx / n) * (R0 + 0.5), s.z + (nz / n) * (R0 + 0.5)];
  }
  return best || target;
}
function villagerOut(v, door) {
  for (const s of structs) {
    if (s.kind !== 'house' && s.kind !== 'hut') continue;
    const [lx, lz] = rstLocal(s, v.pos), d = Math.hypot(v.pos.x - s.x, v.pos.z - s.z), R0 = vRad(s) + 0.2;
    if (d >= R0 || (s === door && lz > 2.75 && Math.abs(lx) < 2.3)) continue;   // the doorstep of the house she is going into is fine
    const k = (R0 + 0.05) / (d || 1); v.pos.x = s.x + (v.pos.x - s.x) * k; v.pos.z = s.z + (v.pos.z - s.z) * k;
  }
}
function villagerWalk(v, tx, tz, speed, dt, stop, door = null) {
  let gx = tx, gz = tz;
  if (door) {                                                                    // going in: round to the front of that house first
    const [lx, lz] = rstLocal(door, v.pos);
    if (lz < 2.8 || Math.abs(lx) > 2.2) { const f = toWorld(door, [0, 0, door.radius + 1.4]); gx = f.x; gz = f.z; }
  }
  const [wx, wz] = villagerSteer(v, gx, gz, [gx, gz]);
  const arrived = walkTo(v, wx, wz, speed, dt, wx === tx && wz === tz ? stop : 0.3) && wx === tx && wz === tz;
  villagerOut(v, door);
  return arrived;
}
function updateStats(dt) {
  const E = world.env, p = P.pos;
  if (!(R.on && R.phase === 'night')) S.time += dt * (24 / 600) * (E.night > 0.7 ? 2.2 : 1);   // RST: the time-lapse drives the clock
  if (S.time >= 24) { S.time -= 24; S.day++; }   // the day turns at midnight, awake or not (RST's time-lapse counts its own wrap)
  const effort = P.speed > 4 && !P.ride ? 1.7 : 1;   // WP4: the horse does the work
  S.food = Math.max(0, S.food - dt * 0.085 * effort * (S.restTier === 'Snug' && S.rested > 0 ? 0.8 : 1) * D().drainK);   // RST: Snug slows hunger   // MAT drainK
  S.water = Math.max(0, S.water - dt * 0.12 * effort * D().drainK);   // MAT drainK
  const sheltered = world.env.cave > 0.5 || structs.some((s) => s.rise >= 1 &&((s.kind === 'fire' && Math.hypot(s.x - p.x, s.z - p.z) < 8) || ((s.kind === 'hut' || s.kind === 'house') && Math.hypot(s.x - p.x, s.z - p.z) < s.radius + 2.5)));
  const chill = (1.1 + (p.y < 0 ? 1.5 : 0)) * cmbCloakK() * (torchOn ? 0.75 : 1) * D().chillK * arcChillK() * romChillK();   // MAT chillK, ARC winter ×1.8   // CMB cmbCloakK: mantle 0.4, bear cloak 0.3
  S.warm = clamp(S.warm + dt * ((E.night > 0.5 || E.storm > 0.5) && !sheltered ? -chill : 5), 0, 100);
  const hurt = (S.food <= 0 ? 0.9 : 0) + (S.water <= 0 ? 1.3 : 0) + (S.warm <= 0 ? 1.4 : 0);
  S.hp = clamp(S.hp + dt * (hurt ? -hurt : S.food > 35 && S.water > 35 ? 0.7 * matRegenK() : 0), 0, 100);   // MAT: no regen while downed, ×0.5 while weak
  survStats(dt, sheltered);                          // SURV: afflictions, spoilage, the spit, boiling, the 1 Hz tick
  if (S.hp <= 0 && !busy) die(hurtFlash > 0 ? 'The wolves drag you down.' : S.warm <= 0 ? 'The cold takes you.' : S.water <= 0 ? 'Thirst overcomes you.' : 'Hunger overcomes you.');
  if (E.night > 0.6 && !S.warned && !sheltered && !arcCalmNow()) { S.warned = true;   // ARC-FIX: not over a story scene
    say('Sena', has('fire') ? 'It grows cold. Come back to the fire.' : 'Night is here and we have no fire. Stay close to me.'); }
  if (E.night < 0.1) S.warned = false;
  for (const k of ['hp', 'food', 'water', 'warm', 'close']) $('b-' + k).style.width = S[k] + '%';
  const hh = S.time | 0, mm = ((S.time % 1) * 60) | 0;
  $('clock').textContent = `${dayLabel()} · ${String(hh).padStart(2, '0')}:${String(mm - (mm % 10)).padStart(2, '0')}`;
  matClock();                                        // MAT: monotonic S.gh, 'hours' events
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
  windowLight(world.env.day, world.env.night, world.env.storm);   // STORY: house windows by daylight
  if (A.ctx) {
    const E = world.env;
    A.cricket.gain.value = E.night * 0.012 * (R.on ? 2 : 1);   // RST: louder through the night time-lapse
    A.river.gain.value = clamp(1 - Math.abs(P.pos.x - riverX(P.pos.z)) / 40, 0, 1) ** 2 * 0.16;
    if (E.day > 0.5 && E.storm < 0.4 && rand() < dt * 0.35) A.chirp(0.012 + rand() * 0.03);
  }
  saveFlash = Math.max(0, saveFlash - dt);
  { const el = $('savechip'), o = el.textContent ? String(Math.min(1, saveFlash)) : '0'; if (el.style.opacity !== o) el.style.opacity = o; }   // SAVE-PERF: never an empty pill
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
    if (camShot.dolly || camShot.release) { P.h.root.visible = true; rstCamera(dt); return; }   // RST bedside dolly and the release behind Aro
    camShot.t -= dt; P.h.root.visible = true;
    camPos.lerp(camShot.pos, 1 - Math.exp(-dt * (camShot.ease ? 2.6 : 6))); if (camShot.snap !== false) { camPos.copy(camShot.pos); camShot.snap = false; }
    if (camShot.ease) { camShot.lk ??= new THREE.Vector3(look.x, look.y + 0.3, look.z); camShot.lk.lerp(camShot.look, 1 - Math.exp(-dt * 3.2)); }   // SIT-r3: the sit two-shots glide in (position and aim)
    camera.position.copy(camPos); camera.lookAt(camShot.ease ? camShot.lk : camShot.look);
    camShot.age = (camShot.age || 0) + dt;
    if (camShot.untilSubs && camShot.age < 40 && (subs.length || subT > 0 || $('card').classList.contains('on'))) camShot.t = Math.max(camShot.t, 0.5);   // round 2: held while the lines play
    if (camShot.family && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD)) camShot.t = 0;
    if (camShot.t <= 0) camShot = camShot.next || null;   // round 2: shots can chain (the epilogue flyover, then the family)
    return;
  }
  if (fppCamera(dt)) return;                         // FPP true first person (eyes, body, bob, springs, roll)
  P.h.root.visible = view !== 'fpp';
  const fovT = fppFovT(dt);                          // FPP base FOV setting + sprint; WPN aim zoom, throw punch
  if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * (W.camK > 0.01 || W.punch > 0 ? 14 : 5)); camera.updateProjectionMatrix(); }   // WPN: quicker while aiming
  const cp = Math.cos(camPitch);
  if (view === 'fpp') {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const eye = P.ride && P.saddle ? P.saddle.y + 0.75 - P.pos.y : (P.swim ? 0.3 : 1.68 - P.h.crouch * 0.55)   // WP4 eye on horseback
      + Math.sin(P.step * 2.7) * 0.03 * Math.min(1, P.speed / 3);
    camPos.set(P.pos.x + fx * 0.16, P.pos.y + eye, P.pos.z + fz * 0.16);
    camera.position.copy(camPos);
    const shk = wpnShake();                          // WPN trauma shake
    camera.lookAt(camPos.x + fx * cp, camPos.y - Math.sin(camPitch), camPos.z + fz * cp);
    if (shk) camera.rotateZ(shk * 0.03 * Math.sin(clock * 23));
    return;
  }
  // Third person: over the right shoulder, pulled in when sneaking, kept above the ground.
  const dist = Math.min(camDist * (P.sneak ? 0.8 : 1) * (P.ride ? 1.45 : 1), world.env.cave > 0.15 ? 3 : 99)   // WP4: further back when riding   // WP3: closer in caves
    * (1 - W.camK * (1 - 2.2 / 4.8));                // WPN aim: pulled in over the shoulder
  const shoulder = 0.45 + 0.35 * W.camK;             // WPN
  look.set(P.pos.x + Math.cos(camYaw) * shoulder, P.pos.y + (P.ride ? 2.6 : P.floorSit ? 1.0 : 1.7 - P.h.crouch * 0.3), P.pos.z - Math.sin(camYaw) * shoulder);   // WP4 ride height   // STORY: lower over a floor sit (the hearth)
  _v.set(look.x + Math.sin(camYaw) * cp * dist, look.y + Math.sin(camPitch) * dist, look.z + Math.cos(camYaw) * cp * dist);
  _v.y = Math.max(_v.y, getHeight(_v.x, _v.z) + 0.35, 0.7);
  camPos.lerp(_v, 1 - Math.exp(-dt * 16));
  caveCam(camPos);                                   // WP3: never outside the dome while inside a cave
  structCam(look, camPos);                           // RST: never inside a hut/house wall or roof
  if (P.taming) { camPos.x += (rand() - 0.5) * 0.07; camPos.y += (rand() - 0.5) * 0.07; }   // WP4: a bucking horse shakes the view
  camera.position.copy(camPos);
  const shk = wpnShake();                            // WPN trauma shake
  if (camBack) {                                     // SIT-r3: from the sit shot's aim back to Aro over 0.7 s
    const k = smooth01((camBack.t += dt) / 0.7);
    camera.lookAt(camBack.lk.x + (look.x - camBack.lk.x) * k, camBack.lk.y + (look.y + 0.3 - camBack.lk.y) * k, camBack.lk.z + (look.z - camBack.lk.z) * k);
    if (k >= 1) camBack = null;
  } else
  camera.lookAt(look.x, look.y + 0.3, look.z);
  if (shk) camera.rotateZ(shk * 0.03 * Math.sin(clock * 23));
}
// WPN: trauma² camera shake (offsets camera.position, never camPos); returns the strength for the roll.
function wpnShake() {
  const k = W.shakeK = settings.shake === false ? 0 : trauma * trauma;
  if (k > 0.0001) camera.position.add(_w1.set(Math.sin(clock * 37), Math.sin(clock * 41 + 1), Math.sin(clock * 29 + 2)).multiplyScalar(k * 0.12));
  return k > 0.0001 ? k : 0;
}

// ---------- FPP first person ----------
// True first person. The camera rides Aro's real eyes (head bone, smoothed: a slow base plus a scaled step residual),
// his body stays visible (head, neck, hair and eyes hidden in the colour pass only, so his whole shadow stays), steps
// come from his feet, springs give landings and take-offs weight, strafe/turn roll, sprint FOV, sway and breathing.
// Hands: a second Aro rig in the WPN viewmodel scene shows only his real arms; it grips the WPN weapons and torch,
// reaches for pickups, strokes when swimming and holds the reins. Comfort: head bob, FOV, reduce motion (Esc menu).
const FP = {
  live: false, act: false, blend: 1, lastF: -1, eyeL: null,
  bY: 0, bF: 0, bS: 0, rootY: 0,                         // slow bases of the eye offset (up, forward, side) and the ridden root height
  sy: { x: 0, v: 0 }, sp: { x: 0, v: 0 }, sr: { x: 0, v: 0 },   // springs: height (m), pitch nod (rad), roll (rad)
  roll: 0, yawR: 0, lastYaw: 0, fovS: 0, air: false, vy: 0, breathT: 0, breathOn: false,
  feet: { l: { armed: false, y: 0 }, r: { armed: false, y: 0 } }, floor: 0.12, steps: 0, lastStep: 0, own: false,
  tw: 0, back: false, turning: false, reach: null, lastShot: null, lastShotT: 1, pump: 0, swimT: 0, bodyMats: [], headMats: [],
  pos: new THREE.Vector3(), held: [], shift: new THREE.Vector3(), shifted: false,
};
const fpU = { hide: { value: 0 }, hideR: { value: 0 }, hideL: { value: 0 }, only: { value: 0 }, eye: { value: new THREE.Vector3(0, -1e4, 0) }, near: { value: 0.14 } };   // Aro's body (P) (RIDE-r4 near: where the eye fade starts)
const fpUA = { hide: { value: 0 }, hideR: { value: 0 }, hideL: { value: 0 }, only: { value: 1 }, eye: { value: new THREE.Vector3(0, -1e4, 0) }, near: { value: 0.14 } };  // the viewmodel arms rig
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3(), _fm = new THREE.Matrix4(), _fm2 = new THREE.Matrix4();
const _fq = new THREE.Quaternion(), _fq2 = new THREE.Quaternion(), _fs = new THREE.Vector3(), _fe = new THREE.Euler();
const _fBox = new THREE.Box3();   // WH: near-eye cull of carried gear while riding
const fpBob = () => (settings.fppBob ?? 0.7) * (settings.reduceMotion ? 0.25 : 1);
// FPW-r3: riding in first person the eye sat 0.72 m over the back and right above her withers, so her head was 37 degrees
// below the horizon: looking ahead showed no horse at all. Down 0.12 m (a seated eye height) and back 0.1 m, her ears
// and mane sit in the lower third and the reins run up to them.
const FPP_RIDE_EYE = { y: 0.12, b: 0.1 };
const FPP_RIDE_NEAR = 0.22;                          // RIDE-r4: extra reach of the near-eye body fade in the saddle (m; fppVm)
function fppPitchMax() { return view === 'fpp' ? (P.ride && !P.taming ? 0.72 : 1.45) : 1.25; }   // FPP-world: riding, the look down stops at the mane (past it the forearms filled the view; FHW-r4: 0.9 still gave them half the frame)
// Per-vertex mask from the skin weights: 1 head + neck, 2 right arm, 3 left arm (upper arm down to the fingers).
function fpMask(mesh) {
  const g = mesh.geometry;
  if (g.attributes.fppMask) return;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const kind = bones.map((b) => (b.name === 'Head' || b.name === 'neck_01' ? 1 : /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)_/.test(b.name) ? (b.name.endsWith('_r') ? 2 : 3) : 0));
  const m = new Float32Array(si.count);
  for (let v = 0; v < si.count; v++) {
    const acc = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) acc[kind[si.getComponent(v, k)] || 0] += sw.getComponent(v, k);
    m[v] = acc[1] > 0.35 ? 1 : acc[2] > 0.5 ? 2 : acc[3] > 0.5 ? 3 : 0;
  }
  g.setAttribute('fppMask', new THREE.BufferAttribute(m, 1));
}
function fpMaterial(mat, u, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFpHide = u.hide; sh.uniforms.uFpHideR = u.hideR; sh.uniforms.uFpHideL = u.hideL; sh.uniforms.uFpOnly = u.only; sh.uniforms.uFpEye = u.eye; sh.uniforms.uFpNear = u.near;
    sh.vertexShader = 'attribute float fppMask;\nflat varying float vFpMask;\nvarying vec3 vFpW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFpMask = fppMask;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vFpW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    // FHW-r4: in first person, Aro's own body fades out (dithered) 0.14-0.22 m from the eye. The seated riding eye sits in
    // his upper chest, so looking down the near plane sliced it flat (a beige slab across the bottom of the view), and
    // looking aside his shoulder and neck cut-out filled the frame. Colour pass only: his shadow is untouched.
    sh.fragmentShader = 'uniform float uFpHide, uFpHideR, uFpHideL, uFpOnly, uFpNear;\nuniform vec3 uFpEye;\nflat varying float vFpMask;\nvarying vec3 vFpW;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  if (uFpHide > 0.5) {
    float fpA = clamp((distance(vFpW, uFpEye) - uFpNear) / 0.08, 0.0, 1.0);
    if (fpA < 1.0 && fpA <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
  }
  if (uFpHide > 0.5 && vFpMask > 0.5 && vFpMask < 1.5) discard;
  if (uFpHideR > 0.5 && vFpMask > 1.5 && vFpMask < 2.5) discard;
  if (uFpHideL > 0.5 && vFpMask > 2.5) discard;
  if (uFpOnly > 0.5 && vFpMask < 1.5) discard;`);
  };
  mat.customProgramCacheKey = () => 'fpp-' + key;
  mat.needsUpdate = true;
}
const fpBodyOf = (h) => { let b = null; h.root.traverse((o) => { if (o.isSkinnedMesh && (!b || o.geometry.attributes.position.count > b.geometry.attributes.position.count)) b = o; }); return b; };
// Aro's body: the mask material; hair, beard, eyes and eyebrows are listed so they can stop drawing colour in first person.
(() => {
  const body = fpBodyOf(P.h);
  if (!body) return;
  fpMask(body); fpMaterial(body.material, fpU, 'aro');
  P.h.root.traverse((o) => { if (o.isSkinnedMesh && o !== body && !/^dress/.test(o.name)) FP.headMats.push(o.material); });   // ADULT-DRESS: his kilt stays drawn in first person
  P.h.root.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = true; });
  FP.ok = true;
})();
// The eye centre in the Head bone's frame, from the Eyes mesh (rigid on the head), measured once on a spare rig.
const AR = makeHuman({ hairColor: 0x3d2f26 });
const AR_BODY = fpBodyOf(AR);
(() => {
  const h = AR, b = h.bones;
  applyPose(h, samplePose(h, 'idle', 0), 1);
  h.root.updateMatrixWorld(true);
  let eyes = null; h.root.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Eyes') eyes = o; });
  const c = new THREE.Vector3();
  if (eyes) {
    const n = eyes.geometry.attributes.position.count; let k = 0;
    for (let i = 0; i < n; i += 3) { eyes.getVertexPosition(i, _fa); c.add(_fa.applyMatrix4(eyes.matrixWorld)); k++; }
    c.divideScalar(k);
  } else b.Head.localToWorld(c.set(0, 0.09, 0.1));
  FP.eyeL = b.Head.worldToLocal(c.clone());
  // the rig faces -z with its eyes at the viewmodel camera
  h.root.rotation.y = Math.PI; h.root.position.set(0, 0, 0); h.root.updateMatrixWorld(true);
  b.Head.localToWorld(c.copy(FP.eyeL)); h.root.position.sub(c); h.root.position.z -= 0.19; h.root.position.y -= 0.03;   // shoulders just behind the eye: viewmodel reach
  h.root.updateMatrixWorld(true); FP.arBase = h.root.position.clone();
  h.root.traverse((o) => { if (o.isSkinnedMesh && o !== AR_BODY) o.visible = false; });
  if (AR_BODY) { fpMask(AR_BODY); AR_BODY.material = AR_BODY.material.clone(); fpMaterial(AR_BODY.material, fpUA, 'arms'); AR_BODY.castShadow = false; }
  FP.armBase = {};
  for (const n in b) if (/^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)_/.test(n)) FP.armBase[n] = b[n].quaternion.clone();
  h.root.visible = false;
  vmScene.add(h.root);
})();
// FPP-world: hide wrist wraps (a bound strip of hide with a sinew cord wound over it) on Aro's forearms, on his body and
// on the viewmodel arms, so the forearm filling the bottom of the first-person view is not plain skin.
const WRAP_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d'), r = (a) => Math.sin(a * 12.9898) * 43758.5453 % 1;
  g.fillStyle = '#6b4a30'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 260; i++) { const x = Math.abs(r(i)) * 128, y = Math.abs(r(i + 99)) * 64, l = 30 + Math.abs(r(i + 7)) * 18; g.fillStyle = `hsla(26,35%,${l}%,0.35)`; g.fillRect(x, y, 2 + Math.abs(r(i + 3)) * 5, 1); }   // hide grain
  g.strokeStyle = 'rgba(30,18,10,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 3); g.lineTo(128, 3); g.moveTo(0, 61); g.lineTo(128, 61); g.stroke();   // rolled edges
  for (let k = -2; k < 7; k++) {                     // three turns of cord, slanting round the wrist
    const x0 = k * 24;
    g.strokeStyle = '#2e1f14'; g.lineWidth = 7; g.beginPath(); g.moveTo(x0, 64); g.lineTo(x0 + 40, 0); g.stroke();
    g.strokeStyle = '#a8865a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, 64); g.lineTo(x0 + 40, 0); g.stroke();
    g.strokeStyle = 'rgba(255,235,200,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 - 1, 64); g.lineTo(x0 + 39, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
})();
const WRAP_M = new THREE.MeshStandardMaterial({ map: WRAP_TEX, roughness: 0.92, metalness: 0 });
function wristWraps(h, shadow) {
  const out = {};
  for (const s of ['l', 'r']) {
    const la = h.bones['lowerarm_' + s], hand = h.bones['hand_' + s];
    if (!la || !hand) continue;
    const len = hand.position.length(), geo = new THREE.CylinderGeometry(0.036, 0.0405, len * 0.3, 16, 1, true);
    const m = new THREE.Mesh(geo, WRAP_M);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _fa.copy(hand.position).normalize());
    m.position.copy(hand.position).multiplyScalar(0.8);
    m.castShadow = shadow; m.receiveShadow = shadow; m.frustumCulled = false; m.name = 'wristWrap';
    la.add(m); out[s] = m;
  }
  return out;
}
const FP_WRAP = { body: wristWraps(P.h, true), arms: wristWraps(AR, false) };
// The WPN box fists and forearms give way to the real arms (the weapons, torch and glow stay on the vmR / vmL groups).
for (const g of [vmR, vmL]) for (let i = 0; i < 3; i++) if (g.children[i]?.isMesh && !g.children[i].userData.kind) g.children[i].visible = false;
// Torch in first person: dimmer fire light and glow, a darker shaft, held lower and further out.
(() => { const sh = vmTorch.root.children[0]; if (sh?.isMesh) { sh.material = sh.material.clone(); sh.material.color.multiplyScalar(0.42); } vmTorch.flame.scale.setScalar(0.78); vmTorch.root.scale.setScalar(0.74); vmAxe.scale.setScalar(0.86); })();   // FPP-world: a smaller torch, the flame in the lower-left third
// Reins: two thin straps from the fists to the bridle, drawn in the viewmodel scene.
// RIDE-r3: where each first-person rein meets her head, from the Head bone (at the poll): out to its side, down, and back
// toward the rider (metres; - = forward). Ahead of the poll the strap runs the full neck, along its side, to the jaw.
const FPP_REIN = { side: 0.11, down: 0, back: -0.16 };
const fpRein = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 })); m.visible = false; vmScene.add(m); return m; });
const fitMat = (kind, slot) => { const f = FIT[kind]?.[slot]; if (!f) return null; return new THREE.Matrix4().compose(new THREE.Vector3(...f.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.r)), new THREE.Vector3(f.s ?? 1, f.s ?? 1, f.s ?? 1)); };
const FPI = { spear: fitMat('spear', 'hand')?.invert(), axe: fitMat('axe', 'hand')?.invert(), torch: fitMat('torch', 'handL')?.invert() };

// ----- settings rows (Esc menu): head bob, field of view, reduce motion
(() => {
  const bob = $('opt-bob'), fov = $('opt-fov'), rm = $('opt-rm');
  if (!bob || !fov || !rm) return;
  const show = () => { $('opt-bob-v').textContent = Math.round((settings.fppBob ?? 0.7) * 100) + '%'; $('opt-fov-v').textContent = (settings.fov ?? 60) + '°'; };
  bob.value = settings.fppBob ?? 0.7; fov.value = settings.fov ?? 60; rm.checked = !!settings.reduceMotion; show();
  bob.oninput = () => { settings.fppBob = +bob.value; show(); saveSettings(); };
  fov.oninput = () => { settings.fov = +fov.value; show(); saveSettings(); };
  rm.onchange = () => { settings.reduceMotion = rm.checked; saveSettings(); };
})();
// FOV target for both views: the base setting, a sprint widening (eased), WPN aim zoom and the throw punch.
function fppFovT(dt = 0.016) {
  const base = settings.fov ?? 60, rm = !!settings.reduceMotion;
  const sprint = rm || W.aim || P.ride ? 0 : 6 * clamp((P.speed - 3.3) / 3.3, 0, 1);
  FP.fovS += (sprint - FP.fovS) * Math.min(1, dt * 5);
  return (base + FP.fovS) * (1 - W.camK) + (base - 10) * W.camK + (W.punch > 0 && !rm ? 3 : 0);
}

// ----- body: facing, backward walking, spine twist toward the view and a neck/chest bend when looking down
function fppFace(dt, moving, dx, dz) {
  const cf = camFace();
  P.h.back = false;
  fpSpace();
  if (P.sit > 0 || P.work > 0 || P.dance > 0 || P.rest > 0) { FP.tw = 0; return P.face; }
  if (W.aim || W.st !== 'sheathed' || P.cool > 0 || P.swim || P.air) { FP.tw = 0; FP.turning = false; return cf; }
  let f = Number.isFinite(P.face) ? P.face : cf;
  if (moving) {
    let rel = wrapA(Math.atan2(dx, dz) - cf);
    FP.back = Math.abs(rel) > 1.95;                    // walking backwards: the legs face the view and the clip runs in reverse
    if (FP.back) rel = wrapA(rel + Math.PI);
    f = turn(f, cf + clamp(rel, -0.9, 0.9), Math.min(1, dt * 10));   // legs up to ~50 degrees off the view
    P.h.back = FP.back; FP.turning = false;
  } else {                                             // standing: keep the feet within 45 degrees, then turn in place
    const d = wrapA(cf - f);
    if (Math.abs(d) > 0.785) FP.turning = true;
    if (FP.turning) { f += Math.sign(d) * Math.min(Math.abs(d), 6 * dt); if (Math.abs(wrapA(cf - f)) < 0.05) FP.turning = false; }
  }
  FP.tw = clamp(wrapA(cf - f), -1.4, 1.4);
  return f;
}
// Personal space in first person: Aro is kept 0.55 m from Sena and the villagers when they stand free (not seated,
// riding, in bed or in a scripted moment), so the camera is never inside someone's head.
function fpSpace() {
  if (busy || camShot || P.ride || P.sit > 0 || P.rest > 0 || P.seat || P.downed > 0) return;
  for (const o of [N, ...villagers]) {
    if (!o?.pos || o.ride || o.sit > 0 || o.rest > 0 || o.seat || o.downed > 0 || o.indoor) continue;
    const ddx = P.pos.x - o.pos.x, ddz = P.pos.z - o.pos.z, d = Math.hypot(ddx, ddz);
    if (d < 0.55 && d > 1e-4) { P.pos.x = o.pos.x + (ddx / d) * 0.55; P.pos.z = o.pos.z + (ddz / d) * 0.55; }
  }
}
function fpTwist(b, tw) {
  if (Math.abs(tw) > 0.001) for (const [n, k] of [['spine_01', 0.3], ['spine_02', 0.3], ['spine_03', 0.4]]) {
    const bn = b[n]; bn.parent.getWorldQuaternion(_fq).invert(); _fa.set(0, 1, 0).applyQuaternion(_fq);
    bn.quaternion.premultiply(_fq2.setFromAxisAngle(_fa, tw * k)); bn.updateMatrixWorld(true);
  }
}
// FHW-r4: riding, the twist goes on after the rider pose (order 29), which sets the spine outright and wiped it
P.h.addOverride('fppRide', 33, (h) => { if (FP.act && P.ride) fpTwist(h.bones, FP.tw); });
P.h.addOverride('fpp', 12, (h) => {
  if (!FP.act) return;
  const b = h.bones, tw = FP.tw, bend = clamp((camPitch - 0.4) * 0.24, 0, 0.25);
  if (!P.ride) fpTwist(b, tw);
  if (bend > 0.001) {
    const cf = camFace(); _fb.set(Math.cos(cf), 0, -Math.sin(cf));   // the view's left axis: a positive turn about it bends forward
    for (const [n, k] of [['spine_03', 0.4], ['neck_01', 0.6]]) {
      const bn = b[n]; bn.parent.getWorldQuaternion(_fq).invert(); _fa.copy(_fb).applyQuaternion(_fq);
      bn.quaternion.premultiply(_fq2.setFromAxisAngle(_fa, bend * k)); bn.updateMatrixWorld(true);
    }
  }
});

// ----- footsteps from the feet (both views): a foot that comes back down to the floor while moving is a step
function fppFeet(dt) {
  const h = P.h, b = h.bones;
  FP.own = !!(FP.ok && b.foot_l && !P.ride && !P.swim && !(P.rest > 0));
  if (!FP.own) return;
  const ry = h.root.position.y, yl = b.foot_l.getWorldPosition(_fa).y - ry, yr = b.foot_r.getWorldPosition(_fa).y - ry;
  FP.floor = Math.min(FP.floor + dt * 0.08, yl, yr);
  const moving = P.speed > 0.4 && !P.air && !(P.sit > 0) && !(P.work > 0);
  for (const [k, y] of [['l', yl], ['r', yr]]) {          // contact: the foot stops going down near the floor (frame-rate proof)
    const f = FP.feet[k], down = y < f.y - 0.001;
    if (y > FP.floor + 0.1) f.armed = true;
    if (f.armed && ((f.down && !down && f.y < FP.floor + 0.08) || y < FP.floor + 0.02)) {
      f.armed = false;
      if (moving && clock - FP.lastStep > 0.16) { FP.lastStep = clock; FP.steps++; fppStep(k === 'l' ? -1 : 1); }
    }
    f.down = down; f.y = y;
  }
}
function fppStep(side) {
  const sneak = P.sneak, sprint = P.speed > 5.6, path = structs.some((s) => s.kind === 'path' && s.rise >= 1 && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 1.2);
  const k = (sneak ? 0.4 : sprint ? 1.6 : 1) * (path ? 1.3 : 1);
  A.hit(P.pos.y < 0.1 ? 900 : path ? 420 + rand() * 120 : 170 + rand() * 90, 0.08, Math.min(0.2, (sneak ? 0.04 : 0.13) * (sprint ? 1.25 : 1) * (path ? 1.2 : 1)));
  if (view !== 'fpp') return;
  const bk = fpBob();
  FP.sy.v -= 0.012 * k * bk * 21;                        // a small dip on every footfall (peak ~ the kick in metres)
  FP.sr.v += side * 0.0052 * k * bk * 21 * (settings.reduceMotion ? 0 : 1);   // 0.3 degrees toward that foot
}
// ----- the first-person camera. Returns true when it placed the camera (first person), false in third person.
const SPR = (s, dt, k = 60) => { const c = 2 * Math.sqrt(k); s.v += (-k * s.x - c * s.v) * dt; s.x += s.v * dt; };
function fppCamera(dt) {
  if (playing) fppFeet(dt);
  if (view !== 'fpp' || !FP.ok) { FP.live = false; FP.act = false; P.h.back = false; return false; }
  const h = P.h, b = h.bones, rm = !!settings.reduceMotion, bk = fpBob();
  h.root.visible = true;
  h.root.updateMatrixWorld(true);
  const ref = h.root.position, face = h.root.rotation.y, sf = Math.sin(face), cf = Math.cos(face);
  const eye = b.Head.localToWorld(_fa.copy(FP.eyeL));
  const rx = eye.x - ref.x, rz = eye.z - ref.z, ry = eye.y - ref.y;
  let fw = rx * sf + rz * cf, sd = rx * cf - rz * sf;
  const fresh = !FP.live;
  if (fresh) { FP.bY = ry; FP.bF = fw; FP.bS = sd; FP.rootY = ref.y; FP.blend = 0; FP.lastYaw = camYaw; FP.air = !!P.air; FP.sy.x = FP.sy.v = FP.sp.x = FP.sp.v = FP.sr.x = FP.sr.v = 0; FP.roll = FP.yawR = 0; }
  FP.live = true; FP.act = true;
  // slow bases (1.5/s) so the gait's head swing stays out of them; big changes (crouch, sit, kneel) ease in at up to 7/s
  const kb = (e) => 1 - Math.exp(-dt * (1.5 + Math.min(5.5, Math.max(0, e - 0.08) * 40)));
  FP.bY += (ry - FP.bY) * kb(Math.abs(ry - FP.bY)); FP.bF += (fw - FP.bF) * kb(Math.abs(fw - FP.bF)); FP.bS += (sd - FP.bS) * kb(Math.abs(sd - FP.bS));
  let y = FP.bY + clamp((ry - FP.bY) * 0.24, -0.05, 0.05) * bk;   // the slow base (crouch, sit, kneel ease) plus a scaled step bob
  fw = FP.bF + (fw - FP.bF) * 0.7;
  sd = FP.bS + (sd - FP.bS) * 0.5 * bk;                          // the figure-8: side sway of the head, scaled
  const hr = Math.hypot(fw, sd), lim = P.ride ? 0.6 : 0.24;      // keep the eye inside Aro's collision circle
  if (hr > lim) { fw *= lim / hr; sd *= lim / hr; }
  if (P.ride && !P.taming) { const w = smooth01(((P.rideW ?? 1) - 0.4) / 0.5); y -= FPP_RIDE_EYE.y * w; fw -= FPP_RIDE_EYE.b * w; }   // FPW-r3: a seated eye, a little lower and back
  // swimming: eye just above the water line, a slow stroke bob and a little roll
  let swimRoll = 0;
  if (P.swim) {
    FP.swimT += dt * Math.min(1, P.speed / 1.5 + 0.35);
    const ph = (FP.swimT / 1.333) * Math.PI * 2;
    y = SWIM_Y + 0.28 - ref.y + Math.sin(ph) * 0.04 * bk; swimRoll = Math.sin(ph * 0.5) * 0.0175 * (rm ? 0 : 1);
    fw = 0.12; sd = 0;
  }
  // the drawn body slides under the camera (horizontally, at most 22 cm) when the eye is pulled in by the clamp or the
  // smoothing: in the jog/sprint lean the real head is up to 15 cm ahead, which put the camera inside the neck and shoulders
  { const ox = fw * sf + sd * cf - rx, oz = fw * cf - sd * sf - rz, ol = Math.hypot(ox, oz), om = P.ride ? 0 : Math.min(1, 0.22 / Math.max(ol, 1e-6));
    FP.shift.set(ox * om, 0, oz * om); }
  // ridden root: follow the saddle closely but take the edge off the gallop's jolts
  let rootY = ref.y;
  if (P.ride) { FP.rootY += (ref.y - FP.rootY) * (1 - Math.exp(-dt * 14)); rootY = FP.rootY; } else FP.rootY = ref.y;
  // jumps and landings
  if (P.air) FP.vy = P.vy;
  if (!FP.air && P.air && P.vy > 0) { FP.sy.v -= 0.02 * 21 * (rm ? 0.3 : 1); }
  if (FP.air && !P.air) {
    const lk = rm ? 0.3 : Math.min(1.3, 0.3 + (settings.fppBob ?? 0.7) * 0.85);
    FP.sy.v -= clamp(Math.abs(FP.vy) * 0.012, 0.03, 0.12) * lk * 21; FP.sp.v += 0.026 * lk * 21;
  }
  FP.air = !!P.air;
  SPR(FP.sy, dt); SPR(FP.sp, dt); SPR(FP.sr, dt, 40);
  // strafe and turn roll, sprint sway, breathing
  const yr = wrapA(camYaw - FP.lastYaw) / Math.max(dt, 1e-3); FP.lastYaw = camYaw;
  FP.yawR += (yr - FP.yawR) * Math.min(1, dt * 8);
  const side = P.vx * Math.cos(camYaw) - P.vz * Math.sin(camYaw);
  const rollT = rm || P.ride ? 0 : -(side / 6.6) * 0.026 + clamp(FP.yawR / 3, -1, 1) * 0.014;
  FP.roll += (rollT - FP.roll) * Math.min(1, dt * 6);
  const t = clock, still = 1 - Math.min(1, P.speed / 1.5), tired = (P.tired || S.stam < 25) && !P.ride && !P.swim;
  const br = tired ? Math.sin(t * Math.PI * 2 * 0.6) : Math.sin(t * Math.PI * 2 * 0.25);
  const breathY = (tired ? 0.02 : 0.006 * still) * br * (rm ? 0.5 : 1), breathP = (tired ? 0.006 : 0.0026 * still) * br;
  if (tired && br > 0.9 && !FP.breathOn && playing && !paused) { FP.breathOn = true; A.hit(520 + rand() * 80, 0.5, 0.03); } else if (br < 0) FP.breathOn = false;
  const sway = !rm && P.speed > 5 && !P.ride ? 0.0044 * Math.min(1, (P.speed - 5) / 1.5) : 0;
  const swP = sway * (Math.sin(t * 9.42) * 0.6 + Math.sin(t * 5.1 + 1) * 0.4), swY = sway * (Math.sin(t * 7.3 + 2) * 0.6 + Math.sin(t * 3.7) * 0.4);
  // riding: the head nods with the gait (the saddle's up/down)
  const nod = P.ride && !rm ? clamp((FP.rootY - ref.y) * 0.5, -0.05, 0.05) : 0;
  // the eye, plus 6 cm along the view so the near plane never shows the inside of the head
  const pitch = camPitch + FP.sp.x + breathP + swP + nod, yaw = camYaw + swY, cp = Math.cos(pitch);
  const dxv = -Math.sin(yaw) * cp, dyv = -Math.sin(pitch), dzv = -Math.cos(yaw) * cp;
  const p = FP.pos.set(ref.x + fw * sf + sd * cf, rootY + y + FP.sy.x + breathY, ref.z + fw * cf - sd * sf).add(_fb.set(dxv, dyv, dzv).multiplyScalar(0.06));
  // never inside the terrain or a wall
  if (!P.swim) p.y = Math.max(p.y, getHeight(p.x, p.z) + 0.25);
  fppWalls(p);
  if (FP.blend < 1) { FP.blend = Math.min(1, FP.blend + dt / 0.3); p.lerpVectors(camPos, p, smooth01(FP.blend)); }
  camPos.copy(p);
  const fovT = fppFovT(dt);
  if (Math.abs(camera.fov - fovT) > 0.02) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * (W.camK > 0.01 || W.punch > 0 ? 14 : 5)); camera.updateProjectionMatrix(); }
  camera.position.copy(p);
  const shk = wpnShake();                              // WPN trauma shake
  camera.lookAt(p.x + dxv, p.y + dyv, p.z + dzv);
  const roll = clamp(FP.roll + FP.sr.x + swimRoll, -0.035, 0.035) + (shk ? shk * 0.03 * Math.sin(clock * 23) : 0);
  if (roll) camera.rotateZ(roll);
  return true;
}
// House walls: the camera is pushed out of any wall slab it gets into (local frame, grown by 0.12 m).
const HOUSE_SLABS = [[0, -2.46, 3.2, 0.14], [-3.06, -1.8, 0.14, 0.8], [-3.06, 1.8, 0.14, 0.8], [-3.06, 0, 0.14, 1.0, 'mid'], [3.06, 0, 0.14, 2.6], [-2.05, 2.46, 1.15, 0.14], [2.05, 2.46, 1.15, 0.14]];
function fppWalls(p) {
  for (const s of structs) {
    if (s.kind !== 'house' || s.rise < 0.3 || Math.abs(s.x - p.x) > 8 || Math.abs(s.z - p.z) > 8) continue;
    const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0), dx = p.x - s.x, dz = p.z - s.z;
    let lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const ly = p.y - s.group.position.y;
    if (ly > 3.1) continue;
    const open = s === homeHouse() && S.home?.nursery;
    for (const [cx, cz, hx, hz, tag] of HOUSE_SLABS) {
      if (tag === 'mid' && (open && ly < 2.25)) continue;
      const g = 0.12, ox = hx + g - Math.abs(lx - cx), oz = hz + g - Math.abs(lz - cz);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) lx += Math.sign(lx - cx || 1) * ox; else lz += Math.sign(lz - cz || 1) * oz;
    }
    p.x = s.x + lx * c + lz * sn; p.z = s.z - lx * sn + lz * c;
  }
}
// House wall colliders (both views): small circles just outside the walls where the main circle does not reach,
// so the corners can no longer be walked into. They switch off with the house circle (walking in, indoors).
function fppHouseCols(st) {
  const pts = [], R0 = st.radius * 0.8;
  const add = (x, z) => { if (Math.hypot(x, z) < R0 - 0.25) return; pts.push([x, z]); };
  for (let x = -3.3; x <= 3.31; x += 0.5) { add(x, -2.7); if (Math.abs(x) > 1.0) add(x, 2.7); }
  for (let z = -2.2; z <= 2.21; z += 0.5) { add(3.3, z); if (Math.abs(z) > 1.75) add(-3.3, z); }
  for (const [x, z] of [[3.3, 2.7], [-3.3, 2.7], [3.3, -2.7], [-3.3, -2.7]]) add(x, z);
  st.fpCols = pts.map(([lx, lz]) => { const w = toWorld(st, [lx, 0, lz]); return addCollider({ x: w.x, z: w.z, r: 0.3 }); });
}
// ----- the arms rig in the viewmodel scene
const fpArmQ = { r: new THREE.Quaternion(), l: new THREE.Quaternion() };
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _h3 = new THREE.Vector3(), _hm = new THREE.Matrix4(), FP_UP = new THREE.Vector3(0, 1, 0);
// A hand orientation (viewmodel camera space) from where the fingers point and where the palm faces. Hand bone frame:
// y runs along the fingers, the palm faces -x on the right hand and +x on the left, z = x cross y.
function fpHandBasis(side, fx, fy, fz, px, py, pz) {
  const y = _h1.set(fx, fy, fz).normalize(), xs = side === 'r' ? -1 : 1;
  const x = _h2.set(px, py, pz).normalize().multiplyScalar(xs);
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = _h3.crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(_hm.makeBasis(x, y, z));
}
function fpArm(side, pos, q, w = 1, fist = 1) {
  const b = AR.bones, s = side, hand = b['hand_' + s], la = b['lowerarm_' + s];
  ik2(AR, s, pos, _fc.set(s === 'r' ? 0.7 : -0.7, -1.2, 0.35), w);
  hand.parent.getWorldQuaternion(_fq).invert();
  hand.quaternion.slerp(_fq.multiply(q), w);
  // share the wrist roll with the forearm (no candy-wrapper twist)
  _fa.copy(hand.position).normalize();
  const hq = hand.quaternion, d = hq.x * _fa.x + hq.y * _fa.y + hq.z * _fa.z;
  _fq2.set(_fa.x * d, _fa.y * d, _fa.z * d, hq.w).normalize();
  const tw = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), _fq2, 0.6 * w);
  la.quaternion.multiply(tw); hand.quaternion.premultiply(tw.invert());
  la.updateMatrixWorld(true);
  if (fist > 0) applyPose(AR, s === 'r' ? AR.fist.r : AR.fist.l, fist * w);
}
// hand pose from a held thing: hand = thing * FIT^-1 (the same fit the third-person body uses)
function fpFromHeld(obj, inv, outP, outQ) {
  obj.updateWorldMatrix(true, false);
  _fm2.multiplyMatrices(obj.matrixWorld, inv).decompose(outP, outQ, _fs);
}
const fpTmp = { p: new THREE.Vector3(), q: new THREE.Quaternion(), p2: new THREE.Vector3(), q2: new THREE.Quaternion() };
// FPP-world: the two-handed spear hold (viewmodel camera space). Both fists are on screen: the right one low at the
// bottom-right, the left one d m up the shaft just below the centre; the shaft rises forward and across to the left, so
// the flint head shows side-on up and left of the crosshair (pointing straight at it, the head read as a blunt dot and
// the right fist sat at the camera plane, out of view). In this hold the arms rig steps forward (arm.z) so the left
// arm reaches its grip with a natural bend.
// FPW-r3: the torch fist sat at x -0.28 (about 17% from the left edge): at 1280x720 the 240 px map and stats panel
// covered it and the shaft ran into the panel. Now the fist sits ~27% in from the left, low, with the flame above it.
const FPP_TORCH = { x: 0.025, y: 0.015, z: -0.05 };
// FHW-r4: the hold moved out of the HUD's way and turned the head side-on. The right fist sits right of the pack's
// column (~80% across, ~80% down) and a little further out (smaller on screen); the hands take the shaft 0.5 m further
// up (s: the spear slides back through them, the butt runs off past the camera), so the head is 0.85 m from the fist,
// not 1.35 m, and the shaft runs more across the view: the blade shows its face up and left of the crosshair instead
// of its base (which read as a black hexagonal nut). The arms rig steps further forward (arm) to reach the grips.
const FP_SPR = { r: new THREE.Vector3(0.27, -0.18, -0.44), d: 0.3, arm: 0.3, s: 0.5 };
FP_SPR.q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-0.1, 0.1, -1).normalize(), new THREE.Vector3(-0.72, 0.36, -0.59).normalize());
FP_SPR.p0 = vmSpear.position.clone();                                          // the one-handed hold (vmHold)
FP_SPR.z = new THREE.Vector3(0, 0, 1).applyQuaternion(vmSpear.quaternion);      // the shaft's axis in the fist's frame
// FHW-r4: the viewmodel spear's head is a knapped blade: a flat leaf with a ridged diamond section, a sharp point and
// paler, thinner edges (flat-shaded facets), turned each frame so its face is toward the eye. The shared 6-sided cone
// stays on the third-person spears.
const VM_BLADE = (() => {
  const prof = [[0.013, 0], [0.03, 0.03], [0.042, 0.07], [0.044, 0.11], [0.036, 0.16], [0.022, 0.21], [0.008, 0.25], [0, 0.27]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 4);
  g.scale(1, 1, 0.3); g.rotateX(Math.PI / 2);                                   // length along +z, wide along x, thin along y
  const p = g.attributes.position, col = new Float32Array(p.count * 3), core = new THREE.Color(0x3e3833), edge = new THREE.Color(0x9a8a76), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(core).lerp(edge, Math.pow(Math.min(1, Math.abs(p.getX(i)) / 0.044), 1.6)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const flint = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.34, metalness: 0.04 });
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, color: 0xd8d2ca });
  const m = new THREE.Mesh(g, flint); m.position.z = 0.9; m.frustumCulled = false; m.userData.mats = { flint, stone };
  vmSpear.children[1].visible = false; vmSpear.add(m);
  const set = vmSpear.userData.setFlint;
  vmSpear.userData.setFlint = (on) => { set(on); vmSpear.children[1].visible = false; m.material = on ? flint : stone; };
  m.material = vmSpear.userData.flint ? flint : stone;
  return m;
})();
const _fz = new THREE.Vector3();
function fpBladeFace() {                             // roll the blade about the shaft so its flat face looks at the eye
  if (!vmSpear.visible) return;
  vmSpear.updateWorldMatrix(true, false);
  const c = vmSpear.worldToLocal(_fz.copy(vmCam.position));
  VM_BLADE.rotation.z = Math.atan2(-c.x, c.y);
}
function fppVm(dt) {
  // house wall circles follow the house circle on/off (RST walks in through the door, indoors)
  for (const s of structs) if (s.fpCols && s.col) for (const c of s.fpCols) c.off = !!s.col.off;
  const on = FP.act && view === 'fpp' && playing && !camShot;
  FP.act = on;
  if (on && camPitch > fppPitchMax()) camPitch = Math.max(fppPitchMax(), camPitch - 0.04);   // FPP-world: mounting while looking down eases up to the riding limit
  if (!on) FP.live = false;
  if (on && !FP.shifted) { P.h.root.position.add(FP.shift); FP.shifted = true; }   // body under the camera for this frame's render (fppPost undoes it)
  // Aro's head, neck, hair and eyes stop drawing colour; the shadow pass still has all of him
  fpU.hide.value = on ? 1 : 0;
  fpU.eye.value.copy(camera.position);               // FHW-r4: the near-eye body fade centre (camera placed by fppCamera this frame)
  // RIDE-r4: the seated riding eye is inside his upper chest: looking 60+ degrees aside, his own shoulder and trapezius
  // (0.15-0.35 m off) filled the lower half of the view as huge clipped polygons. In the saddle the fade reaches further
  // out (the reins' arms are the viewmodel's; his thighs and knees, 0.6 m+ away, still show looking down).
  fpU.near.value = 0.14 + (on && P.ride && !P.taming ? FPP_RIDE_NEAR * smooth01(((P.rideW ?? 1) - 0.4) / 0.5) : 0);
  for (const m of FP.headMats) { m.colorWrite = !on; m.depthWrite = !on; }
  const near = on ? 0.06 : 0.15;
  if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
  // torch: lower and further out, dimmer light and glow
  if (vmL.visible && torchOn && !(W.held === 'fists' && W.st !== 'sheathed')) vmL.position.add(_fa.set(FPP_TORCH.x, FPP_TORCH.y, FPP_TORCH.z));   // FPP-world: lower; the fist ~40% up the shaft stays in view (FPW-r3: in from the edge, clear of the map panel)
  vmFire.intensity *= 0.5;
  if (FP.act && AR_BODY) { if (vmR.visible) vmR.position.y += 0.035; if (vmL.visible && !torchOn) vmL.position.y += 0.035; }   // real hands: a little higher so the wrist shows
  if (torchOn) vmGlow.material.opacity = 0.28 + Math.sin(clock * 17) * 0.05;
  vmR.visible = !!vmR.visible; vmL.visible = !!vmL.visible;   // wpnVm can leave null (camShot null), which three.js draws as visible
  // which hands does the viewmodel need?
  let R = null, L = null;
  const p = fpTmp, sw = P.h.shotKey(), st = P.h.shotT();
  if (on && sw && /^(use|pick)/.test(sw) && (sw !== FP.lastShot || st < FP.lastShotT - 0.2) && !P.ride && !P.swim) {
    // reach toward the ground 0.8 m in front (where the thing was), mapped onto the viewmodel camera at arm's length
    const fw = camFace(), gx = P.pos.x + Math.sin(fw) * 1.2, gz = P.pos.z + Math.cos(fw) * 1.2;
    const ndc = _fa.set(gx, getHeight(gx, gz) + 0.05, gz).project(camera), tv = Math.tan((vmCam.fov * Math.PI) / 360), d = 0.46;
    const to = new THREE.Vector3(clamp(ndc.x, -0.5, 0.5) * tv * vmCam.aspect * d, clamp(ndc.y, -0.45, 0.3) * tv * d, -d);
    FP.reach = { t: 0, side: vmR.visible ? (vmL.visible ? null : 'l') : 'r', to };
  }
  FP.lastShot = sw; FP.lastShotT = st;
  if (FP.reach && (!FP.reach.side || (FP.reach.t += dt) > 0.65 || !on)) FP.reach = null;
  // FPP-world: the spear is held in both hands, like the third-person stance. The right fist drops back toward the hip,
  // the shaft runs up and forward past the crosshair, and the left fist takes it 0.42 m further up (FIT front grip).
  // Off while aiming or throwing, with the torch lit, mid draw and at a sprint (one hand, as the body does).
  const two = on && vmR.visible && W.held === 'spear' && !torchOn && W.sw?.k !== 'throw' && !P.ride && !P.swim;
  FP.twoW = (FP.twoW || 0) + ((two ? W.vmDraw * (1 - W.aimW) * (1 - smooth01((P.speed - 5) / 1.2)) : 0) - (FP.twoW || 0)) * Math.min(1, dt * 10);
  const slide = FP.twoW > 0.01 && vmR.visible && vmSpear.visible ? FP_SPR.s * FP.twoW : 0;   // FHW-r4: how far up the shaft the hands are
  vmSpear.position.copy(FP_SPR.p0).addScaledVector(FP_SPR.z, -slide);
  vmSpear.children[3].position.z = -0.35 + slide;    // the hide grip wrap stays under the right fist
  if (FP.twoW > 0.01 && vmR.visible && vmSpear.visible) {
    const w = FP.twoW;
    vmR.position.add(_fa.copy(FP_SPR.r).sub(VM.r).multiplyScalar(w));
    vmR.quaternion.slerp(FP_SPR.q, w);
  }
  if (on) fpBladeFace();
  if (on) {
    if (vmR.visible) {
      const k = W.held || (W.aim || W.sw?.k === 'throw' ? 'spear' : 'fists'); fpFromHeld(k === 'spear' ? vmSpear : vmAxe, k === 'spear' ? FPI.spear : FPI.axe, p.p, p.q);
      if (k === 'spear' && slide) p.p.add(_fa.set(0, 0, 1).transformDirection(vmSpear.matrixWorld).multiplyScalar(slide));   // FHW-r4: the fist stays put, the shaft slid back through it
      R = [p.p.clone(), p.q.clone(), 1];
    }
    if (!vmL.visible && R && FP.twoW > 0.01 && vmSpear.visible) {   // FPP-world: the left fist on the shaft
      vmSpear.updateWorldMatrix(true, false);
      const grip = vmSpear.localToWorld(_fb.set(0, 0, -0.35 + FP_SPR.d + slide)), ax = _fc.set(0, 0, 1).transformDirection(vmSpear.matrixWorld);
      const fi = _fa.set(0, 1, 0).applyQuaternion(R[1]), pa = _h3.set(-1, 0, 0).applyQuaternion(R[1]);
      const q = fpHandBasis('l', -fi.x, fi.y, fi.z, -pa.x, pa.y, pa.z);   // the right fist mirrored ...
      q.premultiply(_fq2.setFromUnitVectors(_fa.copy(AX_L).applyQuaternion(q), ax));   // ... turned so the shaft runs through it
      const sc = AR.bones.hand_l.getWorldScale(_h2).x;
      L = [grip.clone().sub(_fa.copy(GRIP_L).multiplyScalar(sc).applyQuaternion(q)), q, FP.twoW]; FP.gripL = grip.clone();
    }
    if (vmL.visible) {
      if (torchOn) { fpFromHeld(vmTorch.root, FPI.torch, p.p2, p.q2); p.p2.add(_fa.set(0, 0, 1).transformDirection(vmTorch.root.matrixWorld).multiplyScalar(0.09)); L = [p.p2.clone(), p.q2.clone(), 1]; }   // FPP-world: the fist slides up to ~40% of the shaft (vmHold), not its butt
      else if (R) {                                      // fists guard: the left fist mirrors the right one (knuckles forward, palm in)
        vmL.updateWorldMatrix(true, false); vmR.updateWorldMatrix(true, false);
        const o = _fb.copy(R[0]).sub(_fa.setFromMatrixPosition(vmR.matrixWorld)), fi = _fc.set(0, 1, 0).applyQuaternion(R[1]), pa = _fa.set(-1, 0, 0).applyQuaternion(R[1]);
        const q = fpHandBasis('l', -fi.x, fi.y, fi.z, -pa.x, pa.y, pa.z);
        L = [_fa.setFromMatrixPosition(vmL.matrixWorld).add(o.set(-o.x, o.y, o.z)).clone(), q, 1];
      } else { vmL.updateWorldMatrix(true, false); _fa.setFromMatrixPosition(vmL.matrixWorld); L = [_fa.clone().add(_fb.set(0.02, -0.06, 0.02)), fpHandBasis('l', 0.3, 0.5, -0.8, 0.7, 0, 0.3), 1]; }   // FPP: L only without R
    }
    if (FP.reach) {                                      // out 0.25 s, hold 0.1 s, back 0.3 s
      const r = FP.reach, u = r.t < 0.25 ? smooth01(r.t / 0.25) : r.t < 0.35 ? 1 : 1 - smooth01((r.t - 0.35) / 0.3), sx = r.side === 'r' ? 1 : -1;
      const pos = new THREE.Vector3(sx * 0.26, -0.42, -0.16).lerp(r.to || _fa.set(sx * 0.05, -0.13, -0.43), u);
      const q = fpHandBasis(r.side, -sx * 0.15, -0.35, -1, 0, -1, 0);
      const hold = [pos, q, 1, r.t > 0.22 ? 1 : 0.15];
      if (r.side === 'r') R = hold; else L = hold;
    }
    if (P.ride && !P.taming) {                           // reins: two fists above the withers (fixed to the horse, not the view)
      const qRel = new THREE.Quaternion().copy(camera.quaternion).invert().multiply(_fq2.setFromEuler(_fe.set(0, P.face + Math.PI, 0)));
      const k = Math.tan((vmCam.fov * Math.PI) / 360) / Math.tan((camera.fov * Math.PI) / 360);   // same spot on screen in the viewmodel camera
      const hand = (sx) => { const c = new THREE.Vector3(sx * 0.225, -0.48   /* FHW-r4: 0.45 m apart (was 0.34): looking level, the E prompt sits between the fists, not on them */ + FPP_RIDE_EYE.y * 0.6, -0.36 - FPP_RIDE_EYE.b).applyQuaternion(qRel); c.x *= k; c.y *= k; return c; };   // WH: apart and low over the withers (FPW-r3: the same spot over the withers from the lower, further-back eye; RIDE-r3: 3 cm lower, 2 cm nearer: more neck between fists and ears)
      const fistQ = (s) => { const sx = s === 'r' ? 1 : -1, f = _fa.set(-sx * 0.5, 0.1, -0.85).applyQuaternion(qRel), p = _fb.set(-sx, 0.15, 0.2).applyQuaternion(qRel); return fpHandBasis(s, f.x, f.y, f.z, p.x, p.y, p.z); };
      if (!R) R = [hand(1), fistQ('r'), 1];
      if (!L) L = [hand(-1), fistQ('l'), 1];
    }
    if (P.swim && FP.swimHands) {                        // breaststroke on the 1.333 s cycle (off: hands drawn over the water read as fake)
      const ph = ((FP.swimT / 1.333) % 1 + 1) % 1, mv = Math.min(1, P.speed / 1.2 + 0.25);
      const key = [[0, 0.12, -0.36, -0.32], [0.35, 0.07, -0.26, -0.62], [0.55, 0.5, -0.3, -0.5], [0.8, 0.2, -0.42, -0.2], [1, 0.12, -0.36, -0.32]];   // hands glimpse at the bottom: glide out, sweep wide, draw in
      let i = 0; while (i < key.length - 2 && ph > key[i + 1][0]) i++;
      const a = key[i], c = key[i + 1], u = smooth01((ph - a[0]) / (c[0] - a[0]));
      const x = lerp(a[1], c[1], u), yy = lerp(a[2], c[2], u) - 0.02 * (1 - mv), z = lerp(a[3], c[3], u) * mv + -0.3 * (1 - mv);
      const out = clamp((x - 0.1) / 0.32, 0, 1);
      for (const s of ['r', 'l']) {
        const sx = s === 'r' ? 1 : -1, q = fpHandBasis(s, sx * (0.1 + out * 0.4), -0.15, -1, sx * out * 0.8, -1, 0);
        const v = [new THREE.Vector3(sx * x, yy, z), q, 1, 0];
        if (s === 'r') R = v; else L = v;
      }
    }
    if (!R && !L && P.speed > 5.6 && !P.air && !P.ride && !P.swim && W.st === 'sheathed') {   // sprint: fists pump up into the bottom of the view
      const bb = P.h.bones, F = P.face;                  // in step with the body's own arm swing (hand ahead of the chest = up in view)
      for (const s of ['r', 'l']) {
        bb['hand_' + s].getWorldPosition(_fa).sub(bb.spine_03.getWorldPosition(_fb));
        const sx = s === 'r' ? 1 : -1, up = smooth01(clamp((_fa.x * Math.sin(F) + _fa.z * Math.cos(F) - 0.04) / 0.28, 0, 1));
        const v = [new THREE.Vector3(sx * 0.18, -0.43 + up * 0.22, -0.24 - up * 0.12), fpHandBasis(s, -sx * 0.35, 0.55, -0.75, -sx, 0, 0), 1];
        if (s === 'r') R = v; else L = v;
      }
    }
  }
  if (on) { const bv = bowFpp(dt); if (bv) { R = bv[0]; L = bv[1]; } }   // BOW-FPP: the bow in the left fist, the right hand on the string
  // Aro's own arm is hidden on the side the viewmodel draws it
  const busyArm = on && (FP.reach || (sw && /^(use|pick)/.test(sw) && P.h.shotW() > 0.05));   // the body's own Interact arm would double the reach
  fpU.hideR.value = R || busyArm ? 1 : 0; fpU.hideL.value = L || busyArm ? 1 : 0;
  AR.root.visible = !!(R || L);
  if (AR.root.visible) {
    const b = AR.bones;
    for (const n in FP.armBase) b[n].quaternion.copy(FP.armBase[n]);   // (ik2 updates each arm chain from the root: no full-rig matrix pass needed)
    const az = FP.arBase.z - FP_SPR.arm * (FP.twoW || 0) - BOWFP.arm * (BOWFP.on ? BOWFP.a : 0);   // BOW-FPP: raised, the arms step forward so the bow fist reaches the grip                // FPP-world: the two-handed spear hold steps the arms forward
    if (AR.root.position.z !== az) { AR.root.position.z = az; AR.root.updateMatrixWorld(true); }
    bowFpClav();                                     // BOW-FPP: the drawing shoulder pulled back so the string hand reaches the cheek
    if (R) fpArm('r', R[0], R[1], R[2], R[3] ?? 1); else fpArm('r', new THREE.Vector3(0.25, -0.75, 0.1), fpHandBasis('r', 0, -1, 0, -1, 0, 0), 1, 0);
    if (L) fpArm('l', L[0], L[1], L[2], L[3] ?? 1); else fpArm('l', new THREE.Vector3(-0.25, -0.75, 0.1), fpHandBasis('l', 0, -1, 0, 1, 0, 0), 1, 0);
    if (!vmOn) {                                         // WPN has nothing to draw: light and size the viewmodel scene here
      vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();
      const E = world.env, day = (0.35 + 0.65 * (1 - E.night)) * (1 - 0.6 * E.cave);
      vmHemi.intensity = day * 1.1; vmKey.intensity = day * 0.9; vmFire.intensity = 0;
    }
    vmOn = true;
  }
  // reins: from each fist to the horse's bridle, projected so the strap meets the bridle on screen
  let rein = on && P.ride && !P.taming && R && L && P.ride.a?.bone?.('Head');
  if (rein) { P.ride.a.bone('Head').getWorldPosition(_fa).applyMatrix4(camera.matrixWorldInverse); if (_fa.z > -0.3) rein = false; }   // WH: the bridle behind the eye (looking back): no strap thrown across the view
  for (const m of fpRein) m.visible = !!rein;
  if (rein) {
    // RIDE-r3: each strap ends on its own side of her head, where the throat meets the jaw below the ear (the bit
    // itself is hidden under the neck from the saddle). Both aimed at the Head bone, they met in a peak on the mane.
    const hd = P.ride.a.bone('Head'), tv = Math.tan((vmCam.fov * Math.PI) / 360), F = P.face;
    [R, L].forEach((H, i) => {
      const sd = i ? 1 : -1;                         // the horse's left for the left fist
      hd.getWorldPosition(_fa); _fa.x += Math.cos(F) * sd * FPP_REIN.side - Math.sin(F) * FPP_REIN.back; _fa.z += -Math.sin(F) * sd * FPP_REIN.side - Math.cos(F) * FPP_REIN.back; _fa.y -= FPP_REIN.down;
      _fa.applyMatrix4(camera.matrixWorldInverse);
      const zc = Math.min(-0.3, _fa.z), ndc = _fb.copy(_fa).applyMatrix4(camera.projectionMatrix);
      const bridle = _fc.set(ndc.x * tv * vmCam.aspect * -zc, ndc.y * tv * -zc, zc);
      const m = fpRein[i], hb = AR.bones[i ? 'hand_l' : 'hand_r'];
      const a = hb.localToWorld(_fa.set(i ? 0.034 : -0.034, 0.09, 0.03));
      const d = _fb.subVectors(bridle, a), len = d.length();
      m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1);
      m.quaternion.setFromUnitVectors(FP_UP, d.normalize());
    });
  }
  // the third-person body's own held things would double the viewmodel's: hidden for the colour pass only
  FP.held.length = 0;
  if (on) {
    const hide = (o) => { if (o && o.visible) { o.visible = false; FP.held.push(o); } };
    if (R && vmR.visible) { if (P.h.slotOf(P.h.spear) === 'hand' || P.h.slotOf(P.h.spear) === 'low') hide(P.h.spear); if (P.h.slotOf(P.h.axe) === 'hand') hide(P.h.axe); }
    if (P.h.slotOf(P.h.spear) === 'back') hide(P.h.spear);   // the spear on the back stands up past the eye (swimming: a pole across the view)
    if (P.ride) {                                    // WH: riding, the shoulder-rested spear and the riders' carried gear pass the eye at the head-turn limit
      if (R || L) for (const r of tack.reins) hide(r);  // the body's own reins run from its hidden fists: the viewmodel draws its own
      for (const m of [P.h.axe, N.h.spear, N.h.axe, P.h.spear]) if (m && m.visible && _fBox.setFromObject(m).distanceToPoint(camera.position) < 0.3) hide(m);   // RIDE-r3: + Aro's spear on Sena's back
    }
    if (L && torchOn) for (const c of torch.root.children) if (c !== torch.light) hide(c);
    hide(bowMesh); hide(nockArrow);                  // BOW-FPP: the view model draws the bow in hand; slung, it stood past the eye like the spear
    if (fpU.hideR.value) hide(FP_WRAP.body.r); if (fpU.hideL.value) hide(FP_WRAP.body.l);   // FPP-world: the body's wrist wraps go with its hidden arms
  }
}
// ----- BOW-FPP: the first-person bow. Viewmodel camera space: the eye at the origin, looking down -z, +x right.
// Raised, the nocked arrow lies along the line of sight: from the drawing fingers at the cheek (low and a little right,
// in view) it runs almost straight into the screen, its flint point just under the crosshair, resting on the left
// side of the stave on top of the bow fist. The stave is canted with its top to the right (as an instinctive archer
// cants it), so the upper limb leans away from the crosshair. The grip, the fist and the arrow's line are all derived
// from the anchor and the aim point, so the point stays under the crosshair at any aspect. Carried, the bow sits low
// at the left. Released, the string snaps home and the drawing hand follows through back and out. Hidden riding,
// swimming, seated, busy or with the torch (bowProps puts the bow on the back then).
const vmBow = makeBow({ thick: true }), vmNockA = makeArrow();
vmBow.visible = vmNockA.visible = false; vmScene.add(vmBow, vmNockA);
const BOWFP = { on: false, sx: 0, sy: 0, yaw: 0, pitch: 0,
  low: { g: new THREE.Vector3(-0.15, -0.2, -0.45), cant: 0.65, fwd: new THREE.Vector3(0.3, -0.25, -1) },   // ready: carried low at the left, limbs leaning
  cant: -0.32,                                                              // raised: the top limb leans right, away from the crosshair
  nock: new THREE.Vector3(0.08, -0.08, -0.18),                              // full draw: the string fingers at the cheek (the hand fills the lower right corner)
  tip: [-0.012, -0.075],                                                    // where the flint point sits on screen (NDC): just under the crosshair
  clavR: new THREE.Vector3(0.02, 0.04, 0.3),                               // the drawing shoulder, back while raised
  draw: 0.6, arm: 0.3,                                                       // nock to the arrow rest at full draw; the arms' step forward when raised
  shL: new THREE.Vector3(-0.2, -0.3, 0.12) };                               // where the bow arm comes from
const _bv = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => new THREE.Vector3()), _bvq = new THREE.Quaternion();
// The arrow's line at full draw: from the nock n toward the screen point BOWFP.tip, one arrow length long.
function bowFpLine(n, out) {
  const tv = Math.tan((vmCam.fov * Math.PI) / 360), r = out.set(BOWFP.tip[0] * tv * vmCam.aspect, BOWFP.tip[1] * tv, -1).normalize();
  const b = r.dot(n), c = n.lengthSq() - ARROW_LEN * ARROW_LEN, t = b + Math.sqrt(Math.max(0, b * b - c));   // |t r - n| = ARROW_LEN
  return out.multiplyScalar(t).sub(n).normalize();
}
function bowFpp(dt) {
  const show = BOW.on && !!S.tools.bow && !P.ride && !P.swim && !(P.sit > 0) && !wBusy() && !torchOn && !camShot;
  BOWFP.on = show; vmBow.visible = show; vmNockA.visible = false; BOWFP.a = 0;
  if (!show) { BOWFP.yaw = camYaw; BOWFP.pitch = camPitch; return null; }
  const rel = clamp((clock - (BOW.relT ?? -9)) / 0.35, 0, 1), ch = W.aim ? W.aim.charge : 0;
  const a = Math.max(smooth01(W.aimW), W.aim ? 0 : smooth01(1 - (clock - (BOW.relT ?? -9) - 0.3) / 0.4));   // after the shot the bow stays up a moment
  BOWFP.a = a;
  // sway lags the look; a light bob with the steps (the comfort bob setting scales it)
  const dy = wrapA(camYaw - BOWFP.yaw), dp = camPitch - BOWFP.pitch; BOWFP.yaw = camYaw; BOWFP.pitch = camPitch;
  BOWFP.sx += (clamp(-dy * 0.9, -0.04, 0.04) - BOWFP.sx) * Math.min(1, dt * 9);
  BOWFP.sy += (clamp(dp * 0.9, -0.03, 0.03) - BOWFP.sy) * Math.min(1, dt * 9);
  const sk = Math.min(1, P.speed / 3) * (1 - 0.6 * a) * ((settings.fppBob ?? 0.7) / 0.7) * (settings.reduceMotion ? 0.3 : 1);
  const bob = Math.sin(P.step * 2.7) * 0.01 * sk, bx = Math.cos(P.step * 1.35) * 0.005 * sk;
  const shake = BOW.tire ? BOW.tire * 0.004 : 0;
  // the raised pose from the anchor and the aim point: the arrow's line, the stave's frame, then the grip under the rest
  const nockFull = _bv[1].copy(BOWFP.nock), ad0 = bowFpLine(nockFull, _bv[7]);
  const upA = _bv[3].set(-Math.sin(BOWFP.cant), Math.cos(BOWFP.cant), 0), xA = _bv[4].crossVectors(upA, ad0).normalize(); upA.crossVectors(ad0, xA).normalize();
  const gUp = _bv[8].copy(nockFull).addScaledVector(ad0, BOWFP.draw).addScaledVector(upA, -0.035).addScaledVector(xA, -0.018);
  const g = _bv[0].lerpVectors(BOWFP.low.g, gUp, a);
  const sw = _bv[6].set(BOWFP.sx + bx + Math.sin(clock * 23) * shake, BOWFP.sy + bob + Math.sin(clock * 19 + 1) * shake, 0);
  g.add(sw);
  const kick = a * Math.sin(Math.PI * rel) * (BOW.relCh || 0) * (rel < 1 ? 1 : 0);   // the bow hand pushes through the shot
  g.z -= 0.02 * kick; g.x -= 0.01 * kick;
  nockFull.addScaledVector(sw, 0.4);
  const fwd = _bv[2].copy(BOWFP.low.fwd).normalize().lerp(ad0, a).normalize();
  const cant = lerp(BOWFP.low.cant, BOWFP.cant, a) + 0.08 * kick;
  const up = _bv[3].set(-Math.sin(cant), Math.cos(cant), 0), xAx = _bv[4];
  xAx.crossVectors(up, fwd).normalize(); up.crossVectors(fwd, xAx).normalize();   // xAx: the bow's left
  _bvq.setFromRotationMatrix(_bM.makeBasis(xAx, up, fwd));
  vmBow.quaternion.copy(_bvq); vmBow.position.copy(g); vmBow.updateMatrixWorld(true);
  // the left fist round the grip (palm to the right, knuckles out), its grip axis along the stave
  const armL = _bv[5].copy(g).sub(BOWFP.shL).normalize();
  const qL = fpHandBasis('l', armL.x, armL.y, armL.z, -xAx.x, -xAx.y, -xAx.z);
  const ax = _fa.copy(AX_L).applyQuaternion(qL);
  qL.premultiply(_fq2.setFromUnitVectors(ax, _fb.copy(up).multiplyScalar(ax.dot(up) < 0 ? -1 : 1)));
  const scL = AR.bones.hand_l.getWorldScale(_h2).x;
  const L = [g.clone().sub(_fa.copy(GRIP_L).multiplyScalar(scL).applyQuaternion(qL)), qL, 1];
  BOWFP.wantL = L[0];
  // the string: drawn back along the arrow's line (from its rest on the fist toward the cheek) with the charge; let
  // down or loosed, it is back on the bow at once
  const restPt = _bv[6].copy(g).addScaledVector(up, 0.035).addScaledVector(xAx, 0.018);   // the arrow passes the stave above the fist
  const full = restPt.distanceTo(nockFull), ad = _fc.copy(restPt).sub(nockFull).normalize();
  const drawn = !!W.aim, k = drawn ? ch * a : 0;
  const nock = _bv[5].copy(restPt).addScaledVector(ad, -lerp(-BOW_TIPZ + 0.01, full, k));
  vmBow.userData.setNock(drawn ? vmBow.worldToLocal(nock.clone()) : null);
  let R = null;
  if (drawn || (rel < 1 && a > 0.05)) {
    const hand = drawn ? nock.clone() : nockFull.clone().add(_fa.set(0.08 * rel, 0.03 * rel, 0.1 * rel));   // follow-through: back and out
    const qR = fpHandBasis('r', ad.x - 0.15, ad.y, ad.z, xAx.x, xAx.y, xAx.z);   // fingers along the arrow, palm to the string
    const scR = AR.bones.hand_r.getWorldScale(_h2).x;
    R = [hand.sub(_fa.copy(GRIP_R).multiplyScalar(scR).applyQuaternion(qR)), qR, drawn ? 1 : a * (1 - rel), 0.55];   // fingers hooked, not a fist
    BOWFP.wantR = R[0];
    if (drawn && a > 0.3) {                          // the nocked arrow
      vmNockA.visible = true; vmNockA.position.copy(nock).addScaledVector(ad, ARROW_LEN); vmNockA.lookAt(_fa.copy(vmNockA.position).add(ad));
    }
  }
  return [R, L];
}
// BOW-FPP: raised, the arms rig steps forward (BOWFP.arm) so the bow fist reaches the grip at arm's length; the drawing
// arm's shoulder goes back by BOWFP.clavR (view space), so at full draw the string hand comes right back to the cheek.
const _bvc = new THREE.Vector3(), _bvcq = new THREE.Quaternion();
function bowFpClav() {
  const c = AR.bones.clavicle_r; if (!c) return;
  c.userData.p0 ??= c.position.clone();
  c.position.copy(c.userData.p0);
  const k = BOWFP.on ? BOWFP.a : 0;
  if (k > 0) {
    c.parent.updateWorldMatrix(true, false); c.parent.getWorldQuaternion(_bvcq);
    c.position.add(_bvc.copy(BOWFP.clavR).multiplyScalar(k / c.parent.getWorldScale(_h2).x).applyQuaternion(_bvcq.invert()));
  }
  c.updateMatrixWorld(true);
}
function fppPost() {
  for (const o of FP.held) o.visible = true; FP.held.length = 0;
  if (FP.shifted) { P.h.root.position.sub(FP.shift); P.h.root.updateWorldMatrix(false, false); FP.shifted = false; }   // bones refresh from the root when next read
}
// debug / test hooks
function fppDebug() {
  return { live: FP.live, act: FP.act, eyeL: FP.eyeL?.toArray(), bY: FP.bY, roll: FP.roll, sy: FP.sy.x, sp: FP.sp.x, steps: FP.steps, own: FP.own, tw: FP.tw, back: FP.back,
    reach: FP.reach && { ...FP.reach }, arms: AR.root.visible, hideR: fpU.hideR.value, hideL: fpU.hideL.value, near: camera.near, fov: camera.fov, pitch: camPitch };
}

// ---------- SAVE-PERF: shader warm-up ----------
// Shaders used to compile the first time something came on screen, so play stuttered for 50-115 ms as the home, a
// gallop, a sprint or a wolf fight showed new materials. Now every material in the scene (hidden ones too) and the
// first-person viewmodel compile behind the title screen, again once a save has built its world, and after a graphics
// reset. One hidden stand-in of each animal kind stays in the scene: it holds that kind's program, so a pack of wolves
// arriving (or the last one being removed and disposed) never compiles or throws away shaders mid-game.
const warmRigs = [];
let warmBusy = null, warmAgain = false;
function warmShaders() {
  if (warmBusy) { warmAgain = true; return warmBusy; }   // asked again mid-run (a save built more): one more pass after this one
  if (GFX.lost || !renderer.compileAsync) return null;
  if (!warmRigs.length) for (const k of ['deer', 'stag', 'wolf', 'fox', 'cow', 'horse', 'horse_white', 'donkey', 'aurochs', 'bear']) {
    try {
      const a = makeAnimal(k); a.root.visible = false; a.root.matrixWorldAutoUpdate = false; a.root.position.set(0, -400, 0);
      a.root.name = 'warm-' + k; scene.add(a.root); warmRigs.push(a.root);
    } catch (e) { console.warn('shader warm-up: no', k, e?.message || e); }
  }
  const t0 = performance.now();
  warmBusy = Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(vmScene, vmCam)])
    .then(() => { window.HB_WARM = { ms: Math.round(performance.now() - t0), programs: renderer.info.programs.length }; })
    .catch((e) => console.warn('shader warm-up', e?.message || e))
    .finally(() => { warmBusy = null; if (warmAgain) { warmAgain = false; warmShaders(); } });
  return warmBusy;
}

// ---------- start ----------
let starting = false, bootDirty = false;             // SAVE-PERF: start() runs once; a failed load needs a fresh page
function start(loadSave, diffChoice) {             // MAT: diffChoice {mode, custom} from the new-game modal
  if (playing || starting) return;                   // a double click on Continue used to rebuild every saved structure twice
  if (bootDirty) { try { sessionStorage.setItem('hb-new', JSON.stringify(diffChoice || {})); } catch {} location.reload(); return; }   // SAVE-PERF: a failed load left a half-built world
  starting = true;
  A.init();
  if (loadSave && found) try {                       // SAVE-PERF: a broken save shows a message instead of a dead title
    const data = found.data;
    S = Object.assign(fresh(), data);
    const F = fresh();                               // SAVE-PERF: a null or wrong-typed field (structs: null) falls back to the default
    for (const k in F) { const d = F[k], v = S[k]; if (d !== null && (v == null || typeof d === 'object' && (typeof v !== 'object' || Array.isArray(d) !== Array.isArray(v)))) S[k] = d; }
    if (!Array.isArray(S.felled)) S.felled = [];
    S.structs = S.structs.filter((x) => x && typeof x.k === 'string' && typeof BUILD[x.k] === 'function' && Number.isFinite(x.x) && Number.isFinite(x.z));   // SAVE-PERF: an unknown kind (newer or damaged save) is dropped, not fatal
    S.kids = S.kids.filter((x) => x && typeof x === 'object');
    for (const k of ['horse', 'pin', 'restPend']) if (S[k] != null && (typeof S[k] !== 'object' || Array.isArray(S[k]))) S[k] = null;   // SAVE-PERF: optional objects (no default in fresh())
    for (const k of ['ch', 'day', 'time', 'hp', 'food', 'water', 'warm', 'stam', 'px', 'pz', 'gh']) if (!Number.isFinite(S[k])) S[k] = fresh()[k];   // SAVE-PERF: a NaN or text number
    S.inv = { ...fresh().inv, ...S.inv };              // older saves lack the newer items
    S.tools = S.tools || {}; S.c = S.c || {};
    S.home = { ...fresh().home, ...S.home }; S.found = S.found || {}; S.stash = S.stash || {}; S.kids = S.kids || [];
    // Story v1 had 8 chapters by index. An old index means "the chapters before it are finished": go to the first
    // NEW chapter after the last finished one, so players on clay/house/seeds still meet the cave/herd/hearth content.
    const OLD = ['awaken', 'fire', 'hunt', 'shelter', 'clay', 'house', 'seeds', 'village'];
    if ((data.storyV || 1) < 2) {
      const o = Math.max(0, Math.min(7, data.ch | 0));
      S.ch = ARCD.v1ToV2(o); void OLD;               // ARC: a story-v2 INDEX (1-3 stay, 4 clay->cave, 5 house->house, 6 seeds->hearth, 7->village); matLoad maps v2 -> v3
      S.storyV = 2;
      if (S.ch >= 3) S.close = Math.max(S.close, 30);
    }
    S.ch = Math.max(0, Math.min(CH.length - 1, S.ch | 0));
    matLoad(data);                                   // MAT: nested merges, old saves without difficulty, story v2 -> v3
    if (CH[S.ch].epilogue && !S.village && (data.storyV || 1) >= 2 && data.chId !== 'village') S.ch = chIdx('village') - 1;   // STORY: a corrupt index never jumps into the epilogue
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
    rstLoad();                                         // RST rested tier, indoors after a reload
    CH[S.ch].onEnter?.();
    if (CH[S.ch].epilogue && !S.village) epilogue();   // saved mid-fade: finish the epilogue (guarded, runs once)
    drawQuest(); toast(`Welcome back · day ${S.day} (loaded from ${found.from})`);
  } catch (e) {
    console.error('Save could not be loaded', e);
    starting = false; bootDirty = true;
    S = fresh();                                     // SAVE-PERF: the title keeps running the world: no half-merged state for it to trip over every frame
    try { localStorage.setItem('hearthborn-save-broken', JSON.stringify(found.data)); } catch {}
    $('savenote').textContent = 'This save could not be loaded. A backup copy was kept in this browser. Try again, or start a new story.';
    $('btn-continue').textContent = 'Try again'; $('btn-continue').onclick = () => location.reload();
    return;
  } else { deleteGame({ server: newDel ?? !saveState.unknown }); matNew(diffChoice); showChapter(); }   // MAT: the chosen difficulty · SAVE-PERF: never DELETE a save the server has not shown us (r3: decided when the player confirmed)
  if (saveState.unknown) { sessionBase = { day: loadSave && found ? found.data.day || 1 : 0, at: loadSave && found ? found.data.savedAt || 0 : 0 }; holdServer(sessionBase.at); }   // SAVE-PERF r3: browser-only saves until the server is heard
  playing = true; starting = false;
  $('title').classList.add('off'); $('hud').classList.add('on');
  drawInv(); applyQuality();
  wpnLoad();                                         // WPN weapons into their sockets, the spear lying out
  matStart();                                        // MAT: game clock, Hardcore UI, herd scarcity
  if (loadSave) matFightResume(found?.data); else matFightClear();   // MAT-SV r2: a Hardcore fight left by a reload or a closed tab is put back
  if (loadSave) rstResume();                         // SAVE-PERF: the night a closed page interrupted
  warmShaders();                                     // SAVE-PERF: the saved structures, kids, villagers and the horse
  if (settings.fullscreen) fullscreen(true);
  lock();
  setTimeout(() => toast('Esc opens the menu · settings, save and quit'), 1500);
  helpNudge();                                       // FPP-world: draw the eye to the F1 controls chip
}
// FPP-world: the controls list. A small "F1 controls" chip by default; F1 opens the full list, which closes itself
// after 25 s (or on F1 / Esc) so it never sits over the weapon hand, the E prompt, subtitles or the pack.
let helpT = 0;
function toggleHelp(on = $('help').classList.contains('min')) {
  const el = $('help');
  el.classList.toggle('min', !on); el.classList.remove('nudge');
  clearTimeout(helpT); if (on) helpT = setTimeout(() => toggleHelp(false), 25000);
}
function helpNudge() { const el = $('help'); el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); }
$('btn-new').textContent = 'Begin the story';
$('btn-new').onclick = (ev) => matNewGame(ev);      // MAT: the 21+ notice, then the difficulty modal
// MAT-GATE: a disabled button ignores click(); older scripted harnesses (epi/ford/bow/shots.json) still call it while the notice
// is up, so a script's click() reaches matNewGame (which starts Survivor for an untrusted click). A person's click never does.
$('btn-new').click = function () { if (this.disabled) matNewGame(null); else HTMLButtonElement.prototype.click.call(this); };
// SAVE-PERF: the title's save line. If the server has not answered yet (slow first request, loaded machine) and this
// browser has no copy, the title says so and keeps asking in the background; "Begin the story" asks before it could
// replace a save it cannot see, and a late answer brings Continue back.
function titleSave() {
  if (playing || starting) return;
  if (found) {
    const d = found.data, when = d.savedAt ? new Date(d.savedAt).toLocaleString() : '';
    $('btn-continue').style.display = ''; $('btn-continue').onclick = () => titleContinue(); $('btn-new').textContent = 'New story';   // SAVE-PERF r3: titleContinue
    $('btn-continue').textContent = `Continue · day ${d.day || 1}`;
    $('savenote').textContent = `Saved ${when} · ${found.from === 'database' ? 'from the save database' : 'from this browser'}${saveState.unknown ? ' · still asking the save server for a newer copy…' : ''}`;
  } else if (saveState.unknown) $('savenote').textContent = 'Looking for your saved story… the save server is slow to answer.';
  else $('savenote').textContent = '';
}
// SAVE-PERF r3: newDel is decided when the player confirms: DELETE only a save they were shown and agreed to delete, or
// when the server has answered that there is none. ngSaw records whether a save was on screen when the modal opened.
let newDel = null, ngSaw = false;
function newGameOk() {
  if (MAT.deadSave) { newDel = true; return true; }
  if (found) { const ok = confirm('Start over? The saved story will be deleted.'); newDel = ok && !saveState.unknown; return ok; }   // a browser copy while the server is silent: the server's copy (never shown) is kept
  newDel = !saveState.unknown;
  return !saveState.unknown || confirm('The save server has not answered yet, so this page cannot tell whether you have a saved story. Starting now could replace it.\n\nStart a new story anyway?');
}
let titleTries = 0;
// SAVE-PERF r3: keeps asking while the server is silent, also when a browser copy is on screen (it may be older than the
// server's). The server's answer settles the title: the newer of the two copies, or none.
async function titleRetry() {
  while (saveState.unknown && !playing && !starting) {
    await new Promise((r) => setTimeout(r, Math.min(10000, 2000 + 1000 * titleTries++)));
    if (playing || starting) return;
    const r = await loadGame({ timeout: 15000 });
    if (playing || starting) return;
    if (!saveState.unknown) { titleFound(r); return; }
    if (titleTries >= 6) $('savenote').textContent = found ? `${$('savenote').textContent.split(' · still')[0]} · the save server is not answering` : 'The save server is not answering. If you had a saved story, it is safe. Reload to try again.';
  }
}
const sameSave = (a, b) => !!a && !!b && a.from === b.from && a.data.savedAt === b.data.savedAt;
function titleFound(r, prev = found) {               // SAVE-PERF r3: the server answered (r: the newer copy, or null); prev: the copy the player saw
  const late = !!r && !sameSave(r, prev);
  found = r;
  titleSave(); matTitle();                           // matTitle: a permadeath tombstone check on the late save
  if (late && found && !MAT.deadSave) {
    if ($('newgame').classList.contains('on')) $('newgame').classList.remove('on');   // the new-game modal must not start over a save it never showed
    $('savenote').textContent = `Your saved story was found: day ${found.data.day || 1}, saved ${found.data.savedAt ? new Date(found.data.savedAt).toLocaleString() : ''}. Continue it, or choose New story to start over.`;
  }
}
let checking = false;
async function titleContinue() {                     // SAVE-PERF r3: a browser copy while the server is silent: one last look first
  if (checking || playing || starting) return;
  if (saveState.unknown && found?.from === 'browser') {
    checking = true; const shown = found;
    $('btn-continue').textContent = 'Checking the save server…';
    const r = await loadGame({ timeout: 8000 });
    checking = false;
    if (playing || starting) return;
    if (!saveState.unknown) titleFound(r, shown); else titleSave();
    if (!sameSave(found, shown)) return;             // a newer copy turned up (here or in titleRetry): show it, the player clicks again
  }
  start(true);
}
titleSave();
if (saveState.unknown) titleRetry();
matTitle();                                          // MAT: content notice, the Stones, the new-game cards
warmShaders();                                       // SAVE-PERF: compile behind the title screen
{ let nc = null; try { nc = sessionStorage.getItem('hb-new'); sessionStorage.removeItem('hb-new'); } catch {}   // SAVE-PERF: New story after a failed load
  if (nc) { let c = {}; try { c = JSON.parse(nc); } catch {} start(false, c.mode ? c : undefined); } }

let last = performance.now(), frames = 0, ftAcc = 0, ftN = 0, fpsShown = 0, prAt = 0;   // SAVE-PERF prAt: last resolution step
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000), dt = paused ? 0 : Math.min(0.05, raw) * cmbTimeK(raw);   // CMB slow motion (parry, perfect dodge, finisher) · MUS fix: a stale first rAF stamp gave raw < 0 (clock went to -18 s)
  last = now; clock += dt;
  hitStop = Math.max(0, hitStop - raw);              // WPN hitstop runs in real time
  // Adaptive resolution: nudge the internal render size inside the preset's range to hold a smooth frame rate.
  if (++frames > 60 && !paused && !document.hidden) {
    ftAcc += raw; ftN++;
    if (ftN >= 45) {
      const avg = ftAcc / ftN; ftAcc = ftN = 0; fpsShown = 1 / avg;
      // SAVE-PERF: step down below 50 fps (was 33: anything from 33 to 70 fps kept its resolution, so on a 120 Hz screen
      // it climbed to prMax and then sat at ~40 fps); step up only with clear headroom (> 80 fps: never on a 60 Hz screen)
      // SAVE-PERF: at most one step every 2.5 s (setPixelRatio resizes every render target; it showed at ~2% CPU under load)
      if (now - prAt < 2500) {}
      else if (avg > 0.02 && pixelRatio > Q.prMin + 0.01) { pixelRatio = Math.max(Q.prMin, pixelRatio - 0.1); renderer.setPixelRatio(pixelRatio); prAt = now; }
      else if (avg < 0.0125 && pixelRatio < Math.min(Q.prMax, devicePixelRatio) - 0.01) { pixelRatio = Math.min(Q.prMax, devicePixelRatio, pixelRatio + 0.05); renderer.setPixelRatio(pixelRatio); prAt = now; }
      $('fps').textContent = `${fpsShown.toFixed(0)} fps · ${Math.round(pixelRatio * 100)}%`;
    }
  }
  if (frames % (Q === PRESETS.low ? 3 : 2) === 0) renderer.shadowMap.needsUpdate = true;   // SAVE-PERF: every 2nd frame (3rd on low); the 900-caster pass every frame on high cost ~17% fps. Other code may still ask for one now.
  if (playing && !paused) {
    updatePlayer(dt); updateTorch(dt); updateSena(dt); updateVillagers(dt); updateKids(dt); updateSpear(dt * (hitStop > 0 ? 0.05 : 1)); updateStats(dt); updateSubs(dt); updateEvents(dt); updateMap(); lockHint();
    tick -= dt;
    if (tick <= 0) {
      tick = 0.5;
      const ch = CH[S.ch], gl = goalsOf(ch);         // ARC goalsOf
      if (!busy && gl.length && gl.every(([, f]) => f()) && !arcCalm() && !(clock < birthHold)) {   // ARC: let a story beat finish first (ARC-FIX: and romance scenes, choices, rests); STORY: and the birth morning's lines
        arcAdvance();                                // ARC-FIX: S.ch++ and enterChapter, behind a short fade when the season turns
      }
    }
    updateArc(dt);                                   // ARC: story beats, NPCs, seasons, fever (spec §5.8)
    if (D().saves === 'auto' && (MAT.markT = (MAT.markT || 0) + dt) > 2) { MAT.markT = 0; if (matHoldSave()) { MAT.saveHeld = true; matFightMark(); } }   // MAT-SV r2: keep the fight mark fresh (a crash or a killed tab sends no pagehide)
    saveT += dt; if (!busy && (saveT > 20 || (MAT.saveHeld && saveT > 2 && !matInFight()))) { saveT = 0; save(); }   // MAT-SV: a held save goes out as soon as the fight is over
  } else if (!playing) { settle(P, dt, false); settle(N, dt, false); }
  for (const o of [...animals]) updateAnimal(o, dt);
  wolfCorpseCap(dt);                                 // SAVE-PERF: at most WOLF_CORPSES unbutchered wolves lie about
  if (playing && !paused) cmbUpdate(dt);            // CMB raiders, predators, glints, brace, Sena
  updateHorses(dt);                                  // WP4: riders' seats, herd, heart, kicks, peak ride
  updateWorldThings(dt);
  updateFireLights();                                // SAVE-PERF campfire light pool
  goreFrame(dt);                                     // GORE blood, wounds, trails, focus, butchering, screen blood
  world.env.cave = playing ? depthAt(P.pos.x, P.pos.z) : 0;   // WP3 cave darkness
  if (playing && !paused) updateWP3(dt);
  updateCamera(dt, !playing);
  updateMusic(dt);                                   // MUS adaptive score (states, crossfades, ducking)
  world.setTime(S.time, P.pos, camera);
  world.update(dt, P.pos.x, P.pos.z, camera);
  wpnVm(dt);                                         // WPN first-person viewmodel
  fppVm(dt);                                         // FPP real arms, head hiding, near plane
  fppHud();                                          // FHW-r4: first-person HUD (stowed pack, F1 chip and fps up top)
  renderer.render(scene, camera);
  fppPost();                                         // FPP
  if (vmOn) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }   // WPN
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
  goals: () => goalsOf().map(([l, f]) => [l, !!f()]),   // ARC goalsOf
  cnt, bump, reached, chIdx, addClose, sitTogether, homeliness, findTarget, structTarget, toggleMenu, craft, RECIPES,
  menu: () => menuRecipes().map((r) => r.id),
  // WP2 hooks
  sites: () => structs.filter((s) => s.timed).map((s) => ({ k: s.kind, rise: s.rise })),
  finishSites() { for (const s of structs) if (s.timed && s.rise < 1) completeSite(s); drawQuest(); },
  sleep() { const b = rstNearest(); if (b && rstBegin(b, 'dawn', { force: true })) { S.c.restSeen = 1; R.skip = true; R.skipSpeed = 1; } return b?.kind; },   // RST: a skipped night (old tests)
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
// WPN weapon hooks
Object.assign(window.G, {
  wpn: {
    state: wpnState, W, proj, FIT, WTILT,
    select: (k) => wpnSelect(k), draw: () => wpnDraw(), sheathe: () => wpnSheathe(), toggle: () => wpnToggle(true), stowAll: wpnStowAll,
    aim(on = true) { if (on) { const r = wpnAimStart(); if (W.queued === 'aim') W.relEarly = false; return r; } wpnCancelAim(); return false; },
    charge(t) { if (W.aim) { W.aim.t = t; W.aim.charge = Math.min(1, t / 0.6); } return !!W.aim; },
    release: () => wpnRelease(), cancel: () => wpnCancelAim(),
    arc: () => ({ pts: Array.from({ length: ARC.n }, (_, i) => [arcPos[i * 3], arcPos[i * 3 + 1], arcPos[i * 3 + 2]]), hit: ARC.hit, end: ARC.end.toArray() }),
    pickup: () => wpnPickup(), fetch() { if (!W.spearOut) return false; proj.m.getWorldPosition(_w1); N.fetch = { x: _w1.x, z: _w1.z, ph: 'go', t: 0 }; return true; },
    fit(kind, slot, v = {}) { const f = FIT[kind][slot]; Object.assign(f, v); for (const h of [P.h, N.h]) for (const m of [h.spear, h.axe, torch.root, senaBasket]) if (m.userData.kind === kind && m.userData.slot === slot && Object.values(h.sock).includes(m.parent)) h.place(m, slot); return JSON.stringify(f); },
    fitDump: () => JSON.stringify(FIT),
    axes(on = true) { for (const h of [P.h, N.h]) for (const k in h.sock) { const sk = h.sock[k]; let a = sk.getObjectByName('wpnAxes'); if (on && !a) { a = new THREE.AxesHelper(0.15); a.name = 'wpnAxes'; a.material.depthTest = false; a.renderOrder = 9; sk.add(a); } if (a) a.visible = on; } },
    ends() {
      const v = (o, z) => o.localToWorld(new THREE.Vector3(0, 0, z)).toArray().map((x) => +x.toFixed(3));
      const b = (n) => { const p = new THREE.Vector3(); P.h.bones[n].getWorldPosition(p); return p.toArray().map((x) => +x.toFixed(3)); };
      P.h.root.updateMatrixWorld(true);
      return { spearTip: v(P.h.spear, 1.13), spearButt: v(P.h.spear, -0.95), head: b('Head'), pelvis: b('pelvis'), flame: (() => { const p = new THREE.Vector3(); torch.flame.getWorldPosition(p); return p.toArray().map((x) => +x.toFixed(3)); })(),
        handL: P.h.bones.hand_l.localToWorld(GRIP_L.clone()).toArray().map((x) => +x.toFixed(3)), handR: P.h.bones.hand_r.localToWorld(GRIP_R.clone()).toArray().map((x) => +x.toFixed(3)), wristL: b('hand_l'), axeHead: v(P.h.axe, 0.46), worldTip: v(proj.m, 1.13), face: P.face };
    },
    get hitStop() { return hitStop; }, get trauma() { return trauma; }, get clock() { return clock; }, get hsLast() { return W.hsLast; },
    vm: () => ({ visible: vmOn, weapon: !vmOn || !vmR.visible ? null : vmSpear.visible ? 'spear' : vmAxe.visible ? 'axe' : 'fists', y: vmR.position.y, torch: vmOn && vmL.visible && torchOn }),
    bench: wpnBench, unsit: wpnUnSit, rest: wpnRest, wake: wpnWake, basket: senaBasket, vmR, vmL, vmScene, vmCam,
  },
  throwSpear, attack, wpnRest, wpnWake, wpnStowAll,
});
// P0 pose / IK hooks (weapons + rest packages)
Object.assign(window.G, { hostileNear, samplePose, applyPose, clipDuration, BONESETS, ik2 });
// WP5 map hooks
Object.assign(window.G, { reveal, seenFrac, found: () => ({ ...S.found }), seenAt, toggleMap, drawMap, encodeSeen });
// WP6 family hooks
Object.assign(window.G, { kids, spawnKid, maybeBirth, liveTameHorse, sideGoals, kidScale });
// RST rest hooks
Object.assign(window.G, {
  rest(mode = 'dawn', { s = null, skip = false } = {}) {
    s ||= rstNearest();
    return new Promise((res) => {
      if (!rstBegin(s, mode, { force: false })) { res(null); return; }
      R.waiters.push(res);
      if (skip) { S.c.restSeen = 1; R.skip = true; }
    });
  },
  restState: () => ({ on: R.on, phase: R.phase, t: R.t, mode: R.mode, tier: R.tier, together: R.together, lieW: [P.lieW || 0, N.lieW || 0], time: S.time, menu: R.menu, inside: !!R.inside, comfort: R.comfort }),
  restHold(ph) { R.freeze = ph; },
  restBlock: (s) => rstBlock(s || rstNearest()),
  restMenu(s) { rstOpen(s || rstNearest()); return R.opts.map((o) => o[1]); },
  restChoose: (i) => rstChoose(i),
  restKey: (code) => rstKey({ code, repeat: false }),
  restTune: RT, restLay: RST_LAY, hfp: HFP,   // SIT-r4 hfp: the hearth floor pose
  lie(who = 'both', on = true, s) {
    s ||= rstNearest();
    if (!on) { R.freeze = null; rstAbort(); return false; }
    return rstLieNow(s);
  },
  restCam(name = 'end') {
    const L = R.L || rstLayout(rstNearest()), c = L.cam;
    const pos = name === 'start' || name === 'walk' ? c.walk : name === 'wake' ? c.wake : c.end, lk = name === 'start' || name === 'walk' ? c.walkLook : name === 'wake' ? c.wakeLook : c.look;
    camShot = { dolly: true, from: pos.clone(), lookFrom: lk.clone(), pos: pos.clone(), look: lk.clone(), k: 1, dur: 1 };
    return [pos.toArray(), lk.toArray()];
  },
  restProbe() {
    const L = R.L; if (!L) return null;
    const v = (o) => o.getWorldPosition(new V3()).toArray().map((x) => +x.toFixed(3));
    const one = (e) => e.L && { head: v(e.h.bones.Head), pelvis: v(e.h.bones.pelvis), footL: v(e.h.bones.foot_l), footR: v(e.h.bones.foot_r),
      handNear: e.L.hand ? v(e.h.bones['hand_' + e.L.hand]) : null, pillow: e.L.pillow.toArray().map((x) => +x.toFixed(3)) };
    const p = one(P), n = R.together ? one(N) : null;
    // Sena's face direction: the Head bone's forward (+Z) axis against the direction to Aro's head
    let face = null;
    if (n) { const f = new V3(0, 0, 1).applyQuaternion(N.h.bones.Head.getWorldQuaternion(new THREE.Quaternion())); const to = new V3(...p.head).sub(new V3(...n.head)).normalize(); face = +f.dot(to).toFixed(3); }
    return { mattressY: +L.matY.toFixed(3), pillowY: +L.pillowY.toFixed(3), P: p, N: n, faceDot: face,
      handGap: p.handNear && n?.handNear ? +new V3(...p.handNear).distanceTo(new V3(...n.handNear)).toFixed(3) : null,
      rootPitch: [P.h.root.rotation.x, N.h.root.rotation.x], hold: [P.L?.hold, N.L?.hold], blanket: R.blanket?.visible };
  },
  get R() { return R; }, rstComfort, rstMorningLine, structCam,
  villagers: () => villagers, homeHouse: () => homeHouse(), questAt: () => questAt(),   // round 2 test hooks
  camAt(p, l) { camShot = p ? { dolly: true, from: new V3(...p), lookFrom: new V3(...l), pos: new V3(...p), look: new V3(...l), k: 1, dur: 1 } : null; return !!p; },   // STORY test hook: a fixed camera (null = free)
  birthHold: () => birthHold, kidBed, inCradle, inNursery,
});
// WP4 horse hooks
Object.assign(window.G, {
  horse: () => tameHorse() || null, horses: () => animals.filter((a) => a.horse),
  mount: (o) => mount(o || tameHorse()), dismount: () => dismount(), callHorse, addBond, wp4Target: () => wp4Target(P.pos),
  tapE() { eLatch = false; tapE = true; eTap = true; },
  camD(v) { if (v) camDist = v; return camDist; },  // WH test hook: the orbit distance (screenshots)
  biome: (x, z) => (pineWoods(x, z) ? 'woods' : biomeAt(x, z)),   // WH test hook: wolf spawns out of the pines
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
Object.assign(window.G, { fpp: fppDebug, fppCamera, fppVm, FP });   // FPP test hooks
Object.assign(window.G, { rideTune: { RIDE_FOOT, FPP_REIN, SPEAR_ON_SENA } });   // RIDE-r3 test hook: live-tune the riders' feet, first-person reins, two-up spear
Object.assign(window.G, { say: (who, text) => say(who, text) });     // FPP-world: HUD layout tests trigger a subtitle
Object.assign(window.G, { remove: (o) => remove(o), gfx: GFX, paintMapBase });   // SAVE-PERF test hooks
arcHooks(window.G);                                  // ARC story hooks: G.arc, setArc, arcChoose, raid, fever, goalsOf, arcDbg
cmbHooks(window.G);                                  // CMB hooks: G.cmb, G.spawnRaider, clearFoes, updateFoes, cmbDuel
// MAT mature foundation hooks (difficulty, bus, damage, choices, death and memorial)
Object.assign(window.G, {
  mat: {
    D, diffK, diff: () => S.diff, setDiff, canLower, endRun, permadeath, die, grace: matGrace, stamCap: (fn) => { STAM_CAPS.push(fn); return fn; },
    downed: () => P.downed || 0, rescuing: () => MAT.rescuing, dead: () => MAT.dead, stones: () => MATD.readStones(), respawnAt: matRespawnAt, loot: matLoot,
    griefHold: (t = 0) => { MAT.endHold = t; return MAT.endT; },   // MAT-GRIEF r3: test hook
    gate: matGate, newGame: (mode = 'survivor', custom = null) => { settings.ageOk = MATD.CONTENT_V; saveSettings(); matGate(false); start(false, { mode, custom }); },
    state: () => ({ busy, downed: P.downed || 0, hits: MAT.downHits, rescueT: MAT.rescueT, rescuing: MAT.rescuing, dead: MAT.dead, endT: MAT.endT, gh: S.gh, weak: S.weakUntil > S.gh, mode: S.diff.mode }),
    DIFF: MATD.DIFF, BUS: MATD.BUS, foes,
  },
  playerHurt, skipHours, choose, on, off: MATD.off, emit, foes,
});
// SURV hooks (injuries, illness, spoilage, spit; spec M3 G hooks)
Object.assign(window.G, {
  surv: {
    add: (id, part, sev = 1, who = 'P') => survAdd(id, part, sev, who, { force: true }),
    list: (who = 'P') => (who === 'N' ? S.naff : S.aff).map((a) => ({ ...a })),
    treat(id, item, who = 'P') { const L = who === 'N' ? S.naff : S.aff, a = L.filter((x) => x.id === id).sort((x, y) => y.sev - x.sev)[0]; return a ? svApply([{ a, item }], who) > 0 : false; },
    mods: () => svMods(), eatRaw: () => survEatRaw(), spoilTick: () => survHours(), land: (drop, water = false) => survLand(drop, water),
    rng(seed) { SV.rng = seed == null ? Math.random : seed === 0 ? () => 0 : seed === 1 ? () => 0.999 : SURV.mulberry(seed); return true; },
    body: (open) => survBody(open == null ? !SV.body : !!open), bodyAct: (act) => svBodyAct(act), bodySel(p) { SV.bodySel = p || null; svBodyDraw(); },
    skinQ: () => S.skinQ, ages: () => S.age, stashAges: () => S.stashAge,
    spit: (s) => (s || structs.find((f) => f.kind === 'fire'))?.spit?.items?.map((it) => ({ ...it, d: SURV.doneness(it.t) })) || [],
    boil: () => SV.boil && { kind: SV.boil.kind, t: SV.boil.t, T: SV.boil.T }, tend: () => svTendStart(), lean: (on = true) => (on ? svLeanStart() : svLeanStop()),
    state: () => ({ m: { ...SV.m }, retch: SV.retch, lean: SV.lean, leanW: SV.leanW, tend: SV.tend && { ...SV.tend }, limpW: SV.limpW, kneelW: SV.kneelW, risk: { ...S.risk }, body: SV.body, romActs: SV.romActs }),
    fill: (src) => survFill(src), drink: () => survDrinkSkin(), river: () => survRiverTarget(P.pos), senaActs: SURV_SENA_ACTS, SURV,
    clock: () => clock, grace: (on) => { if (on === false) S.diff.graceUntil = 0; return matGrace(); },
  },
});
// ROM + MUS hooks (romance v2, adaptive music, volume buses)
Object.assign(window.G, {
  rom: {
    tier: () => romTier().name, menu: () => romActs().map((a) => a.id), acts: () => romActs().map((a) => ({ id: a.id, label: a.label, ok: a.ok !== false })), open: (page = 0) => romMenu(page),
    hand: (on = true, force = true) => romHand(on, force), embrace: (force = true) => romEmbrace(force), kiss: (force = true) => romKiss(force), peck: (line) => romPeck(line),
    talk: () => romTalk(), night: (s) => romNight(s || homeHouse()), nightBlock: (s) => romNightBlock(s || homeHouse()), firstKiss: (ctx = 'fever') => romFirstKiss(ctx),
    rift: (n = 1, cause) => romRift(n, cause), gift: (k) => (k ? romGift(k) : romGiftMenu()), register: romRegister, scene: (k, o) => romScene(k, o), state: romState,
    T: ROM.T, ROM, SENA_ACTS, end: () => romSceneEnd(true),
  },
  heart: (n) => romHeart(n),
  music: {
    state: () => MUS.state, force: (s, dur = 20) => musicForce(s, dur), sting: (k) => musicSting(k), volumes: musicVolumes,
    buses: () => ({ m: A.mus ? +A.mus.gain.value.toFixed(3) : settings.music, s: A.sfx ? +A.sfx.gain.value.toFixed(3) : settings.sfx, a: A.amb ? +A.amb.gain.value.toFixed(3) : settings.amb, master: A.out ? A.out.gain.value : settings.volume }),
    voices: () => MUS.m?.voices() ?? 0, playing: () => MUS.m?.state ?? null, duck: () => (MUS.m ? +MUS.m.duckNode.gain.value.toFixed(2) : null), log: () => MUS.m?.M.log.slice() ?? [], snap: musicSnap, why: () => MUS.why,
  },
});
Object.assign(window.G, { bow: { toggle: bowToggle, aim: bowAimStart, BOW, BOWFP, BOWC, bowMesh, quiverMesh, rocky: bowRocky,   // BOW-FPP hooks: fp(), give(), shoot(charge, yaw, pitch), view(v)
  fp: () => { const v = (o) => { o.updateWorldMatrix(true, false); const w = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).project(vmCam); return [+w.x.toFixed(3), +w.y.toFixed(3)]; }; return { on: BOWFP.on, bow: vmBow.visible, nock: vmNockA.visible, arms: AR.root.visible, grip: v(vmBow), tip: vmNockA.visible ? v(vmNockA) : null, hr: v(AR.bones.hand_r), hl: v(AR.bones.hand_l), nockEnd: vmNockA.visible ? v(vmNockA.clone().translateZ(-ARROW_LEN)) : null, gapL: BOWFP.wantL ? +AR.bones.hand_l.getWorldPosition(new THREE.Vector3()).distanceTo(BOWFP.wantL).toFixed(3) : null, gapR: BOWFP.wantR ? +AR.bones.hand_r.getWorldPosition(new THREE.Vector3()).distanceTo(BOWFP.wantR).toFixed(3) : null }; },
  give(n = 24) { S.tools.bow = S.tools.quiver = true; S.inv.arrow = n; drawInv(); if (!BOW.on) bowToggle(); return BOW.on; },
  view(v) { view = v; camPitch = clamp(camPitch, pitchMin(), fppPitchMax()); return view; },
  async shoot(ch = 1, yaw = camYaw, pitch = camPitch) { camYaw = yaw; camPitch = pitch; if (!BOW.on) bowToggle(); bowAimStart(); if (!W.aim) return null; const f = () => new Promise((r) => requestAnimationFrame(r)); await f(); await f(); W.aim.t = ch * 0.6; W.aim.charge = Math.min(1, ch); const n = BOW.arrows.length; bowLoose(); return BOW.arrows.length > n ? BOW.arrows[BOW.arrows.length - 1] : null; },
  st: (ar) => ar && { st: ar.st, o: ar.o?.kind || null, ob: ar.inObst || null, bounced: !!ar.bounced, tip: ar.tip.toArray().map((x) => +x.toFixed(2)) }, loose: bowLoose, pickup: bowPickup, near: () => bowNear(P.pos).length, get on() { return BOW.on; }, get arrows() { return BOW.arrows.map((a) => a.st); }, quest: bowQuestHtml, quiet: bowQuiet, cam(v) { camDist = v; }, probe() { const v = (o) => { const w = new THREE.Vector3(); o.getWorldPosition(w); w.sub(P.pos); return [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)]; }; const d = new THREE.Vector3(); camera.getWorldDirection(d); return { face: +P.face.toFixed(2), aimW: +W.aimW.toFixed(2), aim: !!W.aim, hl: v(P.h.bones.hand_l), hr: v(P.h.bones.hand_r), head: v(P.h.bones.Head), bow: v(bowMesh), bowVis: bowMesh.visible, nock: nockArrow.visible && v(nockArrow), cam: v(camera), dir: [d.x, d.y, d.z].map((x) => +x.toFixed(2)) }; } } });   // BOW test hooks
