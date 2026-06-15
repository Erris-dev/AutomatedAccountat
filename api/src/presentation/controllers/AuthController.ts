import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "../../business/dto/auth.dto";

const requestContext = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  userAgent: request.headers["user-agent"],
});

export class AuthController {
  register = async (
    request: FastifyRequest<{ Body: RegisterInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await request.server.authService.register(request.body, requestContext(request));
    await reply.code(201).send(result);
  };

  login = async (
    request: FastifyRequest<{ Body: LoginInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await request.server.authService.login(request.body, requestContext(request));
    await reply.send(result);
  };

  refresh = async (
    request: FastifyRequest<{ Body: RefreshInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await request.server.authService.refresh(request.body, requestContext(request));
    await reply.send(result);
  };

  logout = async (
    request: FastifyRequest<{ Body: LogoutInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    await request.server.authService.logout(request.body, requestContext(request));
    await reply.code(204).send();
  };

  me = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = await request.server.authService.getCurrentUser(request.user.sub);
    await reply.send({ user });
  };
}
