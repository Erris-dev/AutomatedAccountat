import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "../../business/dto/auth.dto";
import { AuthController } from "../controllers/AuthController";

const authRoutes: FastifyPluginAsync = async (app) => {
  const controller = new AuthController();
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    "/register",
    {
      schema: {
        body: registerSchema,
      },
    },
    controller.register,
  );

  routes.post(
    "/login",
    {
      schema: {
        body: loginSchema,
      },
    },
    controller.login,
  );

  routes.post(
    "/refresh",
    {
      schema: {
        body: refreshSchema,
      },
    },
    controller.refresh,
  );

  routes.post(
    "/logout",
    {
      schema: {
        body: logoutSchema,
      },
    },
    controller.logout,
  );

  routes.get(
    "/me",
    {
      onRequest: [app.authenticate],
    },
    controller.me,
  );
};

export default authRoutes;

export const autoPrefix = "/api/auth";
