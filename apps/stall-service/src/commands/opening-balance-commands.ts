import {
  OPENING_BALANCE_CORRECTED_EVENT_TYPE,
  OPENING_BALANCE_EVENT_SCHEMA_VERSION,
  OPENING_BALANCE_POSTED_EVENT_TYPE,
  accountBalanceResponseSchema,
  correctOpeningRequestSchema,
  correctOpeningResponseSchema,
  openingBalanceCorrectedEventPayloadSchema,
  openingBalancePostedEventPayloadSchema,
  openingDraftRecordSchema,
  postOpeningDraftResponseSchema,
  prepareOpeningDraftRequestSchema,
  type AccountBalanceResponse,
  type CorrectOpeningRequest,
  type CorrectOpeningResponse,
  type OpeningDraftRecordDto,
  type PostOpeningDraftRequest,
  type PostOpeningDraftResponse,
  type PrepareOpeningDraftRequest,
  type UpdateOpeningDraftRequest,
} from "@polivo/contracts";
import {
  DuplicateFinancialEventError,
  RevisionConflictError,
  accountHasHistoricalOperationalActivity,
  accountHasOperationalLedgerPostings,
  ensurePartyAccount,
  findReversalEntryFor,
  getActiveOpeningDraft,
  getBuyerById,
  getFarmerById,
  getOpeningDraftById,
  getPartyAccount,
  insertOpeningDraft,
  listLedgerEntriesForPosting,
  markOpeningDraftPosted,
  markPartyAccountOpeningComplete,
  postLedgerEntries,
  sumAccountBalanceMinor,
  updateOpeningDraftWithExpectedRevision,
  type LedgerPartyKind,
  type OpeningBalanceDraftRecord,
  type PartyAccountRecord,
  type TxHandle,
} from "@polivo/db-local";
import {
  DomainError,
  OPENING_EVENT_POST,
  OPENING_EVENT_REPLACE,
  OPENING_EVENT_REVERSE,
  OPENING_SOURCE_TYPE,
  balanceDirectionLabel,
  balanceDisplayAmountMinor,
  exactReversalAmount,
  validateOpeningDraft,
} from "@polivo/domain";

import {
  conflictError,
  notFoundError,
  validationError,
} from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";

export const ACCOUNTS_VIEW_CAPABILITY = "accounts.view";
export const ACCOUNTS_OPENING_PREPARE_CAPABILITY = "accounts.opening_prepare";
export const ACCOUNTS_OPENING_POST_CAPABILITY = "accounts.opening_post";
export const ACCOUNTS_OPENING_CORRECT_CAPABILITY = "accounts.opening_correct";

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw validationError(error.message, [
      { path: "body", code: error.code, message: error.message },
    ]);
  }
  throw error;
}

function requireParty(
  tx: TxHandle,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): void {
  if (partyKind === "farmer") {
    if (getFarmerById(tx, stallId, partyId) === null) {
      throw notFoundError("Farmer not found for this stall.");
    }
    return;
  }
  if (getBuyerById(tx, stallId, partyId) === null) {
    throw notFoundError("Buyer not found for this stall.");
  }
}

function assertOpeningEligible(
  tx: TxHandle,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): void {
  const account = getPartyAccount(tx, stallId, partyKind, partyId);
  if (account !== null && account.openingStatus !== "not_opened") {
    throw conflictError("Opening balance already completed for this account.");
  }
  if (accountHasOperationalLedgerPostings(tx, stallId, partyKind, partyId)) {
    throw conflictError("Opening is blocked because operational ledger postings already exist.");
  }
  if (accountHasHistoricalOperationalActivity(tx, stallId, partyKind, partyId)) {
    throw conflictError(
      "Opening is blocked because finalized bills or payments already exist for this party.",
    );
  }
}

export function toOpeningDraftDto(record: OpeningBalanceDraftRecord): OpeningDraftRecordDto {
  const signed = record.signedAmountMinor ?? 0;
  return openingDraftRecordSchema.parse({
    id: record.id,
    stallId: record.stallId,
    partyKind: record.partyKind,
    partyId: record.partyId,
    direction: record.direction,
    amountMinor: record.amountMinor,
    signedAmountMinor: record.signedAmountMinor,
    cutoffDate: record.cutoffDate,
    currency: record.currency,
    reference: record.reference,
    explanation: record.explanation,
    status: record.status,
    revision: record.revision,
    isZeroOpening: record.signedAmountMinor === null,
    directionLabel:
      record.signedAmountMinor === null
        ? "Settled"
        : balanceDirectionLabel(record.partyKind, signed),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdByStaffId: record.createdByStaffId,
    postedPostingId: record.postedPostingId,
  });
}

export function toAccountBalanceResponse(args: {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  account: PartyAccountRecord | null;
  balanceMinor: number;
  asOfBusinessDate?: string | null;
}): AccountBalanceResponse {
  return accountBalanceResponseSchema.parse({
    stallId: args.stallId,
    partyKind: args.partyKind,
    partyId: args.partyId,
    currency: "LKR",
    balanceMinor: args.balanceMinor,
    displayAmountMinor: balanceDisplayAmountMinor(args.balanceMinor),
    directionLabel: balanceDirectionLabel(args.partyKind, args.balanceMinor),
    openingStatus: args.account?.openingStatus ?? "not_opened",
    openingCutoffDate: args.account?.openingCutoffDate ?? null,
    asOfBusinessDate: args.asOfBusinessDate ?? null,
  });
}

function loadBalance(
  tx: TxHandle,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  asOfBusinessDate?: string,
): AccountBalanceResponse {
  const account = getPartyAccount(tx, stallId, partyKind, partyId);
  const balanceMinor = sumAccountBalanceMinor(
    tx,
    stallId,
    partyKind,
    partyId,
    asOfBusinessDate,
  );
  return toAccountBalanceResponse({
    stallId,
    partyKind,
    partyId,
    account,
    balanceMinor,
    asOfBusinessDate: asOfBusinessDate ?? null,
  });
}

function prepareOpeningDraftDefinition(
  deps: CommandDeps,
): CommandDefinition<PrepareOpeningDraftRequest, OpeningDraftRecordDto> {
  return {
    type: "opening_balance.prepare",
    version: "1",
    requiredCapability: ACCOUNTS_OPENING_PREPARE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      let validated;
      try {
        validated = validateOpeningDraft({
          partyKind: input.partyKind,
          direction: input.direction,
          amountMinor: input.amountMinor,
          cutoffDate: input.cutoffDate,
          currency: "LKR",
          reference: input.reference,
          explanation: input.explanation,
        });
      } catch (error) {
        mapDomainError(error);
      }

      requireParty(tx, context.stallId, input.partyKind, input.partyId);
      assertOpeningEligible(tx, context.stallId, input.partyKind, input.partyId);

      const now = deps.now();
      ensurePartyAccount(tx, {
        id: deps.createId(),
        stallId: context.stallId,
        partyKind: input.partyKind,
        partyId: input.partyId,
        createdAt: now,
        updatedAt: now,
      });

      const existing = getActiveOpeningDraft(
        tx,
        context.stallId,
        input.partyKind,
        input.partyId,
      );
      if (existing !== null) {
        throw conflictError("An active opening draft already exists for this account.");
      }

      const created = insertOpeningDraft(tx, {
        id: deps.createId(),
        stallId: context.stallId,
        partyKind: input.partyKind,
        partyId: input.partyId,
        direction: validated.direction,
        amountMinor: validated.amountMinor,
        signedAmountMinor: validated.signedAmountMinor,
        cutoffDate: validated.cutoffDate,
        reference: validated.reference,
        explanation: validated.explanation,
        createdAt: now,
        updatedAt: now,
        createdByStaffId: context.actorRef,
      });
      return toOpeningDraftDto(created);
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => openingDraftRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type UpdateOpeningDraftCommandInput = UpdateOpeningDraftRequest & { draftId: string };

function updateOpeningDraftDefinition(
  deps: CommandDeps,
): CommandDefinition<UpdateOpeningDraftCommandInput, OpeningDraftRecordDto> {
  return {
    type: "opening_balance.update_draft",
    version: "1",
    requiredCapability: ACCOUNTS_OPENING_PREPARE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const existing = getOpeningDraftById(tx, context.stallId, input.draftId);
      if (existing === null || existing.status !== "draft") {
        throw notFoundError("Opening draft not found.");
      }

      let validated;
      try {
        validated = validateOpeningDraft({
          partyKind: existing.partyKind,
          direction: input.direction,
          amountMinor: input.amountMinor,
          cutoffDate: input.cutoffDate,
          currency: "LKR",
          reference: input.reference,
          explanation: input.explanation,
        });
      } catch (error) {
        mapDomainError(error);
      }

      assertOpeningEligible(tx, context.stallId, existing.partyKind, existing.partyId);

      try {
        const updated = updateOpeningDraftWithExpectedRevision(tx, {
          stallId: context.stallId,
          draftId: input.draftId,
          expectedRevision: input.expectedRevision,
          direction: validated.direction,
          amountMinor: validated.amountMinor,
          signedAmountMinor: validated.signedAmountMinor,
          cutoffDate: validated.cutoffDate,
          reference: validated.reference,
          explanation: validated.explanation,
          updatedAt: deps.now(),
        });
        return toOpeningDraftDto(updated);
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          throw conflictError(error.message);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => openingDraftRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type PostOpeningDraftCommandInput = PostOpeningDraftRequest & { draftId: string };

function postOpeningDraftDefinition(
  deps: CommandDeps,
): CommandDefinition<PostOpeningDraftCommandInput, PostOpeningDraftResponse> {
  return {
    type: "opening_balance.post",
    version: "1",
    requiredCapability: ACCOUNTS_OPENING_POST_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const draft = getOpeningDraftById(tx, context.stallId, input.draftId);
      if (draft === null || draft.status !== "draft") {
        throw notFoundError("Opening draft not found.");
      }
      if (draft.revision !== input.expectedRevision) {
        throw conflictError("Opening draft revision conflict.");
      }

      requireParty(tx, context.stallId, draft.partyKind, draft.partyId);
      assertOpeningEligible(tx, context.stallId, draft.partyKind, draft.partyId);

      const now = deps.now();
      let postingId: string | null = null;

      if (draft.signedAmountMinor !== null) {
        const createdPostingId = deps.createId();
        try {
          postLedgerEntries(tx, {
            postingId: createdPostingId,
            stallId: context.stallId,
            sourceType: OPENING_SOURCE_TYPE,
            sourceId: draft.id,
            financialEventType: OPENING_EVENT_POST,
            eventSequence: 1,
            businessDate: draft.cutoffDate,
            recordedAt: now,
            actorStaffId: context.actorRef,
            description: draft.explanation ?? draft.reference,
            currency: "LKR",
            entries: [
              {
                entryId: deps.createId(),
                partyKind: draft.partyKind,
                partyId: draft.partyId,
                amountMinor: draft.signedAmountMinor,
              },
            ],
          });
        } catch (error) {
          if (error instanceof DuplicateFinancialEventError) {
            throw conflictError(error.message);
          }
          throw error;
        }
        postingId = createdPostingId;
      }

      let postedDraft: OpeningBalanceDraftRecord;
      try {
        postedDraft = markOpeningDraftPosted(tx, {
          stallId: context.stallId,
          draftId: draft.id,
          expectedRevision: input.expectedRevision,
          postingId,
          updatedAt: now,
        });
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          throw conflictError(error.message);
        }
        throw error;
      }

      ensurePartyAccount(tx, {
        id: deps.createId(),
        stallId: context.stallId,
        partyKind: draft.partyKind,
        partyId: draft.partyId,
        createdAt: now,
        updatedAt: now,
      });

      try {
        markPartyAccountOpeningComplete(tx, {
          stallId: context.stallId,
          partyKind: draft.partyKind,
          partyId: draft.partyId,
          openingStatus: postingId === null ? "opened_zero" : "opened",
          cutoffDate: draft.cutoffDate,
          completedAt: now,
          completedByStaffId: context.actorRef,
          draftId: draft.id,
          postingId,
          updatedAt: now,
        });
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          throw conflictError(error.message);
        }
        throw error;
      }

      const dto = toOpeningDraftDto(postedDraft);
      const balance = loadBalance(tx, context.stallId, draft.partyKind, draft.partyId);

      writeAuditAndOutbox({
        tx,
        context,
        action: "opening_balance.posted",
        targetType: "party_account",
        targetId: `${draft.partyKind}:${draft.partyId}`,
        eventType: OPENING_BALANCE_POSTED_EVENT_TYPE,
        eventSchemaVersion: OPENING_BALANCE_EVENT_SCHEMA_VERSION,
        payload: openingBalancePostedEventPayloadSchema.parse({
          schemaVersion: OPENING_BALANCE_EVENT_SCHEMA_VERSION,
          stallId: context.stallId,
          partyKind: draft.partyKind,
          partyId: draft.partyId,
          draftId: draft.id,
          postingId,
          amountMinor: draft.amountMinor,
          signedAmountMinor: draft.signedAmountMinor,
          direction: draft.direction,
          currency: "LKR",
          cutoffDate: draft.cutoffDate,
          isZeroOpening: draft.signedAmountMinor === null,
          recordedAt: now,
          actorStaffId: context.actorRef,
        }),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });

      return postOpeningDraftResponseSchema.parse({
        draft: dto,
        balance,
        postingId,
      });
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => postOpeningDraftResponseSchema.parse(JSON.parse(resultRef)),
  };
}

function correctOpeningDefinition(
  deps: CommandDeps,
): CommandDefinition<CorrectOpeningRequest, CorrectOpeningResponse> {
  return {
    type: "opening_balance.correct",
    version: "1",
    requiredCapability: ACCOUNTS_OPENING_CORRECT_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      requireParty(tx, context.stallId, input.partyKind, input.partyId);
      const account = getPartyAccount(tx, context.stallId, input.partyKind, input.partyId);
      if (account === null || account.openingStatus === "not_opened") {
        throw conflictError("No completed opening exists to correct.");
      }
      if (accountHasOperationalLedgerPostings(tx, context.stallId, input.partyKind, input.partyId)) {
        throw conflictError("Opening correction is denied after operational ledger activity.");
      }

      const now = deps.now();
      let originalPostingId: string | null = account.openingPostingId;
      let reversalPostingId: string | null = null;
      let replacementPostingId: string | null = null;

      if (originalPostingId !== null) {
        const entries = listLedgerEntriesForPosting(tx, context.stallId, originalPostingId);
        const originalEntry = entries[0];
        if (originalEntry === undefined) {
          throw conflictError("Original opening posting has no entries.");
        }
        if (findReversalEntryFor(tx, context.stallId, originalEntry.id) !== null) {
          throw conflictError("This opening posting has already been reversed.");
        }

        reversalPostingId = deps.createId();
        try {
          postLedgerEntries(tx, {
            postingId: reversalPostingId,
            stallId: context.stallId,
            sourceType: OPENING_SOURCE_TYPE,
            sourceId: account.openingDraftId ?? originalPostingId,
            financialEventType: OPENING_EVENT_REVERSE,
            eventSequence: 1,
            businessDate: account.openingCutoffDate ?? now.slice(0, 10),
            recordedAt: now,
            actorStaffId: context.actorRef,
            description: input.reason,
            currency: "LKR",
            entries: [
              {
                entryId: deps.createId(),
                partyKind: input.partyKind,
                partyId: input.partyId,
                amountMinor: exactReversalAmount(originalEntry.amountMinor),
                reversesEntryId: originalEntry.id,
              },
            ],
          });
        } catch (error) {
          if (error instanceof DuplicateFinancialEventError) {
            throw conflictError(error.message);
          }
          if (error instanceof DomainError) {
            mapDomainError(error);
          }
          throw error;
        }
      }

      if (input.replacement !== undefined) {
        let validated;
        try {
          validated = validateOpeningDraft({
            partyKind: input.partyKind,
            direction: input.replacement.direction,
            amountMinor: input.replacement.amountMinor,
            cutoffDate: input.replacement.cutoffDate ?? account.openingCutoffDate ?? now.slice(0, 10),
            currency: "LKR",
            reference: input.replacement.reference,
            explanation: input.replacement.explanation ?? input.reason,
          });
        } catch (error) {
          mapDomainError(error);
        }

        if (validated.signedAmountMinor !== null) {
          replacementPostingId = deps.createId();
          try {
            postLedgerEntries(tx, {
              postingId: replacementPostingId,
              stallId: context.stallId,
              sourceType: OPENING_SOURCE_TYPE,
              sourceId: account.openingDraftId ?? account.id,
              financialEventType: OPENING_EVENT_REPLACE,
              eventSequence: 1,
              businessDate: validated.cutoffDate,
              recordedAt: now,
              actorStaffId: context.actorRef,
              description: validated.explanation ?? input.reason,
              currency: "LKR",
              entries: [
                {
                  entryId: deps.createId(),
                  partyKind: input.partyKind,
                  partyId: input.partyId,
                  amountMinor: validated.signedAmountMinor,
                },
              ],
            });
          } catch (error) {
            if (error instanceof DuplicateFinancialEventError) {
              throw conflictError(error.message);
            }
            throw error;
          }
        }
      }

      writeAuditAndOutbox({
        tx,
        context,
        action: "opening_balance.corrected",
        targetType: "party_account",
        targetId: `${input.partyKind}:${input.partyId}`,
        eventType: OPENING_BALANCE_CORRECTED_EVENT_TYPE,
        eventSchemaVersion: OPENING_BALANCE_EVENT_SCHEMA_VERSION,
        payload: openingBalanceCorrectedEventPayloadSchema.parse({
          schemaVersion: OPENING_BALANCE_EVENT_SCHEMA_VERSION,
          stallId: context.stallId,
          partyKind: input.partyKind,
          partyId: input.partyId,
          originalPostingId,
          reversalPostingId,
          replacementPostingId,
          reason: input.reason,
          currency: "LKR",
          cutoffDate: account.openingCutoffDate,
          recordedAt: now,
          actorStaffId: context.actorRef,
        }),
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });

      return correctOpeningResponseSchema.parse({
        balance: loadBalance(tx, context.stallId, input.partyKind, input.partyId),
        reversalPostingId,
        replacementPostingId,
        originalPostingId,
      });
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => correctOpeningResponseSchema.parse(JSON.parse(resultRef)),
  };
}

export function runPrepareOpeningDraftCommand(
  deps: CommandDeps,
  input: PrepareOpeningDraftRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
) {
  return runIdempotentCommand(deps, prepareOpeningDraftDefinition(deps), {
    input: prepareOpeningDraftRequestSchema.parse(input),
    ...meta,
  });
}

export function runUpdateOpeningDraftCommand(
  deps: CommandDeps,
  input: UpdateOpeningDraftCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
) {
  return runIdempotentCommand(deps, updateOpeningDraftDefinition(deps), {
    input,
    ...meta,
  });
}

export function runPostOpeningDraftCommand(
  deps: CommandDeps,
  input: PostOpeningDraftCommandInput,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
) {
  return runIdempotentCommand(deps, postOpeningDraftDefinition(deps), {
    input,
    ...meta,
  });
}

export function runCorrectOpeningCommand(
  deps: CommandDeps,
  input: CorrectOpeningRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
) {
  return runIdempotentCommand(deps, correctOpeningDefinition(deps), {
    input: correctOpeningRequestSchema.parse(input),
    ...meta,
  });
}

export function loadAccountBalanceForRead(
  database: import("@polivo/db-local").LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  asOfBusinessDate?: string,
): AccountBalanceResponse {
  if (partyKind === "farmer") {
    if (getFarmerById(database, stallId, partyId) === null) {
      throw notFoundError("Farmer not found for this stall.");
    }
  } else if (getBuyerById(database, stallId, partyId) === null) {
    throw notFoundError("Buyer not found for this stall.");
  }
  return loadBalance(database, stallId, partyKind, partyId, asOfBusinessDate);
}
