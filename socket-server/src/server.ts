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
// interface Rooms {
//   [roomId: string]: Player[];
// }
const rooms: Rooms = {};

io.on('connection', (socket: Socket) => {
  let currentRoom: string | null = null;
  let playerName: string | null = null;

  socket.on('joinRoom', ({ roomId, name }: { roomId: string; name: string }) => {
    currentRoom = roomId;
    playerName = name;

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, name });

    socket.join(roomId);

    io.to(roomId).emit('playerList', rooms[roomId]);
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
