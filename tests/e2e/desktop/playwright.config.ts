import { defineConfig } from "@playwright/test";

/**
 * Desktop Electron smoke configuration.
 *
 * Requires a prior desktop build (`pnpm --filter @polivo/desktop build`) so
 * Playwright launches `apps/desktop/out/main/index.js` rather than a browser page.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../../playwright-report/desktop" }],
  ],
  outputDir: "../../../test-results/desktop",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
