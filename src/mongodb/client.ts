import { MongoClient, type Db } from 'mongodb';

// Populated by mongoLoader() at startup.
export const mongo: { client: MongoClient | null; db: Db | null } = {
  client: null,
  db:     null,
};
