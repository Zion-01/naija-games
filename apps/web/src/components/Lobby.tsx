"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CODE_LENGTH, normalizeCode } from "@naija/online";
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

/** "Got a code?": jumps to /play/CODE for an invite someone read out instead of sending. */
export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = normalizeCode(code);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/play/${valid}`);
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={CODE_LENGTH}
        placeholder="Room code"
        aria-label="Room code"
        autoCapitalize="characters"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-2xl bg-surface px-4 py-3 font-mono text-lg font-black tracking-[0.3em] shadow-inner outline-none ring-accent placeholder:font-sans placeholder:tracking-normal placeholder:font-semibold focus:ring-2"
      />
      <button type="submit" disabled={!valid} className="rounded-2xl bg-accent px-5 font-black text-accent-ink shadow transition disabled:opacity-40">
        Join
      </button>
    </form>
  );
}
