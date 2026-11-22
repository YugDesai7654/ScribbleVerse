import { m } from "framer-motion"
import { Check, Copy, Crown, LogOut, RotateCcw, Trophy, WifiOff, X } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { CATEGORIES, type Category, type GalleryEntry, type Player, type RoomSettings, type Score, type SettingsChange, type TurnSummary } from "../../game/types"
import Gallery from "./Gallery"
import { avatarColor } from "../../game/utils"

const backdrop = "absolute inset-0 z-40 flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
const card = "w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-2xl sm:p-8"
const primary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cream to-gold px-6 py-3 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line px-6 py-3 font-semibold text-cream hover:bg-panel-2"

function Fade({ children, className = backdrop }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {children}
    </m.div>
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

const ROUND_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1)
const TIME_OPTIONS = [30, 45, 60, 80, 90, 120, 150, 180, 240, 300]
const PLAYER_OPTIONS = Array.from({ length: 11 }, (_, i) => i + 2)
const MAX_CUSTOM_WORDS = 200

const fieldLabel = "text-xs font-semibold uppercase tracking-wider text-cream/50"
const selectClass =
  "mt-1 w-full rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-sm text-cream capitalize focus:border-gold focus:outline-none"

/** Keeps the current value selectable even if it isn't one of the preset choices. */
function withCurrent(options: number[], current: number) {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b)
}

function countWords(text: string) {
  return new Set(text.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean)).size
}

function LobbySettings({ settings, isHost, playerCount, onChange }: {
  settings: RoomSettings
  isHost: boolean
  playerCount: number
  onChange: (change: SettingsChange) => void
}) {
  const savedWords = (settings.customWords ?? []).join(", ")
  const [draft, setDraft] = useState(savedWords)
  // Pick up the saved list when it changes (after saving, or on becoming host).
  useEffect(() => setDraft(savedWords), [savedWords])

  if (!isHost) {
    const items = [
      ["Rounds", settings.rounds],
      ["Draw time", `${settings.timePerRound}s`],
      ["Max players", settings.maxPlayers],
      ["Words", settings.customWordsOnly ? "Custom only" : settings.category],
    ] as const
    return (
      <div className="mt-6 text-left">
        <dl className="grid grid-cols-2 gap-2">
          {items.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-panel-2 px-3 py-2">
              <dt className={fieldLabel}>{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold capitalize text-cream">{value}</dd>
            </div>
          ))}
        </dl>
        {settings.customWordCount > 0 && !settings.customWordsOnly && (
          <p className="mt-2 text-center text-xs text-cream/50">Plus {settings.customWordCount} custom words from the host</p>
        )}
      </div>
    )
  }

  const draftCount = countWords(draft)
  const select = (label: string, id: string, value: number | string, options: (number | string)[], format: (v: never) => string, change: (v: string) => SettingsChange) => (
    <label htmlFor={id} className="block">
      <span className={fieldLabel}>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(change(e.target.value))} className={selectClass}>
        {options.map((option) => (
          <option key={option} value={option}>{format(option as never)}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="mt-6 space-y-3 text-left">
      <div className="grid grid-cols-2 gap-3">
        {select("Rounds", "lobby-rounds", settings.rounds, withCurrent(ROUND_OPTIONS, settings.rounds), String, (v) => ({ rounds: Number(v) }))}
        {select("Draw time", "lobby-time", settings.timePerRound, withCurrent(TIME_OPTIONS, settings.timePerRound), (v: number) => `${v} seconds`, (v) => ({ timePerRound: Number(v) }))}
        {select("Max players", "lobby-max", settings.maxPlayers, withCurrent(PLAYER_OPTIONS.filter((n) => n >= playerCount), settings.maxPlayers), String, (v) => ({ maxPlayers: Number(v) }))}
        {select("Category", "lobby-category", settings.category, [...CATEGORIES], (v: Category) => v, (v) => ({ category: v as Category }))}
      </div>
      <div>
        <label htmlFor="lobby-words" className="flex items-baseline justify-between">
          <span className={fieldLabel}>Custom words</span>
          <span className={`text-xs tabular-nums ${draftCount > MAX_CUSTOM_WORDS ? "text-danger" : "text-cream/50"}`}>
            {draftCount}/{MAX_CUSTOM_WORDS}
          </span>
        </label>
        <textarea
          id="lobby-words"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Comma-separated, e.g. rocket ship, homework, our teacher"
          className="mt-1 w-full resize-y rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-sm text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-cream/80">
            <input
              type="checkbox"
              checked={settings.customWordsOnly}
              onChange={(e) => onChange({ customWordsOnly: e.target.checked })}
              className="h-4 w-4 accent-[var(--color-gold)]"
            />
            Use only custom words
          </label>
          <button
            type="button"
            onClick={() => onChange({ customWords: draft })}
            disabled={draft.trim() === savedWords.trim()}
            className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-cream hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save words
          </button>
        </div>
      </div>
    </div>
  )
}

export function LobbyPanel({
  roomId, players, connectedCount, isHost, hostName, selfId, settings, onSettingsChange, onKick, onStart, onCopied,
}: {
  roomId: string
  players: Player[]
  /** Seats that are currently connected; the server only starts with 2 or more. */
  connectedCount: number
  isHost: boolean
  hostName: string
  selfId: string
  settings: RoomSettings | null
  onSettingsChange: (change: SettingsChange) => void
  onKick: (playerId: string) => void
  onStart: () => void
  onCopied: (text: string) => void
}) {
  return (
    <Fade className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto rounded-2xl bg-ink p-3 sm:items-center">
      <m.div className={`${card} max-w-lg p-5`} initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
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
                {isHost && p.id !== selfId && (
                  <button
                    type="button"
                    onClick={() => onKick(p.id)}
                    className="absolute -top-2 -left-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-panel text-cream/70 hover:border-danger hover:text-danger"
                    aria-label={`Remove ${p.name} from the room`}
                    title={`Remove ${p.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <span className="max-w-[5rem] truncate text-xs text-cream/80">{p.name}</span>
            </div>
          ))}
        </div>
        {settings && <LobbySettings settings={settings} isHost={isHost} playerCount={players.length} onChange={onSettingsChange} />}
        <div className="mt-7">
          {isHost ? (
            <>
              <button type="button" onClick={onStart} disabled={connectedCount < 2} className={primary}>
                Start game
              </button>
              {connectedCount < 2 && <p className="mt-3 text-sm text-cream/50">Need at least 2 connected players to start.</p>}
            </>
          ) : (
            <p className="text-sm text-cream/60">Waiting for {hostName || "the host"} to start…</p>
          )}
        </div>
      </m.div>
    </Fade>
  )
}

/**
 * Shown while Socket.IO retries a dropped connection (the server holds our seat
 * meanwhile), after it gave up, or when the seat moved to another tab. Leave is
 * always available.
 */
export function ReconnectingOverlay({
  state, onRetry, onLeave,
}: { state: "reconnecting" | "failed" | "moved"; onRetry: () => void; onLeave: () => void }) {
  const title = state === "failed" ? "Connection lost" : state === "moved" ? "This seat is open in another tab" : "Reconnecting…"
  const detail =
    state === "failed"
      ? "We couldn't get back to the room."
      : state === "moved"
        ? "Rejoin to take the seat back here."
        : "Your seat and score are held for a few seconds."
  return (
    <Fade className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]">
      <div className={card} role="alertdialog" aria-live="assertive" aria-label={title}>
        <WifiOff className="mx-auto h-10 w-10 text-gold" />
        <p className="mt-3 font-display text-2xl font-bold text-cream">{title}</p>
        <p className="mt-1 text-sm text-cream/60">{detail}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {state !== "reconnecting" && (
            <button type="button" onClick={onRetry} className={primary}>
              <RotateCcw className="h-4 w-4" /> {state === "moved" ? "Rejoin" : "Try again"}
            </button>
          )}
          <button type="button" onClick={onLeave} className={secondary}>
            <LogOut className="h-4 w-4" /> Leave
          </button>
        </div>
      </div>
    </Fade>
  )
}

export function CountdownOverlay({ seconds }: { seconds: number }) {
  return (
    <Fade>
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-cream/60">Next round in</p>
        <m.p key={seconds} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-8xl font-bold text-gold">
          {seconds}
        </m.p>
      </div>
    </Fade>
  )
}

export function TurnSummaryOverlay({ summary }: { summary: TurnSummary }) {
  return (
    <Fade className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <m.div className={card} initial={{ y: 16, scale: 0.95 }} animate={{ y: 0, scale: 1 }}>
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
      </m.div>
    </Fade>
  )
}

const podiumStyle = [
  { height: "h-28", color: "text-gold", order: "order-2" },
  { height: "h-20", color: "text-gray-300", order: "order-1" },
  { height: "h-14", color: "text-orange-400", order: "order-3" },
]

export function GameOverOverlay({
  scores, reason, gallery, isHost, canPlayAgain, onPlayAgain, onLeave,
}: {
  scores: Score[]
  reason?: string
  gallery: GalleryEntry[]
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
      <m.div className={`${gallery.length ? card.replace("max-w-md", "max-w-2xl") : card} max-h-[90vh] overflow-y-auto`} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}>
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
                  <m.div
                    className={`mt-2 w-full rounded-t-lg bg-panel-2 ${podiumStyle[i].height} flex items-start justify-center pt-2 font-display text-2xl font-bold ${podiumStyle[i].color}`}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ originY: 1 }}
                    transition={{ delay: 0.3 + (2 - i) * 0.15 }}
                  >
                    {rankOf(player.score)}
                  </m.div>
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
            <Gallery entries={gallery} />
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
      </m.div>
    </Fade>
  )
}
