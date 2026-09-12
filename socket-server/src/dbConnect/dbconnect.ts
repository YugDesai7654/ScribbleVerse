import mongoose from 'mongoose';
import { logger } from '../logger';

export async function connectDB(mongoUri: string): Promise<void> {
  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}
