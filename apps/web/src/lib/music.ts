import { audioContext } from "./feedback";

/**
 * Background music: a laid-back amapiano-style groove (kalimba, log drum, shaker, warm pads) synthesised
 * live, like the sound effects, so we ship no audio files. `musicStep` is the pure score; the player
 * schedules it a little ahead of time with Web Audio.
 */

export const BPM = 100;
/** Sixteenth notes per bar, and bars before the score repeats. */
export const STEPS_PER_BAR = 16;
export const BARS = 16;
export const LOOP = STEPS_PER_BAR * BARS;

export type Voice = "kick" | "shaker" | "log" | "kalimba" | "pad";
export type Note = { voice: Voice; freq?: number; gain: number };

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Am – F – C – G, two bars each. Log drum roots and pad triads (MIDI).
const CHORDS = [
  { root: 33, pad: [57, 60, 64] }, // Am
  { root: 29, pad: [53, 57, 60] }, // F
  { root: 36, pad: [55, 60, 64] }, // C
  { root: 31, pad: [55, 59, 62] }, // G
];

// Log drum rhythm (step → semitones above the root), alternating every bar.
const LOGS: Record<number, number>[] = [
  { 0: 0, 3: 0, 6: 3, 10: 7, 13: 5 },
  { 0: 0, 3: 0, 7: 7, 9: 10, 11: 7, 14: 3 },
];

// Kalimba phrases in A minor pentatonic, one note per eighth (null = rest), two bars each.
const PHRASES: (number | null)[][] = [
  [76, null, 69, 72, null, 74, 76, null, 79, null, 76, 74, null, 72, 69, null],
  [72, 74, null, 76, null, 74, 72, null, 69, null, 72, null, 74, null, null, null],
  [79, null, 76, null, 74, 76, null, 72, 74, null, 69, null, 72, null, null, null],
  [69, null, null, 72, 74, null, 76, 79, null, 81, null, 79, 76, null, 74, null],
];
// Which phrase plays in each two-bar block; the first block is quiet so the groove eases in.
const PHRASE_ORDER: (number | null)[] = [null, 0, 1, 0, 2, 3, 1, 2];

/** Everything that sounds on sixteenth `step` (any integer; the score loops every `LOOP` steps). */
export function musicStep(step: number): Note[] {
  const s = ((step % LOOP) + LOOP) % LOOP;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const inBar = s % STEPS_PER_BAR;
  const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
  const notes: Note[] = [];

  if (inBar % 4 === 0) notes.push({ voice: "kick", gain: inBar === 0 ? 1 : 0.7 });
  if (inBar % 2 === 1) notes.push({ voice: "shaker", gain: inBar % 4 === 3 ? 1 : 0.6 });
  else if (bar > 0) notes.push({ voice: "shaker", gain: 0.3 });

  const log = LOGS[bar % 2]![inBar];
  if (log !== undefined && bar > 0) notes.push({ voice: "log", freq: hz(chord.root + log), gain: 1 });

  if (inBar === 0 && bar % 2 === 0) for (const n of chord.pad) notes.push({ voice: "pad", freq: hz(n), gain: 1 });

  const phrase = PHRASE_ORDER[Math.floor(bar / 2) % PHRASE_ORDER.length];
  if (phrase !== null && phrase !== undefined && inBar % 2 === 0) {
    const n = PHRASES[phrase]![(bar % 2) * 8 + inBar / 2];
    if (n !== null && n !== undefined) notes.push({ voice: "kalimba", freq: hz(n), gain: 1 });
  }
  return notes;
}

const SIXTEENTH = 60 / BPM / 4;
const VOLUME = 0.22;
const LOOKAHEAD = 0.25;

type Player = { ctx: AudioContext; out: GainNode; noise: AudioBuffer; step: number; next: number; timer: ReturnType<typeof setInterval> };
let player: Player | null = null;

function env(g: GainNode, t: number, peak: number, decay: number, attack = 0.004) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function voice(p: Player, note: Note, t: number) {
  const { ctx, out } = p;
  const g = ctx.createGain();
  g.connect(out);
  const osc = (type: OscillatorType, freq: number, stop: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    o.start(t);
    o.stop(t + stop);
    return o;
  };
  switch (note.voice) {
    case "kick": {
      const o = osc("sine", 130, 0.35);
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      env(g, t, 0.55 * note.gain, 0.28);
      break;
    }
    case "shaker": {
      const src = ctx.createBufferSource();
      src.buffer = p.noise;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7000;
      src.connect(f).connect(g);
      src.start(t, Math.random() * 0.5, 0.06);
      env(g, t, 0.07 * note.gain, 0.045);
      break;
    }
    case "log": {
      const o = osc("sine", note.freq!, 0.5);
      o.frequency.setValueAtTime(note.freq! * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(note.freq!, t + 0.045);
      env(g, t, 0.45 * note.gain, 0.4, 0.006);
      break;
    }
    case "kalimba": {
      osc("triangle", note.freq!, 0.6);
      osc("sine", note.freq! * 2, 0.6);
      env(g, t, 0.13 * note.gain, 0.5);
      break;
    }
    case "pad": {
      const bars2 = SIXTEENTH * STEPS_PER_BAR * 2;
      osc("triangle", note.freq!, bars2 + 0.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035 * note.gain, t + 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + bars2 + 0.1);
      break;
    }
  }
}

function schedule(p: Player) {
  while (p.next < p.ctx.currentTime + LOOKAHEAD) {
    for (const note of musicStep(p.step)) voice(p, note, p.next);
    p.step++;
    p.next += SIXTEENTH;
  }
}

/** Starts the loop (from the top, fading in). Needs a user gesture first on most browsers. */
export function startMusic() {
  if (player || typeof window === "undefined") return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const out = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  out.connect(tone).connect(ctx.destination);
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(VOLUME, ctx.currentTime + 2);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const p: Player = { ctx, out, noise, step: 0, next: ctx.currentTime + 0.1, timer: 0 as unknown as ReturnType<typeof setInterval> };
  p.timer = setInterval(() => schedule(p), 50);
  schedule(p);
  player = p;
}

/** Fades out and stops. */
export function stopMusic() {
  const p = player;
  if (!p) return;
  player = null;
  clearInterval(p.timer);
  const now = p.ctx.currentTime;
  p.out.gain.cancelScheduledValues(now);
  p.out.gain.setValueAtTime(Math.max(p.out.gain.value, 0.0001), now);
  p.out.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  setTimeout(() => p.out.disconnect(), 1000);
}

export const isPlaying = () => player !== null;
