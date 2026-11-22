import express from 'express';
import http from 'http';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { parse as parseCookie } from 'cookie';
import rateLimit from 'express-rate-limit';
import { Server, Socket } from 'socket.io';
import { createRoom, joinRoom, updateHost, type RoomSettings } from './api/room';
import {
  validate,
  createRoomSchema,
  joinRoomSchema,
  chatMessageSchema,
  drawingSchema,
  chooseWordSchema,
  clearCanvasSchema,
} from './validation/schemas';
import { createRateLimiters, isAllowed } from './rateLimiters';
import { verifyToken, AUTH_COOKIE_NAME } from './auth/jwt';
import { User } from './model/user';
import { GameResult } from './model/gameResult';
import authRouter from './routes/auth';
import leaderboardRouter from './routes/leaderboard';
import { logger, requestLogger } from './logger';
import { isDatabaseReady } from './dbConnect/dbconnect';

// ====================================================================
// --- Pure helpers (exported for unit testing, no side effects) ---
// ====================================================================
export const WORD_LIST = [
  'apple', 'banana', 'car', 'dog', 'elephant', 'flower', 'guitar', 'house', 'island', 'jacket',
  'kangaroo', 'lemon', 'mountain', 'notebook', 'ocean', 'pizza', 'queen', 'robot', 'sun', 'tree',
  'umbrella', 'violin', 'whale', 'xylophone', 'yacht', 'zebra', 'balloon', 'cat', 'drum', 'egg',
  'fish', 'grape', 'hat', 'ice', 'juice', 'kite', 'lamp', 'moon', 'nest', 'orange',
];

export function getRandomWords(): string[] {
  const shuffled = [...WORD_LIST].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}

export function getPlaceholder(word: string) {
  return word.split('').map(c => (c === ' ' ? ' ' : '_')).join(' ');
}

/**
 * Points awarded to a correct guesser: a flat base plus a bonus for guessing
 * quickly. Extracted as a pure function so the scoring formula is unit-testable
 * without needing a live socket/room.
 */
export function calculateGuessPoints(timePerRound: number, elapsedSeconds: number): number {
  const timeRemaining = Math.max(0, timePerRound - elapsedSeconds);
  return 50 + timeRemaining * 5;
}

type Player = { id: string; name: string; userId?: string };
type Rooms = { [roomId: string]: Player[] };

function publicPlayers(players: Player[]) {
  return players.map(({ id, name }) => ({ id, name }));
}

/**
 * Turn lifecycle for a room:
 *   idle -> choosing (drawer picks a word) -> drawing (guessing is open)
 *        -> intermission (word revealed, waiting for next turn) -> choosing ...
 * Every handler checks the phase, so stale timers and late events can't act on
 * a turn that has already ended.
 */
export type TurnPhase = 'idle' | 'choosing' | 'drawing' | 'intermission';

export type GameState = {
  rounds: number;
  timePerRound: number;
  maxPlayers: number;
  currentRound: number;
  drawingOrder: string[]; // Socket IDs still to draw this round; [0] is the current drawer
  gameStarted: boolean;
  phase: TurnPhase;
  turnId: number; // Incremented every turn; timers capture it to detect staleness
  drawerName?: string; // Captured at turn start so points survive the drawer leaving
  roundStartTime?: number;
  roundTimer?: NodeJS.Timeout; // Authoritative server-side timer for each turn
  intermissionTimer?: NodeJS.Timeout; // Delay/countdown between turns and rounds
  gameId?: string;
};

/** How long an unjoined room keeps its in-memory state before being reclaimed. */
const EMPTY_ROOM_GRACE_MS = 5 * 60 * 1000;
const WORD_SELECTION_MS = 10_000;
const NEXT_TURN_DELAY_MS = 5_000;
const ROUND_COUNTDOWN_SECONDS = 5;

/** Reads TRUST_PROXY ("1", "2", "true", "loopback", ...) into an Express trust proxy value. */
function trustProxySetting(raw: string | undefined): boolean | number | string | undefined {
  if (!raw) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const hops = Number(raw);
  return Number.isInteger(hops) ? hops : raw;
}

/**
 * Builds a fully wired Express + Socket.IO app, with its own isolated
 * in-memory game state. Does NOT connect to MongoDB and does NOT call
 * `server.listen(...)` — that's the caller's job (see `index.ts` for the real
 * process entrypoint). Keeping this side-effect-free is what makes it possible
 * to spin up an independent, isolated instance per test.
 */
export function createApp() {
  // --- Server and CORS Setup ---
  const app = express();
  app.disable('x-powered-by');

  // Behind a reverse proxy/load balancer, rate limits must key on the real
  // client IP rather than the proxy's. Only enabled when explicitly configured,
  // since trusting X-Forwarded-For without a proxy lets clients spoof their IP.
  const trustProxy = trustProxySetting(process.env.TRUST_PROXY);
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

  const allowedOrigins = [
    process.env.CORS_ORIGIN || "http://localhost:5173",
  ];

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests) or from whitelisted domains
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  };

  app.use(requestLogger);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.use('/auth', authRouter);
  app.use('/leaderboard', leaderboardRouter);

  const server = http.createServer(app);

  // --- Socket.IO Setup with CORS ---
  const io = new Server(server, {
    cors: corsOptions,
    // Defence in depth against Cross-Site WebSocket Hijacking: the auth cookie is
    // SameSite=None in production, so a foreign site must never be able to open
    // a socket as the visitor. Current engine.io also runs the CORS middleware on
    // upgrades, but this explicit check doesn't depend on that behaviour.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    maxHttpBufferSize: 16 * 1024, // largest legitimate payload is a single stroke
  });

  // Attach the logged-in user's identity (if any) to the socket, derived from the
  // httpOnly auth cookie. Guests (no cookie, or an invalid/expired one) simply get
  // no `socket.data.userId` and keep working exactly as before.
  io.use((socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie;
      if (rawCookie) {
        const parsed = parseCookie(rawCookie);
        const token = parsed[AUTH_COOKIE_NAME];
        const payload = token ? verifyToken(token) : null;
        if (payload) {
          socket.data.userId = payload.userId;
          socket.data.displayName = payload.displayName;
        }
      }
    } catch {
      // Malformed cookie header — treat the connection as a guest rather than failing it.
    }
    next();
  });

  /** Client IP for rate limiting, honouring X-Forwarded-For only when a proxy is trusted. */
  function clientAddress(socket: Socket): string {
    if (trustProxy) {
      const forwarded = socket.handshake.headers['x-forwarded-for'];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return socket.handshake.address;
  }

  // ====================================================================
  // --- Game state (scoped per-app-instance for testability) ---
  // ====================================================================
  const { drawingLimiter, chatLimiter, roomActionLimiter } = createRateLimiters();

  const rooms: Rooms = {};
  const chatHistory: { [roomId: string]: { user: string; text: string; timestamp: number }[] } = {};
  const gameState: { [roomId: string]: GameState } = {};
  const playerPoints: { [roomId: string]: { [playerName: string]: number } } = {};
  const correctGuessers: { [roomId: string]: Set<string> } = {};
  const emptyRoomTimers: { [roomId: string]: NodeJS.Timeout } = {};
  const wordState: {
    [roomId: string]: {
      currentWord: string | null;
      wordOptions: string[];
      wordSelectionTimeout?: NodeJS.Timeout;
    }
  } = {};

  function newGameState(settings: RoomSettings): GameState {
    return {
      ...settings,
      currentRound: 1,
      drawingOrder: [],
      gameStarted: false,
      phase: 'idle',
      turnId: 0,
    };
  }

  function clearTurnTimers(roomId: string) {
    const state = gameState[roomId];
    if (state?.roundTimer) clearTimeout(state.roundTimer);
    if (state?.intermissionTimer) {
      clearTimeout(state.intermissionTimer);
      clearInterval(state.intermissionTimer);
    }
    if (state) {
      state.roundTimer = undefined;
      state.intermissionTimer = undefined;
    }
    const words = wordState[roomId];
    if (words?.wordSelectionTimeout) clearTimeout(words.wordSelectionTimeout);
    if (words) words.wordSelectionTimeout = undefined;
  }

  /** Frees every piece of in-memory state (and pending timer) belonging to a room. */
  function cleanupRoom(roomId: string) {
    clearTurnTimers(roomId);
    if (emptyRoomTimers[roomId]) clearTimeout(emptyRoomTimers[roomId]);
    delete emptyRoomTimers[roomId];
    delete rooms[roomId];
    delete gameState[roomId];
    delete chatHistory[roomId];
    delete playerPoints[roomId];
    delete correctGuessers[roomId];
    delete wordState[roomId];
  }

  /** Reclaims a room's memory if nobody has joined it within the grace period. */
  function scheduleEmptyRoomCleanup(roomId: string) {
    if (emptyRoomTimers[roomId]) clearTimeout(emptyRoomTimers[roomId]);
    emptyRoomTimers[roomId] = setTimeout(() => {
      delete emptyRoomTimers[roomId];
      if (!rooms[roomId]?.length) cleanupRoom(roomId);
    }, EMPTY_ROOM_GRACE_MS);
    emptyRoomTimers[roomId].unref?.();
  }

  function finishGame(roomId: string, state: GameState, reason?: string) {
    clearTurnTimers(roomId);
    state.gameStarted = false;
    state.phase = 'idle';
    state.drawingOrder = [];
    if (wordState[roomId]) wordState[roomId].currentWord = null;

    if (reason) {
      io.to(roomId).emit('gameOver', { scores: [], reason });
      return;
    }

    const finalScores = Object.entries(playerPoints[roomId] || {})
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score);
    io.to(roomId).emit('gameOver', { scores: finalScores });
    const completedGameId = state.gameId;
    if (completedGameId) {
      persistGameResults(roomId, completedGameId, finalScores).catch((err) => {
        logger.error({ err, roomId, gameId: completedGameId }, 'Unexpected game result persistence failure');
      });
    } else {
      logger.error({ roomId }, 'Completed game is missing its game ID');
    }
  }

  /**
   * Persists per-game results (score, games played/won) for any authenticated player
   * in the room. Guests (no socket.data.userId) are skipped entirely — this never
   * blocks or slows down the actual game flow, since it's called fire-and-forget.
   */
  async function persistGameResults(
    roomId: string,
    gameId: string,
    finalScores: { name: string; score: number }[]
  ) {
    const players = rooms[roomId] || [];
    const winnerName = finalScores[0]?.name;

    for (const player of players) {
      const userId = player.userId;
      if (!userId) continue; // guest player, nothing to persist

      const scoreEntry = finalScores.find((s) => s.name === player.name);
      const score = scoreEntry?.score || 0;

      try {
        await GameResult.create({
          gameId,
          userId,
          displayName: player.name,
          roomId,
          score,
          won: player.name === winnerName,
        });

        const updatedUser = await User.findByIdAndUpdate(userId, {
          $inc: {
            totalScore: score,
            gamesPlayed: 1,
            gamesWon: player.name === winnerName ? 1 : 0,
          },
        });

        if (!updatedUser) {
          logger.warn({ userId, roomId, gameId }, 'Game result user no longer exists');
          continue;
        }

        logger.info({ userId, roomId, gameId, score }, 'Persisted game result');
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          logger.warn({ userId, roomId, gameId }, 'Ignored duplicate game result');
          continue;
        }
        logger.error({ err, userId, roomId, gameId }, 'Failed to persist game result');
      }
    }
  }

  function startDrawingTurn(roomId: string) {
    const state = gameState[roomId];
    if (!state || !state.gameStarted) return;

    // Skip anyone in the queue who has since left the room.
    const present = new Set((rooms[roomId] || []).map((p) => p.id));
    state.drawingOrder = state.drawingOrder.filter((id) => present.has(id));
    if (state.drawingOrder.length === 0) {
      // Everyone left in this round has disconnected — treat the round as over.
      state.phase = 'intermission';
      advanceAfterTurn(roomId, state);
      return;
    }

    const drawerId = state.drawingOrder[0];
    const round = state.currentRound;
    state.drawerName = rooms[roomId]?.find((p) => p.id === drawerId)?.name;

    // Cancel the previous turn's auto-pick BEFORE replacing its word state, so it
    // can never fire into (and hijack) this new turn.
    clearTurnTimers(roomId);

    const options = getRandomWords();
    wordState[roomId] = { currentWord: null, wordOptions: options };
    state.turnId += 1;
    state.phase = 'choosing';
    state.roundStartTime = Date.now();
    correctGuessers[roomId] = new Set();

    io.to(roomId).emit('drawingTurn', { drawerId, round });
    io.to(roomId).emit('canvasCleared'); // Clear canvas for the new turn
    io.to(drawerId).emit('wordOptions', { options, round });

    // Automatically pick a word if the drawer doesn't choose in time.
    const turnId = state.turnId;
    wordState[roomId].wordSelectionTimeout = setTimeout(() => {
      if (state.turnId === turnId && state.phase === 'choosing') {
        handleWordChosen(roomId, options[0]);
      }
    }, WORD_SELECTION_MS);
  }

  function handleWordChosen(roomId: string, word: string) {
    const state = gameState[roomId];
    const words = wordState[roomId];
    if (!state || !words || state.phase !== 'choosing') return;

    const drawerId = state.drawingOrder[0];
    words.currentWord = word;
    if (words.wordSelectionTimeout) clearTimeout(words.wordSelectionTimeout);
    words.wordSelectionTimeout = undefined;

    state.phase = 'drawing';
    state.roundStartTime = Date.now();

    // Start the authoritative server-side timer for the turn.
    const turnId = state.turnId;
    if (state.roundTimer) clearTimeout(state.roundTimer);
    state.roundTimer = setTimeout(() => {
      if (state.turnId !== turnId) return;
      endTurnAndProceed(roomId);
    }, state.timePerRound * 1000);

    const placeholder = getPlaceholder(word);
    const players = rooms[roomId] || [];
    players.forEach((p) => {
      io.to(p.id).emit('roundStart', {
        word: p.id === drawerId ? word : placeholder,
        isDrawer: p.id === drawerId,
        round: state.currentRound,
      });
    });
  }

  /**
   * Ends the current turn exactly once: awards the drawer, reveals the word,
   * closes guessing, then schedules the next turn/round or finishes the game.
   * Safe to call from any trigger (timer, all guessed, drawer left) — repeated or
   * late calls are ignored because the phase is no longer 'choosing'/'drawing'.
   */
  function endTurnAndProceed(roomId: string) {
    const state = gameState[roomId];
    if (!state || !state.gameStarted) return;
    if (state.phase !== 'choosing' && state.phase !== 'drawing') return;

    state.phase = 'intermission';
    clearTurnTimers(roomId);

    const drawerId = state.drawingOrder[0];
    const drawerName = state.drawerName;
    const guesserCount = correctGuessers[roomId]?.size || 0;
    const drawerPoints = guesserCount * 50;
    if (drawerName && drawerPoints > 0 && playerPoints[roomId]) {
      playerPoints[roomId][drawerName] = (playerPoints[roomId][drawerName] || 0) + drawerPoints;
      io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
    }

    const word = wordState[roomId]?.currentWord;
    if (wordState[roomId]) wordState[roomId].currentWord = null; // guessing is closed
    if (word) {
      io.to(roomId).emit('chatMessage', { user: 'System', text: `The word was: ${word}`, timestamp: Date.now() });
    }

    // Move to the next person in the queue.
    if (state.drawingOrder[0] === drawerId) state.drawingOrder.shift();
    advanceAfterTurn(roomId, state);
  }

  /** Schedules what comes after an ended turn. Assumes phase === 'intermission'. */
  function advanceAfterTurn(roomId: string, state: GameState) {
    const currentPlayers = rooms[roomId] || [];
    if (currentPlayers.length < 2) {
      finishGame(roomId, state, 'Not enough players to continue.');
      return;
    }

    if (state.drawingOrder.length > 0) {
      // Next turn in the same round.
      const nextDrawerId = state.drawingOrder[0];
      const nextDrawerName = currentPlayers.find((p) => p.id === nextDrawerId)?.name || 'Next Player';
      io.to(roomId).emit('chatMessage', { user: 'System', text: `Get ready! ${nextDrawerName} is drawing next.`, timestamp: Date.now() });
      state.intermissionTimer = setTimeout(() => {
        state.intermissionTimer = undefined;
        if (gameState[roomId] === state && state.phase === 'intermission') startDrawingTurn(roomId);
      }, NEXT_TURN_DELAY_MS);
      return;
    }

    // Round is over.
    if (state.currentRound >= state.rounds) {
      finishGame(roomId, state);
      return;
    }

    let countdown = ROUND_COUNTDOWN_SECONDS;
    const interval = setInterval(() => {
      if (gameState[roomId] !== state || state.phase !== 'intermission') {
        clearInterval(interval);
        return;
      }
      io.to(roomId).emit('roundStartingSoon', { seconds: countdown });
      countdown--;
      if (countdown < 0) {
        clearInterval(interval);
        state.intermissionTimer = undefined;
        state.currentRound++;

        const players = rooms[roomId] || [];
        if (players.length < 2) {
          finishGame(roomId, state, 'Not enough players to continue.');
          return;
        }
        // Refill the drawing order for the new round.
        state.drawingOrder = players.map((p) => p.id).sort(() => Math.random() - 0.5);
        startDrawingTurn(roomId);
      }
    }, 1000);
    state.intermissionTimer = interval;
  }

  io.on('connection', (socket: Socket) => {
    let currentRoom: string | null = null;
    let playerName: string | null = null;

    socket.on('createRoom', async (payload) => {
      const data = validate(createRoomSchema, payload);
      if (!data) {
        socket.emit('createRoomError', { message: 'Invalid room settings.' });
        return;
      }
      if (!(await isAllowed(roomActionLimiter, clientAddress(socket)))) {
        socket.emit('createRoomError', { message: 'Too many requests. Please slow down.' });
        return;
      }

      const { roomId, rounds, timePerRound, maxPlayers } = data;
      // Logged-in users always join under their account name, so the host name
      // must match it or they'd be unable to start their own game.
      const hostName = socket.data.displayName || data.name;
      try {
        const settings = { rounds, timePerRound, maxPlayers };
        await createRoom(roomId, hostName, settings);
        gameState[roomId] = newGameState(settings);
        playerPoints[roomId] = {};
        scheduleEmptyRoomCleanup(roomId);
        socket.emit('createRoomSuccess', { roomId });
      } catch (err: any) {
        socket.emit('createRoomError', { message: err.message });
      }
    });

    socket.on('joinRoom', async (payload) => {
      const data = validate(joinRoomSchema, payload);
      if (!data) {
        socket.emit('joinError', { message: 'Invalid join request.' });
        return;
      }
      if (currentRoom) {
        socket.emit('joinError', { message: 'Already in a room.' });
        return;
      }
      if (!(await isAllowed(roomActionLimiter, clientAddress(socket)))) {
        socket.emit('joinError', { message: 'Too many requests. Please slow down.' });
        return;
      }

      // A logged-in user's account display name always wins over whatever name
      // string the client sends — prevents a logged-in player from spoofing a
      // different in-game name than their account, and means the client doesn't
      // need to be trusted for this at all.
      const name = socket.data.displayName || data.name;
      const { roomId } = data;
      try {
        if (gameState[roomId]?.gameStarted) {
          socket.emit('joinError', { message: 'Game already started. Cannot join.' });
          return;
        }
        const room = await joinRoom(roomId);

        // The room exists in MongoDB but not in memory: it emptied out earlier or
        // the server restarted. Rehydrate it from its persisted settings.
        const resumed = !gameState[roomId];
        if (resumed) {
          gameState[roomId] = newGameState({
            rounds: room.rounds ?? 3,
            timePerRound: room.timePerRound ?? 60,
            maxPlayers: room.maxPlayers ?? 8,
          });
        }

        if (!rooms[roomId]) rooms[roomId] = [];
        const maxPlayers = gameState[roomId].maxPlayers;
        if (rooms[roomId].length >= maxPlayers) {
          socket.emit('joinError', { message: 'Room is full.' });
          return;
        }

        const existingPlayer = rooms[roomId].find(p => p.name === name);
        if (existingPlayer) {
            socket.emit('joinError', { message: 'Name already taken in this room.' });
            return;
        }
        if (currentRoom) return; // a concurrent join from this socket already succeeded

        currentRoom = roomId;
        playerName = name;

        rooms[roomId].push({
          id: socket.id,
          name,
          userId: socket.data.userId,
        });
        socket.join(roomId);
        if (emptyRoomTimers[roomId]) {
          clearTimeout(emptyRoomTimers[roomId]);
          delete emptyRoomTimers[roomId];
        }

        // A resumed room whose host is gone would otherwise be unstartable.
        let hostName = room.hostName;
        if (resumed && rooms[roomId].length === 1 && hostName !== name) {
          const updated = await updateHost(roomId, name);
          hostName = updated?.hostName || name;
        }

        if (!chatHistory[roomId]) chatHistory[roomId] = [];
        if (!playerPoints[roomId]) playerPoints[roomId] = {};

        io.to(roomId).emit('playerList', { players: publicPlayers(rooms[roomId]), hostName });
        socket.emit('chatHistory', chatHistory[roomId]);
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
        socket.emit('joinRoomSuccess', { roomId });

      } catch (err: any) {
        socket.emit('joinError', { message: err.message });
      }
    });

    socket.on('chatMessage', async (payload) => {
      const data = validate(chatMessageSchema, payload);
      if (!data) return;
      const { roomId, user, text } = data;
      if (roomId !== currentRoom || user !== playerName) return; // don't trust client-supplied identity
      if (!(await isAllowed(chatLimiter, socket.id))) return;

      const state = gameState[roomId];
      const turnActive = !!state?.gameStarted && (state.phase === 'choosing' || state.phase === 'drawing');
      if (turnActive && socket.id === state.drawingOrder[0]) {
        socket.emit('chatError', { message: 'Drawer cannot send chat messages.' });
        return;
      }

      const currentWord = wordState[roomId]?.currentWord;
      const isGuessOpen = !!state?.gameStarted && state.phase === 'drawing' && !!currentWord;
      if (isGuessOpen && text.trim().toLowerCase() === currentWord!.trim().toLowerCase()) {
        if (!correctGuessers[roomId]) correctGuessers[roomId] = new Set();
        if (correctGuessers[roomId].has(user)) {
          return;
        }
        correctGuessers[roomId].add(user);

        const elapsed = state.roundStartTime ? Math.floor((Date.now() - state.roundStartTime) / 1000) : 0;
        const points = calculateGuessPoints(state.timePerRound, elapsed);

        playerPoints[roomId][user] = (playerPoints[roomId][user] || 0) + points;

        const message = { user, text: `${user} guessed the word!`, timestamp: Date.now(), correct: true };
        io.to(roomId).emit('chatMessage', message);
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);

        const players = rooms[roomId] || [];
        const drawerId = state.drawingOrder[0];
        const guessers = players.filter(p => p.id !== drawerId);

        if (guessers.length > 0 && guessers.every((p) => correctGuessers[roomId].has(p.name))) {
           endTurnAndProceed(roomId);
        }
        return;
      }

      const message = { user, text, timestamp: Date.now(), correct: false };
      if (!chatHistory[roomId]) chatHistory[roomId] = [];
      chatHistory[roomId].push(message);
      if (chatHistory[roomId].length > 100) chatHistory[roomId].shift();
      io.to(roomId).emit('chatMessage', message);
    });

    socket.on('drawing', async (payload) => {
      const parsed = validate(drawingSchema, payload);
      if (!parsed) return;
      const { roomId, ...line } = parsed;
      if (roomId !== currentRoom) return;
      const state = gameState[roomId];
      if (!state || !state.gameStarted || state.phase !== 'drawing' || socket.id !== state.drawingOrder[0]) return;
      if (!(await isAllowed(drawingLimiter, socket.id))) return;
      socket.to(roomId).emit('drawing', line);
    });

    socket.on('clearCanvas', (payload) => {
      const data = validate(clearCanvasSchema, payload);
      if (!data) return;
      const { roomId } = data;
      if (roomId !== currentRoom) return;
      const state = gameState[roomId];
      if (state && state.gameStarted && state.phase === 'drawing' && socket.id === state.drawingOrder[0]) {
          io.to(roomId).emit('canvasCleared');
      }
    });

    socket.on('chooseWord', (payload) => {
      const data = validate(chooseWordSchema, payload);
      if (!data) return;
      const roomId = currentRoom;
      if (!roomId || data.roomId !== roomId) return;

      const state = gameState[roomId];
      if (!state || state.phase !== 'choosing' || socket.id !== state.drawingOrder[0]) return;

      const offeredOptions = wordState[roomId]?.wordOptions;
      if (!offeredOptions || !offeredOptions.includes(data.word)) return;

      handleWordChosen(roomId, data.word);
    });

    socket.on('startGame', async () => {
      const roomId = currentRoom;
      if (!roomId) return;

      try {
        const players = rooms[roomId] || [];
        const host = players.find(p => p.id === socket.id);
        const roomInfo = await joinRoom(roomId);

        if (players.length >= 2 && host && host.name === roomInfo.hostName) {
          const state = gameState[roomId];
          if (!state || state.gameStarted) return;

          // Create a unique game instance and shuffled drawing order for the first round.
          state.gameId = randomUUID();
          state.drawingOrder = [...players].map(p => p.id).sort(() => Math.random() - 0.5);
          state.currentRound = 1;
          state.gameStarted = true;
          state.phase = 'intermission';

          playerPoints[roomId] = {};
          players.forEach(p => {
            playerPoints[roomId][p.name] = 0;
          });
          io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);

          io.to(roomId).emit('gameStarted', {
            rounds: state.rounds,
            timePerRound: state.timePerRound,
          });

          startDrawingTurn(roomId);
        }
      } catch (err) {
        logger.error({ err, roomId }, 'Failed to start game');
        socket.emit('startGameError', { message: 'Could not start the game. Please try again.' });
      }
    });

    socket.on('disconnect', () => {
      const roomId = currentRoom;
      if (!roomId || !rooms[roomId]) return;

      const disconnectedPlayer = rooms[roomId].find(p => p.id === socket.id);
      rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);

      if (rooms[roomId].length === 0) {
        cleanupRoom(roomId);
        return;
      }

      const state = gameState[roomId];
      if (disconnectedPlayer && state?.gameStarted) {
        const wasDrawing =
          disconnectedPlayer.id === state.drawingOrder[0] &&
          (state.phase === 'choosing' || state.phase === 'drawing');

        if (wasDrawing) {
          io.to(roomId).emit('chatMessage', { user: 'System', text: `${disconnectedPlayer.name} (drawer) has disconnected. Moving to next turn.`, timestamp: Date.now() });
          endTurnAndProceed(roomId);
        } else {
          // Drop them from the queue so the game never waits on a missing drawer.
          state.drawingOrder = state.drawingOrder.filter((id) => id !== disconnectedPlayer.id);
          if (rooms[roomId].length < 2) {
            finishGame(roomId, state, 'Not enough players to continue.');
          } else if (state.phase === 'drawing') {
            // They may have been the last guesser everyone was waiting on.
            const drawerId = state.drawingOrder[0];
            const guessers = rooms[roomId].filter((p) => p.id !== drawerId);
            if (guessers.length > 0 && guessers.every((p) => correctGuessers[roomId]?.has(p.name))) {
              endTurnAndProceed(roomId);
            }
          }
        }
      }

      joinRoom(roomId).then(async room => {
        let hostName = room.hostName;
        const remainingPlayers = rooms[roomId] || [];
        const hostStillPresent = remainingPlayers.some(p => p.name === hostName);

        if (!hostStillPresent && remainingPlayers.length > 0) {
          const newHost = remainingPlayers[0];
          const updated = await updateHost(roomId, newHost.name);
          hostName = updated?.hostName || newHost.name;
          io.to(roomId).emit('chatMessage', { user: 'System', text: `${newHost.name} is now the host.`, timestamp: Date.now() });
        }

        io.to(roomId).emit('playerList', { players: publicPlayers(remainingPlayers), hostName });
      }).catch((err) => {
        logger.error({ err, roomId }, 'Failed to update room after disconnect');
        io.to(roomId).emit('playerList', { players: publicPlayers(rooms[roomId] || []), hostName: '' });
      });
    });
  });

  // --- Health Checks ---
  const healthLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

  app.get('/health/live', healthLimiter, (_req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  app.get(['/health', '/health/ready'], healthLimiter, (_req, res) => {
    if (!isDatabaseReady()) {
      return res.status(503).json({ status: 'not_ready', database: 'disconnected' });
    }

    return res.status(200).json({ status: 'ready', database: 'connected' });
  });

  return { app, server, io };
}
