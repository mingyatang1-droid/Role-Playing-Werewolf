import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("WeChat authentication", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_DRIVER = "sqlite";
    process.env.DATABASE_PATH = ":memory:";
    process.env.WECHAT_AUTH_MODE = "mock";
    process.env.WECHAT_MOCK_OPENID = "mock-openid-auth-test";
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates one stable user and returns a session token", async () => {
    const firstResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat",
      payload: { code: "mock-login-code" },
    });
    const firstPayload = firstResponse.json();

    expect(firstResponse.statusCode).toBe(200);
    expect(firstPayload.data.is_new_user).toBe(true);
    expect(firstPayload.data.access_token).toBeTruthy();
    expect(firstPayload.data.user.public_id).toMatch(/^W-[0-9A-F]{8}$/);
    expect(JSON.stringify(firstPayload)).not.toContain("mock-openid-auth-test");

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat",
      payload: { code: "another-code" },
    });
    const secondPayload = secondResponse.json();

    expect(secondResponse.statusCode).toBe(200);
    expect(secondPayload.data.is_new_user).toBe(false);
    expect(secondPayload.data.user.id).toBe(firstPayload.data.user.id);
  });

  it("reads the authenticated user and updates the nickname", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat",
      payload: { code: "mock-login-code" },
    });
    const token = loginResponse.json().data.access_token as string;

    const meResponse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meResponse.statusCode).toBe(200);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: "主公" },
    });
    const updatePayload = updateResponse.json();

    expect(updateResponse.statusCode).toBe(200);
    expect(updatePayload.data.user.nickname).toBe("主公");

    const verifiedResponse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(verifiedResponse.json().data.user.nickname).toBe("主公");
  });

  it("rejects missing or invalid session tokens", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer invalid-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("AUTH_INVALID");
  });
});
