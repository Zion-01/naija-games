"use client";

import type { ReactNode } from "react";
import { AYO_BOARDS, CARD_BACKS, cosmetics, isUnlocked, pick, totalWins, type AyoBoardStyle } from "@/lib/cosmetics";
import { sfx } from "@/lib/feedback";
import { stats } from "@/lib/stats";
import { CardBack } from "./whot/WhotCard";

/** /style: choose a card back and an Ayo board. Locked ones say how many more wins they need. */
export function StylePicker() {
  const record = stats.use();
  const chosen = cosmetics.use();
  const wins = totalWins(record);
  const back = pick(CARD_BACKS, chosen.cardBack, record);
  const board = pick(AYO_BOARDS, chosen.ayoBoard, record);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6">
      <p className="text-muted">
        You don win <b className="text-foreground">{wins}</b> game{wins === 1 ? "" : "s"} against the computer. Win more to unlock new looks. Only you see
        your table.
      </p>

      <Section title="Whot card back">
        {CARD_BACKS.map((b) => (
          <Choice
            key={b.id}
            name={b.name}
            need={b.wins - wins}
            selected={b === back}
            onPick={() => cosmetics.set({ cardBack: b.id })}
          >
            <CardBack size="md" look={b} />
          </Choice>
        ))}
      </Section>

      <Section title="Ayo board">
        {AYO_BOARDS.map((b) => (
          <Choice
            key={b.id}
            name={b.name}
            need={b.wins - wins}
            selected={b === board}
            onPick={() => cosmetics.set({ ayoBoard: b.id })}
          >
            <MiniBoard look={b} />
          </Choice>
        ))}
      </Section>

      <p className="text-center text-sm text-muted">Wins are counted on this device. No shop, no lucky dip: just play.</p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Choice({ name, need, selected, onPick, children }: { name: string; need: number; selected: boolean; onPick: () => void; children: ReactNode }) {
  const locked = need > 0;
  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={selected}
      onClick={() => {
        sfx("tap");
        onPick();
      }}
      className={`flex flex-col items-center gap-2 rounded-3xl bg-surface p-4 shadow-sm ring-1 transition ${
        selected ? "ring-4 ring-accent" : "ring-line hover:-translate-y-0.5"
      } ${locked ? "cursor-not-allowed" : ""}`}
    >
      <div className={`grid h-28 place-items-center ${locked ? "opacity-40 grayscale-[0.6]" : ""}`}>{children}</div>
      <span className="font-bold">{name}</span>
      <span className={`text-xs ${locked ? "text-muted" : selected ? "font-bold text-accent" : "text-muted"}`}>
        {locked ? `🔒 ${need} more win${need === 1 ? "" : "s"}` : selected ? "✓ Using" : "Tap to use"}
      </span>
    </button>
  );
}

function MiniBoard({ look }: { look: AyoBoardStyle }) {
  return (
    <div
      className="grid grid-cols-4 gap-1.5 rounded-2xl p-2 shadow-lg"
      style={{ background: `linear-gradient(180deg, ${look.wood}, ${look.woodDark})` }}
      aria-hidden
    >
      {[3, 4, 2, 4, 1, 4, 0, 5].map((n, i) => (
        <div key={i} className="grid size-7 place-items-center rounded-full shadow-[inset_0_3px_6px_rgb(0_0_0/0.55)]" style={{ background: look.pit }}>
          <span className="flex flex-wrap justify-center gap-px px-1">
            {Array.from({ length: n }, (_, j) => (
              <span key={j} className="size-1.5 rounded-full" style={{ background: look.seed }} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
