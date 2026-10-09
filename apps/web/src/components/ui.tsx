"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sfx } from "@/lib/feedback";
import { settings } from "@/lib/settings";
import type { Callout } from "@/lib/callouts";

/** Toast queue for pidgin callouts. `push` also plays the sound and vibration. */
export function useCallouts() {
  const [toasts, setToasts] = useState<(Callout & { id: number })[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const push = useCallback((callouts: Callout[]) => {
    if (callouts.length === 0) return;
    sfx(callouts[callouts.length - 1]!.sfx);
    const fresh = callouts.map((c) => ({ ...c, id: nextId.current++ }));
    setToasts((prev) => [...prev, ...fresh].slice(-3));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((prev) => prev.filter((t) => !fresh.some((f) => f.id === t.id)));
    }, 2400);
    timers.current.add(timer);
  }, []);

  return { toasts, push };
}

export function Toasts({ toasts }: { toasts: (Callout & { id: number })[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[34%] z-40 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in rounded-full px-4 py-2 text-center text-base font-bold shadow-lg ${
            t.tone === "bad"
              ? "bg-[var(--card-ink)] text-white"
              : t.tone === "good"
                ? "bg-palm text-white"
                : t.tone === "info"
                  ? "bg-indigo text-white"
                  : "bg-ochre text-black"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function ToggleButton({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-full text-lg transition ${on ? "bg-surface shadow-sm" : "opacity-40 grayscale"}`}
    >
      {children}
    </button>
  );
}

export function SettingsToggles() {
  const s = settings.use();
  return (
    <div className="flex items-center gap-1">
      <ToggleButton on={s.music} label="Music" onClick={() => settings.set({ music: !s.music })}>
        🎵
      </ToggleButton>
      <ToggleButton on={s.sound} label="Sound effects" onClick={() => settings.set({ sound: !s.sound })}>
        {s.sound ? "🔊" : "🔇"}
      </ToggleButton>
      <ToggleButton on={s.haptics} label="Vibration" onClick={() => settings.set({ haptics: !s.haptics })}>
        📳
      </ToggleButton>
    </div>
  );
}

/**
 * `actions` sit just before the settings toggles. Online games put the emote button there, and the header then
 * stays above modals, so players can still banter on the game-over screen.
 */
export function GameHeader({ title, onMenu, actions }: { title: string; onMenu?: () => void; actions?: ReactNode }) {
  return (
    <header className={`sticky top-0 bg-background/90 backdrop-blur ${actions ? "z-[60]" : "z-30"}`}>
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-3 py-2">
        <Link href="/" className="grid size-9 place-items-center rounded-full text-xl hover:bg-surface" aria-label="Back to lobby">
          ←
        </Link>
        <h1 className="flex-1 text-lg font-black">{title}</h1>
        {onMenu && (
          <button type="button" onClick={onMenu} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-surface">
            New game
          </button>
        )}
        {actions}
        <SettingsToggles />
      </div>
      <div className="kente" />
    </header>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-muted">{label}</legend>
      <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-inner">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => {
              sfx("tap");
              onChange(o.value);
            }}
            aria-pressed={o.value === value}
            className={`flex-1 rounded-xl px-2 py-2.5 text-sm font-bold transition ${
              o.value === value ? "bg-accent text-accent-ink shadow" : "hover:bg-background"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PrimaryButton({ children, onClick, className = "" }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl bg-accent px-6 py-3.5 text-lg font-black text-accent-ink shadow-lg transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

export function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="toast-in w-full max-w-sm rounded-3xl bg-background p-6 text-foreground shadow-2xl">{children}</div>
    </div>
  );
}
