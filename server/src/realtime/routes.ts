import type { FastifyPluginAsync } from "fastify";

interface ClientHeartbeat {
  type: "ping";
  request_id?: string;
}

interface RawSocketMessage {
  toString(): string;
}

export const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/ws",
    { websocket: true },
    (socket) => {
      socket.send(
        JSON.stringify({
          type: "server.hello",
          event_id: "evt_hello",
          sequence: 0,
          server_time: new Date().toISOString(),
          payload: {
            contract_version: process.env.CONTRACT_VERSION ?? "1.0",
            heartbeat_interval_ms: 25_000,
          },
        }),
      );

      socket.on("message", (rawMessage: RawSocketMessage) => {
        try {
          const message = JSON.parse(rawMessage.toString()) as ClientHeartbeat;
          if (message.type === "ping") {
            socket.send(
              JSON.stringify({
                type: "pong",
                request_id: message.request_id ?? null,
                server_time: new Date().toISOString(),
              }),
            );
          }
        } catch {
          socket.send(
            JSON.stringify({
              type: "server.error",
              code: "INVALID_EVENT",
              message: "WebSocket message must be valid JSON.",
            }),
          );
        }
      });
    },
  );
};
