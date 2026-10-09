import Link from "next/link";
import { ayo, whot } from "@naija/engine";
import { GameRecord, InstallButton, JoinByCode } from "@/components/Lobby";
import { SettingsToggles } from "@/components/ui";
import { CardBack, WhotCard } from "@/components/whot/WhotCard";

const GAMES = [
  {
    id: "whot",
    href: "/whot",
    title: "Whot",
    blurb: `${whot.createDeck().length} cards · Naija street rules · 2–4 players`,
  },
  {
    id: "ayo",
    href: "/ayo",
    title: "Ayo",
    blurb: `${ayo.PITS} pits · ${ayo.TOTAL_SEEDS} seeds · Ayo Olopon`,
  },
] as const;

function WhotArt() {
  return (
    <div className="flex -rotate-6 items-center">
      <CardBack size="sm" className="rotate-[-8deg]" />
      <WhotCard card={{ id: "a", shape: "star", number: 7 }} size="sm" className="-ml-4 rotate-3" />
      <WhotCard card={{ id: "b", shape: "whot", number: 20 }} size="sm" className="-ml-4 rotate-12" />
    </div>
  );
}

function AyoArt() {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-wood p-1.5 shadow">
      {[3, 4, 2, 4, 1, 4].map((n, i) => (
        <div key={i} className="grid size-5 place-items-center rounded-full bg-pit text-[0.55rem] font-bold text-seed">
          {n}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="ankara flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Naija Games</h1>
            <p className="mt-1 text-lg text-muted">Oya, pick your game.</p>
          </div>
          <div className="flex items-center gap-1">
            <SettingsToggles />
            <Link href="/profile" aria-label="Your profile" className="grid size-9 place-items-center rounded-full text-xl hover:bg-surface">
              👤
            </Link>
          </div>
        </header>
        <div className="kente rounded-full" />
        <ul className="flex flex-col gap-4">
          {GAMES.map((g) => (
            <li key={g.id}>
              <Link
                href={g.href}
                className="flex items-center gap-4 rounded-3xl bg-surface p-5 shadow-md ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
              >
                <div className="grid w-20 shrink-0 place-items-center">{g.id === "whot" ? <WhotArt /> : <AyoArt />}</div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-2xl font-black">{g.title}</span>
                  <span className="text-sm">{g.blurb}</span>
                  <GameRecord game={g.id} />
                </div>
                <span className="ml-auto text-2xl text-accent">→</span>
              </Link>
            </li>
          ))}
        </ul>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Your guy send you code?</h2>
          <JoinByCode />
        </section>
        <p className="text-center text-sm text-muted">
          Play the computer, pass the phone, or pick 🌍 Online in a game to send your guy a WhatsApp link.
        </p>
        <InstallButton />
      </div>
    </main>
  );
}
