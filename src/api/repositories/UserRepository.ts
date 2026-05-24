import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { TOKENS } from '../../container';
import { usersTable } from '../models/user.schema';
import type { User, NewUser } from '../models/user.schema';
import { getCache, setCache, deleteCache } from '../../cache/redis';

type Db = NodePgDatabase<Record<string, never>>;
type UserUpdate = Partial<Pick<User, 'firstName' | 'lastName' | 'email'>>;

const CACHE_PREFIX = 'user:';
const CACHE_TTL    = 60; // seconds

@injectable()
export class UserRepository {
  constructor(@inject(TOKENS.DrizzleDb) private readonly db: Db) {}

  async findAll(): Promise<User[]> {
    return this.db.select().from(usersTable);
  }

  async findById(id: string): Promise<User | null> {
    const cached = await getCache<User>(`${CACHE_PREFIX}${id}`);
    if (cached) return cached;

    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    const user = rows[0] ?? null;
    if (user) {
      await setCache(`${CACHE_PREFIX}${id}`, user, CACHE_TTL);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const rows = await this.db
      .insert(usersTable)
      .values(data)
      .returning();
    // Non-null: INSERT … RETURNING always yields one row
    return rows[0]!;
  }

  async update(id: string, data: UserUpdate): Promise<User | null> {
    await deleteCache(`${CACHE_PREFIX}${id}`);

    const rows = await this.db
      .update(usersTable)
      // Drizzle skips undefined fields automatically
      .set({ ...data, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();

    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await deleteCache(`${CACHE_PREFIX}${id}`);
    await this.db.delete(usersTable).where(eq(usersTable.id, id));
  }
}
