import { describe, expect, it } from "vitest";
import { nextReset, resetsIn, toAllTimeRows } from "../src/lib/leaderboard";

describe("weekly reset", () => {
  it("resets at Monday 00:00 Lagos time, which is Sunday 23:00 UTC", () => {
    // Thursday 8 October 2026, 13:00 UTC (14:00 in Lagos).
    expect(new Date(nextReset(Date.UTC(2026, 9, 8, 13))).toISOString()).toBe("2026-10-11T23:00:00.000Z");
    // Sunday 22:59 UTC is still Sunday in Lagos: one minute to go.
    expect(new Date(nextReset(Date.UTC(2026, 9, 11, 22, 59))).toISOString()).toBe("2026-10-11T23:00:00.000Z");
    // Sunday 23:00 UTC is Monday 00:00 in Lagos: a fresh week, so the next reset is a week away.
    expect(new Date(nextReset(Date.UTC(2026, 9, 11, 23))).toISOString()).toBe("2026-10-18T23:00:00.000Z");
  });

  it("says how long is left in words", () => {
    expect(resetsIn(Date.UTC(2026, 9, 8, 13))).toBe("3 days 10 hrs");
    expect(resetsIn(Date.UTC(2026, 9, 11, 17, 40))).toBe("5 hrs 20 min");
    expect(resetsIn(Date.UTC(2026, 9, 11, 22, 59, 30))).toBe("1 min");
    expect(resetsIn(Date.UTC(2026, 9, 10, 22))).toBe("1 day 1 hr");
  });
});

describe("toAllTimeRows", () => {
  it("shares a rank between equal ratings and falls back to Guest without a profile", () => {
    const row = (user_id: string, rating: number, nickname: string | null) => ({
      user_id,
      rating,
      rated_games: 3,
      wins: 2,
      profiles: nickname === null ? null : { nickname },
    });
    const rows = toAllTimeRows([row("a", 1300, "Ada"), row("b", 1250, "Bisi"), row("c", 1250, null), row("d", 1200, "Dayo")]);
    expect(rows.map((r) => [r.rank, r.nickname, r.score])).toEqual([
      [1, "Ada", 1300],
      [2, "Bisi", 1250],
      [2, "Guest", 1250],
      [4, "Dayo", 1200],
    ]);
  });
});
