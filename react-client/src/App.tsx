'use client'
import './index.css'
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/useAuth';

// Each page is its own chunk, so the landing page doesn't download the game
// room (and vice versa).
const HomePage = lazy(() => import('./components/HomePage'));
const RoomPage = lazy(() => import('./components/RoomPage'));
const GameRoomPage = lazy(() => import('./components/GameRoomPage'));
const AuthPage = lazy(() => import('./components/AuthPage'));
const LeaderboardPage = lazy(() => import('./components/LeaderboardPage'));

function PageFallback() {
  return <div className="min-h-screen bg-[#0d0d0d]" aria-busy="true" />;
}

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
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
  );
}

export default App;
