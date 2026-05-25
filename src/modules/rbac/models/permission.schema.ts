import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const permissionsTable = pgTable('permissions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  action:      text('action').notNull(),
  resource:    text('resource').notNull(),
  key:         text('key').notNull().unique(),
  description: text('description'),
  createdAt:   timestamp('created_at').defaultNow(),
});

export type Permission    = InferSelectModel<typeof permissionsTable>;
export type NewPermission = InferInsertModel<typeof permissionsTable>;

export const PERMISSIONS = {
  USERS_READ:          'users:read',
  USERS_WRITE:         'users:write',
  USERS_DELETE:        'users:delete',
  USERS_MANAGE:        'users:manage',
  ROLES_MANAGE:        'roles:manage',
  PERMISSIONS_MANAGE:  'permissions:manage',
  ALL:                 '*',
} as const;
