"use client";

import { useState, type ReactNode } from "react";
import { whot } from "@naija/engine";
import { Modal } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { LINES } from "@/lib/voice";
import type { WhotSeat } from "@/lib/whot-session";
import { CardBack, ShapeGlyph, WhotCard, cardLabel } from "./WhotCard";

export type BoardSeat = WhotSeat & { connected?: boolean };

/**
 * The Whot table drawn from one seat's redacted view. It doesn't know whether the game runs in this
 * browser or on the server: it just reports what the player tapped.
 */
export function WhotBoard({
  view,
  seats,
  myTurn,
  revealed = true,
  canCatch,
  thinking,
  handLabel,
  secondsLeft = null,
  onPlay,
  onDraw,
  onCatch,
  onInvalid,
}: {
  view: whot.WhotView;
  seats: BoardSeat[];
  /** The viewer may act on the current turn right now. */
  myTurn: boolean;
  revealed?: boolean;
  canCatch: boolean;
  thinking: number | null;
  handLabel: string;
  /** Seconds before the server plays for whoever is on turn. */
  secondsLeft?: number | null;
  /** `stack` holds the extra cards of the same number played on top of `cardId`, in order. */
  onPlay: (cardId: string, stack: string[], lastCard: boolean, callShape?: whot.CallableShape) => boolean;
  onDraw: () => void;
  onCatch: (target: number) => void;
  onInvalid: (text: string) => void;
}) {
  // KI-9: online, this is cleared before the server confirms the move. KI-10: survives a seat change in pass-and-play.
  const [lastCardCalled, setLastCardCalled] = useState(false);
  const [choosingShape, setChoosingShape] = useState<whot.Card[] | null>(null);
  // Cards picked for a stack, lead first. Tied to the turn, so it lapses by itself when the turn moves on.
  const [picked, setPicked] = useState<{ turn: number; ids: string[] }>({ turn: -1, ids: [] });

  const me = view.me;
  const playable = new Set(myTurn ? view.myHand.filter((c) => whot.canPlay(view, c)).map((c) => c.id) : []);
  const selected =
    myTurn && picked.turn === view.turn
      ? picked.ids.flatMap((id) => view.myHand.filter((c) => c.id === id))
      : [];
  const lead = selected[0] ?? null;
  const needsLastCard = myTurn && view.myHand.length - Math.max(selected.length, 1) === 1;
  const name = (p: number) => seats[p]?.name ?? `Player ${p + 1}`;
  const plural = (card: whot.Card) => (card.number === whot.WHOT ? "Whots" : `${card.number}s`);
  const select = (ids: string[]) => setPicked({ turn: view.turn, ids });

  function tapCard(card: whot.Card) {
    if (!myTurn) return;
    if (lead) {
      // Tapping the lead again drops the whole stack; tapping another picked card just drops that one.
      if (selected.includes(card)) return select(card === lead ? [] : selected.filter((c) => c !== card).map((c) => c.id));
      if (card.number !== lead.number) return onInvalid(`Na only ${plural(lead)} you fit stack on top`);
      sfx("tap");
      return select([...selected, card].map((c) => c.id));
    }
    if (!playable.has(card.id)) {
      onInvalid(view.pending ? `Defend with ${view.pending.number} or pick ${view.pending.amount}` : "That card no match");
      return;
    }
    if (view.myHand.some((c) => c !== card && c.number === card.number)) {
      sfx("tap");
      return select([card.id]);
    }
    playCards([card]);
  }

  function playCards(cards: whot.Card[]) {
    if (cards[0]!.number === whot.WHOT) {
      setChoosingShape(cards);
      return;
    }
    send(cards);
  }

  function send(cards: whot.Card[], shape?: whot.CallableShape) {
    const [first, ...rest] = cards;
    if (onPlay(first!.id, rest.map((c) => c.id), lastCardCalled, shape)) {
      setLastCardCalled(false);
      select([]);
    }
  }

  function callShape(shape: whot.CallableShape) {
    if (!choosingShape) return;
    send(choosingShape, shape);
    setChoosingShape(null);
  }

  const others = seats.map((_, i) => i).filter((i) => i !== me);
  const top = view.top;
  const clock = secondsLeft !== null && !view.over ? ` · ${secondsLeft}s` : "";

  return (
    <>
      {/* Opponents */}
      <div className="flex justify-center gap-2">
        {others.map((p) => (
          <div
            key={p}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl bg-surface/80 px-2 py-2 shadow-sm transition ${
              view.current === p && !view.over ? "pulse-ring ring-2 ring-ochre" : ""
            }`}
          >
            <div className="flex max-w-full items-center gap-1 truncate text-sm font-bold">
              {seats[p]!.kind === "ai" ? "🤖" : "🙂"} {name(p)}
              {seats[p]!.connected === false && <span title="Offline">📵</span>}
            </div>
            <div className="flex h-[3.25rem] items-center">
              {Array.from({ length: Math.min(view.handCounts[p]!, 8) }, (_, i) => (
                <CardBack key={i} size="sm" className={i ? "-ml-6" : ""} />
              ))}
            </div>
            <div className="text-xs text-muted">
              {view.handCounts[p]} card{view.handCounts[p] === 1 ? "" : "s"}
              {thinking === p ? " · thinking…" : view.current === p ? clock : ""}
            </div>
            {canCatch && view.vulnerable === p && (
              <button
                type="button"
                onClick={() => onCatch(p)}
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
            onClick={() => myTurn && onDraw()}
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
          {view.over
            ? "Game don finish"
            : view.pending
              ? myTurn
                ? `Pick ${view.pending.amount}! Defend with a ${view.pending.number} or go market.`
                : `${name(view.current)} must pick ${view.pending.amount} or defend.`
              : myTurn
                ? LINES.yourTurn
                : `${name(view.current)} dey play…`}
        </p>
        {myTurn && secondsLeft !== null && (
          <span className={`absolute right-4 top-3 rounded-full px-2 py-0.5 text-xs font-black tabular-nums ${secondsLeft <= 5 ? "bg-[var(--card-ink)]" : "bg-black/30"}`}>
            ⏱ {secondsLeft}s
          </span>
        )}
      </section>

      {/* Hand */}
      {me < 0 ? (
        <p className="py-6 text-center text-muted">You dey watch. 👀</p>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">
              {handLabel} · {view.myHand.length}
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
                onClick={onDraw}
                className="rounded-full bg-indigo px-3 py-1.5 text-sm font-black text-white transition disabled:opacity-35"
              >
                {view.pending && myTurn ? `Pick ${view.pending.amount}` : "Go market"}
              </button>
            </div>
          </div>
          {lead && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface/80 px-3 py-2 shadow-sm">
              <span className="text-sm font-semibold">
                {selected.length === 1 ? `Tap your other ${plural(lead)} to stack am` : `${selected.length} cards · the last one go top`}
              </span>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => select([])} className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => playCards(selected)}
                  className="rounded-full bg-palm px-3 py-1.5 text-sm font-black text-white"
                >
                  {selected.length === 1 ? "Play am" : `Play ${selected.length}`}
                </button>
              </div>
            </div>
          )}
          <div className="-mx-3 overflow-x-auto px-3 pb-2 pt-5">
            <div className="flex w-max min-w-full justify-center">
              {!revealed ? (
                <p className="py-8 text-muted">Cards hidden</p>
              ) : (
                view.myHand.map((card, i) => {
                  const order = selected.indexOf(card);
                  const ok = lead ? card.number === lead.number : playable.has(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => tapCard(card)}
                      aria-pressed={lead ? order >= 0 : undefined}
                      className={`relative transition ${i ? "-ml-3" : ""} ${
                        order >= 0 ? "z-10 -translate-y-5" : myTurn && ok ? "-translate-y-2 hover:-translate-y-4" : ""
                      }`}
                      aria-label={lead ? `${order >= 0 ? "Unselect" : ok ? "Stack" : "Can't stack"} ${cardLabel(card)}` : `Play ${cardLabel(card)}`}
                    >
                      <WhotCard card={card} dim={myTurn && !ok} />
                      {order >= 0 && (
                        <span className="absolute -right-1 -top-2 grid size-6 place-items-center rounded-full bg-ochre text-xs font-black text-black shadow">
                          {order + 1}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {choosingShape && (
        <Modal>
          <h2 className="text-2xl font-black">Wetin you need?</h2>
          <p className="mt-1 text-muted">Call the shape for your {choosingShape.length > 1 ? `${choosingShape.length} Whots` : "Whot"}.</p>
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
    </>
  );
}

/** End-of-game hands and scores. `me` is the viewer's seat for "You win" vs "E don cast"; null names the winner. */
export function WhotResult({ view, seats, me, children }: { view: whot.WhotView; seats: BoardSeat[]; me: number | null; children: ReactNode }) {
  const hands = view.revealedHands ?? [];
  const winners = view.winners.map((w) => seats[w]?.name ?? `Player ${w + 1}`).join(" & ");
  const title =
    me !== null
      ? view.winners.includes(me)
        ? view.endReason === "checkup"
          ? "Check up! 🎉"
          : "You win! 🎉"
        : "E don cast 😩"
      : `${winners} win! 🎉`;
  return (
    <Modal>
      <h2 className="text-3xl font-black">{title}</h2>
      <p className="mt-1 text-muted">
        {view.endReason === "checkup" ? `${winners} finish all cards.` : "Market finish, so we count. Lowest wins, stars count double."}
      </p>
      <ul className="mt-4 flex max-h-72 flex-col gap-3 overflow-y-auto">
        {hands.map((hand, p) => (
          <li key={p} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm font-bold">
              <span>
                {view.winners.includes(p) ? "🏆 " : ""}
                {seats[p]?.name}
              </span>
              <span className="text-muted">{whot.handTotal(hand)} pts</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {hand.length === 0 ? <span className="text-sm text-muted">No cards left</span> : hand.map((c) => <WhotCard key={c.id} card={c} size="sm" />)}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-2">{children}</div>
    </Modal>
  );
}
