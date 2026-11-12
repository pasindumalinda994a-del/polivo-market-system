import {
  ACCOUNT_STATEMENT_VIEW_MODEL_VERSION,
  accountStatementQuerySchema,
  accountStatementResponseSchema,
  accountSummaryQuerySchema,
  accountSummaryResponseSchema,
  billSettlementDetailResponseSchema,
  historicalOutstandingQuerySchema,
  outstandingObligationsQuerySchema,
  outstandingObligationsResponseSchema,
  unappliedPaymentsQuerySchema,
  unappliedPaymentsResponseSchema,
  type AccountStatementQuery,
  type AccountStatementResponse,
  type AccountSummaryQuery,
  type AccountSummaryResponse,
  type BillSettlementDetailResponse,
  type HistoricalOutstandingQuery,
  type OutstandingObligationsQuery,
  type OutstandingObligationsResponse,
  type UnappliedPaymentsQuery,
  type UnappliedPaymentsResponse,
} from "@polivo/contracts";
import {
  captureReportingWatermarks,
  computeFarmerBillSettlement,
  computeTraderBillSettlement,
  countStatementPeriodMovements,
  getBuyerById,
  getFarmerBillById,
  getFarmerById,
  getPartyAccount,
  getTraderBillById,
  listAllocationsForHistoricalOutstanding,
  listEligibleFarmerSaleLineObligations,
  listEligibleOpeningObligations,
  listEligibleTraderBillObligations,
  listStatementMovementsPage,
  listStatementPeriodAmounts,
  listUnappliedPaymentsAtWatermark,
  sumAccountBalanceAtWatermark,
  sumStatementOpeningBalanceMinor,
  type EligibleObligationRow,
  type HistoricalAllocationRow,
  type LedgerPartyKind,
  type LocalDatabase,
  type ReportingWatermarks,
} from "@polivo/db-local";
import {
  DomainError,
  ACCOUNT_STATEMENT_VIEW_MODEL_VERSION as DOMAIN_STATEMENT_VM,
  allocationActiveAtCutoff,
  assertSnapshotMatchesBinding,
  balanceDirectionLabel,
  balanceDisplayAmountMinor,
  buildSnapshotExpiry,
  computeRunningBalances,
  computeStatementPeriodTotals,
  decodeStatementPageCursor,
  decodeStatementSnapshotToken,
  encodeStatementPageCursor,
  encodeStatementSnapshotToken,
  obligationRemainingAmountMinor,
  reconcileOutstandingWithBalance,
  settlementStatusForRemaining,
  splitIncreaseDecrease,
  type StatementSnapshotPayload,
} from "@polivo/domain";

import { conflictError, notFoundError, validationError } from "../errors/app-error.js";

void DOMAIN_STATEMENT_VM;

type PartyIdentity = { code: string; displayName: string; isActive: boolean };

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    if (error.code === "SNAPSHOT_EXPIRED" || error.code === "SNAPSHOT_MISMATCH") {
      throw conflictError(error.message);
    }
    throw validationError(error.message, [
      { path: "query", code: error.code, message: error.message },
    ]);
  }
  throw error;
}

function loadParty(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): PartyIdentity {
  if (partyKind === "farmer") {
    const farmer = getFarmerById(database, stallId, partyId);
    if (farmer === null) {
      throw notFoundError("Farmer not found for this stall.");
    }
    return {
      code: farmer.shortCode,
      displayName: farmer.displayName,
      isActive: farmer.isActive,
    };
  }
  const buyer = getBuyerById(database, stallId, partyId);
  if (buyer === null) {
    throw notFoundError("Buyer not found for this stall.");
  }
  return {
    code: buyer.shortCode,
    displayName: buyer.displayName,
    isActive: buyer.isActive,
  };
}

function filterFingerprint(input: {
  movementSearch?: string;
  sourceTypeFilter?: string;
}): string | null {
  const search = input.movementSearch?.trim() ?? "";
  const source = input.sourceTypeFilter?.trim() ?? "";
  if (search.length === 0 && source.length === 0) {
    return null;
  }
  return JSON.stringify({ movementSearch: search || null, sourceTypeFilter: source || null });
}

function createSnapshotPayload(input: {
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  purpose: StatementSnapshotPayload["purpose"];
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  filterFingerprint: string | null;
  watermarks: ReportingWatermarks;
  nowIso: string;
}): StatementSnapshotPayload {
  return {
    v: 1,
    stallId: input.stallId,
    partyKind: input.partyKind,
    partyId: input.partyId,
    currency: "LKR",
    fromBusinessDate: input.fromBusinessDate,
    toBusinessDate: input.toBusinessDate,
    asOfBusinessDate: input.asOfBusinessDate,
    purpose: input.purpose,
    capturedAt: input.nowIso,
    expiresAt: buildSnapshotExpiry(input.nowIso),
    watermarks: input.watermarks,
    filterFingerprint: input.filterFingerprint,
  };
}

function resolveOrCreateSnapshot(input: {
  database: LocalDatabase;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  purpose: StatementSnapshotPayload["purpose"];
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  filterFingerprint: string | null;
  snapshotToken: string | undefined;
  nowIso: string;
}): { payload: StatementSnapshotPayload; token: string } {
  if (input.snapshotToken !== undefined) {
    try {
      const payload = decodeStatementSnapshotToken(input.snapshotToken);
      assertSnapshotMatchesBinding(
        payload,
        {
          stallId: input.stallId,
          partyKind: input.partyKind,
          partyId: input.partyId,
          currency: "LKR",
          purpose: input.purpose,
          fromBusinessDate: input.fromBusinessDate,
          toBusinessDate: input.toBusinessDate,
          asOfBusinessDate: input.asOfBusinessDate,
          filterFingerprint: input.filterFingerprint,
        },
        input.nowIso,
      );
      return { payload, token: input.snapshotToken };
    } catch (error) {
      mapDomainError(error);
    }
  }

  const watermarks = captureReportingWatermarks(input.database, input.stallId);
  const payload = createSnapshotPayload({
    stallId: input.stallId,
    partyKind: input.partyKind,
    partyId: input.partyId,
    purpose: input.purpose,
    fromBusinessDate: input.fromBusinessDate,
    toBusinessDate: input.toBusinessDate,
    asOfBusinessDate: input.asOfBusinessDate,
    filterFingerprint: input.filterFingerprint,
    watermarks,
    nowIso: input.nowIso,
  });
  return { payload, token: encodeStatementSnapshotToken(payload) };
}

function snapshotMetadata(token: string, payload: StatementSnapshotPayload) {
  return {
    snapshotToken: token,
    capturedAt: payload.capturedAt,
    expiresAt: payload.expiresAt,
    maxPostingSequence: payload.watermarks.maxPostingSequence,
    dateBasis: "business_effective" as const,
    businessTimezone: "UTC" as const,
  };
}

function loadCurrentEligibleRows(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
): EligibleObligationRow[] {
  return partyKind === "trader"
    ? [
        ...listEligibleTraderBillObligations(database, stallId, partyId),
        ...listEligibleOpeningObligations(database, stallId, "trader", partyId),
      ]
    : [
        ...listEligibleFarmerSaleLineObligations(database, stallId, partyId),
        ...listEligibleOpeningObligations(database, stallId, "farmer", partyId),
      ];
}

function mapEligibleToOutstandingItem(
  partyKind: LedgerPartyKind,
  partyId: string,
  row: EligibleObligationRow,
) {
  const relatedBillKind =
    row.documentKind === "trader_bill"
      ? ("trader_bill" as const)
      : row.documentKind === "farmer_bill"
        ? ("farmer_bill" as const)
        : null;
  return {
    obligationKind: row.obligationKind,
    targetId: row.targetId,
    partyKind,
    partyId,
    sourceDate: row.businessDate,
    originalAmountMinor: row.effectiveAmountMinor,
    effectiveAmountMinor: row.effectiveAmountMinor,
    activeAllocatedMinor: row.activeAllocatedMinor,
    remainingMinor: row.remainingMinor,
    currency: "LKR" as const,
    relatedBillKind,
    relatedBillId: row.documentId,
    relatedBillNumber: row.documentNumber,
    correctionStatus: "active" as const,
    settlementStatus: settlementStatusForRemaining(row.effectiveAmountMinor, row.remainingMinor),
    label: row.label,
  };
}

function rebuildHistoricalOutstanding(input: {
  database: LocalDatabase;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  asOfBusinessDate: string;
  cutoffIso: string;
  watermarks: ReportingWatermarks;
}): {
  items: ReturnType<typeof mapEligibleToOutstandingItem>[];
  remainingObligationsMinor: number;
  legacyReleaseTimestampLimitation: boolean;
} {
  const current = loadCurrentEligibleRows(
    input.database,
    input.stallId,
    input.partyKind,
    input.partyId,
  ).filter((row) => row.businessDate === null || row.businessDate <= input.asOfBusinessDate);

  const allocations = listAllocationsForHistoricalOutstanding(
    input.database,
    input.stallId,
    input.partyKind,
    input.partyId,
    input.watermarks,
  );

  let legacyReleaseTimestampLimitation = false;
  const allocatedByTarget = new Map<string, number>();

  for (const allocation of allocations) {
    if (allocation.paymentBusinessDate > input.asOfBusinessDate) {
      continue;
    }
    if (allocation.reversesPaymentId !== null) {
      continue;
    }
    const activity = allocationActiveAtCutoff(
      {
        createdAt: allocation.createdAt,
        releasedAt: allocation.releasedAt,
        legacyReleaseRecordedAt: allocation.legacyReleaseRecordedAt,
      },
      input.cutoffIso,
    );
    if (activity.usedLegacyReleaseProxy) {
      legacyReleaseTimestampLimitation = true;
    }
    if (!activity.active) {
      continue;
    }
    const key = `${allocation.obligationKind}:${allocation.targetId}`;
    allocatedByTarget.set(key, (allocatedByTarget.get(key) ?? 0) + allocation.appliedAmountMinor);
  }

  // Also surface obligations that are fully settled today but were open historically:
  // include targets that had allocations by as-of even if not currently eligible.
  const targetKeys = new Set(current.map((row) => `${row.obligationKind}:${row.targetId}`));
  for (const allocation of allocations) {
    if (allocation.paymentBusinessDate > input.asOfBusinessDate) {
      continue;
    }
    targetKeys.add(`${allocation.obligationKind}:${allocation.targetId}`);
  }

  const items: ReturnType<typeof mapEligibleToOutstandingItem>[] = [];
  let remainingObligationsMinor = 0;

  for (const row of current) {
    const key = `${row.obligationKind}:${row.targetId}`;
    const activeAllocatedMinor = allocatedByTarget.get(key) ?? 0;
    let remainingMinor: number;
    try {
      remainingMinor = obligationRemainingAmountMinor(row.effectiveAmountMinor, activeAllocatedMinor);
    } catch {
      remainingMinor = 0;
    }
    if (remainingMinor <= 0) {
      continue;
    }
    remainingObligationsMinor += remainingMinor;
    items.push(
      mapEligibleToOutstandingItem(input.partyKind, input.partyId, {
        ...row,
        activeAllocatedMinor,
        remainingMinor,
      }),
    );
    targetKeys.delete(key);
  }

  return { items, remainingObligationsMinor, legacyReleaseTimestampLimitation };
}

function sumUnapplied(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  watermarks: ReportingWatermarks,
  asOfBusinessDate?: string,
): number {
  return listUnappliedPaymentsAtWatermark(
    database,
    stallId,
    partyKind,
    partyId,
    watermarks,
    asOfBusinessDate,
  ).reduce((sum, row) => sum + row.unappliedAmountMinor, 0);
}

export function loadAccountStatement(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  rawQuery: AccountStatementQuery,
  nowIso: string,
  tenantId: string | null,
): AccountStatementResponse {
  const query = accountStatementQuerySchema.parse(rawQuery);
  const party = loadParty(database, stallId, partyKind, partyId);
  const account = getPartyAccount(database, stallId, partyKind, partyId);
  const fingerprint = filterFingerprint({
    movementSearch: query.movementSearch,
    sourceTypeFilter: query.sourceTypeFilter,
  });

  let cursorDecoded:
    | { snapshotToken: string; afterBusinessDate: string; afterPostingSequence: number; afterEntryId: string }
    | undefined;
  if (query.cursor !== undefined) {
    try {
      cursorDecoded = decodeStatementPageCursor(query.cursor);
    } catch (error) {
      mapDomainError(error);
    }
  }

  const snapshotTokenInput = query.snapshotToken ?? cursorDecoded?.snapshotToken;
  if (query.cursor !== undefined && query.snapshotToken !== undefined) {
    if (cursorDecoded!.snapshotToken !== query.snapshotToken) {
      throw conflictError("Pagination cursor does not match the reporting snapshot.");
    }
  }

  const { payload, token } = resolveOrCreateSnapshot({
    database,
    stallId,
    partyKind,
    partyId,
    purpose: "statement",
    fromBusinessDate: query.fromBusinessDate,
    toBusinessDate: query.toBusinessDate,
    asOfBusinessDate: null,
    filterFingerprint: fingerprint,
    snapshotToken: snapshotTokenInput,
    nowIso,
  });

  if (cursorDecoded !== undefined && cursorDecoded.snapshotToken !== token) {
    throw conflictError("Pagination cursor does not match the reporting snapshot.");
  }

  const maxPostingSequence = payload.watermarks.maxPostingSequence;
  const openingBalanceMinor = sumStatementOpeningBalanceMinor(
    database,
    stallId,
    partyKind,
    partyId,
    query.fromBusinessDate,
    maxPostingSequence,
  );
  const periodAmounts = listStatementPeriodAmounts(
    database,
    stallId,
    partyKind,
    partyId,
    query.fromBusinessDate,
    query.toBusinessDate,
    maxPostingSequence,
  );
  const totals = computeStatementPeriodTotals(partyKind, openingBalanceMinor, periodAmounts);
  const movementCount = countStatementPeriodMovements(
    database,
    stallId,
    partyKind,
    partyId,
    query.fromBusinessDate,
    query.toBusinessDate,
    maxPostingSequence,
  );

  const page = listStatementMovementsPage(database, {
    stallId,
    partyKind,
    partyId,
    fromBusinessDate: query.fromBusinessDate,
    toBusinessDate: query.toBusinessDate,
    maxPostingSequence,
    limit: query.limit,
    afterBusinessDate: cursorDecoded?.afterBusinessDate,
    afterPostingSequence: cursorDecoded?.afterPostingSequence,
    afterEntryId: cursorDecoded?.afterEntryId,
    movementSearch: query.movementSearch,
    sourceTypeFilter: query.sourceTypeFilter,
  });

  // Running balances always use ledger amounts on the page; when a row filter is
  // active, balanceBeforePage still reflects the full-period preceding balance.
  const running = computeRunningBalances(
    page.precedingBalanceMinor,
    page.items.map((item) => item.amountMinor),
  );

  const items = page.items.map((item, index) => {
    const split = splitIncreaseDecrease(item.amountMinor);
    const runningBalanceMinor = running[index]!;
    return {
      entryId: item.entryId,
      postingId: item.postingId,
      businessDate: item.businessDate,
      recordedAt: item.recordedAt,
      postingSequence: item.postingSequence,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      financialEventType: item.financialEventType,
      description: item.description,
      documentReference: null,
      amountMinor: item.amountMinor,
      increaseMinor: split.increaseMinor,
      decreaseMinor: split.decreaseMinor,
      directionLabel: balanceDirectionLabel(partyKind, item.amountMinor),
      runningBalanceMinor,
      runningDirectionLabel: balanceDirectionLabel(partyKind, runningBalanceMinor),
      reversesEntryId: item.reversesEntryId,
      reversedByEntryId: item.reversedByEntryId,
      correctionLineagePostingId: null,
    };
  });

  const last = page.items[page.items.length - 1];
  const nextCursor =
    page.hasMore && last !== undefined
      ? encodeStatementPageCursor({
          snapshotToken: token,
          afterBusinessDate: last.businessDate,
          afterPostingSequence: last.postingSequence,
          afterEntryId: last.entryId,
        })
      : null;

  const rowFilterActive = fingerprint !== null;

  return accountStatementResponseSchema.parse({
    viewModelVersion: ACCOUNT_STATEMENT_VIEW_MODEL_VERSION,
    header: {
      stallId,
      tenantId,
      partyKind,
      partyId,
      partyCode: party.code,
      partyDisplayName: party.displayName,
      accountRole: partyKind,
      currency: "LKR",
      fromBusinessDate: query.fromBusinessDate,
      toBusinessDate: query.toBusinessDate,
      dateBasis: query.dateBasis,
      openingStatus: account?.openingStatus ?? "not_opened",
      generatedAt: nowIso,
    },
    summary: {
      openingBalanceMinor: totals.openingBalanceMinor,
      openingDirectionLabel: totals.openingDirectionLabel,
      periodIncreaseMinor: totals.periodIncreaseMinor,
      periodDecreaseMinor: totals.periodDecreaseMinor,
      periodNetMinor: totals.periodNetMinor,
      closingBalanceMinor: totals.closingBalanceMinor,
      closingDirectionLabel: totals.closingDirectionLabel,
      movementCount,
    },
    balanceBeforePageMinor: page.precedingBalanceMinor,
    items,
    nextCursor,
    snapshot: snapshotMetadata(token, payload),
    rowFilterActive,
    rowFilterLabel: rowFilterActive
      ? "Movement search filter — period totals remain for the complete selected period."
      : null,
  });
}

export function loadAccountSummary(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  rawQuery: AccountSummaryQuery,
  nowIso: string,
): AccountSummaryResponse {
  const query = accountSummaryQuerySchema.parse(rawQuery);
  const party = loadParty(database, stallId, partyKind, partyId);
  const account = getPartyAccount(database, stallId, partyKind, partyId);

  const { payload, token } = resolveOrCreateSnapshot({
    database,
    stallId,
    partyKind,
    partyId,
    purpose: "summary",
    fromBusinessDate: null,
    toBusinessDate: null,
    asOfBusinessDate: query.asOfBusinessDate ?? null,
    filterFingerprint: null,
    snapshotToken: query.snapshotToken,
    nowIso,
  });

  const balanceMinor = sumAccountBalanceAtWatermark(
    database,
    stallId,
    partyKind,
    partyId,
    payload.watermarks.maxPostingSequence,
    query.asOfBusinessDate,
  );

  const obligations = loadCurrentEligibleRows(database, stallId, partyKind, partyId);
  const remainingObligationsMinor = obligations.reduce((sum, row) => sum + row.remainingMinor, 0);
  const unappliedPaymentsMinor = sumUnapplied(
    database,
    stallId,
    partyKind,
    partyId,
    payload.watermarks,
    query.asOfBusinessDate,
  );
  const reconciliation = reconcileOutstandingWithBalance({
    partyKind,
    accountBalanceMinor: balanceMinor,
    remainingObligationsMinor,
    unappliedSettlementMinor: unappliedPaymentsMinor,
  });

  return accountSummaryResponseSchema.parse({
    stallId,
    partyKind,
    partyId,
    partyCode: party.code,
    partyDisplayName: party.displayName,
    currency: "LKR",
    balanceMinor,
    displayAmountMinor: balanceDisplayAmountMinor(balanceMinor),
    directionLabel: balanceDirectionLabel(partyKind, balanceMinor),
    openingStatus: account?.openingStatus ?? "not_opened",
    openingCutoffDate: account?.openingCutoffDate ?? null,
    asOfBusinessDate: query.asOfBusinessDate ?? null,
    remainingObligationsMinor,
    unappliedPaymentsMinor,
    reconciliationNetMinor: reconciliation.reconciliationNetMinor,
    reconciliationOk: reconciliation.reconciliationOk,
    reconciliationDiagnostic: reconciliation.diagnostic,
    snapshot: snapshotMetadata(token, payload),
  });
}

export function loadOutstandingObligations(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  rawQuery: OutstandingObligationsQuery | HistoricalOutstandingQuery,
  nowIso: string,
  forceHistorical: boolean,
): OutstandingObligationsResponse {
  const query = forceHistorical
    ? historicalOutstandingQuerySchema.parse(rawQuery)
    : outstandingObligationsQuerySchema.parse(rawQuery);
  loadParty(database, stallId, partyKind, partyId);

  const asOfBusinessDate =
    "asOfBusinessDate" in query ? (query.asOfBusinessDate ?? null) : null;
  const isHistorical = forceHistorical || asOfBusinessDate !== null;

  const { payload, token } = resolveOrCreateSnapshot({
    database,
    stallId,
    partyKind,
    partyId,
    purpose: "outstanding",
    fromBusinessDate: null,
    toBusinessDate: null,
    asOfBusinessDate,
    filterFingerprint: null,
    snapshotToken: query.snapshotToken,
    nowIso,
  });

  const accountBalanceMinor = sumAccountBalanceAtWatermark(
    database,
    stallId,
    partyKind,
    partyId,
    payload.watermarks.maxPostingSequence,
    asOfBusinessDate ?? undefined,
  );

  let items: ReturnType<typeof mapEligibleToOutstandingItem>[];
  let remainingObligationsMinor: number;
  let legacyReleaseTimestampLimitation = false;

  if (isHistorical && asOfBusinessDate !== null) {
    const rebuilt = rebuildHistoricalOutstanding({
      database,
      stallId,
      partyKind,
      partyId,
      asOfBusinessDate,
      cutoffIso: payload.capturedAt,
      watermarks: payload.watermarks,
    });
    items = rebuilt.items;
    remainingObligationsMinor = rebuilt.remainingObligationsMinor;
    legacyReleaseTimestampLimitation = rebuilt.legacyReleaseTimestampLimitation;
  } else {
    const rows = loadCurrentEligibleRows(database, stallId, partyKind, partyId).filter(
      (row) => row.remainingMinor > 0,
    );
    items = rows.map((row) => mapEligibleToOutstandingItem(partyKind, partyId, row));
    remainingObligationsMinor = rows.reduce((sum, row) => sum + row.remainingMinor, 0);
  }

  const unappliedPaymentsMinor = sumUnapplied(
    database,
    stallId,
    partyKind,
    partyId,
    payload.watermarks,
    asOfBusinessDate ?? undefined,
  );
  const reconciliation = reconcileOutstandingWithBalance({
    partyKind,
    accountBalanceMinor,
    remainingObligationsMinor,
    unappliedSettlementMinor: unappliedPaymentsMinor,
  });

  const offset =
    query.cursor !== undefined && /^\d+$/.test(query.cursor)
      ? Number.parseInt(query.cursor, 10)
      : 0;
  const pageItems = items.slice(offset, offset + query.limit);
  const nextOffset = offset + query.limit;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;

  return outstandingObligationsResponseSchema.parse({
    partyKind,
    partyId,
    currency: "LKR",
    asOfBusinessDate,
    isHistorical,
    reconstructionBasis: isHistorical
      ? "effective_and_recording_cutoff"
      : "current_status",
    legacyReleaseTimestampLimitation,
    remainingObligationsMinor,
    unappliedPaymentsMinor,
    accountBalanceMinor,
    reconciliationNetMinor: reconciliation.reconciliationNetMinor,
    reconciliationOk: reconciliation.reconciliationOk,
    reconciliationDiagnostic: reconciliation.diagnostic,
    items: pageItems,
    nextCursor,
    snapshot: snapshotMetadata(token, payload),
  });
}

export function loadUnappliedPayments(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  rawQuery: UnappliedPaymentsQuery,
  nowIso: string,
  includePaymentMetadata: boolean,
): UnappliedPaymentsResponse {
  const query = unappliedPaymentsQuerySchema.parse(rawQuery);
  loadParty(database, stallId, partyKind, partyId);

  const { payload, token } = resolveOrCreateSnapshot({
    database,
    stallId,
    partyKind,
    partyId,
    purpose: "unapplied",
    fromBusinessDate: null,
    toBusinessDate: null,
    asOfBusinessDate: query.asOfBusinessDate ?? null,
    filterFingerprint: null,
    snapshotToken: query.snapshotToken,
    nowIso,
  });

  const all = listUnappliedPaymentsAtWatermark(
    database,
    stallId,
    partyKind,
    partyId,
    payload.watermarks,
    query.asOfBusinessDate,
  );
  const offset =
    query.cursor !== undefined && /^\d+$/.test(query.cursor)
      ? Number.parseInt(query.cursor, 10)
      : 0;
  const page = all.slice(offset, offset + query.limit);
  const nextOffset = offset + query.limit;

  return unappliedPaymentsResponseSchema.parse({
    partyKind,
    partyId,
    currency: "LKR",
    totalUnappliedMinor: all.reduce((sum, row) => sum + row.unappliedAmountMinor, 0),
    items: page.map((row) => ({
      paymentId: row.paymentId,
      referenceNumber: includePaymentMetadata ? row.referenceNumber : null,
      businessDate: row.businessDate,
      amountMinor: row.amountMinor,
      unappliedAmountMinor: row.unappliedAmountMinor,
      method: includePaymentMetadata ? row.method : null,
      physicalHandoverDate: includePaymentMetadata ? row.physicalHandoverDate : null,
      chequeNumber: includePaymentMetadata ? row.chequeNumber : null,
      metadataRedacted: !includePaymentMetadata,
    })),
    nextCursor: nextOffset < all.length ? String(nextOffset) : null,
    snapshot: snapshotMetadata(token, payload),
  });
}

export function loadBillSettlementDetail(
  database: LocalDatabase,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  billKind: "trader_bill" | "farmer_bill",
  billId: string,
  snapshotToken: string | undefined,
  nowIso: string,
): BillSettlementDetailResponse {
  loadParty(database, stallId, partyKind, partyId);

  const { payload, token } = resolveOrCreateSnapshot({
    database,
    stallId,
    partyKind,
    partyId,
    purpose: "settlement",
    fromBusinessDate: null,
    toBusinessDate: null,
    asOfBusinessDate: null,
    filterFingerprint: billId,
    snapshotToken,
    nowIso,
  });

  if (billKind === "trader_bill") {
    const bill = getTraderBillById(database, stallId, billId);
    if (bill === null || bill.traderId !== partyId) {
      throw notFoundError("Trader bill was not found for this account.");
    }
    const settlement = computeTraderBillSettlement(database, stallId, billId);
    if (settlement === null) {
      throw notFoundError("Trader bill settlement could not be computed.");
    }
    const rows = listEligibleTraderBillObligations(database, stallId, partyId).filter(
      (row) => row.targetId === billId,
    );
    const correctionStatus =
      bill.correctionStatus === "active"
        ? ("active" as const)
        : bill.correctionStatus === "reversed"
          ? ("reversed" as const)
          : ("replaced" as const);
    return billSettlementDetailResponseSchema.parse({
      billKind,
      billId,
      billNumber: bill.billNumber,
      partyKind,
      partyId,
      documentStatus: bill.status,
      correctionStatus,
      issuedAmountMinor: bill.totalAmountMinor,
      settlement,
      obligationRows: rows.map((row) => mapEligibleToOutstandingItem(partyKind, partyId, row)),
      supersededOrReversed: bill.correctionStatus !== "active",
      snapshot: snapshotMetadata(token, payload),
    });
  }

  const bill = getFarmerBillById(database, stallId, billId);
  if (bill === null || bill.farmerId !== partyId) {
    throw notFoundError("Farmer bill was not found for this account.");
  }
  const settlement = computeFarmerBillSettlement(database, stallId, billId);
  if (settlement === null) {
    throw notFoundError("Farmer bill settlement could not be computed.");
  }
  const rows = listEligibleFarmerSaleLineObligations(database, stallId, partyId).filter(
    (row) => row.farmerBillId === billId,
  );
  return billSettlementDetailResponseSchema.parse({
    billKind,
    billId,
    billNumber: bill.billNumber,
    partyKind,
    partyId,
    documentStatus: bill.status,
    correctionStatus: "active",
    issuedAmountMinor: bill.totalAmountMinor,
    settlement,
    obligationRows: rows.map((row) => mapEligibleToOutstandingItem(partyKind, partyId, row)),
    supersededOrReversed: false,
    snapshot: snapshotMetadata(token, payload),
  });
}

/** Test helper — counts ledger entries / payments / allocations for side-effect checks. */
export function countFinancialArtifacts(
  database: LocalDatabase,
  stallId: string,
): { ledgerEntries: number; payments: number; allocations: number; outbox: number } {
  const ledgerEntries = (
    database.db
      .prepare(`SELECT COUNT(*) AS c FROM ledger_entries WHERE stall_id = ?`)
      .get(stallId) as { c: number }
  ).c;
  const payments = (
    database.db.prepare(`SELECT COUNT(*) AS c FROM payments WHERE stall_id = ?`).get(stallId) as {
      c: number;
    }
  ).c;
  const allocations = (
    database.db
      .prepare(`SELECT COUNT(*) AS c FROM payment_allocations WHERE stall_id = ?`)
      .get(stallId) as { c: number }
  ).c;
  const outbox = (
    database.db
      .prepare(`SELECT COUNT(*) AS c FROM sync_outbox WHERE stall_id = ?`)
      .get(stallId) as { c: number }
  ).c;
  return { ledgerEntries, payments, allocations, outbox };
}

// Silence unused HistoricalAllocationRow import usage in types-only paths
export type { HistoricalAllocationRow };
