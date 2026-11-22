import { motion } from "framer-motion"
import { Check, Copy, Crown, LogOut, RotateCcw, Trophy } from "lucide-react"
import { useState, type ReactNode } from "react"
import type { Player, Score, TurnSummary } from "../../game/types"
import { avatarColor } from "../../game/utils"

const backdrop = "absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
const card = "w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-2xl sm:p-8"
const primary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cream to-gold px-6 py-3 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line px-6 py-3 font-semibold text-cream hover:bg-panel-2"

function Fade({ children, className = backdrop }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {children}
    </motion.div>
  )
}

export function InviteCode({ roomId, onCopied }: { roomId: string; onCopied: (text: string) => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const link = `${window.location.origin}/room/${roomId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      onCopied("Invite link copied")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      onCopied(`Share this code: ${roomId}`)
    }
  }
  return (
    <button type="button" onClick={copy} className="group inline-flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-1.5 hover:border-gold" title="Copy invite link">
      <span className="font-mono text-sm tracking-[0.12em] sm:tracking-[0.25em] text-cream">{roomId}</span>
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-cream/60 group-hover:text-gold" />}
    </button>
  )
}

export function LobbyPanel({
  roomId, players, isHost, hostName, onStart, onCopied,
}: {
  roomId: string
  players: Player[]
  isHost: boolean
  hostName: string
  onStart: () => void
  onCopied: (text: string) => void
}) {
  return (
    <Fade className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto rounded-2xl bg-ink p-3">
      <motion.div className={`${card} p-5`} initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
        <h2 className="font-display text-3xl font-bold text-cream">Waiting room</h2>
        <p className="mt-1 text-sm text-cream/60">Share the code to invite friends.</p>
        <div className="mt-4 flex justify-center">
          <InviteCode roomId={roomId} onCopied={onCopied} />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {players.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <div className="relative h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: avatarColor(p.name) }}>
                {p.name.charAt(0).toUpperCase()}
                {p.name === hostName && <Crown className="absolute -top-2 -right-1 h-4 w-4 text-gold" />}
              </div>
              <span className="max-w-[5rem] truncate text-xs text-cream/80">{p.name}</span>
            </div>
          ))}
        </div>
        <div className="mt-7">
          {isHost ? (
            <>
              <button type="button" onClick={onStart} disabled={players.length < 2} className={primary}>
                Start game
              </button>
              {players.length < 2 && <p className="mt-3 text-sm text-cream/50">Need at least 2 players to start.</p>}
            </>
          ) : (
            <p className="text-sm text-cream/60">Waiting for {hostName || "the host"} to start…</p>
          )}
        </div>
      </motion.div>
    </Fade>
  )
}

export function CountdownOverlay({ seconds }: { seconds: number }) {
  return (
    <Fade>
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-cream/60">Next round in</p>
        <motion.p key={seconds} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-8xl font-bold text-gold">
          {seconds}
        </motion.p>
      </div>
    </Fade>
  )
}

export function TurnSummaryOverlay({ summary }: { summary: TurnSummary }) {
  return (
    <Fade className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <motion.div className={card} initial={{ y: 16, scale: 0.95 }} animate={{ y: 0, scale: 1 }}>
        <p className="text-xs uppercase tracking-[0.3em] text-cream/50">The word was</p>
        <p className="mt-1 font-display text-4xl font-bold text-gold">{summary.word ?? "—"}</p>
        <ul className="mt-5 space-y-1.5 text-left">
          {summary.gains.length === 0 && <li className="text-center text-sm text-cream/50">Nobody guessed it this time.</li>}
          {summary.gains.map((gain) => (
            <li key={gain.name} className="flex justify-between rounded-lg bg-panel-2 px-3 py-1.5 text-sm">
              <span className="truncate text-cream">
                {gain.name}
                {gain.name === summary.drawerName && <span className="ml-1 text-xs text-cream/50">(drawer)</span>}
              </span>
              <span className="font-bold text-success tabular-nums">+{gain.points}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </Fade>
  )
}

const podiumStyle = [
  { height: "h-28", color: "text-gold", order: "order-2" },
  { height: "h-20", color: "text-gray-300", order: "order-1" },
  { height: "h-14", color: "text-orange-400", order: "order-3" },
]

export function GameOverOverlay({
  scores, reason, isHost, canPlayAgain, onPlayAgain, onLeave,
}: {
  scores: Score[]
  reason?: string
  isHost: boolean
  canPlayAgain: boolean
  onPlayAgain: () => void
  onLeave: () => void
}) {
  const top = scores.slice(0, 3)
  // Equal scores share a rank (two players on 360 are both 1st).
  const rankOf = (score: number) => scores.findIndex((s) => s.score === score) + 1
  return (
    <Fade className={`${backdrop} z-50`}>
      <motion.div className={`${card} max-h-[90vh] overflow-y-auto`} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}>
        <h2 className="font-display text-4xl font-bold text-gold">Game over!</h2>
        {reason ? (
          <p className="mt-4 text-cream/70">{reason}</p>
        ) : (
          <>
            <div className="mt-6 flex items-end justify-center gap-3">
              {top.map((player, i) => (
                <div key={player.name} className={`flex w-24 flex-col items-center ${podiumStyle[i].order}`}>
                  <Trophy className={`h-6 w-6 ${podiumStyle[rankOf(player.score) - 1].color}`} />
                  <span className="mt-1 w-full truncate text-sm font-semibold text-cream">{player.name}</span>
                  <span className="text-xs text-cream/60 tabular-nums">{player.score} pts</span>
                  <motion.div
                    className={`mt-2 w-full rounded-t-lg bg-panel-2 ${podiumStyle[i].height} flex items-start justify-center pt-2 font-display text-2xl font-bold ${podiumStyle[i].color}`}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ originY: 1 }}
                    transition={{ delay: 0.3 + (2 - i) * 0.15 }}
                  >
                    {rankOf(player.score)}
                  </motion.div>
                </div>
              ))}
            </div>
            {scores.length > 3 && (
              <ul className="mt-4 space-y-1 text-left">
                {scores.slice(3).map((player, i) => (
                  <li key={player.name} className="flex justify-between rounded-lg bg-panel-2 px-3 py-1.5 text-sm">
                    <span className="truncate text-cream/80">{rankOf(player.score) || i + 4}. {player.name}</span>
                    <span className="tabular-nums text-cream/60">{player.score} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {isHost ? (
            <button type="button" onClick={onPlayAgain} disabled={!canPlayAgain} className={primary} title={canPlayAgain ? undefined : "Need at least 2 players"}>
              <RotateCcw className="h-4 w-4" /> Play again
            </button>
          ) : (
            <p className="w-full text-sm text-cream/60">The host can start a new game.</p>
          )}
          <button type="button" onClick={onLeave} className={secondary}>
            <LogOut className="h-4 w-4" /> Leave
          </button>
        </div>
      </motion.div>
    </Fade>
  )
}
