/**
 * Local disposable Supabase connection settings for isolation tests.
 * Never falls back to a shared staging/production project.
 */

export type CloudTestEnv = {
  databaseUrl: string;
  supabaseUrl: string;
  publishableKey: string;
};

const LOCAL_DEFAULTS: CloudTestEnv = {
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  supabaseUrl: "http://127.0.0.1:54321",
  publishableKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower.startsWith("[") && lower.endsWith("]")) {
    return lower.slice(1, -1);
  }
  return lower;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    LOOPBACK_HOSTS.has(hostname.toLowerCase()) ||
    LOOPBACK_HOSTS.has(normalized) ||
    LOOPBACK_HOSTS.has(`[${normalized}]`)
  );
}

function parseUrl(raw: string, label: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`Cloud isolation tests: invalid ${label} URL.`);
  }
}

/** Authority hostname for HTTP(S) Supabase URLs. */
function authorityHostname(raw: string, label: string): string {
  return parseUrl(raw, label).hostname;
}

/**
 * Effective Postgres connect host: query `host` overrides authority when present
 * (libpq / node-pg behavior). Strip IPv6 brackets from the query value.
 * Duplicate `host` query params are rejected — `URLSearchParams.get` returns the
 * first value while libpq uses the last, which would bypass a loopback-first guard.
 */
export function effectivePostgresHostname(raw: string): string {
  const url = parseUrl(raw, "POLIVO_CLOUD_TEST_DATABASE_URL");
  const queryHosts = url.searchParams
    .getAll("host")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  if (queryHosts.length > 1) {
    throw new Error(
      "Cloud isolation tests refuse POLIVO_CLOUD_TEST_DATABASE_URL with duplicate host query parameters. Use a single unambiguous host.",
    );
  }
  const queryHost = queryHosts[0];
  if (queryHost !== undefined) {
    return normalizeHostname(queryHost);
  }
  return normalizeHostname(url.hostname);
}

function assertLoopbackHostname(hostname: string, label: string): void {
  if (!isLoopbackHostname(hostname)) {
    throw new Error(
      `Cloud isolation tests refuse non-loopback ${label} (${hostname}) without POLIVO_CLOUD_TEST_ALLOW_REMOTE=1. Use local Supabase or embedded Postgres.`,
    );
  }
}

/**
 * Resolve test env. Explicit POLIVO_CLOUD_TEST_* vars override local defaults.
 * Without POLIVO_CLOUD_TEST_ALLOW_REMOTE=1, only loopback hosts are accepted
 * (prevents destructive TRUNCATE against shared/remote databases).
 */
export function resolveCloudTestEnv(
  source: Partial<Record<string, string | undefined>> = process.env,
): CloudTestEnv {
  const databaseUrl = source.POLIVO_CLOUD_TEST_DATABASE_URL?.trim() || LOCAL_DEFAULTS.databaseUrl;
  const supabaseUrl = source.POLIVO_CLOUD_TEST_SUPABASE_URL?.trim() || LOCAL_DEFAULTS.supabaseUrl;
  const publishableKey =
    source.POLIVO_CLOUD_TEST_PUBLISHABLE_KEY?.trim() || LOCAL_DEFAULTS.publishableKey;

  // Always resolve DB host (rejects duplicate host query params even when allow-remote).
  const effectiveDbHost = effectivePostgresHostname(databaseUrl);

  const allowRemote = source.POLIVO_CLOUD_TEST_ALLOW_REMOTE === "1";
  if (!allowRemote) {
    assertLoopbackHostname(effectiveDbHost, "POLIVO_CLOUD_TEST_DATABASE_URL");
    assertLoopbackHostname(
      authorityHostname(supabaseUrl, "POLIVO_CLOUD_TEST_SUPABASE_URL"),
      "POLIVO_CLOUD_TEST_SUPABASE_URL",
    );
  }

  return { databaseUrl, supabaseUrl, publishableKey };
}
