import { describe, it, expect } from 'vitest';
import { getPlaceholder, getRandomWords, calculateGuessPoints } from '../server';
import { MIXED_WORDS } from '../game/words';
import { drawingOrderFor, shuffle } from '../game/turnOrder';

describe('getPlaceholder', () => {
  it('replaces each letter with an underscore', () => {
    expect(getPlaceholder('cat')).toBe('_ _ _');
  });

  it('preserves spaces between words', () => {
    expect(getPlaceholder('ice cream')).toBe('_ _ _   _ _ _ _ _');
  });

  it('returns an empty string for an empty word', () => {
    expect(getPlaceholder('')).toBe('');
  });
});

describe('getRandomWords', () => {
  it('returns exactly 3 words', () => {
    expect(getRandomWords()).toHaveLength(3);
  });

  it('returns only words from the mixed pack', () => {
    const words = getRandomWords();
    for (const word of words) {
      expect(MIXED_WORDS).toContain(word);
    }
  });

  it('never returns duplicate words within a single call', () => {
    // Randomized, so run it several times to reduce flakiness risk.
    for (let i = 0; i < 25; i++) {
      const words = getRandomWords();
      expect(new Set(words).size).toBe(words.length);
    }
  });
});

describe('calculateGuessPoints', () => {
  it('awards the base 50 points plus a time-remaining bonus', () => {
    expect(calculateGuessPoints(60, 0)).toBe(50 + 60 * 5);
  });

  it('awards only the base 50 points once the round time has fully elapsed', () => {
    expect(calculateGuessPoints(60, 60)).toBe(50);
  });

  it('never goes below the base 50 points even if elapsed exceeds timePerRound', () => {
    expect(calculateGuessPoints(60, 999)).toBe(50);
  });

  it('scales down linearly as more time elapses', () => {
    const early = calculateGuessPoints(60, 10);
    const late = calculateGuessPoints(60, 50);
    expect(early).toBeGreaterThan(late);
  });
});

describe('drawingOrderFor', () => {
  it('leaves out disconnected seats', () => {
    const order = drawingOrderFor([{ id: 'a', connected: true }, { id: 'b', connected: false }, { id: 'c', connected: true }]);
    expect(order.sort()).toEqual(['a', 'c']);
  });
  it('puts each player first about equally often', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6000; i++) counts[drawingOrderFor(['a', 'b', 'c'].map((id) => ({ id, connected: true })))[0]]++;
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(1800); // 2000 +/- 10%
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input);
    expect(out.sort()).toEqual([1, 2, 3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
  });
});
