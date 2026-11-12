import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PaymentCommitKind = "post" | "allocate" | "reverse";
export type PaymentCommitPartyKind = "trader" | "farmer";
export type PaymentCommitDirection = "receive" | "pay";

/**
 * Minimal, secret-free metadata that lets the desktop recover an unknown payment outcome.
 * `payload` is the JSON-serializable request body that was (or will be) sent with the same
 * idempotency key, so a retry reuses the exact operation identity and content.
 */
export type PaymentCommitRecoveryRecord = {
  kind: PaymentCommitKind;
  idempotencyKey: string;
  startedAt: string;
  partyKind: PaymentCommitPartyKind | null;
  partyId: string | null;
  direction: PaymentCommitDirection | null;
  paymentId: string | null;
  previewFingerprint: string;
  payload: Record<string, unknown>;
};

function recoveryPath(): string {
  const dir = join(app.getPath("userData"), "billing-recovery");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "payment-commit-in-flight.json");
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

/** Validate and normalize an untrusted recovery record; returns null when invalid. */
export function parsePaymentCommitRecovery(value: unknown): PaymentCommitRecoveryRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<Record<keyof PaymentCommitRecoveryRecord, unknown>>;
  if (parsed.kind !== "post" && parsed.kind !== "allocate" && parsed.kind !== "reverse") {
    return null;
  }
  if (
    typeof parsed.idempotencyKey !== "string" ||
    parsed.idempotencyKey.length === 0 ||
    typeof parsed.startedAt !== "string" ||
    typeof parsed.previewFingerprint !== "string" ||
    !parsed.payload ||
    typeof parsed.payload !== "object" ||
    Array.isArray(parsed.payload)
  ) {
    return null;
  }
  const partyKind = nullableString(parsed.partyKind);
  const partyId = nullableString(parsed.partyId);
  const direction = nullableString(parsed.direction);
  const paymentId = nullableString(parsed.paymentId);
  if (
    partyKind === undefined ||
    partyId === undefined ||
    direction === undefined ||
    paymentId === undefined
  ) {
    return null;
  }
  if (partyKind !== null && partyKind !== "trader" && partyKind !== "farmer") {
    return null;
  }
  if (direction !== null && direction !== "receive" && direction !== "pay") {
    return null;
  }
  if (parsed.kind === "post" && (partyKind === null || partyId === null || direction === null)) {
    return null;
  }
  if ((parsed.kind === "allocate" || parsed.kind === "reverse") && paymentId === null) {
    return null;
  }
  return {
    kind: parsed.kind,
    idempotencyKey: parsed.idempotencyKey,
    startedAt: parsed.startedAt,
    partyKind,
    partyId,
    direction,
    paymentId,
    previewFingerprint: parsed.previewFingerprint,
    payload: parsed.payload as Record<string, unknown>,
  };
}

export function readPaymentCommitRecovery(): PaymentCommitRecoveryRecord | null {
  const path = recoveryPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parsePaymentCommitRecovery(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function writePaymentCommitRecovery(record: PaymentCommitRecoveryRecord): void {
  writeFileSync(recoveryPath(), `${JSON.stringify(record)}\n`, "utf8");
}

export function clearPaymentCommitRecovery(): void {
  const path = recoveryPath();
  if (existsSync(path)) {
    writeFileSync(path, "", "utf8");
  }
}
