import {
  activateCommissionPolicyRequestSchema,
  commissionPreviewRequestSchema,
  commissionPreviewResponseSchema,
  idempotencyKeySchema,
  listCommissionPolicyVersionsQuerySchema,
  listCommissionPolicyVersionsResponseSchema,
  opaqueIdSchema,
  type CommissionPreviewResponse,
} from "@polivo/contracts";
import {
  getCommissionBandSetById,
  getCommissionPolicyState,
  listCommissionBandsForSet,
  listCommissionVersions,
} from "@polivo/db-local";
import {
  COMMISSION_ALGORITHM_VERSION,
  COMMISSION_RATE_BASIS_PER_KG_MINOR,
  COMMISSION_ROUNDING_RULE_ID,
  DomainError,
  calculateCommission,
} from "@polivo/domain";
import type { FastifyInstance } from "fastify";

import {
  COMMISSION_MANAGE_CAPABILITY,
  buildDomainPolicy,
  loadActiveCommissionPolicyResponse,
  runActivateCommissionPolicyCommand,
  toVersionDto,
} from "../commands/commission-policy-commands.js";
import { requireCommandDeps, type ServiceDependencies } from "../composition.js";
import { resolveBoundStall } from "../context/execution-context.js";
import {
  AppError,
  notFoundError,
  serviceUnavailableError,
  validationError,
} from "../errors/app-error.js";
import { readRequestAuthMaterial } from "./auth-headers.js";
import { resolveRequestId } from "./request-id.js";
import { parseWithSchema } from "./validation.js";

function requireDatabase(deps: ServiceDependencies) {
  if (!deps.database) {
    throw serviceUnavailableError("Local database is not available.");
  }
  return deps.database;
}

function authorizeCommissionAccess(
  deps: ServiceDependencies,
  args: {
    requestId: string;
    deviceProof: import("../auth/device-proof.js").DeviceProof;
    sessionSecret: string;
    method: string;
    path: string;
  },
) {
  const auth = deps.authorization.authorize({
    requiredCapability: COMMISSION_MANAGE_CAPABILITY,
    requestId: args.requestId,
    deviceProof: args.deviceProof,
    sessionSecret: args.sessionSecret,
    method: args.method,
    path: args.path,
    touchActivity: false,
  });
  if (auth instanceof AppError) {
    throw auth;
  }
  if (!auth.capabilities.has(COMMISSION_MANAGE_CAPABILITY)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `Missing capability: ${COMMISSION_MANAGE_CAPABILITY}`,
    });
  }
  return auth;
}

function parseIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const header = request.headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  return parseWithSchema(idempotencyKeySchema, raw, "idempotency-key header");
}

function parseOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^\d+$/.test(cursor)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Invalid pagination cursor.",
      issues: [
        {
          path: "cursor",
          code: "invalid_type",
          message: "Cursor must be a non-negative integer offset.",
        },
      ],
    });
  }
  return Number.parseInt(cursor, 10);
}

function formatMoneyMajor(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}Rs ${whole}.${fraction}`;
}

function formatWeightMajor(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100).padStart(2, "0");
  return `${whole}.${fraction} kg`;
}

/**
 * Production commission policy routes.
 * Every operation requires device proof, staff session, and commission.manage.
 */
export function registerCommissionPolicyRoutes(
  app: FastifyInstance,
  deps: ServiceDependencies,
): void {
  app.get("/commission-policy", async (request) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCommissionAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/commission-policy",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    return loadActiveCommissionPolicyResponse(database, binding.stallId, deps.now());
  });

  app.get("/commission-policy/versions", async (request) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCommissionAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/commission-policy/versions",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const query = parseWithSchema(listCommissionPolicyVersionsQuerySchema, request.query, "query");
    const offset = parseOffsetCursor(query.cursor);
    const state = getCommissionPolicyState(database, binding.stallId);
    const result = listCommissionVersions(database, {
      stallId: binding.stallId,
      limit: query.limit,
      offset,
    });

    const activeId = state?.activeBandSetId ?? null;
    const items = result.items.map((item) => ({
      id: item.bandSet.id,
      versionNumber: item.bandSet.versionNumber,
      activatedAt: item.bandSet.activatedAt,
      activatedByStaffId: item.bandSet.activatedByStaffId,
      bandCount: item.bandCount,
      isActive: activeId === item.bandSet.id,
    }));

    const nextOffset = offset + items.length;
    return listCommissionPolicyVersionsResponseSchema.parse({
      items,
      nextCursor: nextOffset < result.totalMatched ? String(nextOffset) : null,
    });
  });

  app.get("/commission-policy/versions/:versionId", async (request) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCommissionAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "GET",
      path: "/commission-policy/versions/:versionId",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const params = request.params as { versionId: string };
    const versionId = parseWithSchema(opaqueIdSchema, params.versionId, "versionId");
    const bandSet = getCommissionBandSetById(database, binding.stallId, versionId);
    if (bandSet === null) {
      throw notFoundError("Commission policy version not found for this stall.");
    }
    const bands = listCommissionBandsForSet(database, binding.stallId, versionId);
    const version = toVersionDto(bandSet, bands);
    buildDomainPolicy(
      binding.stallId,
      version.id,
      version.bands.map((band) => ({
        id: band.id,
        minPricePerKgMinor: band.minPricePerKgMinor,
        maxPricePerKgMinor: band.maxPricePerKgMinor,
        ratePerKgMinor: band.ratePerKgMinor,
      })),
    );
    return version;
  });

  app.post("/commission-policy/activate", async (request, reply) => {
    const commandDeps = requireCommandDeps(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }

    const body = parseWithSchema(activateCommissionPolicyRequestSchema, request.body, "body");
    const idempotencyKey = parseIdempotencyKey(request);

    const result = runActivateCommissionPolicyCommand(commandDeps, body, {
      requestId,
      idempotencyKey,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret,
      method: "POST",
      path: "/commission-policy/activate",
    });

    return reply.code(200).send(result);
  });

  app.post("/commission-policy/preview", async (request) => {
    const database = requireDatabase(deps);
    const requestId = resolveRequestId(request);
    const authMaterial = readRequestAuthMaterial(request, { requireSession: true });
    if (authMaterial instanceof AppError) {
      throw authMaterial;
    }
    authorizeCommissionAccess(deps, {
      requestId,
      deviceProof: authMaterial.deviceProof,
      sessionSecret: authMaterial.sessionSecret!,
      method: "POST",
      path: "/commission-policy/preview",
    });

    const binding = resolveBoundStall(database);
    if (binding instanceof AppError) {
      throw binding;
    }

    const body = parseWithSchema(commissionPreviewRequestSchema, request.body, "body");
    const state = getCommissionPolicyState(database, binding.stallId);

    const versionId = body.versionId ?? state?.activeBandSetId ?? null;
    if (versionId === null || versionId === undefined) {
      throw validationError("No active commission policy is configured for preview.", [
        {
          path: "versionId",
          code: "MISSING_ACTIVE_POLICY",
          message: "Configure and activate a commission policy before previewing.",
        },
      ]);
    }

    const bandSet = getCommissionBandSetById(database, binding.stallId, versionId);
    if (bandSet === null) {
      throw notFoundError("Commission policy version not found for this stall.");
    }
    const bands = listCommissionBandsForSet(database, binding.stallId, versionId);
    const version = toVersionDto(bandSet, bands);
    const policy = buildDomainPolicy(
      binding.stallId,
      version.id,
      version.bands.map((band) => ({
        id: band.id,
        minPricePerKgMinor: band.minPricePerKgMinor,
        maxPricePerKgMinor: band.maxPricePerKgMinor,
        ratePerKgMinor: band.ratePerKgMinor,
      })),
    );

    let calculation;
    try {
      calculation = calculateCommission(policy, {
        sellingPricePerKgMinor: body.sellingPricePerKgMinor,
        netWeightHundredths: body.netWeightHundredths,
      });
    } catch (error) {
      if (error instanceof DomainError) {
        throw validationError(error.message, [
          { path: "sellingPricePerKgMinor", code: error.code, message: error.message },
        ]);
      }
      throw error;
    }

    const response: CommissionPreviewResponse = commissionPreviewResponseSchema.parse({
      policyId: calculation.policyId,
      versionId: calculation.versionId,
      versionNumber: version.versionNumber,
      bandId: calculation.bandId,
      selectionPricePerKgMinor: calculation.selectionPricePerKgMinor,
      chargeableWeightHundredths: calculation.chargeableWeightHundredths,
      appliedRatePerKgMinor: calculation.appliedRatePerKgMinor,
      rateBasis: COMMISSION_RATE_BASIS_PER_KG_MINOR,
      roundingRuleId: COMMISSION_ROUNDING_RULE_ID,
      algorithmVersion: COMMISSION_ALGORITHM_VERSION,
      commissionMinor: calculation.commissionMinor,
      explanation: `${formatMoneyMajor(calculation.appliedRatePerKgMinor)}/kg × ${formatWeightMajor(calculation.chargeableWeightHundredths)} (half-up) = ${formatMoneyMajor(calculation.commissionMinor)}`,
      isActiveVersion: (state?.activeBandSetId ?? null) === version.id,
    });

    return response;
  });
}
