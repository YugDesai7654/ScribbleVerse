"use client"
import { useNavigate } from "react-router-dom"
// Import "memo" here
import React, { useState, useRef, memo } from "react" 
import { io } from "socket.io-client"
import { motion, AnimatePresence } from "framer-motion"
import { Users, PlusCircle, Paintbrush, Trophy } from "lucide-react"

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const socket = io(SOCKET_URL, { autoConnect: false })

// Wrap the component in memo to prevent re-renders on parent state change
const FloatingParticles = memo(function FloatingParticles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(40)].map((_, i) => (
        <motion.div
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
  const [tab, setTab] = useState<"join" | "create">("join")
  const [name, setName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [error, setError] = useState("")
  const [rounds, setRounds] = useState(3)
  const [timePerRound, setTimePerRound] = useState(60)
  const navigate = useNavigate()

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
    localStorage.setItem("name", name.trim())
    triggerDoorOpen(`/room/${roomCode.trim()}`)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Please enter your name.")
      return
    }
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    localStorage.setItem("name", name.trim())

    socket.connect()
    socket.emit("createRoom", {
      roomId: newRoomId,
      name: name.trim(),
      rounds,
      timePerRound,
    })

    socket.once("createRoomSuccess", ({ roomId }) => {
      triggerDoorOpen(`/room/${roomId}`)
    })

    socket.once("createRoomError", ({ message }) => {
      setError(message)
      socket.disconnect()
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0d0d] text-[#ffedd2] p-4 overflow-hidden">
      <FloatingParticles />
      <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />

      {/* Zoom effect overlay */}
      <AnimatePresence>
        {isEntering && (
          <motion.div
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.8 }}
          >
            <motion.div
              className="text-4xl font-bold text-[#f4d03f]"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.2, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 0.7, delay: 2 }}
              style={{ fontFamily: "Kalam, cursive" }}
            >
              Entering...
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="text-center mb-12 z-10"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <Paintbrush className="w-16 h-16 mx-auto text-[#f4d03f]" />
        <h1 className="text-5xl md:text-6xl font-bold mt-4" style={{ fontFamily: "Kalam, cursive" }}>
          Join the Fun
        </h1>
        <p className="text-[#ffedd2]/70 mt-2 text-lg">Create a private room or join your friends!</p>
      </motion.div>

      {/* Enhanced 3D Scene */}
      <motion.div
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
        <motion.div
          ref={sceneRef}
          className="w-full h-full relative"
          style={{ transformStyle: "preserve-3d" }}
          transition={{ duration: 0.3 }}
        >
          {/* Outer Wall Frame */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded-3xl shadow-2xl border-4 border-[#444]"
            style={{
              transform: "translateZ(-100px)",
              boxShadow: "inset 0 0 50px rgba(0,0,0,0.5), 0 20px 40px rgba(0,0,0,0.3)",
            }}
          >
            {/* Inner Room/Antechamber */}
            <div className="absolute inset-8 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-2xl overflow-hidden">
              {/* Trophy and Light Rays - Revealed when door opens */}
              <AnimatePresence>
                {isEntering && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                  >
                    {/* God Rays Background */}
                    <div className="absolute inset-0">
                      {[...Array(16)].map((_, i) => (
                        <motion.div
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
                    <motion.div
                      className="absolute inset-0 bg-gradient-radial from-yellow-400/30 via-yellow-400/10 to-transparent"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 1, delay: 0.7 }}
                    />

                    {/* Trophy */}
                    <motion.div
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
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* The Door */}
          <motion.div
            className="absolute inset-8 origin-left"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: isEntering ? -130 : 0 }}
            transition={{ duration: 1.5, ease: [0.6, 0.01, -0.05, 0.9] }}
          >
            <div
              className="w-full h-full bg-gradient-to-br from-[#4a2e1a] to-[#2c1a0e] rounded-2xl border-4 border-[#5e3a22] shadow-2xl relative overflow-hidden"
              style={{
                backfaceVisibility: "hidden",
                boxShadow: "0 0 30px rgba(0,0,0,0.5), inset 0 0 20px rgba(139,69,19,0.3)",
              }}
            >
              {/* Door Panels */}
              <div className="absolute top-8 left-8 right-8 bottom-8 border-2 border-[#5e3a22] rounded-lg">
                <div className="absolute top-4 left-4 right-4 bottom-1/2 border border-[#5e3a22] rounded-md" />
                <div className="absolute bottom-4 left-4 right-4 top-1/2 border border-[#5e3a22] rounded-md" />
              </div>

              {/* Enhanced Doorknob */}
              <div className="absolute top-1/2 -translate-y-1/2 right-8">
                <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full shadow-lg border-2 border-yellow-300 relative">
                  <div className="absolute inset-1 bg-gradient-to-br from-yellow-300 to-yellow-400 rounded-full" />
                  <div className="absolute top-1 left-1 w-2 h-2 bg-yellow-200 rounded-full" />
                </div>
              </div>

              {/* Door Content */}
              <motion.div
                className="p-8 h-full flex flex-col justify-center"
                animate={{ opacity: isEntering ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex mb-6 bg-[#1a0f07] p-1 rounded-lg">
                  <motion.button
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
                  </motion.button>
                  <motion.button
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
                  </motion.button>
                </div>

                <AnimatePresence mode="wait">
                  {tab === "join" ? (
                    <motion.form
                      key="join"
                      onSubmit={handleJoin}
                      className="flex flex-col gap-4"
                      variants={formVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <motion.input
                        className="bg-[#1a0f07] border border-[#5e3a22] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                        placeholder="Your Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        variants={inputVariants}
                      />
                      <motion.input
                        className="bg-[#1a0f07] border border-[#5e3a22] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                        placeholder="Room Code"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        variants={inputVariants}
                      />
                      {error && <div className="text-red-400 text-sm text-center">{error}</div>}
                      <motion.button
                        type="submit"
                        className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2 mt-2"
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        variants={inputVariants}
                      >
                        <Users className="w-5 h-5" />
                        Enter Room
                      </motion.button>
                    </motion.form>
                  ) : (
                    <motion.form
                      key="create"
                      onSubmit={handleCreate}
                      className="flex flex-col gap-4"
                      variants={formVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <motion.input
                        className="bg-[#1a0f07] border border-[#5e3a22] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                        placeholder="Your Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        variants={inputVariants}
                      />
                      <motion.div variants={inputVariants} className="flex gap-4">
                        <div className="flex-1">
                          <label className="text-sm text-[#ffedd2]/70">Rounds</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-full bg-[#1a0f07] border border-[#5e3a22] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2]"
                            value={rounds}
                            onChange={(e) => setRounds(Number(e.target.value))}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-sm text-[#ffedd2]/70">Time (sec)</label>
                          <input
                            type="number"
                            min={10}
                            max={300}
                            step={5}
                            className="w-full bg-[#1a0f07] border border-[#5e3a22] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2]"
                            value={timePerRound}
                            onChange={(e) => setTimePerRound(Number(e.target.value))}
                          />
                        </div>
                      </motion.div>
                      {error && <div className="text-red-400 text-sm text-center">{error}</div>}
                      <motion.button
                        type="submit"
                        className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2 mt-2"
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        variants={inputVariants}
                      >
                        <PlusCircle className="w-5 h-5" />
                        Create New Room
                      </motion.button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}