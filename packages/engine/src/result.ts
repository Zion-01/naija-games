export type MoveResult<S> = { ok: true; state: S } | { ok: false; error: string };

export const ok = <S>(state: S): MoveResult<S> => ({ ok: true, state });
export const fail = <S>(error: string): MoveResult<S> => ({ ok: false, error });

export type Difficulty = 'easy' | 'medium' | 'hard';
