import { describe, expect, it } from "vitest";

import { loadConfig } from "../../apps/stall-service/src/config.ts";

describe("stall-service configuration", () => {
  it("loads the valid development defaults", () => {
    expect(loadConfig({})).toEqual({
      host: "127.0.0.1",
      port: 3040,
    });
  });

  it("accepts an explicit loopback host and port", () => {
    expect(
      loadConfig({
        HOST: "localhost",
        PORT: "3041",
      }),
    ).toEqual({
      host: "localhost",
      port: 3041,
    });
  });

  it("rejects a non-numeric port", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ PORT: "0" })).toThrow(/Invalid PORT/);
    expect(() => loadConfig({ PORT: "65536" })).toThrow(/Invalid PORT/);
  });

  it("rejects a fractional port string", () => {
    expect(() => loadConfig({ PORT: "30.40" })).toThrow(/Invalid PORT/);
  });

  it("rejects a non-loopback host", () => {
    expect(() => loadConfig({ HOST: "0.0.0.0" })).toThrow(/Invalid HOST/);
  });
});
