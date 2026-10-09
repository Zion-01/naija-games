import type { CallableShape, Card } from './deck';

export type WhotOptions = {
  players: number; // 2–4
  handSize?: number; // 5 or 6, default 5
};

/** A Pick Two / Pick Three chain the next player must answer or pay. */
export type PendingPick = { number: 2 | 5; amount: number };

export type WhotState = {
  players: number;
  hands: Card[][];
  market: Card[];
  /** Played cards; the last one is on top. */
  pile: Card[];
  current: number;
  /** Shape named with the last Whot 20, if the top card is a 20. */
  calledShape: CallableShape | null;
  pending: PendingPick | null;
  /** Player sitting on one card without having called "Last card"; others can catch them until their next turn. */
  vulnerable: number | null;
  over: boolean;
  winners: number[];
  endReason: 'checkup' | 'market' | null;
  /** Hand totals when the game ended by counting (market finished). */
  counts: number[] | null;
  turn: number;
};

export type WhotMove =
  | {
      type: 'play';
      player: number;
      /** The lead card: it must match the top of the pile (or answer a pending Pick). */
      cardId: string;
      /** More cards of the same number, played in order on top of the lead in the same turn. The last one ends up on top. */
      stack?: readonly string[];
      /** Needed when the cards are Whots: one call for the whole stack. */
      callShape?: CallableShape;
      lastCard?: boolean;
    }
  | { type: 'draw'; player: number }
  | { type: 'catch'; player: number; target: number };

/** What one seat is allowed to see. `me` is -1 for spectators. */
export type WhotView = Omit<WhotState, 'hands' | 'market'> & {
  me: number;
  myHand: Card[];
  handCounts: number[];
  marketCount: number;
  top: Card;
  /** Every hand is revealed once the game is over. */
  revealedHands: Card[][] | null;
};
