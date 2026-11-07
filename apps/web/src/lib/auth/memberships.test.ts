import { describe, expect, it } from "vitest";

import {
  assertOwnerAccess,
  listActiveMemberships,
  resolveTenantAccess,
  type MembershipQueryPort,
  type MembershipSummary,
} from "./memberships";
import { WebAuthError } from "./errors";

function membership(
  partial: Partial<MembershipSummary> & Pick<MembershipSummary, "tenantId">,
): MembershipSummary {
  return {
    membershipId: partial.membershipId ?? `m-${partial.tenantId}`,
    tenantId: partial.tenantId,
    accessRole: partial.accessRole ?? "billing_staff",
    membershipStatus: partial.membershipStatus ?? "active",
    tenantStatus: partial.tenantStatus ?? "active",
    displayName: partial.displayName ?? `Stall ${partial.tenantId}`,
    timezone: partial.timezone ?? "Asia/Colombo",
  };
}

describe("listActiveMemberships", () => {
  it("returns an empty list when there are no memberships", async () => {
    const port: MembershipQueryPort = {
      listMembershipsForSubject: async () => ({ status: "ok", memberships: [] }),
    };

    await expect(listActiveMemberships("user_1", port)).resolves.toEqual({
      status: "ok",
      memberships: [],
    });
  });

  it("keeps active operational memberships and drops inactive ones", async () => {
    const port: MembershipQueryPort = {
      listMembershipsForSubject: async () => ({
        status: "ok",
        memberships: [
          membership({ tenantId: "t-active", accessRole: "owner" }),
          membership({ tenantId: "t-inactive", membershipStatus: "inactive" }),
          membership({ tenantId: "t-suspended", membershipStatus: "suspended" }),
        ],
      }),
    };

    const result = await listActiveMemberships("user_1", port);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.memberships.map((item) => item.tenantId)).toEqual(["t-active"]);
    }
  });

  it("preserves multiple active memberships without auto-selecting one", async () => {
    const port: MembershipQueryPort = {
      listMembershipsForSubject: async () => ({
        status: "ok",
        memberships: [membership({ tenantId: "t-1" }), membership({ tenantId: "t-2" })],
      }),
    };

    const result = await listActiveMemberships("user_1", port);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.memberships).toHaveLength(2);
    }
  });

  it("keeps database failure distinct from an empty membership list", async () => {
    const port: MembershipQueryPort = {
      listMembershipsForSubject: async () => ({
        status: "unavailable",
        message: "Unable to load stall memberships.",
      }),
    };

    await expect(listActiveMemberships("user_1", port)).resolves.toEqual({
      status: "unavailable",
      message: "Unable to load stall memberships.",
    });
  });
});

describe("resolveTenantAccess", () => {
  it("allows only verified active memberships for the requested tenant", async () => {
    const port: MembershipQueryPort = {
      listMembershipsForSubject: async () => ({
        status: "ok",
        memberships: [membership({ tenantId: "t-allowed" })],
      }),
    };

    await expect(resolveTenantAccess("user_1", "t-allowed", port)).resolves.toMatchObject({
      status: "allowed",
      membership: { tenantId: "t-allowed" },
    });
    await expect(resolveTenantAccess("user_1", "t-other", port)).resolves.toEqual({
      status: "denied",
    });
  });

  it("denies inactive membership for the requested tenant", async () => {
    const port: MembershipQueryPort = {
      listMembershipsForSubject: async () => ({
        status: "ok",
        memberships: [membership({ tenantId: "t-1", membershipStatus: "inactive" })],
      }),
    };

    await expect(resolveTenantAccess("user_1", "t-1", port)).resolves.toEqual({
      status: "denied",
    });
  });
});

describe("assertOwnerAccess", () => {
  it("allows active owners only", () => {
    expect(assertOwnerAccess(membership({ tenantId: "t-1", accessRole: "owner" })).accessRole).toBe(
      "owner",
    );
    expect(() => assertOwnerAccess(membership({ tenantId: "t-1", accessRole: "cashier" }))).toThrow(
      WebAuthError,
    );
  });
});
