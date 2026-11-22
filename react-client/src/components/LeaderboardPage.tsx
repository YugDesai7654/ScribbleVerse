import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { m } from "framer-motion"
import { Trophy, ArrowLeft, UserRound } from "lucide-react"
import { ApiError, fetchLeaderboard, type LeaderboardEntry, type LeaderboardPeriod } from "../lib/authApi"
import { useAuth } from "../contexts/useAuth"
import ThemeToggle from "./ThemeToggle"

const TABS: { period: LeaderboardPeriod; label: string }[] = [
  { period: "all", label: "All time" },
  { period: "week", label: "This week" },
  { period: "today", label: "Today" },
]

const isPeriod = (value: string | null): value is LeaderboardPeriod => TABS.some((tab) => tab.period === value)

const EMPTY_TEXT: Record<LeaderboardPeriod, string> = {
  all: "No game results yet. Finish a game while logged in to be the first on the board!",
  week: "Nobody has finished a game this week yet.",
  today: "Nobody has finished a game today yet.",
}

export default function LeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get("period")
  const period: LeaderboardPeriod = isPeriod(requested) ? requested : "all"
  const [result, setResult] = useState<{ period: LeaderboardPeriod; entries: LeaderboardEntry[] } | null>(null)
  const [error, setError] = useState("")
  const navigate = useNavigate()
  const { user, refresh } = useAuth()

  useEffect(() => {
    let cancelled = false
    setError("")
    fetchLeaderboard(period)
      .then((data) => {
        if (!cancelled) setResult({ period, entries: data.leaderboard })
      })
      .catch(async (err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          await refresh()
          navigate("/login", { replace: true, state: { from: "/leaderboard" } })
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load leaderboard.")
      })
    return () => {
      cancelled = true
    }
  }, [period, navigate, refresh])

  const entries = result?.period === period ? result.entries : null

  return (
    <div className="min-h-screen bg-ink p-4 text-cream sm:p-6 md:p-10">
      <main className="mx-auto max-w-2xl">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link to="/" className="inline-flex items-center gap-2 text-cream/70 transition-colors hover:text-cream">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Home
          </Link>
          <div className="flex items-center gap-4">
          {user && (
            <Link to="/profile" className="inline-flex items-center gap-2 text-cream/70 transition-colors hover:text-cream">
              <UserRound className="h-4 w-4" aria-hidden /> My profile
            </Link>
          )}
          <ThemeToggle />
          </div>
        </nav>

        <m.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 font-display text-4xl font-bold md:text-5xl"
        >
          <Trophy className="h-10 w-10 text-gold" aria-hidden /> Leaderboard
        </m.h1>

        <div className="mb-6 flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Time period">
          {TABS.map((tab) => (
            <button
              key={tab.period}
              type="button"
              role="tab"
              aria-selected={period === tab.period}
              onClick={() => setSearchParams(tab.period === "all" ? {} : { period: tab.period }, { replace: true })}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                period === tab.period ? "bg-panel-2 text-cream" : "text-cream/70 hover:text-cream"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-busy={!entries && !error}>
          {error && <p className="text-danger" role="alert">{error}</p>}
          {!entries && !error && <p className="text-cream/70">Loading…</p>}
          {entries && entries.length === 0 && <p className="text-cream/70">{EMPTY_TEXT[period]}</p>}

          {entries && entries.length > 0 && (
            <ol className="space-y-2">
              {entries.map((entry, index) => (
                <m.li
                  key={entry.displayName + index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={`flex items-center justify-between rounded-lg border p-4 ${
                    index === 0 ? "border-gold bg-gold/10" : "border-line bg-panel"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-6 text-center font-bold text-cream/70">{index + 1}</span>
                    <div className="min-w-0">
                      <Link
                        to={`/u/${encodeURIComponent(entry.displayName)}`}
                        className="block truncate text-lg font-semibold hover:underline"
                      >
                        {entry.displayName}
                      </Link>
                      <div className="text-xs text-cream/60">
                        {entry.gamesPlayed} {entry.gamesPlayed === 1 ? "game" : "games"} · {entry.gamesWon} won · best {entry.bestScore}
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 text-right font-bold tabular-nums text-gold">{entry.totalScore.toLocaleString()} pts</div>
                </m.li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  )
}
