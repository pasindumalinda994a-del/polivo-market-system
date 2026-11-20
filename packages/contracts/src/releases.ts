import { z } from "zod";

import { absoluteTimestampSchema, opaqueIdSchema } from "./primitives.js";

/** Release distribution channel. */
export const RELEASE_CHANNELS = ["stable", "test"] as const;
export const releaseChannelSchema = z.enum(RELEASE_CHANNELS);
export type ReleaseChannel = z.infer<typeof releaseChannelSchema>;

/**
 * Publication state for a catalog entry.
 * Planned releases must not produce active download buttons.
 * Available states still require artifact verification before download is offered.
 */
export const RELEASE_PUBLICATION_STATES = [
  "planned",
  "available_test",
  "available_production",
  "withdrawn",
] as const;
export const releasePublicationStateSchema = z.enum(RELEASE_PUBLICATION_STATES);
export type ReleasePublicationState = z.infer<typeof releasePublicationStateSchema>;

export const RELEASE_OPERATING_SYSTEMS = ["windows"] as const;
export const releaseOperatingSystemSchema = z.enum(RELEASE_OPERATING_SYSTEMS);
export type ReleaseOperatingSystem = z.infer<typeof releaseOperatingSystemSchema>;

export const RELEASE_ARCHITECTURES = ["x64"] as const;
export const releaseArchitectureSchema = z.enum(RELEASE_ARCHITECTURES);
export type ReleaseArchitecture = z.infer<typeof releaseArchitectureSchema>;

/**
 * Signing verification status.
 * Do not label a release as signed merely because a metadata field says so —
 * publication depends on the artifact verification process.
 */
export const RELEASE_SIGNING_STATUSES = [
  "not_applicable",
  "unsigned",
  "verification_pending",
  "verified",
  "failed",
] as const;
export const releaseSigningStatusSchema = z.enum(RELEASE_SIGNING_STATUSES);
export type ReleaseSigningStatus = z.infer<typeof releaseSigningStatusSchema>;

const sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "SHA-256 checksum must be 64 hex characters.");

const artifactFilenameSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/, "Artifact filename contains invalid characters.");

const productVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9]+(\.[0-9]+){0,3}([-+][A-Za-z0-9.-]+)?$/, "Product version format is invalid.");

/**
 * Trusted HTTPS download URL.
 * Destination validation against approved origins happens in the server resolver.
 */
export const releaseDownloadUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Download locations must use HTTPS.",
  });

export const releaseArtifactSchema = z.strictObject({
  filename: artifactFilenameSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: sha256HexSchema,
  downloadUrl: releaseDownloadUrlSchema.nullable(),
});

export type ReleaseArtifact = z.infer<typeof releaseArtifactSchema>;

export const releaseCatalogEntrySchema = z.strictObject({
  releaseId: opaqueIdSchema,
  productVersion: productVersionSchema,
  channel: releaseChannelSchema,
  publicationState: releasePublicationStateSchema,
  publishedAt: absoluteTimestampSchema.nullable(),
  operatingSystem: releaseOperatingSystemSchema,
  architecture: releaseArchitectureSchema,
  artifact: releaseArtifactSchema.nullable(),
  releaseNotes: z.string().max(8000),
  minimumLocalApiContractVersion: z.string().min(1).max(32).nullable(),
  minimumSyncProtocolVersion: z.string().min(1).max(32).nullable(),
  signingStatus: releaseSigningStatusSchema,
  withdrawnAt: absoluteTimestampSchema.nullable(),
  withdrawalReason: z.string().max(500).nullable(),
});

export type ReleaseCatalogEntry = z.infer<typeof releaseCatalogEntrySchema>;

export const releaseCatalogSchema = z.strictObject({
  catalogVersion: z.literal(1),
  generatedAt: absoluteTimestampSchema,
  entries: z.array(releaseCatalogEntrySchema).max(200),
});

export type ReleaseCatalog = z.infer<typeof releaseCatalogSchema>;

/** Public list payload for the downloads page (no private storage credentials). */
export const publicReleaseSummarySchema = z.strictObject({
  releaseId: opaqueIdSchema,
  productVersion: productVersionSchema,
  channel: releaseChannelSchema,
  publicationState: releasePublicationStateSchema,
  publishedAt: absoluteTimestampSchema.nullable(),
  operatingSystem: releaseOperatingSystemSchema,
  architecture: releaseArchitectureSchema,
  artifactFilename: artifactFilenameSchema.nullable(),
  artifactSizeBytes: z.number().int().nonnegative().nullable(),
  sha256: sha256HexSchema.nullable(),
  releaseNotes: z.string().max(8000),
  minimumLocalApiContractVersion: z.string().min(1).max(32).nullable(),
  minimumSyncProtocolVersion: z.string().min(1).max(32).nullable(),
  signingStatus: releaseSigningStatusSchema,
  downloadAvailable: z.boolean(),
});

export type PublicReleaseSummary = z.infer<typeof publicReleaseSummarySchema>;

export function isDownloadablePublicationState(
  state: ReleasePublicationState,
): state is "available_test" | "available_production" {
  return state === "available_test" || state === "available_production";
}
