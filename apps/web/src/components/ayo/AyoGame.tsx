"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ayo, createRng, type Difficulty, type Rng } from "@naija/engine";
import { GameHeader, Modal, PrimaryButton, Segmented, Toasts, useCallouts } from "@/components/ui";
import { sowFrames } from "@/lib/ayo-session";
import { sfx } from "@/lib/feedback";
import { recordResult } from "@/lib/stats";
import { LINES, type Callout } from "@/lib/voice";

type Mode = "ai" | "pass";
type Config = { mode: Mode; difficulty: Difficulty; first: 0 | 1 };
type Player = 0 | 1;

const AI_DELAY = 700;

export function AyoGame() {
  const [config, setConfig] = useState<Config>({ mode: "ai", difficulty: "medium", first: 0 });
  const [game, setGame] = useState<{ config: Config; id: number } | null>(null);

  return (
    <div className="ankara flex min-h-dvh flex-col">
      <GameHeader title="Ayo" onMenu={game ? () => setGame(null) : undefined} />
      {game ? (
        <AyoTable key={game.id} config={game.config} seed={game.id} onRestart={() => setGame({ ...game, id: Date.now() })} />
      ) : (
        <AyoSetup config={config} onChange={setConfig} onStart={() => setGame({ config, id: Date.now() })} />
      )}
    </div>
  );
}

function AyoSetup({ config, onChange, onStart }: { config: Config; onChange: (c: Config) => void; onStart: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <div>
        <h2 className="text-3xl font-black">Ayo Olopon</h2>
        <p className="mt-1 text-muted">Six pits each, four seeds per pit. Chop on two or three, and the first to pass 24 seeds wins.</p>
      </div>
      <Segmented
        label="Who you dey play?"
        value={config.mode}
        options={[
          { value: "ai", label: "🤖 Computer" },
          { value: "pass", label: "📱 Pass & play" },
        ]}
        onChange={(mode) => onChange({ ...config, mode })}
      />
      {config.mode === "ai" && (
        <Segmented
          label="How strong?"
          value={config.difficulty}
          options={[
            { value: "easy", label: "Learner" },
            { value: "medium", label: "Street" },
            { value: "hard", label: "Baba" },
          ]}
          onChange={(difficulty) => onChange({ ...config, difficulty })}
        />
      )}
      <Segmented
        label="Who go first?"
        value={config.first}
        options={[
          { value: 0, label: config.mode === "ai" ? "Me" : "Player 1" },
          { value: 1, label: config.mode === "ai" ? "Computer" : "Player 2" },
        ]}
        onChange={(first) => onChange({ ...config, first })}
      />
      <PrimaryButton onClick={onStart} className="mt-2">
        Start
      </PrimaryButton>
      <details className="rounded-2xl bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-bold">How to play</summary>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-muted">
          <li>Tap one of your pits. The seeds go one by one, counter-clockwise, skipping the pit you started from.</li>
          <li>If your last seed makes a pit on the other side 2 or 3, you chop it, and keep chopping backwards while pits are 2 or 3.</li>
          <li>A move that would chop all your opponent seeds chops nothing.</li>
          <li>If your opponent has no seeds, you must give them some. If you can&apos;t, you take the rest.</li>
          <li>More than 24 seeds wins.</li>
        </ul>
      </details>
    </main>
  );
}

type Anim = { frames: { pits: number[]; landed: number | null }[]; step: number; from: number; next: ayo.AyoState; move: ayo.AyoMove };

function AyoTable({ config, seed, onRestart }: { config: Config; seed: number; onRestart: () => void }) {
  const names: [string, string] = config.mode === "ai" ? ["You", "Computer"] : ["Player 1", "Player 2"];
  const [state, setState] = useState(() => ayo.initialState({ firstPlayer: config.first }));
  const [anim, setAnim] = useState<Anim | null>(null);
  const rng = useRef<Rng>(createRng(seed));
  const { toasts, push } = useCallouts();
  const isAi = (p: Player) => config.mode === "ai" && p === 1;

  const play = useCallback(
    (move: ayo.AyoMove) => {
      const result = ayo.applyMove(state, move);
      if (!result.ok) {
        push([{ text: result.error, sfx: "error", speak: false, tone: "bad" }]);
        return;
      }
      sfx("tap");
      setAnim({ frames: sowFrames(state.pits, move.pit), step: 0, from: move.pit, next: result.state, move });
    },
    [state, push],
  );

  // Step the sowing animation one seed at a time, then land the real state (with captures).
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
      const next = anim.next;
      setState(next);
      setAnim(null);
      const callouts: Callout[] = [];
      const captured = next.stores[anim.move.player] - state.stores[anim.move.player];
      if (captured > 0) {
        callouts.push({
          text: LINES.captured(names[anim.move.player], captured),
          sfx: "capture",
          speak: !isAi(anim.move.player) || captured >= 4,
          tone: isAi(anim.move.player) ? "bad" : "good",
        });
      }
      if (next.over) {
        const human = config.mode === "ai" ? 0 : null;
        if (next.winner === null) callouts.push({ text: LINES.draw, sfx: "special", speak: true, tone: "info" });
        else if (human === null) callouts.push({ text: `${names[next.winner]} win! 🎉`, sfx: "win", speak: true, tone: "good" });
        else if (next.winner === human) callouts.push({ text: LINES.youWin, sfx: "win", speak: true, tone: "good" });
        else callouts.push({ text: LINES.youLose, sfx: "lose", speak: true, tone: "bad" });
        if (human !== null) recordResult("ayo", next.winner === null ? "drawn" : next.winner === human ? "won" : "lost");
      }
      push(callouts);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names/isAi derive from config, which never changes for a table
  }, [anim, state, push, config.mode]);

  // Computer's turn.
  useEffect(() => {
    if (anim || state.over || !isAi(state.current)) return;
    const timer = setTimeout(() => {
      const move = ayo.chooseAyoMove(state, state.current, config.difficulty, rng.current);
      if (move) play(move);
    }, AI_DELAY);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isAi derives from config
  }, [anim, state, play, config.difficulty]);

  const pits = anim ? anim.frames[anim.step]!.pits : state.pits;
  const landed = anim ? anim.frames[anim.step]!.landed : null;
  const legal = new Set(!anim && !isAi(state.current) ? ayo.legalMoves(state, state.current).map((m) => m.pit) : []);
  const captured = new Set(!anim ? (state.lastMove?.captured ?? []) : []);
  const busy = anim !== null || state.over;

  function pitButton(pit: number) {
    const owner = ayo.ownerOf(pit);
    const canTap = !busy && owner === state.current && legal.has(pit);
    return (
      <button
        key={pit}
        type="button"
        disabled={!canTap}
        onClick={() => play({ type: "sow", player: owner, pit })}
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

  const topRow = [11, 10, 9, 8, 7, 6];
  const bottomRow = [0, 1, 2, 3, 4, 5];
  const turnLabel = (p: Player) =>
    state.over ? "" : state.current === p ? (isAi(p) ? (anim ? "" : "thinking…") : config.mode === "ai" ? LINES.yourTurn : "Your turn") : "";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-3 py-4">
      <Toasts toasts={toasts} />
      <PlayerBar name={names[1]} store={state.stores[1]} active={!state.over && state.current === 1} label={turnLabel(1)} ai={isAi(1)} />

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
          <span>← {names[1]}</span>
          <span className="h-px flex-1 bg-white/20" />
          <span>{names[0]} →</span>
        </div>
        <div className="grid grid-cols-6 gap-2 sm:gap-3">{bottomRow.map(pitButton)}</div>
      </section>

      <PlayerBar name={names[0]} store={state.stores[0]} active={!state.over && state.current === 0} label={turnLabel(0)} ai={false} />
      {state.sinceCapture >= 60 && !state.over && (
        <p className="text-center text-xs text-muted">
          {ayo.STALL_LIMIT - state.sinceCapture} moves without a chop until each side keeps their own seeds.
        </p>
      )}

      {state.over && (
        <Modal>
          <h2 className="text-3xl font-black">
            {state.winner === null
              ? "Na draw 🤝"
              : config.mode === "ai"
                ? state.winner === 0
                  ? "You win! 🎉"
                  : "E don cast 😩"
                : `${names[state.winner]} win! 🎉`}
          </h2>
          <p className="mt-2 text-lg">
            {names[0]} <b>{state.stores[0]}</b> · {names[1]} <b>{state.stores[1]}</b>
          </p>
          <div className="mt-5 flex gap-2">
            <Link href="/" className="flex-1 rounded-2xl bg-surface py-3.5 text-center font-bold">
              Lobby
            </Link>
            <PrimaryButton onClick={onRestart} className="flex-[2]">
              Play again
            </PrimaryButton>
          </div>
        </Modal>
      )}
    </main>
  );
}

function PlayerBar({ name, store, active, label, ai }: { name: string; store: number; active: boolean; label: string; ai: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-surface/90 px-4 py-2.5 shadow-sm transition ${active ? "pulse-ring ring-2 ring-ochre" : ""}`}>
      <span className="text-xl">{ai ? "🤖" : "🙂"}</span>
      <div className="flex-1">
        <div className="font-bold">{name}</div>
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
