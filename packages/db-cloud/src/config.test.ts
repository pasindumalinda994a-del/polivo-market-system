import { describe, expect, it } from "vitest";

import { CloudConfigError, loadUserCloudConfig, USER_CLOUD_ENV_NAMES } from "./config.js";

describe("loadUserCloudConfig", () => {
  it("loads url and publishable key", () => {
    const config = loadUserCloudConfig({
      [USER_CLOUD_ENV_NAMES.url]: "http://127.0.0.1:54321",
      [USER_CLOUD_ENV_NAMES.publishableKey]: "publishable-test-key",
    });
    expect(config).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "publishable-test-key",
    });
  });

  it("reports missing names without values", () => {
    expect(() => loadUserCloudConfig({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() =>
      loadUserCloudConfig({
        [USER_CLOUD_ENV_NAMES.url]: "http://127.0.0.1:54321",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects non-http urls", () => {
    expect(() =>
      loadUserCloudConfig({
        [USER_CLOUD_ENV_NAMES.url]: "not-a-url",
        [USER_CLOUD_ENV_NAMES.publishableKey]: "key",
      }),
    ).toThrow(CloudConfigError);
  });
});
