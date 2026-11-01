export {
  initializeNewDatabase,
  openExistingDatabase,
  openExistingDatabaseAndVerify,
  DatabaseConnectionError,
  type LocalDatabase,
} from "./connection.js";
export { resolveDatabasePath, requireAbsoluteDatabasePath, DatabasePathError } from "./paths.js";
export {
  applyRuntimePragmas,
  assertForeignKeysEnabled,
  SQLITE_BUSY_TIMEOUT_MS,
} from "./pragmas.js";
export {
  moneyMinorToSqliteInteger,
  moneyMinorFromSqliteInteger,
  weightHundredthsToSqliteInteger,
  weightHundredthsFromSqliteInteger,
  NumericPersistenceError,
  NUMERIC_AGGREGATION_NOTE,
} from "./numeric.js";
export {
  loadBundledMigrations,
  loadMigrationsFromDirectory,
  resolveBundledMigrationsDirectory,
  migrationChecksum,
  type MigrationDefinition,
} from "./migrations/registry.js";
export {
  applyPendingMigrations,
  getMigrationStatus,
  verifySchemaCompatibility,
  createSyntheticMigration,
  MigrationError,
  type AppliedMigration,
  type MigrationStatus,
} from "./migrations/runner.js";

export {
  runInTransaction,
  TransactionError,
  NestedTransactionError,
  ClosedTransactionError,
  AsyncTransactionCallbackError,
  type TxHandle,
} from "./transactions.js";

export {
  classifySqliteError,
  type ClassifiedSqliteError,
  type SqliteFailureKind,
} from "./sqlite-errors.js";

export { RowMappingError } from "./mapping/errors.js";
export type {
  StallBindingRecord,
  LocalInstallationRecord,
  PartyRecord,
  BillRecord,
  BillStatus,
  BillType,
  PaymentStatus,
  IdempotencyRecord,
  AuditEventRecord,
  OutboxEventRecord,
} from "./mapping/records.js";
export {
  mapStallBindingRow,
  mapLocalInstallationRow,
  mapPartyRow,
  mapBillRow,
  mapIdempotencyRow,
  mapAuditEventRow,
  mapOutboxEventRow,
} from "./mapping/records.js";

export {
  RepositoryError,
  NotFoundError,
  RevisionConflictError,
  SequenceConfigurationError,
  type DbExecutor,
} from "./repositories/types.js";
export {
  getLocalInstallation,
  getStallBinding,
  tryGetStallBinding,
} from "./repositories/binding.js";
export { getFarmerById, getTraderById } from "./repositories/parties.js";
export {
  getBillById,
  updateBillWithExpectedRevision,
  type BillOptimisticUpdate,
} from "./repositories/bills.js";
export {
  getIdempotencyRecord,
  insertCompletedIdempotencyRecord,
  type InsertCompletedIdempotencyInput,
} from "./repositories/idempotency.js";
export { appendAuditEvent, type AppendAuditEventInput } from "./repositories/audit.js";
export { appendOutboxEvent, type AppendOutboxEventInput } from "./repositories/outbox.js";
export { allocateNextBillSequence, BILL_SEQUENCE_MAX_VALUE } from "./repositories/sequences.js";
