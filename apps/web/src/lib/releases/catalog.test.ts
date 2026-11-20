import { describe, expect, it } from "vitest";

import {
  isApprovedDownloadUrl,
  isReleaseDownloadable,
  listPublicReleases,
  loadReleaseCatalog,
  toPublicReleaseSummary,
} from "./catalog";
import { resolveTrustedDownload } from "./resolve-download";
import type { ReleaseCatalogEntry } from "@polivo/contracts";

const approved = ["releases.example.com"] as const;

function sampleEntry(overrides: Partial<ReleaseCatalogEntry> = {}): ReleaseCatalogEntry {
  return {
    releaseId: "desktop-windows-x64-0.1.0",
    productVersion: "0.1.0",
    channel: "stable",
    publicationState: "available_production",
    publishedAt: "2026-11-20T12:00:00.000Z",
    operatingSystem: "windows",
    architecture: "x64",
    artifact: {
      filename: "PolivoSetup-0.1.0.exe",
      sizeBytes: 4096,
      sha256: "c".repeat(64),
      downloadUrl: "https://releases.example.com/desktop/PolivoSetup-0.1.0.exe",
    },
    releaseNotes: "Verified production release.",
    minimumLocalApiContractVersion: "1",
    minimumSyncProtocolVersion: "1",
    signingStatus: "verified",
    withdrawnAt: null,
    withdrawalReason: null,
    ...overrides,
  };
}

describe("release catalog presentation", () => {
  it("ships an empty catalog with no downloadable releases", () => {
    const catalog = loadReleaseCatalog();
    expect(catalog.entries).toHaveLength(0);
    expect(listPublicReleases()).toHaveLength(0);
  });

  it("rejects unapproved download destinations", () => {
    expect(isApprovedDownloadUrl("https://evil.example/PolivoSetup.exe", approved)).toBe(false);
    expect(isApprovedDownloadUrl("https://releases.example.com/PolivoSetup.exe", approved)).toBe(
      true,
    );
    expect(isApprovedDownloadUrl("http://releases.example.com/PolivoSetup.exe", approved)).toBe(
      false,
    );
  });

  it("does not offer download for planned or withdrawn releases", () => {
    expect(
      isReleaseDownloadable(sampleEntry({ publicationState: "planned", artifact: null }), approved),
    ).toBe(false);
    expect(
      isReleaseDownloadable(
        sampleEntry({
          publicationState: "withdrawn",
          withdrawnAt: "2026-11-21T00:00:00.000Z",
          withdrawalReason: "Checksum mismatch",
        }),
        approved,
      ),
    ).toBe(false);
  });

  it("summarizes a verified production release accurately", () => {
    const summary = toPublicReleaseSummary(sampleEntry(), approved);
    expect(summary.downloadAvailable).toBe(true);
    expect(summary.signingStatus).toBe("verified");
    expect(summary.sha256).toBe("c".repeat(64));
  });

  it("resolves only known available releases and rejects unknown ids", () => {
    expect(resolveTrustedDownload("missing-release", approved)).toEqual({
      ok: false,
      code: "UNKNOWN_RELEASE",
      message: "No release matches that identifier.",
    });
  });
});
