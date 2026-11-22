/**
 * Names that won the game: the seated players holding the highest seated score,
 * and only when that score is above 0. Ties all win. Players who left the room
 * can't win, even if their score was higher.
 */
export function winnersOf(
  scores: readonly { name: string; score: number }[],
  seated: ReadonlySet<string>
): Set<string> {
  const contenders = scores.filter((s) => seated.has(s.name));
  const top = Math.max(0, ...contenders.map((s) => s.score));
  if (top <= 0) return new Set();
  return new Set(contenders.filter((s) => s.score === top).map((s) => s.name));
}
