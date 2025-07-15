import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server, Socket } from 'socket.io';

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

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let playerName: string | null = null;

  socket.on('joinRoom', ({ roomId, name }: { roomId: string; name: string }) => {
    currentRoom = roomId;
    playerName = name;

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, name });
    socket.join(roomId);

    // Initialize chat history for the room if not present
    if (!chatHistory[roomId]) chatHistory[roomId] = [];

    io.to(roomId).emit('playerList', rooms[roomId]);
    // Send chat history to the newly joined client
    socket.emit('chatHistory', chatHistory[roomId]);
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

  socket.on('startGame', () => {
    if (!currentRoom) return;
    const players = rooms[currentRoom] || [];
    if (players.length >= 2 && players[0].id === socket.id) {
      io.to(currentRoom).emit('gameStarted');
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(p => p.id !== socket.id);
      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
      } else {
        io.to(currentRoom).emit('playerList', rooms[currentRoom]);
      }
    }
  });
});

server.listen(4000, () => {
  console.log('Socket.io server running on http://localhost:4000');
});
