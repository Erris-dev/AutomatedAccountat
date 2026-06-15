import { ActorType, Locale } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { AuthRepository, AuditInput, CreateAccountantUserInput, CreateRefreshSessionInput, RefreshSessionRecord } from "../../src/persistence/repository/AuthRepository";
import type { AuthenticatedUser } from "../../src/shared/types/auth";
import { UnauthorizedError } from "../../src/shared/errors/AppError";
import { AuthService } from "../../src/business/services/AuthService";
import type { PasswordService } from "../../src/business/services/PasswordService";
import type { IssuedRefreshToken, TokenService } from "../../src/business/services/TokenService";

const baseUser = (): AuthenticatedUser => ({
  id: "00000000-0000-4000-8000-000000000001",
  email: "accountant@example.com",
  username: "accountant",
  passwordHash: "hashed:Password1234",
  mustChangePassword: false,
  isActive: true,
  locale: Locale.SQ,
  roles: ["ACCOUNTANT"],
  permissions: ["business.create"],
  accountantProfile: { firstName: "Ada", lastName: "Lovelace" },
  businessOwnerProfile: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

class FakeRepository implements AuthRepository {
  user = baseUser();
  sessions = new Map<string, RefreshSessionRecord>();
  revokedFamilies: string[] = [];
  audits: AuditInput[] = [];

  async findUserByIdentifier(identifier: string): Promise<AuthenticatedUser | null> {
    return identifier === this.user.username || identifier === this.user.email ? this.user : null;
  }

  async findUserById(id: string): Promise<AuthenticatedUser | null> {
    return id === this.user.id ? this.user : null;
  }

  async createAccountantUser(input: CreateAccountantUserInput): Promise<AuthenticatedUser> {
    this.user = {
      ...baseUser(),
      email: input.email,
      username: input.username,
      passwordHash: input.passwordHash,
      locale: input.locale,
      accountantProfile: { firstName: input.firstName, lastName: input.lastName },
    };
    return this.user;
  }

  async updateLastLogin(): Promise<void> {}

  async createRefreshSession(input: CreateRefreshSessionInput): Promise<void> {
    this.sessions.set(input.id, {
      id: input.id,
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      user: this.user,
    });
  }

  async findRefreshSessionById(id: string): Promise<RefreshSessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async rotateRefreshSession(currentSessionId: string, input: CreateRefreshSessionInput): Promise<void> {
    const current = this.sessions.get(currentSessionId);
    if (current) {
      current.revokedAt = new Date();
    }
    await this.createRefreshSession(input);
  }

  async revokeRefreshSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = new Date();
    }
  }

  async revokeRefreshFamily(familyId: string): Promise<void> {
    this.revokedFamilies.push(familyId);
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId) {
        session.revokedAt = new Date();
      }
    }
  }

  async createAuditEvent(input: AuditInput): Promise<void> {
    this.audits.push(input);
  }
}

class FakePasswordService implements PasswordService {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `hashed:${password}`;
  }
}

class FakeTokenService implements TokenService {
  private counter = 0;
  private payloads = new Map<string, { sub: string; sessionId: string; familyId: string }>();

  signAccessToken(user: AuthenticatedUser): string {
    return `access:${user.id}:${this.counter++}`;
  }

  signRefreshToken(userId: string, sessionId: string, familyId: string): IssuedRefreshToken {
    const token = `refresh:${sessionId}:${this.counter++}`;
    this.payloads.set(token, { sub: userId, sessionId, familyId });
    return { token, expiresAt: new Date(Date.now() + 60_000) };
  }

  verifyRefreshToken(token: string) {
    const payload = this.payloads.get(token);
    if (!payload) {
      throw new UnauthorizedError();
    }
    return { ...payload, type: "refresh" as const, exp: Math.floor(Date.now() / 1000) + 60 };
  }
}

const createService = () => {
  const repository = new FakeRepository();
  const service = new AuthService(
    repository,
    new FakePasswordService(),
    new FakeTokenService(),
    {
      dummyHash: "hashed:dummy",
      accessExpiry: "15m",
      refreshExpiry: "7d",
    },
  );
  return { repository, service };
};

describe("AuthService", () => {
  it("registers an accountant and creates an audited refresh session", async () => {
    const { repository, service } = createService();

    const result = await service.register(
      {
        email: "new@example.com",
        username: "new.user",
        password: "Password1234",
        firstName: "New",
        lastName: "Accountant",
        locale: Locale.EN,
      },
      { ipAddress: "127.0.0.1" },
    );

    expect(result.user.username).toBe("new.user");
    expect(result.tokens.accessToken).toContain("access:");
    expect(repository.sessions.size).toBe(1);
    expect(repository.audits[0]).toMatchObject({
      action: "auth.registered",
      actorType: ActorType.ACCOUNTANT,
    });
  });

  it("logs in with valid credentials and rejects invalid credentials", async () => {
    const { service } = createService();

    const result = await service.login(
      { identifier: "accountant", password: "Password1234" },
      {},
    );
    expect(result.user.id).toBe(baseUser().id);

    await expect(
      service.login({ identifier: "accountant", password: "wrong" }, {}),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rotates refresh tokens and revokes the family when an old token is replayed", async () => {
    const { repository, service } = createService();
    const login = await service.login(
      { identifier: "accountant", password: "Password1234" },
      {},
    );

    const refreshed = await service.refresh({ refreshToken: login.tokens.refreshToken }, {});
    expect(refreshed.tokens.refreshToken).not.toBe(login.tokens.refreshToken);

    await expect(
      service.refresh({ refreshToken: login.tokens.refreshToken }, {}),
    ).rejects.toMatchObject({ code: "REFRESH_TOKEN_REUSED" });
    expect(repository.revokedFamilies).toHaveLength(1);
  });

  it("revokes a refresh session during logout", async () => {
    const { repository, service } = createService();
    const login = await service.login(
      { identifier: "accountant", password: "Password1234" },
      {},
    );

    await service.logout({ refreshToken: login.tokens.refreshToken }, {});

    expect([...repository.sessions.values()][0].revokedAt).toBeInstanceOf(Date);
  });
});
