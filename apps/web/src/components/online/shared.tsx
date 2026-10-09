"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Snapshot } from "@naija/online";
import { PrimaryButton } from "@/components/ui";
import { sfx } from "@/lib/feedback";
import { secondsLeft, type Connection } from "@/lib/online";

/** Rematch controls for the end-of-game modal. */
export function RematchButtons({ snap, conn }: { snap: Snapshot; conn: Connection }) {
  const asked = snap.you >= 0 && snap.rematch.includes(snap.you);
  const waitingFor = snap.seats
    .flatMap((s, i) => (s?.kind === "human" && !snap.rematch.includes(i) && i !== snap.you ? [s.name] : []))
    .join(" & ");
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <Link href="/" className="flex-1 rounded-2xl bg-surface py-3.5 text-center font-bold">
          Lobby
        </Link>
        {snap.you >= 0 && (
          <PrimaryButton
            onClick={() => {
              sfx("tap");
              conn.send("rematch");
            }}
            className={`flex-[2] ${asked ? "pointer-events-none opacity-60" : ""}`}
          >
            {asked ? "Waiting…" : "Rematch!"}
          </PrimaryButton>
        )}
      </div>
      {(asked || snap.rematch.length > 0) && waitingFor && (
        <p className="text-center text-sm text-muted">
          {asked ? `Waiting for ${waitingFor}` : `${snap.rematch.map((i) => snap.seats[i]?.name).join(" & ")} want rematch`}
        </p>
      )}
    </div>
  );
}

/** Seconds left on the turn clock, corrected for the gap between the server's clock and ours. */
export function useSecondsLeft(snap: Snapshot): number | null {
  const [now, setNow] = useState<{ at: number; received: number; snap: Snapshot } | null>(null);
  useEffect(() => {
    if (snap.deadline === null) return;
    const received = Date.now();
    const tick = () => setNow({ at: Date.now(), received, snap });
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [snap]);
  if (!now || now.snap !== snap) return null;
  return secondsLeft(snap.deadline, snap.now, now.received, now.at);
}
