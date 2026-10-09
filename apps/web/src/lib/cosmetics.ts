import { createStore } from "./storage";
import type { Stats } from "./stats";

/**
 * Cosmetic card backs and Ayo boards. Purely local: they change how this device draws the table, never what
 * anyone else sees. They unlock with wins against the computer (no shop, no loot boxes, nothing random).
 */
export type CardBackStyle = {
  id: string;
  name: string;
  /** Wins against the computer (both games) needed to use it. */
  wins: number;
  color: string;
  /** Light pattern drawn over `color` at 30% opacity. */
  pattern: string;
};

export type AyoBoardStyle = {
  id: string;
  name: string;
  wins: number;
  wood: string;
  woodDark: string;
  pit: string;
  seed: string;
};

const LATTICE =
  "repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 8px)";

export const CARD_BACKS: CardBackStyle[] = [
  { id: "classic", name: "Naija red", wins: 0, color: "#8a1c2b", pattern: LATTICE },
  {
    id: "adire",
    name: "Adire indigo",
    wins: 0,
    color: "#24316b",
    pattern: "radial-gradient(circle at 50% 50%, #fff 0 2px, transparent 2.5px) 0 0 / 10px 10px, radial-gradient(circle, transparent 0 6px, #fff 6px 7px, transparent 7.5px) 5px 5px / 20px 20px",
  },
  {
    id: "palm",
    name: "Palm stripe",
    wins: 3,
    color: "#1f7a4d",
    pattern: "repeating-linear-gradient(90deg, #fff 0 3px, transparent 3px 9px, #fff 9px 10px, transparent 10px 16px)",
  },
  {
    id: "kente",
    name: "Kente",
    wins: 10,
    color: "#b7791f",
    pattern:
      "repeating-linear-gradient(0deg, #fff 0 4px, transparent 4px 12px), repeating-linear-gradient(90deg, transparent 0 6px, #000 6px 10px, transparent 10px 16px)",
  },
  {
    id: "ankara",
    name: "Ankara swirl",
    wins: 25,
    color: "#6d1f6b",
    pattern: "repeating-radial-gradient(circle at 30% 30%, #fff 0 2px, transparent 2px 7px), repeating-radial-gradient(circle at 80% 85%, #ffb000 0 2px, transparent 2px 6px)",
  },
  {
    id: "oba",
    name: "Oba's gold",
    wins: 50,
    color: "#15110c",
    pattern:
      "linear-gradient(45deg, transparent 45%, #f0c040 45% 55%, transparent 55%) 0 0 / 12px 12px, linear-gradient(-45deg, transparent 45%, #f0c040 45% 55%, transparent 55%) 0 0 / 12px 12px",
  },
];

export const AYO_BOARDS: AyoBoardStyle[] = [
  { id: "iroko", name: "Iroko", wins: 0, wood: "#8b5a2b", woodDark: "#5e3a19", pit: "#4a2c12", seed: "#f0e2c2" },
  { id: "ebony", name: "Ebony", wins: 5, wood: "#3a2a22", woodDark: "#1a120d", pit: "#0d0907", seed: "#e8d7b0" },
  { id: "clay", name: "Red clay", wins: 15, wood: "#b5532f", woodDark: "#7a3018", pit: "#4d1d0e", seed: "#f6e7c8" },
  { id: "brass", name: "Palace brass", wins: 40, wood: "#5c3b1e", woodDark: "#2e1c0c", pit: "#1c1108", seed: "#e9b949" },
];

export type Cosmetics = { cardBack: string; ayoBoard: string };

export const cosmetics = createStore<Cosmetics>("naija-games:cosmetics", { cardBack: "classic", ayoBoard: "iroko" });

export function totalWins(s: Stats): number {
  return (s.whot?.won ?? 0) + (s.ayo?.won ?? 0);
}

export function isUnlocked(item: { wins: number }, s: Stats): boolean {
  return totalWins(s) >= item.wins;
}

/** The chosen item, or the first (free) one if it's unknown or no longer unlocked (stats were cleared). */
export function pick<T extends { id: string; wins: number }>(items: T[], id: string, s: Stats): T {
  const chosen = items.find((i) => i.id === id);
  return chosen && isUnlocked(chosen, s) ? chosen : items[0]!;
}

/** CSS variables for the chosen styles. The defaults return nothing, so the light and dark theme colours apply. */
export function cosmeticVars(c: Cosmetics, s: Stats): Record<string, string> {
  const back = pick(CARD_BACKS, c.cardBack, s);
  const board = pick(AYO_BOARDS, c.ayoBoard, s);
  const vars: Record<string, string> = {};
  if (back !== CARD_BACKS[0]) Object.assign(vars, { "--card-back": back.color, "--card-back-pattern": back.pattern });
  if (board !== AYO_BOARDS[0]) {
    Object.assign(vars, { "--wood": board.wood, "--wood-dark": board.woodDark, "--pit": board.pit, "--seed": board.seed });
  }
  return vars;
}
