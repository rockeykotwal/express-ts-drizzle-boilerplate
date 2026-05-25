import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { container } from '../container';
import { UserController } from '../api/controllers/UserController';
import { UserService } from '../api/services/UserService';
import authRouter from '../api/controllers/AuthController';
import { authenticate } from '../api/middlewares/authenticate';
import { config } from '../config';
import { requestLogger } from '../api/middlewares/requestLogger';
import { defaultRateLimiter } from '../api/middlewares/rateLimiter';
import { notFound } from '../api/middlewares/notFound';
import { errorHandler } from '../api/middlewares/errorHandler';

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

  // ── Security headers & CORS ────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors());

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

  // ── Protect all /api/users routes except POST /api/users ──────────────────
  app.use('/api/users', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST') return next();
    authenticate(req, res, next);
  });

  // ── User CRUD routes ───────────────────────────────────────────────────────
  const userController = container.resolve(UserController);
  app.use('/api/users', userController.router());

  // ── Global rate limiting (skips /health via `skip` option) ─────────────────
  app.use(defaultRateLimiter);

  // ── 404 & global error handler — always last ───────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
