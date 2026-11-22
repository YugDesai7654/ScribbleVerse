import express from 'express';
import http from 'http';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import proxyaddr from 'proxy-addr';
import cookieParser from 'cookie-parser';
import { parse as parseCookie } from 'cookie';
import rateLimit from 'express-rate-limit';
import { Server, Socket } from 'socket.io';
import { createRoom, joinRoom, touchRoom, updateHost, updateRoomSettings, type RoomSettings } from './api/room';
import {
  validate,
  createRoomSchema,
  joinRoomSchema,
  chatMessageSchema,
  drawingSchema,
  drawingBatchSchema,
  chooseWordSchema,
  clearCanvasSchema,
  undoStrokeSchema,
  fillSchema,
  updateSettingsSchema,
  kickPlayerSchema,
  startGameSchema,
  validateWithError,
} from './validation/schemas';
import { winnersOf } from './game/results';
import { drawingOrderFor } from './game/turnOrder';
import { buildWordPool, MIXED_WORDS, pickWordOptions, WORD_OPTION_COUNT, type Category } from './game/words';
import {
  buildHint,
  containsWord,
  hintCountFor,
  hintScheduleMs,
  isCloseGuess,
  isCorrectGuess,
  pickHintIndex,
} from './game/wordHelpers';
import {
  compactOps,
  fitGallery,
  isFill,
  GALLERY_OPS_PER_DRAWING,
  type DrawOp,
  type GalleryEntry,
} from './game/drawOps';
import { createRateLimiters, isAllowed } from './rateLimiters';
import { verifyToken, AUTH_COOKIE_NAME } from './auth/jwt';
import { User } from './model/user';
import { GameResult } from './model/gameResult';
import authRouter from './routes/auth';
import leaderboardRouter from './routes/leaderboard';
import usersRouter from './routes/users';
import { logger, requestLogger } from './logger';
import { isDatabaseReady } from './dbConnect/dbconnect';

// ====================================================================
// --- Pure helpers (exported for unit testing, no side effects) ---
// ====================================================================
export function getRandomWords(pool: readonly string[] = MIXED_WORDS, used: ReadonlySet<string> = new Set()): string[] {
  return pickWordOptions(pool, used);
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

type Player = {
  id: string; // current socket ID; replaced when the player reconnects
  name: string;
  userId?: string;
  reconnectToken: string; // secret: lets a refreshed tab reclaim this seat
  connected: boolean;
  graceTimer?: NodeJS.Timeout; // pending seat release while disconnected
};
type Rooms = { [roomId: string]: Player[] };

function publicPlayers(players: Player[]) {
  return players.map(({ id, name, connected }) => ({ id, name, connected }));
}

/** Socket.IO disconnect reasons that mean the player meant to leave (or was removed). */
const INTENTIONAL_DISCONNECTS = new Set(['client namespace disconnect', 'server namespace disconnect', 'server shutting down']);

const DEFAULT_SETTINGS: RoomSettings = {
  rounds: 3,
  timePerRound: 60,
  maxPlayers: 8,
  category: 'mixed',
  customWords: [],
  customWordsOnly: false,
};

/** Reads a room document's settings, defaulting anything an older document lacks. */
function settingsFromRoom(room: Partial<RoomSettings>): RoomSettings {
  return {
    rounds: room.rounds ?? DEFAULT_SETTINGS.rounds,
    timePerRound: room.timePerRound ?? DEFAULT_SETTINGS.timePerRound,
    maxPlayers: room.maxPlayers ?? DEFAULT_SETTINGS.maxPlayers,
    category: (room.category as Category | undefined) ?? DEFAULT_SETTINGS.category,
    customWords: [...(room.customWords ?? [])],
    customWordsOnly: room.customWordsOnly ?? DEFAULT_SETTINGS.customWordsOnly,
  };
}

/**
 * Turn lifecycle for a room:
 *   idle -> choosing (drawer picks a word) -> drawing (guessing is open)
 *        -> intermission (word revealed, waiting for next turn) -> choosing ...
 * Every handler checks the phase, so stale timers and late events can't act on
 * a turn that has already ended.
 */
export type TurnPhase = 'idle' | 'choosing' | 'drawing' | 'intermission';

export type GameState = RoomSettings & {
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
  participants: Map<string, string | undefined>; // name -> userId for everyone who started this game
  turnGains: { [playerName: string]: number }; // Points earned in the current turn
  usedWords: Set<string>; // Words already drawn this game, never offered again
  gallery: GalleryEntry[]; // Each finished turn's drawing, sent with gameOver
};

export type { StrokeSegment, FillOp, DrawOp } from './game/drawOps';

/** Upper bound on stored operations per turn, so a single drawing can't exhaust memory. */
const MAX_SEGMENTS_PER_TURN = 20_000;
/** Flood fills are costly for clients to replay, so each turn gets fewer of them. */
export const MAX_FILLS_PER_TURN = 100;

/** How long an unjoined room keeps its in-memory state before being reclaimed. */
const EMPTY_ROOM_GRACE_MS = 5 * 60 * 1000;
const WORD_SELECTION_MS = 10_000;
const NEXT_TURN_DELAY_MS = 5_000;
const ROUND_COUNTDOWN_SECONDS = 5;
/** How long a dropped player's seat is held during a game before their turn is skipped. */
export const RECONNECT_GRACE_MS = 30_000;
/** How long the creator's host-name reservation lasts if they never take their seat. */
export const HOST_CLAIM_MS = 2 * 60 * 1000;
/** Recent chat sent to a reconnecting player. */
const SYNC_CHAT_MESSAGES = 50;

export type AppOptions = {
  /** Overridable so tests don't have to wait out the real grace period. */
  reconnectGraceMs?: number;
  /** How long the creator's claim on the host name lasts. Overridable for tests. */
  hostClaimMs?: number;
};

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
export function createApp({ reconnectGraceMs = RECONNECT_GRACE_MS, hostClaimMs = HOST_CLAIM_MS }: AppOptions = {}) {
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
  app.use('/users', usersRouter);

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

  /**
   * Client IP for rate limiting. Uses the same trust rules as Express, so an
   * X-Forwarded-For value is only believed up to the proxies we trust; without a
   * trusted proxy this is the peer address.
   */
  function clientAddress(socket: Socket): string {
    return proxyaddr(socket.request, app.get('trust proxy fn'));
  }

  // ====================================================================
  // --- Game state (scoped per-app-instance for testability) ---
  // ====================================================================
  const { drawingLimiter, chatLimiter, roomActionLimiter, settingsLimiter } = createRateLimiters();

  const rooms: Rooms = {};
  const chatHistory: { [roomId: string]: { user: string; text: string; timestamp: number }[] } = {};
  const gameState: { [roomId: string]: GameState } = {};
  const playerPoints: { [roomId: string]: { [playerName: string]: number } } = {};
  const correctGuessers: { [roomId: string]: Set<string> } = {};
  const emptyRoomTimers: { [roomId: string]: NodeJS.Timeout } = {};
  /** Who may take the host's name until the creator has seated themselves. */
  const hostClaims: { [roomId: string]: { name: string; token: string; socketId: string; createdAt: number } } = {};

  /** Refreshes a room's TTL; a failure must never break the join or start that triggered it. */
  function keepRoomAlive(roomId: string) {
    touchRoom(roomId).catch((err) => logger.error({ err, roomId }, 'Failed to refresh room expiry'));
  }
  const wordState: {
    [roomId: string]: {
      currentWord: string | null;
      wordOptions: string[];
      wordSelectionTimeout?: NodeJS.Timeout;
      revealed: Set<number>; // letter indexes already given away as hints
      hintTimers: NodeJS.Timeout[];
    }
  } = {};
  // Drawing history for the current turn (segments and fills, in order): lets
  // the drawer undo, replays the canvas for rejoining clients, and becomes the
  // turn's gallery entry when it ends.
  const strokes: { [roomId: string]: DrawOp[] } = {};
  // Names the host kicked from a lobby; they can't rejoin that room.
  const kickedNames: { [roomId: string]: Set<string> } = {};

  function newGameState(settings: RoomSettings): GameState {
    return {
      ...settings,
      currentRound: 1,
      drawingOrder: [],
      gameStarted: false,
      customWords: [...settings.customWords],
      phase: 'idle',
      turnId: 0,
      turnGains: {},
      usedWords: new Set(),
      gallery: [],
      participants: new Map(),
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
    if (words) {
      words.wordSelectionTimeout = undefined;
      words.hintTimers.forEach(clearTimeout);
      words.hintTimers = [];
    }
  }

  /** Frees every piece of in-memory state (and pending timer) belonging to a room. */
  function cleanupRoom(roomId: string) {
    clearTurnTimers(roomId);
    if (emptyRoomTimers[roomId]) clearTimeout(emptyRoomTimers[roomId]);
    delete emptyRoomTimers[roomId];
    delete gameState[roomId];
    delete chatHistory[roomId];
    delete playerPoints[roomId];
    delete correctGuessers[roomId];
    delete wordState[roomId];
    delete strokes[roomId];
    delete kickedNames[roomId];
    delete hostClaims[roomId];
    for (const player of rooms[roomId] ?? []) if (player.graceTimer) clearTimeout(player.graceTimer);
    delete rooms[roomId];
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
    io.to(roomId).emit('gameOver', { scores: finalScores, gallery: fitGallery(state.gallery) });
    state.gallery = [];
    const completedGameId = state.gameId;
    if (completedGameId) {
      const winners = winnersOf(finalScores, new Set((rooms[roomId] || []).map((p) => p.name)));
      persistGameResults(roomId, completedGameId, finalScores, state.participants, winners).catch((err) => {
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
    finalScores: { name: string; score: number }[],
    participants: Map<string, string | undefined>,
    winners: Set<string>
  ) {
    for (const [name, userId] of participants) {
      if (!userId) continue; // guest player, nothing to persist

      const scoreEntry = finalScores.find((s) => s.name === name);
      const score = scoreEntry?.score || 0;
      const won = winners.has(name);

      try {
        // The login's name can be stale after an account rename; the account's
        // current name keeps the leaderboard attached to the right profile.
        const account = await User.findById(userId).select('displayName');
        const currentName = account?.displayName || name;
        await GameResult.create({
          gameId,
          userId,
          displayName: currentName,
          roomId,
          score,
          won,
        });

        const updatedUser = await User.findByIdAndUpdate(userId, {
          $inc: {
            totalScore: score,
            gamesPlayed: 1,
            gamesWon: won ? 1 : 0,
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

    const options = pickWordOptions(
      buildWordPool(state.category, state.customWords, state.customWordsOnly),
      state.usedWords
    );
    wordState[roomId] = { currentWord: null, wordOptions: options, revealed: new Set(), hintTimers: [] };
    strokes[roomId] = [];
    state.turnGains = {};
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
    state.usedWords.add(word);
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

    // Progressive hints: reveal a few letters to guessers as time runs down.
    words.hintTimers = hintScheduleMs(state.timePerRound, hintCountFor(word)).map((delay) =>
      setTimeout(() => {
        if (state.turnId !== turnId || state.phase !== 'drawing' || words.currentWord !== word) return;
        const index = pickHintIndex(word, words.revealed);
        if (index === null) return;
        words.revealed.add(index);
        const hintWord = buildHint(word, words.revealed);
        // Skip the drawer and anyone who already guessed: they hold the full word.
        for (const seat of rooms[roomId] || []) {
          if (!seat.connected || seat.id === (state.drawingOrder[0] ?? drawerId)) continue;
          if (correctGuessers[roomId]?.has(seat.name)) continue;
          io.to(seat.id).emit('hint', { word: hintWord });
        }
      }, delay)
    );

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
    const drawing = strokes[roomId] ?? [];
    if (word && drawerName && drawing.length > 0) {
      state.gallery.push({ drawerName, word, ops: compactOps(drawing, GALLERY_OPS_PER_DRAWING) });
    }
    if (word) {
      io.to(roomId).emit('chatMessage', { user: 'System', text: `The word was: ${word}`, timestamp: Date.now() });
    }
    if (drawerName && drawerPoints > 0) state.turnGains[drawerName] = drawerPoints;
    io.to(roomId).emit('turnEnded', {
      word,
      drawerName: drawerName ?? null,
      gains: Object.entries(state.turnGains)
        .map(([name, points]) => ({ name, points }))
        .sort((a, b) => b.points - a.points),
    });

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
        state.drawingOrder = drawingOrderFor(players);
        startDrawingTurn(roomId);
      }
    }, 1000);
    state.intermissionTimer = interval;
  }

  function systemMessage(roomId: string, text: string) {
    io.to(roomId).emit('chatMessage', { user: 'System', text, timestamp: Date.now() });
  }

  /** Ends the turn early once every connected guesser has the word. */
  function endTurnIfAllGuessed(roomId: string) {
    const state = gameState[roomId];
    if (!state?.gameStarted || state.phase !== 'drawing') return;
    const drawerId = state.drawingOrder[0];
    const guessers = (rooms[roomId] || []).filter((p) => p.id !== drawerId && p.connected);
    if (guessers.length > 0 && guessers.every((p) => correctGuessers[roomId]?.has(p.name))) {
      endTurnAndProceed(roomId);
    }
  }

  /**
   * Sends the room's settings to its connected players. Only the host gets the
   * custom word list itself; everyone else would otherwise see the answers.
   */
  function emitSettings(roomId: string, hostName: string, only?: Socket) {
    const state = gameState[roomId];
    if (!state) return;
    const shared = {
      rounds: state.rounds,
      timePerRound: state.timePerRound,
      maxPlayers: state.maxPlayers,
      category: state.category,
      customWordsOnly: state.customWordsOnly,
      customWordCount: state.customWords.length,
    };
    const forHost = { ...shared, customWords: state.customWords };
    for (const player of rooms[roomId] || []) {
      if (!player.connected || (only && player.id !== only.id)) continue;
      io.to(player.id).emit('settingsUpdated', player.name === hostName ? forHost : shared);
    }
  }

  /**
   * Promotes a new host if the current one has left, then broadcasts the
   * roster. A disconnected host still holds their seat (and the crown) during
   * the reconnect grace period.
   */
  function rosterDrawerId(roomId: string): string | null {
    const state = gameState[roomId];
    if (!state?.gameStarted || (state.phase !== 'choosing' && state.phase !== 'drawing')) return null;
    return state.drawingOrder[0] ?? null;
  }

  async function syncRoster(roomId: string): Promise<string> {
    try {
      const room = await joinRoom(roomId);
      let hostName: string = room.hostName;
      const players = rooms[roomId] || [];
      if (players.length > 0 && !players.some((p) => p.name === hostName)) {
        const newHost = players.find((p) => p.connected) ?? players[0];
        const updated = await updateHost(roomId, newHost.name);
        hostName = updated?.hostName || newHost.name;
        systemMessage(roomId, `${newHost.name} is now the host.`);
        emitSettings(roomId, hostName);
      }
      io.to(roomId).emit('playerList', { players: publicPlayers(rooms[roomId] || []), hostName, drawerId: rosterDrawerId(roomId) });
      return hostName;
    } catch (err) {
      logger.error({ err, roomId }, 'Failed to update room roster');
      io.to(roomId).emit('playerList', { players: publicPlayers(rooms[roomId] || []), hostName: '', drawerId: rosterDrawerId(roomId) });
      return '';
    }
  }

  /**
   * Takes a player out of the room for good (left, kicked, or didn't reconnect
   * in time) and keeps the game moving without them.
   */
  function removePlayer(roomId: string, playerId: string) {
    const players = rooms[roomId];
    const leaving = players?.find((p) => p.id === playerId);
    if (!players || !leaving) return;
    if (leaving.graceTimer) clearTimeout(leaving.graceTimer);
    leaving.graceTimer = undefined;
    rooms[roomId] = players.filter((p) => p !== leaving);

    if (rooms[roomId].length === 0) {
      cleanupRoom(roomId);
      return;
    }

    const state = gameState[roomId];
    if (state?.gameStarted) {
      const wasDrawing =
        leaving.id === state.drawingOrder[0] && (state.phase === 'choosing' || state.phase === 'drawing');
      if (wasDrawing) {
        systemMessage(roomId, `${leaving.name} (drawer) has left. Moving to next turn.`);
        endTurnAndProceed(roomId);
      } else {
        // Drop them from the queue so the game never waits on a missing drawer.
        state.drawingOrder = state.drawingOrder.filter((id) => id !== leaving.id);
        if (rooms[roomId].length < 2) {
          finishGame(roomId, state, 'Not enough players to continue.');
        } else {
          // They may have been the last guesser everyone was waiting on.
          endTurnIfAllGuessed(roomId);
        }
      }
    }

    void syncRoster(roomId);
  }

  /** Keeps a dropped player's seat, score and turn for the grace period. */
  function holdSeat(roomId: string, player: Player) {
    player.connected = false;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = setTimeout(() => {
      player.graceTimer = undefined;
      if (player.connected || !rooms[roomId]?.includes(player)) return;
      systemMessage(roomId, `${player.name} didn't reconnect in time.`);
      removePlayer(roomId, player.id);
    }, reconnectGraceMs);
    player.graceTimer.unref?.();

    systemMessage(roomId, `${player.name} lost connection. Holding their seat for ${Math.round(reconnectGraceMs / 1000)}s.`);
    // A dropped guesser shouldn't hold up a turn everyone else has already solved.
    endTurnIfAllGuessed(roomId);
    void syncRoster(roomId);
  }

  /** Everything a (re)joining client needs to redraw the room as it is right now. */
  function buildSyncState(roomId: string, forSocketId: string) {
    const state = gameState[roomId];
    const words = wordState[roomId];
    const drawerId = state.gameStarted ? (state.drawingOrder[0] ?? null) : null;
    const isDrawer = drawerId === forSocketId;
    const phase = state.gameStarted ? state.phase : 'lobby';
    const now = Date.now();
    const startedAt = state.roundStartTime ?? now;

    let word: string | null = null;
    let timeLeft = 0;
    if (phase === 'drawing' && words?.currentWord) {
      const seatName = rooms[roomId]?.find((p) => p.id === forSocketId)?.name;
      const knowsWord = isDrawer || (!!seatName && !!correctGuessers[roomId]?.has(seatName));
      word = knowsWord ? words.currentWord : buildHint(words.currentWord, words.revealed);
      timeLeft = Math.ceil((startedAt + state.timePerRound * 1000 - now) / 1000);
    } else if (phase === 'choosing') {
      timeLeft = Math.ceil((startedAt + WORD_SELECTION_MS - now) / 1000);
    }

    return {
      phase,
      round: state.currentRound,
      totalRounds: state.rounds,
      timePerRound: state.timePerRound,
      drawerId,
      isDrawer,
      word,
      wordOptions: isDrawer && phase === 'choosing' ? (words?.wordOptions ?? null) : null,
      timeLeft: Math.max(0, timeLeft),
      scores: playerPoints[roomId] ?? {},
      guessed: [...(correctGuessers[roomId] ?? [])],
      strokes: state.gameStarted ? (strokes[roomId] ?? []) : [],
      chat: (chatHistory[roomId] ?? []).slice(-SYNC_CHAT_MESSAGES),
    };
  }

  /** Clears the empty-room reclaim timer once someone is in the room again. */
  function cancelEmptyRoomCleanup(roomId: string) {
    if (emptyRoomTimers[roomId]) {
      clearTimeout(emptyRoomTimers[roomId]);
      delete emptyRoomTimers[roomId];
    }
  }

  io.on('connection', (socket: Socket) => {
    let currentRoom: string | null = null;
    let playerName: string | null = null;

    /** Moves a held seat onto this socket and sends it the live game state. */
    async function rejoinSeat(roomId: string, seat: Player) {
      const oldId = seat.id;
      if (seat.graceTimer) clearTimeout(seat.graceTimer);
      seat.graceTimer = undefined;
      seat.id = socket.id;
      seat.connected = true;

      const state = gameState[roomId];
      if (state) state.drawingOrder = state.drawingOrder.map((id) => (id === oldId ? socket.id : id));
      // A seat that appeared after the game began still counts as a participant.
      if (state?.gameStarted && !state.participants.has(seat.name)) state.participants.set(seat.name, seat.userId);
      socket.join(roomId);
      cancelEmptyRoomCleanup(roomId);

      // The old socket may still look alive (e.g. the server hasn't noticed a
      // dropped network yet, or a duplicated tab). Its seat now belongs to this
      // socket, so its own disconnect handler will find nothing to remove.
      if (oldId !== socket.id) {
        const stale = io.sockets.sockets.get(oldId);
        // Tells the old tab it was replaced (not that the server went away), so
        // it doesn't try to reconnect and fight for the seat.
        stale?.emit('sessionMoved');
        stale?.disconnect(true);
      }

      socket.emit('joinRoomSuccess', { roomId, reconnectToken: seat.reconnectToken, name: seat.name, rejoined: true });
      socket.emit('syncState', buildSyncState(roomId, socket.id));
      systemMessage(roomId, `${seat.name} reconnected.`);
      const hostName = await syncRoster(roomId);
      emitSettings(roomId, hostName, socket);
    }

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
      // A code that is still live in memory belongs to a running room, even if
      // its database record has expired.
      if (gameState[roomId]) {
        socket.emit('createRoomError', { message: 'Room already exists' });
        return;
      }
      try {
        const settings: RoomSettings = { ...DEFAULT_SETTINGS, rounds, timePerRound, maxPlayers };
        await createRoom(roomId, hostName, settings);
        if (gameState[roomId]) {
          socket.emit('createRoomError', { message: 'Room already exists' });
          return;
        }
        gameState[roomId] = newGameState(settings);
        playerPoints[roomId] = {};
        const hostToken = randomUUID();
        hostClaims[roomId] = { name: hostName, token: hostToken, socketId: socket.id, createdAt: Date.now() };
        scheduleEmptyRoomCleanup(roomId);
        socket.emit('createRoomSuccess', { roomId, hostToken });
      } catch (err: any) {
        if (err?.message === 'Room already exists') {
          socket.emit('createRoomError', { message: 'Room already exists' });
        } else {
          logger.error({ err, roomId }, 'createRoom failed');
          socket.emit('createRoomError', { message: 'Could not create the room. Please try again.' });
        }
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
      // A logged-in user's account display name always wins over whatever name
      // string the client sends — prevents a logged-in player from spoofing a
      // different in-game name than their account, and means the client doesn't
      // need to be trusted for this at all.
      const name = socket.data.displayName || data.name;
      const { roomId, reconnectToken, hostToken } = data;
      try {
        // A valid token reclaims a held seat, even mid-game. A logged-in seat can
        // only be reclaimed by the same account, so a leaked token isn't enough.
        const seat = reconnectToken
          ? rooms[roomId]?.find((p) => p.reconnectToken === reconnectToken)
          : undefined;
        if (seat && (!seat.userId || seat.userId === socket.data.userId)) {
          if (currentRoom) return; // a concurrent join from this socket already succeeded
          currentRoom = roomId;
          playerName = seat.name;
          keepRoomAlive(roomId);
          await rejoinSeat(roomId, seat);
          return;
        }

        // Held seats reclaim above without spending the per-IP join budget, so a
        // flaky connection can't lock a player out of their own seat.
        if (!(await isAllowed(roomActionLimiter, clientAddress(socket)))) {
          socket.emit('joinError', { message: 'Too many requests. Please slow down.' });
          return;
        }

        if (gameState[roomId]?.gameStarted) {
          socket.emit('joinError', { message: 'Game already started. Cannot join.' });
          return;
        }
        const room = await joinRoom(roomId);
        // The host may have started the game while the lookup was pending.
        if (gameState[roomId]?.gameStarted) {
          socket.emit('joinError', { message: 'Game already started. Cannot join.' });
          return;
        }

        // The room exists in MongoDB but not in memory: it emptied out earlier or
        // the server restarted. Rehydrate it from its persisted settings.
        const resumed = !gameState[roomId];
        if (resumed) {
          gameState[roomId] = newGameState(settingsFromRoom(room));
        }
        if (kickedNames[roomId]?.has(name)) {
          socket.emit('joinError', { message: 'The host removed you from this room.' });
          return;
        }

        if (!rooms[roomId]) rooms[roomId] = [];
        const maxPlayers = gameState[roomId].maxPlayers;
        if (rooms[roomId].length >= maxPlayers) {
          socket.emit('joinError', { message: 'Room is full.' });
          return;
        }

        // Until the creator has taken their seat, their name is reserved: only
        // the creating socket, or a join carrying the host token, may use it.
        if (hostClaims[roomId] && Date.now() - hostClaims[roomId].createdAt >= hostClaimMs) {
          delete hostClaims[roomId]; // the creator never came back for their seat
        }
        const claim = hostClaims[roomId];
        if (claim && name === claim.name && socket.id !== claim.socketId && hostToken !== claim.token) {
          socket.emit('joinError', { message: 'Name already taken in this room.' });
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

        const token = randomUUID();
        rooms[roomId].push({
          id: socket.id,
          name,
          userId: socket.data.userId,
          reconnectToken: token,
          connected: true,
        });
        socket.join(roomId);
        cancelEmptyRoomCleanup(roomId);
        if (hostClaims[roomId]?.name === name) delete hostClaims[roomId];
        keepRoomAlive(roomId);

        // A resumed room whose host is gone would otherwise be unstartable.
        let hostName = room.hostName;
        if (resumed && rooms[roomId].length === 1 && hostName !== name) {
          const updated = await updateHost(roomId, name);
          hostName = updated?.hostName || name;
        }

        if (!chatHistory[roomId]) chatHistory[roomId] = [];
        if (!playerPoints[roomId]) playerPoints[roomId] = {};

        io.to(roomId).emit('playerList', { players: publicPlayers(rooms[roomId]), hostName, drawerId: rosterDrawerId(roomId) });
        socket.emit('chatHistory', chatHistory[roomId]);
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
        emitSettings(roomId, hostName, socket);
        socket.emit('joinRoomSuccess', { roomId, reconnectToken: token, name });

      } catch (err: any) {
        if (err?.message === 'Room does not exist') {
          socket.emit('joinError', { message: 'Room does not exist' });
        } else {
          logger.error({ err, roomId }, 'joinRoom failed');
          socket.emit('joinError', { message: 'Could not join the room. Please try again.' });
        }
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
      const alreadyGuessed = isGuessOpen && !!correctGuessers[roomId]?.has(user);

      if (alreadyGuessed) {
        // Players who know the word may only talk to each other and the drawer,
        // so they can't leak it. Never echo the word itself, even here.
        if (isCorrectGuess(text, currentWord!)) return;
        const drawerId = state.drawingOrder[0];
        const audience = (rooms[roomId] || []).filter(
          (p) => p.id === drawerId || correctGuessers[roomId].has(p.name)
        );
        const message = { user, text, timestamp: Date.now(), correct: false, guessed: true };
        audience.forEach((p) => io.to(p.id).emit('chatMessage', message));
        return;
      }

      if (isGuessOpen && !isCorrectGuess(text, currentWord!) && containsWord(text, currentWord!)) {
        // A message with the word inside it would hand the answer to everyone.
        socket.emit('closeGuess', { text });
        return;
      }

      if (isGuessOpen && !isCorrectGuess(text, currentWord!) && isCloseGuess(text, currentWord!)) {
        // Tell only the guesser; broadcasting a near-miss would hand others the answer.
        socket.emit('closeGuess', { text });
        return;
      }

      if (isGuessOpen && isCorrectGuess(text, currentWord!)) {
        if (!correctGuessers[roomId]) correctGuessers[roomId] = new Set();
        correctGuessers[roomId].add(user);

        const elapsed = state.roundStartTime ? Math.floor((Date.now() - state.roundStartTime) / 1000) : 0;
        const points = calculateGuessPoints(state.timePerRound, elapsed);

        playerPoints[roomId][user] = (playerPoints[roomId][user] || 0) + points;
        state.turnGains[user] = points;

        const message = { user, text: `${user} guessed the word!`, timestamp: Date.now(), correct: true };
        io.to(roomId).emit('chatMessage', message);
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);

        endTurnIfAllGuessed(roomId);
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
      const history = (strokes[roomId] ??= []);
      if (history.length >= MAX_SEGMENTS_PER_TURN) return;
      history.push(line);
      socket.to(roomId).emit('drawing', line);
    });

    socket.on('drawingBatch', async (payload) => {
      const parsed = validate(drawingBatchSchema, payload);
      if (!parsed) return;
      const { roomId, segments } = parsed;
      if (roomId !== currentRoom) return;
      const state = gameState[roomId];
      if (!state || !state.gameStarted || state.phase !== 'drawing' || socket.id !== state.drawingOrder[0]) return;
      // One limiter point per batch, not per segment.
      if (!(await isAllowed(drawingLimiter, socket.id))) return;
      // The turn may have moved on while the limiter was pending.
      if (gameState[roomId] !== state || state.phase !== 'drawing' || socket.id !== state.drawingOrder[0]) return;
      const history = (strokes[roomId] ??= []);
      const accepted = segments.slice(0, Math.max(0, MAX_SEGMENTS_PER_TURN - history.length));
      if (accepted.length === 0) return;
      history.push(...accepted);
      socket.to(roomId).emit('drawingBatch', { segments: accepted });
    });

    socket.on('fill', async (payload) => {
      const parsed = validate(fillSchema, payload);
      if (!parsed) return;
      const { roomId, ...fill } = parsed;
      if (roomId !== currentRoom) return;
      const state = gameState[roomId];
      if (!state || !state.gameStarted || state.phase !== 'drawing' || socket.id !== state.drawingOrder[0]) return;
      if (!(await isAllowed(drawingLimiter, socket.id))) return;
      const history = (strokes[roomId] ??= []);
      if (history.length >= MAX_SEGMENTS_PER_TURN) return;
      if (history.filter(isFill).length >= MAX_FILLS_PER_TURN) return;
      const op = { type: 'fill' as const, ...fill };
      history.push(op);
      socket.to(roomId).emit('fill', op);
    });

    socket.on('undoStroke', async (payload) => {
      const data = validate(undoStrokeSchema, payload);
      if (!data || data.roomId !== currentRoom) return;
      const state = gameState[data.roomId];
      if (!state || !state.gameStarted || state.phase !== 'drawing' || socket.id !== state.drawingOrder[0]) return;
      if (!(await isAllowed(drawingLimiter, socket.id))) return;

      const history = strokes[data.roomId];
      const last = history?.[history.length - 1];
      if (!last) return;
      strokes[data.roomId] = history.filter((segment) => segment.strokeId !== last.strokeId);
      io.to(data.roomId).emit('strokeUndone', { strokeId: last.strokeId });
    });

    socket.on('clearCanvas', async (payload) => {
      const data = validate(clearCanvasSchema, payload);
      if (!data) return;
      const { roomId } = data;
      if (roomId !== currentRoom) return;
      const state = gameState[roomId];
      if (state && state.gameStarted && state.phase === 'drawing' && socket.id === state.drawingOrder[0]) {
          if (!(await isAllowed(drawingLimiter, socket.id))) return;
          strokes[roomId] = [];
          io.to(roomId).emit('canvasCleared');
      }
    });

    socket.on('chooseWord', async (payload) => {
      const data = validate(chooseWordSchema, payload);
      if (!data) return;
      const roomId = currentRoom;
      if (!roomId || data.roomId !== roomId) return;

      const state = gameState[roomId];
      if (!state || state.phase !== 'choosing' || socket.id !== state.drawingOrder[0]) return;

      const offeredOptions = wordState[roomId]?.wordOptions;
      if (!offeredOptions || !offeredOptions.includes(data.word)) return;
      if (!(await isAllowed(drawingLimiter, socket.id))) return;
      // The turn may have moved on while the limiter was pending.
      if (gameState[roomId] !== state || state.phase !== 'choosing' || wordState[roomId]?.wordOptions !== offeredOptions) return;

      handleWordChosen(roomId, data.word);
    });

    socket.on('startGame', async (payload) => {
      if (validate(startGameSchema, payload) === null) return;
      const roomId = currentRoom;
      if (!roomId) return;
      if (!(await isAllowed(settingsLimiter, socket.id))) return;

      try {
        const roomInfo = await joinRoom(roomId);
        // Read the roster only now: players may have left during the lookup.
        const players = rooms[roomId] || [];
        const host = players.find(p => p.id === socket.id);
        const state = gameState[roomId];
        if (!host || host.name !== roomInfo.hostName) return;
        if (!state || state.gameStarted) return;

        const drawingOrder = drawingOrderFor(players);
        if (drawingOrder.length < 2) {
          socket.emit('startGameError', { message: 'Need at least 2 connected players to start.' });
          return;
        }

        // Create a unique game instance and shuffled drawing order for the first round.
        state.gameId = randomUUID();
        state.drawingOrder = drawingOrder;
        state.currentRound = 1;
        state.gameStarted = true;
        state.phase = 'intermission';
        keepRoomAlive(roomId);
        state.usedWords = new Set();
        state.gallery = [];

        playerPoints[roomId] = {};
        state.participants = new Map();
        players.filter((p) => p.connected).forEach(p => {
          playerPoints[roomId][p.name] = 0;
          state.participants.set(p.name, p.userId);
        });
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);

        io.to(roomId).emit('gameStarted', {
          rounds: state.rounds,
          timePerRound: state.timePerRound,
        });

        startDrawingTurn(roomId);
      } catch (err) {
        logger.error({ err, roomId }, 'Failed to start game');
        socket.emit('startGameError', { message: 'Could not start the game. Please try again.' });
      }
    });

    socket.on('updateSettings', async (payload) => {
      const parsed = validateWithError(updateSettingsSchema, payload);
      if (parsed.error !== undefined) {
        socket.emit('settingsError', { message: parsed.error });
        return;
      }
      const { roomId, ...changes } = parsed.data;
      if (roomId !== currentRoom) return;
      if (!(await isAllowed(settingsLimiter, socket.id))) {
        socket.emit('settingsError', { message: 'Too many changes. Please slow down.' });
        return;
      }

      try {
        const room = await joinRoom(roomId);
        const state = gameState[roomId];
        // Host-only, and settings are locked once the game is running.
        if (!state || state.gameStarted || room.hostName !== playerName) return;

        const next = { ...state, ...changes };
        const playerCount = rooms[roomId]?.length ?? 0;
        if (next.maxPlayers < playerCount) {
          socket.emit('settingsError', { message: `There are already ${playerCount} players in the room.` });
          return;
        }
        if (next.customWordsOnly && next.customWords.length < WORD_OPTION_COUNT) {
          socket.emit('settingsError', {
            message: `Add at least ${WORD_OPTION_COUNT} custom words to play with only custom words.`,
          });
          return;
        }

        Object.assign(state, changes);
        updateRoomSettings(roomId, changes).catch((err) => {
          logger.error({ err, roomId }, 'Failed to persist room settings');
        });
        emitSettings(roomId, room.hostName);
      } catch (err) {
        logger.error({ err, roomId }, 'Failed to update settings');
        socket.emit('settingsError', { message: 'Could not update settings. Please try again.' });
      }
    });

    socket.on('kickPlayer', async (payload) => {
      const data = validate(kickPlayerSchema, payload);
      if (!data || data.roomId !== currentRoom || data.playerId === socket.id) return;
      const { roomId, playerId } = data;
      if (!(await isAllowed(settingsLimiter, socket.id))) return;

      try {
        const room = await joinRoom(roomId);
        const state = gameState[roomId];
        // Host-only, lobby-only.
        if (!state || state.gameStarted || room.hostName !== playerName) return;
        const target = rooms[roomId]?.find((p) => p.id === playerId);
        if (!target) return;

        (kickedNames[roomId] ??= new Set()).add(target.name);
        const targetSocket = io.sockets.sockets.get(target.id);
        io.to(target.id).emit('kicked', { message: 'The host removed you from the room.' });
        systemMessage(roomId, `${target.name} was removed by the host.`);
        // Remove the seat first so the socket's own disconnect handler is a no-op.
        removePlayer(roomId, target.id);
        targetSocket?.leave(roomId);
        targetSocket?.disconnect(true);
      } catch (err) {
        logger.error({ err, roomId }, 'Failed to kick player');
      }
    });

    socket.on('disconnect', (reason) => {
      const roomId = currentRoom;
      if (!roomId || !rooms[roomId]) return;
      const player = rooms[roomId].find((p) => p.id === socket.id);
      if (!player) return; // seat was handed to a newer socket, or already removed

      // A refresh or network drop mid-game holds the seat; leaving on purpose doesn't.
      if (!INTENTIONAL_DISCONNECTS.has(reason) && gameState[roomId]?.gameStarted) {
        holdSeat(roomId, player);
      } else {
        removePlayer(roomId, player.id);
      }
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
