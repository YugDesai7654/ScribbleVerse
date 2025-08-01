'use client'
import './index.css'
import { Routes, Route } from 'react-router-dom';
import GameRoomPage from './components/GameRoomPage';
import RoomPage from './components/RoomPage';
// import LandingPage from './components/LandingPage';
import HomePage from './components/HomePage';







function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room" element={<RoomPage />} />
      <Route path="/room/:roomId" element={<GameRoomPage />} />
    </Routes>
  );
}

export default App;
