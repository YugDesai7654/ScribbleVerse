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

/** A flood fill at a point. Replayed in order with the strokes, so every client gets the same picture. */
export type FillOp = {
  type: "fill"
  strokeId: string
  x: number
  y: number
  color: string
}

/** Anything stored in a turn's drawing history. */
export type DrawOp = StrokeSegment | FillOp

export function isFill(op: DrawOp): op is FillOp {
  return (op as FillOp).type === "fill"
}

/** One finished drawing, sent with `gameOver` for the gallery. */
export type GalleryEntry = {
  drawerName: string
  word: string
  ops: DrawOp[]
}

/** `connected` is false while the server holds a dropped player's seat. */
export type Player = { id: string; name: string; connected?: boolean }
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

/** Must match `CATEGORIES` in socket-server/src/game/words/index.ts. */
export const CATEGORIES = ["mixed", "animals", "food", "objects", "places", "actions", "movies"] as const
export type Category = (typeof CATEGORIES)[number]

/** Lobby settings as the server shares them. Only the host receives `customWords`. */
export type RoomSettings = {
  rounds: number
  timePerRound: number
  maxPlayers: number
  category: Category
  customWordsOnly: boolean
  customWordCount: number
  customWords?: string[]
}

export type SettingsChange = Partial<Pick<RoomSettings, "rounds" | "timePerRound" | "maxPlayers" | "category" | "customWordsOnly">> & {
  /** Comma-separated, as typed in the textarea; the server parses and validates it. */
  customWords?: string
}

/** Sent to a player who reclaims their seat, so they can redraw the room. */
export type SyncState = {
  phase: "lobby" | "idle" | "choosing" | "drawing" | "intermission"
  round: number
  totalRounds: number
  timePerRound: number
  drawerId: string | null
  isDrawer: boolean
  word: string | null
  wordOptions: string[] | null
  timeLeft: number
  scores: Record<string, number>
  guessed: string[]
  strokes: DrawOp[]
  chat: ChatMessage[]
}
