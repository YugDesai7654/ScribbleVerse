import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Builds a fresh set of rate limiters. This is a factory (rather than
 * module-level singletons) so that each `createApp()` instance gets its own
 * independent limiter state — important for tests, which create several
 * independent app instances in the same process, and would otherwise share
 * (and exhaust) limits across unrelated test cases.
 */
export function createRateLimiters() {
  // Per-socket limits on high-frequency in-game events.
  const drawingLimiter = new RateLimiterMemory({ points: 60, duration: 1 }); // ~60 points/sec
  const chatLimiter = new RateLimiterMemory({ points: 5, duration: 2 }); // 5 messages every 2s

  // Per-IP limit on room create/join attempts, to prevent spamming MongoDB with rooms.
  const roomActionLimiter = new RateLimiterMemory({ points: 10, duration: 60 }); // 10/min per IP

  return { drawingLimiter, chatLimiter, roomActionLimiter };
}

/**
 * Convenience helper: returns true if the action is allowed (and consumes a point),
 * false if the caller is currently rate-limited.
 */
export async function isAllowed(limiter: RateLimiterMemory, key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    return false;
  }
}
