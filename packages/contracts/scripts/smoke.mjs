import {
  absoluteTimestampSchema,
  apiErrorSchema,
  buildHealthResponse,
  calendarDateSchema,
  createPaginatedResponseSchema,
  createSyncEnvelopeSchema,
  healthResponseSchema,
  localApiContractVersionSchema,
  mapZodIssuesToValidationIssues,
  opaqueIdSchema,
  paginationLimitQuerySchema,
  paginationQuerySchema,
  syncProtocolVersionSchema,
  tenantIdSchema,
} from "../dist/index.js";
import { z } from "zod";

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
    return;
  }

  console.log(`PASS: ${message}`);
}

function assertFails(schema, value, message) {
  const result = schema.safeParse(value);
  assert(!result.success, message);
  return result;
}

assert(opaqueIdSchema.safeParse("tenant-abc").success, "valid identifier passes");
assert(tenantIdSchema.safeParse("a").success, "minimum-length identifier passes");
assertFails(opaqueIdSchema, "", "empty identifier fails");
assertFails(opaqueIdSchema, "x".repeat(129), "oversized identifier fails");

assert(
  absoluteTimestampSchema.safeParse("2026-10-29T09:00:00.000Z").success,
  "UTC absolute timestamp passes",
);
assert(
  absoluteTimestampSchema.safeParse("2026-10-29T14:30:00+05:30").success,
  "offset absolute timestamp passes",
);
assertFails(absoluteTimestampSchema, "10/29/2026 9:00 AM", "locale timestamp fails");
assertFails(absoluteTimestampSchema, "2026-10-29", "calendar date is not an absolute timestamp");

assert(calendarDateSchema.safeParse("2026-10-29").success, "valid calendar date passes");
assertFails(calendarDateSchema, "2026-02-30", "invalid calendar date fails");
assertFails(calendarDateSchema, "29-10-2026", "locale calendar date fails");

assert(paginationLimitQuerySchema.safeParse("20").success, "query-string limit coerces");
assertFails(paginationLimitQuerySchema, "0", "zero pagination limit fails");
assertFails(paginationLimitQuerySchema, "-1", "negative pagination limit fails");
assertFails(paginationLimitQuerySchema, "1.5", "fractional pagination limit fails");
assertFails(paginationLimitQuerySchema, "101", "excessive pagination limit fails");

const strictCommand = z.strictObject({
  tenantId: tenantIdSchema,
});
assertFails(
  strictCommand,
  { tenantId: "t1", unexpected: true },
  "unknown fields are rejected on strict objects",
);

const invalidLimit = paginationQuerySchema.safeParse({ limit: 0 });
assert(!invalidLimit.success, "invalid pagination query fails");
if (!invalidLimit.success) {
  const issues = mapZodIssuesToValidationIssues(invalidLimit.error.issues);
  const serialized = JSON.stringify(issues);
  assert(
    !serialized.includes('"input"') && !Object.hasOwn(issues[0] ?? {}, "input"),
    "public validation issues omit rejected values",
  );
  assert(
    issues.every((issue) => "path" in issue && "code" in issue && "message" in issue),
    "public validation issues expose path, code, and message",
  );
}

assert(localApiContractVersionSchema.safeParse("1").success, "supported API version passes");
assertFails(localApiContractVersionSchema, "2", "unsupported API contract version fails");
assertFails(syncProtocolVersionSchema, "legacy", "unsupported sync protocol version fails");

const payloadSchema = z.strictObject({
  note: z.string().min(1),
});
const envelopeSchema = createSyncEnvelopeSchema(payloadSchema);
const validEnvelope = {
  eventId: "evt-1",
  tenantId: "tenant-1",
  originatingDeviceId: "device-1",
  eventType: "example.created",
  eventSchemaVersion: "1",
  occurredAt: "2026-10-29T09:00:00.000Z",
  payload: { note: "ok" },
};
assert(envelopeSchema.safeParse(validEnvelope).success, "sync envelope validates payload schema");
assertFails(
  envelopeSchema,
  { ...validEnvelope, payload: { note: "ok", extra: true } },
  "sync envelope rejects unexpected payload fields",
);
assertFails(
  envelopeSchema,
  { ...validEnvelope, payload: {} },
  "sync envelope rejects invalid payload",
);

assert(healthResponseSchema.safeParse(buildHealthResponse()).success, "health builder passes");
assertFails(
  healthResponseSchema,
  { service: "polivo-stall-service", status: "degraded" },
  "invalid health status fails",
);
assertFails(
  healthResponseSchema,
  {
    service: "polivo-stall-service",
    status: "ok",
    database: "ready",
  },
  "health response rejects unexpected fields",
);

const listSchema = createPaginatedResponseSchema(z.strictObject({ id: opaqueIdSchema }));
assert(
  listSchema.safeParse({ items: [{ id: "a" }], nextCursor: null }).success,
  "paginated response schema accepts items",
);

assert(
  apiErrorSchema.safeParse({
    code: "VALIDATION_ERROR",
    message: "Request validation failed",
  }).success,
  "api error schema accepts minimal error",
);

if (failures > 0) {
  console.error(`\nContracts smoke failed with ${failures} assertion(s).`);
  process.exit(1);
}

console.log("\nContracts smoke passed.");
