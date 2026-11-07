import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { readBearerToken } from "../auth/bearer.js";
import { ApiError } from "../errors/api-error.js";
import type { HumanAction } from "./engine.js";
import type { GameService } from "./game-service.js";

interface RoomParams {
  room_id: string;
}

interface GameParams {
  game_id: string;
}

interface ActionBody {
  expected_version: number;
  action_type: HumanAction["type"];
  target_seat?: number | null;
  save?: boolean;
  poison_target_seat?: number | null;
  text?: string;
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

function toHumanAction(body: ActionBody): HumanAction {
  switch (body.action_type) {
    case "WOLF_KILL":
    case "SEER_CHECK":
    case "HUNTER_SHOOT":
      if (typeof body.target_seat !== "number") {
        throw new ApiError(
          400,
          "TARGET_REQUIRED",
          "该行动必须选择一个目标",
        );
      }
      return { type: body.action_type, targetSeat: body.target_seat };
    case "WITCH_ACTION":
      return {
        type: "WITCH_ACTION",
        save: body.save === true,
        poisonTargetSeat: body.poison_target_seat ?? null,
      };
    case "SPEAK":
      return {
        type: "SPEAK",
        text: body.text ?? "",
      };
    case "SKIP_SPEECH":
      return { type: "SKIP_SPEECH" };
    case "VOTE":
      return {
        type: "VOTE",
        targetSeat: typeof body.target_seat === "number" ? body.target_seat : null,
      };
  }
}

export function createGameRoutes(gameService: GameService): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: RoomParams }>(
      "/v1/rooms/:room_id/start",
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const snapshot = await gameService.startGame(
          token,
          request.params.room_id,
        );
        success(reply, request.id, snapshot, 201);
      },
    );

    app.get<{ Params: GameParams }>(
      "/v1/games/:game_id/snapshot",
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const snapshot = await gameService.getSnapshot(
          token,
          request.params.game_id,
        );
        success(reply, request.id, snapshot);
      },
    );

    app.post<{ Params: GameParams; Body: ActionBody }>(
      "/v1/games/:game_id/actions",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["expected_version", "action_type"],
            properties: {
              expected_version: { type: "integer", minimum: 1 },
              action_type: {
                type: "string",
                enum: [
                  "WOLF_KILL",
                  "SEER_CHECK",
                  "WITCH_ACTION",
                  "HUNTER_SHOOT",
                  "SPEAK",
                  "SKIP_SPEECH",
                  "VOTE",
                ],
              },
              target_seat: {
                anyOf: [
                  { type: "integer", minimum: 1, maximum: 12 },
                  { type: "null" },
                ],
              },
              save: { type: "boolean" },
              poison_target_seat: {
                anyOf: [
                  { type: "integer", minimum: 1, maximum: 12 },
                  { type: "null" },
                ],
              },
              text: { type: "string", maxLength: 300 },
            },
          },
        },
      },
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const snapshot = await gameService.submitAction(
          token,
          request.params.game_id,
          request.body.expected_version,
          toHumanAction(request.body),
        );
        success(reply, request.id, snapshot);
      },
    );

    app.post<{
      Params: GameParams;
      Body: { expected_version: number };
    }>(
      "/v1/games/:game_id/tick",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["expected_version"],
            properties: {
              expected_version: { type: "integer", minimum: 1 },
            },
          },
        },
      },
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const snapshot = await gameService.tick(
          token,
          request.params.game_id,
          request.body.expected_version,
        );
        success(reply, request.id, snapshot);
      },
    );
  };
}
