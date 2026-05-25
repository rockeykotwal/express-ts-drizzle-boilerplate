import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { usersTable } from '../../../api/models/user.schema';
import { rolesTable } from './role.schema';

export const userRolesTable = pgTable(
  'user_roles',
  {
    userId:     uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    roleId:     uuid('role_id').notNull().references(() => rolesTable.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow(),
    assignedBy: uuid('assigned_by'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
);
