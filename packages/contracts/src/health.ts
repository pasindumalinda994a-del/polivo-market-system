import { z } from "zod";

export const HEALTH_SERVICE_NAME = "polivo-stall-service" as const;
export const HEALTH_STATUS_OK = "ok" as const;

/**
 * Response for `GET /health`.
 * Literals match the phase 04 foundation response.
 * Does not claim database, sync, auth, or printer readiness.
 */
export const healthResponseSchema = z.strictObject({
  service: z.literal(HEALTH_SERVICE_NAME),
  status: z.literal(HEALTH_STATUS_OK),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function buildHealthResponse(): HealthResponse {
  return healthResponseSchema.parse({
    service: HEALTH_SERVICE_NAME,
    status: HEALTH_STATUS_OK,
  });
}
