export type Shape = 'circle' | 'triangle' | 'cross' | 'square' | 'star' | 'whot';
export type CallableShape = Exclude<Shape, 'whot'>;

export type Card = { id: string; shape: Shape; number: number };

export const CALLABLE_SHAPES: CallableShape[] = ['circle', 'triangle', 'cross', 'square', 'star'];

const NUMBERS: Record<CallableShape, number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
};

/** The standard 54-card Nigerian Whot deck. */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const shape of CALLABLE_SHAPES) {
    for (const number of NUMBERS[shape]) cards.push({ id: `${shape}-${number}`, shape, number });
  }
  for (let i = 1; i <= 5; i++) cards.push({ id: `whot-20-${i}`, shape: 'whot', number: 20 });
  return cards;
}

export const HOLD_ON = 1;
export const PICK_TWO = 2;
export const PICK_THREE = 5;
export const SUSPENSION = 8;
export const GENERAL_MARKET = 14;
export const WHOT = 20;

const SPECIALS = new Set([HOLD_ON, PICK_TWO, PICK_THREE, SUSPENSION, GENERAL_MARKET, WHOT]);
export const isSpecial = (card: Card) => SPECIALS.has(card.number);

/** Points a card counts for when the market finishes. Stars count double. */
export const cardValue = (card: Card) => (card.shape === 'star' ? card.number * 2 : card.number);
