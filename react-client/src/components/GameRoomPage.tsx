import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { AnimatePresence, m } from "framer-motion"
import { LogOut, MessageCircle, Users, Volume2, VolumeX } from "lucide-react"
import socket from "../socket"
import { useAuth } from "../contexts/useAuth"
import type { ChatMessage, DrawOp, FillOp, GalleryEntry, Player, PlayerListPayload, RoomSettings, Score, SettingsChange, StrokeSegment, SyncState, TurnSummary } from "../game/types"
import { BRUSH_SIZES, PALETTE } from "../game/types"
import { isMuted, play, setMuted } from "../game/sound"
import DrawingCanvas from "./game/DrawingCanvas"
import DrawingToolbar from "./game/DrawingToolbar"
import { strokeColor, type Tool } from "../game/utils"
import { createSegmentBatcher, type SegmentBatcher } from "../game/segmentBatcher"
import WordDisplay from "./game/WordDisplay"
import ThemeToggle from "./ThemeToggle"
import TimerRing from "./game/TimerRing"
import PlayerList from "./game/PlayerList"
import ChatPanel from "./game/ChatPanel"
import Confetti from "./game/Confetti"
import { ToastViewport } from "./game/Toasts"
import { useToasts } from "../game/useToasts"
import { CountdownOverlay, GameOverOverlay, InviteCode, LobbyPanel, ReconnectingOverlay, TurnSummaryOverlay } from "./game/Overlays"

/**
 * The seat's reconnect token lives in sessionStorage: it survives a refresh of
 * this tab but isn't shared with other tabs. Storage can throw (private mode,
 * blocked site data), in which case reconnecting just isn't available.
 */
const tokenKey = (roomId: string) => `scribbleverse:reconnect:${roomId}`
function readToken(roomId: string) {
  try {
    return sessionStorage.getItem(tokenKey(roomId)) || undefined
  } catch {
    return undefined
  }
}
function writeToken(roomId: string, token: string | null) {
  try {
    if (token) sessionStorage.setItem(tokenKey(roomId), token)
    else sessionStorage.removeItem(tokenKey(roomId))
  } catch {
    // Storage unavailable: nothing to persist.
  }
}

/** One-shot proof that this tab created the room; see RoomPage. */
const hostKey = (roomId: string) => `scribbleverse:host:${roomId}`
function readHostToken(roomId: string) {
  try {
    return sessionStorage.getItem(hostKey(roomId)) || undefined
  } catch {
    return undefined
  }
}
function clearHostToken(roomId: string) {
  try {
    sessionStorage.removeItem(hostKey(roomId))
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

/** What the room is doing right now, from this client's point of view. */
type Phase = "connecting" | "lobby" | "choosing" | "drawing" | "summary" | "over"

export default function GameRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [guestName] = useState(() => localStorage.getItem("name") || "")
  // A logged-in account's display name always wins (the server enforces this too).
  const name = user?.displayName || guestName
  // The name the server actually seated us under (see joinRoomSuccess). It can
  // differ from `name` (e.g. /auth/me failed but the cookie logged us in).
  const [seatName, setSeatName] = useState<string | null>(null)
  const me = seatName ?? name
  const meRef = useRef(me)
  meRef.current = me

  const { toasts, push: toast } = useToasts()
  const [socketId, setSocketId] = useState("")
  const [players, setPlayers] = useState<Player[]>([])
  const [hostName, setHostName] = useState("")
  const [phase, setPhase] = useState<Phase>("connecting")
  const [round, setRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(3)
  const [timePerRound, setTimePerRound] = useState(60)
  const [timer, setTimer] = useState(0)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [wordOptions, setWordOptions] = useState<string[] | null>(null)
  const [wordPattern, setWordPattern] = useState("")
  const [segments, setSegments] = useState<DrawOp[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [points, setPoints] = useState<Record<string, number>>({})
  const [gains, setGains] = useState<Record<string, { points: number; key: number }>>({})
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [countdown, setCountdown] = useState<number | null>(null)
  const [summary, setSummary] = useState<TurnSummary | null>(null)
  const [gameOver, setGameOver] = useState<{ scores: Score[]; reason?: string; gallery?: GalleryEntry[] } | null>(null)
  const [confettiKey, setConfettiKey] = useState(0)
  const [muted, setMutedState] = useState(isMuted)
  const [mobileTab, setMobileTab] = useState<"chat" | "players">("chat")
  const [settings, setSettings] = useState<RoomSettings | null>(null)
  const [connection, setConnection] = useState<"online" | "reconnecting" | "failed" | "moved">("online")

  const [tool, setTool] = useState<Tool>("brush")
  const [color, setColor] = useState<string>(PALETTE[0])
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1])

  const timerRef = useRef<number | null>(null)
  const deadlineRef = useRef(0)
  const timePerRoundRef = useRef(timePerRound)
  timePerRoundRef.current = timePerRound
  const pointsRef = useRef<Record<string, number>>({})

  const isDrawer = !!socketId && drawerId === socketId
  const iGuessed = guessed.has(me)
  const isHost = hostName === me
  const drawerName = players.find((p) => p.id === drawerId)?.name

  const kickedRef = useRef(false)
  const batcherRef = useRef<SegmentBatcher | null>(null)

  const connectedCount = players.filter((p) => p.connected !== false).length

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  // Tick sound for the last seconds; outside any state updater so StrictMode can't double it.
  useEffect(() => {
    if (phase === "drawing" && timer > 0 && timer <= 5) play("tick")
  }, [timer, phase])

  // ---- Socket wiring -------------------------------------------------------
  useEffect(() => {
    if (authLoading || !roomId || !name) return

    const startTimer = (seconds = timePerRoundRef.current) => {
      stopTimer()
      // Count down from a deadline so a throttled background tab doesn't drift.
      deadlineRef.current = Date.now() + seconds * 1000
      setTimer(seconds)
      timerRef.current = window.setInterval(() => {
        const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
        setTimer(left)
        if (left <= 0) stopTimer()
      }, 250)
    }

    kickedRef.current = false
    let joinRetries = 0
    let retryTimer: number | null = null

    /** Back to a fresh lobby: used when the server seated us as a new player. */
    const resetToLobby = () => {
      stopTimer()
      batcherRef.current?.dispose()
      setTimer(0)
      setPhase("lobby")
      setDrawerId(null)
      setSegments([])
      setWordPattern("")
      setWordOptions(null)
      setSummary(null)
      setCountdown(null)
      setGameOver(null)
      setGuessed(new Set())
    }

    const handlers: Record<string, (...args: never[]) => void> = {
      // Fires on the first connect and after every automatic reconnect. The
      // token lets the server hand back our seat instead of treating us as new.
      connect: () => {
        setSocketId(socket.id || "")
        socket.emit("joinRoom", { roomId, name, reconnectToken: readToken(roomId), hostToken: readHostToken(roomId) })
      },
      disconnect: (reason: string) => {
        // Leaving is deliberate. A server disconnect without a kick means this
        // seat was taken over (e.g. a duplicated tab); everything else is a drop.
        if (reason === "io client disconnect") return
        if (reason === "io server disconnect") {
          if (!kickedRef.current) setConnection("moved")
          return
        }
        setConnection("reconnecting")
      },
      joinRoomSuccess: (data: { reconnectToken?: string; name?: string; rejoined?: boolean }) => {
        if (data.reconnectToken) writeToken(roomId, data.reconnectToken)
        if (data.name) setSeatName(data.name)
        clearHostToken(roomId)
        joinRetries = 0
        setConnection("online")
        // A fresh seat (restart, expired seat) has no syncState: drop the old game.
        if (!data.rejoined) resetToLobby()
      },
      joinError: (data: { message: string }) => {
        // A brief limiter error must not cost us the seat: keep the token and retry.
        if (data.message.startsWith("Too many requests") && readToken(roomId) && joinRetries < 3) {
          joinRetries += 1
          toast("Busy, retrying to join…", "error")
          if (retryTimer) window.clearTimeout(retryTimer)
          retryTimer = window.setTimeout(() => {
            retryTimer = null
            socket.emit("joinRoom", { roomId, name, reconnectToken: readToken(roomId), hostToken: readHostToken(roomId) })
          }, 5000)
          return
        }
        writeToken(roomId, null)
        socket.disconnect()
        navigate("/room", { state: { roomCode: roomId, error: data.message } })
      },
      kicked: (data: { message: string }) => {
        kickedRef.current = true
        writeToken(roomId, null)
        socket.disconnect()
        navigate("/room", { state: { error: data.message } })
      },
      settingsUpdated: (next: RoomSettings) => setSettings(next),
      settingsError: (data: { message: string }) => toast(data.message, "error"),
      syncState: (state: SyncState) => {
        stopTimer()
        setTotalRounds(state.totalRounds)
        setTimePerRound(state.timePerRound)
        timePerRoundRef.current = state.timePerRound
        setRound(state.round)
        setDrawerId(state.drawerId)
        pointsRef.current = state.scores
        setPoints(state.scores)
        setGuessed(new Set(state.guessed))
        setSegments(state.strokes)
        setMessages(state.chat)
        setCountdown(null)
        setSummary(null)
        setGameOver(null)
        setWordOptions(state.wordOptions)
        setWordPattern("")
        if (state.phase === "choosing") {
          setTimer(state.timeLeft)
          setPhase("choosing")
        } else if (state.phase === "drawing" && state.word) {
          setWordPattern(state.isDrawer ? state.word.split("").join(" ") : state.word)
          setPhase("drawing")
          startTimer(state.timeLeft)
        } else if (state.phase === "intermission") {
          setPhase("summary")
        } else {
          setPhase("lobby")
        }
      },
      playerList: (data: PlayerListPayload) => {
        setPlayers(data.players)
        setHostName(data.hostName)
        if (data.drawerId !== undefined) setDrawerId(data.drawerId)
      },
      gameStarted: (data: { rounds: number; timePerRound: number }) => {
        setTotalRounds(data.rounds)
        setTimePerRound(data.timePerRound)
        timePerRoundRef.current = data.timePerRound
        setRound(1)
        setGameOver(null)
        setSummary(null)
        setPoints({})
        pointsRef.current = {}
      },
      roundStartingSoon: ({ seconds }: { seconds: number }) => {
        setSummary(null)
        setCountdown(seconds)
      },
      drawingTurn: ({ drawerId, round }: { drawerId: string; round: number }) => {
        stopTimer()
        setDrawerId(drawerId)
        setRound(round)
        setCountdown(null)
        setSummary(null)
        setSegments([])
        setGuessed(new Set())
        setWordPattern("")
        setWordOptions(null)
        setTimer(timePerRoundRef.current)
        setPhase("choosing")
        setTool("brush")
      },
      wordOptions: ({ options }: { options: string[] }) => setWordOptions(options),
      roundStart: ({ word, isDrawer }: { word: string; isDrawer: boolean }) => {
        setWordOptions(null)
        // The drawer receives the plain word; give it the same "c a t" shape as the hint pattern.
        setWordPattern(isDrawer ? word.split("").join(" ") : word)
        setPhase("drawing")
        startTimer()
        play("turnStart")
      },
      hint: ({ word }: { word: string }) => setWordPattern(word),
      turnEnded: (data: TurnSummary) => {
        stopTimer()
        setSummary(data)
        setPhase("summary")
      },
      gameOver: (data: { scores: Score[]; reason?: string; gallery?: GalleryEntry[] }) => {
        stopTimer()
        setTimer(0)
        setDrawerId(null)
        setCountdown(null)
        setSummary(null)
        setGameOver(data)
        setPhase("over")
        if (!data.reason) play("gameOver")
      },
      chatHistory: (history: ChatMessage[]) => setMessages(history),
      chatMessage: (message: ChatMessage) => {
        setMessages((prev) => [...prev.slice(-199), message])
        if (message.correct) {
          setGuessed((prev) => new Set(prev).add(message.user))
          if (message.user === meRef.current) {
            setConfettiKey((k) => k + 1)
            play("correct")
          } else {
            play("otherCorrect")
          }
        }
      },
      closeGuess: ({ text }: { text: string }) => {
        setMessages((prev) => [...prev.slice(-199), { user: meRef.current, text, timestamp: Date.now(), close: true }])
        play("close")
      },
      chatError: (data: { message: string }) => toast(data.message, "error"),
      startGameError: (data: { message: string }) => toast(data.message, "error"),
      drawing: (segment: StrokeSegment) => setSegments((prev) => [...prev, segment]),
      drawingBatch: ({ segments }: { segments: StrokeSegment[] }) => setSegments((prev) => [...prev, ...segments]),
      fill: (fill: FillOp) => setSegments((prev) => [...prev, fill]),
      strokeUndone: ({ strokeId }: { strokeId: string }) =>
        setSegments((prev) => prev.filter((segment) => segment.strokeId !== strokeId)),
      canvasCleared: () => setSegments([]),
      pointsUpdate: (next: Record<string, number>) => {
        const previous = pointsRef.current
        const now = Date.now()
        const fresh: Record<string, { points: number; key: number }> = {}
        for (const [player, score] of Object.entries(next)) {
          const delta = score - (previous[player] || 0)
          if (delta > 0) fresh[player] = { points: delta, key: now }
        }
        pointsRef.current = next
        setPoints(next)
        if (Object.keys(fresh).length) {
          setGains((g) => ({ ...g, ...fresh }))
          window.setTimeout(() => {
            setGains((g) => {
              const copy = { ...g }
              for (const player of Object.keys(fresh)) if (copy[player]?.key === now) delete copy[player]
              return copy
            })
          }, 1600)
        }
      },
    }

    // Manager-level events: Socket.IO retries on its own; these just drive the overlay.
    const onReconnectAttempt = () => setConnection("reconnecting")
    const onReconnectFailed = () => setConnection("failed")

    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler as (...args: unknown[]) => void)
    socket.io.on("reconnect_attempt", onReconnectAttempt)
    socket.io.on("reconnect_failed", onReconnectFailed)
    socket.connect()

    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler as (...args: unknown[]) => void)
      socket.io.off("reconnect_attempt", onReconnectAttempt)
      socket.io.off("reconnect_failed", onReconnectFailed)
      if (retryTimer) window.clearTimeout(retryTimer)
      socket.disconnect()
      stopTimer()
    }
  }, [roomId, name, authLoading, navigate, toast])

  // ---- Drawer actions ------------------------------------------------------
  const canDraw = isDrawer && phase === "drawing"

  // One batcher per drawing turn. Pending segments are dropped when the turn
  // ends, never sent into the next one.
  useEffect(() => {
    if (!canDraw) return
    const batcher = createSegmentBatcher((batch) => socket.emit("drawingBatch", { roomId, segments: batch }))
    batcherRef.current = batcher
    return () => {
      batcher.dispose()
      batcherRef.current = null
    }
  }, [canDraw, roomId])

  const flushSegments = useCallback(() => batcherRef.current?.flush(), [])

  const handleSegment = useCallback(
    (segment: StrokeSegment) => {
      const line = { ...segment, color: strokeColor(tool, color), size: tool === "eraser" ? Math.max(brushSize, 20) : brushSize }
      batcherRef.current?.push(line)
      setSegments((prev) => [...prev, line])
    },
    [tool, color, brushSize]
  )

  const handleFill = useCallback(
    (fill: FillOp) => {
      flushSegments() // keep the server's history in the drawer's order
      socket.emit("fill", { ...fill, roomId })
      setSegments((prev) => [...prev, fill])
    },
    [roomId, flushSegments]
  )

  const undo = useCallback(() => {
    if (!canDraw) return
    flushSegments()
    socket.emit("undoStroke", { roomId })
  }, [canDraw, roomId, flushSegments])

  const clear = () => {
    if (!canDraw) return
    flushSegments() // otherwise a pending batch would redraw after the clear
    socket.emit("clearCanvas", { roomId })
  }

  // Keyboard shortcuts for the drawer: Ctrl/Cmd+Z, B, E, [ and ].
  useEffect(() => {
    if (!canDraw) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        undo()
      } else if (e.key === "b") setTool("brush")
      else if (e.key === "e") setTool("eraser")
      else if (e.key === "f") setTool("fill")
      else if (e.key === "[" || e.key === "]") {
        setBrushSize((current) => {
          const i = BRUSH_SIZES.indexOf(current as (typeof BRUSH_SIZES)[number])
          const next = Math.min(BRUSH_SIZES.length - 1, Math.max(0, i + (e.key === "]" ? 1 : -1)))
          return BRUSH_SIZES[next]
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canDraw, undo])

  const chooseWord = (word: string) => {
    socket.emit("chooseWord", { roomId, word })
    setWordOptions(null)
  }

  const sendChat = (text: string) => socket.emit("chatMessage", { roomId, user: me, text })
  const startGame = () => socket.emit("startGame")
  const changeSettings = (change: SettingsChange) => socket.emit("updateSettings", { roomId, ...change })
  const kick = (playerId: string) => socket.emit("kickPlayer", { roomId, playerId })
  const retryConnection = () => {
    kickedRef.current = false
    setConnection("reconnecting")
    socket.connect()
  }
  const leave = () => {
    socket.disconnect()
    if (roomId) writeToken(roomId, null)
    localStorage.removeItem("roomId")
    navigate("/room")
  }
  const toggleMute = () => {
    setMuted(!muted)
    setMutedState(!muted)
  }

  const chatPlaceholder = useMemo(() => {
    if (isDrawer && (phase === "choosing" || phase === "drawing")) return "You're drawing, so chat is off"
    if (iGuessed && phase === "drawing") return "Chat with players who guessed…"
    if (phase === "drawing") return "Type your guess…"
    return "Say something…"
  }, [isDrawer, iGuessed, phase])

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-ink text-cream">Loading…</div>
  }
  if (!roomId || !name) {
    // Invite link opened without a name yet: keep the code so the join form is pre-filled.
    return <Navigate to="/room" replace state={{ roomCode: roomId }} />
  }

  const chatDisabled = isDrawer && (phase === "choosing" || phase === "drawing")
  const sidebarCard = "rounded-2xl border border-line bg-panel p-3"

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ink text-cream">
      <ToastViewport toasts={toasts} />

      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden font-display text-xl font-bold sm:inline">ScribbleVerse</span>
          <InviteCode roomId={roomId} onCopied={(t) => toast(t, "success")} />
        </div>
        <div className="flex items-center gap-2 text-sm text-cream/70">
          {phase !== "connecting" && phase !== "lobby" && phase !== "over" && (
            <span className="whitespace-nowrap rounded-lg bg-panel-2 px-2.5 py-1 tabular-nums">
              Round {round}/{totalRounds}
            </span>
          )}
          <ThemeToggle className="h-9 w-9 border-transparent bg-transparent" />
          <button type="button" onClick={toggleMute} className="rounded-lg p-2 hover:bg-panel-2" aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button type="button" onClick={leave} aria-label="Leave room" className="flex items-center gap-2 rounded-lg border border-danger/50 px-3 py-1.5 text-danger hover:bg-danger/10">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        {/* Players (desktop) */}
        <aside className={`${sidebarCard} hidden min-h-0 overflow-y-auto lg:block`}>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Users className="h-5 w-5" /> Players <span className="text-sm text-cream/50">{players.length}</span>
          </h2>
          <PlayerList players={players} points={points} hostName={hostName} selfId={socketId} drawerId={drawerId} guessed={guessed} gains={gains} />
        </aside>

        {/* Stage */}
        <main className={`relative flex min-h-0 flex-col gap-3 lg:flex-1 ${canDraw ? "flex-[5]" : "flex-[3]"}`}>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2">
            {phase === "drawing" || phase === "choosing" ? (
              <TimerRing seconds={phase === "drawing" ? timer : timePerRound} total={timePerRound} />
            ) : (
              <div className="h-14 w-14 shrink-0" aria-hidden />
            )}
            <div className="relative flex min-w-0 flex-1 justify-center">
              {phase === "drawing" && wordPattern && <WordDisplay pattern={wordPattern} isDrawer={isDrawer} />}
              {phase === "choosing" && !isDrawer && (
                <p className="text-sm text-cream/70">
                  <span className="font-semibold text-gold">{drawerName ?? "The drawer"}</span> is choosing a word…
                </p>
              )}
              {phase === "choosing" && isDrawer && !wordOptions && <p className="text-sm text-cream/70">Starting your turn…</p>}
              {phase === "connecting" && <p className="text-sm text-cream/60">Joining room…</p>}
              {phase === "lobby" && <p className="text-sm text-cream/60">Waiting for the game to start</p>}
              {phase === "summary" && <p className="text-sm text-cream/60">Next turn coming up…</p>}
              {phase === "over" && <p className="text-sm text-cream/60">Game finished</p>}
              <AnimatePresence>{confettiKey > 0 && <Confetti key={confettiKey} />}</AnimatePresence>
            </div>
            <div className="hidden w-14 sm:block" />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-panel-2/40 p-2">
            <DrawingCanvas ops={segments} canDraw={canDraw} tool={tool} color={strokeColor(tool, color)} size={brushSize} onSegment={handleSegment} onFill={handleFill} onStrokeEnd={flushSegments} />

            {/* Word choice for the drawer */}
            <AnimatePresence>
              {isDrawer && phase === "choosing" && wordOptions && (
                <m.div role="dialog" aria-modal="true" aria-labelledby="pick-word-title" className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/70 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="text-center">
                    <p id="pick-word-title" className="font-display text-xl font-bold sm:text-2xl">Pick a word to draw</p>
                    <p className="mt-0.5 text-xs text-cream/60 sm:text-sm">Auto-picks in 10 seconds</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2 sm:mt-5 sm:gap-3">
                      {wordOptions.map((word, i) => (
                        <m.button
                          key={word}
                          autoFocus={i === 0}
                          type="button"
                          onClick={() => chooseWord(word)}
                          whileHover={{ y: -3 }}
                          className="rounded-xl border border-line bg-panel px-4 py-2 font-display text-lg font-bold capitalize hover:border-gold sm:px-5 sm:py-3 sm:text-xl"
                        >
                          {word}
                        </m.button>
                      ))}
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            <AnimatePresence>{phase === "summary" && summary && <TurnSummaryOverlay summary={summary} />}</AnimatePresence>
            <AnimatePresence>
              {phase === "lobby" && (
                <LobbyPanel
                  roomId={roomId}
                  players={players}
                  connectedCount={connectedCount}
                  isHost={isHost}
                  hostName={hostName}
                  selfId={socketId}
                  settings={settings}
                  onSettingsChange={changeSettings}
                  onKick={kick}
                  onStart={startGame}
                  onCopied={(t) => toast(t, "success")}
                />
              )}
            </AnimatePresence>
          </div>

          {canDraw && (
            <DrawingToolbar
              tool={tool}
              color={color}
              size={brushSize}
              canUndo={segments.length > 0}
              onTool={setTool}
              onColor={setColor}
              onSize={setBrushSize}
              onUndo={undo}
              onClear={clear}
            />
          )}
        </main>

        {/* Chat (desktop) / tabbed chat + players (mobile) */}
        <aside className={`${sidebarCard} flex min-h-0 flex-[2] flex-col lg:flex-1`}>
          <div className="mb-2 flex gap-1 lg:hidden" role="tablist">
            {(["chat", "players"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={mobileTab === tab}
                onClick={() => setMobileTab(tab)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold ${mobileTab === tab ? "bg-panel-2 text-cream" : "text-cream/50"}`}
              >
                {tab === "chat" ? <MessageCircle className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                {tab === "chat" ? "Chat" : `Players (${players.length})`}
              </button>
            ))}
          </div>
          <h2 className="mb-2 hidden items-center gap-2 font-display text-lg font-bold lg:flex">
            <MessageCircle className="h-5 w-5" /> Chat
          </h2>
          <div className={`min-h-0 flex-1 overflow-y-auto lg:hidden ${mobileTab === "players" ? "block" : "hidden"}`}>
            <PlayerList players={players} points={points} hostName={hostName} selfId={socketId} drawerId={drawerId} guessed={guessed} gains={gains} />
          </div>
          <div className={`min-h-0 flex-1 ${mobileTab === "chat" ? "flex" : "hidden"} flex-col lg:flex`}>
            <ChatPanel messages={messages} disabled={chatDisabled} placeholder={chatPlaceholder} onSend={sendChat} />
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {connection !== "online" && <ReconnectingOverlay state={connection} onRetry={retryConnection} onLeave={leave} />}
      </AnimatePresence>
      <AnimatePresence>
        {countdown !== null && phase !== "over" && <CountdownOverlay seconds={countdown} />}
        {phase === "over" && gameOver && (
          <GameOverOverlay
            scores={gameOver.scores}
            reason={gameOver.reason}
            gallery={gameOver.gallery ?? []}
            isHost={isHost}
            canPlayAgain={connectedCount >= 2}
            onPlayAgain={startGame}
            onLeave={leave}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
