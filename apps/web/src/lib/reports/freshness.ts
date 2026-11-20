import {
  getStallReportingFreshness,
  type StallReportingFreshness,
  type UserReportingClient,
} from "@polivo/db-cloud";

export type FreshnessLabel = "no_data" | "through_cutoff" | "host_stale" | "freshness_unknown";

export type FreshnessPresentation = {
  label: FreshnessLabel;
  title: string;
  description: string;
  freshness: StallReportingFreshness;
};

const STALE_HOST_MS = 6 * 60 * 60 * 1000;

export function mapReportingFreshness(
  freshness: StallReportingFreshness,
  nowMs = Date.now(),
): FreshnessPresentation {
  if (!freshness.hasAnyAppliedData) {
    return {
      label: "no_data",
      title: "No synchronized financial data yet",
      description:
        "Cloud reporting will appear after the stall host uploads financial data. This view does not connect to the local LAN service.",
      freshness,
    };
  }

  const lastApplied = freshness.lastAppliedUploadAt
    ? Date.parse(freshness.lastAppliedUploadAt)
    : Number.NaN;
  const lastHost = freshness.lastHostContactAt
    ? Date.parse(freshness.lastHostContactAt)
    : Number.NaN;

  if (Number.isFinite(lastApplied)) {
    const appliedIso = freshness.lastAppliedUploadAt!;
    const hostNote =
      Number.isFinite(lastHost) && nowMs - lastHost > STALE_HOST_MS
        ? " Host contact looks stale; totals remain at the last applied cutoff."
        : "";
    return {
      label:
        Number.isFinite(lastHost) && nowMs - lastHost > STALE_HOST_MS
          ? "host_stale"
          : "through_cutoff",
      title: `Cloud data through ${appliedIso}`,
      description: `Figures use applied sync through posting sequence ${freshness.appliedMaxPostingSequence}.${hostNote}`,
      freshness,
    };
  }

  return {
    label: "freshness_unknown",
    title: "Cloud freshness could not be determined",
    description:
      "Applied sync timing was not observed. Refresh to re-query; reporting still uses watermark-bound snapshots.",
    freshness,
  };
}

export async function loadStallReportingFreshness(
  client: UserReportingClient,
  tenantId: string,
): Promise<FreshnessPresentation> {
  const raw = await getStallReportingFreshness(client, tenantId);
  return mapReportingFreshness(raw);
}
