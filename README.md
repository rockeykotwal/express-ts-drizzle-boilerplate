# if everything is ready and you are confident:
npm run dev

# Express TypeScript Drizzle Boilerplate

A production-ready REST API template built for AWS ECS/Fargate. Batteries included: dependency injection, Redis caching, rate limiting, OpenTelemetry tracing, structured logging, Swagger docs, graceful shutdown, and a Docker multi-stage build — all wired together from the start so you ship features, not scaffolding.

---

## Table of Contents

- [Stack and Rationale](#stack-and-rationale)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [NPM Scripts](#npm-scripts)
- [Testing](#testing)
- [Docker](#docker)
- [API Reference](#api-reference)
- [Drizzle Migration Workflow](#drizzle-migration-workflow)
- [Redis Caching Strategy](#redis-caching-strategy)
- [Rate Limiting](#rate-limiting)
- [OpenTelemetry](#opentelemetry)
- [AWS ECS/Fargate Deployment](#aws-ecsfargate-deployment)
- [Contributing](#contributing)

---

## Stack and Rationale

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 | LTS, native `fetch`, improved startup performance |
| Language | TypeScript 5 | Strict mode, decorator support for DI |
| Framework | Express 4 | Minimal surface area, mature ecosystem, easy to extend |
| ORM | Drizzle ORM | SQL-first: you write real SQL shapes, no magic, migrations are plain files, zero runtime overhead |
| Database | PostgreSQL 16 | ACID transactions, UUID primary keys, strong typing alignment with Drizzle |
| DI Container | tsyringe | Lightweight, decorator-based, works with reflect-metadata — no framework lock-in |
| Cache | Redis 7 + ioredis | Read-through cache on hot resources; ioredis chosen over node-redis for cluster support and reconnect logic |
| Rate Limiting | express-rate-limit + rate-limit-redis | Distributed rate limiting that survives horizontal scaling on ECS |
| Observability | OpenTelemetry + Winston | OTLP exporter is vendor-neutral — send to X-Ray, Grafana Tempo, or Datadog without code changes |
| Container | Docker multi-stage | Builder stage compiles TypeScript; production stage carries only `dist/` and prod `node_modules`, cutting image size by ~60% |
| Orchestration | AWS ECS/Fargate | Serverless container execution, no EC2 fleet to manage, native ALB + Service Discovery integration |

**Why Drizzle over Prisma?**
Prisma generates a query engine binary and abstracts SQL behind a custom query language. Drizzle generates pure SQL at build time — no binary, no runtime overhead, no ORM-speak to learn. The schema is plain TypeScript, and migrations are `.sql` files you can inspect, squash, or run manually.

**Why tsyringe over NestJS?**
NestJS brings an entire opinionated framework. tsyringe is a single decorator layer on top of Express — you keep full control of the request lifecycle while still getting constructor injection, singleton registration, and token-based overrides for testing.

**Why ECS/Fargate over Lambda?**
Lambda cold starts compound under traffic spikes. Fargate runs always-on containers with consistent latency, and long-lived connections to PostgreSQL and Redis stay open across requests. The task definition file in this repo maps directly to a running service with no compilation step between code and deployment.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client / ALB                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│                     Express Application                      │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │ Helmet   │   │ CORS         │   │  Request Logger      │ │
│  │ (headers)│   │              │   │  (Winston + OTEL)    │ │
│  └──────────┘   └──────────────┘   └─────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              /health  (no rate limit)                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Default Rate Limiter — 100 req / 15 min per IP         ││
│  │                                                         ││
│  │  ┌──────────────────────────────────────────────────┐  ││
│  │  │              /api/users  (Router)                │  ││
│  │  │                                                  │  ││
│  │  │  UserController                                  │  ││
│  │  │    │  (tsyringe DI)                              │  ││
│  │  │    ▼                                             │  ││
│  │  │  UserService                                     │  ││
│  │  │    │  (business logic, 404/409 errors)           │  ││
│  │  │    ▼                                             │  ││
│  │  │  UserRepository     ◄──── Redis cache (60s TTL) │  ││
│  │  │    │  (Drizzle ORM)                              │  ││
│  │  │    ▼                                             │  ││
│  │  │  PostgreSQL                                      │  ││
│  │  └──────────────────────────────────────────────────┘  ││
│  │                                                         ││
│  │  POST /api/users  also applies:                         ││
│  │  Strict Rate Limiter — 10 req / 1 min per IP            ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌──────────────┐   ┌─────────────────────────────────────┐ │
│  │  404 handler │   │  Global error handler (AppError)    │ │
│  └──────────────┘   └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           │                              │
    ┌──────▼──────┐               ┌───────▼──────┐
    │ PostgreSQL  │               │    Redis     │
    │  (pg pool)  │               │  (ioredis)   │
    └─────────────┘               └──────────────┘
           │
    ┌──────▼──────────────────────┐
    │  OpenTelemetry Collector    │
    │  (OTLP → X-Ray / Tempo /   │
    │   Datadog)                  │
    └─────────────────────────────┘
```

**Request lifecycle:**

1. Helmet sets security headers; CORS applies origin policy.
2. `/health` is registered before any rate limiter — it is never blocked.
3. The global rate limiter (100/15 min) applies to all other routes.
4. `UserController` delegates to `UserService`, which enforces business rules (duplicate email → 409, missing record → 404).
5. `UserService` calls `UserRepository`, which checks Redis before hitting PostgreSQL on reads. Writes invalidate the cache for that key.
6. `errorHandler` catches every thrown `AppError` (or unhandled promise rejection caught by the `wrap` helper) and formats a consistent JSON error body with an optional OTEL trace ID.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x | Use [nvm](https://github.com/nvm-sh/nvm): `nvm use 22` |
| npm | 10.x | Bundled with Node 22 |
| Docker | 24+ | Required for containerised local dev |
| Docker Compose | v2 (plugin) | Bundled with Docker Desktop |
| PostgreSQL | 16 | Only needed for native local dev (skip if using Compose) |
| Redis | 7 | Only needed for native local dev (skip if using Compose) |
| AWS CLI | v2 | Required for ECR and ECS deployment |

---

## Local Setup

### Option A — Docker Compose (recommended)

Compose starts the app, PostgreSQL, and Redis in one command with health-check ordering:

```bash
# 1. Clone the repo
git clone https://github.com/your-org/express-ts-drizzle-boilerplate.git
cd express-ts-drizzle-boilerplate

# 2. Create your env file
cp .env.example .env
# Edit .env — the Compose file overrides DB_HOST and REDIS_URL automatically

# 3. Start everything
docker compose up --build

# App is live at http://localhost:3000
# Swagger UI at  http://localhost:3000/docs
# Health check   http://localhost:3000/health
```

To run in the background:

```bash
docker compose up --build -d
docker compose logs -f app   # stream app logs
docker compose down          # stop and remove containers (data volumes persist)
docker compose down -v       # also remove volumes (wipes DB data)
```

### Option B — Native (no Docker)

Requires PostgreSQL and Redis running locally.

```bash
# 1. Install dependencies
npm install

# 2. Create env file
cp .env.example .env
# Fill in DB_HOST, DB_NAME, DB_USER, DB_PASS, REDIS_URL

# 3. Push the schema to your database (development shortcut — no migration files)
npm run db:push

# 4. Start the dev server with live reload
npm run dev
```

### .env.example

Create this file at the project root if it does not exist:

```dotenv
NODE_ENV=development
APP_PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=postgres
DB_PASS=postgres
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# OpenTelemetry (optional in development)
OTEL_SERVICE_NAME=express-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` disables stack traces in error responses and switches to JSON log format |
| `APP_PORT` | No | `3000` | Port the HTTP server binds to |
| `DB_HOST` | **Yes** | — | PostgreSQL hostname |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | **Yes** | — | Database name |
| `DB_USER` | **Yes** | — | Database user |
| `DB_PASS` | **Yes** | — | Database password — inject via Secrets Manager in production |
| `DB_POOL_MIN` | No | `2` | Minimum pool connections |
| `DB_POOL_MAX` | No | `10` | Maximum pool connections |
| `REDIS_URL` | **Yes** | — | Full Redis connection URL, e.g. `redis://host:6379` |
| `OTEL_SERVICE_NAME` | No | `express-app` | Service name tag on all traces and spans |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | `http://localhost:4318` | OTLP HTTP collector endpoint |

---

## NPM Scripts

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `tsx watch src/app.ts` | Starts the server with live reload via `tsx`. No build step needed. TypeScript is executed directly. |
| `npm run build` | `tsc` | Compiles TypeScript to `dist/`. Uses `tsconfig.json`; output is CommonJS. |
| `npm start` | `node dist/app.js` | Runs the compiled production build. Run `npm run build` first. |
| `npm run lint` | `eslint .` | Lints all `.ts` files using the project ESLint config. |
| `npm test` | `vitest run` | Runs the full test suite once and exits. |
| `npm run test:coverage` | `vitest run --coverage` | Runs tests and generates a v8 coverage report in `coverage/`. |
| `npm run db:generate` | `drizzle-kit generate` | Compares your schema files against existing migrations and generates a new `.sql` migration file in `src/database/migrations/`. Run this after changing a schema. |
| `npm run db:migrate` | `drizzle-kit migrate` | Applies all pending migration files to the database. Use in CI/CD and production. |
| `npm run db:push` | `drizzle-kit push` | Directly syncs the schema to the database without creating migration files. Fast for development; **do not use in production**. |
| `npm run db:studio` | `drizzle-kit studio` | Opens Drizzle Studio — a browser-based database GUI at `https://local.drizzle.studio`. |

---

## Testing

> **Note:** The test suite has not been implemented yet and will be added in a future iteration.

The following test structure is planned:

```
tests/
  unit/
    UserService.test.ts       # Service logic with mocked repository and Redis
    rateLimiter.test.ts       # 429 behaviour with mocked Redis store
  integration/
    UserController.test.ts    # Full CRUD flow via supertest + in-memory SQLite
    health.test.ts            # Health endpoint + rate-limit exemption
```

**Planned tooling:**
- [Vitest](https://vitest.dev/) — test runner and assertion library
- [supertest](https://github.com/ladjs/supertest) — HTTP integration testing
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — in-memory database for integration tests
- `@vitest/coverage-v8` — v8-based coverage reports

**Planned coverage targets:** `src/**` (statements, branches, functions, lines).

Once implemented, run tests with:

```bash
npm test                 # run all tests once
npm run test:coverage    # run with coverage report
```

---

## Docker

### Build the image

```bash
docker build -t express-app:latest .
```

The Dockerfile uses two stages:

- **builder** — installs all dependencies (including devDependencies) and runs `tsc`.
- **production** — starts from a clean `node:22-alpine`, installs only production dependencies, copies only `dist/`, runs as a non-root user (`appuser:appgroup`), and uses `dumb-init` as PID 1 so `SIGTERM` is forwarded correctly to Node for graceful shutdown.

### Run the image locally

```bash
docker run --rm \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_NAME=myapp \
  -e DB_USER=postgres \
  -e DB_PASS=postgres \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  express-app:latest
```

### Docker Compose reference

```bash
docker compose up --build          # build and start all services
docker compose up --build -d       # detached mode
docker compose logs -f app         # tail app logs
docker compose exec app sh         # open shell in running app container
docker compose restart app         # restart only the app (keeps DB/Redis running)
docker compose down                # stop and remove containers
docker compose down -v             # also wipe volumes
```

Services defined in `docker-compose.yml`:

| Service | Image | Port | Notes |
|---|---|---|---|
| `app` | Built from `Dockerfile` | `3000` | Depends on postgres and redis health checks |
| `postgres` | `postgres:16-alpine` | `5432` | Data persisted in `pgdata` volume |
| `redis` | `redis:7-alpine` | `6379` | AOF persistence enabled; data in `redisdata` volume |

---

## API Reference

Base URL: `http://localhost:3000`

### System

| Method | Path | Description | Rate Limited |
|---|---|---|---|
| `GET` | `/health` | Returns `{ status, uptime, timestamp }`. Never rate-limited. Used for load balancer and ECS health checks. | No |
| `GET` | `/docs` | Swagger UI — interactive API documentation auto-generated from JSDoc in the controller. | No |

### Users — `/api/users`

All responses are `application/json`. Error responses follow `{ status: "error", message: string, traceId?: string }`.

| Method | Path | Description | Rate Limited | Success |
|---|---|---|---|---|
| `GET` | `/api/users` | Returns an array of all users. | 100/15 min | `200 []User` |
| `GET` | `/api/users/:id` | Returns a single user by UUID. Response is served from Redis cache (60 s TTL) when available. | 100/15 min | `200 User` |
| `POST` | `/api/users` | Creates a user. Validates `firstName`, `lastName`, `email`. Returns 409 if email already exists. | **10/1 min** (strict) | `201 User` |
| `PUT` | `/api/users/:id` | Partially updates a user. All fields optional. Invalidates the Redis cache entry for that ID. | 100/15 min | `200 User` |
| `DELETE` | `/api/users/:id` | Deletes a user and removes its cache entry. | 100/15 min | `204 (no body)` |

**User object shape:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Example requests:**

```bash
# Create
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Jane","lastName":"Doe","email":"jane@example.com"}'

# List
curl http://localhost:3000/api/users

# Get by ID
curl http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440000

# Update
curl -X PUT http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Janet"}'

# Delete
curl -X DELETE http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440000
```

---

## Drizzle Migration Workflow

### Day-to-day development

```bash
# Iterate quickly — push schema changes directly to the database (no migration files)
npm run db:push

# Browse your data
npm run db:studio
```

### Production-safe workflow

```bash
# 1. Edit your schema in src/api/models/*.ts
#    Example: add a new column to usersTable

# 2. Generate a migration file
npm run db:generate
# Drizzle creates a timestamped .sql file in src/database/migrations/
# Review it before committing

# 3. Apply migrations
npm run db:migrate
# Runs all pending .sql files in order, records applied migrations in
# the __drizzle_migrations table
```

### Adding a new table

1. Create `src/api/models/your-entity.schema.ts` using `pgTable`.
2. Export `InferSelectModel` and `InferInsertModel` types.
3. Create a repository in `src/api/repositories/`.
4. Create a service in `src/api/services/`.
5. Create a controller in `src/api/controllers/` and register its router in `src/loaders/expressLoader.ts`.
6. Run `npm run db:generate` → `npm run db:migrate`.

The `drizzle.config.ts` picks up all files matching `./src/api/models/*` automatically.

### Schema snapshot (`db:push` vs `db:migrate`)

| | `db:push` | `db:migrate` |
|---|---|---|
| Creates migration files | No | Yes |
| Safe for production | **No** — destructive changes happen immediately | Yes — diff-based, reversible |
| Use case | Local dev iteration | CI/CD, staging, production |

---

## Redis Caching Strategy

The cache layer is in `src/cache/redis.ts` and used directly by `UserRepository`.

**Pattern: read-through, write-invalidate**

- `GET /api/users/:id` → `UserRepository.findById`:
  1. Check Redis for key `user:{id}`.
  2. Cache hit → return immediately, skip database.
  3. Cache miss → query PostgreSQL, write result to Redis with a 60-second TTL.
- `PUT /api/users/:id` → `UserRepository.update`: deletes `user:{id}` before writing to PostgreSQL.
- `DELETE /api/users/:id` → `UserRepository.delete`: deletes `user:{id}` before the database delete.

**Why 60 seconds?**
Long enough to absorb read spikes (e.g. a dashboard polling the same user), short enough that stale data never persists beyond a minute. Adjust `CACHE_TTL` in `UserRepository` per entity based on how frequently your data changes.

**`GET /api/users` (list) is not cached** intentionally — list results change on every write and the cache invalidation logic would require tracking all keys. Cache the list only if your access pattern justifies it, and invalidate on every create/update/delete.

### Extending the cache

```typescript
import { getCache, setCache, deleteCache } from '../../cache/redis';

// Read
const data = await getCache<MyType>('my-prefix:id');

// Write with TTL (seconds)
await setCache('my-prefix:id', data, 300);

// Invalidate
await deleteCache('my-prefix:id');
```

### Redis connection behaviour

- `lazyConnect: true` — the client does not connect at construction time. `redisLoader` calls `connect()` explicitly at startup, ensuring a fast fail on misconfiguration before any traffic is served.
- `maxRetriesPerRequest: 3` — failed commands retry up to 3 times before rejecting.
- Connection errors are logged but do not crash the process. If Redis becomes unavailable mid-flight, cache misses fall through to the database.

---

## Rate Limiting

Two limiters are exported from `src/api/middlewares/rateLimiter.ts`:

| Limiter | Max requests | Window | Applied to | Store |
|---|---|---|---|---|
| `defaultRateLimiter` | 100 | 15 minutes | All routes except `/health` | Redis |
| `strictRateLimiter` | 10 | 1 minute | `POST /api/users` | Redis |

Both use `rate-limit-redis` backed by the same ioredis client, so limits are shared across all ECS task instances (distributed enforcement).

The `/health` route is **always exempt** via the `skip` option:

```typescript
skip: (req) => req.path === '/health',
```

This prevents load balancer health checks from consuming quota.

### Adjusting limits

Open `src/api/middlewares/rateLimiter.ts` and edit `windowMs` and `max`. Then redeploy — no infrastructure changes needed.

### Response when limited

```json
HTTP 429 Too Many Requests
Retry-After: 47

{
  "status": "error",
  "message": "Too many requests. Please slow down and try again later.",
  "retryAfter": "47"
}
```

Standard `RateLimit-*` headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) are included in every response.

### Adding rate limiting to a new route

```typescript
import { strictRateLimiter } from '../middlewares/rateLimiter';

// In a controller's router():
r.post('/sensitive-action', strictRateLimiter, wrap(this.sensitiveAction.bind(this)));
```

---

## OpenTelemetry

The SDK is initialised in `src/observability/tracing.ts` before any instrumented I/O runs. It automatically instruments:

- **HTTP** (`@opentelemetry/instrumentation-http`) — traces every inbound Express request.
- **Express** (`@opentelemetry/instrumentation-express`) — adds route-level spans.
- **pg** (`@opentelemetry/instrumentation-pg`) — traces every database query.

All spans are exported via OTLP HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`.

### Connect to AWS X-Ray

Deploy the [AWS Distro for OpenTelemetry (ADOT) Collector](https://aws-otel.github.io/) as a sidecar in your ECS task definition. Set:

```json
{ "name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://localhost:4318" }
```

The ADOT sidecar receives OTLP and forwards to X-Ray. Add a second container to `task-definition.json`:

```json
{
  "name": "aws-otel-collector",
  "image": "public.ecr.aws/aws-observability/aws-otel-collector:latest",
  "command": ["--config=/etc/ecs/ecs-default-config.yaml"],
  "essential": false
}
```

Ensure `ecsTaskRole` has `xray:PutTraceSegments` and `xray:PutTelemetryRecords` permissions.

### Connect to Grafana Tempo

Point `OTEL_EXPORTER_OTLP_ENDPOINT` to your Tempo instance:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo.internal:4318
```

No code changes required.

### Trace correlation in logs

Winston logs include `trace_id` and `span_id` on every log line when a span is active:

```json
{
  "level": "http",
  "message": "HTTP request",
  "method": "GET",
  "url": "/api/users/123",
  "status": 200,
  "duration_ms": 12,
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

Use this `trace_id` to correlate log lines with spans in your tracing backend.

---

## AWS ECS/Fargate Deployment

### IAM setup

You need two IAM roles:

- **`ecsTaskExecutionRole`** — allows ECS to pull the image from ECR and write logs to CloudWatch. Attach the managed policy `AmazonECSTaskExecutionRolePolicy`, plus `secretsmanager:GetSecretValue` if you use Secrets Manager.
- **`ecsTaskRole`** — the role your application code assumes at runtime. Add `xray:PutTraceSegments` if using X-Ray.

### 1. Authenticate Docker to ECR

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS \
    --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
```

### 2. Create the ECR repository (once)

```bash
aws ecr create-repository \
  --repository-name express-app \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true
```

### 3. Build and push

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
IMAGE_TAG=$(git rev-parse --short HEAD)
REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/express-app"

docker build -t "${REPO}:${IMAGE_TAG}" -t "${REPO}:latest" .
docker push "${REPO}:${IMAGE_TAG}"
docker push "${REPO}:latest"
```

### 4. Prepare task-definition.json

Replace every `{{...}}` placeholder in `task-definition.json`:

| Placeholder | Value |
|---|---|
| `{{ACCOUNT_ID}}` | Your 12-digit AWS account ID |
| `{{AWS_REGION}}` | e.g. `us-east-1` |
| `{{IMAGE_TAG}}` | Git SHA or `latest` |
| `{{DB_HOST}}` | RDS endpoint hostname |
| `{{DB_NAME}}` | Database name |
| `{{DB_USER}}` | Database user |
| `{{REDIS_URL}}` | ElastiCache Redis endpoint URL |
| `{{OTEL_ENDPOINT}}` | ADOT sidecar or Tempo endpoint |
| `{{SECRET_NAME}}` | Secrets Manager secret name containing `DB_PASS` |
| `{{ENVIRONMENT}}` | e.g. `production` |

Use `envsubst` to substitute from environment:

```bash
export ACCOUNT_ID REGION IMAGE_TAG DB_HOST DB_NAME DB_USER REDIS_URL SECRET_NAME ENVIRONMENT
envsubst < task-definition.json > task-definition-resolved.json
```

### 5. Store secrets in AWS Secrets Manager

`DB_PASS` is referenced as a secret in the task definition — ECS injects it as an environment variable at task startup. No plaintext secrets in the task definition JSON.

```bash
aws secretsmanager create-secret \
  --name myapp/production \
  --secret-string '{"DB_PASS":"super-secure-password"}'
```

### 6. Register the task definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://task-definition-resolved.json \
  --region us-east-1
```

### 7. Deploy to ECS service

```bash
aws ecs update-service \
  --cluster my-cluster \
  --service express-app \
  --task-definition express-app \
  --force-new-deployment \
  --region us-east-1
```

ECS performs a rolling deployment by default: new tasks start and pass the `/health` check before old tasks are drained.

### 8. Run database migrations in ECS

Use a one-off ECS task to apply migrations before the new service version becomes live:

```bash
aws ecs run-task \
  --cluster my-cluster \
  --task-definition express-app \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"app","command":["npx","drizzle-kit","migrate"]}]}' \
  --region us-east-1
```

### CI/CD skeleton (GitHub Actions)

```yaml
- name: Build and push to ECR
  run: |
    IMAGE_TAG=${{ github.sha }}
    docker build -t $ECR_REPO:$IMAGE_TAG .
    docker push $ECR_REPO:$IMAGE_TAG

- name: Run migrations
  run: |
    aws ecs run-task --overrides '...' ...

- name: Deploy
  run: |
    aws ecs update-service --force-new-deployment ...
```

---

## Contributing

### Getting started

```bash
git clone https://github.com/your-org/express-ts-drizzle-boilerplate.git
cd express-ts-drizzle-boilerplate
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:push
npm run dev
```

### Branch strategy

- `main` — always deployable.
- Feature branches: `feat/description`, bug fixes: `fix/description`.
- Open a pull request against `main`. Squash-merge after approval.

### Code style

- Strict TypeScript: no `any` without an explanatory comment.
- No inline comments explaining _what_ the code does — only _why_ when non-obvious.
- Keep controllers thin: validation + delegation only.
- Business rules belong in services. Database access belongs in repositories.

### Adding a new resource

1. Schema → `src/api/models/your-entity.schema.ts`
2. Repository → `src/api/repositories/YourEntityRepository.ts`
3. Service → `src/api/services/YourEntityService.ts`
4. Controller → `src/api/controllers/YourEntityController.ts` (register in `expressLoader.ts`)
5. Tests → `tests/unit/YourEntityService.test.ts` + `tests/integration/YourEntityController.test.ts`
6. Migration → `npm run db:generate` then commit the generated `.sql` file

### Running tests

```bash
npm test                  # run once
npm run test:coverage     # generate coverage report
```

### Linting

```bash
npm run lint              # check
npm run lint -- --fix     # auto-fix
```

### Submitting changes

1. Ensure `npm test` and `npm run lint` pass cleanly.
2. Ensure `npm run build` produces no TypeScript errors.
3. Include or update tests for any behaviour change.
4. Update this README if you add environment variables, endpoints, or scripts.
