"use client";

import { useEffect, useRef } from "react";
import { ayo } from "@naija/engine";
import type { Snapshot } from "@naija/online";
import { AyoBoard, PlayerBar, useSowAnimation } from "@/components/ayo/AyoBoard";
import { Modal, type useCallouts } from "@/components/ui";
import { ayoCallouts } from "@/lib/ayo-session";
import { isNextMove, type Connection } from "@/lib/online";
import { LINES } from "@/lib/voice";
import { RematchButtons, useSecondsLeft } from "./shared";

type Push = ReturnType<typeof useCallouts>["push"];

/** A server-run Ayo game. Each new sow is animated from the previous board before the captures land. */
export function OnlineAyo({ snap, conn, push }: { snap: Snapshot<"ayo">; conn: Connection; push: Push }) {
  const view = snap.view!;
  const me = snap.you === 0 || snap.you === 1 ? snap.you : null;
  const names = [0, 1].map((i) => (i === me ? "You" : (snap.seats[i]?.name ?? `Player ${i + 1}`))) as [string, string];
  const seconds = useSecondsLeft(snap);

  const { anim, start } = useSowAnimation(({ prev, move, next }) => push(ayoCallouts(prev, move, next, names, me)));

  const prevSnap = useRef<Snapshot<"ayo"> | null>(null);
  useEffect(() => {
    const before = prevSnap.current;
    prevSnap.current = snap;
    if (before?.view && isNextMove(before, snap)) start(before.view, snap.last!, snap.view!);
  }, [snap, start]);

  // While seeds are moving, show the board from before the move; the snapshot's board lands with the last seed.
  const shown = anim ? anim.prev : view;
  const myTurn = me !== null && !view.over && view.current === me && !anim;
  const legal = new Set(myTurn ? ayo.legalMoves(view, me).map((m) => m.pit) : []);
  const bottom = me ?? 0;
  const top = (1 - bottom) as 0 | 1;

  const label = (p: 0 | 1) => {
    if (shown.over || shown.current !== p || anim) return "";
    if (snap.seats[p]?.kind === "ai") return "thinking…";
    const clock = seconds !== null ? ` · ${seconds}s` : "";
    return (p === me ? LINES.yourTurn : "Their turn") + clock;
  };
  const bar = (p: 0 | 1) => (
    <PlayerBar
      name={names[p]}
      store={shown.stores[p]}
      active={!shown.over && shown.current === p}
      label={label(p)}
      ai={snap.seats[p]?.kind === "ai"}
      offline={snap.seats[p]?.connected === false}
    />
  );

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-3 py-4">
      {bar(top)}
      <AyoBoard
        state={shown}
        anim={anim}
        names={names}
        bottom={bottom}
        canSow={legal}
        onSow={(pit) => conn.send("move", { type: "sow", pit })}
      />
      {bar(bottom)}
      {me === null && <p className="text-center text-sm text-muted">You dey watch. 👀</p>}

      {view.over && !anim && (
        <Modal>
          <h2 className="text-3xl font-black">
            {view.winner === null ? "Na draw 🤝" : me === null ? `${names[view.winner]} win! 🎉` : view.winner === me ? "You win! 🎉" : "E don cast 😩"}
          </h2>
          <p className="mt-2 text-lg">
            {names[0]} <b>{view.stores[0]}</b> · {names[1]} <b>{view.stores[1]}</b>
          </p>
          <div className="mt-5">
            <RematchButtons snap={snap} conn={conn} />
          </div>
        </Modal>
      )}
    </main>
  );
}
