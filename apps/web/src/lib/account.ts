import { createClient, type AuthError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { cleanNickname } from "@naija/online";
import { captchaToken } from "./captcha";

/**
 * Accounts (Phase 4). Everyone who plays online gets a Supabase session: first an anonymous one (a guest), which
 * they can later save by linking Google. The game server identifies players by the session's
 * access token, and saves online results against the user id.
 *
 * Without NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (local development, e2e tests) there are
 * no accounts: the game server falls back to the device's guest id, and nothing is saved.
 */
let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (typeof window === "undefined") return null;
  client = url && key ? createClient(url, key, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } }) : null;
  return client;
}

/** A message we can show to the player as it is. */
export class AccountError extends Error {}

export type AccountState = { status: "off" } | { status: "loading" } | { status: "ready"; user: User | null };

let state: AccountState = { status: "loading" };
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  const sb = supabase();
  if (!sb) {
    state = { status: "off" };
    return;
  }
  // Fires once with the stored session (after any OAuth code in the URL is exchanged), then on every change.
  sb.auth.onAuthStateChange((_event, session) => {
    state = { status: "ready", user: session?.user ?? null };
    listeners.forEach((l) => l());
  });
}

const serverState: AccountState = { status: "loading" };

/** The signed-in user (an anonymous guest until they link Google). */
export function useAccount(): AccountState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      start();
      return () => listeners.delete(listener);
    },
    () => {
      start();
      return state;
    },
    () => serverState,
  );
}

export function isGuest(user: User | null): boolean {
  return !user || user.is_anonymous === true;
}

/** How the account is saved, for the profile page. */
export function linkedWith(user: User | null): { google: string | null } {
  const google = user?.identities?.find((i) => i.provider === "google");
  return { google: google ? String(google.identity_data?.email ?? "Google") : null };
}

/**
 * The access token to send to the game server, signing in as a guest first if needed. Returns null when accounts
 * are off. Call from event handlers only.
 */
export async function accessToken(nickname: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (data.session) {
    void saveNickname(nickname);
    return data.session.access_token;
  }
  let token: string | undefined;
  try {
    token = await captchaToken();
  } catch (e) {
    console.error(e);
    throw new AccountError("We no fit confirm say you be human. Refresh the page and try again.");
  }
  const { data: signed, error } = await sb.auth.signInAnonymously({ options: { data: { nickname: cleanNickname(nickname) }, captchaToken: token } });
  if (error || !signed.session) throw friendly(error, "We no fit sign you in. Check your network and try again.") ?? new AccountError("We no fit sign you in.");
  lastSavedNickname = cleanNickname(nickname);
  return signed.session.access_token;
}

let lastSavedNickname: string | null = null;

/** Keeps the profile's nickname in step with the one typed at the table. */
export async function saveNickname(raw: string) {
  const sb = supabase();
  const nickname = cleanNickname(raw, "");
  if (!sb || !nickname || nickname === lastSavedNickname) return;
  const { data } = await sb.auth.getSession();
  const id = data.session?.user.id;
  if (!id) return;
  lastSavedNickname = nickname;
  const { error } = await sb.from("profiles").update({ nickname }).eq("id", id);
  if (error) {
    lastSavedNickname = null;
    console.error("Saving the nickname failed", error);
  }
}

function friendly(error: AuthError | null, fallback: string): AccountError | null {
  if (!error) return null;
  console.error(error);
  switch (error.code) {
    case "identity_already_exists":
      return new AccountError("That Google account don already get its own profile. Sign in with it instead.");
    case "over_request_rate_limit":
      return new AccountError("Too many tries. Wait small, then try again.");
    case "captcha_failed":
      return new AccountError("We no fit confirm say you be human. Refresh the page and try again.");
    case "manual_linking_disabled":
    case "provider_disabled":
    case "anonymous_provider_disabled":
      return new AccountError("This sign-in option never ready yet. Try another one.");
    default:
      return new AccountError(fallback);
  }
}

function need(): SupabaseClient {
  const sb = supabase();
  if (!sb) throw new AccountError("Accounts are not set up on this server.");
  return sb;
}

const back = () => `${window.location.origin}/profile`;

/** Saves the guest's account (and its history) by linking Google. Leaves the page for Google, then returns to /profile. */
export async function linkGoogle() {
  const sb = need();
  // A guest who never played has no session yet; give them one to link to.
  if (!(await sb.auth.getSession()).data.session) await accessToken("");
  const { error } = await sb.auth.linkIdentity({ provider: "google", options: { redirectTo: back() } });
  const e = friendly(error, "Google sign-in no work. Try again.");
  if (e) throw e;
}

/** Signs in to an existing account with Google (for a new phone or browser). */
export async function signInWithGoogle() {
  const { error } = await need().auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } });
  const e = friendly(error, "Google sign-in no work. Try again.");
  if (e) throw e;
}

export async function signOut() {
  const { error } = await need().auth.signOut();
  const e = friendly(error, "We no fit sign you out. Try again.");
  if (e) throw e;
}

export type GameResult = "won" | "lost" | "drawn";

/** One of your online games, newest first. */
export type PlayedGame = {
  id: string;
  game: "whot" | "ayo";
  endedAt: string;
  result: GameResult;
  abandoned: boolean;
  /** Your rating before and after, if the game was rated (two or more players with accounts). */
  rating: { before: number; after: number } | null;
  /** Everyone else at the table. */
  others: { name: string; kind: "human" | "ai"; result: GameResult }[];
};

type MatchRow = {
  id: string;
  game: "whot" | "ayo";
  ended_at: string;
  match_players: {
    seat: number;
    user_id: string | null;
    name: string;
    kind: "human" | "ai";
    result: GameResult;
    abandoned: boolean;
    rating_before: number | null;
    rating_after: number | null;
  }[];
};

/** Your recent online games. Row-level security only returns games you sat in. */
export async function recentGames(userId: string, limit = 20): Promise<PlayedGame[]> {
  const { data, error } = await need()
    .from("matches")
    .select("id, game, ended_at, match_players(seat, user_id, name, kind, result, abandoned, rating_before, rating_after)")
    .order("ended_at", { ascending: false })
    .limit(limit)
    .overrideTypes<MatchRow[], { merge: false }>();
  if (error) {
    console.error(error);
    throw new AccountError("We no fit load your games. Try again.");
  }
  return toPlayedGames(data, userId);
}

/** Your rating and all-time online record in one game. */
export type Rating = { rating: number; ratedGames: number; games: number; wins: number; losses: number; draws: number };

/** Your ratings per game; a game you never played online is missing. Ratings are public, so this works for anyone. */
export async function ratingsFor(userId: string): Promise<Partial<Record<"whot" | "ayo", Rating>>> {
  const { data, error } = await need()
    .from("ratings")
    .select("game, rating, rated_games, games, wins, losses, draws")
    .eq("user_id", userId)
    .overrideTypes<
      { game: "whot" | "ayo"; rating: number; rated_games: number; games: number; wins: number; losses: number; draws: number }[],
      { merge: false }
    >();
  if (error) {
    console.error(error);
    throw new AccountError("We no fit load your rating. Try again.");
  }
  return Object.fromEntries(data.map(({ game, rated_games, ...r }) => [game, { ...r, ratedGames: rated_games }]));
}

/** Ratings settle after this many rated games (the database's K-factor drops then). */
export const PROVISIONAL_GAMES = 20;

export function toPlayedGames(rows: MatchRow[], userId: string): PlayedGame[] {
  return rows.flatMap((row) => {
    const players = [...row.match_players].sort((a, b) => a.seat - b.seat);
    const me = players.find((p) => p.user_id === userId);
    if (!me) return [];
    return [
      {
        id: row.id,
        game: row.game,
        endedAt: row.ended_at,
        result: me.result,
        abandoned: me.abandoned,
        rating: me.rating_before !== null && me.rating_after !== null ? { before: me.rating_before, after: me.rating_after } : null,
        others: players.filter((p) => p !== me).map(({ name, kind, result }) => ({ name, kind, result })),
      },
    ];
  });
}
