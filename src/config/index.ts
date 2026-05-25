import * as dotenv from 'dotenv';
import { AppError } from '../errors/AppError';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: "${key}"`);
  }
  return value;
}

function requireSecret(key: string, minLength: number): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new AppError(`Missing required environment variable: "${key}"`, 500, false);
  }
  if (value.length < minLength) {
    throw new AppError(
      `Environment variable "${key}" must be at least ${minLength} characters`,
      500,
      false,
    );
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Environment variable "${key}" must be an integer, got: "${raw}"`);
  }
  return n;
}

export const config = {
  app: {
    port: envInt('APP_PORT', 3000),
    env: optionalEnv('NODE_ENV', 'development'),
    isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  },
  db: {
    host: requireEnv('DB_HOST'),
    port: envInt('DB_PORT', 5432),
    name: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    pass: requireEnv('DB_PASS'),
    poolMin: envInt('DB_POOL_MIN', 2),
    poolMax: envInt('DB_POOL_MAX', 10),
  },
  redis: {
    url: requireEnv('REDIS_URL'),
  },
  otel: {
    serviceName: optionalEnv('OTEL_SERVICE_NAME', 'express-app'),
    exporterEndpoint: optionalEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318'),
  },
  jwt: {
    secret: requireSecret('JWT_SECRET', 32),
    accessExpiresIn: optionalEnv('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
} as const;

export type Config = typeof config;
