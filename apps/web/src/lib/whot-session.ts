import { whot } from "@naija/engine";
import { LINES, type Callout } from "./voice";

export type SeatKind = "human" | "ai";
export type WhotSeat = { name: string; kind: SeatKind };

/** Enough of a game to call it: the full local state, or the redacted view a client gets from the server. */
export type CalloutState = Pick<whot.WhotState, "pending" | "pile" | "players" | "over" | "endReason" | "winners"> &
  ({ hands: whot.Card[][] } | { handCounts: number[] });

const handCount = (s: CalloutState, p: number) => ("handCounts" in s ? s.handCounts[p] : s.hands[p]?.length);

/** The seat whose win is "You win": the only human at the table, if there is just one. */
const soleHuman = (seats: WhotSeat[]) => {
  const humans = seats.flatMap((seat, i) => (seat.kind === "human" ? [i] : []));
  return humans.length === 1 ? humans[0]! : null;
};

/**
 * Pidgin callouts for a move that has just been applied (`prev` → `next`).
 * `me` is the seat the device belongs to, for "You win" vs "E don cast"; null shows the winner's name.
 */
export function whotCallouts(
  prev: CalloutState,
  move: whot.WhotMove,
  next: CalloutState,
  seats: WhotSeat[],
  me: number | null = soleHuman(seats),
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
    const count = 1 + (move.stack?.length ?? 0);
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
      case whot.SUSPENSION: {
        // Matches the engine: each 8 skips one more seat, but never past the player.
        const skipped = Array.from({ length: Math.min(count, next.players - 1) }, (_, i) =>
          name(whot.nextSeat(next, move.player, i + 1)),
        );
        out.push(special(LINES.suspension(skipped.join(" & "))));
        break;
      }
      case whot.GENERAL_MARKET:
        out.push(special(count > 1 ? LINES.generalMarketStack(count) : LINES.generalMarket));
        break;
      case whot.WHOT:
        if (move.callShape) out.push(special(LINES.callShape(move.callShape)));
        break;
      default:
        if (count > 1) out.push(special(LINES.combo(count)));
    }
    if (move.lastCard && handCount(next, move.player) === 1) {
      out.push({ text: LINES.lastCard, sfx: "special", speak: true, tone: "info" });
    }
  }

  if (next.over) out.push(...endCallouts(next, seats, me));
  return out;
}

function endCallouts(s: CalloutState, seats: WhotSeat[], me: number | null): Callout[] {
  const out: Callout[] = [];
  if (s.endReason === "market") out.push({ text: LINES.marketFinished, sfx: "special", speak: true, tone: "info" });
  const winners = s.winners.map((p) => seats[p]?.name ?? `Player ${p + 1}`).join(" & ");
  if (me !== null) {
    const won = s.winners.includes(me);
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
