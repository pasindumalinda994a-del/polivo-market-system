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
  direction: "stall_owes_farmer" | "farmer_owes_stall" | "buyer_owes_stall" | "stall_owes_buyer";
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
  getStatement: (input: {
    partyKind: "farmer" | "trader";
    partyId: string;
    fromBusinessDate: string;
    toBusinessDate: string;
    limit?: number;
    cursor?: string;
    snapshotToken?: string;
    movementSearch?: string;
    sourceTypeFilter?: string;
  }): Promise<AccountsApiResult<unknown>> =>
    ipcRenderer.invoke("accounts:getStatement", input),
  getSummary: (input: {
    partyKind: "farmer" | "trader";
    partyId: string;
    asOfBusinessDate?: string;
    snapshotToken?: string;
  }): Promise<AccountsApiResult<unknown>> => ipcRenderer.invoke("accounts:getSummary", input),
  listOutstanding: (input: {
    partyKind: "farmer" | "trader";
    partyId: string;
    asOfBusinessDate?: string;
    historical?: boolean;
    snapshotToken?: string;
    limit?: number;
    cursor?: string;
  }): Promise<AccountsApiResult<unknown>> =>
    ipcRenderer.invoke("accounts:listOutstanding", input),
  listUnappliedPayments: (input: {
    partyKind: "farmer" | "trader";
    partyId: string;
    asOfBusinessDate?: string;
    snapshotToken?: string;
    includePaymentMetadata?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<AccountsApiResult<unknown>> =>
    ipcRenderer.invoke("accounts:listUnappliedPayments", input),
  prepareOpening: (
    input: {
      partyKind: "farmer" | "trader";
      partyId: string;
      direction:
        "stall_owes_farmer" | "farmer_owes_stall" | "buyer_owes_stall" | "stall_owes_buyer";
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
        "stall_owes_farmer" | "farmer_owes_stall" | "buyer_owes_stall" | "stall_owes_buyer";
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
          "stall_owes_farmer" | "farmer_owes_stall" | "buyer_owes_stall" | "stall_owes_buyer";
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

export type SalesBillingApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoSalesBilling", {
  createDraft: (input: unknown, idempotencyKey?: string): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:createDraft", input, idempotencyKey),
  listDrafts: (input?: unknown): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:listDrafts", input),
  getDraft: (saleId: string): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:getDraft", saleId),
  updateDraft: (
    saleId: string,
    input: unknown,
    idempotencyKey?: string,
  ): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:updateDraft", saleId, input, idempotencyKey),
  abandonDraft: (
    saleId: string,
    input: { expectedRevision: number },
    idempotencyKey?: string,
  ): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:abandonDraft", saleId, input, idempotencyKey),
  previewDraft: (saleId: string): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:previewDraft", saleId),
  finalizeDraft: (
    saleId: string,
    input: unknown,
    idempotencyKey?: string,
  ): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:finalizeDraft", saleId, input, idempotencyKey),
  lookupFinalization: (idempotencyKey: string): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:lookupFinalization", idempotencyKey),
  listTraderBills: (input?: unknown): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:listTraderBills", input),
  getTraderBill: (billId: string): Promise<SalesBillingApiResult<unknown>> =>
    ipcRenderer.invoke("salesBilling:getTraderBill", billId),
  getFinalizeRecovery: (): Promise<
    SalesBillingApiResult<{
      saleId: string;
      idempotencyKey: string;
      expectedRevision: number;
      expectedCalculationFingerprint: string;
      startedAt: string;
    } | null>
  > => ipcRenderer.invoke("salesBilling:getFinalizeRecovery"),
  setFinalizeRecovery: (input: {
    saleId: string;
    idempotencyKey: string;
    expectedRevision: number;
    expectedCalculationFingerprint: string;
    startedAt: string;
  }): Promise<
    SalesBillingApiResult<{
      saleId: string;
      idempotencyKey: string;
      expectedRevision: number;
      expectedCalculationFingerprint: string;
      startedAt: string;
    }>
  > => ipcRenderer.invoke("salesBilling:setFinalizeRecovery", input),
  clearFinalizeRecovery: (): Promise<SalesBillingApiResult<null>> =>
    ipcRenderer.invoke("salesBilling:clearFinalizeRecovery"),
});

export type FarmerBillingApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoFarmerBilling", {
  listSales: (input: unknown): Promise<FarmerBillingApiResult<unknown>> =>
    ipcRenderer.invoke("farmerBilling:listSales", input),
  preview: (input: unknown): Promise<FarmerBillingApiResult<unknown>> =>
    ipcRenderer.invoke("farmerBilling:preview", input),
  issue: (input: unknown, idempotencyKey?: string): Promise<FarmerBillingApiResult<unknown>> =>
    ipcRenderer.invoke("farmerBilling:issue", input, idempotencyKey),
  lookupIssuance: (idempotencyKey: string): Promise<FarmerBillingApiResult<unknown>> =>
    ipcRenderer.invoke("farmerBilling:lookupIssuance", idempotencyKey),
  listBills: (input?: unknown): Promise<FarmerBillingApiResult<unknown>> =>
    ipcRenderer.invoke("farmerBilling:listBills", input),
  getBill: (billId: string): Promise<FarmerBillingApiResult<unknown>> =>
    ipcRenderer.invoke("farmerBilling:getBill", billId),
  getIssueRecovery: (): Promise<
    FarmerBillingApiResult<{
      farmerId: string;
      sourceLineIds: string[];
      expectedSelectionFingerprint: string;
      businessDate: string | null;
      idempotencyKey: string;
      startedAt: string;
    } | null>
  > => ipcRenderer.invoke("farmerBilling:getIssueRecovery"),
  setIssueRecovery: (input: {
    farmerId: string;
    sourceLineIds: string[];
    expectedSelectionFingerprint: string;
    businessDate: string | null;
    idempotencyKey: string;
    startedAt: string;
  }): Promise<
    FarmerBillingApiResult<{
      farmerId: string;
      sourceLineIds: string[];
      expectedSelectionFingerprint: string;
      businessDate: string | null;
      idempotencyKey: string;
      startedAt: string;
    }>
  > => ipcRenderer.invoke("farmerBilling:setIssueRecovery", input),
  clearIssueRecovery: (): Promise<FarmerBillingApiResult<null>> =>
    ipcRenderer.invoke("farmerBilling:clearIssueRecovery"),
});

export type BillCorrectionsApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoBillCorrections", {
  listHistory: (input?: unknown): Promise<BillCorrectionsApiResult<unknown>> =>
    ipcRenderer.invoke("billCorrections:listHistory", input),
  getDetail: (input: {
    billType: "trader" | "farmer";
    billId: string;
  }): Promise<BillCorrectionsApiResult<unknown>> =>
    ipcRenderer.invoke("billCorrections:getDetail", input),
  eligibility: (saleId: string): Promise<BillCorrectionsApiResult<unknown>> =>
    ipcRenderer.invoke("billCorrections:eligibility", saleId),
  preview: (input: unknown): Promise<BillCorrectionsApiResult<unknown>> =>
    ipcRenderer.invoke("billCorrections:preview", input),
  commit: (input: unknown, idempotencyKey?: string): Promise<BillCorrectionsApiResult<unknown>> =>
    ipcRenderer.invoke("billCorrections:commit", input, idempotencyKey),
  lookup: (idempotencyKey: string): Promise<BillCorrectionsApiResult<unknown>> =>
    ipcRenderer.invoke("billCorrections:lookup", idempotencyKey),
  getRecovery: (): Promise<
    BillCorrectionsApiResult<{
      idempotencyKey: string;
      saleId: string;
      action: "correct" | "reverse";
      savedAt: string;
    } | null>
  > => ipcRenderer.invoke("billCorrections:getRecovery"),
  setRecovery: (input: {
    idempotencyKey: string;
    saleId: string;
    action: "correct" | "reverse";
    savedAt: string;
  }): Promise<
    BillCorrectionsApiResult<{
      idempotencyKey: string;
      saleId: string;
      action: "correct" | "reverse";
      savedAt: string;
    } | null>
  > => ipcRenderer.invoke("billCorrections:setRecovery", input),
  clearRecovery: (): Promise<BillCorrectionsApiResult<null>> =>
    ipcRenderer.invoke("billCorrections:clearRecovery"),
});

export type PaymentsApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

export type PaymentCommitRecovery = {
  kind: "post" | "allocate" | "reverse";
  idempotencyKey: string;
  startedAt: string;
  partyKind: "trader" | "farmer" | null;
  partyId: string | null;
  direction: "receive" | "pay" | null;
  paymentId: string | null;
  previewFingerprint: string;
  payload: Record<string, unknown>;
};

contextBridge.exposeInMainWorld("polivoPayments", {
  listObligations: (input: {
    partyKind: "trader" | "farmer";
    partyId: string;
    direction: "receive" | "pay";
  }): Promise<PaymentsApiResult<unknown>> => ipcRenderer.invoke("payments:listObligations", input),
  preview: (input: unknown): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:preview", input),
  post: (input: unknown, idempotencyKey?: string): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:post", input, idempotencyKey),
  list: (input?: unknown): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:list", input),
  get: (paymentId: string): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:get", paymentId),
  previewAllocate: (input: unknown): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:previewAllocate", input),
  allocate: (input: unknown, idempotencyKey?: string): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:allocate", input, idempotencyKey),
  previewReversal: (input: unknown): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:previewReversal", input),
  reverse: (input: unknown, idempotencyKey?: string): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:reverse", input, idempotencyKey),
  lookupOperation: (
    idempotencyKey: string,
    commandType?: "post" | "allocate" | "reverse",
  ): Promise<PaymentsApiResult<unknown>> =>
    ipcRenderer.invoke("payments:lookupOperation", idempotencyKey, commandType),
  getRecovery: (): Promise<PaymentsApiResult<PaymentCommitRecovery | null>> =>
    ipcRenderer.invoke("payments:getRecovery"),
  setRecovery: (input: PaymentCommitRecovery): Promise<PaymentsApiResult<PaymentCommitRecovery>> =>
    ipcRenderer.invoke("payments:setRecovery", input),
  clearRecovery: (): Promise<PaymentsApiResult<null>> =>
    ipcRenderer.invoke("payments:clearRecovery"),
});

export type PrintApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean };

contextBridge.exposeInMainWorld("polivoPrint", {
  listPrinters: (): Promise<PrintApiResult<unknown>> => ipcRenderer.invoke("print:listPrinters"),
  getConfig: (): Promise<PrintApiResult<unknown>> => ipcRenderer.invoke("print:getConfig"),
  setConfig: (input: unknown): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:setConfig", input),
  getStallIdentity: (): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:getStallIdentity"),
  setStallIdentity: (input: unknown): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:setStallIdentity", input),
  preview: (input: unknown): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:preview", input),
  print: (input: unknown): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:print", input),
  listAttempts: (input: {
    documentKind: string;
    documentId: string;
    limit?: number;
  }): Promise<PrintApiResult<unknown>> => ipcRenderer.invoke("print:listAttempts", input),
  recoverAttempt: (attemptId: string): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:recoverAttempt", attemptId),
  flushPendingOutcome: (): Promise<PrintApiResult<unknown>> =>
    ipcRenderer.invoke("print:flushPendingOutcome"),
});

export type ReportsApiResult<T> =
  | { ok: true; data: T; stale?: boolean }
  | { ok: false; code: string; message: string; conflict?: boolean; cancelled?: boolean };

contextBridge.exposeInMainWorld("polivoReports", {
  catalog: (): Promise<ReportsApiResult<unknown>> => ipcRenderer.invoke("reports:catalog"),
  run: (input: unknown): Promise<ReportsApiResult<unknown>> =>
    ipcRenderer.invoke("reports:run", input),
  createExport: (input: unknown, idempotencyKey?: string): Promise<ReportsApiResult<unknown>> =>
    ipcRenderer.invoke("reports:createExport", input, idempotencyKey),
  getExportArtifact: (exportJobId: string): Promise<ReportsApiResult<unknown>> =>
    ipcRenderer.invoke("reports:getExportArtifact", exportJobId),
  saveExport: (input: {
    exportJobId: string;
    defaultFileName?: string;
  }): Promise<ReportsApiResult<unknown>> => ipcRenderer.invoke("reports:saveExport", input),
});
