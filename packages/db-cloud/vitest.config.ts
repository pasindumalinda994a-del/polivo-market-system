import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDir, "../..");

export default defineConfig({
  test: {
    name: "db-cloud",
    environment: "node",
    root: repositoryRoot,
    dir: resolve(packageDir, "src"),
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/test/isolation/**"],
    passWithNoTests: false,
    coverage: {
      include: ["packages/db-cloud/src/**/*.ts"],
      exclude: [
        "packages/db-cloud/src/**/*.test.ts",
        "packages/db-cloud/src/index.ts",
        "packages/db-cloud/src/types.ts",
        "packages/db-cloud/src/test/**",
      ],
    },
  },
});
