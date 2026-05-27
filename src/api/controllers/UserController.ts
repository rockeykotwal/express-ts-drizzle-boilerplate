import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import * as argon2 from 'argon2';
import { UserService } from '../services/UserService';
import { CreateUserDto } from '../validators/CreateUserDto';
import { UpdateUserDto } from '../validators/UpdateUserDto';
import { strictRateLimiter } from '../middlewares/rateLimiter';
import { AppError } from '../../errors/AppError';

// ── Shared OpenAPI component definitions ──────────────────────────────────────
/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *         firstName:
 *           type: string
 *           example: Jane
 *         lastName:
 *           type: string
 *           example: Doe
 *         email:
 *           type: string
 *           format: email
 *           example: jane@example.com
 *         createdAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     CreateUserBody:
 *       type: object
 *       required: [firstName, lastName, email]
 *       properties:
 *         firstName:
 *           type: string
 *           example: Jane
 *         lastName:
 *           type: string
 *           example: Doe
 *         email:
 *           type: string
 *           format: email
 *           example: jane@example.com
 *     UpdateUserBody:
 *       type: object
 *       properties:
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: error
 *         message:
 *           type: string
 *           example: Something went wrong
 *         traceId:
 *           type: string
 *           nullable: true
 *   responses:
 *     BadRequest:
 *       description: Validation error
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     NotFound:
 *       description: Resource not found
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     Conflict:
 *       description: Resource already exists
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 *     InternalError:
 *       description: Internal server error
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ErrorResponse'
 */

// ── Async error boundary ──────────────────────────────────────────────────────
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const wrap =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

// ── Validation helper ─────────────────────────────────────────────────────────
function toValidationError(errors: ValidationError[]): AppError {
  const msg = errors
    .map((e) => Object.values(e.constraints ?? {}).join(', '))
    .join('; ');
  return new AppError(`Validation failed: ${msg}`, 400);
}

// ── Controller ────────────────────────────────────────────────────────────────
@injectable()
export class UserController {
  constructor(@inject(UserService) private readonly userService: UserService) {}

  router(): Router {
    const r = Router();

    r.get('/',      wrap(this.findAll.bind(this)));
    r.get('/:id',   wrap(this.findById.bind(this)));
    r.post('/',     strictRateLimiter, wrap(this.create.bind(this)));
    r.put('/:id',   wrap(this.update.bind(this)));
    r.delete('/:id', wrap(this.remove.bind(this)));

    return r;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  /**
   * @openapi
   * /api/users:
   *   get:
   *     tags: [Users]
   *     summary: List all users
   *     responses:
   *       200:
   *         description: Array of users
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/User'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  private async findAll(_req: Request, res: Response): Promise<void> {
    const users = await this.userService.findAll();
    res.json(users);
  }

  /**
   * @openapi
   * /api/users/{id}:
   *   get:
   *     tags: [Users]
   *     summary: Get a user by ID
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: User UUID
   *     responses:
   *       200:
   *         description: The user
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  private async findById(req: Request, res: Response): Promise<void> {
    const user = await this.userService.findById(req.params['id']!);
    res.json(user);
  }

  /**
   * @openapi
   * /api/users:
   *   post:
   *     tags: [Users]
   *     summary: Create a new user
   *     description: Rate-limited to 10 requests per minute per IP.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateUserBody'
   *     responses:
   *       201:
   *         description: User created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       409:
   *         $ref: '#/components/responses/Conflict'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  private async create(req: Request, res: Response): Promise<void> {
    const dto = plainToInstance(CreateUserDto, req.body as object);
    try {
      await validateOrReject(dto);
    } catch (errs) {
      throw toValidationError(errs as ValidationError[]);
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.userService.create({ ...dto, passwordHash });
    res.status(201).json(user);
  }

  /**
   * @openapi
   * /api/users/{id}:
   *   put:
   *     tags: [Users]
   *     summary: Update a user
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: User UUID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateUserBody'
   *     responses:
   *       200:
   *         description: Updated user
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  private async update(req: Request, res: Response): Promise<void> {
    const dto = plainToInstance(UpdateUserDto, req.body as object);
    try {
      await validateOrReject(dto, { skipMissingProperties: true });
    } catch (errs) {
      throw toValidationError(errs as ValidationError[]);
    }

    const user = await this.userService.update(req.params['id']!, dto);
    res.json(user);
  }

  /**
   * @openapi
   * /api/users/{id}:
   *   delete:
   *     tags: [Users]
   *     summary: Delete a user
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: User UUID
   *     responses:
   *       204:
   *         description: Deleted — no content
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       500:
   *         $ref: '#/components/responses/InternalError'
   */
  private async remove(req: Request, res: Response): Promise<void> {
    await this.userService.delete(req.params['id']!);
    res.status(204).send();
  }
}
