/**
 * Pure word/guess helpers used by the game loop. Kept free of socket or timer
 * state so the rules can be unit-tested directly.
 */

/** Classic Levenshtein edit distance (insertions, deletions, substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isCorrectGuess(guess: string, word: string): boolean {
  return normalise(guess) === normalise(word);
}

/**
 * True when the word appears in the guess as a whole word (a non-letter or the
 * string edge on both sides), so "an apple" contains "apple" but "pineapple" doesn't.
 */
export function containsWord(guess: string, word: string): boolean {
  const g = normalise(guess);
  const w = normalise(word);
  if (!w) return false;
  const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
  let from = 0;
  for (;;) {
    const at = g.indexOf(w, from);
    if (at === -1) return false;
    if (!isLetter(g[at - 1]) && !isLetter(g[at + w.length])) return true;
    from = at + 1;
  }
}

/**
 * True when a wrong guess is nearly right: one typo for short words, two for
 * words of six or more letters. Very short words never count as "close",
 * since almost any guess would be within one edit of them.
 */
export function isCloseGuess(guess: string, word: string): boolean {
  const g = normalise(guess);
  const w = normalise(word);
  if (g === w || w.length < 3) return false;
  const allowed = w.length >= 6 ? 2 : 1;
  if (Math.abs(g.length - w.length) > allowed) return false;
  return levenshtein(g, w) <= allowed;
}

/** Renders the word with only the revealed letter positions shown, e.g. "a _ _ l e". */
export function buildHint(word: string, revealed: ReadonlySet<number>): string {
  return word
    .split('')
    .map((c, i) => (c === ' ' ? ' ' : revealed.has(i) ? c : '_'))
    .join(' ');
}

/** How many letters to reveal over a turn: always leaves most of the word hidden. */
export function hintCountFor(word: string): number {
  const letters = word.replace(/\s/g, '').length;
  if (letters <= 3) return 1;
  if (letters <= 6) return 2;
  return 3;
}

/**
 * Milliseconds after the turn starts at which each hint is revealed, spread
 * evenly between 40% and 85% of the turn so early guesses stay unassisted.
 */
export function hintScheduleMs(turnSeconds: number, hintCount: number): number[] {
  return Array.from({ length: hintCount }, (_, i) => {
    const fraction = 0.4 + (0.45 * (i + 1)) / (hintCount + 1);
    return Math.round(turnSeconds * 1000 * fraction);
  });
}

/** Picks a random not-yet-revealed letter index, or null if none remain. */
export function pickHintIndex(word: string, revealed: ReadonlySet<number>, random = Math.random): number | null {
  const candidates = word
    .split('')
    .map((c, i) => (c !== ' ' && !revealed.has(i) ? i : -1))
    .filter((i) => i >= 0);
  if (candidates.length <= 1) return null; // never give the whole word away
  return candidates[Math.floor(random() * candidates.length)];
}
