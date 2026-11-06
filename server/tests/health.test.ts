import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("GET /v1/health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_DRIVER = "sqlite";
    process.env.DATABASE_PATH = ":memory:";
    process.env.WECHAT_AUTH_MODE = "mock";
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the contract bootstrap response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/health",
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.code).toBe("OK");
    expect(payload.data.status).toBe("ok");
    expect(payload.data.api_version).toBe("v1");
    expect(payload.data.contract_version).toBeDefined();
    expect(payload.request_id).toBeTruthy();
  });
});
