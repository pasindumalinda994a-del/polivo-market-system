/**
 * @polivo/db-cloud — server-side cloud database foundations.
 * Do not import this package from React client components, Electron renderer,
 * shared UI, domain, or contracts packages.
 */

export {
  CloudConfigError,
  loadUserCloudConfig,
  USER_CLOUD_ENV_NAMES,
  SERVER_ONLY_CLOUD_ENV_NAMES,
  type UserCloudConfig,
} from "./config.js";

export {
  createUserSupabaseClient,
  type AccessTokenProvider,
  type CreateUserSupabaseClientOptions,
} from "./client.js";

export {
  CloudNumericError,
  CLOUD_NUMERIC_AGGREGATION_NOTE,
  moneyMinorToPgString,
  moneyMinorFromPg,
  weightHundredthsToPgString,
  weightHundredthsFromPg,
  moneyMinorRoundTripFromSqlite,
  weightHundredthsRoundTripFromSqlite,
} from "./numeric.js";

export type {
  Database,
  TenantRow,
  TenantMembershipRow,
  TenantPermissionProfileRow,
  TenantInvitationRow,
  TenantOnboardingRequestRow,
  AdminAuditEventRow,
  FarmerRow,
  TraderRow,
  VegetableRow,
  PaymentRow,
  ReportExportJobRow,
  SyncReceivedEventRow,
  TenantStatus,
  MembershipStatus,
  MembershipAccessRole,
  OperationalProfileRole,
  InvitationStatus,
  IdentityProvider,
  CreateStallWithOwnerArgs,
  CreateStallWithOwnerResult,
} from "./types.js";

export {
  captureReportingWatermarks,
  getStallReportingFreshness,
  listEligibleFarmerSaleLineObligations,
  listEligibleTraderBillObligations,
  listReportCorrections,
  listReportPayments,
  listReportSaleLines,
  listStatementMovementsPage,
  listUnappliedPaymentsAtWatermark,
  sumAccountBalanceAtWatermark,
  sumBalanceBeforeStatementPage,
  sumStatementOpeningBalanceMinor,
  getReportExportJobByCreateOperationId,
  getReportExportJobById,
  getReportExportJobContent,
  insertReportExportJob,
  markReportExportJobExpired,
  CloudReportError,
  type EligibleObligationRow,
  type InsertReportExportJobInput,
  type LedgerPartyKind,
  type ListReportCorrectionsInput,
  type ListReportPaymentsInput,
  type ListReportSaleLinesInput,
  type ListStatementMovementsInput,
  type ListStatementMovementsResult,
  type ReportCorrectionRow,
  type ReportExportJobRecord,
  type ReportPaymentRow,
  type ReportSaleLineRow,
  type ReportingWatermarks,
  type StallReportingFreshness,
  type StatementMovementRow,
  type UnappliedPaymentRow,
  type UserReportingClient,
} from "./reports/index.js";
