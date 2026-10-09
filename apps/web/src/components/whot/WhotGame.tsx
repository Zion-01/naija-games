"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRng, whot, type Difficulty, type Rng } from "@naija/engine";
import { GameHeader, Modal, PrimaryButton, Segmented, Toasts, useCallouts } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { recordResult } from "@/lib/stats";
import { nextAiAction, whotCallouts, type WhotSeat } from "@/lib/whot-session";
import { OnlineSetup } from "@/components/online/OnlineSetup";
import { WhotBoard, WhotResult } from "./WhotBoard";

type Mode = "ai" | "pass" | "online";
type Config = { mode: Mode; players: number; difficulty: Difficulty; handSize: number };

const AI_NAMES = ["Mama Put", "Oga Tunde", "Aunty Bisi"];
const AI_DELAY = 850;

function seatsFor(c: Config): WhotSeat[] {
  return Array.from({ length: c.players }, (_, i) =>
    c.mode === "ai"
      ? i === 0
        ? { name: "You", kind: "human" }
        : { name: AI_NAMES[i - 1]!, kind: "ai" }
      : { name: `Player ${i + 1}`, kind: "human" },
  );
}

export function WhotGame() {
  const [config, setConfig] = useState<Config>({ mode: "ai", players: 2, difficulty: "medium", handSize: 5 });
  const [game, setGame] = useState<{ config: Config; seed: number } | null>(null);

  return (
    <div className="ankara flex min-h-dvh flex-col">
      <GameHeader title="Whot" onMenu={game ? () => setGame(null) : undefined} />
      {game ? (
        <WhotTable key={game.seed} config={game.config} seed={game.seed} onRestart={() => setGame({ ...game, seed: Date.now() })} />
      ) : (
        <WhotSetup config={config} onChange={setConfig} onStart={() => setGame({ config, seed: Date.now() })} />
      )}
    </div>
  );
}

function WhotSetup({ config, onChange, onStart }: { config: Config; onChange: (c: Config) => void; onStart: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <div>
        <h2 className="text-3xl font-black">Oya, shuffle!</h2>
        <p className="mt-1 text-muted">Naija street rules. Hold on, pick two, suspension, general market, and no forget to call last card.</p>
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
      <Segmented
        label="Players"
        value={config.players}
        options={[2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
        onChange={(players) => onChange({ ...config, players })}
      />
      {config.mode === "ai" && (
        <Segmented
          label="How strong?"
          value={config.difficulty}
          options={[
            { value: "easy", label: "Learner" },
            { value: "medium", label: "Street" },
            { value: "hard", label: "Oga" },
          ]}
          onChange={(difficulty) => onChange({ ...config, difficulty })}
        />
      )}
      <Segmented
        label="Cards each"
        value={config.handSize}
        options={[5, 6].map((n) => ({ value: n, label: String(n) }))}
        onChange={(handSize) => onChange({ ...config, handSize })}
      />
      {config.mode === "online" ? (
        <OnlineSetup game="whot" whot={{ players: config.players, handSize: config.handSize }} />
      ) : (
        <PrimaryButton onClick={onStart} className="mt-2">
          Deal am
        </PrimaryButton>
      )}
      <details className="rounded-2xl bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-bold">How to play</summary>
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-muted">
          <li>Match the top card by shape or number. Whot 20 goes on anything; then you call the shape.</li>
          <li><b>1 Hold on</b>: play again. <b>8 Suspension</b>: next person skips.</li>
          <li><b>2 Pick two</b>, <b>5 Pick three</b>: defend with the same number to pass it on (e dey stack), or pick.</li>
          <li><b>14 General market</b>: everybody else picks one, and you play again.</li>
          <li>Tap <b>Last card!</b> before you play down to one card, or anybody fit catch you for two.</li>
          <li>Finish your cards to check up. If market finish, lowest count wins (stars count double).</li>
        </ul>
      </details>
    </main>
  );
}

function WhotTable({ config, seed, onRestart }: { config: Config; seed: number; onRestart: () => void }) {
  const [seats] = useState(() => seatsFor(config));
  const [state, setState] = useState(() =>
    whot.initialState({ players: config.players, handSize: config.handSize, firstPlayer: 0 }, seed),
  );
  // Pass-and-play: false while the phone is being passed, so nobody sees the next hand early.
  const [revealed, setRevealed] = useState(config.mode === "ai");
  const { toasts, push } = useCallouts();

  const rng = useRef<Rng>(createRng(seed ^ 0x5eed));
  const asked = useRef(new Set<string>());
  // The latest state for timers and handlers; only `apply` changes the game.
  const stateRef = useRef(state);

  const apply = useCallback(
    (move: whot.WhotMove) => {
      const prev = stateRef.current;
      const result = whot.applyMove(prev, move);
      if (!result.ok) {
        push([{ text: result.error, sfx: "error", speak: false, tone: "bad" }]);
        return false;
      }
      stateRef.current = result.state;
      setState(result.state);
      if (config.mode === "pass" && result.state.current !== prev.current) setRevealed(false);
      const callouts = whotCallouts(prev, move, result.state, seats);
      if (callouts.length) push(callouts);
      else sfx(move.type === "draw" ? "draw" : "play");
      if (result.state.over && config.mode === "ai") {
        recordResult("whot", result.state.winners.includes(0) ? (result.state.winners.length > 1 ? "drawn" : "won") : "lost");
      }
      return true;
    },
    [config.mode, push, seats],
  );

  // Computer seats: catch a forgotten "Last card", then take their turn.
  useEffect(() => {
    if (state.over) return;
    const action = nextAiAction(state, seats, asked.current, (view) =>
      whot.chooseWhotMove(view, config.difficulty, rng.current),
    );
    if (!action) return;
    const timer = setTimeout(() => {
      const move =
        action.move ?? whot.chooseWhotMove(whot.viewFor(stateRef.current, action.seat), config.difficulty, rng.current);
      if (move) apply(move);
    }, action.kind === "catch" ? 500 + rng.current() * 700 : AI_DELAY);
    return () => clearTimeout(timer);
  }, [state, seats, config.difficulty, apply]);

  const me = config.mode === "ai" ? 0 : state.current;
  const thinking = !state.over && seats[state.current]?.kind === "ai" ? state.current : null;
  const view = whot.viewFor(state, me);
  const myTurn = !state.over && state.current === me && seats[me]?.kind === "human" && revealed;
  const canCatch = state.vulnerable !== null && state.vulnerable !== me && revealed && !state.over;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-3 pb-4 pt-3">
      <Toasts toasts={toasts} />
      <WhotBoard
        view={view}
        seats={seats}
        myTurn={myTurn}
        revealed={revealed}
        canCatch={canCatch}
        thinking={thinking}
        handLabel={config.mode === "pass" ? `${seats[me]!.name}'s cards` : "Your cards"}
        onPlay={(cardId, lastCard, callShape) => apply({ type: "play", player: me, cardId, lastCard, callShape })}
        onDraw={() => apply({ type: "draw", player: me })}
        onCatch={(target) => apply({ type: "catch", player: me, target })}
        onInvalid={(text) => push([{ text, sfx: "error", speak: false, tone: "bad" }])}
      />

      {!revealed && !state.over && (
        <Modal>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">Pass the phone</p>
          <h2 className="mt-1 text-3xl font-black">{seats[state.current]!.name}, na your turn</h2>
          <p className="mt-2 text-muted">Everybody else, look away 👀</p>
          <PrimaryButton
            className="mt-5 w-full"
            onClick={() => {
              sfx("tap");
              setRevealed(true);
            }}
          >
            Show my cards
          </PrimaryButton>
        </Modal>
      )}

      {state.over && (
        <WhotResult view={whot.viewFor(state, me)} seats={seats} me={config.mode === "ai" ? 0 : null}>
          <Link href="/" className="flex-1 rounded-2xl bg-surface py-3.5 text-center font-bold">
            Lobby
          </Link>
          <PrimaryButton onClick={onRestart} className="flex-[2]">
            Play again
          </PrimaryButton>
        </WhotResult>
      )}
    </main>
  );
}
