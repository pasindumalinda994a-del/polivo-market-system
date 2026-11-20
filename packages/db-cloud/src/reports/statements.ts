import { moneyMinorFromPg } from "../numeric.js";
import {
  mapEligibleObligationRow,
  mapStatementMovementRow,
  mapUnappliedPaymentRow,
} from "./mappers.js";
import { assertRpcOk, type UserReportingClient } from "./rpc.js";
import type {
  EligibleObligationRow,
  LedgerPartyKind,
  ListStatementMovementsInput,
  ListStatementMovementsResult,
  ReportingWatermarks,
  UnappliedPaymentRow,
} from "./types.js";

export async function sumAccountBalanceAtWatermark(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  maxPostingSequence: number,
  asOfBusinessDate?: string,
): Promise<number> {
  const data = assertRpcOk(
    "sum_account_balance_at_watermark",
    await client.rpc("sum_account_balance_at_watermark", {
      p_tenant_id: tenantId,
      p_stall_id: stallId,
      p_party_kind: partyKind,
      p_party_id: partyId,
      p_max_posting_sequence: maxPostingSequence,
      p_as_of_business_date: asOfBusinessDate ?? null,
    }),
  );
  return moneyMinorFromPg(data as number | string);
}

export async function sumStatementOpeningBalanceMinor(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  fromBusinessDate: string,
  maxPostingSequence: number,
): Promise<number> {
  const data = assertRpcOk(
    "sum_statement_opening_balance",
    await client.rpc("sum_statement_opening_balance", {
      p_tenant_id: tenantId,
      p_stall_id: stallId,
      p_party_kind: partyKind,
      p_party_id: partyId,
      p_from_business_date: fromBusinessDate,
      p_max_posting_sequence: maxPostingSequence,
    }),
  );
  return moneyMinorFromPg(data as number | string);
}

export async function sumBalanceBeforeStatementPage(
  client: UserReportingClient,
  input: {
    tenantId: string;
    stallId: string;
    partyKind: LedgerPartyKind;
    partyId: string;
    fromBusinessDate: string;
    toBusinessDate: string;
    maxPostingSequence: number;
    afterBusinessDate?: string;
    afterPostingSequence?: number;
    afterEntryId?: string;
  },
): Promise<number> {
  const data = assertRpcOk(
    "sum_balance_before_statement_page",
    await client.rpc("sum_balance_before_statement_page", {
      p_tenant_id: input.tenantId,
      p_stall_id: input.stallId,
      p_party_kind: input.partyKind,
      p_party_id: input.partyId,
      p_from_business_date: input.fromBusinessDate,
      p_to_business_date: input.toBusinessDate,
      p_max_posting_sequence: input.maxPostingSequence,
      p_after_business_date: input.afterBusinessDate ?? null,
      p_after_posting_sequence: input.afterPostingSequence ?? null,
      p_after_entry_id: input.afterEntryId ?? null,
    }),
  );
  return moneyMinorFromPg(data as number | string);
}

export async function listStatementMovementsPage(
  client: UserReportingClient,
  input: ListStatementMovementsInput,
): Promise<ListStatementMovementsResult> {
  const opening = await sumStatementOpeningBalanceMinor(
    client,
    input.tenantId,
    input.stallId,
    input.partyKind,
    input.partyId,
    input.fromBusinessDate,
    input.maxPostingSequence,
  );
  const beforePage = await sumBalanceBeforeStatementPage(client, {
    tenantId: input.tenantId,
    stallId: input.stallId,
    partyKind: input.partyKind,
    partyId: input.partyId,
    fromBusinessDate: input.fromBusinessDate,
    toBusinessDate: input.toBusinessDate,
    maxPostingSequence: input.maxPostingSequence,
    afterBusinessDate: input.afterBusinessDate,
    afterPostingSequence: input.afterPostingSequence,
    afterEntryId: input.afterEntryId,
  });
  const precedingBalanceMinor = opening + beforePage;

  const data = assertRpcOk(
    "list_statement_movements_page",
    await client.rpc("list_statement_movements_page", {
      p_tenant_id: input.tenantId,
      p_stall_id: input.stallId,
      p_party_kind: input.partyKind,
      p_party_id: input.partyId,
      p_from_business_date: input.fromBusinessDate,
      p_to_business_date: input.toBusinessDate,
      p_max_posting_sequence: input.maxPostingSequence,
      p_limit: input.limit,
      p_after_business_date: input.afterBusinessDate ?? null,
      p_after_posting_sequence: input.afterPostingSequence ?? null,
      p_after_entry_id: input.afterEntryId ?? null,
      p_movement_search: input.movementSearch ?? null,
      p_source_type_filter: input.sourceTypeFilter ?? null,
    }),
  );
  const rows = data as Record<string, unknown>[];
  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  return {
    precedingBalanceMinor,
    items: pageRows.map(mapStatementMovementRow),
    hasMore,
  };
}

export async function listUnappliedPaymentsAtWatermark(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  partyKind: LedgerPartyKind,
  partyId: string,
  watermarks: ReportingWatermarks,
  asOfBusinessDate?: string,
): Promise<UnappliedPaymentRow[]> {
  const data = assertRpcOk(
    "list_unapplied_payments_at_watermark",
    await client.rpc("list_unapplied_payments_at_watermark", {
      p_tenant_id: tenantId,
      p_stall_id: stallId,
      p_party_kind: partyKind,
      p_party_id: partyId,
      p_max_payment_recorded_at: watermarks.maxPaymentRecordedAt,
      p_max_payment_id: watermarks.maxPaymentId,
      p_max_allocation_created_at: watermarks.maxAllocationCreatedAt,
      p_max_allocation_id: watermarks.maxAllocationId,
      p_as_of_business_date: asOfBusinessDate ?? null,
    }),
  );
  return (data as Record<string, unknown>[]).map(mapUnappliedPaymentRow);
}

export async function listEligibleTraderBillObligations(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  traderId: string,
): Promise<EligibleObligationRow[]> {
  const data = assertRpcOk(
    "list_eligible_trader_bill_obligations",
    await client.rpc("list_eligible_trader_bill_obligations", {
      p_tenant_id: tenantId,
      p_stall_id: stallId,
      p_trader_id: traderId,
    }),
  );
  return (data as Record<string, unknown>[]).map(mapEligibleObligationRow);
}

export async function listEligibleFarmerSaleLineObligations(
  client: UserReportingClient,
  tenantId: string,
  stallId: string,
  farmerId: string,
): Promise<EligibleObligationRow[]> {
  const data = assertRpcOk(
    "list_eligible_farmer_sale_line_obligations",
    await client.rpc("list_eligible_farmer_sale_line_obligations", {
      p_tenant_id: tenantId,
      p_stall_id: stallId,
      p_farmer_id: farmerId,
    }),
  );
  return (data as Record<string, unknown>[]).map(mapEligibleObligationRow);
}
