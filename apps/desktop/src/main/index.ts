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
  getAccountStatement,
  getAccountSummary,
  listAccountMovements,
  listOutstandingObligations,
  listUnappliedPayments,
  postOpeningDraft,
  prepareOpeningDraft,
  updateOpeningDraft,
} from "./accounts.js";
import {
  clearFinalizeRecovery,
  readFinalizeRecovery,
  writeFinalizeRecovery,
  type FinalizeRecoveryRecord,
} from "./finalize-recovery.js";
import {
  clearFarmerBillIssueRecovery,
  readFarmerBillIssueRecovery,
  writeFarmerBillIssueRecovery,
  type FarmerBillIssueRecoveryRecord,
} from "./farmer-bill-issue-recovery.js";
import {
  getFarmerBill,
  issueFarmerBill,
  listFarmerBills,
  listFarmerSales,
  lookupFarmerBillIssuance,
  previewFarmerBill,
} from "./farmer-billing.js";
import {
  clearCorrectionRecovery,
  commitCorrection,
  getBillHistoryDetail,
  getCorrectionEligibility,
  getCorrectionRecovery,
  listBillHistory,
  lookupCorrection,
  previewCorrection,
  setCorrectionRecovery,
} from "./bill-corrections.js";
import {
  parsePaymentCommitRecovery,
  type PaymentCommitRecoveryRecord,
} from "./payment-commit-recovery.js";
import {
  flushPendingPrintOutcome,
  getStallPrintIdentity,
  getTerminalPrinterConfig,
  listPrintAttempts,
  listSystemPrinters,
  previewDocument,
  printDocument,
  recoverPrintAttempt,
  setStallPrintIdentity,
  setTerminalPrinterConfig,
} from "./printing.js";
import {
  allocateExisting,
  clearPaymentCommitRecoveryRecord,
  getPayment,
  getPaymentCommitRecovery,
  listEligibleObligations,
  listPayments,
  lookupPaymentOperation,
  postPayment,
  previewAllocate,
  previewPayment,
  previewReversal,
  reversePayment,
  setPaymentCommitRecovery,
} from "./payments.js";
import {
  abandonSaleDraft,
  createSaleDraft,
  finalizeSaleDraft,
  getSaleDraft,
  getTraderBill,
  listSaleDrafts,
  listTraderBills,
  lookupSaleFinalization,
  previewSaleDraft,
  updateSaleDraft,
} from "./sales-billing.js";
import {
  createReportExport,
  getReportCatalog,
  getReportExportArtifact,
  runReport,
  saveReportExport,
} from "./reports.js";

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
  ipcMain.handle("accounts:getStatement", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid account statement request.");
    }
    return getAccountStatement(
      input as {
        partyKind: "farmer" | "trader";
        partyId: string;
        fromBusinessDate: string;
        toBusinessDate: string;
        limit?: number;
        cursor?: string;
        snapshotToken?: string;
        movementSearch?: string;
        sourceTypeFilter?: string;
      },
    );
  });
  ipcMain.handle("accounts:getSummary", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid account summary request.");
    }
    return getAccountSummary(
      input as {
        partyKind: "farmer" | "trader";
        partyId: string;
        asOfBusinessDate?: string;
        snapshotToken?: string;
      },
    );
  });
  ipcMain.handle("accounts:listOutstanding", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid outstanding obligations request.");
    }
    return listOutstandingObligations(
      input as {
        partyKind: "farmer" | "trader";
        partyId: string;
        asOfBusinessDate?: string;
        historical?: boolean;
        snapshotToken?: string;
        limit?: number;
        cursor?: string;
      },
    );
  });
  ipcMain.handle("accounts:listUnappliedPayments", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid unapplied payments request.");
    }
    return listUnappliedPayments(
      input as {
        partyKind: "farmer" | "trader";
        partyId: string;
        asOfBusinessDate?: string;
        snapshotToken?: string;
        includePaymentMetadata?: boolean;
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

  ipcMain.handle("salesBilling:createDraft", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid sale draft payload.");
    }
    return createSaleDraft(
      input as Parameters<typeof createSaleDraft>[0],
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle("salesBilling:listDrafts", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return listSaleDrafts(
      input && typeof input === "object"
        ? (input as { limit?: number; cursor?: string; traderId?: string })
        : undefined,
    );
  });
  ipcMain.handle("salesBilling:getDraft", async (event, saleId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof saleId !== "string") {
      throw new Error("Sale id is required.");
    }
    return getSaleDraft(saleId);
  });
  ipcMain.handle(
    "salesBilling:updateDraft",
    async (event, saleId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof saleId !== "string" || !input || typeof input !== "object") {
        throw new Error("Invalid sale draft update payload.");
      }
      return updateSaleDraft(
        saleId,
        input as Parameters<typeof updateSaleDraft>[1],
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle(
    "salesBilling:abandonDraft",
    async (event, saleId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof saleId !== "string" || !input || typeof input !== "object") {
        throw new Error("Invalid sale draft abandon payload.");
      }
      return abandonSaleDraft(
        saleId,
        input as { expectedRevision: number },
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle("salesBilling:previewDraft", async (event, saleId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof saleId !== "string") {
      throw new Error("Sale id is required.");
    }
    return previewSaleDraft(saleId);
  });
  ipcMain.handle(
    "salesBilling:finalizeDraft",
    async (event, saleId: unknown, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof saleId !== "string" || !input || typeof input !== "object") {
        throw new Error("Invalid sale finalize payload.");
      }
      return finalizeSaleDraft(
        saleId,
        input as Parameters<typeof finalizeSaleDraft>[1],
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle("salesBilling:lookupFinalization", async (event, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof idempotencyKey !== "string") {
      throw new Error("Idempotency key is required.");
    }
    return lookupSaleFinalization(idempotencyKey);
  });
  ipcMain.handle("salesBilling:listTraderBills", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return listTraderBills(
      input && typeof input === "object"
        ? (input as {
            limit?: number;
            cursor?: string;
            traderId?: string;
            businessDateFrom?: string;
            businessDateTo?: string;
          })
        : undefined,
    );
  });
  ipcMain.handle("salesBilling:getTraderBill", async (event, billId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof billId !== "string") {
      throw new Error("Bill id is required.");
    }
    return getTraderBill(billId);
  });
  ipcMain.handle("salesBilling:getFinalizeRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return { ok: true as const, data: readFinalizeRecovery() };
  });
  ipcMain.handle("salesBilling:setFinalizeRecovery", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid finalize recovery payload.");
    }
    const record = input as FinalizeRecoveryRecord;
    if (
      typeof record.saleId !== "string" ||
      typeof record.idempotencyKey !== "string" ||
      typeof record.expectedRevision !== "number" ||
      typeof record.expectedCalculationFingerprint !== "string" ||
      typeof record.startedAt !== "string"
    ) {
      throw new Error("Invalid finalize recovery fields.");
    }
    writeFinalizeRecovery(record);
    return { ok: true as const, data: record };
  });
  ipcMain.handle("salesBilling:clearFinalizeRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    clearFinalizeRecovery();
    return { ok: true as const, data: null };
  });

  ipcMain.handle("farmerBilling:listSales", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object" || typeof (input as { farmerId?: unknown }).farmerId !== "string") {
      throw new Error("Farmer id is required.");
    }
    return listFarmerSales(input as Parameters<typeof listFarmerSales>[0]);
  });
  ipcMain.handle("farmerBilling:preview", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return previewFarmerBill(input as Parameters<typeof previewFarmerBill>[0]);
  });
  ipcMain.handle("farmerBilling:issue", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return issueFarmerBill(
      input as Parameters<typeof issueFarmerBill>[0],
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle("farmerBilling:lookupIssuance", async (event, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof idempotencyKey !== "string") {
      throw new Error("Idempotency key is required.");
    }
    return lookupFarmerBillIssuance(idempotencyKey);
  });
  ipcMain.handle("farmerBilling:listBills", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return listFarmerBills(
      input as Parameters<typeof listFarmerBills>[0] | undefined,
    );
  });
  ipcMain.handle("farmerBilling:getBill", async (event, billId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof billId !== "string") {
      throw new Error("Bill id is required.");
    }
    return getFarmerBill(billId);
  });
  ipcMain.handle("farmerBilling:getIssueRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return { ok: true as const, data: readFarmerBillIssueRecovery() };
  });
  ipcMain.handle("farmerBilling:setIssueRecovery", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (!input || typeof input !== "object") {
      throw new Error("Invalid farmer bill issue recovery payload.");
    }
    const record = input as FarmerBillIssueRecoveryRecord;
    if (
      typeof record.farmerId !== "string" ||
      !Array.isArray(record.sourceLineIds) ||
      !record.sourceLineIds.every((id) => typeof id === "string") ||
      typeof record.expectedSelectionFingerprint !== "string" ||
      (record.businessDate !== null && typeof record.businessDate !== "string") ||
      typeof record.idempotencyKey !== "string" ||
      typeof record.startedAt !== "string"
    ) {
      throw new Error("Invalid farmer bill issue recovery fields.");
    }
    writeFarmerBillIssueRecovery(record);
    return { ok: true as const, data: record };
  });
  ipcMain.handle("farmerBilling:clearIssueRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    clearFarmerBillIssueRecovery();
    return { ok: true as const, data: null };
  });

  ipcMain.handle("billCorrections:listHistory", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return listBillHistory((input ?? {}) as Parameters<typeof listBillHistory>[0]);
  });
  ipcMain.handle("billCorrections:getDetail", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const parsed = input as { billType?: string; billId?: string };
    if (
      (parsed.billType !== "trader" && parsed.billType !== "farmer") ||
      typeof parsed.billId !== "string"
    ) {
      throw new Error("Invalid bill detail request.");
    }
    return getBillHistoryDetail({ billType: parsed.billType, billId: parsed.billId });
  });
  ipcMain.handle("billCorrections:eligibility", async (event, saleId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof saleId !== "string") {
      throw new Error("Invalid sale id.");
    }
    return getCorrectionEligibility(saleId);
  });
  ipcMain.handle("billCorrections:preview", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return previewCorrection(input as Parameters<typeof previewCorrection>[0]);
  });
  ipcMain.handle(
    "billCorrections:commit",
    async (event, input: unknown, idempotencyKey: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      return commitCorrection(
        input as Parameters<typeof commitCorrection>[0],
        typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      );
    },
  );
  ipcMain.handle("billCorrections:lookup", async (event, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof idempotencyKey !== "string") {
      throw new Error("Invalid idempotency key.");
    }
    return lookupCorrection(idempotencyKey);
  });
  ipcMain.handle("billCorrections:getRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return { ok: true as const, data: getCorrectionRecovery() };
  });
  ipcMain.handle("billCorrections:setRecovery", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const record = input as {
      idempotencyKey?: string;
      saleId?: string;
      action?: string;
      savedAt?: string;
    };
    if (
      typeof record.idempotencyKey !== "string" ||
      typeof record.saleId !== "string" ||
      (record.action !== "correct" && record.action !== "reverse") ||
      typeof record.savedAt !== "string"
    ) {
      throw new Error("Invalid correction recovery fields.");
    }
    setCorrectionRecovery({
      idempotencyKey: record.idempotencyKey,
      saleId: record.saleId,
      action: record.action,
      savedAt: record.savedAt,
    });
    return { ok: true as const, data: getCorrectionRecovery() };
  });
  ipcMain.handle("billCorrections:clearRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    clearCorrectionRecovery();
    return { ok: true as const, data: null };
  });

  ipcMain.handle("payments:listObligations", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const query = input as { partyKind?: unknown; partyId?: unknown; direction?: unknown };
    if (
      !input ||
      typeof input !== "object" ||
      (query.partyKind !== "trader" && query.partyKind !== "farmer") ||
      typeof query.partyId !== "string" ||
      (query.direction !== "receive" && query.direction !== "pay")
    ) {
      throw new Error("Invalid payment obligations request.");
    }
    return listEligibleObligations({
      partyKind: query.partyKind,
      partyId: query.partyId,
      direction: query.direction,
    });
  });
  ipcMain.handle("payments:preview", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return previewPayment(input as Parameters<typeof previewPayment>[0]);
  });
  ipcMain.handle("payments:post", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return postPayment(
      input as Parameters<typeof postPayment>[0],
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle("payments:list", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return listPayments((input ?? undefined) as Parameters<typeof listPayments>[0]);
  });
  ipcMain.handle("payments:get", async (event, paymentId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof paymentId !== "string") {
      throw new Error("Payment id is required.");
    }
    return getPayment(paymentId);
  });
  ipcMain.handle("payments:previewAllocate", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return previewAllocate(input as Parameters<typeof previewAllocate>[0]);
  });
  ipcMain.handle("payments:allocate", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return allocateExisting(
      input as Parameters<typeof allocateExisting>[0],
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle("payments:previewReversal", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return previewReversal(input as Parameters<typeof previewReversal>[0]);
  });
  ipcMain.handle("payments:reverse", async (event, input: unknown, idempotencyKey: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return reversePayment(
      input as Parameters<typeof reversePayment>[0],
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle(
    "payments:lookupOperation",
    async (event, idempotencyKey: unknown, commandType: unknown) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Untrusted IPC sender.");
      }
      if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
        throw new Error("Idempotency key is required.");
      }
      if (
        commandType !== undefined &&
        commandType !== "post" &&
        commandType !== "allocate" &&
        commandType !== "reverse"
      ) {
        throw new Error("Invalid payment command type.");
      }
      return lookupPaymentOperation(idempotencyKey, commandType);
    },
  );
  ipcMain.handle("payments:getRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return { ok: true as const, data: getPaymentCommitRecovery() };
  });
  ipcMain.handle("payments:setRecovery", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const record: PaymentCommitRecoveryRecord | null = parsePaymentCommitRecovery(input);
    if (record === null) {
      throw new Error("Invalid payment recovery fields.");
    }
    setPaymentCommitRecovery(record);
    return { ok: true as const, data: record };
  });
  ipcMain.handle("payments:clearRecovery", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    clearPaymentCommitRecoveryRecord();
    return { ok: true as const, data: null };
  });

  ipcMain.handle("print:listPrinters", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return listSystemPrinters();
  });
  ipcMain.handle("print:getConfig", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return getTerminalPrinterConfig();
  });
  ipcMain.handle("print:setConfig", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return setTerminalPrinterConfig(input);
  });
  ipcMain.handle("print:getStallIdentity", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return getStallPrintIdentity();
  });
  ipcMain.handle("print:setStallIdentity", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return setStallPrintIdentity(input);
  });
  ipcMain.handle("print:preview", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return previewDocument(input);
  });
  ipcMain.handle("print:print", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return printDocument(input);
  });
  ipcMain.handle("print:listAttempts", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    const parsed = input as {
      documentKind?: unknown;
      documentId?: unknown;
      limit?: unknown;
    };
    if (
      !input ||
      typeof input !== "object" ||
      typeof parsed.documentKind !== "string" ||
      typeof parsed.documentId !== "string"
    ) {
      throw new Error("Invalid list attempts request.");
    }
    return listPrintAttempts({
      documentKind: parsed.documentKind as Parameters<typeof listPrintAttempts>[0]["documentKind"],
      documentId: parsed.documentId,
      limit: typeof parsed.limit === "number" ? parsed.limit : undefined,
    });
  });
  ipcMain.handle("print:recoverAttempt", async (event, attemptId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof attemptId !== "string") {
      throw new Error("Attempt id is required.");
    }
    return recoverPrintAttempt(attemptId);
  });
  ipcMain.handle("print:flushPendingOutcome", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return flushPendingPrintOutcome();
  });

  ipcMain.handle("reports:catalog", async (event) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return getReportCatalog();
  });
  ipcMain.handle("reports:run", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return runReport(input as Parameters<typeof runReport>[0]);
  });
  ipcMain.handle("reports:createExport", async (event, input: unknown, idempotencyKey?: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return createReportExport(
      input as Parameters<typeof createReportExport>[0],
      typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    );
  });
  ipcMain.handle("reports:getExportArtifact", async (event, exportJobId: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    if (typeof exportJobId !== "string") {
      throw new Error("exportJobId is required.");
    }
    return getReportExportArtifact(exportJobId);
  });
  ipcMain.handle("reports:saveExport", async (event, input: unknown) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Untrusted IPC sender.");
    }
    return saveReportExport(input as Parameters<typeof saveReportExport>[0]);
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
