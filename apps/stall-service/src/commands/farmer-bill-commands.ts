import { createHash } from "node:crypto";

import {
  FARMER_BILL_ISSUED_EVENT_SCHEMA_VERSION,
  FARMER_BILL_ISSUED_EVENT_TYPE,
  farmerBillIssuedEventPayloadSchema,
  farmerBillPreviewRequestSchema,
  farmerBillPreviewResponseSchema,
  farmerBillRecordSchema,
  issueFarmerBillRequestSchema,
  issueFarmerBillResponseSchema,
  type FarmerBillPreviewRequest,
  type FarmerBillPreviewResponse,
  type FarmerBillRecordDto,
  type IssueFarmerBillRequest,
  type IssueFarmerBillResponse,
} from "@polivo/contracts";
import {
  allocateNextBillSequence,
  ensureBillSequencesForStall,
  findOriginalFarmerBillInclusion,
  getFarmerBillById,
  getFarmerById,
  getStallPrintIdentity,
  insertFinalizedFarmerBill,
  loadEligibleFarmerSaleLinesByIds,
  type FarmerBillDetailRecord,
  type FarmerSaleLineQueryRow,
  type TxHandle,
} from "@polivo/db-local";
import {
  DomainError,
  aggregateFarmerBillSourceLines,
  buildFarmerBillSelectionFingerprintMaterial,
  formatBillNumber,
} from "@polivo/domain";

import type { ExecutionContext } from "../context/execution-context.js";
import { AppError, conflictError, notFoundError, validationError } from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";
import { BILLS_FINALIZE_CAPABILITY } from "./sale-commands.js";

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw validationError(error.message, [
      { path: error.code, code: error.code, message: error.message },
    ]);
  }
  throw error;
}

function utcCalendarDate(nowIso: string): string {
  return nowIso.slice(0, 10);
}

function hashFingerprint(material: string): string {
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function toPreviewLine(row: FarmerSaleLineQueryRow) {
  return {
    saleLineId: row.saleLineId,
    saleId: row.saleId,
    traderBillId: row.traderBillId,
    traderBillNumber: row.traderBillNumber,
    businessDate: row.businessDate,
    vegetableCode: row.vegetableCode,
    vegetableDisplayName: row.vegetableDisplayName,
    packageCount: row.packageCount,
    netWeightHundredths: row.netWeightHundredths,
    unitPricePerKgMinor: row.unitPricePerKgMinor,
    saleAmountMinor: row.saleAmountMinor,
    commissionAmountMinor: row.commissionAmountMinor,
    farmerReceivesMinor: row.farmerReceivesMinor,
    commissionPolicyId: row.commissionPolicyId,
    commissionVersionId: row.commissionVersionId,
    commissionBandId: row.commissionBandId,
    appliedCommissionRatePerKgMinor: row.appliedCommissionRatePerKgMinor,
    salePostingId: row.salePostingId,
  };
}

function toFarmerBillDto(bill: FarmerBillDetailRecord): FarmerBillRecordDto {
  return farmerBillRecordSchema.parse({
    id: bill.id,
    stallId: bill.stallId,
    farmerId: bill.farmerId,
    farmerShortCode: bill.farmerShortCode,
    farmerDisplayName: bill.farmerDisplayName,
    billType: "farmer",
    billNumber: bill.billNumber,
    businessDate: bill.businessDate,
    status: "finalized",
    coveredBusinessDateFrom: bill.coveredBusinessDateFrom,
    coveredBusinessDateTo: bill.coveredBusinessDateTo,
    totalSaleAmountMinor: bill.totalSaleAmountMinor,
    totalCommissionMinor: bill.totalCommissionMinor,
    totalFarmerReceivesMinor: bill.totalFarmerReceivesMinor,
    totalAmountMinor: bill.totalAmountMinor,
    currency: "LKR",
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
  });
}

function resolveSelection(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  stallId: string,
  farmerId: string,
  sourceLineIds: readonly string[],
): FarmerSaleLineQueryRow[] {
  const rows = loadEligibleFarmerSaleLinesByIds(database, {
    stallId,
    farmerId,
    saleLineIds: sourceLineIds,
  });

  if (rows.length !== sourceLineIds.length) {
    const found = new Set(rows.map((row) => row.saleLineId));
    const missing = sourceLineIds.filter((id) => !found.has(id));
    throw conflictError(
      `One or more selected sale lines are missing, not finalized, or not owned by this farmer: ${missing.join(", ")}`,
    );
  }

  for (const row of rows) {
    if (row.inclusionStatus === "billed") {
      throw conflictError(
        `Sale line ${row.saleLineId} is already included on farmer bill ${row.farmerBillNumber ?? row.farmerBillId}.`,
      );
    }
  }

  return rows;
}

function buildPreviewFromRows(args: {
  farmerId: string;
  farmerShortCode: string;
  farmerDisplayName: string;
  businessDate: string;
  rows: FarmerSaleLineQueryRow[];
}): FarmerBillPreviewResponse {
  let aggregation;
  try {
    aggregation = aggregateFarmerBillSourceLines(
      args.rows.map((row) => ({
        saleLineId: row.saleLineId,
        farmerId: args.farmerId,
        currency: "LKR" as const,
        packageCount: row.packageCount,
        netWeightHundredths: row.netWeightHundredths,
        saleAmountMinor: row.saleAmountMinor,
        commissionAmountMinor: row.commissionAmountMinor,
        farmerReceivesMinor: row.farmerReceivesMinor,
      })),
    );
  } catch (error) {
    mapDomainError(error);
  }

  const selectionFingerprint = hashFingerprint(
    buildFarmerBillSelectionFingerprintMaterial({
      farmerId: args.farmerId,
      businessDate: args.businessDate,
      aggregation,
    }),
  );

  return farmerBillPreviewResponseSchema.parse({
    farmerId: args.farmerId,
    farmerShortCode: args.farmerShortCode,
    farmerDisplayName: args.farmerDisplayName,
    businessDate: args.businessDate,
    selectionFingerprint,
    lines: args.rows.map(toPreviewLine),
    lineCount: aggregation.lineCount,
    totalPackageCount: aggregation.totalPackageCount,
    totalNetWeightHundredths: aggregation.totalNetWeightHundredths,
    totalSaleAmountMinor: aggregation.totalSaleAmountMinor,
    totalCommissionMinor: aggregation.totalCommissionMinor,
    totalFarmerReceivesMinor: aggregation.totalFarmerReceivesMinor,
    currency: "LKR",
  });
}

export function buildFarmerBillPreview(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] },
  stallId: string,
  input: FarmerBillPreviewRequest,
  nowIso: string,
): FarmerBillPreviewResponse {
  const body = farmerBillPreviewRequestSchema.parse(input);
  const farmer = getFarmerById(database, stallId, body.farmerId);
  if (farmer === null) {
    throw notFoundError("Farmer not found.");
  }

  const businessDate = body.businessDate ?? utcCalendarDate(nowIso);
  const rows = resolveSelection(database, stallId, body.farmerId, body.sourceLineIds);
  return buildPreviewFromRows({
    farmerId: farmer.id,
    farmerShortCode: farmer.shortCode,
    farmerDisplayName: farmer.displayName,
    businessDate,
    rows,
  });
}

function executeIssueFarmerBill(
  deps: CommandDeps,
  tx: TxHandle,
  context: ExecutionContext,
  input: IssueFarmerBillRequest,
): IssueFarmerBillResponse {
  const farmer = getFarmerById(tx, context.stallId, input.farmerId);
  if (farmer === null) {
    throw notFoundError("Farmer not found.");
  }

  const businessDate = input.businessDate ?? utcCalendarDate(deps.now());
  const rows = resolveSelection(tx, context.stallId, input.farmerId, input.sourceLineIds);

  // Re-check uniqueness under the write lock path via inclusion lookup.
  for (const row of rows) {
    const existing = findOriginalFarmerBillInclusion(tx, context.stallId, row.saleLineId);
    if (existing !== null) {
      throw conflictError(
        `Sale line ${row.saleLineId} is already included on farmer bill ${existing.billNumber}.`,
      );
    }
  }

  const preview = buildPreviewFromRows({
    farmerId: farmer.id,
    farmerShortCode: farmer.shortCode,
    farmerDisplayName: farmer.displayName,
    businessDate,
    rows,
  });

  if (preview.selectionFingerprint !== input.expectedSelectionFingerprint) {
    throw conflictError(
      "Farmer bill selection is stale. Request a new preview and resubmit issuance.",
    );
  }

  ensureBillSequencesForStall(tx, context.stallId);
  const sequence = allocateNextBillSequence(tx, context.stallId, "farmer");
  const billNumber = formatBillNumber("farmer", sequence);
  const now = deps.now();
  const billId = deps.createId();

  const coveredDates = rows.map((row) => row.businessDate).sort();
  const coveredBusinessDateFrom = coveredDates[0]!;
  const coveredBusinessDateTo = coveredDates[coveredDates.length - 1]!;

  let bill: FarmerBillDetailRecord;
  try {
    const stallPrintIdentity = getStallPrintIdentity(tx);
    bill = insertFinalizedFarmerBill(tx, {
      id: billId,
      stallId: context.stallId,
      farmerId: farmer.id,
      farmerShortCode: farmer.shortCode,
      farmerDisplayName: farmer.displayName,
      stallDisplayName: stallPrintIdentity?.displayName ?? null,
      stallAddress: stallPrintIdentity?.address ?? null,
      billNumber,
      businessDate,
      coveredBusinessDateFrom,
      coveredBusinessDateTo,
      totalSaleAmountMinor: preview.totalSaleAmountMinor,
      totalCommissionMinor: preview.totalCommissionMinor,
      totalFarmerReceivesMinor: preview.totalFarmerReceivesMinor,
      totalAmountMinor: preview.totalFarmerReceivesMinor,
      selectionFingerprint: preview.selectionFingerprint,
      finalizedAt: now,
      createdAt: now,
      updatedAt: now,
      lines: rows.map((row, index) => ({
        id: deps.createId(),
        saleId: row.saleId,
        saleLineId: row.saleLineId,
        lineOrder: index + 1,
        traderBillId: row.traderBillId,
        traderBillNumber: row.traderBillNumber,
        businessDate: row.businessDate,
        vegetableId: row.vegetableId,
        vegetableShortCode: row.vegetableCode,
        vegetableDisplayName: row.vegetableDisplayName,
        packageTypeId: row.packageTypeId,
        packageTypeShortCode: row.packageTypeCode,
        packageTypeDisplayName: row.packageTypeDisplayName,
        packageCount: row.packageCount,
        netWeightHundredths: row.netWeightHundredths,
        unitPricePerKgMinor: row.unitPricePerKgMinor,
        saleAmountMinor: row.saleAmountMinor,
        commissionAmountMinor: row.commissionAmountMinor,
        farmerReceivesMinor: row.farmerReceivesMinor,
        commissionPolicyId: row.commissionPolicyId,
        commissionVersionId: row.commissionVersionId,
        commissionBandId: row.commissionBandId,
        appliedCommissionRatePerKgMinor: row.appliedCommissionRatePerKgMinor,
        salePostingId: row.salePostingId,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|unique|farmer_bill_lines/i.test(message)) {
      throw conflictError(
        "One or more selected sale lines were claimed by another farmer bill. Refresh and review again.",
      );
    }
    throw error;
  }

  const billDto = toFarmerBillDto(bill);
  const salePostingIds = [
    ...new Set(
      rows
        .map((row) => row.salePostingId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const eventPayload = farmerBillIssuedEventPayloadSchema.parse({
    farmerBillId: bill.id,
    billNumber: bill.billNumber,
    farmerId: farmer.id,
    businessDate,
    sourceLineIds: rows.map((row) => row.saleLineId),
    totalSaleAmountMinor: bill.totalSaleAmountMinor,
    totalCommissionMinor: bill.totalCommissionMinor,
    totalFarmerReceivesMinor: bill.totalFarmerReceivesMinor,
    currency: "LKR",
    selectionFingerprint: bill.selectionFingerprint,
    salePostingIds,
    lineCount: bill.lines.length,
  });

  writeAuditAndOutbox({
    tx,
    context,
    action: "farmer_bill.issued",
    targetType: "farmer_bill",
    targetId: bill.id,
    eventType: FARMER_BILL_ISSUED_EVENT_TYPE,
    eventSchemaVersion: FARMER_BILL_ISSUED_EVENT_SCHEMA_VERSION,
    payload: eventPayload,
    eventId: deps.createId(),
    auditId: deps.createId(),
    now,
  });

  return issueFarmerBillResponseSchema.parse({
    farmerBillId: bill.id,
    billNumber: bill.billNumber,
    bill: billDto,
  });
}

function issueDefinition(
  deps: CommandDeps,
): CommandDefinition<IssueFarmerBillRequest, IssueFarmerBillResponse> {
  return {
    type: "farmer_bill.issue",
    version: "1",
    requiredCapability: BILLS_FINALIZE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({ tx, context, input }) => executeIssueFarmerBill(deps, tx, context, input),
    serializeResult: (result) => JSON.stringify(issueFarmerBillResponseSchema.parse(result)),
    deserializeResult: (resultRef) => issueFarmerBillResponseSchema.parse(JSON.parse(resultRef)),
  };
}

type CommandMeta = {
  requestId: string;
  idempotencyKey: string;
  deviceProof?: import("../auth/device-proof.js").DeviceProof;
  sessionSecret?: string;
  method?: string;
  path?: string;
};

export function runIssueFarmerBillCommand(
  deps: CommandDeps,
  input: IssueFarmerBillRequest,
  meta: CommandMeta,
): IssueFarmerBillResponse {
  return runIdempotentCommand(deps, issueDefinition(deps), {
    input: issueFarmerBillRequestSchema.parse(input),
    ...meta,
  });
}

export function loadFinalizedFarmerBillDto(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] },
  stallId: string,
  billId: string,
): FarmerBillRecordDto | null {
  const bill = getFarmerBillById(database, stallId, billId);
  if (bill === null) {
    return null;
  }
  return toFarmerBillDto(bill);
}

export function assertFarmerBillIssueCapability(capabilities: ReadonlySet<string>): void {
  if (!capabilities.has(BILLS_FINALIZE_CAPABILITY)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${BILLS_FINALIZE_CAPABILITY}`,
    });
  }
}
