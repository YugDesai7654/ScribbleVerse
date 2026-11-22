import { isFill, type DrawOp, type StrokeSegment } from "./types"

/** Canvas background. Painted for real (not just CSS) so fills see erased and blank areas the same way. */
export const CANVAS_BACKGROUND = "#ffffff"

/** How different (0..255 per channel) a pixel may be and still count as the same region. Soaks up anti-aliased edges. */
const FILL_TOLERANCE = 64

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function clearCanvas(ctx: CanvasRenderingContext2D) {
  const { canvas } = ctx
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = CANVAS_BACKGROUND
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

function drawSegment(ctx: CanvasRenderingContext2D, segment: StrokeSegment, width: number, height: number) {
  const from = segment.from ?? segment.to
  ctx.beginPath()
  ctx.strokeStyle = segment.color
  ctx.lineWidth = Math.max(1, (segment.size * width) / 1000)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.moveTo(from.x * width, from.y * height)
  ctx.lineTo(segment.to.x * width, segment.to.y * height)
  ctx.stroke()
}

/**
 * Scanline flood fill in device pixels, so it works the same whatever transform
 * the context has. Fills the region connected to (x, y) whose colour is within
 * FILL_TOLERANCE of the seed pixel.
 */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const { width, height } = ctx.canvas
  if (!width || !height) return
  const startX = Math.min(width - 1, Math.max(0, Math.floor(x * width)))
  const startY = Math.min(height - 1, Math.max(0, Math.floor(y * height)))
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const seed = (startY * width + startX) * 4
  const target = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]]
  const [r, g, b] = hexToRgb(color)
  if (target[0] === r && target[1] === g && target[2] === b && target[3] === 255) return

  const visited = new Uint8Array(width * height)
  const matches = (pixel: number) => {
    if (visited[pixel]) return false
    const i = pixel * 4
    return (
      Math.abs(data[i] - target[0]) <= FILL_TOLERANCE &&
      Math.abs(data[i + 1] - target[1]) <= FILL_TOLERANCE &&
      Math.abs(data[i + 2] - target[2]) <= FILL_TOLERANCE &&
      Math.abs(data[i + 3] - target[3]) <= FILL_TOLERANCE
    )
  }
  const paint = (pixel: number) => {
    visited[pixel] = 1
    const i = pixel * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }

  const stack: number[] = [startX, startY]
  while (stack.length) {
    const py = stack.pop()!
    let px = stack.pop()!
    const row = py * width
    while (px > 0 && matches(row + px - 1)) px--
    let above = false
    let below = false
    for (; px < width && matches(row + px); px++) {
      paint(row + px)
      if (py > 0) {
        const up = matches(row - width + px)
        if (up && !above) stack.push(px, py - 1)
        above = up
      }
      if (py < height - 1) {
        const down = matches(row + width + px)
        if (down && !below) stack.push(px, py + 1)
        below = down
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Paints one operation. `width`/`height` are the drawing size in the context's own units. */
export function paintOp(ctx: CanvasRenderingContext2D, op: DrawOp, width: number, height: number) {
  if (isFill(op)) floodFill(ctx, op.x, op.y, op.color)
  else drawSegment(ctx, op, width, height)
}

/** Clears and replays a whole drawing. */
export function paintAll(ctx: CanvasRenderingContext2D, ops: readonly DrawOp[], width: number, height: number) {
  clearCanvas(ctx)
  for (const op of ops) paintOp(ctx, op, width, height)
}

/** Renders a drawing to a PNG at the given size and starts a download. */
export function downloadPng(ops: readonly DrawOp[], fileName: string, width = 1200) {
  const height = Math.round((width * 3) / 4)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  paintAll(ctx, ops, width, height)
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, "image/png")
}
