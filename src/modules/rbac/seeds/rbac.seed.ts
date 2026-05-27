// Standalone RBAC seed script — run with: npm run db:seed:rbac
// Does NOT use tsyringe. Uses Drizzle db client directly.

import { db, pool } from '../../../database/client';
import { logger } from '../../../observability/logger';
import { permissionsTable } from '../models/permission.schema';
import { rolesTable } from '../models/role.schema';
import { rolePermissionsTable } from '../models/role-permission.schema';

// ── Seed data ─────────────────────────────────────────────────────────────────

const PERMISSION_DATA = [
  { action: 'read',   resource: 'users',       key: 'users:read' },
  { action: 'write',  resource: 'users',       key: 'users:write' },
  { action: 'delete', resource: 'users',       key: 'users:delete' },
  { action: 'manage', resource: 'users',       key: 'users:manage' },
  { action: 'manage', resource: 'roles',       key: 'roles:manage' },
  { action: 'manage', resource: 'permissions', key: 'permissions:manage' },
  { action: '*',      resource: '*',           key: '*' },
] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  guest:     ['users:read'],
  user:      ['users:read'],
  moderator: ['users:read', 'users:write'],
  admin:     ['*'],
};

// ── Seed logic ────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  logger.info('Seeding permissions...');
  await db
    .insert(permissionsTable)
    .values(PERMISSION_DATA.map((p) => ({ ...p })))
    .onConflictDoNothing();
  logger.info(`  ${PERMISSION_DATA.length} permissions upserted.`);

  logger.info('Seeding roles...');
  const roleData = Object.keys(ROLE_PERMISSIONS).map((name) => ({ name }));
  await db.insert(rolesTable).values(roleData).onConflictDoNothing();
  logger.info(`  ${roleData.length} roles upserted.`);

  logger.info('Assigning permissions to roles...');

  const allPermissions = await db.select().from(permissionsTable);
  const permMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  const allRoles = await db.select().from(rolesTable);
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      logger.warn(`  Role "${roleName}" not found — skipping.`);
      continue;
    }

    for (const permKey of permKeys) {
      const permissionId = permMap.get(permKey);
      if (!permissionId) {
        logger.warn(`  Permission "${permKey}" not found — skipping.`);
        continue;
      }

      await db
        .insert(rolePermissionsTable)
        .values({ roleId, permissionId })
        .onConflictDoNothing();
    }

    logger.info(`  Assigned permissions to role "${roleName}".`);
  }

  logger.info('RBAC seed complete.');
}

seed()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end().catch(() => undefined);
  });
