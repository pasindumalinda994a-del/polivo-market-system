import { openExistingDatabaseAndVerify, type LocalDatabase } from "@polivo/db-local";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { loadOrCreateTlsMaterial, loadTlsMaterialFromPaths } from "./security/tls-material.js";

async function start(): Promise<void> {
  let config;

  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Invalid stall service configuration",
        error: message,
      }),
    );
    process.exitCode = 1;
    return;
  }

  let tlsMaterial;
  try {
    tlsMaterial =
      config.tlsKeyPath && config.tlsCertPath
        ? loadTlsMaterialFromPaths(config.tlsKeyPath, config.tlsCertPath)
        : loadOrCreateTlsMaterial(config.credentialRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Failed to load or create TLS material required for desktop connections",
        error: message,
        listenMode: config.listenMode,
      }),
    );
    process.exitCode = 1;
    return;
  }

  let database: LocalDatabase | undefined;

  try {
    database = openExistingDatabaseAndVerify(config.databasePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Failed to open or verify local database",
        error: message,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const app = buildApp({
    database,
    credentialRoot: config.credentialRoot,
    tlsMaterial,
    https: tlsMaterial,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down stall service");
    try {
      await app.close();
      database?.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Error while shutting down stall service");
      try {
        database?.close();
      } catch {
        // Ignore secondary close failures during shutdown.
      }
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(
      {
        host: config.host,
        port: config.port,
        listenMode: config.listenMode,
        tlsFingerprint: tlsMaterial.certificateSha256,
        protocol: "https",
      },
      "Stall service listening (HTTPS)",
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EADDRINUSE") {
      app.log.error(
        {
          host: config.host,
          port: config.port,
          err,
        },
        `Port ${config.port} is already in use on ${config.host}. Choose a free PORT or stop the process using that port.`,
      );
    } else {
      app.log.error({ err }, "Failed to start stall service");
    }
    process.exitCode = 1;
    try {
      await app.close();
    } catch {
      // Ignore close failures after a failed listen.
    }
    try {
      database.close();
    } catch {
      // Ignore database close failures after a failed listen.
    }
  }
}

void start();
