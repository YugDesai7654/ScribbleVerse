import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
} from '../lib/authApi';
import { AuthContext } from './authContextValue';
import type { AuthUser } from '../lib/authApi';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // Only run once on mount — `refresh` is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedInUser } = await apiLogin(email, password);
    setUser(loggedInUser);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const { user: newUser } = await apiRegister(email, password, displayName);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
