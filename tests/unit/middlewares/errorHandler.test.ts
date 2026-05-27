import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../../src/api/middlewares/errorHandler';
import { AppError } from '../../../src/errors/AppError';

function buildMocks() {
  const req  = { method: 'GET', url: '/test' } as Request;
  const res  = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('errorHandler middleware', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('returns the statusCode from an AppError', () => {
    // Arrange
    const { req, res, next } = buildMocks();
    const err = new AppError('Not found', 404);

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Not found' }),
    );
  });

  it('returns 500 for errors without a statusCode', () => {
    // Arrange
    const { req, res, next } = buildMocks();
    const err = new Error('Something went wrong') as AppError;

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('includes stack trace when NODE_ENV is development', () => {
    // Arrange
    process.env['NODE_ENV'] = 'development';
    const { req, res, next } = buildMocks();
    const err = new AppError('Dev error', 500);

    // Act
    errorHandler(err, req, res, next);

    // Assert
    const jsonArg = vi.mocked(res.json).mock.calls[0]![0] as Record<string, unknown>;
    expect(jsonArg).toHaveProperty('stack');
  });

  it('omits stack trace when NODE_ENV is production', () => {
    // Arrange
    process.env['NODE_ENV'] = 'production';
    const { req, res, next } = buildMocks();
    const err = new AppError('Prod error', 500);

    // Act
    errorHandler(err, req, res, next);

    // Assert
    const jsonArg = vi.mocked(res.json).mock.calls[0]![0] as Record<string, unknown>;
    expect(jsonArg).not.toHaveProperty('stack');
  });

  it('includes status: "error" in the response body', () => {
    // Arrange
    const { req, res, next } = buildMocks();
    const err = new AppError('Conflict', 409);

    // Act
    errorHandler(err, req, res, next);

    // Assert
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('handles non-AppError with default 500 and error message', () => {
    // Arrange
    const { req, res, next } = buildMocks();
    const err = Object.assign(new Error('Unexpected'), { statusCode: undefined });

    // Act
    errorHandler(err as AppError, req, res, next);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unexpected' }),
    );
  });
});
