"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRng, whot, type Difficulty, type Rng } from "@naija/engine";
import { GameHeader, Modal, PrimaryButton, Segmented, Toasts, useCallouts } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { recordResult } from "@/lib/stats";
import { nextAiAction, whotCallouts, type WhotSeat } from "@/lib/whot-session";
import { LINES } from "@/lib/voice";
import { CardBack, ShapeGlyph, WhotCard } from "./WhotCard";

type Mode = "ai" | "pass";
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
      <PrimaryButton onClick={onStart} className="mt-2">
        Deal am
      </PrimaryButton>
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
  const [lastCardCalled, setLastCardCalled] = useState(false);
  const [choosingShape, setChoosingShape] = useState<whot.Card | null>(null);
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
  const legal = myTurn ? whot.legalMoves(state, me) : [];
  const playable = new Set(legal.flatMap((m) => (m.type === "play" ? [m.cardId] : [])));
  const canCatch = state.vulnerable !== null && state.vulnerable !== me && revealed && !state.over;
  const needsLastCard = myTurn && view.myHand.length === 2;

  function playCard(card: whot.Card) {
    if (!myTurn) return;
    if (!playable.has(card.id)) {
      sfx("error");
      push([{ text: state.pending ? `Defend with ${state.pending.number} or pick ${state.pending.amount}` : "That card no match", sfx: "error", speak: false, tone: "bad" }]);
      return;
    }
    if (card.number === whot.WHOT) {
      setChoosingShape(card);
      return;
    }
    if (apply({ type: "play", player: me, cardId: card.id, lastCard: lastCardCalled })) setLastCardCalled(false);
  }

  function callShape(shape: whot.CallableShape) {
    if (!choosingShape) return;
    if (apply({ type: "play", player: me, cardId: choosingShape.id, callShape: shape, lastCard: lastCardCalled })) {
      setLastCardCalled(false);
    }
    setChoosingShape(null);
  }

  const others = seats.map((_, i) => i).filter((i) => i !== me);
  const top = view.top;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-3 pb-4 pt-3">
      <Toasts toasts={toasts} />

      {/* Opponents */}
      <div className="flex justify-center gap-2">
        {others.map((p) => (
          <div
            key={p}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-surface/80 px-2 py-2 shadow-sm transition ${
              state.current === p && !state.over ? "pulse-ring ring-2 ring-ochre" : ""
            }`}
          >
            <div className="flex max-w-full items-center gap-1 truncate text-sm font-bold">
              {seats[p]!.kind === "ai" ? "🤖" : "🙂"} {seats[p]!.name}
            </div>
            <div className="flex h-[3.25rem] items-center">
              {Array.from({ length: Math.min(view.handCounts[p]!, 8) }, (_, i) => (
                <CardBack key={i} size="sm" className={i ? "-ml-6" : ""} />
              ))}
            </div>
            <div className="text-xs text-muted">
              {view.handCounts[p]} card{view.handCounts[p] === 1 ? "" : "s"}
              {thinking === p ? " · thinking…" : ""}
            </div>
            {canCatch && state.vulnerable === p && (
              <button
                type="button"
                onClick={() => apply({ type: "catch", player: me, target: p })}
                className="pulse-ring rounded-full bg-[var(--card-ink)] px-3 py-1 text-xs font-black text-white"
              >
                Catch am! ✋
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <section className="relative flex flex-1 flex-col items-center justify-center gap-3 rounded-[2rem] bg-felt p-4 text-white shadow-inner ring-8 ring-wood-dark/80 min-h-60">
        <div className="flex items-end gap-6">
          <button
            type="button"
            onClick={() => myTurn && apply({ type: "draw", player: me })}
            disabled={!myTurn}
            className="flex flex-col items-center gap-1 disabled:cursor-default"
            aria-label={`Market, ${view.marketCount} cards. ${myTurn ? "Tap to pick" : ""}`}
          >
            <CardBack
              size="lg"
              className={`shadow-[4px_4px_0_-1px_var(--card-face),6px_6px_0_-1px_var(--card-back)] ${myTurn ? "ring-4 ring-ochre" : ""}`}
            />
            <span className="text-xs font-semibold opacity-80">Market · {view.marketCount}</span>
          </button>
          <div className="flex flex-col items-center gap-1">
            <WhotCard key={top.id + view.pile.length} card={top} size="lg" className="card-in" />
            <span className="text-xs font-semibold opacity-80">
              {view.calledShape ? (
                <span className="inline-flex items-center gap-1">
                  Called <ShapeGlyph shape={view.calledShape} className="inline size-4 text-ochre" /> {view.calledShape}
                </span>
              ) : (
                "Top card"
              )}
            </span>
          </div>
        </div>
        <p className="text-center text-sm font-semibold" aria-live="polite">
          {state.over
            ? "Game don finish"
            : state.pending
              ? state.current === me && myTurn
                ? `Pick ${state.pending.amount}! Defend with a ${state.pending.number} or go market.`
                : `${seats[state.current]!.name} must pick ${state.pending.amount} or defend.`
              : myTurn
                ? LINES.yourTurn
                : `${seats[state.current]!.name} dey play…`}
        </p>
      </section>

      {/* Hand */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">
            {config.mode === "pass" ? `${seats[me]!.name}'s cards` : "Your cards"} · {view.myHand.length}
          </span>
          <div className="flex gap-2">
            {needsLastCard && (
              <button
                type="button"
                onClick={() => {
                  sfx("tap");
                  setLastCardCalled((v) => !v);
                }}
                aria-pressed={lastCardCalled}
                className={`rounded-full px-3 py-1.5 text-sm font-black transition ${
                  lastCardCalled ? "bg-palm text-white" : "pulse-ring bg-ochre text-black"
                }`}
              >
                {lastCardCalled ? "Last card ✓" : "Last card!"}
              </button>
            )}
            <button
              type="button"
              disabled={!myTurn}
              onClick={() => apply({ type: "draw", player: me })}
              className="rounded-full bg-indigo px-3 py-1.5 text-sm font-black text-white transition disabled:opacity-35"
            >
              {state.pending && myTurn ? `Pick ${state.pending.amount}` : "Go market"}
            </button>
          </div>
        </div>
        <div className="-mx-3 overflow-x-auto px-3 pb-2 pt-3">
          <div className="flex w-max min-w-full justify-center">
            {!revealed ? (
              <p className="py-8 text-muted">Cards hidden</p>
            ) : (
              view.myHand.map((card, i) => {
                const ok = playable.has(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => playCard(card)}
                    className={`transition ${i ? "-ml-3" : ""} ${myTurn && ok ? "-translate-y-2 hover:-translate-y-4" : ""}`}
                    aria-label={`Play ${card.shape === "whot" ? "Whot 20" : `${card.shape} ${card.number}`}`}
                  >
                    <WhotCard card={card} dim={myTurn && !ok} />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {choosingShape && (
        <Modal>
          <h2 className="text-2xl font-black">Wetin you need?</h2>
          <p className="mt-1 text-muted">Call the shape for your Whot.</p>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {whot.CALLABLE_SHAPES.map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => callShape(shape)}
                className="flex flex-col items-center gap-1 rounded-2xl bg-[var(--card-face)] p-2 text-[var(--card-ink)] shadow active:scale-95"
                aria-label={shape}
              >
                <ShapeGlyph shape={shape} className="size-10" />
                <span className="text-[0.65rem] font-bold capitalize">{shape}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setChoosingShape(null)} className="mt-4 w-full rounded-2xl py-2 font-semibold text-muted">
            Cancel
          </button>
        </Modal>
      )}

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

      {state.over && <WhotResult state={state} seats={seats} onRestart={onRestart} />}
    </main>
  );
}

function WhotResult({ state, seats, onRestart }: { state: whot.WhotState; seats: WhotSeat[]; onRestart: () => void }) {
  const humans = seats.filter((s) => s.kind === "human").length;
  const humanWon = state.winners.some((w) => seats[w]?.kind === "human");
  const winners = state.winners.map((w) => seats[w]!.name).join(" & ");
  const title =
    humans === 1 ? (humanWon ? (state.endReason === "checkup" ? "Check up! 🎉" : "You win! 🎉") : "E don cast 😩") : `${winners} win! 🎉`;
  return (
    <Modal>
      <h2 className="text-3xl font-black">{title}</h2>
      <p className="mt-1 text-muted">
        {state.endReason === "checkup" ? `${winners} finish all cards.` : "Market finish, so we count. Lowest wins, stars count double."}
      </p>
      <ul className="mt-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
        {state.hands.map((hand, p) => (
          <li key={p} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm font-bold">
              <span>
                {state.winners.includes(p) ? "🏆 " : ""}
                {seats[p]!.name}
              </span>
              <span className="text-muted">{whot.handTotal(hand)} pts</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {hand.length === 0 ? <span className="text-sm text-muted">No cards left</span> : hand.map((c) => <WhotCard key={c.id} card={c} size="sm" />)}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-2">
        <Link href="/" className="flex-1 rounded-2xl bg-surface py-3.5 text-center font-bold">
          Lobby
        </Link>
        <PrimaryButton onClick={onRestart} className="flex-[2]">
          Play again
        </PrimaryButton>
      </div>
    </Modal>
  );
}
