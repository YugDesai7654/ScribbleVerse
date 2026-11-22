import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth/requireAuth';
import { leaderboard, type LeaderboardPeriod } from '../stats/playerStats';
import { leaderboardQuerySchema } from '../validation/statsSchemas';
import { logger } from '../logger';

const router = Router();

router.use(rateLimit({ windowMs: 60 * 1000, max: 60 }));

/** Top players by points in a window: `?period=all|week|today` (UTC days, weeks start Monday). */
router.get('/', requireAuth('Log in to view the leaderboard.'), async (req, res) => {
  const parsed = leaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Unknown leaderboard period.' });
  }
  const period = parsed.data.period as LeaderboardPeriod;

  try {
    res.json({ period, leaderboard: await leaderboard(period) });
  } catch (err) {
    logger.error({ err, period }, 'Failed to load leaderboard');
    res.status(500).json({ message: 'Failed to load leaderboard.' });
  }
});

export default router;
