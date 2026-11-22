import { isFill, type DrawOp, type StrokeSegment } from "./types"

/** Canvas background. Painted for real (not just CSS) so fills see erased and blank areas the same way. */
export const CANVAS_BACKGROUND = "#ffffff"

/** How different (0..255 per channel) a pixel may be and still count as the same region. Soaks up anti-aliased edges. */
const FILL_TOLERANCE = 64
/**
 * After filling, edge pixels within this distance of the region's colour are
 * filled too. 128 is the midpoint: such a pixel is mostly region (anti-aliasing),
 * not line. Even the palette's grey line (148 from white) stays intact.
 */
const EDGE_TOLERANCE = 128
/** How many pixels deep the edge clean-up goes. */
const EDGE_PASSES = 2

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
 * Scanline flood fill on raw RGBA pixels. Fills the region connected to (x, y)
 * whose colour is within FILL_TOLERANCE of the seed pixel, then runs the edge
 * clean-up. The clean-up only scans the filled region's bounding box grown by
 * EDGE_PASSES, since it can't reach further (BUG-030).
 */
export function fillPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: [number, number, number]
) {
  if (!width || !height) return
  const startX = Math.min(width - 1, Math.max(0, Math.floor(x)))
  const startY = Math.min(height - 1, Math.max(0, Math.floor(y)))
  const seed = (startY * width + startX) * 4
  const target = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]]
  const [r, g, b] = rgb
  if (target[0] === r && target[1] === g && target[2] === b && target[3] === 255) return

  const visited = new Uint8Array(width * height)
  let minX = width
  let maxX = -1
  let minY = height
  let maxY = -1
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
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
    let above = false
    let below = false
    for (; px < width && matches(row + px); px++) {
      paint(row + px)
      if (px > maxX) maxX = px
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
  if (maxX < 0) return

  // Anti-aliased pixels along the outline are part-way between the region and
  // the line, so some fall outside the tolerance and would stay as a light
  // fringe (BUG-008). Pull in neighbours that are still closer to the region's
  // colour than to a solid line, without eating into the line itself.
  const x0 = Math.max(0, minX - EDGE_PASSES)
  const x1 = Math.min(width - 1, maxX + EDGE_PASSES)
  const y0 = Math.max(0, minY - EDGE_PASSES)
  const y1 = Math.min(height - 1, maxY + EDGE_PASSES)
  for (let pass = 0; pass < EDGE_PASSES; pass++) {
    const edge: number[] = []
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const pixel = py * width + px
        if (visited[pixel]) continue
        const touchesFill =
          (px > 0 && visited[pixel - 1] === 1) ||
          (px < width - 1 && visited[pixel + 1] === 1) ||
          (py > 0 && visited[pixel - width] === 1) ||
          (py < height - 1 && visited[pixel + width] === 1)
        if (!touchesFill) continue
        const i = pixel * 4
        const distance = Math.max(
          Math.abs(data[i] - target[0]),
          Math.abs(data[i + 1] - target[1]),
          Math.abs(data[i + 2] - target[2])
        )
        if (distance <= EDGE_TOLERANCE) edge.push(pixel)
      }
    }
    if (edge.length === 0) break
    edge.forEach(paint)
  }
}

/** Fills at normalised (x, y) of the canvas, in device pixels so any context transform is irrelevant. */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const { width, height } = ctx.canvas
  if (!width || !height) return
  const image = ctx.getImageData(0, 0, width, height)
  fillPixels(image.data, width, height, x * width, y * height, hexToRgb(color))
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
