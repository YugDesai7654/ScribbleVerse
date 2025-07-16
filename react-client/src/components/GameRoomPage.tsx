
'use client'
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import DrawingCanvas, { type DrawLine } from './DrawingCanvas';

export default function GameRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [name] = useState(() => localStorage.getItem('name') || '');
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [hostName, setHostName] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  // const nameRef = useRef<HTMLInputElement>(null);
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string; timestamp: number }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [drawLines, setDrawLines] = useState<DrawLine[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timePerRound, setTimePerRound] = useState(60);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  // const [drawingOrder, setDrawingOrder] = useState<string[]>([]);
  const [timer, setTimer] = useState<number>(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [socketId, setSocketId] = useState<string>('');

  // --- Word selection state ---
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [showWordModal, setShowWordModal] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [showWord, setShowWord] = useState(false);

  useEffect(() => {
    // If no roomId or name, redirect to /room
    if (!roomId || !name) {
      navigate('/room', { replace: true });
      return;
    }
    // Always connect if not connected
    if (!socket.connected) {
      socket.connect();
    }
    const handleConnect = () => {
      setSocketId(socket.id || '');
      console.log('[socket] Connected with id:', socket.id);
      console.log('[frontend] Emitting joinRoom', { roomId, name, socketId: socket.id });
      socket.emit('joinRoom', { roomId, name });
    };
    socket.on('connect', handleConnect);

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
    socket.on('gameStarted', (data) => {
      setGameStarted(true);
      setTotalRounds(data.rounds);
      setTimePerRound(data.timePerRound);
      // setDrawingOrder(data.drawingOrder);
      setCurrentRound(1);
    });
    socket.on('drawingTurn', ({ drawerId, round }) => {
      setDrawerId(drawerId);
      setCurrentRound(round);
      setTimer(timePerRound);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            // Only the drawer emits endDrawingTurn
            if (drawerId === socket.id) {
              socket.emit('endDrawingTurn');
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });
    socket.on('newRound', ({ round }) => {
      setCurrentRound(round);
    });
    socket.on('gameOver', () => {
      setGameStarted(false);
      setDrawerId(null);
      setTimer(0);
      if (timerRef.current) clearInterval(timerRef.current);
      alert('Game Over!');
    });
    socket.on('chatHistory', (history) => setChatMessages(history));
    socket.on('chatMessage', (msg) => setChatMessages((prev) => [...prev, msg]));

    // Drawing: receive remote lines
    const handleDrawing = (line: DrawLine) => {
      setDrawLines(prev => [...prev, line]);
    };
    socket.on('drawing', handleDrawing);

    // --- Word selection listeners ---
    socket.on('wordOptions', ({ options }) => {
      console.log('[wordOptions] received:', options, 'socket.id:', socket.id, 'drawerId:', drawerId);
      setWordOptions(options);
      setShowWordModal(true);
      setSelectedWord(null);
      setShowWord(false);
      setDrawerId(socket.id || null); // Ensure the modal shows for the drawer and fix linter error
      });
    socket.on('wordChosen', ({ word }) => {
      if (socket.id === drawerId) {
        setSelectedWord(word);
        setShowWord(true);
        setShowWordModal(false);
      }
    });
    socket.on('roundWord', ({ word }) => {
      if (socket.id === drawerId) {
        setSelectedWord(word);
        setShowWord(true);
      }
    });
    socket.on('startRound', ({ round, drawerId }) => {
      setCurrentRound(round);
      setDrawerId(drawerId);
      setShowWordModal(false);
      setShowWord(false);
      setDrawLines([]); // Optionally clear the board at round start
      setTimer(timePerRound);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            if (drawerId === socket.id) {
              socket.emit('endDrawingTurn');
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });
    // --- Board clearing ---
    socket.on('clearBoard', () => {
      setDrawLines([]);
    });

    return () => {
      socket.off('joinRoomSuccess', handleJoinSuccess);
      socket.off('joinError', handleJoinError);
      socket.off('playerList');
      socket.off('gameStarted');
      socket.off('drawingTurn');
      socket.off('newRound');
      socket.off('gameOver');
      socket.off('chatHistory');
      socket.off('chatMessage');
      socket.off('drawing', handleDrawing);
      socket.off('connect', handleConnect);
      socket.off('wordOptions');
      socket.off('wordChosen');
      socket.off('roundWord');
      socket.off('clearBoard');
      socket.off('startRound');
      socket.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [roomId, name, timePerRound, drawerId]);

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

  // --- Handle word selection ---
  const handleWordSelect = (word: string) => {
    setSelectedWord(word);
    setShowWordModal(false);
    setShowWord(true);
    socket.emit('wordSelected', { word });
  };

  const isHost = hostName === name;
  const isDrawer = drawerId === socketId;
  const drawerName = players.find(p => p.id === drawerId)?.name || '...';

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
            <div className="flex-[2] h-[32rem] bg-gray-200 rounded-lg flex flex-col items-center justify-center mb-4 md:mb-0">
              {/* Game Info */}
              <div className="w-full flex justify-between items-center mb-2 px-2">
                <div className="text-md font-semibold text-gray-700">Round: {currentRound} / {totalRounds}</div>
                <div className="text-md font-semibold text-gray-700">Time Left: {timer}s</div>
                <div className="text-md font-semibold text-gray-700">Drawer: {drawerName}</div>
              </div>
              <DrawingCanvas
                width={700}
                height={500}
                onDrawLine={handleDrawLine}
                remoteLines={drawLines}
                canDraw={isDrawer && gameStarted}
              />
              {!isDrawer && gameStarted && (
                <div className="mt-2 text-blue-600 font-semibold">Wait for your turn to draw!</div>
              )}
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
            {/* Show word to drawer only */}
            {isDrawer && gameStarted && showWord && selectedWord && (
              <span className="text-lg font-semibold text-green-700">Your word: {selectedWord}</span>
            )}
            {/* For guessers, show guessing prompt */}
            {!isDrawer && gameStarted && (
              <span className="text-lg font-semibold text-gray-700">Guess the word!</span>
            )}
          </div>
          {/* Word selection modal for drawer */}
          {showWordModal && wordOptions.length > 0 && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
              <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center">
                <h2 className="text-xl font-bold mb-4">Choose a word to draw</h2>
                <div className="flex gap-4 mb-4">
                  {wordOptions.map((word) => (
                    <button
                      key={word}
                      onClick={() => handleWordSelect(word)}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition text-lg"
                    >
                      {word}
                    </button>
                  ))}
                </div>
                <div className="text-gray-500">You have 10 seconds to choose, or one will be picked for you!</div>
              </div>
            </div>
          )}
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