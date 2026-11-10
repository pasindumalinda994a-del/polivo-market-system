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
      ) => Promise<
        | { ok: true; data: import("../../preload/index").OpeningDraft; stale?: boolean }
        | { ok: false; code: string; message: string; conflict?: boolean }
      >;
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
