import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { eq, asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { TOKENS } from '../../../container';
import { permissionsTable } from '../models/permission.schema';
import type { Permission, NewPermission } from '../models/permission.schema';
import { AppError } from '../../../errors/AppError';

type Db = NodePgDatabase<Record<string, never>>;

@injectable()
export class PermissionRepository {
  constructor(@inject(TOKENS.DrizzleDb) private readonly db: Db) {}

  async findAll(): Promise<Permission[]> {
    return this.db
      .select()
      .from(permissionsTable)
      .orderBy(asc(permissionsTable.resource), asc(permissionsTable.action));
  }

  async findById(id: string): Promise<Permission | null> {
    const rows = await this.db
      .select()
      .from(permissionsTable)
      .where(eq(permissionsTable.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByKey(key: string): Promise<Permission | null> {
    const rows = await this.db
      .select()
      .from(permissionsTable)
      .where(eq(permissionsTable.key, key))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: NewPermission): Promise<Permission> {
    const rows = await this.db
      .insert(permissionsTable)
      .values(data)
      .returning();
    return rows[0]!;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new AppError(`Permission "${id}" not found`, 404);
    await this.db.delete(permissionsTable).where(eq(permissionsTable.id, id));
  }
}
