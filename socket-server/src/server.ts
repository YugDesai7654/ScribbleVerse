import express from 'express';
import http from 'http';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { parse as parseCookie } from 'cookie';
import rateLimit from 'express-rate-limit';
import { Server, Socket } from 'socket.io';
import { createRoom, joinRoom, updateHost } from './api/room';
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

export type GameState = {
  rounds: number;
  timePerRound: number;
  maxPlayers: number;
  currentRound: number;
  drawingOrder: string[]; // This will now be a queue of players for all turns
  gameStarted: boolean;
  roundStartTime?: number;
  roundTimer?: NodeJS.Timeout; // Authoritative server-side timer for each turn
  gameId?: string;
};

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
  app.use(express.json());
  app.use(cookieParser());

  app.use('/auth', authRouter);
  app.use('/leaderboard', leaderboardRouter);

  const server = http.createServer(app);

  // --- Socket.IO Setup with CORS ---
  const io = new Server(server, {
    cors: corsOptions
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

  // ====================================================================
  // --- YOUR ORIGINAL GAME LOGIC (now scoped per-app-instance for testability) ---
  // ====================================================================
  const { drawingLimiter, chatLimiter, roomActionLimiter } = createRateLimiters();

  const rooms: Rooms = {};
  const chatHistory: { [roomId: string]: { user: string; text: string; timestamp: number }[] } = {};
  const gameState: { [roomId: string]: GameState } = {};
  const playerPoints: { [roomId: string]: { [playerName: string]: number } } = {};
  const correctGuessers: { [roomId: string]: Set<string> } = {};
  const wordState: {
    [roomId: string]: {
      currentWord: string | null;
      wordOptions: string[];
      wordSelectionTimeout?: NodeJS.Timeout;
    }
  } = {};

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

  io.on('connection', (socket: Socket) => {
    let currentRoom: string | null = null;
    let playerName: string | null = null;

    socket.on('createRoom', async (payload) => {
      const data = validate(createRoomSchema, payload);
      if (!data) {
        socket.emit('createRoomError', { message: 'Invalid room settings.' });
        return;
      }
      if (!(await isAllowed(roomActionLimiter, socket.handshake.address))) {
        socket.emit('createRoomError', { message: 'Too many requests. Please slow down.' });
        return;
      }

      const { roomId, name, rounds, timePerRound, maxPlayers } = data;
      try {
        await createRoom(roomId, name);
        gameState[roomId] = {
          rounds,
          timePerRound,
          maxPlayers,
          currentRound: 1,
          drawingOrder: [],
          gameStarted: false,
        };
        playerPoints[roomId] = {};
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
      if (!(await isAllowed(roomActionLimiter, socket.handshake.address))) {
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

        if (!rooms[roomId]) rooms[roomId] = [];
        const maxPlayers = gameState[roomId]?.maxPlayers ?? 8;
        if (rooms[roomId].length >= maxPlayers) {
          socket.emit('joinError', { message: 'Room is full.' });
          return;
        }

        const existingPlayer = rooms[roomId].find(p => p.name === name);
        if (existingPlayer) {
            socket.emit('joinError', { message: 'Name already taken in this room.' });
            return;
        }

        currentRoom = roomId;
        playerName = name;

        rooms[roomId].push({
          id: socket.id,
          name,
          userId: socket.data.userId,
        });
        socket.join(roomId);

        if (!chatHistory[roomId]) chatHistory[roomId] = [];
        if (!playerPoints[roomId]) playerPoints[roomId] = {};

        io.to(roomId).emit('playerList', { players: publicPlayers(rooms[roomId]), hostName: room.hostName });
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
      if (state && state.gameStarted) {
        const drawerId = state.drawingOrder[0];
        if (socket.id === drawerId) {
          socket.emit('chatError', { message: 'Drawer cannot send chat messages.' });
          return;
        }
      }

      const currentWord = wordState[roomId]?.currentWord;
      if (currentWord && state?.gameStarted && text.trim().toLowerCase() === currentWord.trim().toLowerCase()) {
        if (!correctGuessers[roomId]) correctGuessers[roomId] = new Set();
        if (correctGuessers[roomId].has(user)) {
          return;
        }
        correctGuessers[roomId].add(user);

        const elapsed = state.roundStartTime ? Math.floor((Date.now() - state.roundStartTime) / 1000) : 0;
        const points = calculateGuessPoints(state.timePerRound, elapsed);

        if (!playerPoints[roomId][user]) playerPoints[roomId][user] = 0;
        playerPoints[roomId][user] += points;

        const message = { user, text: `${user} guessed the word!`, timestamp: Date.now(), correct: true };
        io.to(roomId).emit('chatMessage', message);
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);

        const players = rooms[roomId] || [];
        const drawerId = state.drawingOrder[0];
        const guessers = players.filter(p => p.id !== drawerId);

        if (correctGuessers[roomId].size >= guessers.length && guessers.length > 0) {
           const drawerPlayer = players.find(p => p.id === drawerId);
           endTurnAndProceed(roomId, state, drawerPlayer?.name || '');
        }
        return;
      }

      const message = { user, text, timestamp: Date.now(), correct: false };
      if (!chatHistory[roomId]) chatHistory[roomId] = [];
      chatHistory[roomId].push(message);
      io.to(roomId).emit('chatMessage', message);
    });

    socket.on('drawing', async (payload) => {
      const parsed = validate(drawingSchema, payload);
      if (!parsed) return;
      const { roomId, ...line } = parsed;
      if (roomId !== currentRoom) return;
      const state = gameState[roomId];
      if (!state || !state.gameStarted || socket.id !== state.drawingOrder[0]) return;
      if (!(await isAllowed(drawingLimiter, socket.id))) return;
      socket.to(roomId).emit('drawing', line);
    });

    socket.on('clearCanvas', (payload) => {
      const data = validate(clearCanvasSchema, payload);
      if (!data) return;
      const { roomId } = data;
      const state = gameState[roomId];
      if (state && state.gameStarted && socket.id === state.drawingOrder[0]) {
          io.to(roomId).emit('canvasCleared');
      }
    });

    function startDrawingTurn(roomId: string, drawerId: string, round: number) {
      const options = getRandomWords();
      wordState[roomId] = {
        currentWord: null,
        wordOptions: options,
      };

      if (gameState[roomId]) {
          gameState[roomId].roundStartTime = Date.now();
          correctGuessers[roomId] = new Set();
          io.to(roomId).emit('canvasCleared'); // Clear canvas for the new turn
      }

      io.to(drawerId).emit('wordOptions', { options, round });

      if (wordState[roomId].wordSelectionTimeout) {
        clearTimeout(wordState[roomId].wordSelectionTimeout);
      }
      // Automatically pick a word if the drawer doesn't choose in 10 seconds
      wordState[roomId].wordSelectionTimeout = setTimeout(() => {
        if (!wordState[roomId].currentWord) {
          handleWordChosen(roomId, drawerId, options[0], round);
        }
      }, 10000);
    }

    function endTurnAndProceed(roomId: string, state: GameState, drawerName: string) {
      // Clear the server-side timer for the turn that just ended
      if (state.roundTimer) {
          clearTimeout(state.roundTimer);
          state.roundTimer = undefined;
      }

      const guesserCount = correctGuessers[roomId]?.size || 0;
      const drawerPoints = guesserCount * 50;
      if (drawerName && drawerPoints > 0) {
          if (!playerPoints[roomId][drawerName]) playerPoints[roomId][drawerName] = 0;
          playerPoints[roomId][drawerName] += drawerPoints;
          io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
      }

      const word = wordState[roomId]?.currentWord;
      if (word) {
          io.to(roomId).emit('chatMessage', { user: 'System', text: `The word was: ${word}`, timestamp: Date.now() });
      }

      // Move to the next person in the queue
      state.drawingOrder.shift();

      if (state.drawingOrder.length === 0) { // Round is over
          if (state.currentRound >= state.rounds) { // Game is over
              state.gameStarted = false;
              const finalScores = Object.entries(playerPoints[roomId])
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
              return;
          }

          // Start the next round
          let countdown = 5;
          const interval = setInterval(() => {
            io.to(roomId).emit('roundStartingSoon', { seconds: countdown });
            countdown--;
            if (countdown < 0) {
              clearInterval(interval);
              state.currentRound++;

              // Refill the drawing order for the new round
              const currentPlayers = rooms[roomId] || [];
              if (currentPlayers.length < 2) {
                  io.to(roomId).emit('gameOver', { scores: [], reason: 'Not enough players to continue.' });
                  state.gameStarted = false;
                  return;
              }
              state.drawingOrder = currentPlayers.map(p => p.id).sort(() => Math.random() - 0.5);

              const nextDrawerId = state.drawingOrder[0];
              io.to(roomId).emit('drawingTurn', { drawerId: nextDrawerId, round: state.currentRound });
              startDrawingTurn(roomId, nextDrawerId, state.currentRound);
            }
          }, 1000);

      } else { // Next turn in the same round
          const nextDrawerId = state.drawingOrder[0];
          const nextDrawerName = rooms[roomId]?.find(p => p.id === nextDrawerId)?.name || 'Next Player';
          io.to(roomId).emit('chatMessage', { user: 'System', text: `Get ready! ${nextDrawerName} is drawing next.`, timestamp: Date.now() });

          setTimeout(() => {
              io.to(roomId).emit('drawingTurn', { drawerId: nextDrawerId, round: state.currentRound });
              startDrawingTurn(roomId, nextDrawerId, state.currentRound);
          }, 5000); // 5-second delay before next turn
      }
    }

    function handleWordChosen(roomId: string, drawerId: string, word: string, round: number) {
      // Prevent choosing a word multiple times
      if (wordState[roomId].currentWord) return;

      wordState[roomId].currentWord = word;
      if (wordState[roomId].wordSelectionTimeout) {
        clearTimeout(wordState[roomId].wordSelectionTimeout);
      }

      const state = gameState[roomId];
      if(!state) return;

      // Start the authoritative server-side timer for the turn
      if (state.roundTimer) clearTimeout(state.roundTimer);
      state.roundTimer = setTimeout(() => {
          const drawerPlayer = rooms[roomId]?.find(p => p.id === drawerId);
          if (drawerPlayer) {
              endTurnAndProceed(roomId, state, drawerPlayer.name);
          }
      }, state.timePerRound * 1000);


      const placeholder = getPlaceholder(word);
      const players = rooms[roomId] || [];
      players.forEach(p => {
        const payload = {
            word: p.id === drawerId ? word : placeholder,
            isDrawer: p.id === drawerId,
            round
        };
        io.to(p.id).emit('roundStart', payload);
      });
    }

    socket.on('chooseWord', (payload) => {
      const data = validate(chooseWordSchema, payload);
      if (!data) return;
      const { word, round } = data;
      const roomIdStr = currentRoom;
      if (!roomIdStr) return;

      const state = gameState[roomIdStr];
      if (!state) return;

      const drawerId = state.drawingOrder[0];
      if (socket.id !== drawerId) return;

      const offeredOptions = wordState[roomIdStr]?.wordOptions;
      if (!offeredOptions || !offeredOptions.includes(word)) return;

      handleWordChosen(roomIdStr, socket.id, word, round);
    });

    socket.on('startGame', async () => {
      const roomId = currentRoom;
      if (!roomId) return;

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

        playerPoints[roomId] = {};
        players.forEach(p => {
          playerPoints[roomId][p.name] = 0;
        });
        io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);

        io.to(roomId).emit('gameStarted', {
          rounds: state.rounds,
          timePerRound: state.timePerRound,
        });

        const firstDrawerId = state.drawingOrder[0];
        io.to(roomId).emit('drawingTurn', { drawerId: firstDrawerId, round: 1 });
        startDrawingTurn(roomId, firstDrawerId, 1);
      }
    });

    socket.on('disconnect', () => {
      if (currentRoom && rooms[currentRoom]) {
        const disconnectedPlayer = rooms[currentRoom].find(p => p.id === socket.id);

        rooms[currentRoom] = rooms[currentRoom].filter(p => p.id !== socket.id);

        if (rooms[currentRoom].length === 0) {
          delete rooms[currentRoom];
          delete gameState[currentRoom];
          delete chatHistory[currentRoom];
          delete playerPoints[currentRoom];
        } else {
            const state = gameState[currentRoom];
            // If the drawer disconnects, advance the turn
            if (disconnectedPlayer && state?.gameStarted && disconnectedPlayer.id === state.drawingOrder[0]) {
               io.to(currentRoom).emit('chatMessage', { user: 'System', text: `${disconnectedPlayer.name} (drawer) has disconnected. Moving to next turn.`, timestamp: Date.now() });
               endTurnAndProceed(currentRoom, state, disconnectedPlayer.name);
            }

          joinRoom(currentRoom).then(async room => {
            let hostName = room.hostName;
            const remainingPlayers = rooms[currentRoom!] || [];
            const hostStillPresent = remainingPlayers.some(p => p.name === hostName);

            if (!hostStillPresent && remainingPlayers.length > 0) {
              const newHost = remainingPlayers[0];
              const updated = await updateHost(currentRoom!, newHost.name);
              hostName = updated?.hostName || newHost.name;
              io.to(currentRoom!).emit('chatMessage', { user: 'System', text: `${newHost.name} is now the host.`, timestamp: Date.now() });
            }

            io.to(currentRoom!).emit('playerList', { players: publicPlayers(remainingPlayers), hostName });
          });
        }
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
