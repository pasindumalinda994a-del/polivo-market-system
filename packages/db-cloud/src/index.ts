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
  FarmerRow,
  TraderRow,
  VegetableRow,
  PaymentRow,
  SyncReceivedEventRow,
  TenantStatus,
  MembershipStatus,
  MembershipAccessRole,
  IdentityProvider,
} from "./types.js";
