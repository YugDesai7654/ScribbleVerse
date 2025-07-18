"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { useState, useEffect, useRef } from "react"
import { Palette, Users, Crown, Trophy, MessageCircle, Play, ArrowRight, Sparkles, Zap, Target } from "lucide-react"
import SplashCursor from "./SplashCursor"

// Cursor Trail Component
function CursorTrail() {
  const [trail, setTrail] = useState<Array<{ x: number; y: number; id: number; timestamp: number }>>([])
  const trailRef = useRef<Array<{ x: number; y: number; id: number; timestamp: number }>>([])
  const idCounter = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const newPoint = {
        x: e.clientX,
        y: e.clientY,
        id: idCounter.current++,
        timestamp: Date.now(),
      }

      trailRef.current = [...trailRef.current, newPoint].slice(-50) // Keep last 50 points
      setTrail([...trailRef.current])
    }

    // Clean up old points
    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      trailRef.current = trailRef.current.filter((point) => now - point.timestamp < 2000) // Keep points for 2 seconds
      setTrail([...trailRef.current])
    }, 100)

    document.addEventListener("mousemove", handleMouseMove)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      clearInterval(cleanupInterval)
    }
  }, [])

  if (trail.length < 2) return null

  // Create SVG path from trail points
  const pathData = trail.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`
    }
    return `${path} L ${point.x} ${point.y}`
  }, "")

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      <svg className="w-full h-full">
        <defs>
          <linearGradient id="trailGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffedd2" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffedd2" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffedd2" stopOpacity="0.9" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {trail.length > 1 && (
          <motion.path
            d={pathData}
            stroke="url(#trailGradient)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        )}

        {/* Add sparkle effects along the trail */}
        {trail.slice(-10).map((point, index) => {
          const age = Date.now() - point.timestamp
          const opacity = Math.max(0, 1 - age / 2000)

          return (
            <motion.circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r="2"
              fill="#ffedd2"
              opacity={opacity * 0.7}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          )
        })}
      </svg>
    </div>
  )
}

// Floating particles background
function FloatingParticles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-[#ffedd2] rounded-full opacity-20"
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
            opacity: [0.2, 0.5, 0.2],
          }}
          transition={{
            duration: 10 + i * 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}
    </div>
  )
}

// Hero Section
function HeroSection() {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 500], [0, 150])

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <FloatingParticles />

      <motion.div style={{ y }} className="container mx-auto px-6 text-center z-10">
        <motion.h1
          className="text-6xl md:text-8xl font-bold text-[#ffedd2] mb-6"
          style={{ fontFamily: "Kalam, cursive" }}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          Scribble, Guess, Conquer!
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl text-[#ffedd2] opacity-80 mb-8 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          One player draws, others guess in real-time. Create rooms, challenge friends, earn rewards, and chat your way
          to victory!
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <motion.button
            className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] px-8 py-4 rounded-full font-bold text-lg flex items-center gap-2 hover:shadow-lg hover:shadow-[#ffedd2]/20 transition-all duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Play className="w-5 h-5" />
            Start Playing Now
          </motion.button>

          <motion.button
            className="border-2 border-[#ffedd2] text-[#ffedd2] px-8 py-4 rounded-full font-bold text-lg hover:bg-[#ffedd2] hover:text-[#0d0d0d] transition-all duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Watch Demo
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Animated Drawing Element */}
      <div className="absolute right-10 top-1/2 transform -translate-y-1/2 w-64 h-64 hidden lg:block">
        <motion.div
          className="relative w-full h-full flex items-center justify-center"
          animate={{
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 4,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          {/* Pencil Icon */}
          <motion.div
            className="absolute"
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            <Palette className="w-24 h-24 text-[#ffedd2]" />
          </motion.div>

          {/* Drawing Lines */}
          <motion.div
            className="absolute top-20 left-16"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 3,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            <svg width="100" height="60" className="text-[#ffedd2]">
              <motion.path
                d="M10,30 Q30,10 50,30 T90,30"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: 2,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }}
              />
            </svg>
          </motion.div>

          {/* Sparkle Effects */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-[#ffedd2] rounded-full"
              style={{
                top: `${30 + i * 20}%`,
                left: `${40 + i * 15}%`,
              }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                delay: i * 0.5,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}

// Feature Card Component
function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: any
  title: string
  description: string
  delay?: number
}) {
  return (
    <motion.div
      className="bg-gradient-to-br from-[#1f1f1f] to-[#282828] p-8 rounded-2xl border border-[#3e3e3e] hover:border-[#ffedd2]/30 transition-all duration-300 group"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -5 }}
      viewport={{ once: true }}
    >
      <div className="bg-[#ffedd2]/10 w-16 h-16 rounded-full flex items-center justify-center mb-6 group-hover:bg-[#ffedd2]/20 transition-colors duration-300">
        <Icon className="w-8 h-8 text-[#ffedd2]" />
      </div>

      <h3 className="text-2xl font-bold text-[#ffedd2] mb-4" style={{ fontFamily: "Kalam, cursive" }}>
        {title}
      </h3>

      <p className="text-[#ffedd2]/70 leading-relaxed">{description}</p>
    </motion.div>
  )
}

// Features Section
function FeaturesSection() {
  const features = [
    {
      icon: Palette,
      title: "Real-time Drawing",
      description:
        "Express your creativity with smooth, responsive drawing tools. Watch as your masterpiece comes to life in real-time for all players to see.",
    },
    {
      icon: Users,
      title: "Multiplayer Rooms",
      description:
        "Create private rooms for friends or join public games. Easy room management with customizable settings and player limits.",
    },
    {
      icon: Crown,
      title: "Host Controls",
      description:
        "Take charge as the room host. Start games, manage players, set difficulty levels, and keep the fun flowing smoothly.",
    },
    {
      icon: Trophy,
      title: "Rewards System",
      description:
        "Earn points for correct guesses and creative drawings. Climb the leaderboards and unlock achievements as you play.",
    },
    {
      icon: MessageCircle,
      title: "Live Chat",
      description:
        "Communicate with players through integrated chat. Share hints, celebrate victories, and build connections while you play.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description:
        "Experience lag-free gameplay with our optimized real-time engine. Every stroke and guess happens instantly across all devices.",
    },
  ]

  return (
    <section className="py-20 px-6">
      <div className="container mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl md:text-6xl font-bold text-[#ffedd2] mb-6" style={{ fontFamily: "Kalam, cursive" }}>
            Why Players Love It
          </h2>
          <p className="text-xl text-[#ffedd2]/70 max-w-2xl mx-auto">
            Discover the features that make our draw and guess game the most engaging multiplayer experience you'll ever
            play.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// How It Works Section
function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Create or Join",
      description: "Start by creating a new room or joining an existing one with a simple room code.",
    },
    {
      number: "02",
      title: "Draw & Guess",
      description: "Take turns drawing prompts while others race to guess what you're creating.",
    },
    {
      number: "03",
      title: "Earn Rewards",
      description: "Score points for correct guesses and creative drawings. Climb the leaderboard!",
    },
  ]

  return (
    <section className="py-20 px-6 bg-gradient-to-b from-[#0d0d0d] to-[#1f1f1f]">
      <div className="container mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl md:text-6xl font-bold text-[#ffedd2] mb-6" style={{ fontFamily: "Kalam, cursive" }}>
            How It Works
          </h2>
          <p className="text-xl text-[#ffedd2]/70 max-w-2xl mx-auto">
            Get started in seconds with our simple three-step process.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              className="text-center"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              viewport={{ once: true }}
            >
              <div className="bg-gradient-to-br from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                {step.number}
              </div>

              <h3 className="text-2xl font-bold text-[#ffedd2] mb-4" style={{ fontFamily: "Kalam, cursive" }}>
                {step.title}
              </h3>

              <p className="text-[#ffedd2]/70 leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// CTA Section
function CTASection() {
  return (
    <section className="py-20 px-6">
      <div className="container mx-auto text-center">
        <motion.div
          className="bg-gradient-to-br from-[#1f1f1f] to-[#282828] p-12 rounded-3xl border border-[#3e3e3e] max-w-4xl mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <Sparkles className="w-16 h-16 text-[#ffedd2] mx-auto mb-6" />

          <h2 className="text-4xl md:text-5xl font-bold text-[#ffedd2] mb-6" style={{ fontFamily: "Kalam, cursive" }}>
            Ready to Start Drawing?
          </h2>

          <p className="text-xl text-[#ffedd2]/70 mb-8 max-w-2xl mx-auto">
            Join thousands of players already having fun. Create your first room and start playing in under 30 seconds!
          </p>

          <motion.button
            className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] px-10 py-5 rounded-full font-bold text-xl flex items-center gap-3 mx-auto hover:shadow-lg hover:shadow-[#ffedd2]/20 transition-all duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Target className="w-6 h-6" />
            <a href="/room">Launch Game Now</a>
            <ArrowRight className="w-6 h-6" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}

// Footer
function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-[#3e3e3e]">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-2xl font-bold text-[#ffedd2] mb-4" style={{ fontFamily: "Kalam, cursive" }}>
              DrawGuess
            </h3>
            <p className="text-[#ffedd2]/70">The ultimate real-time drawing and guessing game experience.</p>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-[#ffedd2] mb-4">Game</h4>
            <ul className="space-y-2 text-[#ffedd2]/70">
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  How to Play
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Leaderboard
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Achievements
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-[#ffedd2] mb-4">Support</h4>
            <ul className="space-y-2 text-[#ffedd2]/70">
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Bug Reports
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-[#ffedd2] mb-4">Legal</h4>
            <ul className="space-y-2 text-[#ffedd2]/70">
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#ffedd2] transition-colors">
                  Cookie Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#3e3e3e] mt-8 pt-8 text-center text-[#ffedd2]/70">
          <p>&copy; 2024 DrawGuess. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

// Main Component
export default function LandingPage() {
  return (
    <div className="bg-[#0d0d0d] min-h-screen text-white">
      <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
      <SplashCursor />

      {/* <CursorTrail /> */}
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </div>
  )
}
