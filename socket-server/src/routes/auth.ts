import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { User } from '../model/user';
import { signToken, verifyToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_MS } from '../auth/jwt';
import { registerSchema, loginSchema } from '../validation/authSchemas';
import { historyQuerySchema } from '../validation/statsSchemas';
import { requireAuth } from '../auth/requireAuth';
import { gameHistory, profileStats } from '../stats/playerStats';
import { logger } from '../logger';

const router = Router();

// Compared against when the email doesn't exist, so a failed login takes the same
// time either way and response timing can't reveal which emails are registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalisation-placeholder', 10);
const isProd = process.env.NODE_ENV === 'production';

// Brute-force protection on the credential endpoints. /register is included
// since it can also be hammered (account enumeration / spam accounts).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// Reads like /me run on every page load, so they get a looser, separate budget.
// Sharing the strict one used to log people out after 20 page loads (BUG-004).
const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

function setAuthCookie(res: import('express').Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

function publicUser(user: InstanceType<typeof User>) {
  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    totalScore: user.totalScore,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
  };
}

router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid registration details.' });
  }
  const { email, password, displayName } = parsed.data;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, displayName });

    const token = signToken({ userId: user._id.toString(), displayName: user.displayName });
    setAuthCookie(res, token);

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid login details.' });
  }
  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ email });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken({ userId: user._id.toString(), displayName: user.displayName });
    setAuthCookie(res, token);

    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

router.post('/logout', authLimiter, (_req, res) => {
  // Must repeat the attributes used when setting the cookie, or browsers keep it.
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out.' });
});

router.get('/me', readLimiter, async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ user: null });
  }

  try {
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ user: null });
    }
    res.json({ user: publicUser(user) });
  } catch {
    res.status(401).json({ user: null });
  }
});

/**
 * The logged-in player's games, newest first: `?page=1&limit=10` (limit up to
 * 50). Lifetime stats come with every page so the profile needs one request.
 */
router.get('/me/history', readLimiter, requireAuth('Log in to see your games.'), async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid page or limit.' });
  }
  const { userId } = res.locals.authUser as { userId: string };

  try {
    const [history, stats] = await Promise.all([
      gameHistory(userId, parsed.data.page, parsed.data.limit),
      profileStats(userId),
    ]);
    res.json({ ...history, stats });
  } catch (err) {
    logger.error({ err }, 'Failed to load game history');
    res.status(500).json({ message: 'Failed to load your games.' });
  }
});

export default router;
