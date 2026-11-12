import { createHash } from "node:crypto";

import {
  SALE_CORRECTED_EVENT_SCHEMA_VERSION,
  SALE_CORRECTED_EVENT_TYPE,
  SALE_REVERSED_EVENT_SCHEMA_VERSION,
  SALE_REVERSED_EVENT_TYPE,
  saleCorrectedEventPayloadSchema,
  saleCorrectionCommitRequestSchema,
  saleCorrectionCommitResponseSchema,
  saleCorrectionPreviewRequestSchema,
  saleCorrectionPreviewResponseSchema,
  saleReversedEventPayloadSchema,
  type SaleCorrectionCommitRequest,
  type SaleCorrectionCommitResponse,
  type SaleCorrectionPreviewRequest,
  type SaleCorrectionPreviewResponse,
  type SaleDraftLineInput,
} from "@polivo/contracts";
import {
  DuplicateFinancialEventError,
  RevisionConflictError,
  allocateNextBillSequence,
  ensureBillSequencesForStall,
  ensurePartyAccount,
  finalizeSaleWithExpectedRevision,
  getBuyerById,
  getCommissionBandSetById,
  getFarmerById,
  getPackageTypeById,
  getSaleById,
  getVegetableById,
  getStallPrintIdentity,
  insertFinalizedTraderBill,
  insertSaleCorrectionOperation,
  insertSaleDraft,
  listCommissionBandsForSet,
  listLedgerEntriesForPosting,
  markSaleCorrectedWithExpectedRevision,
  markTraderBillCorrected,
  postLedgerEntries,
  resolveSaleCorrectionEligibility,
  type SaleRecord,
  type TxHandle,
} from "@polivo/db-local";
import {
  COMMISSION_ALGORITHM_VERSION,
  COMMISSION_RATE_BASIS_PER_KG_MINOR,
  COMMISSION_ROUNDING_RULE_ID,
  DomainError,
  SALE_EVENT_REPLACED,
  SALE_EVENT_REVERSED,
  SALE_SOURCE_TYPE,
  assertExactReversalNet,
  buildSaleCalculationFingerprintMaterial,
  buildSaleCorrectionPreviewFingerprintMaterial,
  calculateSaleBillWithPolicy,
  exactReversalAmount,
  formatBillNumber,
  normalizeSaleCorrectionReason,
  validateCommissionPolicy,
  validateSaleBillForFinalization,
  type CommissionBand,
  type CommissionPolicy,
  type PolicySaleLineInput,
} from "@polivo/domain";

import type { ExecutionContext } from "../context/execution-context.js";
import { AppError, conflictError, notFoundError, validationError } from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";

export const BILLS_CORRECT_FINALIZED_CAPABILITY = "bills.correct_finalized";
export const BILLS_CANCEL_FINALIZED_CAPABILITY = "bills.cancel_finalized";

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

function toPolicyInputs(lines: readonly SaleDraftLineInput[]): PolicySaleLineInput[] {
  return lines.map((line) => ({
    lineId: line.lineId,
    farmerId: line.farmerId,
    vegetableId: line.vegetableId,
    packageTypeId: line.packageTypeId,
    unitPricePerKgMinor: line.unitPricePerKgMinor,
    notes: line.notes ?? null,
    weights: {
      rows: line.weights.rows.map((row) => ({
        rowKey: row.rowKey,
        packageTypeId: row.packageTypeId,
        grossWeightHundredths: row.grossWeightHundredths,
      })),
      packagingWeightHundredths: line.weights.packagingWeightHundredths,
    },
  }));
}

function loadHistoricalCommissionPolicy(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  stallId: string,
  versionId: string,
): CommissionPolicy {
  const bandSet = getCommissionBandSetById(database, stallId, versionId);
  if (bandSet === null) {
    throw conflictError("Original commission policy version is missing and cannot be reused.");
  }
  const bands = listCommissionBandsForSet(database, stallId, versionId);
  const domainBands: CommissionBand[] = bands.map((band) => {
    if (band.minPricePerKgMinor === null) {
      throw conflictError("Commission band is missing a minimum price bound.");
    }
    return {
      id: band.id,
      minPricePerKgMinor: band.minPricePerKgMinor,
      maxPricePerKgMinor: band.maxPricePerKgMinor,
      ratePerKgMinor: band.ratePerKgMinor,
    };
  });
  try {
    return validateCommissionPolicy({
      policyId: stallId,
      versionId: bandSet.id,
      rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
      roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
      algorithmVersion: COMMISSION_ALGORITHM_VERSION,
      bands: domainBands,
    });
  } catch (error) {
    mapDomainError(error);
  }
}

function assertActiveRefs(
  tx: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  stallId: string,
  traderId: string,
  lines: readonly SaleDraftLineInput[],
): void {
  const buyer = getBuyerById(tx, stallId, traderId);
  if (buyer === null || !buyer.isActive) {
    throw validationError("Replacement buyer is missing or inactive.", [
      { path: "traderId", code: "INACTIVE_BUYER", message: "Buyer must be active." },
    ]);
  }
  for (const [index, line] of lines.entries()) {
    const farmer = getFarmerById(tx, stallId, line.farmerId);
    if (farmer === null || !farmer.isActive) {
      throw validationError("Replacement farmer is missing or inactive.", [
        {
          path: `lines.${index}.farmerId`,
          code: "INACTIVE_FARMER",
          message: "Farmer must be active.",
        },
      ]);
    }
    const vegetable = getVegetableById(tx, stallId, line.vegetableId);
    if (vegetable === null || !vegetable.isActive) {
      throw validationError("Replacement vegetable is missing or inactive.", [
        {
          path: `lines.${index}.vegetableId`,
          code: "INACTIVE_VEGETABLE",
          message: "Vegetable must be active.",
        },
      ]);
    }
    const packageType = getPackageTypeById(tx, stallId, line.packageTypeId);
    if (packageType === null || !packageType.isActive) {
      throw validationError("Replacement package type is missing or inactive.", [
        {
          path: `lines.${index}.packageTypeId`,
          code: "INACTIVE_PACKAGE_TYPE",
          message: "Package type must be active.",
        },
      ]);
    }
  }
}

function buildReversalEffects(
  tx: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  stallId: string,
  postingId: string,
): Array<{
  partyKind: "farmer" | "trader";
  partyId: string;
  amountMinor: number;
  reversesEntryId: string;
  originalAmountMinor: number;
}> {
  const entries = listLedgerEntriesForPosting(tx, stallId, postingId);
  if (entries.length === 0) {
    throw conflictError("Original sale posting has no ledger entries to reverse.");
  }
  return entries.map((entry) => {
    if (entry.partyKind !== "farmer" && entry.partyKind !== "trader") {
      throw conflictError(`Unsupported ledger party kind: ${entry.partyKind}`);
    }
    return {
      partyKind: entry.partyKind,
      partyId: entry.partyId,
      amountMinor: exactReversalAmount(entry.amountMinor),
      reversesEntryId: entry.id,
      originalAmountMinor: entry.amountMinor,
    };
  });
}

function eligibilityDto(
  eligibility: ReturnType<typeof resolveSaleCorrectionEligibility>,
): SaleCorrectionPreviewResponse["eligibility"] {
  return {
    code: eligibility.code,
    allowed: eligibility.allowed,
    message: eligibility.message,
    saleId: eligibility.sale?.id ?? null,
    sourceRevision: eligibility.sale?.revision ?? null,
    traderBillId: eligibility.traderBillId,
    farmerBillInclusions: eligibility.farmerBillInclusions,
    allocationCount: eligibility.allocations.length,
  };
}

function requireEligibleSale(
  tx: TxHandle,
  stallId: string,
  saleId: string,
  expectedRevision: number,
): {
  sale: SaleRecord;
  traderBillId: string | null;
  eligibility: ReturnType<typeof resolveSaleCorrectionEligibility>;
} {
  const eligibility = resolveSaleCorrectionEligibility(tx, {
    stallId,
    saleId,
    expectedRevision,
  });
  if (!eligibility.allowed || eligibility.sale === null) {
    throw conflictError(eligibility.message);
  }
  return {
    sale: eligibility.sale,
    traderBillId: eligibility.traderBillId,
    eligibility,
  };
}

export function previewSaleCorrection(
  deps: CommandDeps,
  context: ExecutionContext,
  rawInput: SaleCorrectionPreviewRequest,
): SaleCorrectionPreviewResponse {
  const input = saleCorrectionPreviewRequestSchema.parse(rawInput);
  const reason = normalizeSaleCorrectionReason(input.reason);

  if (input.action === "correct" && input.replacement === undefined) {
    throw validationError("Correction preview requires replacement values.", [
      {
        path: "replacement",
        code: "REPLACEMENT_REQUIRED",
        message: "Provide replacement buyer and lines for a correction.",
      },
    ]);
  }
  if (input.action === "reverse" && input.replacement !== undefined) {
    throw validationError("Reversal preview must not include replacement values.", [
      {
        path: "replacement",
        code: "REPLACEMENT_FORBIDDEN",
        message: "Omit replacement when reversing without replacement.",
      },
    ]);
  }

  const db = deps.database;
  const eligibility = resolveSaleCorrectionEligibility(db, {
    stallId: context.stallId,
    saleId: input.saleId,
    expectedRevision: input.expectedRevision,
  });
  const eligibilityPayload = eligibilityDto(eligibility);
  if (!eligibility.allowed || eligibility.sale === null || eligibility.sale.postingId === null) {
    return saleCorrectionPreviewResponseSchema.parse({
      action: input.action,
      saleId: input.saleId,
      sourceRevision: input.expectedRevision,
      reason,
      eligibility: eligibilityPayload,
      previewFingerprint: hashFingerprint(
        buildSaleCorrectionPreviewFingerprintMaterial({
          action: input.action,
          sourceSaleId: input.saleId,
          sourceRevision: input.expectedRevision,
          reason,
          replacementPayload: input.replacement ?? null,
          reversalEffects: [],
          replacementEffects: [],
        }),
      ),
      commissionPolicy: null,
      originalTotals: null,
      proposedTotals: null,
      reversalEffects: [],
      replacementEffects: [],
      affectedDocuments: {
        originalTraderBillId: eligibility.traderBillId,
        farmerBillBlocked: eligibility.code === "blocked_farmer_bill_inclusion",
      },
    });
  }

  const sale = eligibility.sale;
  const originalPostingId = sale.postingId;
  if (originalPostingId === null) {
    throw conflictError("Sale has no ledger posting to reverse.");
  }
  const reversalEffects = buildReversalEffects(db, context.stallId, originalPostingId).map(
    (effect) => ({
      partyKind: effect.partyKind,
      partyId: effect.partyId,
      amountMinor: effect.amountMinor,
      reversesEntryId: effect.reversesEntryId,
    }),
  );
  assertExactReversalNet(
    reversalEffects.map((effect) => ({
      partyKind: effect.partyKind,
      partyId: effect.partyId,
      amountMinor: -effect.amountMinor,
    })),
    reversalEffects,
  );

  let replacementEffects: SaleCorrectionPreviewResponse["replacementEffects"] = [];
  let proposedTotals: SaleCorrectionPreviewResponse["proposedTotals"] = null;
  let commissionPolicy: SaleCorrectionPreviewResponse["commissionPolicy"] = null;

  if (input.action === "correct" && input.replacement !== undefined) {
    if (sale.commissionVersionId === null) {
      throw conflictError("Original sale is missing commission version identity.");
    }
    assertActiveRefs(db, context.stallId, input.replacement.traderId, input.replacement.lines);
    const policy = loadHistoricalCommissionPolicy(db, context.stallId, sale.commissionVersionId);
    commissionPolicy = {
      policyId: policy.policyId,
      versionId: policy.versionId,
      selection: "original_snapshot",
    };
    let bill;
    try {
      bill = calculateSaleBillWithPolicy(policy, toPolicyInputs(input.replacement.lines));
      const readiness = validateSaleBillForFinalization(
        policy,
        toPolicyInputs(input.replacement.lines),
      );
      if (!readiness.ready) {
        throw validationError(readiness.issues[0]?.message ?? "Replacement sale is not valid.", [
          {
            path: "replacement.lines",
            code: readiness.issues[0]?.code ?? "INVALID_REPLACEMENT",
            message: readiness.issues[0]?.message ?? "Replacement sale is not valid.",
          },
        ]);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      mapDomainError(error);
    }
    proposedTotals = {
      totalSaleAmountMinor: bill.totalSaleAmountMinor,
      totalCommissionMinor: bill.totalCommissionMinor,
      totalTraderPaysMinor: bill.totalTraderPaysMinor,
      totalFarmerReceivesMinor: bill.totalFarmerReceivesBeforeDeductionsMinor,
    };
    replacementEffects = [
      {
        partyKind: "trader" as const,
        partyId: input.replacement.traderId,
        amountMinor: bill.totalTraderPaysMinor,
      },
      ...[...bill.farmerEntitlements.entries()].map(([farmerId, amountMinor]) => ({
        partyKind: "farmer" as const,
        partyId: farmerId,
        amountMinor,
      })),
    ];
  }

  const fingerprint = hashFingerprint(
    buildSaleCorrectionPreviewFingerprintMaterial({
      action: input.action,
      sourceSaleId: sale.id,
      sourceRevision: sale.revision,
      reason,
      replacementPayload: input.replacement ?? null,
      reversalEffects,
      replacementEffects,
    }),
  );

  return saleCorrectionPreviewResponseSchema.parse({
    action: input.action,
    saleId: sale.id,
    sourceRevision: sale.revision,
    reason,
    eligibility: eligibilityPayload,
    previewFingerprint: fingerprint,
    commissionPolicy,
    originalTotals: {
      totalSaleAmountMinor: sale.totalSaleAmountMinor ?? 0,
      totalCommissionMinor: sale.totalCommissionMinor ?? 0,
      totalTraderPaysMinor: sale.totalTraderPaysMinor ?? 0,
      totalFarmerReceivesMinor: sale.totalFarmerReceivesMinor ?? 0,
    },
    proposedTotals,
    reversalEffects,
    replacementEffects,
    affectedDocuments: {
      originalTraderBillId: eligibility.traderBillId,
      farmerBillBlocked: false,
    },
  });
}

function commitDefinition(
  deps: CommandDeps,
  requiredCapability: string,
): CommandDefinition<SaleCorrectionCommitRequest, SaleCorrectionCommitResponse> {
  return {
    type: "sale.correct_or_reverse",
    version: "1",
    requiredCapability,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      try {
        return executeSaleCorrectionCommit(deps, tx, context, input);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        if (error instanceof RevisionConflictError) {
          throw conflictError(error.message);
        }
        if (error instanceof Error) {
          throw conflictError(`Sale correction failed: ${error.message}`);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      saleCorrectionCommitResponseSchema.parse(JSON.parse(resultRef)),
  };
}

function executeSaleCorrectionCommit(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: SaleCorrectionCommitRequest,
): SaleCorrectionCommitResponse {
  const reason = normalizeSaleCorrectionReason(input.reason);
  if (input.action === "correct" && input.replacement === undefined) {
    throw validationError("Correction commit requires replacement values.", [
      {
        path: "replacement",
        code: "REPLACEMENT_REQUIRED",
        message: "Provide replacement buyer and lines for a correction.",
      },
    ]);
  }
  if (input.action === "reverse" && input.replacement !== undefined) {
    throw validationError("Reversal commit must not include replacement values.", [
      {
        path: "replacement",
        code: "REPLACEMENT_FORBIDDEN",
        message: "Omit replacement when reversing without replacement.",
      },
    ]);
  }

  const { sale, traderBillId, eligibility } = requireEligibleSale(
    tx,
    context.stallId,
    input.saleId,
    input.expectedRevision,
  );
  if (sale.postingId === null) {
    throw conflictError("Sale has no ledger posting to reverse.");
  }

  const now = deps.now();
  const businessDate = todayUtcCalendarDate(now);
  const reversalEffects = buildReversalEffects(tx, context.stallId, sale.postingId);
  assertExactReversalNet(
    reversalEffects.map((effect) => ({
      partyKind: effect.partyKind,
      partyId: effect.partyId,
      amountMinor: effect.originalAmountMinor,
    })),
    reversalEffects,
  );

  let replacementEffects: Array<{
    partyKind: "farmer" | "trader";
    partyId: string;
    amountMinor: number;
  }> = [];
  let calculatedBill: ReturnType<typeof calculateSaleBillWithPolicy> | null = null;
  let policy: CommissionPolicy | null = null;

  if (input.action === "correct" && input.replacement !== undefined) {
    if (sale.commissionVersionId === null) {
      throw conflictError("Original sale is missing commission version identity.");
    }
    assertActiveRefs(tx, context.stallId, input.replacement.traderId, input.replacement.lines);
    policy = loadHistoricalCommissionPolicy(tx, context.stallId, sale.commissionVersionId);
    try {
      calculatedBill = calculateSaleBillWithPolicy(policy, toPolicyInputs(input.replacement.lines));
      const readiness = validateSaleBillForFinalization(
        policy,
        toPolicyInputs(input.replacement.lines),
      );
      if (!readiness.ready) {
        throw validationError(readiness.issues[0]?.message ?? "Replacement sale is not valid.", [
          {
            path: "replacement.lines",
            code: readiness.issues[0]?.code ?? "INVALID_REPLACEMENT",
            message: readiness.issues[0]?.message ?? "Replacement sale is not valid.",
          },
        ]);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      mapDomainError(error);
    }
    replacementEffects = [
      {
        partyKind: "trader",
        partyId: input.replacement.traderId,
        amountMinor: calculatedBill.totalTraderPaysMinor,
      },
      ...[...calculatedBill.farmerEntitlements.entries()].map(([farmerId, amountMinor]) => ({
        partyKind: "farmer" as const,
        partyId: farmerId,
        amountMinor,
      })),
    ];
  }

  const expectedFingerprint = hashFingerprint(
    buildSaleCorrectionPreviewFingerprintMaterial({
      action: input.action,
      sourceSaleId: sale.id,
      sourceRevision: sale.revision,
      reason,
      replacementPayload: input.replacement ?? null,
      reversalEffects: reversalEffects.map((effect) => ({
        partyKind: effect.partyKind,
        partyId: effect.partyId,
        amountMinor: effect.amountMinor,
        reversesEntryId: effect.reversesEntryId,
      })),
      replacementEffects,
    }),
  );
  if (expectedFingerprint !== input.previewFingerprint) {
    throw conflictError("Correction preview is stale. Review the impact and preview again.");
  }

  const operationId = deps.createId();
  const reversalPostingId = deps.createId();

  try {
    postLedgerEntries(tx, {
      postingId: reversalPostingId,
      stallId: context.stallId,
      sourceType: SALE_SOURCE_TYPE,
      sourceId: sale.id,
      financialEventType: SALE_EVENT_REVERSED,
      eventSequence: 1,
      businessDate,
      recordedAt: now,
      actorStaffId: context.actorRef,
      description: `Sale ${input.action} reverse ${sale.id}`,
      currency: "LKR",
      entries: reversalEffects.map((effect) => ({
        entryId: deps.createId(),
        partyKind: effect.partyKind,
        partyId: effect.partyId,
        amountMinor: effect.amountMinor,
        reversesEntryId: effect.reversesEntryId,
      })),
    });
  } catch (error) {
    if (error instanceof DuplicateFinancialEventError) {
      throw conflictError(error.message);
    }
    throw error;
  }

  let replacementSaleId: string | null = null;
  let replacementPostingId: string | null = null;
  let replacementTraderBillId: string | null = null;
  let replacementTraderBillNumber: string | null = null;

  if (
    input.action === "correct" &&
    input.replacement !== undefined &&
    calculatedBill !== null &&
    policy !== null
  ) {
    const buyer = getBuyerById(tx, context.stallId, input.replacement.traderId);
    if (buyer === null) {
      throw notFoundError("Replacement buyer was not found.");
    }

    replacementSaleId = deps.createId();
    // Replacement lines always get new identities; never reuse original sale_line ids.
    const draftLines = input.replacement.lines.map((line) => ({
      id: deps.createId(),
      farmerId: line.farmerId,
      vegetableId: line.vegetableId,
      packageTypeId: line.packageTypeId,
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      packagingWeightHundredths: line.weights.packagingWeightHundredths ?? 0,
      notes: line.notes ?? null,
      weights: line.weights.rows.map((row, index) => ({
        id: deps.createId(),
        rowKey: row.rowKey,
        packageIndex: index + 1,
        packageTypeId: row.packageTypeId ?? null,
        grossWeightHundredths: row.grossWeightHundredths,
      })),
    }));

    const lineInputs = toPolicyInputs(
      input.replacement.lines.map((line, index) => ({
        ...line,
        lineId: draftLines[index]!.id,
      })),
    );
    calculatedBill = calculateSaleBillWithPolicy(policy, lineInputs);

    insertSaleDraft(tx, {
      id: replacementSaleId,
      stallId: context.stallId,
      traderId: input.replacement.traderId,
      businessDate,
      correctsSaleId: sale.id,
      lines: draftLines,
      createdAt: now,
      updatedAt: now,
    });

    const draft = getSaleById(tx, context.stallId, replacementSaleId);
    if (draft === null) {
      throw conflictError("Failed to create replacement sale draft.");
    }

    const calcFingerprint = hashFingerprint(
      buildSaleCalculationFingerprintMaterial({
        draftRevision: draft.revision,
        policyId: policy.policyId,
        versionId: policy.versionId,
        traderId: input.replacement.traderId,
        businessDate,
        lines: calculatedBill.lines,
      }),
    );

    replacementPostingId = deps.createId();
    ensurePartyAccount(tx, {
      id: deps.createId(),
      stallId: context.stallId,
      partyKind: "trader",
      partyId: buyer.id,
      createdAt: now,
      updatedAt: now,
    });
    for (const farmerId of calculatedBill.farmerEntitlements.keys()) {
      ensurePartyAccount(tx, {
        id: deps.createId(),
        stallId: context.stallId,
        partyKind: "farmer",
        partyId: farmerId,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      postLedgerEntries(tx, {
        postingId: replacementPostingId,
        stallId: context.stallId,
        sourceType: SALE_SOURCE_TYPE,
        sourceId: replacementSaleId,
        financialEventType: SALE_EVENT_REPLACED,
        eventSequence: 1,
        businessDate,
        recordedAt: now,
        actorStaffId: context.actorRef,
        description: `Sale correction replacement ${replacementSaleId}`,
        currency: "LKR",
        entries: [
          {
            entryId: deps.createId(),
            partyKind: "trader",
            partyId: buyer.id,
            amountMinor: calculatedBill.totalTraderPaysMinor,
          },
          ...[...calculatedBill.farmerEntitlements.entries()].map(([farmerId, amountMinor]) => ({
            entryId: deps.createId(),
            partyKind: "farmer" as const,
            partyId: farmerId,
            amountMinor,
          })),
        ],
      });
    } catch (error) {
      if (error instanceof DuplicateFinancialEventError) {
        throw conflictError(error.message);
      }
      throw error;
    }

    const lineSnapshots = calculatedBill.lines.map((line) => {
      const farmer = getFarmerById(tx, context.stallId, line.farmerId)!;
      const vegetable = getVegetableById(tx, context.stallId, line.vegetableId)!;
      const packageType = getPackageTypeById(tx, context.stallId, line.packageTypeId)!;
      return {
        lineId: line.lineId!,
        farmerId: farmer.id,
        farmerShortCode: farmer.shortCode,
        farmerDisplayName: farmer.displayName,
        vegetableShortCode: vegetable.shortCode,
        vegetableDisplayName: vegetable.displayName,
        packageTypeId: packageType.id,
        packageTypeShortCode: packageType.shortCode,
        packageTypeDisplayName: packageType.displayName,
        grossWeightHundredths: line.grossWeightHundredths,
        netWeightHundredths: line.netWeightHundredths,
        lineSaleAmountMinor: line.saleAmountMinor,
        appliedCommissionRatePerKgMinor: line.commission.appliedRatePerKgMinor,
        appliedCommissionAmountMinor: line.commission.commissionMinor,
        commissionPolicyId: line.commission.policyId,
        commissionVersionId: line.commission.versionId,
        commissionBandId: line.commission.bandId,
        traderPaysMinor: line.traderPaysMinor,
        farmerReceivesMinor: line.farmerReceivesBeforeDeductionsMinor,
      };
    });

    try {
      finalizeSaleWithExpectedRevision(tx, {
        stallId: context.stallId,
        saleId: replacementSaleId,
        expectedRevision: draft.revision,
        traderShortCode: buyer.shortCode,
        traderDisplayName: buyer.displayName,
        commissionPolicyId: policy.policyId,
        commissionVersionId: policy.versionId,
        calculationFingerprint: calcFingerprint,
        postingId: replacementPostingId,
        totalSaleAmountMinor: calculatedBill.totalSaleAmountMinor,
        totalCommissionMinor: calculatedBill.totalCommissionMinor,
        totalTraderPaysMinor: calculatedBill.totalTraderPaysMinor,
        totalFarmerReceivesMinor: calculatedBill.totalFarmerReceivesBeforeDeductionsMinor,
        lineSnapshots,
        finalizedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        throw conflictError(error.message);
      }
      if (error instanceof Error) {
        throw conflictError(`Replacement finalize failed: ${error.message}`);
      }
      throw error;
    }

    ensureBillSequencesForStall(tx, context.stallId);
    const sequence = allocateNextBillSequence(tx, context.stallId, "trader");
    replacementTraderBillNumber = formatBillNumber("trader", sequence);
    replacementTraderBillId = deps.createId();
    const stallPrintIdentity = getStallPrintIdentity(tx);
    insertFinalizedTraderBill(tx, {
      id: replacementTraderBillId,
      stallId: context.stallId,
      saleId: replacementSaleId,
      traderId: buyer.id,
      traderShortCode: buyer.shortCode,
      traderDisplayName: buyer.displayName,
      stallDisplayName: stallPrintIdentity?.displayName ?? null,
      stallAddress: stallPrintIdentity?.address ?? null,
      billNumber: replacementTraderBillNumber,
      businessDate,
      totalAmountMinor: calculatedBill.totalTraderPaysMinor,
      totalCommissionMinor: calculatedBill.totalCommissionMinor,
      totalFarmerReceivesMinor: calculatedBill.totalFarmerReceivesBeforeDeductionsMinor,
      commissionPolicyId: policy.policyId,
      commissionVersionId: policy.versionId,
      calculationFingerprint: calcFingerprint,
      postingId: replacementPostingId,
      finalizedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  insertSaleCorrectionOperation(tx, {
    id: operationId,
    stallId: context.stallId,
    action: input.action,
    sourceSaleId: sale.id,
    replacementSaleId,
    reason,
    actorStaffId: context.actorRef,
    recordedAt: now,
    businessDate,
    previewFingerprint: input.previewFingerprint,
    sourceRevisionExpected: input.expectedRevision,
    reversalPostingId,
    replacementPostingId,
    originalTraderBillId: traderBillId,
    replacementTraderBillId,
    createdAt: now,
  });

  try {
    markSaleCorrectedWithExpectedRevision(tx, {
      stallId: context.stallId,
      saleId: sale.id,
      expectedRevision: sale.revision,
      correctionStatus: input.action === "correct" ? "superseded" : "reversed",
      correctionOperationId: operationId,
      replacementSaleId,
      reversalPostingId,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      throw conflictError(error.message);
    }
    throw error;
  }

  if (traderBillId !== null) {
    markTraderBillCorrected(tx, {
      stallId: context.stallId,
      traderBillId,
      correctionStatus: input.action === "correct" ? "superseded" : "reversed",
      correctionOperationId: operationId,
      replacementTraderBillId,
      updatedAt: now,
    });
  }

  const response = saleCorrectionCommitResponseSchema.parse({
    operationId,
    action: input.action,
    sourceSaleId: sale.id,
    replacementSaleId,
    originalTraderBillId: traderBillId,
    replacementTraderBillId,
    replacementTraderBillNumber,
    reversalPostingId,
    replacementPostingId,
    businessDate,
    recordedAt: now,
    reason,
  });

  if (input.action === "reverse") {
    writeAuditAndOutbox({
      tx,
      context,
      action: "sale.reversed",
      targetType: "sale",
      targetId: sale.id,
      eventType: SALE_REVERSED_EVENT_TYPE,
      eventSchemaVersion: SALE_REVERSED_EVENT_SCHEMA_VERSION,
      payload: saleReversedEventPayloadSchema.parse({
        operationId,
        sourceSaleId: sale.id,
        reversalPostingId,
        originalTraderBillId: traderBillId,
        reason,
        businessDate,
        recordedAt: now,
      }),
      eventId: deps.createId(),
      auditId: deps.createId(),
      now,
    });
  } else {
    writeAuditAndOutbox({
      tx,
      context,
      action: "sale.corrected",
      targetType: "sale",
      targetId: sale.id,
      eventType: SALE_CORRECTED_EVENT_TYPE,
      eventSchemaVersion: SALE_CORRECTED_EVENT_SCHEMA_VERSION,
      payload: saleCorrectedEventPayloadSchema.parse({
        operationId,
        sourceSaleId: sale.id,
        replacementSaleId: replacementSaleId!,
        reversalPostingId,
        replacementPostingId: replacementPostingId!,
        originalTraderBillId: traderBillId,
        replacementTraderBillId: replacementTraderBillId!,
        reason,
        businessDate,
        recordedAt: now,
      }),
      eventId: deps.createId(),
      auditId: deps.createId(),
      now,
    });
  }

  void eligibility;
  return response;
}

export function runCommitSaleCorrectionCommand(
  deps: CommandDeps,
  input: SaleCorrectionCommitRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof: import("../auth/device-proof.js").DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
  },
): SaleCorrectionCommitResponse {
  const parsed = saleCorrectionCommitRequestSchema.parse(input);
  const requiredCapability =
    parsed.action === "reverse"
      ? BILLS_CANCEL_FINALIZED_CAPABILITY
      : BILLS_CORRECT_FINALIZED_CAPABILITY;
  return runIdempotentCommand(deps, commitDefinition(deps, requiredCapability), {
    input: parsed,
    ...meta,
  });
}
