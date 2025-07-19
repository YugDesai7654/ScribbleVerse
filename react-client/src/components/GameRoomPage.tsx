"use client"
import { useNavigate, useParams, Navigate } from "react-router-dom"
import type React from "react"

import { useState, useEffect, useRef, useMemo } from "react"
import socket from "../socket"
import DrawingCanvas, { type DrawLine } from "./DrawingCanvas"
import { motion, AnimatePresence } from "framer-motion"
import { LogOut, Send, Users, Clock, Edit, Trophy, Eraser, Crown, MessageCircle, X } from "lucide-react"

type Score = { name: string; score: number }
type Player = { id: string; name: string }

// Helper to generate a consistent color from a string (like a player's name)
const stringToColor = (str: string) => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  let color = "#"
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff
    color += ("00" + value.toString(16)).substr(-2)
  }
  return color
}

// New PlayerCard component for the sidebar
const PlayerCard = ({
  player,
  points,
  isHost,
  isYou,
  isDrawer,
}: { player: Player; points: number; isHost: boolean; isYou: boolean; isDrawer: boolean }) => {
  const avatarColor = useMemo(() => stringToColor(player.name), [player.name])
  const initial = player.name.charAt(0).toUpperCase()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`p-3 rounded-lg flex items-center gap-3 transition-all duration-300 border-2 ${isDrawer ? "bg-orange-400/20 border-orange-400" : "bg-[#282828] border-transparent"}`}
    >
      <div
        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-white text-lg sm:text-xl"
        style={{ backgroundColor: avatarColor }}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-white truncate text-sm sm:text-base">{player.name}</p>
          {isHost && (
            <span title="Host">
              <Crown className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
            </span>
          )}
          {isDrawer && (
            <span title="Drawing">
              <Edit className="w-3 h-3 sm:w-4 sm:h-4 text-orange-400" />
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-purple-400 font-semibold">{points} pts</p>
      </div>
      {isYou && <span className="text-xs font-bold text-green-400">YOU</span>}
    </motion.div>
  )
}

export default function GameRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [name] = useState(() => localStorage.getItem("name") || "")
  const [joined, setJoined] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [hostName, setHostName] = useState<string>("")
  const [gameStarted, setGameStarted] = useState(false)
  const [chatMessages, setChatMessages] = useState<
    { user: string; text: string; timestamp: number; correct?: boolean }[]
  >([])
  const [chatInput, setChatInput] = useState("")
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [drawLines, setDrawLines] = useState<DrawLine[]>([])
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(3)
  const [timePerRound, setTimePerRound] = useState(60)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [timer, setTimer] = useState<number>(60)
  const [socketId, setSocketId] = useState<string>("")
  const [wordOptions, setWordOptions] = useState<string[] | null>(null)
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [showWordOptions, setShowWordOptions] = useState(false)
  const [displayWord, setDisplayWord] = useState<string>("")
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null)
  const [points, setPoints] = useState<{ [name: string]: number }>({})
  const [gameOverInfo, setGameOverInfo] = useState<{ scores: Score[]; reason?: string } | null>(null)

  // Mobile responsive states
  const [showPlayers, setShowPlayers] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 500 })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timePerRoundRef = useRef(timePerRound)
  timePerRoundRef.current = timePerRound

  // Refs for dynamic layout calculation
  const mainContentRef = useRef<HTMLElement>(null)
  const gameInfoBarRef = useRef<HTMLDivElement>(null)
  const wordAreaRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // Memoized sorted players list
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => (points[b.name] || 0) - (points[a.name] || 0))
  }, [players, points])

  // Handle canvas resize based on screen size
  useEffect(() => {
    const updateCanvasSize = () => {
      const width = window.innerWidth

      if (width < 1024) {
        // Keep existing mobile/tablet logic
        if (width < 640) {
          // mobile
          setCanvasSize({ width: Math.min(width - 32, 350), height: 250 })
        } else {
          // tablet
          setCanvasSize({ width: Math.min(width - 64, 500), height: 350 })
        }
      } else {
        // New dynamic logic for desktop (lg+) to avoid scrolling
        if (mainContentRef.current && gameInfoBarRef.current && wordAreaRef.current && canvasContainerRef.current) {
          // Get total available height for the main column flex container
          const mainContentHeight = mainContentRef.current.clientHeight

          // Get heights of other elements in the column
          const gameInfoHeight = gameInfoBarRef.current.offsetHeight
          const wordAreaHeight = wordAreaRef.current.offsetHeight

          // The main column has lg:gap-2 -> 0.5rem (8px). There are two gaps.
          const totalGapsHeight = 16

          // The canvas container fills the remaining space.
          const canvasContainerHeight = mainContentHeight - gameInfoHeight - wordAreaHeight - totalGapsHeight

          // The canvas container itself has lg:p-2 padding (8px top/bottom).
          const canvasContainerPaddingY = 16
          const finalCanvasHeight = canvasContainerHeight - canvasContainerPaddingY

          // Calculate width based on the flex-item's actual rendered width
          const mainContentWidth = mainContentRef.current.clientWidth

          // Canvas container has lg:p-2 padding (8px left/right).
          const canvasContainerPaddingX = 16
          const finalCanvasWidth = mainContentWidth - canvasContainerPaddingX

          setCanvasSize({
            width: finalCanvasWidth,
            height: finalCanvasHeight,
          })
        }
      }
    }

    // Run once after initial layout and then on resize
    // Using a timeout allows the refs to be populated and layout to be calculated
    const timerId = setTimeout(updateCanvasSize, 100)
    window.addEventListener("resize", updateCanvasSize)

    return () => {
      clearTimeout(timerId)
      window.removeEventListener("resize", updateCanvasSize)
    }
  }, []) // Run only on mount

  useEffect(() => {
    if (!roomId || !name) {
      navigate("/room")
      return
    }

    socket.connect()
    socket.on("connect", () => {
      setSocketId(socket.id || "")
      socket.emit("joinRoom", { roomId, name })
    })

    socket.on("joinRoomSuccess", () => {
      setJoined(true)
      localStorage.setItem("roomId", roomId || "")
    })

    socket.on("joinError", (data: { message: string }) => {
      alert(data.message)
      socket.disconnect()
      navigate("/room")
    })

    socket.on("playerList", (data) => {
      setPlayers(data.players)
      setHostName(data.hostName)
    })

    socket.on("gameStarted", (data) => {
      setGameStarted(true)
      setGameOverInfo(null)
      setTotalRounds(data.rounds)
      setTimePerRound(data.timePerRound)
      setCurrentRound(1)
      setPoints({})
    })

    socket.on("roundStartingSoon", ({ seconds }) => {
      setRoundCountdown(seconds)
      setDisplayWord("")
    })

    socket.on("drawingTurn", ({ drawerId, round }) => {
      setDrawerId(drawerId)
      setCurrentRound(round)
      setTimer(timePerRoundRef.current)
      setRoundCountdown(null)
      setDrawLines([])

      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            // NOTE: The client no longer tells the server when the turn ends.
            // The server is now the authority on turn duration.
            return 0
          }
          return prev - 1
        })
      }, 1000)
    })

    socket.on("gameOver", (data: { scores: Score[]; reason?: string }) => {
      setGameStarted(false)
      setDrawerId(null)
      if (timerRef.current) clearInterval(timerRef.current)
      setTimer(0)
      setGameOverInfo(data)
    })

    socket.on("chatHistory", (history) => setChatMessages(history))
    socket.on("chatMessage", (msg) => setChatMessages((prev) => [...prev, msg]))

    const handleDrawing = (line: DrawLine) => {
      setDrawLines((prev) => [...prev, line])
    }
    socket.on("drawing", handleDrawing)

    socket.on("canvasCleared", () => {
      setDrawLines([])
    })

    socket.on("wordOptions", ({ options }) => {
      setWordOptions(options)
      setShowWordOptions(true)
      setSelectedWord(null)
      setDisplayWord("")
    })

    socket.on("roundStart", ({ word }) => {
      setShowWordOptions(false)
      setWordOptions(null)
      setSelectedWord(null)
      setDisplayWord(word)
    })

    socket.on("pointsUpdate", (pts) => setPoints(pts))

    return () => {
      socket.off("connect")
      socket.off("joinRoomSuccess")
      socket.off("joinError")
      socket.off("playerList")
      socket.off("gameStarted")
      socket.off("drawingTurn")
      socket.off("gameOver")
      socket.off("chatHistory")
      socket.off("chatMessage")
      socket.off("drawing", handleDrawing)
      socket.off("canvasCleared")
      socket.off("wordOptions")
      socket.off("roundStart")
      socket.off("roundStartingSoon")
      socket.off("pointsUpdate")

      socket.disconnect()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [roomId, name, navigate])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatMessages])

  if (!roomId || !name) {
    return <Navigate to="/room" replace />
  }

  const handleStartGame = () => {
    socket.emit("startGame")
  }

  const handleLeaveRoom = () => {
    socket.disconnect()
    localStorage.removeItem("roomId")
    navigate("/room")
  }

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || drawerId === socket.id) return
    socket.emit("chatMessage", { roomId, user: name, text: chatInput })
    setChatInput("")
  }

  const handleDrawLine = (line: DrawLine) => {
    socket.emit("drawing", { ...line, roomId })
    setDrawLines((prev) => [...prev, line])
  }

  const handleWordSelect = (word: string) => {
    if (!roomId || !wordOptions || selectedWord) return
    setSelectedWord(word)
    socket.emit("chooseWord", { roomId, word, round: currentRound })
  }

  const handleClearCanvas = () => {
    if (isDrawer) {
      socket.emit("clearCanvas", { roomId })
    }
  }

  const isHost = hostName === name
  const isDrawer = drawerId === socket.id
  const drawerName = players.find((p) => p.id === drawerId)?.name || "..."

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0d] text-[#ffedd2] overflow-hidden">
      <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-3 lg:py-3 bg-[#1f1f1f] border-b border-[#3e3e3e] flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg sm:text-2xl lg:text-2xl font-bold truncate" style={{ fontFamily: "Kalam, cursive" }}>
            Room: {roomId}
          </h1>

          {/* Mobile menu buttons */}
          <div className="flex gap-2 lg:hidden">
            <motion.button
              onClick={() => setShowPlayers(!showPlayers)}
              className="bg-[#282828] text-white p-2 rounded-lg flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Users className="w-4 h-4" />
              <span className="text-xs">{players.length}</span>
            </motion.button>
            <motion.button
              onClick={() => setShowChat(!showChat)}
              className="bg-[#282828] text-white p-2 rounded-lg flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <MessageCircle className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        <motion.button
          onClick={handleLeaveRoom}
          className="bg-red-500 text-white px-3 py-2 sm:px-4 lg:px-4 lg:py-2 rounded-lg flex items-center gap-2 text-sm sm:text-base lg:text-base"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <LogOut className="w-4 h-4 sm:w-5 sm:h-5 lg:w-5 lg:h-5" />
          <span className="hidden sm:inline">Leave Room</span>
        </motion.button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Players Sidebar - Desktop always visible, Mobile overlay */}
        <aside
          className={`
          ${showPlayers ? "translate-x-0" : "-translate-x-full"} 
          lg:translate-x-0 lg:relative lg:w-72
          fixed inset-y-0 left-0 z-30 w-80 max-w-[90vw]
          bg-[#1f1f1f] border-r border-[#3e3e3e] 
          transition-transform duration-300 ease-in-out
          flex flex-col
        `}
        >
          <div className="p-4 lg:p-3 flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-4 lg:mb-3">
              <h3
                className="text-lg sm:text-xl lg:text-lg font-bold flex items-center gap-2"
                style={{ fontFamily: "Kalam, cursive" }}
              >
                <Users className="w-5 h-5 sm:w-6 sm:h-6 lg:w-5 lg:h-5" /> Players
              </h3>
              <button onClick={() => setShowPlayers(false)} className="lg:hidden p-1 hover:bg-[#282828] rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 lg:space-y-1 pr-2">
              <AnimatePresence>
                {sortedPlayers.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    points={points[p.name] || 0}
                    isHost={p.name === hostName}
                    isYou={p.id === socketId}
                    isDrawer={p.id === drawerId}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </aside>

        {/* Main Game Area */}
        <main
          ref={mainContentRef}
          className="flex-1 flex flex-col p-4 sm:p-8 lg:p-3 gap-4 lg:gap-2 min-w-0 overflow-hidden"
        >
          {/* Game Info Bar */}
          <div
            ref={gameInfoBarRef}
            className="flex flex-wrap justify-between items-center gap-2 text-sm sm:text-base lg:text-sm text-[#ffedd2]/80 bg-[#1f1f1f] rounded-lg p-3 lg:p-2 flex-shrink-0"
          >
            <div className="font-semibold">
              Round: {currentRound} / {totalRounds}
            </div>
            <div className="font-semibold flex items-center gap-1">
              <Clock className="w-4 h-4" /> {timer}s
            </div>
            <div className="font-semibold flex items-center gap-1 truncate">
              <Edit className="w-4 h-4" />
              <span className="hidden sm:inline">Drawing:</span> {drawerName}
            </div>
          </div>

          {/* Canvas Area with Floating Eraser Button */}
          <div
        ref={canvasContainerRef}
        className="flex-1 bg-[#0d0d0d] rounded-2xl border border-[#3e3e3e] flex flex-col items-center justify-center p-4 lg:p-2 min-h-0 relative overflow-hidden"
      >
        {/* Floating Eraser Button - Only visible on lg+ screens when user is drawer */}
        {isDrawer && gameStarted && (
          <motion.button
            onClick={handleClearCanvas}
            // This className controls the visibility and positioning
            className="absolute top-4 right-4 z-10 bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg transition-colors hidden lg:flex items-center justify-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Clear Canvas"
          >
            <Eraser className="w-6 h-6" />
          </motion.button>
        )}

        <DrawingCanvas
          width={canvasSize.width}
          height={canvasSize.height}
          onDrawLine={handleDrawLine}
          remoteLines={drawLines}
          canDraw={isDrawer && gameStarted && !showWordOptions}
        />
        </div>

          {/* Canvas Controls - Only show on mobile/tablet (below lg) */}
          <div className="flex justify-center items-center h-12 lg:hidden">
            {isDrawer && gameStarted && (
              <motion.button
                onClick={handleClearCanvas}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors text-sm sm:text-base"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Eraser className="w-4 h-4 sm:w-5 sm:h-5" />
                Clear Canvas
              </motion.button>
            )}
          </div>

          {/* Word Display Area */}
          <div
            ref={wordAreaRef}
            className="h-20 sm:h-24 lg:h-24 flex flex-col items-center justify-center bg-[#1f1f1f] border border-[#3e3e3e] rounded-2xl p-4 lg:p-2 flex-shrink-0"
          >
            {isDrawer && showWordOptions && wordOptions && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center w-full">
                <div className="mb-2 lg:mb-2 font-semibold text-sm sm:text-base lg:text-base">
                  Choose a word to draw (10s):
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-4 lg:gap-2 justify-center">
                  {wordOptions.map((word) => (
                    <motion.button
                      key={word}
                      className={`px-3 py-2 sm:px-4 lg:px-4 lg:py-2 rounded-lg border font-bold transition text-sm sm:text-base lg:text-base ${selectedWord === word ? "bg-[#ffedd2] text-[#0d0d0d]" : "bg-[#282828] border-[#3e3e3e] hover:bg-[#ffedd2]/20"}`}
                      onClick={() => handleWordSelect(word)}
                      disabled={!!selectedWord}
                      whileHover={{ y: -2 }}
                    >
                      {word}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
            {displayWord && (
              <span
                className="text-xl sm:text-3xl lg:text-xl font-bold tracking-widest text-center"
                style={{ fontFamily: "Kalam, cursive" }}
              >
                {isDrawer ? `Your word is: ${displayWord}` : displayWord}
              </span>
            )}
            {!gameStarted && !gameOverInfo && (
              <span className="text-lg sm:text-xl lg:text-base font-bold tracking-widest text-[#ffedd2]/70 text-center">
                Waiting for host to start the game...
              </span>
            )}
          </div>
        </main>

        {/* Chat Sidebar - Desktop always visible, Mobile overlay */}
        <aside
          className={`
          ${showChat ? "translate-x-0" : "translate-x-full"} 
          lg:translate-x-0 lg:relative lg:w-80
          fixed inset-y-0 right-0 z-30 w-80 max-w-[90vw]
          bg-[#1f1f1f] border-l border-[#3e3e3e] 
          transition-transform duration-300 ease-in-out
          flex flex-col
        `}
        >
          <div className="p-4 lg:p-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 lg:mb-3">
              <h3 className="text-lg sm:text-xl lg:text-lg font-bold" style={{ fontFamily: "Kalam, cursive" }}>
                Chat
              </h3>
              <button onClick={() => setShowChat(false)} className="lg:hidden p-1 hover:bg-[#282828] rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mb-2 pr-2 space-y-2 lg:space-y-1 min-h-0">
              <AnimatePresence initial={false}>
                {chatMessages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    className={`text-sm lg:text-sm ${msg.correct ? "text-green-400 font-bold" : "text-[#ffedd2]/90"}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="font-semibold text-[#ffedd2]">{msg.user}:</span> {msg.text}
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>

            <form className="flex gap-2" onSubmit={handleChatSubmit}>
              <input
                className="flex-1 bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-3 py-2 lg:px-3 lg:py-2 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2] disabled:opacity-50 text-sm lg:text-sm"
                placeholder={isDrawer ? "You can't chat while drawing" : "Type your guess..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={!joined || !gameStarted || isDrawer}
              />
              <motion.button
                type="submit"
                className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] px-3 py-2 sm:px-4 lg:px-3 lg:py-2 rounded-lg disabled:opacity-50"
                disabled={!joined || !chatInput.trim() || !gameStarted || isDrawer}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5 lg:w-5 lg:h-5" />
              </motion.button>
            </form>
          </div>
        </aside>

        {/* Mobile overlay backdrop */}
        {(showPlayers || showChat) && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => {
              setShowPlayers(false)
              setShowChat(false)
            }}
          />
        )}
      </div>

      {/* All your existing modals remain exactly the same */}
      <AnimatePresence>
        {!gameStarted && isHost && !gameOverInfo && (
          <motion.div
            className="absolute inset-0 bg-black/60 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-[#1f1f1f] p-6 sm:p-8 rounded-2xl text-center border border-[#3e3e3e] w-full max-w-md"
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
            >
              <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ fontFamily: "Kalam, cursive" }}>
                Ready to Play?
              </h2>
              <p className="text-[#ffedd2]/70 mb-6">Waiting for players to join...</p>
              <motion.button
                onClick={handleStartGame}
                disabled={players.length < 2}
                className="mt-4 bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 px-6 sm:px-8 rounded-full hover:shadow-lg hover:shadow-[#ffedd2]/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                Start Game
              </motion.button>
              {players.length < 2 && <p className="text-sm text-red-400 mt-2">Need at least 2 players to start.</p>}
            </motion.div>
          </motion.div>
        )}
        {roundCountdown !== null && (
          <motion.div
            className="absolute inset-0 bg-black/60 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-3xl sm:text-4xl font-bold text-orange-500 text-center p-6 sm:p-8 bg-[#1f1f1f] rounded-2xl border border-[#3e3e3e]">
              Next round starts in {roundCountdown}...
              <p className="text-lg sm:text-xl mt-4 text-[#ffedd2]">Get Ready!</p>
            </div>
          </motion.div>
        )}
        {gameOverInfo && (
          <motion.div
            className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-[#1f1f1f] p-6 sm:p-8 rounded-2xl text-center border border-[#3e3e3e] w-full max-w-md max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <h2
                className="text-3xl sm:text-5xl font-bold mb-4 text-[#f4d03f]"
                style={{ fontFamily: "Kalam, cursive" }}
              >
                Game Over!
              </h2>

              {gameOverInfo.reason ? (
                <p className="text-lg sm:text-xl text-red-400 mt-6">{gameOverInfo.reason}</p>
              ) : (
                <>
                  <div className="mb-6 mt-4">
                    <Trophy className="w-16 h-16 sm:w-24 sm:h-24 text-yellow-400 mx-auto" />
                    <p className="text-lg sm:text-xl mt-2">Winner</p>
                    <p className="text-2xl sm:text-3xl font-bold text-white">
                      {gameOverInfo.scores[0]?.name || "No one"}
                    </p>
                    <p className="text-base sm:text-lg text-yellow-400">{gameOverInfo.scores[0]?.score || 0} points</p>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-4" style={{ fontFamily: "Kalam, cursive" }}>
                    Final Scores
                  </h3>
                  <ul className="space-y-2 text-left max-h-48 overflow-y-auto pr-2">
                    {gameOverInfo.scores.map((player, index) => (
                      <li
                        key={player.name}
                        className={`flex justify-between items-center p-3 rounded-lg ${index === 0 ? "bg-yellow-400/20 border border-yellow-400" : "bg-[#282828]"}`}
                      >
                        <span className="font-semibold text-base sm:text-lg flex items-center gap-2">
                          {index === 0 && <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />}
                          {index === 1 && <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />}
                          {index === 2 && <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />}
                          {index > 2 && (
                            <span className="w-4 sm:w-5 text-center text-sm sm:text-base">{index + 1}</span>
                          )}
                          <span className="truncate">{player.name}</span>
                        </span>
                        <span className="font-bold text-purple-400 text-sm sm:text-base">{player.score} points</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <motion.button
                onClick={handleLeaveRoom}
                className="mt-6 sm:mt-8 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 sm:px-8 rounded-full transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Leave Room
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}