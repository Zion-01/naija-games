import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whot, type ayo } from '@naija/engine';
import { ayoRules, whotRules } from '../src/games';
import { Match } from '../src/match';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function whotMatch(players = 2, opts = {}) {
  const changes = vi.fn();
  const match = new Match('ABCD', whotRules({ players }), 1234, changes, opts);
  return { match, changes };
}

const join = (m: Match<any, any, any>, id: string, extra = {}) => m.join(id, { nickname: id, guestId: `guest-${id}-0000`, ...extra });

describe('seating', () => {
  it('seats players in order, deals when the last seat fills, and lets late joiners watch', () => {
    const { match } = whotMatch(2);
    expect(join(match, 'tunde')).toBe(0);
    expect(match.status).toBe('waiting');
    expect(match.host?.name).toBe('tunde');
    expect(join(match, 'bisi')).toBe(1);
    expect(match.status).toBe('playing');
    expect(join(match, 'emeka')).toBe(-1);
    expect(match.snapshotFor('emeka').you).toBe(-1);
    expect(match.summary()).toMatchObject({ code: 'ABCD', game: 'whot', host: 'tunde', seats: 2, filled: 2, status: 'playing' });
  });

  it('only sends each client their own hand', () => {
    const { match } = whotMatch(3);
    for (const id of ['a', 'b', 'c']) join(match, id);
    join(match, 'watcher');
    const state = match.state as whot.WhotState;
    for (const [id, seat] of [['a', 0], ['b', 1], ['c', 2], ['watcher', -1]] as const) {
      const json = JSON.stringify(match.snapshotFor(id));
      state.hands.forEach((hand, p) => {
        for (const card of hand) expect(json.includes(`"${card.id}"`)).toBe(p === seat);
      });
      // The market order is never sent to anybody.
      expect(json.includes(`"${state.market[0]!.id}"`)).toBe(false);
    }
  });

  it('frees a seat (and passes on host) when someone leaves before the deal', () => {
    const { match } = whotMatch(3);
    join(match, 'a');
    join(match, 'b');
    match.leave('a');
    expect(match.seats[0]).toBeNull();
    expect(match.host?.name).toBe('b');
    expect(join(match, 'c')).toBe(0);
  });

  it('lets the host fill open seats with the computer', () => {
    const { match } = whotMatch(4);
    join(match, 'a');
    join(match, 'b');
    expect(match.start('b')).toMatch(/host/);
    expect(match.start('a')).toBeNull();
    expect(match.status).toBe('playing');
    expect(match.seats.map((s) => s?.kind)).toEqual(['human', 'human', 'ai', 'ai']);
  });

  it('cleans nicknames', () => {
    const { match } = whotMatch(2);
    match.join('x', { nickname: '  <b>Ada</b>\u0000  the   Great and Mighty One ', guestId: 'guest-x-0000' });
    expect(match.seats[0]!.name).toBe('bAda/b the Great');
  });
});

describe('moves', () => {
  it('stamps moves with the sender seat, so nobody can play for another seat', () => {
    const { match } = whotMatch(2);
    join(match, 'a');
    join(match, 'b');
    join(match, 'watcher');
    expect(match.move('b', { type: 'draw', player: 0 })).toBe('No be your turn');
    expect(match.move('watcher', { type: 'draw' })).toMatch(/watch/);
    expect(match.move('a', { type: 'play', cardId: 42 })).toMatch(/no make sense/);
    expect(match.move('a', { type: 'play', cardId: 'not-mine' })).toBe('You no get that card');
    expect(match.move('a', { type: 'draw' })).toBeNull();
    expect(match.last).toEqual({ type: 'draw', player: 0 });
    expect((match.state as whot.WhotState).current).toBe(1);
  });

  it('rate-limits a client that spams moves', () => {
    const { match } = whotMatch(2, { rateLimit: 3, rateWindowMs: 1000 });
    join(match, 'a');
    join(match, 'b');
    for (let i = 0; i < 3; i++) match.move('b', { type: 'draw' });
    expect(match.move('b', { type: 'draw' })).toMatch(/No rush/);
    vi.advanceTimersByTime(1001);
    expect(match.move('b', { type: 'draw' })).toBe('No be your turn');
  });
});

describe('turn timer', () => {
  it('plays an Easy move for a human who runs out of time', () => {
    const { match } = whotMatch(2);
    join(match, 'a');
    join(match, 'b');
    const t0 = Date.now();
    expect(match.deadline).toBe(t0 + 20_000);
    vi.advanceTimersByTime(19_999);
    expect(match.last).toBeNull();
    vi.advanceTimersByTime(1);
    expect(match.last).toMatchObject({ player: 0 });
  });

  it('gives Ayo players 30 seconds, and timeouts alone still finish the game', () => {
    const match = new Match('AYOO', ayoRules(), 1, () => {});
    join(match, 'a');
    join(match, 'b');
    expect(match.deadline).toBe(Date.now() + 30_000);
    for (let i = 0; i < 400 && match.status === 'playing'; i++) vi.advanceTimersByTime(30_000);
    expect(match.status).toBe('over');
    const s = match.state as ayo.AyoState;
    expect(s.stores[0] + s.stores[1] + s.pits.reduce((a, b) => a + b, 0)).toBe(48);
    expect(match.deadline).toBeNull();
  });

  it('keeps the running clock when a catch happens mid-turn', () => {
    const { match } = whotMatch(3);
    for (const id of ['a', 'b', 'c']) join(match, id);
    const s = match.state as whot.WhotState;
    // Seat 0 is down to one card without calling it; seat 1 is on turn.
    match.state = { ...s, hands: [[s.hands[0]![0]!], s.hands[1]!, s.hands[2]!], current: 1, vulnerable: 0, turn: 5 };
    match.reconnect('a');
    const deadline = match.deadline;
    vi.advanceTimersByTime(5000);
    expect(match.move('c', { type: 'catch', target: 0 })).toBeNull();
    expect((match.state as whot.WhotState).hands[0]).toHaveLength(3);
    expect(match.deadline).toBe(deadline);
  });
});

describe('drops and takeovers', () => {
  it('hands a leaver’s seat to the computer, and gives it back when they return', () => {
    const { match } = whotMatch(2, { aiDelayMs: 900 });
    join(match, 'a');
    join(match, 'b');
    match.drop('a');
    expect(match.snapshotFor('b').seats[0]).toMatchObject({ connected: false, kind: 'human' });
    match.leave('a');
    expect(match.seats[0]).toMatchObject({ kind: 'ai', connected: false });
    expect(match.deadline).toBeNull();
    vi.advanceTimersByTime(900);
    expect(match.last).toMatchObject({ player: 0 });

    // Same device, new connection: they get their seat back.
    expect(match.join('a2', { nickname: 'a', guestId: 'guest-a-0000' })).toBe(0);
    expect(match.seats[0]).toMatchObject({ kind: 'human', connected: true, sessionId: 'a2' });
  });

  it('lets a computer seat catch a forgotten "Last card"', () => {
    const { match } = whotMatch(3);
    join(match, 'a');
    join(match, 'b');
    match.start('a');
    const s = match.state as whot.WhotState;
    match.state = { ...s, hands: [[s.hands[0]![0]!], s.hands[1]!, s.hands[2]!], current: 1, vulnerable: 0, turn: 3 };
    match.reconnect('a');
    vi.advanceTimersByTime(1300);
    expect(match.last).toEqual({ type: 'catch', player: 2, target: 0 });
    expect((match.state as whot.WhotState).hands[0]).toHaveLength(3);
  });
});

describe('rematch', () => {
  it('deals again once every human asks, with the next player starting', () => {
    const match = new Match('AYOO', ayoRules(), 1, () => {});
    join(match, 'a');
    join(match, 'b');
    match.status = 'over';
    match.requestRematch('a');
    expect(match.round).toBe(0);
    expect(match.snapshotFor('b').rematch).toEqual([0]);
    match.requestRematch('b');
    expect(match.round).toBe(1);
    expect(match.status).toBe('playing');
    expect((match.state as ayo.AyoState).current).toBe(1);
  });

  it("doesn't wait for a player who left", () => {
    const match = new Match('AYOO', ayoRules(), 1, () => {});
    join(match, 'a');
    join(match, 'b');
    match.status = 'over';
    match.requestRematch('a');
    match.leave('b');
    expect(match.status).toBe('playing');
  });
});
