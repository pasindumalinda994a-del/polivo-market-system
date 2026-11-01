/**
 * Deterministic canonical JSON for request fingerprinting.
 * Sorts object keys recursively. Does not include correlation IDs or timestamps
 * unless they are part of the validated command meaning.
 */
export function canonicalizeForFingerprint(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    sorted[key] = sortValue(record[key]);
  }
  return sorted;
}

export function buildCommandFingerprint(input: {
  commandType: string;
  commandVersion: string;
  validatedInput: unknown;
  semanticContext?: Record<string, unknown>;
}): string {
  return canonicalizeForFingerprint({
    commandType: input.commandType,
    commandVersion: input.commandVersion,
    input: input.validatedInput,
    ...(input.semanticContext !== undefined ? { context: input.semanticContext } : {}),
  });
}
