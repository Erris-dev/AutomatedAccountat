# Backend Plan

We are following a layered architecture using **Fastify**.

## Project Structure

```
business/
    - services (business logic)
    - dto

database/
    - prismaORM with postgres
    - redis for caching (ioredis)

persistence/
    - database repository functions
    - returns mapped domain objects (DTO mapping handled in services layer)

presentation/
    - controllers / route handlers
    - routes (registered via @fastify/autoload)
    - plugins / hooks (replaces "middleware" — onRequest, preHandler, etc.)

config/
    - env loading & validation

shared/
    - custom error classes
    - shared types / interfaces

app.ts   (building up the Fastify instance, registering plugins/routes)
server.ts (starting the server)
```

## Package Manager

pnpm

## Libraries

### Core
- fastify
- @prisma/client, prisma
- ioredis (or @fastify/redis)
- bcryptjs
- @fastify/jwt (or jsonwebtoken)

### Fastify Plugins
- @fastify/cors
- @fastify/cookie
- @fastify/env (env loading + schema validation)
- @fastify/autoload (auto-register routes/plugins)
- @fastify/swagger (optional — API docs from schemas)

### Validation
- zod (+ fastify-type-provider-zod) — optional alternative/companion to Fastify's built-in JSON schema validation

### Logging
- pino (built into Fastify by default — no extra setup needed)

### Dev / Testing
- typescript
- tsx (or ts-node)
- @types/node
- vitest
- fastify.inject() for endpoint testing (no supertest needed)

## Types to Install

- @types/jsonwebtoken (only if using raw jsonwebtoken instead of @fastify/jwt)
- @types/bcryptjs (only if your bcryptjs version doesn't bundle types)
- Most @fastify/* plugins ship their own types — no extra @types needed
- prisma / @prisma/client are natively typed

## Architectural Notes

- Controllers map to Fastify route handlers; "middleware" maps to Fastify hooks and plugins.
- Use the plugin/encapsulation model (fastify-plugin) to register database, persistence, and business layers as decorated instances on the Fastify object (fastify.decorate).
- Persistence layer should not return raw Prisma models directly to controllers — map to DTOs/domain types in the services layer to avoid leaking DB schema details (e.g., Decimal, Date quirks).
- Global error handling via fastify.setErrorHandler(), backed by a custom error class hierarchy in shared/.
- Env vars loaded and validated via @fastify/env (or dotenv + zod) — fail fast on missing/invalid config.
- Fastify schemas (JSON Schema or zod) double as request validation and OpenAPI doc generation when paired with @fastify/swagger.