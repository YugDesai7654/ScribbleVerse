
'use client'
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import DrawingCanvas, { type DrawLine } from './DrawingCanvas';

const SOCKET_URL = 'http://localhost:4000';
const socket = io(SOCKET_URL, { autoConnect: false });

export default function GameRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem('name') || '');
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [hostName, setHostName] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string; timestamp: number }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [drawLines, setDrawLines] = useState<DrawLine[]>([]);

  useEffect(() => {
    if (!roomId || !name) return;
    socket.connect();
    socket.emit('joinRoom', { roomId, name });

    // Listen for join success/error
    const handleJoinSuccess = () => {
      setJoined(true);
      localStorage.setItem('roomId', roomId);
    };
    const handleJoinError = (data: { message: string }) => {
      alert(data.message); // Or set an error state and show in UI
      socket.disconnect();
      navigate('/room');
    };

    socket.on('joinRoomSuccess', handleJoinSuccess);
    socket.on('joinError', handleJoinError);

    // Other listeners
    socket.on('playerList', (data) => {
      setPlayers(data.players);
      setHostName(data.hostName);
    });
    socket.on('gameStarted', () => setGameStarted(true));
    socket.on('chatHistory', (history) => setChatMessages(history));
    socket.on('chatMessage', (msg) => setChatMessages((prev) => [...prev, msg]));

    // Drawing: receive remote lines
    const handleDrawing = (line: DrawLine) => {
      setDrawLines(prev => [...prev, line]);
    };
    socket.on('drawing', handleDrawing);

    return () => {
      socket.off('joinRoomSuccess', handleJoinSuccess);
      socket.off('joinError', handleJoinError);
      socket.off('playerList');
      socket.off('gameStarted');
      socket.off('chatHistory');
      socket.off('chatMessage');
      socket.off('drawing', handleDrawing);
      socket.disconnect();
    };
  }, [roomId, name]);

  useEffect(() => {
    // Scroll to bottom when new message arrives
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  if (!roomId || !name) {
    return <Navigate to="/room" replace />;
  }

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  const handleLeaveRoom = () => {
    socket.disconnect();
    localStorage.removeItem('roomId');
    navigate('/room');
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chatMessage', { roomId, user: name, text: chatInput });
    setChatInput('');
  };

  const handleDrawLine = (line: DrawLine) => {
    socket.emit('drawing', { ...line, roomId });
    setDrawLines(prev => [...prev, line]);
  };

  const isHost = hostName === name;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header: Room, Points, Leave Room */}
      <div className="flex items-center justify-between px-8 py-4 bg-white shadow">
        <div className="text-xl font-bold text-blue-600">Room: {roomId}</div>
        <div className="text-lg font-semibold">Points: <span className="text-green-600">[Points Placeholder]</span></div>
        <button
          onClick={handleLeaveRoom}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
        >
          Leave Room
        </button>
      </div>
      <div className="flex flex-1">
        {/* Sidebar: Player List */}
        <aside className="w-64 bg-white border-r p-4 flex flex-col">
          <h3 className="text-lg font-semibold mb-2">Players</h3>
          <ul className="flex-1 overflow-y-auto">
            {players.map((p) => (
              <li key={p.id} className="py-1">
                {p.name} {p.name === hostName && <span className="text-xs text-blue-500">(Host)</span>}
                {p.name === name && <span className="text-xs text-green-500"> (You)</span>}
              </li>
            ))}
          </ul>
        </aside>
        {/* Main Area */}
        <main className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6">
            {/* Drawing Area */}
            <div className="flex-[2] h-[32rem] bg-gray-200 rounded-lg flex items-center justify-center mb-4 md:mb-0">
              <DrawingCanvas
                width={700}
                height={500}
                onDrawLine={handleDrawLine}
                remoteLines={drawLines}
                canDraw={true} // TODO: restrict to only the drawer if needed
              />
            </div>
            {/* Chat Area */}
            <div className="w-full md:w-72 bg-white rounded-lg shadow p-4 flex flex-col h-[32rem]">
              <div className="flex-1 overflow-y-auto mb-2 space-y-1">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="font-semibold text-blue-600">{msg.user}:</span> {msg.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form className="flex gap-2" onSubmit={handleChatSubmit}>
                <input
                  className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={!joined}
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  disabled={!joined || !chatInput.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
          {/* Guess Word / Word to Draw */}
          <div className="w-full max-w-2xl flex items-center justify-center">
            <span className="text-lg font-semibold text-gray-700">[Guess Word / Word to Draw Placeholder]</span>
          </div>
          {/* Start Game Button (Host only) */}
          {isHost && !gameStarted && (
            <button
              onClick={handleStartGame}
              disabled={players.length < 2}
              className="mt-4 bg-blue-600 text-white py-2 px-6 rounded hover:bg-blue-700 transition disabled:opacity-50"
            >
              Start Game
            </button>
          )}
          {gameStarted && <div className="text-green-600 text-center mt-4">Game has started!</div>}
        </main>
      </div>
    </div>
  );
}