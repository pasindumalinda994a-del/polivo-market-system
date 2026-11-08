import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

import type { LocalDatabase } from "@polivo/db-local";

import {
  productionFailClosedAuthorization,
  type AuthorizationAdapter,
} from "./auth/authorization.js";
import { createLocalStaffAuthorizationAdapter } from "./auth/local-staff-authorization.js";
import {
  createProductionOfflineAccessPolicy,
  type OfflineAccessPolicy,
} from "./auth/offline-access-policy.js";
import type { CommandDeps } from "./commands/command-runner.js";
import {
  createDefaultHostSecureStorage,
  type SecureStorageAdapter,
} from "./security/secure-storage.js";
import { loadOrCreateTlsMaterial, type TlsMaterial } from "./security/tls-material.js";

export type Clock = () => string;
export type IdGenerator = () => string;

export type ServiceDependencies = {
  database?: LocalDatabase;
  authorization: AuthorizationAdapter;
  offlinePolicy: OfflineAccessPolicy;
  secureStorage: SecureStorageAdapter;
  now: Clock;
  createId: IdGenerator;
  credentialRoot: string;
  tlsMaterial: TlsMaterial;
};

export type BuildDependenciesOptions = {
  database?: LocalDatabase;
  authorization?: AuthorizationAdapter;
  offlinePolicy?: OfflineAccessPolicy;
  secureStorage?: SecureStorageAdapter;
  now?: Clock;
  createId?: IdGenerator;
  credentialRoot?: string;
  tlsMaterial?: TlsMaterial;
};

export function createServiceDependencies(
  options: BuildDependenciesOptions = {},
): ServiceDependencies {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? (() => randomUUID());
  const offlinePolicy = options.offlinePolicy ?? createProductionOfflineAccessPolicy();
  const credentialRoot = options.credentialRoot ?? join(homedir(), ".polivo", "host-credentials");
  const secureStorage = options.secureStorage ?? createDefaultHostSecureStorage(credentialRoot);
  const tlsMaterial = options.tlsMaterial ?? loadOrCreateTlsMaterial(credentialRoot);

  let authorization = options.authorization;
  if (authorization === undefined) {
    if (options.database !== undefined) {
      authorization = createLocalStaffAuthorizationAdapter({
        database: options.database,
        secureStorage,
        offlinePolicy,
        now,
      });
    } else {
      authorization = productionFailClosedAuthorization;
    }
  }

  return {
    database: options.database,
    authorization,
    offlinePolicy,
    secureStorage,
    now,
    createId,
    credentialRoot,
    tlsMaterial,
  };
}

export function requireCommandDeps(deps: ServiceDependencies): CommandDeps {
  if (deps.database === undefined) {
    throw new Error("Local database is required for command execution.");
  }
  return {
    database: deps.database,
    authorization: deps.authorization,
    now: deps.now,
    createId: deps.createId,
  };
}

/** Default Fastify body size bound for local API requests (256 KiB). */
export const REQUEST_BODY_LIMIT_BYTES = 256 * 1024;
