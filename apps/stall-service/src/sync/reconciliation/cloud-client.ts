import {
  buildSyncManifestSummaryPossessionMessage,
  buildSyncProgressPossessionMessage,
  buildSyncReceiptLookupPossessionMessage,
  syncCloudProgressResponseSchema,
  syncCloudReceiptLookupResponseSchema,
  type SyncCloudProgressResponse,
  type SyncCloudReceiptLookupResponse,
} from "@polivo/contracts";

import { getHostEnrollment, tryGetHostEnrollment, type LocalDatabase } from "@polivo/db-local";

import { signPossessionMessage } from "../../security/ed25519.js";
import type { SecureStorageAdapter } from "../../security/secure-storage.js";
import { HostCredentialConfigurationError } from "../signer.js";
import { sha256HexOfUtf8 } from "./hash.js";

export type ReconcileSignerIdentity = {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credentialVersion: number;
};

export type ReconcileSigner = {
  loadIdentity: () => ReconcileSignerIdentity;
  signMessage: (message: string) => string;
};

export function createReconcileSigner(input: {
  database: LocalDatabase;
  secureStorage: SecureStorageAdapter;
  tenantId: string;
}): ReconcileSigner {
  const load = () => {
    const host = tryGetHostEnrollment(input.database);
    if (!host || host.activationState !== "activated") {
      throw new HostCredentialConfigurationError(
        "Host is not activated. Complete stall provisioning before reconciliation.",
      );
    }
    const privateKey = input.secureStorage.getSecret(host.credentialRef);
    if (!privateKey) {
      throw new HostCredentialConfigurationError(
        "Host device credential is unavailable for reconciliation signing.",
      );
    }
    const enrollment = getHostEnrollment(input.database);
    return {
      identity: {
        tenantId: input.tenantId,
        deviceId: enrollment.cloudDeviceId ?? enrollment.hostDeviceId,
        installationId: enrollment.installationId,
        credentialVersion: enrollment.credentialVersion,
      },
      privateKey,
    };
  };
  return {
    loadIdentity: () => load().identity,
    signMessage: (message) => signPossessionMessage(load().privateKey, message),
  };
}

export type ReconciliationCloudClient = {
  getProgress: (input: {
    sourceStreamId: string;
  }) => Promise<
    { ok: true; progress: SyncCloudProgressResponse } | { ok: false; code: string; message: string }
  >;
  lookupReceipts: (input: {
    sourceStreamId: string;
    streamGeneration: number;
    groupIds?: string[];
    fromSequence?: string;
    toSequence?: string;
    limit?: number;
  }) => Promise<
    | { ok: true; result: SyncCloudReceiptLookupResponse }
    | { ok: false; code: string; message: string }
  >;
  getFactSummary: (input: { sourceStreamId: string; throughSequence: string }) => Promise<
    | {
        ok: true;
        summary: {
          salesCount: number;
          paymentsCount: number;
          ledgerEntriesCount: number;
          allocationCount: number;
          ledgerBalanceSumMinor: string;
          observedAt: string;
        };
      }
    | { ok: false; code: string; message: string }
  >;
};

export function createHttpReconciliationCloudClient(input: {
  progressUrl: string | null;
  receiptsUrl: string | null;
  factSummaryUrl: string | null;
  signer: ReconcileSigner | null;
  createId: () => string;
  now: () => string;
}): ReconciliationCloudClient {
  const postSigned = async (args: {
    url: string | null;
    possessionBuilder: (msg: {
      tenantId: string;
      deviceId: string;
      installationId: string;
      credentialVersion: number;
      requestId: string;
      bodySha256: string;
      signedAt: string;
    }) => string;
    body: Record<string, unknown>;
  }): Promise<{ ok: true; json: unknown } | { ok: false; code: string; message: string }> => {
    if (!args.url || !input.signer) {
      return {
        ok: false,
        code: "REMOTE_UNAVAILABLE",
        message: "Cloud reconciliation endpoints are not configured.",
      };
    }
    let identity: ReconcileSignerIdentity;
    try {
      identity = input.signer.loadIdentity();
    } catch (error) {
      return {
        ok: false,
        code: "CONFIGURATION_REQUIRED",
        message: error instanceof Error ? error.message : "Host signing identity unavailable.",
      };
    }
    const requestId = input.createId();
    const bodyText = JSON.stringify(args.body);
    const bodySha256 = sha256HexOfUtf8(bodyText);
    const signedAt = input.now();
    const message = args.possessionBuilder({
      tenantId: identity.tenantId,
      deviceId: identity.deviceId,
      installationId: identity.installationId,
      credentialVersion: identity.credentialVersion,
      requestId,
      bodySha256,
      signedAt,
    });
    const signature = input.signer.signMessage(message);
    try {
      const response = await fetch(args.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-polivo-tenant-id": identity.tenantId,
          "x-polivo-device-id": identity.deviceId,
          "x-polivo-installation-id": identity.installationId,
          "x-polivo-credential-version": String(identity.credentialVersion),
          "x-polivo-request-id": requestId,
          "x-polivo-signed-at": signedAt,
          "x-polivo-body-sha256": bodySha256,
          "x-polivo-signature": signature,
        },
        body: bodyText,
      });
      const text = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          code: `HTTP_${response.status}`,
          message: text.slice(0, 400) || `Cloud request failed (${response.status}).`,
        };
      }
      return { ok: true, json: JSON.parse(text) as unknown };
    } catch (error) {
      return {
        ok: false,
        code: "REMOTE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Cloud request failed.",
      };
    }
  };

  return {
    async getProgress({ sourceStreamId }) {
      const result = await postSigned({
        url: input.progressUrl,
        possessionBuilder: buildSyncProgressPossessionMessage,
        body: { sourceStreamId },
      });
      if (!result.ok) {
        return result;
      }
      const progress = syncCloudProgressResponseSchema.parse(result.json);
      return { ok: true, progress };
    },
    async lookupReceipts(args) {
      const result = await postSigned({
        url: input.receiptsUrl,
        possessionBuilder: buildSyncReceiptLookupPossessionMessage,
        body: {
          requestId: input.createId(),
          sourceStreamId: args.sourceStreamId,
          streamGeneration: args.streamGeneration,
          groupIds: args.groupIds,
          fromSequence: args.fromSequence,
          toSequence: args.toSequence,
          limit: args.limit ?? 100,
        },
      });
      if (!result.ok) {
        return result;
      }
      const parsed = syncCloudReceiptLookupResponseSchema.parse(result.json);
      return { ok: true, result: parsed };
    },
    async getFactSummary(args) {
      const result = await postSigned({
        url: input.factSummaryUrl,
        possessionBuilder: buildSyncManifestSummaryPossessionMessage,
        body: {
          requestId: input.createId(),
          sourceStreamId: args.sourceStreamId,
          throughSequence: args.throughSequence,
        },
      });
      if (!result.ok) {
        return result;
      }
      const raw = result.json as Record<string, unknown>;
      return {
        ok: true,
        summary: {
          salesCount: Number(raw.salesCount ?? raw.sales_count ?? 0),
          paymentsCount: Number(raw.paymentsCount ?? raw.payments_count ?? 0),
          ledgerEntriesCount: Number(raw.ledgerEntriesCount ?? raw.ledger_entries_count ?? 0),
          allocationCount: Number(raw.allocationCount ?? raw.allocation_count ?? 0),
          ledgerBalanceSumMinor: String(
            raw.ledgerBalanceSumMinor ?? raw.ledger_balance_sum_minor ?? "0",
          ),
          observedAt: String(raw.observedAt ?? raw.observed_at ?? input.now()),
        },
      };
    },
  };
}
