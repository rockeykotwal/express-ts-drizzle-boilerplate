import winston from 'winston';
import { trace } from '@opentelemetry/api';
import { config } from '../config';

const traceContext = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span?.isRecording()) {
    const ctx = span.spanContext();
    info['trace_id'] = ctx.traceId;
    info['span_id']  = ctx.spanId;
  }
  return info;
});

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service: _s, ...meta } = info;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${String(timestamp)} [${level}] ${String(message)}${metaStr}`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  traceContext(),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: config.app.isProduction ? 'http' : 'debug',
  defaultMeta: { service: config.otel.serviceName },
  format: config.app.isProduction ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});
