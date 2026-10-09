import type { Sfx } from "./feedback";

/** A line for the toast (and the voice, when `speak` is set). */
export type Callout = { text: string; sfx: Sfx; speak: boolean; tone?: "good" | "bad" | "info" };

export const LINES = {
  holdOn: "Hold on!",
  pickTwo: "Oya pick two!",
  pickThree: "Pick three! E choke!",
  stacked: (n: number) => `E don stack! Pick ${n}!`,
  suspension: (who: string) => `Suspension! ${who}, siddon there.`,
  generalMarket: "General market!",
  callShape: (shape: string) => `I need ${shape}!`,
  lastCard: "Last card!",
  caught: (catcher: string, target: string) => `${catcher} catch ${target}! No last card: pick two.`,
  picked: (who: string, n: number) => `${who} don pick ${n}.`,
  checkUp: "Check up! 🎉",
  theyCheckedUp: (who: string) => `${who} don check up.`,
  marketFinished: "Market don finish! Count your cards.",
  youWin: "You win! Na you be oga 🎉",
  youLose: "E don cast 😩",
  draw: "Na draw. Una two strong.",
  captured: (who: string, n: number) => `${who} chop ${n}!`,
  yourTurn: "Your turn",
} as const;
