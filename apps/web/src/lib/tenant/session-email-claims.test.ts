import { describe, expect, it } from "vitest";

import {
  assessSessionEmailClaims,
  requireVerifiedEmailSessionClaims,
} from "./session-email-claims";

describe("assessSessionEmailClaims", () => {
  it("flags boolean false as present but not ok", () => {
    expect(
      assessSessionEmailClaims({
        email: "staff@example.com",
        email_verified: false,
      }),
    ).toMatchObject({
      hasEmail: true,
      hasEmailVerifiedClaim: true,
      emailVerifiedOk: false,
      emailVerifiedIsFalse: true,
      emailVerifiedType: "boolean",
    });
  });

  it("treats quote-wrapped true as verified", () => {
    expect(
      assessSessionEmailClaims({
        email: "staff@example.com",
        email_verified: '"true"',
      }),
    ).toMatchObject({
      emailVerifiedOk: true,
      emailVerifiedIsFalse: false,
    });
  });
});

describe("requireVerifiedEmailSessionClaims", () => {
  it("accepts email with boolean email_verified true", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims({
        email: "staff@example.com",
        email_verified: true,
      }),
    ).not.toThrow();
  });

  it("accepts string true for email_verified", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims({
        email: "staff@example.com",
        email_verified: "true",
      }),
    ).not.toThrow();
  });

  it("accepts quote-wrapped true", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims({
        email: "staff@example.com",
        email_verified: '"true"',
      }),
    ).not.toThrow();
  });

  it("rejects missing email_verified with session-token guidance", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims({
        email: "staff@example.com",
      }),
    ).toThrow(/Customize session token/);
  });

  it("rejects empty claims with session-token guidance", () => {
    expect(() => requireVerifiedEmailSessionClaims({})).toThrow(/Customize session token/);
  });

  it("rejects email_verified false with verify-email guidance", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims({
        email: "staff@example.com",
        email_verified: false,
      }),
    ).toThrow(/not verified yet/i);
  });

  it("rejects when Clerk primary email is unverified", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims(
        {
          email: "staff@example.com",
          email_verified: false,
        },
        { clerkPrimaryEmailStatus: "unverified" },
      ),
    ).toThrow(/not verified yet/i);
  });

  it("rejects explicit false when Clerk says verified (stale token)", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims(
        {
          email: "staff@example.com",
          email_verified: false,
        },
        { clerkPrimaryEmailStatus: "verified" },
      ),
    ).toThrow(/refresh the session/i);
  });

  it("allows ambiguous claim string when Clerk primary email is verified", () => {
    expect(() =>
      requireVerifiedEmailSessionClaims(
        {
          email: "staff@example.com",
          email_verified: "{{user.email_verified}}",
        },
        { clerkPrimaryEmailStatus: "verified" },
      ),
    ).not.toThrow();
  });
});
