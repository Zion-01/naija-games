import { ayo, whot } from "@naija/engine";

// Phase 0 placeholder lobby. Phase 2 replaces this with the real game list and tables.
const GAMES = [
  { href: "/whot", emoji: "🃏", title: "Whot", blurb: `${whot.createDeck().length} cards · Naija street rules · 2–4 players` },
  { href: "/ayo", emoji: "🌰", title: "Ayo", blurb: `${ayo.PITS} pits · ${ayo.TOTAL_SEEDS} seeds · Ayo Olopon` },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-4xl font-black">Naija Games</h1>
        <p className="mt-2 text-lg opacity-70">Oya, pick your game.</p>
      </header>
      <ul className="flex flex-col gap-3">
        {GAMES.map((g) => (
          <li key={g.href} className="rounded-2xl border border-current/15 p-5">
            <div className="text-3xl">{g.emoji}</div>
            <div className="mt-1 text-xl font-bold">{g.title}</div>
            <div className="opacity-70">{g.blurb}</div>
            <div className="mt-2 text-sm opacity-50">Coming soon</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
