import { useEffect, useRef, useState } from "react"
import { AnimatePresence, m } from "framer-motion"
import type { DrawOp, Point, StrokeSegment } from "../game/types"
import { clearCanvas, paintOp } from "../game/render"
import { avatarColor } from "../game/utils"

/**
 * A looping replay of one round, drawn with the same operations and renderer
 * as the real game: strokes go down point by point, the bucket fills the roof
 * and walls, hints appear, and guesses roll in until someone gets it.
 */

const WIDTH = 480
const HEIGHT = 360
const TICK_MS = 28
const WORD = "house"

let demoStroke = 0
/** A straight stroke from point to point, split into short segments like a real pointer drag. */
function line(points: Point[], color = "#111111", size = 10): StrokeSegment[] {
  const strokeId = `demo-${demoStroke++}`
  const out: StrokeSegment[] = [{ strokeId, from: null, to: points[0], color, size }]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 0.025))
    for (let s = 1; s <= steps; s++) {
      const from = out[out.length - 1].to
      out.push({ strokeId, from, to: { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps }, color, size })
    }
  }
  return out
}

function circle(cx: number, cy: number, r: number, color: string, size = 8): StrokeSegment[] {
  const points = Array.from({ length: 33 }, (_, i) => {
    const angle = (i / 32) * Math.PI * 2
    return { x: cx + Math.cos(angle) * r * (HEIGHT / WIDTH), y: cy + Math.sin(angle) * r }
  })
  return line(points, color, size)
}

const fill = (x: number, y: number, color: string): DrawOp => ({ type: "fill", strokeId: `demo-${demoStroke++}`, x, y, color })

const OPS: DrawOp[] = [
  ...line([{ x: 0.3, y: 0.5 }, { x: 0.3, y: 0.85 }, { x: 0.7, y: 0.85 }, { x: 0.7, y: 0.5 }, { x: 0.3, y: 0.5 }]),
  ...line([{ x: 0.26, y: 0.52 }, { x: 0.5, y: 0.24 }, { x: 0.74, y: 0.52 }, { x: 0.26, y: 0.52 }]),
  ...line([{ x: 0.45, y: 0.85 }, { x: 0.45, y: 0.66 }, { x: 0.55, y: 0.66 }, { x: 0.55, y: 0.85 }], "#111111", 8),
  ...line([{ x: 0.34, y: 0.58 }, { x: 0.41, y: 0.58 }, { x: 0.41, y: 0.66 }, { x: 0.34, y: 0.66 }, { x: 0.34, y: 0.58 }], "#111111", 6),
  fill(0.5, 0.42, "#ef4444"),
  fill(0.62, 0.72, "#facc15"),
  fill(0.37, 0.62, "#3b82f6"),
  ...circle(0.85, 0.18, 0.08, "#f97316"),
  fill(0.85, 0.18, "#facc15"),
  ...line([{ x: 0.05, y: 0.86 }, { x: 0.95, y: 0.86 }], "#22c55e", 14),
]

type DemoMessage = { user: string; text: string; tone?: "close" | "correct" }

// Each event fires once this many operations have been drawn.
const EVENTS: { at: number; hint?: string; message?: DemoMessage }[] = [
  { at: 30, message: { user: "Leo", text: "box?" } },
  { at: 70, message: { user: "Ana", text: "tent!" } },
  { at: 95, hint: "h _ _ _ _" },
  { at: 110, message: { user: "Leo", text: "hous", tone: "close" } },
  { at: 128, hint: "h _ _ s _" },
  { at: 140, message: { user: "Mia", text: "Mia guessed the word!", tone: "correct" } },
  { at: 160, message: { user: "Ana", text: "Ana guessed the word!", tone: "correct" } },
]

const HOLD_TICKS = 70 // pause on the finished drawing before looping

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return reduced
}

export default function HeroDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [step, setStep] = useState(0)

  // Drive the replay. Reduced motion shows the finished round, still.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    clearCanvas(ctx)

    if (reducedMotion) {
      OPS.forEach((op) => paintOp(ctx, op, WIDTH, HEIGHT))
      setStep(OPS.length + HOLD_TICKS)
      return
    }

    let painted = 0
    let tick = 0
    const timer = window.setInterval(() => {
      tick++
      if (painted < OPS.length) {
        paintOp(ctx, OPS[painted], WIDTH, HEIGHT)
        painted++
      } else if (tick > OPS.length + HOLD_TICKS) {
        clearCanvas(ctx)
        painted = 0
        tick = 0
      }
      setStep(tick)
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [reducedMotion])

  const fired = EVENTS.filter((event) => step >= event.at)
  const hint = [...fired].reverse().find((event) => event.hint)?.hint ?? "_ _ _ _ _"
  const messages = fired.flatMap((event) => (event.message ? [event.message] : []))
  const solved = messages.some((message) => message.tone === "correct")
  const secondsLeft = Math.max(0, 80 - Math.floor((Math.min(step, OPS.length) / OPS.length) * 50))

  return (
    <figure className="w-full max-w-xl rounded-2xl border border-line bg-panel p-3 shadow-2xl" aria-label="Example round: drawing a house">
      <div className="mb-2 flex items-center justify-between gap-3 px-1 text-sm">
        <span className="tabular-nums text-cream/70" aria-hidden>
          ⏱ {secondsLeft}s
        </span>
        <span className="font-mono text-lg font-bold tracking-widest text-cream" aria-hidden>
          {solved ? WORD.split("").join(" ") : hint}
        </span>
        <span className="text-cream/70">Round 1/3</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <canvas ref={canvasRef} className="aspect-[4/3] w-full rounded-xl bg-white" role="img" aria-label="A house with a red roof being drawn" />
        <ul className="flex min-h-24 flex-col justify-end gap-1.5 overflow-hidden text-left text-sm" aria-hidden>
          <AnimatePresence initial={false}>
            {messages.slice(-5).map((message) => (
              <m.li
                key={message.user + message.text}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg px-2 py-1 ${
                  message.tone === "correct"
                    ? "bg-success/15 font-semibold text-success"
                    : message.tone === "close"
                      ? "bg-gold/15 text-cream"
                      : "bg-panel-2 text-cream"
                }`}
              >
                {message.tone === "correct" ? (
                  message.text
                ) : (
                  <>
                    <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: avatarColor(message.user) }} />{" "}
                    <span className="font-semibold">{message.user}:</span>{" "}
                    {message.text}
                    {message.tone === "close" && <span className="block text-xs text-gold">is close!</span>}
                  </>
                )}
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <figcaption className="sr-only">
        A looping example round: one player draws a house while the others guess in the chat.
      </figcaption>
    </figure>
  )
}
