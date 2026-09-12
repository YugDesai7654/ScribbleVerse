import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { User } from '../model/user';
import { signToken, verifyToken, AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_MS } from '../auth/jwt';
import { registerSchema, loginSchema } from '../validation/authSchemas';

const router = Router();
const isProd = process.env.NODE_ENV === 'production';

// Brute-force protection on the whole auth surface, not just /login, since
// /register can also be hammered (account enumeration / spam accounts).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.use(authLimiter);

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

router.post('/register', async (req, res) => {
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

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid login details.' });
  }
  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken({ userId: user._id.toString(), displayName: user.displayName });
    setAuthCookie(res, token);

    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.json({ message: 'Logged out.' });
});

router.get('/me', async (req, res) => {
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

export default router;
