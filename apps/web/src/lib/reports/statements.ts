import {
  ACCOUNT_STATEMENT_VIEW_MODEL_VERSION,
  accountStatementQuerySchema,
  accountStatementResponseSchema,
  outstandingObligationsQuerySchema,
  outstandingObligationsResponseSchema,
  type AccountStatementQuery,
  type AccountStatementResponse,
  type OutstandingObligationsQuery,
  type OutstandingObligationsResponse,
} from "@polivo/contracts";
import {
  captureReportingWatermarks,
  listEligibleFarmerSaleLineObligations,
  listEligibleTraderBillObligations,
  listStatementMovementsPage,
  listUnappliedPaymentsAtWatermark,
  sumAccountBalanceAtWatermark,
  sumStatementOpeningBalanceMinor,
  type LedgerPartyKind,
  type UserReportingClient,
} from "@polivo/db-cloud";
import {
  ACCOUNT_STATEMENT_VIEW_MODEL_VERSION as DOMAIN_VM,
  assertSnapshotMatchesBinding,
  balanceDirectionLabel,
  buildSnapshotExpiry,
  computeRunningBalances,
  computeStatementPeriodTotals,
  decodeStatementPageCursor,
  decodeStatementSnapshotToken,
  encodeStatementPageCursor,
  encodeStatementSnapshotToken,
  reconcileOutstandingWithBalance,
  settlementStatusForRemaining,
  splitIncreaseDecrease,
  type StatementSnapshotPayload,
} from "@polivo/domain";

import { conflictError } from "@/lib/auth/errors";

import { stallBinding } from "./client";
import { denyObfuscated, mapReportDomainError } from "./errors";
import { getBuyerDetail, getFarmerDetail } from "./parties";

void DOMAIN_VM;

function statementSnapshotMetadata(token: string, payload: StatementSnapshotPayload) {
  return {
    snapshotToken: token,
    capturedAt: payload.capturedAt,
    expiresAt: payload.expiresAt,
    maxPostingSequence: payload.watermarks.maxPostingSequence,
    dateBasis: "business_effective" as const,
    businessTimezone: "UTC" as const,
  };
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
  watermarks: StatementSnapshotPayload["watermarks"];
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

async function resolveStatementSnapshot(input: {
  client: UserReportingClient;
  tenantId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  purpose: StatementSnapshotPayload["purpose"];
  fromBusinessDate: string | null;
  toBusinessDate: string | null;
  asOfBusinessDate: string | null;
  filterFingerprint: string | null;
  snapshotToken: string | undefined;
  nowIso: string;
}): Promise<{ payload: StatementSnapshotPayload; token: string }> {
  const { stallId } = stallBinding(input.tenantId);
  if (input.snapshotToken !== undefined) {
    try {
      const payload = decodeStatementSnapshotToken(input.snapshotToken);
      assertSnapshotMatchesBinding(
        payload,
        {
          stallId,
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
      mapReportDomainError(error);
    }
  }

  const watermarks = await captureReportingWatermarks(input.client, input.tenantId, stallId);
  const payload = createSnapshotPayload({ ...input, watermarks, stallId });
  return { payload, token: encodeStatementSnapshotToken(payload) };
}

async function loadStatementPeriodAmounts(
  client: UserReportingClient,
  tenantId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  fromBusinessDate: string,
  toBusinessDate: string,
  maxPostingSequence: number,
): Promise<number[]> {
  const { stallId } = stallBinding(tenantId);
  const amounts: number[] = [];
  let afterBusinessDate: string | undefined;
  let afterPostingSequence: number | undefined;
  let afterEntryId: string | undefined;
  for (;;) {
    const page = await listStatementMovementsPage(client, {
      tenantId,
      stallId,
      partyKind,
      partyId,
      fromBusinessDate,
      toBusinessDate,
      maxPostingSequence,
      limit: 500,
      afterBusinessDate,
      afterPostingSequence,
      afterEntryId,
    });
    for (const item of page.items) {
      amounts.push(item.amountMinor);
    }
    if (!page.hasMore) {
      break;
    }
    const last = page.items[page.items.length - 1];
    if (!last) {
      break;
    }
    afterBusinessDate = last.businessDate;
    afterPostingSequence = last.postingSequence;
    afterEntryId = last.entryId;
  }
  return amounts;
}

export async function loadAccountStatement(
  client: UserReportingClient,
  tenantId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  rawQuery: AccountStatementQuery,
  nowIso: string,
): Promise<AccountStatementResponse> {
  const query = accountStatementQuerySchema.parse(rawQuery);
  const { stallId } = stallBinding(tenantId);
  const party =
    partyKind === "farmer"
      ? await getFarmerDetail(client, tenantId, partyId, nowIso)
      : await getBuyerDetail(client, tenantId, partyId, nowIso);

  const fingerprint =
    query.movementSearch?.trim() || query.sourceTypeFilter?.trim()
      ? JSON.stringify({
          movementSearch: query.movementSearch?.trim() || null,
          sourceTypeFilter: query.sourceTypeFilter?.trim() || null,
        })
      : null;

  let cursorDecoded:
    | {
        snapshotToken: string;
        afterBusinessDate: string;
        afterPostingSequence: number;
        afterEntryId: string;
      }
    | undefined;
  if (query.cursor !== undefined) {
    try {
      cursorDecoded = decodeStatementPageCursor(query.cursor);
    } catch (error) {
      mapReportDomainError(error);
    }
  }

  const snapshotTokenInput = query.snapshotToken ?? cursorDecoded?.snapshotToken;
  const { payload, token } = await resolveStatementSnapshot({
    client,
    tenantId,
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
  const openingBalanceMinor = await sumStatementOpeningBalanceMinor(
    client,
    tenantId,
    stallId,
    partyKind,
    partyId,
    query.fromBusinessDate,
    maxPostingSequence,
  );
  const periodAmounts = await loadStatementPeriodAmounts(
    client,
    tenantId,
    partyKind,
    partyId,
    query.fromBusinessDate,
    query.toBusinessDate,
    maxPostingSequence,
  );
  const totals = computeStatementPeriodTotals(partyKind, openingBalanceMinor, periodAmounts);

  const page = await listStatementMovementsPage(client, {
    tenantId,
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
      partyCode: party.shortCode,
      partyDisplayName: party.displayName,
      accountRole: partyKind,
      currency: "LKR",
      fromBusinessDate: query.fromBusinessDate,
      toBusinessDate: query.toBusinessDate,
      dateBasis: query.dateBasis,
      openingStatus: "not_opened",
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
      movementCount: periodAmounts.length,
    },
    balanceBeforePageMinor: page.precedingBalanceMinor,
    items,
    nextCursor,
    snapshot: statementSnapshotMetadata(token, payload),
    rowFilterActive,
    rowFilterLabel: rowFilterActive
      ? "Movement search filter — period totals remain for the complete selected period."
      : null,
  });
}

export async function loadOutstandingObligations(
  client: UserReportingClient,
  tenantId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  rawQuery: OutstandingObligationsQuery,
  nowIso: string,
): Promise<OutstandingObligationsResponse> {
  const query = outstandingObligationsQuerySchema.parse(rawQuery);
  const { stallId } = stallBinding(tenantId);

  if (partyKind === "farmer") {
    await getFarmerDetail(client, tenantId, partyId, nowIso);
  } else {
    await getBuyerDetail(client, tenantId, partyId, nowIso);
  }

  const { payload, token } = await resolveStatementSnapshot({
    client,
    tenantId,
    partyKind,
    partyId,
    purpose: "outstanding",
    fromBusinessDate: null,
    toBusinessDate: null,
    asOfBusinessDate: query.asOfBusinessDate ?? null,
    filterFingerprint: null,
    snapshotToken: query.snapshotToken,
    nowIso,
  });

  const rows =
    partyKind === "trader"
      ? await listEligibleTraderBillObligations(client, tenantId, stallId, partyId)
      : await listEligibleFarmerSaleLineObligations(client, tenantId, stallId, partyId);

  const items = rows
    .filter((row) => row.remainingMinor > 0)
    .map((row) => ({
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
      relatedBillKind:
        row.documentKind === "trader_bill"
          ? ("trader_bill" as const)
          : row.documentKind === "farmer_bill"
            ? ("farmer_bill" as const)
            : null,
      relatedBillId: row.documentId,
      relatedBillNumber: row.documentNumber,
      correctionStatus: "active" as const,
      settlementStatus: settlementStatusForRemaining(row.effectiveAmountMinor, row.remainingMinor),
      label: row.label,
    }));

  const remainingObligationsMinor = items.reduce((sum, row) => sum + row.remainingMinor, 0);
  const accountBalanceMinor = await sumAccountBalanceAtWatermark(
    client,
    tenantId,
    stallId,
    partyKind,
    partyId,
    payload.watermarks.maxPostingSequence,
    query.asOfBusinessDate ?? undefined,
  );
  const unapplied = await listUnappliedPaymentsAtWatermark(
    client,
    tenantId,
    stallId,
    partyKind,
    partyId,
    payload.watermarks,
    query.asOfBusinessDate ?? undefined,
  );
  const unappliedPaymentsMinor = unapplied.reduce((sum, row) => sum + row.unappliedAmountMinor, 0);
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

  return outstandingObligationsResponseSchema.parse({
    partyKind,
    partyId,
    currency: "LKR",
    asOfBusinessDate: query.asOfBusinessDate ?? null,
    isHistorical: query.asOfBusinessDate !== undefined && query.asOfBusinessDate !== null,
    reconstructionBasis:
      query.asOfBusinessDate !== undefined && query.asOfBusinessDate !== null
        ? "effective_and_recording_cutoff"
        : "current_status",
    legacyReleaseTimestampLimitation: true,
    remainingObligationsMinor,
    unappliedPaymentsMinor,
    accountBalanceMinor,
    reconciliationNetMinor: reconciliation.reconciliationNetMinor,
    reconciliationOk: reconciliation.reconciliationOk,
    reconciliationDiagnostic: reconciliation.diagnostic,
    items: pageItems,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
    snapshot: statementSnapshotMetadata(token, payload),
  });
}

export async function assertPartyExists(
  client: UserReportingClient,
  tenantId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  nowIso: string,
): Promise<void> {
  try {
    if (partyKind === "farmer") {
      await getFarmerDetail(client, tenantId, partyId, nowIso);
    } else {
      await getBuyerDetail(client, tenantId, partyId, nowIso);
    }
  } catch {
    denyObfuscated();
  }
}