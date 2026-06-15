import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { ActorType } from "@prisma/client";

import type {
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "../dto/auth.dto";
import type {
  AuthRepository,
  CreateRefreshSessionInput,
  RefreshSessionRecord,
} from "../../persistence/repository/AuthRepository";
import { toPublicUser } from "../../persistence/mappers/AuthMapper";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/AppError";
import type {
  AuthResult,
  AuthTokens,
  PublicUser,
  RequestContext,
} from "../../shared/types/auth";
import type { PasswordService } from "./PasswordService";
import type { TokenService } from "./TokenService";

export interface AuthServiceConfig {
  dummyHash: string;
  accessExpiry: string;
  refreshExpiry: string;
}

export interface AuthServiceContract {
  register(input: RegisterInput, context: RequestContext): Promise<AuthResult>;
  login(input: LoginInput, context: RequestContext): Promise<AuthResult>;
  refresh(input: RefreshInput, context: RequestContext): Promise<AuthResult>;
  logout(input: LogoutInput, context: RequestContext): Promise<void>;
  getCurrentUser(userId: string): Promise<PublicUser>;
}

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const tokenHashesMatch = (first: string, second: string): boolean => {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
};

export class AuthService implements AuthServiceContract {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly settings: AuthServiceConfig,
  ) {}

  async register(input: RegisterInput, context: RequestContext): Promise<AuthResult> {
    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.repository.createAccountantUser({
      ...input,
      passwordHash,
    });
    const tokens = await this.createSession(user.id, context, user);

    await this.repository.createAuditEvent({
      actorId: user.id,
      actorType: ActorType.ACCOUNTANT,
      action: "auth.registered",
      metadata: { role: "ACCOUNTANT" },
      context,
    });

    return { user: toPublicUser(user), tokens };
  }

  async login(input: LoginInput, context: RequestContext): Promise<AuthResult> {
    const user = await this.repository.findUserByIdentifier(input.identifier);
    const validPassword = await this.passwordService.verify(
      input.password,
      user?.passwordHash ?? this.settings.dummyHash,
    );

    if (!user || !validPassword) {
      throw new UnauthorizedError("Invalid username/email or password", "INVALID_CREDENTIALS");
    }
    if (!user.isActive) {
      throw new ForbiddenError("This account is inactive", "ACCOUNT_INACTIVE");
    }

    const tokens = await this.createSession(user.id, context, user);
    await Promise.all([
      this.repository.updateLastLogin(user.id, new Date()),
      this.repository.createAuditEvent({
        actorId: user.id,
        actorType: this.actorType(user),
        action: "auth.logged_in",
        context,
      }),
    ]);

    return { user: toPublicUser(user), tokens };
  }

  async refresh(input: RefreshInput, context: RequestContext): Promise<AuthResult> {
    const payload = this.tokenService.verifyRefreshToken(input.refreshToken);
    const session = await this.repository.findRefreshSessionById(payload.sessionId);
    const presentedHash = hashToken(input.refreshToken);

    if (
      !session ||
      session.userId !== payload.sub ||
      session.familyId !== payload.familyId ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedError("Refresh session is no longer valid", "INVALID_REFRESH_SESSION");
    }

    if (!tokenHashesMatch(session.tokenHash, presentedHash)) {
      await this.repository.revokeRefreshFamily(session.familyId);
      throw new UnauthorizedError("Refresh token reuse detected", "REFRESH_TOKEN_REUSED");
    }
    if (session.revokedAt !== null) {
      await this.repository.revokeRefreshFamily(session.familyId);
      throw new UnauthorizedError("Refresh token reuse detected", "REFRESH_TOKEN_REUSED");
    }
    if (!session.user.isActive) {
      await this.repository.revokeRefreshFamily(session.familyId);
      throw new ForbiddenError("This account is inactive", "ACCOUNT_INACTIVE");
    }

    const nextSessionId = randomUUID();
    const issuedRefresh = this.tokenService.signRefreshToken(
      session.userId,
      nextSessionId,
      session.familyId,
    );
    const nextSession = this.sessionInput(
      nextSessionId,
      session.userId,
      session.familyId,
      issuedRefresh.token,
      issuedRefresh.expiresAt,
      context,
    );

    await this.repository.rotateRefreshSession(session.id, nextSession);
    await this.repository.createAuditEvent({
      actorId: session.userId,
      actorType: this.actorType(session.user),
      action: "auth.token_refreshed",
      context,
    });

    return {
      user: toPublicUser(session.user),
      tokens: {
        accessToken: this.tokenService.signAccessToken(session.user),
        refreshToken: issuedRefresh.token,
        accessTokenExpiresIn: this.settings.accessExpiry,
        refreshTokenExpiresIn: this.settings.refreshExpiry,
      },
    };
  }

  async logout(input: LogoutInput, context: RequestContext): Promise<void> {
    const payload = this.tokenService.verifyRefreshToken(input.refreshToken);
    const session = await this.repository.findRefreshSessionById(payload.sessionId);

    if (!session) {
      return;
    }

    const presentedHash = hashToken(input.refreshToken);
    if (!tokenHashesMatch(session.tokenHash, presentedHash)) {
      await this.repository.revokeRefreshFamily(session.familyId);
      throw new UnauthorizedError("Refresh token reuse detected", "REFRESH_TOKEN_REUSED");
    }

    await Promise.all([
      this.repository.revokeRefreshSession(session.id),
      this.repository.createAuditEvent({
        actorId: session.userId,
        actorType: this.actorType(session.user),
        action: "auth.logged_out",
        context,
      }),
    ]);
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("User is no longer available", "USER_NOT_AVAILABLE");
    }
    return toPublicUser(user);
  }

  private async createSession(
    userId: string,
    context: RequestContext,
    user: RefreshSessionRecord["user"],
  ): Promise<AuthTokens> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const issuedRefresh = this.tokenService.signRefreshToken(userId, sessionId, familyId);

    await this.repository.createRefreshSession(
      this.sessionInput(
        sessionId,
        userId,
        familyId,
        issuedRefresh.token,
        issuedRefresh.expiresAt,
        context,
      ),
    );

    return {
      accessToken: this.tokenService.signAccessToken(user),
      refreshToken: issuedRefresh.token,
      accessTokenExpiresIn: this.settings.accessExpiry,
      refreshTokenExpiresIn: this.settings.refreshExpiry,
    };
  }

  private sessionInput(
    id: string,
    userId: string,
    familyId: string,
    token: string,
    expiresAt: Date,
    context: RequestContext,
  ): CreateRefreshSessionInput {
    return {
      id,
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt,
      context,
    };
  }

  private actorType(user: RefreshSessionRecord["user"]): ActorType {
    return user.businessOwnerProfile ? ActorType.BUSINESS_OWNER : ActorType.ACCOUNTANT;
  }
}
