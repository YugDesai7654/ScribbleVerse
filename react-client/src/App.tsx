'use client'
import './index.css'
import type { ReactNode } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import GameRoomPage from './components/GameRoomPage';
import RoomPage from './components/RoomPage';
import HomePage from './components/HomePage';
import AuthPage from './components/AuthPage';
import LeaderboardPage from './components/LeaderboardPage';
import { useAuth } from './contexts/useAuth';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-[#ffedd2] flex items-center justify-center">
        Checking your session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room" element={<RoomPage />} />
      <Route path="/room/:roomId" element={<GameRoomPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/leaderboard"
        element={(
          <RequireAuth>
            <LeaderboardPage />
          </RequireAuth>
        )}
      />
    </Routes>
  );
}

export default App;
