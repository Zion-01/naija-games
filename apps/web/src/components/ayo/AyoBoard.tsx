"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ayo } from "@naija/engine";
import { sowFrames } from "@/lib/ayo-session";
import { sfx } from "@/lib/feedback";

type Frames = ReturnType<typeof sowFrames>;
export type SowAnim = { frames: Frames; step: number; from: number; prev: ayo.AyoState; next: ayo.AyoState; move: ayo.AyoMove };

/**
 * Plays a sow one seed at a time, then calls `onLand` with the real next state (captures included).
 * Starting a new sow while one is running lands the old one straight away.
 */
export function useSowAnimation(onLand: (anim: SowAnim) => void) {
  const [anim, setAnimState] = useState<SowAnim | null>(null);
  const animRef = useRef<SowAnim | null>(null);
  const landRef = useRef(onLand);
  useEffect(() => {
    landRef.current = onLand;
  });

  const setAnim = useCallback((next: SowAnim | null) => {
    animRef.current = next;
    setAnimState(next);
  }, []);

  const start = useCallback(
    (prev: ayo.AyoState, move: ayo.AyoMove, next: ayo.AyoState) => {
      sfx("tap");
      const running = animRef.current;
      if (running) landRef.current(running);
      setAnim({ frames: sowFrames(prev.pits, move.pit), step: 0, from: move.pit, prev, next, move });
    },
    [setAnim],
  );

  useEffect(() => {
    if (!anim) return;
    const last = anim.step >= anim.frames.length - 1;
    const delay = anim.step === 0 ? 220 : Math.max(70, 190 - anim.frames.length * 5);
    const timer = setTimeout(() => {
      if (!last) {
        sfx("sow");
        setAnim({ ...anim, step: anim.step + 1 });
        return;
      }
      setAnim(null);
      landRef.current(anim);
    }, delay);
    return () => clearTimeout(timer);
  }, [anim, setAnim]);

  return { anim, start };
}

/**
 * The wooden board. `bottom` is the player whose pits sit nearest the viewer (online, that's you).
 * Sowing always runs counter-clockwise as seen from the bottom.
 */
export function AyoBoard({
  state,
  anim,
  names,
  bottom = 0,
  canSow,
  onSow,
}: {
  state: ayo.AyoState;
  anim: SowAnim | null;
  names: readonly [string, string];
  bottom?: 0 | 1;
  /** Pits the viewer may tap right now. */
  canSow: Set<number>;
  onSow: (pit: number) => void;
}) {
  const pits = anim ? anim.frames[anim.step]!.pits : state.pits;
  const landed = anim ? anim.frames[anim.step]!.landed : null;
  const captured = new Set(!anim ? (state.lastMove?.captured ?? []) : []);
  const top = (1 - bottom) as 0 | 1;
  const bottomRow = ayo.sideOf(bottom);
  const topRow = ayo.sideOf(top).slice().reverse();

  function pitButton(pit: number) {
    const canTap = !anim && canSow.has(pit);
    return (
      <button
        key={pit}
        type="button"
        disabled={!canTap}
        onClick={() => onSow(pit)}
        aria-label={`Pit with ${pits[pit]} seeds${canTap ? ", tap to sow" : ""}`}
        className={`relative aspect-square w-full rounded-full bg-pit shadow-[inset_0_6px_12px_rgb(0_0_0/0.55)] transition ${
          canTap ? "ring-4 ring-inset ring-ochre/90 hover:scale-105 active:scale-95" : ""
        } ${landed === pit ? "scale-105 ring-2 ring-white/70" : ""} ${anim?.from === pit ? "ring-2 ring-ochre" : ""} ${
          captured.has(pit) ? "ring-4 ring-inset ring-[var(--accent)]" : ""
        }`}
      >
        <Seeds count={pits[pit]!} />
        <span className="absolute -bottom-0.5 right-0 grid min-w-6 place-items-center rounded-full bg-black/60 px-1 text-xs font-bold text-white">
          {pits[pit]}
        </span>
      </button>
    );
  }

  return (
    <section
      className="rounded-[2.5rem] p-3 shadow-2xl ring-1 ring-black/30 sm:p-4"
      style={{
        background:
          "repeating-linear-gradient(95deg, rgb(255 255 255 / 0.04) 0 3px, transparent 3px 11px), linear-gradient(180deg, var(--wood), var(--wood-dark))",
      }}
      aria-label="Ayo board"
    >
      <div className="grid grid-cols-6 gap-2 sm:gap-3">{topRow.map(pitButton)}</div>
      <div className="my-2 flex items-center gap-2 px-2 text-[0.65rem] font-semibold uppercase tracking-widest text-white/50 sm:my-3">
        <span>← {names[top]}</span>
        <span className="h-px flex-1 bg-white/20" />
        <span>{names[bottom]} →</span>
      </div>
      <div className="grid grid-cols-6 gap-2 sm:gap-3">{bottomRow.map(pitButton)}</div>
    </section>
  );
}

export function PlayerBar({
  name,
  store,
  active,
  label,
  ai,
  offline = false,
}: {
  name: string;
  store: number;
  active: boolean;
  label: string;
  ai: boolean;
  offline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-surface/90 px-4 py-2.5 shadow-sm transition ${active ? "pulse-ring ring-2 ring-ochre" : ""}`}>
      <span className="text-xl">{ai ? "🤖" : "🙂"}</span>
      <div className="flex-1">
        <div className="font-bold">
          {name}
          {offline && <span title="Offline"> 📵</span>}
        </div>
        <div className="h-4 text-xs text-muted">{label}</div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-black tabular-nums">{store}</div>
        <div className="text-[0.65rem] uppercase tracking-wider text-muted">seeds</div>
      </div>
    </div>
  );
}

/** Seeds scattered in a sunflower spiral so a pit looks fuller as it fills. */
function Seeds({ count }: { count: number }) {
  const shown = Math.min(count, 24);
  return (
    <svg viewBox="-50 -50 100 100" className="absolute inset-[8%]" aria-hidden>
      {Array.from({ length: shown }, (_, i) => {
        const r = 12.5 * Math.sqrt(i + 0.5);
        const a = i * 2.39996;
        const x = Math.max(-34, Math.min(34, r * Math.cos(a)));
        const y = Math.max(-34, Math.min(34, r * Math.sin(a)));
        return <ellipse key={i} cx={x} cy={y} rx="11" ry="8.5" transform={`rotate(${(i * 47) % 180} ${x} ${y})`} fill="var(--seed)" stroke="rgb(0 0 0 / 0.35)" strokeWidth="1.2" />;
      })}
    </svg>
  );
}
