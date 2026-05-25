import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import type { Redis } from 'ioredis';
import { TOKENS } from '../../../container';
import { RoleRepository } from '../repositories/RoleRepository';
import { PermissionRepository } from '../repositories/PermissionRepository';
import type { Role, NewRole } from '../models/role.schema';
import type { Permission, NewPermission } from '../models/permission.schema';
import { AppError } from '../../../errors/AppError';

const CACHE_TTL = 900; // 15 minutes

@injectable()
export class RbacService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository,
    @inject(TOKENS.RedisClient) private readonly redis: Redis,
  ) {}

  // ── Private cache helpers ─────────────────────────────────────────────────

  private async getCachedPermissions(userId: string): Promise<string[] | null> {
    const raw = await this.redis.get(`permissions:${userId}`);
    if (raw === null) return null;
    return JSON.parse(raw) as string[];
  }

  private async setCachedPermissions(userId: string, permissions: string[]): Promise<void> {
    await this.redis.setex(`permissions:${userId}`, CACHE_TTL, JSON.stringify(permissions));
  }

  private async invalidateUserPermissions(userId: string): Promise<void> {
    await this.redis.del(`permissions:${userId}`);
  }

  // ── Public methods ────────────────────────────────────────────────────────

  async getUserPermissions(userId: string): Promise<string[]> {
    const cached = await this.getCachedPermissions(userId);
    if (cached !== null) return cached;

    const roles = await this.roleRepository.getUserRoles(userId);
    const permissionsSet = new Set<string>();

    for (const role of roles) {
      const roleWithPerms = await this.roleRepository.findWithPermissions(role.id);
      if (roleWithPerms) {
        for (const permission of roleWithPerms.permissions) {
          permissionsSet.add(permission.key);
        }
      }
    }

    const permissions = [...permissionsSet];

    if (permissions.includes('*')) {
      await this.setCachedPermissions(userId, ['*']);
      return ['*'];
    }

    await this.setCachedPermissions(userId, permissions);
    return permissions;
  }

  async hasPermission(userId: string, requiredPermission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    if (permissions.includes('*')) return true;
    return permissions.includes(requiredPermission);
  }

  async hasAnyPermission(userId: string, requiredPermissions: string[]): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    if (permissions.includes('*')) return true;
    return requiredPermissions.some((p) => permissions.includes(p));
  }

  async assignRoleToUser(userId: string, roleId: string, assignedBy?: string): Promise<void> {
    await this.roleRepository.assignRoleToUser(userId, roleId, assignedBy);
    await this.invalidateUserPermissions(userId);
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await this.roleRepository.removeRoleFromUser(userId, roleId);
    await this.invalidateUserPermissions(userId);
  }

  async getUserRolesWithPermissions(
    userId: string,
  ): Promise<{ roles: Role[]; permissions: string[] }> {
    const [roles, permissions] = await Promise.all([
      this.roleRepository.getUserRoles(userId),
      this.getUserPermissions(userId),
    ]);
    return { roles, permissions };
  }

  async createRole(data: NewRole): Promise<Role> {
    const existing = await this.roleRepository.findByName(data.name);
    if (existing) throw new AppError(`Role "${data.name}" already exists`, 409);
    return this.roleRepository.create(data);
  }

  async deleteRole(id: string): Promise<void> {
    await this.roleRepository.delete(id);
  }

  async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    await this.roleRepository.assignPermission(roleId, permissionId);

    // Invalidate cache for every user who holds this role
    const userIds = await this.roleRepository.getUsersForRole(roleId);
    await Promise.all(userIds.map((uid) => this.invalidateUserPermissions(uid)));
  }

  async createPermission(data: NewPermission): Promise<Permission> {
    const existing = await this.permissionRepository.findByKey(data.key);
    if (existing) throw new AppError(`Permission "${data.key}" already exists`, 409);
    return this.permissionRepository.create(data);
  }
}
