import 'reflect-metadata';
import { container } from 'tsyringe';
import { db } from './database/client';

/** String tokens for non-class dependencies registered in the DI container. */
export const TOKENS = {
  DrizzleDb: 'DrizzleDb',
} as const;

// Register the Drizzle singleton so repositories can inject it via @inject(TOKENS.DrizzleDb)
container.registerInstance(TOKENS.DrizzleDb, db);

export { container };
