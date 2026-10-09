import { describe, expect, it } from "vitest";
import { AYO_BOARDS, CARD_BACKS, cosmeticVars, isUnlocked, pick, totalWins } from "../src/lib/cosmetics";
import type { Stats } from "../src/lib/stats";

const withWins = (whot: number, ayo = 0): Stats => ({
  whot: { played: whot + 2, won: whot, drawn: 0 },
  ayo: { played: ayo, won: ayo, drawn: 0 },
});

describe("cosmetics", () => {
  it("has free defaults first, unique ids, and unlocks in order", () => {
    for (const items of [CARD_BACKS, AYO_BOARDS]) {
      expect(items[0]!.wins).toBe(0);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      const needs = items.map((i) => i.wins);
      expect(needs).toEqual([...needs].sort((a, b) => a - b));
    }
  });

  it("counts wins from both games", () => {
    expect(totalWins(withWins(2, 3))).toBe(5);
    expect(isUnlocked(AYO_BOARDS.find((b) => b.id === "ebony")!, withWins(2, 3))).toBe(true);
    expect(isUnlocked(AYO_BOARDS.find((b) => b.id === "ebony")!, withWins(2, 2))).toBe(false);
  });

  it("falls back to the default when the choice is unknown or locked", () => {
    expect(pick(CARD_BACKS, "kente", withWins(10)).id).toBe("kente");
    expect(pick(CARD_BACKS, "kente", withWins(9)).id).toBe("classic");
    expect(pick(CARD_BACKS, "gone", withWins(99)).id).toBe("classic");
  });

  it("only overrides theme colours for non-default choices", () => {
    expect(cosmeticVars({ cardBack: "classic", ayoBoard: "iroko" }, withWins(0))).toEqual({});
    expect(cosmeticVars({ cardBack: "oba", ayoBoard: "brass" }, withWins(10))).toEqual({});
    const vars = cosmeticVars({ cardBack: "adire", ayoBoard: "clay" }, withWins(15));
    expect(vars["--card-back"]).toBe("#24316b");
    expect(vars["--wood"]).toBe("#b5532f");
    expect(Object.keys(vars)).toHaveLength(6);
  });
});
