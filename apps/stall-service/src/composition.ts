import { randomUUID } from "node:crypto";

import type { LocalDatabase } from "@polivo/db-local";

import {
  productionFailClosedAuthorization,
  type AuthorizationAdapter,
} from "./auth/authorization.js";
import type { CommandDeps } from "./commands/command-runner.js";

export type Clock = () => string;
export type IdGenerator = () => string;

export type ServiceDependencies = {
  database?: LocalDatabase;
  authorization: AuthorizationAdapter;
  now: Clock;
  createId: IdGenerator;
};

export type BuildDependenciesOptions = {
  database?: LocalDatabase;
  authorization?: AuthorizationAdapter;
  now?: Clock;
  createId?: IdGenerator;
};

export function createServiceDependencies(
  options: BuildDependenciesOptions = {},
): ServiceDependencies {
  return {
    database: options.database,
    authorization: options.authorization ?? productionFailClosedAuthorization,
    now: options.now ?? (() => new Date().toISOString()),
    createId: options.createId ?? (() => randomUUID()),
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
