/**
 * Raised when a persisted row cannot be mapped to a domain/DTO value.
 * Callers must not replace invalid data with zeros or empty strings.
 */
export class RowMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowMappingError";
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RowMappingError(`Expected non-empty string for ${field}.`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new RowMappingError(`Expected string or null for ${field}.`);
  }
  return value;
}

export function requireInteger(value: unknown, field: string): number {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RowMappingError(`${field} is outside the safe integer range.`);
    }
    return Number(value);
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RowMappingError(`Expected integer for ${field}.`);
  }
  return value;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function requireCalendarDate(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!CALENDAR_DATE.test(text)) {
    throw new RowMappingError(`Invalid calendar date for ${field}.`);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new RowMappingError(`Invalid calendar date for ${field}.`);
  }
  return text;
}

/** Accept ISO-8601 timestamps with an explicit offset (including Z). */
export function requireAbsoluteTimestamp(value: unknown, field: string): string {
  const text = requireString(value, field);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    throw new RowMappingError(`Invalid absolute timestamp for ${field}.`);
  }
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) {
    throw new RowMappingError(`Absolute timestamp for ${field} must include a timezone offset.`);
  }
  return text;
}

export function requireBoolean01(value: unknown, field: string): boolean {
  const n = requireInteger(value, field);
  if (n !== 0 && n !== 1) {
    throw new RowMappingError(`Expected 0 or 1 for ${field}.`);
  }
  return n === 1;
}
