import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  getLocalInstallation,
  insertStallBinding,
  openExistingDatabaseAndVerify,
  runInTransaction,
  tryGetHostEnrollment,
  tryGetStallBinding,
  updateHostActivationState,
  upsertHostEnrollment,
  type LocalDatabase,
} from "@polivo/db-local";

import {
  buildConfirmPossessionMessage,
  buildRedeemPossessionMessage,
  generateDeviceKeyPair,
  publicKeyFromPrivate,
  signPossessionMessage,
} from "../security/ed25519.js";
import {
  createDefaultHostSecureStorage,
  SecureStorageError,
  type SecureStorageAdapter,
} from "../security/secure-storage.js";

export type ActivateHostOptions = {
  databasePath: string;
  enrollmentBaseUrl: string;
  deploymentEnvironment: "development" | "staging" | "production";
  enrollmentSecret?: string;
  secureStorage?: SecureStorageAdapter;
  secureStorageDirectory?: string;
  fetchImpl?: typeof fetch;
};

export type ActivateHostResult = {
  tenantId: string;
  stallId: string;
  deviceId: string;
  activationState: string;
  resumed: boolean;
};

function defaultSecureDir(): string {
  return join(homedir(), ".polivo", "host-credentials");
}

async function promptSecret(): Promise<string> {
  const rl = createInterface({ input, output, terminal: true });
  try {
    const value = await rl.question("Paste the one-time host enrollment secret: ");
    return value.trim();
  } finally {
    rl.close();
  }
}

async function postJson<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & {
    message?: string;
    code?: string;
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    // Public ApiError is top-level { code, message }; tolerate nested error for older shapes.
    const detail = payload.message ?? payload.error?.message;
    const code = payload.code ?? payload.error?.code;
    const message =
      detail !== undefined && detail.trim().length > 0
        ? code !== undefined && code.trim().length > 0
          ? `${detail} (${code})`
          : detail
        : `Enrollment request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

/**
 * Host activation entry point for development and pre-installer setups.
 * Persists OS-protected credentials and resumes interrupted activation safely.
 */
export async function activateHost(options: ActivateHostOptions): Promise<ActivateHostResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const storage =
    options.secureStorage ??
    createDefaultHostSecureStorage(options.secureStorageDirectory ?? defaultSecureDir());

  const local = openExistingDatabaseAndVerify(options.databasePath);
  try {
    return await activateHostWithDatabase(local, {
      ...options,
      secureStorage: storage,
      fetchImpl,
    });
  } finally {
    local.close();
  }
}

export async function activateHostWithDatabase(
  local: LocalDatabase,
  options: Omit<ActivateHostOptions, "databasePath"> & {
    secureStorage: SecureStorageAdapter;
    fetchImpl: typeof fetch;
  },
): Promise<ActivateHostResult> {
  const installation = getLocalInstallation(local);
  const existingBinding = tryGetStallBinding(local);
  const enrollment = tryGetHostEnrollment(local);
  let resumed = false;

  if (
    existingBinding &&
    enrollment &&
    enrollment.activationState === "activated" &&
    enrollment.cloudDeviceId
  ) {
    const secret = options.secureStorage.getSecret(enrollment.credentialRef);
    if (!secret) {
      throw new SecureStorageError(
        "Host is bound but the protected credential could not be reopened. Use recovery procedures — do not create a second host.",
      );
    }
    return {
      tenantId: existingBinding.tenantId,
      stallId: existingBinding.stallId,
      deviceId: enrollment.hostDeviceId,
      activationState: enrollment.activationState,
      resumed: true,
    };
  }

  if (existingBinding && (!enrollment || enrollment.activationState === "failed")) {
    throw new Error(
      "This database is already bound but host enrollment is incomplete or failed. Refusing to overwrite. Recovery is required.",
    );
  }

  let privateKeyPkcs8: string;
  let publicKey: string;
  let credentialRef: string;

  if (enrollment && enrollment.activationState !== "failed") {
    resumed = true;
    const stored = options.secureStorage.getSecret(enrollment.credentialRef);
    if (!stored) {
      throw new SecureStorageError(
        "Pending activation credential is missing from protected storage. Leave activation incomplete and recover — plaintext fallback is not allowed.",
      );
    }
    privateKeyPkcs8 = stored;
    publicKey = publicKeyFromPrivate(privateKeyPkcs8);
    credentialRef = enrollment.credentialRef;
  } else {
    const keys = generateDeviceKeyPair();
    privateKeyPkcs8 = keys.privateKeyPkcs8;
    publicKey = keys.publicKey;
    credentialRef = `host-${installation.id}-v1`;
    try {
      options.secureStorage.setSecret(credentialRef, privateKeyPkcs8);
      const reopened = options.secureStorage.getSecret(credentialRef);
      if (reopened !== privateKeyPkcs8) {
        throw new SecureStorageError("Protected credential could not be reopened after write.");
      }
    } catch (error) {
      throw new SecureStorageError(
        error instanceof Error
          ? error.message
          : "Protected storage failed; activation left incomplete.",
      );
    }

    const now = new Date().toISOString();
    upsertHostEnrollment(local, {
      hostDeviceId: `pending-${installation.id}`,
      installationId: installation.id,
      credentialRef,
      credentialVersion: 1,
      activationState: "pending_credential",
      pendingOperationId: null,
      updatedAt: now,
    });
  }

  const secret = options.enrollmentSecret?.trim() || (await promptSecret());
  if (secret.length < 32) {
    throw new Error("Enrollment secret is missing or too short.");
  }

  updateHostActivationState(local, {
    activationState: "redeeming",
    updatedAt: new Date().toISOString(),
  });

  const possessionMessage = buildRedeemPossessionMessage({
    installationId: installation.id,
    publicKey,
    deploymentEnvironment: options.deploymentEnvironment,
  });
  const possessionSignature = signPossessionMessage(privateKeyPkcs8, possessionMessage);

  const redeem = await postJson<{
    tenantId: string;
    deviceId: string;
    role: string;
    credentialVersion: number;
    stateRevision: number;
    enrollmentState: string;
    stallDisplayName: string;
  }>(
    options.fetchImpl,
    new URL("/api/device-enrollment/redeem", options.enrollmentBaseUrl).toString(),
    {
      enrollmentSecret: secret,
      installationId: installation.id,
      publicKey,
      deploymentEnvironment: options.deploymentEnvironment,
      possessionMessage,
      possessionSignature,
    },
  );

  if (redeem.role !== "host") {
    throw new Error("Enrollment grant was not a host role.");
  }

  const boundAt = new Date().toISOString();
  runInTransaction(local.db, (tx) => {
    const binding = tryGetStallBinding(tx);
    if (!binding) {
      insertStallBinding(tx, {
        stallId: redeem.tenantId,
        tenantId: redeem.tenantId,
        boundAt,
      });
    } else if (binding.tenantId !== redeem.tenantId || binding.stallId !== redeem.tenantId) {
      throw new Error("Local database belongs to another stall. Refusing to overwrite binding.");
    }

    upsertHostEnrollment(tx, {
      hostDeviceId: redeem.deviceId,
      installationId: installation.id,
      credentialRef,
      credentialVersion: redeem.credentialVersion,
      activationState: "bound",
      pendingOperationId: null,
      cloudDeviceId: redeem.deviceId,
      cloudStateRevision: redeem.stateRevision,
      updatedAt: boundAt,
    });
  });

  updateHostActivationState(local, {
    activationState: "confirming",
    cloudDeviceId: redeem.deviceId,
    cloudStateRevision: redeem.stateRevision,
    updatedAt: new Date().toISOString(),
  });

  const confirmMessage = buildConfirmPossessionMessage({
    tenantId: redeem.tenantId,
    deviceId: redeem.deviceId,
    installationId: installation.id,
    publicKey,
    credentialVersion: redeem.credentialVersion,
  });
  const confirmSignature = signPossessionMessage(privateKeyPkcs8, confirmMessage);

  const confirm = await postJson<{
    enrollmentState: string;
    stateRevision: number;
  }>(
    options.fetchImpl,
    new URL("/api/device-enrollment/confirm", options.enrollmentBaseUrl).toString(),
    {
      tenantId: redeem.tenantId,
      deviceId: redeem.deviceId,
      installationId: installation.id,
      publicKey,
      credentialVersion: redeem.credentialVersion,
      possessionMessage: confirmMessage,
      possessionSignature: confirmSignature,
    },
  );

  const activatedAt = new Date().toISOString();
  updateHostActivationState(local, {
    activationState: "activated",
    cloudDeviceId: redeem.deviceId,
    cloudStateRevision: confirm.stateRevision,
    activatedAt,
    pendingOperationId: null,
    updatedAt: activatedAt,
  });

  const binding = tryGetStallBinding(local);
  if (!binding) {
    throw new Error("Stall binding missing after activation.");
  }

  return {
    tenantId: binding.tenantId,
    stallId: binding.stallId,
    deviceId: redeem.deviceId,
    activationState: "activated",
    resumed,
  };
}
