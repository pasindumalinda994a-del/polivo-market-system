import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts/vitest.config.ts",
      "packages/domain/vitest.config.ts",
      "packages/db-local/vitest.config.ts",
      "tests/integration/vitest.config.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "text-summary"],
      reportsDirectory: "coverage",
      include: [
        "packages/contracts/src/**/*.ts",
        "packages/domain/src/**/*.ts",
        "packages/db-local/src/**/*.ts",
        "apps/stall-service/src/app.ts",
        "apps/stall-service/src/config.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/dist/**",
        "**/node_modules/**",
        "**/*.config.*",
        "packages/contracts/src/index.ts",
        "packages/domain/src/index.ts",
        "packages/db-local/src/index.ts",
        "packages/db-local/src/cli.ts",
        "apps/stall-service/src/server.ts",
      ],
      // Report files even when a project records paths relative to a package root.
      allowExternal: true,
    },
  },
});
