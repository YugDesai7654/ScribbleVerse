import { useEffect, useRef } from "react"
import { Download } from "lucide-react"
import type { GalleryEntry } from "../../game/types"
import { downloadPng, paintAll } from "../../game/render"

const THUMB_WIDTH = 240
const THUMB_HEIGHT = 180

function Thumbnail({ entry }: { entry: GalleryEntry }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = THUMB_WIDTH * dpr
    canvas.height = THUMB_HEIGHT * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintAll(ctx, entry.ops, THUMB_WIDTH, THUMB_HEIGHT)
  }, [entry])

  return (
    <canvas
      ref={canvasRef}
      className="aspect-[4/3] w-full rounded-lg bg-white"
      role="img"
      aria-label={`${entry.drawerName}'s drawing of ${entry.word}`}
    />
  )
}

const safeFilePart = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "drawing"

/** Every drawing from the game, with a PNG download for each. */
export default function Gallery({ entries }: { entries: GalleryEntry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="mt-6 text-left" aria-labelledby="gallery-heading">
      <h3 id="gallery-heading" className="mb-3 font-display text-xl font-bold text-cream">
        Gallery
      </h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {entries.map((entry, i) => (
          <li key={`${entry.drawerName}-${entry.word}-${i}`} className="rounded-xl border border-line bg-panel-2 p-2">
            <Thumbnail entry={entry} />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold capitalize text-cream">{entry.word}</p>
                <p className="truncate text-xs text-cream/60">by {entry.drawerName}</p>
              </div>
              <button
                type="button"
                onClick={() => downloadPng(entry.ops, `scribbleverse-${safeFilePart(entry.word)}-${safeFilePart(entry.drawerName)}.png`)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-cream/80 hover:bg-panel hover:text-cream"
                aria-label={`Download PNG of ${entry.word}`}
                title="Download PNG"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
