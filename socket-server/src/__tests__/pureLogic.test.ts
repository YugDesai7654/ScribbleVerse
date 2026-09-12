import { describe, it, expect } from 'vitest';
import { getPlaceholder, getRandomWords, calculateGuessPoints, WORD_LIST } from '../server';

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

  it('returns only words that exist in WORD_LIST', () => {
    const words = getRandomWords();
    for (const word of words) {
      expect(WORD_LIST).toContain(word);
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
