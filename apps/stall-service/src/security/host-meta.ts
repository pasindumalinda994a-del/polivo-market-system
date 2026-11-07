import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type HostMeta = {
  stallDisplayName: string;
};

export function hostMetaPath(credentialRoot: string): string {
  return join(credentialRoot, "host-meta.json");
}

export function writeHostMeta(credentialRoot: string, meta: HostMeta): void {
  mkdirSync(credentialRoot, { recursive: true });
  writeFileSync(hostMetaPath(credentialRoot), JSON.stringify(meta, null, 2), "utf8");
}

export function readHostMeta(credentialRoot: string): HostMeta | null {
  const path = hostMetaPath(credentialRoot);
  if (!existsSync(path)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<HostMeta>;
  if (typeof parsed.stallDisplayName !== "string" || parsed.stallDisplayName.trim().length === 0) {
    return null;
  }
  return { stallDisplayName: parsed.stallDisplayName.trim() };
}

export function resolveStallDisplayName(input: {
  credentialRoot: string;
  fallbackTenantId?: string | null;
}): string {
  const meta = readHostMeta(input.credentialRoot);
  if (meta) {
    return meta.stallDisplayName;
  }
  if (input.fallbackTenantId && input.fallbackTenantId.trim().length > 0) {
    return `Stall ${input.fallbackTenantId.trim()}`;
  }
  return "Polivo Stall";
}
