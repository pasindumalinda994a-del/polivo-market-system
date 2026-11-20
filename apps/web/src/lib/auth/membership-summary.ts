import type { MembershipAccessRole, MembershipStatus, TenantStatus } from "@polivo/db-cloud/types";

/**
 * Client-safe membership summary + capability helpers.
 * Keep this module free of Clerk/Supabase server imports so UI shells can use it.
 */
export type MembershipSummary = {
  membershipId: string;
  tenantId: string;
  accessRole: MembershipAccessRole;
  membershipStatus: MembershipStatus;
  tenantStatus: TenantStatus;
  displayName: string;
  timezone: string;
  capabilities: string[];
};

export function membershipHasCapability(membership: MembershipSummary, capability: string): boolean {
  if (membership.accessRole === "owner") {
    return true;
  }
  return membership.capabilities.includes(capability);
}
