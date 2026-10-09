import { describe, expect, it } from "vitest";
import { ayo, createRng, whot, type Rng } from "@naija/engine";
import type { Snapshot } from "@naija/online";
import { ayoCallouts, sowFrames } from "../src/lib/ayo-session";
import { isNextMove, secondsLeft } from "../src/lib/online";
import { LINES } from "../src/lib/callouts";
import { nextAiAction, whotCallouts, type WhotSeat } from "../src/lib/whot-session";

const card = (shape: whot.Shape, number: number): whot.Card => ({ id: `${shape}-${number}`, shape, number });

function table(hands: whot.Card[][], top: whot.Card, over: Partial<whot.WhotState> = {}): whot.WhotState {
  const base = whot.initialState({ players: hands.length }, 1);
  return { ...base, hands, pile: [top], market: base.market.filter((c) => !hands.flat().some((h) => h.id === c.id)), ...over };
}

const seats: WhotSeat[] = [
  { name: "You", kind: "human" },
  { name: "Mama Put", kind: "ai" },
  { name: "Oga Tunde", kind: "ai" },
];

function play(s: whot.WhotState, move: whot.WhotMove) {
  const r = whot.applyMove(s, move);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("whotCallouts", () => {
  it("calls pick two, and the stack when it is defended", () => {
    const s0 = table([[card("circle", 2), card("cross", 7)], [card("star", 2), card("square", 3)], [card("triangle", 4)]], card("circle", 4));
    const s1 = play(s0, { type: "play", player: 0, cardId: "circle-2" });
    expect(whotCallouts(s0, { type: "play", player: 0, cardId: "circle-2" }, s1, seats).map((c) => c.text)).toContain("Oya pick two!");
    const s2 = play(s1, { type: "play", player: 1, cardId: "star-2" });
    expect(whotCallouts(s1, { type: "play", player: 1, cardId: "star-2" }, s2, seats)[0]!.text).toBe("E don stack! Pick 4!");
  });

  it("calls stacked plays", () => {
    const s0 = table([[card("circle", 7), card("star", 7), card("star", 3)], [card("cross", 3)], [card("square", 3)]], card("circle", 4));
    const combo = { type: "play", player: 0, cardId: "circle-7", stack: ["star-7"], lastCard: true } as const;
    expect(whotCallouts(s0, combo, play(s0, combo), seats).map((c) => c.text)).toEqual([LINES.combo(2), LINES.lastCard]);

    const s1 = table([[card("circle", 8), card("star", 8), card("star", 3)], [card("cross", 3)], [card("square", 3)]], card("circle", 4));
    const skip = { type: "play", player: 0, cardId: "circle-8", stack: ["star-8"] } as const;
    expect(whotCallouts(s1, skip, play(s1, skip), seats)[0]!.text).toBe(LINES.suspension("Mama Put & Oga Tunde"));

    const s2 = table([[card("circle", 14), card("cross", 14), card("star", 3)], [card("cross", 3)], [card("square", 3)]], card("circle", 4));
    const market = { type: "play", player: 0, cardId: "circle-14", stack: ["cross-14"] } as const;
    expect(whotCallouts(s2, market, play(s2, market), seats)[0]!.text).toBe(LINES.generalMarketStack(2));
  });

  it("calls the Whot shape and Last card", () => {
    const s0 = table([[card("whot", 20), card("cross", 7)], [card("star", 1)]], card("circle", 4));
    const move: whot.WhotMove = { type: "play", player: 0, cardId: "whot-20", callShape: "star", lastCard: true };
    const texts = whotCallouts(s0, move, play(s0, move), seats).map((c) => c.text);
    expect(texts).toEqual(["I need star!", "Last card!"]);
  });

  it("celebrates a check up for the single human, and says E don cast when the computer wins", () => {
    const s0 = table([[card("circle", 9)], [card("circle", 3)]], card("circle", 4));
    const win = { type: "play", player: 0, cardId: "circle-9" } as const;
    expect(whotCallouts(s0, win, play(s0, win), seats).at(-1)!.text).toBe("Check up! 🎉");
    const s1 = { ...s0, current: 1 };
    const lose = { type: "play", player: 1, cardId: "circle-3" } as const;
    expect(whotCallouts(s1, lose, play(s1, lose), seats).at(-1)!.text).toBe("E don cast 😩");
  });
});

describe("nextAiAction", () => {
  const always = (rng: Rng) => (view: whot.WhotView) => whot.chooseWhotMove(view, "medium", rng);

  it("lets a non-current computer seat catch a forgotten Last card once per turn", () => {
    // You played down to one card without calling; it's Mama Put's turn, and Oga Tunde may catch.
    const s = table([[card("circle", 9)], [card("star", 3), card("cross", 1)], [card("square", 5), card("square", 7)]], card("circle", 4), {
      current: 1,
      vulnerable: 0,
    });
    const asked = new Set<string>();
    const first = nextAiAction(s, seats, asked, always(createRng(1)));
    expect(first).toEqual({ kind: "catch", seat: 2, move: { type: "catch", player: 2, target: 0 } });
    // Already asked this turn: next is Mama Put's own turn.
    expect(nextAiAction(s, seats, asked, always(createRng(1)))).toEqual({ kind: "turn", seat: 1, move: null });
  });

  it("waits for the human on their turn and stops when the game is over", () => {
    const s = table([[card("circle", 9), card("circle", 1)], [card("star", 3)]], card("circle", 4));
    expect(nextAiAction(s, seats.slice(0, 2), new Set(), always(createRng(1)))).toBeNull();
    expect(nextAiAction({ ...s, current: 1, over: true }, seats.slice(0, 2), new Set(), always(createRng(1)))).toBeNull();
  });
});

describe("sowFrames", () => {
  it("lifts the pit, drops one seed per frame and ends on the engine's board before captures", () => {
    const s = ayo.initialState();
    const frames = sowFrames(s.pits, 2);
    expect(frames).toHaveLength(5);
    expect(frames[0]!.pits[2]).toBe(0);
    expect(frames.map((f) => f.landed)).toEqual([null, 3, 4, 5, 6]);
    expect(frames.at(-1)!.pits).toEqual([4, 4, 0, 5, 5, 5, 5, 4, 4, 4, 4, 4]);
  });

  it("skips the starting pit on a long lap and keeps all the seeds", () => {
    const pits = [12, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    const frames = sowFrames(pits, 0);
    expect(frames.slice(1).every((f) => f.landed !== 0)).toBe(true);
    expect(frames.at(-1)!.pits.reduce((a, b) => a + b, 0)).toBe(18);
  });
});

describe("online helpers", () => {
  const snap = (round: number, moves: number, last: unknown = { type: "draw", player: 0 }) =>
    ({ round, moves, last }) as unknown as Snapshot;

  it("treats only the very next move of the same round as new", () => {
    expect(isNextMove(null, snap(0, 1))).toBe(false);
    expect(isNextMove(snap(0, 1), snap(0, 2))).toBe(true);
    expect(isNextMove(snap(0, 1), snap(0, 1))).toBe(false); // a join or a drop
    expect(isNextMove(snap(0, 1), snap(0, 3))).toBe(false); // missed some while reconnecting
    expect(isNextMove(snap(0, 5), snap(1, 6))).toBe(false); // rematch
    expect(isNextMove(snap(0, 1), snap(0, 2, null))).toBe(false);
  });

  it("corrects the turn clock for server clock skew", () => {
    // Server says 20s left; our clock is 5s ahead of it and 3.2s have passed since the snapshot arrived.
    expect(secondsLeft(120_000, 100_000, 105_000, 108_200)).toBe(17);
    expect(secondsLeft(120_000, 100_000, 105_000, 200_000)).toBe(0);
    expect(secondsLeft(null, 100_000, 105_000, 105_000)).toBeNull();
  });
});

describe("callouts from server views", () => {
  it("works on redacted views and calls from the viewer's seat", () => {
    const s0 = table([[card("circle", 9)], [card("circle", 3), card("star", 4)]], card("circle", 4));
    const move = { type: "play", player: 0, cardId: "circle-9" } as const;
    const s1 = play(s0, move);
    const online: WhotSeat[] = [
      { name: "Tunde", kind: "human" },
      { name: "Bisi", kind: "human" },
    ];
    const asSeen = (seat: number) => whotCallouts(whot.viewFor(s0, seat), move, whot.viewFor(s1, seat), online, seat).at(-1)!.text;
    expect(asSeen(0)).toBe("Check up! 🎉");
    expect(asSeen(1)).toBe("E don cast 😩");
    expect(whotCallouts(whot.viewFor(s0, -1), move, whot.viewFor(s1, -1), online, null).at(-1)!.text).toContain("Tunde don check up");
  });

  it("calls Ayo captures and the result for the viewer", () => {
    const prev = { ...ayo.initialState(), pits: [0, 0, 0, 0, 0, 2, 1, 1, 5, 0, 0, 0], stores: [21, 18] as [number, number] };
    const move = { type: "sow", player: 0, pit: 5 } as const;
    const r = ayo.applyMove(prev, move);
    if (!r.ok) throw new Error(r.error);
    const texts = (me: 0 | 1 | null) => ayoCallouts(prev, move, r.state, ["Ada", "Emeka"], me).map((c) => c.text);
    expect(texts(0)[0]).toBe("Ada chop 4!");
    expect(texts(0)).toContain(LINES.youWin);
    expect(texts(1)).toContain(LINES.youLose);
  });
});
