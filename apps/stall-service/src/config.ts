import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { requireAbsoluteDatabasePath } from "@polivo/db-local";

export type ListenMode = "loopback" | "lan";

export type StallServiceConfig = {
  listenMode: ListenMode;
  host: string;
  port: number;
  databasePath: string;
  /** Root directory for host device credentials and TLS material. */
  credentialRoot: string;
  tlsKeyPath: string | null;
  tlsCertPath: string | null;
  /** Cloud ingest endpoint for the local outbox worker (Phase 32). */
  syncIngestUrl: string | null;
  /** Development-only: allow http:// ingest URLs. */
  syncAllowInsecureHttp: boolean;
  /** Cloud configuration pull endpoint (Phase 33). */
  configPullUrl: string | null;
  /** Cloud configuration acknowledgement endpoint (Phase 33). */
  configAckUrl: string | null;
  /** Cloud stream progress lookup (Phase 34). */
  syncProgressUrl: string | null;
  /** Cloud receipt lookup (Phase 34). */
  syncReceiptsUrl: string | null;
  /** Cloud fact summary for reconciliation (Phase 34). */
  syncFactSummaryUrl: string | null;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3040;
const DEFAULT_LISTEN_MODE: ListenMode = "loopback";

function loadDotEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  process.loadEnvFile(envPath);
}

function readOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid PORT "${raw}". Expected an integer between 1 and 65535.`);
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}". Expected an integer between 1 and 65535.`);
  }

  return port;
}

function parseListenMode(raw: string | undefined): ListenMode {
  if (raw === undefined) {
    return DEFAULT_LISTEN_MODE;
  }
  const mode = raw.trim().toLowerCase();
  if (mode === "loopback" || mode === "lan") {
    return mode;
  }
  throw new Error(`Invalid POLIVO_LISTEN_MODE "${raw}". Expected "loopback" (default) or "lan".`);
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function parseHost(raw: string | undefined, listenMode: ListenMode): string {
  if (raw === undefined) {
    if (listenMode === "lan") {
      throw new Error(
        "LAN mode requires an explicit HOST bind address (for example the stall host LAN IPv4). Do not use 0.0.0.0 unless you intentionally expose every interface and have scoped firewall rules.",
      );
    }
    return DEFAULT_HOST;
  }

  const host = raw.trim();
  if (listenMode === "loopback") {
    if (!isLoopbackHost(host)) {
      throw new Error(
        `Invalid HOST "${raw}" for loopback mode. Use 127.0.0.1, localhost, or ::1 — or set POLIVO_LISTEN_MODE=lan with a validated LAN bind address.`,
      );
    }
    return host;
  }

  // LAN mode: reject unspecified empty; allow concrete addresses including 0.0.0.0 with ops warning in docs.
  if (isLoopbackHost(host)) {
    throw new Error(
      `Invalid HOST "${raw}" for LAN mode. Provide the host's LAN address (or 0.0.0.0 only when firewall scope is intentional).`,
    );
  }
  if (host.length === 0 || host.length > 253) {
    throw new Error(`Invalid HOST "${raw}".`);
  }
  return host;
}

function parseDatabasePath(raw: string | undefined): string {
  if (raw === undefined) {
    throw new Error(
      "POLIVO_LOCAL_DB_PATH is required. Set an absolute path to the stall SQLite database file (outside the repository).",
    );
  }

  return requireAbsoluteDatabasePath(raw);
}

function parseCredentialRoot(raw: string | undefined): string {
  if (raw === undefined) {
    return join(homedir(), ".polivo", "host-credentials");
  }
  const trimmed = raw.trim();
  if (!isAbsolute(trimmed)) {
    throw new Error(`POLIVO_HOST_CREDENTIAL_ROOT must be an absolute path (got "${raw}").`);
  }
  return resolve(trimmed);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): StallServiceConfig {
  if (env === process.env) {
    loadDotEnvFile();
  }

  const listenMode = parseListenMode(readOptionalEnv(env, "POLIVO_LISTEN_MODE"));
  const tlsKeyPath = readOptionalEnv(env, "POLIVO_TLS_KEY_PATH") ?? null;
  const tlsCertPath = readOptionalEnv(env, "POLIVO_TLS_CERT_PATH") ?? null;

  if ((tlsKeyPath === null) !== (tlsCertPath === null)) {
    throw new Error(
      "POLIVO_TLS_KEY_PATH and POLIVO_TLS_CERT_PATH must both be set, or both omitted so the service can manage TLS material under the credential root.",
    );
  }

  if (listenMode === "lan" && tlsKeyPath === null) {
    // Auto-managed material is still allowed; explicit failure happens if generation/load fails at startup.
  }

  const syncIngestUrl = readOptionalEnv(env, "POLIVO_SYNC_INGEST_URL") ?? null;
  const syncAllowInsecureHttp =
    (readOptionalEnv(env, "POLIVO_SYNC_ALLOW_INSECURE_HTTP") ?? "").toLowerCase() === "1" ||
    (readOptionalEnv(env, "POLIVO_SYNC_ALLOW_INSECURE_HTTP") ?? "").toLowerCase() === "true";

  const assertServiceUrl = (raw: string, name: string): void => {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`Invalid ${name} "${raw}".`);
    }
    if (parsed.protocol === "http:" && !syncAllowInsecureHttp) {
      throw new Error(
        `${name} uses http://. Set POLIVO_SYNC_ALLOW_INSECURE_HTTP=1 only for local development.`,
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`${name} must be an http(s) URL.`);
    }
  };

  if (syncIngestUrl) {
    assertServiceUrl(syncIngestUrl, "POLIVO_SYNC_INGEST_URL");
  }

  let configPullUrl = readOptionalEnv(env, "POLIVO_CONFIG_PULL_URL") ?? null;
  let configAckUrl = readOptionalEnv(env, "POLIVO_CONFIG_ACK_URL") ?? null;
  if (!configPullUrl && syncIngestUrl) {
    try {
      const ingest = new URL(syncIngestUrl);
      configPullUrl = new URL("/api/config/pull", ingest.origin).toString();
      configAckUrl = configAckUrl ?? new URL("/api/config/ack", ingest.origin).toString();
    } catch {
      // leave unset; sync URL already validated above
    }
  } else if (configPullUrl && !configAckUrl) {
    try {
      const pull = new URL(configPullUrl);
      configAckUrl = new URL("/api/config/ack", pull.origin).toString();
    } catch {
      // validated below
    }
  }

  if (configPullUrl) {
    assertServiceUrl(configPullUrl, "POLIVO_CONFIG_PULL_URL");
  }
  if (configAckUrl) {
    assertServiceUrl(configAckUrl, "POLIVO_CONFIG_ACK_URL");
  }

  let syncProgressUrl = readOptionalEnv(env, "POLIVO_SYNC_PROGRESS_URL") ?? null;
  let syncReceiptsUrl = readOptionalEnv(env, "POLIVO_SYNC_RECEIPTS_URL") ?? null;
  let syncFactSummaryUrl = readOptionalEnv(env, "POLIVO_SYNC_FACT_SUMMARY_URL") ?? null;
  if (syncIngestUrl) {
    try {
      const ingest = new URL(syncIngestUrl);
      syncProgressUrl =
        syncProgressUrl ?? new URL("/api/sync/progress", ingest.origin).toString();
      syncReceiptsUrl =
        syncReceiptsUrl ?? new URL("/api/sync/receipts", ingest.origin).toString();
      syncFactSummaryUrl =
        syncFactSummaryUrl ?? new URL("/api/sync/fact-summary", ingest.origin).toString();
    } catch {
      // ingest URL already validated
    }
  }
  if (syncProgressUrl) {
    assertServiceUrl(syncProgressUrl, "POLIVO_SYNC_PROGRESS_URL");
  }
  if (syncReceiptsUrl) {
    assertServiceUrl(syncReceiptsUrl, "POLIVO_SYNC_RECEIPTS_URL");
  }
  if (syncFactSummaryUrl) {
    assertServiceUrl(syncFactSummaryUrl, "POLIVO_SYNC_FACT_SUMMARY_URL");
  }

  return {
    listenMode,
    host: parseHost(readOptionalEnv(env, "HOST"), listenMode),
    port: parsePort(readOptionalEnv(env, "PORT")),
    databasePath: parseDatabasePath(readOptionalEnv(env, "POLIVO_LOCAL_DB_PATH")),
    credentialRoot: parseCredentialRoot(readOptionalEnv(env, "POLIVO_HOST_CREDENTIAL_ROOT")),
    tlsKeyPath,
    tlsCertPath,
    syncIngestUrl,
    syncAllowInsecureHttp,
    configPullUrl,
    configAckUrl,
    syncProgressUrl,
    syncReceiptsUrl,
    syncFactSummaryUrl,
  };
}
