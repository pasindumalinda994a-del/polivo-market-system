import { z } from "zod";

/** Default and maximum page sizes for list endpoints. */
export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_CURSOR_MAX_LENGTH = 512;

/**
 * Intentionally converts a query-string limit into a bounded integer.
 * Invalid, fractional, negative, zero, and excessive values are rejected.
 */
export const paginationLimitQuerySchema = z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT);

export const paginationCursorSchema = z.string().min(1).max(PAGINATION_CURSOR_MAX_LENGTH);

export const paginationQuerySchema = z.strictObject({
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: paginationCursorSchema.optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Builds a list-response schema for a concrete item schema.
 * Cursor internals remain opaque; a cursor does not grant authorization.
 */
export function createPaginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.strictObject({
    items: z.array(itemSchema),
    nextCursor: paginationCursorSchema.nullable(),
  });
}
