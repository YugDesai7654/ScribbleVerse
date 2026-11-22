import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSegmentBatcher } from "./segmentBatcher"
import type { StrokeSegment } from "./types"

const seg = (x: number): StrokeSegment => ({ strokeId: "s1", from: null, to: { x, y: 0.5 }, color: "#000000", size: 8 })

describe("createSegmentBatcher", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("sends pushes within one interval as a single batch", () => {
    const send = vi.fn()
    const batcher = createSegmentBatcher(send)
    batcher.push(seg(0.1))
    batcher.push(seg(0.2))
    batcher.push(seg(0.3))
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(33)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toHaveLength(3)
  })

  it("flushes at once when the batch is full", () => {
    const send = vi.fn()
    const batcher = createSegmentBatcher(send)
    for (let i = 0; i < 16; i++) batcher.push(seg(i / 20))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toHaveLength(16)
    vi.advanceTimersByTime(100)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("flush() with nothing pending sends nothing", () => {
    const send = vi.fn()
    createSegmentBatcher(send).flush()
    expect(send).not.toHaveBeenCalled()
  })

  it("flush() sends pending segments and cancels the timer", () => {
    const send = vi.fn()
    const batcher = createSegmentBatcher(send)
    batcher.push(seg(0.1))
    batcher.flush()
    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("dispose() drops pending segments and stops the timer", () => {
    const send = vi.fn()
    const batcher = createSegmentBatcher(send)
    batcher.push(seg(0.1))
    batcher.push(seg(0.2))
    batcher.dispose()
    vi.advanceTimersByTime(100)
    expect(send).not.toHaveBeenCalled()
  })
})
