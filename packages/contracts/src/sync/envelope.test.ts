import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createSyncEnvelopeSchema } from "./envelope.js";

const payloadSchema = z.strictObject({
  note: z.string().min(1),
});

const envelopeSchema = createSyncEnvelopeSchema(payloadSchema);

const validEnvelope = {
  eventId: "evt-1",
  tenantId: "tenant-1",
  originatingDeviceId: "device-1",
  eventType: "example.created",
  eventSchemaVersion: "1",
  occurredAt: "2026-10-29T09:00:00.000Z",
  payload: { note: "ok" },
};

describe("synchronization envelope", () => {
  it("validates a payload against the supplied schema", () => {
    expect(envelopeSchema.safeParse(validEnvelope).success).toBe(true);
  });

  it("rejects unexpected payload fields", () => {
    expect(
      envelopeSchema.safeParse({
        ...validEnvelope,
        payload: { note: "ok", extra: true },
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid payload", () => {
    expect(
      envelopeSchema.safeParse({
        ...validEnvelope,
        payload: {},
      }).success,
    ).toBe(false);
  });
});
