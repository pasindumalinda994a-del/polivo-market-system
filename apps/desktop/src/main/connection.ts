import { createPublicKey, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  buildHostIdentityMessage,
  configureHostAddressRequestSchema,
  desktopConnectionStatusSchema,
  hostIdentityResponseSchema,
  localStaffSessionResponseSchema,
  localStaffSignInResponseSchema,
  type ConfigureHostAddressResult,
  type ConnectionState,
  type DesktopConnectionStatus,
} from "@polivo/contracts";

import {
  getHostTrustPins,
  getTerminalDeviceId,
  getTerminalEnrollmentStatus,
  loadTerminalPrivateKeyPkcs8,
  signTerminalMessage,
} from "./enrollment.js";
import { pinnedHttpsRequest } from "./pinned-https.js";

type ConnectionSettings = {
  hostAddress: string;
  port: number;
};

type StaffSessionState = {
  sessionSecret: string;
  sessionId: string;
  staffId: string;
  staffCode: string;
  displayName: string;
  capabilities: string[];
  absoluteExpiresAt: string;
};

type ConnectionRuntime = {
  settings: ConnectionSettings | null;
  state: ConnectionState;
  verifiedStallDisplayName: string | null;
  lastSuccessfulCheckAt: string | null;
  lastErrorMessage: string | null;
  staff: StaffSessionState | null;
  requestGeneration: number;
  abortController: AbortController;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectInFlight: boolean;
};

const DEFAULT_PORT = 3040;
const REQUEST_TIMEOUT_MS = 10_000;

const runtime: ConnectionRuntime = {
  settings: null,
  state: "unconfigured",
  verifiedStallDisplayName: null,
  lastSuccessfulCheckAt: null,
  lastErrorMessage: null,
  staff: null,
  requestGeneration: 0,
  abortController: new AbortController(),
  reconnectTimer: null,
  reconnectInFlight: false,
};

function settingsPath(): string {
  const dir = join(app.getPath("userData"), "connection");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

function loadSettings(): ConnectionSettings | null {
  const path = settingsPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ConnectionSettings>;
    if (typeof parsed.hostAddress !== "string" || parsed.hostAddress.trim().length === 0) {
      return null;
    }
    const port =
      typeof parsed.port === "number" && Number.isInteger(parsed.port) ? parsed.port : DEFAULT_PORT;
    return { hostAddress: parsed.hostAddress.trim(), port };
  } catch {
    return null;
  }
}

function saveSettings(settings: ConnectionSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function bumpGeneration(reason: string): number {
  runtime.abortController.abort();
  runtime.abortController = new AbortController();
  runtime.requestGeneration += 1;
  void reason;
  return runtime.requestGeneration;
}

function serviceBaseUrl(settings: ConnectionSettings): string {
  const host = settings.hostAddress.includes(":")
    ? `[${settings.hostAddress.replace(/^\[|\]$/g, "")}]`
    : settings.hostAddress;
  return `https://${host}:${settings.port}`;
}

function buildDeviceProof(
  method: string,
  path: string,
): {
  deviceId: string;
  signedAt: string;
  signature: string;
} {
  const deviceId = getTerminalDeviceId();
  if (!deviceId) {
    throw new Error("Terminal is not enrolled.");
  }
  // Ensure private key is available before signing.
  loadTerminalPrivateKeyPkcs8();
  const signedAt = new Date().toISOString();
  const message = ["polivo-device-auth-v1", deviceId, signedAt, method, path].join("\n");
  const signature = signTerminalMessage(message);
  return { deviceId, signedAt, signature };
}

function verifyHostIdentityPayload(
  payload: unknown,
  observedCertSha256: string,
): { stallDisplayName: string; hostDeviceId: string } {
  const pins = getHostTrustPins();
  if (!pins) {
    throw new Error(
      "Host trust pins are missing. Re-pair this terminal on the stall host before connecting over the LAN.",
    );
  }
  const identity = hostIdentityResponseSchema.parse(payload);
  if (identity.tlsCertificateSha256 !== observedCertSha256) {
    throw new Error("Host identity could not be verified");
  }
  if (identity.tlsCertificateSha256 !== pins.tlsCertificateSha256) {
    throw new Error("Host identity could not be verified");
  }
  if (identity.hostDeviceId !== pins.hostDeviceId) {
    throw new Error("Host identity could not be verified");
  }
  if (identity.hostPublicKey !== pins.hostPublicKey) {
    throw new Error("Host identity could not be verified");
  }
  const message = buildHostIdentityMessage({
    hostDeviceId: identity.hostDeviceId,
    hostPublicKey: identity.hostPublicKey,
    hostCredentialVersion: identity.hostCredentialVersion,
    stallDisplayName: identity.stallDisplayName,
    tlsCertificateSha256: identity.tlsCertificateSha256,
    signedAt: identity.signedAt,
  });
  if (!verifyEd25519(identity.hostPublicKey, message, identity.signature)) {
    throw new Error("Host identity could not be verified");
  }
  return {
    stallDisplayName: identity.stallDisplayName,
    hostDeviceId: identity.hostDeviceId,
  };
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

function mapApiErrorMessage(status: number, bodyText: string, fallback: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      message?: string;
      code?: string;
      error?: { message?: string; code?: string };
    };
    const message = parsed.message ?? parsed.error?.message;
    const code = parsed.code ?? parsed.error?.code;
    if (message && message.trim().length > 0) {
      if (code === "UNAUTHENTICATED" || /credential|password|pin|secret/i.test(message)) {
        // Preserve Phase 15 generic sign-in failure wording when revealing more would leak accounts.
        if (/sign-in|login|credential/i.test(fallback)) {
          return "Sign-in failed. Check your staff code and secret.";
        }
      }
      if (/online refresh|offline|snapshot/i.test(message)) {
        return message;
      }
      if (/revok/i.test(message) || /device/i.test(message)) {
        return message;
      }
      if (/session|expired/i.test(message)) {
        return message;
      }
      return message;
    }
  } catch {
    // ignore parse errors
  }
  if (status === 0) {
    return "Stall host unavailable";
  }
  return fallback;
}

async function fetchVerifiedIdentity(
  settings: ConnectionSettings,
  generation: number,
): Promise<{ stallDisplayName: string; hostDeviceId: string }> {
  const pins = getHostTrustPins();
  if (!pins) {
    throw new Error(
      "Host trust pins are missing. Re-pair this terminal on the stall host before connecting over the LAN.",
    );
  }
  const response = await pinnedHttpsRequest({
    method: "GET",
    url: new URL("/connection/identity", serviceBaseUrl(settings)).toString(),
    expectedCertificateSha256: pins.tlsCertificateSha256,
    timeoutMs: REQUEST_TIMEOUT_MS,
    signal: runtime.abortController.signal,
  });
  if (generation !== runtime.requestGeneration) {
    throw new Error("Request cancelled.");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      mapApiErrorMessage(response.status, response.bodyText, "Host identity could not be verified"),
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.bodyText);
  } catch {
    throw new Error("Host identity could not be verified");
  }
  return verifyHostIdentityPayload(payload, response.certificateSha256);
}

export function initializeConnectionFromDisk(): void {
  runtime.settings = loadSettings();
  const enrollment = getTerminalEnrollmentStatus();
  if (!enrollment.hasHostTrustPins || enrollment.pairingState !== "paired") {
    runtime.state = "unconfigured";
    return;
  }
  if (!runtime.settings) {
    runtime.state = "unconfigured";
    return;
  }
  runtime.state = "unreachable";
  void retryConnection();
}

export function getConnectionStatus(): DesktopConnectionStatus {
  const enrollment = getTerminalEnrollmentStatus();
  const settings = runtime.settings;
  const status = {
    state: runtime.state,
    pairedHostDeviceId: enrollment.hostDeviceId,
    verifiedStallDisplayName: runtime.verifiedStallDisplayName,
    configuredHostLabel: settings ? `${settings.hostAddress}:${settings.port}` : null,
    lastSuccessfulCheckAt: runtime.lastSuccessfulCheckAt,
    lastErrorMessage: runtime.lastErrorMessage,
    staffDisplayName: runtime.staff?.displayName ?? null,
    staffCode: runtime.staff?.staffCode ?? null,
    capabilities: runtime.staff?.capabilities ?? [],
  };
  return desktopConnectionStatusSchema.parse(status);
}

export async function configureOrTestHostAddress(
  input: unknown,
): Promise<ConfigureHostAddressResult> {
  const enrollment = getTerminalEnrollmentStatus();
  if (enrollment.pairingState !== "paired" || !enrollment.hasHostTrustPins) {
    return {
      ok: false,
      verifiedStallDisplayName: null,
      hostDeviceId: null,
      message:
        "Pair this terminal on the stall host before configuring a service address. Trust pins are required.",
    };
  }

  const parsed = configureHostAddressRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      verifiedStallDisplayName: null,
      hostDeviceId: null,
      message: "Enter a valid host address and port.",
    };
  }

  const settings: ConnectionSettings = {
    hostAddress: parsed.data.hostAddress,
    port: parsed.data.port,
  };
  const generation = bumpGeneration("configure");
  clearStaffLocally();
  runtime.settings = settings;
  saveSettings(settings);
  runtime.state = "unreachable";
  runtime.lastErrorMessage = null;

  try {
    const verified = await fetchVerifiedIdentity(settings, generation);
    if (generation !== runtime.requestGeneration) {
      return {
        ok: false,
        verifiedStallDisplayName: null,
        hostDeviceId: null,
        message: "Request cancelled.",
      };
    }
    runtime.verifiedStallDisplayName = verified.stallDisplayName;
    runtime.lastSuccessfulCheckAt = new Date().toISOString();
    runtime.state = "verified";
    runtime.lastErrorMessage = null;
    scheduleReconnect(false);
    return {
      ok: true,
      verifiedStallDisplayName: verified.stallDisplayName,
      hostDeviceId: verified.hostDeviceId,
      message: `Verified ${verified.stallDisplayName}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Host identity could not be verified";
    runtime.verifiedStallDisplayName = null;
    if (/unavailable/i.test(message)) {
      runtime.state = "unreachable";
      runtime.lastErrorMessage = "Stall host unavailable";
    } else {
      runtime.state = "identity_failed";
      runtime.lastErrorMessage = "Host identity could not be verified";
    }
    return {
      ok: false,
      verifiedStallDisplayName: null,
      hostDeviceId: null,
      message: runtime.lastErrorMessage,
    };
  }
}

export async function signIn(input: {
  staffCode: string;
  secret: string;
}): Promise<DesktopConnectionStatus> {
  const settings = runtime.settings;
  if (!settings) {
    runtime.state = "unconfigured";
    runtime.lastErrorMessage = "Configure the stall host address first.";
    return getConnectionStatus();
  }
  const generation = bumpGeneration("sign-in");
  clearStaffLocally();

  try {
    const verified = await fetchVerifiedIdentity(settings, generation);
    if (generation !== runtime.requestGeneration) {
      return getConnectionStatus();
    }
    runtime.verifiedStallDisplayName = verified.stallDisplayName;

    const deviceProof = buildDeviceProof("POST", "/local-auth/sign-in");
    const response = await pinnedHttpsRequest({
      method: "POST",
      url: new URL("/local-auth/sign-in", serviceBaseUrl(settings)).toString(),
      expectedCertificateSha256: getHostTrustPins()!.tlsCertificateSha256,
      body: JSON.stringify({
        staffCode: input.staffCode,
        secret: input.secret,
        deviceProof,
      }),
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal: runtime.abortController.signal,
    });
    if (generation !== runtime.requestGeneration) {
      return getConnectionStatus();
    }
    if (response.status < 200 || response.status >= 300) {
      runtime.state = "verified";
      runtime.lastErrorMessage = mapApiErrorMessage(
        response.status,
        response.bodyText,
        "Sign-in failed. Check your staff code and secret.",
      );
      return getConnectionStatus();
    }
    const payload = localStaffSignInResponseSchema.parse(JSON.parse(response.bodyText));
    // Session secret stays in main memory only.
    runtime.staff = {
      sessionSecret: payload.sessionSecret,
      sessionId: payload.sessionId,
      staffId: payload.staffId,
      staffCode: input.staffCode.trim(),
      displayName: payload.displayName,
      capabilities: [],
      absoluteExpiresAt: payload.absoluteExpiresAt,
    };
    runtime.state = "signed_in";
    runtime.lastSuccessfulCheckAt = new Date().toISOString();
    runtime.lastErrorMessage = null;
    // Refresh capabilities via session endpoint.
    await refreshSessionInternal(generation);
    return getConnectionStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stall host unavailable";
    if (/identity/i.test(message)) {
      runtime.state = "identity_failed";
      runtime.lastErrorMessage = "Host identity could not be verified";
    } else if (/cancelled/i.test(message)) {
      return getConnectionStatus();
    } else {
      runtime.state = "unreachable";
      runtime.lastErrorMessage = "Stall host unavailable";
    }
    return getConnectionStatus();
  }
}

async function refreshSessionInternal(generation: number): Promise<void> {
  const settings = runtime.settings;
  const staff = runtime.staff;
  if (!settings || !staff) {
    return;
  }
  const deviceProof = buildDeviceProof("GET", "/local-auth/session");
  const response = await pinnedHttpsRequest({
    method: "GET",
    url: new URL("/local-auth/session", serviceBaseUrl(settings)).toString(),
    expectedCertificateSha256: getHostTrustPins()!.tlsCertificateSha256,
    headers: {
      "x-polivo-device-id": deviceProof.deviceId,
      "x-polivo-device-signed-at": deviceProof.signedAt,
      "x-polivo-device-signature": deviceProof.signature,
      "x-polivo-session": staff.sessionSecret,
    },
    timeoutMs: REQUEST_TIMEOUT_MS,
    signal: runtime.abortController.signal,
  });
  if (generation !== runtime.requestGeneration) {
    return;
  }
  if (response.status < 200 || response.status >= 300) {
    const message = mapApiErrorMessage(
      response.status,
      response.bodyText,
      "Session refresh required.",
    );
    clearStaffLocally();
    runtime.state = "session_refresh_required";
    runtime.lastErrorMessage = message;
    return;
  }
  const session = localStaffSessionResponseSchema.parse(JSON.parse(response.bodyText));
  runtime.staff = {
    ...staff,
    sessionId: session.sessionId,
    staffId: session.staffId,
    staffCode: session.staffCode,
    displayName: session.displayName,
    capabilities: session.capabilities,
    absoluteExpiresAt: session.absoluteExpiresAt,
  };
  runtime.state = "signed_in";
  runtime.lastSuccessfulCheckAt = new Date().toISOString();
  runtime.lastErrorMessage = null;
}

export async function readCurrentSession(): Promise<DesktopConnectionStatus> {
  const settings = runtime.settings;
  if (!settings) {
    runtime.state = "unconfigured";
    return getConnectionStatus();
  }
  if (!runtime.staff) {
    if (runtime.state === "signed_in") {
      runtime.state = "session_refresh_required";
    }
    return getConnectionStatus();
  }
  const generation = runtime.requestGeneration;
  try {
    await refreshSessionInternal(generation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stall host unavailable";
    if (/identity/i.test(message)) {
      runtime.state = "identity_failed";
      runtime.lastErrorMessage = "Host identity could not be verified";
    } else if (!/cancelled/i.test(message)) {
      runtime.state = "unreachable";
      runtime.lastErrorMessage = "Stall host unavailable";
    }
  }
  return getConnectionStatus();
}

export async function signOutOrLock(): Promise<{
  status: DesktopConnectionStatus;
  serverRevocationAcknowledged: boolean;
}> {
  const settings = runtime.settings;
  const staff = runtime.staff;
  clearStaffLocally();
  runtime.state = settings ? "signed_out" : "unconfigured";
  runtime.lastErrorMessage = null;

  if (!settings || !staff) {
    return { status: getConnectionStatus(), serverRevocationAcknowledged: false };
  }

  const generation = bumpGeneration("sign-out");
  try {
    const pins = getHostTrustPins();
    if (!pins) {
      return { status: getConnectionStatus(), serverRevocationAcknowledged: false };
    }
    const deviceProof = buildDeviceProof("POST", "/local-auth/sign-out");
    const response = await pinnedHttpsRequest({
      method: "POST",
      url: new URL("/local-auth/sign-out", serviceBaseUrl(settings)).toString(),
      expectedCertificateSha256: pins.tlsCertificateSha256,
      headers: {
        "x-polivo-session": staff.sessionSecret,
      },
      body: JSON.stringify({ deviceProof }),
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal: runtime.abortController.signal,
    });
    if (generation !== runtime.requestGeneration) {
      return { status: getConnectionStatus(), serverRevocationAcknowledged: false };
    }
    const acknowledged = response.status >= 200 && response.status < 300;
    if (acknowledged) {
      runtime.state = "verified";
    }
    return { status: getConnectionStatus(), serverRevocationAcknowledged: acknowledged };
  } catch {
    // Local lock already applied; do not claim server revocation.
    return { status: getConnectionStatus(), serverRevocationAcknowledged: false };
  }
}

export async function retryConnection(): Promise<DesktopConnectionStatus> {
  if (runtime.reconnectInFlight) {
    return getConnectionStatus();
  }
  const settings = runtime.settings;
  if (!settings) {
    runtime.state = "unconfigured";
    return getConnectionStatus();
  }
  runtime.reconnectInFlight = true;
  const generation = bumpGeneration("retry");
  const hadStaff = runtime.staff !== null;
  try {
    const verified = await fetchVerifiedIdentity(settings, generation);
    if (generation !== runtime.requestGeneration) {
      return getConnectionStatus();
    }
    runtime.verifiedStallDisplayName = verified.stallDisplayName;
    runtime.lastSuccessfulCheckAt = new Date().toISOString();
    runtime.lastErrorMessage = null;
    if (hadStaff && runtime.staff) {
      await refreshSessionInternal(generation);
    } else {
      runtime.state = "verified";
    }
    scheduleReconnect(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stall host unavailable";
    if (/identity/i.test(message)) {
      runtime.state = "identity_failed";
      runtime.lastErrorMessage = "Host identity could not be verified";
      scheduleReconnect(false);
    } else if (!/cancelled/i.test(message)) {
      runtime.state = "unreachable";
      runtime.lastErrorMessage = "Stall host unavailable";
      scheduleReconnect(true);
    }
  } finally {
    runtime.reconnectInFlight = false;
  }
  return getConnectionStatus();
}

function clearStaffLocally(): void {
  runtime.staff = null;
}

function scheduleReconnect(withBackoff: boolean): void {
  if (runtime.reconnectTimer) {
    clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
  }
  if (!withBackoff || !runtime.settings) {
    return;
  }
  runtime.reconnectTimer = setTimeout(() => {
    void retryConnection();
  }, 5_000);
}

export function switchStaffPrepare(): DesktopConnectionStatus {
  bumpGeneration("switch-staff");
  clearStaffLocally();
  if (runtime.settings && runtime.verifiedStallDisplayName) {
    runtime.state = "verified";
  } else if (runtime.settings) {
    runtime.state = "unreachable";
  } else {
    runtime.state = "unconfigured";
  }
  runtime.lastErrorMessage = null;
  return getConnectionStatus();
}

export type AuthenticatedHostRequestOptions = {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
};

export type AuthenticatedHostResponse = {
  status: number;
  bodyText: string;
  requestGeneration: number;
};

/**
 * Signed staff+device request to the configured host.
 * Session secrets stay in the main process. Callers must ignore stale generations.
 */
export async function authenticatedHostRequest(
  options: AuthenticatedHostRequestOptions,
): Promise<AuthenticatedHostResponse> {
  const settings = runtime.settings;
  const staff = runtime.staff;
  const pins = getHostTrustPins();
  if (!settings || !pins) {
    throw new Error("Stall host unavailable");
  }
  if (!staff || runtime.state !== "signed_in") {
    throw new Error("Staff session required.");
  }

  const generation = runtime.requestGeneration;
  const deviceProof = buildDeviceProof(options.method, options.path);
  const url = new URL(options.path, serviceBaseUrl(settings));
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value.length > 0) {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    "x-polivo-device-id": deviceProof.deviceId,
    "x-polivo-device-signed-at": deviceProof.signedAt,
    "x-polivo-device-signature": deviceProof.signature,
    "x-polivo-session": staff.sessionSecret,
  };
  if (options.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await pinnedHttpsRequest({
    method: options.method,
    url: url.toString(),
    expectedCertificateSha256: pins.tlsCertificateSha256,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeoutMs: REQUEST_TIMEOUT_MS,
    signal: runtime.abortController.signal,
  });

  if (response.status === 401) {
    clearStaffLocally();
    runtime.state = "session_refresh_required";
    runtime.lastErrorMessage = mapApiErrorMessage(
      response.status,
      response.bodyText,
      "Session refresh required.",
    );
  } else if (response.status === 0 || response.status >= 500) {
    runtime.state = "unreachable";
    runtime.lastErrorMessage = "Stall host unavailable";
  }

  return {
    status: response.status,
    bodyText: response.bodyText,
    requestGeneration: generation,
  };
}

export function getConnectionRequestGeneration(): number {
  return runtime.requestGeneration;
}

export function isStaffSignedIn(): boolean {
  return runtime.state === "signed_in" && runtime.staff !== null;
}

export function mapHostApiError(status: number, bodyText: string, fallback: string): string {
  return mapApiErrorMessage(status, bodyText, fallback);
}
