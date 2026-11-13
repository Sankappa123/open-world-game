// ---------- MAT mature foundation: pure data and small DOM helpers ----------
// The game-coupled half (playerHurt, downed/rescue, permadeath, settings UI wiring) lives in main.js's
// "MAT mature foundation" section. Everything here is plain data or DOM-only, so the tables can be unit-tested in node.
//
// CONTENT GUARDRAILS (spec §2 as updated by §12; binding on every package):
// - Romance is strictly non-explicit: hand-holding, embrace, kiss, resting together clothed. Intimacy cuts or fades to
//   black at the embrace, then the next morning. No sex scenes, sexual sounds/text, nudity, undressing or underwear meshes.
// - No sexual violence or threat of it, anywhere.
// - Children (Lio, Pell, any child) are never harmed, targeted, endangered on screen or shown dead; no gore near them.
// - Violence: combat and hunting violence at full 21+ intensity (blood, wounds, dismemberment of raiders/predators/prey
//   on heavy and finisher kills). No torture mechanics, no prolonged cruelty to the helpless as spectacle; a surrendered
//   raider dies only by an explicit choose() pick, never by default, and quickly.
// - The death of a main character is non-graphic: no blood on the death screen or the memorial, even with Blood on.
// - Settings always win (Blood off, Gore low, Romance fade/off, Mature story off).

export const CONTENT_V = 1;                      // bump to show the content notice again after a content change

// Content presets. FULL is the default (spec §12); TONED is the opt-in "Use toned-down mode".
export const FULL = { blood: 'on', gore: 'high', screenBlood: true, finisherCam: true, romance: 'full' };
export const TONED = { blood: 'off', gore: 'low', screenBlood: false, finisherCam: false, romance: 'fade' };

export const NOTICE = 'Hearthborn is intended for adults (21+). It contains blood, graphic and realistic violence toward animals and people '
  + '(including dismemberment), injury, illness, death and grief, and mature relationship themes. Romance is non-explicit: no nudity and no sexual content.';

// ----- difficulty (spec §3.4). D() in main.js returns diffOf(S.diff.mode, S.diff.custom), cached.
export const DIFF = {
  story: {
    drainK: 0.75, chillK: 0.75, dmgK: 0.6, foeHpK: 0.7, pack: [2, 2], aff: 'off', ill: 'off', spoil: 'off', cook: 'instant',
    nodeK: 0.8, animalRespawn: 60, herdK: 1, meat: [2, 4], revive: 'always', senaFate: 'never', death: 'rescue', saves: 'free', grace: 'none',
  },
  survivor: {
    drainK: 1, chillK: 1, dmgK: 1, foeHpK: 1, pack: [3, 3], aff: 'gentle', ill: 'low', spoil: 'survivor', cook: 'spit',
    nodeK: 1.3, animalRespawn: 150, herdK: 1, meat: [2, 4], revive: 'always', senaFate: 'recover', death: 'penalty', saves: 'free', grace: 'hunt',
  },
  hardcore: {
    drainK: 1.3, chillK: 1.4, dmgK: 1.6, foeHpK: 1.25, pack: [3, 5], aff: 'full', ill: 'high', spoil: 'hardcore', cook: 'spit',
    nodeK: 2.2, animalRespawn: 300, herdK: 0.6, meat: [1, 2], revive: 'daily', senaFate: 'die', death: 'perma', saves: 'auto', grace: '24h',
  },
};
export const MODE_ORDER = ['story', 'survivor', 'hardcore'];
export const MODES = {
  story: { name: 'Story', tag: 'For the tale', lines: ['Gentle hunger and cold, plenty to gather', 'Wounds are only skin deep; no illness or spoilage', 'Fall, and Sena always carries you home'] },
  survivor: { name: 'Survivor', tag: 'The valley as it is', lines: ['Injuries, illness and food that spoils', 'Fall, and Sena can reach you in time', 'A death costs your food and your strength'] },
  hardcore: { name: 'Hardcore', tag: 'One life', lines: ['Scarce food, harder enemies, deeper wounds', 'Sena revives you once a day, with a bandage', 'Death is permanent; the save is deleted'] },
};
// Custom… slider ranges (the new-game modal); keys match DIFF keys.
export const CUSTOM_RANGE = { drainK: [0.75, 1.3], nodeK: [0.8, 2.2], dmgK: [0.6, 1.6] };

// The preset merged with the Custom… overrides. custom: {aff, ill, spoil, perma: bool, drainK, nodeK, dmgK: number}
export function diffOf(mode, custom) {
  const base = DIFF[mode] || DIFF.survivor, d = { ...base, mode: DIFF[mode] ? mode : 'survivor' };
  if (!custom) return d;
  const c = custom;
  if (c.aff === false) d.aff = 'off'; else if (c.aff === true && d.aff === 'off') d.aff = 'gentle';
  if (c.ill === false) d.ill = 'off'; else if (c.ill === true && d.ill === 'off') d.ill = 'low';
  if (c.spoil === false) d.spoil = 'off'; else if (c.spoil === true && d.spoil === 'off') d.spoil = 'survivor';
  if (c.perma === true) { d.death = 'perma'; d.saves = 'auto'; } else if (c.perma === false && d.death === 'perma') { d.death = 'penalty'; d.saves = 'free'; }
  for (const k in CUSTOM_RANGE) if (typeof c[k] === 'number' && isFinite(c[k])) d[k] = Math.min(CUSTOM_RANGE[k][1], Math.max(CUSTOM_RANGE[k][0], c[k]));
  d.custom = true;
  return d;
}
// Wolves in one pack event: preset range, +1 after the house chapter, never more than 6.
export function packSize(d, afterHouse, r = Math.random()) {
  const [a, b] = d.pack; return Math.min(6, a + Math.floor(r * (b - a + 1)) + (afterHouse ? 1 : 0));
}
// Mid-run mode changes: Story <-> Survivor freely; Hardcore can only be lowered (and is then "softened").
export function canSetMode(cur, next, isNewGame = false) {
  if (!DIFF[next]) return false;
  if (isNewGame || next === cur) return true;
  if (next === 'hardcore') return false;                     // raising to Hardcore only at a new game
  return true;
}

// ----- event bus (spec §5.1). Listeners run by order; a listener may set e.cancel to stop the rest.
export const BUS = {};
export function on(ev, fn, order = 50) { (BUS[ev] ||= []).push({ fn, order }); BUS[ev].sort((a, b) => a.order - b.order); return fn; }
export function off(ev, fn) { const l = BUS[ev]; if (!l) return; const i = l.findIndex((h) => h.fn === fn); if (i >= 0) l.splice(i, 1); }
export function emit(ev, e = {}) {
  for (const h of BUS[ev] || []) {
    try { h.fn(e); } catch (err) { console.error(`[bus] ${ev} listener failed`, err); }
    if (e.cancel) break;
  }
  return e;
}

// ----- monotonic game clock (spec §4.3). Returns the hours to add for a move of the wrapping S.time from lastT to t.
// Forward jumps under 20 h (a night's rest, a sit, a rescue) count; anything else (a debug jump back) is ignored.
export function clockDelta(lastT, t) { const d = (t - lastT + 24) % 24; return d < 20 ? d : 0; }

// ----- Survivor death penalty (spec §7 M1): all carried meat, fish, cooked, grilled, bread; half the fibre and berries.
export const PENALTY_ALL = ['meat', 'fish', 'cooked', 'grilled', 'bread', 'dried', 'driedfish', 'spoiled'];
export function penaltyLoss(inv) {
  const lost = {};
  for (const k of PENALTY_ALL) if (inv[k] > 0) lost[k] = inv[k];
  for (const k of ['fiber', 'berry']) if (inv[k] > 1) lost[k] = Math.ceil(inv[k] / 2);
  return lost;
}

// ----- the Stones (memorial; spec §4.4). localStorage only, never the server.
export const STONES_KEY = 'hearthborn-stones';
export function readStones(ls = globalThis.localStorage) {
  try { const a = JSON.parse(ls?.getItem(STONES_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function pushStone(entry, ls = globalThis.localStorage) {
  const a = readStones(ls); a.push(entry);
  try { ls?.setItem(STONES_KEY, JSON.stringify(a.slice(-60))); } catch {}
  return a.length;
}
// Epitaph templates, picked by what the run achieved. Never mentions wounds or blood.
export function epitaph(e) {
  const d = e.days === 1 ? 'one day' : `${e.days} days`;
  if (e.cause === 'sena') {
    if (e.kids > 0) return `Sena, who knew every root in the valley and sang the children to sleep. For ${d} she and Aro kept one fire. Now it is embers.`;
    return `Sena, who walked out of the cold hills beside him. For ${d} she and Aro kept one fire. Now it is embers.`;
  }
  if (e.kids > 0) return `Aro, who built a home where there was none, and a family inside it. ${cap(d)} in the valley were enough.`;
  if (e.close >= 75) return `Aro, who was loved and knew it. He lived ${d} in the valley with Sena.`;
  if (e.wolves >= 5) return `Aro, who stood between the wolves and the fire. ${cap(d)}, and he never ran.`;
  if (e.house) return `Aro, who raised walls of fired earth by the river. He lived ${d} in the valley and was loved.`;
  if (e.days <= 2) return `Aro, who came out of the cold hills with nothing but Sena. She remembers him.`;
  return `Aro, who made the first fire. He lived ${d} in the valley and was loved.`;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
// Death cause -> a short, non-graphic line for the memorial.
export function causeLine(why = '', who = 'P') {
  const w = String(why).toLowerCase();
  if (who === 'N' || w === 'sena') return 'Sena could not be saved';
  if (/wolf|wolves|pack|bite/.test(w)) return 'Fell to the wolves';
  if (/bear/.test(w)) return 'Fell to the cave bear';
  if (/aurochs|bull|gore/.test(w)) return 'Trampled by the aurochs';
  if (/raid|ash|korr|spear|cut/.test(w)) return 'Fell defending the valley';
  if (/cold|freez|hypo/.test(w)) return 'Taken by the cold';
  if (/thirst/.test(w)) return 'Taken by thirst';
  if (/hunger|starv/.test(w)) return 'Taken by hunger';
  if (/fever|infect|ill|sick|poison|dysent/.test(w)) return 'Taken by fever';
  if (/fall/.test(w)) return 'A bad fall';
  if (/bleed|blood/.test(w)) return 'Lost too much strength';
  return 'Gone too soon';
}

// ----- choose() panel DOM (spec §5.3). main.js owns the state (busy, pointer, keys); this only draws.
export function renderChoice(root, title, options, note, timer) {
  root.innerHTML = '';
  const h = document.createElement('h3'); h.className = 'serif'; h.textContent = title; root.append(h);
  if (note) { const s = document.createElement('small'); s.textContent = note; root.append(s); }
  const btns = options.map((o, i) => {
    const b = document.createElement('button'), ok = !o.req || !!o.req();
    b.disabled = !ok; b.dataset.i = i;
    b.innerHTML = `<kbd>${i + 1}</kbd><span><strong></strong>${o.hint || !ok ? '<em></em>' : ''}</span>`;
    b.querySelector('strong').textContent = o.label;
    if (b.querySelector('em')) b.querySelector('em').textContent = o.hint || 'Not possible now';
    root.append(b); return b;
  });
  let bar = null;
  if (timer > 0) { const t = document.createElement('i'); t.className = 'ch-timer'; bar = document.createElement('b'); t.append(bar); root.append(t); }
  return { btns, bar };
}
