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




io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let playerName: string | null = null;

  // Host creates a room
  socket.on('createRoom', async ({ roomId, name }) => {
    try {
      await createRoom(roomId, name);
      // Removed: rooms[roomId] = [{ id: socket.id, name }];
      socket.emit('createRoomSuccess', { roomId });
    } catch (err: any) {
      socket.emit('createRoomError', { message: err.message });
    }
  });

  // User joins a room
  socket.on('joinRoom', async ({ roomId, name }) => {
    try {
      const room = await joinRoom(roomId);
      currentRoom = roomId;
      playerName = name;

      if (!rooms[roomId]) rooms[roomId] = [];
      // Check if name already exists with a different socket ID
      const existingPlayer = rooms[roomId].find(p => p.name === name);
      if (existingPlayer) {
        if (existingPlayer.id === socket.id) {
          // Player is already in the room with this socket, allow re-join (idempotent)
          // No need to push again
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

      io.to(roomId).emit('playerList', rooms[roomId]);
      // Send chat history to the newly joined client
      socket.emit('chatHistory', chatHistory[roomId]);
      socket.emit('joinRoomSuccess', { roomId });
    } catch (err: any) {
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
