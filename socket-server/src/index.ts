import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { createApp } from './server';
import { connectDB, disconnectDB } from './dbConnect/dbconnect';
import { loadEnvironment } from './env';
import { logger } from './logger';
import { User } from './model/user';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function start() {
  const env = loadEnvironment();
  await connectDB(env.MONGO_URI);
  // A failed unique-index build (old duplicate display names) is otherwise silent.
  User.init().catch((err: unknown) => {
    logger.error({ err }, 'User indexes failed to build; run npm run migrate:display-names and restart');
  });

  const { server, io } = createApp();

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, resolve);
  });
  logger.info({ port: env.PORT }, 'Socket.IO server started');

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');

    const forcedExit = setTimeout(() => {
      logger.fatal({ signal }, 'Graceful shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forcedExit.unref();

    io.disconnectSockets(true);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await disconnectDB();
    clearTimeout(forcedExit);
    logger.info({ signal }, 'Graceful shutdown completed');
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

// Last line of defence: a stray rejected promise (e.g. a transient MongoDB error
// inside a socket handler) should be logged, not take down every live game.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

start().catch((err: unknown) => {
  logger.fatal({ err }, 'Application startup failed');
  process.exit(1);
});
