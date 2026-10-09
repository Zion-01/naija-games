"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { QUICK_OFFER_SECONDS, type GameId, type WhotRoomOptions } from "@naija/online";
import { PrimaryButton } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { AccountError } from "@/lib/account";
import { Search, createRoom, wakeServer } from "@/lib/online";
import { NicknameField, useNickname } from "./Nickname";

/** "Invite your guy" opens a private room and goes to its /play/CODE page; "Find opponent" joins the quick-match queue. */
export function OnlineSetup({ game, whot }: { game: GameId; whot?: WhotRoomOptions }) {
  const router = useRouter();
  const [nickname, setNickname] = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<Search | null>(null);

  // Picking Online is the hint: start waking a sleeping server while they type their name.
  useEffect(wakeServer, []);

  function named() {
    if (nickname.trim()) return true;
    setError("Tell us your name first.");
    return false;
  }

  async function create() {
    if (!named()) return;
    sfx("tap");
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom(game, nickname, whot);
      router.push(`/play/${code}`);
    } catch (e) {
      setError(e instanceof AccountError ? e.message : "We no fit reach the game server. Check your network and try again.");
      setBusy(false);
    }
  }

  function find() {
    if (!named()) return;
    sfx("tap");
    setError(null);
    const s = new Search(game, nickname);
    const off = s.subscribe(() => {
      const state = s.get();
      if (state.status === "searching") return;
      off();
      if (state.status === "matched") {
        sfx("win");
        router.push(`/play/${state.code}`);
      } else {
        setSearch(null);
        setError(state.error);
      }
    });
    setSearch(s);
  }

  if (search) {
    return (
      <Searching
        search={search}
        onCancel={() => {
          search.cancel();
          setSearch(null);
        }}
      />
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <NicknameField value={nickname} onChange={setNickname} onSubmit={create} />
      <PrimaryButton onClick={create} className={busy ? "pointer-events-none opacity-60" : ""}>
        {busy ? "Opening room…" : "Invite your guy 📲"}
      </PrimaryButton>
      <button type="button" onClick={find} className="rounded-2xl bg-surface py-3.5 text-lg font-black shadow-sm transition active:scale-95">
        Find me opponent ⚡
      </button>
      {error && <p className="text-center text-sm font-semibold text-[var(--card-ink)]">{error}</p>}
      <p className="text-center text-sm text-muted">
        Invite: you go get a link to send on WhatsApp. Find opponent: we go match you with somebody near your level{game === "whot" ? ", one on one" : ""}.
      </p>
    </div>
  );
}

function Searching({ search, onCancel }: { search: Search; onCancel: () => void }) {
  const state = useSyncExternalStore(search.subscribe, search.get, search.get);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  // Leaving the page (or switching mode) mid-search takes you out of the queue.
  useEffect(() => search.retain(), [search]);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="mt-2 flex flex-col gap-3 text-center" role="status">
      <p className="text-4xl" aria-hidden>
        🔎
      </p>
      <p className="text-xl font-black">{state.status === "matched" ? "We don find person!" : "Finding you opponent…"}</p>
      <p className="font-mono text-lg text-muted">{clock}</p>
      {seconds >= QUICK_OFFER_SECONDS && state.status === "searching" && (
        <>
          <p className="text-sm text-muted">Nobody dey around your level now. We go keep looking, or you fit play the computer.</p>
          <PrimaryButton
            onClick={() => {
              sfx("tap");
              search.solo();
            }}
          >
            Play the computer
          </PrimaryButton>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          sfx("tap");
          onCancel();
        }}
        className="rounded-2xl bg-surface py-3 font-bold shadow-sm"
      >
        Cancel
      </button>
    </div>
  );
}
