import { ayo } from "@naija/engine";
import { LINES, type Callout } from "./callouts";

/**
 * Board snapshots for animating a sow from `pit`: the pit is lifted, then one seed lands per frame.
 * Each frame also says which pit just received a seed. Captures are applied after the last frame.
 */
export function sowFrames(pits: readonly number[], pit: number): { pits: number[]; landed: number | null }[] {
  const board = pits.slice();
  board[pit] = 0;
  const frames = [{ pits: board.slice(), landed: null as number | null }];
  for (const target of ayo.sow(pits, pit)) {
    board[target]!++;
    frames.push({ pits: board.slice(), landed: target });
  }
  return frames;
}

/**
 * Pidgin callouts once a sow has landed. `me` is the device's player, for "You win" vs "E don cast";
 * null names the winner instead.
 */
export function ayoCallouts(
  prev: Pick<ayo.AyoState, "stores">,
  move: ayo.AyoMove,
  next: ayo.AyoState,
  names: readonly [string, string],
  me: 0 | 1 | null,
): Callout[] {
  const out: Callout[] = [];
  const captured = next.stores[move.player] - prev.stores[move.player];
  const mine = me === null || move.player === me;
  if (captured > 0) {
    out.push({ text: LINES.captured(names[move.player], captured), sfx: "capture", tone: mine ? "good" : "bad" });
  }
  if (next.over) {
    if (next.winner === null) out.push({ text: LINES.draw, sfx: "special", tone: "info" });
    else if (me === null) out.push({ text: `${names[next.winner]} win! 🎉`, sfx: "win", tone: "good" });
    else if (next.winner === me) out.push({ text: LINES.youWin, sfx: "win", tone: "good" });
    else out.push({ text: LINES.youLose, sfx: "lose", tone: "bad" });
  }
  return out;
}
