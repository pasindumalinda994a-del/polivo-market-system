import { describe, expect, it } from "vitest";

import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  createStallRequestSchema,
  updateMembershipRequestSchema,
  updatePermissionProfileRequestSchema,
} from "./tenant-access.js";

describe("tenant access contracts", () => {
  it("accepts a valid create-stall payload", () => {
    const parsed = createStallRequestSchema.parse({
      idempotencyKey: "onboard-1",
      displayName: "Stall 12",
      timezone: "Asia/Colombo",
      marketLocation: "Pettah",
    });
    expect(parsed.displayName).toBe("Stall 12");
  });

  it("rejects empty stall display names", () => {
    const result = createStallRequestSchema.safeParse({
      idempotencyKey: "onboard-1",
      displayName: "   ",
      timezone: "Asia/Colombo",
    });
    expect(result.success).toBe(false);
  });

  it("accepts invitation and membership update payloads", () => {
    expect(
      createInvitationRequestSchema.parse({
        email: "staff@example.com",
        accessRole: "cashier",
        capabilities: ["payments.receive_trader"],
      }).accessRole,
    ).toBe("cashier");

    expect(
      updateMembershipRequestSchema.parse({
        status: "inactive",
      }).status,
    ).toBe("inactive");
  });

  it("requires permission review confirmation", () => {
    const rejected = updatePermissionProfileRequestSchema.safeParse({
      capabilities: ["bills.create"],
      expectedRevision: 1,
      permissionsReviewed: false,
    });
    expect(rejected.success).toBe(false);

    const accepted = updatePermissionProfileRequestSchema.parse({
      capabilities: ["bills.create"],
      expectedRevision: 1,
      permissionsReviewed: true,
    });
    expect(accepted.expectedRevision).toBe(1);
  });

  it("requires invitation tokens of sufficient length", () => {
    expect(acceptInvitationRequestSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(
      acceptInvitationRequestSchema.safeParse({
        token: "a".repeat(32),
      }).success,
    ).toBe(true);
  });
});
