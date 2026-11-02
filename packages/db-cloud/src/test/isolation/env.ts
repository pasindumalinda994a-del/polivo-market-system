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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function hostnameFromUrl(raw: string, label: string): string {
  try {
    // postgres:// URLs are valid WHATWG URLs in Node.
    return new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`Cloud isolation tests: invalid ${label} URL.`);
  }
}

function assertLoopbackUrl(raw: string, label: string): void {
  const hostname = hostnameFromUrl(raw, label);
  if (!LOOPBACK_HOSTS.has(hostname)) {
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

  const allowRemote = source.POLIVO_CLOUD_TEST_ALLOW_REMOTE === "1";
  if (!allowRemote) {
    assertLoopbackUrl(databaseUrl, "POLIVO_CLOUD_TEST_DATABASE_URL");
    assertLoopbackUrl(supabaseUrl, "POLIVO_CLOUD_TEST_SUPABASE_URL");
  }

  return { databaseUrl, supabaseUrl, publishableKey };
}
