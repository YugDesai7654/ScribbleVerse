import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, connectClient, waitForEvent } from './testUtils';
import { signToken } from '../auth/jwt';
import { joinRoom as joinRoomRecord } from '../api/room';
import { io as ioClient } from 'socket.io-client';

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
  const store = new Map<string, { roomId: string; hostName: string; [key: string]: unknown }>();
  return {
    createRoom: vi.fn(async (roomId: string, hostName: string, settings: Record<string, number>) => {
      if (store.has(roomId)) throw new Error('Room already exists');
      const room = { roomId, hostName, ...settings };
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

  // ------------------------------------------------------------------
  // Regression tests for turn-lifecycle and security fixes
  // ------------------------------------------------------------------

  /** Creates a room and joins every named player; resolves once all have joined. */
  async function setupRoom(names: string[], settings: Record<string, number> = { rounds: 1, timePerRound: 30 }) {
    const roomId = uniqueRoomId();
    const sockets: ClientSocket[] = [];
    for (const _ of names) sockets.push(await join(testServer.url));
    sockets[0].emit('createRoom', { roomId, name: names[0], ...settings });
    await waitForEvent(sockets[0], 'createRoomSuccess');
    for (let i = 0; i < names.length; i++) {
      const joined = waitForEvent(sockets[i], 'joinRoomSuccess');
      sockets[i].emit('joinRoom', { roomId, name: names[i] });
      await joined;
    }
    const players = names.map((name, i) => ({ name, socket: sockets[i] }));
    return { roomId, players };
  }

  /** Starts the game and resolves with the first drawer and the word options they got. */
  async function startAndGetDrawer(players: { name: string; socket: ClientSocket }[]) {
    const optionPromises = players.map((p) =>
      waitForEvent<{ options: string[] }>(p.socket, 'wordOptions').then((data) => ({ player: p, options: data.options }))
    );
    players[0].socket.emit('startGame');
    const { player, options } = await Promise.race(optionPromises);
    return { drawer: player, options, others: players.filter((p) => p !== player) };
  }

  function collect<T = any>(socket: ClientSocket, event: string): T[] {
    const seen: T[] = [];
    socket.on(event, (data: T) => seen.push(data));
    return seen;
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function dropClient(socket: ClientSocket) {
    socket.disconnect();
    clients.splice(clients.indexOf(socket), 1);
  }

  it('does not award points for guessing a word after it has been revealed', async () => {
    const { roomId, players } = await setupRoom(['Alice', 'Bob', 'Cara']);
    const { drawer, options, others } = await startAndGetDrawer(players);

    const word = options[0];
    const started = waitForEvent(others[0].socket, 'roundStart');
    drawer.socket.emit('chooseWord', { roomId, word });
    await started;

    // The drawer leaving ends the turn and broadcasts "The word was: <word>".
    const revealed = waitForEvent<{ text: string }>(others[0].socket, 'chatMessage');
    const nextOptions = others.map((p) => waitForEvent(p.socket, 'wordOptions'));
    const correct = collect<{ correct?: boolean }>(others[0].socket, 'chatMessage');
    dropClient(drawer.socket);
    await revealed;

    // Both remaining players now "guess" the revealed word during the intermission.
    for (const p of others) p.socket.emit('chatMessage', { roomId, user: p.name, text: word });
    await sleep(300);
    expect(correct.some((m) => m.correct)).toBe(false);

    // ...and the next turn still starts normally instead of being skipped.
    await Promise.race(nextOptions);
  });

  it('keeps the game moving when a non-drawing player leaves mid-game', async () => {
    const { roomId, players } = await setupRoom(['Alice', 'Bob', 'Cara']);
    const { drawer, options, others } = await startAndGetDrawer(players);
    const [leaver, stayer] = others;

    const started = waitForEvent(stayer.socket, 'roundStart');
    drawer.socket.emit('chooseWord', { roomId, word: options[0] });
    await started;

    const leaverId = leaver.socket.id;
    dropClient(leaver.socket);
    await sleep(100);

    const turns = collect<{ drawerId: string }>(drawer.socket, 'drawingTurn');
    const nextOptions = waitForEvent<{ options: string[] }>(stayer.socket, 'wordOptions');
    stayer.socket.emit('chatMessage', { roomId, user: stayer.name, text: options[0] });

    // The only player left to draw is `stayer`; the departed player is skipped.
    const { options: nextWords } = await nextOptions;
    expect(turns.map((t) => t.drawerId)).not.toContain(leaverId);

    const gameOver = waitForEvent<{ scores: unknown[] }>(drawer.socket, 'gameOver');
    const live = waitForEvent(drawer.socket, 'roundStart');
    stayer.socket.emit('chooseWord', { roomId, word: nextWords[0] });
    await live;
    drawer.socket.emit('chatMessage', { roomId, user: drawer.name, text: nextWords[0] });
    expect((await gameOver).scores.length).toBeGreaterThan(0);
  });

  it("does not let a departed drawer's word auto-pick fire into the next turn", async () => {
    const { roomId, players } = await setupRoom(['Alice', 'Bob', 'Cara']);
    const { drawer, others } = await startAndGetDrawer(players);

    // Drawer leaves while still choosing — their 10s auto-pick timer is pending.
    const nextTurn = Promise.race(
      others.map((p) => waitForEvent<{ options: string[] }>(p.socket, 'wordOptions').then((d) => ({ p, options: d.options })))
    );
    dropClient(drawer.socket);
    const { p: nextDrawer, options } = await nextTurn; // ~5s later

    const roundStarts = collect<{ isDrawer: boolean; word: string }>(nextDrawer.socket, 'roundStart');
    await sleep(6000); // past the old drawer's 10s auto-pick deadline
    expect(roundStarts).toEqual([]);

    const mine = waitForEvent<{ isDrawer: boolean; word: string }>(nextDrawer.socket, 'roundStart');
    nextDrawer.socket.emit('chooseWord', { roomId, word: options[1] });
    expect(await mine).toMatchObject({ isDrawer: true, word: options[1] });
  }, 25000);

  it('rejects reserved names that could impersonate system messages', async () => {
    const socket = await join(testServer.url);
    const createError = waitForEvent(socket, 'createRoomError');
    socket.emit('createRoom', { roomId: uniqueRoomId(), name: 'System' });
    await createError;

    const { roomId } = await setupRoom(['Host']);
    const impostor = await join(testServer.url);
    const joinError = waitForEvent(impostor, 'joinError');
    impostor.emit('joinRoom', { roomId, name: ' system ' });
    await joinError;
  });

  it('refuses WebSocket connections from a foreign Origin', async () => {
    const attempt = ioClient(testServer.url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { Origin: 'https://evil.example' },
    });
    try {
      await expect(new Promise((resolve, reject) => {
        attempt.once('connect', () => resolve('connected'));
        attempt.once('connect_error', reject);
      })).rejects.toBeTruthy();
    } finally {
      attempt.close();
    }

    const allowed = await connectClient(testServer.url);
    clients.push(allowed);
    expect(allowed.connected).toBe(true);
  });

  it('lets players resume and start a game in a room that previously emptied', async () => {
    const { roomId, players } = await setupRoom(['Alice']);
    dropClient(players[0].socket);
    await sleep(100);

    const bob = await join(testServer.url);
    const cara = await join(testServer.url);
    const bobList = waitForEvent<{ hostName: string }>(bob, 'playerList');
    bob.emit('joinRoom', { roomId, name: 'Bob' });
    expect((await bobList).hostName).toBe('Bob');

    const caraJoined = waitForEvent(cara, 'joinRoomSuccess');
    cara.emit('joinRoom', { roomId, name: 'Cara' });
    await caraJoined;

    const started = waitForEvent(cara, 'gameStarted');
    bob.emit('startGame');
    await started;
  });

  it('reports a start-game failure instead of crashing when the database errors', async () => {
    const { players } = await setupRoom(['Alice', 'Bob']);
    vi.mocked(joinRoomRecord).mockRejectedValueOnce(new Error('db down'));

    const failure = waitForEvent<{ message: string }>(players[0].socket, 'startGameError');
    players[0].socket.emit('startGame');
    expect((await failure).message).toMatch(/could not start/i);
  });

  it('uses the logged-in account name as host even if the form sent another name', async () => {
    const token = signToken({ userId: 'dana-user-id', displayName: 'Dana' });
    const dana = await join(testServer.url, `token=${token}`);
    const eli = await join(testServer.url);
    const roomId = uniqueRoomId();

    dana.emit('createRoom', { roomId, name: 'SomethingElse' });
    await waitForEvent(dana, 'createRoomSuccess');
    for (const [socket, name] of [[dana, 'ignored'], [eli, 'Eli']] as const) {
      const joined = waitForEvent(socket, 'joinRoomSuccess');
      socket.emit('joinRoom', { roomId, name });
      await joined;
    }

    const started = waitForEvent(eli, 'gameStarted');
    dana.emit('startGame');
    await started;
  });

  // ------------------------------------------------------------------
  // v2 gameplay: strokes, undo, hints, close guesses, guessed-only chat
  // ------------------------------------------------------------------

  /** Starts a 3-player game and has the drawer pick a word; resolves when guessing is open. */
  async function liveTurn(settings: Record<string, number> = { rounds: 1, timePerRound: 30 }) {
    const { roomId, players } = await setupRoom(['Alice', 'Bob', 'Cara'], settings);
    const { drawer, options, others } = await startAndGetDrawer(players);
    const word = options[0];
    const live = Promise.all(others.map((p) => waitForEvent(p.socket, 'roundStart')));
    drawer.socket.emit('chooseWord', { roomId, word });
    await live;
    return { roomId, drawer, others, word };
  }

  it('relays normalised stroke segments and lets the drawer undo the last stroke', async () => {
    const { roomId, drawer, others } = await liveTurn();
    const received = collect<{ strokeId: string }>(others[0].socket, 'drawing');

    const segment = (strokeId: string, x: number) => ({
      roomId, strokeId, from: null, to: { x, y: 0.5 }, color: '#ff0000', size: 8,
    });
    drawer.socket.emit('drawing', segment('s1', 0.1));
    drawer.socket.emit('drawing', segment('s2', 0.2));
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received[1]).toEqual({ strokeId: 's2', from: null, to: { x: 0.2, y: 0.5 }, color: '#ff0000', size: 8 });

    // A guesser can't undo; the drawer's undo removes only the latest stroke.
    const undone = waitForEvent<{ strokeId: string }>(others[0].socket, 'strokeUndone');
    others[1].socket.emit('undoStroke', { roomId });
    drawer.socket.emit('undoStroke', { roomId });
    expect(await undone).toEqual({ strokeId: 's2' });
  });

  it('privately tells a guesser they are close without broadcasting the near-miss', async () => {
    const { roomId, others, word } = await liveTurn();
    const [guesser, bystander] = others;
    const nearMiss = word.slice(0, -1) + (word.endsWith('z') ? 'y' : 'z');

    const seenByBystander = collect<{ text: string }>(bystander.socket, 'chatMessage');
    const close = waitForEvent<{ text: string }>(guesser.socket, 'closeGuess');
    guesser.socket.emit('chatMessage', { roomId, user: guesser.name, text: nearMiss });

    expect((await close).text).toBe(nearMiss);
    await sleep(200);
    expect(seenByBystander.map((m) => m.text)).not.toContain(nearMiss);
  });

  it('keeps chat from players who guessed among them and the drawer, then reports turn gains', async () => {
    const { roomId, drawer, others, word } = await liveTurn();
    const [first, second] = others;

    const firstCorrect = waitForEvent(second.socket, 'chatMessage');
    first.socket.emit('chatMessage', { roomId, user: first.name, text: word });
    await firstCorrect; // "<first> guessed the word!"

    const toDrawer = waitForEvent<{ text: string; guessed?: boolean }>(drawer.socket, 'chatMessage');
    const seenBySecond = collect<{ text: string }>(second.socket, 'chatMessage');
    first.socket.emit('chatMessage', { roomId, user: first.name, text: 'that was easy' });
    expect(await toDrawer).toMatchObject({ text: 'that was easy', guessed: true });
    await sleep(200);
    expect(seenBySecond.map((m) => m.text)).not.toContain('that was easy');

    const ended = waitForEvent<{ word: string; gains: { name: string; points: number }[] }>(drawer.socket, 'turnEnded');
    second.socket.emit('chatMessage', { roomId, user: second.name, text: word });
    const summary = await ended;
    expect(summary.word).toBe(word);
    expect(summary.gains.map((g) => g.name).sort()).toEqual([drawer.name, first.name, second.name].sort());
    expect(summary.gains.find((g) => g.name === drawer.name)?.points).toBe(100);
  });

  it('reveals letters to guessers (not the drawer) as the turn runs down', async () => {
    const { drawer, others, word } = await liveTurn({ rounds: 1, timePerRound: 10 });
    const drawerHints = collect(drawer.socket, 'hint');
    const hint = await waitForEvent<{ word: string }>(others[0].socket, 'hint');

    const letters = hint.word.split(' ').filter((c) => c !== '');
    expect(letters).toHaveLength(word.replace(/\s/g, '').length);
    expect(letters.filter((c) => c !== '_').length).toBeGreaterThanOrEqual(1);
    expect(letters.some((c) => c === '_')).toBe(true);
    expect(drawerHints).toEqual([]);
  }, 15000);
});
