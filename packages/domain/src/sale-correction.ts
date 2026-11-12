import { DomainError, type MoneyMinor } from "./money.js";

/** Maximum length for correction/reversal reason text. */
export const SALE_CORRECTION_REASON_MAX_LENGTH = 500;

export type SaleCorrectionAction = "correct" | "reverse";

export type SaleCorrectionEligibilityCode =
  | "allowed"
  | "blocked_already_corrected"
  | "blocked_superseded"
  | "blocked_farmer_bill_inclusion"
  | "blocked_payment_allocation"
  | "blocked_not_finalized"
  | "blocked_inactive_reference"
  | "blocked_stale_revision"
  | "blocked_unsupported";

export type LedgerEffectPreview = {
  partyKind: "farmer" | "trader";
  partyId: string;
  amountMinor: MoneyMinor;
  reversesEntryId?: string;
};

/**
 * Normalize and validate a required correction/reversal reason.
 */
export function normalizeSaleCorrectionReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new DomainError("REASON_REQUIRED", "A correction reason is required");
  }
  if (trimmed.length > SALE_CORRECTION_REASON_MAX_LENGTH) {
    throw new DomainError(
      "REASON_TOO_LONG",
      `Correction reason must be at most ${SALE_CORRECTION_REASON_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/**
 * Canonical fingerprint material for correction/reversal preview stale-detection.
 * Callers hash this string (e.g. SHA-256) for transport.
 */
export function buildSaleCorrectionPreviewFingerprintMaterial(input: {
  action: SaleCorrectionAction;
  sourceSaleId: string;
  sourceRevision: number;
  reason: string;
  replacementPayload: unknown | null;
  reversalEffects: readonly LedgerEffectPreview[];
  replacementEffects: readonly LedgerEffectPreview[];
}): string {
  return JSON.stringify({
    action: input.action,
    sourceSaleId: input.sourceSaleId,
    sourceRevision: input.sourceRevision,
    reason: input.reason,
    replacementPayload: input.replacementPayload,
    reversalEffects: input.reversalEffects,
    replacementEffects: input.replacementEffects,
  });
}

/**
 * Verify original + reversal nets to zero per account key.
 */
export function assertExactReversalNet(
  originalEffects: readonly { partyKind: string; partyId: string; amountMinor: MoneyMinor }[],
  reversalEffects: readonly { partyKind: string; partyId: string; amountMinor: MoneyMinor }[],
): void {
  const nets = new Map<string, number>();
  for (const effect of originalEffects) {
    const key = `${effect.partyKind}:${effect.partyId}`;
    nets.set(key, (nets.get(key) ?? 0) + effect.amountMinor);
  }
  for (const effect of reversalEffects) {
    const key = `${effect.partyKind}:${effect.partyId}`;
    nets.set(key, (nets.get(key) ?? 0) + effect.amountMinor);
  }
  for (const [key, net] of nets) {
    if (net !== 0) {
      throw new DomainError(
        "REVERSAL_NET_NONZERO",
        `Reversal does not cancel original effects for ${key} (net ${net})`,
      );
    }
  }
}
