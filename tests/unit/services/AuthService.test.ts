import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SignJWT } from 'jose';

// ── All hoisted values (available before vi.mock factories execute) ────────────
const { TEST_JWT_SECRET, mockArgon2Verify, mockArgon2Hash } = vi.hoisted(() => ({
  TEST_JWT_SECRET:  'test-secret-key-minimum-32-characters!!',
  mockArgon2Verify: vi.fn<() => Promise<boolean>>(),
  mockArgon2Hash:   vi.fn<() => Promise<string>>(),
}));

// ── Mock config (read at import time by AuthService → config.jwt.secret) ──────
vi.mock('../../../src/config', () => ({
  config: {
    app:   { port: 3000, env: 'test', isProduction: false, name: 'TestApp', frontendUrl: 'http://localhost:5173' },
    db:    { host: 'localhost', port: 5432, name: 'test', user: 'postgres', pass: 'postgres', poolMin: 1, poolMax: 2 },
    redis: { url: 'redis://localhost:6379' },
    jwt:   { secret: 'test-secret-key-minimum-32-characters!!', accessExpiresIn: '15m', refreshExpiresIn: '7d' },
    otel:  { serviceName: 'test', exporterEndpoint: 'http://localhost:4318' },
    email: { provider: 'smtp', from: 'test@example.com', fromName: 'Test', smtp: { host: 'localhost', port: 1025, secure: false, user: '', pass: '' }, resendApiKey: '' },
    auth:  { requireEmailVerification: false },
  },
}));

// ── Mock argon2 (native binary — cannot vi.spyOn) ─────────────────────────────
vi.mock('argon2', () => ({
  verify: mockArgon2Verify,
  hash:   mockArgon2Hash,
}));

// ── Imports after mocks ────────────────────────────────────────────────────────
import { AuthService } from '../../../src/api/services/AuthService';
import { AppError } from '../../../src/errors/AppError';
import { createUser } from '../../factories/user.factory';
import type { UserRepository } from '../../../src/api/repositories/UserRepository';
import type { Redis } from 'ioredis';

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildAuthService() {
  const mockUserRepository = {
    findByEmail: vi.fn(),
    findById:    vi.fn(),
    create:      vi.fn(),
  } as unknown as UserRepository;

  const mockRedis = {
    get:   vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del:   vi.fn().mockResolvedValue(1),
    set:   vi.fn().mockResolvedValue('OK'),
  } as unknown as Redis;

  const service = new AuthService(mockUserRepository, mockRedis);
  return { service, mockUserRepository, mockRedis };
}

async function makeRefreshToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET);
  return new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

async function makeAccessToken(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET);
  return new SignJWT({ sub: userId, email, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  describe('signup', () => {
    it('should create user and return tokens when email is not taken', async () => {
      // Arrange
      const { service, mockUserRepository, mockRedis } = buildAuthService();
      const user = createUser({ email: 'jane@example.com' });
      mockUserRepository.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepository.create      = vi.fn().mockResolvedValue(user);
      mockArgon2Hash.mockResolvedValue('$argon2id$mocked-hash');

      // Act
      const result = await service.signup({
        firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', password: 'password123',
      });

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.email).toBe(user.email);
      expect(mockUserRepository.create).toHaveBeenCalledOnce();
      expect(mockRedis.setex).toHaveBeenCalledOnce();
    });

    it('should throw 409 AppError when email already exists', async () => {
      // Arrange
      const { service, mockUserRepository } = buildAuthService();
      const existing = createUser({ email: 'taken@example.com' });
      mockUserRepository.findByEmail = vi.fn().mockResolvedValue(existing);

      // Act & Assert
      await expect(
        service.signup({ firstName: 'A', lastName: 'B', email: 'taken@example.com', password: 'pass1234' }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('should store refresh token in Redis with 7-day TTL (604800s)', async () => {
      // Arrange
      const { service, mockUserRepository, mockRedis } = buildAuthService();
      const user = createUser();
      mockUserRepository.findByEmail = vi.fn().mockResolvedValue(null);
      mockUserRepository.create      = vi.fn().mockResolvedValue(user);
      mockArgon2Hash.mockResolvedValue('$argon2id$mocked-hash');

      // Act
      await service.signup({ firstName: 'A', lastName: 'B', email: user.email, password: 'pass1234' });

      // Assert — 604800 = 7 * 24 * 60 * 60
      expect(mockRedis.setex).toHaveBeenCalledWith(`refresh_token:${user.id}`, 604800, expect.any(String));
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      // Arrange
      const { service, mockUserRepository } = buildAuthService();
      const user = createUser({ email: 'user@example.com' });
      mockUserRepository.findByEmail = vi.fn().mockResolvedValue(user);
      mockArgon2Verify.mockResolvedValue(true);

      // Act
      const result = await service.login({ email: 'user@example.com', password: 'password123' });

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw 401 when user is not found', async () => {
      // Arrange
      const { service, mockUserRepository } = buildAuthService();
      mockUserRepository.findByEmail = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('should throw 401 when password is wrong', async () => {
      // Arrange
      const { service, mockUserRepository } = buildAuthService();
      const user = createUser();
      mockUserRepository.findByEmail = vi.fn().mockResolvedValue(user);
      mockArgon2Verify.mockResolvedValue(false);

      // Act & Assert
      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('refresh', () => {
    it('should return a new accessToken for a valid refresh token', async () => {
      // Arrange
      const { service, mockUserRepository, mockRedis } = buildAuthService();
      const user         = createUser();
      const refreshToken = await makeRefreshToken(user.id);

      mockRedis.get               = vi.fn().mockResolvedValue(refreshToken);
      mockUserRepository.findById = vi.fn().mockResolvedValue(user);

      // Act
      const result = await service.refresh(refreshToken);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
    });

    it('should throw 401 when Redis has a different token (token rotated/revoked)', async () => {
      // Arrange
      const { service, mockRedis } = buildAuthService();
      const refreshToken = await makeRefreshToken('some-user-id');
      mockRedis.get = vi.fn().mockResolvedValue('a-different-stored-token');

      // Act & Assert
      await expect(service.refresh(refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('should throw 401 for a malformed token string', async () => {
      // Arrange
      const { service } = buildAuthService();

      // Act & Assert
      await expect(service.refresh('not-a-valid-jwt')).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('logout', () => {
    it('should call redis.del with the correct refresh_token key', async () => {
      // Arrange
      const { service, mockRedis } = buildAuthService();
      const userId = crypto.randomUUID();

      // Act
      await service.logout(userId);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh_token:${userId}`);
    });
  });

  describe('verifyAccessToken', () => {
    it('should return the JWT payload for a valid access token', async () => {
      // Arrange
      const { service } = buildAuthService();
      const userId = crypto.randomUUID();
      const email  = 'test@example.com';
      const token  = await makeAccessToken(userId, email);

      // Act
      const payload = await service.verifyAccessToken(token);

      // Assert
      expect(payload.sub).toBe(userId);
      expect(payload['email']).toBe(email);
    });

    it('should throw 401 AppError for an invalid token string', async () => {
      // Arrange
      const { service } = buildAuthService();

      // Act & Assert
      await expect(service.verifyAccessToken('garbage.token')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should throw AppError (not a plain Error)', async () => {
      // Arrange
      const { service } = buildAuthService();

      // Act & Assert
      await expect(service.verifyAccessToken('bad')).rejects.toBeInstanceOf(AppError);
    });
  });
});
