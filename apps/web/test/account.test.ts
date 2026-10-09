import { describe, expect, it } from "vitest";
import { toPlayedGames } from "../src/lib/account";

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
