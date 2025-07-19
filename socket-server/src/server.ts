import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import dotenv from 'dotenv';
import { connectDB } from './dbConnect/dbconnect';
import { createRoom, joinRoom } from './api/room';

// --- Environment and DB Setup ---
dotenv.config();
// console.log(process.env.MONGO_URI);

connectDB();

// --- Server and CORS Setup ---
const app = express();

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

app.use(cors(corsOptions));

const server = http.createServer(app);

// --- Socket.IO Setup with CORS ---
const io = new Server(server, {
  cors: corsOptions
});

// ====================================================================
// --- YOUR ORIGINAL GAME LOGIC ---
// ====================================================================
type Player = { id: string; name: string };
type Rooms = { [roomId: string]: Player[] };
const rooms: Rooms = {};

const chatHistory: { [roomId: string]: { user: string; text: string; timestamp: number }[] } = {};

const gameState: {
  [roomId: string]: {
    rounds: number;
    timePerRound: number;
    currentRound: number;
    drawingOrder: string[]; // This will now be a queue of players for all turns
    gameStarted: boolean;
    roundStartTime?: number;
    roundTimer?: NodeJS.Timeout; // Authoritative server-side timer for each turn
  }
} = {};

const playerPoints: { [roomId: string]: { [playerName: string]: number } } = {};
const correctGuessers: { [roomId: string]: Set<string> } = {};

const WORD_LIST = [
  'apple', 'banana', 'car', 'dog', 'elephant', 'flower', 'guitar', 'house', 'island', 'jacket',
  'kangaroo', 'lemon', 'mountain', 'notebook', 'ocean', 'pizza', 'queen', 'robot', 'sun', 'tree',
  'umbrella', 'violin', 'whale', 'xylophone', 'yacht', 'zebra', 'balloon', 'cat', 'drum', 'egg',
  'fish', 'grape', 'hat', 'ice', 'juice', 'kite', 'lamp', 'moon', 'nest', 'orange',
];

const wordState: {
  [roomId: string]: {
    currentWord: string | null;
    wordOptions: string[];
    wordSelectionTimeout?: NodeJS.Timeout;
  }
} = {};

function getRandomWords(): string[] {
  const shuffled = [...WORD_LIST].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}

function getPlaceholder(word: string) {
  return word.split('').map(c => (c === ' ' ? ' ' : '_')).join(' ');
}

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let playerName: string | null = null;

  socket.on('createRoom', async ({ roomId, name, rounds = 3, timePerRound = 60 }) => {
    try {
      await createRoom(roomId, name);
      gameState[roomId] = {
        rounds: rounds,
        timePerRound: timePerRound,
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

  socket.on('joinRoom', async ({ roomId, name }) => {
    try {
      if (gameState[roomId]?.gameStarted) {
        socket.emit('joinError', { message: 'Game already started. Cannot join.' });
        return;
      }
      const room = await joinRoom(roomId);
      currentRoom = roomId;
      playerName = name;

      if (!rooms[roomId]) rooms[roomId] = [];
      const existingPlayer = rooms[roomId].find(p => p.name === name);
      if (existingPlayer) {
          socket.emit('joinError', { message: 'Name already taken in this room.' });
          return;
      }
      
      rooms[roomId].push({ id: socket.id, name });
      socket.join(roomId);

      if (!chatHistory[roomId]) chatHistory[roomId] = [];
      if (!playerPoints[roomId]) playerPoints[roomId] = {};
      
      io.to(roomId).emit('playerList', { players: rooms[roomId], hostName: room.hostName });
      socket.emit('chatHistory', chatHistory[roomId]);
      io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
      socket.emit('joinRoomSuccess', { roomId });

    } catch (err: any) {
      socket.emit('joinError', { message: err.message });
    }
  });

  socket.on('chatMessage', ({ roomId, user, text }: { roomId: string; user: string; text: string }) => {
    if (!roomId || !user || !text) return;
    
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
      const timeRemaining = Math.max(0, state.timePerRound - elapsed);
      const points = 50 + (timeRemaining * 5);

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

  socket.on('drawing', (data) => {
    const { roomId, ...line } = data;
    if (!roomId) return;
    socket.to(roomId).emit('drawing', line);
  });

  socket.on('clearCanvas', ({ roomId }) => {
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

  function endTurnAndProceed(roomId: string, state: typeof gameState[string], drawerName: string) {
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

  socket.on('chooseWord', ({ roomId, word, round }) => {
    const roomIdStr = currentRoom;
    if (!roomIdStr || !word) return;
    
    const state = gameState[roomIdStr];
    if (!state) return;
    
    const drawerId = state.drawingOrder[0];
    if (socket.id !== drawerId) return;

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
      if (!state) return;
      
      // Create a shuffled drawing order for the first round
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

        joinRoom(currentRoom).then(room => {
          io.to(currentRoom!).emit('playerList', { players: rooms[currentRoom!], hostName: room.hostName });
        });
      }
    }
  });
});

// ====================================================================
// --- END OF YOUR LOGIC ---
// ====================================================================


// --- Health Check & Server Start ---
app.get("/health", (req, res) => {
  res.status(200).send("Server is up and running!");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.io server running on port ${PORT}`);
});