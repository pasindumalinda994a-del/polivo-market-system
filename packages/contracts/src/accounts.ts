import { z } from "zod";

import { moneyMinorSchema, nonNegativeMoneyMinorSchema } from "./financial.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  paginationCursorSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";
import {
  absoluteTimestampSchema,
  calendarDateSchema,
  opaqueIdSchema,
} from "./primitives.js";
import { farmerRevisionSchema } from "./farmers.js";

export const ledgerPartyKindSchema = z.enum(["farmer", "trader"]);
export type LedgerPartyKindDto = z.infer<typeof ledgerPartyKindSchema>;

export const ledgerCurrencySchema = z.literal("LKR");
export type LedgerCurrencyDto = z.infer<typeof ledgerCurrencySchema>;

export const openingBalanceDirectionSchema = z.enum([
  "stall_owes_farmer",
  "farmer_owes_stall",
  "buyer_owes_stall",
  "stall_owes_buyer",
]);
export type OpeningBalanceDirectionDto = z.infer<typeof openingBalanceDirectionSchema>;

export const balanceDirectionLabelSchema = z.enum([
  "Stall owes farmer",
  "Farmer owes stall",
  "Buyer owes stall",
  "Stall owes buyer",
  "Settled",
]);
export type BalanceDirectionLabelDto = z.infer<typeof balanceDirectionLabelSchema>;

export const partyAccountOpeningStatusSchema = z.enum([
  "not_opened",
  "opened",
  "opened_zero",
]);
export type PartyAccountOpeningStatusDto = z.infer<typeof partyAccountOpeningStatusSchema>;

export const openingDraftStatusSchema = z.enum(["draft", "posted", "discarded"]);
export type OpeningDraftStatusDto = z.infer<typeof openingDraftStatusSchema>;

export const openingDraftRevisionSchema = farmerRevisionSchema;

export const accountBalanceResponseSchema = z.strictObject({
  stallId: opaqueIdSchema,
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  currency: ledgerCurrencySchema,
  balanceMinor: moneyMinorSchema,
  displayAmountMinor: nonNegativeMoneyMinorSchema,
  directionLabel: balanceDirectionLabelSchema,
  openingStatus: partyAccountOpeningStatusSchema,
  openingCutoffDate: calendarDateSchema.nullable(),
  asOfBusinessDate: calendarDateSchema.nullable(),
});
export type AccountBalanceResponse = z.infer<typeof accountBalanceResponseSchema>;

export const accountMovementsQuerySchema = z.strictObject({
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
  asOfBusinessDate: calendarDateSchema.optional(),
});
export type AccountMovementsQuery = z.infer<typeof accountMovementsQuerySchema>;

export const accountMovementItemSchema = z.strictObject({
  entryId: opaqueIdSchema,
  postingId: opaqueIdSchema,
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  postingSequence: z.number().int().safe().positive(),
  sourceType: z.string().trim().min(1).max(64),
  sourceId: opaqueIdSchema,
  financialEventType: z.string().trim().min(1).max(64),
  description: z.string().max(500).nullable(),
  amountMinor: moneyMinorSchema,
  directionLabel: balanceDirectionLabelSchema,
  runningBalanceMinor: moneyMinorSchema,
  reversesEntryId: opaqueIdSchema.nullable(),
  reversedByEntryId: opaqueIdSchema.nullable(),
});
export type AccountMovementItemDto = z.infer<typeof accountMovementItemSchema>;

export const accountMovementsResponseSchema = z.strictObject({
  precedingBalanceMinor: moneyMinorSchema,
  items: z.array(accountMovementItemSchema),
  nextCursor: paginationCursorSchema.nullable(),
});
export type AccountMovementsResponse = z.infer<typeof accountMovementsResponseSchema>;

export const ledgerPostingDetailSchema = z.strictObject({
  postingId: opaqueIdSchema,
  stallId: opaqueIdSchema,
  sourceType: z.string().trim().min(1).max(64),
  sourceId: opaqueIdSchema,
  financialEventType: z.string().trim().min(1).max(64),
  eventSequence: z.number().int().safe().positive(),
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  actorStaffId: opaqueIdSchema.nullable(),
  description: z.string().max(500).nullable(),
  currency: ledgerCurrencySchema,
  entries: z
    .array(
      z.strictObject({
        entryId: opaqueIdSchema,
        partyKind: ledgerPartyKindSchema,
        partyId: opaqueIdSchema,
        amountMinor: moneyMinorSchema,
        postingSequence: z.number().int().safe().positive(),
        reversesEntryId: opaqueIdSchema.nullable(),
      }),
    )
    .min(0),
});
export type LedgerPostingDetailDto = z.infer<typeof ledgerPostingDetailSchema>;

export const prepareOpeningDraftRequestSchema = z.strictObject({
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: openingBalanceDirectionSchema,
  amountMinor: nonNegativeMoneyMinorSchema,
  cutoffDate: calendarDateSchema,
  reference: z.string().trim().max(128).optional(),
  explanation: z.string().trim().max(500).optional(),
});
export type PrepareOpeningDraftRequest = z.infer<typeof prepareOpeningDraftRequestSchema>;

export const updateOpeningDraftRequestSchema = z.strictObject({
  expectedRevision: openingDraftRevisionSchema,
  direction: openingBalanceDirectionSchema,
  amountMinor: nonNegativeMoneyMinorSchema,
  cutoffDate: calendarDateSchema,
  reference: z.string().trim().max(128).optional(),
  explanation: z.string().trim().max(500).optional(),
});
export type UpdateOpeningDraftRequest = z.infer<typeof updateOpeningDraftRequestSchema>;

export const openingDraftRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  stallId: opaqueIdSchema,
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: openingBalanceDirectionSchema,
  amountMinor: nonNegativeMoneyMinorSchema,
  signedAmountMinor: moneyMinorSchema.nullable(),
  cutoffDate: calendarDateSchema,
  currency: ledgerCurrencySchema,
  reference: z.string().max(128).nullable(),
  explanation: z.string().max(500).nullable(),
  status: openingDraftStatusSchema,
  revision: openingDraftRevisionSchema,
  isZeroOpening: z.boolean(),
  directionLabel: balanceDirectionLabelSchema,
  createdAt: absoluteTimestampSchema,
  updatedAt: absoluteTimestampSchema,
  createdByStaffId: opaqueIdSchema.nullable(),
  postedPostingId: opaqueIdSchema.nullable(),
});
export type OpeningDraftRecordDto = z.infer<typeof openingDraftRecordSchema>;

export const postOpeningDraftRequestSchema = z.strictObject({
  expectedRevision: openingDraftRevisionSchema,
});
export type PostOpeningDraftRequest = z.infer<typeof postOpeningDraftRequestSchema>;

export const postOpeningDraftResponseSchema = z.strictObject({
  draft: openingDraftRecordSchema,
  balance: accountBalanceResponseSchema,
  postingId: opaqueIdSchema.nullable(),
});
export type PostOpeningDraftResponse = z.infer<typeof postOpeningDraftResponseSchema>;

export const correctOpeningRequestSchema = z.strictObject({
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  reason: z.string().trim().min(1).max(500),
  replacement: z
    .strictObject({
      direction: openingBalanceDirectionSchema,
      amountMinor: nonNegativeMoneyMinorSchema,
      cutoffDate: calendarDateSchema.optional(),
      reference: z.string().trim().max(128).optional(),
      explanation: z.string().trim().max(500).optional(),
    })
    .optional(),
});
export type CorrectOpeningRequest = z.infer<typeof correctOpeningRequestSchema>;

export const correctOpeningResponseSchema = z.strictObject({
  balance: accountBalanceResponseSchema,
  reversalPostingId: opaqueIdSchema.nullable(),
  replacementPostingId: opaqueIdSchema.nullable(),
  originalPostingId: opaqueIdSchema.nullable(),
});
export type CorrectOpeningResponse = z.infer<typeof correctOpeningResponseSchema>;

export const OPENING_BALANCE_EVENT_SCHEMA_VERSION = "1";
export const OPENING_BALANCE_POSTED_EVENT_TYPE = "polivo.opening_balance.posted";
export const OPENING_BALANCE_CORRECTED_EVENT_TYPE = "polivo.opening_balance.corrected";

export const openingBalancePostedEventPayloadSchema = z.strictObject({
  schemaVersion: z.literal(OPENING_BALANCE_EVENT_SCHEMA_VERSION),
  stallId: opaqueIdSchema,
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  draftId: opaqueIdSchema,
  postingId: opaqueIdSchema.nullable(),
  amountMinor: nonNegativeMoneyMinorSchema,
  signedAmountMinor: moneyMinorSchema.nullable(),
  direction: openingBalanceDirectionSchema,
  currency: ledgerCurrencySchema,
  cutoffDate: calendarDateSchema,
  isZeroOpening: z.boolean(),
  recordedAt: absoluteTimestampSchema,
  actorStaffId: opaqueIdSchema.nullable(),
});
export type OpeningBalancePostedEventPayload = z.infer<
  typeof openingBalancePostedEventPayloadSchema
>;

export const openingBalanceCorrectedEventPayloadSchema = z.strictObject({
  schemaVersion: z.literal(OPENING_BALANCE_EVENT_SCHEMA_VERSION),
  stallId: opaqueIdSchema,
  partyKind: ledgerPartyKindSchema,
  partyId: opaqueIdSchema,
  originalPostingId: opaqueIdSchema.nullable(),
  reversalPostingId: opaqueIdSchema.nullable(),
  replacementPostingId: opaqueIdSchema.nullable(),
  reason: z.string().min(1).max(500),
  currency: ledgerCurrencySchema,
  cutoffDate: calendarDateSchema.nullable(),
  recordedAt: absoluteTimestampSchema,
  actorStaffId: opaqueIdSchema.nullable(),
});
export type OpeningBalanceCorrectedEventPayload = z.infer<
  typeof openingBalanceCorrectedEventPayloadSchema
>;
