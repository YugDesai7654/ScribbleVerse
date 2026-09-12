import jwt from 'jsonwebtoken';
import { logger } from '../logger';

const JWT_SECRET = process.env.JWT_SECRET;
const FALLBACK_DEV_SECRET = 'dev-only-insecure-secret-change-me';

if (
  process.env.NODE_ENV === 'production' &&
  (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === FALLBACK_DEV_SECRET)
) {
  throw new Error('A unique JWT_SECRET with at least 32 characters is required in production.');
}

if (!JWT_SECRET) {
  logger.warn(
    'JWT_SECRET is not set; using an insecure development fallback. Set JWT_SECRET before deploying.'
  );
}

const SECRET = JWT_SECRET || FALLBACK_DEV_SECRET;
const JWT_EXPIRES_IN = '7d';

export interface AuthTokenPayload {
  userId: string;
  displayName: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = 'token';
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
