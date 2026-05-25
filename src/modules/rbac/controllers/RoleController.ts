import 'reflect-metadata';
import { Router, Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { container } from '../../../container';
import { RbacService } from '../services/RbacService';
import { RoleRepository } from '../repositories/RoleRepository';
import { CreateRoleDto } from '../validators/CreateRoleDto';
import { PERMISSIONS } from '../models/permission.schema';
import { authenticate } from '../../../api/middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { AppError } from '../../../errors/AppError';

const rbacService    = container.resolve(RbacService);
const roleRepository = container.resolve(RoleRepository);

function toValidationError(errors: ValidationError[]): AppError {
  const msg = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ');
  return new AppError(`Validation failed: ${msg}`, 400);
}

// ── Shared RBAC component definitions ────────────────────────────────────────
/**
 * @openapi
 * components:
 *   schemas:
 *     Role:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           example: admin
 *         description:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     Permission:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         action:
 *           type: string
 *           example: read
 *         resource:
 *           type: string
 *           example: users
 *         key:
 *           type: string
 *           example: users:read
 *         description:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     CreateRoleBody:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           example: moderator
 *         description:
 *           type: string
 *           example: Can moderate content
 *     AssignPermissionBody:
 *       type: object
 *       required: [permissionId]
 *       properties:
 *         permissionId:
 *           type: string
 *           format: uuid
 */

const router = Router();

/**
 * @openapi
 * /api/roles:
 *   get:
 *     tags: [Roles]
 *     summary: List all roles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Role'
 *       401:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const roles = await roleRepository.findAll();
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/roles:
 *   post:
 *     tags: [Roles]
 *     summary: Create a new role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoleBody'
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role:
 *                   $ref: '#/components/schemas/Role'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post(
  '/',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToInstance(CreateRoleDto, req.body as object);
      try {
        await validateOrReject(dto);
      } catch (errs) {
        throw toValidationError(errs as ValidationError[]);
      }
      const role = await rbacService.createRole(dto);
      res.status(201).json({ role });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/roles/{id}:
 *   delete:
 *     tags: [Roles]
 *     summary: Delete a role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/:id',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rbacService.deleteRole(req.params['id']!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/roles/{id}/permissions:
 *   post:
 *     tags: [Roles]
 *     summary: Assign a permission to a role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignPermissionBody'
 *     responses:
 *       200:
 *         description: Permission assigned
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post(
  '/:id/permissions',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { permissionId } = req.body as { permissionId?: string };
      if (!permissionId) {
        throw new AppError('permissionId is required', 400);
      }
      await rbacService.assignPermissionToRole(req.params['id']!, permissionId);
      res.json({ message: 'Permission assigned' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/roles/{id}/permissions/{permissionId}:
 *   delete:
 *     tags: [Roles]
 *     summary: Remove a permission from a role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: permissionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Permission removed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  '/:id/permissions/:permissionId',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await roleRepository.removePermission(req.params['id']!, req.params['permissionId']!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
