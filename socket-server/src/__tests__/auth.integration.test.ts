import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../model/user';
import { GameResult } from '../model/gameResult';
import { signToken } from '../auth/jwt';
import { startTestServer } from './testUtils';

type StoredUser = {
  _id: { toString: () => string; toJSON: () => string };
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  totalScore: number;
  gamesPlayed: number;
  gamesWon: number;
};

type SeedUser = Omit<StoredUser, '_id' | 'createdAt'> & { id?: string };

type MockUserRepository = {
  __reset: () => void;
  __seed: (user: SeedUser) => StoredUser;
};

type StoredGameResult = {
  _id: { toString: () => string };
  userId: string;
  displayName: string;
  roomId: string;
  score: number;
  won: boolean;
  playedAt: Date;
};

type SeedGameResult = Omit<StoredGameResult, '_id'> & { id?: string };

type MockGameResultRepository = {
  __reset: () => void;
  __seed: (result: SeedGameResult) => StoredGameResult;
};

vi.mock('../model/user', () => {
  let nextId = 1;
  const users = new Map<string, StoredUser>();

  function createId(id: string) {
    return {
      toString: () => id,
      toJSON: () => id,
    };
  }

  const repository = {
    __reset() {
      users.clear();
      nextId = 1;
    },
    __seed(user: SeedUser) {
      const id = user.id || `user-${nextId++}`;
      const stored: StoredUser = {
        _id: createId(id),
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        createdAt: new Date(),
        totalScore: user.totalScore,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
      };
      users.set(id, stored);
      return stored;
    },
    findOne: vi.fn(async ({ email }: { email: string }) =>
      [...users.values()].find((user) => user.email === email) || null
    ),
    create: vi.fn(async (data: Pick<StoredUser, 'email' | 'passwordHash' | 'displayName'>) =>
      repository.__seed({
        ...data,
        totalScore: 0,
        gamesPlayed: 0,
        gamesWon: 0,
      })
    ),
    findById: vi.fn(async (id: string) => users.get(id) || null),
    findByIdAndUpdate: vi.fn(async () => null),
    find: vi.fn(() => {
      let results = [...users.values()];
      const query = {
        sort({ totalScore }: { totalScore: number }) {
          results.sort((a, b) => totalScore < 0
            ? b.totalScore - a.totalScore
            : a.totalScore - b.totalScore);
          return query;
        },
        limit(limit: number) {
          results = results.slice(0, limit);
          return query;
        },
        async select() {
          return results;
        },
      };
      return query;
    }),
  };

  return { User: repository };
});

vi.mock('../model/gameResult', () => {
  let nextId = 1;
  const gameResults: StoredGameResult[] = [];

  const repository = {
    __reset() {
      gameResults.length = 0;
      nextId = 1;
    },
    __seed(result: SeedGameResult) {
      const id = result.id || `game-${nextId++}`;
      const stored = {
        ...result,
        _id: { toString: () => id },
      };
      gameResults.push(stored);
      return stored;
    },
    create: vi.fn(async (result: SeedGameResult) => repository.__seed(result)),
    find: vi.fn(() => {
      let results = [...gameResults];
      const query = {
        sort({ score, playedAt }: { score: number; playedAt: number }) {
          results.sort((a, b) => {
            const scoreDifference = score < 0 ? b.score - a.score : a.score - b.score;
            if (scoreDifference !== 0) return scoreDifference;
            return playedAt < 0
              ? b.playedAt.getTime() - a.playedAt.getTime()
              : a.playedAt.getTime() - b.playedAt.getTime();
          });
          return query;
        },
        limit(limit: number) {
          results = results.slice(0, limit);
          return query;
        },
        select() {
          return query;
        },
        async lean() {
          return results;
        },
      };
      return query;
    }),
  };

  return { GameResult: repository };
});

const users = User as unknown as MockUserRepository;
const gameResults = GameResult as unknown as MockGameResultRepository;
type TestServer = Awaited<ReturnType<typeof startTestServer>>;

function jsonRequest(method: string, body?: unknown, cookie?: string): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function authCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Expected an authentication cookie');
  return setCookie.split(';', 1)[0];
}

describe('authentication HTTP API', () => {
  let testServer: TestServer;

  beforeEach(async () => {
    users.__reset();
    gameResults.__reset();
    testServer = await startTestServer();
  });

  afterEach(async () => {
    await testServer.close();
  });

  it('registers, persists identity through the cookie, and logs out', async () => {
    const registerResponse = await fetch(`${testServer.url}/auth/register`, jsonRequest('POST', {
      email: '  Player@Example.com ',
      password: 'correct-horse-battery-staple',
      displayName: '  Player One  ',
    }));

    expect(registerResponse.status).toBe(201);
    const registerCookieHeader = registerResponse.headers.get('set-cookie') || '';
    expect(registerCookieHeader).toContain('HttpOnly');
    expect(registerCookieHeader).toContain('SameSite=Lax');
    expect(registerCookieHeader).not.toContain('correct-horse-battery-staple');

    const registered = await registerResponse.json();
    expect(registered).toMatchObject({
      user: {
        email: 'player@example.com',
        displayName: 'Player One',
        totalScore: 0,
        gamesPlayed: 0,
        gamesWon: 0,
      },
    });
    expect(registered.user).not.toHaveProperty('passwordHash');

    const cookie = authCookie(registerResponse);
    const meResponse = await fetch(`${testServer.url}/auth/me`, jsonRequest('GET', undefined, cookie));
    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toMatchObject({
      user: { email: 'player@example.com', displayName: 'Player One' },
    });

    const logoutResponse = await fetch(`${testServer.url}/auth/logout`, jsonRequest('POST', undefined, cookie));
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get('set-cookie')).toMatch(/^token=;/);

    const loggedOutResponse = await fetch(`${testServer.url}/auth/me`);
    expect(loggedOutResponse.status).toBe(401);
    await expect(loggedOutResponse.json()).resolves.toEqual({ user: null });
  });

  it('rejects malformed registration and duplicate normalized email addresses', async () => {
    const invalidResponse = await fetch(`${testServer.url}/auth/register`, jsonRequest('POST', {
      email: 'not-an-email',
      password: 'short',
      displayName: '',
    }));
    expect(invalidResponse.status).toBe(400);

    const registration = {
      email: 'duplicate@example.com',
      password: 'a-valid-password',
      displayName: 'First Player',
    };
    const firstResponse = await fetch(`${testServer.url}/auth/register`, jsonRequest('POST', registration));
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await fetch(`${testServer.url}/auth/register`, jsonRequest('POST', {
      ...registration,
      email: ' DUPLICATE@EXAMPLE.COM ',
      displayName: 'Second Player',
    }));
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toEqual({
      message: 'An account with that email already exists.',
    });
  });

  it('rejects invalid credentials and issues a working cookie for a valid login', async () => {
    const password = 'another-valid-password';
    users.__seed({
      email: 'login@example.com',
      passwordHash: await bcrypt.hash(password, 10),
      displayName: 'Login Player',
      totalScore: 125,
      gamesPlayed: 3,
      gamesWon: 1,
    });

    const wrongPasswordResponse = await fetch(`${testServer.url}/auth/login`, jsonRequest('POST', {
      email: 'login@example.com',
      password: 'incorrect-password',
    }));
    expect(wrongPasswordResponse.status).toBe(401);
    await expect(wrongPasswordResponse.json()).resolves.toEqual({ message: 'Invalid email or password.' });

    const loginResponse = await fetch(`${testServer.url}/auth/login`, jsonRequest('POST', {
      email: ' LOGIN@EXAMPLE.COM ',
      password,
    }));
    expect(loginResponse.status).toBe(200);

    const cookie = authCookie(loginResponse);
    const meResponse = await fetch(`${testServer.url}/auth/me`, jsonRequest('GET', undefined, cookie));
    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toMatchObject({
      user: {
        displayName: 'Login Player',
        totalScore: 125,
        gamesPlayed: 3,
        gamesWon: 1,
      },
    });
  });

  it('requires authentication and returns only the top 20 sanitized per-game results', async () => {
    const unauthenticatedResponse = await fetch(`${testServer.url}/leaderboard`);
    expect(unauthenticatedResponse.status).toBe(401);
    await expect(unauthenticatedResponse.json()).resolves.toEqual({
      message: 'Log in to view the leaderboard.',
    });

    for (let index = 0; index < 22; index += 1) {
      gameResults.__seed({
        userId: `user-${index}`,
        displayName: `Player ${index}`,
        roomId: `ROOM${index}`,
        score: index * 10,
        won: index % 2 === 0,
        playedAt: new Date(Date.UTC(2026, 0, index + 1)),
      });
    }

    const token = signToken({ userId: 'viewer-id', displayName: 'Viewer' });
    const response = await fetch(
      `${testServer.url}/leaderboard`,
      jsonRequest('GET', undefined, `token=${token}`)
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.leaderboard).toHaveLength(20);
    expect(body.leaderboard[0]).toEqual({
      id: 'game-22',
      displayName: 'Player 21',
      score: 210,
      won: false,
      playedAt: '2026-01-22T00:00:00.000Z',
    });
    expect(body.leaderboard[0]).not.toHaveProperty('userId');
    expect(body.leaderboard[0]).not.toHaveProperty('roomId');
    expect(body.leaderboard[0]).not.toHaveProperty('email');
    expect(body.leaderboard[0]).not.toHaveProperty('passwordHash');
  });
});
