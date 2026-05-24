import { redisClient } from '../cache/redis';
import { logger } from '../observability/logger';

export async function redisLoader(): Promise<void> {
  try {
    await redisClient.connect();
    await redisClient.ping();
    logger.info('Redis connection verified');
  } catch (err) {
    logger.error('Failed to connect to Redis', { error: (err as Error).message });
    throw err;
  }
}
