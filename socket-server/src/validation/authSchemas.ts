import { nameField } from './schemas';
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(100),
  password: z.string().min(8).max(72), // 72 bytes is bcrypt's effective input limit
  displayName: nameField,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(100),
  password: z.string().min(1).max(72),
});
