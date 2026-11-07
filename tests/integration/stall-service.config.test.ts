import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../apps/stall-service/src/config.ts";

const sampleDbPath = join(tmpdir(), "polivo-config-test", "stall.sqlite");

describe("stall-service configuration", () => {
  it("loads host/port defaults when an absolute database path is provided", () => {
    const config = loadConfig({
      POLIVO_LOCAL_DB_PATH: sampleDbPath,
    });
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3040);
    expect(config.databasePath).toBe(sampleDbPath);
    expect(config.listenMode).toBe("loopback");
  });

  it("accepts an explicit loopback host and port", () => {
    const config = loadConfig({
      HOST: "localhost",
      PORT: "3041",
      POLIVO_LOCAL_DB_PATH: sampleDbPath,
    });
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(3041);
    expect(config.listenMode).toBe("loopback");
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

  it("rejects a non-loopback host in loopback mode", () => {
    expect(() =>
      loadConfig({
        HOST: "0.0.0.0",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid HOST/);
  });

  it("accepts LAN mode with an explicit non-loopback host", () => {
    const config = loadConfig({
      POLIVO_LISTEN_MODE: "lan",
      HOST: "192.168.1.10",
      POLIVO_LOCAL_DB_PATH: sampleDbPath,
    });
    expect(config.listenMode).toBe("lan");
    expect(config.host).toBe("192.168.1.10");
  });

  it("rejects LAN mode without HOST", () => {
    expect(() =>
      loadConfig({
        POLIVO_LISTEN_MODE: "lan",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/LAN mode requires an explicit HOST/);
  });

  it("rejects LAN mode with a loopback HOST", () => {
    expect(() =>
      loadConfig({
        POLIVO_LISTEN_MODE: "lan",
        HOST: "127.0.0.1",
        POLIVO_LOCAL_DB_PATH: sampleDbPath,
      }),
    ).toThrow(/Invalid HOST/);
  });
});
