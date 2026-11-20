import { describe, expect, it } from "vitest";

import { SYNC_PROTOCOL_VERSION } from "../versioning.js";
import { syncIngestRequestBodySchema, syncIngestResponseSchema } from "./ingest.js";
import { SYNC_FINANCIAL_APPLY_SCHEMA_VERSION } from "./financial-v2.js";

describe("sync ingest contracts", () => {
  it("accepts a minimal valid ingest batch", () => {
    const parsed = syncIngestRequestBodySchema.safeParse({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: "batch_1",
      tenantId: "ten_1",
      stallId: "ten_1",
      sourceStream: {
        sourceStreamId: "inst_1",
        streamGeneration: 1,
        stallId: "ten_1",
      },
      groups: [
        {
          transactionGroupId: "grp_1",
          complete: true,
          events: [
            {
              eventId: "evt_1",
              eventType: "polivo.farmer.created",
              eventSchemaVersion: "1",
              sequence: "1",
              transactionGroupId: "grp_1",
              aggregateId: "farmer_1",
              aggregateRevision: 1,
              occurredAt: "2026-11-13T00:00:00.000Z",
              payload: { farmer: { id: "farmer_1" }, stallId: "ten_1" },
            },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects stall mismatch between body and sourceStream", () => {
    const parsed = syncIngestRequestBodySchema.safeParse({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: "batch_1",
      tenantId: "ten_1",
      stallId: "ten_1",
      sourceStream: {
        sourceStreamId: "inst_1",
        streamGeneration: 1,
        stallId: "other_stall",
      },
      groups: [
        {
          transactionGroupId: "grp_1",
          complete: true,
          events: [
            {
              eventId: "evt_1",
              eventType: "polivo.farmer.created",
              eventSchemaVersion: "1",
              sequence: "1",
              transactionGroupId: "grp_1",
              occurredAt: "2026-11-13T00:00:00.000Z",
              payload: {},
            },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects incomplete groups (complete must be true)", () => {
    const parsed = syncIngestRequestBodySchema.safeParse({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: "batch_1",
      tenantId: "ten_1",
      stallId: "ten_1",
      sourceStream: {
        sourceStreamId: "inst_1",
        streamGeneration: 1,
        stallId: "ten_1",
      },
      groups: [
        {
          transactionGroupId: "grp_1",
          complete: false,
          events: [
            {
              eventId: "evt_1",
              eventType: "polivo.farmer.created",
              eventSchemaVersion: "1",
              sequence: "1",
              transactionGroupId: "grp_1",
              occurredAt: "2026-11-13T00:00:00.000Z",
              payload: {},
            },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("parses an acknowledgement response", () => {
    const parsed = syncIngestResponseSchema.safeParse({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      correlationId: "req_1",
      batchId: "batch_1",
      tenantId: "ten_1",
      stallId: "ten_1",
      sourceStreamId: "inst_1",
      streamGeneration: 1,
      committedCursor: "1",
      nextExpectedSequence: "2",
      groupOutcomes: [
        {
          transactionGroupId: "grp_1",
          outcome: "applied",
          acknowledgedEventIds: ["evt_1"],
          errorCode: null,
          message: null,
          retryable: false,
        },
      ],
      allGroupsAccepted: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("exports financial apply schema version 2", () => {
    expect(SYNC_FINANCIAL_APPLY_SCHEMA_VERSION).toBe("2");
  });
});
