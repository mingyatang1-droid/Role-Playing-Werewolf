import type { FastifyPluginAsync } from "fastify";

export interface HealthResponse {
  code: "OK";
  message: "success";
  request_id: string;
  data: {
    status: "ok";
    api_version: "v1";
    contract_version: string;
    server_time: string;
  };
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/health", async (request): Promise<HealthResponse> => {
    const contractVersion = process.env.CONTRACT_VERSION ?? "1.0";

    return {
      code: "OK",
      message: "success",
      request_id: request.id,
      data: {
        status: "ok",
        api_version: "v1",
        contract_version: contractVersion,
        server_time: new Date().toISOString(),
      },
    };
  });
};
