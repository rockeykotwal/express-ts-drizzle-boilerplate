import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Root config — used for coverage and global options.
// Project-level test splitting (unit vs integration) lives in vitest.workspace.ts.
export default defineConfig({
  resolve: {
    alias: {
      '#root': resolve(__dirname, 'src'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      exclude: [
        'src/database/migrations/**',
        'src/app.ts',
        'src/observability/tracing.ts',
      ],
    },
  },
});
