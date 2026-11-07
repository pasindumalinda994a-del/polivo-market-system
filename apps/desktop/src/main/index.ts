import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";

import {
  configureOrTestHostAddress,
  getConnectionStatus,
  initializeConnectionFromDisk,
  readCurrentSession,
  retryConnection,
  signIn,
  signOutOrLock,
  switchStaffPrepare,
} from "./connection.js";
import { enrollTerminal, getTerminalEnrollmentStatus } from "./enrollment.js";

const isDevelopment = !app.isPackaged;

function contentSecurityPolicy(): string {
  if (isDevelopment) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:* http://localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders["Content-Security-Policy"] = [contentSecurityPolicy()];
    callback({ responseHeaders });
  });
}

function isTrustedIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  try {
    const url = event.senderFrame?.url ?? "";
    if (isDevelopment && process.env["ELECTRON_RENDERER_URL"]) {
      return url.startsWith(process.env["ELECTRON_RENDERER_URL"]) || url.startsWith("file:");
    }
    return url.startsWith("file:");
  } catch {
    return false;
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedDevUrl = process.env["ELECTRON_RENDERER_URL"];
    const isAllowedDevNavigation =
      isDevelopment && typeof allowedDevUrl === "string" && url.startsWith(allowedDevUrl);
    const isFileUrl = url.startsWith("file:");

    if (!isAllowedDevNavigation && !isFileUrl) {
      event.preventDefault();
    }
  });

  if (isDevelopment && process.env["ELECTRON_RENDERER_URL"]) {
    void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  applyContentSecurityPolicy();
  initializeConnectionFromDisk();

  ipcMain.handle("enrollment:getStatus", (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return getTerminalEnrollmentStatus();
  });
  ipcMain.handle(
    "enrollment:enrollTerminal",
    async (
      event,
      input: {
        enrollmentSecret: string;
        enrollmentBaseUrl: string;
        deploymentEnvironment: "development" | "staging" | "production";
        hostServiceBaseUrl: string;
      },
    ) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid enrollment payload.");
      }
      return enrollTerminal(input);
    },
  );

  ipcMain.handle("connection:getStatus", (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return getConnectionStatus();
  });
  ipcMain.handle("connection:configureOrTestHost", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return configureOrTestHostAddress(input);
  });
  ipcMain.handle(
    "connection:signIn",
    async (event, input: { staffCode?: unknown; secret?: unknown }) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (
        !input ||
        typeof input.staffCode !== "string" ||
        typeof input.secret !== "string" ||
        input.staffCode.trim().length === 0 ||
        input.secret.length === 0
      ) {
        throw new Error("Staff code and secret are required.");
      }
      return signIn({ staffCode: input.staffCode, secret: input.secret });
    },
  );
  ipcMain.handle("connection:getSession", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return readCurrentSession();
  });
  ipcMain.handle("connection:signOut", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return signOutOrLock();
  });
  ipcMain.handle("connection:retry", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return retryConnection();
  });
  ipcMain.handle("connection:switchStaff", (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return switchStaffPrepare();
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
