import { describe, expect, it } from "vitest";

import {
  isDownloadablePublicationState,
  publicReleaseSummarySchema,
  releaseCatalogEntrySchema,
  releaseCatalogSchema,
} from "./releases.js";

describe("release catalog contracts", () => {
  it("accepts a planned release without an artifact", () => {
    const entry = releaseCatalogEntrySchema.parse({
      releaseId: "desktop-windows-x64-0.1.0-planned",
      productVersion: "0.1.0",
      channel: "stable",
      publicationState: "planned",
      publishedAt: null,
      operatingSystem: "windows",
      architecture: "x64",
      artifact: null,
      releaseNotes: "Planned first Windows host and terminal package (Phase 44).",
      minimumLocalApiContractVersion: "1",
      minimumSyncProtocolVersion: "1",
      signingStatus: "not_applicable",
      withdrawnAt: null,
      withdrawalReason: null,
    });
    expect(entry.publicationState).toBe("planned");
    expect(isDownloadablePublicationState(entry.publicationState)).toBe(false);
  });

  it("rejects non-HTTPS download locations", () => {
    const result = releaseCatalogEntrySchema.safeParse({
      releaseId: "bad-url",
      productVersion: "0.1.0",
      channel: "test",
      publicationState: "available_test",
      publishedAt: "2026-11-20T00:00:00.000Z",
      operatingSystem: "windows",
      architecture: "x64",
      artifact: {
        filename: "PolivoSetup.exe",
        sizeBytes: 1024,
        sha256: "a".repeat(64),
        downloadUrl: "http://example.com/PolivoSetup.exe",
      },
      releaseNotes: "Test",
      minimumLocalApiContractVersion: null,
      minimumSyncProtocolVersion: null,
      signingStatus: "unsigned",
      withdrawnAt: null,
      withdrawalReason: null,
    });
    expect(result.success).toBe(false);
  });

  it("parses an empty catalog", () => {
    const catalog = releaseCatalogSchema.parse({
      catalogVersion: 1,
      generatedAt: "2026-11-20T00:00:00.000Z",
      entries: [],
    });
    expect(catalog.entries).toHaveLength(0);
  });

  it("marks downloadAvailable separately from publication state", () => {
    const summary = publicReleaseSummarySchema.parse({
      releaseId: "desktop-windows-x64-0.1.0",
      productVersion: "0.1.0",
      channel: "stable",
      publicationState: "available_production",
      publishedAt: "2026-11-20T00:00:00.000Z",
      operatingSystem: "windows",
      architecture: "x64",
      artifactFilename: "PolivoSetup.exe",
      artifactSizeBytes: 2048,
      sha256: "b".repeat(64),
      releaseNotes: "Verified production release.",
      minimumLocalApiContractVersion: "1",
      minimumSyncProtocolVersion: "1",
      signingStatus: "verified",
      downloadAvailable: true,
    });
    expect(summary.downloadAvailable).toBe(true);
    expect(isDownloadablePublicationState(summary.publicationState)).toBe(true);
  });
});
