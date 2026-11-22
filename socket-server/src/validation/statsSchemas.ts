import { z } from 'zod';
import { nameField } from './schemas';
import { LEADERBOARD_PERIODS } from '../stats/playerStats';

/** `?page=&limit=` for a player's game history. Query values arrive as strings. */
export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const leaderboardQuerySchema = z.object({
  period: z.enum(LEADERBOARD_PERIODS as [string, ...string[]]).default('all'),
});

export const profileParamsSchema = z.object({
  displayName: nameField,
});
