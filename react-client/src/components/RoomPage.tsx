'use client'
import {  useNavigate } from 'react-router-dom';
import { useState } from 'react';



export default function RoomPage() {
    const [tab, setTab] = useState<'join' | 'create'>('join');
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
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
      navigate(`/room/${newRoomId}`);
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