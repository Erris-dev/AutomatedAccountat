import type { AuthServiceContract } from "../../business/services/AuthService";
import type { PrismaDatabaseClient } from "../../database/PrismaConfig";
import type { RedisDatabaseClient } from "../../database/RedisConfig";
import type { AccessTokenPayload, RefreshTokenPayload } from "./auth";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaDatabaseClient;
    redis: RedisDatabaseClient;
    authService: AuthServiceContract;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (permission: string) => preHandlerHookHandler;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload | RefreshTokenPayload;
    user: AccessTokenPayload;
  }
}
