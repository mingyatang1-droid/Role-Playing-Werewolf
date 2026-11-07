import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { readBearerToken } from "../auth/bearer.js";
import type { RoleConfig, RoomRecord } from "./room-model.js";
import type { RoomService } from "./room-service.js";

interface CreateRoomBody {
  mode: "SOLO" | "FRIENDS";
  total_seats: number;
  human_seats: number;
  ai_seats: number;
  role_config: RoleConfig;
}

interface UpdateRoomConfigBody extends CreateRoomBody {
  expected_version: number;
}

interface RoomParams {
  room_id: string;
}

interface RoomResponse {
  id: string;
  room_code: string;
  mode: RoomRecord["mode"];
  status: RoomRecord["status"];
  total_seats: number;
  human_seats: number;
  ai_seats: number;
  role_config: RoleConfig;
  config_version: number;
  created_at: string;
  updated_at: string;
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

function toRoomResponse(room: RoomRecord): RoomResponse {
  return {
    id: room.id,
    room_code: room.publicId,
    mode: room.mode,
    status: room.status,
    total_seats: room.totalSeats,
    human_seats: room.humanSeats,
    ai_seats: room.aiSeats,
    role_config: room.roleConfig,
    config_version: room.configVersion,
    created_at: room.createdAt,
    updated_at: room.updatedAt,
  };
}

export function createRoomRoutes(roomService: RoomService): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Body: CreateRoomBody }>(
      "/v1/rooms",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: [
              "mode",
              "total_seats",
              "human_seats",
              "ai_seats",
              "role_config",
            ],
            properties: {
              mode: { type: "string", enum: ["SOLO", "FRIENDS"] },
              total_seats: { type: "integer", minimum: 6, maximum: 12 },
              human_seats: { type: "integer", minimum: 1, maximum: 12 },
              ai_seats: { type: "integer", minimum: 0, maximum: 11 },
              role_config: {
                type: "object",
                additionalProperties: false,
                required: [
                  "werewolf",
                  "villager",
                  "seer",
                  "witch",
                  "hunter",
                ],
                properties: {
                  werewolf: { type: "integer", minimum: 0, maximum: 12 },
                  villager: { type: "integer", minimum: 0, maximum: 12 },
                  seer: { type: "integer", minimum: 0, maximum: 12 },
                  witch: { type: "integer", minimum: 0, maximum: 12 },
                  hunter: { type: "integer", minimum: 0, maximum: 12 },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const body = request.body;
        const room = await roomService.createRoom(token, {
          mode: body.mode,
          totalSeats: body.total_seats,
          humanSeats: body.human_seats,
          aiSeats: body.ai_seats,
          roleConfig: body.role_config,
        });
        success(reply, request.id, toRoomResponse(room), 201);
      },
    );

    app.get<{ Params: RoomParams }>(
      "/v1/rooms/:room_id",
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const room = await roomService.getOwnedRoom(
          token,
          request.params.room_id,
        );
        success(reply, request.id, toRoomResponse(room));
      },
    );

    app.patch<{ Params: RoomParams; Body: UpdateRoomConfigBody }>(
      "/v1/rooms/:room_id/config",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: [
              "expected_version",
              "mode",
              "total_seats",
              "human_seats",
              "ai_seats",
              "role_config",
            ],
            properties: {
              expected_version: { type: "integer", minimum: 1 },
              mode: { type: "string", enum: ["SOLO", "FRIENDS"] },
              total_seats: { type: "integer", minimum: 6, maximum: 12 },
              human_seats: { type: "integer", minimum: 1, maximum: 12 },
              ai_seats: { type: "integer", minimum: 0, maximum: 11 },
              role_config: {
                type: "object",
                additionalProperties: false,
                required: [
                  "werewolf",
                  "villager",
                  "seer",
                  "witch",
                  "hunter",
                ],
                properties: {
                  werewolf: { type: "integer", minimum: 0, maximum: 12 },
                  villager: { type: "integer", minimum: 0, maximum: 12 },
                  seer: { type: "integer", minimum: 0, maximum: 12 },
                  witch: { type: "integer", minimum: 0, maximum: 12 },
                  hunter: { type: "integer", minimum: 0, maximum: 12 },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const token = readBearerToken(request.headers.authorization);
        const body = request.body;
        const room = await roomService.updateRoomConfig(
          token,
          request.params.room_id,
          {
            mode: body.mode,
            totalSeats: body.total_seats,
            humanSeats: body.human_seats,
            aiSeats: body.ai_seats,
            roleConfig: body.role_config,
          },
          body.expected_version,
        );
        success(reply, request.id, toRoomResponse(room));
      },
    );
  };
}
