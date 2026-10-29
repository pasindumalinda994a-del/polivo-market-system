import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const integrationDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(integrationDir, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@polivo/contracts": resolve(repositoryRoot, "packages/contracts/src/index.ts"),
    },
  },
  test: {
    name: "integration",
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    passWithNoTests: false,
    root: repositoryRoot,
    coverage: {
      include: ["apps/stall-service/src/app.ts", "apps/stall-service/src/config.ts"],
    },
  },
});
