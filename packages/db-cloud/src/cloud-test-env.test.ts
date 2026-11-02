import { describe, expect, it } from "vitest";

import { resolveCloudTestEnv } from "./test/isolation/env.js";

describe("resolveCloudTestEnv", () => {
  it("accepts default loopback targets", () => {
    const env = resolveCloudTestEnv({});
    expect(env.databaseUrl).toContain("127.0.0.1");
    expect(env.supabaseUrl).toContain("127.0.0.1");
  });

  it("rejects non-loopback database urls without allow-remote", () => {
    expect(() =>
      resolveCloudTestEnv({
        POLIVO_CLOUD_TEST_DATABASE_URL: "postgresql://postgres:secret@db.example.com:5432/postgres",
      }),
    ).toThrow(/non-loopback/);
  });

  it("rejects non-loopback supabase urls without allow-remote", () => {
    expect(() =>
      resolveCloudTestEnv({
        POLIVO_CLOUD_TEST_SUPABASE_URL: "https://abcdefgh.supabase.co",
      }),
    ).toThrow(/non-loopback/);
  });

  it("allows remote targets when POLIVO_CLOUD_TEST_ALLOW_REMOTE=1", () => {
    const env = resolveCloudTestEnv({
      POLIVO_CLOUD_TEST_ALLOW_REMOTE: "1",
      POLIVO_CLOUD_TEST_DATABASE_URL: "postgresql://postgres:secret@db.example.com:5432/postgres",
      POLIVO_CLOUD_TEST_SUPABASE_URL: "https://abcdefgh.supabase.co",
      POLIVO_CLOUD_TEST_PUBLISHABLE_KEY: "lab-key",
    });
    expect(env.databaseUrl).toContain("db.example.com");
    expect(env.supabaseUrl).toContain("supabase.co");
  });
});
