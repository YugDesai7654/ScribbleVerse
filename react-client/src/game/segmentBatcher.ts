import type { StrokeSegment } from "./types"

export type SegmentBatcher = {
  push(segment: StrokeSegment): void
  /** Sends whatever is pending right away. */
  flush(): void
  /** Drops whatever is pending and stops the timer. */
  dispose(): void
}

/**
 * Collects stroke segments and sends them together: when `maxBatch` are pending,
 * otherwise `intervalMs` after the first one. Keeps fast pens (120 Hz) under the
 * server's per-event rate limit.
 */
export function createSegmentBatcher(
  send: (segments: StrokeSegment[]) => void,
  intervalMs = 33,
  maxBatch = 16
): SegmentBatcher {
  let pending: StrokeSegment[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const flush = () => {
    stopTimer()
    if (pending.length === 0) return
    const batch = pending
    pending = []
    send(batch)
  }

  return {
    push(segment) {
      pending.push(segment)
      if (pending.length >= maxBatch) flush()
      else if (timer === null) timer = setTimeout(flush, intervalMs)
    },
    flush,
    dispose() {
      stopTimer()
      pending = []
    },
  }
}
