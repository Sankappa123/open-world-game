// CMB combat v2 (spec_mature.md §7 M4): the tables and pure rules (unit-tested in node), plus small THREE helpers
// shared by the predators (enemies.js), the Ash People raiders (tribe.js) and the CMB section of main.js:
// telegraph glints and overhead bars. Dismemberment is GORE's (gore.js sever, driven by animalHit / foeHit events).
import * as THREE from 'three';

// ----- tables (§7 M4 task 1). HP is multiplied by D().foeHpK, damage to Aro/Sena by D().dmgK (MAT, order 20).
export const FOE_HP = { deer: 8, stag: 12, fox: 3, wolf: 14, alpha: 30, aurochs: 90, bear: 120, raider: 40, korr: 80 };
export const WEAPON_DMG = { fists: 2, axe: 6, flintaxe: 9, spear: 5, flintspear: 7, thrown: 12, flintthrown: 22 };
export const FOE_DMG = { bite: 8, alphaBite: 14, gore: 25, swipe: 22, maul: 30, raider: 10, raiderHeavy: 18, raiderSpear: 12, senaThrow: 4, brace: 45 };
export const STAM = { light: 10, heavy: 22, dodge: 18, blockK: 1.5, regen: 18, delay: 0.8, low: 20 };
export const BLOCK_RED = { axe: 0.8, torch: 0.6, fists: 0.5 };
export const T = {
  buffer: 0.25, heavyHold: 0.4, parry: 0.18, iframe0: 0.10, iframe1: 0.40, perfect: 0.15, roll: 0.55, rollDist: 3.2,
  guardBreak: 1, parrySlow: 0.2, perfectSlow: 0.4, counter: 1.2, knockDown: 1.2, finisherSlow: 0.25, finisherK: 0.35,
};
export const POSTURE = { light: 16, heavyK: 2, parry: 50, blocked: 10, regen: 15, regenDelay: 2, stagger: 2 };
// Combos: [upper-body clip, timeScale, cooldown s, hit delay s, reach m, cone (cos), damage multiplier]
export const COMBO = {
  axe: [['swordA', 1.15, 0.5, 0.2, 2.5, 0.2, 1], ['swordB', 1.15, 0.52, 0.2, 2.5, 0.2, 1.05], ['swordC', 1.5, 0.85, 0.42, 2.6, 0.15, 1.35]],
  spear: [['jabU', 1.4, 0.5, 0.2, 2.8, 0.35, 1], ['jabU', 1.55, 0.5, 0.19, 2.8, 0.35, 1], ['jabU', 1.1, 0.75, 0.3, 3.1, 0.4, 1.4]],
  fists: [['jabU', 1.7, 0.4, 0.17, 2.2, 0.2, 1], ['crossU', 1.7, 0.44, 0.19, 2.2, 0.2, 1.1], ['hookU', 1.3, 0.6, 0.25, 2.1, 0.25, 1.5]],
};
export const HEAVY = { axe: ['swordC', 1.0, 1.15, 0.55, 2.7, 0.15], spear: ['jabU', 0.9, 1.0, 0.42, 3.2, 0.4], fists: ['hookU', 1.0, 0.85, 0.36, 2.2, 0.25] };

// ----- pure rules
const TAU = Math.PI * 2;
export const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
// Is (dx, dz) (a vector from the defender to the attacker) inside the defender's front cone of `deg` degrees?
export function inFront(face, dx, dz, deg) {
  const l = Math.hypot(dx, dz); if (l < 1e-6) return true;
  return Math.abs(wrap(Math.atan2(dx, dz) - face)) <= (deg * Math.PI) / 360;
}
// Block outcome for a hit of `dmg` on a guard with `weapon`: what gets through and the stamina it costs.
export function blockHit(dmg, weapon, stam) {
  const red = BLOCK_RED[weapon] ?? 0.5, cost = dmg * STAM.blockK;
  const left = stam - cost;
  return { dmg: dmg * (1 - red), stam: Math.max(0, left), broken: left <= 0 };
}
// The parry window: the guard was raised within T.parry s before the impact.
export const isParry = (blockAt, now) => blockAt != null && now - blockAt >= 0 && now - blockAt <= T.parry;
// Dodge: i-frames from 0.10 to 0.40 s into the roll; perfect if the impact is within T.perfect s of the roll start.
export function dodgeState(rollAt, now) {
  if (rollAt == null) return { iframe: false, perfect: false };
  const t = now - rollAt;
  return { iframe: t >= T.iframe0 && t <= T.iframe1, perfect: t >= 0 && t <= T.perfect };
}
// Posture: add, tick (regen 15/s after 2 s without a hit), and whether it broke.
export function postureAdd(o, amount, now) {
  o.posture = Math.min(100, (o.posture || 0) + amount); o.postureT = now;
  if (o.posture >= 100) { o.posture = 0; return true; }
  return false;
}
export function postureTick(o, dt, now) {
  if (o.posture > 0 && now - (o.postureT || 0) > POSTURE.regenDelay) o.posture = Math.max(0, o.posture - POSTURE.regen * dt);
}
// Raider block chance: 25%, +20% for each of the player's last 3 attacks that matched this one's type.
export function raiderBlockChance(history, kind) {
  let n = 0; for (const k of history.slice(-3)) if (k === kind) n++;
  return Math.min(0.85, 0.25 + 0.2 * n);
}
// Raider sight: cone 110°, 30 m by day and 14 m at night; ×1.8 torch, ×0.5 sneaking, ×0.6 in forest.
export function sightRange({ night = 0, torch = false, sneak = false, forest = false }) {
  let r = night > 0.5 ? 14 : 30;
  if (torch) r *= 1.8; if (sneak) r *= 0.5; if (forest) r *= 0.6;
  return r;
}
// Hearing: sprint 20 m, walk 8 m, sneak 2 m, combat 35 m.
export function hearRange({ speed = 0, sneak = false, combat = false }) {
  if (combat) return 35;
  if (speed < 0.2) return 0;
  return sneak ? 2 : speed > 5 ? 20 : 8;
}
// Detection rate per second for a target at distance d inside range r (closer = faster); 0 outside.
export const detectRate = (d, r) => (d >= r ? 0 : 0.35 + 2.2 * (1 - d / r) ** 2);
// Flee rule for raiders: low hp, the leader dead, or two allies dead.
export const shouldFlee = (hp, maxHp, leaderDead, alliesDead, isLeader) => !isLeader && (hp < maxHp * 0.25 || leaderDead || alliesDead >= 2);
// Attack tokens: at most `max` brawlers in melee at once. Returns the set of foes allowed to close in.
export function tokens(list, dist, max = 2) { return new Set(list.slice().sort((a, b) => dist(a) - dist(b)).slice(0, max)); }
// Stamina-limited swing speed: below 20% stamina swings play at ×0.8.
export const swingK = (stam) => (stam < STAM.low ? 0.8 : 1);
// Bear topple: θ'' = 9·sin(θ + 0.1), up to 85°.
export function toppleStep(s, dt) { if (s.th < 1.48) { s.v += 9 * Math.sin(s.th + 0.1) * dt; s.th = Math.min(1.48, s.th + s.v * dt); } return s.th; }
// Maul QTE: mash E 8 times in 2.5 s.
export const MAUL = { need: 8, time: 2.5 };

// ----- THREE helpers
// A soft four-point star for the telegraph glints (white = parry it, red = dodge it).
let starTex = null;
function star() {
  if (starTex) return starTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29); g.closePath(); g.fill();
  starTex = new THREE.CanvasTexture(c); starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}
// Pooled additive glint sprites. spawn(getPos, red, life) follows a moving point (a jaw, a blade) for `life` s.
export function createGlints(scene, n = 10) {
  const pool = Array.from({ length: n }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    s.visible = false; s.renderOrder = 999; scene.add(s);
    return { s, t: 0, life: 0, at: null };
  });
  let i = 0, total = 0;
  return {
    spawn(at, red = false, life = 0.45) {
      const g = pool[i++ % n]; g.at = at; g.t = 0; g.life = life; g.red = red;
      g.s.material.color.set(red ? 0xff3020 : 0xfff6dc); g.s.visible = true; total++;
      return g;
    },
    update(dt, reduce = false) {
      for (const g of pool) {
        if (!g.s.visible) continue;
        g.t += dt; const k = g.t / g.life;
        if (k >= 1) { g.s.visible = false; continue; }
        const p = typeof g.at === 'function' ? g.at() : g.at; if (p) g.s.position.copy(p);
        const pulse = Math.sin(Math.min(1, k * 1.4) * Math.PI);
        g.s.material.opacity = (reduce ? 0.6 : 1) * pulse; g.s.material.rotation = k * 1.2;
        g.s.scale.setScalar((g.red ? 0.75 : 0.6) * (0.5 + pulse));
      }
    },
    get total() { return total; },
    active() { return pool.filter((g) => g.s.visible).length; },
  };
}
// A small billboard bar (posture, detection) drawn on a 64×10 canvas; set(v 0..1, color) redraws only on change.
export function makeBar(w = 0.7, h = 0.09) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 10;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  s.scale.set(w, h, 1); s.renderOrder = 998; s.visible = false;
  let last = '';
  s.userData.set = (v, col, shape = 'bar') => {
    const key = (v * 32 | 0) + col + shape; if (key === last) return; last = key;
    const g = c.getContext('2d'); g.clearRect(0, 0, 64, 10);
    if (shape === 'eye') {                           // detection: a filling eye-shaped lozenge
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(32, 5, 30, 4.5, 0, 0, 6.283); g.fill();
      g.save(); g.beginPath(); g.ellipse(32, 5, 29, 3.6, 0, 0, 6.283); g.clip();
      g.fillStyle = col; g.fillRect(32 - 29 * v, 0, 58 * v, 10); g.restore();
    } else {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, 64, 10);
      g.fillStyle = col; g.fillRect(2, 2, 60 * Math.max(0, Math.min(1, v)), 6);
    }
    tex.needsUpdate = true;
  };
  return s;
}
