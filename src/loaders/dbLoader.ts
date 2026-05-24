import { pool } from '../database/client';
import { logger } from '../observability/logger';

export async function dbLoader(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    logger.info('Database connection verified');
  } catch (err) {
    logger.error('Failed to connect to database', { error: (err as Error).message });
    throw err;
  } finally {
    client?.release();
  }
}
