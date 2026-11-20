import {
  isDownloadablePublicationState,
  publicReleaseSummarySchema,
  releaseCatalogSchema,
  type PublicReleaseSummary,
  type ReleaseCatalog,
  type ReleaseCatalogEntry,
} from "@polivo/contracts";

/**
 * Version-controlled release catalog (Phase 37).
 *
 * Until Phase 44 produces Windows installer artifacts and Phase 45 records
 * verified signing, this catalog remains empty of downloadable releases.
 * Planned placeholders must not produce active download buttons.
 *
 * Later phases append verified entries here (or replace this module with an
 * automated publication source that still validates against the same contracts).
 */
const RAW_CATALOG: ReleaseCatalog = {
  catalogVersion: 1,
  generatedAt: "2026-11-20T00:00:00.000Z",
  entries: [],
};

/** Optional planned entry used only in tests / documentation examples — not shipped as downloadable. */
export const PLANNED_WINDOWS_HOST_RELEASE_NOTES =
  "Windows host and terminal packaging is delivered in Phase 44. Signed updates and compatibility enforcement arrive in Phase 45. Deployment automation is Phase 46.";

export function loadReleaseCatalog(): ReleaseCatalog {
  return releaseCatalogSchema.parse(RAW_CATALOG);
}

export function listCatalogEntries(): ReleaseCatalogEntry[] {
  return loadReleaseCatalog().entries;
}

export function getCatalogEntry(releaseId: string): ReleaseCatalogEntry | null {
  return listCatalogEntries().find((entry) => entry.releaseId === releaseId) ?? null;
}

/**
 * Approved HTTPS origins for artifact destinations.
 * Empty until operator configuration supplies trusted release hosts.
 * Comma-separated hostnames in POLIVO_RELEASE_DOWNLOAD_ORIGINS (no paths).
 */
export function getApprovedDownloadOrigins(): readonly string[] {
  const raw = process.env.POLIVO_RELEASE_DOWNLOAD_ORIGINS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

export function isApprovedDownloadUrl(
  downloadUrl: string,
  approvedOrigins: readonly string[] = getApprovedDownloadOrigins(),
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(downloadUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return approvedOrigins.some((origin) => origin === host);
}

/**
 * A release is downloadable only when publication is available, not withdrawn,
 * an artifact URL exists, and that URL is on an approved HTTPS origin.
 */
export function isReleaseDownloadable(
  entry: ReleaseCatalogEntry,
  approvedOrigins: readonly string[] = getApprovedDownloadOrigins(),
): boolean {
  if (!isDownloadablePublicationState(entry.publicationState)) {
    return false;
  }
  if (entry.withdrawnAt !== null) {
    return false;
  }
  if (entry.signingStatus === "failed") {
    return false;
  }
  const url = entry.artifact?.downloadUrl;
  if (!url) {
    return false;
  }
  return isApprovedDownloadUrl(url, approvedOrigins);
}

export function toPublicReleaseSummary(
  entry: ReleaseCatalogEntry,
  approvedOrigins: readonly string[] = getApprovedDownloadOrigins(),
): PublicReleaseSummary {
  const downloadAvailable = isReleaseDownloadable(entry, approvedOrigins);
  return publicReleaseSummarySchema.parse({
    releaseId: entry.releaseId,
    productVersion: entry.productVersion,
    channel: entry.channel,
    publicationState: entry.publicationState,
    publishedAt: entry.publishedAt,
    operatingSystem: entry.operatingSystem,
    architecture: entry.architecture,
    artifactFilename: entry.artifact?.filename ?? null,
    artifactSizeBytes: entry.artifact?.sizeBytes ?? null,
    sha256: entry.artifact?.sha256 ?? null,
    releaseNotes: entry.releaseNotes,
    minimumLocalApiContractVersion: entry.minimumLocalApiContractVersion,
    minimumSyncProtocolVersion: entry.minimumSyncProtocolVersion,
    signingStatus: entry.signingStatus,
    downloadAvailable,
  });
}

export function listPublicReleases(
  approvedOrigins: readonly string[] = getApprovedDownloadOrigins(),
): PublicReleaseSummary[] {
  return listCatalogEntries().map((entry) => toPublicReleaseSummary(entry, approvedOrigins));
}

export function listDownloadableProductionReleases(
  approvedOrigins: readonly string[] = getApprovedDownloadOrigins(),
): PublicReleaseSummary[] {
  return listPublicReleases(approvedOrigins).filter(
    (entry) => entry.publicationState === "available_production" && entry.downloadAvailable,
  );
}

export function listDownloadableTestReleases(
  approvedOrigins: readonly string[] = getApprovedDownloadOrigins(),
): PublicReleaseSummary[] {
  return listPublicReleases(approvedOrigins).filter(
    (entry) => entry.publicationState === "available_test" && entry.downloadAvailable,
  );
}
