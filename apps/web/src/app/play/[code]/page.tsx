import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { inviteLine, normalizeCode } from "@naija/online";
import { OnlineMatch } from "@/components/online/OnlineMatch";
import { fetchRoomSummary } from "@/lib/rooms";

/** The link preview reads the live room (who's inviting, which game), so it is fetched per request. */
export async function generateMetadata({ params }: PageProps<"/play/[code]">): Promise<Metadata> {
  const code = normalizeCode((await params).code);
  const room = code ? await fetchRoomSummary(code) : null;
  const gameName = room?.game === "whot" ? "Whot" : "Ayo";
  const title = !room ? "Your guy dey wait · Naija Games" : room.quick ? `${gameName} quick match · Naija Games` : inviteLine(room.host, room.game);
  const description = room
    ? `Room ${room.code} · ${room.game === "whot" ? "Whot, Naija street rules" : "Ayo Olopon"}. Tap to play in your browser, no download.`
    : "Play Whot and Ayo online with your guys. Free in your browser.";
  return { title, description, openGraph: { title, description, siteName: "Naija Games" }, robots: { index: false } };
}

/** Rooms only exist at request time; `connection()` marks that, so the metadata above can stream. */
async function Match({ params }: { params: PageProps<"/play/[code]">["params"] }) {
  await connection();
  return <OnlineMatch code={(await params).code} />;
}

export default function PlayPage({ params }: PageProps<"/play/[code]">) {
  return (
    <Suspense fallback={<div className="ankara min-h-dvh" />}>
      <Match params={params} />
    </Suspense>
  );
}
