import {
  SYNC_INGEST_MAX_EVENTS,
  SYNC_INGEST_MAX_EVENTS_PER_GROUP,
  SYNC_INGEST_MAX_GROUPS,
  SYNC_INGEST_MAX_REQUEST_BYTES,
  SYNC_PROTOCOL_VERSION,
  syncIngestRequestBodySchema,
  type SyncIngestRequestBody,
  type SyncIngestTransactionGroup,
} from "@polivo/contracts";
import {
  listPendingOutboxEvents,
  type LocalDatabase,
  type OutboxEventRecord,
} from "@polivo/db-local";

import { EnrichmentError, enrichOutboxEventForUpload } from "./enrich.js";

export type BuiltSyncBatch = {
  body: SyncIngestRequestBody;
  rawBody: string;
  events: OutboxEventRecord[];
  groups: SyncIngestTransactionGroup[];
};

export type BatchBuildResult =
  | { kind: "empty" }
  | { kind: "batch"; batch: BuiltSyncBatch }
  | {
      kind: "blocked";
      errorCode: string;
      message: string;
      groupId: string;
      eventId: string | null;
      events: OutboxEventRecord[];
    };

function groupPendingEvents(events: OutboxEventRecord[]): OutboxEventRecord[][] {
  const groups: OutboxEventRecord[][] = [];
  let current: OutboxEventRecord[] = [];
  let currentGroupId: string | null = null;
  for (const event of events) {
    if (currentGroupId === null || event.transactionGroupId !== currentGroupId) {
      if (current.length > 0) {
        groups.push(current);
      }
      current = [event];
      currentGroupId = event.transactionGroupId;
    } else {
      current.push(event);
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/**
 * Read the next complete bounded batch. Never splits a transaction group.
 * Does not hold a SQLite write transaction during enrichment.
 */
export function buildNextSyncBatch(input: {
  database: LocalDatabase;
  stallId: string;
  tenantId: string;
  sourceStreamId: string;
  streamGeneration: number;
  afterSequence: number;
  eligibleAt: string;
  createBatchId: () => string;
}): BatchBuildResult {
  const pending = listPendingOutboxEvents(input.database, {
    stallId: input.stallId,
    afterSequence: input.afterSequence,
    limit: SYNC_INGEST_MAX_EVENTS + SYNC_INGEST_MAX_EVENTS_PER_GROUP,
    eligibleAt: input.eligibleAt,
  });
  if (pending.length === 0) {
    return { kind: "empty" };
  }

  const pendingGroups = groupPendingEvents(pending);
  const selectedGroups: SyncIngestTransactionGroup[] = [];
  const selectedEvents: OutboxEventRecord[] = [];

  for (const groupEvents of pendingGroups) {
    if (groupEvents.length > SYNC_INGEST_MAX_EVENTS_PER_GROUP) {
      return {
        kind: "blocked",
        errorCode: "OVERSIZED_TRANSACTION_GROUP",
        message: `Transaction group exceeds max events per group (${SYNC_INGEST_MAX_EVENTS_PER_GROUP}).`,
        groupId: groupEvents[0]!.transactionGroupId,
        eventId: groupEvents[0]!.eventId,
        events: groupEvents,
      };
    }

    let wireEvents;
    try {
      wireEvents = groupEvents.map((event) => enrichOutboxEventForUpload(input.database, event));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof EnrichmentError ? error.code : "ENRICHMENT_FAILED";
      return {
        kind: "blocked",
        errorCode: code,
        message,
        groupId: groupEvents[0]!.transactionGroupId,
        eventId: groupEvents[0]!.eventId,
        events: groupEvents,
      };
    }

    const candidateGroups = [
      ...selectedGroups,
      {
        transactionGroupId: groupEvents[0]!.transactionGroupId,
        complete: true as const,
        events: wireEvents,
      },
    ];
    const candidateEvents = [...selectedEvents, ...groupEvents];
    if (candidateGroups.length > SYNC_INGEST_MAX_GROUPS) {
      break;
    }
    if (candidateEvents.length > SYNC_INGEST_MAX_EVENTS) {
      if (selectedGroups.length === 0) {
        return {
          kind: "blocked",
          errorCode: "OVERSIZED_TRANSACTION_GROUP",
          message: "Single transaction group exceeds the max event count for one ingest request.",
          groupId: groupEvents[0]!.transactionGroupId,
          eventId: groupEvents[0]!.eventId,
          events: groupEvents,
        };
      }
      break;
    }

    const body: SyncIngestRequestBody = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: input.createBatchId(),
      tenantId: input.tenantId,
      stallId: input.stallId,
      sourceStream: {
        sourceStreamId: input.sourceStreamId,
        streamGeneration: input.streamGeneration,
        stallId: input.stallId,
      },
      groups: candidateGroups,
    };
    const parsed = syncIngestRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return {
        kind: "blocked",
        errorCode: "VALIDATION_FAILURE",
        message: parsed.error.issues[0]?.message ?? "Local ingest batch validation failed.",
        groupId: groupEvents[0]!.transactionGroupId,
        eventId: groupEvents[0]!.eventId,
        events: groupEvents,
      };
    }
    const rawBody = JSON.stringify(parsed.data);
    if (Buffer.byteLength(rawBody, "utf8") > SYNC_INGEST_MAX_REQUEST_BYTES) {
      if (selectedGroups.length === 0) {
        return {
          kind: "blocked",
          errorCode: "OVERSIZED_TRANSACTION_GROUP",
          message: "Single transaction group exceeds the encoded request byte limit.",
          groupId: groupEvents[0]!.transactionGroupId,
          eventId: groupEvents[0]!.eventId,
          events: groupEvents,
        };
      }
      break;
    }

    selectedGroups.push(candidateGroups[candidateGroups.length - 1]!);
    selectedEvents.push(...groupEvents);
  }

  if (selectedGroups.length === 0) {
    return { kind: "empty" };
  }

  const body: SyncIngestRequestBody = {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    batchId: input.createBatchId(),
    tenantId: input.tenantId,
    stallId: input.stallId,
    sourceStream: {
      sourceStreamId: input.sourceStreamId,
      streamGeneration: input.streamGeneration,
      stallId: input.stallId,
    },
    groups: selectedGroups,
  };
  const parsed = syncIngestRequestBodySchema.parse(body);
  return {
    kind: "batch",
    batch: {
      body: parsed,
      rawBody: JSON.stringify(parsed),
      events: selectedEvents,
      groups: selectedGroups,
    },
  };
}
