import { describe, expect, it } from "vitest";

import {
  DEFAULT_POST_AUTH_PATH,
  buildSignInUrl,
  isProtectedPath,
  resolveSafeRedirectPath,
} from "./redirects";

describe("resolveSafeRedirectPath", () => {
  it("defaults when candidate is missing", () => {
    expect(resolveSafeRedirectPath(undefined)).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath(null)).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath("")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("accepts same-origin absolute paths", () => {
    expect(resolveSafeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(resolveSafeRedirectPath("/tenants/stall-1?tab=overview")).toBe(
      "/tenants/stall-1?tab=overview",
    );
  });

  it("rejects external, protocol-relative, and malformed targets", () => {
    expect(resolveSafeRedirectPath("https://evil.example/phish")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath("//evil.example/phish")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath("/\\evil.example")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("rejects auth routes that would loop", () => {
    expect(resolveSafeRedirectPath("/sign-in")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath("/sign-in/factor")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(resolveSafeRedirectPath("/sign-up")).toBe(DEFAULT_POST_AUTH_PATH);
  });
});

describe("buildSignInUrl", () => {
  it("omits redirect when none is supplied", () => {
    expect(buildSignInUrl()).toBe("/sign-in");
  });

  it("includes a validated redirect_url", () => {
    expect(buildSignInUrl("/tenants/a")).toBe("/sign-in?redirect_url=%2Ftenants%2Fa");
  });
});

describe("isProtectedPath", () => {
  it("classifies public and protected routes", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/sign-in")).toBe(false);
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/tenants/x")).toBe(true);
    expect(isProtectedPath("/invitations/token")).toBe(true);
    expect(isProtectedPath("/api/auth/session")).toBe(true);
  });

  it("allows machine enrollment and local-staff setup redeem without Clerk", () => {
    expect(isProtectedPath("/api/device-enrollment/redeem")).toBe(false);
    expect(isProtectedPath("/api/device-enrollment/confirm")).toBe(false);
    expect(isProtectedPath("/api/local-staff/setup-grants/redeem")).toBe(false);
    expect(isProtectedPath("/api/local-staff/permission-refresh/redeem")).toBe(false);
  });

  it("keeps owner local-staff setup authorize behind Clerk", () => {
    expect(isProtectedPath("/api/tenants/ten_x/local-staff/setup-grant")).toBe(true);
    expect(isProtectedPath("/api/tenants/ten_x/local-staff/permission-refresh")).toBe(true);
  });
});
