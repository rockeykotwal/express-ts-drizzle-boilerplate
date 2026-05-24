import rateLimit from 'express-rate-limit';
import type { Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { redisClient } from '../../cache/redis';

const handler = (_req: Request, res: Response): void => {
  res.status(429).json({
    status:      'error',
    message:     'Too many requests. Please slow down and try again later.',
    retryAfter:  res.getHeader('Retry-After'),
  });
};

const buildStore = (): RedisStore =>
  new RedisStore({
    // ioredis.call returns Promise<unknown>; cast satisfies rate-limit-redis's sendCommand type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendCommand: (...args: string[]) => (redisClient as any).call(...args) as Promise<number>,
  });

const shared: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
  // Health endpoint is never rate-limited regardless of middleware order
  skip: (req) => req.path === '/health',
};

/** 100 req / 15 min per IP — applied globally */
export const defaultRateLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1_000,
  max:      100,
  store:    buildStore(),
});

/** 10 req / 1 min per IP — for sensitive POST endpoints */
export const strictRateLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 1_000,
  max:      10,
  store:    buildStore(),
});
