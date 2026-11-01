import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDir, "../..");

export default defineConfig({
  test: {
    name: "domain",
    environment: "node",
    root: repositoryRoot,
    dir: resolve(packageDir, "src"),
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    passWithNoTests: false,
    coverage: {
      include: ["packages/domain/src/**/*.ts"],
      exclude: ["packages/domain/src/**/*.test.ts", "packages/domain/src/index.ts"],
    },
  },
});
