import { createHash } from "node:crypto";

import {
  PAYMENT_ALLOCATION_CREATED_EVENT_TYPE,
  PAYMENT_CHEQUE_RECOGNITION_BASIS,
  PAYMENT_CHEQUE_SETTLEMENT_MESSAGE,
  PAYMENT_EVENT_SCHEMA_VERSION,
  PAYMENT_POSTED_EVENT_TYPE,
  PAYMENT_REVERSED_EVENT_TYPE,
  allocateExistingPaymentPreviewRequestSchema,
  allocateExistingPaymentPreviewResponseSchema,
  allocateExistingPaymentRequestSchema,
  allocateExistingPaymentResponseSchema,
  eligibleObligationsQuerySchema,
  eligibleObligationsResponseSchema,
  paymentAllocationCreatedEventPayloadSchema,
  paymentPostRequestSchema,
  paymentPostResponseSchema,
  paymentPostedEventPayloadSchema,
  paymentPreviewRequestSchema,
  paymentPreviewResponseSchema,
  paymentRecordSchema,
  paymentReversalCommitRequestSchema,
  paymentReversalCommitResponseSchema,
  paymentReversalPreviewRequestSchema,
  paymentReversalPreviewResponseSchema,
  paymentReversedEventPayloadSchema,
  type AllocateExistingPaymentPreviewRequest,
  type AllocateExistingPaymentPreviewResponse,
  type AllocateExistingPaymentRequest,
  type AllocateExistingPaymentResponse,
  type EligibleObligationsQuery,
  type EligibleObligationsResponse,
  type PaymentAllocationInput,
  type PaymentPostRequest,
  type PaymentPostResponse,
  type PaymentPreviewRequest,
  type PaymentPreviewResponse,
  type PaymentRecordDto,
  type PaymentReversalCommitRequest,
  type PaymentReversalCommitResponse,
  type PaymentReversalPreviewRequest,
  type PaymentReversalPreviewResponse,
} from "@polivo/contracts";
import {
  DuplicateFinancialEventError,
  allocateNextPaymentSequence,
  describeObligationTarget,
  ensurePartyAccount,
  ensurePaymentSequencesForStall,
  findOriginalFarmerBillInclusion,
  findReversalEntryFor,
  getBuyerById,
  getFarmerById,
  getPartyAccount,
  findPotentialChequeDuplicates,
  getPaymentById,
  insertPayment,
  insertPaymentAllocation,
  listEligibleFarmerSaleLineObligations,
  listEligibleOpeningObligations,
  listEligibleTraderBillObligations,
  listLedgerEntriesForPosting,
  markPaymentReversed,
  postLedgerEntries,
  reverseActiveAllocationsForPayment,
  sumAccountBalanceMinor,
  sumActiveAllocatedForPayment,
  updateFarmerBillPaymentStatus,
  updateTraderBillPaymentStatus,
  type DbExecutor,
  type EligibleObligationRow,
  type PaymentAllocationRecord,
  type PaymentRecord,
  type TxHandle,
} from "@polivo/db-local";
import {
  DomainError,
  PAYMENT_EVENT_POSTED,
  PAYMENT_EVENT_REVERSED,
  PAYMENT_SOURCE_TYPE,
  allocatePaymentOldestFirst,
  exactReversalAmount,
  formatPaymentReference,
  paymentAvailableAmountMinor,
  paymentLedgerAmountMinor,
  validateExplicitAllocations,
  type ObligationKind,
} from "@polivo/domain";

import { resolveBoundStall, type ExecutionContext } from "../context/execution-context.js";
import { AppError, conflictError, notFoundError, validationError } from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";

export const PAYMENTS_RECEIVE_TRADER_CAPABILITY = "payments.receive_trader";
export const PAYMENTS_PAY_FARMER_CAPABILITY = "payments.pay_farmer";
export const PAYMENTS_RECORD_CHEQUE_CAPABILITY = "payments.record_cheque";
export const PAYMENTS_REVERSE_CAPABILITY = "payments.reverse";

export const PAYMENT_POST_COMMAND_TYPE = "payment.post";
export const PAYMENT_ALLOCATE_EXISTING_COMMAND_TYPE = "payment.allocate_existing";
export const PAYMENT_REVERSE_COMMAND_TYPE = "payment.reverse";

type PaymentDirection = "receive" | "pay";
type PaymentPartyKind = "trader" | "farmer";

type CommandRequestMeta = {
  requestId: string;
  idempotencyKey: string;
  deviceProof: import("../auth/device-proof.js").DeviceProof;
  sessionSecret: string;
  method: string;
  path: string;
};

type ResolvedAllocation = {
  obligationKind: ObligationKind;
  targetId: string;
  appliedAmountMinor: number;
  remainingAfterMinor: number;
  label: string;
  farmerBillId: string | null;
};

type AllocationTargetRef = {
  obligationKind: ObligationKind;
  targetId: string;
  farmerBillId: string | null;
};

/** Capability that authorizes posting (or allocating) money in the given direction. */
export function capabilityForPaymentDirection(direction: PaymentDirection): string {
  return direction === "receive"
    ? PAYMENTS_RECEIVE_TRADER_CAPABILITY
    : PAYMENTS_PAY_FARMER_CAPABILITY;
}

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw validationError(error.message, [
      { path: error.code, code: error.code, message: error.message },
    ]);
  }
  throw error;
}

function todayUtcCalendarDate(nowIso: string): string {
  return nowIso.slice(0, 10);
}

function hashFingerprint(material: string): string {
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * Buyer/trader cheque receipts are unsupported (ADR 0018 / ADR 0006 Proposed).
 * Call before or after schema parsing for a clear direction error.
 */
export function assertChequeDirectionAllowed(raw: unknown): void {
  if (typeof raw !== "object" || raw === null || !("method" in raw)) {
    return;
  }
  const body = raw as {
    method?: unknown;
    partyKind?: unknown;
    direction?: unknown;
  };
  if (body.method !== "cheque") {
    return;
  }
  if (body.partyKind !== "farmer" || body.direction !== "pay") {
    throw validationError("Cheque payments are only supported for farmer payouts.", [
      {
        path: "method",
        code: "UNSUPPORTED_PAYMENT_METHOD",
        message:
          "Buyer cheque receipts are not supported. Farmer cheque payouts settle on physical handover.",
      },
    ]);
  }
}

function assertChequeHandoverNotFuture(
  physicalHandoverDate: string | undefined,
  nowIso: string,
): void {
  if (physicalHandoverDate === undefined) {
    return;
  }
  const today = todayUtcCalendarDate(nowIso);
  if (physicalHandoverDate > today) {
    throw validationError("Physical handover date cannot be in the future.", [
      {
        path: "physicalHandoverDate",
        code: "FUTURE_HANDOVER",
        message: "A future physical handover must not be recorded as a completed payout.",
      },
    ]);
  }
}

function chequeRecognitionBasis(method: string): typeof PAYMENT_CHEQUE_RECOGNITION_BASIS | null {
  return method === "cheque" ? PAYMENT_CHEQUE_RECOGNITION_BASIS : null;
}

/** Standalone allocation release/reassignment is unsupported (ADR 0017 §11). */
export function unsupportedAllocationReleaseError(): AppError {
  return validationError("Releasing or reassigning payment allocations is not supported.", [
    {
      path: "allocations",
      code: "UNSUPPORTED_OPERATION",
      message:
        "Allocations can only be released by reversing the whole payment with payments.reverse.",
    },
  ]);
}

function targetIdOfAllocation(allocation: PaymentAllocationRecord): string {
  switch (allocation.obligationKind) {
    case "trader_bill":
      return allocation.traderBillId ?? "";
    case "farmer_sale_line":
      return allocation.saleLineId ?? "";
    case "opening_balance":
      return allocation.openingDraftId ?? "";
    default: {
      const _exhaustive: never = allocation.obligationKind;
      throw new Error(`Unknown obligation kind: ${String(_exhaustive)}`);
    }
  }
}

function paymentPartyId(payment: PaymentRecord): string {
  const partyId = payment.partyKind === "trader" ? payment.traderId : payment.farmerId;
  if (partyId === null) {
    throw conflictError("Payment is missing its party reference.");
  }
  return partyId;
}

function isActiveAllocatablePayment(payment: PaymentRecord): boolean {
  return (
    payment.status === "posted" &&
    payment.reversedByPaymentId === null &&
    payment.reversesPaymentId === null
  );
}

export function toPaymentRecordDto(payment: PaymentRecord): PaymentRecordDto {
  const active = payment.allocations.filter((allocation) => allocation.status === "active");
  const allocatedTotalMinor = active.reduce((sum, item) => sum + item.appliedAmountMinor, 0);
  return paymentRecordSchema.parse({
    paymentId: payment.id,
    referenceNumber: payment.referenceNumber,
    partyKind: payment.partyKind,
    partyId: paymentPartyId(payment),
    direction: payment.direction,
    method: payment.method,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    businessDate: payment.businessDate,
    status: payment.status,
    allocatedTotalMinor,
    unappliedAmountMinor: isActiveAllocatablePayment(payment)
      ? paymentAvailableAmountMinor(payment.amountMinor, allocatedTotalMinor)
      : 0,
    postingId: payment.postingId,
    reversesPaymentId: payment.reversesPaymentId,
    reversedByPaymentId: payment.reversedByPaymentId,
    bankTransferReference: payment.bankTransferReference,
    bankTransferDate: payment.bankTransferDate,
    bankAccountLabel: payment.bankAccountLabel,
    chequeNumber: payment.chequeNumber,
    issuingBankLabel: payment.issuingBankLabel,
    chequeDate: payment.chequeDate,
    physicalHandoverDate: payment.physicalHandoverDate,
    recognitionBasis: chequeRecognitionBasis(payment.method),
    note: payment.note,
    actorStaffId: payment.actorStaffId,
    paidAt: payment.paidAt,
    recordedAt: payment.recordedAt,
    allocations: payment.allocations.map((allocation) => ({
      allocationId: allocation.id,
      obligationKind: allocation.obligationKind,
      targetId: targetIdOfAllocation(allocation),
      appliedAmountMinor: allocation.appliedAmountMinor,
      status: allocation.status,
      farmerBillId: allocation.farmerBillId,
      reversesAllocationId: allocation.reversesAllocationId,
      createdAt: allocation.createdAt,
    })),
  });
}

export function loadPaymentDto(
  executor: DbExecutor,
  stallId: string,
  paymentId: string,
): PaymentRecordDto | null {
  const payment = getPaymentById(executor, stallId, paymentId);
  return payment === null ? null : toPaymentRecordDto(payment);
}

function requirePayment(executor: DbExecutor, stallId: string, paymentId: string): PaymentRecord {
  const payment = getPaymentById(executor, stallId, paymentId);
  if (payment === null) {
    throw notFoundError("Payment was not found.");
  }
  return payment;
}

type PartyIdentity = { code: string; displayName: string };

function loadParty(
  executor: DbExecutor,
  stallId: string,
  partyKind: PaymentPartyKind,
  partyId: string,
): PartyIdentity {
  const party =
    partyKind === "trader"
      ? getBuyerById(executor, stallId, partyId)
      : getFarmerById(executor, stallId, partyId);
  if (party === null) {
    throw notFoundError(partyKind === "trader" ? "Buyer was not found." : "Farmer was not found.");
  }
  return { code: party.shortCode, displayName: party.displayName };
}

function assertDirectionMatchesParty(partyKind: PaymentPartyKind, direction: PaymentDirection) {
  if (
    (partyKind === "trader" && direction !== "receive") ||
    (partyKind === "farmer" && direction !== "pay")
  ) {
    throw validationError("Payment direction does not match the party kind.", [
      {
        path: "direction",
        code: "DIRECTION_MISMATCH",
        message:
          partyKind === "trader"
            ? "Buyer payments must use direction receive."
            : "Farmer payments must use direction pay.",
      },
    ]);
  }
}

const OBLIGATION_KIND_RANK: Record<ObligationKind, number> = {
  opening_balance: 0,
  trader_bill: 1,
  farmer_sale_line: 1,
};

function loadEligibleRows(
  executor: DbExecutor,
  stallId: string,
  partyKind: PaymentPartyKind,
  partyId: string,
): EligibleObligationRow[] {
  const rows =
    partyKind === "trader"
      ? [
          ...listEligibleTraderBillObligations(executor, stallId, partyId),
          ...listEligibleOpeningObligations(executor, stallId, "trader", partyId),
        ]
      : [
          ...listEligibleFarmerSaleLineObligations(executor, stallId, partyId),
          ...listEligibleOpeningObligations(executor, stallId, "farmer", partyId),
        ];
  return rows.sort((a, b) => {
    const aDate = a.businessDate ?? "";
    const bDate = b.businessDate ?? "";
    if (aDate !== bDate) {
      return aDate < bDate ? -1 : 1;
    }
    const rank = OBLIGATION_KIND_RANK[a.obligationKind] - OBLIGATION_KIND_RANK[b.obligationKind];
    if (rank !== 0) {
      return rank;
    }
    return a.targetId.localeCompare(b.targetId);
  });
}

function readPartyAccountBlocker(
  executor: DbExecutor,
  stallId: string,
  partyKind: PaymentPartyKind,
  partyId: string,
): string | null {
  const account = getPartyAccount(executor, stallId, partyKind, partyId);
  if (account === null || account.openingStatus === "not_opened") {
    return "Party account opening must be completed before recording payments.";
  }
  return null;
}

export function buildEligibleObligations(
  deps: CommandDeps,
  context: ExecutionContext,
  rawQuery: EligibleObligationsQuery,
): EligibleObligationsResponse {
  const query = eligibleObligationsQuerySchema.parse(rawQuery);
  assertDirectionMatchesParty(query.partyKind, query.direction);
  loadParty(deps.database, context.stallId, query.partyKind, query.partyId);
  const rows = loadEligibleRows(deps.database, context.stallId, query.partyKind, query.partyId);
  return eligibleObligationsResponseSchema.parse({
    partyKind: query.partyKind,
    partyId: query.partyId,
    direction: query.direction,
    accountBalanceMinor: sumAccountBalanceMinor(
      deps.database,
      context.stallId,
      query.partyKind,
      query.partyId,
    ),
    obligations: rows.map((row) => ({
      obligationKind: row.obligationKind,
      targetId: row.targetId,
      label: row.label,
      businessDate: row.businessDate,
      effectiveAmountMinor: row.effectiveAmountMinor,
      activeAllocatedMinor: row.activeAllocatedMinor,
      remainingMinor: row.remainingMinor,
      documentKind: row.documentKind,
      documentId: row.documentId,
      documentNumber: row.documentNumber,
      farmerBillId: row.farmerBillId,
    })),
  });
}

type AllocationResolution = {
  allocations: ResolvedAllocation[];
  allocatedTotalMinor: number;
  unappliedMinor: number;
  blockingErrors: string[];
};

function eligibleKey(kind: ObligationKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

/**
 * Validate explicit allocations (or propose oldest-first) against the current remainders.
 * Never redistributes: any invalid input is reported as a blocking error.
 */
function resolveAllocations(args: {
  rows: readonly EligibleObligationRow[];
  availableAmountMinor: number;
  requested: readonly PaymentAllocationInput[];
  proposeOldestFirst: boolean;
  businessDate: string;
}): AllocationResolution {
  const blockingErrors: string[] = [];
  const rowsByKey = new Map(
    args.rows.map((row) => [eligibleKey(row.obligationKind, row.targetId), row]),
  );

  let explicit: Array<{ obligationKind: ObligationKind; targetId: string; appliedMinor: number }> =
    [];

  if (args.proposeOldestFirst) {
    if (args.requested.length > 0) {
      blockingErrors.push("Provide either explicit allocations or proposeOldestFirst, not both.");
    } else {
      try {
        const proposal = allocatePaymentOldestFirst(
          args.rows.map((row) => ({
            billId: row.targetId,
            outstandingMinor: row.remainingMinor,
            // Rows are pre-sorted oldest-first; the stable date keeps the domain tie-break deterministic.
            finalizedAt: `${row.businessDate ?? args.businessDate}T00:00:00.000Z`,
          })),
          args.availableAmountMinor,
        );
        explicit = proposal.allocations.map((item) => {
          const row = args.rows.find((candidate) => candidate.targetId === item.billId)!;
          return {
            obligationKind: row.obligationKind,
            targetId: row.targetId,
            appliedMinor: item.appliedMinor,
          };
        });
      } catch (error) {
        if (error instanceof DomainError) {
          blockingErrors.push(error.message);
        } else {
          throw error;
        }
      }
    }
  } else {
    explicit = args.requested.map((item) => ({
      obligationKind: item.obligationKind,
      targetId: item.targetId,
      appliedMinor: item.appliedAmountMinor,
    }));
    for (const item of args.requested) {
      const row = rowsByKey.get(eligibleKey(item.obligationKind, item.targetId));
      if (row === undefined) {
        blockingErrors.push(`Unknown or ineligible allocation target: ${item.targetId}`);
      } else if (
        item.farmerBillId !== undefined &&
        item.obligationKind === "farmer_sale_line" &&
        row.farmerBillId !== item.farmerBillId
      ) {
        blockingErrors.push(
          `Sale line ${item.targetId} is not part of farmer bill ${item.farmerBillId}.`,
        );
      }
    }
  }

  if (blockingErrors.length > 0) {
    return {
      allocations: [],
      allocatedTotalMinor: 0,
      unappliedMinor: args.availableAmountMinor,
      blockingErrors,
    };
  }

  if (explicit.length === 0) {
    return {
      allocations: [],
      allocatedTotalMinor: 0,
      unappliedMinor: args.availableAmountMinor,
      blockingErrors,
    };
  }

  try {
    const validated = validateExplicitAllocations({
      paymentAmountMinor: args.availableAmountMinor,
      allocations: explicit,
      remaindersByTargetId: Object.fromEntries(
        args.rows.map((row) => [row.targetId, row.remainingMinor]),
      ),
    });
    return {
      allocations: validated.allocations.map((item) => {
        const row = rowsByKey.get(eligibleKey(item.obligationKind, item.targetId))!;
        return {
          obligationKind: item.obligationKind,
          targetId: item.targetId,
          appliedAmountMinor: item.appliedMinor,
          remainingAfterMinor: validated.remainingByTargetId[item.targetId]!,
          label: row.label,
          farmerBillId: row.farmerBillId,
        };
      }),
      allocatedTotalMinor: validated.allocatedTotalMinor,
      unappliedMinor: validated.unappliedMinor,
      blockingErrors,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        allocations: [],
        allocatedTotalMinor: 0,
        unappliedMinor: args.availableAmountMinor,
        blockingErrors: [error.message],
      };
    }
    throw error;
  }
}

function sortedAllocationMaterial(
  allocations: ReadonlyArray<{
    obligationKind: ObligationKind;
    targetId: string;
    appliedAmountMinor: number;
    remainingAfterMinor: number | null;
  }>,
): Array<[string, string, number, number | null]> {
  return allocations
    .map(
      (item) =>
        [item.obligationKind, item.targetId, item.appliedAmountMinor, item.remainingAfterMinor] as [
          string,
          string,
          number,
          number | null,
        ],
    )
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
}

type EvaluatedPayment = {
  preview: PaymentPreviewResponse;
  businessDate: string;
  allocations: ResolvedAllocation[];
};

function evaluatePayment(
  executor: DbExecutor,
  stallId: string,
  nowIso: string,
  request: PaymentPreviewRequest,
): EvaluatedPayment {
  assertDirectionMatchesParty(request.partyKind, request.direction);
  const party = loadParty(executor, stallId, request.partyKind, request.partyId);
  const businessDate = request.businessDate ?? todayUtcCalendarDate(nowIso);

  const blockingErrors: string[] = [];
  const accountBlocker = readPartyAccountBlocker(
    executor,
    stallId,
    request.partyKind,
    request.partyId,
  );
  if (accountBlocker !== null) {
    blockingErrors.push(accountBlocker);
  }

  const rows = loadEligibleRows(executor, stallId, request.partyKind, request.partyId);
  const resolution = resolveAllocations({
    rows,
    availableAmountMinor: request.amountMinor,
    requested: request.allocations,
    proposeOldestFirst: request.proposeOldestFirst === true,
    businessDate,
  });
  blockingErrors.push(...resolution.blockingErrors);

  const balanceBefore = sumAccountBalanceMinor(
    executor,
    stallId,
    request.partyKind,
    request.partyId,
  );
  const balanceAfter = balanceBefore + paymentLedgerAmountMinor(request.amountMinor);

  const material =
    resolution.blockingErrors.length === 0
      ? sortedAllocationMaterial(resolution.allocations)
      : sortedAllocationMaterial(
          request.allocations.map((item) => ({
            obligationKind: item.obligationKind,
            targetId: item.targetId,
            appliedAmountMinor: item.appliedAmountMinor,
            remainingAfterMinor: null,
          })),
        );

  if (request.method === "cheque") {
    try {
      assertChequeHandoverNotFuture(request.physicalHandoverDate, nowIso);
    } catch (error) {
      if (error instanceof AppError) {
        blockingErrors.push(error.message);
      } else {
        throw error;
      }
    }
  }

  const warnings =
    request.method === "cheque" && request.chequeNumber !== undefined
      ? (() => {
          const duplicates = findPotentialChequeDuplicates(
            executor,
            stallId,
            request.chequeNumber,
            request.issuingBankLabel ?? null,
          );
          if (duplicates.length === 0) {
            return [];
          }
          return [
            {
              code: "DUPLICATE_CHEQUE_METADATA" as const,
              message:
                "Matching cheque metadata already exists in this stall. Review the authorized references before posting.",
              matchingPaymentIds: duplicates.map((item) => item.paymentId),
              matchingReferenceNumbers: duplicates.map((item) => item.referenceNumber),
            },
          ];
        })()
      : [];

  const previewFingerprint = hashFingerprint(
    JSON.stringify({
      kind: "payment_preview",
      version: 1,
      partyKind: request.partyKind,
      partyId: request.partyId,
      direction: request.direction,
      method: request.method,
      amountMinor: request.amountMinor,
      businessDate,
      bankTransferReference: request.bankTransferReference ?? null,
      bankTransferDate: request.bankTransferDate ?? null,
      bankAccountLabel: request.bankAccountLabel ?? null,
      chequeNumber: request.chequeNumber ?? null,
      issuingBankLabel: request.issuingBankLabel ?? null,
      chequeDate: request.chequeDate ?? null,
      physicalHandoverDate: request.physicalHandoverDate ?? null,
      note: request.note ?? null,
      allocations: material,
      unappliedAmountMinor: resolution.unappliedMinor,
    }),
  );

  const preview = paymentPreviewResponseSchema.parse({
    partyKind: request.partyKind,
    partyId: request.partyId,
    partyCode: party.code,
    partyDisplayName: party.displayName,
    direction: request.direction,
    method: request.method,
    amountMinor: request.amountMinor,
    currency: "LKR",
    businessDate,
    bankTransferReference: request.bankTransferReference ?? null,
    bankTransferDate: request.bankTransferDate ?? null,
    bankAccountLabel: request.bankAccountLabel ?? null,
    chequeNumber: request.chequeNumber ?? null,
    issuingBankLabel: request.issuingBankLabel ?? null,
    chequeDate: request.chequeDate ?? null,
    physicalHandoverDate: request.physicalHandoverDate ?? null,
    recognitionBasis: chequeRecognitionBasis(request.method),
    settlementExplanation: request.method === "cheque" ? PAYMENT_CHEQUE_SETTLEMENT_MESSAGE : null,
    note: request.note ?? null,
    allocations: resolution.allocations.map((item) => ({
      obligationKind: item.obligationKind,
      targetId: item.targetId,
      appliedAmountMinor: item.appliedAmountMinor,
      remainingAfterMinor: item.remainingAfterMinor,
      label: item.label,
      farmerBillId: item.farmerBillId,
    })),
    allocatedTotalMinor: resolution.allocatedTotalMinor,
    unappliedAmountMinor: resolution.unappliedMinor,
    accountBalanceBeforeMinor: balanceBefore,
    accountBalanceAfterMinor: balanceAfter,
    previewFingerprint,
    blockingErrors,
    warnings,
  });

  return { preview, businessDate, allocations: resolution.allocations };
}

/** Authoritative, side-effect-free payment preview. Never consumes a reference or posts money. */
export function buildPaymentPreview(
  deps: CommandDeps,
  context: ExecutionContext,
  rawRequest: PaymentPreviewRequest,
): PaymentPreviewResponse {
  assertChequeDirectionAllowed(rawRequest);
  const request = paymentPreviewRequestSchema.parse(rawRequest);
  return evaluatePayment(deps.database, context.stallId, deps.now(), request).preview;
}

function refreshSettlementProjections(
  tx: TxHandle,
  stallId: string,
  targets: readonly AllocationTargetRef[],
  now: string,
): void {
  const traderBillIds = new Set<string>();
  const farmerBillIds = new Set<string>();
  for (const target of targets) {
    if (target.obligationKind === "trader_bill") {
      traderBillIds.add(target.targetId);
    } else if (target.obligationKind === "farmer_sale_line") {
      const farmerBillId =
        target.farmerBillId ??
        findOriginalFarmerBillInclusion(tx, stallId, target.targetId)?.farmerBillId;
      if (farmerBillId !== undefined && farmerBillId !== null) {
        farmerBillIds.add(farmerBillId);
      }
    }
  }
  for (const billId of [...traderBillIds].sort()) {
    updateTraderBillPaymentStatus(tx, stallId, billId, now);
  }
  for (const billId of [...farmerBillIds].sort()) {
    updateFarmerBillPaymentStatus(tx, stallId, billId, now);
  }
}

function insertAllocations(
  deps: CommandDeps,
  tx: TxHandle,
  args: {
    stallId: string;
    paymentId: string;
    allocations: readonly ResolvedAllocation[];
    now: string;
  },
): string[] {
  const ids: string[] = [];
  for (const item of args.allocations) {
    const allocationId = deps.createId();
    ids.push(allocationId);
    insertPaymentAllocation(tx, {
      id: allocationId,
      stallId: args.stallId,
      paymentId: args.paymentId,
      obligationKind: item.obligationKind,
      traderBillId: item.obligationKind === "trader_bill" ? item.targetId : null,
      saleLineId: item.obligationKind === "farmer_sale_line" ? item.targetId : null,
      openingDraftId: item.obligationKind === "opening_balance" ? item.targetId : null,
      farmerBillId: item.obligationKind === "farmer_sale_line" ? item.farmerBillId : null,
      appliedAmountMinor: item.appliedAmountMinor,
      createdAt: args.now,
    });
  }
  return ids;
}

function postDefinition(
  deps: CommandDeps,
  direction: PaymentDirection,
): CommandDefinition<PaymentPostRequest, PaymentPostResponse> {
  return {
    type: PAYMENT_POST_COMMAND_TYPE,
    version: "1",
    requiredCapability: capabilityForPaymentDirection(direction),
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      try {
        return executePostPayment(deps, tx, context, input);
      } catch (error) {
        if (error instanceof DomainError) {
          mapDomainError(error);
        }
        if (error instanceof DuplicateFinancialEventError) {
          throw conflictError(error.message);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => paymentPostResponseSchema.parse(JSON.parse(resultRef)),
  };
}

function executePostPayment(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: PaymentPostRequest,
): PaymentPostResponse {
  if (input.proposeOldestFirst === true) {
    throw validationError("Oldest-first allocation is a preview-only proposal.", [
      {
        path: "proposeOldestFirst",
        code: "PREVIEW_ONLY_PROPOSAL",
        message: "Commit the reviewed explicit allocations returned by the preview.",
      },
    ]);
  }

  const now = deps.now();
  assertChequeDirectionAllowed(input);
  if (input.method === "cheque") {
    assertChequeHandoverNotFuture(input.physicalHandoverDate, now);
  }
  // Rebuild inside the write transaction so remainders, account readiness, and the reviewed
  // fingerprint are all rechecked against the authoritative state.
  const evaluated = evaluatePayment(tx, context.stallId, now, input);
  if (evaluated.preview.blockingErrors.length > 0) {
    throw conflictError(
      `Payment can no longer be posted as reviewed: ${evaluated.preview.blockingErrors.join(" ")}`,
    );
  }
  if (evaluated.preview.previewFingerprint !== input.previewFingerprint) {
    throw conflictError(
      "Payment preview is stale. Review the current obligations and preview again.",
    );
  }

  const paymentType = input.direction === "receive" ? "receipt" : "payout";
  ensurePaymentSequencesForStall(tx, context.stallId);
  const sequence = allocateNextPaymentSequence(tx, context.stallId, paymentType);
  const referenceNumber = formatPaymentReference(paymentType, sequence);

  const paymentId = deps.createId();
  const postingId = deps.createId();
  ensurePartyAccount(tx, {
    id: deps.createId(),
    stallId: context.stallId,
    partyKind: input.partyKind,
    partyId: input.partyId,
    createdAt: now,
    updatedAt: now,
  });
  postLedgerEntries(tx, {
    postingId,
    stallId: context.stallId,
    sourceType: PAYMENT_SOURCE_TYPE,
    sourceId: paymentId,
    financialEventType: PAYMENT_EVENT_POSTED,
    eventSequence: 1,
    businessDate: evaluated.businessDate,
    recordedAt: now,
    actorStaffId: context.actorRef,
    description: `Payment ${referenceNumber}`,
    currency: "LKR",
    entries: [
      {
        entryId: deps.createId(),
        partyKind: input.partyKind,
        partyId: input.partyId,
        amountMinor: paymentLedgerAmountMinor(input.amountMinor),
      },
    ],
  });

  insertPayment(tx, {
    id: paymentId,
    stallId: context.stallId,
    partyKind: input.partyKind,
    farmerId: input.partyKind === "farmer" ? input.partyId : null,
    traderId: input.partyKind === "trader" ? input.partyId : null,
    direction: input.direction,
    method: input.method,
    amountMinor: input.amountMinor,
    businessDate: evaluated.businessDate,
    referenceNumber,
    status: "posted",
    paidAt: now,
    recordedAt: now,
    actorStaffId: context.actorRef,
    postingId,
    bankTransferReference: input.bankTransferReference ?? null,
    bankTransferDate: input.bankTransferDate ?? null,
    bankAccountLabel: input.bankAccountLabel ?? null,
    chequeNumber: input.chequeNumber ?? null,
    issuingBankLabel: input.issuingBankLabel ?? null,
    chequeDate: input.chequeDate ?? null,
    physicalHandoverDate: input.physicalHandoverDate ?? null,
    note: input.note ?? null,
    createdAt: now,
  });

  const allocationIds = insertAllocations(deps, tx, {
    stallId: context.stallId,
    paymentId,
    allocations: evaluated.allocations,
    now,
  });
  refreshSettlementProjections(tx, context.stallId, evaluated.allocations, now);

  writeAuditAndOutbox({
    tx,
    context,
    action: "payment.posted",
    targetType: "payment",
    targetId: paymentId,
    eventType: PAYMENT_POSTED_EVENT_TYPE,
    eventSchemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
    payload: paymentPostedEventPayloadSchema.parse({
      schemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
      tenantId: context.tenantId,
      stallId: context.stallId,
      paymentId,
      referenceNumber,
      partyKind: input.partyKind,
      partyId: input.partyId,
      direction: input.direction,
      method: input.method,
      amountMinor: input.amountMinor,
      currency: "LKR",
      businessDate: evaluated.businessDate,
      recordedAt: now,
      postingId,
      actorStaffId: context.actorRef,
      deviceId: context.deviceRef,
      allocatedTotalMinor: evaluated.preview.allocatedTotalMinor,
      unappliedAmountMinor: evaluated.preview.unappliedAmountMinor,
      chequeNumber: input.chequeNumber ?? null,
      issuingBankLabel: input.issuingBankLabel ?? null,
      chequeDate: input.chequeDate ?? null,
      physicalHandoverDate: input.physicalHandoverDate ?? null,
      recognitionBasis: chequeRecognitionBasis(input.method),
    }),
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  if (allocationIds.length > 0) {
    writeAuditAndOutbox({
      tx,
      context,
      action: "payment.allocation_created",
      targetType: "payment",
      targetId: paymentId,
      eventType: PAYMENT_ALLOCATION_CREATED_EVENT_TYPE,
      eventSchemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
      payload: paymentAllocationCreatedEventPayloadSchema.parse({
        schemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
        tenantId: context.tenantId,
        stallId: context.stallId,
        paymentId,
        allocationIds,
        representsCashMovement: false,
        allocatedTotalMinor: evaluated.preview.allocatedTotalMinor,
        actorStaffId: context.actorRef,
        recordedAt: now,
      }),
      eventId: deps.createId(),
      auditId: deps.createId(),
      now,
    });
  }

  return paymentPostResponseSchema.parse({
    payment: loadPaymentDto(tx, context.stallId, paymentId),
  });
}

export function runPostPaymentCommand(
  deps: CommandDeps,
  input: PaymentPostRequest,
  meta: CommandRequestMeta,
): PaymentPostResponse {
  assertChequeDirectionAllowed(input);
  const parsed = paymentPostRequestSchema.parse(input);
  return runIdempotentCommand(deps, postDefinition(deps, parsed.direction), {
    input: parsed,
    ...meta,
  });
}

type AllocateExistingEvaluation = {
  payment: PaymentRecord;
  preview: AllocateExistingPaymentPreviewResponse;
  allocations: ResolvedAllocation[];
};

function evaluateAllocateExisting(
  executor: DbExecutor,
  stallId: string,
  request: AllocateExistingPaymentPreviewRequest,
): AllocateExistingEvaluation {
  const payment = requirePayment(executor, stallId, request.paymentId);
  const blockingErrors: string[] = [];

  if (payment.reversesPaymentId !== null) {
    blockingErrors.push("A reversal entry cannot receive allocations.");
  } else if (payment.status !== "posted" || payment.reversedByPaymentId !== null) {
    blockingErrors.push("A reversed payment cannot receive allocations.");
  }

  const partyId = paymentPartyId(payment);
  const activeAllocatedMinor = sumActiveAllocatedForPayment(executor, stallId, payment.id);
  const availableAmountMinor = paymentAvailableAmountMinor(
    payment.amountMinor,
    activeAllocatedMinor,
  );
  if (availableAmountMinor === 0 && blockingErrors.length === 0) {
    blockingErrors.push("Payment has no unapplied amount left to allocate.");
  }

  let resolution: AllocationResolution = {
    allocations: [],
    allocatedTotalMinor: 0,
    unappliedMinor: availableAmountMinor,
    blockingErrors: [],
  };
  if (blockingErrors.length === 0) {
    const rows = loadEligibleRows(executor, stallId, payment.partyKind, partyId);
    resolution = resolveAllocations({
      rows,
      availableAmountMinor,
      requested: request.allocations,
      proposeOldestFirst: false,
      businessDate: payment.businessDate,
    });
    blockingErrors.push(...resolution.blockingErrors);
  }

  const material =
    resolution.blockingErrors.length === 0 && blockingErrors.length === 0
      ? sortedAllocationMaterial(resolution.allocations)
      : sortedAllocationMaterial(
          request.allocations.map((item) => ({
            obligationKind: item.obligationKind,
            targetId: item.targetId,
            appliedAmountMinor: item.appliedAmountMinor,
            remainingAfterMinor: null,
          })),
        );

  const previewFingerprint = hashFingerprint(
    JSON.stringify({
      kind: "payment_allocate_existing",
      version: 1,
      paymentId: payment.id,
      availableAmountMinor,
      allocations: material,
      remainingUnappliedMinor: resolution.unappliedMinor,
    }),
  );

  const preview = allocateExistingPaymentPreviewResponseSchema.parse({
    paymentId: payment.id,
    referenceNumber: payment.referenceNumber,
    availableAmountMinor,
    allocations: resolution.allocations.map((item) => ({
      obligationKind: item.obligationKind,
      targetId: item.targetId,
      appliedAmountMinor: item.appliedAmountMinor,
      remainingAfterMinor: item.remainingAfterMinor,
      label: item.label,
      farmerBillId: item.farmerBillId,
    })),
    allocatedTotalMinor: resolution.allocatedTotalMinor,
    remainingUnappliedMinor: resolution.unappliedMinor,
    accountBalanceUnchanged: true,
    previewFingerprint,
    blockingErrors,
  });
  return { payment, preview, allocations: resolution.allocations };
}

export function buildAllocateExistingPreview(
  deps: CommandDeps,
  context: ExecutionContext,
  rawRequest: AllocateExistingPaymentPreviewRequest,
): AllocateExistingPaymentPreviewResponse {
  const request = allocateExistingPaymentPreviewRequestSchema.parse(rawRequest);
  return evaluateAllocateExisting(deps.database, context.stallId, request).preview;
}

function allocateExistingDefinition(
  deps: CommandDeps,
  direction: PaymentDirection,
): CommandDefinition<AllocateExistingPaymentRequest, AllocateExistingPaymentResponse> {
  return {
    type: PAYMENT_ALLOCATE_EXISTING_COMMAND_TYPE,
    version: "1",
    requiredCapability: capabilityForPaymentDirection(direction),
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      try {
        return executeAllocateExisting(deps, tx, context, input, direction);
      } catch (error) {
        if (error instanceof DomainError) {
          mapDomainError(error);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      allocateExistingPaymentResponseSchema.parse(JSON.parse(resultRef)),
  };
}

function executeAllocateExisting(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: AllocateExistingPaymentRequest,
  authorizedDirection: PaymentDirection,
): AllocateExistingPaymentResponse {
  const evaluated = evaluateAllocateExisting(tx, context.stallId, {
    paymentId: input.paymentId,
    allocations: input.allocations,
  });
  if (evaluated.payment.direction !== authorizedDirection) {
    throw conflictError("Payment direction does not match the authorized allocation capability.");
  }
  if (evaluated.preview.blockingErrors.length > 0) {
    throw conflictError(
      `Allocation can no longer be applied as reviewed: ${evaluated.preview.blockingErrors.join(" ")}`,
    );
  }
  if (evaluated.preview.previewFingerprint !== input.previewFingerprint) {
    throw conflictError(
      "Allocation preview is stale. Review the current obligations and preview again.",
    );
  }

  const now = deps.now();
  // Allocation-only operation: the ledger is deliberately untouched.
  const allocationIds = insertAllocations(deps, tx, {
    stallId: context.stallId,
    paymentId: evaluated.payment.id,
    allocations: evaluated.allocations,
    now,
  });
  refreshSettlementProjections(tx, context.stallId, evaluated.allocations, now);

  writeAuditAndOutbox({
    tx,
    context,
    action: "payment.allocation_created",
    targetType: "payment",
    targetId: evaluated.payment.id,
    eventType: PAYMENT_ALLOCATION_CREATED_EVENT_TYPE,
    eventSchemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
    payload: paymentAllocationCreatedEventPayloadSchema.parse({
      schemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
      tenantId: context.tenantId,
      stallId: context.stallId,
      paymentId: evaluated.payment.id,
      allocationIds,
      representsCashMovement: false,
      allocatedTotalMinor: evaluated.preview.allocatedTotalMinor,
      actorStaffId: context.actorRef,
      recordedAt: now,
    }),
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  return allocateExistingPaymentResponseSchema.parse({
    payment: loadPaymentDto(tx, context.stallId, evaluated.payment.id),
  });
}

export function runAllocateExistingCommand(
  deps: CommandDeps,
  input: AllocateExistingPaymentRequest,
  meta: CommandRequestMeta,
): AllocateExistingPaymentResponse {
  const parsed = allocateExistingPaymentRequestSchema.parse(input);
  // The capability follows the payment's direction. A missing payment falls back to the receive
  // capability so unauthorized callers never learn whether a payment id exists.
  const existing = getBoundPaymentForCapability(deps, parsed.paymentId);
  const direction: PaymentDirection = existing?.direction ?? "receive";
  return runIdempotentCommand(deps, allocateExistingDefinition(deps, direction), {
    input: parsed,
    ...meta,
  });
}

function getBoundPaymentForCapability(deps: CommandDeps, paymentId: string): PaymentRecord | null {
  const binding = resolveBoundStall(deps.database);
  if (binding instanceof AppError) {
    return null;
  }
  return getPaymentById(deps.database, binding.stallId, paymentId);
}

type ReversalEvaluation = {
  payment: PaymentRecord;
  preview: PaymentReversalPreviewResponse;
  ledgerEntries: ReturnType<typeof listLedgerEntriesForPosting>;
  activeAllocations: PaymentAllocationRecord[];
};

function evaluateReversal(
  executor: DbExecutor,
  stallId: string,
  request: PaymentReversalPreviewRequest,
): ReversalEvaluation {
  const payment = requirePayment(executor, stallId, request.paymentId);
  const blockingErrors: string[] = [];

  if (payment.reversesPaymentId !== null) {
    blockingErrors.push("A reversal entry cannot itself be reversed.");
  } else if (payment.status !== "posted" || payment.reversedByPaymentId !== null) {
    blockingErrors.push("Payment has already been reversed.");
  }

  const ledgerEntries = listLedgerEntriesForPosting(executor, stallId, payment.postingId);
  if (ledgerEntries.length !== 1) {
    blockingErrors.push("Payment ledger posting is missing or has an unsupported shape.");
  } else if (findReversalEntryFor(executor, stallId, ledgerEntries[0]!.id) !== null) {
    blockingErrors.push("Payment ledger posting has already been reversed.");
  }

  const partyId = paymentPartyId(payment);
  const activeAllocations = payment.allocations.filter((item) => item.status === "active");
  const balanceBefore = sumAccountBalanceMinor(executor, stallId, payment.partyKind, partyId);
  const originalLedgerAmount =
    ledgerEntries[0]?.amountMinor ?? paymentLedgerAmountMinor(payment.amountMinor);
  const balanceAfter = balanceBefore + exactReversalAmount(originalLedgerAmount);

  const allocationRecords = toPaymentRecordDto(payment).allocations.filter(
    (item) => item.status === "active",
  );
  const reopening = activeAllocations.map((item) => ({
    obligationKind: item.obligationKind,
    targetId: targetIdOfAllocation(item),
    reopenAmountMinor: item.appliedAmountMinor,
    label:
      describeObligationTarget(
        executor,
        stallId,
        item.obligationKind,
        targetIdOfAllocation(item),
      ) ?? "Obligation",
  }));

  const previewFingerprint = hashFingerprint(
    JSON.stringify({
      kind: "payment_reversal",
      version: 1,
      paymentId: payment.id,
      reason: request.reason,
      amountMinor: payment.amountMinor,
      ledgerEntries: ledgerEntries.map((entry) => [entry.id, entry.amountMinor]),
      allocations: activeAllocations
        .map((item) => [
          item.id,
          item.obligationKind,
          targetIdOfAllocation(item),
          item.appliedAmountMinor,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    }),
  );

  const preview = paymentReversalPreviewResponseSchema.parse({
    paymentId: payment.id,
    referenceNumber: payment.referenceNumber,
    originalAmountMinor: payment.amountMinor,
    method: payment.method,
    direction: payment.direction,
    allocationsToRelease: allocationRecords,
    obligationsReopening: reopening,
    accountBalanceBeforeMinor: balanceBefore,
    accountBalanceAfterMinor: balanceAfter,
    reason: request.reason,
    previewFingerprint,
    blockingErrors,
  });
  return { payment, preview, ledgerEntries, activeAllocations };
}

/** Bookkeeping-reversal preview. This is not a cash refund or a bank transfer. */
export function buildReversalPreview(
  deps: CommandDeps,
  context: ExecutionContext,
  rawRequest: PaymentReversalPreviewRequest,
): PaymentReversalPreviewResponse {
  const request = paymentReversalPreviewRequestSchema.parse(rawRequest);
  return evaluateReversal(deps.database, context.stallId, request).preview;
}

function reverseDefinition(
  deps: CommandDeps,
): CommandDefinition<PaymentReversalCommitRequest, PaymentReversalCommitResponse> {
  return {
    type: PAYMENT_REVERSE_COMMAND_TYPE,
    version: "1",
    requiredCapability: PAYMENTS_REVERSE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      try {
        return executeReversePayment(deps, tx, context, input);
      } catch (error) {
        if (error instanceof DomainError) {
          mapDomainError(error);
        }
        if (error instanceof DuplicateFinancialEventError) {
          throw conflictError(error.message);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      paymentReversalCommitResponseSchema.parse(JSON.parse(resultRef)),
  };
}

function executeReversePayment(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: PaymentReversalCommitRequest,
): PaymentReversalCommitResponse {
  const evaluated = evaluateReversal(tx, context.stallId, {
    paymentId: input.paymentId,
    reason: input.reason,
  });
  if (evaluated.preview.blockingErrors.length > 0) {
    throw conflictError(
      `Payment cannot be reversed: ${evaluated.preview.blockingErrors.join(" ")}`,
    );
  }
  if (evaluated.preview.previewFingerprint !== input.previewFingerprint) {
    throw conflictError("Reversal preview is stale. Review the current payment and preview again.");
  }

  const original = evaluated.payment;
  const originalEntry = evaluated.ledgerEntries[0]!;
  const partyId = paymentPartyId(original);
  const now = deps.now();
  const businessDate = todayUtcCalendarDate(now);

  const paymentType = original.direction === "receive" ? "receipt" : "payout";
  ensurePaymentSequencesForStall(tx, context.stallId);
  const sequence = allocateNextPaymentSequence(tx, context.stallId, paymentType);
  const reversalReference = formatPaymentReference(paymentType, sequence);

  const reversalPaymentId = deps.createId();
  const reversalPostingId = deps.createId();

  postLedgerEntries(tx, {
    postingId: reversalPostingId,
    stallId: context.stallId,
    sourceType: PAYMENT_SOURCE_TYPE,
    sourceId: reversalPaymentId,
    financialEventType: PAYMENT_EVENT_REVERSED,
    eventSequence: 1,
    businessDate,
    recordedAt: now,
    actorStaffId: context.actorRef,
    description: `Payment reversal ${reversalReference} of ${original.referenceNumber}`,
    currency: "LKR",
    entries: [
      {
        entryId: deps.createId(),
        partyKind: original.partyKind,
        partyId,
        amountMinor: exactReversalAmount(originalEntry.amountMinor),
        reversesEntryId: originalEntry.id,
      },
    ],
  });

  insertPayment(tx, {
    id: reversalPaymentId,
    stallId: context.stallId,
    partyKind: original.partyKind,
    farmerId: original.farmerId,
    traderId: original.traderId,
    direction: original.direction,
    method: original.method,
    amountMinor: original.amountMinor,
    businessDate,
    referenceNumber: reversalReference,
    status: "posted",
    paidAt: now,
    recordedAt: now,
    actorStaffId: context.actorRef,
    postingId: reversalPostingId,
    reversesPaymentId: original.id,
    bankTransferReference: original.bankTransferReference,
    bankTransferDate: original.bankTransferDate,
    bankAccountLabel: original.bankAccountLabel,
    chequeNumber: original.chequeNumber,
    issuingBankLabel: original.issuingBankLabel,
    chequeDate: original.chequeDate,
    physicalHandoverDate: original.physicalHandoverDate,
    note: input.reason,
    createdAt: now,
  });

  reverseActiveAllocationsForPayment(tx, context.stallId, original.id, now);
  markPaymentReversed(tx, {
    stallId: context.stallId,
    originalPaymentId: original.id,
    reversalPaymentId,
  });
  refreshSettlementProjections(
    tx,
    context.stallId,
    evaluated.activeAllocations.map((item) => ({
      obligationKind: item.obligationKind,
      targetId: targetIdOfAllocation(item),
      farmerBillId: item.farmerBillId,
    })),
    now,
  );

  writeAuditAndOutbox({
    tx,
    context,
    action: "payment.reversed",
    targetType: "payment",
    targetId: original.id,
    eventType: PAYMENT_REVERSED_EVENT_TYPE,
    eventSchemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
    payload: paymentReversedEventPayloadSchema.parse({
      schemaVersion: PAYMENT_EVENT_SCHEMA_VERSION,
      tenantId: context.tenantId,
      stallId: context.stallId,
      originalPaymentId: original.id,
      reversalPaymentId,
      originalReferenceNumber: original.referenceNumber,
      reversalReferenceNumber: reversalReference,
      amountMinor: original.amountMinor,
      currency: "LKR",
      reason: input.reason,
      originalPostingId: original.postingId,
      reversalPostingId,
      actorStaffId: context.actorRef,
      recordedAt: now,
    }),
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  return paymentReversalCommitResponseSchema.parse({
    originalPayment: loadPaymentDto(tx, context.stallId, original.id),
    reversalPayment: loadPaymentDto(tx, context.stallId, reversalPaymentId),
  });
}

export function runReversePaymentCommand(
  deps: CommandDeps,
  input: PaymentReversalCommitRequest,
  meta: CommandRequestMeta,
): PaymentReversalCommitResponse {
  const parsed = paymentReversalCommitRequestSchema.parse(input);
  return runIdempotentCommand(deps, reverseDefinition(deps), { input: parsed, ...meta });
}
