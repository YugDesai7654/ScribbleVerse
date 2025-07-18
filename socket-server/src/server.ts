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
    roundStartTime?: number;
  }
} = {};

// Add player points per room
const playerPoints: { [roomId: string]: { [playerName: string]: number } } = {};

// Track correct guessers per round
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
        drawnThisRound: [],
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
    if (state) {
      const hostId = state.drawingOrder[0];
      if (socket.id === hostId) {
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
      const points = 50 + (timeRemaining * 5); // Base points + time bonus

      if (!playerPoints[roomId][user]) playerPoints[roomId][user] = 0;
      playerPoints[roomId][user] += points;

      const message = { user, text: `${user} guessed the word!`, timestamp: Date.now(), correct: true };
      io.to(roomId).emit('chatMessage', message);
      io.to(roomId).emit('pointsUpdate', playerPoints[roomId]);
      
      const players = rooms[roomId] || [];
      const hostId = state.drawingOrder[0];
      const guessers = players.filter(p => p.id !== hostId);
      
      if (correctGuessers[roomId].size >= guessers.length) {
         const drawerPlayer = players.find(p => p.id === hostId);
         endRoundWithDelay(roomId, state, drawerPlayer?.name || '');
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

  // NEW: Handler for clearing the canvas
  socket.on('clearCanvas', ({ roomId }) => {
    // Check to ensure only the current drawer can clear the canvas
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
    }
    
    io.to(drawerId).emit('wordOptions', { options, round });
    
    if (wordState[roomId].wordSelectionTimeout) {
      clearTimeout(wordState[roomId].wordSelectionTimeout);
    }
    wordState[roomId].wordSelectionTimeout = setTimeout(() => {
      if (!wordState[roomId].currentWord) {
        handleWordChosen(roomId, drawerId, options[0], round);
      }
    }, 10000);
  }

  function endRoundWithDelay(roomId: string, state: typeof gameState[string], drawerName: string) {
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

    if (state.currentRound >= state.rounds) {
        state.gameStarted = false;
        const finalScores = Object.entries(playerPoints[roomId])
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score);
        io.to(roomId).emit('gameOver', { scores: finalScores });
        return;
    }

    let countdown = 5;
    const interval = setInterval(() => {
      io.to(roomId).emit('roundStartingSoon', { seconds: countdown });
      countdown--;
      if (countdown < 0) {
        clearInterval(interval);
        state.currentRound += 1;
        state.drawnThisRound = [];
        const hostId = state.drawingOrder[0];
        io.to(roomId).emit('drawingTurn', { drawerId: hostId, round: state.currentRound });
        startDrawingTurn(roomId, hostId, state.currentRound);
      }
    }, 1000);
  }

  function handleWordChosen(roomId: string, drawerId: string, word: string, round: number) {
    if (wordState[roomId].currentWord) return;
    
    wordState[roomId].currentWord = word;
    if (wordState[roomId].wordSelectionTimeout) {
      clearTimeout(wordState[roomId].wordSelectionTimeout);
    }

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
    
    const hostId = state.drawingOrder[0];
    if (socket.id !== hostId) return;

    handleWordChosen(roomIdStr, socket.id, word, round);
  });

  socket.on('startGame', async () => {
    const roomId = currentRoom;
    if (!roomId) return; 
    
    const players = rooms[roomId] || [];
    
    if (players.length >= 2 && players[0].id === socket.id) {
      if (!gameState[roomId]) return;
      
      let hostName = playerName;
      try {
        const room = await joinRoom(roomId);
        hostName = room.hostName;
      } catch {}

      const hostPlayer = players.find(p => p.name === hostName);
      if (!hostPlayer) return;

      const state = gameState[roomId];
      state.drawingOrder = [hostPlayer.id];
      state.drawnThisRound = [];
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

      io.to(roomId).emit('drawingTurn', { drawerId: hostPlayer.id, round: 1 });
      startDrawingTurn(roomId, hostPlayer.id, 1);
    }
  });

  socket.on('endDrawingTurn', () => {
    const roomId = currentRoom;
    if (!roomId) return;
    const state = gameState[roomId];
    if (!state || !state.gameStarted) return;
    
    const hostId = state.drawingOrder[0];
    if (socket.id !== hostId) return;
    
    if (state.drawnThisRound.includes(hostId)) {
      return;
    }
    state.drawnThisRound.push(hostId);
    
    const players = rooms[roomId] || [];
    const drawerPlayer = players.find(p => p.id === hostId);
    endRoundWithDelay(roomId, state, drawerPlayer?.name || '');
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
          if (disconnectedPlayer && gameState[currentRoom]?.gameStarted && disconnectedPlayer.id === gameState[currentRoom].drawingOrder[0]) {
             io.to(currentRoom).emit('gameOver', { scores: [], reason: 'Host has disconnected. Game over.' });
             gameState[currentRoom].gameStarted = false;
          }

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
