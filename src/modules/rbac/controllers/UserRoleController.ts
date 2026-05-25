import 'reflect-metadata';
import { Router, Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { container } from '../../../container';
import { RbacService } from '../services/RbacService';
import { AssignRoleDto } from '../validators/AssignRoleDto';
import { PERMISSIONS } from '../models/permission.schema';
import { authenticate } from '../../../api/middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { AppError } from '../../../errors/AppError';

const rbacService = container.resolve(RbacService);

function toValidationError(errors: ValidationError[]): AppError {
  const msg = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ');
  return new AppError(`Validation failed: ${msg}`, 400);
}

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     AssignRoleBody:
 *       type: object
 *       required: [roleId]
 *       properties:
 *         roleId:
 *           type: string
 *           format: uuid
 */

/**
 * @openapi
 * /api/users/{userId}/roles:
 *   get:
 *     tags: [User Roles]
 *     summary: Get all roles and permissions for a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User roles and flattened permission keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Role'
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ['users:read', 'users:write']
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/:userId/roles',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await rbacService.getUserRolesWithPermissions(req.params['userId']!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/users/{userId}/roles:
 *   post:
 *     tags: [User Roles]
 *     summary: Assign a role to a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRoleBody'
 *     responses:
 *       200:
 *         description: Role assigned
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
  '/:userId/roles',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUserId = req.params['userId']!;
      const { userId: assignedBy } = res.locals['user'] as { userId: string };

      const dto = plainToInstance(AssignRoleDto, req.body as object);
      try {
        await validateOrReject(dto);
      } catch (errs) {
        throw toValidationError(errs as ValidationError[]);
      }

      await rbacService.assignRoleToUser(targetUserId, dto.roleId, assignedBy);
      res.json({ message: 'Role assigned' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/users/{userId}/roles/{roleId}:
 *   delete:
 *     tags: [User Roles]
 *     summary: Remove a role from a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Role removed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.delete(
  '/:userId/roles/:roleId',
  authenticate,
  authorize(PERMISSIONS.ROLES_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rbacService.removeRoleFromUser(req.params['userId']!, req.params['roleId']!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
