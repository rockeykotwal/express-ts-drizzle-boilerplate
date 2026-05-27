import { defineWorkspace } from 'vitest/config';
import { resolve } from 'path';

const alias = { '#root': resolve(__dirname, 'src') };

export default defineWorkspace([
  // ── Unit tests ─────────────────────────────────────────────────────────────
  // All external I/O (DB, Redis, logger, tracing) is replaced by mocks in
  // tests/setup.ts so tests run without any running infrastructure.
  {
    resolve: { alias },
    test: {
      name:        'unit',
      globals:     true,
      environment: 'node',
      include:     ['tests/unit/**/*.test.ts'],
      setupFiles:  ['./tests/setup.ts'],
    },
  },

  // ── Integration tests ───────────────────────────────────────────────────────
  // Hit the real Express app with a real PostgreSQL + Redis.
  // Requires: docker-compose up postgres redis -d && npm run db:migrate
  // No setupFiles — real DB and Redis connections must be live.
  {
    resolve: { alias },
    test: {
      name:        'integration',
      globals:     true,
      environment: 'node',
      include:     ['tests/integration/**/*.test.ts'],
    },
  },
]);
