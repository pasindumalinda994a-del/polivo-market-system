import {
  accountMovementsQuerySchema,
  accountMovementsResponseSchema,
  correctOpeningRequestSchema,
  idempotencyKeySchema,
  ledgerPartyKindSchema,
  ledgerPostingDetailSchema,
  opaqueIdSchema,
  postOpeningDraftRequestSchema,
  prepareOpeningDraftRequestSchema,
  updateOpeningDraftRequestSchema,
} from "@polivo/contracts";
import {
  getActiveOpeningDraft,
  getLedgerPostingById,
  getOpeningDraftById,
  listAccountMovements,
  listLedgerEntriesForPosting,
} from "@polivo/db-local";
import { balanceDirectionLabel } from "@polivo/domain";
import type { FastifyInstance } from "fastify";

import {
  ACCOUNTS_OPENING_CORRECT_CAPABILITY,
  ACCOUNTS_OPENING_POST_CAPABILITY,
  ACCOUNTS_OPENING_PREPARE_CAPABILITY,
  ACCOUNTS_VIEW_CAPABILITY,
  loadAccountBalanceForRead,
  runCorrectOpeningCommand,
  runPostOpeningDraftCommand,
  runPrepareOpeningDraftCommand,
  runUpdateOpeningDraftCommand,
  toOpeningDraftDto,
} from "../commands/opening-balance-commands.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { resolveBoundStall } from "../context/execution-context.js";
import { AppError, notFoundError, serviceUnavailableError } from "../errors/app-error.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";
import { parseWithSchema } from "./validation.js";

function requireDatabase(deps: ServiceDependencies) {
  if (!deps.database) {
    throw serviceUnavailableError("Local database is not available.");
  }
  return deps.database;
}

function authorizeCapability(
  deps: ServiceDependencies,
  capability: string,
  args: {
    requestId: string;
    deviceProof: import("../auth/device-proof.js").DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
  },
) {
  const auth = deps.authorization.authorize({
    requiredCapability: capability,
    requestId: args.requestId,
    deviceProof: args.deviceProof,
    sessionSecret: args.sessionSecret,
    method: args.method,
    path: args.path,
    touchActivity: false,
  });
  if (auth instanceof AppError) {
    throw auth;
  }
  if (!auth.capabilities.has(capability)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${capability}`,
    });
  }
  return auth;
}

function parseIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const header = request.headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  return parseWithSchema(idempotencyKeySchema, raw, "idempotency-key header");
}

function parseSequenceCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(cursor)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid pagination cursor.",
      issues: [
        {
          path: "cursor",
          code: "invalid_type",
          message: "Cursor must be a non-negative integer posting sequence.",
        },
      ],
    });
  }
  return Number.parseInt(cursor, 10);
}

/**
 * Account balance/movement reads and opening-balance workflow routes.
 * Opening mutations require dedicated accounts.* capabilities.
 */
export function registerAccountRoutes(app: FastifyInstance, deps: ServiceDependencies): void {
  app.get("/accounts/:partyKind/:partyId/balance", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const params = request.params as { partyKind: string; partyId: string };
    const partyKind = parseWithSchema(ledgerPartyKindSchema, params.partyKind, "partyKind");
    const partyId = parseWithSchema(opaqueIdSchema, params.partyId, "partyId");
    const authPath = `/accounts/${partyKind}/${partyId}/balance`;
    authorizeCapability(deps, ACCOUNTS_VIEW_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: authPath,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = request.query as { asOfBusinessDate?: string };
    const balance = loadAccountBalanceForRead(
      database,
      binding.stallId,
      partyKind,
      partyId,
      query.asOfBusinessDate,
    );
    return reply.code(200).send(balance);
  });

  app.get("/accounts/:partyKind/:partyId/movements", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const params = request.params as { partyKind: string; partyId: string };
    const partyKind = parseWithSchema(ledgerPartyKindSchema, params.partyKind, "partyKind");
    const partyId = parseWithSchema(opaqueIdSchema, params.partyId, "partyId");
    const authPath = `/accounts/${partyKind}/${partyId}/movements`;
    authorizeCapability(deps, ACCOUNTS_VIEW_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: authPath,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const query = parseWithSchema(accountMovementsQuerySchema, request.query, "query");
    loadAccountBalanceForRead(database, binding.stallId, partyKind, partyId);

    const page = listAccountMovements(database, {
      stallId: binding.stallId,
      partyKind,
      partyId,
      limit: query.limit,
      afterSequence: parseSequenceCursor(query.cursor),
      asOfBusinessDate: query.asOfBusinessDate,
    });

    let running = page.precedingBalanceMinor;
    const items = page.items.map((item) => {
      running += item.amountMinor;
      return {
        entryId: item.id,
        postingId: item.postingId,
        businessDate: item.businessDate,
        recordedAt: item.recordedAt,
        postingSequence: item.postingSequence,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        financialEventType: item.financialEventType,
        description: item.description,
        amountMinor: item.amountMinor,
        directionLabel: balanceDirectionLabel(partyKind, item.amountMinor),
        runningBalanceMinor: running,
        reversesEntryId: item.reversesEntryId,
        reversedByEntryId: item.reversedByEntryId,
      };
    });

    return reply.code(200).send(
      accountMovementsResponseSchema.parse({
        precedingBalanceMinor: page.precedingBalanceMinor,
        items,
        nextCursor:
          page.nextCursorSequence === null ? null : String(page.nextCursorSequence),
      }),
    );
  });

  app.get("/ledger/postings/:postingId", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const postingId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { postingId: string }).postingId,
      "postingId",
    );
    const authPath = `/ledger/postings/${postingId}`;
    authorizeCapability(deps, ACCOUNTS_VIEW_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: authPath,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const posting = getLedgerPostingById(database, binding.stallId, postingId);
    if (posting === null) {
      throw notFoundError("Ledger posting not found.");
    }
    const entries = listLedgerEntriesForPosting(database, binding.stallId, postingId);
    return reply.code(200).send(
      ledgerPostingDetailSchema.parse({
        postingId: posting.id,
        stallId: posting.stallId,
        sourceType: posting.sourceType,
        sourceId: posting.sourceId,
        financialEventType: posting.financialEventType,
        eventSequence: posting.eventSequence,
        businessDate: posting.businessDate,
        recordedAt: posting.recordedAt,
        actorStaffId: posting.actorStaffId,
        description: posting.description,
        currency: posting.currency,
        entries: entries.map((entry) => ({
          entryId: entry.id,
          partyKind: entry.partyKind,
          partyId: entry.partyId,
          amountMinor: entry.amountMinor,
          postingSequence: entry.postingSequence,
          reversesEntryId: entry.reversesEntryId,
        })),
      }),
    );
  });

  app.get("/openings/drafts/:draftId", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const draftId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { draftId: string }).draftId,
      "draftId",
    );
    const authPath = `/openings/drafts/${draftId}`;
    authorizeCapability(deps, ACCOUNTS_OPENING_PREPARE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: authPath,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const draft = getOpeningDraftById(database, binding.stallId, draftId);
    if (draft === null) {
      throw notFoundError("Opening draft not found.");
    }
    return reply.code(200).send(toOpeningDraftDto(draft));
  });

  app.get("/accounts/:partyKind/:partyId/opening-draft", async (request, reply) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const params = request.params as { partyKind: string; partyId: string };
    const partyKind = parseWithSchema(ledgerPartyKindSchema, params.partyKind, "partyKind");
    const partyId = parseWithSchema(opaqueIdSchema, params.partyId, "partyId");
    const authPath = `/accounts/${partyKind}/${partyId}/opening-draft`;
    authorizeCapability(deps, ACCOUNTS_OPENING_PREPARE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: authPath,
    });
    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }
    const draft = getActiveOpeningDraft(database, binding.stallId, partyKind, partyId);
    if (draft === null) {
      return reply.code(200).send(null);
    }
    return reply.code(200).send(toOpeningDraftDto(draft));
  });

  app.post("/openings/drafts", async (request, reply) => {
    const commandDeps = requireCommandDeps(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCapability(deps, ACCOUNTS_OPENING_PREPARE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/openings/drafts",
    });
    const input = parseWithSchema(prepareOpeningDraftRequestSchema, request.body, "body");
    const result = runPrepareOpeningDraftCommand(commandDeps, input, {
      requestId,
      idempotencyKey: parseIdempotencyKey(request),
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/openings/drafts",
    });
    return reply.code(200).send(result);
  });

  app.patch("/openings/drafts/:draftId", async (request, reply) => {
    const commandDeps = requireCommandDeps(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const draftId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { draftId: string }).draftId,
      "draftId",
    );
    const authPath = `/openings/drafts/${draftId}`;
    authorizeCapability(deps, ACCOUNTS_OPENING_PREPARE_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "PATCH",
      path: authPath,
    });
    const body = parseWithSchema(updateOpeningDraftRequestSchema, request.body, "body");
    const result = runUpdateOpeningDraftCommand(
      commandDeps,
      { ...body, draftId },
      {
        requestId,
        idempotencyKey: parseIdempotencyKey(request),
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret,
        method: "PATCH",
        path: authPath,
      },
    );
    return reply.code(200).send(result);
  });

  app.post("/openings/drafts/:draftId/post", async (request, reply) => {
    const commandDeps = requireCommandDeps(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    const draftId = parseWithSchema(
      opaqueIdSchema,
      (request.params as { draftId: string }).draftId,
      "draftId",
    );
    const authPath = `/openings/drafts/${draftId}/post`;
    authorizeCapability(deps, ACCOUNTS_OPENING_POST_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: authPath,
    });
    const body = parseWithSchema(postOpeningDraftRequestSchema, request.body, "body");
    const result = runPostOpeningDraftCommand(
      commandDeps,
      { ...body, draftId },
      {
        requestId,
        idempotencyKey: parseIdempotencyKey(request),
        deviceProof: authMaterial.deviceProof,
        sessionSecret: authMaterial.sessionSecret,
        method: "POST",
        path: authPath,
      },
    );
    return reply.code(200).send(result);
  });

  app.post("/openings/correct", async (request, reply) => {
    const commandDeps = requireCommandDeps(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCapability(deps, ACCOUNTS_OPENING_CORRECT_CAPABILITY, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/openings/correct",
    });
    const input = parseWithSchema(correctOpeningRequestSchema, request.body, "body");
    const result = runCorrectOpeningCommand(commandDeps, input, {
      requestId,
      idempotencyKey: parseIdempotencyKey(request),
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/openings/correct",
    });
    return reply.code(200).send(result);
  });
}
