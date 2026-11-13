// ---------- MUS adaptive procedural score (spec_mature.md M6) ----------
// Everything is synthesised with WebAudio: a pentatonic drone pad (two detuned saws through a lowpass), a bone-flute
// melody (sine with delayed vibrato plus a breath of noise), a frame drum (lowpass noise burst with a soft thump) and a
// short feedback-delay "room". A lookahead scheduler books notes up to ctx.currentTime + 0.4 s, so the score keeps
// time at 5 fps. Each state has its own bus; a state change crossfades the buses over 3 s. At most 12 oscillators sound
// at once (spec §5.9). pickState() is pure (unit-tested in node); main.js's MUS section feeds it the game snapshot.

export const STATES = ['title', 'day', 'night', 'cave', 'danger', 'combat', 'fire', 'romance', 'grief', 'raid'];
export const XFADE = 3;
export const MAX_OSC = 12;

// s: {playing, forced, grief, romance, raid, combat, danger, fire, cave, night}
export function pickState(s) {
  if (!s.playing) return 'title';
  if (s.forced && STATES.includes(s.forced)) return s.forced;
  if (s.grief) return 'grief';
  if (s.romance) return 'romance';
  if (s.raid) return 'raid';
  if (s.combat) return 'combat';
  if (s.danger) return 'danger';
  if (s.fire) return 'fire';
  if (s.cave) return 'cave';
  return s.night ? 'night' : 'day';
}
// Calm states wait for the candidate to hold this long; tense ones (and leaving them for grief/romance) switch at once.
export const URGENT = { danger: 1, combat: 1, raid: 1, grief: 1, romance: 1 };
export function settleState(cur, cand, heldFor) {
  if (cand === cur) return cur;
  if (URGENT[cand]) return cand;
  return heldFor >= (URGENT[cur] ? 4 : 2) ? cand : cur;
}

const MAJ = [0, 2, 4, 7, 9], MIN = [0, 3, 5, 7, 10];
// root: MIDI note of the pad root. bar: seconds per bar (16 steps). chords: pad offsets per bar (semitones from root).
// pad/flute/drum: levels. cut: pad lowpass Hz. dens: chance a flute phrase note starts on an even step. oct: flute octave
// above the root. drum: 16-step velocity pattern. long: flute note length range in steps.
export const MOODS = {
  title: { root: 50, scale: MIN, bar: 6.4, chords: [[0, 7], [-4, 3], [-2, 5], [0, 7]], pad: 0.05, cut: 900, flute: 0.05, dens: 0.34, oct: 24, long: [2, 6], drum: null, dl: 0 },
  day: { root: 55, scale: MAJ, bar: 5.6, chords: [[0, 7], [-7, 0], [-3, 4], [-5, 2]], pad: 0.04, cut: 1100, flute: 0.045, dens: 0.3, oct: 24, long: [2, 5], drum: null, dl: 0 },
  night: { root: 57, scale: MIN, bar: 7.2, chords: [[0, 7], [-4, 3], [-7, 0], [-2, 5]], pad: 0.04, cut: 650, flute: 0.035, dens: 0.18, oct: 12, long: [3, 8], drum: null, dl: 0 },
  cave: { root: 45, scale: MIN, bar: 9, chords: [[0, 7], [0, 7], [-2, 5], [0, 7]], pad: 0.05, cut: 420, flute: 0.03, dens: 0.1, oct: 24, long: [4, 10], drum: null, dl: 0 },
  danger: { root: 50, scale: MIN, bar: 4, chords: [[0, 6], [0, 6], [1, 7], [0, 6]], pad: 0.05, cut: 520, flute: 0.025, dens: 0.08, oct: 12, long: [1, 2],
    drum: [1, 0, 0, 0, 0.55, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dl: 0.22 },
  combat: { root: 50, scale: MIN, bar: 2.4, chords: [[0, 7], [0, 7], [-2, 5], [1, 8]], pad: 0.05, cut: 900, flute: 0.035, dens: 0.3, oct: 24, long: [1, 2],
    drum: [1, 0, 0.35, 0, 0.7, 0, 0.35, 0.3, 1, 0, 0.35, 0, 0.7, 0.3, 0.5, 0.3], dl: 0.3 },
  fire: { root: 52, scale: MAJ, bar: 6.8, chords: [[0, 7], [-3, 4], [-7, 0], [-5, 2]], pad: 0.035, cut: 800, flute: 0.04, dens: 0.26, oct: 12, long: [2, 6], drum: null, dl: 0 },
  romance: { root: 53, scale: MAJ, bar: 6, chords: [[0, 7], [-3, 4], [-7, 2], [-5, 2]], pad: 0.05, cut: 1000, flute: 0.045, dens: 0.3, oct: 12, long: [3, 7], drum: null, dl: 0 },
  grief: { root: 48, scale: MIN, bar: 8, chords: [[0, 7], [-4, 3], [-7, 0], [-5, 2]], pad: 0.05, cut: 600, flute: 0.045, dens: 0.18, oct: 12, long: [4, 9], drum: null, dl: 0 },
  raid: { root: 47, scale: MIN, bar: 2.4, chords: [[0, 7], [0, 7], [-2, 5], [-4, 3]], pad: 0.06, cut: 1000, flute: 0.03, dens: 0.2, oct: 12, long: [1, 3],
    drum: [1, 0, 0.5, 0, 1, 0, 0.5, 0.4, 1, 0.4, 0.5, 0, 1, 0.5, 0.7, 0.5], dl: 0.36 },
};
const mtof = (n) => 440 * 2 ** ((n - 69) / 12);

// A wolf howl (ROM heart 60): a saw gliding up and falling away, through a lowpass, with vibrato.
export function howl(ctx, dest, when = ctx.currentTime, vol = 0.09) {
  const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth'; lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 2;
  const t = when;
  o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(540, t + 0.9); o.frequency.linearRampToValueAtTime(500, t + 1.9); o.frequency.exponentialRampToValueAtTime(290, t + 2.8);
  lfo.frequency.value = 5.5; lg.gain.value = 7; lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.5); g.gain.setValueAtTime(vol, t + 2); g.gain.exponentialRampToValueAtTime(0.001, t + 2.9);
  o.connect(lp).connect(g).connect(dest);
  o.start(t); lfo.start(t); o.stop(t + 3); lfo.stop(t + 3);
}

// ctx: AudioContext; dest: the music volume bus; noise: a looping-noise AudioBuffer (A.buf).
export function createMusic(ctx, dest, noise) {
  const duck = ctx.createGain(); duck.connect(dest);
  // the room: a short feedback delay, darkened
  const send = ctx.createGain(), dl = ctx.createDelay(1), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
  send.gain.value = 0.32; dl.delayTime.value = 0.29; fb.gain.value = 0.36; dlp.type = 'lowpass'; dlp.frequency.value = 1900;
  send.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(duck);
  const sting = ctx.createGain(); sting.gain.value = 1; sting.connect(duck); sting.connect(send);
  const buses = {};
  const bus = (s) => { if (!buses[s]) { const g = ctx.createGain(); g.gain.value = 0; g.connect(duck); g.connect(send); buses[s] = g; } return buses[s]; };
  const M = { state: null, step: 0, nextT: 0, bar: 0, phrase: 0, deg: 0, hold: 0, osc: [], ducked: false, last: 0, log: [] };

  // the oscillator budget: [start, end] of every booked oscillator
  function room(t0, t1, n) {
    const now = ctx.currentTime;
    M.osc = M.osc.filter((v) => v[1] > now);
    let c = 0; for (const v of M.osc) if (v[0] < t1 && v[1] > t0) c++;
    if (c + n > MAX_OSC) return false;
    for (let i = 0; i < n; i++) M.osc.push([t0, t1]);
    return true;
  }
  function pad(out, mood, notes, t, dur) {
    for (const off of notes) {
      const f = mtof(mood.root + off), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      const two = room(t, t + dur + 1.7, 2), one = two || room(t, t + dur + 1.7, 1);
      if (!one) return;
      lp.type = 'lowpass'; lp.frequency.value = mood.cut; lp.Q.value = 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(mood.pad / notes.length, t + 1.4); g.gain.setValueAtTime(mood.pad / notes.length, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
      lp.connect(g).connect(out);
      for (const det of two ? [-7, 7] : [0]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 1.7);
      }
    }
  }
  function flute(out, mood, n, t, dur, vol = mood.flute) {
    if (!room(t, t + dur + 0.4, 2)) return false;
    const f = mtof(n), o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    lfo.frequency.value = 5 + Math.random() * 0.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.35, dur * 0.6));
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.07); g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.3);
    o.connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + dur + 0.35); lfo.stop(t + dur + 0.35);
    // the breath: a short band of noise at the attack
    const b = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    b.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 2.2); bp.Q.value = 1.4;
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(vol * 0.5, t + 0.03); bg.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    b.connect(bp).connect(bg).connect(out); b.start(t, Math.random() * 1.5); b.stop(t + 0.25);
    return true;
  }
  function drum(out, v, t, lvl) {
    const b = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    b.buffer = noise; lp.type = 'lowpass'; lp.frequency.value = 260 + v * 220;
    g.gain.setValueAtTime(lvl * v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.32);
    b.connect(lp).connect(g).connect(out); b.start(t, Math.random() * 1.5); b.stop(t + 0.34);
    if (v >= 0.5 && room(t, t + 0.25, 1)) {               // the skin's thump
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.18);
      og.gain.setValueAtTime(lvl * v * 0.9, t); og.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.24);
    }
  }
  // the melody: a random walk on the scale, biased to chord tones, in phrases with rests
  function scaleNote(mood, deg) {
    const s = mood.scale, o = Math.floor(deg / s.length), i = ((deg % s.length) + s.length) % s.length;
    return mood.root + mood.oct + o * 12 + s[i];
  }
  function stepTick(t) {
    const s = M.state, mood = MOODS[s], out = bus(s), sd = mood.bar / 16, i = M.step % 16;
    if (i === 0) {
      const ch = mood.chords[M.bar % mood.chords.length];
      pad(out, mood, ch, t, mood.bar);
      M.bar++;
    }
    if (mood.drum && mood.drum[i] > 0) drum(out, mood.drum[i], t, mood.dl);
    if (M.hold > 0) { M.hold--; }
    else if (i % 2 === 0 && mood.flute > 0) {
      if (M.phrase <= 0) {                               // between phrases: rest, then maybe start one
        if (Math.random() < mood.dens) { M.phrase = 3 + ((Math.random() * 5) | 0); M.deg = [0, 2, 4][(Math.random() * 3) | 0]; }
        else M.hold = 1 + ((Math.random() * 3) | 0);
      }
      if (M.phrase > 0) {
        const last = M.phrase === 1;
        let d = M.deg + [-2, -1, -1, 1, 1, 2, 0][(Math.random() * 7) | 0];
        if (last) d = Math.round(d / 5) * 5 + (Math.random() < 0.5 ? 0 : 3);   // land on the root or the fifth
        M.deg = Math.max(-3, Math.min(8, d));
        const len = mood.long[0] + ((Math.random() * (mood.long[1] - mood.long[0] + 1)) | 0);
        if (flute(out, mood, scaleNote(mood, M.deg), t, len * sd * 0.92)) { M.hold = Math.max(0, len - 1); }
        M.phrase--;
        if (last) M.hold += 2 + ((Math.random() * 6) | 0);
      }
    }
    M.step++;
  }
  const api = {
    get state() { return M.state; },
    M, buses, duckNode: duck, stingBus: sting,
    setState(s, fade = XFADE) {
      if (!MOODS[s] || s === M.state) return;
      const now = ctx.currentTime, prev = M.state;
      if (prev) { const g = bus(prev).gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade); }
      const g = bus(s).gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(1, now + (prev ? fade : 1.5));
      M.state = s; M.step = 0; M.bar = 0; M.phrase = 0; M.hold = 0;
      M.nextT = Math.max(M.nextT, now + 0.05);
      M.log.push([s, +now.toFixed(2)]); if (M.log.length > 40) M.log.shift();
    },
    // book everything due before currentTime + 0.4 s
    tick() {
      if (!M.state || ctx.state === 'closed') return;
      const now = ctx.currentTime, ahead = now + 0.4;
      if (M.nextT < now - 1) M.nextT = now + 0.05;        // the context was suspended or the tab slept: no catch-up burst
      let n = 0;
      while (M.nextT < ahead && n++ < 64) { stepTick(M.nextT); M.nextT += MOODS[M.state].bar / 16; }
    },
    duck(on) {
      if (on === M.ducked) return;
      M.ducked = on; const now = ctx.currentTime;
      duck.gain.cancelScheduledValues(now); duck.gain.setValueAtTime(duck.gain.value, now); duck.gain.linearRampToValueAtTime(on ? 0.5 : 1, now + (on ? 0.25 : 0.8));
    },
    // stingers: chapter card, POI discovery, the thaw (winter ends), the death lament
    sting(kind) {
      const t = ctx.currentTime + 0.05, m = MOODS[kind === 'lament' ? 'grief' : kind === 'thaw' ? 'romance' : 'day'];
      const seq = {
        chapter: [[0, 0, 0.9], [7, 0.45, 0.9], [12, 0.9, 2.2]],
        poi: [[7, 0, 0.35], [12, 0.18, 1.1]],
        thaw: [[0, 0, 0.5], [2, 0.32, 0.5], [4, 0.64, 0.5], [7, 0.96, 0.6], [12, 1.36, 2.2]],
        lament: [[12, 0, 1.4], [10, 1.2, 1.2], [7, 2.3, 1.4], [5, 3.5, 1.2], [3, 4.6, 3]],
      }[kind];
      if (!seq) return false;
      if (kind === 'chapter' || kind === 'thaw' || kind === 'lament') pad(sting, { ...m, pad: 0.06 }, [0, 7], t, kind === 'lament' ? 6 : 3);
      for (const [off, dt, len] of seq) flute(sting, m, m.root + m.oct + off, t + dt, len, m.flute * 1.25);
      return true;
    },
    voices() { const now = ctx.currentTime; return M.osc.filter((v) => v[0] <= now && v[1] > now).length; },
  };
  return api;
}
