import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";

const postgresUrl = process.env.TEST_POSTGRES_URL;
const testOpenId = `mock-postgres-openid-${randomBytes(4).toString("hex")}`;

describe.skipIf(!postgresUrl)("PostgreSQL authentication integration", () => {
  let app: FastifyInstance;
  let cleanupPool: Pool;

  beforeAll(async () => {
    process.env.DATABASE_DRIVER = "postgres";
    process.env.DATABASE_URL = postgresUrl;
    process.env.WECHAT_AUTH_MODE = "mock";
    process.env.WECHAT_MOCK_OPENID = testOpenId;
    app = await buildApp({ logger: false });
    cleanupPool = new Pool({ connectionString: postgresUrl });
  });

  afterAll(async () => {
    await app.close();
    await cleanupPool.query("DELETE FROM users WHERE wechat_openid = $1", [
      testOpenId,
    ]);
    await cleanupPool.end();
  });

  it("persists a login and profile update", async () => {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/wechat",
      payload: { code: "postgres-test-code" },
    });
    const token = loginResponse.json().data.access_token as string;

    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/v1/me/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: "PG测试用户" },
    });
    expect(updateResponse.statusCode).toBe(200);

    const meResponse = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meResponse.json().data.user.nickname).toBe("PG测试用户");
  });
});
