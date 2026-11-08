import {
  generateKeyPairSync,
  sign,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  verify,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import { buildHostIdentityMessage } from "@polivo/contracts";

import { pinnedHttpsRequest } from "./pinned-https.js";

export type TerminalEnrollmentStatus = {
  installationId: string;
  hasCredential: boolean;
  pairingState: "idle" | "redeemed" | "waiting_host_confirm" | "paired" | "failed";
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
  hasHostTrustPins: boolean;
};

export type HostTrustPins = {
  hostDeviceId: string;
  hostPublicKey: string;
  hostCredentialVersion: number;
  stallDisplayName: string;
  tlsCertificateSha256: string;
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
  hostPublicKey: string | null;
  hostCredentialVersion: number | null;
  tlsCertificateSha256: string | null;
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
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredEnrollment>;
  return {
    installationId: raw.installationId ?? randomUUID(),
    credentialRef: raw.credentialRef ?? "",
    publicKey: raw.publicKey ?? "",
    credentialVersion: raw.credentialVersion ?? 0,
    pairingState: raw.pairingState ?? "idle",
    stallDisplayName: raw.stallDisplayName ?? null,
    hostDeviceId: raw.hostDeviceId ?? null,
    deviceId: raw.deviceId ?? null,
    label: raw.label ?? null,
    tenantId: raw.tenantId ?? null,
    cloudStateRevision: raw.cloudStateRevision ?? null,
    hostPublicKey: raw.hostPublicKey ?? null,
    hostCredentialVersion: raw.hostCredentialVersion ?? null,
    tlsCertificateSha256: raw.tlsCertificateSha256 ?? null,
  };
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
    hostPublicKey: null,
    hostCredentialVersion: null,
    tlsCertificateSha256: null,
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
  // Reuse whenever the protected key file exists — regenerating after a partial
  // cloud redeem causes INSTALLATION_MISMATCH on retry.
  return existsSync(credentialPath(state.credentialRef));
}

function parseJsonText(text: string): unknown {
  if (text.length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function readJsonBody(response: Response): Promise<unknown> {
  return parseJsonText(await response.text());
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

function hasTrustPins(state: StoredEnrollment): boolean {
  return (
    typeof state.hostPublicKey === "string" &&
    state.hostPublicKey.length > 0 &&
    typeof state.tlsCertificateSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(state.tlsCertificateSha256) &&
    typeof state.hostDeviceId === "string" &&
    state.hostDeviceId.length > 0
  );
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
    hasHostTrustPins: hasTrustPins(state),
  };
}

export function getHostTrustPins(): HostTrustPins | null {
  const state = ensureInstallation();
  if (!hasTrustPins(state) || state.hostCredentialVersion === null) {
    return null;
  }
  return {
    hostDeviceId: state.hostDeviceId!,
    hostPublicKey: state.hostPublicKey!,
    hostCredentialVersion: state.hostCredentialVersion,
    stallDisplayName: state.stallDisplayName ?? "Polivo Stall",
    tlsCertificateSha256: state.tlsCertificateSha256!,
  };
}

/** Load the terminal Ed25519 private key for device proofs (main process only). */
export function loadTerminalPrivateKeyPkcs8(): string {
  const state = ensureInstallation();
  if (!state.credentialRef) {
    throw new Error("Terminal is not enrolled.");
  }
  return loadPrivateKey(state.credentialRef);
}

export function getTerminalDeviceId(): string | null {
  return ensureInstallation().deviceId;
}

export function signTerminalMessage(message: string): string {
  return signMessage(loadTerminalPrivateKeyPkcs8(), message);
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

  const canResumeAfterRedeem =
    (state.pairingState === "redeemed" || state.pairingState === "waiting_host_confirm") &&
    state.deviceId !== null &&
    state.tenantId !== null &&
    state.hostDeviceId !== null &&
    state.cloudStateRevision !== null;

  if (!canResumeAfterRedeem) {
    const possessionMessage = [
      "polivo-redeem-v1",
      state.installationId,
      publicKeyB64,
      input.deploymentEnvironment,
      "terminal",
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
          expectedRole: "terminal",
          possessionMessage,
          possessionSignature,
        }),
      },
    );
    const redeemBody = await readJsonBody(redeemResponse);
    const redeem = redeemBody as ApiErrorBody & {
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
    if (
      typeof redeem.tenantId !== "string" ||
      typeof redeem.deviceId !== "string" ||
      typeof redeem.stateRevision !== "number" ||
      typeof redeem.credentialVersion !== "number"
    ) {
      state.pairingState = "failed";
      writeState(state);
      throw new Error("Incomplete terminal enrollment result.");
    }

    state.deviceId = redeem.deviceId;
    state.hostDeviceId = redeem.intendedHostDeviceId ?? null;
    state.stallDisplayName = redeem.stallDisplayName ?? null;
    state.label = redeem.label ?? null;
    state.tenantId = redeem.tenantId;
    state.cloudStateRevision = redeem.stateRevision;
    state.credentialVersion = redeem.credentialVersion;
    state.pairingState =
      redeem.enrollmentState === "waiting_host_confirm" ? "waiting_host_confirm" : "redeemed";
    writeState(state);
  }

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

  const acceptBase = normalizeHostServiceBaseUrl(input.hostServiceBaseUrl);
  let acceptResult: Awaited<ReturnType<typeof pinnedHttpsRequest>>;
  try {
    acceptResult = await pinnedHttpsRequest({
      method: "POST",
      url: new URL("/enrollment/terminals/accept", acceptBase).toString(),
      body: JSON.stringify({
        terminalDeviceId: state.deviceId,
        publicKey: publicKeyB64,
        credentialVersion: state.credentialVersion,
        label: state.label,
        cloudStateRevision: state.cloudStateRevision,
        pairingArtifact,
        pairingSignature,
      }),
      allowUnpinnedLoopback: true,
      timeoutMs: 15_000,
    });
  } catch (error) {
    state.pairingState = "waiting_host_confirm";
    writeState(state);
    const detail = error instanceof Error ? error.message : "unknown network error";
    throw new Error(
      `Cloud redeem succeeded, but the host stall service at ${acceptBase} was unreachable (${detail}). Start stall-service with HTTPS on this PC for loopback pairing, then retry enrollment (same secret if still valid).`,
      { cause: error },
    );
  }
  if (acceptResult.status < 200 || acceptResult.status >= 300) {
    // Cloud succeeded first — leave waiting for host confirmation.
    state.pairingState = "waiting_host_confirm";
    writeState(state);
    return getTerminalEnrollmentStatus();
  }

  const acceptBody = parseJsonText(acceptResult.bodyText) as ApiErrorBody & {
    pairingState?: string;
    hostDeviceId?: string;
    hostPublicKey?: string;
    hostCredentialVersion?: number;
    stallDisplayName?: string;
    tlsCertificateSha256?: string;
    trustSignedAt?: string;
    trustSignature?: string;
  };

  if (
    !acceptBody.hostDeviceId ||
    !acceptBody.hostPublicKey ||
    !acceptBody.hostCredentialVersion ||
    !acceptBody.stallDisplayName ||
    !acceptBody.tlsCertificateSha256 ||
    !acceptBody.trustSignedAt ||
    !acceptBody.trustSignature
  ) {
    state.pairingState = "waiting_host_confirm";
    writeState(state);
    throw new Error(
      "Host accepted the terminal but did not return transport trust pins. Upgrade the stall service and re-pair on the host.",
    );
  }

  if (acceptBody.tlsCertificateSha256 !== acceptResult.certificateSha256) {
    state.pairingState = "failed";
    writeState(state);
    throw new Error("Host identity could not be verified");
  }

  const trustMessage = buildHostIdentityMessage({
    hostDeviceId: acceptBody.hostDeviceId,
    hostPublicKey: acceptBody.hostPublicKey,
    hostCredentialVersion: acceptBody.hostCredentialVersion,
    stallDisplayName: acceptBody.stallDisplayName,
    tlsCertificateSha256: acceptBody.tlsCertificateSha256,
    signedAt: acceptBody.trustSignedAt,
  });
  if (!verifyEd25519(acceptBody.hostPublicKey, trustMessage, acceptBody.trustSignature)) {
    state.pairingState = "failed";
    writeState(state);
    throw new Error("Host identity could not be verified");
  }

  state.hostDeviceId = acceptBody.hostDeviceId;
  state.hostPublicKey = acceptBody.hostPublicKey;
  state.hostCredentialVersion = acceptBody.hostCredentialVersion;
  state.stallDisplayName = acceptBody.stallDisplayName;
  state.tlsCertificateSha256 = acceptBody.tlsCertificateSha256;
  writeState(state);

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
  const confirmBody = (await readJsonBody(confirmResponse)) as ApiErrorBody;
  if (!confirmResponse.ok) {
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

function normalizeHostServiceBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("http://")) {
    // Pairing bootstrap must use HTTPS (Phase 16). Rewrite loopback HTTP to HTTPS.
    return `https://${trimmed.slice("http://".length)}`;
  }
  return `https://${trimmed}`;
}

function verifyEd25519(publicKey: string, message: string, signature: string): boolean {
  try {
    const keyBytes = Buffer.from(publicKey, "base64url");
    const sig = Buffer.from(signature, "base64url");
    if (keyBytes.length !== 32 || sig.length !== 64) {
      return false;
    }
    const keyObject = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keyBytes]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(message, "utf8"), keyObject, sig);
  } catch {
    return false;
  }
}
