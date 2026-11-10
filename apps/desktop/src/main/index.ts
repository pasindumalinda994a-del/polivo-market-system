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
import { changeBuyerStatus, createBuyer, getBuyer, listBuyers, updateBuyer } from "./buyers.js";
import {
  changeFarmerStatus,
  createFarmer,
  getFarmer,
  listFarmers,
  updateFarmer,
} from "./farmers.js";
import {
  changePackageTypeStatus,
  createPackageType,
  listPackageTypes,
  updatePackageType,
} from "./package-types.js";
import {
  changeVegetableStatus,
  createVegetable,
  getVegetable,
  listVegetables,
  updateVegetable,
} from "./vegetables.js";
import {
  activateCommissionPolicy,
  getActiveCommissionPolicy,
  getCommissionPolicyVersion,
  listCommissionPolicyVersions,
  previewCommission,
} from "./commission-policy.js";
import {
  correctOpening,
  getAccountBalance,
  listAccountMovements,
  postOpeningDraft,
  prepareOpeningDraft,
  updateOpeningDraft,
} from "./accounts.js";

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

  ipcMain.handle("farmers:list", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const query =
      input && typeof input === "object"
        ? (input as {
            q?: string;
            active?: "active" | "inactive" | "all";
            limit?: number;
            cursor?: string;
          })
        : {};
    return listFarmers(query);
  });
  ipcMain.handle("farmers:get", async (event, farmerId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof farmerId !== "string" || farmerId.trim().length === 0) {
      throw new Error("Farmer id is required.");
    }
    return getFarmer(farmerId);
  });
  ipcMain.handle("farmers:create", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid farmer payload.");
    }
    return createFarmer(
      input as {
        shortCode: string;
        displayName: string;
        contactNumber?: string | null;
        locality?: string | null;
      },
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle(
    "farmers:update",
    async (event, farmerId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof farmerId !== "string" || farmerId.trim().length === 0) {
        throw new Error("Farmer id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid farmer payload.");
      }
      return updateFarmer(
        farmerId,
        input as {
          expectedRevision: number;
          displayName?: string;
          contactNumber?: string | null;
          locality?: string | null;
        },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "farmers:changeStatus",
    async (event, farmerId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof farmerId !== "string" || farmerId.trim().length === 0) {
        throw new Error("Farmer id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid farmer status payload.");
      }
      return changeFarmerStatus(
        farmerId,
        input as { expectedRevision: number; status: "active" | "inactive" },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );

  ipcMain.handle("buyers:list", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const query =
      input && typeof input === "object"
        ? (input as {
            q?: string;
            active?: "active" | "inactive" | "all";
            limit?: number;
            cursor?: string;
          })
        : {};
    return listBuyers(query);
  });
  ipcMain.handle("buyers:get", async (event, buyerId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof buyerId !== "string" || buyerId.trim().length === 0) {
      throw new Error("Buyer id is required.");
    }
    return getBuyer(buyerId);
  });
  ipcMain.handle("buyers:create", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid buyer payload.");
    }
    return createBuyer(
      input as {
        shortCode: string;
        displayName: string;
        contactNumber?: string | null;
        locality?: string | null;
      },
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle(
    "buyers:update",
    async (event, buyerId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof buyerId !== "string" || buyerId.trim().length === 0) {
        throw new Error("Buyer id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid buyer payload.");
      }
      return updateBuyer(
        buyerId,
        input as {
          expectedRevision: number;
          displayName?: string;
          contactNumber?: string | null;
          locality?: string | null;
        },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "buyers:changeStatus",
    async (event, buyerId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof buyerId !== "string" || buyerId.trim().length === 0) {
        throw new Error("Buyer id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid buyer status payload.");
      }
      return changeBuyerStatus(
        buyerId,
        input as { expectedRevision: number; status: "active" | "inactive" },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );

  ipcMain.handle("vegetables:list", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const query =
      input && typeof input === "object"
        ? (input as {
            q?: string;
            active?: "active" | "inactive" | "all";
            limit?: number;
            cursor?: string;
          })
        : {};
    return listVegetables(query);
  });
  ipcMain.handle("vegetables:get", async (event, vegetableId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof vegetableId !== "string" || vegetableId.trim().length === 0) {
      throw new Error("Vegetable id is required.");
    }
    return getVegetable(vegetableId);
  });
  ipcMain.handle("vegetables:create", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid vegetable payload.");
    }
    return createVegetable(
      input as { shortCode: string; displayName: string },
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle(
    "vegetables:update",
    async (event, vegetableId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof vegetableId !== "string" || vegetableId.trim().length === 0) {
        throw new Error("Vegetable id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid vegetable payload.");
      }
      return updateVegetable(
        vegetableId,
        input as { expectedRevision: number; displayName: string },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "vegetables:changeStatus",
    async (event, vegetableId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof vegetableId !== "string" || vegetableId.trim().length === 0) {
        throw new Error("Vegetable id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid vegetable status payload.");
      }
      return changeVegetableStatus(
        vegetableId,
        input as { expectedRevision: number; status: "active" | "inactive" },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );

  ipcMain.handle("packageTypes:list", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const query =
      input && typeof input === "object"
        ? (input as {
            q?: string;
            active?: "active" | "inactive" | "all";
            limit?: number;
            cursor?: string;
          })
        : {};
    return listPackageTypes(query);
  });
  ipcMain.handle("packageTypes:create", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid package type payload.");
    }
    return createPackageType(
      input as { shortCode: string; displayName: string },
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle(
    "packageTypes:update",
    async (event, packageTypeId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof packageTypeId !== "string" || packageTypeId.trim().length === 0) {
        throw new Error("Package type id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid package type payload.");
      }
      return updatePackageType(
        packageTypeId,
        input as { expectedRevision: number; displayName: string },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "packageTypes:changeStatus",
    async (event, packageTypeId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof packageTypeId !== "string" || packageTypeId.trim().length === 0) {
        throw new Error("Package type id is required.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid package type status payload.");
      }
      return changePackageTypeStatus(
        packageTypeId,
        input as { expectedRevision: number; status: "active" | "inactive" },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );

  ipcMain.handle("commissionPolicy:getActive", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return getActiveCommissionPolicy();
  });
  ipcMain.handle("commissionPolicy:listVersions", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const query =
      input && typeof input === "object" ? (input as { limit?: number; cursor?: string }) : {};
    return listCommissionPolicyVersions(query);
  });
  ipcMain.handle("commissionPolicy:getVersion", async (event, versionId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof versionId !== "string" || versionId.trim().length === 0) {
      throw new Error("Commission version id is required.");
    }
    return getCommissionPolicyVersion(versionId);
  });
  ipcMain.handle(
    "commissionPolicy:activate",
    async (event, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid commission activation payload.");
      }
      return activateCommissionPolicy(
        input as {
          expectedRevision: number;
          bands: Array<{
            id: string;
            minPricePerKgMinor: number;
            maxPricePerKgMinor: number | null;
            ratePerKgMinor: number;
          }>;
        },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle("commissionPolicy:preview", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid commission preview payload.");
    }
    return previewCommission(
      input as {
        versionId?: string;
        sellingPricePerKgMinor: number;
        netWeightHundredths: number;
      },
    );
  });

  ipcMain.handle("accounts:getBalance", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid account balance request.");
    }
    return getAccountBalance(
      input as { partyKind: "farmer" | "trader"; partyId: string },
    );
  });
  ipcMain.handle("accounts:listMovements", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid account movements request.");
    }
    return listAccountMovements(
      input as {
        partyKind: "farmer" | "trader";
        partyId: string;
        limit?: number;
        cursor?: string;
      },
    );
  });
  ipcMain.handle(
    "accounts:prepareOpening",
    async (event, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid opening draft payload.");
      }
      return prepareOpeningDraft(
        input as {
          partyKind: "farmer" | "trader";
          partyId: string;
          direction:
            | "stall_owes_farmer"
            | "farmer_owes_stall"
            | "buyer_owes_stall"
            | "stall_owes_buyer";
          amountMinor: number;
          cutoffDate: string;
          reference?: string;
          explanation?: string;
        },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "accounts:updateOpening",
    async (event, draftId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof draftId !== "string" || !input || typeof input !== "object") {
        throw new Error("Invalid opening draft update.");
      }
      return updateOpeningDraft(
        draftId,
        input as {
          expectedRevision: number;
          direction:
            | "stall_owes_farmer"
            | "farmer_owes_stall"
            | "buyer_owes_stall"
            | "stall_owes_buyer";
          amountMinor: number;
          cutoffDate: string;
          reference?: string;
          explanation?: string;
        },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "accounts:postOpening",
    async (event, draftId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof draftId !== "string" || !input || typeof input !== "object") {
        throw new Error("Invalid opening post payload.");
      }
      return postOpeningDraft(
        draftId,
        input as { expectedRevision: number },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "accounts:correctOpening",
    async (event, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (!input || typeof input !== "object") {
        throw new Error("Invalid opening correction payload.");
      }
      return correctOpening(
        input as {
          partyKind: "farmer" | "trader";
          partyId: string;
          reason: string;
          replacement?: {
            direction:
              | "stall_owes_farmer"
              | "farmer_owes_stall"
              | "buyer_owes_stall"
              | "stall_owes_buyer";
            amountMinor: number;
            cutoffDate?: string;
            reference?: string;
            explanation?: string;
          };
        },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );

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
