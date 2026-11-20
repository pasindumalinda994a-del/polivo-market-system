import {
  PAYMENT_CHEQUE_RECOGNITION_BASIS,
  SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
  type SyncIngestEvent,
  type SyncLedgerPostingSnapshot,
} from "@polivo/contracts";
import {
  getFarmerBillById,
  getLedgerPostingById,
  getPartyAccount,
  getPaymentById,
  getSaleById,
  getSaleCorrectionOperationById,
  getTraderBillBySaleId,
  listLedgerEntriesForPosting,
  listSaleFarmerAllocations,
  type LocalDatabase,
  type OutboxEventRecord,
  type PaymentAllocationRecord,
  type PaymentRecord,
  type SaleRecord,
  type TraderBillDetailRecord,
} from "@polivo/db-local";

import { validateEnrichedIngestEvent } from "./validate-enriched.js";

export class EnrichmentError extends Error {
  readonly code = "ENRICHMENT_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "EnrichmentError";
  }
}

const FINANCIAL_V2_TYPES = new Set([
  "polivo.sale.finalized",
  "polivo.trader_bill.issued",
  "polivo.farmer_bill.issued",
  "polivo.payment.posted",
  "polivo.payment.allocation_created",
  "polivo.payment.reversed",
  "polivo.sale.reversed",
  "polivo.sale.corrected",
  "polivo.opening_balance.posted",
  "polivo.opening_balance.corrected",
]);

function asRecord(payloadJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new EnrichmentError("Outbox payload must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof EnrichmentError) {
      throw error;
    }
    throw new EnrichmentError("Outbox payload_json is not valid JSON.");
  }
}

function requireStringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new EnrichmentError(`Outbox payload missing required field "${key}".`);
  }
  return value;
}

function allocationTargetId(allocation: PaymentAllocationRecord): string {
  if (allocation.traderBillId) {
    return allocation.traderBillId;
  }
  if (allocation.saleLineId) {
    return allocation.saleLineId;
  }
  if (allocation.openingDraftId) {
    return allocation.openingDraftId;
  }
  if (allocation.farmerBillId) {
    return allocation.farmerBillId;
  }
  throw new EnrichmentError(`Payment allocation "${allocation.id}" has no target id.`);
}

function mapLedgerSnapshot(
  database: LocalDatabase,
  stallId: string,
  postingId: string,
): SyncLedgerPostingSnapshot {
  const posting = getLedgerPostingById(database, stallId, postingId);
  if (!posting) {
    throw new EnrichmentError(`Ledger posting "${postingId}" was not found for enrichment.`);
  }
  const entries = listLedgerEntriesForPosting(database, stallId, postingId);
  if (entries.length === 0) {
    throw new EnrichmentError(`Ledger posting "${postingId}" has no entries.`);
  }
  return {
    id: posting.id,
    sourceType: posting.sourceType,
    sourceId: posting.sourceId,
    financialEventType: posting.financialEventType,
    eventSequence: posting.eventSequence,
    businessDate: posting.businessDate,
    recordedAt: posting.recordedAt,
    actorStaffId: posting.actorStaffId,
    description: posting.description,
    currency: "LKR",
    entries: entries.map((entry) => ({
      id: entry.id,
      partyKind: entry.partyKind,
      partyId: entry.partyId,
      amountMinor: entry.amountMinor,
      currency: "LKR" as const,
      postingSequence: entry.postingSequence,
      reversesEntryId: entry.reversesEntryId,
    })),
  };
}

function mapFinalizedSaleLines(sale: SaleRecord) {
  return sale.lines.map((line) => {
    if (
      line.farmerId === null ||
      line.farmerShortCode === null ||
      line.farmerDisplayName === null ||
      line.packageTypeId === null ||
      line.packageTypeShortCode === null ||
      line.packageTypeDisplayName === null ||
      line.vegetableShortCode === null ||
      line.vegetableDisplayName === null ||
      line.grossWeightHundredths === null ||
      line.netWeightHundredths === null ||
      line.lineSaleAmountMinor === null ||
      line.appliedCommissionRatePerKgMinor === null ||
      line.appliedCommissionAmountMinor === null ||
      line.commissionPolicyId === null ||
      line.commissionVersionId === null ||
      line.commissionBandId === null ||
      line.traderPaysMinor === null ||
      line.farmerReceivesMinor === null
    ) {
      throw new EnrichmentError(
        `Sale "${sale.id}" line "${line.id}" is missing finalized snapshots.`,
      );
    }
    return {
      lineId: line.id,
      lineOrder: line.lineOrder,
      farmerId: line.farmerId,
      farmerShortCode: line.farmerShortCode,
      farmerDisplayName: line.farmerDisplayName,
      vegetableId: line.vegetableId,
      vegetableCode: line.vegetableShortCode,
      vegetableDisplayName: line.vegetableDisplayName,
      packageTypeId: line.packageTypeId,
      packageTypeCode: line.packageTypeShortCode,
      packageTypeDisplayName: line.packageTypeDisplayName,
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      packagingWeightHundredths: line.packagingWeightHundredths,
      weights: line.weights.map((weight) => ({
        rowKey: weight.rowKey,
        ...(weight.packageTypeId ? { packageTypeId: weight.packageTypeId } : {}),
        grossWeightHundredths: weight.grossWeightHundredths,
      })),
      grossWeightHundredths: line.grossWeightHundredths,
      netWeightHundredths: line.netWeightHundredths,
      saleAmountMinor: line.lineSaleAmountMinor,
      commissionPolicyId: line.commissionPolicyId,
      commissionVersionId: line.commissionVersionId,
      commissionBandId: line.commissionBandId,
      appliedCommissionRatePerKgMinor: line.appliedCommissionRatePerKgMinor,
      commissionAmountMinor: line.appliedCommissionAmountMinor,
      traderPaysMinor: line.traderPaysMinor,
      farmerReceivesBeforeDeductionsMinor: line.farmerReceivesMinor,
      notes: line.notes,
    };
  });
}

function mapTraderBillWire(
  traderBill: TraderBillDetailRecord,
  lines: ReturnType<typeof mapFinalizedSaleLines>,
) {
  return {
    id: traderBill.id,
    stallId: traderBill.stallId,
    saleId: traderBill.saleId,
    traderId: traderBill.traderId,
    traderShortCode: traderBill.traderShortCode,
    traderDisplayName: traderBill.traderDisplayName,
    billType: "trader" as const,
    billNumber: traderBill.billNumber,
    businessDate: traderBill.businessDate,
    status: "finalized" as const,
    totalAmountMinor: traderBill.totalAmountMinor,
    paymentStatus: traderBill.paymentStatus,
    commissionPolicyId: traderBill.commissionPolicyId,
    commissionVersionId: traderBill.commissionVersionId,
    calculationFingerprint: traderBill.calculationFingerprint,
    lines,
    totalCommissionMinor: traderBill.totalCommissionMinor,
    totalFarmerReceivesBeforeDeductionsMinor: traderBill.totalFarmerReceivesMinor,
    postingId: traderBill.postingId,
    finalizedAt: traderBill.finalizedAt,
    createdAt: traderBill.createdAt,
    updatedAt: traderBill.updatedAt,
  };
}

/**
 * Build a complete sale-finalized wire summary from immutable local rows.
 * Never reuse a partial caller object as the nested `summary` field — cloud
 * syncSaleFinalizedV2PayloadSchema requires the full saleFinalizedEventPayloadSchema.
 */
function buildSaleFinalizedSummary(
  sale: SaleRecord,
  traderBill: TraderBillDetailRecord,
  postingId: string,
): Record<string, unknown> {
  if (
    sale.totalTraderPaysMinor === null ||
    sale.totalCommissionMinor === null ||
    sale.commissionPolicyId === null ||
    sale.commissionVersionId === null ||
    sale.calculationFingerprint === null
  ) {
    throw new EnrichmentError(
      `Sale "${sale.id}" is missing finalized snapshot fields required for sync summary.`,
    );
  }
  return {
    saleId: sale.id,
    traderBillId: traderBill.id,
    billNumber: traderBill.billNumber,
    traderId: sale.traderId,
    businessDate: sale.businessDate,
    totalAmountMinor: sale.totalTraderPaysMinor,
    totalCommissionMinor: sale.totalCommissionMinor,
    postingId,
    commissionPolicyId: sale.commissionPolicyId,
    commissionVersionId: sale.commissionVersionId,
    calculationFingerprint: sale.calculationFingerprint,
    lineCount: sale.lines.length,
  };
}

function buildSaleV2Payload(
  database: LocalDatabase,
  stallId: string,
  lookup: Record<string, unknown>,
): Record<string, unknown> {
  const saleId = requireStringField(lookup, "saleId");
  const sale = getSaleById(database, stallId, saleId);
  if (!sale || sale.status !== "finalized" || !sale.finalizedAt) {
    throw new EnrichmentError(`Finalized sale "${saleId}" was not found for enrichment.`);
  }
  const traderBill = getTraderBillBySaleId(database, stallId, saleId);
  if (!traderBill) {
    throw new EnrichmentError(`Trader bill for sale "${saleId}" was not found.`);
  }
  const postingId =
    typeof lookup.postingId === "string"
      ? lookup.postingId
      : (sale.postingId ?? traderBill.postingId);
  if (!postingId) {
    throw new EnrichmentError(`Sale "${saleId}" is missing ledger posting id.`);
  }
  const summary = buildSaleFinalizedSummary(sale, traderBill, postingId);
  const allocations = listSaleFarmerAllocations(database, stallId, saleId);
  const lines = mapFinalizedSaleLines(sale);
  const packageWeights = sale.lines.flatMap((line) =>
    line.weights.map((weight) => ({
      id: weight.id,
      saleLineId: line.id,
      packageIndex: weight.packageIndex,
      grossWeightHundredths: weight.grossWeightHundredths,
    })),
  );

  return {
    schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
    summary,
    sale: {
      id: sale.id,
      traderId: sale.traderId,
      businessDate: sale.businessDate,
      status: "finalized" as const,
      revision: sale.revision,
      correctsSaleId: sale.correctsSaleId,
      finalizedAt: sale.finalizedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    },
    lines,
    packageWeights,
    farmerAllocations: allocations.map((row) => ({
      id: row.id,
      saleLineId: row.saleLineId,
      farmerId: row.farmerId,
      allocatedNetWeightHundredths: row.allocatedNetWeightHundredths,
    })),
    traderBill: mapTraderBillWire(traderBill, lines),
    ledgerPosting: mapLedgerSnapshot(database, stallId, postingId),
  };
}

function mapPaymentWire(payment: PaymentRecord) {
  const partyId = payment.partyKind === "farmer" ? payment.farmerId : payment.traderId;
  if (!partyId) {
    throw new EnrichmentError(`Payment "${payment.id}" is missing party id.`);
  }
  return {
    id: payment.id,
    referenceNumber: payment.referenceNumber,
    partyKind: payment.partyKind,
    partyId,
    direction: payment.direction,
    method: payment.method,
    amountMinor: payment.amountMinor,
    currency: "LKR" as const,
    businessDate: payment.businessDate,
    recordedAt: payment.recordedAt,
    status: payment.status,
    bankTransferReference: payment.bankTransferReference,
    bankTransferDate: payment.bankTransferDate,
    bankAccountLabel: payment.bankAccountLabel,
    chequeNumber: payment.chequeNumber,
    issuingBankLabel: payment.issuingBankLabel,
    chequeDate: payment.chequeDate,
    physicalHandoverDate: payment.physicalHandoverDate,
    recognitionBasis: payment.method === "cheque" ? PAYMENT_CHEQUE_RECOGNITION_BASIS : null,
  };
}

/**
 * Rebuild a complete payment-posted wire summary from the immutable payment row.
 * Legacy thin outbox rows may omit cheque metadata keys; Zod requires string|null.
 * Never invent empty-string cheque numbers — cash/bank use null; cheque uses DB value.
 */
function buildPaymentPostedSummary(
  payment: PaymentRecord,
  thin: Record<string, unknown>,
  postingId: string,
): Record<string, unknown> {
  const partyId = payment.partyKind === "farmer" ? payment.farmerId : payment.traderId;
  if (!partyId) {
    throw new EnrichmentError(`Payment "${payment.id}" is missing party id.`);
  }

  const tenantId =
    typeof thin.tenantId === "string" && thin.tenantId.length > 0 ? thin.tenantId : null;
  if (!tenantId) {
    throw new EnrichmentError(`Payment "${payment.id}" outbox summary is missing tenantId.`);
  }

  const allocatedTotalMinor =
    typeof thin.allocatedTotalMinor === "number" ? thin.allocatedTotalMinor : null;
  const unappliedAmountMinor =
    typeof thin.unappliedAmountMinor === "number" ? thin.unappliedAmountMinor : null;
  if (allocatedTotalMinor === null || unappliedAmountMinor === null) {
    throw new EnrichmentError(
      `Payment "${payment.id}" outbox summary is missing allocation totals.`,
    );
  }

  const deviceId =
    thin.deviceId === null || typeof thin.deviceId === "string" ? thin.deviceId : null;

  const isCheque = payment.method === "cheque";

  return {
    schemaVersion: "1",
    tenantId,
    stallId: payment.stallId,
    paymentId: payment.id,
    referenceNumber: payment.referenceNumber,
    partyKind: payment.partyKind,
    partyId,
    direction: payment.direction,
    method: payment.method,
    amountMinor: payment.amountMinor,
    currency: "LKR",
    businessDate: payment.businessDate,
    recordedAt: payment.recordedAt,
    postingId,
    actorStaffId: payment.actorStaffId,
    deviceId,
    allocatedTotalMinor,
    unappliedAmountMinor,
    chequeNumber: isCheque ? payment.chequeNumber : null,
    issuingBankLabel: isCheque ? payment.issuingBankLabel : null,
    chequeDate: isCheque ? payment.chequeDate : null,
    physicalHandoverDate: isCheque ? payment.physicalHandoverDate : null,
    recognitionBasis: isCheque ? PAYMENT_CHEQUE_RECOGNITION_BASIS : null,
  };
}

function mapPaymentAllocations(payment: PaymentRecord) {
  return payment.allocations.map((allocation) => ({
    id: allocation.id,
    obligationKind: allocation.obligationKind,
    targetId: allocationTargetId(allocation),
    appliedAmountMinor: allocation.appliedAmountMinor,
    status: allocation.status,
    farmerBillId: allocation.farmerBillId,
    traderBillId: allocation.traderBillId,
    saleLineId: allocation.saleLineId,
    openingDraftId: allocation.openingDraftId,
    createdAt: allocation.createdAt,
  }));
}

/**
 * Build the wire ingest event from a durable outbox row.
 * Financial thin v1 payloads are enriched to apply schema v2 from immutable local rows.
 * The stored outbox payload is never rewritten.
 */
export function enrichOutboxEventForUpload(
  database: LocalDatabase,
  event: OutboxEventRecord,
): SyncIngestEvent {
  const summary = asRecord(event.payloadJson);
  let payload: Record<string, unknown> = summary;
  let eventSchemaVersion = event.eventSchemaVersion;

  if (FINANCIAL_V2_TYPES.has(event.eventType) && event.eventSchemaVersion === "1") {
    eventSchemaVersion = SYNC_FINANCIAL_APPLY_SCHEMA_VERSION;

    if (
      event.eventType === "polivo.sale.finalized" ||
      event.eventType === "polivo.trader_bill.issued"
    ) {
      payload = buildSaleV2Payload(database, event.stallId, summary);
    } else if (event.eventType === "polivo.farmer_bill.issued") {
      const billId =
        typeof summary.farmerBillId === "string"
          ? summary.farmerBillId
          : requireStringField(summary, "billId");
      const bill = getFarmerBillById(database, event.stallId, billId);
      if (!bill) {
        throw new EnrichmentError(`Farmer bill "${billId}" was not found for enrichment.`);
      }
      payload = {
        schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
        summary,
        bill: {
          id: bill.id,
          stallId: bill.stallId,
          farmerId: bill.farmerId,
          farmerShortCode: bill.farmerShortCode,
          farmerDisplayName: bill.farmerDisplayName,
          billType: "farmer" as const,
          billNumber: bill.billNumber,
          businessDate: bill.businessDate,
          status: "finalized" as const,
          coveredBusinessDateFrom: bill.coveredBusinessDateFrom,
          coveredBusinessDateTo: bill.coveredBusinessDateTo,
          totalSaleAmountMinor: bill.totalSaleAmountMinor,
          totalCommissionMinor: bill.totalCommissionMinor,
          totalFarmerReceivesMinor: bill.totalFarmerReceivesMinor,
          totalAmountMinor: bill.totalAmountMinor,
          currency: "LKR" as const,
          paymentStatus: bill.paymentStatus,
          selectionFingerprint: bill.selectionFingerprint,
          lines: bill.lines.map((line) => ({
            saleLineId: line.saleLineId,
            saleId: line.saleId,
            lineOrder: line.lineOrder,
            traderBillId: line.traderBillId,
            traderBillNumber: line.traderBillNumber,
            businessDate: line.businessDate,
            vegetableId: line.vegetableId,
            vegetableCode: line.vegetableShortCode,
            vegetableDisplayName: line.vegetableDisplayName,
            packageTypeId: line.packageTypeId,
            packageTypeCode: line.packageTypeShortCode,
            packageTypeDisplayName: line.packageTypeDisplayName,
            packageCount: line.packageCount,
            netWeightHundredths: line.netWeightHundredths,
            unitPricePerKgMinor: line.unitPricePerKgMinor,
            saleAmountMinor: line.saleAmountMinor,
            commissionAmountMinor: line.commissionAmountMinor,
            farmerReceivesMinor: line.farmerReceivesMinor,
            commissionPolicyId: line.commissionPolicyId,
            commissionVersionId: line.commissionVersionId,
            commissionBandId: line.commissionBandId,
            appliedCommissionRatePerKgMinor: line.appliedCommissionRatePerKgMinor,
            salePostingId: line.salePostingId,
          })),
          finalizedAt: bill.finalizedAt,
          createdAt: bill.createdAt,
          updatedAt: bill.updatedAt,
        },
        lines: bill.lines.map((line) => ({
          saleLineId: line.saleLineId,
          saleId: line.saleId,
          lineOrder: line.lineOrder,
          traderBillId: line.traderBillId,
          traderBillNumber: line.traderBillNumber,
          businessDate: line.businessDate,
          vegetableId: line.vegetableId,
          vegetableCode: line.vegetableShortCode,
          vegetableDisplayName: line.vegetableDisplayName,
          packageTypeId: line.packageTypeId,
          packageTypeCode: line.packageTypeShortCode,
          packageTypeDisplayName: line.packageTypeDisplayName,
          packageCount: line.packageCount,
          netWeightHundredths: line.netWeightHundredths,
          unitPricePerKgMinor: line.unitPricePerKgMinor,
          saleAmountMinor: line.saleAmountMinor,
          commissionAmountMinor: line.commissionAmountMinor,
          farmerReceivesMinor: line.farmerReceivesMinor,
          commissionPolicyId: line.commissionPolicyId,
          commissionVersionId: line.commissionVersionId,
          commissionBandId: line.commissionBandId,
          appliedCommissionRatePerKgMinor: line.appliedCommissionRatePerKgMinor,
          salePostingId: line.salePostingId,
        })),
      };
    } else if (event.eventType === "polivo.payment.posted") {
      const paymentId = requireStringField(summary, "paymentId");
      const payment = getPaymentById(database, event.stallId, paymentId);
      if (!payment) {
        throw new EnrichmentError(`Payment "${paymentId}" was not found for enrichment.`);
      }
      const postingId =
        typeof summary.postingId === "string" ? summary.postingId : payment.postingId;
      payload = {
        schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
        summary: buildPaymentPostedSummary(payment, summary, postingId),
        payment: mapPaymentWire(payment),
        allocations: mapPaymentAllocations(payment),
        ledgerPosting: mapLedgerSnapshot(database, event.stallId, postingId),
      };
    } else if (event.eventType === "polivo.payment.allocation_created") {
      const paymentId = requireStringField(summary, "paymentId");
      const payment = getPaymentById(database, event.stallId, paymentId);
      if (!payment) {
        throw new EnrichmentError(`Payment "${paymentId}" was not found for enrichment.`);
      }
      payload = {
        schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
        paymentId,
        allocations: mapPaymentAllocations(payment),
        representsCashMovement: false,
        allocatedTotalMinor: summary.allocatedTotalMinor,
        actorStaffId: summary.actorStaffId,
        recordedAt: summary.recordedAt,
      };
    } else if (event.eventType === "polivo.payment.reversed") {
      const paymentId = requireStringField(summary, "paymentId");
      const payment = getPaymentById(database, event.stallId, paymentId);
      if (!payment) {
        throw new EnrichmentError(`Payment "${paymentId}" was not found for enrichment.`);
      }
      const postingId =
        typeof summary.reversalPostingId === "string"
          ? summary.reversalPostingId
          : payment.postingId;
      payload = {
        schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
        summary,
        originalPaymentStatus: "reversed" as const,
        reversalPayment: mapPaymentWire(payment),
        ledgerPosting: mapLedgerSnapshot(database, event.stallId, postingId),
      };
    } else if (event.eventType === "polivo.sale.reversed") {
      const operationId = requireStringField(summary, "operationId");
      const operation = getSaleCorrectionOperationById(database, event.stallId, operationId);
      if (!operation) {
        throw new EnrichmentError(`Sale correction "${operationId}" was not found.`);
      }
      payload = {
        schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
        summary,
        sourceSaleId: operation.sourceSaleId,
        sourceTraderBillId: operation.originalTraderBillId,
        sourceBillNumber: null,
        reversalLedgerPosting: mapLedgerSnapshot(
          database,
          event.stallId,
          operation.reversalPostingId,
        ),
      };
    } else if (event.eventType === "polivo.sale.corrected") {
      const operationId = requireStringField(summary, "operationId");
      const operation = getSaleCorrectionOperationById(database, event.stallId, operationId);
      if (!operation || !operation.replacementSaleId || !operation.replacementPostingId) {
        throw new EnrichmentError(`Sale correction "${operationId}" replacement is missing.`);
      }
      const replacementSummary = {
        saleId: operation.replacementSaleId,
        postingId: operation.replacementPostingId,
      };
      payload = {
        schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
        summary,
        reversalLedgerPosting: mapLedgerSnapshot(
          database,
          event.stallId,
          operation.reversalPostingId,
        ),
        replacement: buildSaleV2Payload(database, event.stallId, replacementSummary),
      };
    } else if (
      event.eventType === "polivo.opening_balance.posted" ||
      event.eventType === "polivo.opening_balance.corrected"
    ) {
      const partyKind = requireStringField(summary, "partyKind") as "farmer" | "trader";
      const partyId = requireStringField(summary, "partyId");
      const account = getPartyAccount(database, event.stallId, partyKind, partyId);
      const postingId =
        typeof summary.postingId === "string"
          ? summary.postingId
          : typeof summary.replacementPostingId === "string"
            ? summary.replacementPostingId
            : null;
      if (event.eventType === "polivo.opening_balance.posted") {
        payload = {
          schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
          summary,
          ledgerPosting: postingId ? mapLedgerSnapshot(database, event.stallId, postingId) : null,
          partyAccount: {
            partyKind,
            partyId,
            openingStatus: account?.openingStatus === "opened_zero" ? "opened_zero" : "opened",
            openingCutoffDate:
              account?.openingCutoffDate ??
              (typeof summary.cutoffDate === "string"
                ? summary.cutoffDate
                : requireStringField(summary, "openingCutoffDate")),
            openingCompletedAt:
              account?.openingCompletedAt ??
              (typeof summary.recordedAt === "string"
                ? summary.recordedAt
                : requireStringField(summary, "openingCompletedAt")),
            openingDraftId: account?.openingDraftId ?? null,
            openingPostingId: account?.openingPostingId ?? postingId,
          },
        };
      } else {
        const reversalPostingId =
          typeof summary.reversalPostingId === "string" ? summary.reversalPostingId : null;
        payload = {
          schemaVersion: SYNC_FINANCIAL_APPLY_SCHEMA_VERSION,
          summary,
          reversalLedgerPosting: reversalPostingId
            ? mapLedgerSnapshot(database, event.stallId, reversalPostingId)
            : null,
          replacementLedgerPosting: postingId
            ? mapLedgerSnapshot(database, event.stallId, postingId)
            : null,
        };
      }
    }
  }

  const enriched: SyncIngestEvent = {
    eventId: event.eventId,
    eventType: event.eventType,
    eventSchemaVersion,
    sequence: String(event.localSequence),
    transactionGroupId: event.transactionGroupId,
    occurredAt: event.occurredAt,
    payload,
  };

  const validationError = validateEnrichedIngestEvent(enriched);
  if (validationError) {
    throw new EnrichmentError(validationError);
  }

  return enriched;
}
