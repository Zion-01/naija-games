"use client";

import { useEffect, useRef } from "react";
import type { Snapshot, WhotWireMove } from "@naija/online";
import type { whot } from "@naija/engine";
import type { useCallouts } from "@/components/ui";
import { WhotBoard, WhotResult, type BoardSeat } from "@/components/whot/WhotBoard";
import { sfx } from "@/lib/feedback";
import { isNextMove, type Connection } from "@/lib/online";
import { whotCallouts } from "@/lib/whot-session";
import { RematchButtons, useSecondsLeft } from "./shared";

type Push = ReturnType<typeof useCallouts>["push"];

/** A server-run Whot game: draws the snapshot's view and sends taps to the server as moves. */
export function OnlineWhot({ snap, conn, push }: { snap: Snapshot<"whot">; conn: Connection; push: Push }) {
  const view = snap.view!;
  const seats: BoardSeat[] = snap.seats.map((s, i) => ({
    name: i === snap.you ? "You" : (s?.name ?? `Player ${i + 1}`),
    kind: s?.kind ?? "ai",
    connected: s?.connected,
  }));
  const me = snap.you >= 0 ? snap.you : null;
  const seconds = useSecondsLeft(snap);

  // Call out each move as it arrives (the same pidgin lines as offline).
  const prev = useRef<Snapshot<"whot"> | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = snap;
    if (before && snap.round !== before.round) {
      push([{ text: "New game! Oya shuffle!", sfx: "special", speak: true, tone: "info" }]);
      return;
    }
    if (!before?.view || !isNextMove(before, snap)) return;
    const callouts = whotCallouts(before.view, snap.last!, view, seats, me);
    if (callouts.length) push(callouts);
    else sfx(snap.last!.type === "draw" ? "draw" : "play");
    // seats/me derive from snap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, push]);

  const send = (move: WhotWireMove) => {
    conn.send("move", move);
    return true;
  };

  const myTurn = me !== null && !view.over && view.current === me;
  const canCatch = me !== null && !view.over && view.vulnerable !== null && view.vulnerable !== me;
  const thinking = !view.over && seats[view.current]?.kind === "ai" ? view.current : null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-3 pb-4 pt-3">
      <WhotBoard
        view={view}
        seats={seats}
        myTurn={myTurn}
        canCatch={canCatch}
        thinking={thinking}
        handLabel="Your cards"
        secondsLeft={seconds}
        onPlay={(cardId, stack, lastCard, callShape) =>
          send({ type: "play", cardId, lastCard, ...(stack.length ? { stack } : {}), ...(callShape ? { callShape } : {}) })
        }
        onDraw={() => send({ type: "draw" })}
        onCatch={(target) => send({ type: "catch", target })}
        onInvalid={(text) => push([{ text, sfx: "error", speak: false, tone: "bad" }])}
      />
      {view.over && (
        <WhotResult view={view as whot.WhotView} seats={seats} me={me}>
          <RematchButtons snap={snap} conn={conn} />
        </WhotResult>
      )}
    </main>
  );
}
