import { z } from "zod";

import { weightHundredthsSchema } from "./financial.js";
import { opaqueIdSchema } from "./primitives.js";

/** Technical bound for individually weighed package rows in one entry (not a market-capacity claim). */
export const PACKAGE_WEIGHT_ENTRY_MAX_ROWS = 200;

export const packageWeightRowKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/, "Row key must be a stable opaque token");

/**
 * Validated package row ready for later sale/arrival persistence.
 * Gross weight uses integer hundredths-kg from Phase 08.
 */
export const validatedPackageWeightRowSchema = z.strictObject({
  rowKey: packageWeightRowKeySchema,
  packageTypeId: opaqueIdSchema.optional(),
  grossWeightHundredths: weightHundredthsSchema,
});

export type ValidatedPackageWeightRow = z.infer<typeof validatedPackageWeightRowSchema>;

/**
 * Structured weight-entry input for domain validation and future billing commands.
 * Packaging is explicit when present; omit or set 0 for the approved default of zero packaging.
 */
export const packageWeightEntryInputSchema = z
  .strictObject({
    rows: z.array(validatedPackageWeightRowSchema).max(PACKAGE_WEIGHT_ENTRY_MAX_ROWS),
    packagingWeightHundredths: weightHundredthsSchema.optional(),
  })
  .refine(
    (value) => {
      const keys = value.rows.map((row) => row.rowKey);
      return new Set(keys).size === keys.length;
    },
    { message: "Package row keys must be unique within an entry", path: ["rows"] },
  );

export type PackageWeightEntryInput = z.infer<typeof packageWeightEntryInputSchema>;

export const packageWeightEntryUnitSchema = z.literal("kg");

export const packageWeightEntryStatusSchema = z.enum(["complete", "incomplete", "invalid"]);

/**
 * Validated weight summary for UI completion and later service revalidation.
 * Package count is the number of completed rows; total is the sum of those row weights.
 */
export const validatedPackageWeightSummarySchema = z.strictObject({
  status: packageWeightEntryStatusSchema,
  packageCount: z.number().int().nonnegative().max(PACKAGE_WEIGHT_ENTRY_MAX_ROWS),
  grossWeightHundredths: weightHundredthsSchema,
  packagingWeightHundredths: weightHundredthsSchema,
  netWeightHundredths: weightHundredthsSchema,
  unit: packageWeightEntryUnitSchema,
  rows: z.array(validatedPackageWeightRowSchema).max(PACKAGE_WEIGHT_ENTRY_MAX_ROWS),
  errors: z.array(z.string().min(1).max(200)).max(50),
});

export type ValidatedPackageWeightSummary = z.infer<typeof validatedPackageWeightSummarySchema>;
