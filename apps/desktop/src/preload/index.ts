import { contextBridge, ipcRenderer } from "electron";

export type TerminalEnrollmentStatus = {
  installationId: string;
  hasCredential: boolean;
  pairingState: "idle" | "redeemed" | "waiting_host_confirm" | "paired" | "failed";
  stallDisplayName: string | null;
  hostDeviceId: string | null;
  deviceId: string | null;
  label: string | null;
  hasHostTrustPins: boolean;
};

export type DesktopConnectionStatus = {
  state:
    | "unconfigured"
    | "unreachable"
    | "identity_failed"
    | "verified"
    | "signed_in"
    | "session_refresh_required"
    | "signed_out";
  pairedHostDeviceId: string | null;
  verifiedStallDisplayName: string | null;
  configuredHostLabel: string | null;
  lastSuccessfulCheckAt: string | null;
  lastErrorMessage: string | null;
  staffDisplayName: string | null;
  staffCode: string | null;
  capabilities: string[];
};

export type ConfigureHostResult = {
  ok: boolean;
  verifiedStallDisplayName: string | null;
  hostDeviceId: string | null;
  message: string;
};

/**
 * Narrow enrollment + connection bridges only.
 * No raw IPC, filesystem, private keys, or session secrets exposed.
 */
contextBridge.exposeInMainWorld("polivoEnrollment", {
  getStatus: (): Promise<TerminalEnrollmentStatus> => ipcRenderer.invoke("enrollment:getStatus"),
  enrollTerminal: (input: {
    enrollmentSecret: string;
    enrollmentBaseUrl: string;
    deploymentEnvironment: "development" | "staging" | "production";
    hostServiceBaseUrl: string;
  }): Promise<TerminalEnrollmentStatus> => ipcRenderer.invoke("enrollment:enrollTerminal", input),
});

contextBridge.exposeInMainWorld("polivoConnection", {
  getStatus: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:getStatus"),
  configureOrTestHost: (input: {
    hostAddress: string;
    port?: number;
  }): Promise<ConfigureHostResult> => ipcRenderer.invoke("connection:configureOrTestHost", input),
  signIn: (input: { staffCode: string; secret: string }): Promise<DesktopConnectionStatus> =>
    ipcRenderer.invoke("connection:signIn", input),
  getSession: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:getSession"),
  signOut: (): Promise<{
    status: DesktopConnectionStatus;
    serverRevocationAcknowledged: boolean;
  }> => ipcRenderer.invoke("connection:signOut"),
  retry: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:retry"),
  switchStaff: (): Promise<DesktopConnectionStatus> => ipcRenderer.invoke("connection:switchStaff"),
});

export type FarmerRecord = {
  id: string;
  shortCode: string;
  displayName: string;
  contactNumber: string | null;
  locality: string | null;
  isActive: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type FarmerListResult =
  | { ok: true; data: { items: FarmerRecord[]; nextCursor: string | null }; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

export type FarmerMutationResult =
  | { ok: true; data: FarmerRecord; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoFarmers", {
  list: (input: {
    q?: string;
    active?: "active" | "inactive" | "all";
    limit?: number;
    cursor?: string;
  }): Promise<FarmerListResult> => ipcRenderer.invoke("farmers:list", input),
  get: (farmerId: string): Promise<FarmerMutationResult> =>
    ipcRenderer.invoke("farmers:get", farmerId),
  create: (
    input: {
      shortCode: string;
      displayName: string;
      contactNumber?: string | null;
      locality?: string | null;
    },
    idempotencyKey?: string,
  ): Promise<FarmerMutationResult> => ipcRenderer.invoke("farmers:create", input, idempotencyKey),
  update: (
    farmerId: string,
    input: {
      expectedRevision: number;
      displayName?: string;
      contactNumber?: string | null;
      locality?: string | null;
    },
    idempotencyKey?: string,
  ): Promise<FarmerMutationResult> =>
    ipcRenderer.invoke("farmers:update", farmerId, input, idempotencyKey),
  changeStatus: (
    farmerId: string,
    input: { expectedRevision: number; status: "active" | "inactive" },
    idempotencyKey?: string,
  ): Promise<FarmerMutationResult> =>
    ipcRenderer.invoke("farmers:changeStatus", farmerId, input, idempotencyKey),
});

export type BuyerRecord = {
  id: string;
  shortCode: string;
  displayName: string;
  contactNumber: string | null;
  locality: string | null;
  isActive: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type BuyerListResult =
  | { ok: true; data: { items: BuyerRecord[]; nextCursor: string | null }; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

export type BuyerMutationResult =
  | { ok: true; data: BuyerRecord; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoBuyers", {
  list: (input: {
    q?: string;
    active?: "active" | "inactive" | "all";
    limit?: number;
    cursor?: string;
  }): Promise<BuyerListResult> => ipcRenderer.invoke("buyers:list", input),
  get: (buyerId: string): Promise<BuyerMutationResult> => ipcRenderer.invoke("buyers:get", buyerId),
  create: (
    input: {
      shortCode: string;
      displayName: string;
      contactNumber?: string | null;
      locality?: string | null;
    },
    idempotencyKey?: string,
  ): Promise<BuyerMutationResult> => ipcRenderer.invoke("buyers:create", input, idempotencyKey),
  update: (
    buyerId: string,
    input: {
      expectedRevision: number;
      displayName?: string;
      contactNumber?: string | null;
      locality?: string | null;
    },
    idempotencyKey?: string,
  ): Promise<BuyerMutationResult> =>
    ipcRenderer.invoke("buyers:update", buyerId, input, idempotencyKey),
  changeStatus: (
    buyerId: string,
    input: { expectedRevision: number; status: "active" | "inactive" },
    idempotencyKey?: string,
  ): Promise<BuyerMutationResult> =>
    ipcRenderer.invoke("buyers:changeStatus", buyerId, input, idempotencyKey),
});

export type CatalogRecord = {
  id: string;
  shortCode: string;
  displayName: string;
  isActive: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogListResult =
  | { ok: true; data: { items: CatalogRecord[]; nextCursor: string | null }; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

export type CatalogMutationResult =
  | { ok: true; data: CatalogRecord; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoVegetables", {
  list: (input: {
    q?: string;
    active?: "active" | "inactive" | "all";
    limit?: number;
    cursor?: string;
  }): Promise<CatalogListResult> => ipcRenderer.invoke("vegetables:list", input),
  get: (vegetableId: string): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("vegetables:get", vegetableId),
  create: (
    input: { shortCode: string; displayName: string },
    idempotencyKey?: string,
  ): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("vegetables:create", input, idempotencyKey),
  update: (
    vegetableId: string,
    input: { expectedRevision: number; displayName: string },
    idempotencyKey?: string,
  ): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("vegetables:update", vegetableId, input, idempotencyKey),
  changeStatus: (
    vegetableId: string,
    input: { expectedRevision: number; status: "active" | "inactive" },
    idempotencyKey?: string,
  ): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("vegetables:changeStatus", vegetableId, input, idempotencyKey),
});

contextBridge.exposeInMainWorld("polivoPackageTypes", {
  list: (input: {
    q?: string;
    active?: "active" | "inactive" | "all";
    limit?: number;
    cursor?: string;
  }): Promise<CatalogListResult> => ipcRenderer.invoke("packageTypes:list", input),
  create: (
    input: { shortCode: string; displayName: string },
    idempotencyKey?: string,
  ): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("packageTypes:create", input, idempotencyKey),
  update: (
    packageTypeId: string,
    input: { expectedRevision: number; displayName: string },
    idempotencyKey?: string,
  ): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("packageTypes:update", packageTypeId, input, idempotencyKey),
  changeStatus: (
    packageTypeId: string,
    input: { expectedRevision: number; status: "active" | "inactive" },
    idempotencyKey?: string,
  ): Promise<CatalogMutationResult> =>
    ipcRenderer.invoke("packageTypes:changeStatus", packageTypeId, input, idempotencyKey),
});

export type CommissionBandDto = {
  id: string;
  sortOrder?: number;
  minPricePerKgMinor: number;
  maxPricePerKgMinor: number | null;
  ratePerKgMinor: number;
};

export type CommissionActivePolicy = {
  status: "unconfigured" | "configured";
  stallId: string;
  revision: number;
  updatedAt: string;
  activeVersion: {
    id: string;
    versionNumber: number;
    activatedAt: string | null;
    activatedByStaffId: string | null;
    bands: CommissionBandDto[];
  } | null;
  rateBasis: "per_kg_minor";
  roundingRuleId: string;
  algorithmVersion: string;
};

export type CommissionVersionSummary = {
  id: string;
  versionNumber: number;
  activatedAt: string | null;
  activatedByStaffId: string | null;
  bandCount: number;
  isActive: boolean;
};

export type CommissionPreviewResult = {
  policyId: string;
  versionId: string;
  versionNumber: number;
  bandId: string;
  selectionPricePerKgMinor: number;
  chargeableWeightHundredths: number;
  appliedRatePerKgMinor: number;
  commissionMinor: number;
  explanation: string;
  isActiveVersion: boolean;
};

export type CommissionApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoCommissionPolicy", {
  getActive: (): Promise<CommissionApiResult<CommissionActivePolicy>> =>
    ipcRenderer.invoke("commissionPolicy:getActive"),
  listVersions: (input?: {
    limit?: number;
    cursor?: string;
  }): Promise<
    CommissionApiResult<{ items: CommissionVersionSummary[]; nextCursor: string | null }>
  > => ipcRenderer.invoke("commissionPolicy:listVersions", input ?? {}),
  getVersion: (versionId: string): Promise<CommissionApiResult<unknown>> =>
    ipcRenderer.invoke("commissionPolicy:getVersion", versionId),
  activate: (
    input: {
      expectedRevision: number;
      bands: Array<{
        id: string;
        minPricePerKgMinor: number;
        maxPricePerKgMinor: number | null;
        ratePerKgMinor: number;
      }>;
    },
    idempotencyKey?: string,
  ): Promise<CommissionApiResult<CommissionActivePolicy>> =>
    ipcRenderer.invoke("commissionPolicy:activate", input, idempotencyKey),
  preview: (input: {
    versionId?: string;
    sellingPricePerKgMinor: number;
    netWeightHundredths: number;
  }): Promise<CommissionApiResult<CommissionPreviewResult>> =>
    ipcRenderer.invoke("commissionPolicy:preview", input),
});

export type AccountBalance = {
  stallId: string;
  partyKind: "farmer" | "trader";
  partyId: string;
  currency: "LKR";
  balanceMinor: number;
  displayAmountMinor: number;
  directionLabel: string;
  openingStatus: "not_opened" | "opened" | "opened_zero";
  openingCutoffDate: string | null;
  asOfBusinessDate: string | null;
};

export type AccountMovement = {
  entryId: string;
  postingId: string;
  businessDate: string;
  recordedAt: string;
  postingSequence: number;
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  description: string | null;
  amountMinor: number;
  directionLabel: string;
  runningBalanceMinor: number;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
};

export type OpeningDraft = {
  id: string;
  stallId: string;
  partyKind: "farmer" | "trader";
  partyId: string;
  direction:
    | "stall_owes_farmer"
    | "farmer_owes_stall"
    | "buyer_owes_stall"
    | "stall_owes_buyer";
  amountMinor: number;
  signedAmountMinor: number | null;
  cutoffDate: string;
  currency: "LKR";
  reference: string | null;
  explanation: string | null;
  status: "draft" | "posted" | "discarded";
  revision: number;
  isZeroOpening: boolean;
  directionLabel: string;
  createdAt: string;
  updatedAt: string;
  createdByStaffId: string | null;
  postedPostingId: string | null;
};

export type AccountsApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoAccounts", {
  getBalance: (input: {
    partyKind: "farmer" | "trader";
    partyId: string;
  }): Promise<AccountsApiResult<AccountBalance>> =>
    ipcRenderer.invoke("accounts:getBalance", input),
  listMovements: (input: {
    partyKind: "farmer" | "trader";
    partyId: string;
    limit?: number;
    cursor?: string;
  }): Promise<
    AccountsApiResult<{
      precedingBalanceMinor: number;
      items: AccountMovement[];
      nextCursor: string | null;
    }>
  > => ipcRenderer.invoke("accounts:listMovements", input),
  prepareOpening: (
    input: {
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
    idempotencyKey?: string,
  ): Promise<AccountsApiResult<OpeningDraft>> =>
    ipcRenderer.invoke("accounts:prepareOpening", input, idempotencyKey),
  updateOpening: (
    draftId: string,
    input: {
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
    idempotencyKey?: string,
  ): Promise<AccountsApiResult<OpeningDraft>> =>
    ipcRenderer.invoke("accounts:updateOpening", draftId, input, idempotencyKey),
  postOpening: (
    draftId: string,
    input: { expectedRevision: number },
    idempotencyKey?: string,
  ): Promise<
    AccountsApiResult<{
      draft: OpeningDraft;
      balance: AccountBalance;
      postingId: string | null;
    }>
  > => ipcRenderer.invoke("accounts:postOpening", draftId, input, idempotencyKey),
  correctOpening: (
    input: {
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
    idempotencyKey?: string,
  ): Promise<
    AccountsApiResult<{
      balance: AccountBalance;
      reversalPostingId: string | null;
      replacementPostingId: string | null;
      originalPostingId: string | null;
    }>
  > => ipcRenderer.invoke("accounts:correctOpening", input, idempotencyKey),
});
