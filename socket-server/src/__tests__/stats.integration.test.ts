import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../model/user';
import { GameResult } from '../model/gameResult';
import { signToken } from '../auth/jwt';
import { periodStart } from '../stats/playerStats';
import { startTestServer } from './testUtils';

/**
 * Profile, history and leaderboard endpoints against a real MongoDB, so the
 * aggregations are exercised for real. Uses an in-memory server, never Atlas.
 */

// A Wednesday, so "this week" (from Monday) and "today" are different windows.
const NOW = new Date('2026-11-25T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

type TestServer = Awaited<ReturnType<typeof startTestServer>>;

let mongo: MongoMemoryServer;
let testServer: TestServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), GameResult.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  // Only Date is faked: the database driver's own timers keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all([User.deleteMany({}), GameResult.deleteMany({})]);
  testServer = await startTestServer();
});

afterEach(async () => {
  await testServer.close();
  vi.useRealTimers();
});

let userCounter = 0;
async function seedUser(displayName: string, createdAt = at('2026-01-01T00:00:00Z')) {
  userCounter += 1;
  return User.create({
    email: `player${userCounter}@example.com`,
    passwordHash: 'not-a-real-hash',
    displayName,
    createdAt,
  });
}

let gameCounter = 0;
async function seedGame(userId: unknown, displayName: string, score: number, won: boolean, playedAt: Date) {
  gameCounter += 1;
  return GameResult.create({ gameId: `game-${gameCounter}`, userId, displayName, roomId: 'ROOM1', score, won, playedAt });
}

function cookieFor(user: { _id: unknown; displayName: string }) {
  return `token=${signToken({ userId: String(user._id), displayName: user.displayName })}`;
}

const get = (path: string, cookie?: string) =>
  fetch(`${testServer.url}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

describe('periodStart', () => {
  it('uses UTC midnight for today and Monday for this week', () => {
    expect(periodStart('all', NOW)).toBeNull();
    expect(periodStart('today', NOW)?.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(periodStart('week', NOW)?.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    // On a Sunday the week still began the previous Monday.
    expect(periodStart('week', at('2026-11-29T23:59:00Z'))?.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(periodStart('week', at('2026-11-23T00:00:00Z'))?.toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });
});

describe('GET /auth/me/history', () => {
  it('requires a login and validates the page and limit', async () => {
    expect((await get('/auth/me/history')).status).toBe(401);

    const alice = await seedUser('Alice');
    expect((await get('/auth/me/history?limit=0', cookieFor(alice))).status).toBe(400);
    expect((await get('/auth/me/history?limit=51', cookieFor(alice))).status).toBe(400);
    expect((await get('/auth/me/history?page=abc', cookieFor(alice))).status).toBe(400);
  });

  it('pages through only my games, newest first, with lifetime stats', async () => {
    const alice = await seedUser('Alice');
    const bob = await seedUser('Bob');
    for (let day = 1; day <= 12; day += 1) {
      await seedGame(alice._id, 'Alice', day * 10, day % 3 === 0, at(`2026-11-${String(day).padStart(2, '0')}T10:00:00Z`));
    }
    await seedGame(bob._id, 'Bob', 999, true, at('2026-11-20T10:00:00Z'));

    const first = await (await get('/auth/me/history?limit=5', cookieFor(alice))).json();
    expect(first).toMatchObject({ page: 1, limit: 5, total: 12, hasMore: true });
    expect(first.games.map((g: { score: number }) => g.score)).toEqual([120, 110, 100, 90, 80]);
    expect(first.games[0]).toEqual({
      id: expect.any(String),
      roomId: 'ROOM1',
      score: 120,
      won: true,
      playedAt: '2026-11-12T10:00:00.000Z',
    });
    expect(first.stats).toEqual({
      totalScore: 780,
      gamesPlayed: 12,
      gamesWon: 4,
      winRate: 4 / 12,
      bestGame: expect.objectContaining({ score: 120, playedAt: '2026-11-12T10:00:00.000Z' }),
    });

    const last = await (await get('/auth/me/history?page=3&limit=5', cookieFor(alice))).json();
    expect(last).toMatchObject({ page: 3, total: 12, hasMore: false });
    expect(last.games.map((g: { score: number }) => g.score)).toEqual([20, 10]);
  });

  it('returns empty stats for a player with no games', async () => {
    const newbie = await seedUser('Newbie');
    const body = await (await get('/auth/me/history', cookieFor(newbie))).json();
    expect(body).toMatchObject({ games: [], total: 0, hasMore: false });
    expect(body.stats).toEqual({ totalScore: 0, gamesPlayed: 0, gamesWon: 0, winRate: 0, bestGame: null });
  });
});

describe('GET /users/:displayName', () => {
  it('shows a public profile without private fields, matching the name case-insensitively', async () => {
    const alice = await seedUser('Alice', at('2026-02-01T00:00:00Z'));
    for (let i = 0; i < 12; i += 1) {
      await seedGame(alice._id, 'Alice', 50 + i, i === 0, at(`2026-11-${String(i + 1).padStart(2, '0')}T08:00:00Z`));
    }

    const response = await get('/users/ALICE');
    expect(response.status).toBe(200);
    const { profile } = await response.json();
    expect(profile.displayName).toBe('Alice');
    expect(profile.memberSince).toBe('2026-02-01T00:00:00.000Z');
    expect(profile.stats).toMatchObject({ gamesPlayed: 12, gamesWon: 1, totalScore: 666 });
    expect(profile.recentGames).toHaveLength(10);
    expect(profile.recentGames[0].score).toBe(61);

    const raw = JSON.stringify(profile);
    expect(raw).not.toContain('@example.com');
    expect(raw).not.toContain(String(alice._id));
    expect(raw).not.toContain('passwordHash');
  });

  it('returns 404 for unknown or invalid names', async () => {
    expect((await get('/users/Nobody')).status).toBe(404);
    expect((await get(`/users/${'x'.repeat(21)}`)).status).toBe(404);
  });
});

describe('GET /leaderboard', () => {
  it('requires a login and rejects unknown periods', async () => {
    expect((await get('/leaderboard')).status).toBe(401);
    const viewer = await seedUser('Viewer');
    expect((await get('/leaderboard?period=year', cookieFor(viewer))).status).toBe(400);
  });

  it('ranks players by points within all time, this week and today', async () => {
    const viewer = await seedUser('Viewer');
    const alice = await seedUser('Alice');
    const bob = await seedUser('Bob');
    const cara = await seedUser('Cara');

    await seedGame(alice._id, 'Alice', 900, true, at('2026-11-10T10:00:00Z')); // last month-ish
    await seedGame(alice._id, 'Alice', 50, false, at('2026-11-25T09:00:00Z')); // today
    await seedGame(bob._id, 'Bob', 300, true, at('2026-11-23T10:00:00Z')); // Monday, this week
    await seedGame(bob._id, 'Bob', 200, true, at('2026-11-24T10:00:00Z')); // Tuesday, this week
    await seedGame(cara._id, 'Cara', 120, true, at('2026-11-25T11:00:00Z')); // today
    await seedGame(cara._id, 'Cara', 100, false, at('2026-11-22T23:59:00Z')); // Sunday, last week

    const board = async (period?: string) => {
      const response = await get(`/leaderboard${period ? `?period=${period}` : ''}`, cookieFor(viewer));
      expect(response.status).toBe(200);
      return response.json();
    };

    const all = await board();
    expect(all.period).toBe('all');
    expect(all.leaderboard.map((r: { displayName: string }) => r.displayName)).toEqual(['Alice', 'Bob', 'Cara']);
    expect(all.leaderboard[0]).toEqual({
      displayName: 'Alice',
      totalScore: 950,
      gamesPlayed: 2,
      gamesWon: 1,
      bestScore: 900,
    });

    const week = await board('week');
    expect(week.leaderboard.map((r: { displayName: string; totalScore: number }) => [r.displayName, r.totalScore])).toEqual([
      ['Bob', 500],
      ['Cara', 120],
      ['Alice', 50],
    ]);

    const today = await board('today');
    expect(today.leaderboard.map((r: { displayName: string; totalScore: number }) => [r.displayName, r.totalScore])).toEqual([
      ['Cara', 120],
      ['Alice', 50],
    ]);
  });

  it('keeps the board to 20 players', async () => {
    const viewer = await seedUser('Viewer');
    for (let i = 0; i < 22; i += 1) {
      const user = await seedUser(`Player ${i}`);
      await seedGame(user._id, `Player ${i}`, i * 10, false, at('2026-11-25T08:00:00Z'));
    }
    const body = await (await get('/leaderboard', cookieFor(viewer))).json();
    expect(body.leaderboard).toHaveLength(20);
    expect(body.leaderboard[0]).toMatchObject({ displayName: 'Player 21', totalScore: 210 });
  });
});
