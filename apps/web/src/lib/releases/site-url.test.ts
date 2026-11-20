import { afterEach, describe, expect, it } from "vitest";

import { absolutePublicUrl, getPublicSiteOrigin, PUBLIC_INDEXABLE_PATHS } from "./site-url";

describe("public site URL helpers", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousVercel = process.env.VERCEL_URL;

  afterEach(() => {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    }
    if (previousVercel === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = previousVercel;
    }
  });

  it("returns null when no trusted origin is configured", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    expect(getPublicSiteOrigin()).toBeNull();
    expect(absolutePublicUrl("/downloads")).toBeNull();
  });

  it("accepts NEXT_PUBLIC_APP_URL origin only", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(getPublicSiteOrigin()).toBe("https://app.example.com");
    expect(absolutePublicUrl("/downloads")).toBe("https://app.example.com/downloads");
    expect(absolutePublicUrl("//evil")).toBeNull();
  });

  it("lists only public indexable paths", () => {
    expect(PUBLIC_INDEXABLE_PATHS).toContain("/");
    expect(PUBLIC_INDEXABLE_PATHS).toContain("/downloads");
    expect(PUBLIC_INDEXABLE_PATHS).not.toContain("/dashboard");
    expect(PUBLIC_INDEXABLE_PATHS).not.toContain("/invitations");
  });
});
