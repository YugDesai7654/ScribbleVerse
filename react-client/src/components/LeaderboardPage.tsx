"use client"
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Trophy, ArrowLeft } from "lucide-react"
import { ApiError, fetchLeaderboard, type LeaderboardEntry } from "../lib/authApi"
import { useAuth } from "../contexts/useAuth"

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [error, setError] = useState("")
  const navigate = useNavigate()
  const { refresh } = useAuth()

  useEffect(() => {
    fetchLeaderboard()
      .then((data) => setEntries(data.leaderboard))
      .catch(async (err) => {
        if (err instanceof ApiError && err.status === 401) {
          await refresh()
          navigate("/login", { replace: true, state: { from: "/leaderboard" } })
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load leaderboard.")
      })
  }, [navigate, refresh])

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#ffedd2] p-6 md:p-10">
      <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />

      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-[#ffedd2]/70 hover:text-[#ffedd2] mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>

        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold mb-8 flex items-center gap-3"
          style={{ fontFamily: "Kalam, cursive" }}
        >
          <Trophy className="w-10 h-10 text-yellow-400" /> Leaderboard
        </motion.h1>

        {error && <p className="text-red-400">{error}</p>}

        {!entries && !error && <p className="text-[#ffedd2]/70">Loading...</p>}

        {entries && entries.length === 0 && (
          <p className="text-[#ffedd2]/70">
            No game results yet — complete a game while logged in to be the first on the board!
          </p>
        )}

        {entries && entries.length > 0 && (
          <ul className="space-y-2">
            {entries.map((entry, index) => (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex justify-between items-center p-4 rounded-lg border ${
                  index === 0
                    ? "bg-yellow-400/10 border-yellow-400"
                    : "bg-[#1a0f07] border-[#5e3a22]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 text-center font-bold text-[#ffedd2]/70">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-lg truncate">{entry.displayName}</div>
                    <div className="text-xs text-[#ffedd2]/50">
                      {new Date(entry.playedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="text-right ml-4 shrink-0">
                  <div className="font-bold text-[#f4d03f]">{entry.score} pts</div>
                  <div className={`text-xs font-semibold ${entry.won ? "text-green-400" : "text-[#ffedd2]/50"}`}>
                    {entry.won ? "Winner" : "Played"}
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
