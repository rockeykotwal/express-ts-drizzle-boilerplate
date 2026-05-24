import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  host:                   config.db.host,
  port:                   config.db.port,
  database:               config.db.name,
  user:                   config.db.user,
  password:               config.db.pass,
  min:                    config.db.poolMin,
  max:                    config.db.poolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis:       30_000,
});

export const db = drizzle(pool);
