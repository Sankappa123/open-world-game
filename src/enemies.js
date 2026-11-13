// CMB predators (spec_mature.md §7 M4 task 11): the alpha wolf and its pack, an aurochs herd on the northern plain,
// and the cave bear of Flint Deep. Brains run from updateAnimal (o.brain) or wolfBrain (cmbWolf); everything that
// touches the player (damage, knockdown, the maul QTE, the spear brace, glints, sounds) goes through ctx.
import * as THREE from 'three';
import { FOE_HP, FOE_DMG, inFront, wrap } from './combat.js';

const AUR_HOME = [176, -98];                         // the northern plain, east of the river between the stones and the ruins
export function createPredators(ctx) {
  const { P, N } = ctx;
  const _v = new THREE.Vector3();
  const R = { aur: null, bear: null, packs: [] };
  const dist2 = (o, p = P.pos) => Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z);
  // move along o.dir at speed, turning the body toward it (brains own their animals' movement)
  function move(o, speed, dt, turnK = 6) {
    if (speed > 0.05) ctx.step(o, speed, dt);
    o.speed = speed;
    o.root.rotation.y = ctx.turn(o.root.rotation.y, o.dir, Math.min(1, dt * turnK));
  }
  const face = (o, x, z) => { o.dir = Math.atan2(x - o.root.position.x, z - o.root.position.z); };
  const jaw = (o, up = 0.7, fwd = 0.9) => () => {
    const p = o.root.position, f = o.root.rotation.y, s = o.root.scale.x;
    return _v.set(p.x + Math.sin(f) * fwd * s, p.y + up * s, p.z + Math.cos(f) * fwd * s);
  };

  // ---------- alpha wolf and the pack ----------
  // One wolf of each pack becomes the alpha: bigger, darker, grey-backed, 30 hp, 14 bite. The pack circles at 6-8 m
  // and goes in on its howl, or when Aro has had his back to a wolf for 2 s. Kill the alpha and the pack breaks.
  function makeAlpha(o) {
    o.alpha = true; o.hostile = true; o.hp = FOE_HP.alpha * ctx.D().foeHpK; o.maxHp = o.hp;
    o.root.scale.setScalar(0.42 / 0.34);
    o.a.model.traverse((m) => {
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mt) => { const c = mt.clone(); if (/Main_Light/i.test(c.name)) c.color.setRGB(0.62, 0.62, 0.6); else if (/Main/i.test(c.name)) c.color.multiplyScalar(0.55); return c; });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
    return o;
  }
  function pack(wolves) {                            // EVENTS.wolves hook: the new pack (alpha after the house, always on Hardcore)
    const D = ctx.D(), list = wolves.filter((w) => w && w.kind === 'wolf');
    if (!list.length) return null;
    const want = D.senaFate === 'die' || ctx.reached('house');
    const P0 = { members: list, alpha: null, howlT: 4 + Math.random() * 3, broken: false };
    if (want) { P0.alpha = makeAlpha(list[0]); }
    for (const w of list) { w.pack = P0; w.ring = 6 + Math.random() * 2; w.ringA = Math.random() * 6.283; w.backT = 0; w.go = 0; }
    R.packs.push(P0);
    if (P0.alpha) ctx.S().legend.alpha = 'alive';
    return P0;
  }
  // wolfBrain hook (after the fire/torch/water circling): returns a speed to take over, or null for the default chase.
  function wolf(o, dist, dx, dz, dt) {
    if (o.stagger > 0) { o.stagger -= dt; o.pending = 0; o.attacking = 0; o.a.play('Idle_HitReact1'); return 0; }
    const pk = o.pack;
    if (!pk || pk.broken || !pk.alpha || o.leave) return null;
    // pack AI: hold a ring around Aro until the alpha calls them in or Aro turns his back
    if (o === pk.alpha) {
      pk.howlT -= dt;
      if (pk.howlT <= 0) {
        pk.howlT = 6 + Math.random() * 4;
        ctx.sfx.howl(o.root.position);
        const ring = pk.members.filter((w) => w !== o && w.state === 'live' && !w.go).sort(() => Math.random() - 0.5);
        for (const w of ring.slice(0, Math.min(2, ring.length))) w.go = 3.5;
        o.go = 3.5;
      }
    }
    // facing away from this wolf for 2 s invites a bite
    const toWolf = inFront(P.face, -dx, -dz, 120);
    o.backT = toWolf ? 0 : o.backT + dt;
    if (o.backT > 2) o.go = Math.max(o.go, 2.5);
    if (o.go > 0) { o.go -= dt; return null; }    // the default chase and bite
    o.ringA += dt * 0.35 * (o.ringS ||= Math.random() < 0.5 ? -1 : 1);
    const tx = P.pos.x + Math.sin(o.ringA) * o.ring, tz = P.pos.z + Math.cos(o.ringA) * o.ring;
    const p = o.root.position, d = Math.hypot(tx - p.x, tz - p.z);
    if (!o.avoid) o.dir = Math.atan2(tx - p.x, tz - p.z);
    if (d < 0.8) { o.dir = Math.atan2(-dx, -dz); return 0; }   // in place: face him, growl now and then
    if (Math.random() < dt * 0.15) ctx.sfx.growl(p);
    return d > 4 ? 5.5 : 2.4;
  }
  function wolfDied(o) {                             // animalDie: the alpha falls and the pack breaks
    const pk = o.pack; if (!pk || pk.broken) return;
    if (o === pk.alpha) {
      pk.broken = true;
      for (const w of pk.members) if (w !== o && w.state === 'live') { w.leave = true; w.go = 0; }
      ctx.S().legend.alpha = 'dead';
      ctx.toast('The alpha is dead. The pack scatters.');
      ctx.say('Sena', 'They are running. Without that one they are only dogs.');
    }
  }

  // ---------- aurochs herd ----------
  // Neutral grazers. Hit one, or come within 8 m of the calf, and the nearest bull paws, snorts and charges (red glint):
  // a straight dash at 11 m/s for up to 15 m that gores and knocks Aro down. A braced spear stops it.
  function spawnAurochs(cx = AUR_HOME[0], cz = AUR_HOME[1]) {
    if (R.aur) return R.aur;
    const [x, z] = ctx.landSpot(cx, cz, 0, 30);
    const H = { x, z, tx: x, tz: z, timer: 30, members: [], anger: 0 };
    for (let i = 0; i < 4; i++) {
      const calf = i === 3, ox = (Math.random() - 0.5) * 14, oz = (Math.random() - 0.5) * 14;
      const o = ctx.spawn('aurochs', x + ox, z + oz, { aHerd: H, ox, oz, calf, scale: calf ? 0.25 : 0.44 * (0.95 + Math.random() * 0.1), brain: aurochsBrain, st: 'graze' });
      o.hp = o.maxHp = (calf ? 30 : FOE_HP.aurochs) * ctx.D().foeHpK; o.hostile = false;
      H.members.push(o);
    }
    R.aur = H; return H;
  }
  function anger(H, src) {
    H.anger = 25;
    const bulls = H.members.filter((o) => !o.calf && o.state === 'live');
    if (!bulls.length) return;
    const b = (src && !src.calf && src.state === 'live') ? src : bulls.sort((a, c) => dist2(a) - dist2(c))[0];
    if (b.st === 'graze' || b.st === 'recover' || b.st === 'watch') { b.st = 'paw'; b.t = 0.8; b.hostile = true; ctx.sfx.snort(b.root.position); face(b, P.pos.x, P.pos.z); ctx.glint(jaw(b, 1.1, 1.2), true, 0.8); }
  }
  function aurochsBrain(o, dt) {
    const H = o.aHerd, p = o.root.position, d = dist2(o);
    if (o.stun > 0) { o.stun -= dt; if (o.st !== 'charge') return true; }
    if (o.stagger > 0) { o.stagger -= dt; o.speed = 0; o.st = 'stagger'; o.a.play('Idle_Headlow'); if (o.stagger <= 0) { o.st = 'recover'; o.t = 1.5; } return true; }
    // the calf: too close and the herd turns on you
    const calf = H.members.find((m) => m.calf && m.state === 'live');
    if (calf && !o.calf && dist2(calf) < 8 && H.anger <= 0) anger(H, null);
    switch (o.st) {
      case 'paw': {                                  // 0.8 s: paw the ground, snort, lower the head (red glint)
        o.t -= dt; face(o, P.pos.x, P.pos.z); move(o, 0, dt, 8); o.a.play('Idle_Headlow');
        if (o.t <= 0) { o.st = 'charge'; o.run = 0; o.hitDone = false; o.cdir = o.dir; o.a.play('Gallop', false, 1.4); }
        return true;
      }
      case 'charge': {                               // straight line, 11 m/s, up to 15 m
        o.dir = o.cdir; move(o, 11, dt, 2); o.run += 11 * dt; o.a.play('Gallop', false, 1.4);
        if (!o.hitDone && ctx.braced(o)) { o.hitDone = true; ctx.onBrace(o); return true; }
        if (!o.hitDone && d < 1.9 && inFront(o.dir, P.pos.x - p.x, P.pos.z - p.z, 120)) {
          o.hitDone = true; o.a.play('Attack_Headbutt', true, 1.2);
          const e = ctx.playerHurt({ dmg: FOE_DMG.gore, kind: 'gore', from: o, red: true });
          if (e.applied) ctx.knockdown(o);
        }
        if (o.run > 15 || o.hitDone && o.run > 4) { o.st = 'recover'; o.t = 1.6; }
        return true;
      }
      case 'recover': {
        o.t -= dt; move(o, 0, dt); o.a.play('Idle');
        if (o.t <= 0) {
          if (H.anger > 0 && d < 28) { o.st = 'paw'; o.t = 0.8; face(o, P.pos.x, P.pos.z); ctx.sfx.snort(p); ctx.glint(jaw(o, 1.1, 1.2), true, 0.8); }
          else { o.st = 'graze'; o.hostile = false; }
        }
        return true;
      }
      default: {                                     // graze with the herd; watch Aro when he is near and the herd is angry
        const tx = H.x + o.ox, tz = H.z + o.oz, td = Math.hypot(tx - p.x, tz - p.z);
        if (H.anger > 0 && !o.calf && d < 22) { face(o, P.pos.x, P.pos.z); move(o, 0, dt, 3); o.a.play('Idle'); o.st = 'watch'; return true; }
        if (td > 2.5) { face(o, tx, tz); move(o, td > 14 ? 3.5 : 1.0, dt, 3); o.a.play(td > 14 ? 'Gallop' : 'Walk', false, td > 14 ? 0.8 : 0.9); }
        else { move(o, 0, dt); o.t2 = (o.t2 || 0) - dt; if (o.t2 <= 0) { o.t2 = 5 + Math.random() * 7; o.graze = !o.graze; } o.a.play(o.graze ? 'Eating' : 'Idle'); }
        return true;
      }
    }
  }
  function aurochsHit(e) {                           // animalHit: side-specific flinch, and the herd's anger
    const o = e.o; if (o.kind !== 'aurochs' || !o.aHerd) return;
    if (!e.kill) {
      const p = o.root.position, f = o.root.rotation.y, side = Math.sin(f) * (e.point.z - p.z) - Math.cos(f) * (e.point.x - p.x);
      o.a.play(side > 0 ? 'Idle_HitReact_Left' : 'Idle_HitReact_Right', true, 1.2);
    }
    anger(o.aHerd, o.calf ? null : o);
  }

  // ---------- the cave bear ----------
  // FSM: forage -> warn (25 m: stop, rear, roar) -> calm (he backs off or sneaks away) | bluff (50%, stops at 4 m)
  // | charge -> swipe (red glint, 22 + knockdown) -> maul (Aro down: mash E) ; flee at 20% hp. A lit torch facing it
  // scares it off half the time. Dies once and never respawns (S.legend.bear).
  function bearDen() {
    const L = ctx.S().legend;
    if (!L.bear) {                                   // 25-40 m from the Flint Deep mouth, off to the side (not on the path from home)
      const k = ctx.CAVES[1], m = k.mouth, out = Math.atan2(m[0] - k.x, m[1] - k.z);
      let best = null;
      for (let i = 0; i < 40 && !best; i++) {
        const a = out + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 0.9), r = 25 + Math.random() * 15, x = m[0] + Math.sin(a) * r, z = m[1] + Math.cos(a) * r;
        if (ctx.getHeight(x, z) > 1.6 && ctx.slopeY(x, z) > 0.8 && ctx.depthAt(x, z) <= 0) best = [x, z];
      }
      const [x, z] = best || ctx.landSpot(m[0], m[1], 25, 40);
      L.bear = { state: 'alive', hp: null, x: +x.toFixed(1), z: +z.toFixed(1) };
    }
    return L.bear;
  }
  function spawnBear(x, z) {
    const L = bearDen();
    if (x == null) { x = L.x; z = L.z; }
    if (R.bear && R.bear.state === 'live') return R.bear;
    const o = ctx.spawn('bear', x, z, { hostile: true, brain: bearBrain, st: 'forage', den: { x: L.x, z: L.z }, t: 0, scared: false });
    o.maxHp = FOE_HP.bear * ctx.D().foeHpK; o.hp = L.hp != null ? Math.min(o.maxHp, L.hp) : o.maxHp;
    R.bear = o; return o;
  }
  function bearSet(o, st, t = 0) { o.st = st; o.t = t; }
  // bluff or charge: half and half; on Story it only bluffs until it has been hurt (no more friction than before)
  const attack = (o) => (o.provoked || ctx.D().dmgK >= 1 ? (Math.random() < 0.5 ? 'bluff' : 'charge') : 'bluff');
  function bearBrain(o, dt) {
    const p = o.root.position, d = dist2(o), a = o.a;
    if (o.stun > 0) o.stun -= dt;
    if (o.hp < o.maxHp && !o.provoked) { o.provoked = true; if (o.st === 'forage' || o.st === 'calm' || o.st === 'warn') bearSet(o, 'charge'); }
    if (o.stagger > 0) { o.stagger -= dt; a.rear = 0; move(o, 0, dt); a.play('Idle'); if (o.stagger <= 0) bearSet(o, 'recover', 1); return true; }
    const L = ctx.S().legend.bear; if (L) L.hp = Math.round(o.hp);
    if (o.st !== 'flee' && o.hp < o.maxHp * 0.2) { bearSet(o, 'flee', 25); a.rear = 0; ctx.sfx.roar(p, 0.6); }
    const torchScare = () => {                       // a lit torch held toward it: half the time it thinks better of it
      if (o.scared || !ctx.torchLit() || !inFront(P.face, p.x - P.pos.x, p.z - P.pos.z, 90)) return false;
      o.scared = true;
      if (Math.random() < 0.5) { bearSet(o, 'calm', 10); ctx.toast('The bear shies from the flame'); return true; }
      return false;
    };
    switch (o.st) {
      case 'forage': {
        a.rear = 0; o.scared = false;
        o.t -= dt;
        if (o.t <= 0) { o.t = 4 + Math.random() * 6; o.walk = !o.walk; const r = 4 + Math.random() * 10, an = Math.random() * 6.283; o.tx = o.den.x + Math.cos(an) * r; o.tz = o.den.z + Math.sin(an) * r; }
        if (o.walk) { face(o, o.tx, o.tz); move(o, 1.1, dt, 3); a.play('Walk', false, 1); if (Math.hypot(o.tx - p.x, o.tz - p.z) < 1) o.walk = false; }
        else { move(o, 0, dt); a.play('Idle'); }
        if (d < 15) bearSet(o, attack(o));
        else if (d < 25) { bearSet(o, 'warn', 0); ctx.sfx.roar(p, 1); }
        return true;
      }
      case 'warn': {                                 // stop, rear up, roar; he has a few seconds to leave
        o.t += dt; face(o, P.pos.x, P.pos.z); move(o, 0, dt, 5); a.play('Idle');
        a.rear = o.t < 2.2 ? 1 : 0;
        if (o.t > 0.6 && o.t < 0.7) ctx.glint(jaw(o, 1.9, 0.9), false, 0.5);
        if (torchScare()) return true;
        if (d > 30 || (P.sneak && d > 20 && o.t > 1.5)) { bearSet(o, 'calm', 8); return true; }
        if (d < 15 || o.t > 6) { a.rear = 0; bearSet(o, attack(o)); ctx.sfx.roar(p, 1.2); }
        return true;
      }
      case 'calm': {                                 // back to the den; a while before it forages again
        o.t -= dt; a.rear = 0; face(o, o.den.x, o.den.z);
        const dd = Math.hypot(o.den.x - p.x, o.den.z - p.z);
        if (dd > 2) { move(o, 1.6, dt, 3); a.play('Walk', false, 1.2); } else { move(o, 0, dt); a.play('Idle'); }
        if (d < 15 && o.t < 6) { bearSet(o, attack(o)); ctx.sfx.roar(p, 1.2); }
        else if (o.t <= 0) bearSet(o, 'forage', 2);
        return true;
      }
      case 'bluff': case 'charge': {
        a.rear = 0; face(o, P.pos.x, P.pos.z);
        if (o.t === 0) { o.t = 0.001; ctx.glint(jaw(o, 1.0, 1.2), true, 0.6); }
        if (torchScare()) return true;
        if (ctx.braced(o)) { ctx.onBrace(o); return true; }
        move(o, 9, dt, 5); a.play('Gallop', false, 1.2);
        if (o.st === 'bluff' && d < 4) { bearSet(o, 'warn', 2.6); ctx.sfx.roar(p, 1.3); move(o, 0, dt); return true; }
        if (o.st === 'charge' && d < 2.3) { bearSet(o, 'windup', 0.55); ctx.glint(jaw(o, 1.2, 1.0), true, 0.55); ctx.sfx.growl(p, 1); }
        if (d > 45) bearSet(o, 'calm', 8);
        return true;
      }
      case 'windup': {                               // red glint: dodge it
        o.t -= dt; face(o, P.pos.x, P.pos.z); move(o, d > 1.8 ? 2.5 : 0, dt, 8); a.rear = 0.35;
        if (o.t <= 0) {
          a.swipe(); a.rear = 0;
          if (d < 2.7 && inFront(o.root.rotation.y, P.pos.x - p.x, P.pos.z - p.z, 110) && !ctx.downed()) {
            const e = ctx.playerHurt({ dmg: FOE_DMG.swipe, kind: 'claw', from: o, red: true, sev: 3 });
            if (e.applied) ctx.knockdown(o);
          }
          bearSet(o, 'recover', 0.9);
        }
        return true;
      }
      case 'recover': {
        o.t -= dt; move(o, 0, dt); a.play('Idle'); a.rear = 0;
        if (o.t <= 0) {
          if (ctx.downed() && d < 3.2) { bearSet(o, 'maul', 0); ctx.maul(o); }
          else if (d < 3) bearSet(o, 'windup', 0.55), ctx.glint(jaw(o, 1.2, 1.0), true, 0.55);
          else if (d < 25) bearSet(o, 'charge');
          else bearSet(o, 'calm', 8);
        }
        return true;
      }
      case 'maul': {                                 // the QTE runs in main (ctx.maul); the bear stands over him
        face(o, P.pos.x, P.pos.z); move(o, d > 1.4 ? 1.5 : 0, dt, 6); a.rear = 0.25 + Math.sin(ctx.clock() * 9) * 0.1;
        if (!ctx.mauling()) bearSet(o, 'recover', 1.4);
        return true;
      }
      case 'flee': {
        o.t -= dt; a.rear = 0;
        o.dir = Math.atan2(p.x - P.pos.x, p.z - P.pos.z);
        move(o, d < 40 ? 7 : 2, dt, 4); a.play(d < 40 ? 'Gallop' : 'Walk', false, 1);
        if (o.t <= 0 && d > 40) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25); bearSet(o, 'calm', 20); }
        return true;
      }
    }
    return true;
  }
  function bearDied(o) {
    if (o.kind !== 'bear') return;
    const L = ctx.S().legend.bear; if (L) { L.state = 'dead'; L.hp = 0; }
    ctx.toast('The cave bear is dead');
    ctx.say('Sena', 'Aro… it is over. Sit down before you fall down.');
  }
  // keep the predators within the performance budget: the bear only exists within 150 m of its den, the herd within 220 m
  function tick(dt) {
    const L = ctx.S().legend;
    const H = R.aur;
    if (H) {                                         // the herd drifts across the plain; anger cools
      H.anger = Math.max(0, H.anger - dt);
      if (H.anger <= 0) for (const m of H.members) if (m.st === 'watch') { m.st = 'graze'; m.hostile = false; }
      H.timer -= dt;
      if (H.timer <= 0) { [H.tx, H.tz] = ctx.landSpot(AUR_HOME[0], AUR_HOME[1], 0, 40); H.timer = 40 + Math.random() * 40; }
      const hx = H.tx - H.x, hz = H.tz - H.z, hd = Math.hypot(hx, hz);
      if (hd > 0.3) { H.x += (hx / hd) * 0.8 * dt; H.z += (hz / hd) * 0.8 * dt; }
    }
    const b = L.bear || bearDen();
    if (b.state !== 'dead' && ctx.reached(ctx.D().senaFate === 'die' ? 'cave' : 'herd')) {   // the bear wakes after the cave chapter (Hardcore: during it)
      const near = Math.hypot(P.pos.x - b.x, P.pos.z - b.z) < 150;
      if (near && (!R.bear || R.bear.state !== 'live') && !(R.bear && R.bear.state === 'dead')) spawnBear();
      else if (!near && R.bear && R.bear.state === 'live' && dist2(R.bear) > 190) { b.hp = Math.round(R.bear.hp); ctx.remove(R.bear); R.bear = null; }
    }
    const aD = Math.hypot(P.pos.x - AUR_HOME[0], P.pos.z - AUR_HOME[1]);   // the herd exists within 150 m of the plain (§5.9)
    if (aD < 150 && !R.aur && ctx.reached('hunt')) spawnAurochs();
    else if (aD > 200 && R.aur && R.aur.members.every((o) => (o.state === 'live' ? dist2(o) > 190 : !o.looted || true))) { for (const o of R.aur.members) ctx.remove(o); R.aur = null; }
    R.packs = R.packs.filter((pk) => pk.members.some((w) => ctx.animals.includes(w)));
  }
  return { pack, wolf, wolfDied, spawnAurochs, aurochsHit, spawnBear, bearDied, bearDen, tick, R, makeAlpha };
}
