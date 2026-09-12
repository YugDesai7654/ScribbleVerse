import { afterEach, describe, expect, it } from 'vitest';
import { startTestServer } from './testUtils';

describe('health endpoints', () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  it('reports liveness independently of database readiness', async () => {
    const testServer = await startTestServer();
    closeServer = testServer.close;

    const response = await fetch(`${testServer.url}/health/live`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'alive' });
  });

  it('returns 503 when the application is not connected to MongoDB', async () => {
    const testServer = await startTestServer();
    closeServer = testServer.close;

    const response = await fetch(`${testServer.url}/health/ready`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      database: 'disconnected',
    });
  });
});
