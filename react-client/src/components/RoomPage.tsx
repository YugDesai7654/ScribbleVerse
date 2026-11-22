"use client"
import { useLocation, useNavigate, Link } from "react-router-dom"
import React, { useState, useRef, useEffect, memo } from "react"
import { m, AnimatePresence } from "framer-motion"
import { Users, PlusCircle, Paintbrush, Trophy, LogIn, LogOut, Award, UserRound } from "lucide-react"
import ThemeToggle from "./ThemeToggle"
import socket from "../socket"
import { useAuth } from "../contexts/useAuth"

// Wrap the component in memo to prevent re-renders on parent state change
const FloatingParticles = memo(function FloatingParticles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(40)].map((_, i) => (
        <m.div
          key={i}
          className="absolute w-1.5 h-1.5 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [`${Math.random() * 100}vh`, "-5vh"],
            x: [`${Math.random() * 8 - 4}vw`, `${Math.random() * 8 - 4}vw`],
            opacity: [0, 0.7, 0.7, 0],
          }}
          transition={{
            duration: 25 + Math.random() * 20,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
});


export default function RoomPage() {
  // An invite link (/room/ABC123) or a failed join sends the player here with
  // the room code and/or an error, so the form is pre-filled instead of blank.
  const location = useLocation()
  const redirect = (location.state ?? {}) as { roomCode?: string; error?: string }
  const [tab, setTab] = useState<"join" | "create">("join")
  const [name, setName] = useState(() => localStorage.getItem("name") || "")
  const [roomCode, setRoomCode] = useState(redirect.roomCode ?? "")
  const [error, setError] = useState(redirect.error ?? "")
  const [rounds, setRounds] = useState(3)
  const [timePerRound, setTimePerRound] = useState(60)
  const [maxPlayers, setMaxPlayers] = useState(8)
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  // If the player is logged in, default the name field to their account's
  // display name (they can still change it for this session if they want).
  useEffect(() => {
    if (user) setName(user.displayName)
  }, [user])

  const [isEntering, setIsEntering] = useState(false)
  const sceneRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEntering || !sceneRef.current) return
    const { clientX, clientY, currentTarget } = e
    const { left, top, width, height } = currentTarget.getBoundingClientRect()
    const x = (clientX - left - width / 2) / 30
    const y = (clientY - top - height / 2) / 30
    sceneRef.current.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`
  }

  const handleMouseLeave = () => {
    if (isEntering || !sceneRef.current) return
    sceneRef.current.style.transform = "rotateY(0deg) rotateX(0deg)"
  }

  const triggerDoorOpen = (path: string) => {
    setIsEntering(true)
    setTimeout(() => {
      navigate(path)
    }, 2500) // Extended duration for full animation sequence
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Please enter your name.")
      return
    }
    if (!roomCode.trim()) {
      setError("Please enter a room code.")
      return
    }
    const code = roomCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      setError("Room codes are 4–8 letters or numbers.")
      return
    }
    localStorage.setItem("name", name.trim())
    triggerDoorOpen(`/room/${code}`)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Please enter your name.")
      return
    }
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    localStorage.setItem("name", name.trim())

    const clamp = (value: number, min: number, max: number, fallback: number) =>
      Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

    const onSuccess = ({ roomId, hostToken }: { roomId: string; hostToken?: string }) => {
      socket.off("createRoomError", onError)
      // The creator reconnects on a fresh socket; this proves they own the host's name.
      try {
        if (hostToken) sessionStorage.setItem(`scribbleverse:host:${roomId}`, hostToken)
      } catch {
        // Storage unavailable: the host name stays reserved for a couple of minutes, then anyone can take it.
      }
      socket.disconnect()
      triggerDoorOpen(`/room/${roomId}`)
    }
    const onError = ({ message }: { message: string }) => {
      socket.off("createRoomSuccess", onSuccess)
      setError(message)
      socket.disconnect()
    }
    socket.once("createRoomSuccess", onSuccess)
    socket.once("createRoomError", onError)

    socket.connect()
    socket.emit("createRoom", {
      roomId: newRoomId,
      name: name.trim(),
      rounds: clamp(rounds, 1, 10, 3),
      timePerRound: clamp(timePerRound, 10, 300, 60),
      maxPlayers: clamp(maxPlayers, 2, 12, 8),
    })
  }

  const tabVariants = {
    active: {
      borderColor: "#f4d03f",
      color: "#ffedd2",
      backgroundColor: "rgba(255, 237, 210, 0.1)",
      transition: { duration: 0.3 },
    },
    inactive: {
      borderColor: "transparent",
      color: "#ffedd2",
      backgroundColor: "transparent",
      transition: { duration: 0.3 },
    },
  }

  const formVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { staggerChildren: 0.1, duration: 0.4 } },
    exit: { opacity: 0, y: -30, scale: 0.98, transition: { duration: 0.2 } },
  }

  const inputVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-ink text-cream p-4 sm:pt-16 overflow-hidden">
      <FloatingParticles />

      {/* Auth status bar: in the page flow on phones so it can't cover the heading (BUG-002), pinned top-right from sm up. */}
      <nav
        className="relative z-30 mb-6 flex w-full flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm sm:fixed sm:top-4 sm:right-4 sm:mb-0 sm:w-auto"
        aria-label="Account"
      >
        <Link to="/leaderboard" className="flex items-center gap-1 whitespace-nowrap text-cream/70 transition-colors hover:text-cream">
          <Award className="h-4 w-4" aria-hidden /> Leaderboard
        </Link>
        {user ? (
          <>
            <Link to="/profile" className="flex items-center gap-1 whitespace-nowrap text-cream/70 transition-colors hover:text-cream">
              <UserRound className="h-4 w-4" aria-hidden /> Profile
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="flex min-w-0 items-center gap-1 text-cream/70 transition-colors hover:text-cream"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">Log out ({user.displayName})</span>
            </button>
          </>
        ) : (
          <Link to="/login" className="flex items-center gap-1 whitespace-nowrap text-cream/70 transition-colors hover:text-cream">
            <LogIn className="h-4 w-4" aria-hidden /> Log in
          </Link>
        )}
        <ThemeToggle />
      </nav>

      {/* Zoom effect overlay */}
      <AnimatePresence>
        {isEntering && (
          <m.div
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.8 }}
          >
            <m.div
              className="text-4xl font-bold text-gold"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.2, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 0.7, delay: 2 }}
              style={{ fontFamily: "Kalam, cursive" }}
            >
              Entering...
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <m.div
        className="text-center mb-12 z-10"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <Paintbrush className="w-16 h-16 mx-auto text-gold" />
        <h1 className="text-5xl md:text-6xl font-bold mt-4" style={{ fontFamily: "Kalam, cursive" }}>
          Join the Fun
        </h1>
        <p className="text-cream/70 mt-2 text-lg">Create a private room or join your friends!</p>
      </m.div>

      {/* Enhanced 3D Scene */}
      <m.div
        className="relative w-full max-w-2xl h-[500px] z-20"
        style={{ perspective: "2000px" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        animate={{
          scale: isEntering ? 1.5 : 1,
          z: isEntering ? 200 : 0,
        }}
        transition={{ duration: 1.5, ease: [0.6, 0.01, -0.05, 0.9] }}
      >
        <m.div
          ref={sceneRef}
          className="w-full h-full relative"
          style={{ transformStyle: "preserve-3d" }}
          transition={{ duration: 0.3 }}
        >
          {/* Outer Wall Frame */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-panel-2 to-panel rounded-3xl shadow-2xl border-4 border-line"
            style={{
              transform: "translateZ(-100px)",
              boxShadow: "inset 0 0 50px rgba(0,0,0,0.5), 0 20px 40px rgba(0,0,0,0.3)",
            }}
          >
            {/* Inner Room/Antechamber */}
            <div className="absolute inset-8 bg-gradient-to-br from-soot-2 to-soot rounded-2xl overflow-hidden">
              {/* Trophy and Light Rays - Revealed when door opens */}
              <AnimatePresence>
                {isEntering && (
                  <m.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                  >
                    {/* God Rays Background */}
                    <div className="absolute inset-0">
                      {[...Array(16)].map((_, i) => (
                        <m.div
                          key={i}
                          className="absolute top-1/2 left-1/2 origin-bottom"
                          style={{
                            width: "2px",
                            height: "300px",
                            background: "linear-gradient(to top, rgba(255,215,0,0.6), transparent)",
                            transform: `rotate(${i * 22.5}deg)`,
                            transformOrigin: "bottom center",
                          }}
                          initial={{ scaleY: 0, opacity: 0 }}
                          animate={{
                            scaleY: [0, 1, 0.8, 1],
                            opacity: [0, 0.8, 0.6, 0.8],
                          }}
                          transition={{
                            duration: 2,
                            delay: 0.8 + i * 0.05,
                            repeat: Number.POSITIVE_INFINITY,
                            repeatType: "reverse",
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </div>

                    {/* Central Light Source */}
                    <m.div
                      className="absolute inset-0 bg-gradient-radial from-yellow-400/30 via-yellow-400/10 to-transparent"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 1, delay: 0.7 }}
                    />

                    {/* Trophy */}
                    <m.div
                      className="relative z-10"
                      initial={{ scale: 0, rotateY: 0 }}
                      animate={{
                        scale: [0, 1.2, 1],
                        rotateY: [0, 360, 720],
                      }}
                      transition={{
                        scale: { duration: 1, delay: 1 },
                        rotateY: { duration: 3, delay: 1, ease: "easeInOut" },
                      }}
                    >
                      <Trophy className="w-32 h-32 text-yellow-400 drop-shadow-2xl" />
                      {/* Trophy Glow */}
                      <div className="absolute inset-0 bg-yellow-400/50 blur-xl rounded-full" />
                    </m.div>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* The Door */}
          <m.div
            className="absolute inset-8 origin-left z-10"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: isEntering ? -130 : 0 }}
            transition={{ duration: 1.5, ease: [0.6, 0.01, -0.05, 0.9] }}
          >
            <div
              className="w-full h-full bg-gradient-to-br from-wood-light to-wood-deep rounded-2xl border-4 border-wood shadow-2xl relative overflow-hidden"
              style={{
                backfaceVisibility: "hidden",
                boxShadow: "0 0 30px rgba(0,0,0,0.5), inset 0 0 20px rgba(139,69,19,0.3)",
              }}
            >
              {/* Door Panels */}
              <div className="absolute top-8 left-8 right-8 bottom-8 border-2 border-wood rounded-lg">
                <div className="absolute top-4 left-4 right-4 bottom-1/2 border border-wood rounded-md" />
                <div className="absolute bottom-4 left-4 right-4 top-1/2 border border-wood rounded-md" />
              </div>

              {/* Enhanced Doorknob */}
              <div className="absolute top-1/2 -translate-y-1/2 right-2 sm:right-8">
                <div className="w-7 h-7 sm:w-10 sm:h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full shadow-lg border-2 border-yellow-300 relative">
                  <div className="absolute inset-1 bg-gradient-to-br from-yellow-300 to-yellow-400 rounded-full" />
                  <div className="absolute top-1 left-1 w-2 h-2 bg-yellow-200 rounded-full" />
                </div>
              </div>

              {/* Door Content */}
              <m.div
                className="p-8 pr-10 sm:pr-8 h-full flex flex-col justify-center"
                style={{ transform: 'translateZ(1px)' }} // <-- THE FIX IS HERE
                animate={{ opacity: isEntering ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex mb-6 bg-wood-dark p-1 rounded-lg">
                  <m.button
                    className="flex-1 py-3 text-lg font-semibold rounded-md"
                    onClick={() => {
                      setTab("join")
                      setError("")
                    }}
                    animate={tab === "join" ? "active" : "inactive"}
                    variants={tabVariants}
                    style={{ borderBottomWidth: "2px" }}
                  >
                    Join Room
                  </m.button>
                  <m.button
                    className="flex-1 py-3 text-lg font-semibold rounded-md"
                    onClick={() => {
                      setTab("create")
                      setError("")
                    }}
                    animate={tab === "create" ? "active" : "inactive"}
                    variants={tabVariants}
                    style={{ borderBottomWidth: "2px" }}
                  >
                    Create Room
                  </m.button>
                </div>

                <AnimatePresence mode="wait">
                  {tab === "join" ? (
                    <m.form
                      key="join"
                      onSubmit={handleJoin}
                      className="flex flex-col gap-4"
                      variants={formVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <m.input
                        className="bg-wood-dark border border-wood rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brass text-parchment placeholder:text-parchment/50"
                        placeholder="Your Name"
                        aria-label="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        maxLength={20}
                        variants={inputVariants}
                      />
                      <m.input
                        className="bg-wood-dark border border-wood rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brass text-parchment placeholder:text-parchment/50"
                        placeholder="Room Code"
                        aria-label="Room code"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        maxLength={8}
                        variants={inputVariants}
                      />
                      {error && <div className="text-red-400 text-sm text-center">{error}</div>}
                      <m.button
                        type="submit"
                        className="bg-gradient-to-r from-parchment to-brass text-soot font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-parchment/20 transition flex items-center justify-center gap-2 mt-2"
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        variants={inputVariants}
                      >
                        <Users className="w-5 h-5" />
                        Enter Room
                      </m.button>
                    </m.form>
                  ) : (
                    <m.form
                      key="create"
                      onSubmit={handleCreate}
                      className="flex flex-col gap-4"
                      variants={formVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <m.input
                        className="bg-wood-dark border border-wood rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brass text-parchment placeholder:text-parchment/50"
                        placeholder="Your Name"
                        aria-label="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        maxLength={20}
                        variants={inputVariants}
                      />
                      <m.div variants={inputVariants} className="grid grid-cols-3 gap-2 sm:gap-4">
                        <div className="flex-1">
                          <label className="text-sm text-parchment/70" htmlFor="room-rounds">Rounds</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-full bg-wood-dark border border-wood rounded-lg px-2 py-3 text-center focus:outline-none focus:ring-2 focus:ring-brass text-parchment"
                            id="room-rounds"
                            value={rounds}
                            onChange={(e) => setRounds(Number(e.target.value))}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-sm text-parchment/70 whitespace-nowrap" htmlFor="room-time">Time (s)</label>
                          <input
                            type="number"
                            min={10}
                            max={300}
                            step={5}
                            className="w-full bg-wood-dark border border-wood rounded-lg px-2 py-3 text-center focus:outline-none focus:ring-2 focus:ring-brass text-parchment"
                            id="room-time"
                            value={timePerRound}
                            onChange={(e) => setTimePerRound(Number(e.target.value))}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-sm text-parchment/70" htmlFor="room-players">Players</label>
                          <input
                            type="number"
                            min={2}
                            max={12}
                            className="w-full bg-wood-dark border border-wood rounded-lg px-2 py-3 text-center focus:outline-none focus:ring-2 focus:ring-brass text-parchment"
                            id="room-players"
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(Number(e.target.value))}
                          />
                        </div>
                      </m.div>
                      {error && <div className="text-red-400 text-sm text-center">{error}</div>}
                      <m.button
                        type="submit"
                        className="bg-gradient-to-r from-parchment to-brass text-soot font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-parchment/20 transition flex items-center justify-center gap-2 mt-2"
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        variants={inputVariants}
                      >
                        <PlusCircle className="w-5 h-5" />
                        Create New Room
                      </m.button>
                    </m.form>
                  )}
                </AnimatePresence>
              </m.div>
            </div>
          </m.div>
        </m.div>
      </m.div>
    </div>
  )
}
