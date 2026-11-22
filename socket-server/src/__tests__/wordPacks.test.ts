import { describe, it, expect } from 'vitest';
import { buildWordPool, CATEGORIES, MIXED_WORDS, pickWordOptions, WORD_PACKS } from '../game/words';

describe('word packs', () => {
  it('has at least 60 drawable, unique, lowercase words in every category', () => {
    for (const [category, words] of Object.entries(WORD_PACKS)) {
      expect(words.length, category).toBeGreaterThanOrEqual(60);
      expect(new Set(words).size, category).toBe(words.length);
      for (const word of words) expect(word, category).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
  });

  it('offers mixed plus every pack as a category', () => {
    expect(CATEGORIES).toEqual(['mixed', ...Object.keys(WORD_PACKS)]);
    expect(MIXED_WORDS.length).toBeGreaterThan(300);
  });
});

describe('buildWordPool', () => {
  it('uses only the chosen pack by default', () => {
    expect(buildWordPool('animals')).toEqual([...WORD_PACKS.animals]);
  });

  it('mixes custom words into the pack without duplicates', () => {
    const pool = buildWordPool('food', ['rocket', 'pizza']);
    expect(pool).toContain('rocket');
    expect(pool.filter((w) => w === 'pizza')).toHaveLength(1);
    expect(pool.length).toBe(WORD_PACKS.food.length + 1);
  });

  it('uses only custom words when asked and there are enough of them', () => {
    expect(buildWordPool('food', ['rocket', 'comet', 'planet'], true)).toEqual(['rocket', 'comet', 'planet']);
  });

  it('falls back to the pack when there are too few custom words to fill a turn', () => {
    expect(buildWordPool('food', ['rocket'], true)).toContain('pizza');
  });
});

describe('pickWordOptions', () => {
  it('returns three distinct words from the pool', () => {
    for (let i = 0; i < 25; i++) {
      const options = pickWordOptions(MIXED_WORDS, new Set());
      expect(new Set(options).size).toBe(3);
      options.forEach((w) => expect(MIXED_WORDS).toContain(w));
    }
  });

  it('never offers a word already drawn this game while unused words remain', () => {
    const pool = ['a1', 'b2', 'c3', 'd4', 'e5'].map((w) => w.replace(/\d/, ''));
    const used = new Set(['a', 'b']);
    for (let i = 0; i < 25; i++) {
      expect(pickWordOptions(pool, used).sort()).toEqual(['c', 'd', 'e']);
    }
  });

  it('allows repeats only once too few unused words remain', () => {
    const options = pickWordOptions(['a', 'b', 'c'], new Set(['a']));
    expect(options.sort()).toEqual(['a', 'b', 'c']);
  });
});
