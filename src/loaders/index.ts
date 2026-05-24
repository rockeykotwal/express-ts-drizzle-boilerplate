import { Application } from 'express';
import { initTracing } from '../observability/tracing';
import { dbLoader } from './dbLoader';
import { redisLoader } from './redisLoader';
import { expressLoader } from './expressLoader';

export async function initLoaders(): Promise<Application> {
  // 1. Tracing must start before any instrumented I/O occurs
  initTracing();

  // 2. Verify infrastructure connectivity — fail fast on misconfiguration
  await dbLoader();
  await redisLoader();

  // 3. Bootstrap the Express application
  const app = expressLoader();

  return app;
}
