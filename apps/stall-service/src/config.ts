import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type StallServiceConfig = {
  host: string;
  port: number;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3040;

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

function parseHost(raw: string | undefined): string {
  if (raw === undefined) {
    return DEFAULT_HOST;
  }

  const host = raw.toLowerCase();
  const allowedLoopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

  if (!allowedLoopbackHosts.has(host)) {
    throw new Error(
      `Invalid HOST "${raw}". Development defaults bind to loopback only (127.0.0.1, localhost, or ::1). Explicit non-loopback hosts are not enabled in this phase.`,
    );
  }

  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): StallServiceConfig {
  if (env === process.env) {
    loadDotEnvFile();
  }

  return {
    host: parseHost(readOptionalEnv(env, "HOST")),
    port: parsePort(readOptionalEnv(env, "PORT")),
  };
}
