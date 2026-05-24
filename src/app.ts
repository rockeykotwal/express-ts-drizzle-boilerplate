import 'reflect-metadata';

import { initLoaders } from './loaders';
import { config } from './config';
import { logger } from './observability/logger';
import { shutdownTracing } from './observability/tracing';
import { pool } from './database/client';
import { redisClient } from './cache/redis';
import type { Server } from 'http';

async function main(): Promise<void> {
  const app = await initLoaders();

  const server: Server = app.listen(config.app.port, () => {
    logger.info('Server listening', {
      port: config.app.port,
      env:  config.app.env,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received — starting graceful shutdown`);

    server.close(() => {
      logger.info('HTTP server closed — draining connections');

      pool
        .end()
        .then(() => {
          logger.info('Database pool drained');
          return redisClient.quit();
        })
        .then(() => {
          logger.info('Redis connection closed');
          return shutdownTracing();
        })
        .then(() => {
          logger.info('Shutdown complete');
          process.exit(0);
        })
        .catch((err: Error) => {
          logger.error('Error during graceful shutdown', { error: err.message });
          process.exit(1);
        });
    });

    // Force-exit if graceful shutdown stalls
    const killer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 30_000);

    killer.unref(); // do not keep the event loop alive for this timer
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Fatal: failed to start server:', message);
  process.exit(1);
});
