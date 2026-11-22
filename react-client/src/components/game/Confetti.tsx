import { motion } from "framer-motion"
import { useMemo } from "react"
import { PALETTE } from "../../game/types"

/** A one-shot confetti burst. Remount (change `key`) to fire again. */
export default function Confetti({ pieces = 40 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 520,
        y: -(120 + Math.random() * 260),
        rotate: Math.random() * 720 - 360,
        color: PALETTE[3 + (i % 8)],
        delay: Math.random() * 0.1,
      })),
    [pieces]
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          className="absolute left-1/2 top-1/2 h-2.5 w-1.5 rounded-sm"
          style={{ backgroundColor: bit.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: bit.x, y: [0, bit.y, bit.y + 320], opacity: [1, 1, 0], rotate: bit.rotate }}
          transition={{ duration: 1.6, delay: bit.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}
