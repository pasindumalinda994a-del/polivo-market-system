import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../apps/stall-service/src/config.ts";

const sampleDbPath = join(tmpdir(), "polivo-config-test", "stall.sqlite");

describe("stall-service configuration", () => {
  it("loads host/port defaults when an absolute database path is provided", () => {
    expect(
      loadConfig({
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 3040,
      databasePath: sampleDbPath,
    });
  });

  it("accepts an explicit loopback host and port", () => {
    expect(
      loadConfig({
        HOST: "localhost",
        PORT: "3041",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toEqual({
      host: "localhost",
      port: 3041,
      databasePath: sampleDbPath,
    });
  });

  it("requires POLIVO_LOCAL_DB_PATH", () => {
    expect(() => loadConfig({})).toThrow(/POLIVO_LOCAL_DB_PATH/);
  });

  it("rejects a relative database path", () => {
    expect(() =>
      loadConfig({
        POLIVO_LOCAL_DB_PATH: "relative/stall.sqlite",
      }),
    ).toThrow(/absolute/i);
  });

  it("rejects a non-numeric port", () => {
    expect(() =>
      loadConfig({
        PORT: "abc",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid PORT/);
  });

  it("rejects an out-of-range port", () => {
    expect(() =>
      loadConfig({
        PORT: "0",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid PORT/);
    expect(() =>
      loadConfig({
        PORT: "65536",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid PORT/);
  });

  it("rejects a fractional port string", () => {
    expect(() =>
      loadConfig({
        PORT: "30.40",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid PORT/);
  });

  it("rejects a non-loopback host", () => {
    expect(() =>
      loadConfig({
        HOST: "0.0.0.0",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid HOST/);
  });
});
