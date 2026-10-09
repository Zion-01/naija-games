import { describe, expect, it } from "vitest";
import { LOOP, STEPS_PER_BAR, musicStep } from "../src/lib/music";

const all = Array.from({ length: LOOP }, (_, s) => musicStep(s));

describe("musicStep", () => {
  it("keeps a steady kick on every beat", () => {
    for (let s = 0; s < LOOP; s += 4) expect(musicStep(s).some((n) => n.voice === "kick")).toBe(true);
    for (let s = 1; s < LOOP; s += 4) expect(musicStep(s).some((n) => n.voice === "kick")).toBe(false);
  });

  it("loops, including for negative steps", () => {
    expect(musicStep(LOOP + 37)).toEqual(musicStep(37));
    expect(musicStep(-1)).toEqual(musicStep(LOOP - 1));
  });

  it("eases in: no log drum or kalimba in the first bar", () => {
    const first = all.slice(0, STEPS_PER_BAR).flat();
    expect(first.some((n) => n.voice === "log" || n.voice === "kalimba")).toBe(false);
    expect(all.flat().some((n) => n.voice === "log")).toBe(true);
    expect(all.flat().some((n) => n.voice === "kalimba")).toBe(true);
  });

  it("only uses sensible pitches", () => {
    for (const n of all.flat()) {
      if (n.voice === "kick" || n.voice === "shaker") continue;
      expect(n.freq).toBeGreaterThan(30);
      expect(n.freq).toBeLessThan(2000);
    }
  });
});
