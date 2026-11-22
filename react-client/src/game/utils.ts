import { ERASER_COLOR } from "./types"

export type Tool = "brush" | "eraser" | "fill"

export function strokeColor(tool: Tool, color: string) {
  return tool === "eraser" ? ERASER_COLOR : color
}

/** Deterministic avatar colour from a name. */
export function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360} 65% 45%)`
}
