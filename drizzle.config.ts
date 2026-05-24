import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  dialect: 'postgresql',
  schema: './src/api/models/*',
  out: './src/database/migrations',
  dbCredentials: {
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME     ?? 'myapp',
    user:     process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASS     ?? 'postgres',
  },
  verbose: true,
  strict: true,
} satisfies Config;
