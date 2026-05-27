/**
 * Integration tests — User routes
 *
 * Requires running PostgreSQL + Redis + RBAC seeds applied.
 * See tests/integration/auth.test.ts for environment setup notes.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { db } from '../../src/database/client';
import { expressLoader } from '../../src/loaders/expressLoader';
import { config } from '../../src/config';

let app: Application;

beforeAll(async () => {
  app = expressLoader();
});

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 200));
});

afterEach(async () => {
  try {
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  } catch {
    // Skip if DB unavailable
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function makeToken(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(config.jwt.secret);
  return new SignJWT({ sub: userId, email, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret);
}

function getAuthHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

const newUserPayload = {
  firstName:    'Test',
  lastName:     'User',
  email:        'testuser@example.com',
  passwordHash: '$argon2id$v=19$m=65536$stub',
};

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/users/me', () => {
  it('200 — returns the currently authenticated user', async () => {
    // Arrange: sign up to create a real user
    const signup = await request(app).post('/api/auth/signup').send({
      firstName: 'Me', lastName: 'User', email: 'me@example.com', password: 'password123',
    });

    const { accessToken, user } = signup.body as { accessToken: string; user: { id: string } };

    // Act
    const res = await request(app)
      .get('/api/users/me')
      .set(getAuthHeader(accessToken));

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('401 — rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});

describe('User CRUD routes (require RBAC permissions)', () => {
  /**
   * NOTE: Full RBAC-protected route tests (GET /api/users, POST /api/users, etc.)
   * require the RBAC seeds to be applied (npm run db:seed:rbac) and the test user
   * to be assigned the ADMIN role.
   *
   * These tests verify the 401 behaviour for unauthenticated access, which does
   * not require RBAC setup.
   */

  it('GET /api/users — 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('GET /api/users/:id — 401 for unauthenticated request', async () => {
    const fakeId = crypto.randomUUID();
    const res    = await request(app).get(`/api/users/${fakeId}`);
    expect(res.status).toBe(401);
  });

  it('POST /api/users — 401 for unauthenticated request', async () => {
    const res = await request(app).post('/api/users').send(newUserPayload);
    expect(res.status).toBe(401);
  });

  it('PUT /api/users/:id — 401 for unauthenticated request', async () => {
    const fakeId = crypto.randomUUID();
    const res    = await request(app).put(`/api/users/${fakeId}`).send({ firstName: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/users/:id — 401 for unauthenticated request', async () => {
    const fakeId = crypto.randomUUID();
    const res    = await request(app).delete(`/api/users/${fakeId}`);
    expect(res.status).toBe(401);
  });

  it('GET /api/users/:id — 403 for authenticated user without USERS_READ permission', async () => {
    // Create a user without any RBAC roles
    const signup = await request(app).post('/api/auth/signup').send({
      firstName: 'Low', lastName: 'Priv', email: 'lowpriv@example.com', password: 'password123',
    });
    const { accessToken } = signup.body as { accessToken: string };
    const fakeId = crypto.randomUUID();

    const res = await request(app)
      .get(`/api/users/${fakeId}`)
      .set(getAuthHeader(accessToken));

    // 403 because user is authenticated but has no USERS_READ permission
    expect(res.status).toBe(403);
  });
});
