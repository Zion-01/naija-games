"use client";

import { useEffect, useRef, useState } from "react";
import { EMOTES, EMOTE_COOLDOWN_MS, type EmoteMessage, type Snapshot } from "@naija/online";
import { sfx } from "@/lib/feedback";
import type { Connection } from "@/lib/online";
import { settings } from "@/lib/settings";

const SHOW_MS = 3200;

type Bubble = EmoteMessage & { key: number; name: string };

/**
 * Banter stickers, for the game header: a button for seated players that opens the sticker tray, and bubbles
 * under the header for every emote the table sends. Other players' emotes can be hidden from the tray; your own
 * always show.
 */
export function Emotes({ snap, conn }: { snap: Snapshot; conn: Connection }) {
  const { emotes: showOthers } = settings.use();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const nextKey = useRef(0);
  // Read inside the listener without resubscribing on every snapshot.
  const latest = useRef({ snap, showOthers });
  useEffect(() => {
    latest.current = { snap, showOthers };
  });

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = conn.onEmote((e) => {
      const { snap, showOthers } = latest.current;
      const mine = e.seat === snap.you;
      if (!mine && !showOthers) return;
      const bubble = { ...e, key: nextKey.current++, name: mine ? "You" : (snap.seats[e.seat]?.name ?? `Player ${e.seat + 1}`) };
      if (!mine) sfx("emote");
      setBubbles((prev) => [...prev, bubble].slice(-4));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setBubbles((prev) => prev.filter((b) => b.key !== bubble.key));
      }, SHOW_MS);
      timers.add(timer);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, [conn]);

  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), EMOTE_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooling]);

  // Tapping anywhere else closes the tray.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const seated = snap.you >= 0;

  return (
    <div ref={box} className="relative">
      <div className="pointer-events-none absolute right-0 top-[calc(100%+0.75rem)] z-40 flex max-w-[70vw] flex-col items-end gap-2" aria-live="polite">
        {bubbles.map((b) => {
          const emote = EMOTES.find((x) => x.id === b.id)!;
          return (
            <div key={b.key} className="emote-pop flex items-center gap-2 rounded-2xl rounded-tr-sm bg-surface px-3 py-2 shadow-lg ring-1 ring-black/5">
              <span className="text-3xl leading-none">{emote.emoji}</span>
              <span className="whitespace-nowrap text-sm leading-tight">
                <b className="block">{b.name}</b>
                {emote.text}
              </span>
            </div>
          );
        })}
      </div>

      {seated && (
        <>
          <button
            type="button"
            onClick={() => {
              sfx("tap");
              setOpen((o) => !o);
            }}
            aria-expanded={open}
            aria-label="Emotes"
            title="Emotes"
            className={`grid size-9 place-items-center rounded-full text-lg transition ${open ? "bg-ochre" : "bg-surface shadow-sm"} ${cooling ? "opacity-50" : ""}`}
          >
            😜
          </button>
          {open && (
            <div className="toast-in absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-3xl bg-background p-3 shadow-2xl ring-1 ring-black/10" role="dialog" aria-label="Emotes">
              <div className="grid grid-cols-4 gap-1">
                {EMOTES.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={cooling}
                    onClick={() => {
                      sfx("tap");
                      conn.send("emote", e.id);
                      setCooling(true);
                      setOpen(false);
                    }}
                    aria-label={e.text}
                    title={e.text}
                    className="grid aspect-square place-items-center rounded-2xl text-3xl transition hover:bg-surface active:scale-90 disabled:opacity-40"
                  >
                    {e.emoji}
                  </button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 px-1 text-sm text-muted">
                <input type="checkbox" checked={!showOthers} onChange={() => settings.set({ emotes: !showOthers })} />
                Hide other players&apos; emotes
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
