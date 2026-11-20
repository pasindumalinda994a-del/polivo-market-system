import type { SyncIngestResponse } from "@polivo/contracts";

import type { BuiltSyncBatch } from "./batch.js";

export type VerifiedAckProgress = {
  acknowledgedEventIds: string[];
  acknowledgedGroupIds: string[];
  committedCursor: number;
  allAccepted: boolean;
  firstFailure: {
    groupId: string;
    outcome: string;
    errorCode: string | null;
    message: string | null;
    retryable: boolean;
    retryAfterSeconds: number | null;
  } | null;
};

export class AckValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AckValidationError";
    this.code = code;
  }
}

/**
 * Validate a Phase 31 acknowledgement before advancing local delivery state.
 * HTTP success alone is insufficient; only explicitly acknowledged identities advance.
 */
export function validateIngestAcknowledgement(input: {
  batch: BuiltSyncBatch;
  response: SyncIngestResponse;
  expectedSourceStreamId: string;
  expectedStreamGeneration: number;
  expectedTenantId: string;
  expectedStallId: string;
}): VerifiedAckProgress {
  const { batch, response } = input;

  if (response.batchId !== batch.body.batchId) {
    throw new AckValidationError(
      "ACK_BATCH_MISMATCH",
      "Acknowledgement batchId does not match the request.",
    );
  }
  if (response.tenantId !== input.expectedTenantId || response.stallId !== input.expectedStallId) {
    throw new AckValidationError(
      "ACK_SCOPE_MISMATCH",
      "Acknowledgement tenant/stall does not match the local stream.",
    );
  }
  if (
    response.sourceStreamId !== input.expectedSourceStreamId ||
    response.streamGeneration !== input.expectedStreamGeneration
  ) {
    throw new AckValidationError(
      "ACK_STREAM_MISMATCH",
      "Acknowledgement stream identity or generation does not match local state.",
    );
  }

  const submittedEventIds = new Set(batch.events.map((event) => event.eventId));
  const submittedByGroup = new Map(
    batch.groups.map((group) => [
      group.transactionGroupId,
      new Set(group.events.map((event) => event.eventId)),
    ]),
  );

  const acknowledgedEventIds: string[] = [];
  const acknowledgedGroupIds: string[] = [];
  let firstFailure: VerifiedAckProgress["firstFailure"] = null;
  let stop = false;

  for (const outcome of response.groupOutcomes) {
    if (stop) {
      break;
    }
    const submitted = submittedByGroup.get(outcome.transactionGroupId);
    if (!submitted) {
      throw new AckValidationError(
        "ACK_UNKNOWN_GROUP",
        `Acknowledgement referenced unknown group "${outcome.transactionGroupId}".`,
      );
    }

    for (const eventId of outcome.acknowledgedEventIds) {
      if (!submitted.has(eventId) || !submittedEventIds.has(eventId)) {
        throw new AckValidationError(
          "ACK_BEYOND_SUBMITTED",
          `Acknowledgement included event "${eventId}" that was not submitted or verified locally.`,
        );
      }
    }

    if (outcome.outcome === "applied" || outcome.outcome === "already_applied") {
      if (outcome.acknowledgedEventIds.length === 0) {
        throw new AckValidationError(
          "ACK_EMPTY_GROUP",
          `Accepted group "${outcome.transactionGroupId}" did not acknowledge any events.`,
        );
      }
      acknowledgedGroupIds.push(outcome.transactionGroupId);
      acknowledgedEventIds.push(...outcome.acknowledgedEventIds);
      continue;
    }

    firstFailure = {
      groupId: outcome.transactionGroupId,
      outcome: outcome.outcome,
      errorCode: outcome.errorCode,
      message: outcome.message,
      retryable: outcome.retryable,
      retryAfterSeconds: outcome.retryAfterSeconds ?? null,
    };
    stop = true;
  }

  const committedCursor = Number(response.committedCursor);
  if (!Number.isSafeInteger(committedCursor) || committedCursor < 0) {
    throw new AckValidationError(
      "ACK_CURSOR_INVALID",
      "Acknowledgement committedCursor is invalid.",
    );
  }

  if (acknowledgedEventIds.length > 0) {
    const maxAckSequence = Math.max(
      ...batch.events
        .filter((event) => acknowledgedEventIds.includes(event.eventId))
        .map((event) => event.localSequence),
    );
    if (committedCursor < maxAckSequence && response.allGroupsAccepted) {
      throw new AckValidationError(
        "ACK_CURSOR_BEHIND",
        "Acknowledgement committedCursor is behind locally verified acknowledged events.",
      );
    }
    // Do not advance beyond locally verified content.
    if (committedCursor > maxAckSequence) {
      // Cap progress to the verified prefix; cloud may be ahead after lost responses.
    }
  }

  return {
    acknowledgedEventIds: [...new Set(acknowledgedEventIds)],
    acknowledgedGroupIds,
    committedCursor: Math.min(
      committedCursor,
      acknowledgedEventIds.length === 0
        ? Number(response.committedCursor)
        : Math.max(
            ...batch.events
              .filter((event) => acknowledgedEventIds.includes(event.eventId))
              .map((event) => event.localSequence),
          ),
    ),
    allAccepted: response.allGroupsAccepted && firstFailure === null,
    firstFailure,
  };
}
