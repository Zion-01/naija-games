import { settings } from "./settings";

export type Sfx = "tap" | "play" | "draw" | "special" | "win" | "lose" | "sow" | "capture" | "error";

/** Short synthesised blips, so we ship no audio files. [frequency Hz, duration s] steps. */
const TONES: Record<Sfx, [number, number][]> = {
  tap: [[660, 0.04]],
  play: [[520, 0.05], [780, 0.06]],
  draw: [[330, 0.07]],
  special: [[523, 0.07], [659, 0.07], [784, 0.1]],
  win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.22]],
  lose: [[392, 0.14], [311, 0.14], [262, 0.28]],
  sow: [[880, 0.025]],
  capture: [[660, 0.06], [990, 0.09]],
  error: [[180, 0.12]],
};

const PATTERNS: Partial<Record<Sfx, number | number[]>> = {
  play: 12,
  special: [20, 40, 20],
  win: [40, 60, 40, 60, 120],
  lose: 200,
  capture: [15, 30, 15],
  error: [30, 30, 30],
};

let audio: AudioContext | null = null;

export function sfx(kind: Sfx) {
  const { sound, haptics } = settings.get();
  if (haptics && PATTERNS[kind] !== undefined && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(PATTERNS[kind]!);
  }
  if (!sound || typeof window === "undefined") return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    let t = audio.currentTime;
    for (const [freq, dur] of TONES[kind]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === "sow" ? "sine" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur * 0.9;
    }
  } catch {
    // No Web Audio: stay quiet.
  }
}

/** Speaks a pidgin line with the device's voice, preferring a Nigerian English voice when there is one. */
export function say(line: string) {
  const { sound, voice } = settings.get();
  if (!sound || !voice || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const text = line.replace(/\p{Extended_Pictographic}/gu, "").trim();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => v.lang === "en-NG") ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    u.rate = 1.08;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // Speech unavailable.
  }
}
