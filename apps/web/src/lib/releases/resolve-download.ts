import { getCatalogEntry, isApprovedDownloadUrl, isReleaseDownloadable } from "./catalog";

export type ResolveDownloadResult =
  | { ok: true; releaseId: string; downloadUrl: string; filename: string }
  | {
      ok: false;
      code:
        | "UNKNOWN_RELEASE"
        | "NOT_AVAILABLE"
        | "WITHDRAWN"
        | "INVALID_DESTINATION"
        | "MISSING_ARTIFACT";
      message: string;
    };

/**
 * Resolve a trusted download destination from a known release identifier.
 * Never accepts a client-supplied download URL.
 */
export function resolveTrustedDownload(
  releaseId: string,
  approvedOrigins?: readonly string[],
): ResolveDownloadResult {
  const trimmed = releaseId.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "UNKNOWN_RELEASE",
      message: "Release identifier is required.",
    };
  }

  const entry = getCatalogEntry(trimmed);
  if (!entry) {
    return {
      ok: false,
      code: "UNKNOWN_RELEASE",
      message: "No release matches that identifier.",
    };
  }

  if (entry.publicationState === "withdrawn" || entry.withdrawnAt !== null) {
    return {
      ok: false,
      code: "WITHDRAWN",
      message: "This release has been withdrawn and is no longer available for download.",
    };
  }

  if (!entry.artifact?.downloadUrl) {
    return {
      ok: false,
      code: "MISSING_ARTIFACT",
      message: "This release does not have a distributable artifact yet.",
    };
  }

  if (!isReleaseDownloadable(entry, approvedOrigins)) {
    return {
      ok: false,
      code: "NOT_AVAILABLE",
      message: "This release is not available for download.",
    };
  }

  if (!isApprovedDownloadUrl(entry.artifact.downloadUrl, approvedOrigins)) {
    return {
      ok: false,
      code: "INVALID_DESTINATION",
      message: "The release download destination is not approved.",
    };
  }

  return {
    ok: true,
    releaseId: entry.releaseId,
    downloadUrl: entry.artifact.downloadUrl,
    filename: entry.artifact.filename,
  };
}
