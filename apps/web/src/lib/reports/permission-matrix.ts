/** Locked Phase 35 web permission matrix (documentation + shared constants). */

export const CAP_REPORTS_VIEW_FINANCIAL = "reports.view_financial" as const;
export const CAP_DATA_EXPORT = "data.export" as const;
export const CAP_SYNC_VIEW = "sync.view" as const;
export const CAP_ACCOUNTS_VIEW = "accounts.view" as const;

/** Owner OR reports.view_financial — dashboard, sales, payments, outstanding, prices, parties, bills, statements. */
export const REPORTING_SURFACES = [
  "dashboard",
  "sales",
  "payments",
  "outstanding",
  "prices",
  "farmers",
  "buyers",
  "bills",
  "statements",
] as const;

/** Owner OR data.export — export create/retrieve. */
export const EXPORT_SURFACES = ["export_create", "export_retrieve"] as const;

/** Owner OR sync.view — sync diagnostics (freshness banner allowed with reporting access). */
export const SYNC_DIAGNOSTICS_SURFACES = ["sync_diagnostics"] as const;

/** Members, permissions, devices — owner only (separate from reporting). */
export const OWNER_ADMIN_SURFACES = ["members", "permissions", "devices"] as const;
