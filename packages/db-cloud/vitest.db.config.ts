import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDir, "../..");

export default defineConfig({
  test: {
    name: "db-cloud-isolation",
    environment: "node",
    root: repositoryRoot,
    dir: resolve(packageDir, "src/test/isolation"),
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    passWithNoTests: false,
    fileParallelism: false,
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
