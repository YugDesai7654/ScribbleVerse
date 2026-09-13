"use client"
import { useState } from "react"
import type React from "react"
import { useLocation, useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Mail, Lock, User, LogIn, UserPlus } from "lucide-react"
import { useAuth } from "../contexts/useAuth"

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const requestedPath = (location.state as { from?: string } | null)?.from
  const destination = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/room"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!email.trim() || !password.trim() || (mode === "register" && !displayName.trim())) {
      setError("Please fill in all fields.")
      return
    }

    setSubmitting(true)
    try {
      if (mode === "login") {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password, displayName.trim())
      }
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0d0d] text-[#ffedd2] p-4">
      <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "Kalam, cursive" }}>
          {mode === "login" ? "Welcome Back" : "Join ScribbleVerse"}
        </h1>
        <p className="text-[#ffedd2]/70 mt-2">
          Sign in to save your stats and climb the leaderboard.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-[#1a0f07] border border-[#5e3a22] rounded-2xl p-8"
      >
        <div className="flex mb-6 bg-[#0d0d0d] p-1 rounded-lg">
          <button
            type="button"
            className={`flex-1 py-2 rounded-md font-semibold transition-colors ${mode === "login" ? "bg-[#ffedd2]/10 text-[#f4d03f]" : "text-[#ffedd2]/70"}`}
            onClick={() => { setMode("login"); setError("") }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-md font-semibold transition-colors ${mode === "register" ? "bg-[#ffedd2]/10 text-[#f4d03f]" : "text-[#ffedd2]/70"}`}
            onClick={() => { setMode("register"); setError("") }}
          >
            Sign Up
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            {mode === "register" && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ffedd2]/50" />
                <input
                  className="w-full bg-[#0d0d0d] border border-[#5e3a22] rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={20}
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ffedd2]/50" />
              <input
                type="email"
                className="w-full bg-[#0d0d0d] border border-[#5e3a22] rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ffedd2]/50" />
              <input
                type="password"
                className="w-full bg-[#0d0d0d] border border-[#5e3a22] rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                placeholder={mode === "register" ? "Password (min. 8 characters)" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={72}
              />
            </div>

            {error && <div className="text-red-400 text-sm text-center">{error}</div>}

            <motion.button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
              whileHover={{ scale: submitting ? 1 : 1.02 }}
              whileTap={{ scale: submitting ? 1 : 0.98 }}
            >
              {mode === "login" ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              {submitting ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
            </motion.button>
          </motion.form>
        </AnimatePresence>
      </motion.div>

      <Link to="/room" className="mt-6 text-[#ffedd2]/60 hover:text-[#ffedd2] text-sm transition-colors">
        Continue as a guest instead &rarr;
      </Link>
    </div>
  )
}
