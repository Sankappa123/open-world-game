// ---------- ROM romance v2: tiers, lines, rules and pose overrides (spec_mature.md M6) ----------
// The game-coupled half (the Sena menu, scenes, cameras, RST night, hooks) is in main.js's "ROM" section.
// Everything here is data, pure rules (unit-tested in node) and pose-override factories that get ik2 injected.
//
// CONTENT GUARDRAILS (spec §2, as updated by §12). Binding on every line of this file and the ROM section:
// 1. Romance is strictly non-explicit.
//    - Affection is limited to hand-holding, embrace, kiss (lips or forehead) and resting together clothed.
//    - Intimacy is always shown as embrace, then kiss, then a cut or fade to black, then the next morning.
//    - No sex scenes. No sexual sounds, text or innuendo beyond warm, adult tenderness (§12: passionate adult
//      dialogue and kiss/embrace scenes are fine; still nothing sexual).
//    - No undressing API, and no nude or underwear meshes or textures. Never swap the Quaternius clothed bodies.
//    - In bed, only show sleeping: clothed, under the blanket, holding hands (the existing RST look).
//    - Romance happens only between Aro and Sena, both adults.
//    - No romance scene is available when a child is within 15 m or awake in the house.
// 2. No sexual violence or threat of it, anywhere.
// 3. Children (Lio, Pell, any child) are never harmed, targeted, endangered on screen or shown dead.
// 4. Violence is combat/hunting violence only; no torture mechanics.
// 5. The death of a main character is non-graphic.
// 6. Settings always win: Romance "Fade early" cuts at the embrace; "Off" hides kiss, embrace, hand-holding and
//    night options (Closeness and dialogue still work).

// ----- tiers on S.close
export const TIERS = [
  { min: 0, id: 'companions', name: 'Companions' },
  { min: 20, id: 'fond', name: 'Fond' },
  { min: 40, id: 'close', name: 'Close' },
  { min: 60, id: 'devoted', name: 'Devoted' },
  { min: 80, id: 'beloved', name: 'Beloved' },
];
export function tierOf(close) { let t = TIERS[0]; for (const x of TIERS) if (close >= x.min) t = x; return t; }
export const HEARTS = [20, 40, 60, 80, 100];
export const GATE = { hand: 25, embrace: 40, bench: 40, peck: 40, kiss: 60, night: 70, beloved: 80 };

// ----- the Sena menu. s: a snapshot {close, firstKiss, romance:'full'|'fade'|'off', rift, kidNear, gift (has any), giftToday}
// Returns [{id, ok, hint}] in menu order; 'when' filtering (hidden) vs req (greyed with a hint) as the spec says.
export function menuRules(s) {
  const out = [{ id: 'talk', ok: true }];
  if (s.romance !== 'off') {
    if (s.holding) out.push({ id: 'letgo', ok: true });
    else if (s.close >= GATE.hand) out.push({ id: 'hand', ok: true });
    if (s.close >= GATE.embrace) out.push({ id: 'embrace', ok: !s.kidNear, hint: s.kidNear ? 'Not with the little one so close' : '' });
    if (s.close >= GATE.kiss && s.firstKiss != null) out.push({ id: 'kiss', ok: !s.kidNear, hint: s.kidNear ? 'Not with the little one so close' : '' });
  }
  if (s.gift) out.push({ id: 'gift', ok: !s.giftToday, hint: s.giftToday ? 'One gift a day' : '' });
  return out;
}
// The fade-to-black night option in the rest menu (spec M6 task 9). s: {close, firstKiss, house, bed, time, rift, hostile,
// day, lastNight, romance, kidsOk}. Returns null when allowed, else the first reason.
export function nightBlock(s) {
  if (s.romance !== 'full') return 'setting';
  if (s.close < GATE.night) return 'close';
  if (s.firstKiss == null) return 'kiss';
  if (!s.house || !s.bed) return 'bed';
  if (!(s.time >= 19 && s.time < 23.99)) return 'time';
  if (s.rift > 0) return 'rift';
  if (s.hostile) return 'hostile';
  if (s.lastNight != null && s.day - s.lastNight < 2) return 'recent';
  if (!s.kidsOk) return 'kids';
  return null;
}
// Gifts: closeness for a gift. g: item key; seen: S.rom.gifts; winter: the first winter gift gets +3 more.
export function giftValue(g, seen = {}, winter = false) {
  let n = g === 'meat' ? -1 : g === 'beads' ? (seen.beads ? 1 : 4) : g === 'carving' ? (seen.carving ? 1 : 3) : g === 'flowers' ? 3 : 1;
  if (winter && g !== 'meat' && !seen.snow) n += 3;
  return n;
}
// Rift halves positive closeness gains (Math.round: 4 -> 2, 3 -> 2, 1 -> 1).
export const riftK = (n, rift) => (rift > 0 && n > 0 ? Math.round(n / 2) : n);
// Neglect: whole game days since the last shared act, after the grace of 3 days. lastShared and gh in game hours.
export const neglectDays = (gh, lastShared) => Math.max(0, Math.floor((gh - lastShared) / 24) - 2);

// ----- lines (Appendix A plus the ROM set; adult tenderness, never sexual)
export const L = {
  embrace: ['Stay like this. A little longer.', 'You smell of smoke and pine. I like it.', 'Hold me tighter, Aro. I am not made of reeds.', 'Here. This is the warmest place in the valley.', 'Your heart is loud. Mine too.'],
  kiss: ['You still look at me like the first day.', 'Again. I was not ready that time.', 'Careful, Aro. I could get used to this.', 'Every time, I forget what I was about to say.', 'Mm. Now the day can start.'],
  hand: ['Your hand is cold. Give it here.', 'Walk slower. I want this to last.', 'There. Now I will not lose you in the grass.'],
  handTake: 'Your hand is cold. Give it here.',
  notNow: 'Not now.',
  apart: 'I will sleep by the fire tonight.',
  neglect: 'You have been far away, even when you are here.',
  peckHome: ['Home again.', 'There you are. I was starting to listen for you.', 'You came back with all your fingers. Good.'],
  peckLeave: ['Come back to me before dark.', 'Go on. And be careful, Aro.'],
  // the fade night (Appendix A)
  night: [['Sena', 'Bank the fire, Aro. Then come to bed.'], ['Aro', 'The fire can wait.'], ['Sena', 'Leave it. Come here.']],
  nightCard: 'The hearth burned down to embers, and no one rose to feed it.',
  nightCardWinter: 'Outside, the snow kept falling. Inside, no one was cold.',
  nightMorning: 'You are smiling in your sleep. Still.',
  // the first kiss: ARC calls it at fever recovery (Appendix A); the fire-sit fallback has its own lead-in
  firstFever: [['Sena', 'You did not sleep.'], ['Aro', 'I did not want to miss it.'], ['Sena', 'Miss what?'], ['Aro', 'You, waking up.']],
  firstFire: [['Sena', 'You keep looking at me, Aro. Across the fire, every night.'], ['Aro', 'I keep wanting to.'], ['Sena', 'Then stop looking.']],
  firstAgain: [['Sena', 'The fire is warm tonight.'], ['Aro', 'Sena…'], ['Sena', 'Ask me again. I will not run.']],
  firstKissAfter: [['Sena', 'Took you long enough.'], ['Aro', 'I was waiting for you to be sure.'], ['Sena', 'I was sure in the cold hills.']],
  firstHandAfter: [['Sena', 'Then hold it. I am not going anywhere.']],
  // gifts
  gift: {
    beads: ['Ochre beads… you made these? I will never take them off.', 'More beads! I will wear them all at once and rattle when I walk.'],
    carving: ['A little figure. It looks like me, if I were angry. I love it.', 'Another one. Soon they will need their own hut.'],
    meat: ['Raw meat. For me. Charming.'],
    snow: 'The first snow, and a gift. I will remember both.',
  },
  // heart events (once each, +2)
  heart: {
    20: [['Sena', 'My mother gave away her share, the hungry winter. She said she was not hungry.'], ['Aro', 'And you believed her.'], ['Sena', 'I was six. I wanted to believe her.'], ['Sena', 'I do not want a valley where anyone has to say that.']],
    40: [['Aro', 'My brother Dain used to bring me up to high places like this.'], ['Sena', 'You never speak of him.'], ['Aro', 'Raiders came down the river the spring I was twelve. He went out to meet them. He told me to count the stars until he came back.'], ['Aro', 'I am still counting.'], ['Sena', 'Then count them with me. I will stay until you finish.']],
    '40hint': 'Take me up to Lookout Peak some night, Aro. I want to see the whole valley under the stars.',
    60: [['Sena', 'Aro…'], ['Aro', 'Sena.'], ['', '(A wolf howls, close, and the moment breaks.)'], ['Sena', 'Even the wolves are jealous.'], ['Aro', 'Then let them howl. There will be another night.']],
    80: [['Sena', 'Close your eyes. Hold out your hands.'], ['Sena', 'A horse. I carved her from the ash wood, the nights you were asleep before me.'], ['Aro', 'She runs, even standing still.'], ['Sena', 'Put her by the hearth. Then she is home too.']],
    100: [['Sena', 'Aro. Look at me.'], ['Sena', 'I want a child with you, Aro.'], ['Aro', 'Then we will build a cradle before the snow, and a room after it.']],
    '100kid': [['Sena', 'Aro. Look at me.'], ['Sena', 'Lio should not be the only one. I want another child with you.'], ['Aro', 'Then I had better build another room.']],
  },
};
// the 40 hint lives under a string key; keep a clean accessor
export const heartLines = (n, kids = 0) => (n === 100 && kids ? L.heart['100kid'] : L.heart[n]);

// ----- pose overrides (injected: THREE and ik2 from people.js). Each factory returns (h) => {...} for h.addOverride.
// C is the ROM runtime context from main.js: {P, N, w, mode, kissK, browK, leanK, T (tune)}.
export function makePoses(THREE, ik2) {
  const V = THREE.Vector3, UP = new V(0, 1, 0);
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
  const a = new V(), b = new V(), c = new V(), d = new V(), e = new V(), f = new V(), g = new V(), m = new V();
  const fwdOf = (x, out) => out.set(Math.sin(x.face), 0, Math.cos(x.face));
  const rightOf = (x, out) => out.set(-Math.cos(x.face), 0, Math.sin(x.face));   // the character's own right hand side
  function rotW(bone, axis, ang) {                       // turn a bone about a world axis, children follow
    if (!ang || !bone) return;
    bone.getWorldQuaternion(q1); bone.parent.getWorldQuaternion(q2);
    q3.setFromAxisAngle(axis, ang).multiply(q1);
    bone.quaternion.copy(q2.invert().multiply(q3));
    bone.updateWorldMatrix(false, true);
  }
  // rotate `bone` so the world point `from` (carried by it) swings toward `to`; w blends; max limits the angle
  function aim(bone, from, to, w, max = 0.6) {
    if (!(w > 0) || !bone) return;
    bone.getWorldPosition(a);
    b.subVectors(from, a); c.subVectors(to, a);
    if (b.lengthSq() < 1e-8 || c.lengthSq() < 1e-8) return;
    b.normalize(); c.normalize();
    const ang = Math.min(max, Math.acos(Math.max(-1, Math.min(1, b.dot(c))))) * w;
    if (ang < 1e-4) return;
    d.crossVectors(b, c); if (d.lengthSq() < 1e-10) return; d.normalize();
    rotW(bone, d, ang);
  }
  // a point in a bone's local frame, in world space
  const ptOf = (bone, local, out) => out.set(local[0], local[1], local[2]).applyMatrix4(bone.matrixWorld);
  function lean(h, x, ang, axisOut) { fwdOf(x, axisOut); axisOut.crossVectors(UP, axisOut).normalize(); rotW(h.bones.spine_02, axisOut, ang * 0.5); rotW(h.bones.spine_03, axisOut, ang * 0.5); }

  return {
    rotW, aim, ptOf, fwdOf, rightOf,
    // Hand in hand (order 30): Aro's right hand and Sena's left meet between them, a little low and forward.
    hand(C, who) {
      return (h) => {
        const w = C.handW; if (!(w > 0)) return;
        const self = who === 'P' ? C.P : C.N, other = who === 'P' ? C.N : C.P, side = who === 'P' ? 'r' : 'l';
        self.h.bones.pelvis.getWorldPosition(a); other.h.bones.pelvis.getWorldPosition(b);
        m.addVectors(a, b).multiplyScalar(0.5); fwdOf(C.P, f);
        m.y += C.T.handY; m.addScaledVector(f, C.T.handFwd);
        h.bones['upperarm_' + side].getWorldPosition(e);
        rightOf(self, g); g.multiplyScalar(side === 'r' ? 1 : -1);          // outward from her/his own body
        e.addScaledVector(UP, -0.5).addScaledVector(f, -0.25).addScaledVector(g, 0.12);
        ik2(h, side, m, e, w);
        if (who === 'P') h.gripR = Math.max(h.gripR, 0.35 * w); else h.gripL = Math.max(h.gripL, 0.35 * w);
      };
    },
    // Embrace / kiss / forehead body (order 15): lean in, heads beside the shoulder (embrace) or to each other (kiss).
    body(C, who) {
      return (h) => {
        const w = C.w; if (!(w > 0) || !C.mode) return;
        const self = who === 'P' ? C.P : C.N, T = C.T, k = C.kissK, br = C.browK;
        lean(h, self, (T.lean + (k + br) * T.kissLean + (who === 'N' ? T.leanN : 0)) * w, d);
        fwdOf(self, f);
        // embrace: each head turns and tips to its own left so it rests past the other's shoulder
        const emb = 1 - Math.max(k, br);
        rotW(h.bones.neck_01, UP, T.headYaw * 0.4 * emb * w);
        rotW(h.bones.Head, UP, T.headYaw * 0.6 * emb * w);
        rotW(h.bones.neck_01, f, -T.headRoll * emb * w);
        // kiss / foreheads: Aro looks down, Sena up; a small opposite tilt so the noses pass
        const pitch = who === 'P' ? T.pitchP : T.pitchN;
        rightOf(self, g);
        rotW(h.bones.Head, g, -pitch * (k + br * 0.6) * w);
        h.bones.Head.getWorldPosition(a); fwdOf(self, f);
        rotW(h.bones.Head, f, (who === 'P' ? 1 : -1) * T.tilt * k * w);
      };
    },
    // Arms (order 30): hands on the other's back. Aro under at mid back, Sena over at his shoulder blades.
    arms(C, who) {
      return (h) => {
        const w = C.w * C.armsW; if (!(w > 0) || !C.mode) return;
        const self = who === 'P' ? C.P : C.N, other = who === 'P' ? C.N : C.P, T = C.T;
        other.h.bones.spine_03.getWorldPosition(c); fwdOf(other, f); rightOf(other, g);
        const up = who === 'P' ? T.handUpP : T.handUpN, out = who === 'P' ? T.handSideP : T.handSideN, back = who === 'P' ? T.handBackP : T.handBackN;
        for (const side of C.freeHands(who)) {
          // my right hand lands on their left side (facing each other): their right * -1
          const s = side === 'r' ? -1 : 1;
          e.copy(c).addScaledVector(UP, up).addScaledVector(g, s * out).addScaledVector(f, -back);
          h.bones['upperarm_' + side].getWorldPosition(a);
          fwdOf(self, m); rightOf(self, d);
          a.addScaledVector(d, (side === 'r' ? 1 : -1) * 0.45).addScaledVector(UP, -0.25).addScaledVector(m, -0.1);
          ik2(h, side, e, a, w);
        }
      };
    },
    // Sena's face to Aro's (order 35, after her arms): swing her neck and head so her lips (kiss) or forehead meets his.
    meet(C) {
      return (h) => {
        const w = C.w, k = C.kissK, br = C.browK; if (!(w > 0) || !C.mode || !(k + br > 0)) return;
        const T = C.T, Ph = C.P.h.bones.Head, Nh = h.bones.Head;
        if (k >= br) { ptOf(Ph, T.lipsP, e); ptOf(Nh, T.lipsN, m); }
        else { ptOf(Ph, T.browP, e); ptOf(Nh, T.browN, m); }
        // stop just short of touching
        d.subVectors(m, e); const dl = d.length(); if (dl > 1e-4) e.addScaledVector(d, Math.min(1, T.gap / dl));
        aim(h.bones.spine_03, m, e, 0.35 * Math.max(k, br) * w, 0.25);
        ptOf(Nh, k >= br ? T.lipsN : T.browN, m);
        aim(h.bones.neck_01, m, e, 0.8 * Math.max(k, br) * w, 0.45);
      };
    },
    // Shared bench (order 15 for her lean, 30 for his arm): she leans toward him; at Beloved her head is on his shoulder.
    shoulder(C, who) {
      return (h) => {
        const w = C.benchW; if (!(w > 0)) return;
        const T = C.T;
        if (who === 'N') {
          // the top of his near shoulder (the upperarm joint; the clavicle bone's origin is at the base of the neck)
          C.P.h.bones['upperarm_' + C.benchSideP].getWorldPosition(e); e.y += T.shoulderUp;
          ptOf(h.bones.Head, T.cheekN, m);
          const k = C.benchHead ? 1 : 0.35;
          aim(h.bones.spine_02, m, e, 0.5 * k * w, 0.3);
          ptOf(h.bones.Head, T.cheekN, m);
          aim(h.bones.neck_01, m, e, 0.7 * k * w, 0.5);
        } else if (C.benchHead) {
          // his near arm around her: the hand on her far shoulder. Both face the fire, so his near side and her far side
          // share a letter (she sits on his right -> her right shoulder is the far one). The elbow stays behind her back.
          const side = C.benchSideP;
          C.N.h.bones['upperarm_' + side].getWorldPosition(e); fwdOf(C.N, f); e.y += T.armUp; e.addScaledVector(f, -T.armBack);
          h.bones['upperarm_' + side].getWorldPosition(a); a.y -= 0.12; fwdOf(C.P, f); a.addScaledVector(f, -0.42);
          ik2(h, side, e, a, w);
          h.gripR = side === 'r' ? Math.max(h.gripR, 0.25 * w) : h.gripR; h.gripL = side === 'l' ? Math.max(h.gripL, 0.25 * w) : h.gripL;
        }
      };
    },
  };
}
