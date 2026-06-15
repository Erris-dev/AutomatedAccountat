import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { AuthService, type AuthServiceContract } from "../../business/services/AuthService";
import { BcryptPasswordService } from "../../business/services/PasswordService";
import { JwtTokenService } from "../../business/services/TokenService";
import { config } from "../../config/env";
import { PrismaAuthRepository } from "../../persistence/repository/AuthRepository";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/AppError";
import type { AccessTokenPayload } from "../../shared/types/auth";

export interface AuthenticationPluginOptions {
  authService?: AuthServiceContract;
}

const authenticationPlugin: FastifyPluginAsync<AuthenticationPluginOptions> = async (app, options) => {
  const authService =
    options.authService ??
    new AuthService(
      new PrismaAuthRepository(app.prisma),
      new BcryptPasswordService(config.bcrypt.saltRounds),
      new JwtTokenService(app, {
        accessSecret: config.jwt.accessSecret,
        refreshSecret: config.jwt.refreshSecret,
        accessExpiry: config.jwt.accessExpiry,
        refreshExpiry: config.jwt.refreshExpiry,
      }),
      {
        dummyHash: config.security.dummyHash,
        accessExpiry: config.jwt.accessExpiry,
        refreshExpiry: config.jwt.refreshExpiry,
      },
    );

  app.decorate("authService", authService);

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      try {
        const payload = await request.jwtVerify<AccessTokenPayload>();
        if (payload.type !== "access") {
          throw new UnauthorizedError("An access token is required", "ACCESS_TOKEN_REQUIRED");
        }
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          throw error;
        }
        throw new UnauthorizedError("Invalid or expired access token", "INVALID_ACCESS_TOKEN");
      }
    },
  );

  app.decorate("authorize", (permission: string) => {
    return async (request: FastifyRequest): Promise<void> => {
      if (!request.user.permissions.includes(permission)) {
        throw new ForbiddenError("You do not have permission for this action", "MISSING_PERMISSION");
      }
    };
  });
};

export default fp(authenticationPlugin, {
  name: "authentication",
  dependencies: ["@fastify/jwt"],
});
