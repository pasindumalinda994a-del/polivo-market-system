import {
  sumAccountBalanceAtWatermark,
  captureReportingWatermarks,
  type LedgerPartyKind,
  type UserReportingClient,
} from "@polivo/db-cloud";

import { denyObfuscated, resourceUnavailable } from "./errors";
import { stallBinding } from "./client";

export type PartyListItem = {
  partyId: string;
  shortCode: string;
  displayName: string;
  isActive: boolean;
};

export async function listFarmers(
  client: UserReportingClient,
  tenantId: string,
): Promise<PartyListItem[]> {
  const { stallId } = stallBinding(tenantId);
  const { data, error } = await client
    .from("farmers")
    .select("id, short_code, display_name, is_active")
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .order("display_name", { ascending: true });

  if (error !== null) {
    throw new Error(`listFarmers: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    partyId: String(row.id),
    shortCode: String(row.short_code),
    displayName: String(row.display_name),
    isActive: row.is_active === true,
  }));
}

export async function listBuyers(
  client: UserReportingClient,
  tenantId: string,
): Promise<PartyListItem[]> {
  const { stallId } = stallBinding(tenantId);
  const { data, error } = await client
    .from("traders")
    .select("id, short_code, display_name, is_active")
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .order("display_name", { ascending: true });

  if (error !== null) {
    throw new Error(`listBuyers: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    partyId: String(row.id),
    shortCode: String(row.short_code),
    displayName: String(row.display_name),
    isActive: row.is_active === true,
  }));
}

export type PartyDetail = PartyListItem & {
  partyKind: LedgerPartyKind;
  balanceMinor: number;
  cutoffCapturedAt: string;
  maxPostingSequence: number;
};

export async function getFarmerDetail(
  client: UserReportingClient,
  tenantId: string,
  farmerId: string,
  nowIso: string,
): Promise<PartyDetail> {
  const { stallId } = stallBinding(tenantId);
  const { data, error } = await client
    .from("farmers")
    .select("id, short_code, display_name, is_active")
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", farmerId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`getFarmerDetail: ${error.message}`);
  }
  if (data === null) {
    denyObfuscated();
  }

  const watermarks = await captureReportingWatermarks(client, tenantId, stallId);
  const balanceMinor = await sumAccountBalanceAtWatermark(
    client,
    tenantId,
    stallId,
    "farmer",
    farmerId,
    watermarks.maxPostingSequence,
  );

  return {
    partyKind: "farmer",
    partyId: String(data.id),
    shortCode: String(data.short_code),
    displayName: String(data.display_name),
    isActive: data.is_active === true,
    balanceMinor,
    cutoffCapturedAt: nowIso,
    maxPostingSequence: watermarks.maxPostingSequence,
  };
}

export async function getBuyerDetail(
  client: UserReportingClient,
  tenantId: string,
  buyerId: string,
  nowIso: string,
): Promise<PartyDetail> {
  const { stallId } = stallBinding(tenantId);
  const { data, error } = await client
    .from("traders")
    .select("id, short_code, display_name, is_active")
    .eq("tenant_id", tenantId)
    .eq("stall_id", stallId)
    .eq("id", buyerId)
    .maybeSingle();

  if (error !== null) {
    throw new Error(`getBuyerDetail: ${error.message}`);
  }
  if (data === null) {
    denyObfuscated();
  }

  const watermarks = await captureReportingWatermarks(client, tenantId, stallId);
  const balanceMinor = await sumAccountBalanceAtWatermark(
    client,
    tenantId,
    stallId,
    "trader",
    buyerId,
    watermarks.maxPostingSequence,
  );

  return {
    partyKind: "trader",
    partyId: String(data.id),
    shortCode: String(data.short_code),
    displayName: String(data.display_name),
    isActive: data.is_active === true,
    balanceMinor,
    cutoffCapturedAt: nowIso,
    maxPostingSequence: watermarks.maxPostingSequence,
  };
}

export function loadPartyKindFromRoute(partyKind: string): LedgerPartyKind {
  if (partyKind === "farmer") {
    return "farmer";
  }
  if (partyKind === "trader" || partyKind === "buyer") {
    return "trader";
  }
  resourceUnavailable();
}
