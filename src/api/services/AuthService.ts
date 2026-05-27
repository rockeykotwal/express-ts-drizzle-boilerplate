import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import * as argon2 from 'argon2';
import type { Redis } from 'ioredis';
import { UserRepository } from '../repositories/UserRepository';
import type { User } from '../models/user.schema';
import type { SignupDto } from '../validators/SignupDto';
import type { LoginDto } from '../validators/LoginDto';
import { AppError } from '../../errors/AppError';
import { config } from '../../config';

export type SafeUser = Omit<User, 'passwordHash'>;

@injectable()
export class AuthService {
  private readonly jwtSecret: Uint8Array;

  constructor(
    @inject(UserRepository) private readonly userRepository: UserRepository,
    @inject('RedisClient') private readonly redis: Redis,
  ) {
    this.jwtSecret = new TextEncoder().encode(config.jwt.secret);
  }

  private async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  private async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  private async generateAccessToken(userId: string, email: string): Promise<string> {
    return new SignJWT({ sub: userId, email, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(config.jwt.accessExpiresIn)
      .sign(this.jwtSecret);
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    return new SignJWT({ sub: userId, type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(config.jwt.refreshExpiresIn)
      .sign(this.jwtSecret);
  }

  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret);
      return payload;
    } catch {
      throw new AppError('Invalid or expired access token', 401);
    }
  }

  private async verifyRefreshToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret);
      return payload;
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }
  }

  private async storeRefreshToken(userId: string, token: string): Promise<void> {
    await this.redis.setex(`refresh_token:${userId}`, 604800, token);
  }

  private async revokeRefreshToken(userId: string): Promise<void> {
    await this.redis.del(`refresh_token:${userId}`);
  }

  private async isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
    const stored = await this.redis.get(`refresh_token:${userId}`);
    return stored === token;
  }

  async signup(
    dto: SignupDto,
  ): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new AppError('Email already in use', 409);
    }

    const passwordHash = await this.hashPassword(dto.password);
    const created = await this.userRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
    });

    const accessToken = await this.generateAccessToken(created.id, created.email);
    const refreshToken = await this.generateRefreshToken(created.id);
    await this.storeRefreshToken(created.id, refreshToken);

    const { passwordHash: _pw, ...user } = created;
    return { accessToken, refreshToken, user };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    const found = await this.userRepository.findByEmail(dto.email);
    if (!found) {
      throw new AppError('Invalid credentials', 401);
    }

    const valid = await this.verifyPassword(dto.password, found.passwordHash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }

    const accessToken = await this.generateAccessToken(found.id, found.email);
    const refreshToken = await this.generateRefreshToken(found.id);
    await this.storeRefreshToken(found.id, refreshToken);

    const { passwordHash: _pw, ...user } = found;
    return { accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const userId = payload.sub!;

    const valid = await this.isRefreshTokenValid(userId, refreshToken);
    if (!valid) {
      throw new AppError('Refresh token revoked', 401);
    }

    const dbUser = await this.userRepository.findById(userId);
    if (!dbUser) {
      throw new AppError('User not found', 401);
    }

    const accessToken = await this.generateAccessToken(userId, dbUser.email);
    return { accessToken };
  }

  async logout(userId: string): Promise<void> {
    await this.revokeRefreshToken(userId);
  }
}
