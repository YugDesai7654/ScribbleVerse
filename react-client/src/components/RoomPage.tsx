'use client'
import {  useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { io } from 'socket.io-client';
const SOCKET_URL = 'http://localhost:4000';
const socket = io(SOCKET_URL, { autoConnect: false });


export default function RoomPage() {
    const [tab, setTab] = useState<'join' | 'create'>('join');
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [rounds, setRounds] = useState(3);
    const [timePerRound, setTimePerRound] = useState(60);
    const navigate = useNavigate();
  
    const handleJoin = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      if (!roomCode.trim()) {
        setError('Room code is required');
        return;
      }
      localStorage.setItem('name', name.trim());
      navigate(`/room/${roomCode.trim()}`);
    };
  
    const handleCreate = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      localStorage.setItem('name', name.trim());

      socket.connect();
      socket.emit('createRoom', {
        roomId: newRoomId,
        name: name.trim(),
        rounds: rounds,
        timePerRound: timePerRound,
      });

      socket.once('createRoomSuccess', ({ roomId }) => {
        socket.disconnect();
        navigate(`/room/${roomId}`);
      });

      socket.once('createRoomError', ({ message }) => {
        setError(message);
        socket.disconnect();
      });
    };
  
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
          <div className="flex mb-6 border-b">
            <button
              className={`flex-1 py-2 text-lg font-semibold border-b-2 transition-colors ${tab === 'join' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
              onClick={() => { setTab('join'); setError(''); }}
            >
              Join Room
            </button>
            <button
              className={`flex-1 py-2 text-lg font-semibold border-b-2 transition-colors ${tab === 'create' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
              onClick={() => { setTab('create'); setError(''); }}
            >
              Create Room
            </button>
          </div>
          {tab === 'join' ? (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <input
                className="border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
              <input
                className="border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Room code"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value)}
              />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <button
                type="submit"
                className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
              >
                Join Room
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <input
                className="border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
              <input
                type="number"
                min={1}
                max={10}
                className="border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Number of rounds (default 3)"
                value={rounds}
                onChange={e => setRounds(Number(e.target.value))}
              />
              <input
                type="number"
                min={10}
                max={300}
                className="border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Drawing time in seconds (default 60)"
                value={timePerRound}
                onChange={e => setTimePerRound(Number(e.target.value))}
              />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <button
                type="submit"
                className="bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
              >
                Create Room
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }