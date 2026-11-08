import type { MembershipAccessRole, MembershipStatus, TenantStatus } from "@polivo/db-cloud/types";

import { forbiddenError, serviceUnavailableError } from "./errors";
import { createRequestUserSupabaseClient, type UserSupabaseClient } from "./supabase-user";

const ACTIVE_ACCESS_ROLES = new Set<MembershipAccessRole>(["owner", "billing_staff", "cashier"]);

export type MembershipSummary = {
  membershipId: string;
  tenantId: string;
  accessRole: MembershipAccessRole;
  membershipStatus: MembershipStatus;
  tenantStatus: TenantStatus;
  displayName: string;
  timezone: string;
};

export type MembershipListResult =
  { status: "ok"; memberships: MembershipSummary[] } | { status: "unavailable"; message: string };

export type MembershipQueryPort = {
  listMembershipsForSubject: (subject: string) => Promise<MembershipListResult>;
};

type MembershipRow = {
  id: string;
  tenant_id: string;
  status: MembershipStatus;
  access_role: MembershipAccessRole;
};

type TenantRow = {
  id: string;
  status: TenantStatus;
  display_name: string;
  timezone: string;
};

function createSupabaseMembershipPort(client: UserSupabaseClient): MembershipQueryPort {
  return {
    async listMembershipsForSubject(subject: string): Promise<MembershipListResult> {
      // Own-row filter: owners can also SELECT peer memberships via RLS, so we
      // explicitly scope dashboard/access resolution to the caller's subject.
      const membershipQuery = await client
        .from("tenant_memberships")
        .select("id, tenant_id, status, access_role")
        .eq("external_subject", subject);

      if (membershipQuery.error) {
        return {
          status: "unavailable",
          message: "Unable to load stall memberships.",
        };
      }

      const rows = (membershipQuery.data ?? []) as MembershipRow[];
      if (rows.length === 0) {
        return { status: "ok", memberships: [] };
      }

      const tenantIds = [...new Set(rows.map((row) => row.tenant_id))];
      const tenantsQuery = await client
        .from("tenants")
        .select("id, status, display_name, timezone")
        .in("id", tenantIds);

      if (tenantsQuery.error) {
        return {
          status: "unavailable",
          message: "Unable to load stall memberships.",
        };
      }

      const tenantsById = new Map(
        ((tenantsQuery.data ?? []) as TenantRow[]).map((tenant) => [tenant.id, tenant]),
      );

      const memberships: MembershipSummary[] = [];
      for (const row of rows) {
        const tenant = tenantsById.get(row.tenant_id);
        if (!tenant) {
          continue;
        }
        memberships.push({
          membershipId: row.id,
          tenantId: row.tenant_id,
          accessRole: row.access_role,
          membershipStatus: row.status,
          tenantStatus: tenant.status,
          displayName: tenant.display_name,
          timezone: tenant.timezone,
        });
      }

      return { status: "ok", memberships };
    },
  };
}

export async function listActiveMemberships(
  subject: string,
  port?: MembershipQueryPort,
): Promise<MembershipListResult> {
  const queryPort = port ?? createSupabaseMembershipPort(createRequestUserSupabaseClient());
  const result = await queryPort.listMembershipsForSubject(subject);
  if (result.status === "unavailable") {
    return result;
  }

  const active = result.memberships.filter(
    (membership) =>
      membership.membershipStatus === "active" && ACTIVE_ACCESS_ROLES.has(membership.accessRole),
  );

  return { status: "ok", memberships: active };
}

export type TenantAccessResult =
  | { status: "allowed"; membership: MembershipSummary }
  | { status: "denied" }
  | { status: "unavailable"; message: string };

/**
 * Validates active membership for a requested tenant.
 * Does not trust client-stored tenant selection.
 */
export async function resolveTenantAccess(
  subject: string,
  tenantId: string,
  port?: MembershipQueryPort,
): Promise<TenantAccessResult> {
  const trimmed = tenantId.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return { status: "denied" };
  }

  const listed = await listActiveMemberships(subject, port);
  if (listed.status === "unavailable") {
    return listed;
  }

  const membership = listed.memberships.find((item) => item.tenantId === trimmed);
  if (!membership) {
    return { status: "denied" };
  }

  return { status: "allowed", membership };
}

export function assertTenantAccessAllowed(result: TenantAccessResult): MembershipSummary {
  if (result.status === "unavailable") {
    throw serviceUnavailableError(result.message);
  }
  if (result.status === "denied") {
    throw forbiddenError("You do not have access to this stall.");
  }
  return result.membership;
}

export function assertOwnerAccess(membership: MembershipSummary): MembershipSummary {
  if (membership.accessRole !== "owner" || membership.membershipStatus !== "active") {
    throw forbiddenError("Only the stall owner can manage members and permissions.");
  }
  return membership;
}
