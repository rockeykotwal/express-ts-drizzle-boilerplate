import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { SignJWT } from 'jose';

// ── vi.hoisted: values are available before vi.mock factories execute ──────────
// authenticate.ts calls container.resolve(AuthService) at module init time,
// so the mock object must be ready BEFORE the module is first imported.
const { TEST_JWT_SECRET, mockVerifyAccessToken } = vi.hoisted(() => ({
  TEST_JWT_SECRET:       'test-secret-key-minimum-32-characters!!',
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock('../../../src/config', () => ({
  config: {
    jwt: { secret: 'test-secret-key-minimum-32-characters!!', accessExpiresIn: '15m', refreshExpiresIn: '7d' },
    app: { port: 3000, env: 'test', isProduction: false },
  },
}));

vi.mock('../../../src/container', () => ({
  container: {
    resolve: vi.fn().mockReturnValue({ verifyAccessToken: mockVerifyAccessToken }),
  },
  TOKENS: { DrizzleDb: 'DrizzleDb', RedisClient: 'RedisClient' },
}));

// ── Import AFTER mocks ─────────────────────────────────────────────────────────
import { authenticate } from '../../../src/api/middlewares/authenticate';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function makeValidToken(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET);
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret);
}

function buildMocks() {
  const req  = { headers: {} } as unknown as Request;
  const res  = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
    locals: {} as Record<string, unknown>,
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('authenticate middleware', () => {
  beforeEach(() => {
    mockVerifyAccessToken.mockReset();
  });

  it('calls next() and sets res.locals.user when token is valid', async () => {
    // Arrange
    const userId = crypto.randomUUID();
    const email  = 'user@example.com';
    const token  = await makeValidToken(userId, email);

    mockVerifyAccessToken.mockResolvedValue({ sub: userId, email });

    const { req, res, next } = buildMocks();
    (req.headers as Record<string, string>)['authorization'] = `Bearer ${token}`;

    // Act
    await authenticate(req, res, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(/* no error */);
    expect(res.locals['user']).toEqual({ userId, email });
  });

  it('returns 401 when Authorization header is missing', async () => {
    // Arrange
    const { req, res, next } = buildMocks();
    // No authorization header set

    // Act
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unauthorized' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with "Bearer "', async () => {
    // Arrange
    const { req, res, next } = buildMocks();
    (req.headers as Record<string, string>)['authorization'] = 'Token some-other-scheme';

    // Act
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification throws', async () => {
    // Arrange
    mockVerifyAccessToken.mockRejectedValue(new Error('Token expired'));

    const { req, res, next } = buildMocks();
    (req.headers as Record<string, string>)['authorization'] = 'Bearer expired.token.here';

    // Act
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unauthorized' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Bearer token value is an empty string', async () => {
    // Arrange
    mockVerifyAccessToken.mockRejectedValue(new Error('empty token'));

    const { req, res, next } = buildMocks();
    (req.headers as Record<string, string>)['authorization'] = 'Bearer ';

    // Act
    await authenticate(req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
