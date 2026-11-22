import mongoose from 'mongoose';
import { GameResult } from '../model/gameResult';

export type LeaderboardPeriod = 'all' | 'week' | 'today';
export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = ['all', 'week', 'today'];
export const LEADERBOARD_SIZE = 20;

/**
 * Start of a leaderboard window, in UTC so every player sees the same board:
 * "today" begins at 00:00 UTC and "this week" at 00:00 UTC on Monday.
 * Returns null for all time.
 */
export function periodStart(period: LeaderboardPeriod, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === 'week') {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  }
  return start;
}

/** Deliberately carries no user ID or email: the board is shown to every logged-in player. */
export type LeaderboardRow = {
  displayName: string;
  totalScore: number;
  gamesPlayed: number;
  gamesWon: number;
  bestScore: number;
};

/** Players ranked by points scored in the window, ties broken by wins then fewer games. */
export async function leaderboard(period: LeaderboardPeriod, now: Date = new Date()): Promise<LeaderboardRow[]> {
  const since = periodStart(period, now);
  const rows = await GameResult.aggregate([
    ...(since ? [{ $match: { playedAt: { $gte: since } } }] : []),
    { $sort: { playedAt: 1 } }, // so $last picks each player's latest display name
    {
      $group: {
        _id: '$userId',
        displayName: { $last: '$displayName' },
        totalScore: { $sum: '$score' },
        gamesPlayed: { $sum: 1 },
        gamesWon: { $sum: { $cond: ['$won', 1, 0] } },
        bestScore: { $max: '$score' },
      },
    },
    { $sort: { totalScore: -1, gamesWon: -1, gamesPlayed: 1, _id: 1 } },
    { $limit: LEADERBOARD_SIZE },
  ]);
  return rows.map((row) => ({
    displayName: row.displayName,
    totalScore: row.totalScore,
    gamesPlayed: row.gamesPlayed,
    gamesWon: row.gamesWon,
    bestScore: row.bestScore,
  }));
}

export type GameSummary = {
  id: string;
  roomId: string;
  score: number;
  won: boolean;
  playedAt: Date;
};

export type ProfileStats = {
  totalScore: number;
  gamesPlayed: number;
  gamesWon: number;
  /** 0..1, or 0 when no games have been played. */
  winRate: number;
  bestGame: GameSummary | null;
};

function toSummary(game: { _id: unknown; roomId: string; score: number; won: boolean; playedAt: Date }): GameSummary {
  return { id: String(game._id), roomId: game.roomId, score: game.score, won: game.won, playedAt: game.playedAt };
}

/** Lifetime totals for one player, computed from their game results. */
export async function profileStats(userId: string): Promise<ProfileStats> {
  const id = new mongoose.Types.ObjectId(userId);
  const [totals] = await GameResult.aggregate([
    { $match: { userId: id } },
    {
      $group: {
        _id: null,
        totalScore: { $sum: '$score' },
        gamesPlayed: { $sum: 1 },
        gamesWon: { $sum: { $cond: ['$won', 1, 0] } },
      },
    },
  ]);
  const best = await GameResult.findOne({ userId: id }).sort({ score: -1, playedAt: -1 }).lean<{
    _id: unknown;
    roomId: string;
    score: number;
    won: boolean;
    playedAt: Date;
  }>();

  const gamesPlayed = totals?.gamesPlayed ?? 0;
  const gamesWon = totals?.gamesWon ?? 0;
  return {
    totalScore: totals?.totalScore ?? 0,
    gamesPlayed,
    gamesWon,
    winRate: gamesPlayed ? gamesWon / gamesPlayed : 0,
    bestGame: best ? toSummary(best) : null,
  };
}

/** One page of a player's games, newest first. */
export async function gameHistory(userId: string, page: number, limit: number) {
  const id = new mongoose.Types.ObjectId(userId);
  const [games, total] = await Promise.all([
    GameResult.find({ userId: id })
      .sort({ playedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('roomId score won playedAt')
      .lean<{ _id: unknown; roomId: string; score: number; won: boolean; playedAt: Date }[]>(),
    GameResult.countDocuments({ userId: id }),
  ]);
  return { games: games.map(toSummary), page, limit, total, hasMore: page * limit < total };
}
