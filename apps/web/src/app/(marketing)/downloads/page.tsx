import Link from "next/link";

import type { PublicReleaseSummary } from "@polivo/contracts";
import { Alert, AlertDescription, AlertTitle, Badge, Button } from "@polivo/ui";

import { PublicPage, PublicSection } from "@/components/public-page";
import { buildPublicMetadata } from "@/lib/public/metadata";
import {
  listDownloadableProductionReleases,
  listDownloadableTestReleases,
  listPublicReleases,
  PLANNED_WINDOWS_HOST_RELEASE_NOTES,
} from "@/lib/releases/catalog";

export const metadata = buildPublicMetadata({
  title: "Downloads",
  description:
    "Download verified Polivo desktop releases when available. Planned or unverified builds are not offered as active downloads.",
  pathname: "/downloads",
});

export const dynamic = "force-dynamic";

function formatBytes(size: number | null): string {
  if (size === null) {
    return "Size unknown";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function signingLabel(status: PublicReleaseSummary["signingStatus"]): string {
  switch (status) {
    case "verified":
      return "Signing verified";
    case "verification_pending":
      return "Signing verification pending";
    case "unsigned":
      return "Unsigned";
    case "failed":
      return "Signing verification failed";
    default:
      return "Signing not applicable";
  }
}

function ReleaseCard({ release }: { release: PublicReleaseSummary }) {
  return (
    <article className="space-y-3 rounded-md border border-border bg-bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground">
          {release.productVersion} · {release.operatingSystem} {release.architecture}
        </h3>
        <Badge variant={release.channel === "stable" ? "default" : "secondary"}>
          {release.channel}
        </Badge>
        <Badge variant="outline">{release.publicationState.replaceAll("_", " ")}</Badge>
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{release.releaseNotes}</p>
      <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="font-medium text-foreground">Published</dt>
          <dd>{release.publishedAt ?? "Not published"}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Artifact</dt>
          <dd>
            {release.artifactFilename ?? "None"} · {formatBytes(release.artifactSizeBytes)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">SHA-256</dt>
          <dd className="break-all font-mono text-xs">{release.sha256 ?? "Not available"}</dd>
          <dd className="mt-1 text-xs">
            Checksum verifies artifact integrity; it is not proof of publisher identity.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Signing</dt>
          <dd>{signingLabel(release.signingStatus)}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Compatibility</dt>
          <dd>
            Local API {release.minimumLocalApiContractVersion ?? "n/a"} · Sync protocol{" "}
            {release.minimumSyncProtocolVersion ?? "n/a"}
          </dd>
        </div>
      </dl>
      {release.downloadAvailable ? (
        <Button asChild>
          <Link href={`/api/downloads/${encodeURIComponent(release.releaseId)}`}>
            Download {release.artifactFilename}
          </Link>
        </Button>
      ) : (
        <p className="text-sm font-medium text-muted-foreground">
          Download is not available for this entry.
        </p>
      )}
    </article>
  );
}

export default function DownloadsPage() {
  const production = listDownloadableProductionReleases();
  const test = listDownloadableTestReleases();
  const all = listPublicReleases();
  const hasAnyDownload = production.length > 0 || test.length > 0;

  return (
    <PublicPage
      title="Downloads"
      description="Desktop installers are published only after packaging and verification. This page never invents a download link."
    >
      {!hasAnyDownload ? (
        <Alert>
          <AlertTitle>Desktop downloads are not available yet.</AlertTitle>
          <AlertDescription>
            {PLANNED_WINDOWS_HOST_RELEASE_NOTES} Use the{" "}
            <Link href="/setup" className="font-medium underline-offset-4 hover:underline">
              setup guide
            </Link>{" "}
            to understand the enrollment order while packaging work continues.
          </AlertDescription>
        </Alert>
      ) : null}

      {production.length > 0 ? (
        <PublicSection title="Production releases">
          <div className="space-y-4">
            {production.map((release) => (
              <ReleaseCard key={release.releaseId} release={release} />
            ))}
          </div>
        </PublicSection>
      ) : null}

      {test.length > 0 ? (
        <PublicSection title="Test releases">
          <p className="text-sm text-muted-foreground">
            Test builds are clearly separated from production. Do not treat them as
            production-ready.
          </p>
          <div className="mt-4 space-y-4">
            {test.map((release) => (
              <ReleaseCard key={release.releaseId} release={release} />
            ))}
          </div>
        </PublicSection>
      ) : null}

      {all.length > 0 && !hasAnyDownload ? (
        <PublicSection title="Catalog entries without downloads">
          <p>
            The catalog lists planned or withdrawn entries for operators. They do not produce active
            download buttons.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {all.map((release) => (
              <li key={release.releaseId}>
                {release.productVersion} ({release.publicationState.replaceAll("_", " ")})
              </li>
            ))}
          </ul>
        </PublicSection>
      ) : null}

      <PublicSection title="Installation prerequisites">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            A Windows computer designated as the stall host (or a terminal connecting to one).
          </li>
          <li>An online Polivo account with stall membership or creation permission.</li>
          <li>Owner authorization for host enrollment and first local owner setup.</li>
          <li>
            Follow the{" "}
            <Link
              href="/setup"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              setup guide
            </Link>
            . Downloading an installer does not prove installation, enrollment, or service
            readiness.
          </li>
        </ul>
      </PublicSection>
    </PublicPage>
  );
}
