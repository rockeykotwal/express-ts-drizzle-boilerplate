/**
 * Integration tests — Auth routes
 *
 * These tests hit the real Express app with real Drizzle queries.
 * They require a running PostgreSQL + Redis instance.
 *
 * Run locally:
 *   docker-compose up postgres redis -d
 *   npm run db:migrate
 *   npm test
 *
 * In CI the service containers are spun up automatically (see .github/workflows/ci.yml).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { expressLoader } from '../../src/loaders/expressLoader';

let app: Application;

beforeAll(async () => {
  // Bootstrap Express without real tracing / DB connectivity checks
  app = expressLoader();
});

afterAll(async () => {
  // Allow open handles to settle
  await new Promise((r) => setTimeout(r, 200));
});

beforeEach(async () => {
  // Truncate users table BEFORE each test so every test starts with a clean
  // slate, regardless of what the previous test (or file) left behind.
  try {
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  } catch {
    // If the DB isn't available in this run, skip silently
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const validUser = {
  firstName: 'Jane',
  lastName:  'Doe',
  email:     'jane@example.com',
  password:  'password123',
};

async function signupAndGetTokens(overrides: Partial<typeof validUser> = {}) {
  const body = { ...validUser, ...overrides };
  const res  = await request(app).post('/api/auth/signup').send(body);
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('POST /api/auth/signup', () => {
  it('201 — creates user and returns tokens', async () => {
    const res = await signupAndGetTokens();

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user.email).toBe(validUser.email);
  });

  it('400 — rejects invalid email', async () => {
    const res = await signupAndGetTokens({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('400 — rejects password shorter than 8 characters', async () => {
    const res = await signupAndGetTokens({ password: 'short' });
    expect(res.status).toBe(400);
  });

  it('400 — rejects missing firstName', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      lastName: 'Doe', email: 'a@example.com', password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('409 — rejects duplicate email', async () => {
    await signupAndGetTokens();
    const res = await signupAndGetTokens(); // same email
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('200 — returns tokens for valid credentials', async () => {
    await signupAndGetTokens();

    const res = await request(app).post('/api/auth/login').send({
      email:    validUser.email,
      password: validUser.password,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data.accessToken');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('401 — rejects unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@example.com', password: 'password123',
    });
    expect(res.status).toBe(401);
  });

  it('401 — rejects wrong password', async () => {
    await signupAndGetTokens();

    const res = await request(app).post('/api/auth/login').send({
      email: validUser.email, password: 'wrong-password',
    });
    expect(res.status).toBe(401);
  });

  it('400 — rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: validUser.email });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  it('200 — returns new accessToken for valid refreshToken', async () => {
    const signup  = await signupAndGetTokens();
    const { refreshToken } = signup.body as { refreshToken: string };

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('400 — rejects when refreshToken field is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('401 — rejects invalid token string', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid.token' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('200 — logs out authenticated user', async () => {
    const signup = await signupAndGetTokens();
    const { accessToken } = signup.body as { accessToken: string };

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('401 — rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});
