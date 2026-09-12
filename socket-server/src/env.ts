import { z } from 'zod';

const INSECURE_DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGO_URI: z
    .string()
    .trim()
    .min(1, 'MONGO_URI is required')
    .refine(
      (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
      'MONGO_URI must be a MongoDB connection string'
    ),
  CORS_ORIGIN: z.string().url('CORS_ORIGIN must be a valid URL').optional(),
  JWT_SECRET: z.string().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
}).superRefine((env, context) => {
  if (env.NODE_ENV !== 'production') return;

  if (!env.CORS_ORIGIN) {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message: 'CORS_ORIGIN is required in production',
    });
  }

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET must contain at least 32 characters in production',
    });
  } else if (env.JWT_SECRET === INSECURE_DEV_JWT_SECRET) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'The development JWT secret cannot be used in production',
    });
  }
});

export type RuntimeEnvironment = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  MONGO_URI: string;
  CORS_ORIGIN: string;
  JWT_SECRET?: string;
  LOG_LEVEL?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
};

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    ...result.data,
    CORS_ORIGIN: result.data.CORS_ORIGIN || 'http://localhost:5173',
  };
}
