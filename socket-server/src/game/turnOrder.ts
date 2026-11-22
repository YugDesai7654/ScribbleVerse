/** Unbiased Fisher-Yates shuffle. Returns a new array and leaves the input alone. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Socket ids of the players who can draw (connected seats only), in random order. */
export function drawingOrderFor(
  players: readonly { id: string; connected: boolean }[],
  random: () => number = Math.random
): string[] {
  return shuffle(
    players.filter((p) => p.connected).map((p) => p.id),
    random
  );
}
