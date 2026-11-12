import { z } from "zod";

import {
  nonNegativeMoneyMinorSchema,
  paymentReferenceSchema,
  paymentStatusSchema,
  phase27PaymentMethodSchema,
} from "./financial.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  paginationCursorSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";
import { absoluteTimestampSchema, calendarDateSchema, opaqueIdSchema } from "./primitives.js";

export const PAYMENT_NOTE_MAX_LENGTH = 500;
export const PAYMENT_BANK_REFERENCE_MAX_LENGTH = 128;
export const PAYMENT_BANK_ACCOUNT_LABEL_MAX_LENGTH = 64;
export const PAYMENT_CHEQUE_NUMBER_MAX_LENGTH = 64;
export const PAYMENT_ISSUING_BANK_LABEL_MAX_LENGTH = 64;
export const PAYMENT_REVERSAL_REASON_MAX_LENGTH = 500;

export const PAYMENT_CHEQUE_RECOGNITION_BASIS = "physical_handover" as const;
export const PAYMENT_CHEQUE_SETTLEMENT_MESSAGE =
  "Recording this handover counts the cheque amount as paid to the farmer." as const;

/** Lifecycle fields that must never be accepted on payment requests. */
export const UNSUPPORTED_CHEQUE_LIFECYCLE_FIELDS = [
  "clearedAt",
  "depositedAt",
  "bouncedAt",
  "clearanceStatus",
] as const;

export const paymentDirectionSchema = z.enum(["receive", "pay"]);
export type PaymentDirectionDto = z.infer<typeof paymentDirectionSchema>;

export const paymentPartyKindSchema = z.enum(["trader", "farmer"]);
export type PaymentPartyKindDto = z.infer<typeof paymentPartyKindSchema>;

export const paymentRecordStatusSchema = z.enum(["posted", "reversed"]);
export type PaymentRecordStatusDto = z.infer<typeof paymentRecordStatusSchema>;

export const paymentObligationKindSchema = z.enum([
  "trader_bill",
  "farmer_sale_line",
  "opening_balance",
]);
export type PaymentObligationKindDto = z.infer<typeof paymentObligationKindSchema>;

export const paymentAllocationStatusSchema = z.enum(["active", "reversed"]);
export type PaymentAllocationStatusDto = z.infer<typeof paymentAllocationStatusSchema>;

export const paymentPreviewFingerprintSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Preview fingerprint must be a SHA-256 hex digest");

export const paymentNoteSchema = z.string().trim().max(PAYMENT_NOTE_MAX_LENGTH);
export const paymentReversalReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAYMENT_REVERSAL_REASON_MAX_LENGTH);

export const paymentBankTransferReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAYMENT_BANK_REFERENCE_MAX_LENGTH);

export const paymentBankAccountLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAYMENT_BANK_ACCOUNT_LABEL_MAX_LENGTH);

export const paymentChequeNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAYMENT_CHEQUE_NUMBER_MAX_LENGTH);

export const paymentIssuingBankLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAYMENT_ISSUING_BANK_LABEL_MAX_LENGTH);

export const paymentAllocationInputSchema = z.strictObject({
  obligationKind: paymentObligationKindSchema,
  targetId: opaqueIdSchema,
  appliedAmountMinor: z.number().int().safe().positive(),
  farmerBillId: opaqueIdSchema.optional(),
});
export type PaymentAllocationInput = z.infer<typeof paymentAllocationInputSchema>;

export const eligibleObligationsQuerySchema = z.strictObject({
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: paymentDirectionSchema,
});
export type EligibleObligationsQuery = z.infer<typeof eligibleObligationsQuerySchema>;

export const eligibleObligationItemSchema = z.strictObject({
  obligationKind: paymentObligationKindSchema,
  targetId: opaqueIdSchema,
  label: z.string().min(1),
  businessDate: calendarDateSchema.nullable(),
  effectiveAmountMinor: nonNegativeMoneyMinorSchema,
  activeAllocatedMinor: nonNegativeMoneyMinorSchema,
  remainingMinor: nonNegativeMoneyMinorSchema,
  documentKind: z.enum(["trader_bill", "farmer_bill", "opening_balance", "sale_line"]).nullable(),
  documentId: opaqueIdSchema.nullable(),
  documentNumber: z.string().nullable(),
  farmerBillId: opaqueIdSchema.nullable(),
});
export type EligibleObligationItemDto = z.infer<typeof eligibleObligationItemSchema>;

export const eligibleObligationsResponseSchema = z.strictObject({
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: paymentDirectionSchema,
  accountBalanceMinor: z.number().int().safe(),
  obligations: z.array(eligibleObligationItemSchema),
});
export type EligibleObligationsResponse = z.infer<typeof eligibleObligationsResponseSchema>;

const paymentRequestBaseShape = {
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: paymentDirectionSchema,
  method: phase27PaymentMethodSchema,
  amountMinor: z.number().int().safe().positive(),
  businessDate: calendarDateSchema.optional(),
  note: paymentNoteSchema.optional(),
  bankTransferReference: paymentBankTransferReferenceSchema.optional(),
  bankTransferDate: calendarDateSchema.optional(),
  bankAccountLabel: paymentBankAccountLabelSchema.optional(),
  chequeNumber: paymentChequeNumberSchema.optional(),
  issuingBankLabel: paymentIssuingBankLabelSchema.optional(),
  chequeDate: calendarDateSchema.optional(),
  physicalHandoverDate: calendarDateSchema.optional(),
  allocations: z.array(paymentAllocationInputSchema).max(200),
  proposeOldestFirst: z.boolean().optional(),
};

type PaymentRequestRefineValue = {
  partyKind: PaymentPartyKindDto;
  direction: PaymentDirectionDto;
  method: "cash" | "bank_transfer" | "cheque";
  bankTransferReference?: string | undefined;
  bankTransferDate?: string | undefined;
  bankAccountLabel?: string | undefined;
  chequeNumber?: string | undefined;
  issuingBankLabel?: string | undefined;
  chequeDate?: string | undefined;
  physicalHandoverDate?: string | undefined;
  physicalHandoverConfirmed?: boolean | undefined;
};

function hasBankMetadata(value: PaymentRequestRefineValue): boolean {
  return (
    value.bankTransferReference !== undefined ||
    value.bankTransferDate !== undefined ||
    value.bankAccountLabel !== undefined
  );
}

function hasChequeMetadata(value: PaymentRequestRefineValue): boolean {
  return (
    value.chequeNumber !== undefined ||
    value.issuingBankLabel !== undefined ||
    value.chequeDate !== undefined ||
    value.physicalHandoverDate !== undefined
  );
}

function refinePaymentRequest(value: PaymentRequestRefineValue, ctx: z.RefinementCtx): void {
  if (value.partyKind === "trader" && value.direction !== "receive") {
    ctx.addIssue({
      code: "custom",
      message: "Buyer payments must use direction receive",
      path: ["direction"],
    });
  }
  if (value.partyKind === "farmer" && value.direction !== "pay") {
    ctx.addIssue({
      code: "custom",
      message: "Farmer payments must use direction pay",
      path: ["direction"],
    });
  }

  if (value.method === "cheque") {
    if (value.partyKind !== "farmer" || value.direction !== "pay") {
      ctx.addIssue({
        code: "custom",
        message: "Cheque payments are only supported for farmer payouts",
        path: ["method"],
      });
    }
    if (value.chequeNumber === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Cheque number is required",
        path: ["chequeNumber"],
      });
    }
    if (value.issuingBankLabel === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Issuing bank is required",
        path: ["issuingBankLabel"],
      });
    }
    if (value.chequeDate === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Cheque date is required",
        path: ["chequeDate"],
      });
    }
    if (value.physicalHandoverDate === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Physical handover date is required",
        path: ["physicalHandoverDate"],
      });
    }
    if (hasBankMetadata(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Bank transfer metadata is not allowed for cheque payments",
        path: ["method"],
      });
    }
  } else if (value.method === "bank_transfer") {
    if (value.bankTransferReference === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Bank transfer reference is required",
        path: ["bankTransferReference"],
      });
    }
    if (value.bankTransferDate === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Bank transfer date is required",
        path: ["bankTransferDate"],
      });
    }
    if (hasChequeMetadata(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Cheque metadata is only allowed for cheque payments",
        path: ["method"],
      });
    }
  } else {
    if (hasBankMetadata(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Bank metadata is only allowed for bank_transfer",
        path: ["method"],
      });
    }
    if (hasChequeMetadata(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Cheque metadata is only allowed for cheque payments",
        path: ["method"],
      });
    }
  }
}

function refineChequePostConfirmation(
  value: PaymentRequestRefineValue,
  ctx: z.RefinementCtx,
): void {
  if (value.method !== "cheque") {
    return;
  }
  if (value.physicalHandoverConfirmed !== true) {
    ctx.addIssue({
      code: "custom",
      message: "Physical handover must be confirmed before posting a cheque payout",
      path: ["physicalHandoverConfirmed"],
    });
  }
}

export const paymentPreviewRequestSchema = z
  .strictObject(paymentRequestBaseShape)
  .superRefine(refinePaymentRequest);
export type PaymentPreviewRequest = z.infer<typeof paymentPreviewRequestSchema>;

export const paymentAllocationPreviewSchema = z.strictObject({
  obligationKind: paymentObligationKindSchema,
  targetId: opaqueIdSchema,
  appliedAmountMinor: z.number().int().safe().positive(),
  remainingAfterMinor: nonNegativeMoneyMinorSchema,
  label: z.string().min(1),
  farmerBillId: opaqueIdSchema.nullable(),
});

export const paymentDuplicateInstrumentWarningSchema = z.strictObject({
  code: z.literal("DUPLICATE_CHEQUE_METADATA"),
  message: z.string().min(1),
  matchingPaymentIds: z.array(opaqueIdSchema),
  matchingReferenceNumbers: z.array(paymentReferenceSchema),
});

export const paymentPreviewResponseSchema = z.strictObject({
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  partyCode: z.string().min(1),
  partyDisplayName: z.string().min(1),
  direction: paymentDirectionSchema,
  method: phase27PaymentMethodSchema,
  amountMinor: z.number().int().safe().positive(),
  currency: z.literal("LKR"),
  businessDate: calendarDateSchema,
  bankTransferReference: z.string().nullable(),
  bankTransferDate: calendarDateSchema.nullable(),
  bankAccountLabel: z.string().nullable(),
  chequeNumber: z.string().nullable(),
  issuingBankLabel: z.string().nullable(),
  chequeDate: calendarDateSchema.nullable(),
  physicalHandoverDate: calendarDateSchema.nullable(),
  recognitionBasis: z.literal(PAYMENT_CHEQUE_RECOGNITION_BASIS).nullable(),
  settlementExplanation: z.string().nullable(),
  note: z.string().nullable(),
  allocations: z.array(paymentAllocationPreviewSchema),
  allocatedTotalMinor: nonNegativeMoneyMinorSchema,
  unappliedAmountMinor: nonNegativeMoneyMinorSchema,
  accountBalanceBeforeMinor: z.number().int().safe(),
  accountBalanceAfterMinor: z.number().int().safe(),
  previewFingerprint: paymentPreviewFingerprintSchema,
  blockingErrors: z.array(z.string()),
  warnings: z.array(paymentDuplicateInstrumentWarningSchema),
});
export type PaymentPreviewResponse = z.infer<typeof paymentPreviewResponseSchema>;

export const paymentPostRequestSchema = z
  .strictObject({
    ...paymentRequestBaseShape,
    previewFingerprint: paymentPreviewFingerprintSchema,
    physicalHandoverConfirmed: z.boolean().optional(),
  })
  .superRefine(refinePaymentRequest)
  .superRefine(refineChequePostConfirmation);
export type PaymentPostRequest = z.infer<typeof paymentPostRequestSchema>;

export const paymentAllocationRecordSchema = z.strictObject({
  allocationId: opaqueIdSchema,
  obligationKind: paymentObligationKindSchema,
  targetId: opaqueIdSchema,
  appliedAmountMinor: z.number().int().safe().positive(),
  status: paymentAllocationStatusSchema,
  farmerBillId: opaqueIdSchema.nullable(),
  reversesAllocationId: opaqueIdSchema.nullable(),
  createdAt: absoluteTimestampSchema,
});
export type PaymentAllocationRecordDto = z.infer<typeof paymentAllocationRecordSchema>;

export const paymentRecordSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema,
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: paymentDirectionSchema,
  method: phase27PaymentMethodSchema,
  amountMinor: z.number().int().safe().positive(),
  currency: z.literal("LKR"),
  businessDate: calendarDateSchema,
  status: paymentRecordStatusSchema,
  allocatedTotalMinor: nonNegativeMoneyMinorSchema,
  unappliedAmountMinor: nonNegativeMoneyMinorSchema,
  postingId: opaqueIdSchema,
  reversesPaymentId: opaqueIdSchema.nullable(),
  reversedByPaymentId: opaqueIdSchema.nullable(),
  bankTransferReference: z.string().nullable(),
  bankTransferDate: calendarDateSchema.nullable(),
  bankAccountLabel: z.string().nullable(),
  chequeNumber: z.string().nullable(),
  issuingBankLabel: z.string().nullable(),
  chequeDate: calendarDateSchema.nullable(),
  physicalHandoverDate: calendarDateSchema.nullable(),
  recognitionBasis: z.literal(PAYMENT_CHEQUE_RECOGNITION_BASIS).nullable(),
  note: z.string().nullable(),
  actorStaffId: opaqueIdSchema,
  paidAt: absoluteTimestampSchema,
  recordedAt: absoluteTimestampSchema,
  allocations: z.array(paymentAllocationRecordSchema),
});
export type PaymentRecordDto = z.infer<typeof paymentRecordSchema>;

export const paymentPostResponseSchema = z.strictObject({
  payment: paymentRecordSchema,
});
export type PaymentPostResponse = z.infer<typeof paymentPostResponseSchema>;

export const paymentOperationResultSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema,
  postingId: opaqueIdSchema,
  status: paymentRecordStatusSchema,
});
export type PaymentOperationResult = z.infer<typeof paymentOperationResultSchema>;

export const allocateExistingPaymentRequestSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  allocations: z.array(paymentAllocationInputSchema).min(1).max(200),
  previewFingerprint: paymentPreviewFingerprintSchema,
});
export type AllocateExistingPaymentRequest = z.infer<typeof allocateExistingPaymentRequestSchema>;

export const allocateExistingPaymentPreviewRequestSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  allocations: z.array(paymentAllocationInputSchema).min(1).max(200),
});
export type AllocateExistingPaymentPreviewRequest = z.infer<
  typeof allocateExistingPaymentPreviewRequestSchema
>;

export const allocateExistingPaymentPreviewResponseSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema,
  availableAmountMinor: nonNegativeMoneyMinorSchema,
  allocations: z.array(paymentAllocationPreviewSchema),
  allocatedTotalMinor: nonNegativeMoneyMinorSchema,
  remainingUnappliedMinor: nonNegativeMoneyMinorSchema,
  accountBalanceUnchanged: z.literal(true),
  previewFingerprint: paymentPreviewFingerprintSchema,
  blockingErrors: z.array(z.string()),
});
export type AllocateExistingPaymentPreviewResponse = z.infer<
  typeof allocateExistingPaymentPreviewResponseSchema
>;

export const allocateExistingPaymentResponseSchema = z.strictObject({
  payment: paymentRecordSchema,
});
export type AllocateExistingPaymentResponse = z.infer<typeof allocateExistingPaymentResponseSchema>;

export const paymentReversalPreviewRequestSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  reason: paymentReversalReasonSchema,
});
export type PaymentReversalPreviewRequest = z.infer<typeof paymentReversalPreviewRequestSchema>;

export const paymentReversalPreviewResponseSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema,
  originalAmountMinor: z.number().int().safe().positive(),
  method: phase27PaymentMethodSchema,
  direction: paymentDirectionSchema,
  allocationsToRelease: z.array(paymentAllocationRecordSchema),
  obligationsReopening: z.array(
    z.strictObject({
      obligationKind: paymentObligationKindSchema,
      targetId: opaqueIdSchema,
      reopenAmountMinor: z.number().int().safe().positive(),
      label: z.string().min(1),
    }),
  ),
  accountBalanceBeforeMinor: z.number().int().safe(),
  accountBalanceAfterMinor: z.number().int().safe(),
  reason: paymentReversalReasonSchema,
  previewFingerprint: paymentPreviewFingerprintSchema,
  blockingErrors: z.array(z.string()),
});
export type PaymentReversalPreviewResponse = z.infer<typeof paymentReversalPreviewResponseSchema>;

export const paymentReversalCommitRequestSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  reason: paymentReversalReasonSchema,
  previewFingerprint: paymentPreviewFingerprintSchema,
});
export type PaymentReversalCommitRequest = z.infer<typeof paymentReversalCommitRequestSchema>;

export const paymentReversalCommitResponseSchema = z.strictObject({
  originalPayment: paymentRecordSchema,
  reversalPayment: paymentRecordSchema,
});
export type PaymentReversalCommitResponse = z.infer<typeof paymentReversalCommitResponseSchema>;

export const listPaymentsQuerySchema = z.strictObject({
  partyKind: paymentPartyKindSchema.optional(),
  partyId: opaqueIdSchema.optional(),
  direction: paymentDirectionSchema.optional(),
  method: phase27PaymentMethodSchema.optional(),
  status: paymentRecordStatusSchema.optional(),
  businessDateFrom: calendarDateSchema.optional(),
  businessDateTo: calendarDateSchema.optional(),
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentListItemSchema = z.strictObject({
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema,
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  partyCode: z.string().min(1),
  partyDisplayName: z.string().min(1),
  direction: paymentDirectionSchema,
  method: phase27PaymentMethodSchema,
  amountMinor: z.number().int().safe().positive(),
  status: paymentRecordStatusSchema,
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  allocatedTotalMinor: nonNegativeMoneyMinorSchema,
  unappliedAmountMinor: nonNegativeMoneyMinorSchema,
  chequeNumber: z.string().nullable(),
  issuingBankLabel: z.string().nullable(),
  physicalHandoverDate: calendarDateSchema.nullable(),
});
export type PaymentListItemDto = z.infer<typeof paymentListItemSchema>;

export const listPaymentsResponseSchema = z.strictObject({
  items: z.array(paymentListItemSchema),
  nextCursor: paginationCursorSchema.nullable(),
  totalCount: z.number().int().nonnegative(),
});
export type ListPaymentsResponse = z.infer<typeof listPaymentsResponseSchema>;

export const billSettlementSummarySchema = z.strictObject({
  originalAmountMinor: nonNegativeMoneyMinorSchema,
  activeAllocatedMinor: nonNegativeMoneyMinorSchema,
  remainingMinor: nonNegativeMoneyMinorSchema,
  paymentStatus: paymentStatusSchema,
});
export type BillSettlementSummaryDto = z.infer<typeof billSettlementSummarySchema>;

export const PAYMENT_EVENT_SCHEMA_VERSION = "1" as const;
export const PAYMENT_POSTED_EVENT_TYPE = "polivo.payment.posted" as const;
export const PAYMENT_ALLOCATION_CREATED_EVENT_TYPE = "polivo.payment.allocation_created" as const;
export const PAYMENT_REVERSED_EVENT_TYPE = "polivo.payment.reversed" as const;

export const paymentPostedEventPayloadSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_EVENT_SCHEMA_VERSION),
  tenantId: opaqueIdSchema,
  stallId: opaqueIdSchema,
  paymentId: opaqueIdSchema,
  referenceNumber: paymentReferenceSchema,
  partyKind: paymentPartyKindSchema,
  partyId: opaqueIdSchema,
  direction: paymentDirectionSchema,
  method: phase27PaymentMethodSchema,
  amountMinor: z.number().int().safe().positive(),
  currency: z.literal("LKR"),
  businessDate: calendarDateSchema,
  recordedAt: absoluteTimestampSchema,
  postingId: opaqueIdSchema,
  actorStaffId: opaqueIdSchema,
  deviceId: opaqueIdSchema.nullable(),
  allocatedTotalMinor: nonNegativeMoneyMinorSchema,
  unappliedAmountMinor: nonNegativeMoneyMinorSchema,
  chequeNumber: z.string().nullable(),
  issuingBankLabel: z.string().nullable(),
  chequeDate: calendarDateSchema.nullable(),
  physicalHandoverDate: calendarDateSchema.nullable(),
  recognitionBasis: z.literal(PAYMENT_CHEQUE_RECOGNITION_BASIS).nullable(),
});
export type PaymentPostedEventPayload = z.infer<typeof paymentPostedEventPayloadSchema>;

export const paymentAllocationCreatedEventPayloadSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_EVENT_SCHEMA_VERSION),
  tenantId: opaqueIdSchema,
  stallId: opaqueIdSchema,
  paymentId: opaqueIdSchema,
  allocationIds: z.array(opaqueIdSchema).min(1),
  /** Allocation events are not additional cash movement. */
  representsCashMovement: z.literal(false),
  allocatedTotalMinor: z.number().int().safe().positive(),
  actorStaffId: opaqueIdSchema,
  recordedAt: absoluteTimestampSchema,
});
export type PaymentAllocationCreatedEventPayload = z.infer<
  typeof paymentAllocationCreatedEventPayloadSchema
>;

export const paymentReversedEventPayloadSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_EVENT_SCHEMA_VERSION),
  tenantId: opaqueIdSchema,
  stallId: opaqueIdSchema,
  originalPaymentId: opaqueIdSchema,
  reversalPaymentId: opaqueIdSchema,
  originalReferenceNumber: paymentReferenceSchema,
  reversalReferenceNumber: paymentReferenceSchema,
  amountMinor: z.number().int().safe().positive(),
  currency: z.literal("LKR"),
  reason: paymentReversalReasonSchema,
  originalPostingId: opaqueIdSchema,
  reversalPostingId: opaqueIdSchema,
  actorStaffId: opaqueIdSchema,
  recordedAt: absoluteTimestampSchema,
});
export type PaymentReversedEventPayload = z.infer<typeof paymentReversedEventPayloadSchema>;
