import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Award, Gamepad2, Percent, Star, Trophy } from "lucide-react"
import {
  ApiError,
  fetchMyHistory,
  fetchPublicProfile,
  type GameSummary,
  type ProfileStats,
} from "../lib/authApi"
import { useAuth } from "../contexts/useAuth"
import { avatarColor } from "../game/utils"
import ThemeToggle from "./ThemeToggle"

const PAGE_SIZE = 10

type ProfileView = {
  displayName: string
  memberSince?: string
  stats: ProfileStats
  games: GameSummary[]
  total: number
  hasMore: boolean
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
const formatDate = (iso: string) => dateFormat.format(new Date(iso))

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof Trophy; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2 text-sm text-cream/70">
        <Icon className="h-4 w-4 text-gold" aria-hidden /> {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold tabular-nums text-cream">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-cream/60">{detail}</div>}
    </div>
  )
}

function GameRow({ game }: { game: GameSummary }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm text-cream">{formatDate(game.playedAt)}</div>
        <div className="text-xs text-cream/60">Room {game.roomId}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums text-gold">{game.score} pts</div>
        <div className={`text-xs font-semibold ${game.won ? "text-success" : "text-cream/60"}`}>{game.won ? "Won" : "Played"}</div>
      </div>
    </li>
  )
}

/**
 * `/profile` shows the logged-in player's stats and full, paginated history.
 * `/u/:displayName` is the public, read-only version with the last 10 games.
 */
export default function ProfilePage() {
  const { displayName: publicName } = useParams()
  const isPublic = publicName !== undefined
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState<ProfileView | null>(null)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  const handleError = useCallback(
    async (err: unknown) => {
      if (!isPublic && err instanceof ApiError && err.status === 401) {
        await refresh()
        navigate("/login", { replace: true, state: { from: "/profile" } })
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load profile.")
    },
    [isPublic, navigate, refresh]
  )

  useEffect(() => {
    let cancelled = false
    setView(null)
    setError("")
    setPage(1)
    const load = isPublic
      ? fetchPublicProfile(publicName).then(({ profile }) => ({
          displayName: profile.displayName,
          memberSince: profile.memberSince,
          stats: profile.stats,
          games: profile.recentGames,
          total: profile.recentGames.length,
          hasMore: false,
        }))
      : fetchMyHistory(1, PAGE_SIZE).then((history) => ({
          displayName: user?.displayName ?? "",
          stats: history.stats,
          games: history.games,
          total: history.total,
          hasMore: history.hasMore,
        }))
    load
      .then((next) => {
        if (!cancelled) setView(next)
      })
      .catch((err) => {
        if (!cancelled) void handleError(err)
      })
    return () => {
      cancelled = true
    }
  }, [isPublic, publicName, user?.displayName, handleError])

  const loadMore = async () => {
    if (!view || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await fetchMyHistory(page + 1, PAGE_SIZE)
      setPage(next.page)
      setView({ ...view, games: [...view.games, ...next.games], hasMore: next.hasMore, total: next.total })
    } catch (err) {
      await handleError(err)
    } finally {
      setLoadingMore(false)
    }
  }

  const stats = view?.stats
  const isOwnPublicPage = isPublic && !!user && user.displayName.toLowerCase() === publicName.toLowerCase()

  return (
    <div className="min-h-screen bg-ink p-4 text-cream sm:p-6 md:p-10">
      <main className="mx-auto max-w-3xl">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link to="/" className="inline-flex items-center gap-2 text-cream/70 transition-colors hover:text-cream">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Home
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/leaderboard" className="inline-flex items-center gap-2 text-cream/70 transition-colors hover:text-cream">
              <Trophy className="h-4 w-4" aria-hidden /> Leaderboard
            </Link>
            <ThemeToggle />
          </div>
        </nav>

        {error && <p className="text-danger" role="alert">{error}</p>}
        {!view && !error && <p className="text-cream/70" aria-busy="true">Loading profile…</p>}

        {view && stats && (
          <>
            <header className="mb-8 flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-3xl font-bold text-white"
                style={{ backgroundColor: avatarColor(view.displayName) }}
                aria-hidden
              >
                {view.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-4xl font-bold md:text-5xl">{view.displayName}</h1>
                <p className="text-sm text-cream/70">
                  {isPublic
                    ? `Playing since ${new Date(view.memberSince!).toLocaleDateString(undefined, { dateStyle: "medium" })}`
                    : "Your profile"}
                  {!isPublic && (
                    <>
                      {" · "}
                      <Link to={`/u/${encodeURIComponent(view.displayName)}`} className="underline hover:text-cream">
                        public page
                      </Link>
                    </>
                  )}
                  {isOwnPublicPage && (
                    <>
                      {" · "}
                      <Link to="/profile" className="underline hover:text-cream">full history</Link>
                    </>
                  )}
                </p>
              </div>
            </header>

            <section aria-label="Stats" className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={Star} label="Total score" value={stats.totalScore.toLocaleString()} />
              <StatCard icon={Gamepad2} label="Games played" value={stats.gamesPlayed.toLocaleString()} />
              <StatCard
                icon={Percent}
                label="Win rate"
                value={`${Math.round(stats.winRate * 100)}%`}
                detail={`${stats.gamesWon} won`}
              />
              <StatCard
                icon={Award}
                label="Best game"
                value={stats.bestGame ? `${stats.bestGame.score}` : "–"}
                detail={stats.bestGame ? formatDate(stats.bestGame.playedAt) : undefined}
              />
            </section>

            <section className="mt-10" aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-3 font-display text-2xl font-bold">
                {isPublic ? "Recent games" : "Game history"}
                {!isPublic && view.total > 0 && <span className="ml-2 text-base font-normal text-cream/60">{view.total}</span>}
              </h2>
              {view.games.length === 0 ? (
                <p className="text-cream/70">
                  {isPublic ? "No games yet." : "No games yet. Finish a game while logged in and it will show up here."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {view.games.map((game) => (
                    <GameRow key={game.id} game={game} />
                  ))}
                </ul>
              )}
              {view.hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 w-full rounded-xl border border-line py-3 font-semibold text-cream hover:bg-panel disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
