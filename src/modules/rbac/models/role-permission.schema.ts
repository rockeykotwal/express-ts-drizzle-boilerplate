import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { rolesTable } from './role.schema';
import { permissionsTable } from './permission.schema';

export const rolePermissionsTable = pgTable(
  'role_permissions',
  {
    roleId:       uuid('role_id').notNull().references(() => rolesTable.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id').notNull().references(() => permissionsTable.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
);
