import { MongoClient } from 'mongodb';
import { mongo } from '../mongodb/client';
import { container } from '../container';
import { config } from '../config';
import { TOKENS } from '../tokens';
import { logger } from '../observability/logger';

export async function mongoLoader(): Promise<void> {
  const client = new MongoClient(config.mongo.uri, {
    connectTimeoutMS:         5_000,
    serverSelectionTimeoutMS: 5_000,
    minPoolSize:              config.mongo.poolMin,
    maxPoolSize:              config.mongo.poolMax,
  });

  client.on('error', (err: Error) => {
    logger.error('MongoDB error', { error: err.message });
  });
  client.on('open', () => {
    logger.info('MongoDB connected');
  });
  client.on('serverClosed', () => {
    logger.warn('MongoDB server connection closed');
  });

  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    logger.info('MongoDB connection verified');
  } catch (err) {
    logger.error('Failed to connect to MongoDB', { error: (err as Error).message });
    throw err;
  }

  mongo.client = client;
  mongo.db     = client.db();
  container.registerInstance(TOKENS.MongoDb, mongo.db);
}
