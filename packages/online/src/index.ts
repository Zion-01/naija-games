import { ayo, whot } from '@naija/engine';

/**
 * The wire protocol between the game server (apps/server) and the web client (apps/web).
 * Clients send moves without a `player` field; the server fills in the sender's seat, checks the move
 * with the engine, and sends every client a `Snapshot` built from the engine's redacted `viewFor`.
 */
export type GameId = 'whot' | 'ayo';

/** Seconds a human has to move before the server plays an Easy-AI move for them. */
export const TURN_SECONDS: Record<GameId, number> = { whot: 20, ayo: 30 };
/** Seconds a dropped player has to come back before the computer takes their seat. */
export const RECONNECT_SECONDS = 60;
export const MAX_SPECTATORS = 8;

/** Room codes: four letters, without I and O so they can't be misread as 1 and 0. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function randomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** Upper-cases a typed or linked code and returns it if it is well formed. */
export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

export const NICKNAME_MAX = 16;

/** Trims a nickname to something safe to show to other players. */
export function cleanNickname(raw: unknown, fallback = 'Guest'): string {
  if (typeof raw !== 'string') return fallback;
  const name = raw
    .replace(/[\p{C}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...name].slice(0, NICKNAME_MAX).join('').trim() || fallback;
}

export type SeatInfo = {
  name: string;
  /** `ai` for computer seats, including a human seat the computer took over. */
  kind: 'human' | 'ai';
  connected: boolean;
  host: boolean;
};

export type RoomStatus = 'waiting' | 'playing' | 'over';

export type WhotRoomOptions = { players: number; handSize: number };

/**
 * Sent with `create` and `joinById`. Players are identified by their Supabase access token (`client.auth.token`).
 * `guestId` is only used by a server running without Supabase (development): a random device secret that owns the seat.
 */
export type JoinOptions = { nickname: string; guestId?: string; spectate?: boolean };
export type CreateOptions = JoinOptions & { whot?: Partial<WhotRoomOptions> };

export type WhotWireMove =
  | { type: 'play'; cardId: string; stack?: string[]; callShape?: whot.CallableShape; lastCard?: boolean }
  | { type: 'draw' }
  | { type: 'catch'; target: number };
export type AyoWireMove = { type: 'sow'; pit: number };

type ViewOf<G extends GameId> = G extends 'whot' ? whot.WhotView : ayo.AyoState;
type MoveOf<G extends GameId> = G extends 'whot' ? whot.WhotMove : ayo.AyoMove;

/** A rated seat's Elo before and after a finished game. */
export type RatingChange = { seat: number; before: number; after: number };

/** Everything one client sees, sent after every change. */
export type Snapshot<G extends GameId = GameId> = {
  game: G;
  code: string;
  status: RoomStatus;
  /** `null` is an open seat. */
  seats: (SeatInfo | null)[];
  /** Your seat, or -1 when you are watching. */
  you: number;
  spectators: number;
  /** Your redacted view of the game, or null before it starts. */
  view: ViewOf<G> | null;
  /** The move that produced this view, for callouts and animation. */
  last: MoveOf<G> | null;
  /** Moves played this round. When it goes up, `last` is a new move (other snapshots are joins, drops and so on). */
  moves: number;
  /** Epoch ms when the server will play for the seat on turn, if a human is on turn. */
  deadline: number | null;
  /** Seats that have asked for a rematch. */
  rematch: number[];
  /** Counts games played in this room; a rematch starts the next round. */
  round: number;
  /** Server clock when the snapshot was made, so clients can correct the deadline for clock skew. */
  now: number;
  /**
   * Rating changes for the game that just ended, once the server has saved it. Null before then, and for games
   * that aren't rated (fewer than two players with accounts).
   */
  ratings: RatingChange[] | null;
};

/** Public facts about a room, served at GET /rooms/:code for invite pages and link previews. */
export type RoomSummary = {
  code: string;
  game: GameId;
  host: string;
  seats: number;
  filled: number;
  status: RoomStatus;
};

/**
 * Message types, by direction. Client → server: `move` (a wire move), `start` (host only, before the game:
 * fill the open seats with the computer and deal), `rematch`. Server → client: `snapshot`, `error`.
 */
export const MSG = { move: 'move', start: 'start', rematch: 'rematch', snapshot: 'snapshot', error: 'error' } as const;
export type ErrorMessage = { text: string };

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Validates an untrusted Whot move and stamps it with the sender's seat. The engine checks the rules. */
export function parseWhotMove(raw: unknown, seat: number, players: number): whot.WhotMove | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'draw':
      return { type: 'draw', player: seat };
    case 'catch':
      return isInt(m.target, 0, players - 1) ? { type: 'catch', player: seat, target: m.target } : null;
    case 'play': {
      const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 12;
      if (!isId(m.cardId)) return null;
      // At most five cards share a number, so a stack adds at most four.
      if (m.stack !== undefined && !(Array.isArray(m.stack) && m.stack.length <= 4 && m.stack.every(isId))) return null;
      if (m.callShape !== undefined && !whot.CALLABLE_SHAPES.includes(m.callShape as whot.CallableShape)) return null;
      if (m.lastCard !== undefined && typeof m.lastCard !== 'boolean') return null;
      const move: whot.WhotMove = { type: 'play', player: seat, cardId: m.cardId, lastCard: m.lastCard === true };
      if (Array.isArray(m.stack) && m.stack.length > 0) move.stack = m.stack.slice();
      if (m.callShape !== undefined) move.callShape = m.callShape as whot.CallableShape;
      return move;
    }
    default:
      return null;
  }
}

export function parseAyoMove(raw: unknown, seat: number): ayo.AyoMove | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== 'sow' || !isInt(m.pit, 0, ayo.PITS - 1) || (seat !== 0 && seat !== 1)) return null;
  return { type: 'sow', player: seat, pit: m.pit };
}

/** The share text for an invite: "Tunde don challenge you for Whot". */
export function inviteLine(host: string, game: GameId): string {
  return `${host} don challenge you for ${game === 'whot' ? 'Whot' : 'Ayo'}!`;
}
