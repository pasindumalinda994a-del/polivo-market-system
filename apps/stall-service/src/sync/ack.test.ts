import { describe, expect, it } from "vitest";

import { SYNC_PROTOCOL_VERSION } from "@polivo/contracts";

import { AckValidationError, validateIngestAcknowledgement } from "./ack.js";
import type { BuiltSyncBatch } from "./batch.js";

function sampleBatch(): BuiltSyncBatch {
  return {
    rawBody: "{}",
    events: [
      {
        eventId: "evt-1",
        tenantId: "ten-1",
        stallId: "ten-1",
        originatingDeviceId: "dev-1",
        eventType: "polivo.farmer.created",
        eventSchemaVersion: "1",
        payloadJson: "{}",
        occurredAt: "2026-11-13T00:00:00.000Z",
        localSequence: 1,
        transactionGroupId: "grp-1",
        deliveryAttempts: 0,
        lastAttemptAt: null,
        nextRetryAt: null,
        lastErrorCode: null,
        ackState: "pending",
        acknowledgedAt: null,
        ackReceiptJson: null,
        ackPayloadHash: null,
      },
    ],
    groups: [
      {
        transactionGroupId: "grp-1",
        complete: true,
        events: [
          {
            eventId: "evt-1",
            eventType: "polivo.farmer.created",
            eventSchemaVersion: "1",
            sequence: "1",
            transactionGroupId: "grp-1",
            occurredAt: "2026-11-13T00:00:00.000Z",
            payload: {},
          },
        ],
      },
    ],
    body: {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: "batch-1",
      tenantId: "ten-1",
      stallId: "ten-1",
      sourceStream: {
        sourceStreamId: "inst-1",
        streamGeneration: 1,
        stallId: "ten-1",
      },
      groups: [],
    },
  };
}

describe("validateIngestAcknowledgement", () => {
  it("accepts a matching applied acknowledgement", () => {
    const batch = sampleBatch();
    batch.body.groups = batch.groups;
    const verified = validateIngestAcknowledgement({
      batch,
      expectedSourceStreamId: "inst-1",
      expectedStreamGeneration: 1,
      expectedTenantId: "ten-1",
      expectedStallId: "ten-1",
      response: {
        protocolVersion: SYNC_PROTOCOL_VERSION,
        correlationId: "corr-1",
        batchId: "batch-1",
        tenantId: "ten-1",
        stallId: "ten-1",
        sourceStreamId: "inst-1",
        streamGeneration: 1,
        committedCursor: "1",
        nextExpectedSequence: "2",
        allGroupsAccepted: true,
        groupOutcomes: [
          {
            transactionGroupId: "grp-1",
            outcome: "applied",
            acknowledgedEventIds: ["evt-1"],
            errorCode: null,
            message: null,
            retryable: false,
          },
        ],
      },
    });
    expect(verified.acknowledgedEventIds).toEqual(["evt-1"]);
    expect(verified.committedCursor).toBe(1);
  });

  it("rejects acknowledgements beyond submitted events", () => {
    const batch = sampleBatch();
    batch.body.groups = batch.groups;
    expect(() =>
      validateIngestAcknowledgement({
        batch,
        expectedSourceStreamId: "inst-1",
        expectedStreamGeneration: 1,
        expectedTenantId: "ten-1",
        expectedStallId: "ten-1",
        response: {
          protocolVersion: SYNC_PROTOCOL_VERSION,
          correlationId: "corr-1",
          batchId: "batch-1",
          tenantId: "ten-1",
          stallId: "ten-1",
          sourceStreamId: "inst-1",
          streamGeneration: 1,
          committedCursor: "1",
          nextExpectedSequence: "2",
          allGroupsAccepted: true,
          groupOutcomes: [
            {
              transactionGroupId: "grp-1",
              outcome: "applied",
              acknowledgedEventIds: ["evt-unknown"],
              errorCode: null,
              message: null,
              retryable: false,
            },
          ],
        },
      }),
    ).toThrow(AckValidationError);
  });
});
