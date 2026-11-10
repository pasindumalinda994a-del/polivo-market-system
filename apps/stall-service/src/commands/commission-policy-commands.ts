import {
  COMMISSION_POLICY_ACTIVATED_EVENT_TYPE,
  COMMISSION_POLICY_EVENT_SCHEMA_VERSION,
  activateCommissionPolicyRequestSchema,
  activeCommissionPolicyResponseSchema,
  commissionPolicyActivatedEventPayloadSchema,
  type ActivateCommissionPolicyRequest,
  type ActiveCommissionPolicyResponse,
  type CommissionBandRecordDto,
  type CommissionPolicyVersionDto,
} from "@polivo/contracts";
import {
  activateCommissionPolicyWithExpectedRevision,
  getCommissionBandSetById,
  getCommissionPolicyState,
  listCommissionBandsForSet,
  type CommissionBandRecord,
  type CommissionBandSetRecord,
  type TxHandle,
} from "@polivo/db-local";
import {
  COMMISSION_ALGORITHM_VERSION,
  COMMISSION_RATE_BASIS_PER_KG_MINOR,
  COMMISSION_ROUNDING_RULE_ID,
  DomainError,
  validateCommissionPolicy,
  type CommissionBand,
  type CommissionPolicy,
} from "@polivo/domain";

import type { ExecutionContext } from "../context/execution-context.js";
import { conflictError, validationError } from "../errors/app-error.js";
import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "./command-runner.js";

export const COMMISSION_MANAGE_CAPABILITY = "commission.manage";

function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    throw validationError(error.message, [
      {
        path: "bands",
        code: error.code,
        message: error.message,
      },
    ]);
  }
  throw error;
}

export function toBandDto(band: CommissionBandRecord): CommissionBandRecordDto {
  if (band.minPricePerKgMinor === null) {
    throw validationError("Persisted commission band is missing a minimum price.", [
      { path: "bands", code: "INVALID_POLICY", message: "Band min price is required." },
    ]);
  }
  return {
    id: band.id,
    sortOrder: band.sortOrder,
    minPricePerKgMinor: band.minPricePerKgMinor,
    maxPricePerKgMinor: band.maxPricePerKgMinor,
    ratePerKgMinor: band.ratePerKgMinor,
  };
}

export function toVersionDto(
  bandSet: CommissionBandSetRecord,
  bands: CommissionBandRecord[],
): CommissionPolicyVersionDto {
  return {
    id: bandSet.id,
    versionNumber: bandSet.versionNumber,
    effectiveFrom: bandSet.effectiveFrom,
    createdAt: bandSet.createdAt,
    createdByStaffId: bandSet.createdByStaffId,
    activatedAt: bandSet.activatedAt,
    activatedByStaffId: bandSet.activatedByStaffId,
    previousBandSetId: bandSet.previousBandSetId,
    bands: bands.map(toBandDto),
  };
}

export function buildDomainPolicy(
  stallId: string,
  versionId: string,
  bands: readonly {
    id: string;
    minPricePerKgMinor: number;
    maxPricePerKgMinor: number | null;
    ratePerKgMinor: number;
  }[],
): CommissionPolicy {
  const domainBands: CommissionBand[] = bands.map((band) => ({
    id: band.id,
    minPricePerKgMinor: band.minPricePerKgMinor,
    maxPricePerKgMinor: band.maxPricePerKgMinor,
    ratePerKgMinor: band.ratePerKgMinor,
  }));
  try {
    return validateCommissionPolicy({
      policyId: stallId,
      versionId,
      rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
      roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
      algorithmVersion: COMMISSION_ALGORITHM_VERSION,
      bands: domainBands,
    });
  } catch (error) {
    mapDomainError(error);
  }
}

export function toActivePolicyResponse(args: {
  stallId: string;
  revision: number;
  updatedAt: string;
  activeVersion: CommissionPolicyVersionDto | null;
}): ActiveCommissionPolicyResponse {
  return activeCommissionPolicyResponseSchema.parse({
    status: args.activeVersion === null ? "unconfigured" : "configured",
    stallId: args.stallId,
    revision: args.revision,
    updatedAt: args.updatedAt,
    activeVersion: args.activeVersion,
    rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
    roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
    algorithmVersion: COMMISSION_ALGORITHM_VERSION,
  });
}

export function loadActiveCommissionPolicyResponse(
  database: { db: import("@polivo/db-local").LocalDatabase["db"] } | TxHandle,
  stallId: string,
  now: string,
): ActiveCommissionPolicyResponse {
  const state = getCommissionPolicyState(database, stallId);
  if (state === null) {
    return toActivePolicyResponse({
      stallId,
      revision: 1,
      updatedAt: now,
      activeVersion: null,
    });
  }
  if (state.activeBandSetId === null) {
    return toActivePolicyResponse({
      stallId,
      revision: state.revision,
      updatedAt: state.updatedAt,
      activeVersion: null,
    });
  }

  const bandSet = getCommissionBandSetById(database, stallId, state.activeBandSetId);
  if (bandSet === null) {
    throw conflictError("Active commission policy points to a missing version.");
  }
  const bands = listCommissionBandsForSet(database, stallId, state.activeBandSetId);
  const version = toVersionDto(bandSet, bands);
  // Fail closed on invalid persisted configuration
  buildDomainPolicy(
    stallId,
    version.id,
    version.bands.map((band) => ({
      id: band.id,
      minPricePerKgMinor: band.minPricePerKgMinor,
      maxPricePerKgMinor: band.maxPricePerKgMinor,
      ratePerKgMinor: band.ratePerKgMinor,
    })),
  );

  return toActivePolicyResponse({
    stallId,
    revision: state.revision,
    updatedAt: state.updatedAt,
    activeVersion: version,
  });
}

function activateDefinition(
  deps: CommandDeps,
): CommandDefinition<ActivateCommissionPolicyRequest, ActiveCommissionPolicyResponse> {
  return {
    type: "commission_policy.activate",
    version: "1",
    requiredCapability: COMMISSION_MANAGE_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: ActivateCommissionPolicyRequest;
    }) => {
      const now = deps.now();
      const bandSetId = deps.createId();
      const bandsWithIds = input.bands.map((band) => ({
        id: deps.createId(),
        minPricePerKgMinor: band.minPricePerKgMinor,
        maxPricePerKgMinor: band.maxPricePerKgMinor,
        ratePerKgMinor: band.ratePerKgMinor,
      }));

      buildDomainPolicy(context.stallId, bandSetId, bandsWithIds);

      const staffId = context.actorRef;
      const activated = activateCommissionPolicyWithExpectedRevision(tx, {
        stallId: context.stallId,
        expectedRevision: input.expectedRevision,
        bandSetId,
        bands: bandsWithIds,
        createdByStaffId: staffId,
        activatedByStaffId: staffId,
        activatedAt: now,
        updatedAt: now,
      });

      const version = toVersionDto(activated.bandSet, activated.bands);
      const response = toActivePolicyResponse({
        stallId: context.stallId,
        revision: activated.policyState.revision,
        updatedAt: activated.policyState.updatedAt,
        activeVersion: version,
      });

      const payload = commissionPolicyActivatedEventPayloadSchema.parse({
        stallId: context.stallId,
        revision: activated.policyState.revision,
        previousActiveBandSetId: activated.previousActiveBandSetId,
        activeVersion: version,
      });

      writeAuditAndOutbox({
        tx,
        context,
        action: "commission_policy.activated",
        targetType: "commission_policy",
        targetId: activated.bandSet.id,
        eventType: COMMISSION_POLICY_ACTIVATED_EVENT_TYPE,
        eventSchemaVersion: COMMISSION_POLICY_EVENT_SCHEMA_VERSION,
        payload,
        eventId: deps.createId(),
        auditId: deps.createId(),
        now,
      });

      return response;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) =>
      activeCommissionPolicyResponseSchema.parse(JSON.parse(resultRef)),
  };
}

export function runActivateCommissionPolicyCommand(
  deps: CommandDeps,
  input: ActivateCommissionPolicyRequest,
  meta: {
    requestId: string;
    idempotencyKey: string;
    deviceProof?: import("../auth/device-proof.js").DeviceProof;
    sessionSecret?: string;
    method?: string;
    path?: string;
  },
): ActiveCommissionPolicyResponse {
  return runIdempotentCommand(deps, activateDefinition(deps), {
    input: activateCommissionPolicyRequestSchema.parse(input),
    ...meta,
  });
}
