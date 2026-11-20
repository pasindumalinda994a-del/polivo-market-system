import type { UserReportingClient } from "@polivo/db-cloud";

import { denyObfuscated } from "./errors";
import { stallBinding } from "./client";

type UntypedBillRow = {
  id: string;
  bill_number: string | null;
  business_date: string | null;
  status: string;
  correction_status?: string | null;
  trader_id?: string;
  farmer_id?: string;
  total_amount_minor: string | number | null;
};

export type BillDetail = {
  billKind: "trader_bill" | "farmer_bill";
  billId: string;
  billNumber: string | null;
  businessDate: string | null;
  status: string;
  correctionStatus: string | null;
  partyId: string;
  totalAmountMinor: number | null;
};

export type PaymentDetail = {
  paymentId: string;
  referenceNumber: string;
  businessDate: string;
  status: string;
  method: string;
  direction: string;
  amountMinor: number;
  farmerId: string | null;
  traderId: string | null;
  recordedAt: string;
};

function legacyClient(client: UserReportingClient): {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (
            column: string,
            value: string,
          ) => {
            maybeSingle: () => Promise<{
              data: UntypedBillRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
} {
  return client as unknown as ReturnType<typeof legacyClient>;
}

export async function loadBillDetail(
  client: UserReportingClient,
  tenantId: string,
  billKind: "trader_bill" | "farmer_bill",
  billId: string,
): Promise<BillDetail> {
  const { stallId } = stallBinding(tenantId);
  const table = billKind === "trader_bill" ? "trader_bills" : "farmer_bills";
  const select =
    billKind === "trader_bill"
      ? "id, bill_number, business_date, status, correction_status, trader_id, total_amount_minor"
      : "id, bill_number, business_date, status, farmer_id, total_amount_minor";

  const { data, error } = await legacyClient(client)
    .from(table)
    .select(select)
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", billId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`loadBillDetail: ${error.message}`);
  }
  if (data === null) {
    denyObfuscated();
  }

  const partyId =
    billKind === "trader_bill" ? String(data.trader_id ?? "") : String(data.farmer_id ?? "");
  const total =
    data.total_amount_minor === null
      ? null
      : typeof data.total_amount_minor === "string"
        ? Number.parseInt(data.total_amount_minor, 10)
        : data.total_amount_minor;

  return {
    billKind,
    billId: String(data.id),
    billNumber: data.bill_number,
    businessDate: data.business_date,
    status: data.status,
    correctionStatus: data.correction_status ?? null,
    partyId,
    totalAmountMinor: total,
  };
}

export async function loadPaymentDetail(
  client: UserReportingClient,
  tenantId: string,
  paymentId: string,
): Promise<PaymentDetail> {
  const { stallId } = stallBinding(tenantId);
  const { data, error } = await client
    .from("payments")
    .select("id, party_kind, farmer_id, trader_id, method, amount_minor, paid_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", paymentId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`loadPaymentDetail: ${error.message}`);
  }
  if (data === null) {
    denyObfuscated();
  }

  const amountMinor = Number.parseInt(String(data.amount_minor), 10);
  return {
    paymentId: data.id,
    referenceNumber: data.id,
    businessDate: data.paid_at.slice(0, 10),
    status: "posted",
    method: data.method,
    direction: data.party_kind === "farmer" ? "pay" : "receive",
    amountMinor,
    farmerId: data.farmer_id,
    traderId: data.trader_id,
    recordedAt: data.created_at,
  };
}