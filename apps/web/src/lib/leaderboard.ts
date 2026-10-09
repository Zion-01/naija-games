import { AccountError, supabase } from "./account";

/**
 * Leaderboards (Phase 4d). Weekly boards rank players by the Elo they gained in rated games that week (Monday to
 * Monday, Lagos time), worked out by the `weekly_leaderboard` database function. Last week's number one is the
 * "Oga of the Week". The all-time board is everyone's current rating.
 */
export type BoardGame = "whot" | "ayo";

/** One line on a board. `score` is the week's points, or the rating on the all-time board. */
export type BoardRow = { rank: number; userId: string; nickname: string; score: number; games: number; wins: number };

function need() {
  const sb = supabase();
  if (!sb) throw new AccountError("Leaderboards need accounts, and they are not set up on this server.");
  return sb;
}

const LOAD_ERROR = "We no fit load the leaderboard. Check your network and try again.";

type WeeklyRow = { rank: number; user_id: string; nickname: string; points: number; games: number; wins: number };

/** A week's board: `weeksAgo` 0 is this week, 1 is last week. Your own row is included even outside the top. */
export async function weeklyBoard(game: BoardGame, weeksAgo = 0, maxRows = 50): Promise<BoardRow[]> {
  const { data, error } = await need().rpc("weekly_leaderboard", { game, weeks_ago: weeksAgo, max_rows: maxRows });
  if (error) {
    console.error(error);
    throw new AccountError(LOAD_ERROR);
  }
  return (data as WeeklyRow[]).map((r) => ({ rank: r.rank, userId: r.user_id, nickname: r.nickname, score: r.points, games: r.games, wins: r.wins }));
}

/** Last week's number one, or null if nobody played a rated game. */
export async function ogaOfTheWeek(game: BoardGame): Promise<BoardRow | null> {
  const rows = await weeklyBoard(game, 1, 1);
  return rows.find((r) => r.rank === 1) ?? null;
}

type RatingRow = { user_id: string; rating: number; rated_games: number; wins: number; profiles: { nickname: string } | null };

/** Highest ratings in a game, among players with at least one rated game. Ratings and profiles are public. */
export async function allTimeBoard(game: BoardGame, maxRows = 50): Promise<BoardRow[]> {
  const { data, error } = await need()
    .from("ratings")
    .select("user_id, rating, rated_games, wins, profiles(nickname)")
    .eq("game", game)
    .gt("rated_games", 0)
    .order("rating", { ascending: false })
    .limit(maxRows)
    .overrideTypes<RatingRow[], { merge: false }>();
  if (error) {
    console.error(error);
    throw new AccountError(LOAD_ERROR);
  }
  return toAllTimeRows(data);
}

/** Ranks rows already sorted by rating; equal ratings share a rank (1, 2, 2, 4). */
export function toAllTimeRows(rows: RatingRow[]): BoardRow[] {
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.rating !== rows[i - 1]!.rating) rank = i + 1;
    return { rank, userId: r.user_id, nickname: r.profiles?.nickname ?? "Guest", score: r.rating, games: r.rated_games, wins: r.wins };
  });
}

/** Lagos is UTC+1 all year (no daylight saving), the same offset the database uses for its weeks. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When this week's board resets: the next Monday 00:00 in Lagos. */
export function nextReset(now: number): number {
  const lagos = now + LAGOS_OFFSET_MS;
  const midnight = Math.floor(lagos / DAY_MS) * DAY_MS;
  // getUTCDay on the shifted time is the Lagos weekday: 0 Sunday … 6 Saturday.
  const daysToMonday = ((8 - new Date(lagos).getUTCDay()) % 7) || 7;
  return midnight + daysToMonday * DAY_MS - LAGOS_OFFSET_MS;
}

/** "3 days 4 hrs", "5 hrs 20 min", "12 min": how long until the board resets. */
export function resetsIn(now: number): string {
  const ms = nextReset(now) - now;
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3_600_000);
  const minutes = Math.max(1, Math.floor((ms % 3_600_000) / 60_000));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days > 0) return `${plural(days, "day")} ${plural(hours, "hr")}`;
  if (hours > 0) return `${plural(hours, "hr")} ${minutes} min`;
  return `${minutes} min`;
}
