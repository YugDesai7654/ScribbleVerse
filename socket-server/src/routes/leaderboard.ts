import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyToken, AUTH_COOKIE_NAME } from '../auth/jwt';
import { GameResult } from '../model/gameResult';

const router = Router();

router.use(rateLimit({ windowMs: 60 * 1000, max: 60 }));

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    return res.status(401).json({ message: 'Log in to view the leaderboard.' });
  }

  res.locals.authUser = payload;
  next();
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const topGames = await GameResult.find()
      .sort({ score: -1, playedAt: -1 })
      .limit(20)
      .select('displayName score won playedAt')
      .lean();

    res.json({
      leaderboard: topGames.map((game) => ({
        id: String(game._id),
        displayName: game.displayName,
        score: game.score,
        won: game.won,
        playedAt: game.playedAt,
      })),
    });
  } catch {
    res.status(500).json({ message: 'Failed to load leaderboard.' });
  }
});

export default router;
