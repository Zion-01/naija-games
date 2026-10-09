"use client";

import { useEffect, useState } from "react";
import { stats, type GameId } from "@/lib/stats";

/** Your record against the computer, from this device. */
export function GameRecord({ game }: { game: GameId }) {
  const r = stats.use()[game];
  if (!r.played) return <span className="text-sm text-muted">Never played. Try am!</span>;
  const lost = r.played - r.won - r.drawn;
  return (
    <span className="text-sm text-muted">
      vs computer: <b className="text-palm">{r.won}W</b> · <b className="text-[var(--card-ink)]">{lost}L</b>
      {r.drawn ? ` · ${r.drawn}D` : ""}
    </span>
  );
}

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Shows an "Install" button when the browser offers to install the PWA. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setPrompt(null);
      }}
      className="rounded-2xl border-2 border-dashed border-line px-4 py-3 text-center font-bold"
    >
      📲 Add to your home screen. E go work offline.
    </button>
  );
}
