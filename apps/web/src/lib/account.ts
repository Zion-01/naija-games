import { createClient, type AuthError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { cleanNickname } from "@naija/online";

/**
 * Accounts (Phase 4). Everyone who plays online gets a Supabase session: first an anonymous one (a guest), which
 * they can later save by linking Google or a phone number. The game server identifies players by the session's
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

/** The signed-in user (an anonymous guest until they link Google or a phone). */
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
export function linkedWith(user: User | null): { google: string | null; phone: string | null } {
  const google = user?.identities?.find((i) => i.provider === "google");
  return {
    google: google ? String(google.identity_data?.email ?? "Google") : null,
    phone: user?.phone ? `+${user.phone.replace(/^\+/, "")}` : null,
  };
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
  const { data: signed, error } = await sb.auth.signInAnonymously({ options: { data: { nickname: cleanNickname(nickname) } } });
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

/** Nigerian numbers as people type them (0803…, 803…, 234803…, +234 803…) → E.164. Other countries need a leading +. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "");
  let e164: string;
  if (digits.startsWith("+")) e164 = digits;
  else if (digits.startsWith("234")) e164 = `+${digits}`;
  else if (digits.startsWith("0")) e164 = `+234${digits.slice(1)}`;
  else e164 = `+234${digits}`;
  if (!/^\+\d{8,15}$/.test(e164)) return null;
  if (e164.startsWith("+234") && e164.length !== 14) return null;
  return e164;
}

function friendly(error: AuthError | null, fallback: string): AccountError | null {
  if (!error) return null;
  console.error(error);
  switch (error.code) {
    case "identity_already_exists":
      return new AccountError("That Google account don already get its own profile. Sign in with it instead.");
    case "phone_exists":
      return new AccountError("That number don already get its own profile. Sign in with it instead.");
    case "otp_expired":
    case "invalid_credentials":
      return new AccountError("That code no correct or e don expire. Try again.");
    case "over_sms_send_rate_limit":
    case "over_request_rate_limit":
      return new AccountError("Too many tries. Wait small, then try again.");
    case "sms_send_failed":
      return new AccountError("We no fit send the SMS. Check the number.");
    case "manual_linking_disabled":
    case "provider_disabled":
    case "phone_provider_disabled":
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

/**
 * Phone, step 1: texts a code. `link` saves the current guest with this number; otherwise it signs in to the
 * account that already has it.
 */
export async function sendPhoneCode(phone: string, link: boolean) {
  const sb = need();
  if (link) {
    if (!(await sb.auth.getSession()).data.session) await accessToken("");
    const { error } = await sb.auth.updateUser({ phone });
    const e = friendly(error, "We no fit send the code. Try again.");
    if (e) throw e;
  } else {
    const { error } = await sb.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
    const e = friendly(error, "We no fit send the code. Is this number saved with us?");
    if (e) throw e;
  }
}

/** Phone, step 2: checks the code from the SMS. */
export async function verifyPhoneCode(phone: string, token: string, link: boolean) {
  const { error } = await need().auth.verifyOtp({ phone, token: token.trim(), type: link ? "phone_change" : "sms" });
  const e = friendly(error, "That code no work. Try again.");
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
  /** Everyone else at the table. */
  others: { name: string; kind: "human" | "ai"; result: GameResult }[];
};

type MatchRow = {
  id: string;
  game: "whot" | "ayo";
  ended_at: string;
  match_players: { seat: number; user_id: string | null; name: string; kind: "human" | "ai"; result: GameResult; abandoned: boolean }[];
};

/** Your recent online games. Row-level security only returns games you sat in. */
export async function recentGames(userId: string, limit = 20): Promise<PlayedGame[]> {
  const { data, error } = await need()
    .from("matches")
    .select("id, game, ended_at, match_players(seat, user_id, name, kind, result, abandoned)")
    .order("ended_at", { ascending: false })
    .limit(limit)
    .overrideTypes<MatchRow[], { merge: false }>();
  if (error) {
    console.error(error);
    throw new AccountError("We no fit load your games. Try again.");
  }
  return toPlayedGames(data, userId);
}

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
        others: players.filter((p) => p !== me).map(({ name, kind, result }) => ({ name, kind, result })),
      },
    ];
  });
}
