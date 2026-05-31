# Express TypeScript Drizzle Boilerplate

Production-ready REST API targeting AWS ECS/Fargate. Node ≥ 22 required.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript 5 |
| Framework | Express 4 |
| ORM | Drizzle ORM (node-postgres) |
| Database | PostgreSQL |
| Cache | Redis (ioredis) |
| DI Container | tsyringe |
| Auth | JWT via `jose`, argon2 password hashing |
| Validation | class-validator + class-transformer |
| Observability | Winston logger + OpenTelemetry (traces, metrics) |
| API Docs | Swagger via JSDoc `@openapi` annotations |
| Testing | Vitest |

## Architecture: 3-Layer Pattern

Every feature follows: **Controller → Service → Repository**

- **Controller** (`*Controller.ts`) — Express Router, DTO validation via `plainToInstance` + `validateOrReject`, calls service, passes errors to `next(err)`.
- **Service** (`*Service.ts`) — Business logic only. Throws `AppError` for domain errors.
- **Repository** (`*Repository.ts`) — Drizzle queries only. Handles Redis cache (read-through, write-invalidate pattern).

## Project Structure

```
src/
├── api/
│   ├── controllers/    # Express Routers (routes + OpenAPI JSDoc)
│   ├── middlewares/    # authenticate, authorize, errorHandler, rateLimiter, etc.
│   ├── models/         # Drizzle table schemas + inferred types
│   ├── repositories/   # Database access layer (Drizzle queries)
│   ├── services/       # Business logic
│   └── validators/     # DTO classes (class-validator decorators)
├── modules/
│   └── rbac/           # Self-contained RBAC module (same layered structure)
├── config/             # config object built from env vars at startup
├── database/           # Drizzle client + pg Pool
├── cache/              # Redis helpers (getCache, setCache, deleteCache)
├── errors/             # AppError class
├── loaders/            # App bootstrap (expressLoader, dbLoader, redisLoader)
├── observability/      # logger, metrics, tracing
└── container.ts        # tsyringe DI container + TOKENS
```

## Dependency Injection

tsyringe is used throughout. Rules:
- All services and repositories must have `@injectable()` decorator
- Import `'reflect-metadata'` at the top of every file that uses decorators
- Inject DB: `@inject(TOKENS.DrizzleDb) private readonly db: Db`
- Inject Redis: `@inject(TOKENS.RedisClient) private readonly redis: Redis`
- Resolve from container: `container.resolve(MyService)`
- TOKENS are defined in `src/container.ts`

## Authentication & Authorization Flow

```
Request
  → authenticate middleware   (reads Bearer token, sets res.locals.user = { userId, email })
  → authorize(PERMISSION)     (reads res.locals.user.userId, checks RBAC in DB)
  → Controller handler
```

- **CRITICAL**: `authorize()` must always come after `authenticate()` on the same route. Applying `authorize()` without `authenticate()` will always 401.
- Access tokens: short-lived JWT (15m default), signed with `jose` HS256
- Refresh tokens: 7-day JWT, stored in Redis at key `refresh_token:{userId}`, also set as httpOnly cookie
- Password hashing: argon2

## Error Handling

Always throw `AppError`, never plain `Error`:

```ts
throw new AppError('Email already in use', 409);          // operational
throw new AppError('Config invalid', 500, false);          // non-operational (crash)
```

`AppError(message, statusCode, isOperational = true)` — the global `errorHandler` middleware catches all errors passed to `next(err)`.

## Drizzle ORM Rules

- Never write raw SQL — always use Drizzle query builder
- Schemas live in `src/api/models/*.schema.ts` and `src/modules/*/models/*.schema.ts`
- Schema pattern: `pgTable` with `uuid().primaryKey().defaultRandom()`, `timestamp` for `createdAt`/`updatedAt`
- Always export `InferSelectModel` as `TypeName` and `InferInsertModel` as `NewTypeName`
- Run `npm run db:generate` after changing a schema, then `npm run db:migrate` to apply

## Redis Cache Pattern

Used in repositories for read-through caching:

```ts
const cached = await getCache<User>(`user:${id}`);
if (cached) return cached;
// ... db query ...
await setCache(`user:${id}`, result, 60);  // TTL in seconds
// On update/delete:
await deleteCache(`user:${id}`);
```

Cache key convention: `{entity}:{id}` (e.g. `user:abc123`, `refresh_token:abc123`)

## Validation (DTOs)

```ts
// In controller:
const dto = plainToInstance(SignupDto, req.body as object);
try {
  await validateOrReject(dto);
} catch (errs) {
  throw toValidationError(errs as ValidationError[]);
}
```

DTOs are classes in `src/api/validators/` using class-validator decorators (`@IsEmail`, `@IsString`, `@MinLength`, etc.)

## RBAC Module

Self-contained feature module at `src/modules/rbac/` with its own controllers, services, repositories, models, validators, and seeds. Registered via `registerRbac(app)` in `expressLoader`.

- Tables: `roles`, `permissions`, `role_permissions`, `user_roles`
- All routes protected: `authenticate` + `authorize(PERMISSIONS.XXX)`
- Seed roles/permissions: `npm run db:seed:rbac`
- Available permission constants exported from `src/modules/rbac` as `PERMISSIONS`

## Express Middleware Order (do not change)

1. CORS + preflight
2. Helmet (security headers)
3. Body parsing + cookie-parser
4. Request logger
5. `/health` route (before rate limiter — never rate-limited)
6. Swagger UI at `/docs`
7. Auth routes at `/api/auth` (public)
8. Protected routes with `authenticate` + `authorize`
9. RBAC module routes
10. Global rate limiter
11. 404 handler
12. Global error handler (always last)

## Adding a New Module

Follow this exact file structure (same as RBAC module):

```
src/modules/<name>/
├── controllers/<Name>Controller.ts   # Express Router + OpenAPI JSDoc
├── services/<Name>Service.ts         # @injectable() business logic
├── repositories/<Name>Repository.ts  # @injectable() Drizzle queries
├── models/<name>.schema.ts           # pgTable schema + type exports
├── validators/<Action><Name>Dto.ts   # class-validator DTOs
└── index.ts                          # register routes + re-export
```

Register the module in `src/loaders/expressLoader.ts` via `registerXxx(app)`.

## Swagger Docs

OpenAPI annotations live as JSDoc comments directly in controller files. Swagger UI is served at `/docs`. When adding new endpoints, add `@openapi` JSDoc blocks following the existing pattern in `AuthController.ts`.

## Observability

- Logger: `import { logger } from './observability/logger'` — Winston, structured JSON in prod, colored in dev
- Traces auto-injected into log fields (`trace_id`, `span_id`) in production
- OTel exports to `OTEL_EXPORTER_OTLP_ENDPOINT` (default: `http://localhost:4318`)

## Environment Variables

All validated at startup in `src/config/index.ts`. App crashes immediately if required vars are missing.

Required: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `REDIS_URL`, `JWT_SECRET` (≥32 chars)
Optional with defaults: `APP_PORT=3000`, `NODE_ENV=development`, `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`

## npm Scripts

```
npm run dev              # ts-node watch (development)
npm run build            # tsc compile to dist/
npm run start            # run compiled dist/app.js
npm run lint             # ESLint
npm run test             # Vitest
npm run test:coverage    # Vitest with coverage
npm run db:generate      # Generate Drizzle migration from schema changes
npm run db:migrate       # Apply pending migrations
npm run db:push          # Push schema directly (dev only)
npm run db:studio        # Open Drizzle Studio
npm run db:seed:rbac     # Seed default roles and permissions
```

## Deployment

- Docker + docker-compose for local dev
- `task-definition.json` for AWS ECS/Fargate deployment
- Graceful shutdown handles SIGTERM/SIGINT: closes HTTP server → drains DB pool → closes Redis → shuts down OTel tracing

---

## Claude Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
