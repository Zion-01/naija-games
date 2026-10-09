import { whot } from "@naija/engine";
import { LINES, type Callout } from "./voice";

export type SeatKind = "human" | "ai";
export type WhotSeat = { name: string; kind: SeatKind };

/** Pidgin callouts for a move that has just been applied (`prev` → `next`). */
export function whotCallouts(
  prev: whot.WhotState,
  move: whot.WhotMove,
  next: whot.WhotState,
  seats: WhotSeat[],
): Callout[] {
  const name = (p: number) => seats[p]?.name ?? `Player ${p + 1}`;
  const out: Callout[] = [];

  if (move.type === "catch") {
    out.push({ text: LINES.caught(name(move.player), name(move.target)), sfx: "special", speak: true, tone: "bad" });
  } else if (move.type === "draw") {
    const amount = prev.pending?.amount ?? 1;
    if (amount > 1) out.push({ text: LINES.picked(name(move.player), amount), sfx: "draw", speak: false, tone: "info" });
  } else {
    const card = whot.topCard(next);
    const special = (text: string): Callout => ({ text, sfx: "special", speak: true });
    switch (card.number) {
      case whot.HOLD_ON:
        out.push(special(LINES.holdOn));
        break;
      case whot.PICK_TWO:
      case whot.PICK_THREE: {
        const amount = next.pending?.amount ?? 0;
        const fresh = card.number === whot.PICK_TWO ? 2 : 3;
        if (amount > fresh) out.push(special(LINES.stacked(amount)));
        else if (fresh === 2) out.push(special(LINES.pickTwo));
        else out.push(special(LINES.pickThree));
        break;
      }
      case whot.SUSPENSION:
        out.push(special(LINES.suspension(name(whot.nextSeat(next, move.player, 1)))));
        break;
      case whot.GENERAL_MARKET:
        out.push(special(LINES.generalMarket));
        break;
      case whot.WHOT:
        if (move.callShape) out.push(special(LINES.callShape(move.callShape)));
        break;
    }
    if (move.lastCard && next.hands[move.player]?.length === 1) {
      out.push({ text: LINES.lastCard, sfx: "special", speak: true, tone: "info" });
    }
  }

  if (next.over) out.push(...endCallouts(next, seats));
  return out;
}

function endCallouts(s: whot.WhotState, seats: WhotSeat[]): Callout[] {
  const humans = seats.flatMap((seat, i) => (seat.kind === "human" ? [i] : []));
  const out: Callout[] = [];
  if (s.endReason === "market") out.push({ text: LINES.marketFinished, sfx: "special", speak: true, tone: "info" });
  const winners = s.winners.map((p) => seats[p]?.name ?? `Player ${p + 1}`).join(" & ");
  if (humans.length === 1) {
    const won = s.winners.includes(humans[0]!);
    if (won) out.push({ text: s.endReason === "checkup" ? LINES.checkUp : LINES.youWin, sfx: "win", speak: true, tone: "good" });
    else out.push({ text: LINES.youLose, sfx: "lose", speak: true, tone: "bad" });
  } else {
    out.push({
      text: s.endReason === "checkup" ? `${LINES.checkUp} ${LINES.theyCheckedUp(winners)}` : `${winners} win!`,
      sfx: "win",
      speak: true,
      tone: "good",
    });
  }
  return out;
}

/**
 * The next thing the computer seats want to do, or null if it's a human's move.
 * Non-current AI seats get one chance per turn to catch a forgotten "Last card" (as in the engine's
 * `simulate()`); `asked` remembers which (turn, seat) pairs have already decided.
 */
export function nextAiAction(
  s: whot.WhotState,
  seats: WhotSeat[],
  asked: Set<string>,
  choose: (view: whot.WhotView) => whot.WhotMove | null,
): { kind: "catch" | "turn"; seat: number; move: whot.WhotMove | null } | null {
  if (s.over) return null;
  if (s.vulnerable !== null) {
    for (let p = 0; p < s.players; p++) {
      if (p === s.current || p === s.vulnerable || seats[p]?.kind !== "ai") continue;
      const key = `${s.turn}:${s.vulnerable}:${p}`;
      if (asked.has(key)) continue;
      asked.add(key);
      const move = choose(whot.viewFor(s, p));
      if (move?.type === "catch") return { kind: "catch", seat: p, move };
    }
  }
  // The turn's move is computed lazily by the caller (hard AI is slow), so `move` is null here.
  if (seats[s.current]?.kind === "ai") return { kind: "turn", seat: s.current, move: null };
  return null;
}
