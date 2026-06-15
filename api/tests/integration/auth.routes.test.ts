import { Locale } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/app";
import type { AuthServiceContract } from "../../src/business/services/AuthService";
import type { AuthResult, PublicUser } from "../../src/shared/types/auth";
import authRoutes from "../../src/presentation/routes/auth";

const testApp = (authService: AuthServiceContract) =>
  buildApp({
    authService,
    closeResources: false,
    routePlugins: [
      async (app) => {
        await app.register(authRoutes, { prefix: "/api/auth" });
      },
    ],
  });

const user: PublicUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "accountant@example.com",
  username: "accountant",
  mustChangePassword: false,
  locale: Locale.SQ,
  roles: ["ACCOUNTANT"],
  permissions: ["business.create"],
  profile: { type: "ACCOUNTANT", firstName: "Ada", lastName: "Lovelace" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const authResult: AuthResult = {
  user,
  tokens: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresIn: "15m",
    refreshTokenExpiresIn: "7d",
  },
};

const createAuthService = (): AuthServiceContract => ({
  register: vi.fn().mockResolvedValue(authResult),
  login: vi.fn().mockResolvedValue(authResult),
  refresh: vi.fn().mockResolvedValue(authResult),
  logout: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockResolvedValue(user),
});

describe("auth routes", () => {
  it("validates and registers an accountant", async () => {
    const app = testApp(createAuthService());

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "ACCOUNTANT@example.com",
        username: "Accountant",
        password: "Password1234",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.username).toBe("accountant");
    await app.close();
  });

  it("supports login, refresh, and logout", async () => {
    const app = testApp(createAuthService());

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "accountant", password: "Password1234" },
    });
    const refresh = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken: "refresh-token" },
    });
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      payload: { refreshToken: "refresh-token" },
    });

    expect(login.statusCode).toBe(200);
    expect(refresh.statusCode).toBe(200);
    expect(logout.statusCode).toBe(204);
    await app.close();
  });

  it("rejects invalid bodies and protects the current-user route", async () => {
    const app = testApp(createAuthService());

    const invalid = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "x" },
    });
    const unauthorized = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().code).toBe("VALIDATION_ERROR");
    expect(unauthorized.statusCode).toBe(401);
    await app.close();
  });

  it("returns the current user for a valid access token", async () => {
    const authService = createAuthService();
    const app = testApp(authService);
    await app.ready();
    const token = app.jwt.sign(
      {
        sub: user.id,
        type: "access",
        roles: user.roles,
        permissions: user.permissions,
        mustChangePassword: false,
      },
      { expiresIn: "15m" },
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(user.id);
    await app.close();
  });
});
