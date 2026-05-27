import 'reflect-metadata';
import { vi, beforeEach } from 'vitest';

// ── Mock database client ───────────────────────────────────────────────────────
// Prevents real DB connections during unit tests
vi.mock('../src/database/client', () => ({
  db: {
    select:  vi.fn().mockReturnValue({
      from:  vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert:  vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    update:  vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    delete:  vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    query:   {},
  },
  pool: {
    end:   vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// ── Mock Redis client ─────────────────────────────────────────────────────────
// Prevents real Redis connections during unit tests
vi.mock('../src/cache/redis', () => ({
  redisClient: {
    get:        vi.fn().mockResolvedValue(null),
    set:        vi.fn().mockResolvedValue('OK'),
    setex:      vi.fn().mockResolvedValue('OK'),
    del:        vi.fn().mockResolvedValue(1),
    ping:       vi.fn().mockResolvedValue('PONG'),
    quit:       vi.fn().mockResolvedValue(undefined),
    on:         vi.fn(),
    call:       vi.fn().mockResolvedValue(null),
  },
  getCache:    vi.fn().mockResolvedValue(null),
  setCache:    vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock observability ────────────────────────────────────────────────────────
vi.mock('../src/observability/logger', () => ({
  logger: {
    info:  vi.fn(),
    error: vi.fn(),
    warn:  vi.fn(),
    http:  vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../src/observability/tracing', () => ({
  initTracing:     vi.fn(),
  shutdownTracing: vi.fn().mockResolvedValue(undefined),
}));

// ── Clear all mocks between tests ─────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});
