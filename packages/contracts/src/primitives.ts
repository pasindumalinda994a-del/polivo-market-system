import { z } from "zod";

/** Maximum length for opaque transport identifiers (tenant, device, request, idempotency). */
export const OPAQUE_ID_MAX_LENGTH = 128;

/**
 * Opaque non-empty transport identifier.
 * Values are preserved exactly (no trim or normalization).
 * Format is not assumed to be UUID.
 */
export const opaqueIdSchema = z.string().min(1).max(OPAQUE_ID_MAX_LENGTH);

export const tenantIdSchema = opaqueIdSchema;
export const deviceIdSchema = opaqueIdSchema;
export const requestIdSchema = opaqueIdSchema;
export const idempotencyKeySchema = opaqueIdSchema;

export type OpaqueId = z.infer<typeof opaqueIdSchema>;
export type TenantId = z.infer<typeof tenantIdSchema>;
export type DeviceId = z.infer<typeof deviceIdSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;

/**
 * Absolute instant as ISO 8601 with an explicit timezone offset
 * (for example `2026-10-29T09:00:00.000Z` or `2026-10-29T14:30:00+05:30`).
 * Locale-formatted timestamps are rejected.
 */
export const absoluteTimestampSchema = z.iso.datetime({ offset: true });

/**
 * Calendar date as `YYYY-MM-DD`. Invalid calendar dates are rejected.
 * Do not interpret this as midnight UTC; business-day rules belong in domain.
 */
export const calendarDateSchema = z.iso.date();

export type AbsoluteTimestamp = z.infer<typeof absoluteTimestampSchema>;
export type CalendarDate = z.infer<typeof calendarDateSchema>;
