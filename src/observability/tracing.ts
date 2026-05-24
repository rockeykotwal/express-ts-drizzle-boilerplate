import { NodeSDK } from '@opentelemetry/sdk-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { Resource } from '@opentelemetry/resources';
import { trace } from '@opentelemetry/api';
import { config } from '../config';

const resource = new Resource({
  'service.name':    config.otel.serviceName,
  'service.version': process.env['npm_package_version'] ?? '1.0.0',
});

const exporter = new OTLPTraceExporter({
  url: `${config.otel.exporterEndpoint}/v1/traces`,
});

const sdk = new NodeSDK({
  resource,
  spanProcessor: new SimpleSpanProcessor(exporter),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation(),
  ],
});

export function initTracing(): void {
  sdk.start();
}

export function shutdownTracing(): Promise<void> {
  return sdk.shutdown();
}

export const tracer = trace.getTracer(config.otel.serviceName);
