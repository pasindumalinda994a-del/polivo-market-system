export {
  OPAQUE_ID_MAX_LENGTH,
  opaqueIdSchema,
  tenantIdSchema,
  deviceIdSchema,
  requestIdSchema,
  idempotencyKeySchema,
  absoluteTimestampSchema,
  calendarDateSchema,
  type OpaqueId,
  type TenantId,
  type DeviceId,
  type RequestId,
  type IdempotencyKey,
  type AbsoluteTimestamp,
  type CalendarDate,
} from "./primitives.js";

export {
  ERROR_CODES,
  ERROR_CODE_HTTP_STATUS,
  errorCodeSchema,
  validationIssueSchema,
  apiErrorSchema,
  mapZodIssuesToValidationIssues,
  type ErrorCode,
  type ValidationIssue,
  type ApiError,
} from "./errors.js";

export {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  PAGINATION_CURSOR_MAX_LENGTH,
  paginationLimitQuerySchema,
  paginationCursorSchema,
  paginationQuerySchema,
  createPaginatedResponseSchema,
  type PaginationQuery,
} from "./pagination.js";

export {
  LOCAL_API_CONTRACT_VERSION,
  SYNC_PROTOCOL_VERSION,
  localApiContractVersionSchema,
  syncProtocolVersionSchema,
  localApiContractVersionHeaderSchema,
  syncProtocolVersionFieldSchema,
  type LocalApiContractVersion,
  type SyncProtocolVersion,
} from "./versioning.js";

export {
  HEALTH_SERVICE_NAME,
  HEALTH_STATUS_OK,
  healthResponseSchema,
  buildHealthResponse,
  type HealthResponse,
} from "./health.js";

export { createSyncEnvelopeSchema, type SyncEnvelope } from "./sync/envelope.js";
