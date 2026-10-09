import { createStore } from "./storage";

export type GameId = "whot" | "ayo";
export type GameRecord = { played: number; won: number; drawn: number };
export type Stats = { [K in GameId]: GameRecord };

const empty: GameRecord = { played: 0, won: 0, drawn: 0 };

/** Results of games against the computer, kept on this device. */
export const stats = createStore<Stats>("naija-games:stats", { whot: empty, ayo: empty });

export function recordResult(game: GameId, result: "won" | "lost" | "drawn") {
  stats.set((prev) => {
    const r = prev[game] ?? empty;
    return {
      ...prev,
      [game]: {
        played: r.played + 1,
        won: r.won + (result === "won" ? 1 : 0),
        drawn: r.drawn + (result === "drawn" ? 1 : 0),
      },
    };
  });
}
