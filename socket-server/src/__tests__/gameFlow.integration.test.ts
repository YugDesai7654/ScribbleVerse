import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, connectClient, waitForEvent } from './testUtils';
import { signToken } from '../auth/jwt';

const updateUserStats = vi.hoisted(() => vi.fn(async () => ({ id: 'authenticated-user' })));
const createGameResult = vi.hoisted(() => vi.fn(async () => ({ id: 'game-result' })));

// Mock the MongoDB-backed room repository so these tests never need a real
// database — they exercise the actual Socket.IO handlers in `server.ts`
// end-to-end, with only the persistence layer faked out.
vi.mock('../model/user', () => ({
  User: {
    findByIdAndUpdate: updateUserStats,
  },
}));

vi.mock('../model/gameResult', () => ({
  GameResult: {
    create: createGameResult,
  },
}));

vi.mock('../api/room', () => {
  const store = new Map<string, { roomId: string; hostName: string }>();
  return {
    createRoom: vi.fn(async (roomId: string, hostName: string) => {
      if (store.has(roomId)) throw new Error('Room already exists');
      const room = { roomId, hostName };
      store.set(roomId, room);
      return room;
    }),
    joinRoom: vi.fn(async (roomId: string) => {
      const room = store.get(roomId);
      if (!room) throw new Error('Room does not exist');
      return room;
    }),
    updateHost: vi.fn(async (roomId: string, newHostName: string) => {
      const room = store.get(roomId);
      if (!room) return null;
      room.hostName = newHostName;
      return room;
    }),
  };
});

let roomCounter = 0;
function uniqueRoomId(): string {
  roomCounter += 1;
  return `T${roomCounter}${Math.random().toString(36).slice(2, 6)}`.toUpperCase().slice(0, 8);
}

type TestServer = Awaited<ReturnType<typeof startTestServer>>;

describe('game flow (Socket.IO integration)', () => {
  let testServer: TestServer;
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    updateUserStats.mockClear();
    createGameResult.mockClear();
    testServer = await startTestServer();
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    clients.length = 0;
    await testServer.close();
  });

  async function join(url: string, cookie?: string) {
    const client = await connectClient(url, cookie);
    clients.push(client);
    return client;
  }

  it('runs a full game end-to-end: create, join, start, choose word, guess correctly, game over', async () => {
    const roomId = uniqueRoomId();
    const authenticatedConnection = new Promise<{ cookie?: string; userId?: string }>((resolve) => {
      testServer.io.once('connection', (connectedSocket) => resolve({
        cookie: connectedSocket.handshake.headers.cookie,
        userId: connectedSocket.data.userId,
      }));
    });
    const token = signToken({ userId: 'alice-user-id', displayName: 'Alice' });
    const alice = await join(testServer.url, `token=${token}`);
    expect(await authenticatedConnection).toMatchObject({
      cookie: expect.stringContaining('token='),
      userId: 'alice-user-id',
    });
    const bob = await join(testServer.url);

    alice.emit('createRoom', { roomId, name: 'Alice', rounds: 1, timePerRound: 10 });
    await waitForEvent(alice, 'createRoomSuccess');

    alice.emit('joinRoom', { roomId, name: 'Alice' });
    await waitForEvent(alice, 'joinRoomSuccess');

    bob.emit('joinRoom', { roomId, name: 'Bob' });
    await waitForEvent(bob, 'joinRoomSuccess');

    // NOTE on ordering throughout this test: the server can emit several events
    // back-to-back synchronously (e.g. 'drawingTurn' immediately followed by
    // 'wordOptions', both fired from within the same handler call). So every
    // listener needed for a step is registered on BOTH possible sockets
    // *before* the action that triggers it, never after awaiting an earlier
    // event — otherwise a fast synchronous follow-up event can be missed.

    // --- Turn 1 ---
    const gameStartedPromise = waitForEvent<{ rounds: number }>(alice, 'gameStarted');
    const aliceGetsWordOptions1 = waitForEvent<{ options: string[] }>(alice, 'wordOptions');
    const bobGetsWordOptions1 = waitForEvent<{ options: string[] }>(bob, 'wordOptions');

    alice.emit('startGame'); // Alice created the room, so she's the host.
    expect((await gameStartedPromise).rounds).toBe(1);

    // A duplicate host event must not reset state or schedule a second game.
    alice.emit('startGame');

    const turn1 = await Promise.race([
      aliceGetsWordOptions1.then((data) => ({ drawer: alice, guesser: bob, guesserName: 'Bob', data })),
      bobGetsWordOptions1.then((data) => ({ drawer: bob, guesser: alice, guesserName: 'Alice', data })),
    ]);

    const word1 = turn1.data.options[0];
    const guesser1GetsRoundStart = waitForEvent(turn1.guesser, 'roundStart');
    turn1.drawer.emit('chooseWord', { roomId, word: word1, round: 1 });
    await guesser1GetsRoundStart; // guesser has now received the placeholder — turn is live

    // --- Turn 2 (triggered by the correct guess ending turn 1 immediately,
    // since there's only one guesser) ---
    const aliceGetsWordOptions2 = waitForEvent<{ options: string[] }>(alice, 'wordOptions');
    const bobGetsWordOptions2 = waitForEvent<{ options: string[] }>(bob, 'wordOptions');

    turn1.guesser.emit('chatMessage', { roomId, user: turn1.guesserName, text: word1 });

    const turn2 = await Promise.race([
      aliceGetsWordOptions2.then((data) => ({ drawer: alice, guesser: bob, guesserName: 'Bob', data })),
      bobGetsWordOptions2.then((data) => ({ drawer: bob, guesser: alice, guesserName: 'Alice', data })),
    ]);

    const word2 = turn2.data.options[0];
    const guesser2GetsRoundStart = waitForEvent(turn2.guesser, 'roundStart');
    turn2.drawer.emit('chooseWord', { roomId, word: word2, round: 1 });
    await guesser2GetsRoundStart;

    // --- Game over (rounds=1 with 2 players = exactly 2 turns total) ---
    const gameOverPromise = waitForEvent<{ scores: { name: string; score: number }[] }>(turn2.guesser, 'gameOver');
    turn2.guesser.emit('chatMessage', { roomId, user: turn2.guesserName, text: word2 });

    const gameOver = await gameOverPromise;
    expect(gameOver.scores).toHaveLength(2);
    expect(gameOver.scores.every((s) => s.score > 0)).toBe(true);
    expect(gameOver.scores[0].score).toBeGreaterThanOrEqual(gameOver.scores[1].score);

    await vi.waitFor(() => expect(updateUserStats).toHaveBeenCalledTimes(1));
    expect(updateUserStats).toHaveBeenCalledWith('alice-user-id', {
      $inc: {
        totalScore: expect.any(Number),
        gamesPlayed: 1,
        gamesWon: expect.any(Number),
      },
    });
    expect(createGameResult).toHaveBeenCalledTimes(1);
    expect(createGameResult).toHaveBeenCalledWith({
      gameId: expect.any(String),
      userId: 'alice-user-id',
      displayName: 'Alice',
      roomId,
      score: expect.any(Number),
      won: expect.any(Boolean),
    });
  }, 20000);

  it('rejects a second player joining with a name already taken in that room', async () => {
    const roomId = uniqueRoomId();
    const alice = await join(testServer.url);
    const impostor = await join(testServer.url);

    alice.emit('createRoom', { roomId, name: 'Alice', rounds: 3, timePerRound: 60 });
    await waitForEvent(alice, 'createRoomSuccess');

    alice.emit('joinRoom', { roomId, name: 'Alice' });
    await waitForEvent(alice, 'joinRoomSuccess');

    const joinErrorPromise = waitForEvent<{ message: string }>(impostor, 'joinError');
    impostor.emit('joinRoom', { roomId, name: 'Alice' });

    const joinError = await joinErrorPromise;
    expect(joinError.message).toMatch(/name already taken/i);
  });

  it('rejects joining once the room has reached its max player cap', async () => {
    const roomId = uniqueRoomId();
    const host = await join(testServer.url);
    const second = await join(testServer.url);
    const third = await join(testServer.url);

    host.emit('createRoom', { roomId, name: 'Host', rounds: 3, timePerRound: 60, maxPlayers: 2 });
    await waitForEvent(host, 'createRoomSuccess');

    host.emit('joinRoom', { roomId, name: 'Host' });
    await waitForEvent(host, 'joinRoomSuccess');

    second.emit('joinRoom', { roomId, name: 'Second' });
    await waitForEvent(second, 'joinRoomSuccess');

    const joinErrorPromise = waitForEvent<{ message: string }>(third, 'joinError');
    third.emit('joinRoom', { roomId, name: 'Third' });

    const joinError = await joinErrorPromise;
    expect(joinError.message).toMatch(/room is full/i);
  });

  it('promotes a new host when the current host disconnects before the game starts', async () => {
    const roomId = uniqueRoomId();
    const alice = await join(testServer.url);
    const bob = await join(testServer.url);

    alice.emit('createRoom', { roomId, name: 'Alice', rounds: 3, timePerRound: 60 });
    await waitForEvent(alice, 'createRoomSuccess');

    alice.emit('joinRoom', { roomId, name: 'Alice' });
    await waitForEvent(alice, 'joinRoomSuccess');

    bob.emit('joinRoom', { roomId, name: 'Bob' });
    await waitForEvent(bob, 'joinRoomSuccess');

    const playerListPromise = waitForEvent<{ players: { name: string }[]; hostName: string }>(bob, 'playerList');
    alice.disconnect();
    clients.splice(clients.indexOf(alice), 1);

    const updatedList = await playerListPromise;
    expect(updatedList.hostName).toBe('Bob');
    expect(updatedList.players.map((p) => p.name)).toEqual(['Bob']);
  });
});
