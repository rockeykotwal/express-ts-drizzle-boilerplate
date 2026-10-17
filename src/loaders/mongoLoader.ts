import { mongoClient } from '../mongodb/client';
import { logger } from '../observability/logger';

export async function mongoLoader(): Promise<void> {
  try {
    await mongoClient.connect();
    await mongoClient.db('admin').command({ ping: 1 });
    logger.info('MongoDB connection verified');
  } catch (err) {
    logger.error('Failed to connect to MongoDB', { error: (err as Error).message });
    throw err;
  }
}
