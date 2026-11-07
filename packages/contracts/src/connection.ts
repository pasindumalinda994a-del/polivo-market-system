import { z } from "zod";

import { absoluteTimestampSchema, deviceIdSchema } from "./primitives.js";

/** SHA-256 fingerprint of the stall-service TLS certificate (lowercase hex). */
export const tlsCertificateSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected lowercase hex SHA-256 certificate fingerprint.");

/** Raw Ed25519 public key as base64url (32 bytes). */
export const ed25519PublicKeySchema = z.string().min(16).max(512);

/**
 * Trust material returned at host accept / identity verification.
 * Editable network address is never part of this bundle.
 */
export const hostTrustBundleSchema = z.object({
  hostDeviceId: deviceIdSchema,
  hostPublicKey: ed25519PublicKeySchema,
  hostCredentialVersion: z.number().int().positive(),
  stallDisplayName: z.string().min(1).max(128),
  tlsCertificateSha256: tlsCertificateSha256Schema,
});

export const hostIdentityResponseSchema = hostTrustBundleSchema.extend({
  signedAt: absoluteTimestampSchema,
  /** Ed25519 signature over the canonical host-identity message. */
  signature: z.string().min(16).max(1024),
});

export const CONNECTION_STATES = [
  "unconfigured",
  "unreachable",
  "identity_failed",
  "verified",
  "signed_in",
  "session_refresh_required",
  "signed_out",
] as const;

export const connectionStateSchema = z.enum(CONNECTION_STATES);

/** Renderer-safe connection status — no secrets, proofs, or raw URLs required. */
export const desktopConnectionStatusSchema = z.object({
  state: connectionStateSchema,
  pairedHostDeviceId: deviceIdSchema.nullable(),
  verifiedStallDisplayName: z.string().min(1).max(128).nullable(),
  configuredHostLabel: z.string().max(256).nullable(),
  lastSuccessfulCheckAt: absoluteTimestampSchema.nullable(),
  lastErrorMessage: z.string().max(512).nullable(),
  staffDisplayName: z.string().min(1).max(128).nullable(),
  staffCode: z.string().min(1).max(64).nullable(),
  capabilities: z.array(z.string().min(1).max(128)),
});

export const configureHostAddressRequestSchema = z.object({
  /** Hostname or IPv4/IPv6 address only — no credentials, no path. */
  hostAddress: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535).default(3040),
});

export const configureHostAddressResultSchema = z.object({
  ok: z.boolean(),
  verifiedStallDisplayName: z.string().min(1).max(128).nullable(),
  hostDeviceId: deviceIdSchema.nullable(),
  message: z.string().max(512),
});

export type HostTrustBundle = z.infer<typeof hostTrustBundleSchema>;
export type HostIdentityResponse = z.infer<typeof hostIdentityResponseSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type DesktopConnectionStatus = z.infer<typeof desktopConnectionStatusSchema>;
export type ConfigureHostAddressRequest = z.infer<typeof configureHostAddressRequestSchema>;
export type ConfigureHostAddressResult = z.infer<typeof configureHostAddressResultSchema>;

/**
 * Canonical message signed by the host Ed25519 key for identity verification.
 * Field order is load-bearing — do not reorder.
 */
export function buildHostIdentityMessage(input: {
  hostDeviceId: string;
  hostPublicKey: string;
  hostCredentialVersion: number;
  stallDisplayName: string;
  tlsCertificateSha256: string;
  signedAt: string;
}): string {
  return [
    "polivo-host-identity-v1",
    input.hostDeviceId,
    input.hostPublicKey,
    String(input.hostCredentialVersion),
    input.stallDisplayName,
    input.tlsCertificateSha256,
    input.signedAt,
  ].join("\n");
}
