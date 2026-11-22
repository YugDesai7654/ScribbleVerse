import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type React from "react"
import type { DrawOp, FillOp, Point, StrokeSegment } from "../../game/types"
import type { Tool } from "../../game/utils"
import { paintAll, paintOp } from "../../game/render"

const ASPECT = 4 / 3
/** Ignore pointer moves smaller than this (normalised) to keep traffic under the server's rate limit. */
const MIN_STEP = 0.003

interface DrawingCanvasProps {
  ops: DrawOp[]
  canDraw: boolean
  tool: Tool
  color: string
  size: number
  onSegment: (segment: StrokeSegment) => void
  onFill: (fill: FillOp) => void
  /** Called on pen-up so the parent can send any batched segments at once. */
  onStrokeEnd: () => void
}

let strokeCounter = 0
const newStrokeId = () => `${Date.now().toString(36)}-${(strokeCounter++).toString(36)}`

/**
 * Responsive 4:3 canvas. Strokes are stored in normalised coordinates, so the
 * same drawing renders correctly on a phone and a 4K monitor. New segments are
 * painted incrementally; a full repaint only happens on resize, undo or clear.
 */
export default function DrawingCanvas({ ops, canDraw, tool, color, size, onSegment, onFill, onStrokeEnd }: DrawingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const painted = useRef<DrawOp[]>([])
  const active = useRef<{ pointerId: number; strokeId: string; last: Point } | null>(null)

  // Fit the largest 4:3 rectangle into the available space.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const fit = () => {
      const { clientWidth, clientHeight } = wrapper
      const width = Math.floor(Math.min(clientWidth, clientHeight * ASPECT))
      setBox({ width, height: Math.floor(width / ASPECT) })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  // Resize the backing store for crisp lines on high-DPI screens, then repaint everything.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !box.width) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = box.width * dpr
    canvas.height = box.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    painted.current = []
  }, [box])

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx || !box.width) return
    const prev = painted.current
    // After a resize `painted` is empty, so this also repaints the white background.
    const isAppend = prev.length > 0 && ops.length >= prev.length && prev.every((op, i) => ops[i] === op)
    if (!isAppend) {
      paintAll(ctx, ops, box.width, box.height)
    } else {
      for (let i = prev.length; i < ops.length; i++) paintOp(ctx, ops[i], box.width, box.height)
    }
    painted.current = ops
  }, [ops, box])

  const toPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) }
  }, [])

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === "mouse" && e.button !== 0)) return
    if (active.current) return // one pointer at a time: a second finger or a palm is ignored
    e.currentTarget.setPointerCapture(e.pointerId)
    const point = toPoint(e)
    const strokeId = newStrokeId()
    if (tool === "fill") {
      onFill({ type: "fill", strokeId, x: point.x, y: point.y, color })
      return
    }
    active.current = { pointerId: e.pointerId, strokeId, last: point }
    onSegment({ strokeId, from: null, to: point, color, size }) // a dot for single taps
  }

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = active.current
    if (!canDraw || !stroke || e.pointerId !== stroke.pointerId) return
    const point = toPoint(e)
    if (Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y) < MIN_STEP) return
    onSegment({ strokeId: stroke.strokeId, from: stroke.last, to: point, color, size })
    stroke.last = point
  }

  const handleUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active.current || e.pointerId !== active.current.pointerId) return
    active.current = null
    onStrokeEnd()
  }

  useEffect(() => {
    if (!canDraw) active.current = null
  }, [canDraw])

  return (
    <div ref={wrapperRef} className="w-full h-full flex items-center justify-center min-h-0">
      <canvas
        ref={canvasRef}
        style={{ width: box.width, height: box.height, touchAction: "none" }}
        className={`bg-white rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.45)] ${canDraw ? (tool === "fill" ? "cursor-cell" : "cursor-crosshair") : "cursor-default"}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        aria-label={canDraw ? "Drawing canvas, you are drawing" : "Drawing canvas"}
        role="img"
      />
    </div>
  )
}
