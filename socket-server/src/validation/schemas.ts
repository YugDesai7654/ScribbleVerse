import { z, ZodSchema } from 'zod';

// Shared building blocks
const roomIdField = z.string().trim().min(4).max(8).regex(/^[A-Za-z0-9]+$/, 'Room code must be alphanumeric');
const nameField = z.string().trim().min(1).max(20);

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
});

export const chatMessageSchema = z.object({
  roomId: roomIdField,
  user: nameField,
  text: z.string().trim().min(1).max(200),
});

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const drawingSchema = z.object({
  roomId: roomIdField,
  prevPoint: pointSchema.nullable().optional(),
  currentPoint: pointSchema,
  color: z.string().min(1).max(20),
});

export const chooseWordSchema = z.object({
  roomId: roomIdField,
  word: z.string().trim().min(1).max(30),
  round: z.number().int().min(1),
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
