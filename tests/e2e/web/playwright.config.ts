import { defineConfig, devices } from "@playwright/test";

const WEB_E2E_PORT = 3100;
const WEB_E2E_BASE_URL = `http://127.0.0.1:${WEB_E2E_PORT}`;

/**
 * Web end-to-end configuration.
 *
 * Dedicated test port: 3100 (avoids the development web port 3000).
 * CI and the default local command exercise a production Next.js build.
 * For a local development-server workflow, start `pnpm --filter @polivo/web dev`
 * on another port only when intentionally debugging, and point Playwright at
 * that URL with `PW_TEST_BASE_URL` — do not reuse an unrelated running server in CI.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "../../../playwright-report/web" }]],
  outputDir: "../../../test-results/web",
  use: {
    baseURL: process.env.PW_TEST_BASE_URL ?? WEB_E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: process.env.PW_TEST_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter @polivo/web exec next start --port ${WEB_E2E_PORT} --hostname 127.0.0.1`,
        url: WEB_E2E_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
