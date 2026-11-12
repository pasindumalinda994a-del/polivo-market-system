import { createHash } from "node:crypto";

import {
  SALE_FINALIZED_EVENT_SCHEMA_VERSION,
  SALE_FINALIZED_EVENT_TYPE,
  TRADER_BILL_ISSUED_EVENT_SCHEMA_VERSION,
  TRADER_BILL_ISSUED_EVENT_TYPE,
  abandonSaleDraftRequestSchema,
  createSaleDraftRequestSchema,
  finalizeSaleRequestSchema,
  finalizeSaleResponseSchema,
  saleDraftRecordSchema,
  saleFinalizedEventPayloadSchema,
  salePreviewResponseSchema,
  traderBillRecordSchema,
  updateSaleDraftRequestSchema,
  type AbandonSaleDraftRequest,
  type CreateSaleDraftRequest,
  type FinalizeSaleRequest,
  type FinalizeSaleResponse,
  type SaleDraftLineInput,
  type SaleDraftRecordDto,
  type SalePreviewResponse,
  type TraderBillRecordDto,
  type UpdateSaleDraftRequest,
} from "@polivo/contracts";
import {
  DuplicateFinancialEventError,
  RevisionConflictError,
  allocateNextBillSequence,
  ensureBillSequencesForStall,
  ensurePartyAccount,
  abandonSaleDraftWithExpectedRevision,
  finalizeSaleWithExpectedRevision,
  getBuyerById,
  getCommissionBandSetById,
  getCommissionPolicyState,
  getFarmerById,
  getPackageTypeById,
  getPartyAccount,
  getSaleById,
  getTraderBillById,
  getTraderBillBySaleId,
  getVegetableById,
  getStallPrintIdentity,
  insertFinalizedTraderBill,
  insertSaleDraft,
  listCommissionBandsForSet,
  postLedgerEntries,
  replaceSaleDraftWithExpectedRevision,
  type InsertSaleDraftLineInput,
  type SaleLineRecord,
  type SaleRecord,
  type TxHandle,
} from "@polivo/db-local";
import {
  COMMISSION_ALGORITHM_VERSION,
  COMMISSION_RATE_BASIS_PER_KG_MINOR,
  COMMISSION_ROUNDING_RULE_ID,
  DomainError,
  SALE_EVENT_FINALIZED,
  SALE_SOURCE_TYPE,
  buildSaleCalculationFingerprintMaterial,
  calculateSaleBillWithPolicy,
  formatBillNumber,
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

export const BILLS_CREATE_CAPABILITY = "bills.create";
export const BILLS_EDIT_DRAFT_CAPABILITY = "bills.edit_draft";
export const BILLS_FINALIZE_CAPABILITY = "bills.finalize";

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw validationError(error.message, [
      { path: error.code, code: error.code, message: error.message },
    ]);
  }
  throw error;
}

export function loadActiveDomainCommissionPolicy(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  stallId: string,
): CommissionPolicy | null {
  const state = getCommissionPolicyState(database, stallId);
  if (state === null || state.activeBandSetId === null) {
    return null;
  }
  const bandSet = getCommissionBandSetById(database, stallId, state.activeBandSetId);
  if (bandSet === null) {
    throw conflictError("Active commission policy points to a missing version.");
  }
  const bands = listCommissionBandsForSet(database, stallId, state.activeBandSetId);
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

function toDraftLineInputs(lines: readonly SaleDraftLineInput[]): PolicySaleLineInput[] {
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

function saleLinesToPolicyInputs(lines: readonly SaleLineRecord[]): PolicySaleLineInput[] {
  return lines.map((line) => {
    if (line.farmerId === null || line.packageTypeId === null) {
      throw validationError("Draft line is missing farmer or package type.", [
        {
          path: "lines",
          code: "INCOMPLETE_DRAFT",
          message: "Each line requires farmer and package type references.",
        },
      ]);
    }
    return {
      lineId: line.id,
      farmerId: line.farmerId,
      vegetableId: line.vegetableId,
      packageTypeId: line.packageTypeId,
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      notes: line.notes,
      weights: {
        rows: line.weights.map((row) => ({
          rowKey: row.rowKey,
          packageTypeId: row.packageTypeId ?? undefined,
          grossWeightHundredths: row.grossWeightHundredths,
        })),
        packagingWeightHundredths: line.packagingWeightHundredths,
      },
    };
  });
}

function fingerprintFor(
  draftRevision: number,
  traderId: string,
  businessDate: string,
  policy: CommissionPolicy,
  bill: ReturnType<typeof calculateSaleBillWithPolicy>,
): string {
  const material = buildSaleCalculationFingerprintMaterial({
    draftRevision,
    policyId: policy.policyId,
    versionId: policy.versionId,
    traderId,
    businessDate,
    lines: bill.lines,
  });
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function todayUtcCalendarDate(nowIso: string): string {
  return nowIso.slice(0, 10);
}

function toDraftDto(sale: SaleRecord): SaleDraftRecordDto {
  if (sale.status !== "draft") {
    throw conflictError("Sale is not an editable draft.");
  }
  return saleDraftRecordSchema.parse({
    id: sale.id,
    stallId: sale.stallId,
    traderId: sale.traderId,
    businessDate: sale.businessDate,
    status: "draft",
    revision: sale.revision,
    lines: sale.lines.map((line) => ({
      lineId: line.id,
      lineOrder: line.lineOrder,
      farmerId: line.farmerId ?? "",
      vegetableId: line.vegetableId,
      packageTypeId: line.packageTypeId ?? "",
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      packagingWeightHundredths: line.packagingWeightHundredths,
      weights: line.weights.map((weight) => ({
        rowKey: weight.rowKey,
        packageTypeId: weight.packageTypeId ?? undefined,
        grossWeightHundredths: weight.grossWeightHundredths,
      })),
      notes: line.notes,
    })),
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  });
}

function assertActiveBuyer(tx: TxHandle, stallId: string, traderId: string) {
  const buyer = getBuyerById(tx, stallId, traderId);
  if (buyer === null) {
    throw notFoundError("Buyer not found for this stall.");
  }
  if (!buyer.isActive) {
    throw conflictError("Buyer is inactive and cannot be used on a sale.");
  }
  return buyer;
}

function assertActiveFarmer(tx: TxHandle, stallId: string, farmerId: string) {
  const farmer = getFarmerById(tx, stallId, farmerId);
  if (farmer === null) {
    throw notFoundError("Farmer not found for this stall.");
  }
  if (!farmer.isActive) {
    throw conflictError("Farmer is inactive and cannot be used on a sale.");
  }
  return farmer;
}

function assertActiveVegetable(tx: TxHandle, stallId: string, vegetableId: string) {
  const vegetable = getVegetableById(tx, stallId, vegetableId);
  if (vegetable === null) {
    throw notFoundError("Vegetable not found for this stall.");
  }
  if (!vegetable.isActive) {
    throw conflictError("Vegetable is inactive and cannot be used on a sale.");
  }
  return vegetable;
}

function assertActivePackageType(tx: TxHandle, stallId: string, packageTypeId: string) {
  const packageType = getPackageTypeById(tx, stallId, packageTypeId);
  if (packageType === null) {
    throw notFoundError("Package type not found for this stall.");
  }
  if (!packageType.isActive) {
    throw conflictError("Package type is inactive and cannot be used on a sale.");
  }
  return packageType;
}

function assertAccountOpened(
  tx: TxHandle,
  stallId: string,
  partyKind: "farmer" | "trader",
  partyId: string,
  label: string,
): void {
  const account = getPartyAccount(tx, stallId, partyKind, partyId);
  if (account === null || account.openingStatus === "not_opened") {
    throw conflictError(`${label} account is not ready for operational posting.`);
  }
}

function mapDraftLinesForInsert(
  deps: CommandDeps,
  lines: readonly SaleDraftLineInput[],
): InsertSaleDraftLineInput[] {
  return lines.map((line) => {
    const lineId = line.lineId ?? deps.createId();
    return {
      id: lineId,
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
    };
  });
}

function validateDraftReferences(
  tx: TxHandle,
  stallId: string,
  traderId: string,
  lines: readonly SaleDraftLineInput[],
): void {
  assertActiveBuyer(tx, stallId, traderId);
  for (const line of lines) {
    assertActiveFarmer(tx, stallId, line.farmerId);
    assertActiveVegetable(tx, stallId, line.vegetableId);
    assertActivePackageType(tx, stallId, line.packageTypeId);
  }
}

export function buildSalePreview(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  sale: SaleRecord,
): SalePreviewResponse {
  if (sale.status !== "draft") {
    throw conflictError("Only draft sales can be previewed.");
  }

  const policy = loadActiveDomainCommissionPolicy(database, sale.stallId);
  const lineInputs =
    sale.lines.length === 0
      ? []
      : sale.lines.every((line) => line.farmerId !== null && line.packageTypeId !== null)
        ? saleLinesToPolicyInputs(sale.lines)
        : [];

  const readiness = validateSaleBillForFinalization(policy, lineInputs);
  if (policy === null || !readiness.ready) {
    return salePreviewResponseSchema.parse({
      saleId: sale.id,
      draftRevision: sale.revision,
      traderId: sale.traderId,
      businessDate: sale.businessDate,
      commissionPolicyId: policy?.policyId ?? null,
      commissionVersionId: policy?.versionId ?? null,
      calculationFingerprint: null,
      readyToFinalize: false,
      issues: readiness.issues,
      lines: [],
      totalSaleAmountMinor: null,
      totalCommissionMinor: null,
      totalTraderPaysMinor: null,
      totalFarmerReceivesBeforeDeductionsMinor: null,
    });
  }

  const bill = calculateSaleBillWithPolicy(policy, lineInputs);
  const calculationFingerprint = fingerprintFor(
    sale.revision,
    sale.traderId,
    sale.businessDate,
    policy,
    bill,
  );

  return salePreviewResponseSchema.parse({
    saleId: sale.id,
    draftRevision: sale.revision,
    traderId: sale.traderId,
    businessDate: sale.businessDate,
    commissionPolicyId: policy.policyId,
    commissionVersionId: policy.versionId,
    calculationFingerprint,
    readyToFinalize: true,
    issues: [],
    lines: bill.lines.map((line) => ({
      lineId: line.lineId ?? "",
      farmerId: line.farmerId,
      vegetableId: line.vegetableId,
      packageTypeId: line.packageTypeId,
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      grossWeightHundredths: line.grossWeightHundredths,
      packagingWeightHundredths: line.packagingWeightHundredths,
      netWeightHundredths: line.netWeightHundredths,
      saleAmountMinor: line.saleAmountMinor,
      commissionPolicyId: line.commission.policyId,
      commissionVersionId: line.commission.versionId,
      commissionBandId: line.commission.bandId,
      appliedCommissionRatePerKgMinor: line.commission.appliedRatePerKgMinor,
      commissionAmountMinor: line.commission.commissionMinor,
      traderPaysMinor: line.traderPaysMinor,
      farmerReceivesBeforeDeductionsMinor: line.farmerReceivesBeforeDeductionsMinor,
    })),
    totalSaleAmountMinor: bill.totalSaleAmountMinor,
    totalCommissionMinor: bill.totalCommissionMinor,
    totalTraderPaysMinor: bill.totalTraderPaysMinor,
    totalFarmerReceivesBeforeDeductionsMinor: bill.totalFarmerReceivesBeforeDeductionsMinor,
  });
}

function toTraderBillDto(args: {
  bill: ReturnType<typeof insertFinalizedTraderBill>;
  sale: SaleRecord;
}): TraderBillRecordDto {
  return traderBillRecordSchema.parse({
    id: args.bill.id,
    stallId: args.bill.stallId,
    saleId: args.bill.saleId,
    traderId: args.bill.traderId,
    traderShortCode: args.bill.traderShortCode,
    traderDisplayName: args.bill.traderDisplayName,
    billType: "trader",
    billNumber: args.bill.billNumber,
    businessDate: args.bill.businessDate,
    status: "finalized",
    totalAmountMinor: args.bill.totalAmountMinor,
    paymentStatus: args.bill.paymentStatus,
    commissionPolicyId: args.bill.commissionPolicyId,
    commissionVersionId: args.bill.commissionVersionId,
    calculationFingerprint: args.bill.calculationFingerprint,
    lines: args.sale.lines.map((line) => ({
      lineId: line.id,
      lineOrder: line.lineOrder,
      farmerId: line.farmerId!,
      farmerShortCode: line.farmerShortCode!,
      farmerDisplayName: line.farmerDisplayName!,
      vegetableId: line.vegetableId,
      vegetableCode: line.vegetableShortCode!,
      vegetableDisplayName: line.vegetableDisplayName!,
      packageTypeId: line.packageTypeId!,
      packageTypeCode: line.packageTypeShortCode!,
      packageTypeDisplayName: line.packageTypeDisplayName!,
      unitPricePerKgMinor: line.unitPricePerKgMinor,
      packagingWeightHundredths: line.packagingWeightHundredths,
      weights: line.weights.map((weight) => ({
        rowKey: weight.rowKey,
        packageTypeId: weight.packageTypeId ?? undefined,
        grossWeightHundredths: weight.grossWeightHundredths,
      })),
      grossWeightHundredths: line.grossWeightHundredths!,
      netWeightHundredths: line.netWeightHundredths!,
      saleAmountMinor: line.lineSaleAmountMinor!,
      commissionPolicyId: line.commissionPolicyId!,
      commissionVersionId: line.commissionVersionId!,
      commissionBandId: line.commissionBandId!,
      appliedCommissionRatePerKgMinor: line.appliedCommissionRatePerKgMinor!,
      commissionAmountMinor: line.appliedCommissionAmountMinor!,
      traderPaysMinor: line.traderPaysMinor!,
      farmerReceivesBeforeDeductionsMinor: line.farmerReceivesMinor!,
      notes: line.notes,
    })),
    totalCommissionMinor: args.bill.totalCommissionMinor,
    totalFarmerReceivesBeforeDeductionsMinor: args.bill.totalFarmerReceivesMinor,
    postingId: args.bill.postingId,
    finalizedAt: args.bill.finalizedAt,
    createdAt: args.bill.createdAt,
    updatedAt: args.bill.updatedAt,
  });
}

function createDraftDefinition(
  deps: CommandDeps,
): CommandDefinition<CreateSaleDraftRequest, SaleDraftRecordDto> {
  return {
    type: "sale.draft.create",
    version: "1",
    requiredCapability: BILLS_CREATE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      validateDraftReferences(tx, context.stallId, input.traderId, input.lines);
      ensureBillSequencesForStall(tx, context.stallId);
      const now = deps.now();
      const created = insertSaleDraft(tx, {
        id: deps.createId(),
        stallId: context.stallId,
        traderId: input.traderId,
        businessDate: input.businessDate ?? todayUtcCalendarDate(now),
        lines: mapDraftLinesForInsert(deps, input.lines),
        createdAt: now,
        updatedAt: now,
      });
      return toDraftDto(created);
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => saleDraftRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type UpdateSaleDraftCommandInput = UpdateSaleDraftRequest & { saleId: string };

function updateDraftDefinition(
  deps: CommandDeps,
): CommandDefinition<UpdateSaleDraftCommandInput, SaleDraftRecordDto> {
  return {
    type: "sale.draft.update",
    version: "1",
    requiredCapability: BILLS_EDIT_DRAFT_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const existing = getSaleById(tx, context.stallId, input.saleId);
      if (existing === null) {
        throw notFoundError("Sale draft not found for this stall.");
      }
      if (existing.status !== "draft") {
        throw conflictError("Only draft sales can be updated.");
      }
      validateDraftReferences(tx, context.stallId, input.traderId, input.lines);
      try {
        const updated = replaceSaleDraftWithExpectedRevision(tx, {
          stallId: context.stallId,
          saleId: input.saleId,
          expectedRevision: input.expectedRevision,
          traderId: input.traderId,
          businessDate: input.businessDate,
          lines: mapDraftLinesForInsert(deps, input.lines),
          updatedAt: deps.now(),
        });
        return toDraftDto(updated);
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          throw conflictError(error.message);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => saleDraftRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type AbandonSaleDraftCommandInput = AbandonSaleDraftRequest & { saleId: string };

function abandonDraftDefinition(
  deps: CommandDeps,
): CommandDefinition<AbandonSaleDraftCommandInput, SaleDraftRecordDto> {
  return {
    type: "sale.draft.abandon",
    version: "1",
    requiredCapability: BILLS_EDIT_DRAFT_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => {
      const existing = getSaleById(tx, context.stallId, input.saleId);
      if (existing === null) {
        throw notFoundError("Sale draft not found for this stall.");
      }
      if (existing.status !== "draft") {
        throw conflictError("Only draft sales can be abandoned.");
      }
      try {
        const abandoned = abandonSaleDraftWithExpectedRevision(
          tx,
          context.stallId,
          input.saleId,
          input.expectedRevision,
          deps.now(),
        );
        // Abandoned drafts are cancelled; return last draft-shaped snapshot before cancel status.
        return saleDraftRecordSchema.parse({
          ...toDraftDto({
            ...existing,
            revision: abandoned.revision,
            updatedAt: abandoned.updatedAt,
          }),
          // status remains draft in DTO contract for abandon response of prior content;
          // callers should treat abandon as success when command completes.
        });
      } catch (error) {
        if (error instanceof RevisionConflictError) {
          throw conflictError(error.message);
        }
        throw error;
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => saleDraftRecordSchema.parse(JSON.parse(resultRef)),
  };
}

export type FinalizeSaleCommandInput = FinalizeSaleRequest & { saleId: string };

function finalizeDefinition(
  deps: CommandDeps,
): CommandDefinition<FinalizeSaleCommandInput, FinalizeSaleResponse> {
  return {
    type: "sale.finalize",
    version: "1",
    requiredCapability: BILLS_FINALIZE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: FinalizeSaleCommandInput;
    }) => {
      try {
        return executeFinalizeSale(deps, tx, context, input);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : "Sale finalization failed.";
        throw new AppError({
          code: "INTERNAL_ERROR",
          message,
          exposeMessage: true,
          cause: error,
        });
      }
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => finalizeSaleResponseSchema.parse(JSON.parse(resultRef)),
  };
}

function executeFinalizeSale(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: FinalizeSaleCommandInput,
): FinalizeSaleResponse {
  const existing = getSaleById(tx, context.stallId, input.saleId);
  if (existing === null) {
    throw notFoundError("Sale draft not found for this stall.");
  }
  if (existing.status === "finalized") {
    throw conflictError("Sale is already finalized.");
  }
  if (existing.status !== "draft") {
    throw conflictError("Only draft sales can be finalized.");
  }
  if (existing.revision !== input.expectedRevision) {
    throw conflictError("Sale draft revision is stale.");
  }
  if (existing.lines.length === 0) {
    throw validationError("Sale draft is incomplete.", [
      {
        path: "lines",
        code: "INCOMPLETE_DRAFT",
        message: "Sale requires at least one line before finalization.",
      },
    ]);
  }

  const buyer = assertActiveBuyer(tx, context.stallId, existing.traderId);
  assertAccountOpened(tx, context.stallId, "trader", buyer.id, "Buyer");

  const lineInputs = saleLinesToPolicyInputs(existing.lines);
  for (const line of lineInputs) {
    assertActiveFarmer(tx, context.stallId, line.farmerId);
    assertActiveVegetable(tx, context.stallId, line.vegetableId);
    assertActivePackageType(tx, context.stallId, line.packageTypeId);
    assertAccountOpened(tx, context.stallId, "farmer", line.farmerId, "Farmer");
  }

  const policy = loadActiveDomainCommissionPolicy(tx, context.stallId);
  if (policy === null) {
    throw conflictError("No active commission policy is available for finalization.");
  }

  let bill;
  try {
    bill = calculateSaleBillWithPolicy(policy, lineInputs);
  } catch (error) {
    mapDomainError(error);
  }

  const calculationFingerprint = fingerprintFor(
    existing.revision,
    existing.traderId,
    existing.businessDate,
    policy,
    bill,
  );
  if (calculationFingerprint !== input.expectedCalculationFingerprint) {
    throw conflictError(
      "Sale calculation is stale. Request a new preview and resubmit finalization.",
    );
  }

  ensureBillSequencesForStall(tx, context.stallId);
  const sequence = allocateNextBillSequence(tx, context.stallId, "trader");
  const billNumber = formatBillNumber("trader", sequence);
  const now = deps.now();
  const postingId = deps.createId();
  const traderBillId = deps.createId();

  ensurePartyAccount(tx, {
    id: deps.createId(),
    stallId: context.stallId,
    partyKind: "trader",
    partyId: buyer.id,
    createdAt: now,
    updatedAt: now,
  });
  for (const farmerId of bill.farmerEntitlements.keys()) {
    ensurePartyAccount(tx, {
      id: deps.createId(),
      stallId: context.stallId,
      partyKind: "farmer",
      partyId: farmerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const ledgerEntries = [
    {
      entryId: deps.createId(),
      partyKind: "trader" as const,
      partyId: buyer.id,
      amountMinor: bill.totalTraderPaysMinor,
    },
    ...[...bill.farmerEntitlements.entries()].map(([farmerId, amountMinor]) => ({
      entryId: deps.createId(),
      partyKind: "farmer" as const,
      partyId: farmerId,
      amountMinor,
    })),
  ];

  try {
    postLedgerEntries(tx, {
      postingId,
      stallId: context.stallId,
      sourceType: SALE_SOURCE_TYPE,
      sourceId: existing.id,
      financialEventType: SALE_EVENT_FINALIZED,
      eventSequence: 1,
      businessDate: existing.businessDate,
      recordedAt: now,
      actorStaffId: context.actorRef,
      description: `Sale finalize ${billNumber}`,
      currency: "LKR",
      entries: ledgerEntries,
    });
  } catch (error) {
    if (error instanceof DuplicateFinancialEventError) {
      throw conflictError(error.message);
    }
    throw error;
  }

  const lineSnapshots = bill.lines.map((line) => {
    const farmer = assertActiveFarmer(tx, context.stallId, line.farmerId);
    const vegetable = assertActiveVegetable(tx, context.stallId, line.vegetableId);
    const packageType = assertActivePackageType(tx, context.stallId, line.packageTypeId);
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

  let finalizedSale: SaleRecord;
  try {
    finalizedSale = finalizeSaleWithExpectedRevision(tx, {
      stallId: context.stallId,
      saleId: existing.id,
      expectedRevision: input.expectedRevision,
      traderShortCode: buyer.shortCode,
      traderDisplayName: buyer.displayName,
      commissionPolicyId: policy.policyId,
      commissionVersionId: policy.versionId,
      calculationFingerprint,
      postingId,
      totalSaleAmountMinor: bill.totalSaleAmountMinor,
      totalCommissionMinor: bill.totalCommissionMinor,
      totalTraderPaysMinor: bill.totalTraderPaysMinor,
      totalFarmerReceivesMinor: bill.totalFarmerReceivesBeforeDeductionsMinor,
      lineSnapshots,
      finalizedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      throw conflictError(error.message);
    }
    throw error;
  }

  const stallPrintIdentity = getStallPrintIdentity(tx);
  const traderBill = insertFinalizedTraderBill(tx, {
    id: traderBillId,
    stallId: context.stallId,
    saleId: existing.id,
    traderId: buyer.id,
    traderShortCode: buyer.shortCode,
    traderDisplayName: buyer.displayName,
    stallDisplayName: stallPrintIdentity?.displayName ?? null,
    stallAddress: stallPrintIdentity?.address ?? null,
    billNumber,
    businessDate: existing.businessDate,
    totalAmountMinor: bill.totalTraderPaysMinor,
    totalCommissionMinor: bill.totalCommissionMinor,
    totalFarmerReceivesMinor: bill.totalFarmerReceivesBeforeDeductionsMinor,
    commissionPolicyId: policy.policyId,
    commissionVersionId: policy.versionId,
    calculationFingerprint,
    postingId,
    finalizedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const billDto = toTraderBillDto({ bill: traderBill, sale: finalizedSale });
  const eventPayload = saleFinalizedEventPayloadSchema.parse({
    saleId: existing.id,
    traderBillId: traderBill.id,
    billNumber,
    traderId: buyer.id,
    businessDate: existing.businessDate,
    totalAmountMinor: bill.totalTraderPaysMinor,
    totalCommissionMinor: bill.totalCommissionMinor,
    postingId,
    commissionPolicyId: policy.policyId,
    commissionVersionId: policy.versionId,
    calculationFingerprint,
    lineCount: bill.lines.length,
  });

  writeAuditAndOutbox({
    tx,
    context,
    action: "sale.finalized",
    targetType: "sale",
    targetId: existing.id,
    eventType: SALE_FINALIZED_EVENT_TYPE,
    eventSchemaVersion: SALE_FINALIZED_EVENT_SCHEMA_VERSION,
    payload: eventPayload,
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });
  writeAuditAndOutbox({
    tx,
    context,
    action: "trader_bill.issued",
    targetType: "trader_bill",
    targetId: traderBill.id,
    eventType: TRADER_BILL_ISSUED_EVENT_TYPE,
    eventSchemaVersion: TRADER_BILL_ISSUED_EVENT_SCHEMA_VERSION,
    payload: eventPayload,
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  return finalizeSaleResponseSchema.parse({
    saleId: existing.id,
    traderBillId: traderBill.id,
    billNumber,
    postingId,
    bill: billDto,
  });
}

type CommandMeta = {
  requestId: string;
  idempotencyKey: string;
  deviceProof?: import("../auth/device-proof.js").DeviceProof;
  sessionSecret?: string;
  method?: string;
  path?: string;
};

export function runCreateSaleDraftCommand(
  deps: CommandDeps,
  input: CreateSaleDraftRequest,
  meta: CommandMeta,
): SaleDraftRecordDto {
  return runIdempotentCommand(deps, createDraftDefinition(deps), {
    input: createSaleDraftRequestSchema.parse(input),
    ...meta,
  });
}

export function runUpdateSaleDraftCommand(
  deps: CommandDeps,
  input: UpdateSaleDraftCommandInput,
  meta: CommandMeta,
): SaleDraftRecordDto {
  const { saleId, ...body } = input;
  return runIdempotentCommand(deps, updateDraftDefinition(deps), {
    input: { saleId, ...updateSaleDraftRequestSchema.parse(body) },
    ...meta,
  });
}

export function runAbandonSaleDraftCommand(
  deps: CommandDeps,
  input: AbandonSaleDraftCommandInput,
  meta: CommandMeta,
): SaleDraftRecordDto {
  const { saleId, ...body } = input;
  return runIdempotentCommand(deps, abandonDraftDefinition(deps), {
    input: { saleId, ...abandonSaleDraftRequestSchema.parse(body) },
    ...meta,
  });
}

export function runFinalizeSaleCommand(
  deps: CommandDeps,
  input: FinalizeSaleCommandInput,
  meta: CommandMeta,
): FinalizeSaleResponse {
  const { saleId, ...body } = input;
  return runIdempotentCommand(deps, finalizeDefinition(deps), {
    input: { saleId, ...finalizeSaleRequestSchema.parse(body) },
    ...meta,
  });
}

export function loadFinalizedTraderBillDto(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] },
  stallId: string,
  billId: string,
): TraderBillRecordDto | null {
  const bill = getTraderBillById(database, stallId, billId);
  if (bill === null) {
    return null;
  }
  const sale = getSaleById(database, stallId, bill.saleId);
  if (sale === null || sale.status !== "finalized") {
    return null;
  }
  return toTraderBillDto({ bill, sale });
}

export function loadFinalizedTraderBillBySaleDto(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] },
  stallId: string,
  saleId: string,
): TraderBillRecordDto | null {
  const bill = getTraderBillBySaleId(database, stallId, saleId);
  if (bill === null) {
    return null;
  }
  const sale = getSaleById(database, stallId, bill.saleId);
  if (sale === null || sale.status !== "finalized") {
    return null;
  }
  return toTraderBillDto({ bill, sale });
}
