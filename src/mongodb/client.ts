import { MongoClient } from 'mongodb';
import { config } from '../config';
import { logger } from '../observability/logger';

export const mongoClient = new MongoClient(config.mongo.uri, {
  connectTimeoutMS:          5_000,
  serverSelectionTimeoutMS:  5_000,
  minPoolSize:               config.mongo.poolMin,
  maxPoolSize:               config.mongo.poolMax,
});

mongoClient.on('error', (err: Error) => {
  logger.error('MongoDB error', { error: err.message });
});

mongoClient.on('open', () => {
  logger.info('MongoDB connected');
});

mongoClient.on('serverClosed', () => {
  logger.warn('MongoDB server connection closed');
});

export const mongoDb = mongoClient.db();
