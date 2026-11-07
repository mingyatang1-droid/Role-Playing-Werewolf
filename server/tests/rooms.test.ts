import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("room configuration", () => {
  let app: FastifyInstance;
  let accessToken: string;

  beforeAll(async () => {
    process.env.DATABASE_DRIVER = "sqlite";
    process.env.DATABASE_PATH = ":memory:";
    process.env.WECHAT_AUTH_MODE = "mock";
    process.env.WECHAT_MOCK_OPENID = "mock-openid-room-test";
    app = await buildApp({ logger: false });
    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat",
      payload: { code: "room-test-login" },
    });
    accessToken = loginResponse.json().data.access_token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates and reads a configured 9-player solo room", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "SOLO",
        total_seats: 9,
        human_seats: 1,
        ai_seats: 8,
        role_config: {
          werewolf: 3,
          villager: 3,
          seer: 1,
          witch: 1,
          hunter: 1,
        },
      },
    });
    const room = createResponse.json().data;

    expect(createResponse.statusCode).toBe(201);
    expect(room.status).toBe("CONFIGURING");
    expect(room.room_code).toMatch(/^R-[0-9A-F]{8}$/);
    expect(room.total_seats).toBe(9);

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/rooms/${room.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().data.role_config).toEqual({
      werewolf: 3,
      villager: 3,
      seer: 1,
      witch: 1,
      hunter: 1,
    });

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${room.id}/config`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        expected_version: room.config_version,
        mode: "SOLO",
        total_seats: 8,
        human_seats: 1,
        ai_seats: 7,
        role_config: {
          werewolf: 2,
          villager: 4,
          seer: 1,
          witch: 1,
          hunter: 0,
        },
      },
    });
    const updatedRoom = updateResponse.json().data;

    expect(updateResponse.statusCode).toBe(200);
    expect(updatedRoom.total_seats).toBe(8);
    expect(updatedRoom.config_version).toBe(room.config_version + 1);

    const staleUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${room.id}/config`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        expected_version: room.config_version,
        mode: "SOLO",
        total_seats: 9,
        human_seats: 1,
        ai_seats: 8,
        role_config: {
          werewolf: 3,
          villager: 3,
          seer: 1,
          witch: 1,
          hunter: 1,
        },
      },
    });
    expect(staleUpdateResponse.statusCode).toBe(409);
    expect(staleUpdateResponse.json().code).toBe("ROOM_VERSION_CONFLICT");
  });

  it("rejects a role deck with the wrong total", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "SOLO",
        total_seats: 9,
        human_seats: 1,
        ai_seats: 8,
        role_config: {
          werewolf: 3,
          villager: 2,
          seer: 1,
          witch: 1,
          hunter: 1,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("ROOM_ROLE_TOTAL_MISMATCH");
  });

  it("requires authentication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      payload: {
        mode: "SOLO",
        total_seats: 9,
        human_seats: 1,
        ai_seats: 8,
        role_config: {
          werewolf: 3,
          villager: 3,
          seer: 1,
          witch: 1,
          hunter: 1,
        },
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("AUTH_REQUIRED");
  });

  it("rejects a room without werewolves", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "SOLO",
        total_seats: 6,
        human_seats: 1,
        ai_seats: 5,
        role_config: {
          werewolf: 0,
          villager: 4,
          seer: 1,
          witch: 1,
          hunter: 0,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("ROOM_WEREWOLF_REQUIRED");
  });

  it("rejects duplicate unique roles", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        mode: "SOLO",
        total_seats: 9,
        human_seats: 1,
        ai_seats: 8,
        role_config: {
          werewolf: 3,
          villager: 2,
          seer: 2,
          witch: 1,
          hunter: 1,
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("ROOM_UNIQUE_ROLE_EXCEEDED");
  });
});
