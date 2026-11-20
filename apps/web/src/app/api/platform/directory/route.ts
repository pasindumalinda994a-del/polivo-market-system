import { platformDirectoryQuerySchema } from "@polivo/contracts";

import { jsonError, jsonOk } from "@/lib/api/route-helpers";
import { forbiddenError, validationError } from "@/lib/auth/errors";
import { requireApiUser } from "@/lib/auth/require-user";
import { listPlatformStallDirectory, resolvePlatformAdminAccess } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireApiUser();
    if (!(await resolvePlatformAdminAccess())) {
      throw forbiddenError("Platform administration access is required.");
    }

    const url = new URL(request.url);
    const parsed = platformDirectoryQuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) {
      throw validationError("Invalid directory query.");
    }

    const result = await listPlatformStallDirectory(parsed.data);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
