import { describe, expect, it } from "vitest";
import { normalizePhone, toPlayedGames } from "../src/lib/account";

describe("normalizePhone", () => {
  it("accepts Nigerian numbers the way people type them", () => {
    for (const typed of ["0803 123 4567", "803-123-4567", "2348031234567", "+234 (803) 123 4567"]) {
      expect(normalizePhone(typed)).toBe("+2348031234567");
    }
  });

  it("keeps other countries with a leading +, and refuses incomplete numbers", () => {
    expect(normalizePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalizePhone("0803 123")).toBeNull();
    expect(normalizePhone("+234 803 123 45678")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
  });
});

describe("toPlayedGames", () => {
  it("finds your seat and lists everyone else at the table", () => {
    const rows = [
      {
        id: "m1",
        game: "whot" as const,
        ended_at: "2026-10-09T10:00:00Z",
        match_players: [
          { seat: 1, user_id: "me", name: "Ada", kind: "human" as const, result: "lost" as const, abandoned: true, rating_before: 1200, rating_after: 1180 },
          { seat: 2, user_id: null, name: "Mama Put", kind: "ai" as const, result: "lost" as const, abandoned: false, rating_before: null, rating_after: null },
          { seat: 0, user_id: "you", name: "Tunde", kind: "human" as const, result: "won" as const, abandoned: false, rating_before: 1200, rating_after: 1220 },
        ],
      },
      // Not your game (shouldn't come back from the database, but never show it).
      { id: "m2", game: "ayo" as const, ended_at: "2026-10-09T09:00:00Z", match_players: [] },
    ];
    expect(toPlayedGames(rows, "me")).toEqual([
      {
        id: "m1",
        game: "whot",
        endedAt: "2026-10-09T10:00:00Z",
        result: "lost",
        abandoned: true,
        rating: { before: 1200, after: 1180 },
        others: [
          { name: "Tunde", kind: "human", result: "won" },
          { name: "Mama Put", kind: "ai", result: "lost" },
        ],
      },
    ]);
  });
});
