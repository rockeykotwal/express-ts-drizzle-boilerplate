import { NextFunction, Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { logger } from '../../observability/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const traceId  = trace.getActiveSpan()?.spanContext().traceId;

    logger.http('HTTP request', {
      method:      req.method,
      url:         req.url,
      status:      res.statusCode,
      duration_ms: duration,
      traceId,
    });
  });

  next();
}
