import { ActorType, Locale, Prisma, type PrismaClient } from "@prisma/client";

import { ConflictError, InternalServerError } from "../../shared/errors/AppError";
import type { AuthenticatedUser, RequestContext } from "../../shared/types/auth";

const authUserInclude = Prisma.validator<Prisma.UserInclude>()({
  accountantProfile: true,
  businessOwnerProfile: true,
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
});

type PrismaAuthUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

export interface CreateAccountantUserInput {
  email: string;
  username: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  locale: Locale;
}

export interface CreateRefreshSessionInput {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  context: RequestContext;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: AuthenticatedUser;
}

export interface AuditInput {
  actorId: string;
  actorType: ActorType;
  action: string;
  metadata?: Prisma.InputJsonValue;
  context: RequestContext;
}

export interface AuthRepository {
  findUserByIdentifier(identifier: string): Promise<AuthenticatedUser | null>;
  findUserById(id: string): Promise<AuthenticatedUser | null>;
  createAccountantUser(input: CreateAccountantUserInput): Promise<AuthenticatedUser>;
  updateLastLogin(userId: string, lastLoginAt: Date): Promise<void>;
  createRefreshSession(input: CreateRefreshSessionInput): Promise<void>;
  findRefreshSessionById(id: string): Promise<RefreshSessionRecord | null>;
  rotateRefreshSession(currentSessionId: string, input: CreateRefreshSessionInput): Promise<void>;
  revokeRefreshSession(id: string): Promise<void>;
  revokeRefreshFamily(familyId: string): Promise<void>;
  createAuditEvent(input: AuditInput): Promise<void>;
}

const mapAuthUser = (user: PrismaAuthUser): AuthenticatedUser => {
  const roles = user.roles.map(({ role }) => role.code);
  const permissions = [
    ...new Set(
      user.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.code),
      ),
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    passwordHash: user.passwordHash,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    locale: user.locale,
    roles,
    permissions,
    accountantProfile: user.accountantProfile,
    businessOwnerProfile: user.businessOwnerProfile,
    createdAt: user.createdAt,
  };
};

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByIdentifier(identifier: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
      include: authUserInclude,
    });

    return user ? mapAuthUser(user) : null;
  }

  async findUserById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: authUserInclude,
    });

    return user ? mapAuthUser(user) : null;
  }

  async createAccountantUser(input: CreateAccountantUserInput): Promise<AuthenticatedUser> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          passwordHash: input.passwordHash,
          locale: input.locale,
          accountantProfile: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
            },
          },
          roles: {
            create: {
              role: {
                connect: {
                  code: "ACCOUNTANT",
                },
              },
            },
          },
        },
        include: authUserInclude,
      });

      return mapAuthUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Email or username is already registered", "ACCOUNT_EXISTS");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new InternalServerError("The ACCOUNTANT role has not been seeded", "ROLE_NOT_CONFIGURED");
      }
      throw error;
    }
  }

  async updateLastLogin(userId: string, lastLoginAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt },
    });
  }

  async createRefreshSession(input: CreateRefreshSessionInput): Promise<void> {
    await this.prisma.refreshSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
      },
    });
  }

  async findRefreshSessionById(id: string): Promise<RefreshSessionRecord | null> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { id },
      include: {
        user: {
          include: authUserInclude,
        },
      },
    });

    return session
      ? {
          id: session.id,
          userId: session.userId,
          familyId: session.familyId,
          tokenHash: session.tokenHash,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
          user: mapAuthUser(session.user),
        }
      : null;
  }

  async rotateRefreshSession(
    currentSessionId: string,
    input: CreateRefreshSessionInput,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: currentSessionId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshSession.create({
        data: {
          id: input.id,
          userId: input.userId,
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.context.ipAddress,
          userAgent: input.context.userAgent,
        },
      }),
    ]);
  }

  async revokeRefreshSession(id: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeRefreshFamily(familyId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async createAuditEvent(input: AuditInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        entityType: "User",
        entityId: input.actorId,
        metadata: input.metadata,
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
      },
    });
  }
}
