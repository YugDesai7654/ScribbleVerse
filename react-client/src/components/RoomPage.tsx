'use client'
import { useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, PlusCircle, Paintbrush } from 'lucide-react';

const SOCKET_URL = 'http://localhost:4000';
const socket = io(SOCKET_URL, { autoConnect: false });

// A component for the animated particle background
function FloatingParticles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(30)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-full"
          animate={{
            x: [Math.random() * window.innerWidth, Math.random() * window.innerWidth],
            y: [Math.random() * window.innerHeight, -100],
            opacity: [0, 0.8, 0],
          }}
          transition={{
            duration: 15 + Math.random() * 15,
            repeat: Infinity,
            ease: "linear",
            delay: Math.random() * 10,
          }}
          style={{
            left: `${Math.random() * 20 - 10}%`, // Start from different horizontal positions
          }}
        />
      ))}
    </div>
  );
}


// A component for the 3D card effect
const Animated3DCard = ({ children }: { children: React.ReactNode }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY, currentTarget } = e;
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = (clientX - left - width / 2) / 20; // Reduced intensity
    const y = (clientY - top - height / 2) / 20; // Reduced intensity
    if (cardRef.current) {
        cardRef.current.style.transform = `rotateY(${x}deg) rotateX(${-y}deg) translateZ(20px)`;
        cardRef.current.style.boxShadow = `${-x * 2}px ${-y * 2}px 40px rgba(0,0,0,0.4)`;
    }
  };

  const handleMouseLeave = () => {
    if(cardRef.current) {
        cardRef.current.style.transform = 'rotateY(0deg) rotateX(0deg) translateZ(0px)';
        cardRef.current.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
    }
  };

  return (
    <div
      className="relative w-full max-w-md h-auto"
      style={{ perspective: '1200px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={cardRef}
        className="transform-style-3d transition-transform duration-300 ease-out w-full h-full"
      >
        {children}
      </div>
    </div>
  );
};

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
        setError('Please enter your name.');
        return;
      }
      if (!roomCode.trim()) {
        setError('Please enter a room code.');
        return;
      }
      localStorage.setItem('name', name.trim());
      navigate(`/room/${roomCode.trim()}`);
    };

    const handleCreate = (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Please enter your name.');
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

    const tabVariants = {
      active: {
        borderColor: '#f4d03f',
        color: '#ffedd2',
        backgroundColor: 'rgba(255, 237, 210, 0.1)',
        transition: { duration: 0.3 }
      },
      inactive: {
        borderColor: 'transparent',
        color: '#ffedd2',
        backgroundColor: 'transparent',
        transition: { duration: 0.3 }
      }
    };

    const formVariants = {
        hidden: { opacity: 0, y: 30, scale: 0.98 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { staggerChildren: 0.1, duration: 0.4 } },
        exit: { opacity: 0, y: -30, scale: 0.98, transition: { duration: 0.2 } }
    };

    const inputVariants = {
        hidden: { opacity: 0, x: -20 },
        visible: { opacity: 1, x: 0 }
    };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0d0d] text-[#ffedd2] p-4 overflow-hidden">
        <FloatingParticles />
        <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        
        <motion.div 
            className="text-center mb-12 z-10"
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
        >
            <Paintbrush className="w-16 h-16 mx-auto text-[#f4d03f]" />
            <h1 className="text-5xl md:text-6xl font-bold mt-4" style={{ fontFamily: "Kalam, cursive" }}>
                Join the Fun
            </h1>
            <p className="text-[#ffedd2]/70 mt-2 text-lg">Create a private room or join your friends!</p>
        </motion.div>

        <Animated3DCard>
            <div className="w-full max-w-md bg-gradient-to-br from-[#1f1f1f] to-[#282828] rounded-2xl border border-[#3e3e3e] shadow-2xl p-8 z-10">
                <div className="flex mb-6 bg-[#0d0d0d] p-1 rounded-lg">
                    <motion.button
                        className="flex-1 py-3 text-lg font-semibold rounded-md"
                        onClick={() => { setTab('join'); setError(''); }}
                        animate={tab === 'join' ? 'active' : 'inactive'}
                        variants={tabVariants}
                        style={{ borderBottomWidth: '2px' }}
                    >
                        Join Room
                    </motion.button>
                    <motion.button
                        className="flex-1 py-3 text-lg font-semibold rounded-md"
                        onClick={() => { setTab('create'); setError(''); }}
                        animate={tab === 'create' ? 'active' : 'inactive'}
                        variants={tabVariants}
                        style={{ borderBottomWidth: '2px' }}
                    >
                        Create Room
                    </motion.button>
                </div>
                <AnimatePresence mode="wait">
                    {tab === 'join' ? (
                        <motion.form
                            key="join"
                            onSubmit={handleJoin}
                            className="flex flex-col gap-4"
                            variants={formVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            <motion.input
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                                placeholder="Your Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                variants={inputVariants}
                            />
                            <motion.input
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                                placeholder="Room Code"
                                value={roomCode}
                                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                                variants={inputVariants}
                            />
                            {error && <div className="text-red-400 text-sm text-center">{error}</div>}
                            <motion.button
                                type="submit"
                                className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2 mt-2"
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                variants={inputVariants}
                            >
                                <Users className="w-5 h-5" />
                                Enter Room
                            </motion.button>
                        </motion.form>
                    ) : (
                        <motion.form
                            key="create"
                            onSubmit={handleCreate}
                            className="flex flex-col gap-4"
                            variants={formVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            <motion.input
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2] placeholder:text-[#ffedd2]/50"
                                placeholder="Your Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                variants={inputVariants}
                            />
                            <motion.div variants={inputVariants} className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-sm text-[#ffedd2]/70">Rounds</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        className="w-full bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2]"
                                        value={rounds}
                                        onChange={e => setRounds(Number(e.target.value))}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-sm text-[#ffedd2]/70">Time (sec)</label>
                                    <input
                                        type="number"
                                        min={10}
                                        max={300}
                                        step={5}
                                        className="w-full bg-[#0d0d0d] border border-[#3e3e3e] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#f4d03f] text-[#ffedd2]"
                                        value={timePerRound}
                                        onChange={e => setTimePerRound(Number(e.target.value))}
                                    />
                                </div>
                            </motion.div>
                            {error && <div className="text-red-400 text-sm text-center">{error}</div>}
                            <motion.button
                                type="submit"
                                className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2 mt-2"
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                variants={inputVariants}
                            >
                                <PlusCircle className="w-5 h-5" />
                                Create New Room
                            </motion.button>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>
        </Animated3DCard>
    </div>
  );
}
