export class CloudReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudReportError";
  }
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CloudReportError(`${label} must be a non-empty string.`);
  }
  return value;
}

export function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new CloudReportError(`${label} must be a string when present.`);
  }
  return value.length === 0 ? null : value;
}

export function requireAbsoluteTimestamp(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw new CloudReportError(`${label} must be an ISO-8601 timestamp.`);
  }
  return text;
}

export function requireCalendarDate(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new CloudReportError(`${label} must be YYYY-MM-DD.`);
  }
  return text;
}

export function requireInteger(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new CloudReportError(`${label} must be an integer.`);
}

export function optionalAbsoluteTimestamp(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requireAbsoluteTimestamp(value, label);
}