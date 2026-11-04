import {
  generateKeyPairSync,
  sign,
  createPrivateKey,
  createPublicKey,
  randomUUID,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";

export type TerminalEnrollmentStatus = {
  installationId: string;
  hasCredential: boolean;
  pairingState: "idle" | "redeemed" | "waiting_host_confirm" | "paired" | "failed";
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
};

type StoredEnrollment = {
  installationId: string;
  credentialRef: string;
  publicKey: string;
  credentialVersion: number;
  pairingState: TerminalEnrollmentStatus["pairingState"];
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
  tenantId: string | null;
  cloudStateRevision: number | null;
};

type ApiErrorBody = {
  message?: string;
  code?: string;
  error?: { message?: string; code?: string };
};

function statePath(): string {
  const dir = join(app.getPath("userData"), "enrollment");
  mkdirSync(dir, { recursive: true });
  return join(dir, "terminal-enrollment.json");
}

function credentialPath(credentialRef: string): string {
  const dir = join(app.getPath("userData"), "enrollment", "credentials");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${credentialRef}.bin`);
}

function readState(): StoredEnrollment | null {
  const path = statePath();
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as StoredEnrollment;
}

function writeState(state: StoredEnrollment): void {
  writeFileSync(statePath(), JSON.stringify(state, null, 2), "utf8");
}

function storePrivateKey(credentialRef: string, privateKeyPkcs8: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is not available on this system.");
  }
  const encrypted = safeStorage.encryptString(privateKeyPkcs8);
  writeFileSync(credentialPath(credentialRef), encrypted);
}

function loadPrivateKey(credentialRef: string): string {
  const path = credentialPath(credentialRef);
  if (!existsSync(path)) {
    throw new Error("Terminal credential is missing from protected storage.");
  }
  return safeStorage.decryptString(readFileSync(path));
}

function ensureInstallation(): StoredEnrollment {
  const existing = readState();
  if (existing) {
    return existing;
  }
  const installationId = randomUUID();
  const state: StoredEnrollment = {
    installationId,
    credentialRef: "",
    publicKey: "",
    credentialVersion: 0,
    pairingState: "idle",
    stallDisplayName: null,
    hostDeviceId: null,
    deviceId: null,
    label: null,
    tenantId: null,
    cloudStateRevision: null,
  };
  writeState(state);
  return state;
}

function rawPublicKey(privateKeyPkcs8: Buffer): string {
  const privateKey = createPrivateKey({ key: privateKeyPkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ type: "spki", format: "der" });
  return Buffer.from(der.subarray(der.length - 32)).toString("base64url");
}

function signMessage(privateKeyPkcs8Base64: string, message: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8Base64, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  return Buffer.from(sign(null, Buffer.from(message, "utf8"), key)).toString("base64url");
}

/** Public ApiError is top-level { code, message }; tolerate nested error for older shapes. */
function messageFromApiError(payload: ApiErrorBody, status: number, fallback: string): string {
  const detail = payload.message ?? payload.error?.message;
  const code = payload.code ?? payload.error?.code;
  if (detail !== undefined && detail.trim().length > 0) {
    return code !== undefined && code.trim().length > 0 ? `${detail} (${code})` : detail;
  }
  return `${fallback} (HTTP ${status}).`;
}

function shouldReuseExistingCredential(state: StoredEnrollment): boolean {
  if (state.credentialRef.length === 0 || state.publicKey.length === 0) {
    return false;
  }
  if (!existsSync(credentialPath(state.credentialRef))) {
    return false;
  }
  return (
    state.pairingState === "redeemed" ||
    state.pairingState === "waiting_host_confirm" ||
    (state.pairingState === "failed" && state.deviceId !== null)
  );
}

function resolveKeypair(state: StoredEnrollment): {
  privateKeyPkcs8: string;
  publicKeyB64: string;
  credentialRef: string;
} {
  const credentialRef = `terminal-${state.installationId}-v1`;

  if (shouldReuseExistingCredential(state)) {
    const privateKeyPkcs8 = loadPrivateKey(state.credentialRef);
    return {
      privateKeyPkcs8,
      publicKeyB64: state.publicKey,
      credentialRef: state.credentialRef,
    };
  }

  const { privateKey } = generateKeyPairSync("ed25519");
  const privateDer = privateKey.export({ type: "pkcs8", format: "der" });
  const privateKeyPkcs8 = Buffer.from(privateDer).toString("base64url");
  const publicKeyB64 = rawPublicKey(Buffer.from(privateDer));

  storePrivateKey(credentialRef, privateKeyPkcs8);
  const reopened = loadPrivateKey(credentialRef);
  if (reopened !== privateKeyPkcs8) {
    throw new Error("Protected terminal credential could not be reopened.");
  }

  return { privateKeyPkcs8, publicKeyB64, credentialRef };
}

export function getTerminalEnrollmentStatus(): TerminalEnrollmentStatus {
  const state = ensureInstallation();
  return {
    installationId: state.installationId,
    hasCredential: state.credentialRef.length > 0,
    pairingState: state.pairingState,
    stallDisplayName: state.stallDisplayName,
    hostDeviceId: state.hostDeviceId,
    deviceId: state.deviceId,
    label: state.label,
  };
}

export async function enrollTerminal(input: {
  enrollmentSecret: string;
  enrollmentBaseUrl: string;
  deploymentEnvironment: "development" | "staging" | "production";
  hostServiceBaseUrl: string;
}): Promise<TerminalEnrollmentStatus> {
  const state = ensureInstallation();
  const { privateKeyPkcs8, publicKeyB64, credentialRef } = resolveKeypair(state);

  state.credentialRef = credentialRef;
  state.publicKey = publicKeyB64;
  state.credentialVersion = state.credentialVersion > 0 ? state.credentialVersion : 1;
  writeState(state);

  const possessionMessage = [
    "polivo-redeem-v1",
    state.installationId,
    publicKeyB64,
    input.deploymentEnvironment,
  ].join("\n");
  const possessionSignature = signMessage(privateKeyPkcs8, possessionMessage);

  const redeemResponse = await fetch(
    new URL("/api/device-enrollment/redeem", input.enrollmentBaseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        enrollmentSecret: input.enrollmentSecret,
        installationId: state.installationId,
        publicKey: publicKeyB64,
        deploymentEnvironment: input.deploymentEnvironment,
        possessionMessage,
        possessionSignature,
      }),
    },
  );
  const redeem = (await redeemResponse.json()) as ApiErrorBody & {
    tenantId?: string;
    deviceId?: string;
    role?: string;
    intendedHostDeviceId?: string | null;
    label?: string | null;
    credentialVersion?: number;
    stateRevision?: number;
    enrollmentState?: string;
    stallDisplayName?: string;
  };
  if (!redeemResponse.ok) {
    state.pairingState = "failed";
    writeState(state);
    throw new Error(
      messageFromApiError(redeem, redeemResponse.status, "Terminal enrollment redeem failed"),
    );
  }
  if (redeem.role !== "terminal") {
    throw new Error("Enrollment grant was not a terminal role.");
  }

  state.deviceId = redeem.deviceId ?? null;
  state.hostDeviceId = redeem.intendedHostDeviceId ?? null;
  state.stallDisplayName = redeem.stallDisplayName ?? null;
  state.label = redeem.label ?? null;
  state.tenantId = redeem.tenantId ?? null;
  state.cloudStateRevision = redeem.stateRevision ?? null;
  state.credentialVersion = redeem.credentialVersion ?? 1;
  state.pairingState =
    redeem.enrollmentState === "waiting_host_confirm" ? "waiting_host_confirm" : "redeemed";
  writeState(state);

  if (!state.hostDeviceId || !state.deviceId || state.cloudStateRevision === null) {
    throw new Error("Incomplete terminal enrollment result.");
  }

  const pairingArtifact = JSON.stringify({
    hostDeviceId: state.hostDeviceId,
    terminalDeviceId: state.deviceId,
    publicKey: publicKeyB64,
    credentialVersion: state.credentialVersion,
    cloudStateRevision: state.cloudStateRevision,
  });
  const pairingSignature = signMessage(privateKeyPkcs8, pairingArtifact);

  let acceptResponse: Response;
  try {
    acceptResponse = await fetch(
      new URL("/enrollment/terminals/accept", input.hostServiceBaseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          terminalDeviceId: state.deviceId,
          publicKey: publicKeyB64,
          credentialVersion: state.credentialVersion,
          label: state.label,
          cloudStateRevision: state.cloudStateRevision,
          pairingArtifact,
          pairingSignature,
        }),
      },
    );
  } catch (error) {
    state.pairingState = "waiting_host_confirm";
    writeState(state);
    const cause =
      error instanceof Error && "cause" in error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : "unknown network error";
    throw new Error(
      `Cloud redeem succeeded, but the host stall service at ${input.hostServiceBaseUrl} was unreachable (${cause}). Run stall-service on this PC for Phase 14 loopback pairing, then retry enrollment (same secret if still valid).`,
    );
  }
  if (!acceptResponse.ok) {
    // Cloud succeeded first — leave waiting for host confirmation.
    state.pairingState = "waiting_host_confirm";
    writeState(state);
    return getTerminalEnrollmentStatus();
  }

  // Confirm with cloud after host accepted.
  const confirmMessage = [
    "polivo-confirm-v1",
    state.tenantId,
    state.deviceId,
    state.installationId,
    publicKeyB64,
    String(state.credentialVersion),
  ].join("\n");
  const confirmSignature = signMessage(privateKeyPkcs8, confirmMessage);
  const confirmResponse = await fetch(
    new URL("/api/device-enrollment/confirm", input.enrollmentBaseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        tenantId: state.tenantId,
        deviceId: state.deviceId,
        installationId: state.installationId,
        publicKey: publicKeyB64,
        credentialVersion: state.credentialVersion,
        possessionMessage: confirmMessage,
        possessionSignature: confirmSignature,
      }),
    },
  );
  if (!confirmResponse.ok) {
    const confirmBody = (await confirmResponse.json()) as ApiErrorBody;
    state.pairingState = "waiting_host_confirm";
    writeState(state);
    throw new Error(
      messageFromApiError(
        confirmBody,
        confirmResponse.status,
        "Host accepted the terminal, but cloud confirm failed",
      ),
    );
  }

  state.pairingState = "paired";
  writeState(state);
  return getTerminalEnrollmentStatus();
}
