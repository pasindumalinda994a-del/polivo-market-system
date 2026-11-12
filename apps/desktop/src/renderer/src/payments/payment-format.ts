import type {
  EligibleObligationItemDto,
  PaymentAllocationInput,
  PaymentDirectionDto,
  PaymentPartyKindDto,
  PaymentPreviewResponse,
} from "@polivo/contracts";

export type PaymentAllocationPreviewDto = PaymentPreviewResponse["allocations"][number];

const MAJOR_AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a typed major-unit amount ("250.5") into integer paisa; null when invalid or not positive. */
export function parseMajorAmountToMinor(text: string): number | null {
  const trimmed = text.trim();
  if (!MAJOR_AMOUNT_PATTERN.test(trimmed)) {
    return null;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Format integer paisa for an editable input (no currency prefix). */
export function formatMinorForInput(minor: number): string {
  const abs = Math.abs(minor);
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatRs(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}Rs. ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function isCalendarDate(text: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(text)) {
    return false;
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

export function directionForParty(partyKind: PaymentPartyKindDto): PaymentDirectionDto {
  return partyKind === "trader" ? "receive" : "pay";
}

export function partyKindForDirection(direction: PaymentDirectionDto): PaymentPartyKindDto {
  return direction === "receive" ? "trader" : "farmer";
}

export function directionLabel(direction: PaymentDirectionDto): string {
  return direction === "receive" ? "Receive from buyer" : "Pay farmer";
}

export function methodLabel(method: string): string {
  if (method === "bank_transfer") {
    return "Bank transfer";
  }
  if (method === "cheque") {
    return "Cheque";
  }
  if (method === "cash") {
    return "Cash";
  }
  return method;
}

/** Explicit ledger-direction wording (ADR 0014): never a bare signed number. */
export function accountBalanceLabel(partyKind: PaymentPartyKindDto, balanceMinor: number): string {
  if (balanceMinor === 0) {
    return "Settled";
  }
  if (partyKind === "farmer") {
    return balanceMinor > 0 ? "Stall owes farmer" : "Farmer owes stall";
  }
  return balanceMinor > 0 ? "Buyer owes stall" : "Stall owes buyer";
}

export function obligationKey(kind: string, targetId: string): string {
  return `${kind}:${targetId}`;
}

export function obligationKindLabel(kind: EligibleObligationItemDto["obligationKind"]): string {
  switch (kind) {
    case "trader_bill":
      return "Buyer bill";
    case "farmer_sale_line":
      return "Farmer sale line";
    case "opening_balance":
      return "Opening balance";
  }
}

/** Build the strict allocation request shape from preview rows (no null optional fields). */
export function allocationsFromPreview(
  rows: readonly PaymentAllocationPreviewDto[],
): PaymentAllocationInput[] {
  return rows.map((row) => ({
    obligationKind: row.obligationKind,
    targetId: row.targetId,
    appliedAmountMinor: row.appliedAmountMinor,
    ...(row.farmerBillId !== null ? { farmerBillId: row.farmerBillId } : {}),
  }));
}

export type AllocationEntry = {
  item: EligibleObligationItemDto;
  appliedMinor: number | null;
  error: string | null;
};

/** Resolve typed allocation amounts against obligation remainders with inline validation. */
export function resolveAllocationEntries(
  obligations: readonly EligibleObligationItemDto[],
  amounts: Readonly<Record<string, string>>,
): AllocationEntry[] {
  const entries: AllocationEntry[] = [];
  for (const item of obligations) {
    const key = obligationKey(item.obligationKind, item.targetId);
    const text = amounts[key];
    if (text === undefined) {
      continue;
    }
    const minor = parseMajorAmountToMinor(text);
    let error: string | null = null;
    if (minor === null) {
      error = "Enter an amount greater than zero (up to two decimals).";
    } else if (minor > item.remainingMinor) {
      error = `Cannot exceed outstanding ${formatRs(item.remainingMinor)}.`;
    }
    entries.push({ item, appliedMinor: minor, error });
  }
  return entries;
}

export function toAllocationInputs(entries: readonly AllocationEntry[]): PaymentAllocationInput[] {
  return entries.map((entry) => ({
    obligationKind: entry.item.obligationKind,
    targetId: entry.item.targetId,
    appliedAmountMinor: entry.appliedMinor ?? 0,
    ...(entry.item.farmerBillId !== null ? { farmerBillId: entry.item.farmerBillId } : {}),
  }));
}

export function sumApplied(entries: readonly AllocationEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.appliedMinor ?? 0), 0);
}
