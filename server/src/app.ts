import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { realtimeRoutes } from "./realtime/routes.js";
import { healthRoutes } from "./routes/health.js";

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  await app.register(websocket);
  await app.register(healthRoutes);
  await app.register(realtimeRoutes);

  return app;
}
