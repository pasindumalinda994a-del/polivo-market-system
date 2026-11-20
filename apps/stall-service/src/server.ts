import {
  getStallBinding,
  openExistingDatabaseAndVerify,
  type LocalDatabase,
} from "@polivo/db-local";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createServiceDependencies } from "./composition.js";
import { loadOrCreateTlsMaterial, loadTlsMaterialFromPaths } from "./security/tls-material.js";
import { createHttpSyncTransport } from "./sync/transport.js";
import { createHttpConfigTransport } from "./config-sync/transport.js";
import { createConfigPullWorker, type ConfigWorkerHandle } from "./config-sync/worker.js";
import {
  createHttpReconciliationCloudClient,
  createReconcileSigner,
} from "./sync/reconciliation/cloud-client.js";
import { createOutboxSyncWorker, type SyncWorkerHandle } from "./sync/worker.js";

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
  let syncWorker: SyncWorkerHandle | null = null;
  let configWorker: ConfigWorkerHandle | null = null;

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

  const deps = createServiceDependencies({
    database,
    credentialRoot: config.credentialRoot,
    tlsMaterial,
  });

  let transport = null;
  let configurationMessage: string | null = null;
  if (config.syncIngestUrl) {
    try {
      transport = createHttpSyncTransport({
        ingestUrl: config.syncIngestUrl,
        allowInsecureHttp: config.syncAllowInsecureHttp,
      });
    } catch (error) {
      configurationMessage = error instanceof Error ? error.message : String(error);
    }
  } else {
    configurationMessage =
      "POLIVO_SYNC_INGEST_URL is not set. Local billing continues; cloud upload is paused.";
  }

  syncWorker = createOutboxSyncWorker({
    database,
    secureStorage: deps.secureStorage,
    transport,
    ingestConfigured: transport !== null,
    configurationMessage,
    now: deps.now,
    createId: deps.createId,
  });

  let configTransport = null;
  let configConfigurationMessage: string | null = null;
  if (config.configPullUrl && config.configAckUrl) {
    try {
      configTransport = createHttpConfigTransport({
        pullUrl: config.configPullUrl,
        ackUrl: config.configAckUrl,
        allowInsecureHttp: config.syncAllowInsecureHttp,
      });
    } catch (error) {
      configConfigurationMessage = error instanceof Error ? error.message : String(error);
    }
  } else {
    configConfigurationMessage =
      "Configuration pull URL is not set. Local billing continues; access refresh waits for POLIVO_CONFIG_PULL_URL or POLIVO_SYNC_INGEST_URL.";
  }

  configWorker = createConfigPullWorker({
    database,
    secureStorage: deps.secureStorage,
    transport: configTransport,
    configured: configTransport !== null,
    configurationMessage: configConfigurationMessage,
    now: deps.now,
    createId: deps.createId,
  });

  const binding = getStallBinding(database);
  const reconcileSigner = createReconcileSigner({
    database,
    secureStorage: deps.secureStorage,
    tenantId: binding.tenantId,
  });
  const reconciliationCloudClient = createHttpReconciliationCloudClient({
    progressUrl: config.syncProgressUrl,
    receiptsUrl: config.syncReceiptsUrl,
    factSummaryUrl: config.syncFactSummaryUrl,
    signer: reconcileSigner,
    createId: deps.createId,
    now: deps.now,
  });

  const app = buildApp({
    database,
    credentialRoot: config.credentialRoot,
    tlsMaterial,
    https: tlsMaterial,
    syncWorker,
    configWorker,
    reconciliationCloudClient,
    dependencies: { ...deps, syncWorker, configWorker },
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down stall service");
    try {
      if (configWorker) {
        await configWorker.stop();
      }
      if (syncWorker) {
        await syncWorker.stop();
      }
      await app.close();
      database?.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Error while shutting down stall service");
      try {
        if (configWorker) {
          await configWorker.stop();
        }
      } catch {
        // Ignore secondary worker stop failures.
      }
      try {
        if (syncWorker) {
          await syncWorker.stop();
        }
      } catch {
        // Ignore secondary worker stop failures.
      }
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
    syncWorker.start();
    configWorker.start();
    app.log.info(
      {
        host: config.host,
        port: config.port,
        listenMode: config.listenMode,
        tlsFingerprint: tlsMaterial.certificateSha256,
        protocol: "https",
        syncIngestConfigured: transport !== null,
        configPullConfigured: configTransport !== null,
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
      if (configWorker) {
        await configWorker.stop();
      }
      if (syncWorker) {
        await syncWorker.stop();
      }
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
