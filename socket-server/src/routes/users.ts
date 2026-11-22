import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../model/user';
import { gameHistory, profileStats } from '../stats/playerStats';
import { profileParamsSchema } from '../validation/statsSchemas';
import { logger } from '../logger';

const router = Router();

router.use(rateLimit({ windowMs: 60 * 1000, max: 60 }));

export const PUBLIC_RECENT_GAMES = 10;

/**
 * Public, read-only profile. Never includes the email or user ID. Display
 * names are unique ignoring case, so the lookup matches case-insensitively
 * (same collation as the index).
 */
router.get('/:displayName', async (req, res) => {
  const parsed = profileParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(404).json({ message: 'Player not found.' });
  }

  try {
    const user = await User.findOne({ displayName: parsed.data.displayName })
      .collation({ locale: 'en', strength: 2 })
      .sort({ createdAt: 1, _id: 1 })
      .select('displayName createdAt')
      .lean<{ _id: unknown; displayName: string; createdAt: Date }>();
    if (!user) {
      return res.status(404).json({ message: 'Player not found.' });
    }

    const userId = String(user._id);
    const [stats, recent] = await Promise.all([
      profileStats(userId),
      gameHistory(userId, 1, PUBLIC_RECENT_GAMES),
    ]);
    res.json({
      profile: { displayName: user.displayName, memberSince: user.createdAt, stats, recentGames: recent.games },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to load public profile');
    res.status(500).json({ message: 'Failed to load profile.' });
  }
});

export default router;
