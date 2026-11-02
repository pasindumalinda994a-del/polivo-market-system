import { describe, expect, it } from "vitest";

import { effectivePostgresHostname, resolveCloudTestEnv } from "./test/isolation/env.js";

describe("resolveCloudTestEnv", () => {
  it("accepts default loopback targets", () => {
    const env = resolveCloudTestEnv({});
    expect(env.databaseUrl).toContain("127.0.0.1");
    expect(env.supabaseUrl).toContain("127.0.0.1");
  });

  it("accepts IPv6 loopback authority hosts", () => {
    const env = resolveCloudTestEnv({
      POLIVO_CLOUD_TEST_DATABASE_URL: "postgresql://postgres:postgres@[::1]:54322/postgres",
      POLIVO_CLOUD_TEST_SUPABASE_URL: "http://[::1]:54321",
    });
    expect(env.databaseUrl).toContain("[::1]");
    expect(effectivePostgresHostname(env.databaseUrl)).toBe("::1");
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

  it("rejects loopback authority with remote host query override", () => {
    expect(() =>
      resolveCloudTestEnv({
        POLIVO_CLOUD_TEST_DATABASE_URL:
          "postgresql://postgres:secret@127.0.0.1:5432/postgres?host=db.example.com",
      }),
    ).toThrow(/non-loopback/);
    expect(
      effectivePostgresHostname(
        "postgresql://postgres:secret@127.0.0.1:5432/postgres?host=db.example.com",
      ),
    ).toBe("db.example.com");
  });

  it("rejects duplicate host query params even when the first is loopback", () => {
    const ambiguous =
      "postgresql://postgres:secret@127.0.0.1:5432/postgres?host=127.0.0.1&host=db.example.com";
    expect(() =>
      resolveCloudTestEnv({
        POLIVO_CLOUD_TEST_DATABASE_URL: ambiguous,
      }),
    ).toThrow(/duplicate host/);
    expect(() =>
      resolveCloudTestEnv({
        POLIVO_CLOUD_TEST_ALLOW_REMOTE: "1",
        POLIVO_CLOUD_TEST_DATABASE_URL: ambiguous,
        POLIVO_CLOUD_TEST_SUPABASE_URL: "https://abcdefgh.supabase.co",
        POLIVO_CLOUD_TEST_PUBLISHABLE_KEY: "lab-key",
      }),
    ).toThrow(/duplicate host/);
    expect(() => effectivePostgresHostname(ambiguous)).toThrow(/duplicate host/);
  });

  it("allows remote targets when POLIVO_CLOUD_TEST_ALLOW_REMOTE=1", () => {
    const env = resolveCloudTestEnv({
      POLIVO_CLOUD_TEST_ALLOW_REMOTE: "1",
      POLIVO_CLOUD_TEST_DATABASE_URL:
        "postgresql://postgres:secret@127.0.0.1:5432/postgres?host=db.example.com",
      POLIVO_CLOUD_TEST_SUPABASE_URL: "https://abcdefgh.supabase.co",
      POLIVO_CLOUD_TEST_PUBLISHABLE_KEY: "lab-key",
    });
    expect(env.databaseUrl).toContain("host=db.example.com");
    expect(env.supabaseUrl).toContain("supabase.co");
  });
});
