import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDir, "../..");

export default defineConfig({
  test: {
    name: "db-local",
    environment: "node",
    root: repositoryRoot,
    dir: resolve(packageDir, "src"),
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    passWithNoTests: false,
    coverage: {
      include: ["packages/db-local/src/**/*.ts"],
      exclude: [
        "packages/db-local/src/**/*.test.ts",
        "packages/db-local/src/index.ts",
        "packages/db-local/src/cli.ts",
      ],
    },
  },
});
