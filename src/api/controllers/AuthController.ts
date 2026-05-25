import 'reflect-metadata';
import { Router, Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { container } from '../../container';
import { AuthService } from '../services/AuthService';
import { SignupDto } from '../validators/SignupDto';
import { LoginDto } from '../validators/LoginDto';
import { AppError } from '../../errors/AppError';
import { authenticate } from '../middlewares/authenticate';

// ── Shared OpenAPI component definitions ──────────────────────────────────────
/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     SafeUser:
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
 *     SignupBody:
 *       type: object
 *       required: [firstName, lastName, email, password]
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
 *         password:
 *           type: string
 *           minLength: 8
 *           example: s3cr3tPass!
 *     LoginBody:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: jane@example.com
 *         password:
 *           type: string
 *           example: s3cr3tPass!
 *     RefreshBody:
 *       type: object
 *       required: [refreshToken]
 *       properties:
 *         refreshToken:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiJ9...
 *     AuthTokensResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/SafeUser'
 *         accessToken:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiJ9...
 *         refreshToken:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiJ9...
 *     AccessTokenResponse:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *           example: eyJhbGciOiJIUzI1NiJ9...
 */

const authService = container.resolve(AuthService);

const router = Router();

function toValidationError(errors: ValidationError[]): AppError {
  const msg = errors
    .map((e) => Object.values(e.constraints ?? {}).join(', '))
    .join('; ');
  return new AppError(`Validation failed: ${msg}`, 400);
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupBody'
 *     responses:
 *       201:
 *         description: User created with tokens
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokensResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = plainToInstance(SignupDto, req.body as object);
    try {
      await validateOrReject(dto);
    } catch (errs) {
      throw toValidationError(errs as ValidationError[]);
    }
    const result = await authService.signup(dto);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate and receive tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *     responses:
 *       200:
 *         description: Authenticated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokensResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = plainToInstance(LoginDto, req.body as object);
    try {
      await validateOrReject(dto);
    } catch (errs) {
      throw toValidationError(errs as ValidationError[]);
    }
    const result = await authService.login(dto);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Obtain a new access token using a refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshBody'
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccessTokenResponse'
 *       400:
 *         description: refreshToken field missing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Refresh token invalid or revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ status: 400, message: 'refreshToken required' });
      return;
    }
    const result = await authService.refresh(refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the current refresh token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = res.locals.user as { userId: string };
    await authService.logout(userId);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
