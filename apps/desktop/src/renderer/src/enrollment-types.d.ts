import type {
  ConfigureHostResult,
  DesktopConnectionStatus,
  BuyerListResult,
  BuyerMutationResult,
  BuyerRecord,
  CatalogListResult,
  CatalogMutationResult,
  CatalogRecord,
  FarmerListResult,
  FarmerMutationResult,
  FarmerRecord,
  PaymentCommitRecovery,
  PaymentsApiResult,
  TerminalEnrollmentStatus,
} from "../../preload/index";

export {};

declare global {
  interface Window {
    polivoEnrollment?: {
      getStatus: () => Promise<TerminalEnrollmentStatus>;
      enrollTerminal: (input: {
        enrollmentSecret: string;
        enrollmentBaseUrl: string;
        deploymentEnvironment: "development" | "staging" | "production";
        hostServiceBaseUrl: string;
      }) => Promise<TerminalEnrollmentStatus>;
    };
    polivoConnection?: {
      getStatus: () => Promise<DesktopConnectionStatus>;
      configureOrTestHost: (input: {
        hostAddress: string;
        port?: number;
      }) => Promise<ConfigureHostResult>;
      signIn: (input: { staffCode: string; secret: string }) => Promise<DesktopConnectionStatus>;
      getSession: () => Promise<DesktopConnectionStatus>;
      signOut: () => Promise<{
        status: DesktopConnectionStatus;
        serverRevocationAcknowledged: boolean;
      }>;
      retry: () => Promise<DesktopConnectionStatus>;
      switchStaff: () => Promise<DesktopConnectionStatus>;
    };
    polivoFarmers?: {
      list: (input: {
        q?: string;
        active?: "active" | "inactive" | "all";
        limit?: number;
        cursor?: string;
      }) => Promise<FarmerListResult>;
      get: (farmerId: string) => Promise<FarmerMutationResult>;
      create: (
        input: {
          shortCode: string;
          displayName: string;
          contactNumber?: string | null;
          locality?: string | null;
        },
        idempotencyKey?: string,
      ) => Promise<FarmerMutationResult>;
      update: (
        farmerId: string,
        input: {
          expectedRevision: number;
          displayName?: string;
          contactNumber?: string | null;
          locality?: string | null;
        },
        idempotencyKey?: string,
      ) => Promise<FarmerMutationResult>;
      changeStatus: (
        farmerId: string,
        input: { expectedRevision: number; status: "active" | "inactive" },
        idempotencyKey?: string,
      ) => Promise<FarmerMutationResult>;
    };
    polivoBuyers?: {
      list: (input: {
        q?: string;
        active?: "active" | "inactive" | "all";
        limit?: number;
        cursor?: string;
      }) => Promise<BuyerListResult>;
      get: (buyerId: string) => Promise<BuyerMutationResult>;
      create: (
        input: {
          shortCode: string;
          displayName: string;
          contactNumber?: string | null;
          locality?: string | null;
        },
        idempotencyKey?: string,
      ) => Promise<BuyerMutationResult>;
      update: (
        buyerId: string,
        input: {
          expectedRevision: number;
          displayName?: string;
          contactNumber?: string | null;
          locality?: string | null;
        },
        idempotencyKey?: string,
      ) => Promise<BuyerMutationResult>;
      changeStatus: (
        buyerId: string,
        input: { expectedRevision: number; status: "active" | "inactive" },
        idempotencyKey?: string,
      ) => Promise<BuyerMutationResult>;
    };
    polivoVegetables?: {
      list: (input: {
        q?: string;
        active?: "active" | "inactive" | "all";
        limit?: number;
        cursor?: string;
      }) => Promise<CatalogListResult>;
      get: (vegetableId: string) => Promise<CatalogMutationResult>;
      create: (
        input: { shortCode: string; displayName: string },
        idempotencyKey?: string,
      ) => Promise<CatalogMutationResult>;
      update: (
        vegetableId: string,
        input: { expectedRevision: number; displayName: string },
        idempotencyKey?: string,
      ) => Promise<CatalogMutationResult>;
      changeStatus: (
        vegetableId: string,
        input: { expectedRevision: number; status: "active" | "inactive" },
        idempotencyKey?: string,
      ) => Promise<CatalogMutationResult>;
    };
    polivoPackageTypes?: {
      list: (input: {
        q?: string;
        active?: "active" | "inactive" | "all";
        limit?: number;
        cursor?: string;
      }) => Promise<CatalogListResult>;
      create: (
        input: { shortCode: string; displayName: string },
        idempotencyKey?: string,
      ) => Promise<CatalogMutationResult>;
      update: (
        packageTypeId: string,
        input: { expectedRevision: number; displayName: string },
        idempotencyKey?: string,
      ) => Promise<CatalogMutationResult>;
      changeStatus: (
        packageTypeId: string,
        input: { expectedRevision: number; status: "active" | "inactive" },
        idempotencyKey?: string,
      ) => Promise<CatalogMutationResult>;
    };
    polivoAccounts?: {
      getBalance: (input: {
        partyKind: "farmer" | "trader";
        partyId: string;
      }) => Promise<
        | { ok: true; data: import("../../preload/index").AccountBalance; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listMovements: (input: {
        partyKind: "farmer" | "trader";
        partyId: string;
        limit?: number;
        cursor?: string;
      }) => Promise<
        | {
            ok: true;
            data: {
              precedingBalanceMinor: number;
              items: import("../../preload/index").AccountMovement[];
              nextCursor: string | null;
            };
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
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
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getSummary: (input: {
        partyKind: "farmer" | "trader";
        partyId: string;
        asOfBusinessDate?: string;
        snapshotToken?: string;
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listOutstanding: (input: {
        partyKind: "farmer" | "trader";
        partyId: string;
        asOfBusinessDate?: string;
        historical?: boolean;
        snapshotToken?: string;
        limit?: number;
        cursor?: string;
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listUnappliedPayments: (input: {
        partyKind: "farmer" | "trader";
        partyId: string;
        asOfBusinessDate?: string;
        snapshotToken?: string;
        includePaymentMetadata?: boolean;
        limit?: number;
        cursor?: string;
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
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
      ) => Promise<
        | { ok: true; data: import("../../preload/index").OpeningDraft; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
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
      ) => Promise<
        | { ok: true; data: import("../../preload/index").OpeningDraft; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      postOpening: (
        draftId: string,
        input: { expectedRevision: number },
        idempotencyKey?: string,
      ) => Promise<
        | {
            ok: true;
            data: {
              draft: import("../../preload/index").OpeningDraft;
              balance: import("../../preload/index").AccountBalance;
              postingId: string | null;
            };
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
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
      ) => Promise<
        | {
            ok: true;
            data: {
              balance: import("../../preload/index").AccountBalance;
              reversalPostingId: string | null;
              replacementPostingId: string | null;
              originalPostingId: string | null;
            };
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
    };
    polivoSalesBilling?: {
      createDraft: (
        input: unknown,
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listDrafts: (
        input?: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getDraft: (
        saleId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      updateDraft: (
        saleId: string,
        input: unknown,
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      abandonDraft: (
        saleId: string,
        input: { expectedRevision: number },
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      previewDraft: (
        saleId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      finalizeDraft: (
        saleId: string,
        input: unknown,
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      lookupFinalization: (
        idempotencyKey: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listTraderBills: (
        input?: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getTraderBill: (
        billId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getFinalizeRecovery: () => Promise<
        | {
            ok: true;
            data: {
              saleId: string;
              idempotencyKey: string;
              expectedRevision: number;
              expectedCalculationFingerprint: string;
              startedAt: string;
            } | null;
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      setFinalizeRecovery: (input: {
        saleId: string;
        idempotencyKey: string;
        expectedRevision: number;
        expectedCalculationFingerprint: string;
        startedAt: string;
      }) => Promise<
        | {
            ok: true;
            data: {
              saleId: string;
              idempotencyKey: string;
              expectedRevision: number;
              expectedCalculationFingerprint: string;
              startedAt: string;
            };
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      clearFinalizeRecovery: () => Promise<
        | { ok: true; data: null; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
    };
    polivoFarmerBilling?: {
      listSales: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      preview: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      issue: (
        input: unknown,
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      lookupIssuance: (
        idempotencyKey: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listBills: (
        input?: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getBill: (
        billId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getIssueRecovery: () => Promise<
        | {
            ok: true;
            data: {
              farmerId: string;
              sourceLineIds: string[];
              expectedSelectionFingerprint: string;
              businessDate: string | null;
              idempotencyKey: string;
              startedAt: string;
            } | null;
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      setIssueRecovery: (input: {
        farmerId: string;
        sourceLineIds: string[];
        expectedSelectionFingerprint: string;
        businessDate: string | null;
        idempotencyKey: string;
        startedAt: string;
      }) => Promise<
        | {
            ok: true;
            data: {
              farmerId: string;
              sourceLineIds: string[];
              expectedSelectionFingerprint: string;
              businessDate: string | null;
              idempotencyKey: string;
              startedAt: string;
            };
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      clearIssueRecovery: () => Promise<
        | { ok: true; data: null; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
    };
    polivoBillCorrections?: {
      listHistory: (
        input?: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getDetail: (input: {
        billType: "trader" | "farmer";
        billId: string;
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      eligibility: (
        saleId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      preview: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      commit: (
        input: unknown,
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      lookup: (
        idempotencyKey: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getRecovery: () => Promise<
        | {
            ok: true;
            data: {
              idempotencyKey: string;
              saleId: string;
              action: "correct" | "reverse";
              savedAt: string;
            } | null;
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      setRecovery: (input: {
        idempotencyKey: string;
        saleId: string;
        action: "correct" | "reverse";
        savedAt: string;
      }) => Promise<
        | {
            ok: true;
            data: {
              idempotencyKey: string;
              saleId: string;
              action: "correct" | "reverse";
              savedAt: string;
            } | null;
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      clearRecovery: () => Promise<
        | { ok: true; data: null; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
    };
    polivoPayments?: {
      listObligations: (input: {
        partyKind: "trader" | "farmer";
        partyId: string;
        direction: "receive" | "pay";
      }) => Promise<PaymentsApiResult<unknown>>;
      preview: (input: unknown) => Promise<PaymentsApiResult<unknown>>;
      post: (input: unknown, idempotencyKey?: string) => Promise<PaymentsApiResult<unknown>>;
      list: (input?: unknown) => Promise<PaymentsApiResult<unknown>>;
      get: (paymentId: string) => Promise<PaymentsApiResult<unknown>>;
      previewAllocate: (input: unknown) => Promise<PaymentsApiResult<unknown>>;
      allocate: (input: unknown, idempotencyKey?: string) => Promise<PaymentsApiResult<unknown>>;
      previewReversal: (input: unknown) => Promise<PaymentsApiResult<unknown>>;
      reverse: (input: unknown, idempotencyKey?: string) => Promise<PaymentsApiResult<unknown>>;
      lookupOperation: (
        idempotencyKey: string,
        commandType?: "post" | "allocate" | "reverse",
      ) => Promise<PaymentsApiResult<unknown>>;
      getRecovery: () => Promise<PaymentsApiResult<PaymentCommitRecovery | null>>;
      setRecovery: (
        input: PaymentCommitRecovery,
      ) => Promise<PaymentsApiResult<PaymentCommitRecovery>>;
      clearRecovery: () => Promise<PaymentsApiResult<null>>;
    };
    polivoPrint?: {
      listPrinters: () => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getConfig: () => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      setConfig: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getStallIdentity: () => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      setStallIdentity: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      preview: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      print: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listAttempts: (input: {
        documentKind: string;
        documentId: string;
        limit?: number;
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      recoverAttempt: (
        attemptId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      flushPendingOutcome: () => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
    };
    polivoReports?: {
      catalog: () => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean; cancelled?: boolean }
      >;
      run: (
        input: unknown,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean; cancelled?: boolean }
      >;
      createExport: (
        input: unknown,
        idempotencyKey?: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean; cancelled?: boolean }
      >;
      getExportArtifact: (
        exportJobId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean; cancelled?: boolean }
      >;
      saveExport: (input: {
        exportJobId: string;
        defaultFileName?: string;
      }) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean; cancelled?: boolean }
      >;
    };
    polivoCommissionPolicy?: {
      getActive: () => Promise<
        | { ok: true; data: import("../../preload/index").CommissionActivePolicy; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      listVersions: (input?: { limit?: number; cursor?: string }) => Promise<
        | {
            ok: true;
            data: {
              items: import("../../preload/index").CommissionVersionSummary[];
              nextCursor: string | null;
            };
            stale?: boolean;
          }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      getVersion: (
        versionId: string,
      ) => Promise<
        | { ok: true; data: unknown; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
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
      ) => Promise<
        | { ok: true; data: import("../../preload/index").CommissionActivePolicy; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
      preview: (input: {
        versionId?: string;
        sellingPricePerKgMinor: number;
        netWeightHundredths: number;
      }) => Promise<
        | { ok: true; data: import("../../preload/index").CommissionPreviewResult; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
    };
  }
}

export type { BuyerRecord, CatalogRecord, FarmerRecord };
