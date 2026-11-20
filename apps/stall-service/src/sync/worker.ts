import { randomUUID } from "node:crypto";

import {
  acknowledgeOutboxEvents,
  acquireSyncWorkerLease,
  blockOutboxGroup,
  clearOutboxRetryGateForStall,
  clearSyncStreamBlockingForManualRetry,
  ensureSyncStreamState,
  getMaxOutboxSequence,
  getStallBinding,
  releaseSyncWorkerLease,
  recordOutboxAttempt,
  runInTransaction,
  setSyncStreamBlocked,
  setSyncStreamRetry,
  tryGetHostEnrollment,
  updateSyncStreamProgress,
  type LocalDatabase,
} from "@polivo/db-local";

import { buildNextSyncBatch } from "./batch.js";
import { AckValidationError, validateIngestAcknowledgement } from "./ack.js";
import { subscribeSyncOutboxWake } from "./notify.js";
import {
  BLOCKING_INGEST_OUTCOMES,
  isBlockingErrorCode,
  nextRetryAtIso,
  TRANSIENT_INGEST_OUTCOMES,
  type RetryClock,
} from "./retry.js";
import {
  createHostIngestSigner,
  HostCredentialConfigurationError,
  type HostIngestSigner,
} from "./signer.js";
import { buildSyncWorkerStatus } from "./status.js";
import type { SyncTransport } from "./transport.js";
import type { SecureStorageAdapter } from "../security/secure-storage.js";

const LEASE_TTL_MS = 60_000;
const POLL_INTERVAL_MS = 5_000;
const MAX_CYCLES_PER_WAKE = 8;

export type SyncWorkerOptions = {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  transport: SyncTransport | null;
  ingestConfigured: boolean;
  configurationMessage: string | null;
  now: () => string;
  createId: () => string;
  random?: () => number;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export type SyncWorkerHandle = {
  start: () => void;
  stop: () => Promise<void>;
  wake: () => void;
  requestManualRetry: () => { accepted: boolean; message: string | null };
  getStatus: () => ReturnType<typeof buildSyncWorkerStatus>;
  isUploading: () => boolean;
};

export function createOutboxSyncWorker(options: SyncWorkerOptions): SyncWorkerHandle {
  const ownerToken = randomUUID();
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const clock: RetryClock = {
    nowMs: () => Date.parse(options.now()),
    random: options.random ?? Math.random,
  };

  let started = false;
  let stopping = false;
  let uploading = false;
  let wakePending = false;
  let timer: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;
  let cyclePromise: Promise<void> | null = null;
  let attemptIndex = 0;
  let configurationMessage = options.configurationMessage;
  let signer: HostIngestSigner | null = null;

  const resolveBinding = () => {
    const binding = getStallBinding(options.database);
    const host = tryGetHostEnrollment(options.database);
    return { binding, host };
  };

  const ensureSigner = (): HostIngestSigner => {
    if (signer) {
      return signer;
    }
    const { binding } = resolveBinding();
    signer = createHostIngestSigner({
      database: options.database,
      secureStorage: options.secureStorage,
      stallId: binding.stallId,
      tenantId: binding.tenantId,
    });
    return signer;
  };

  const getStatus = () => {
    const { binding, host } = resolveBinding();
    const sourceReady =
      Boolean(host && host.activationState === "activated") &&
      options.ingestConfigured &&
      options.transport !== null;
    return buildSyncWorkerStatus({
      database: options.database,
      stallId: binding.stallId,
      workerEnabled: options.enabled !== false,
      sourceReady,
      uploading,
      configurationMessage,
    });
  };

  const acquireLease = () => {
    const { binding } = resolveBinding();
    const now = options.now();
    const expiresAt = new Date(Date.parse(now) + LEASE_TTL_MS).toISOString();
    return runInTransaction(options.database.db, (tx) =>
      acquireSyncWorkerLease(tx, {
        stallId: binding.stallId,
        ownerToken,
        now,
        expiresAt,
      }),
    );
  };

  const runCycle = async (): Promise<"idle" | "progress" | "retry" | "blocked" | "skipped"> => {
    if (!options.ingestConfigured || !options.transport || options.enabled === false) {
      configurationMessage =
        configurationMessage ?? "Sync ingest URL is not configured or the worker is disabled.";
      return "skipped";
    }

    const { binding, host } = resolveBinding();
    if (!host || host.activationState !== "activated") {
      configurationMessage = "Host is not activated for sync uploads.";
      return "skipped";
    }

    const leaseResult = acquireLease();
    if (!leaseResult.acquired || !leaseResult.lease) {
      return "skipped";
    }
    const fenceToken = leaseResult.lease.fenceToken;
    const now = options.now();

    let stream;
    try {
      stream = runInTransaction(options.database.db, (tx) =>
        ensureSyncStreamState(tx, {
          stallId: binding.stallId,
          sourceStreamId: host.installationId,
          updatedAt: now,
        }),
      );
    } catch (error) {
      configurationMessage = error instanceof Error ? error.message : String(error);
      return "blocked";
    }

    if (stream.blockingErrorCode) {
      return "blocked";
    }
    if (stream.nextRetryAt && Date.parse(stream.nextRetryAt) > Date.parse(now)) {
      return "retry";
    }

    const batchResult = buildNextSyncBatch({
      database: options.database,
      stallId: binding.stallId,
      tenantId: binding.tenantId,
      sourceStreamId: stream.sourceStreamId,
      streamGeneration: stream.streamGeneration,
      afterSequence: stream.acknowledgedCursor,
      eligibleAt: now,
      createBatchId: options.createId,
    });

    if (batchResult.kind === "empty") {
      const tail = getMaxOutboxSequence(options.database, binding.stallId);
      runInTransaction(options.database.db, (tx) => {
        updateSyncStreamProgress(tx, {
          stallId: binding.stallId,
          fenceToken,
          acknowledgedCursor: stream.acknowledgedCursor,
          localTailSequence: tail,
          localTailMeasuredAt: now,
          updatedAt: now,
          clearBlocking: true,
        });
      });
      attemptIndex = 0;
      return "idle";
    }

    if (batchResult.kind === "blocked") {
      runInTransaction(options.database.db, (tx) => {
        blockOutboxGroup(tx, {
          stallId: binding.stallId,
          transactionGroupId: batchResult.groupId,
          errorCode: batchResult.errorCode,
          blockedAt: now,
        });
        setSyncStreamBlocked(tx, {
          stallId: binding.stallId,
          fenceToken,
          blockingGroupId: batchResult.groupId,
          blockingEventId: batchResult.eventId,
          blockingErrorCode: batchResult.errorCode,
          blockingMessage: batchResult.message,
          lastUploadAttemptAt: now,
          updatedAt: now,
        });
      });
      return "blocked";
    }

    const { batch } = batchResult;
    let activeSigner: HostIngestSigner;
    try {
      activeSigner = ensureSigner();
      activeSigner.loadIdentity();
      configurationMessage = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      configurationMessage = message;
      const code =
        error instanceof HostCredentialConfigurationError
          ? error.code
          : "HOST_CREDENTIAL_CONFIGURATION";
      runInTransaction(options.database.db, (tx) => {
        setSyncStreamBlocked(tx, {
          stallId: binding.stallId,
          fenceToken,
          blockingGroupId: batch.events[0]!.transactionGroupId,
          blockingEventId: batch.events[0]!.eventId,
          blockingErrorCode: code,
          blockingMessage: message,
          lastUploadAttemptAt: now,
          updatedAt: now,
        });
      });
      return "blocked";
    }

    const signedAt = options.now();
    const signed = activeSigner.signBody({
      rawBody: batch.rawBody,
      batchId: batch.body.batchId,
      signedAt,
    });

    runInTransaction(options.database.db, (tx) => {
      recordOutboxAttempt(tx, {
        eventIds: batch.events.map((event) => event.eventId),
        attemptedAt: signedAt,
      });
    });

    uploading = true;
    const transportResult = await options.transport.upload(signed);
    uploading = false;

    if (transportResult.kind !== "ack") {
      const retryable =
        transportResult.kind === "malformed_response" ? true : transportResult.retryable;
      const errorCode = transportResult.errorCode;
      const message = transportResult.message;
      if (!retryable || isBlockingErrorCode(errorCode)) {
        runInTransaction(options.database.db, (tx) => {
          blockOutboxGroup(tx, {
            stallId: binding.stallId,
            transactionGroupId: batch.events[0]!.transactionGroupId,
            errorCode,
            blockedAt: options.now(),
          });
          setSyncStreamBlocked(tx, {
            stallId: binding.stallId,
            fenceToken,
            blockingGroupId: batch.events[0]!.transactionGroupId,
            blockingEventId: batch.events[0]!.eventId,
            blockingErrorCode: errorCode,
            blockingMessage: message,
            lastUploadAttemptAt: options.now(),
            updatedAt: options.now(),
          });
        });
        return "blocked";
      }

      const nextRetry = nextRetryAtIso(attemptIndex, clock);
      attemptIndex += 1;
      runInTransaction(options.database.db, (tx) => {
        recordOutboxAttempt(tx, {
          eventIds: batch.events.map((event) => event.eventId),
          attemptedAt: options.now(),
          nextRetryAt: nextRetry,
          lastErrorCode: errorCode,
        });
        setSyncStreamRetry(tx, {
          stallId: binding.stallId,
          fenceToken,
          nextRetryAt: nextRetry,
          lastErrorCode: errorCode,
          lastUploadAttemptAt: options.now(),
          updatedAt: options.now(),
        });
      });
      return "retry";
    }

    let verified;
    try {
      verified = validateIngestAcknowledgement({
        batch,
        response: transportResult.body,
        expectedSourceStreamId: stream.sourceStreamId,
        expectedStreamGeneration: stream.streamGeneration,
        expectedTenantId: binding.tenantId,
        expectedStallId: binding.stallId,
      });
    } catch (error) {
      const code = error instanceof AckValidationError ? error.code : "MALFORMED_ACK";
      const nextRetry = nextRetryAtIso(attemptIndex, clock);
      attemptIndex += 1;
      runInTransaction(options.database.db, (tx) => {
        recordOutboxAttempt(tx, {
          eventIds: batch.events.map((event) => event.eventId),
          attemptedAt: options.now(),
          nextRetryAt: nextRetry,
          lastErrorCode: code,
        });
        setSyncStreamRetry(tx, {
          stallId: binding.stallId,
          fenceToken,
          nextRetryAt: nextRetry,
          lastErrorCode: code,
          lastUploadAttemptAt: options.now(),
          updatedAt: options.now(),
        });
      });
      return "retry";
    }

    const ackAt = options.now();
    if (verified.acknowledgedEventIds.length > 0) {
      runInTransaction(options.database.db, (tx) => {
        acknowledgeOutboxEvents(tx, {
          stallId: binding.stallId,
          eventIds: verified.acknowledgedEventIds,
          acknowledgedAt: ackAt,
          ackReceiptJson: JSON.stringify({
            batchId: transportResult.body.batchId,
            correlationId: transportResult.body.correlationId,
            committedCursor: transportResult.body.committedCursor,
            acknowledgedEventIds: verified.acknowledgedEventIds,
          }),
          ackPayloadHash: null,
          fenceToken,
        });
        updateSyncStreamProgress(tx, {
          stallId: binding.stallId,
          fenceToken,
          acknowledgedCursor: verified.committedCursor,
          localTailSequence: getMaxOutboxSequence(tx, binding.stallId),
          localTailMeasuredAt: ackAt,
          lastUploadAttemptAt: ackAt,
          lastAckAt: ackAt,
          nextRetryAt: null,
          clearBlocking: true,
          updatedAt: ackAt,
        });
      });
      attemptIndex = 0;
    }

    if (verified.firstFailure) {
      const failure = verified.firstFailure;
      const blocking =
        !failure.retryable ||
        BLOCKING_INGEST_OUTCOMES.has(failure.outcome) ||
        isBlockingErrorCode(failure.errorCode);
      if (blocking) {
        runInTransaction(options.database.db, (tx) => {
          blockOutboxGroup(tx, {
            stallId: binding.stallId,
            transactionGroupId: failure.groupId,
            errorCode: failure.errorCode ?? failure.outcome,
            blockedAt: options.now(),
          });
          setSyncStreamBlocked(tx, {
            stallId: binding.stallId,
            fenceToken,
            blockingGroupId: failure.groupId,
            blockingEventId: null,
            blockingErrorCode: failure.errorCode ?? failure.outcome,
            blockingMessage: failure.message,
            lastUploadAttemptAt: options.now(),
            updatedAt: options.now(),
          });
        });
        return "blocked";
      }

      if (TRANSIENT_INGEST_OUTCOMES.has(failure.outcome) || failure.retryable) {
        const nextRetry = nextRetryAtIso(attemptIndex, clock, failure.retryAfterSeconds);
        attemptIndex += 1;
        const remainingIds = batch.events
          .filter((event) => !verified.acknowledgedEventIds.includes(event.eventId))
          .map((event) => event.eventId);
        runInTransaction(options.database.db, (tx) => {
          recordOutboxAttempt(tx, {
            eventIds: remainingIds,
            attemptedAt: options.now(),
            nextRetryAt: nextRetry,
            lastErrorCode: failure.errorCode ?? failure.outcome,
          });
          setSyncStreamRetry(tx, {
            stallId: binding.stallId,
            fenceToken,
            nextRetryAt: nextRetry,
            lastErrorCode: failure.errorCode ?? failure.outcome,
            lastUploadAttemptAt: options.now(),
            updatedAt: options.now(),
          });
        });
        return "retry";
      }
    }

    return verified.acknowledgedEventIds.length > 0 ? "progress" : "idle";
  };

  const pump = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    let cycles = 0;
    let result: "idle" | "progress" | "retry" | "blocked" | "skipped";
    do {
      wakePending = false;
      result = await runCycle();
      cycles += 1;
    } while (!stopping && (result === "progress" || wakePending) && cycles < MAX_CYCLES_PER_WAKE);
  };

  const schedule = (): void => {
    if (!started || stopping) {
      return;
    }
    if (cyclePromise) {
      wakePending = true;
      return;
    }
    cyclePromise = pump()
      .catch(() => {
        // Cycle errors are persisted as retry/block state; keep the loop alive.
      })
      .finally(() => {
        cyclePromise = null;
        if (wakePending && !stopping) {
          schedule();
        }
      });
  };

  return {
    start: () => {
      if (started) {
        return;
      }
      started = true;
      stopping = false;
      unsubscribe = subscribeSyncOutboxWake(() => {
        wakePending = true;
        schedule();
      });
      timer = setInterval(() => {
        schedule();
      }, pollIntervalMs);
      schedule();
    },
    stop: async () => {
      stopping = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (cyclePromise) {
        await cyclePromise;
      }
      try {
        const { binding } = resolveBinding();
        runInTransaction(options.database.db, (tx) => {
          releaseSyncWorkerLease(tx, binding.stallId, ownerToken, options.now());
        });
      } catch {
        // Shutdown must proceed even if lease release fails.
      }
      started = false;
      uploading = false;
    },
    wake: () => {
      wakePending = true;
      schedule();
    },
    requestManualRetry: () => {
      try {
        const { binding } = resolveBinding();
        const now = options.now();
        runInTransaction(options.database.db, (tx) => {
          clearOutboxRetryGateForStall(tx, binding.stallId, now);
          const stream = ensureSyncStreamState(tx, {
            stallId: binding.stallId,
            sourceStreamId:
              tryGetHostEnrollment(options.database)?.installationId ?? binding.stallId,
            updatedAt: now,
          });
          void stream;
          clearSyncStreamBlockingForManualRetry(tx, binding.stallId, now);
        });
        attemptIndex = 0;
        wakePending = true;
        schedule();
        return { accepted: true, message: null };
      } catch (error) {
        return {
          accepted: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    getStatus,
    isUploading: () => uploading,
  };
}
