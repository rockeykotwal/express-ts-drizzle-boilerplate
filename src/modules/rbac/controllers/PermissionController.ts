import 'reflect-metadata';
import { Router, Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { container } from '../../../container';
import { RbacService } from '../services/RbacService';
import { PermissionRepository } from '../repositories/PermissionRepository';
import { CreatePermissionDto } from '../validators/CreatePermissionDto';
import { PERMISSIONS } from '../models/permission.schema';
import { authenticate } from '../../../api/middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { AppError } from '../../../errors/AppError';

const rbacService            = container.resolve(RbacService);
const permissionRepository   = container.resolve(PermissionRepository);

function toValidationError(errors: ValidationError[]): AppError {
  const msg = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ');
  return new AppError(`Validation failed: ${msg}`, 400);
}

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CreatePermissionBody:
 *       type: object
 *       required: [action, resource, key]
 *       properties:
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
 *           example: Read access to users
 */

/**
 * @openapi
 * /api/permissions:
 *   get:
 *     tags: [Permissions]
 *     summary: List all permissions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of permissions ordered by resource and action
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Permission'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/',
  authenticate,
  authorize(PERMISSIONS.PERMISSIONS_MANAGE),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const permissions = await permissionRepository.findAll();
      res.json({ permissions });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/permissions:
 *   post:
 *     tags: [Permissions]
 *     summary: Create a new permission
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePermissionBody'
 *     responses:
 *       201:
 *         description: Permission created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permission:
 *                   $ref: '#/components/schemas/Permission'
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
  authorize(PERMISSIONS.PERMISSIONS_MANAGE),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToInstance(CreatePermissionDto, req.body as object);
      try {
        await validateOrReject(dto);
      } catch (errs) {
        throw toValidationError(errs as ValidationError[]);
      }
      const permission = await rbacService.createPermission(dto);
      res.status(201).json({ permission });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
