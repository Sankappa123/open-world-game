// CMB raider AI: the Ash People (spec_mature.md §7 M4 task 12; M5 ARC consumes it through spawnRaider/foes).
// Perception (sight cone, hearing, a detection meter), an FSM (patrol/camp -> suspicious -> search -> combat ->
// flee | downed | dead), combat roles (brawler with attack tokens, thrower, torchbearer, leader), telegraphed attacks
// (white glint = block or parry it, red = dodge it), blocking, posture, surrender with a choice (never an automatic
// kill), and quick, bloody deaths: every hit is emitted as 'foeHit' {f, o, dmg, kind, weapon, heavy, point, dir, kill},
// which GORE turns into blood, wounds and (Gore High, axe finishers / heavy axe kills, no child near) dismemberment.
// Target selection is restricted in code to Aro, Sena and structures: children are never a target.
import * as THREE from 'three';
import { FOE_HP, FOE_DMG, inFront, sightRange, hearRange, detectRate, shouldFlee, tokens, raiderBlockChance, postureAdd, postureTick, POSTURE, makeBar } from './combat.js';

const NAMES = ['Hask', 'Orun', 'Teb', 'Vael', 'Druk', 'Sarn', 'Ilka', 'Mott', 'Gath', 'Ruun'];
const ROLES = ['brawler', 'thrower', 'brawler', 'torchbearer', 'brawler', 'thrower'];
const MAX_LIVE = 6;                                  // + Korr (spec §5.9)
const SP_G = 6;                                      // the spear's gravity (the same as the player's throw)

export function createTribe(ctx) {
  const { P, N, scene, foes } = ctx;
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _hp = new THREE.Vector3();
  const spears = [];                                 // thrown raider spears in flight / stuck
  let nameI = 0, hist = [];
  const live = () => foes.filter((f) => f.live && !f.fled && f.state === 'live');
  const isKid = (t) => !!t && (t.child || ctx.kids().includes(t));
  const tgtPos = (t) => t.pos || t.root?.position || _v.set(t.x, 0, t.z);

  // ---------- the body ----------
  function necklace(h) {
    const g = new THREE.Group(), bone = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 }), cord = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const a = -1.15 + (i / 8) * 2.3, m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, i % 2 ? 0.045 : 0.065, 5), bone);
      m.position.set(Math.sin(a) * 0.085, -0.035 - Math.cos(a) * 0.012, Math.cos(a) * 0.085); m.rotation.x = 0.25; g.add(m);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.004, 4, 18), cord); ring.rotation.x = Math.PI / 2; ring.position.y = -0.01; g.add(ring);
    g.position.set(0, 0.03, 0.01);
    h.bones.neck_01?.add(g);
    return g;
  }
  function makeTribesman({ chief = false, female = false, name = '' } = {}) {
    const h = ctx.makeHuman({ female, hair: female ? 'long' : 'buzz', beard: !female, hairColor: chief ? 0x1c1612 : 0x2a221c, tint: chief ? 0xa8a29c : 0xb6b0aa, scale: chief ? 1.06 : 0.98 + Math.random() * 0.05 });
    // ash: GORE's paint layer when present, else the skin is greyed
    if (!ctx.paint?.(h, chief)) h.root.traverse((o) => { if (o.isSkinnedMesh && !/hair/i.test(o.material.name)) o.material.color.multiplyScalar(0.8); });
    necklace(h);
    h.useGrip();
    return { h, chief, female, name };
  }

  // ---------- spawn / clear ----------
  function spawnRaider(x, z, opts = {}) {
    const n = live().filter((f) => !f.chief).length;
    if (n >= MAX_LIVE && !opts.chief) return null;
    const chief = !!opts.chief, name = opts.name || (chief ? 'Korr' : NAMES[nameI++ % NAMES.length]);
    const role = opts.role || (chief ? 'leader' : ROLES[n % ROLES.length]);
    const { h } = makeTribesman({ chief, female: !!opts.female, name });
    const f = {
      foe: true, raider: true, kind: chief ? 'korr' : 'raider', name, chief, role, h, root: h.root,
      pos: new THREE.Vector3(x, 0, z), face: opts.face ?? Math.random() * 6.283, speed: 0, swim: false,
      hp: 0, maxHp: 0, live: true, fled: false, state: 'live', mode: opts.mode || 'patrol', alert: opts.mode === 'combat' ? 1 : 0,
      last: new THREE.Vector3(x, 0, z), searchT: 0, seenT: 0, target: null, posture: 0, postureT: 0, stagger: 0, atk: null, cool: 1 + Math.random(),
      surrender: !!opts.surrender, noFlee: !!opts.noFlee || chief, home: { x: opts.homeX ?? x, z: opts.homeZ ?? z }, ring: 3.5, ringA: Math.random() * 6.283,
      throwT: 2 + Math.random() * 2, hits: 0, kb: null, wpn: null, tags: opts.tags || {}, deadT: 0,
    };
    f.hp = f.maxHp = (opts.hp ?? (chief ? FOE_HP.korr : FOE_HP.raider)) * ctx.D().foeHpK;
    // an animal-like adapter so hurt()/GORE listeners can treat a raider like any other victim
    f.a = { root: h.root, model: h.root.children[0], bone: (b) => h.bones[b] || null, play() {}, update() {}, get busy() { return false; } };
    // weapons by role
    const wpn = role === 'thrower' ? 'spear' : role === 'torchbearer' ? 'torch' : role === 'leader' ? 'axe' : Math.random() < 0.5 ? 'axe' : 'spear';
    giveWeapon(f, wpn, opts.flint);
    f.meter = makeBar(0.55, 0.1); scene.add(f.meter);
    f.pbar = makeBar(0.7, 0.07); scene.add(f.pbar);
    h.root.position.set(x, ctx.getHeight(x, z), z); h.root.rotation.y = f.face;
    scene.add(h.root);
    foes.push(f);
    if (f.mode === 'combat') enterCombat(f, false);
    ctx.emit('raiderSpawn', { f });
    return f;
  }
  function giveWeapon(f, k, flint) {
    const h = f.h;
    if (f.wpnMesh) { f.wpnMesh.parent?.remove(f.wpnMesh); f.wpnMesh = null; }
    f.wpn = k;
    if (k === 'spear') { h.spear.visible = true; h.spear.userData.setFlint?.(!!flint); h.place(h.spear, 'hand'); h.gripR = 1; }
    else if (k === 'axe') { h.axe.visible = true; h.axe.userData.setFlint?.(!!flint); h.place(h.axe, 'hand'); h.gripR = 1; }
    else if (k === 'torch') {
      const t = ctx.makeTorch(); t.root.userData.kind = 'torch'; t.lit = true; t.light.intensity = 0;   // flame only: no new lights (§5.9)
      t.light.visible = false; f.torch = t; f.wpnMesh = t.root; h.place(t.root, 'handL'); h.gripL = 1;
    } else { h.gripR = 1; h.gripL = 1; }
  }
  function dropWeapon(f) {                           // on the ground at his feet
    const h = f.h, m = f.wpn === 'spear' ? h.spear : f.wpn === 'axe' ? h.axe : f.wpnMesh;
    if (!m || !m.visible) return;
    scene.attach(m);
    const a = Math.random() * 6.283, x = f.pos.x + Math.sin(a) * 0.6, z = f.pos.z + Math.cos(a) * 0.6;
    m.position.set(x, ctx.getHeight(x, z) + 0.05, z); m.rotation.set(-Math.PI / 2, 0, a); m.updateMatrixWorld(true);
    if (f.torch) { f.torch.lit = false; }
    f.dropped = m; f.wpn = 'none';
  }
  function disposeFoe(f) {
    scene.remove(f.h.root, f.meter, f.pbar);
    if (f.dropped) scene.remove(f.dropped);
  }
  function clearFoes() {
    for (const f of foes) disposeFoe(f);
    foes.length = 0;
    for (const s of spears) scene.remove(s.m);
    spears.length = 0;
  }

  // ---------- perception ----------
  function perceive(f, dt) {
    const pp = P.pos, dx = pp.x - f.pos.x, dz = pp.z - f.pos.z, d = Math.hypot(dx, dz);
    const env = ctx.env();
    const range = sightRange({ night: env.night, torch: ctx.torchLit(), sneak: P.sneak, forest: ctx.biome(pp.x, pp.z) === 'pine' });
    const sees = d < range && inFront(f.face, dx, dz, 110) && !(env.cave > 0.5);
    const combatNear = foes.some((o) => o !== f && o.live && o.mode === 'combat' && Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) < 35);
    const hears = d < hearRange({ speed: P.speed, sneak: P.sneak, combat: false }) || (combatNear && d < 35);
    if (sees || hears) {
      f.alert = Math.min(1.2, f.alert + (sees ? detectRate(d, range) : 0.6 + (combatNear ? 2 : 0)) * dt);
      f.last.copy(pp); f.seenT = 0;
    } else { f.seenT += dt; if (f.mode !== 'combat') f.alert = Math.max(0, f.alert - 0.12 * dt); }
    return sees;
  }
  function enterCombat(f, shout = true) {
    if (f.mode === 'combat' || f.mode === 'flee' || f.mode === 'downed') return;
    f.mode = 'combat'; f.alert = 1; f.cool = 0.8 + Math.random();
    if (shout) { ctx.sfx.shout(f.pos, f.chief); for (const o of foes) if (o !== f && o.live && o.mode !== 'combat' && Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) < 25) { o.alert = 1; o.last.copy(P.pos); enterCombat(o, false); } }
    ctx.emit('raiderAlert', { f });
  }

  // ---------- targets: Aro, Sena, structures. Never a child (asserted). ----------
  function pickTarget(f) {
    if (f.role === 'torchbearer' && f.wpn === 'torch') {
      let best = null, bd = 45;
      for (const s of ctx.structs) { if (s.rise < 1 || (s.scorch || 0) >= 1 || s.village) continue; const d = Math.hypot(s.x - f.pos.x, s.z - f.pos.z); if (d < bd) { bd = d; best = s; } }
      if (best) return best;
    }
    const dP = Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z);
    const nOk = !(N.downed > 0) && !N.ride && (ctx.S().nhp > 0) && !ctx.senaSafe();
    const dN = nOk ? Math.hypot(N.pos.x - f.pos.x, N.pos.z - f.pos.z) : 1e9;
    const t = (P.downed > 0 || ctx.aroDown()) && nOk ? N : dN + 3 < dP ? N : P;
    console.assert(!isKid(t) && (t === P || t === N || t.kind), 'CMB: a raider may only target Aro, Sena or a structure');
    return t;
  }

  // ---------- attacks ----------
  const handPos = (f, out = _v2) => { f.h.bones.hand_r.getWorldPosition(out); return out; };
  function startAttack(f, t) {
    const heavy = Math.random() < (f.chief ? 0.4 : 0.25);
    const wind = heavy ? 0.6 : 0.45;
    f.atk = { t: 0, wind, heavy, target: t, struck: false };
    const clip = f.wpn === 'spear' ? 'jabU' : heavy ? 'swordC' : (f.combo = (f.combo || 0) + 1) % 2 ? 'swordA' : 'swordB';
    f.h.swing(f.wpn === 'none' ? (heavy ? 'hookU' : 'jabU') : clip, heavy ? 0.85 : 0.75);
    ctx.glint(() => handPos(f, _hp), heavy, wind + 0.1);
    ctx.sfx.grunt(f.pos, heavy);
  }
  function tickAttack(f, dt) {
    const a = f.atk; a.t += dt;
    if (!a.struck && a.t >= a.wind) {
      a.struck = true;
      const t = a.target, tp = tgtPos(t), dx = tp.x - f.pos.x, dz = tp.z - f.pos.z, d = Math.hypot(dx, dz);
      ctx.sfx.whoosh(f.pos);
      if (d < 2.2 && inFront(f.face, dx, dz, 70) && (t === P || t === N)) {
        console.assert(!isKid(t), 'CMB: raider strike on a child');
        ctx.playerHurt({ who: t === N ? 'N' : 'P', dmg: a.heavy ? FOE_DMG.raiderHeavy : FOE_DMG.raider, kind: f.wpn === 'spear' ? 'pierce' : f.wpn === 'none' ? 'blunt' : 'cut', from: f, red: a.heavy });
      }
    }
    if (a.t >= a.wind + 0.5) { f.atk = null; f.cool = (f.chief ? 1.0 : 1.4) + Math.random() * 0.8; }
  }
  // the thrower's spear: the same flight model as Aro's (gravity 6), aimed with a lead
  function throwSpear(f, t) {
    const tp = tgtPos(t); handPos(f, _v);
    const dx = tp.x - _v.x, dz = tp.z - _v.z, d = Math.hypot(dx, dz), sp = 19, tt = d / sp;
    const vel = new THREE.Vector3(dx / tt, (tp.y + 1.1 - _v.y + 0.5 * SP_G * tt * tt) / tt, dz / tt);
    const m = ctx.makeSpear(); m.userData.kind = 'spear'; scene.add(m);
    spears.push({ m, pos: _v.clone(), vel, from: f, t: 0, st: 'air', target: t });
    f.h.spear.visible = false; f.reloadT = 3.2;
  }
  function updateSpears(dt) {
    for (let i = spears.length - 1; i >= 0; i--) {
      const s = spears[i];
      if (s.st === 'air') {
        s.vel.y -= SP_G * dt; s.pos.addScaledVector(s.vel, dt); s.t += dt;
        _v.copy(s.vel).normalize(); s.m.position.copy(s.pos); s.m.lookAt(_v2.copy(s.pos).add(_v));
        for (const who of [P, N]) {
          if (who === N && (N.downed > 0)) continue;
          const b = who.pos; if (Math.hypot(b.x - s.pos.x, b.z - s.pos.z) < 0.6 && s.pos.y > b.y + 0.3 && s.pos.y < b.y + 1.9) {
            ctx.playerHurt({ who: who === N ? 'N' : 'P', dmg: FOE_DMG.raiderSpear, kind: 'pierce', from: s.from, dir: _v.clone().setY(0).normalize() });
            s.st = 'gone'; scene.remove(s.m); spears.splice(i, 1); break;
          }
        }
        if (s.st === 'air' && (s.pos.y < ctx.getHeight(s.pos.x, s.pos.z) || s.t > 4)) { s.st = 'stuck'; s.t = 0; s.pos.y = Math.max(s.pos.y, ctx.getHeight(s.pos.x, s.pos.z)); ctx.sfx.thud(s.pos); }
      } else if (s.st === 'stuck') { s.t += dt; if (s.t > 25) { scene.remove(s.m); spears.splice(i, 1); } }
    }
  }
  // the torchbearer: a lit torch thrown onto a roof
  function throwTorch(f, s) {
    dropWeapon(f); const m = f.dropped; f.dropped = null; if (!m) return;
    handPos(f, _v); m.position.copy(_v);
    const tx = s.x, tz = s.z, d = Math.hypot(tx - _v.x, tz - _v.z), tt = Math.max(0.5, d / 12);
    const vel = new THREE.Vector3((tx - _v.x) / tt, (2.5 - (_v.y - (s.group?.position.y || 0)) + 0.5 * 9.8 * tt * tt) / tt * 0.5, (tz - _v.z) / tt);
    f.torch.lit = true; f.torch.light.intensity = 0;
    spears.push({ m, pos: _v.clone(), vel, from: f, t: 0, st: 'torch', s, life: tt, torch: f.torch });
    f.wpn = 'none'; f.role = 'brawler'; f.torch = null;
  }
  function updateTorches(dt) {
    for (let i = spears.length - 1; i >= 0; i--) {
      const s = spears[i]; if (s.st !== 'torch') continue;
      s.t += dt; s.vel.y -= 9.8 * 0.5 * dt; s.pos.addScaledVector(s.vel, dt); s.m.position.copy(s.pos); s.m.rotation.x += dt * 8;
      s.torch.update?.(dt);
      if (s.t >= s.life) { scorch(s.s, 0.5); scene.remove(s.m); spears.splice(i, 1); }
    }
  }
  function scorch(s, amt) {
    s.scorch = Math.min(1, (s.scorch || 0) + amt);
    const k = 1 - 0.45 * s.scorch;
    s.group?.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.blending === THREE.AdditiveBlending) return;
      if (!o.userData.cmbBase) { o.material = o.material.clone(); o.userData.cmbBase = o.material.color.clone(); }
      o.material.color.copy(o.userData.cmbBase).multiplyScalar(k);
    });
    ctx.sfx.fire(s);
    ctx.emit('scorch', { s, amt: s.scorch });
  }

  // ---------- damage taken (hurt() routes raiders here) ----------
  function hurtFoe(f, dmg, info = {}) {
    if (f.state !== 'live' || !f.live) return;
    const e = hitEvent(f, dmg, info); if (e.cancel || !(e.dmg > 0)) return;
    const kind = (info.weapon || 'fists') + (info.heavy ? 'H' : '');
    // a raider in the fight may block a blow he saw coming (not a finisher, not from behind, not while winding a heavy)
    if (info.kind !== 'finisher' && info.kind !== 'execution' && f.mode === 'combat' && !(f.stagger > 0) && !(f.atk && f.atk.heavy) && f.mode !== 'downed'
      && inFront(f.face, P.pos.x - f.pos.x, P.pos.z - f.pos.z, 120) && Math.random() < raiderBlockChance(hist, kind) * (info.heavy ? 0.5 : 1)) {
      hist.push(kind); if (hist.length > 6) hist.shift();
      f.blockT = 0.45; ctx.sfx.clack(f.pos); ctx.onBlocked(f, info);
      if (postureAdd(f, POSTURE.blocked * (info.heavy ? 2 : 1), ctx.clock())) breakPosture(f);
      return;
    }
    hist.push(kind); if (hist.length > 6) hist.shift();
    f.hp -= e.dmg; f.hits++;
    f.kb = { x: e.dir.x * (info.heavy ? 3.2 : 1.8), z: e.dir.z * (info.heavy ? 3.2 : 1.8), t: 0.25 };
    if (f.mode !== 'combat' && f.mode !== 'downed' && f.hp > 0) enterCombat(f);
    if (f.hp <= 0) {
      if (f.surrender && f.mode !== 'downed' && info.kind !== 'finisher' && info.kind !== 'execution') { downFoe(f); ctx.emit('foeHit', e); return; }
      killFoe(f, e, info); return;
    }
    if (!(f.atk && f.atk.heavy)) { f.atk = null; f.h.swing(Math.random() < 0.5 ? 'hitChest' : 'hitHead', 1.3); f.stun = info.heavy ? 0.6 : 0.3; }
    if (postureAdd(f, POSTURE.light * (info.heavy ? POSTURE.heavyK : 1), ctx.clock())) breakPosture(f);
    ctx.sfx.pain(f.pos, f.chief);
    ctx.emit('foeHit', e);
    if (!f.surrender && f.mode === 'combat' && shouldFlee(f.hp, f.maxHp, false, 0, f.noFlee)) { f.stun = Math.min(f.stun || 0, 0.25); flee(f); }   // the blow that breaks him: he runs at once
  }
  // the hit payload (GORE's foeHit contract); CMB's counter/heavy rules run in ctx.foeHitPre
  const _ep = new THREE.Vector3(), _ed = new THREE.Vector3();
  function hitEvent(f, dmg, info) {
    const fp = info.from?.pos || info.from?.root?.position || P.pos;
    const e = { o: f, f, dmg, kind: info.kind || 'blunt', weapon: info.weapon || null, heavy: !!info.heavy, from: info.from || P, kill: false, cancel: false, zone: info.zone || null,
      point: info.point ? _ep.copy(info.point) : f.h.bones.spine_03.getWorldPosition(_ep),
      dir: info.dir ? _ed.copy(info.dir) : _ed.set(f.pos.x - fp.x, 0, f.pos.z - fp.z).normalize() };
    if (e.weapon === 'flintaxe') e.weapon = 'axe';
    ctx.foeHitPre?.(e);
    return e;
  }
  function breakPosture(f) { f.stagger = POSTURE.stagger; f.atk = null; f.h.swing('stagger', 1); ctx.sfx.clack(f.pos, true); }
  function downFoe(f) {                              // surrender: he kneels, drops his weapon and waits for Aro's choice
    f.hp = 1; f.mode = 'downed'; f.atk = null; f.stagger = 0; f.h.pose = 'work'; dropWeapon(f);
    ctx.say(f.name, f.chief ? 'Enough. It is yours. Do what you came to do.' : 'Enough! Enough… I am done.');
    ctx.emit('raiderDowned', { f });
  }
  function killFoe(f, e, info = {}) {
    f.state = 'dead'; f.mode = 'dead'; f.hp = 0; f.live = false; f.atk = null; f.deadT = 0; f.stagger = 0;
    dropWeapon(f);
    f.h.pose = null; ctx.lie(f);
    ctx.sfx.death(f.pos, f.chief);
    e.kill = true; if (e.kind === 'execution') e.kind = 'finisher';   // GORE: an axe finisher takes the head (Gore High, Blood on, no child near)
    ctx.emit('foeHit', e); ctx.emit('foeDie', e);
    const alliesDead = foes.filter((o) => o.state === 'dead').length;
    for (const o of foes) if (o.live && o.mode !== 'downed' && !o.fled && shouldFlee(o.hp, o.maxHp, f.chief, alliesDead, o.noFlee)) flee(o);
    ctx.emit('raiderDead', { f, cause: info.kind || 'hit' });
  }
  function flee(f) { if (f.mode === 'flee' || f.noFlee) return; f.mode = 'flee'; f.atk = null; ctx.say(f.name, f.chief ? 'Back! Back to the hills!' : 'Run!'); ctx.emit('raiderFlee', { f }); }

  // ---------- the surrender choice (findTarget "Decide (E)") ----------
  async function decide(f) {
    if (f.mode !== 'downed' || f.deciding) return;
    f.deciding = true;
    const i = await ctx.choose('surrender', `${f.name} drops to his knees`, [{ label: 'Spare him' }, { label: 'Kill him' }], { def: 0, note: 'He has thrown down his weapon. He is waiting for your answer.' });
    f.deciding = false;
    ctx.emit('surrender', { f, i, choice: i === 1 ? 'kill' : 'spare' });
    if (i === 1) { ctx.execute(f); return 'kill'; }
    f.spared = true; f.mode = 'flee'; f.h.pose = null; f.noFlee = false; f.surrender = false;
    ctx.say(f.name, 'I will not forget this face.');
    return 'spare';
  }

  // ---------- the frame ----------
  const _tok = { set: new Set(), t: 0 };
  function updateFoes(dt) {
    updateSpears(dt); updateTorches(dt);
    const L = live();
    _tok.t -= dt;
    if (_tok.t <= 0) {                               // re-deal the attack tokens twice a second: the two nearest brawlers close in
      _tok.t = 0.5;
      _tok.set = tokens(L.filter((f) => f.mode === 'combat' && (f.role === 'brawler' || f.role === 'leader')), (f) => Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z), 2);
    }
    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      if (f.fled && !f.h.root.parent) continue;
      if (f.state === 'dead') { deadTick(f, dt, i); continue; }
      think(f, dt);
      // knockback slide
      if (f.kb) { const k = f.kb.t / 0.25; f.pos.x += f.kb.x * k * dt * 1.6; f.pos.z += f.kb.z * k * dt * 1.6; ctx.collide(f.pos, 0.3); if ((f.kb.t -= dt) <= 0) f.kb = null; }
      ctx.settle(f, dt * ctx.hsK(f), false);
      if (f.blockT > 0) { f.blockT -= dt; ctx.blockPose(f, Math.min(1, f.blockT / 0.15)); }
      bars(f);
    }
  }
  function deadTick(f, dt, i) {
    f.deadT += dt; f.matFallT = (f.matFallT || 0) + dt;
    ctx.settle(f, dt, false);
    f.meter.visible = f.pbar.visible = false;
    const far = Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z) > 90;
    if ((f.deadT > 300 && far) || f.deadT > 900) { disposeFoe(f); foes.splice(i, 1); }
  }
  function moveTo(f, x, z, sp, dt, stop) {
    const ox = f.pos.x, oz = f.pos.z, done = ctx.walkTo(f, x, z, sp, dt, stop);
    if (ctx.depthAt(f.pos.x, f.pos.z) > 0) { f.pos.x = ox; f.pos.z = oz; f.speed = 0; return true; }   // raiders never enter caves
    return done;
  }
  const faceTo = (f, x, z, dt, k = 8) => { f.face = ctx.turn(f.face, Math.atan2(x - f.pos.x, z - f.pos.z), Math.min(1, dt * k)); };
  function think(f, dt) {
    const sees = perceive(f, dt);
    postureTick(f, dt, ctx.clock());
    if (f.stun > 0) { f.stun -= dt; f.speed = 0; return; }
    if (f.stagger > 0) { f.stagger -= dt; f.speed = 0; f.atk = null; return; }
    if (f.atk) { tickAttack(f, dt); f.speed = 0; faceTo(f, tgtPos(f.atk.target).x, tgtPos(f.atk.target).z, dt, f.atk.t < f.atk.wind * 0.7 ? 6 : 1); return; }
    const dP = Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z);
    switch (f.mode) {
      case 'patrol': case 'camp': {
        if (f.alert >= 1) { enterCombat(f); break; }
        if (f.alert >= 0.35) { f.mode = 'suspicious'; ctx.sfx.huh(f.pos); break; }
        if (f.mode === 'camp') { f.speed = 0; f.h.pose = f.sitPose || null; break; }
        f.wt = (f.wt || 0) - dt;
        if (f.wt <= 0) { f.wt = 4 + Math.random() * 6; const a = Math.random() * 6.283, r = 3 + Math.random() * 10; f.tx = f.home.x + Math.cos(a) * r; f.tz = f.home.z + Math.sin(a) * r; f.idle = Math.random() < 0.4; }
        if (!f.idle && f.tx != null) moveTo(f, f.tx, f.tz, 1.5, dt, 0.5); else f.speed = 0;
        break;
      }
      case 'suspicious': {
        f.h.pose = null;
        if (f.alert >= 1) { enterCombat(f); break; }
        if (f.alert < 0.1) { f.mode = 'search'; f.searchT = 20; break; }
        faceTo(f, f.last.x, f.last.z, dt, 3);
        if (Math.hypot(f.last.x - f.pos.x, f.last.z - f.pos.z) > 2) moveTo(f, f.last.x, f.last.z, 1.2, dt, 1.5); else f.speed = 0;
        break;
      }
      case 'search': {
        f.searchT -= dt;
        if (f.alert >= 0.35) { f.mode = 'suspicious'; break; }
        if (f.searchT <= 0) { f.mode = 'patrol'; break; }
        f.wt = (f.wt || 0) - dt;
        if (f.wt <= 0) { f.wt = 3 + Math.random() * 3; const a = Math.random() * 6.283, r = 3 + Math.random() * 8; f.tx = f.last.x + Math.cos(a) * r; f.tz = f.last.z + Math.sin(a) * r; }
        moveTo(f, f.tx, f.tz, 1.8, dt, 0.6);
        break;
      }
      case 'combat': combat(f, dt, dP, sees); break;
      case 'flee': {
        f.h.pose = null;
        const a = Math.atan2(f.pos.x - P.pos.x, f.pos.z - P.pos.z);
        moveTo(f, f.pos.x + Math.sin(a) * 10, f.pos.z + Math.cos(a) * 10, f.spared ? 4.2 : 5.6, dt, 0.1);
        if (dP > 70) { f.fled = true; scene.remove(f.h.root, f.meter, f.pbar); ctx.emit('raiderGone', { f }); }
        break;
      }
      case 'downed': {
        f.speed = 0; f.h.pose = 'work'; faceTo(f, P.pos.x, P.pos.z, dt, 2);
        if (dP > 70) { f.downT = (f.downT || 0) + dt; if (f.downT > 20) { f.spared = true; f.mode = 'flee'; f.h.pose = null; ctx.emit('surrender', { f, i: 0, choice: 'left' }); } }
        break;
      }
    }
  }
  function combat(f, dt, dP, sees) {
    f.h.pose = null;
    f.cool -= dt; f.reloadT = Math.max(0, (f.reloadT || 0) - dt);
    if (f.reloadT <= 0 && f.wpn === 'spear' && !f.h.spear.visible) f.h.spear.visible = true;
    if (f.seenT > 12 && dP > 30) { f.mode = 'search'; f.searchT = 20; f.alert = 0.3; return; }
    if (!f.surrender && shouldFlee(f.hp, f.maxHp, foes.some((o) => o.chief && o.state === 'dead'), foes.filter((o) => o.state === 'dead').length, f.noFlee)) { flee(f); return; }
    const t = f.target = pickTarget(f), tp = tgtPos(t), dx = tp.x - f.pos.x, dz = tp.z - f.pos.z, d = Math.hypot(dx, dz);
    if (t.kind && t.group) {                          // torchbearer: run at the structure and throw
      if (d > 9) moveTo(f, tp.x, tp.z, 5.4, dt, 8); else { f.speed = 0; faceTo(f, tp.x, tp.z, dt); f.throwT -= dt; if (f.throwT <= 0) { f.h.swing('overU', 1.25); f.throwT = 99; setTimeoutLike(f, 0.45, () => throwTorch(f, t)); } }
      return;
    }
    if (f.role === 'thrower' && f.wpn === 'spear') {
      faceTo(f, tp.x, tp.z, dt, 6);
      if (d < 9) moveTo(f, f.pos.x - dx / d * 4, f.pos.z - dz / d * 4, 3.4, dt, 0.2);
      else if (d > 14) moveTo(f, tp.x, tp.z, 4.2, dt, 12);
      else f.speed = 0;
      f.throwT -= dt;
      if (f.throwT <= 0 && d < 22 && f.h.spear.visible) {
        f.throwT = 4; f.h.swing('overU', 1.2); ctx.glint(() => handPos(f, _hp), false, 0.55);
        setTimeoutLike(f, 0.42, () => { if (f.live && f.state === 'live' && f.mode === 'combat') throwSpear(f, t); });
      }
      if (d < 2.6 && f.cool <= 0) startAttack(f, t);   // too close: jab
      return;
    }
    // brawlers and the leader: two with tokens close in, the rest hold a ring at 3.5 m
    const tok = _tok.set.has(f) || f.chief;
    if (!tok) {
      f.ringA += dt * 0.3 * (f.ringS ||= Math.random() < 0.5 ? -1 : 1);
      const rx = tp.x + Math.sin(f.ringA) * 3.6, rz = tp.z + Math.cos(f.ringA) * 3.6;
      moveTo(f, rx, rz, d > 8 ? 5.2 : 2.2, dt, 0.4); faceTo(f, tp.x, tp.z, dt, 6);
      return;
    }
    if (d > 1.9) { moveTo(f, tp.x, tp.z, d > 6 ? 5.6 : 2.8, dt, 1.6); if (d < 4) faceTo(f, tp.x, tp.z, dt, 8); }
    else { f.speed = 0; faceTo(f, tp.x, tp.z, dt, 8); if (f.cool <= 0) startAttack(f, t); }
  }
  // game-time timers on a foe (they stop if he dies; no setTimeout drift at low frame rates)
  function setTimeoutLike(f, t, fn) { (f.timers ||= []).push({ t, fn }); }
  function timers(dt) { for (const f of foes) if (f.timers?.length) for (let i = f.timers.length - 1; i >= 0; i--) { const q = f.timers[i]; if ((q.t -= dt) <= 0) { f.timers.splice(i, 1); if (f.state === 'live') q.fn(); } } }
  function bars(f) {
    const head = f.h.bones.Head; head.getWorldPosition(_v); _v.y += 0.42;
    // the detection meter: white while curious, orange when suspicious, red the moment he commits
    const show = f.mode !== 'combat' && f.mode !== 'downed' && f.mode !== 'flee' && f.alert > 0.02;
    f.meter.visible = show || (f.mode === 'combat' && (f.redT = (f.redT ?? 1.2) - 0.016) > 0);
    if (f.meter.visible) { f.meter.position.copy(_v); f.meter.userData.set(Math.min(1, f.alert), f.mode === 'combat' ? '#e0281c' : f.alert >= 0.35 ? '#f08a24' : '#f4f0e6', 'eye'); }
    f.pbar.visible = f.posture > 1 && f.mode === 'combat';
    if (f.pbar.visible) { f.pbar.position.copy(_v).y -= 0.13; f.pbar.userData.set(f.posture / 100, f.posture > 75 ? '#ffcf4a' : '#e8e2d2'); }
  }
  return { spawnRaider, updateFoes: (dt) => { timers(dt); updateFoes(dt); }, clearFoes, hurtFoe, killFoe, decide, makeTribesman, live, enterCombat, scorch, breakPosture, spears, flee, hist };
}
