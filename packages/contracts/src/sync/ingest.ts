import { z } from "zod";

import {
  absoluteTimestampSchema,
  deviceIdSchema,
  opaqueIdSchema,
  requestIdSchema,
  tenantIdSchema,
} from "../primitives.js";
import { SYNC_PROTOCOL_VERSION, syncProtocolVersionSchema } from "../versioning.js";
import {
  SYNC_INGEST_MAX_EVENTS,
  SYNC_INGEST_MAX_EVENTS_PER_GROUP,
  SYNC_INGEST_MAX_GROUPS,
  SYNC_INGEST_MAX_STRING_LENGTH,
} from "./limits.js";

/**
 * Contiguous integer sequences as decimal strings to avoid JS precision loss
 * for large cursors. Must match /^[0-9]+$/ and fit Postgres BIGINT.
 */
export const syncSequenceStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/, "Sequence must be an unsigned decimal string");

export type SyncSequenceString = z.infer<typeof syncSequenceStringSchema>;

export const SYNC_INGEST_OUTCOME_CODES = [
  "applied",
  "already_applied",
  "retryable_failure",
  "sequence_conflict",
  "dependency_conflict",
  "unsupported_event_version",
  "integrity_conflict",
  "authorization_failure",
  "validation_failure",
  "incomplete_group",
  "rate_limited",
] as const;

export const syncIngestOutcomeCodeSchema = z.enum(SYNC_INGEST_OUTCOME_CODES);
export type SyncIngestOutcomeCode = z.infer<typeof syncIngestOutcomeCodeSchema>;

export const syncSourceStreamSchema = z.strictObject({
  sourceStreamId: opaqueIdSchema,
  streamGeneration: z.number().int().positive(),
  stallId: opaqueIdSchema,
});

export type SyncSourceStream = z.infer<typeof syncSourceStreamSchema>;

/**
 * Single ingest event. Payload is validated per eventType + eventSchemaVersion
 * by the server apply path; wire schema keeps payload as a bounded record.
 */
export const syncIngestEventSchema = z.strictObject({
  eventId: opaqueIdSchema,
  eventType: z.string().min(1).max(128),
  eventSchemaVersion: z.string().min(1).max(32),
  sequence: syncSequenceStringSchema,
  transactionGroupId: opaqueIdSchema,
  aggregateId: opaqueIdSchema.nullable().optional(),
  aggregateRevision: z.number().int().positive().nullable().optional(),
  occurredAt: absoluteTimestampSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type SyncIngestEvent = z.infer<typeof syncIngestEventSchema>;

export const syncIngestTransactionGroupSchema = z.strictObject({
  transactionGroupId: opaqueIdSchema,
  /** When true, the group is complete and may be applied atomically. */
  complete: z.literal(true),
  events: z
    .array(syncIngestEventSchema)
    .min(1)
    .max(SYNC_INGEST_MAX_EVENTS_PER_GROUP)
    .refine(
      (events) => events.every((event) => event.transactionGroupId === events[0]?.transactionGroupId),
      "All events in a group must share transactionGroupId",
    ),
});

export type SyncIngestTransactionGroup = z.infer<typeof syncIngestTransactionGroupSchema>;

export const syncIngestRequestBodySchema = z
  .strictObject({
    protocolVersion: syncProtocolVersionSchema,
    batchId: opaqueIdSchema,
    tenantId: tenantIdSchema,
    stallId: opaqueIdSchema,
    sourceStream: syncSourceStreamSchema,
    groups: z.array(syncIngestTransactionGroupSchema).min(1).max(SYNC_INGEST_MAX_GROUPS),
  })
  .superRefine((value, ctx) => {
    if (value.sourceStream.stallId !== value.stallId) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceStream", "stallId"],
        message: "sourceStream.stallId must match stallId",
      });
    }
    let eventCount = 0;
    const sequences = new Set<string>();
    for (const group of value.groups) {
      eventCount += group.events.length;
      for (const event of group.events) {
        if (sequences.has(event.sequence)) {
          ctx.addIssue({
            code: "custom",
            path: ["groups"],
            message: `Duplicate sequence ${event.sequence} in batch`,
          });
        }
        sequences.add(event.sequence);
      }
    }
    if (eventCount > SYNC_INGEST_MAX_EVENTS) {
      ctx.addIssue({
        code: "custom",
        path: ["groups"],
        message: `Batch exceeds max event count ${SYNC_INGEST_MAX_EVENTS}`,
      });
    }
  });

export type SyncIngestRequestBody = z.infer<typeof syncIngestRequestBodySchema>;

/** Auth envelope fields accompany the JSON body for possession verification. */
export const syncIngestAuthHeadersSchema = z.strictObject({
  tenantId: tenantIdSchema,
  deviceId: deviceIdSchema,
  installationId: opaqueIdSchema,
  credentialVersion: z.number().int().positive(),
  batchId: opaqueIdSchema,
  signedAt: absoluteTimestampSchema,
  bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1).max(256),
});

export type SyncIngestAuthHeaders = z.infer<typeof syncIngestAuthHeadersSchema>;

export const syncIngestFullRequestSchema = z.strictObject({
  auth: syncIngestAuthHeadersSchema,
  body: syncIngestRequestBodySchema,
});

export type SyncIngestFullRequest = z.infer<typeof syncIngestFullRequestSchema>;

export const syncIngestGroupOutcomeSchema = z.strictObject({
  transactionGroupId: opaqueIdSchema,
  outcome: syncIngestOutcomeCodeSchema,
  acknowledgedEventIds: z.array(opaqueIdSchema).max(SYNC_INGEST_MAX_EVENTS_PER_GROUP),
  errorCode: z.string().min(1).max(64).nullable(),
  message: z.string().min(1).max(SYNC_INGEST_MAX_STRING_LENGTH).nullable(),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().nonnegative().nullable().optional(),
});

export type SyncIngestGroupOutcome = z.infer<typeof syncIngestGroupOutcomeSchema>;

export const syncIngestResponseSchema = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSION),
  correlationId: requestIdSchema,
  batchId: opaqueIdSchema,
  tenantId: tenantIdSchema,
  stallId: opaqueIdSchema,
  sourceStreamId: opaqueIdSchema,
  streamGeneration: z.number().int().positive(),
  committedCursor: syncSequenceStringSchema,
  nextExpectedSequence: syncSequenceStringSchema,
  groupOutcomes: z.array(syncIngestGroupOutcomeSchema).max(SYNC_INGEST_MAX_GROUPS),
  /** True only when every submitted group was applied or already_applied. */
  allGroupsAccepted: z.boolean(),
});

export type SyncIngestResponse = z.infer<typeof syncIngestResponseSchema>;

export {
  SYNC_PROTOCOL_VERSION,
  SYNC_INGEST_MAX_EVENTS,
  SYNC_INGEST_MAX_EVENTS_PER_GROUP,
  SYNC_INGEST_MAX_GROUPS,
};
