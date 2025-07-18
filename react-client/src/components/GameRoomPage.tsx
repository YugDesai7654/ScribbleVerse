'use client'
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import DrawingCanvas, { type DrawLine } from './DrawingCanvas';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Send, Users, Clock, Edit } from 'lucide-react';

export default function GameRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [name] = useState(() => localStorage.getItem('name') || '');
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [hostName, setHostName] = useState<string>('');
  const [gameStarted, setGameStarted] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string; timestamp: number; correct?: boolean }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [drawLines, setDrawLines] = useState<DrawLine[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [timePerRound, setTimePerRound] = useState(60);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [timer, setTimer] = useState<number>(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [socketId, setSocketId] = useState<string>('');
  const [wordOptions, setWordOptions] = useState<string[] | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [showWordOptions, setShowWordOptions] = useState(false);
  const [displayWord, setDisplayWord] = useState<string>('');
  const listenersCleanupRef = useRef<(() => void) | null>(null);
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null);
  const [points, setPoints] = useState<{ [name: string]: number }>({});

  useEffect(() => {
    if (!roomId || !name) return;

    if (socket.connected) {
      setSocketId(socket.id || '');
    }

    let listenersAttached = false;
    function attachListeners() {
      if (listenersAttached) return listenersCleanupRef.current;
      listenersAttached = true;
      const handleJoinSuccess = () => {
        setJoined(true);
        localStorage.setItem('roomId', roomId || '');
      };
      const handleJoinError = (data: { message: string }) => {
        alert(data.message);
        socket.disconnect();
        navigate('/room' as string);
      };
      socket.on('joinRoomSuccess', handleJoinSuccess);
      socket.on('joinError', handleJoinError);
      socket.on('playerList', (data) => {
        setPlayers(data.players);
        setHostName(data.hostName);
      });
      socket.on('gameStarted', (data) => {
        setGameStarted(true);
        setTotalRounds(data.rounds);
        setTimePerRound(data.timePerRound);
        setCurrentRound(1);
      });
      socket.on('roundStartingSoon', ({ seconds }) => {
        setRoundCountdown(seconds);
        setDisplayWord('');
      });
      socket.on('drawingTurn', ({ drawerId, round }) => {
        setDrawerId(drawerId);
        setCurrentRound(round);
        setTimer(timePerRound);
        setRoundCountdown(null);
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
      socket.on('gameOver', () => {
        setGameStarted(false);
        setDrawerId(null);
        setTimer(0);
        if (timerRef.current) clearInterval(timerRef.current);
        alert('Game Over!');
      });
      socket.on('chatHistory', (history) => setChatMessages(history));
      socket.on('chatMessage', (msg) => setChatMessages((prev) => [...prev, msg]));
      const handleDrawing = (line: DrawLine) => {
        setDrawLines(prev => [...prev, line]);
      };
      socket.on('drawing', handleDrawing);
      socket.on('wordOptions', ({ options, round }) => {
        console.log('[DEBUG] wordOptions', options, round);
        setWordOptions(options);
        setShowWordOptions(true);
        setSelectedWord(null);
        setDisplayWord('');
      });
      socket.on('roundStart', ({ word, isDrawer, round }) => {
        console.log('[DEBUG] roundStart', word, isDrawer, round);
        setShowWordOptions(false);
        setWordOptions(null);
        setSelectedWord(null);
        setDisplayWord(word);
      });
      socket.on('pointsUpdate', (pts) => setPoints(pts));
      const cleanup = () => {
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
        socket.off('wordOptions');
        socket.off('roundStart');
        socket.off('roundStartingSoon');
        socket.off('pointsUpdate');
      };
      listenersCleanupRef.current = cleanup;
      return cleanup;
    }

    attachListeners();

    if (socket.connected) {
      socket.emit('joinRoom', { roomId, name });
    } else {
      const handleConnectAndJoin = () => {
        setSocketId(socket.id || '');
        socket.emit('joinRoom', { roomId, name });
        socket.off('connect', handleConnectAndJoin);
      };
      socket.on('connect', handleConnectAndJoin);
      socket.connect();
    }

    return () => {
      socket.off('connect');
      if (listenersCleanupRef.current) {
        listenersCleanupRef.current();
        listenersCleanupRef.current = null;
      }
      socket.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [roomId, name, timePerRound, navigate]);

  useEffect(() => {
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

  const handleWordSelect = (word: string) => {
    if (!roomId || !wordOptions || selectedWord) return;
    setSelectedWord(word);
    socket.emit('chooseWord', { roomId, word, round: currentRound });
  };

  const isHost = hostName === name;
  const isDrawer = drawerId === socket.id;
  const drawerName = players.find(p => p.id === drawerId)?.name || '...';

  return (
    <div className="flex flex-col min-h-screen bg-[#0d0d0d] text-[#ffedd2]">
      <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-[#1f1f1f] border-b border-[#3e3e3e]">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Kalam, cursive" }}>Room: {roomId}</h1>
        <motion.button
          onClick={handleLeaveRoom}
          className="bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <LogOut className="w-5 h-5" />
          Leave Room
        </motion.button>
      </header>
      <div className="flex flex-1 p-8 gap-8">
        {/* Sidebar */}
        <aside className="w-72 bg-[#1f1f1f] border border-[#3e3e3e] rounded-2xl p-4 flex flex-col">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ fontFamily: "Kalam, cursive" }}><Users className="w-6 h-6"/> Players</h3>
          <ul className="flex-1 overflow-y-auto space-y-2">
            <AnimatePresence>
                {players.map((p) => (
                    <motion.li
                        key={p.id}
                        className="py-2 px-3 bg-[#282828] rounded-lg"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                    >
                        {p.name} {p.name === hostName && <span className="text-xs text-blue-400">(Host)</span>}
                        {p.name === name && <span className="text-xs text-green-400"> (You)</span>}
                        <span className="ml-2 text-sm text-purple-400 font-bold">{points[p.name] || 0} pts</span>
                    </motion.li>
                ))}
            </AnimatePresence>
          </ul>
        </aside>
        {/* Main Area */}
        <main className="flex-1 flex flex-col gap-6">
          <div className="flex-[2] h-[32rem] bg-[#0d0d0d] rounded-2xl border border-[#3e3e3e] flex flex-col items-center justify-center p-4">
              <div className="w-full flex justify-between items-center mb-2 px-2 text-[#ffedd2]/80">
                  <div className="text-md font-semibold">Round: {currentRound} / {totalRounds}</div>
                  <div className="text-md font-semibold flex items-center gap-1"><Clock className="w-4 h-4" /> {timer}s</div>
                  <div className="text-md font-semibold flex items-center gap-1"><Edit className="w-4 h-4" /> {drawerName}</div>
              </div>
              <DrawingCanvas
                width={700}
                height={500}
                onDrawLine={handleDrawLine}
                remoteLines={drawLines}
                canDraw={isDrawer && gameStarted}
              />
          </div>
           {/* Guess Word / Word to Draw */}
          <div className="w-full h-24 flex flex-col items-center justify-center bg-[#1f1f1f] border border-[#3e3e3e] rounded-2xl">
            {isDrawer && showWordOptions && wordOptions && (
              <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="text-center">
                <div className="mb-2 font-semibold">Choose a word to draw:</div>
                <div className="flex gap-4 justify-center">
                  {wordOptions.map((word) => (
                    <motion.button
                      key={word}
                      className={`px-4 py-2 rounded-lg border font-bold transition ${selectedWord === word ? 'bg-[#ffedd2] text-[#0d0d0d]' : 'bg-[#282828] border-[#3e3e3e] hover:bg-[#ffedd2]/20'}`}
                      onClick={() => handleWordSelect(word)}
                      disabled={!!selectedWord}
                      whileHover={{y: -2}}
                    >
                      {word}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
            {displayWord && (
              <span className="text-2xl font-bold tracking-widest" style={{ fontFamily: "Kalam, cursive" }}>
                {isDrawer ? `Your word: ${displayWord}` : displayWord}
              </span>
            )}
          </div>
        </main>
        {/* Chat Area */}
        <aside className="w-80 bg-[#1f1f1f] border border-[#3e3e3e] rounded-2xl p-4 flex flex-col h-full">
            <h3 className="text-xl font-bold mb-4" style={{ fontFamily: "Kalam, cursive" }}>Chat</h3>
            <div className="flex-1 overflow-y-auto mb-2 pr-2 space-y-2">
                <AnimatePresence initial={false}>
                    {chatMessages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        className={`text-sm ${msg.correct ? 'text-green-400' : 'text-[#ffedd2]/90'}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <span className="font-semibold text-[#ffedd2]">{msg.user}:</span> {msg.text}
                      </motion.div>
                    ))}
                </AnimatePresence>
                <div ref={chatEndRef} />
            </div>
            <form className="flex gap-2" onSubmit={handleChatSubmit}>
                <input
                  className="flex-1 bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2]"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={!joined}
                />
                <motion.button
                  type="submit"
                  className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] px-4 py-2 rounded-lg disabled:opacity-50"
                  disabled={!joined || !chatInput.trim()}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Send className="w-5 h-5"/>
                </motion.button>
            </form>
        </aside>
      </div>

       {/* Modals and Overlays */}
        <AnimatePresence>
            {isHost && !gameStarted && (
                 <motion.div
                    className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="bg-[#1f1f1f] p-8 rounded-2xl text-center"
                        initial={{ scale: 0.7 }}
                        animate={{ scale: 1 }}
                    >
                        <h2 className="text-2xl font-bold mb-4">Ready to start?</h2>
                        <motion.button
                          onClick={handleStartGame}
                          disabled={players.length < 2}
                          className="mt-4 bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 px-8 rounded-full hover:shadow-lg hover:shadow-[#ffedd2]/20 transition disabled:opacity-50"
                           whileHover={{ scale: 1.1 }}
                           whileTap={{ scale: 0.9 }}
                        >
                          Start Game
                        </motion.button>
                         {players.length < 2 && <p className="text-sm text-red-400 mt-2">Need at least 2 players to start.</p>}
                    </motion.div>
                 </motion.div>
            )}
            {roundCountdown !== null && (
                <motion.div
                    className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <div className="text-4xl font-bold text-orange-500 text-center">
                        Next round starts in {roundCountdown}...
                    </div>
                 </motion.div>
            )}
        </AnimatePresence>
    </div>
  );
}