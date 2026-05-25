// Seed script: src/modules/rbac/seeds/rbac.seed.ts
// Run with: npm run db:seed:rbac

import type { Application } from 'express';
import { logger } from '../../observability/logger';
import roleRouter from './controllers/RoleController';
import permissionRouter from './controllers/PermissionController';
import userRoleRouter from './controllers/UserRoleController';

export function registerRbac(app: Application): void {
  app.use('/api/roles', roleRouter);
  app.use('/api/permissions', permissionRouter);
  app.use('/api/users', userRoleRouter);
  logger.info('RBAC module registered');
}

// ── Schema exports ────────────────────────────────────────────────────────────
export * from './models/role.schema';
export * from './models/permission.schema';
export * from './models/role-permission.schema';
export * from './models/user-role.schema';

// ── Repository exports ────────────────────────────────────────────────────────
export * from './repositories/RoleRepository';
export * from './repositories/PermissionRepository';

// ── Service exports ───────────────────────────────────────────────────────────
export * from './services/RbacService';

// ── Middleware exports ────────────────────────────────────────────────────────
export * from './middlewares/authorize';
