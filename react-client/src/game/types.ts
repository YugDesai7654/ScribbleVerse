export type Point = { x: number; y: number }

/** One line segment of a stroke. Coordinates are normalised to 0..1 of the canvas. */
export type StrokeSegment = {
  strokeId: string
  from: Point | null
  to: Point
  color: string
  /** Brush width in px on a 1000px-wide reference canvas. */
  size: number
}

export type Player = { id: string; name: string }
export type Score = { name: string; score: number }

export type ChatMessage = {
  user: string
  text: string
  timestamp: number
  correct?: boolean
  /** Sent only among players who already guessed (and the drawer). */
  guessed?: boolean
  /** Local-only: "'aple' is close!" feedback for this player. */
  close?: boolean
}

export type TurnSummary = {
  word: string | null
  drawerName: string | null
  gains: { name: string; points: number }[]
}

export const PALETTE = [
  "#111111", "#6b7280", "#ffffff", "#ef4444", "#f97316", "#facc15",
  "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#92400e",
] as const

export const BRUSH_SIZES = [4, 10, 20, 36] as const
export const ERASER_COLOR = "#ffffff"
