import { Eraser, Paintbrush, Trash2, Undo2 } from "lucide-react"
import { BRUSH_SIZES, PALETTE } from "../../game/types"
import type { Tool } from "../../game/utils"

interface DrawingToolbarProps {
  tool: Tool
  color: string
  size: number
  canUndo: boolean
  onTool: (tool: Tool) => void
  onColor: (color: string) => void
  onSize: (size: number) => void
  onUndo: () => void
  onClear: () => void
}

const iconButton =
  "h-7 w-7 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"

export default function DrawingToolbar({
  tool, color, size, canUndo, onTool, onColor, onSize, onUndo, onClear,
}: DrawingToolbarProps) {
  return (
    <div
      className="flex flex-col gap-1.5 bg-panel border border-line rounded-xl px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-4 sm:gap-y-2 sm:px-3 sm:py-2"
      role="toolbar"
      aria-label="Drawing tools"
    >
      <div className="grid grid-cols-12 gap-1 sm:flex sm:gap-1.5" role="radiogroup" aria-label="Colour">
        {PALETTE.map((swatch) => {
          const selected = tool === "brush" && color === swatch
          return (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Colour ${swatch}`}
              onClick={() => { onColor(swatch); onTool("brush") }}
              className={`aspect-square w-full rounded-full border-2 transition-transform sm:h-7 sm:w-7 ${selected ? "border-gold scale-110" : "border-line hover:scale-105"}`}
              style={{ backgroundColor: swatch }}
            />
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 sm:contents">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush size">
        {BRUSH_SIZES.map((brush) => (
          <button
            key={brush}
            type="button"
            role="radio"
            aria-checked={size === brush}
            aria-label={`Brush size ${brush}`}
            onClick={() => onSize(brush)}
            className={`${iconButton} ${size === brush ? "border-gold bg-panel-2" : "border-line hover:bg-panel-2"}`}
          >
            <span
              className="rounded-full bg-cream"
              style={{ width: Math.max(4, brush / 2), height: Math.max(4, brush / 2) }}
            />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onTool("brush")}
          aria-pressed={tool === "brush"}
          title="Brush (B)"
          className={`${iconButton} ${tool === "brush" ? "border-gold bg-panel-2" : "border-line hover:bg-panel-2"}`}
        >
          <Paintbrush className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onTool("eraser")}
          aria-pressed={tool === "eraser"}
          title="Eraser (E)"
          className={`${iconButton} ${tool === "eraser" ? "border-gold bg-panel-2" : "border-line hover:bg-panel-2"}`}
        >
          <Eraser className="h-4 w-4" />
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" className={`${iconButton} border-line hover:bg-panel-2`}>
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canUndo}
          title="Clear canvas"
          className={`${iconButton} border-line text-danger hover:bg-danger/10`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      </div>
    </div>
  )
}

