// ---------- ARC mature story: chapter order, lines, vignettes, recaps, epilogue variants (pure data) ----------
// The game-coupled half (CH goals, beats, NPCs, choices, seasons) lives in main.js's "ARC" section. Everything here is
// plain data or pure functions so the story tables can be unit-tested in node (scratchpad/tests/arc/unit.mjs).
//
// CONTENT GUARDRAILS (spec §2 as updated by §12; binding on every package):
// - Romance is strictly non-explicit: hand-holding, embrace, kiss, resting together clothed. Intimacy cuts or fades to
//   black at the embrace, then the next morning. No sex scenes, sexual sounds/text, nudity, undressing or underwear meshes.
//   Romance only between Aro and Sena, both adults; never while a child is within 15 m or awake in the house.
// - No sexual violence or threat of it, anywhere. Korr wants Sena as a HEALER, never anything else.
// - Children (Lio, Pell, any child) are never harmed, targeted, endangered on screen or shown dead; no gore near them.
//   Wena and Pell's fate when refused is off-screen and unknown: an empty camp and a sling. No bodies.
// - Violence: combat and hunting violence at full 21+ intensity. No torture, no prolonged cruelty to the helpless as
//   spectacle; a surrendered human dies only by an explicit choice (never the default), and quickly.
// - The death of a main character is non-graphic. Settings always win (Blood off, Gore low, Romance fade/off,
//   Mature story off skips the chapters flagged mature).

// ----- chapters: 19 in 4 seasonal acts. ★ = new and mature-gated (bond is new but not gated: it is the handfasting).
export const CH_ORDER = ['awaken', 'fire', 'hunt', 'shelter', 'cave', 'herd', 'smoke', 'outcast', 'clay', 'house',
  'winter', 'raid', 'fever', 'reckoning', 'hearth', 'seeds', 'bond', 'newlife', 'village'];
export const MATURE_CH = ['smoke', 'outcast', 'winter', 'raid', 'fever', 'reckoning'];
export const SEASON_OF = {
  awaken: 'summer', fire: 'summer', hunt: 'summer', shelter: 'summer', cave: 'summer', herd: 'summer',
  smoke: 'autumn', outcast: 'autumn', clay: 'autumn', house: 'autumn',
  winter: 'winter', raid: 'winter', fever: 'winter', reckoning: 'winter',
  hearth: 'spring', seeds: 'spring', bond: 'spring', newlife: 'spring', village: 'spring',
};
export const SEASON_NAME = { summer: 'Summer', autumn: 'Autumn', winter: 'Winter', spring: 'Spring' };
export const ACT_NAME = { summer: 'The Valley', autumn: 'Other Fires', winter: 'The Long Cold', spring: 'What Grows' };
export const TITLES = {
  smoke: 'Other Fires', outcast: 'The Wounded Stranger', winter: 'The Long Cold', raid: 'Fire in the Night',
  fever: 'Bitter Roots', reckoning: 'Blood and Ash', bond: 'The Cord and the Stones',
};
// Story v2 (12 chapters) by index, for the v2 -> v3 save migration. v1 (8 chapters) maps onto v2 first.
export const V2_IDS = ['awaken', 'fire', 'hunt', 'shelter', 'cave', 'herd', 'clay', 'house', 'hearth', 'seeds', 'newlife', 'village'];
export const V1_IDS = ['awaken', 'fire', 'hunt', 'shelter', 'clay', 'house', 'seeds', 'village'];
// v1 index -> v2 index: an old index means "the chapters before it are finished", so go to the first v2 chapter after the
// last finished one (1-3 stay, 4 clay -> cave, 5 house -> house, 6 seeds -> hearth, 7 -> village).
export function v1ToV2(o) {
  o = Math.max(0, Math.min(7, o | 0));
  return o === 7 ? V2_IDS.indexOf('village') : o === 0 ? 0 : V2_IDS.indexOf(V1_IDS[o - 1]) + 1;
}

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  n = Math.floor(n); if (!(n > 0)) return '';
  let s = '';
  for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; }
  return s;
}

// ----- speakers (subtitle colours, see the ARC CSS block in index.html)
export const SPEAKER_CLASS = { Korr: 'spk-korr', Tamu: 'spk-tamu', Wena: 'spk-wena', Pell: 'spk-pell', Hunter: 'spk-korr' };

// ----- approval/mercy axes (hidden, -10..10)
export const AXIS_MAX = 10;
export const clampAxis = (v) => Math.max(-AXIS_MAX, Math.min(AXIS_MAX, v));

// Food that keeps through the winter, for the stockpile goal and the door choice.
export const KEEP_FOOD = ['cooked', 'grilled', 'dried', 'driedfish', 'bread'];
export const countFood = (bag = {}, keys = KEEP_FOOD) => keys.reduce((a, k) => a + Math.max(0, bag[k] | 0), 0);
// Take n food from the stash first, then the pack. Mutates both; returns how many were taken.
export function takeFood(stash, inv, n, keys = KEEP_FOOD) {
  let left = n;
  for (const bag of [stash, inv]) for (const k of keys) { const t = Math.min(left, Math.max(0, bag[k] | 0)); if (t) { bag[k] -= t; left -= t; } }
  return n - left;
}

// Peace with Korr: Sena's trust, a shared door, or her offer at the ford.
export const canPeace = (arc) => (arc.approve || 0) >= 4 || arc.choices?.door === 'share' || !!arc.healOffer;

// Fever: rise per game hour by difficulty, remedy strength.
export const FEVER = { start: 30, rise: { story: 3, survivor: 6, hardcore: 6 }, bled: 0.5, remedy: 30, bleed: 10, vigil: 40, floor: 5 };
export const feverRise = (mode, bled) => (FEVER.rise[mode] ?? 6) * (bled ? FEVER.bled : 1);

// ----- lines. [speaker, text]; '' is the narrator.
export const L = {
  smoke: {
    enter: [['Sena', 'Look east, past the river. Smoke, where no one should be.'], ['Aro', 'Not ours. And it rises too straight for a lightning fire.'], ['Sena', 'Then someone is cooking. Let us see who, before they see us.']],
    camp: [['Sena', 'They kept the fire low so it would not be seen. People who hide their fire are afraid, or hunting.'], ['Aro', 'Grey hands on the wall. Ash, rubbed on like paint.'], ['Sena', 'Our hands are in the hollow, Aro. I want to see them.']],
    campBanner: ['A cold camp', 'Ashes still warm. Bones picked clean. Grey hands smeared across the old wall.'],
    ash: [['Sena', 'They found our hands. And they wanted us to know it.'], ['Aro', 'Ash over ochre. It is a message.'], ['Sena', 'Then we answer it. Not here. At the north ford, in daylight, with our faces showing.']],
    ashBanner: ['Ash on the wall', 'Someone has smeared grey ash across your handprints.'],
    fordArrive: [['Korr', 'This water runs down from our hills. The deer that drink it are ours.'], ['Sena', 'Then the rain is yours too. Come and take it back.'], ['Korr', 'Your woman knows roots. Ours are coughing blood. Send her to us, and keep your river.'], ['Sena', 'I am not sent. If I go, I walk.']],
    fordBanner: ['The Ash People', 'Four hunters on the far bank, hands grey to the wrist. The tall one does not hide his spear.'],
    share: [['Korr', 'Meat, from a stranger. My people will not believe me.'], ['Aro', 'Then let them taste it.'], ['Korr', 'We will meet again, river man. Pray it is as kind.']],
    threaten: [['Aro', 'Cross this water and you will not cross back.'], ['Korr', 'Brave words, with your woman there to hear them.'], ['Korr', 'Remember that you said them. I will.']],
    hold: [['Korr', 'A man who says nothing is either wise or afraid.'], ['Korr', 'We will learn which.']],
    sena: [['Sena', 'Bring your coughing ones to this ford at the full moon. I will look at them here, in the open, where everyone can see my hands.'], ['Korr', 'You would do this? For people who smeared your wall?'], ['Sena', 'For the coughing ones. You I have not decided about.']],
    after: { share: ['Sena', 'You fed a man who came to take me for his sick. I do not know if that was brave or foolish.'], threaten: ['Sena', 'You made an enemy today, Aro. I hope you know what to do with one.'], hold: ['Sena', 'You did not move. Neither did he. I think he respects that, and I think he hates it.'], sena: ['Sena', 'Thank you for letting me speak. Most men would not have.'] },
  },
  outcast: {
    enter: [['Sena', 'Aro. Crows over the Great Tree. Too many crows.'], ['Aro', 'Something is dying out there. Or someone.']],
    trailBanner: ['Blood on the grass', 'A trail of dark drops leads toward the Great Tree.'],
    trailBannerOff: ['Scuffed tracks', 'Dragging marks and scuffed grass lead toward the Great Tree.'],
    found: [['Tamu', 'Finish it, or help me. Only do not stand there looking.'], ['Sena', 'That is an Ash spear in his side. His own people did this.'], ['Tamu', 'Korr\'s spear. I shared meat with a family he had turned away. With Korr, that is a crime.']],
    help: [['Tamu', 'Why?'], ['Sena', 'Because someone once did it for me.']],
    helpFade: 'You pull the spear free. Sena packs the wound with moss and reed. Between you, you get him home.',
    tended: [['Tamu', 'Tamu. That is my name. You should know whose life you are carrying.'], ['Aro', 'Aro. And this is Sena. Rest.']],
    kill: [['Sena', 'He was on the ground, Aro.'], ['Aro', 'So was the wolf by the river. It still bit.'], ['Sena', 'Then bury him. I will not leave him for the crows.']],
    buried: [['Sena', 'Whatever he was, he is this valley\'s now.']],
    leave: [['Tamu', 'Go, then. I will remember your faces.'], ['Sena', 'We left a man to bleed, Aro. I will not forget that either.']],
    dig: ['Tamu', 'Clay? I can dig. Let me be useful, before I am a burden.'],
  },
  jealous: {
    scene: [['Tamu', '…and then the boar sat down on him! On Korr! Like a stool!'], ['Sena', 'Stop, stop. My side hurts.']],
    join: [['Aro', 'Tell it again. From the boar.'], ['Tamu', 'You see? He laughs. I told you he could.']],
    walk: [['Sena', 'You went quiet tonight. I noticed.']],
    forbid: [['Aro', 'You laugh more with him in three days than with me all summer.'], ['Sena', 'When the fever had you in the cold hills, I sat with you three nights. Should I have let you burn, so no one would talk?']],
  },
  reconcile: {
    scene: [['Sena', 'I come here to think. The water does not argue.']],
    afraid: [['Aro', 'I was afraid.'], ['Sena', 'Afraid I would leave? I walked out of the cold hills beside you. I chose that. I keep choosing it.']],
    wrong: [['Aro', 'I was wrong.'], ['Sena', 'Yes. You were.'], ['Sena', '…Come here.']],
    proud: [['Aro', 'I will not be sorry for caring.'], ['Sena', 'Then care quietly, for one more day. Ask me again tomorrow.']],
    away: ['Sena', 'I will sleep by the fire tonight.'],
  },
  winter: {
    enter: [['Sena', 'The geese left early. The old ones always know.'], ['Aro', 'Then we waste nothing. Not a bone.'], ['Sena', 'Fill the basket, Aro. Dried meat, cooked meat, anything that keeps. This cold comes down from the hills like it did the year my mother died.']],
    banner: ['Winter', 'Snow on the valley. The berries are gone, the herds are thin, and the nights bite.'],
    blizzard: ['Blizzard', 'Snow comes sideways off the hills. Get inside, or get to a fire.'],
    blizzardLine: ['Sena', 'Listen to it. Like wolves made of wind.'],
    give: [['Sena', 'Eat.'], ['Aro', 'I ate already.'], ['Sena', 'You lie badly, Aro. You always did.']],
    door: [['', 'Someone is knocking at the door.'], ['Wena', 'Please. We saw your smoke from the ruins.'], ['Wena', 'Not for me. For him. He has not eaten in four days.'], ['Pell', 'I can carry wood. I am strong.']],
    share: [['Sena', 'We had enough for two. It turns out we had enough for four.'], ['Wena', 'I am Wena. This is Pell. We will not forget this door.']],
    refuse: [['Aro', 'We have nothing to spare. I am sorry.'], ['Wena', '…Come, Pell.']],
    refuseAfter: [['Sena', 'Do not say anything. There is nothing that would be right.']],
    trade: [['Wena', 'Korr\'s people winter east of the horse meadow, under the red cliff. That is where we ran from.'], ['Sena', 'Two meals, for that. I hope it was worth it to you.']],
    slingHint: ['Sena', 'Her tracks went toward the ruins, Aro. Go and look. I cannot.'],
    slingBanner: ['An empty camp', 'A windbreak of branches, half buried in snow. No one is here. Only a woman\'s carry-sling, frozen stiff.'],
    sling: [['Sena', 'They were walking toward the smoke of our fire.']],
  },
  raid: {
    warn: [['Pell', 'Aro. Korr is coming. Tomorrow night. I heard them at the ruins.'], ['Pell', 'Korr says the valley feeds no one who does not bleed for it.']],
    surprise: [['Sena', 'Aro! Torches on the hill. Many torches.']],
    banner: ['Fire in the Night', 'Torches on the hill, coming down in a line.'],
    standFade: 'Torches came down the hill in a line. You met them at the edge of the light.',
    fleeFade: 'You ran with Sena into the dark, toward the hollow. Behind you, the sky over your home turned orange.',
    stableFade: 'You held the stable door until the horse stopped screaming. Behind you, the thatch caught.',
    houseFade: 'You held the house. When the smoke cleared, the stable stood empty, the rope cut.',
    wound: [['Sena', 'It is nothing… Aro, I cannot feel my hand.']],
    tamuDies: [['Tamu', 'Tell her… it was a good stitch she sewed.']],
    tamuBuried: 'At first light you buried Tamu beneath the Great Tree.',
    tamuSeen: 'Tamu is on his knees in the trampled snow, his spear knocked away. He came with them.',
    tamuSpare: [['Tamu', 'I had nowhere else to go. You saw to that.'], ['Aro', 'Then go somewhere now. Far.']],
    tamuKill: [['', 'It was quick. Sena did not look away.']],
    dawn: [['Aro', 'Sena. Sena, look at me. Stay awake.']],
  },
  fever: {
    enter: [['Sena', 'It is only a scratch. Only…'], ['Aro', 'Your skin is burning. Lie down. Lie down, Sena.']],
    goals: [['Sena', 'Willow bark… by the river. Yarrow, on the horse meadow. And the grey moss, deep in Flint Deep. My mother… used the moss.']],
    rising: [[40, ['Sena', 'Is it summer? You said we would go to the lake when it was summer.']], [40, ['Aro', 'We will. Stay.']],
      [70, ['Sena', 'Mother? No… no, it is Aro. Your hands are cold. Good.']], [90, ['Sena', 'Do not let them put me under the stones. Not yet. Not yet.']]],
    bled: [['Sena', 'There. It is… less. You press too hard. Do not stop.']],
    remedy: [['Sena', 'Bitter. Like old bark. …It is old bark.'], ['Sena', 'You went all that way. For a weed.'], ['Sena', 'The moss. Yes. She used the moss.']],
    vigilFade: 'You sat on the edge of the bed all night, her hand in yours. Some of what she said was to you, and some was to people long dead.',
    scarred: [['', 'The fever broke near dawn. It took something with it: her left leg would never again be quite her own.'], ['Sena', 'I am still here, Aro. Most of me.']],
    firstKiss: [['Sena', 'You did not sleep.'], ['Aro', 'I did not want to miss it.'], ['Sena', 'Miss what?'], ['Aro', 'You, waking up.']],
  },
  reckoning: {
    enter: [['Sena', 'End it, Aro. One way or another. I will not spend another winter listening for torches.']],
    enterHorse: [['Sena', 'Bring Dawn home, Aro. And then end it, one way or another.']],
    hint: ['Sena', 'Their tracks go east, past the horse meadow. Follow the smoke.'],
    campBanner: ['The Ash Camp', 'Hide shelters around a low fire. Grey hands painted on every one.'],
    meet: [['Korr', 'You came alone. Either you are brave, or she is dead.'], ['Aro', 'She lives. No thanks to you.'], ['Korr', 'Then why are you here, river man?']],
    killFade: 'Korr came at you with the spear. It was short, and it was ugly, and then it was over.',
    kill: [['Sena', 'Is it over?'], ['Aro', 'It is over.'], ['Sena', 'Then why are your hands still shaking?']],
    spareFade: 'You put him in the snow three times. The third time, he stayed down.',
    spare: [['Aro', 'I have buried enough this winter.'], ['Korr', '…Then I owe you a life. The Ash People pay what they owe.']],
    peace: [['Aro', 'Your sick still cough. Sena will come in the spring, with roots. And you will plant this.'], ['Korr', 'Seed? You bring me seed? We burned your…'], ['Aro', 'Plant it. Then you will not need our river.']],
    horseBack: ['', 'Two of Korr\'s hunters lead Dawn out of the shelters and put the rope in your hand.'],
    thawFade: 'The snow went grey, then went to water. In the horse meadow, something new stood up on shaking legs.',
    foal: [['Sena', 'Look at its legs. All knees.'], ['Aro', 'It will grow into them. Everything here does.']],
  },
  hearth: { scorch: ['Sena', 'The walls still smell of smoke. Mend them first, Aro. I want to stop smelling that night.'], repaired: ['Sena', 'There. It is ours again.'] },
  seeds: { gift: ['Grain from the Ash People', 'Korr\'s hunters leave three bundles of seed grain at your door, tied with grey cord.'] },
  bond: {
    enter: [['Sena', 'They say a cord tied at the stones cannot be cut by any knife.'], ['Aro', 'Then let us not test it.'], ['Sena', 'Braid one, Aro. Red ochre and reed. And meet me at the stones when the sun goes down.']],
    marks: [['Sena', 'Here. Your hand. No, the other one.'], ['', 'She draws a line of ochre across your cheek, and you draw one across hers. The cord goes round both your wrists, twice.']],
    kiss: [['', 'You kiss her, slowly, while the light goes out of the sky.']],
    fade: 'The stones kept watch.',
    notReady: ['Sena', 'Not yet. Come back at dusk, with the cord.'],
  },
  remember: [['Sena', 'We should come more often.'], ['Sena', 'I brought him the first flowers.'], ['Sena', 'The stones are warm today. That is something.']],
  memories: 'What Sena remembers',
};

// Vows at the stones (bond). Quoted in the epilogue.
export const VOWS = ['Where you walk, I walk.', 'I will keep the fire, and the fire will keep you.', 'I have nothing to give you but every day I have left.'];

// Short exchanges at the fire for the new chapters (one pair per sit), same voice as the existing VIGNETTES.
export const VIGNETTES = {
  smoke: [[['Sena', 'Do you think they watch us, the grey-hand people?'], ['Aro', 'If they do, they see two people by a fire. Let them look.']], [['Aro', 'You were not afraid at the ford.'], ['Sena', 'I was. I only did not tell my knees.']]],
  outcast: [[['Sena', 'His own people put a spear in him for sharing meat.'], ['Aro', 'Then his people are hungrier than we are.'], ['Sena', 'Or crueller.']], [['Aro', 'What would you have done, if I had not been there?'], ['Sena', 'The same. Only slower, and with more swearing.']]],
  winter: [[['Sena', 'Do you think of them, at the door?'], ['Aro', 'Every time the wind knocks.']], [['Aro', 'Your hands are blue.'], ['Sena', 'Then hold them. That is what they are for.']], [['Sena', 'My mother gave me her share, the winter she died. I am alive because someone did not refuse.'], ['Aro', 'Then she is still feeding people.']]],
  raid: [[['Sena', 'Every sound tonight is a torch.'], ['Aro', 'Then I will listen to them all. You sleep.']], [['Aro', 'My brother Dain died over a carcass. Raiders. I was twelve.'], ['Sena', 'You never told me.'], ['Aro', 'I never wanted it to be true out loud.']]],
  fever: [[['Sena', 'You smell of smoke and willow.'], ['Aro', 'I stood in the river to my knees for you.']], [['Sena', 'Tell me about the lake. In summer.'], ['Aro', 'Warm stones. Your feet in the water. Me, pretending not to look.']]],
  reckoning: [[['Sena', 'When you go east, come back the same man.'], ['Aro', 'I will come back. I cannot promise the same.']], [['Aro', 'Do you hate them?'], ['Sena', 'I am too tired to hate anyone. Ask me in the spring.']]],
  bond: [[['Sena', 'Red on your cheek suits you.'], ['Aro', 'Everything suits me, when you are the one painting it.']], [['Aro', 'Are you sure? About the stones?'], ['Sena', 'I was sure in the cold hills. The stones are only late to hear it.']]],
};

// One line per choice for the chapter-end card recap and the Memories tab ("What Sena remembers").
export const MEM = {
  ford: { share: 'You shared your food with the strangers at the ford.', threaten: 'You threatened Korr across the water.', hold: 'You held your spear and said nothing.', sena: 'You let Sena answer Korr for herself.' },
  outcast: { help: 'You carried a wounded stranger home.', kill: 'You killed a wounded man under the Great Tree.', leave: 'You left a wounded man to bleed.' },
  jealous: { join: 'You sat down with Sena and Tamu and laughed.', walk: 'You walked away from the fire.', forbid: 'You told Sena to keep away from Tamu.' },
  reconcile: { afraid: 'At the lake you told her you were afraid.', wrong: 'At the lake you told her you were wrong.', proud: 'At the lake you would not say sorry.' },
  door: { share: 'You opened the door to Wena and Pell.', refuse: 'You closed the door on a hungry woman and her boy.', trade: 'You traded food for where the Ash People camp.' },
  raid: { stand: 'You stood and defended the home.', flee: 'You ran into the dark with Sena.' },
  guard: { stable: 'You guarded the horse. The house burned.', house: 'You guarded the house. They took the horse.' },
  tamu: { spare: 'You let Tamu go.', kill: 'You killed Tamu in the snow.' },
  korr: { kill: 'You killed Korr.', spare: 'You beat Korr, and let him live.', peace: 'You made peace with the Ash People.' },
  vow: { 0: 'At the stones you said: "Where you walk, I walk."', 1: 'At the stones you said: "I will keep the fire, and the fire will keep you."', 2: 'At the stones you said: "I have nothing to give you but every day I have left."' },
};
export const memText = (id, v) => MEM[id]?.[v] || null;
// The recap under the chapter card: this chapter's choices, in order, as one line.
export function recapLine(memory = [], chId) {
  const m = memory.filter((e) => e.ch === chId).map((e) => e.text);
  return m.length ? m.join(' ') : '';
}

// ----- the epilogue (village), from S.arc. Returns [speaker, text] lines placed before the existing closing lines,
// and the variant ids (for tests and the epilogue props). Legacy and Mature-off runs get the neutral version.
export function epilogueLines(arc = {}, rom = {}) {
  const out = [], ids = [];
  if (arc.legacy || arc.skipped) return { lines: out, ids };
  const c = arc.choices || {};
  if (arc.tribe === 'allied') { ids.push('ash-and-hearth'); out.push(['', 'The Ash People came down from the hills each spring. In Echo Hollow, grey hands and red hands dried side by side on the wall. They called it Ash and Hearth.']); }
  else if (c.korr === 'kill') { ids.push('palisade'); out.push(['', 'You raised a palisade around the village and set a watcher on it every night. We were safe. We were never again at ease.']); }
  else if (c.korr === 'spare') { ids.push('oath'); out.push(['', 'Korr kept his oath. His people traded at the north ford, and never once crossed it with a torch.']); }
  if (arc.wena === 'lost') { ids.push('sling'); out.push(['', 'A woman\'s carry-sling hung from the Great Tree for many years. No one asked whose it was, and no one took it down.']); }
  else if (arc.wena === 'saved') { ids.push('pell'); out.push(['', 'Pell grew tall, and taught Lio to throw a sling.']); }
  if (arc.senaWound === 'scarred') { ids.push('scar'); out.push(['Aro', 'She carried the winter in her leg all her life, and complained of it to no one but me.']); }
  if (arc.tamu === 'dead') {
    ids.push('cairn');
    out.push(['', c.outcast === 'kill' || c.tamu === 'kill' ? 'Beneath the Great Tree there is a cairn. Aro never told the children who lay under it.' : 'Beneath the Great Tree there is a cairn. Each spring, Sena laid the first flowers on it.']);
  } else if (arc.tamu === 'traitor') { ids.push('traitor'); out.push(['', 'Tamu was never seen in the valley again.']); }
  if (rom.vow != null && VOWS[rom.vow]) { ids.push('vow'); out.push(['Sena', `"${VOWS[rom.vow]}" You said that, at the stones. You kept it.`]); }
  return { lines: out, ids };
}
