import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

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

  const app = buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down stall service");
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Error while shutting down stall service");
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
    app.log.info({ host: config.host, port: config.port }, "Stall service listening");
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
  }
}

void start();
