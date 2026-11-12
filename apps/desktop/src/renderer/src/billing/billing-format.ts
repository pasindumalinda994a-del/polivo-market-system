import { weightHundredthsToMajorDecimalString } from "@polivo/domain";

/** Format integer paisa as a major-unit decimal string (e.g. 25050 → "250.50"). */
export function formatMoneyMinor(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function formatWeightHundredths(hundredths: number): string {
  return `${weightHundredthsToMajorDecimalString(hundredths)} kg`;
}

export function todayCalendarDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
