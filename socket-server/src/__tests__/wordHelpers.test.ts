import { describe, it, expect } from 'vitest';
import {
  buildHint,
  hintCountFor,
  hintScheduleMs,
  isCloseGuess,
  isCorrectGuess,
  levenshtein,
  pickHintIndex,
} from '../game/wordHelpers';

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('apple', 'apple')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('isCorrectGuess', () => {
  it('ignores case and surrounding/extra whitespace', () => {
    expect(isCorrectGuess('  ICE   Cream ', 'ice cream')).toBe(true);
    expect(isCorrectGuess('ice-cream', 'ice cream')).toBe(false);
  });
});

describe('isCloseGuess', () => {
  it('flags a one-letter typo on a short word', () => {
    expect(isCloseGuess('appel', 'apple')).toBe(false); // transposition = 2 edits
    expect(isCloseGuess('aple', 'apple')).toBe(true);
    expect(isCloseGuess('applr', 'apple')).toBe(true);
  });

  it('allows two edits for words of six or more letters', () => {
    expect(isCloseGuess('elefant', 'elephant')).toBe(true);
  });

  it('never flags the exact word or very short words', () => {
    expect(isCloseGuess('apple', 'apple')).toBe(false);
    expect(isCloseGuess('ha', 'hat')).toBe(true);
    expect(isCloseGuess('a', 'ox')).toBe(false);
  });

  it('rejects unrelated guesses', () => {
    expect(isCloseGuess('banana', 'apple')).toBe(false);
  });
});

describe('hints', () => {
  it('renders only revealed letters and keeps spaces', () => {
    expect(buildHint('ice cream', new Set([0, 4]))).toBe('i _ _   c _ _ _ _');
  });

  it('reveals more letters for longer words, but at most three', () => {
    expect(hintCountFor('cat')).toBe(1);
    expect(hintCountFor('guitar')).toBe(2);
    expect(hintCountFor('xylophone')).toBe(3);
  });

  it('schedules hints between 40% and 85% of the turn, in order', () => {
    const schedule = hintScheduleMs(60, 3);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]).toBeGreaterThan(60_000 * 0.4);
    expect(schedule[2]).toBeLessThan(60_000 * 0.85);
    expect([...schedule].sort((a, b) => a - b)).toEqual(schedule);
  });

  it('never reveals the final hidden letter', () => {
    expect(pickHintIndex('cat', new Set([0, 1]))).toBeNull();
    expect(pickHintIndex('cat', new Set([0]), () => 0)).toBe(1);
  });
});
