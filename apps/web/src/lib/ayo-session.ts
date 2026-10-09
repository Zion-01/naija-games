import { ayo } from "@naija/engine";

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
