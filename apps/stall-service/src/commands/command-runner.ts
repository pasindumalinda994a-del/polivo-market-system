import {
  appendAuditEvent,
  appendOutboxEvent,
  classifySqliteError,
  getIdempotencyRecord,
  insertCompletedIdempotencyRecord,
  RevisionConflictError,
  runInTransaction,
  type LocalDatabase,
  type TxHandle,
} from "@polivo/db-local";

import type { AuthorizationAdapter } from "../auth/authorization.js";
import {
  buildExecutionContext,
  buildIdempotencyScope,
  resolveBoundStall,
  type ExecutionContext,
} from "../context/execution-context.js";
import {
  AppError,
  conflictError,
  forbiddenError,
  internalError,
  serviceUnavailableError,
  unauthenticatedError,
} from "../errors/app-error.js";
import { buildCommandFingerprint } from "./fingerprint.js";

export type CommandDefinition<TInput, TResult> = {
  type: string;
  version: string;
  requiredCapability: string;
  /** When true, idempotency scope includes actor and device. */
  scopeToPrincipal?: boolean;
  execute: (args: { tx: TxHandle; context: ExecutionContext; input: TInput }) => TResult;
  /**
   * Optional audit/outbox side effects using the same transaction.
   * Prefer writing audit/outbox here or inside execute — both share the tx.
   */
  afterExecute?: (args: {
    tx: TxHandle;
    context: ExecutionContext;
    input: TInput;
    result: TResult;
  }) => void;
  /** Bounded JSON-serializable result stored for idempotent replay. */
  serializeResult: (result: TResult) => string;
  deserializeResult: (resultRef: string) => TResult;
};

export type CommandDeps = {
  database: LocalDatabase;
  authorization: AuthorizationAdapter;
  now: () => string;
  createId: () => string;
};

export type RunCommandRequest<TInput> = {
  input: TInput;
  requestId: string;
  idempotencyKey: string;
};

export function runIdempotentCommand<TInput, TResult>(
  deps: CommandDeps,
  definition: CommandDefinition<TInput, TResult>,
  request: RunCommandRequest<TInput>,
): TResult {
  const auth = deps.authorization.authorize({
    requiredCapability: definition.requiredCapability,
    requestId: request.requestId,
  });
  if (auth instanceof AppError) {
    throw auth;
  }
  if (!auth.capabilities.has(definition.requiredCapability)) {
    throw forbiddenError(`Missing capability: ${definition.requiredCapability}`);
  }

  const binding = resolveBoundStall(deps.database);
  if (binding instanceof AppError) {
    throw binding;
  }

  const context = buildExecutionContext({
    binding,
    principal: auth,
    capability: definition.requiredCapability,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
  });
  if (context instanceof AppError) {
    throw context;
  }

  const fingerprint = buildCommandFingerprint({
    commandType: definition.type,
    commandVersion: definition.version,
    validatedInput: request.input,
  });

  const scope = buildIdempotencyScope({
    tenantId: context.tenantId,
    stallId: context.stallId,
    commandType: definition.type,
    ...(definition.scopeToPrincipal
      ? { actorRef: context.actorRef, deviceRef: context.deviceRef }
      : {}),
  });

  try {
    return runInTransaction(deps.database.db, (tx) => {
      const existing = getIdempotencyRecord(tx, scope, request.idempotencyKey);
      if (existing !== null) {
        if (existing.requestFingerprint !== fingerprint) {
          throw conflictError("Idempotency key was reused with a different request payload.");
        }
        if (existing.completedAt === null || existing.resultRef === null) {
          throw conflictError("Idempotency key is already in use.");
        }
        return definition.deserializeResult(existing.resultRef);
      }

      const result = definition.execute({ tx, context, input: request.input });
      definition.afterExecute?.({ tx, context, input: request.input, result });

      const completedAt = deps.now();
      insertCompletedIdempotencyRecord(tx, {
        scope,
        idempotencyKey: request.idempotencyKey,
        commandType: definition.type,
        requestFingerprint: fingerprint,
        resultRef: definition.serializeResult(result),
        completedAt,
        createdAt: completedAt,
      });

      return result;
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof RevisionConflictError) {
      throw conflictError(error.message);
    }
    const classified = classifySqliteError(error);
    if (classified.kind === "busy") {
      throw serviceUnavailableError(
        "Database is temporarily busy. Retry with the same idempotency key.",
      );
    }
    if (classified.kind === "unique_constraint") {
      // Concurrent duplicate: re-read after the other transaction committed.
      const replay = getIdempotencyRecord(deps.database, scope, request.idempotencyKey);
      if (
        replay !== null &&
        replay.requestFingerprint === fingerprint &&
        replay.resultRef !== null &&
        replay.completedAt !== null
      ) {
        return definition.deserializeResult(replay.resultRef);
      }
      if (replay !== null && replay.requestFingerprint !== fingerprint) {
        throw conflictError("Idempotency key was reused with a different request payload.");
      }
      throw internalError("Unexpected uniqueness violation during command execution.", error);
    }
    if (classified.kind === "unavailable") {
      throw serviceUnavailableError("Local storage is unavailable.");
    }
    throw internalError("Command execution failed.", error);
  }
}

/** Helper used by test/fixture commands to write required audit + outbox rows. */
export function writeAuditAndOutbox(args: {
  tx: TxHandle;
  context: ExecutionContext;
  action: string;
  targetType?: string;
  targetId?: string;
  eventType: string;
  eventSchemaVersion: string;
  payload: unknown;
  eventId: string;
  auditId: string;
  now: string;
}): void {
  appendAuditEvent(args.tx, {
    id: args.auditId,
    stallId: args.context.stallId,
    tenantId: args.context.tenantId,
    actorRef: args.context.actorRef,
    deviceRef: args.context.deviceRef,
    action: args.action,
    targetType: args.targetType ?? null,
    targetId: args.targetId ?? null,
    occurredAt: args.now,
    correlationRef: args.context.requestId,
  });

  appendOutboxEvent(args.tx, {
    eventId: args.eventId,
    tenantId: args.context.tenantId,
    stallId: args.context.stallId,
    originatingDeviceId: args.context.deviceRef,
    eventType: args.eventType,
    eventSchemaVersion: args.eventSchemaVersion,
    payloadJson: JSON.stringify(args.payload),
    occurredAt: args.now,
  });
}

export function mapAuthFailure(error: AppError): AppError {
  if (error.code === "UNAUTHENTICATED") {
    return unauthenticatedError(error.message);
  }
  return error;
}
