import { DomainError, type WeightHundredths } from "./money.js";

/**
 * Net vegetable weight = gross − packaging.
 * Packaging defaults to zero when omitted by callers.
 */
export function netWeightHundredths(
  grossHundredths: WeightHundredths,
  packagingHundredths: WeightHundredths = 0,
): WeightHundredths {
  if (!Number.isSafeInteger(grossHundredths) || grossHundredths < 0) {
    throw new DomainError("INVALID_WEIGHT", "Gross weight must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(packagingHundredths) || packagingHundredths < 0) {
    throw new DomainError("INVALID_WEIGHT", "Packaging weight must be a non-negative safe integer");
  }
  if (packagingHundredths > grossHundredths) {
    throw new DomainError("NEGATIVE_NET_WEIGHT", "Packaging weight cannot exceed gross weight");
  }
  return grossHundredths - packagingHundredths;
}
