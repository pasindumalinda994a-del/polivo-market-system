import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

const desktopDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(desktopDir, "../../..");
const desktopPackageJson = resolve(repositoryRoot, "apps/desktop/package.json");
const desktopMainEntry = resolve(repositoryRoot, "apps/desktop/out/main/index.js");
const require = createRequire(desktopPackageJson);
const electronExecutable = require("electron") as unknown as string;

let electronApp: ElectronApplication | undefined;
let window: Page | undefined;

test.beforeAll(async () => {
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

test("launches Electron with Polivo foundation content and secure boundaries", async () => {
  expect(electronApp).toBeDefined();
  expect(window).toBeDefined();
  if (electronApp === undefined || window === undefined) {
    return;
  }

  await expect(window.getByRole("heading", { name: "Polivo", level: 1 })).toBeVisible();
  await expect(
    window.getByRole("heading", { name: "Desktop application foundation", level: 2 }),
  ).toBeVisible();
  await expect(window.getByText("The desktop renderer is running.")).toBeVisible();

  const rendererExposure = await window.evaluate(() => {
    const scopedWindow = window as Window &
      typeof globalThis & {
        require?: unknown;
        process?: unknown;
        electron?: unknown;
        ipcRenderer?: unknown;
      };

    return {
      hasRequire: typeof scopedWindow.require !== "undefined",
      hasProcess: typeof scopedWindow.process !== "undefined",
      hasElectronBridge: typeof scopedWindow.electron !== "undefined",
      hasIpcRenderer: typeof scopedWindow.ipcRenderer !== "undefined",
    };
  });

  expect(rendererExposure).toEqual({
    hasRequire: false,
    hasProcess: false,
    hasElectronBridge: false,
    hasIpcRenderer: false,
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
