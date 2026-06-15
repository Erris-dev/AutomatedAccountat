import type { FastifyInstance } from "fastify";

import type {
  AccessTokenPayload,
  AuthenticatedUser,
  RefreshTokenPayload,
} from "../../shared/types/auth";
import { UnauthorizedError } from "../../shared/errors/AppError";

export interface TokenServiceConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiry: string;
  refreshExpiry: string;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface TokenService {
  signAccessToken(user: AuthenticatedUser): string;
  signRefreshToken(userId: string, sessionId: string, familyId: string): IssuedRefreshToken;
  verifyRefreshToken(token: string): RefreshTokenPayload;
}

export class JwtTokenService implements TokenService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly settings: TokenServiceConfig,
  ) {}

  signAccessToken(user: AuthenticatedUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      type: "access",
      roles: user.roles,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    };

    return this.app.jwt.sign(payload, {
      expiresIn: this.settings.accessExpiry,
      key: this.settings.accessSecret,
    });
  }

  signRefreshToken(userId: string, sessionId: string, familyId: string): IssuedRefreshToken {
    const token = this.app.jwt.sign(
      {
        sub: userId,
        type: "refresh",
        sessionId,
        familyId,
      },
      {
        expiresIn: this.settings.refreshExpiry,
        key: this.settings.refreshSecret,
      },
    );
    const payload = this.app.jwt.decode<RefreshTokenPayload>(token);

    if (!payload?.exp) {
      throw new Error("Refresh token expiration was not generated");
    }

    return {
      token,
      expiresAt: new Date(payload.exp * 1000),
    };
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = this.app.jwt.verify<RefreshTokenPayload>(token, {
        key: this.settings.refreshSecret,
      });

      if (payload.type !== "refresh" || !payload.sub || !payload.sessionId || !payload.familyId) {
        throw new UnauthorizedError("Invalid refresh token", "INVALID_REFRESH_TOKEN");
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
    }
  }
}
