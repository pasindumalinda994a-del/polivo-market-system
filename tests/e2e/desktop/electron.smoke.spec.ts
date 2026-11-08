import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

const desktopDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(desktopDir, "../../..");
const desktopPackageJson = resolve(repositoryRoot, "apps/desktop/package.json");
const desktopMainEntry = resolve(repositoryRoot, "apps/desktop/out/main/index.js");
const requireFromDesktop = createRequire(desktopPackageJson);

function resolveElectronExecutable(): string {
  try {
    return requireFromDesktop("electron") as unknown as string;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Electron executable is missing or incomplete (${detail}). Re-run Electron install (CI: Ensure Electron binary step; local: pnpm --filter @polivo/desktop exec node node_modules/electron/install.js).`,
      { cause: error },
    );
  }
}

let electronApp: ElectronApplication | undefined;
let window: Page | undefined;

test.beforeAll(async () => {
  const electronExecutable = resolveElectronExecutable();
  electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [desktopMainEntry],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  if (electronApp !== undefined) {
    await electronApp.close();
    electronApp = undefined;
  }
});

test("launches Electron with Polivo desktop shell and secure boundaries", async () => {
  expect(electronApp).toBeDefined();
  expect(window).toBeDefined();
  if (electronApp === undefined || window === undefined) {
    return;
  }

  await expect(
    window.getByRole("heading", { name: "Desktop application shell", level: 1 }),
  ).toBeVisible();
  await expect(window.getByText("Billing workspace reserved")).toBeVisible();
  await expect(window.getByText("Service connection not configured")).toBeVisible();
  await expect(window.getByText("Terminal enrollment")).toBeVisible();
  await expect(window.getByRole("button", { name: "Pair this terminal" })).toBeVisible();
  await expect(window.getByText("Connected", { exact: true })).toHaveCount(0);
  await expect(window.getByText("Synced", { exact: true })).toHaveCount(0);
  // Unpaired terminal must not show a signed-in workspace identity.
  await expect(window.getByText("Signed in as")).toHaveCount(0);

  const rendererExposure = await window.evaluate(() => {
    const scopedWindow = window as Window &
      typeof globalThis & {
        require?: unknown;
        process?: unknown;
        electron?: unknown;
        ipcRenderer?: unknown;
        polivoEnrollment?: unknown;
        polivoConnection?: unknown;
      };

    return {
      hasRequire: typeof scopedWindow.require !== "undefined",
      hasProcess: typeof scopedWindow.process !== "undefined",
      hasElectronBridge: typeof scopedWindow.electron !== "undefined",
      hasIpcRenderer: typeof scopedWindow.ipcRenderer !== "undefined",
      hasEnrollmentBridge: typeof scopedWindow.polivoEnrollment !== "undefined",
      hasConnectionBridge: typeof scopedWindow.polivoConnection !== "undefined",
      enrollmentKeys:
        scopedWindow.polivoEnrollment && typeof scopedWindow.polivoEnrollment === "object"
          ? Object.keys(scopedWindow.polivoEnrollment as object).sort()
          : [],
      connectionKeys:
        scopedWindow.polivoConnection && typeof scopedWindow.polivoConnection === "object"
          ? Object.keys(scopedWindow.polivoConnection as object).sort()
          : [],
    };
  });

  expect(rendererExposure).toEqual({
    hasRequire: false,
    hasProcess: false,
    hasElectronBridge: false,
    hasIpcRenderer: false,
    hasEnrollmentBridge: true,
    hasConnectionBridge: true,
    enrollmentKeys: ["enrollTerminal", "getStatus"],
    connectionKeys: [
      "configureOrTestHost",
      "getSession",
      "getStatus",
      "retry",
      "signIn",
      "signOut",
      "switchStaff",
    ],
  });

  const webPreferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow === undefined) {
      return null;
    }

    const preferences = mainWindow.webContents.getLastWebPreferences();
    return {
      contextIsolation: preferences.contextIsolation === true,
      nodeIntegration: preferences.nodeIntegration === true,
      sandbox: preferences.sandbox === true,
    };
  });

  expect(webPreferences).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  });
});
