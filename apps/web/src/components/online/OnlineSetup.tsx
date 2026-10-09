"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GameId, WhotRoomOptions } from "@naija/online";
import { PrimaryButton } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { AccountError } from "@/lib/account";
import { createRoom } from "@/lib/online";
import { NicknameField, useNickname } from "./Nickname";

/** "Invite your guy": opens a private room on the server and goes to its /play/CODE page. */
export function OnlineSetup({ game, whot }: { game: GameId; whot?: WhotRoomOptions }) {
  const router = useRouter();
  const [nickname, setNickname] = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!nickname.trim()) {
      setError("Tell us your name first.");
      return;
    }
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

  return (
    <div className="mt-2 flex flex-col gap-3">
      <NicknameField value={nickname} onChange={setNickname} onSubmit={create} />
      <PrimaryButton onClick={create} className={busy ? "pointer-events-none opacity-60" : ""}>
        {busy ? "Opening room…" : "Invite your guy 📲"}
      </PrimaryButton>
      {error && <p className="text-center text-sm font-semibold text-[var(--card-ink)]">{error}</p>}
      <p className="text-center text-sm text-muted">You go get a link to send on WhatsApp. If dem no show, the computer fit fill the seat.</p>
    </div>
  );
}
