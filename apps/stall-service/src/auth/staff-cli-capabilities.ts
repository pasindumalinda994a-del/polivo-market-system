const CAPABILITIES_ARGV_HINT =
  'Pass capabilities as a JSON array of strings. On PowerShell with pnpm use escaped quotes, e.g. "[\\"bills.create\\"]". Avoid single-quoted JSON through pnpm (inner quotes are often stripped). See docs/operations/local-staff-authentication-and-offline-access.md.';

/**
 * Parse staff-cli capabilities argv.
 * Prefers valid JSON arrays; recovers shell-mangled `[cap1,cap2]` / `cap1,cap2` forms.
 * Capability id validity is still enforced by areKnownCapabilities in admin paths.
 */
export function parseCapabilitiesArgv(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error(`Capabilities must be a JSON array of strings. ${CAPABILITIES_ARGV_HINT}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Capabilities must be")) {
      throw error;
    }
  }

  let body = trimmed;
  if (body.startsWith("[") && body.endsWith("]")) {
    body = body.slice(1, -1).trim();
  }
  if (!body) {
    return [];
  }

  const capabilities = body
    .split(",")
    .map((part) => {
      const token = part.trim();
      if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        return token.slice(1, -1).trim();
      }
      return token;
    })
    .filter((token) => token.length > 0);

  if (
    capabilities.length === 0 ||
    capabilities.some((cap) => /[\[\]{}\s"]/.test(cap))
  ) {
    throw new Error(`Could not parse capabilities argument. ${CAPABILITIES_ARGV_HINT}`);
  }

  return capabilities;
}
