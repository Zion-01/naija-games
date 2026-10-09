import type { RoomSummary } from "@naija/online";

/** Public facts about a room from the game server, for invite pages and link previews. Null if it's gone or unreachable. */
export async function fetchRoomSummary(code: string): Promise<RoomSummary | null> {
  const base = (process.env.GAME_SERVER_URL ?? process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:2567").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rooms/${code}`, { signal: AbortSignal.timeout(2500) });
    return res.ok ? ((await res.json()) as RoomSummary) : null;
  } catch {
    return null;
  }
}
