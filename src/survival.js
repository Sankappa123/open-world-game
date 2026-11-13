// ---------- SURV: injuries, illness, water, spoilage, cooking (pure rules and tables) ----------
// Spec M3 (spec_mature.md §7 M3, §3.4 difficulty keys aff/ill/spoil/cook, §9 balance). No DOM, no THREE, no game
// state: main.js's "SURV" section owns the glue (HUD, body screen, spit, hooks) and passes everything in, so every
// rule here is unit-testable in node (scratchpad/tests/surv/unit.mjs).
//
// Units: afflictions keep game-hour timers (t elapsed, tr remaining) and real-second timers (rt) for the fast parts
// (bleeding, clotting, poison episodes). One game hour is 25 s of real time by day (24 h per 600 s).
//
// Affliction record (S.aff / S.naff): {id, part, sev, t, tr, risk, rt, clean, splint, doses, lastDose, onset, ep, src}
//   id     bleed | wound | infection | sprain | fracture | poison | dysentery | hypo
//   part   head | torso | armL | armR | legL | legR | gut | body

export const PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
export const PART_NAME = { head: 'head', torso: 'body', armL: 'left arm', armR: 'right arm', legL: 'left leg', legR: 'right leg', gut: 'stomach', body: 'whole body' };
export const LEGS = ['legL', 'legR'];

// Display names, moodle icon key, what causes it and what cures it (the tooltip and the body screen use these).
export const AFF = {
  bleed: { name: 'Bleeding', icon: 'bleed', sevName: ['', 'light', 'heavy', 'severe'], rate: [0, 0.15, 0.4, 0.8],
    cure: (a) => (a.sev <= 1 ? 'A fibre bandage stops it' : 'A hide bandage or a yarrow poultice stops it') },
  wound: { name: 'Open wound', icon: 'wound', cure: (a) => (a.clean ? 'Clean and dressed: it is closing' : 'Clean it: a poultice, boiled water, or let Sena tend it') },
  infection: { name: 'Infected wound', icon: 'infection', cure: (a) => (a.doses >= 2 ? 'The fever is breaking: rest' : `Willow-bark tea or a yarrow poultice, twice, 12 h apart (${a.doses || 0}/2)`) },
  sprain: { name: 'Sprained ankle', icon: 'sprain', cure: (a) => (a.splint ? 'Splinted: rest heals it faster' : 'Rest heals it; a splint lets you run again') },
  fracture: { name: 'Broken leg', icon: 'fracture', cure: (a) => (a.splint ? 'Splinted: it mends slowly; ride or lean on Sena' : 'It needs a splint before it can mend') },
  poison: { name: 'Food poisoning', icon: 'poison', cure: () => 'Rest and drink water; mint tea settles it' },
  dysentery: { name: 'Dysentery', icon: 'dysentery', cure: (a) => `Boiled water (${Math.min(4, a.doses || 0)}/4) and rest, or mint tea` },
  hypo: { name: 'Hypothermia', icon: 'hypo', cure: () => 'Shelter by a fire, a snug sleep, or a hot spring' },
};
export const INJURY = new Set(['bleed', 'wound', 'infection', 'sprain', 'fracture', 'hypo']);   // gated by D().aff
export const ILLNESS = new Set(['poison', 'dysentery']);                                        // gated by D().ill

// Remedies: what each item does, in the order the smart treat (H) prefers them.
export const ITEM_NAME = { bandage: 'fibre bandage', hidebandage: 'hide bandage', ypoultice: 'yarrow poultice', poultice: 'herbal poultice', splint: 'splint', minttea: 'mint tea', willowtea: 'willow-bark tea', boiled: 'boiled water' };

const H_PER_MIN = 1 / 60;
export const GAP_H = 10 * H_PER_MIN;          // Survivor: one new affliction per 10 game minutes at most
export const CAP_GENTLE = 3;                  // Survivor: at most 3 active
export const FLOOR = { gentle: 10, fever: 20 }; // Survivor hp floors (afflictions never take hp below these)

// ---------- small helpers ----------
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, arr) => arr[Math.min(arr.length - 1, (rng() * arr.length) | 0)];
export const find = (list, id, part) => list.find((a) => a.id === id && (part == null || a.part === part));
export const worst = (list, id) => list.filter((a) => a.id === id).reduce((m, a) => (!m || a.sev > m.sev ? a : m), null);

// ---------- chances (spec tables) ----------
export function poisonChance(src, ill) {      // src raw | spoiled | under
  if (ill === 'off') return 0;
  const hi = ill === 'high';
  return src === 'raw' ? (hi ? 0.6 : 0.4) : src === 'spoiled' ? (hi ? 0.9 : 0.7) : src === 'under' ? 0.25 : 0;
}
export function waterChance(src, ill) {       // src river | lake | marsh | well | boiled
  if (ill === 'off') return 0;
  const hi = ill === 'high';
  return src === 'lake' || src === 'marsh' ? (hi ? 0.3 : 0.15) : src === 'river' ? (hi ? 0.08 : 0) : 0;
}
export const waterSource = (biome) => (biome === 'lake' ? 'lake' : biome === 'marsh' ? 'marsh' : 'river');

// ---------- adding ----------
// ctx: {aff, ill, gh, last (gh of the last new one), grace, force, hp}
// Returns {a, fresh} or {a:null, why}. Refreshing or worsening an existing one is always allowed (no cap, no gap).
export function canAdd(list, id, ctx) {
  const gate = ILLNESS.has(id) ? ctx.ill : ctx.aff;
  if (!gate || gate === 'off') return 'off';
  if (ctx.grace && !ctx.force) return 'grace';
  if (gate === 'gentle' || gate === 'low' || ctx.mode === 'survivor') {
    if (list.length >= CAP_GENTLE) return 'cap';
    if (!ctx.force && ctx.last != null && ctx.gh - ctx.last < GAP_H) return 'gap';
  }
  return null;
}
export function addAff(list, id, part, sev, ctx) {
  if (!AFF[id]) return { a: null, why: 'unknown' };
  const gate = ILLNESS.has(id) ? ctx.ill : ctx.aff;
  if (!gate || gate === 'off') return { a: null, why: 'off' };
  sev = Math.max(1, Math.min(3, sev | 0 || 1));
  part = part || (id === 'poison' || id === 'dysentery' ? 'gut' : id === 'hypo' ? 'body' : id === 'sprain' || id === 'fracture' ? 'legL' : 'torso');
  // existing on the same part: worsen or refresh (never blocked by the caps)
  const same = list.find((a) => a.id === id && (a.part === part || a.part === 'gut' || a.part === 'body'));
  if (same) {
    if (id === 'bleed') { same.sev = Math.min(3, Math.max(same.sev, sev) + (sev >= same.sev && same.sev < 3 ? 1 : 0)); same.rt = 0; }
    else if (id === 'poison') { same.tr = Math.max(same.tr, 12); }
    else if (id === 'dysentery') { same.tr = Math.max(same.tr, 36); same.doses = 0; }
    else if (id === 'sprain') { same.tr = Math.max(same.tr, 24); same.sev = Math.max(same.sev, sev); }
    else same.sev = Math.max(same.sev, sev);
    return { a: same, fresh: false };
  }
  if (id === 'sprain' && find(list, 'fracture', part)) return { a: find(list, 'fracture', part), fresh: false };   // already broken
  const why = canAdd(list, id, ctx);
  if (why) return { a: null, why };
  const a = { id, part, sev, t: 0, tr: 0, risk: 0, rt: 0, clean: false, splint: false, doses: 0, lastDose: null, src: ctx.src || null };
  if (id === 'wound') { a.tr = 12; a.risk = 0.05; }
  if (id === 'sprain') a.tr = 24 * (sev >= 2 ? 1.5 : 1);
  if (id === 'fracture') { a.tr = 72; const s = find(list, 'sprain', part); if (s) list.splice(list.indexOf(s), 1); }   // a break replaces the sprain
  if (id === 'poison') { a.onset = 1 + (ctx.rng ? ctx.rng() : 0.5); a.tr = 12; a.ep = 20; }
  if (id === 'dysentery') a.tr = 36;
  if (id === 'infection') a.tr = 0;
  if (id === 'hypo') a.tr = 0;
  list.push(a);
  return { a, fresh: true };
}

// ---------- what a hit, a fall or a meal does (rolls) ----------
// e: {kind, dmg, from:{kind, raider, foe, horse, hostile}}, ctx: {aff, hp, rng}. Returns [[id, part, sev], ...].
export function hitRolls(e, ctx) {
  const r = ctx.rng, full = ctx.aff === 'full', out = [], f = e.from || {};
  if (ctx.aff === 'off' || !(e.dmg > 0)) return out;
  const big = f.kind === 'bear' || f.kind === 'bull' || f.kind === 'aurochs';
  if (f.horse) { if (r() < (full ? 0.8 : 0.5)) out.push(['sprain', pick(r, LEGS), 1]); return out; }
  if (e.kind === 'claw' || e.kind === 'gore' || big) { if (r() < (full ? 1 : 0.7)) out.push(['bleed', e.kind === 'gore' ? pick(r, LEGS) : 'torso', 3]); return out; }
  if (e.kind === 'bite') {
    if (r() < (full ? 0.5 : 0.25)) out.push(['bleed', r() < 0.7 ? pick(r, LEGS) : pick(r, ['armL', 'armR']), ctx.hp < 40 ? 2 : 1]);
    return out;
  }
  if (e.kind === 'cut' || e.kind === 'pierce') {
    if (r() < 0.4) out.push(['bleed', pick(r, ['armL', 'armR', 'torso', 'torso', 'legL', 'legR']), e.dmg >= 14 ? 2 : 1]);
    return out;
  }
  return out;
}
// A landing. drop in metres. Returns {dmg, add: [[id, part, sev]]}. Damage applies on every difficulty (dmgK scales it).
export function landRolls(drop, ctx) {
  const r = ctx.rng, out = { dmg: 0, add: [] };
  if (!(drop > 2.5) || ctx.water) return out;
  if (drop > 4) out.dmg = (drop - 4) * 8;
  if (ctx.aff === 'off') return out;
  const leg = pick(r, LEGS);
  if (drop > 6 && ctx.aff === 'full') out.add.push(['fracture', leg, 1]);
  else if (drop > 6) out.add.push(['sprain', leg, 2]);
  else if (drop > 4 || r() < 0.5) out.add.push(['sprain', leg, 1]);
  if (drop > 4) out.add.push(['bleed', leg, 1]);
  return out;
}

// ---------- treatment ----------
// Which item helps an affliction most (null: none in the pack). inv: S.inv, skin: {n, q} for a boiled-water rinse.
const BLEED_ITEMS = (sev) => (sev >= 2 ? ['hidebandage', 'ypoultice', 'poultice', 'bandage'] : ['bandage', 'hidebandage', 'ypoultice', 'poultice']);
export function itemsFor(a, gh) {
  switch (a.id) {
    case 'bleed': return BLEED_ITEMS(a.sev);
    case 'wound': return a.clean ? [] : ['ypoultice', 'poultice', 'boiled'];
    case 'infection': return a.doses >= 2 || (a.lastDose != null && gh - a.lastDose < 12) ? [] : ['willowtea', 'ypoultice'];
    case 'sprain': case 'fracture': return a.splint ? [] : ['splint'];
    case 'poison': return a.tea ? [] : ['minttea'];
    case 'dysentery': return ['minttea'];
    default: return [];
  }
}
export const have = (inv, skin, k) => (k === 'boiled' ? skin && skin.n > 0 && skin.q === 'safe' : (inv[k] || 0) > 0);
export function bestItem(a, inv, skin, gh) { return itemsFor(a, gh).find((k) => have(inv, skin, k)) || null; }
// Priority for the smart treat (H) and "Treat all": worst bleeds, then breaks, infection, dirty wounds, sprains, stomach.
const PRIO = { bleed: 0, fracture: 1, infection: 2, wound: 3, sprain: 4, poison: 5, dysentery: 6, hypo: 9 };
export function treatPlan(list, inv, skin, gh) {
  const out = [], left = { ...inv }, sk = skin ? { ...skin } : null;
  const order = [...list].sort((a, b) => PRIO[a.id] - PRIO[b.id] || b.sev - a.sev);
  for (const a of order) {
    const k = bestItem(a, left, sk, gh);
    if (!k) continue;
    out.push({ a, item: k });
    if (k === 'boiled') sk.n--; else left[k]--;
  }
  return out;
}
// Apply one item to one affliction. Mutates list/a. Returns {ok, msg, used (item consumed), removed}.
export function treat(list, a, item, ctx) {
  const gh = ctx.gh;
  const res = (ok, msg, used = ok) => ({ ok, msg, used });
  if (!a || !list.includes(a)) return res(false, 'Nothing to treat');
  const toWound = (clean) => {
    list.splice(list.indexOf(a), 1);
    const w = find(list, 'wound', a.part);
    if (w) { w.clean = w.clean || clean; w.tr = Math.max(w.tr, 12); return; }
    list.push({ id: 'wound', part: a.part, sev: a.sev, t: 0, tr: clean ? 8 : 12, risk: clean ? 0 : 0.05, rt: 0, clean, splint: false, doses: 0, lastDose: null });
  };
  switch (a.id) {
    case 'bleed':
      if (item === 'bandage') {
        if (a.sev <= 1) { toWound(false); return res(true, 'You bind the cut tight. The bleeding stops'); }
        a.sev--; a.rt = 0; return res(true, 'The fibre slows it, but it is still bleeding');
      }
      if (item === 'hidebandage') { toWound(false); return res(true, 'The hide bandage holds. The bleeding stops'); }
      if (item === 'ypoultice') { toWound(true); return res(true, 'Yarrow packed into the wound: the bleeding stops and it is clean'); }
      if (item === 'poultice') {
        if (a.sev <= 2) { toWound(true); return res(true, 'The poultice stops the bleeding'); }
        a.sev--; a.rt = 0; return res(true, 'The poultice slows it, but it is still bleeding');
      }
      return res(false, 'That will not stop bleeding', false);
    case 'wound':
      if (a.clean) return res(false, 'The wound is already clean', false);
      if (item === 'ypoultice' || item === 'poultice' || item === 'boiled' || item === 'sena') { a.clean = true; a.risk = 0; a.tr = Math.min(a.tr, 8); return res(true, item === 'boiled' ? 'You rinse the wound with boiled water' : item === 'sena' ? 'Sena cleans and dresses the wound' : 'You press the poultice into the wound: it is clean'); }
      return res(false, 'That will not clean a wound', false);
    case 'infection':
      if (item !== 'willowtea' && item !== 'ypoultice') return res(false, 'That will not break a fever', false);
      if (a.doses >= 2) return res(false, 'You have had enough: now rest', false);
      if (a.lastDose != null && gh - a.lastDose < 12) return res(false, `Too soon for another dose (${Math.ceil(12 - (gh - a.lastDose))} h)`, false);
      a.doses++; a.lastDose = gh;
      if (a.doses >= 2) { a.tr = 12; return res(true, 'The second dose. The fever should break with rest'); }
      return res(true, 'The bitter taste of willow. One more dose in 12 hours');
    case 'sprain':
      if (item !== 'splint') return res(false, 'A splint would help', false);
      if (a.splint) return res(false, 'Already splinted', false);
      a.splint = true; a.tr /= 2; return res(true, 'You splint the ankle. You can run on it again');
    case 'fracture':
      if (item !== 'splint') return res(false, 'It needs a splint', false);
      if (a.splint) return res(false, 'Already splinted', false);
      a.splint = true; a.tr = 72; return res(true, 'You set the leg against the splint and bind it. It will mend');
    case 'poison':
      if (item !== 'minttea') return res(false, 'Mint tea would settle it', false);
      if (a.tea) return res(false, 'The tea has done what it can', false);
      a.tea = true; a.tr *= 0.4; return res(true, 'The mint tea settles your stomach');
    case 'dysentery':
      if (item === 'minttea') { list.splice(list.indexOf(a), 1); return res(true, 'The mint tea settles your gut'); }
      if (item === 'boiled') { a.doses = (a.doses || 0) + 1; if (a.doses >= 4) a.tr = Math.min(a.tr, 4); return res(true, `Clean water (${Math.min(4, a.doses)}/4)`); }
      return res(false, 'Clean water or mint tea', false);
    default: return res(false, 'Nothing helps that but warmth', false);
  }
}

// ---------- time ----------
// Real-time part, every frame or every second. ctx: {aff, mode, warm, dt}. Returns {hp (lost), events:[...]}.
// Bleeding drains hp; Survivor sev 1 clots in 60 s (sev 2 in 240 s), Hardcore sev 1 in 120 s; poison episodes.
export function clotSecs(aff, sev) { return aff === 'full' ? (sev <= 1 ? 120 : Infinity) : sev <= 1 ? 60 : sev === 2 ? 240 : Infinity; }
export function realTick(list, dt, ctx) {
  let hp = 0; const ev = [];
  for (const a of [...list]) {
    if (a.id === 'bleed') {
      hp += AFF.bleed.rate[a.sev] * dt; a.rt += dt;
      if (a.rt >= clotSecs(ctx.aff, a.sev)) { list.splice(list.indexOf(a), 1); const w = find(list, 'wound', a.part); if (!w) list.push({ id: 'wound', part: a.part, sev: a.sev, t: 0, tr: 12, risk: 0.05, rt: 0, clean: false, splint: false, doses: 0, lastDose: null }); ev.push({ type: 'clot', a }); }
    } else if (a.id === 'poison' && !(a.onset > 0)) {
      a.ep -= dt;
      if (a.ep <= 0) { a.ep = 75 + (ctx.rng ? ctx.rng() : 0.5) * 30; ev.push({ type: 'retch', a }); }
    } else if (a.id === 'infection' && a.doses < 2) hp += (ctx.aff === 'full' ? 0.04 : 0.025) * dt;
    else if (a.id === 'hypo' && ctx.warm < 20) hp += 0.1 * dt;
  }
  return { hp, events: ev };
}
// Game-hour part. ctx: {aff, mode, rng, bed ('house'|...|null), sheltered, warm, rest (extra slept hours)}.
// Returns events: {type:'heal'|'infect'|'closed'|'onset', a}.
export function hoursTick(list, dh, ctx) {
  const ev = [];
  if (!(dh > 0)) return ev;
  for (const a of [...list]) {
    a.t += dh;
    switch (a.id) {
      case 'wound':
        if (a.clean) { a.tr -= dh; if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); } break; }
        if (ctx.bed === 'house') break;                          // a house bed pauses infection progress
        a.risk = Math.min(1, a.risk + dh / 12);
        if (a.risk >= 1) {
          list.splice(list.indexOf(a), 1);
          const p = ctx.aff === 'full' ? 0.7 : 0.35;
          if (ctx.rng() < p) { const i = { id: 'infection', part: a.part, sev: 2, t: 0, tr: 0, risk: 1, rt: 0, clean: false, splint: false, doses: 0, lastDose: null }; list.push(i); ev.push({ type: 'infect', a: i }); }
          else ev.push({ type: 'closed', a });
        }
        break;
      case 'infection':
        if (a.doses >= 2) { a.tr -= dh; if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); } }
        break;
      case 'sprain':
        a.tr -= dh; if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); }
        break;
      case 'fracture':
        if (a.splint) { a.tr -= dh; if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); } }
        break;
      case 'poison':
        if (a.onset > 0) { a.onset -= dh; if (a.onset <= 0) { a.ep = 4; ev.push({ type: 'onset', a }); } break; }
        a.tr -= dh; if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); }
        break;
      case 'dysentery':
        a.tr -= dh; if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); }
        break;
      case 'hypo':
        if (ctx.sheltered && ctx.warm >= 20) { a.tr += dh; if (a.tr >= 10) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); } }
        break;
    }
  }
  return ev;
}
// Sleep: affliction timers advance 2 h per slept hour (the hours themselves already passed through hoursTick, so this
// adds the second hour). A Snug sleep cures hypothermia; resting together heals x1.5 (an extra half hour per hour).
export function restBonus(list, hours, ctx) {
  const extra = hours * (ctx.together ? 1.5 : 1);
  const ev = [];
  for (const a of [...list]) {
    if (a.id === 'hypo' && ctx.tier === 'Snug') { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); continue; }
    if (a.id === 'sprain' || (a.id === 'fracture' && a.splint) || a.id === 'poison' || a.id === 'dysentery' || (a.id === 'infection' && a.doses >= 2) || (a.id === 'wound' && a.clean)) {
      a.tr -= extra * (a.id === 'dysentery' && a.doses >= 4 ? 2 : 1);
      if (a.id === 'poison' && a.onset > 0) a.onset = 0;
      if (a.tr <= 0) { list.splice(list.indexOf(a), 1); ev.push({ type: 'heal', a }); }
    }
  }
  return ev;
}
// Hypothermia risk: fills while warmth < 20 over 90 (Survivor) / 45 (Hardcore) game minutes, drains when warm.
export function hypoRisk(risk, dh, warm, aff) {
  if (aff === 'off') return 0;
  const fill = aff === 'full' ? 0.75 : 1.5;
  return warm < 20 ? Math.min(1, risk + dh / fill) : Math.max(0, risk - dh / (warm > 50 ? 0.5 : 2));
}

// ---------- modifiers ----------
// ctx: {lean, ride, warm, aff}. Read by updatePlayer (speed/sprint/jump/stamina), updateStats (drains, chill, regen,
// floors) and the spear aim (wobble).
export function affMods(list, ctx = {}) {
  const m = { speed: 1, stamCap: 100, stamRegen: 1, foodK: 1, waterK: 1, chillK: 1, warmGainK: 1, noSprint: false, noJump: false, regenK: 1, aimWobble: 0, hpFloor: 0, limp: 0, pain: 0, fever: 0, nausea: 0, bleed: 0 };
  for (const a of list) {
    switch (a.id) {
      case 'bleed': m.regenK = 0; m.bleed = Math.max(m.bleed, a.sev); if (a.part === 'armL' || a.part === 'armR') m.aimWobble += 0.01 * a.sev; break;
      case 'wound': m.regenK = Math.min(m.regenK, a.clean ? 0.8 : 0.5); break;
      case 'infection': m.regenK = 0; m.stamCap = Math.min(m.stamCap, 70); m.fever = a.doses >= 2 ? 0.4 : 1; m.aimWobble += 0.012; if (ctx.aff !== 'full') m.hpFloor = Math.max(m.hpFloor, FLOOR.fever); break;
      case 'sprain': m.speed = Math.min(m.speed, a.splint ? 0.85 : 0.7); if (!a.splint) m.noSprint = true; m.noJump = true; m.limp = Math.max(m.limp, a.splint ? 0.45 : 0.8); break;
      case 'fracture': m.speed = Math.min(m.speed, ctx.lean ? 0.6 : a.splint ? 0.45 : 0.35); m.noSprint = true; m.noJump = true; m.limp = 1; m.pain = Math.max(m.pain, a.splint ? 0.35 : 0.8); m.aimWobble += 0.008; break;
      case 'poison': if (!(a.onset > 0)) { m.stamCap = Math.min(m.stamCap, 50); m.nausea = 1; } break;
      case 'dysentery': m.waterK = Math.max(m.waterK, 2.5); m.foodK = Math.max(m.foodK, 1.5); m.stamCap = Math.min(m.stamCap, 60); break;
      case 'hypo': m.stamCap = Math.min(m.stamCap, 50); m.warmGainK = 0.5; m.stamRegen = 0.7; m.aimWobble += 0.015; break;
    }
  }
  if (ctx.aff === 'gentle') m.hpFloor = Math.max(m.hpFloor, FLOOR.gentle);
  return m;
}

// ---------- spoilage ----------
// Hours until a food spoils, [Survivor, Hardcore]. Dried food and grain never spoil.
export const SPOIL = { meat: [24, 12], fish: [12, 8], cooked: [72, 48], grilled: [48, 36], berry: [96, 72], bread: [120, 96] };
export const FOODS = Object.keys(SPOIL);
export const AGE_CAP = 40;
export function spoilHours(k, mode) { const s = SPOIL[k]; return !s || mode === 'off' ? Infinity : s[mode === 'hardcore' ? 1 : 0]; }
// ages: {k: [hours accrued, ...]} kept oldest-first. Reconcile against the counts: a lost item takes the oldest age,
// a new item (given, or an old save) starts fresh.
export function reconcile(ages, inv) {
  for (const k of FOODS) {
    const n = Math.max(0, Math.min(AGE_CAP, inv[k] | 0)), L = (ages[k] ||= []);
    if (L.length > n) L.splice(0, L.length - n);
    while (L.length < n) L.push(0);
    if (!L.length) delete ages[k];
  }
}
// Age everything by dh game hours at rate mul; return {k: spoiled count} and move them to inv.spoiled.
export function ageFood(ages, inv, dh, mode, mul = 1) {
  const out = {};
  if (mode === 'off' || !(dh > 0)) return out;
  reconcile(ages, inv);
  for (const k of FOODS) {
    const L = ages[k]; if (!L) continue;
    for (let i = 0; i < L.length; i++) L[i] += dh * mul;
    const lim = spoilHours(k, mode);
    while (L.length && L[0] >= lim) { L.shift(); inv[k]--; inv.spoiled = (inv.spoiled || 0) + 1; out[k] = (out[k] || 0) + 1; }
    if (!L.length) delete ages[k];
  }
  return out;
}
// Fraction of the shelf life left for the oldest of k (1 fresh .. 0 about to spoil), for the HUD.
export function freshness(ages, k, mode) { const L = ages[k]; const lim = spoilHours(k, mode); return !L || !L.length || lim === Infinity ? 1 : Math.max(0, 1 - L[0] / lim); }
// Move n of k from one age store to another (oldest first), e.g. pack -> basket.
export function moveAges(from, to, k, n) {
  const A = from[k] || [], B = (to[k] ||= []);
  const moved = A.splice(0, Math.min(n, A.length));
  while (moved.length < n) moved.push(0);
  B.push(...moved); B.sort((a, b) => b - a);
  if (!A.length) delete from[k];
  if (B.length > AGE_CAP) B.splice(0, B.length - AGE_CAP);
}

// ---------- the spit ----------
// Seconds on the spit -> doneness. 0-7 undercooked (raw below 2), 7-15 cooked (the green window), 15-18 well done,
// over 18 burnt (lost).
export const SPIT = { raw: 2, under: 7, done: 15, burn: 18, max: 3 };
export function doneness(t) { return t < SPIT.raw ? 'raw' : t < SPIT.under ? 'under' : t <= SPIT.done ? 'cooked' : t <= SPIT.burn ? 'well' : 'burnt'; }
export const SPIT_OUT = { meat: 'cooked', fish: 'grilled' };

// ---------- moodle tooltips ----------
export function describe(a, gh) {
  const D = AFF[a.id]; if (!D) return '';
  const where = a.part && PART_NAME[a.part] && a.part !== 'gut' && a.part !== 'body' ? ` · ${PART_NAME[a.part]}` : '';
  const sev = a.id === 'bleed' ? ` (${D.sevName[a.sev]})` : '';
  let when = '';
  if (a.id === 'wound' && !a.clean) when = ` · infection risk ${Math.round(a.risk * 100)}%`;
  else if (a.id === 'poison' && a.onset > 0) when = ' · your stomach feels wrong';
  else if (a.tr > 0 && a.id !== 'hypo') when = ` · ${Math.ceil(a.tr)} h`;
  return `${D.name}${sev}${where}${when}. ${D.cure(a, gh)}.`;
}
// Severity tier for the ring colour: 1 yellow, 2 orange, 3 red.
export function tier(a) {
  switch (a.id) {
    case 'bleed': return a.sev;
    case 'wound': return a.clean ? 1 : a.risk > 0.6 ? 3 : 2;
    case 'infection': return a.doses >= 2 ? 2 : 3;
    case 'fracture': return a.splint ? 2 : 3;
    case 'sprain': return a.splint ? 1 : 2;
    case 'poison': return a.onset > 0 ? 1 : 2;
    case 'dysentery': return 2;
    case 'hypo': return 3;
    default: return 1;
  }
}
// The draining arc (0..1): time left, or risk filling for an unclean wound.
export function arc(a) { return Math.min(1, Math.max(0, arc0(a))); }
function arc0(a) {
  switch (a.id) {
    case 'wound': return a.clean ? Math.max(0, a.tr / 8) : a.risk;
    case 'sprain': return a.tr / (24 * (a.sev >= 2 ? 1.5 : 1));
    case 'fracture': return a.splint ? Math.max(0, a.tr / 72) : 1;
    case 'poison': return a.onset > 0 ? 1 : Math.max(0, a.tr / 12);
    case 'dysentery': return Math.max(0, a.tr / 36);
    case 'infection': return a.doses >= 2 ? Math.max(0, a.tr / 12) : 1;
    case 'hypo': return 1 - Math.min(1, a.tr / 10);
    case 'bleed': return 1;
    default: return 1;
  }
}
