import { platformDirectoryQuerySchema } from "@polivo/contracts";

import { requirePageUser } from "@/lib/auth/require-user";
import { listPlatformStallDirectory, resolvePlatformAdminAccess } from "@/lib/platform/admin";

import { PlatformDirectoryClient } from "./directory-client";
import { PlatformShell } from "./platform-shell";

export const dynamic = "force-dynamic";

type PlatformPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformDirectoryPage({ searchParams }: PlatformPageProps) {
  await requirePageUser("/platform");

  let isAdmin: boolean;
  try {
    isAdmin = await resolvePlatformAdminAccess();
  } catch {
    return <PlatformShell state="unavailable" message="Unable to verify platform access." />;
  }

  if (!isAdmin) {
    return <PlatformShell state="denied" />;
  }

  const raw = await searchParams;
  const parsed = platformDirectoryQuerySchema.safeParse({
    limit: typeof raw.limit === "string" ? raw.limit : undefined,
    offset: typeof raw.offset === "string" ? raw.offset : undefined,
    search: typeof raw.search === "string" ? raw.search : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const query = parsed.success
    ? parsed.data
    : { limit: 50, offset: 0, search: undefined, status: undefined };

  const directory = await listPlatformStallDirectory(query);

  return (
    <PlatformShell state="allowed" title="Stall directory" activeNav="directory">
      <PlatformDirectoryClient
        stalls={directory.stalls}
        totalCount={directory.totalCount}
        limit={directory.limit}
        offset={directory.offset}
        search={query.search ?? ""}
        status={query.status ?? ""}
      />
    </PlatformShell>
  );
}
