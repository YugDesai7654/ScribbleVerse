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
  }
} = {};

// 1. Add a word list (can be moved to DB/file later)
const WORDS = [
  'cat', 'dog', 'car', 'house', 'tree', 'apple', 'banana', 'computer', 'phone', 'book',
  'star', 'moon', 'sun', 'river', 'mountain', 'train', 'plane', 'fish', 'bird', 'shoe',
  'chair', 'table', 'cup', 'hat', 'ball', 'cake', 'pizza', 'guitar', 'camera', 'clock'
];

function getRandomWords(n: number) {
  // need to improve this
  const shuffled = [...WORDS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}

// Add selected word per room/round
const selectedWord: { [roomId: string]: string } = {};


io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let playerName: string | null = null;

  // Host creates a room
  socket.on('createRoom', async ({ roomId, name, rounds = 3, timePerRound = 60 }) => {
    console.log(`[createRoom] Called with roomId: ${roomId}, name: ${name}, rounds: ${rounds}, timePerRound: ${timePerRound}`);
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
      console.log(`[createRoom] gameState created for roomId: ${roomId}`, gameState[roomId]);
      // Do NOT add host to rooms[roomId] here. Host must join via joinRoom.
      socket.emit('createRoomSuccess', { roomId });
    } catch (err: any) {
      console.log(`[createRoom] Error: ${err.message}`);
      socket.emit('createRoomError', { message: err.message });
    }
  });

  // User joins a room
  socket.on('joinRoom', async ({ roomId, name }) => {
    console.log(`[joinRoom] Called with roomId: ${roomId}, name: ${name}`);
    try {
      // Prevent joining if game already started
      if (gameState[roomId]?.gameStarted) {
        console.log(`[joinRoom] gameState exists and gameStarted is true for roomId: ${roomId}`);
        socket.emit('joinError', { message: 'Game already started. Cannot join.' });
        return;
      }
      const room = await joinRoom(roomId);
      currentRoom = roomId;
      playerName = name;
      console.log(`[joinRoom] gameState for roomId: ${roomId}:`, gameState[roomId]);
      if (!rooms[roomId]) rooms[roomId] = [];
      // Check if name already exists
      const existingPlayerIndex = rooms[roomId].findIndex(p => p.name === name);
      if (existingPlayerIndex !== -1) {
        const existingPlayer = rooms[roomId][existingPlayerIndex];
        const existingSocket = io.sockets.sockets.get(existingPlayer.id);
        if (existingPlayer.id === socket.id) {
          // Same socket, treat as re-join (do not emit error, just proceed)
          console.log(`[joinRoom] Player re-joined: ${name} (socket: ${socket.id}) in room: ${roomId}`);
          // No need to add again, just join the room
        } else if (!existingSocket || existingSocket.disconnected) {
          // Previous socket is disconnected, allow takeover
          rooms[roomId][existingPlayerIndex] = { id: socket.id, name };
          console.log(`[joinRoom] Player reconnected: ${name} (socket: ${socket.id}) in room: ${roomId}`);
        } else {
          // If this is the host, allow re-join even if socket is connected
          if (room.hostName === name) {
            rooms[roomId][existingPlayerIndex] = { id: socket.id, name };
            console.log(`[joinRoom] Host takeover: ${name} (socket: ${socket.id}) in room: ${roomId}`);
            // Optionally disconnect the old socket
            if (existingSocket) existingSocket.disconnect(true);
          } else {
            // Name conflict with active socket (different socket)
            console.log(`[joinRoom] Name conflict: ${name} already taken in room: ${roomId}`);
            socket.emit('joinError', { message: 'Name already taken in this room.' });
            return;
          }
        }
      } else {
        rooms[roomId].push({ id: socket.id, name });
        console.log(`[joinRoom] Player added: ${name} (socket: ${socket.id}) to room: ${roomId}`);
      }
      socket.join(roomId);

      // Initialize chat history for the room if not present
      if (!chatHistory[roomId]) chatHistory[roomId] = [];

      // Ensure gameState exists for the room (in case all players left and it was deleted)
      if (!gameState[roomId]) {
        gameState[roomId] = {
          rounds: 3, // You can replace with room.rounds if you store it in DB
          timePerRound: 60, // You can replace with room.timePerRound if you store it in DB
          currentRound: 1,
          drawingOrder: [],
          drawnThisRound: [],
          gameStarted: false,
        };
        console.log(`[joinRoom] gameState re-initialized for roomId: ${roomId}`, gameState[roomId]);
      }

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
    const message = { user, text, timestamp: Date.now() };
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

  socket.on('startGame', () => {
    console.log(`[startGame] Called by socket: ${socket.id} for room: ${currentRoom}`);
    if (!currentRoom) return;
    const players = rooms[currentRoom] || [];
    console.log(`[startGame] players in room:`, players);
    if (players.length >= 2 && players[0].id === socket.id) {
      // Ensure gameState exists for the room
      console.log(`[startGame] gameState for room:`, gameState[currentRoom]);
      if (!gameState[currentRoom]) {
        console.error(`[startGame] gameState for room ${currentRoom} does not exist.`);
        return;
      }
      // Initialize drawing order and game state
      gameState[currentRoom].drawingOrder = players.map(p => p.id);
      gameState[currentRoom].drawnThisRound = [];
      gameState[currentRoom].currentRound = 1;
      gameState[currentRoom].gameStarted = true;
      io.to(currentRoom).emit('gameStarted', {
        rounds: gameState[currentRoom].rounds,
        timePerRound: gameState[currentRoom].timePerRound,
        drawingOrder: gameState[currentRoom].drawingOrder,
      });
      // Start first turn
      const firstDrawer = gameState[currentRoom].drawingOrder[0];
      // Instead of emitting drawingTurn directly, call a new function to handle word selection
      startDrawingTurn(currentRoom, firstDrawer);
    }
  });

  // Helper function to handle drawing turn and word selection
  function startDrawingTurn(roomId: string, drawerId: string) {
    const options = getRandomWords(3);
    let wordChosen = false;
    let chosenWord = '';
    console.log(`[startDrawingTurn] Emitting wordOptions to drawerId: ${drawerId}, options:`, options);
    // Send word options to the drawer only
    io.to(drawerId).emit('wordOptions', { options });

    // Listen for word selection from the drawer
    const wordSelectedHandler = (data: { word: string }) => {
      if (wordChosen) return;
      if (!options.includes(data.word)) return; // Only allow picking from options
      wordChosen = true;
      chosenWord = data.word;
      selectedWord[roomId] = chosenWord;
      // Start the round
      io.to(drawerId).emit('wordChosen', { word: chosenWord });
      io.to(roomId).emit('startRound', { round: gameState[roomId].currentRound, drawerId });
      // Only send the word to the drawer
      io.to(drawerId).emit('roundWord', { word: chosenWord });
      // Remove listener
      io.sockets.sockets.get(drawerId)?.off('wordSelected', wordSelectedHandler);
    };
    io.sockets.sockets.get(drawerId)?.once('wordSelected', wordSelectedHandler);

    // 10s timer: if not picked, auto-pick
    setTimeout(() => {
      if (!wordChosen) {
        chosenWord = options[Math.floor(Math.random() * 3)];
        wordChosen = true;
        selectedWord[roomId] = chosenWord;
        io.to(drawerId).emit('wordChosen', { word: chosenWord });
        io.to(roomId).emit('startRound', { round: gameState[roomId].currentRound, drawerId });
        io.to(drawerId).emit('roundWord', { word: chosenWord });
        io.sockets.sockets.get(drawerId)?.off('wordSelected', wordSelectedHandler);
      }
    }, 10000);
  }

  // Handle end of drawing turn
  socket.on('endDrawingTurn', () => {
    if (!currentRoom) return;
    const state = gameState[currentRoom];
    if (!state) return;
    // Mark this player as having drawn this round
    if (!state.drawnThisRound.includes(socket.id)) {
      state.drawnThisRound.push(socket.id);
    }
    // Clear the board for all clients
    io.to(currentRoom).emit('clearBoard');
    // If all players have drawn this round, advance round
    if (state.drawnThisRound.length === state.drawingOrder.length) {
      if (state.currentRound < state.rounds) {
        state.currentRound += 1;
        state.drawnThisRound = [];
        // Start next round with first player
        const nextDrawer = state.drawingOrder[0];
        io.to(currentRoom).emit('newRound', { round: state.currentRound });
        startDrawingTurn(currentRoom, nextDrawer);
      } else {
        // Game over
        state.gameStarted = false;
        io.to(currentRoom).emit('gameOver');
      }
    } else {
      // Next player's turn
      const nextIndex = state.drawnThisRound.length;
      const nextDrawer = state.drawingOrder[nextIndex];
      startDrawingTurn(currentRoom, nextDrawer);
    }
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
