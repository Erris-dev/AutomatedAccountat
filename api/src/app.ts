import autoload from "@fastify/autoload";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import path from "node:path";

import type { AuthServiceContract } from "./business/services/AuthService";
import { config } from "./config/env";
import { disconnectPrisma, prisma } from "./database/PrismaConfig";
import { disconnectRedis, redis } from "./database/RedisConfig";
import { AppError } from "./shared/errors/AppError";
import authenticationPlugin from "./presentation/plugins/authentication";

export interface BuildAppOptions {
  authService?: AuthServiceContract;
  closeResources?: boolean;
  routePlugins?: FastifyPluginAsync[];
}

export const buildApp = (options: BuildAppOptions = {}): FastifyInstance => {
  const app = Fastify({
    logger: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  app.register(cookie);

  app.register(jwt, {
    secret: config.jwt.accessSecret,
  });

  app.register(multipart, {
    limits: {
      files: 50,
      fileSize: 25 * 1024 * 1024,
    },
  });

  app.decorate("prisma", prisma);
  app.decorate("redis", redis);

  app.register(authenticationPlugin, {
    authService: options.authService,
  });

  if (options.routePlugins) {
    for (const routePlugin of options.routePlugins) {
      app.register(routePlugin);
    }
  } else {
    app.register(autoload, {
      dir: path.join(__dirname, "presentation/routes"),
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        issues: error.validation,
      });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  });

  app.addHook("onClose", async () => {
    if (options.closeResources !== false) {
      await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
    }
  });

  return app;
};
