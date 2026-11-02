/**
 * Server-side cloud database configuration validation.
 * Never logs secret values. Does not fall back to privileged credentials.
 */

export class CloudConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudConfigError";
  }
}

export type UserCloudConfig = {
  /** Supabase project URL (public). */
  supabaseUrl: string;
  /** Publishable / anon key for user-context Data API access (public). */
  supabasePublishableKey: string;
};

const URL_NAME = "NEXT_PUBLIC_SUPABASE_URL";
const PUBLISHABLE_KEY_NAME = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

function requireNonEmpty(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new CloudConfigError(`Missing required cloud configuration: ${name}.`);
  }
  return value.trim();
}

/**
 * Resolve user-context Supabase configuration from an explicit bag or process.env.
 * Reports missing variable *names* only — never values.
 */
export function loadUserCloudConfig(
  source: Partial<Record<string, string | undefined>> = process.env,
): UserCloudConfig {
  const supabaseUrl = requireNonEmpty(URL_NAME, source[URL_NAME]);
  const supabasePublishableKey = requireNonEmpty(
    PUBLISHABLE_KEY_NAME,
    source[PUBLISHABLE_KEY_NAME],
  );

  if (!/^https?:\/\//i.test(supabaseUrl)) {
    throw new CloudConfigError(`${URL_NAME} must be an http(s) URL.`);
  }

  return { supabaseUrl, supabasePublishableKey };
}

export const USER_CLOUD_ENV_NAMES = {
  url: URL_NAME,
  publishableKey: PUBLISHABLE_KEY_NAME,
} as const;

/** Documented server-only names (phase 11/12). Not used by the user-context factory. */
export const SERVER_ONLY_CLOUD_ENV_NAMES = {
  secretKey: "SUPABASE_SECRET_KEY",
  databaseUrl: "DATABASE_URL",
} as const;
