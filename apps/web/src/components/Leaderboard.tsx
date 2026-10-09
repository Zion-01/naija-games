"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui";
import { AccountError, useAccount } from "@/lib/account";
import { allTimeBoard, ogaOfTheWeek, resetsIn, weeklyBoard, type BoardGame, type BoardRow } from "@/lib/leaderboard";

type Period = "week" | "last" | "all";

const GAME_NAMES: Record<BoardGame, string> = { whot: "Whot", ayo: "Ayo" };
const MEDALS = ["🥇", "🥈", "🥉"];

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const message = (e: unknown) => (e instanceof AccountError ? e.message : "Something spoil. Try again.");

/** /leaderboard: this week's board, last week's (and its Oga), and all-time ratings, per game. */
export function Leaderboard() {
  const account = useAccount();
  const [game, setGame] = useState<BoardGame>("whot");
  const [period, setPeriod] = useState<Period>("week");

  if (account.status === "off") {
    return (
      <Shell>
        <p className="text-center text-muted">Leaderboards need accounts, and they are not set up on this server.</p>
      </Shell>
    );
  }
  const me = account.status === "ready" ? (account.user?.id ?? null) : null;

  return (
    <Shell>
      <Segmented
        label="Game"
        value={game}
        options={[
          { value: "whot", label: "Whot" },
          { value: "ayo", label: "Ayo" },
        ]}
        onChange={setGame}
      />
      <Oga key={`oga-${game}`} game={game} />
      <Segmented
        label="Board"
        value={period}
        options={[
          { value: "week", label: "This week" },
          { value: "last", label: "Last week" },
          { value: "all", label: "All-time" },
        ]}
        onChange={setPeriod}
      />
      <Board key={`${game}-${period}`} game={game} period={period} me={me} />
      <p className="text-center text-xs text-muted">
        Only online games against other people count. Beat the computer all you like, e no go reach here.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">{children}</main>;
}

/** Last week's number one for this game. */
function Oga({ game }: { game: BoardGame }) {
  const [oga, setOga] = useState<BoardRow | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    ogaOfTheWeek(game).then(
      (row) => live && setOga(row),
      () => live && setOga(null),
    );
    return () => {
      live = false;
    };
  }, [game]);

  return (
    <section className="flex items-center gap-4 rounded-3xl bg-ochre p-5 text-black shadow-md">
      <span className="text-4xl" aria-hidden>
        👑
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wider">{GAME_NAMES[game]} Oga of the Week</p>
        {oga === undefined ? (
          <p className="text-lg font-bold opacity-60">Loading…</p>
        ) : oga ? (
          <p className="truncate text-2xl font-black">
            {oga.nickname} <span className="text-base font-bold">({signed(oga.score)} last week)</span>
          </p>
        ) : (
          <p className="font-bold">No Oga yet. Top this week&apos;s board to wear the crown on Monday.</p>
        )}
      </div>
    </section>
  );
}

function Board({ game, period, me }: { game: BoardGame; period: Period; me: string | null }) {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resets, setResets] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const load = period === "all" ? allTimeBoard(game) : weeklyBoard(game, period === "last" ? 1 : 0);
    load.then(
      (r) => live && setRows(r),
      (e: unknown) => live && setError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [game, period, attempt]);

  useEffect(() => {
    if (period !== "week") return;
    const update = () => setResets(resetsIn(Date.now()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [period]);

  const unit = period === "all" ? "rating" : "points";
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-md ring-1 ring-line">
      {period === "week" && resets && <p className="text-sm text-muted">New week in {resets} (Monday, Lagos time).</p>}
      {error ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
            className="rounded-2xl bg-background px-4 py-2 font-bold"
          >
            Try again
          </button>
        </div>
      ) : !rows ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          {period === "week" ? "Nobody don play a rated game this week. " : "Nothing here yet. "}
          <Link href={`/${game}`} className="font-bold text-accent underline">
            Find opponent for {GAME_NAMES[game]}
          </Link>{" "}
          and be the first.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {rows.map((r, i) => {
            const gap = i > 0 && r.rank > rows[i - 1]!.rank + 1 && r.userId === me;
            const mine = r.userId === me;
            return (
              <li key={r.userId} className={`flex items-center gap-3 py-2.5 ${gap ? "mt-2 border-t-2 border-dashed" : ""} ${mine ? "-mx-2 rounded-xl bg-background px-2" : ""}`}>
                <span className="w-8 shrink-0 text-center text-lg font-black">{MEDALS[r.rank - 1] ?? r.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">
                    {r.nickname}
                    {mine && <span className="text-muted"> (you)</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {r.wins}W · {r.games} {period === "all" ? "rated " : ""}game{r.games === 1 ? "" : "s"}
                  </div>
                </div>
                <span
                  className={`shrink-0 font-black ${period === "all" ? "" : r.score >= 0 ? "text-palm" : "text-[var(--card-ink)]"}`}
                  aria-label={`${r.score} ${unit}`}
                >
                  {period === "all" ? r.score : signed(r.score)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
