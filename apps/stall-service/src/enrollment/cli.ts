import { loadConfig } from "../config.js";
import { activateHost } from "./activate-host.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const enrollmentBaseUrl =
    process.env.POLIVO_ENROLLMENT_BASE_URL?.trim() || "http://localhost:3000";
  const deploymentEnvironment = (process.env.POLIVO_DEPLOYMENT_ENVIRONMENT?.trim() ||
    "development") as "development" | "staging" | "production";
  const enrollmentSecret = process.env.POLIVO_ENROLLMENT_SECRET?.trim();

  if (!["development", "staging", "production"].includes(deploymentEnvironment)) {
    throw new Error("POLIVO_DEPLOYMENT_ENVIRONMENT must be development, staging, or production.");
  }

  const result = await activateHost({
    databasePath: config.databasePath,
    enrollmentBaseUrl,
    deploymentEnvironment,
    enrollmentSecret,
  });

  // Do not print secrets. Device id / states are non-secret enrollment metadata.
  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId: result.tenantId,
        stallId: result.stallId,
        deviceId: result.deviceId,
        activationState: result.activationState,
        resumed: result.resumed,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});
