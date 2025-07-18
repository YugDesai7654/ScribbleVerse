'use client'
import { useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, PlusCircle } from 'lucide-react';

const SOCKET_URL = 'http://localhost:4000';
const socket = io(SOCKET_URL, { autoConnect: false });

// A new component for the 3D card effect
const Animated3DCard = ({ children }: { children: React.ReactNode }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY, currentTarget } = e;
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const x = (clientX - left - width / 2) / 25;
    const y = (clientY - top - height / 2) / 25;
    cardRef.current!.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
  };

  const handleMouseLeave = () => {
    cardRef.current!.style.transform = 'rotateY(0deg) rotateX(0deg)';
  };

  return (
    <div
      className="relative w-full max-w-md h-auto"
      style={{ perspective: '1000px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={cardRef}
        className="transform-style-3d transition-transform duration-500 ease-out w-full h-full"
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

    const tabVariants = {
      active: {
        borderColor: '#ffedd2',
        color: '#ffedd2',
        transition: { duration: 0.3 }
      },
      inactive: {
        borderColor: '#3e3e3e',
        color: '#ffedd2',
        transition: { duration: 0.3 }
      }
    };

    const formVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
        exit: { opacity: 0, y: -20 }
    };

    const inputVariants = {
        hidden: { opacity: 0, x: -20 },
        visible: { opacity: 1, x: 0 }
    };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d0d0d] text-[#ffedd2]">
        <link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        <Animated3DCard>
            <div className="w-full max-w-md bg-gradient-to-br from-[#1f1f1f] to-[#282828] rounded-2xl border border-[#3e3e3e] shadow-lg p-8">
                <div className="flex mb-6 border-b border-[#3e3e3e]">
                    <motion.button
                        className="flex-1 py-3 text-lg font-semibold"
                        onClick={() => { setTab('join'); setError(''); }}
                        animate={tab === 'join' ? 'active' : 'inactive'}
                        variants={tabVariants}
                        style={{ borderBottomWidth: '2px' }}
                    >
                        Join Room
                    </motion.button>
                    <motion.button
                        className="flex-1 py-3 text-lg font-semibold"
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
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2]"
                                placeholder="Your name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                variants={inputVariants}
                            />
                            <motion.input
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2]"
                                placeholder="Room code"
                                value={roomCode}
                                onChange={e => setRoomCode(e.target.value)}
                                variants={inputVariants}
                            />
                            {error && <div className="text-red-500 text-sm">{error}</div>}
                            <motion.button
                                type="submit"
                                className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                variants={inputVariants}
                            >
                                <Users className="w-5 h-5" />
                                Join Room
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
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2]"
                                placeholder="Your name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                                variants={inputVariants}
                            />
                            <motion.input
                                type="number"
                                min={1}
                                max={10}
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2]"
                                placeholder="Number of rounds (default 3)"
                                value={rounds}
                                onChange={e => setRounds(Number(e.target.value))}
                                variants={inputVariants}
                            />
                            <motion.input
                                type="number"
                                min={10}
                                max={300}
                                className="bg-[#0d0d0d] border border-[#3e3e3e] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#ffedd2] text-[#ffedd2]"
                                placeholder="Drawing time in seconds (default 60)"
                                value={timePerRound}
                                onChange={e => setTimePerRound(Number(e.target.value))}
                                variants={inputVariants}
                            />
                            {error && <div className="text-red-500 text-sm">{error}</div>}
                            <motion.button
                                type="submit"
                                className="bg-gradient-to-r from-[#ffedd2] to-[#f4d03f] text-[#0d0d0d] font-bold py-3 rounded-lg hover:shadow-lg hover:shadow-[#ffedd2]/20 transition flex items-center justify-center gap-2"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                variants={inputVariants}
                            >
                                <PlusCircle className="w-5 h-5" />
                                Create Room
                            </motion.button>
                        </motion.form>
                    )}
                </AnimatePresence>
            </div>
        </Animated3DCard>
    </div>
  );
}