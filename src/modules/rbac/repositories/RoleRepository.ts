import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { TOKENS } from '../../../container';
import { rolesTable } from '../models/role.schema';
import type { Role, NewRole } from '../models/role.schema';
import { permissionsTable } from '../models/permission.schema';
import type { Permission } from '../models/permission.schema';
import { rolePermissionsTable } from '../models/role-permission.schema';
import { userRolesTable } from '../models/user-role.schema';
import { AppError } from '../../../errors/AppError';

type Db = NodePgDatabase<Record<string, never>>;

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

@injectable()
export class RoleRepository {
  constructor(@inject(TOKENS.DrizzleDb) private readonly db: Db) {}

  async findAll(): Promise<Role[]> {
    return this.db.select().from(rolesTable);
  }

  async findById(id: string): Promise<Role | null> {
    const rows = await this.db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<Role | null> {
    const rows = await this.db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, name))
      .limit(1);
    return rows[0] ?? null;
  }

  async findWithPermissions(roleId: string): Promise<(Role & { permissions: Permission[] }) | null> {
    const role = await this.findById(roleId);
    if (!role) return null;

    const rows = await this.db
      .select({ permission: permissionsTable })
      .from(rolePermissionsTable)
      .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
      .where(eq(rolePermissionsTable.roleId, roleId));

    return { ...role, permissions: rows.map((r) => r.permission) };
  }

  async create(data: NewRole): Promise<Role> {
    const rows = await this.db.insert(rolesTable).values(data).returning();
    return rows[0]!;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new AppError(`Role "${id}" not found`, 404);
    await this.db.delete(rolesTable).where(eq(rolesTable.id, id));
  }

  async assignPermission(roleId: string, permissionId: string): Promise<void> {
    try {
      await this.db.insert(rolePermissionsTable).values({ roleId, permissionId });
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new AppError('Permission already assigned to role', 409);
      }
      throw err;
    }
  }

  async removePermission(roleId: string, permissionId: string): Promise<void> {
    await this.db
      .delete(rolePermissionsTable)
      .where(
        and(
          eq(rolePermissionsTable.roleId, roleId),
          eq(rolePermissionsTable.permissionId, permissionId),
        ),
      );
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const rows = await this.db
      .select({ role: rolesTable })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, userId));
    return rows.map((r) => r.role);
  }

  async getUsersForRole(roleId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: userRolesTable.userId })
      .from(userRolesTable)
      .where(eq(userRolesTable.roleId, roleId));
    return rows.map((r) => r.userId);
  }

  async assignRoleToUser(userId: string, roleId: string, assignedBy?: string): Promise<void> {
    try {
      await this.db.insert(userRolesTable).values({ userId, roleId, assignedBy });
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new AppError('Role already assigned to user', 409);
      }
      throw err;
    }
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await this.db
      .delete(userRolesTable)
      .where(
        and(
          eq(userRolesTable.userId, userId),
          eq(userRolesTable.roleId, roleId),
        ),
      );
  }
}
