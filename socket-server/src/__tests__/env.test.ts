import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../env';

const validMongoUri = 'mongodb://localhost:27017/scribbleverse';

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    MONGO_URI: validMongoUri,
    ...overrides,
  };
}

describe('loadEnvironment', () => {
  it('provides safe local defaults', () => {
    const result = loadEnvironment(environment());

    expect(result.PORT).toBe(4000);
    expect(result.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('accepts a complete production environment', () => {
    const result = loadEnvironment(environment({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGIN: 'https://scribbleverse.example.com',
      JWT_SECRET: 'a-unique-production-secret-with-more-than-32-characters',
    }));

    expect(result.PORT).toBe(8080);
    expect(result.NODE_ENV).toBe('production');
  });

  it('rejects production without explicit CORS and JWT configuration', () => {
    expect(() => loadEnvironment(environment({ NODE_ENV: 'production' })))
      .toThrow(/CORS_ORIGIN is required in production.*JWT_SECRET must contain at least 32 characters/);
  });

  it('rejects the development JWT secret in production', () => {
    expect(() => loadEnvironment(environment({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://scribbleverse.example.com',
      JWT_SECRET: 'dev-only-insecure-secret-change-me',
    }))).toThrow(/development JWT secret cannot be used in production/);
  });

  it('rejects invalid ports and non-MongoDB connection strings', () => {
    expect(() => loadEnvironment(environment({ PORT: '70000' }))).toThrow(/PORT/);
    expect(() => loadEnvironment(environment({ MONGO_URI: 'https://example.com/database' })))
      .toThrow(/MongoDB connection string/);
  });
});
