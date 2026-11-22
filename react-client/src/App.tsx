'use client'
import './index.css'
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { LazyMotion } from 'framer-motion';
import { useAuth } from './contexts/useAuth';

// Each page is its own chunk, so the landing page doesn't download the game
// room (and vice versa).
const HomePage = lazy(() => import('./components/HomePage'));
const RoomPage = lazy(() => import('./components/RoomPage'));
const GameRoomPage = lazy(() => import('./components/GameRoomPage'));
const AuthPage = lazy(() => import('./components/AuthPage'));
const LeaderboardPage = lazy(() => import('./components/LeaderboardPage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));

// Components use the lightweight `m` instead of `motion`; the animation
// features arrive in their own chunk after first paint. `strict` makes any
// stray `motion.*` component throw, so it can't silently pull the full bundle back in.
const loadMotionFeatures = () => import('./motionFeatures').then((mod) => mod.default);

function PageFallback() {
  return <div className="min-h-screen bg-ink" aria-busy="true" />;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-ink text-cream flex items-center justify-center">
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
    <LazyMotion features={loadMotionFeatures} strict>
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room" element={<RoomPage />} />
      <Route path="/room/:roomId" element={<GameRoomPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/profile"
        element={(
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        )}
      />
      <Route path="/u/:displayName" element={<ProfilePage />} />
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
    </LazyMotion>
  );
}

export default App;
