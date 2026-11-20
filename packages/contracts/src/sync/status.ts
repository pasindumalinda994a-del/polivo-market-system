import { z } from "zod";

import { absoluteTimestampSchema, opaqueIdSchema } from "../primitives.js";
import { syncSequenceStringSchema } from "./ingest.js";

export const SYNC_WORKER_STATUS_STATES = [
  "up_to_date",
  "uploading",
  "waiting_retry",
  "paused",
  "configuration_required",
  "blocked",
] as const;

export const syncWorkerStatusStateSchema = z.enum(SYNC_WORKER_STATUS_STATES);
export type SyncWorkerStatusState = z.infer<typeof syncWorkerStatusStateSchema>;

export const syncWorkerStatusSchema = z.strictObject({
  workerEnabled: z.boolean(),
  sourceReady: z.boolean(),
  state: syncWorkerStatusStateSchema,
  pendingEventCount: z.number().int().nonnegative(),
  pendingGroupCount: z.number().int().nonnegative(),
  oldestPendingOccurredAt: absoluteTimestampSchema.nullable(),
  lastUploadAttemptAt: absoluteTimestampSchema.nullable(),
  lastAcknowledgedAt: absoluteTimestampSchema.nullable(),
  acknowledgedCursor: syncSequenceStringSchema,
  localTailSequence: syncSequenceStringSchema,
  localTailMeasuredAt: absoluteTimestampSchema.nullable(),
  nextRetryAt: absoluteTimestampSchema.nullable(),
  blockingErrorCode: z.string().min(1).max(64).nullable(),
  blockingGroupId: opaqueIdSchema.nullable(),
  blockingMessage: z.string().max(500).nullable(),
  sourceStreamId: opaqueIdSchema.nullable(),
  streamGeneration: z.number().int().positive().nullable(),
  configurationMessage: z.string().max(500).nullable(),
});

export type SyncWorkerStatus = z.infer<typeof syncWorkerStatusSchema>;

export const syncWorkerRetryResponseSchema = z.strictObject({
  accepted: z.boolean(),
  status: syncWorkerStatusSchema,
  message: z.string().max(500).nullable(),
});

export type SyncWorkerRetryResponse = z.infer<typeof syncWorkerRetryResponseSchema>;
