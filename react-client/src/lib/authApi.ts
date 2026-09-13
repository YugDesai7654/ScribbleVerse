import { API_BASE_URL } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  totalScore: number;
  gamesPlayed: number;
  gamesWon: number;
}

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  score: number;
  won: boolean;
  playedAt: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include', // send/receive the httpOnly auth cookie
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.message || 'Something went wrong. Please try again.', res.status);
  }
  return data as T;
}

export function register(email: string, password: string, displayName: string) {
  return request<{ user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function login(email: string, password: string) {
  return request<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<{ message: string }>('/auth/logout', { method: 'POST' });
}

// Deliberately bypasses the shared `request()` helper: a 401 here just means
// "not logged in", which is an expected, normal outcome — not an error to throw.
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to check login status.');
  const data = await res.json();
  return data.user as AuthUser;
}

export function fetchLeaderboard() {
  return request<{ leaderboard: LeaderboardEntry[] }>('/leaderboard');
}
