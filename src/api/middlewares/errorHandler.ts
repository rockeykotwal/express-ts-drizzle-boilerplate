import { NextFunction, Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { logger } from '../../observability/logger';

export interface AppError extends Error {
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const traceId = trace.getActiveSpan()?.spanContext().traceId;

  logger.error('Unhandled error', {
    error:      err.message,
    statusCode,
    method:     req.method,
    url:        req.url,
    traceId,
    stack:      err.stack,
  });

  const body: Record<string, unknown> = {
    status:  'error',
    message: err.message ?? 'Internal Server Error',
    traceId,
  };

  if (!process.env['NODE_ENV'] || process.env['NODE_ENV'] !== 'production') {
    body['stack'] = err.stack;
  }

  res.status(statusCode).json(body);
}
