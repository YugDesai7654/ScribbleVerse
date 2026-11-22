"use client"

import { m, useScroll, useTransform } from "framer-motion"
import { Link } from "react-router-dom"
import { lazy, Suspense, useEffect, useState } from "react"
import { Palette, Users, Crown, Trophy, MessageCircle, Play, ArrowRight, Sparkles, Zap, Target, LogIn, UserRound, type LucideIcon } from "lucide-react"
import { useAuth } from "../contexts/useAuth"
import HeroDemo from "./HeroDemo"
import ThemeToggle from "./ThemeToggle"

// A large WebGL effect that only some devices get, so it's fetched separately.
const SplashCursor = lazy(() => import("./SplashCursor"))

function AccountNavigation() {
  const { user, loading } = useAuth()
  const pill = "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 font-semibold transition-colors sm:px-4"

  // Icon-only links on phones, so the bar fits on one line (BUG-003).
  return (
    <nav className="fixed top-4 right-4 z-40 flex items-center gap-2 sm:top-5 sm:right-5 sm:gap-3" aria-label="Account">
      {user && (
        <span className="hidden text-sm text-cream/70 md:inline">
          Hi, {user.displayName}
        </span>
      )}
      <ThemeToggle />
      <Link
        to="/leaderboard"
        aria-label="Leaderboard"
        className={`${pill} border border-gold bg-ink/80 text-gold backdrop-blur hover:bg-gold hover:text-ink`}
      >
        <Trophy className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Leaderboard</span>
      </Link>
      {user && (
        <Link
          to="/profile"
          aria-label="My profile"
          className={`${pill} border border-line bg-ink/80 text-cream backdrop-blur hover:bg-panel-2`}
        >
          <UserRound className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Profile</span>
        </Link>
      )}
      {!loading && !user && (
        <Link to="/login" className={`${pill} bg-cream text-ink hover:bg-gold`}>
          <LogIn className="h-4 w-4" aria-hidden /> Log In
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
        <m.div
          key={i}
          className="absolute w-1 h-1 bg-cream rounded-full opacity-20"
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
  const y = useTransform(scrollY, [0, 500], [0, 120])

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20 pb-12">
      <FloatingParticles />

      <m.div style={{ y }} className="container z-10 mx-auto grid items-center gap-10 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
        <div className="text-center lg:text-left">
          <m.h1
            className="mb-6 font-display text-5xl font-bold text-cream sm:text-6xl md:text-7xl"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            Scribble, Guess, Conquer!
          </m.h1>

          <m.p
            className="mx-auto mb-8 max-w-2xl text-lg text-cream/80 md:text-xl lg:mx-0"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            One player draws, everyone else races to guess in real time. Create a room, invite friends with a link,
            and chat your way to victory!
          </m.p>

          <m.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start"
          >
            <m.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/room"
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cream to-gold px-8 py-4 text-lg font-bold text-ink transition-shadow duration-300 hover:shadow-lg hover:shadow-cream/20"
              >
                <Play className="h-5 w-5" aria-hidden />
                Start Playing Now
              </Link>
            </m.div>

            <m.a
              href="#how-it-works"
              className="rounded-full border-2 border-cream px-8 py-4 text-lg font-bold text-cream transition-colors duration-300 hover:bg-cream hover:text-ink"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              How to Play
            </m.a>
          </m.div>
        </div>

        <m.div
          className="flex justify-center"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <HeroDemo />
        </m.div>
      </m.div>
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
    <m.div
      className="bg-gradient-to-br from-panel to-panel-2 p-8 rounded-2xl border border-line hover:border-cream/30 transition-all duration-300 group"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -5 }}
      viewport={{ once: true }}
    >
      <div className="bg-cream/10 w-16 h-16 rounded-full flex items-center justify-center mb-6 group-hover:bg-cream/20 transition-colors duration-300">
        <Icon className="w-8 h-8 text-cream" />
      </div>

      <h3 className="text-2xl font-bold text-cream mb-4" style={{ fontFamily: "Kalam, cursive" }}>
        {title}
      </h3>

      <p className="text-cream/70 leading-relaxed">{description}</p>
    </m.div>
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
        <m.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl md:text-6xl font-bold text-cream mb-6" style={{ fontFamily: "Kalam, cursive" }}>
            Why Players Love It
          </h2>
          <p className="text-xl text-cream/70 max-w-2xl mx-auto">
            Discover the features that make our draw and guess game the most engaging multiplayer experience you'll ever
            play.
          </p>
        </m.div>

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
    <section id="how-it-works" className="py-20 px-6 bg-gradient-to-b from-ink to-panel scroll-mt-16">
      <div className="container mx-auto">
        <m.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl md:text-6xl font-bold text-cream mb-6" style={{ fontFamily: "Kalam, cursive" }}>
            How It Works
          </h2>
          <p className="text-xl text-cream/70 max-w-2xl mx-auto">
            Get started in seconds with our simple three-step process.
          </p>
        </m.div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <m.div
              key={index}
              className="text-center"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              viewport={{ once: true }}
            >
              <div className="bg-gradient-to-br from-cream to-gold text-ink w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                {step.number}
              </div>

              <h3 className="text-2xl font-bold text-cream mb-4" style={{ fontFamily: "Kalam, cursive" }}>
                {step.title}
              </h3>

              <p className="text-cream/70 leading-relaxed">{step.description}</p>
            </m.div>
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
        <m.div
          className="bg-gradient-to-br from-panel to-panel-2 p-12 rounded-3xl border border-line max-w-4xl mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <Sparkles className="w-16 h-16 text-cream mx-auto mb-6" />

          <h2 className="text-4xl md:text-5xl font-bold text-cream mb-6" style={{ fontFamily: "Kalam, cursive" }}>
            Ready to Start Drawing?
          </h2>

          <p className="text-xl text-cream/70 mb-8 max-w-2xl mx-auto">
            Create your first room and start playing in under 30 seconds. No account needed.
          </p>

          <m.div className="w-fit mx-auto" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link
              to="/room"
              className="bg-gradient-to-r from-cream to-gold text-ink px-10 py-5 rounded-full font-bold text-xl flex items-center gap-3 hover:shadow-lg hover:shadow-cream/20 transition-shadow duration-300"
            >
              <Target className="w-6 h-6" />
              Launch Game Now
              <ArrowRight className="w-6 h-6" />
            </Link>
          </m.div>
        </m.div>
      </div>
    </section>
  )
}

// Footer
function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-line">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h2 className="text-2xl font-bold text-cream mb-4" style={{ fontFamily: "Kalam, cursive" }}>
              ScribbleVerse
            </h2>
            <p className="text-cream/70">The ultimate real-time drawing and guessing game experience.</p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-cream mb-4">Game</h3>
            <ul className="space-y-2 text-cream/70">
              <li>
                <a href="#how-it-works" className="hover:text-cream transition-colors">
                  How to Play
                </a>
              </li>
              <li>
                <Link to="/room" className="hover:text-cream transition-colors">
                  Play Now
                </Link>
              </li>
              <li>
                <Link to="/leaderboard" className="hover:text-cream transition-colors">
                  Leaderboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-cream mb-4">Support</h3>
            <ul className="space-y-2 text-cream/70">
              <li>
                <a href="mailto:yugd7654@gmail.com" className="hover:text-cream transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="https://github.com/YugDesai7654/ScribbleVerse/issues" target="_blank" rel="noreferrer" className="hover:text-cream transition-colors">
                  Report a Bug
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-cream mb-4">Project</h3>
            <ul className="space-y-2 text-cream/70">
              <li>
                <a href="https://github.com/YugDesai7654/ScribbleVerse" target="_blank" rel="noreferrer" className="hover:text-cream transition-colors">
                  Source on GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-line mt-8 pt-8 text-center text-cream/70">
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
    <div className="bg-ink min-h-screen text-cream">
      {fancyCursor && (
        <Suspense fallback={null}>
          <SplashCursor />
        </Suspense>
      )}
      <AccountNavigation />

      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </div>
  )
}