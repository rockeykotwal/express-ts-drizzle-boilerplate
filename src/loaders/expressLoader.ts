import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { container } from '../container';
import { UserController } from '../api/controllers/UserController';
import { UserService } from '../api/services/UserService';
import authRouter from '../api/controllers/AuthController';
import { authenticate } from '../api/middlewares/authenticate';
import { config } from '../config';
import { corsOptions } from '../config/cors.config';
import { requestLogger } from '../api/middlewares/requestLogger';
import { defaultRateLimiter } from '../api/middlewares/rateLimiter';
import { notFound } from '../api/middlewares/notFound';
import { errorHandler } from '../api/middlewares/errorHandler';
import { registerRbac, PERMISSIONS, authorize } from '../modules/rbac';

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Express TypeScript API',
      version:     '1.0.0',
      description: 'Production-ready REST API — Express + TypeScript + Drizzle ORM',
    },
    servers: [
      { url: `http://localhost:${config.app.port}`, description: 'Local development' },
    ],
    tags: [
      { name: 'Auth',  description: 'Authentication' },
      { name: 'Users', description: 'User management' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // swagger-jsdoc reads @openapi JSDoc blocks from these globs at runtime
  apis: [
    './src/api/controllers/*.ts',   // tsx dev
    './dist/api/controllers/*.js',  // compiled prod
  ],
} as swaggerJsdoc.Options);

export function expressLoader(): Application {
  const app = express();

  // ── CORS — must be first so preflight and credentialed requests are handled ─
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── Body & cookie parsing ──────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Health — registered BEFORE rate limiter so it is never rate-limited ────
  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Swagger UI ─────────────────────────────────────────────────────────────
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // ── Auth routes (public — no authentication required) ─────────────────────
  app.use('/api/auth', authRouter);

  // ── GET /api/users/me — must be before /:id to avoid route conflict ────────
  const userService = container.resolve(UserService);

  app.get(
    '/api/users/me',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { userId } = res.locals['user'] as { userId: string };
        const user = await userService.findById(userId);
        res.json({ user });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Per-route auth + authorization for /api/users ─────────────────────────
  app.get(   '/api/users',      authenticate, authorize(PERMISSIONS.USERS_READ));
  app.get(   '/api/users/:id',  authenticate, authorize(PERMISSIONS.USERS_READ));
  app.post(  '/api/users',      authenticate, authorize(PERMISSIONS.USERS_WRITE));
  app.put(   '/api/users/:id',  authenticate, authorize(PERMISSIONS.USERS_WRITE));
  app.delete('/api/users/:id',  authenticate, authorize(PERMISSIONS.USERS_DELETE));

  // ── User CRUD routes ───────────────────────────────────────────────────────
  const userController = container.resolve(UserController);
  app.use('/api/users', userController.router());

  // ── RBAC module (roles, permissions, user-role assignment) ────────────────
  registerRbac(app);

  // ── Global rate limiting (skips /health via `skip` option) ─────────────────
  app.use(defaultRateLimiter);

  // ── 404 & global error handler — always last ───────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
