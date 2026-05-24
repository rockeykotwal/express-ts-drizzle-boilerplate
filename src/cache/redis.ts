import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../observability/logger';

export const redisClient = new Redis(config.redis.url, {
  lazyConnect:        true,
  maxRetriesPerRequest: 3,
  enableReadyCheck:   true,
});

redisClient.on('error', (err: Error) => {
  logger.error('Redis error', { error: err.message });
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis reconnecting');
});

export async function getCache<T>(key: string): Promise<T | null> {
  const raw = await redisClient.get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds !== undefined) {
    await redisClient.setex(key, ttlSeconds, serialized);
  } else {
    await redisClient.set(key, serialized);
  }
}

export async function deleteCache(key: string): Promise<void> {
  await redisClient.del(key);
}
