import { z } from "zod";

import {
  absoluteTimestampSchema,
  deviceIdSchema,
  opaqueIdSchema,
  tenantIdSchema,
} from "../primitives.js";

/**
 * Generic synchronization envelope foundation.
 * Each concrete event must supply its own payload schema.
 * Tenant and device fields are transport metadata, not authorization proof.
 * Occurrence timestamps are not a reliable global ordering mechanism.
 */
export function createSyncEnvelopeSchema<T extends z.ZodType>(payloadSchema: T) {
  return z.strictObject({
    eventId: opaqueIdSchema,
    tenantId: tenantIdSchema,
    originatingDeviceId: deviceIdSchema,
    eventType: z.string().min(1).max(128),
    eventSchemaVersion: z.string().min(1).max(32),
    occurredAt: absoluteTimestampSchema,
    payload: payloadSchema,
  });
}

export type SyncEnvelope<T> = {
  eventId: string;
  tenantId: string;
  originatingDeviceId: string;
  eventType: string;
  eventSchemaVersion: string;
  occurredAt: string;
  payload: T;
};
