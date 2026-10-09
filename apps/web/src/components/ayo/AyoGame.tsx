"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ayo, createRng, type Difficulty, type Rng } from "@naija/engine";
import { GameHeader, Modal, PrimaryButton, Segmented, Toasts, useCallouts } from "@/components/ui";
import { OnlineSetup } from "@/components/online/OnlineSetup";
import { ayoCallouts } from "@/lib/ayo-session";
import { recordResult } from "@/lib/stats";
import { LINES } from "@/lib/voice";
import { AyoBoard, PlayerBar, useSowAnimation } from "./AyoBoard";

type Mode = "ai" | "pass" | "online";
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
          { value: "online", label: "🌍 Online" },
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
      {config.mode !== "online" && (
        <Segmented
          label="Who go first?"
          value={config.first}
          options={[
            { value: 0, label: config.mode === "ai" ? "Me" : "Player 1" },
            { value: 1, label: config.mode === "ai" ? "Computer" : "Player 2" },
          ]}
          onChange={(first) => onChange({ ...config, first })}
        />
      )}
      {config.mode === "online" ? (
        <OnlineSetup game="ayo" />
      ) : (
        <PrimaryButton onClick={onStart} className="mt-2">
          Start
        </PrimaryButton>
      )}
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

function AyoTable({ config, seed, onRestart }: { config: Config; seed: number; onRestart: () => void }) {
  const names: [string, string] = config.mode === "ai" ? ["You", "Computer"] : ["Player 1", "Player 2"];
  const [state, setState] = useState(() => ayo.initialState({ firstPlayer: config.first }));
  const rng = useRef<Rng>(createRng(seed));
  const { toasts, push } = useCallouts();
  const isAi = (p: Player) => config.mode === "ai" && p === 1;
  const me = config.mode === "ai" ? 0 : null;

  // Land the real state (with captures) once the seeds have been sown.
  const { anim, start } = useSowAnimation(({ prev, move, next }) => {
    setState(next);
    push(ayoCallouts(prev, move, next, names, me));
    if (next.over && me !== null) recordResult("ayo", next.winner === null ? "drawn" : next.winner === me ? "won" : "lost");
  });

  const play = useCallback(
    (move: ayo.AyoMove) => {
      const result = ayo.applyMove(state, move);
      if (!result.ok) {
        push([{ text: result.error, sfx: "error", speak: false, tone: "bad" }]);
        return;
      }
      start(state, move, result.state);
    },
    [state, push, start],
  );

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

  const legal = new Set(!anim && !isAi(state.current) ? ayo.legalMoves(state, state.current).map((m) => m.pit) : []);
  const turnLabel = (p: Player) =>
    state.over ? "" : state.current === p ? (isAi(p) ? (anim ? "" : "thinking…") : config.mode === "ai" ? LINES.yourTurn : "Your turn") : "";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-3 py-4">
      <Toasts toasts={toasts} />
      <PlayerBar name={names[1]} store={state.stores[1]} active={!state.over && state.current === 1} label={turnLabel(1)} ai={isAi(1)} />
      <AyoBoard
        state={state}
        anim={anim}
        names={names}
        canSow={legal}
        onSow={(pit) => play({ type: "sow", player: ayo.ownerOf(pit), pit })}
      />
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
