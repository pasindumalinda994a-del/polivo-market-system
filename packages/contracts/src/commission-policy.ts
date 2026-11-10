import { z } from "zod";

import { nonNegativeMoneyMinorSchema, weightHundredthsSchema } from "./financial.js";
import { absoluteTimestampSchema, opaqueIdSchema } from "./primitives.js";
import {
  PAGINATION_DEFAULT_LIMIT,
  createPaginatedResponseSchema,
  paginationLimitQuerySchema,
} from "./pagination.js";
import { farmerRevisionSchema } from "./farmers.js";

export const commissionPolicyRevisionSchema = farmerRevisionSchema;

export const commissionRateBasisSchema = z.literal("per_kg_minor");

export const commissionBandInputSchema = z.strictObject({
  /** Optional draft identity; the service always assigns a new persisted band id. */
  id: opaqueIdSchema.optional(),
  minPricePerKgMinor: nonNegativeMoneyMinorSchema,
  maxPricePerKgMinor: nonNegativeMoneyMinorSchema.nullable(),
  ratePerKgMinor: z.number().int().safe().positive(),
});

export type CommissionBandInput = z.infer<typeof commissionBandInputSchema>;

export const commissionBandRecordSchema = z.strictObject({
  id: opaqueIdSchema,
  sortOrder: z.number().int().safe().positive(),
  minPricePerKgMinor: nonNegativeMoneyMinorSchema,
  maxPricePerKgMinor: nonNegativeMoneyMinorSchema.nullable(),
  ratePerKgMinor: z.number().int().safe().positive(),
});

export type CommissionBandRecordDto = z.infer<typeof commissionBandRecordSchema>;

export const commissionPolicyVersionSchema = z.strictObject({
  id: opaqueIdSchema,
  versionNumber: z.number().int().safe().positive(),
  effectiveFrom: absoluteTimestampSchema,
  createdAt: absoluteTimestampSchema,
  createdByStaffId: opaqueIdSchema.nullable(),
  activatedAt: absoluteTimestampSchema.nullable(),
  activatedByStaffId: opaqueIdSchema.nullable(),
  previousBandSetId: opaqueIdSchema.nullable(),
  bands: z.array(commissionBandRecordSchema).min(1),
});

export type CommissionPolicyVersionDto = z.infer<typeof commissionPolicyVersionSchema>;

export const commissionPolicyStatusSchema = z.enum(["unconfigured", "configured"]);

export const activeCommissionPolicyResponseSchema = z.strictObject({
  status: commissionPolicyStatusSchema,
  stallId: opaqueIdSchema,
  revision: commissionPolicyRevisionSchema,
  updatedAt: absoluteTimestampSchema,
  activeVersion: commissionPolicyVersionSchema.nullable(),
  rateBasis: commissionRateBasisSchema,
  roundingRuleId: z.literal("half_up_money_times_weight_v1"),
  algorithmVersion: z.literal("stall_default_bands_v1"),
});

export type ActiveCommissionPolicyResponse = z.infer<typeof activeCommissionPolicyResponseSchema>;

export const activateCommissionPolicyRequestSchema = z.strictObject({
  expectedRevision: commissionPolicyRevisionSchema,
  bands: z.array(commissionBandInputSchema).min(1),
});

export type ActivateCommissionPolicyRequest = z.infer<typeof activateCommissionPolicyRequestSchema>;

export const activateCommissionPolicyResponseSchema = activeCommissionPolicyResponseSchema;

export type ActivateCommissionPolicyResponse = z.infer<
  typeof activateCommissionPolicyResponseSchema
>;

export const listCommissionPolicyVersionsQuerySchema = z.strictObject({
  limit: paginationLimitQuerySchema.default(PAGINATION_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(32).optional(),
});

export type ListCommissionPolicyVersionsQuery = z.infer<
  typeof listCommissionPolicyVersionsQuerySchema
>;

export const commissionPolicyVersionSummarySchema = z.strictObject({
  id: opaqueIdSchema,
  versionNumber: z.number().int().safe().positive(),
  activatedAt: absoluteTimestampSchema.nullable(),
  activatedByStaffId: opaqueIdSchema.nullable(),
  bandCount: z.number().int().safe().nonnegative(),
  isActive: z.boolean(),
});

export type CommissionPolicyVersionSummaryDto = z.infer<
  typeof commissionPolicyVersionSummarySchema
>;

export const listCommissionPolicyVersionsResponseSchema = createPaginatedResponseSchema(
  commissionPolicyVersionSummarySchema,
);

export type ListCommissionPolicyVersionsResponse = z.infer<
  typeof listCommissionPolicyVersionsResponseSchema
>;

export const commissionPreviewRequestSchema = z.strictObject({
  versionId: opaqueIdSchema.optional(),
  sellingPricePerKgMinor: nonNegativeMoneyMinorSchema,
  netWeightHundredths: weightHundredthsSchema,
});

export type CommissionPreviewRequest = z.infer<typeof commissionPreviewRequestSchema>;

export const commissionPreviewResponseSchema = z.strictObject({
  policyId: opaqueIdSchema,
  versionId: opaqueIdSchema,
  versionNumber: z.number().int().safe().positive(),
  bandId: opaqueIdSchema,
  selectionPricePerKgMinor: nonNegativeMoneyMinorSchema,
  chargeableWeightHundredths: weightHundredthsSchema,
  appliedRatePerKgMinor: z.number().int().safe().positive(),
  rateBasis: commissionRateBasisSchema,
  roundingRuleId: z.literal("half_up_money_times_weight_v1"),
  algorithmVersion: z.literal("stall_default_bands_v1"),
  commissionMinor: nonNegativeMoneyMinorSchema,
  explanation: z.string().min(1).max(500),
  isActiveVersion: z.boolean(),
});

export type CommissionPreviewResponse = z.infer<typeof commissionPreviewResponseSchema>;

export const COMMISSION_POLICY_EVENT_SCHEMA_VERSION = "1";
export const COMMISSION_POLICY_ACTIVATED_EVENT_TYPE = "polivo.commission_policy.activated";

export const commissionPolicyActivatedEventPayloadSchema = z.strictObject({
  stallId: opaqueIdSchema,
  revision: commissionPolicyRevisionSchema,
  previousActiveBandSetId: opaqueIdSchema.nullable(),
  activeVersion: commissionPolicyVersionSchema,
});

export type CommissionPolicyActivatedEventPayload = z.infer<
  typeof commissionPolicyActivatedEventPayloadSchema
>;
