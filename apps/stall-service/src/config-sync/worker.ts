import { randomUUID } from "node:crypto";

import {
  CONFIG_PROTOCOL_VERSION,
  type ConfigAckRequestBody,
  type ConfigPullRequestBody,
} from "@polivo/contracts";
import {
  clearPendingConfigAck,
  getConfigDomainState,
  getStallBinding,
  recordPullAttempt,
  setConfigBlock,
  tryGetHostEnrollment,
  type LocalDatabase,
} from "@polivo/db-local";

import type { SecureStorageAdapter } from "../security/secure-storage.js";
import { nextRetryAtIso, type RetryClock } from "../sync/retry.js";
import { HostCredentialConfigurationError } from "../sync/signer.js";
import { applyAccessEnvelope } from "./apply.js";
import { createHostConfigSigner, type HostConfigSigner } from "./signer.js";
import { buildConfigWorkerStatus } from "./status.js";
import type { ConfigTransport } from "./transport.js";

const POLL_INTERVAL_MS = 30_000;

export type ConfigWorkerOptions = {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  transport: ConfigTransport | null;
  configured: boolean;
  configurationMessage: string | null;
  now: () => string;
  createId: () => string;
  random?: () => number;
  pollIntervalMs?: number;
  enabled?: boolean;
};

export type ConfigWorkerHandle = {
  start: () => void;
  stop: () => Promise<void>;
  wake: () => void;
  requestManualRefresh: () => { accepted: boolean; message: string | null };
  getStatus: () => ReturnType<typeof buildConfigWorkerStatus>;
  isRefreshing: () => boolean;
};

export function createConfigPullWorker(options: ConfigWorkerOptions): ConfigWorkerHandle {
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const clock: RetryClock = {
    nowMs: () => Date.parse(options.now()),
    random: options.random ?? Math.random,
  };

  let started = false;
  let stopping = false;
  let refreshing = false;
  let wakePending = false;
  let timer: NodeJS.Timeout | null = null;
  let cyclePromise: Promise<void> | null = null;
  let attemptIndex = 0;
  let nextRetryAt: string | null = null;
  let configurationMessage = options.configurationMessage;
  let signer: HostConfigSigner | null = null;

  const resolveBinding = () => {
    const binding = getStallBinding(options.database);
    const host = tryGetHostEnrollment(options.database);
    return { binding, host };
  };

  const ensureSigner = (): HostConfigSigner => {
    if (signer) {
      return signer;
    }
    const { binding } = resolveBinding();
    signer = createHostConfigSigner({
      database: options.database,
      secureStorage: options.secureStorage,
      stallId: binding.stallId,
      tenantId: binding.tenantId,
    });
    return signer;
  };

  const getStatus = () => {
    const { host } = resolveBinding();
    const sourceReady =
      Boolean(host && host.activationState === "activated") &&
      options.configured &&
      options.transport !== null;
    return buildConfigWorkerStatus({
      database: options.database,
      workerEnabled: options.enabled !== false,
      sourceReady,
      refreshing,
      configurationMessage,
      nextRetryAt,
    });
  };

  const schedule = (delayMs: number) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      wake();
    }, delayMs);
  };

  const sendPendingAck = async (): Promise<void> => {
    if (!options.transport) {
      return;
    }
    const state = getConfigDomainState(options.database, "access");
    if (
      !state.pendingAck ||
      state.pendingAckRevision == null ||
      !state.pendingAckPublicationId ||
      !state.pendingAckPayloadHash ||
      !state.pendingAckResult ||
      !state.pendingAckAppliedAt
    ) {
      return;
    }

    const { binding } = resolveBinding();
    const requestId = `req_${randomUUID().replace(/-/g, "")}`;
    const body: ConfigAckRequestBody = {
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      requestId,
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      domain: "access",
      revision: state.pendingAckRevision,
      publicationId: state.pendingAckPublicationId,
      payloadHash: state.pendingAckPayloadHash,
      result: state.pendingAckResult as ConfigAckRequestBody["result"],
      appliedAt: state.pendingAckAppliedAt,
      errorCode: state.pendingAckErrorCode,
      message: state.pendingAckMessage,
    };
    const rawBody = JSON.stringify(body);
    const signed = ensureSigner().signAckBody({
      rawBody,
      requestId,
      signedAt: options.now(),
    });
    const result = await options.transport.ack(signed);
    if (result.kind === "ok" && result.body.accepted) {
      clearPendingConfigAck(options.database, { updatedAt: options.now() });
      attemptIndex = 0;
      nextRetryAt = null;
      return;
    }
    attemptIndex += 1;
    nextRetryAt = nextRetryAtIso(attemptIndex, clock);
  };

  const runCycle = async (): Promise<void> => {
    if (refreshing || stopping || options.enabled === false) {
      return;
    }
    refreshing = true;
    try {
      const { host } = resolveBinding();
      if (!host || host.activationState !== "activated" || !options.transport) {
        return;
      }

      recordPullAttempt(options.database, { at: options.now() });

      // Prefer flushing pending ack before pull so cloud applied state catches up.
      await sendPendingAck();

      const state = getConfigDomainState(options.database, "access");
      const { binding } = resolveBinding();
      const requestId = `req_${randomUUID().replace(/-/g, "")}`;
      const body: ConfigPullRequestBody = {
        protocolVersion: CONFIG_PROTOCOL_VERSION,
        requestId,
        tenantId: binding.tenantId,
        stallId: binding.stallId,
        domain: "access",
        knownRevision: state.effectiveRevision,
      };
      const rawBody = JSON.stringify(body);
      const signed = ensureSigner().signPullBody({
        rawBody,
        requestId,
        signedAt: options.now(),
      });
      const pull = await options.transport.pull(signed);

      if (pull.kind !== "ok") {
        if (pull.kind === "http_error" && !pull.retryable) {
          setConfigBlock(options.database, {
            errorCode: pull.errorCode,
            message: pull.message,
            updatedAt: options.now(),
          });
          nextRetryAt = null;
          return;
        }
        attemptIndex += 1;
        nextRetryAt = nextRetryAtIso(attemptIndex, clock);
        return;
      }

      if (pull.body.outcome === "host_revoked") {
        setConfigBlock(options.database, {
          errorCode: "HOST_REVOKED",
          message: pull.body.message ?? "Host is revoked.",
          updatedAt: options.now(),
        });
        nextRetryAt = null;
        return;
      }

      if (pull.body.outcome === "up_to_date" || !pull.body.envelope) {
        attemptIndex = 0;
        nextRetryAt = null;
        await sendPendingAck();
        return;
      }

      const applied = applyAccessEnvelope({
        database: options.database,
        envelope: pull.body.envelope,
        nowIso: options.now(),
        createId: options.createId,
      });

      if (applied.kind === "rejected" || applied.kind === "blocked") {
        setConfigBlock(options.database, {
          errorCode: applied.errorCode,
          message: applied.message,
          updatedAt: options.now(),
        });
        if (applied.kind === "blocked") {
          nextRetryAt = null;
          return;
        }
        attemptIndex += 1;
        nextRetryAt = nextRetryAtIso(attemptIndex, clock);
        return;
      }

      attemptIndex = 0;
      nextRetryAt = null;
      await sendPendingAck();
    } catch (error) {
      if (error instanceof HostCredentialConfigurationError) {
        configurationMessage = error.message;
        setConfigBlock(options.database, {
          errorCode: error.code,
          message: error.message,
          updatedAt: options.now(),
        });
        nextRetryAt = null;
        return;
      }
      attemptIndex += 1;
      nextRetryAt = nextRetryAtIso(attemptIndex, clock);
    } finally {
      refreshing = false;
      if (wakePending && !stopping) {
        wakePending = false;
        void runCycle();
      } else if (!stopping) {
        const delay =
          nextRetryAt != null
            ? Math.max(0, Date.parse(nextRetryAt) - clock.nowMs())
            : pollIntervalMs;
        schedule(Number.isFinite(delay) ? delay : pollIntervalMs);
      }
    }
  };

  const wake = () => {
    if (stopping || options.enabled === false) {
      return;
    }
    if (refreshing) {
      wakePending = true;
      return;
    }
    cyclePromise = runCycle();
  };

  return {
    start: () => {
      if (started || options.enabled === false) {
        return;
      }
      started = true;
      stopping = false;
      wake();
    },
    stop: async () => {
      stopping = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (cyclePromise) {
        await cyclePromise.catch(() => undefined);
      }
      started = false;
    },
    wake,
    requestManualRefresh: () => {
      if (options.enabled === false) {
        return { accepted: false, message: "Configuration worker is disabled." };
      }
      if (!options.transport) {
        return {
          accepted: false,
          message: configurationMessage ?? "Configuration pull URL is not configured.",
        };
      }
      nextRetryAt = null;
      attemptIndex = 0;
      wake();
      return { accepted: true, message: null };
    },
    getStatus,
    isRefreshing: () => refreshing,
  };
}
