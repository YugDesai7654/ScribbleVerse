import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from './dbConnect/dbconnect';
import { createRoom, joinRoom } from './api/room';

connectDB();

const app = express();
app.use(cors({ origin: '*' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

type Player = { id: string; name: string };
type Rooms = { [roomId: string]: Player[] };
const rooms: Rooms = {};

// Add chat storage per room
const chatHistory: { [roomId: string]: { user: string; text: string; timestamp: number }[] } = {};

// Add game state per room
const gameState: {
  [roomId: string]: {
    rounds: number;
    timePerRound: number;
    currentRound: number;
    drawingOrder: string[];
    drawnThisRound: string[];
    gameStarted: boolean;
    roundStartTime?: number; // Added for time-based scoring
  }
} = {};

// Add player points per room
const playerPoints: { [roomId: string]: { [playerName: string]: number } } = {};

// Track correct guessers per round
const correctGuessers: { [roomId: string]: Set<string> } = {};

// Hardcoded word list for the game
const WORD_LIST = [
  'apple', 'banana', 'car', 'dog', 'elephant', 'flower', 'guitar', 'house', 'island', 'jacket',
  'kangaroo', 'lemon', 'mountain', 'notebook', 'ocean', 'pizza', 'queen', 'robot', 'sun', 'tree',
  'umbrella', 'violin', 'whale', 'xylophone', 'yacht', 'zebra', 'balloon', 'cat', 'drum', 'egg',
  'fish', 'grape', 'hat', 'ice', 'juice', 'kite', 'lamp', 'moon', 'nest', 'orange',
];

// Store the current word and options per room/turn
const wordState: {
  [roomId: string]: {
    currentWord: string | null;
    wordOptions: string[];
    wordSelectionTimeout?: NodeJS.Timeout;
  }
} = {};

// Helper to pick 3 random words
function getRandomWords(): string[] {
  const shuffled = [...WORD_LIST].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}
// Helper to create placeholder (e.g., _ _ _ _)
function getPlaceholder(word: string) {
  return word.split('').map(c => (c === ' ' ? ' ' : '_')).join(' ');
}


io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let playerName: string | null = null;

  // Host creates a room
  socket.on('createRoom', async ({ roomId, name, rounds = 3, timePerRound = 60 }) => {
    try {
      await createRoom(roomId, name);
      // Initialize game state for the room
      gameState[roomId] = {
        rounds: rounds,
        timePerRound: timePerRound,
        currentRound: 1,
        drawingOrder: [],
        drawnThisRound: [],
        gameStarted: false,
      };
      socket.emit('createRoomSuccess', { roomId });
    } catch (err: any) {
      socket.emit('createRoomError', { message: err.message });
    }
  });

  // User joins a room
  socket.on('joinRoom', async ({ roomId, name }) => {
    try {
      // Prevent joining if game already started
      if (gameState[roomId]?.gameStarted) {
        socket.emit('joinError', { message: 'Game already started. Cannot join.' });
        return;
      }
      const room = await joinRoom(roomId);
      currentRoom = roomId;
      playerName = name;

      if (!rooms[roomId]) rooms[roomId] = [];
      // Check if name already exists with a different socket ID
      const existingPlayer = rooms[roomId].find(p => p.name === name);
      if (existingPlayer) {
        if (existingPlayer.id === socket.id) {
         
          console.log(`[joinRoom] Player re-joined: ${name} (socket: ${socket.id}) in room: ${roomId}`);
        } else {
          console.log(`[joinRoom] Name conflict: ${name} already taken in room: ${roomId}`);
          socket.emit('joinError', { message: 'Name already taken in this room.' });
          return;
        }
      } else {
        rooms[roomId].push({ id: socket.id, name });
        console.log(`[joinRoom] Player added: ${name} (socket: ${socket.id}) to room: ${roomId}`);
      }
      socket.join(roomId);

      // Initialize chat history for the room if not present
      if (!chatHistory[roomId]) chatHistory[roomId] = [];

      // Send player list and hostName
      io.to(roomId).emit('playerList', { players: rooms[roomId], hostName: room.hostName });
      // Send chat history to the newly joined client
      socket.emit('chatHistory', chatHistory[roomId]);
      socket.emit('joinRoomSuccess', { roomId });

      // If game is already started, send current game state to the joining player
      if (gameState[roomId]?.gameStarted) {
        const state = gameState[roomId];
        socket.emit('gameStarted', {
          rounds: state.rounds,
          timePerRound: state.timePerRound,
        });
        // Send current turn info
        const currentDrawerIndex = state.drawnThisRound.length;
        const currentDrawerId = state.drawingOrder[currentDrawerIndex];
        socket.emit('drawingTurn', {
          drawerId: currentDrawerId,
          round: state.currentRound,
        });
      }
    } catch (err: any) {
      console.log(`[joinRoom] Error: ${err.message}`);
      socket.emit('joinError', { message: err.message });
    }
  });

  // Handle chat messages
  socket.on('chatMessage', ({ roomId, user, text }: { roomId: string; user: string; text: string }) => {
    if (!roomId || !user || !text) return;
    // Prevent the drawer from sending chat messages
    const state = gameState[roomId];
    if (state) {
      const currentDrawerIndex = state.drawnThisRound.length;
      const currentDrawerId = state.drawingOrder[currentDrawerIndex];
      if (socket.id === currentDrawerId) {
        // Optionally, send an error back to the drawer
        socket.emit('chatError', { message: 'Drawer cannot send chat messages during their turn.' });
        return;
      }
    }
    // Check for correct guess
    const currentWord = wordState[roomId]?.currentWord;
    if (currentWord && state && text.trim().toLowerCase() === currentWord.trim().toLowerCase()) {
      // Only reward first correct guess per user per round
      if (!correctGuessers[roomId]) correctGuessers[roomId] = new Set();
      if (correctGuessers[roomId].has(user)) {
        // Already guessed this round, just show correct message
        const message = { user, text: `${user} guessed correctly!`, timestamp: Date.now(), correct: true };
        io.to(roomId).emit('chatMessage', message);
        return;
      }
      correctGuessers[roomId].add(user);
      // Calculate time remaining (from state.timePerRound and timer)
      // We'll need to track the round start time
      if (!state.roundStartTime) state.roundStartTime = Date.now();
      const elapsed = Math.floor((Date.now() - state.roundStartTime) / 1000);
      const timeRemaining = Math.max(0, state.timePerRound - elapsed);
      const points = timeRemaining * 5;
      if (!playerPoints[roomId]) playerPoints[roomId] = {};
      if (!playerPoints[roomId][user]) playerPoints[roomId][user] = 0;
      playerPoints[roomId][user] += points;
      // Broadcast special message
      const message = { user, text: `${user} guessed correctly!`, timestamp: Date.now(), correct: true };
      io.to(roomId).emit('chatMessage', message);
      // Emit updated points
      io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
      // Check if all guessers are correct (all except drawer)
      const players = rooms[roomId] || [];
      const drawerId = state.drawingOrder[0];
      const drawerPlayer = players.find(p => p.id === drawerId);
      const guesserNames = players.filter(p => p.name !== (drawerPlayer?.name || '')).map(p => p.name);
      const allGuessed = guesserNames.every(name => correctGuessers[roomId].has(name));
      if (allGuessed) {
        // End round (but keep 5s timer)
        endRoundWithDelay(roomId, state, drawerPlayer?.name || '', guesserNames);
      }
      return;
    }
    // Normal chat message
    const message = { user, text, timestamp: Date.now(), correct: false };
    if (!chatHistory[roomId]) chatHistory[roomId] = [];
    chatHistory[roomId].push(message);
    // Optionally limit chat history size
    if (chatHistory[roomId].length > 100) chatHistory[roomId].shift();
    io.to(roomId).emit('chatMessage', message);
  });

  // Handle drawing events
  socket.on('drawing', (data) => {
    const { roomId, ...line } = data;
    if (!roomId) return;
    console.log(`[drawing] Received from ${socket.id} in room ${roomId}:`, line);
    // Broadcast to all other clients in the room except sender
    socket.to(roomId).emit('drawing', line);
    console.log(`[drawing] Broadcasted to room ${roomId}`);
  });

  // After emitting 'drawingTurn', send word options to the drawer
  // Update the logic in startGame and endDrawingTurn to call a new function:

  function startDrawingTurn(roomId: string, drawerId: string, round: number) {
    // Pick 3 random words
    const options = getRandomWords();
    wordState[roomId] = {
      currentWord: null,
      wordOptions: options,
    };
    // Set round start time for time-based scoring
    if (gameState[roomId]) gameState[roomId].roundStartTime = Date.now();
    // Send options to the drawer only
    io.to(drawerId).emit('wordOptions', { options, round });
    // Start 10s timer for word selection
    if (wordState[roomId].wordSelectionTimeout) {
      clearTimeout(wordState[roomId].wordSelectionTimeout);
    }
    wordState[roomId].wordSelectionTimeout = setTimeout(() => {
      // If no word selected, auto-pick first
      if (!wordState[roomId].currentWord) {
        handleWordChosen(roomId, drawerId, options[0], round);
      }
    }, 10000);
  }

  // Helper to end round with 5s delay and drawer points
  function endRoundWithDelay(roomId: string, state: { currentRound: number; drawingOrder: string[]; drawnThisRound: string[]; roundStartTime?: number; timePerRound: number; rounds: number }, drawerName: string, guesserNames: string[]) {
    // Calculate drawer points: average of all guessers' points for this round
    const roundPoints = guesserNames.map(name => {
      // Points earned this round = total points - previous total (not tracked, so just use this round's points)
      // For simplicity, just sum points for this round (if needed, can track per-round points)
      return playerPoints[roomId]?.[name] || 0;
    });
    const avg = guesserNames.length > 0 ? Math.floor(roundPoints.reduce((a, b) => a + b, 0) / guesserNames.length) : 0;
    if (drawerName) {
      if (!playerPoints[roomId][drawerName]) playerPoints[roomId][drawerName] = 0;
      playerPoints[roomId][drawerName] += avg;
    }
    io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
    // 5s delay before next round
    let countdown = 5;
    const interval = setInterval(() => {
      io.to(roomId).emit('roundStartingSoon', { seconds: countdown });
      countdown--;
      if (countdown < 0) {
        clearInterval(interval);
        // Advance to next round or end game
        state.currentRound += 1;
        state.drawnThisRound = [];
        correctGuessers[roomId] = new Set();
        state.roundStartTime = Date.now();
        io.to(roomId).emit('newRound', { round: state.currentRound });
        io.to(roomId).emit('drawingTurn', { drawerId: state.drawingOrder[0], round: state.currentRound });
        startDrawingTurn(roomId, state.drawingOrder[0], state.currentRound);
      }
    }, 1000);
  }

  // Handle word chosen by drawer
  function handleWordChosen(roomId: string, drawerId: string, word: string, round: number) {
    wordState[roomId].currentWord = word;
    if (wordState[roomId].wordSelectionTimeout) {
      clearTimeout(wordState[roomId].wordSelectionTimeout);
    }
    // Notify all players: drawer gets the word, others get placeholder
    const placeholder = getPlaceholder(word);
    const players = rooms[roomId] || [];
    players.forEach(p => {
      if (p.id === drawerId) {
        io.to(p.id).emit('roundStart', { word, isDrawer: true, round });
      } else {
        io.to(p.id).emit('roundStart', { word: placeholder, isDrawer: false, round });
      }
    });
  }

  // Listen for drawer's word choice
  socket.on('chooseWord', ({ roomId, word, round }) => {
    if (!roomId || !word) return;
    // Only allow the current drawer to choose
    const state = gameState[roomId];
    if (!state) return;
    const currentDrawerIndex = state.drawnThisRound.length;
    const currentDrawerId = state.drawingOrder[currentDrawerIndex];
    if (socket.id !== currentDrawerId) return;
    // Only allow if not already chosen
    if (wordState[roomId]?.currentWord) return;
    handleWordChosen(roomId, socket.id, word, round);
  });

  // Update startGame and endDrawingTurn to use host as the only drawer
  socket.on('startGame', async () => {
    if (!currentRoom) return;
    const players = rooms[currentRoom] || [];
    // Only host can start the game
    if (players.length >= 2 && players[0].id === socket.id) {
      // Ensure gameState exists for the room
      if (!gameState[currentRoom]) {
        console.error(`[startGame] gameState for room ${currentRoom} does not exist.`);
        return;
      }
      // Find hostName from DB (for robustness)
      let hostName = playerName;
      try {
        const room = await joinRoom(currentRoom);
        hostName = room.hostName;
      } catch {}
      // Find the host's socket ID
      const hostPlayer = players.find(p => p.name === hostName);
      if (!hostPlayer) {
        console.error(`[startGame] Host not found in player list for room ${currentRoom}`);
        return;
      }
      // Set drawingOrder to only the host's socket ID
      gameState[currentRoom].drawingOrder = [hostPlayer.id];
      gameState[currentRoom].drawnThisRound = [];
      gameState[currentRoom].currentRound = 1;
      gameState[currentRoom].gameStarted = true;
      io.to(currentRoom).emit('gameStarted', {
        rounds: gameState[currentRoom].rounds,
        timePerRound: gameState[currentRoom].timePerRound,
        drawingOrder: gameState[currentRoom].drawingOrder,
      });
      // Start first turn (host is always the drawer)
      io.to(currentRoom).emit('drawingTurn', { drawerId: hostPlayer.id, round: 1 });
      startDrawingTurn(currentRoom, hostPlayer.id, 1);
    }
  });

  // Refactor endDrawingTurn: only host draws, so just advance round or end game
  socket.on('endDrawingTurn', () => {
    if (!currentRoom) return;
    const roomId = currentRoom; // cache as string
    const state = gameState[roomId];
    if (!state) return;
    // Only host can end the turn
    const hostId = state.drawingOrder[0];
    if (socket.id !== hostId) return;
    // Prevent double end for the same round
    if (state.drawnThisRound.includes(hostId)) {
      console.log('[DEBUG] endDrawingTurn ignored: host already ended this round');
      return;
    }
    // Mark host as having drawn this round
    state.drawnThisRound.push(hostId);
    console.log('[DEBUG] endDrawingTurn called. Current round:', state.currentRound, 'Total rounds:', state.rounds);
    // If all rounds are done, end game
    if (state.currentRound >= state.rounds) {
      state.gameStarted = false;
      io.to(roomId).emit('gameOver');
      console.log('[DEBUG] Game over emitted.');
    } else {
      // End round with 5s delay and drawer points
      const players = rooms[roomId] || [];
      const drawerPlayer = players.find(p => p.id === hostId);
      const guesserNames = players.filter(p => p.name !== (drawerPlayer?.name || '')).map(p => p.name);
      endRoundWithDelay(roomId, state, drawerPlayer?.name || '', guesserNames);
    }
  });

  // Refactor chooseWord: only host can choose
  socket.on('chooseWord', ({ roomId, word, round }) => {
    if (!roomId || !word) return;
    const state = gameState[roomId];
    if (!state) return;
    const hostId = state.drawingOrder[0];
    if (socket.id !== hostId) return;
    if (wordState[roomId]?.currentWord) return;
    handleWordChosen(roomId, socket.id, word, round);
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(p => p.id !== socket.id);
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
        delete gameState[currentRoom];
      } else {
        // Remove from drawing order and drawnThisRound if present
        if (gameState[currentRoom]) {
          gameState[currentRoom].drawingOrder = gameState[currentRoom].drawingOrder.filter(id => id !== socket.id);
          gameState[currentRoom].drawnThisRound = gameState[currentRoom].drawnThisRound.filter(id => id !== socket.id);
        }
        // Fetch hostName from DB for consistency
        joinRoom(currentRoom).then(room => {
          io.to(currentRoom!).emit('playerList', { players: rooms[currentRoom!], hostName: room.hostName });
        });
      }
    }
  });
});


server.listen(4000, () => {
  console.log('Socket.io server running on http://localhost:4000');
});
