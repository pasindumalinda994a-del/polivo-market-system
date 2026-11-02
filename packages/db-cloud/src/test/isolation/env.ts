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

/**
 * Resolve test env. Explicit POLIVO_CLOUD_TEST_* vars override local defaults.
 * Rejects obvious remote shared hosts unless POLIVO_CLOUD_TEST_ALLOW_REMOTE=1 (local lab only).
 */
export function resolveCloudTestEnv(
  source: Partial<Record<string, string | undefined>> = process.env,
): CloudTestEnv {
  const databaseUrl = source.POLIVO_CLOUD_TEST_DATABASE_URL?.trim() || LOCAL_DEFAULTS.databaseUrl;
  const supabaseUrl = source.POLIVO_CLOUD_TEST_SUPABASE_URL?.trim() || LOCAL_DEFAULTS.supabaseUrl;
  const publishableKey =
    source.POLIVO_CLOUD_TEST_PUBLISHABLE_KEY?.trim() || LOCAL_DEFAULTS.publishableKey;

  const allowRemote = source.POLIVO_CLOUD_TEST_ALLOW_REMOTE === "1";
  if (!allowRemote && /supabase\.co/i.test(databaseUrl + supabaseUrl)) {
    throw new Error(
      "Cloud isolation tests refuse supabase.co targets without POLIVO_CLOUD_TEST_ALLOW_REMOTE=1. Use local Supabase.",
    );
  }

  return { databaseUrl, supabaseUrl, publishableKey };
}
