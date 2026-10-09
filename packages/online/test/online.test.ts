import { describe, expect, it } from 'vitest';
import { createRng } from '@naija/engine';
import { cleanNickname, inviteLine, normalizeCode, parseAyoMove, parseWhotMove, randomCode } from '../src';

describe('room codes', () => {
  it('generates four unambiguous letters and normalizes typed codes', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) expect(randomCode(rng)).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(normalizeCode(' abcd ')).toBe('ABCD');
    expect(normalizeCode('AB1D')).toBeNull();
    expect(normalizeCode('ABIO')).toBeNull();
    expect(normalizeCode('ABCDE')).toBeNull();
  });
});

describe('nicknames', () => {
  it('trims, strips markup and control characters, and caps the length', () => {
    expect(cleanNickname('  Tunde   B ')).toBe('Tunde B');
    expect(cleanNickname('<script>')).toBe('script');
    expect(cleanNickname('​\u0007')).toBe('Guest');
    expect(cleanNickname(42)).toBe('Guest');
    expect([...cleanNickname('🔥'.repeat(30))]).toHaveLength(16);
  });
});

describe('wire moves', () => {
  it('stamps the sender seat and ignores any player field from the client', () => {
    expect(parseWhotMove({ type: 'draw', player: 3 }, 1, 2)).toEqual({ type: 'draw', player: 1 });
    expect(parseWhotMove({ type: 'play', cardId: 'star-7', lastCard: true }, 0, 2)).toEqual({
      type: 'play',
      player: 0,
      cardId: 'star-7',
      lastCard: true,
    });
    expect(parseWhotMove({ type: 'play', cardId: 'whot-20-1', callShape: 'star' }, 0, 2)).toMatchObject({ callShape: 'star' });
    expect(parseWhotMove({ type: 'play', cardId: 'star-7', stack: ['cross-7'] }, 0, 2)).toMatchObject({ stack: ['cross-7'] });
    expect(parseAyoMove({ type: 'sow', pit: 7, player: 0 }, 1)).toEqual({ type: 'sow', player: 1, pit: 7 });
  });

  it('rejects malformed moves', () => {
    for (const bad of [null, 'draw', {}, { type: 'hack' }, { type: 'play' }, { type: 'play', cardId: 'x'.repeat(40) },
      { type: 'play', cardId: 'a', callShape: 'whot' }, { type: 'play', cardId: 'a', lastCard: 'yes' }, { type: 'catch', target: 5 },
      { type: 'catch', target: 0.5 }, { type: 'play', cardId: 'a', stack: 'b' }, { type: 'play', cardId: 'a', stack: [1] },
      { type: 'play', cardId: 'a', stack: ['b', 'c', 'd', 'e', 'f'] }]) {
      expect(parseWhotMove(bad, 0, 4)).toBeNull();
    }
    for (const bad of [{ type: 'sow', pit: 12 }, { type: 'sow', pit: -1 }, { type: 'sow', pit: '3' }, { type: 'draw' }]) {
      expect(parseAyoMove(bad, 0)).toBeNull();
    }
    expect(parseAyoMove({ type: 'sow', pit: 3 }, -1)).toBeNull();
  });

  it('writes the invite line', () => {
    expect(inviteLine('Tunde', 'whot')).toBe('Tunde don challenge you for Whot!');
  });
});
