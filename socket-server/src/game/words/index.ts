import { ACTIONS } from './actions';
import { ANIMALS } from './animals';
import { FOOD } from './food';
import { MOVIES } from './movies';
import { OBJECTS } from './objects';
import { PLACES } from './places';

/** Every themed pack. `mixed` (the default) draws from all of them. */
export const WORD_PACKS = {
  animals: ANIMALS,
  food: FOOD,
  objects: OBJECTS,
  places: PLACES,
  actions: ACTIONS,
  movies: MOVIES,
} as const;

export const CATEGORIES = ['mixed', ...Object.keys(WORD_PACKS)] as [
  'mixed',
  ...(keyof typeof WORD_PACKS)[],
];
export type Category = 'mixed' | keyof typeof WORD_PACKS;

export const MIXED_WORDS: readonly string[] = [...new Set(Object.values(WORD_PACKS).flat())];

/** Smallest custom list that can fill one turn's choice of words on its own. */
export const WORD_OPTION_COUNT = 3;

export function packFor(category: Category): readonly string[] {
  return category === 'mixed' ? MIXED_WORDS : WORD_PACKS[category];
}

/**
 * The words a room draws from. Custom words are mixed into the chosen pack,
 * or used on their own when the host asked for that and there are enough of
 * them to offer a full set of options.
 */
export function buildWordPool(category: Category, customWords: readonly string[] = [], customOnly = false): string[] {
  if (customOnly && customWords.length >= WORD_OPTION_COUNT) return [...new Set(customWords)];
  return [...new Set([...packFor(category), ...customWords])];
}

/**
 * Picks distinct word options, avoiding words already drawn this game. Falls
 * back to the full pool only when too few unused words remain, so a long game
 * on a small custom list still gets a full set of options.
 */
export function pickWordOptions(
  pool: readonly string[],
  used: ReadonlySet<string>,
  count = WORD_OPTION_COUNT,
  random = Math.random
): string[] {
  const fresh = pool.filter((word) => !used.has(word));
  const source = fresh.length >= count ? fresh : [...pool];
  // Partial Fisher–Yates: unbiased, unlike sorting with a random comparator.
  for (let i = 0; i < Math.min(count, source.length); i++) {
    const j = i + Math.floor(random() * (source.length - i));
    [source[i], source[j]] = [source[j], source[i]];
  }
  return source.slice(0, count);
}
