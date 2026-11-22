"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { Link } from "react-router-dom"
import { useEffect, useState } from "react"
import { Palette, Users, Crown, Trophy, MessageCircle, Play, ArrowRight, Sparkles, Zap, Target, LogIn, type LucideIcon } from "lucide-react"
import SplashCursor from "./SplashCursor"
import { useAuth } from "../contexts/useAuth"

function AccountNavigation() {
  const { user, loading } = useAuth()

  return (
    <nav className="fixed top-5 right-5 z-40 flex items-center gap-3">
      {user && (
        <span className="hidden sm:inline text-[#ffedd2]/70 text-sm">
          Hi, {user.displayName}
        </span>
      )}
      <Link
        to="/leaderboard"
        className="inline-flex items-center gap-2 border border-[#f4d03f] text-[#f4d03f] px-4 py-2 rounded-full font-semibold bg-[#0d0d0d]/80 backdrop-blur hover:bg-[#f4d03f] hover:text-[#0d0d0d] transition-colors"
      >
        <Trophy className="w-4 h-4" /> Leaderboard
      </Link>
      {!loading && !user && (
        <Link
          to="/login"
          className="inline-flex items-center gap-2 bg-[#ffedd2] text-[#0d0d0d] px-4 py-2 rounded-full font-semibold hover:bg-[#f4d03f] transition-colors"
        >
          <LogIn className="w-4 h-4" /> Log In
        </Link>
      )}
    </nav>
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
          One player draws, everyone else races to guess in real time. Create a room, invite friends with a link,
          and chat your way to victory!
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link
              to="/room"
              className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] px-8 py-4 rounded-full font-bold text-lg flex items-center gap-2 hover:shadow-lg hover:shadow-[#ffedd2]/20 transition-shadow duration-300"
            >
              <Play className="w-5 h-5" />
              Start Playing Now
            </Link>
          </motion.div>

          <motion.a
            href="#how-it-works"
            className="border-2 border-[#ffedd2] text-[#ffedd2] px-8 py-4 rounded-full font-bold text-lg hover:bg-[#ffedd2] hover:text-[#0d0d0d] transition-colors duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            How to Play
          </motion.a>
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
  icon: LucideIcon
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
        "A full colour palette, brush sizes, eraser and undo. Every stroke appears instantly for everyone, on any screen size.",
    },
    {
      icon: Users,
      title: "Multiplayer Rooms",
      description:
        "Create a private room in one click and invite friends with a link. Choose the rounds, turn time and player limit.",
    },
    {
      icon: Crown,
      title: "Host Controls",
      description:
        "The host starts each game and can kick off a rematch. If the host leaves, another player takes over automatically.",
    },
    {
      icon: Trophy,
      title: "Scores & Leaderboard",
      description:
        "Fast guesses earn more points, and drawers score for every correct guess. Sign in to track your stats on the leaderboard.",
    },
    {
      icon: MessageCircle,
      title: "Live Chat",
      description:
        "Guess right in the chat. You get a private nudge when you're close, and players who already guessed get their own chat.",
    },
    {
      icon: Zap,
      title: "Hints as Time Runs Out",
      description:
        "Letters are revealed one by one as the timer runs down, so every word stays guessable.",
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
      title: "Score Points",
      description: "Score for fast guesses and for drawings others can guess. Climb the leaderboard!",
    },
  ]

  return (
    <section id="how-it-works" className="py-20 px-6 bg-gradient-to-b from-[#0d0d0d] to-[#1f1f1f] scroll-mt-16">
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
            Create your first room and start playing in under 30 seconds. No account needed.
          </p>

          <motion.div className="w-fit mx-auto" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link
              to="/room"
              className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] px-10 py-5 rounded-full font-bold text-xl flex items-center gap-3 hover:shadow-lg hover:shadow-[#ffedd2]/20 transition-shadow duration-300"
            >
              <Target className="w-6 h-6" />
              Launch Game Now
              <ArrowRight className="w-6 h-6" />
            </Link>
          </motion.div>
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
              ScribbleVerse
            </h3>
            <p className="text-[#ffedd2]/70">The ultimate real-time drawing and guessing game experience.</p>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-[#ffedd2] mb-4">Game</h4>
            <ul className="space-y-2 text-[#ffedd2]/70">
              <li>
                <a href="#how-it-works" className="hover:text-[#ffedd2] transition-colors">
                  How to Play
                </a>
              </li>
              <li>
                <Link to="/room" className="hover:text-[#ffedd2] transition-colors">
                  Play Now
                </Link>
              </li>
              <li>
                <Link to="/leaderboard" className="hover:text-[#ffedd2] transition-colors">
                  Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-[#ffedd2] mb-4">Support</h4>
            <ul className="space-y-2 text-[#ffedd2]/70">
              <li>
                <a href="mailto:yugd7654@gmail.com" className="hover:text-[#ffedd2] transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="https://github.com/YugDesai7654/ScribbleVerse/issues" target="_blank" rel="noreferrer" className="hover:text-[#ffedd2] transition-colors">
                  Report a Bug
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold text-[#ffedd2] mb-4">Project</h4>
            <ul className="space-y-2 text-[#ffedd2]/70">
              <li>
                <a href="https://github.com/YugDesai7654/ScribbleVerse" target="_blank" rel="noreferrer" className="hover:text-[#ffedd2] transition-colors">
                  Source on GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#3e3e3e] mt-8 pt-8 text-center text-[#ffedd2]/70">
          <p>&copy; {new Date().getFullYear()} ScribbleVerse. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}


// Main Component
/**
 * The fluid cursor is a full-screen WebGL simulation: lovely on a desktop, but
 * it drains phones and ignores reduced-motion preferences, so it's opt-in by
 * device capability.
 */
function useFancyCursor() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)")
    const update = () => setEnabled(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return enabled
}

export default function ScribbleVerseLandingPage() {
  const fancyCursor = useFancyCursor()
  return (
    <div className="bg-[#0d0d0d] min-h-screen text-white">
      {fancyCursor && <SplashCursor />}
      <AccountNavigation />

      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </div>
  )
}