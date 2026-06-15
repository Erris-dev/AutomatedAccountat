import type { Locale } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
  locale: Locale;
  roles: string[];
  permissions: string[];
  accountantProfile: {
    firstName: string;
    lastName: string;
  } | null;
  businessOwnerProfile: {
    businessId: string;
  } | null;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  email: string | null;
  username: string;
  mustChangePassword: boolean;
  locale: Locale;
  roles: string[];
  permissions: string[];
  profile:
    | {
        type: "ACCOUNTANT";
        firstName: string;
        lastName: string;
      }
    | {
        type: "BUSINESS_OWNER";
        businessId: string;
      }
    | null;
  createdAt: string;
}

export interface AccessTokenPayload {
  sub: string;
  type: "access";
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
  sessionId: string;
  familyId: string;
  exp?: number;
  iat?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}
