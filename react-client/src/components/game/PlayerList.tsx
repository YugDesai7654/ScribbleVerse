import { AnimatePresence, motion } from "framer-motion"
import { Check, Crown, Pencil } from "lucide-react"
import type { Player } from "../../game/types"
import { avatarColor } from "../../game/utils"

interface PlayerListProps {
  players: Player[]
  points: Record<string, number>
  hostName: string
  selfId: string
  drawerId: string | null
  guessed: ReadonlySet<string>
  /** Recent point gains by player name, shown as floating "+N" chips. */
  gains: Record<string, { points: number; key: number }>
}

export default function PlayerList({ players, points, hostName, selfId, drawerId, guessed, gains }: PlayerListProps) {
  const ranked = [...players].sort((a, b) => (points[b.name] || 0) - (points[a.name] || 0))

  return (
    <ul className="space-y-3 pt-2" aria-label="Players">
      <AnimatePresence initial={false}>
        {ranked.map((player, index) => {
          const isDrawer = player.id === drawerId
          const hasGuessed = guessed.has(player.name)
          const gain = gains[player.name]
          return (
            <motion.li
              key={player.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className={`relative flex items-center gap-3 rounded-xl border px-3 py-2 ${
                isDrawer ? "border-gold/70 bg-gold/10" : hasGuessed ? "border-success/50 bg-success/10" : "border-transparent bg-panel-2"
              }`}
            >
              <span className="w-5 text-center text-sm font-bold text-cream/50 tabular-nums">{index + 1}</span>
              <div
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-bold text-white"
                style={{ backgroundColor: avatarColor(player.name) }}
                aria-hidden
              >
                {player.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-cream">
                  <span className="truncate">{player.name}</span>
                  {player.id === selfId && <span className="text-[10px] font-bold text-success">(you)</span>}
                </p>
                <p className="text-xs text-cream/60 tabular-nums">{points[player.name] || 0} pts</p>
              </div>
              <div className="flex items-center gap-1 text-cream/80">
                {player.name === hostName && <Crown className="h-4 w-4 text-gold" aria-label="Host" />}
                {isDrawer && <Pencil className="h-4 w-4 text-gold" aria-label="Drawing" />}
                {hasGuessed && <Check className="h-4 w-4 text-success" aria-label="Guessed" />}
              </div>
              <AnimatePresence>
                {gain && (
                  <motion.span
                    key={gain.key}
                    initial={{ opacity: 0, y: 8, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35 }}
                    className="absolute -top-2 right-2 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-ink shadow"
                  >
                    +{gain.points}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
