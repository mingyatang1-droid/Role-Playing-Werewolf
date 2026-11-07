import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { AuthService, createAuthService } from "./auth/auth-service.js";
import { createAuthRoutes } from "./auth/routes.js";
import {
  LiveWechatAuthProvider,
  MockWechatAuthProvider,
  type WechatAuthProvider,
} from "./auth/wechat-provider.js";
import { getServerEnvironment } from "./config/environment.js";
import {
  createPersistence,
  type PersistenceContext,
} from "./db/create-persistence.js";
import { ApiError } from "./errors/api-error.js";
import { realtimeRoutes } from "./realtime/routes.js";
import { healthRoutes } from "./routes/health.js";
import { createRoomRoutes } from "./rooms/routes.js";
import { RoomService } from "./rooms/room-service.js";
import { GameService } from "./game/game-service.js";
import { createGameRoutes } from "./game/routes.js";

export interface BuildAppOptions {
  logger?: boolean;
  authService?: AuthService;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  let persistence: PersistenceContext | null = null;
  let authService = options.authService;
  let roomService: RoomService | null = null;
  let gameService: GameService | null = null;
  if (!authService) {
    const environment = getServerEnvironment();
    persistence = await createPersistence(environment);
    const wechat: WechatAuthProvider =
      environment.wechatAuthMode === "mock"
        ? new MockWechatAuthProvider(environment.wechatMockOpenId)
        : new LiveWechatAuthProvider(
            environment.wechatAppId,
            environment.wechatAppSecret,
          );
    authService = createAuthService(
      environment,
      persistence.users,
      persistence.sessions,
      wechat,
    );
    roomService = new RoomService(authService, persistence.rooms);
    gameService = new GameService(
      authService,
      persistence.rooms,
      persistence.games,
    );
  }

  if (persistence) {
    const persistenceToClose = persistence;
    app.addHook("onClose", async () => {
      await persistenceToClose.close();
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        request_id: request.id,
      });
    }

    const errorLike =
      typeof error === "object" && error !== null
        ? (error as { statusCode?: unknown; code?: unknown })
        : null;
    const statusCode =
      typeof errorLike?.statusCode === "number" ? errorLike.statusCode : null;
    if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        code:
          typeof errorLike?.code === "string"
            ? errorLike.code
            : "BAD_REQUEST",
        message: "请求参数不合法",
        request_id: request.id,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "服务暂时不可用",
      request_id: request.id,
    });
  });

  await app.register(websocket);
  await app.register(healthRoutes);
  await app.register(createAuthRoutes(authService));
  if (roomService) {
    await app.register(createRoomRoutes(roomService));
  }
  if (gameService) {
    await app.register(createGameRoutes(gameService));
  }
  await app.register(realtimeRoutes);

  return app;
}
