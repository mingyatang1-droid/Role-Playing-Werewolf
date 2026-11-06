import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { AuthService, PublicUser } from "./auth-service.js";
import { readBearerToken } from "./bearer.js";

interface LoginBody {
  code: string;
}

interface UpdateProfileBody {
  nickname: string;
}

function success<T>(
  reply: FastifyReply,
  requestId: string,
  data: T,
  statusCode = 200,
): void {
  reply.status(statusCode).send({
    code: "OK",
    message: "success",
    request_id: requestId,
    data,
  });
}

export function createAuthRoutes(authService: AuthService): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: LoginBody }>(
      "/v1/auth/wechat",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["code"],
            properties: {
              code: { type: "string", minLength: 1, maxLength: 256 },
            },
          },
        },
      },
      async (request, reply) => {
        const result = await authService.login(request.body.code);
        return success(reply, request.id, {
          access_token: result.accessToken,
          token_type: "Bearer",
          expires_at: result.expiresAt,
          is_new_user: result.isNewUser,
          user: toPublicUserResponse(result.user),
        });
      },
    );

    app.get("/v1/me", async (request, reply) => {
      const token = readBearerToken(request.headers.authorization);
      const user = await authService.getCurrentUser(token);
      return success(reply, request.id, { user: toPublicUserResponse(user) });
    });

    app.patch<{ Body: UpdateProfileBody }>(
      "/v1/me/profile",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["nickname"],
            properties: {
              nickname: { type: "string", minLength: 1, maxLength: 32 },
            },
          },
        },
      },
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const user = await authService.updateNickname(
          token,
          request.body.nickname,
        );
        return success(reply, request.id, { user: toPublicUserResponse(user) });
      },
    );
  };
}

interface PublicUserResponse {
  id: string;
  public_id: string;
  nickname: string;
  avatar_url: string | null;
  created_at: string;
}

function toPublicUserResponse(user: PublicUser): PublicUserResponse {
  return {
    id: user.id,
    public_id: user.publicId,
    nickname: user.nickname,
    avatar_url: user.avatarUrl,
    created_at: user.createdAt,
  };
}
