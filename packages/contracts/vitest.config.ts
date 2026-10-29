import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDir, "../..");

export default defineConfig({
  test: {
    name: "contracts",
    environment: "node",
    root: repositoryRoot,
    dir: resolve(packageDir, "src"),
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    passWithNoTests: false,
    coverage: {
      include: ["packages/contracts/src/**/*.ts"],
      exclude: ["packages/contracts/src/**/*.test.ts", "packages/contracts/src/index.ts"],
    },
  },
});
