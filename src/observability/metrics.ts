import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('http', '1.0.0');

export const httpRequestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests received',
});

export const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds',
  unit: 'ms',
});
