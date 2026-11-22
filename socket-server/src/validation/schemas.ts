import { z, ZodSchema } from 'zod';
import { CATEGORIES } from '../game/words';

// Shared building blocks
const roomIdField = z.string().trim().min(4).max(8).regex(/^[A-Za-z0-9]+$/, 'Room code must be alphanumeric');
// Names that would let a player impersonate server-generated chat messages.
export const RESERVED_NAMES = ['system', 'server', 'admin', 'moderator'];
export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.includes(name.trim().toLowerCase());
}
export const nameField = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .refine((name) => !isReservedName(name), 'That name is reserved');

export const createRoomSchema = z.object({
  roomId: roomIdField,
  name: nameField,
  rounds: z.number().int().min(1).max(10).optional().default(3),
  timePerRound: z.number().int().min(10).max(300).optional().default(60),
  maxPlayers: z.number().int().min(2).max(12).optional().default(8),
});

export const joinRoomSchema = z.object({
  roomId: roomIdField,
  name: nameField,
  // Secret handed out on the first join; lets a refreshed tab reclaim its seat.
  reconnectToken: z.string().min(1).max(64).optional(),
});

export const MAX_CUSTOM_WORDS = 200;
const customWordSchema = z
  .string()
  .min(2, 'Custom words must be 2–30 characters')
  .max(30, 'Custom words must be 2–30 characters')
  .regex(/^[a-z][a-z' -]*$/, "Custom words may only use letters, spaces, hyphens and apostrophes");

/** Parses the host's comma-separated textarea into a clean, de-duplicated word list. */
export const customWordsField = z
  .string()
  .max(MAX_CUSTOM_WORDS * 32)
  .transform((raw) => [
    ...new Set(
      raw
        .split(',')
        .map((word) => word.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean)
    ),
  ])
  .pipe(z.array(customWordSchema).max(MAX_CUSTOM_WORDS, `At most ${MAX_CUSTOM_WORDS} custom words`));

export const roomSettingsFields = {
  rounds: z.number().int().min(1).max(10),
  timePerRound: z.number().int().min(10).max(300),
  maxPlayers: z.number().int().min(2).max(12),
  category: z.enum(CATEGORIES),
  customWords: customWordsField,
  customWordsOnly: z.boolean(),
};

/** Host-only lobby edit. Every field is optional so one control can change at a time. */
export const updateSettingsSchema = z
  .object({ roomId: roomIdField })
  .extend(
    Object.fromEntries(
      Object.entries(roomSettingsFields).map(([key, field]) => [key, field.optional()])
    ) as { [K in keyof typeof roomSettingsFields]: z.ZodOptional<(typeof roomSettingsFields)[K]> }
  );

export const kickPlayerSchema = z.object({
  roomId: roomIdField,
  playerId: z.string().min(1).max(64),
});

export const chatMessageSchema = z.object({
  roomId: roomIdField,
  user: nameField,
  text: z.string().trim().min(1).max(200),
});

// Coordinates are normalised to the canvas (0..1) so strokes render the same
// on every screen size.
const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const drawingSchema = z.object({
  roomId: roomIdField,
  strokeId: z.string().min(1).max(32),
  from: pointSchema.nullable(),
  to: pointSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #rrggbb hex value'),
  // Brush width in pixels on a 1000px-wide reference canvas; clients scale it.
  size: z.number().min(1).max(60),
});

/** Flood fill at a point. The server stores it in the turn's history; clients replay it in order. */
export const fillSchema = z.object({
  roomId: roomIdField,
  strokeId: z.string().min(1).max(32),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #rrggbb hex value'),
});

export const undoStrokeSchema = z.object({
  roomId: roomIdField,
});

export const chooseWordSchema = z.object({
  roomId: roomIdField,
  word: z.string().trim().min(1).max(30),
  // Ignored by the server (the authoritative round comes from game state); kept
  // optional so older clients that still send it continue to validate.
  round: z.number().int().min(1).max(10).optional(),
});

export const clearCanvasSchema = z.object({
  roomId: roomIdField,
});

/**
 * Validates raw socket payloads against a zod schema.
 * Returns the parsed/typed data on success, or null on failure — callers should
 * silently drop the event (or emit an appropriate *Error event) rather than throw,
 * since this runs directly on untrusted network input.
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/** Like `validate`, but returns the first issue's message so the client can show it. */
export function validateWithError<T>(
  schema: ZodSchema<T>,
  data: unknown
): { data: T; error?: undefined } | { data?: undefined; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { data: result.data };
  return { error: result.error.issues[0]?.message ?? 'Invalid request' };
}
