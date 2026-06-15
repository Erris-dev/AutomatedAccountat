import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    name: "Automated Kosovo Accounting API",
    status: "running",
  }));

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async (_request, reply) => {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      app.log.warn({ error }, "Database readiness check failed");
    }

    try {
      checks.redis = (await app.redis.ping()) === "PONG";
    } catch (error) {
      app.log.warn({ error }, "Redis readiness check failed");
    }

    const ready = checks.database && checks.redis;

    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      checks,
    });
  });
};

export default healthRoutes;
