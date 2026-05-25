import 'reflect-metadata';
import { container } from 'tsyringe';
import { db } from './database/client';
import { redisClient } from './cache/redis';

/** String tokens for non-class dependencies registered in the DI container. */
export const TOKENS = {
  DrizzleDb:   'DrizzleDb',
  RedisClient: 'RedisClient',
} as const;

container.registerInstance(TOKENS.DrizzleDb, db);
container.registerInstance(TOKENS.RedisClient, redisClient);

export { container };
