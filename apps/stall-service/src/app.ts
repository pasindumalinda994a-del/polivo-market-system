import { buildHealthResponse, type HealthResponse } from "@polivo/contracts";
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    return buildHealthResponse();
  });

  return app;
}
