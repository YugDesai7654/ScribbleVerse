import type { NextFunction, Request, Response } from 'express';
import { verifyToken, AUTH_COOKIE_NAME, type AuthTokenPayload } from './jwt';

/** Rejects requests without a valid auth cookie; puts the token payload in `res.locals.authUser`. */
export function requireAuth(message = 'Log in to continue.') {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ message });
    }
    res.locals.authUser = payload satisfies AuthTokenPayload;
    next();
  };
}
