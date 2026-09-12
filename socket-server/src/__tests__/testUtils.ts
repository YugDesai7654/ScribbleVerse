import type { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../server';

/**
 * Spins up a fully independent `createApp()` instance on an ephemeral OS-assigned
 * port. Each call gets its own isolated in-memory game state, so tests never leak
 * state into each other as long as each test calls this itself.
 */
export async function startTestServer() {
  const { server, io } = createApp();

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const { port } = server.address() as AddressInfo;
  const url = `http://localhost:${port}`;

  return {
    url,
    io,
    close: () =>
      new Promise<void>((resolve) => {
        io.close();
        server.close(() => resolve());
      }),
  };
}

/** Connects a real socket.io-client to the given server URL and resolves once connected. */
export function connectClient(url: string, cookie?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

/** Resolves with the payload of the next occurrence of `event` on `socket`. */
export function waitForEvent<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (data: T) => resolve(data));
  });
}
