import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("game API", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let roomId: string;
  let gameId: string;
  let snapshot: {
    game_id: string;
    phase: string;
    state_version: number;
    self_role: string;
    players: Array<{ seat_no: number; role?: string }>;
    legal_action: {
      type: string;
      target_seats: number[];
      can_save?: boolean;
    } | null;
  };

  beforeAll(async () => {
    process.env.DATABASE_DRIVER = "sqlite";
    process.env.DATABASE_PATH = ":memory:";
    process.env.WECHAT_AUTH_MODE = "mock";
    process.env.WECHAT_MOCK_OPENID = "mock-openid-game-api";
    app = await buildApp({ logger: false });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat",
      payload: { code: "game-api-login" },
    });
    accessToken = loginResponse.json().data.access_token as string;

    const roomResponse = await app.inject({
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
    roomId = roomResponse.json().data.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("starts a room and returns a permission-filtered snapshot", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/start`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    snapshot = response.json().data;
    gameId = snapshot.game_id;

    expect(response.statusCode).toBe(201);
    expect(snapshot.game_id).toBeTruthy();
    expect(snapshot.self_role).toBeTruthy();
    expect(snapshot.players).toHaveLength(9);
    if (snapshot.phase !== "GAME_OVER") {
      expect(
        snapshot.players
          .filter((player: { seat_no: number }) => player.seat_no !== 1)
          .every((player: { role?: string }) => player.role === undefined),
      ).toBe(true);
    }

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/games/${snapshot.game_id}/snapshot`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().data.state_version).toBe(snapshot.state_version);
  });

  it("accepts a legal human action when the game awaits one", async () => {
    if (!snapshot.legal_action) {
      expect(snapshot.phase).toBe("GAME_OVER");
      return;
    }

    const action = snapshot.legal_action;
    const targetSeat = action.target_seats[0] ?? null;
    const payload: Record<string, unknown> = {
      expected_version: snapshot.state_version,
      action_type: action.type,
      target_seat: targetSeat,
    };
    if (action.type === "WITCH_ACTION") {
      payload.save = action.can_save ? true : false;
      payload.poison_target_seat = action.can_save ? null : targetSeat;
    } else if (action.type === "SPEAK") {
      payload.text = "我先保留判断，听听后续发言。";
    }

    const response = await app.inject({
      method: "POST",
      url: `/v1/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.state_version).toBe(
      snapshot.state_version + 1,
    );
  });

  it("returns not found for an unknown game", async () => {
    const stateResponse = await app.inject({
      method: "GET",
      url: "/v1/games/not-a-game/snapshot",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(stateResponse.statusCode).toBe(404);
  });
});
