import {
  appendSecurityAuditEvent,
  applyCapabilitySnapshot,
  countLocalStaff,
  getHostEnrollment,
  getStallBinding,
  insertLocalStaff,
  revokeSessionsForStaff,
  tryGetLocalOwner,
  tryGetLocalStaffByCode,
  tryGetLocalStaffById,
  tryGetStaffCredential,
  updateLocalStaffStatus,
  upsertStaffCredential,
  type LocalDatabase,
} from "@polivo/db-local";
import { areKnownCapabilities } from "@polivo/domain";

import {
  conflictError,
  forbiddenError,
  notFoundError,
  unauthenticatedError,
  validationError,
  type AppError,
} from "../errors/app-error.js";
import { STAFF_VERIFIER_FORMAT, hashStaffSecret } from "./staff-credentials.js";

export type StaffAdminDeps = {
  database: LocalDatabase;
  now: () => string;
  createId: () => string;
};

/**
 * Verified online ownership proof consumed for first-owner setup.
 * Production path redeems a cloud setup grant; tests inject a verified proof.
 * Must not reuse a Phase 14 device enrollment grant.
 */
export type VerifiedOwnerSetupProof = {
  tenantId: string;
  cloudMembershipId: string;
  ownerDisplayName: string;
  /** Capability set for the local owner snapshot (typically empty; owners use is_local_owner). */
  capabilities: readonly string[];
  sourceRevision: number;
  grantId: string;
};

export type FirstOwnerSetupInput = {
  staffCode: string;
  secret: string;
  displayName?: string;
  proof: VerifiedOwnerSetupProof;
  requestId?: string;
};

export type ActivateStaffInput = {
  actorStaffId: string;
  staffCode: string;
  secret: string;
  displayName: string;
  cloudMembershipId: string;
  capabilities: readonly string[];
  sourceRevision: number;
  requestId?: string;
};

/**
 * Create the first local owner. Requires activated host and a verified owner setup proof
 * for the bound tenant. Empty staff table alone never grants ownership.
 */
export function setupFirstLocalOwner(
  deps: StaffAdminDeps,
  input: FirstOwnerSetupInput,
): { staffId: string } | AppError {
  const host = getHostEnrollment(deps.database);
  if (host.activationState !== "activated") {
    return forbiddenError("Host must be activated before local owner setup.");
  }
  const binding = getStallBinding(deps.database);
  if (input.proof.tenantId !== binding.tenantId) {
    return forbiddenError("Setup proof does not match the bound stall tenant.");
  }
  if (
    countLocalStaff(deps.database, binding.tenantId) > 0 ||
    tryGetLocalOwner(deps.database, binding.tenantId)
  ) {
    return conflictError("A local owner already exists for this stall.");
  }
  if (!areKnownCapabilities(input.proof.capabilities)) {
    return validationError("Setup proof contains unknown capabilities.", [
      { path: "capabilities", code: "invalid", message: "Unknown capability id." },
    ]);
  }
  if (input.staffCode.trim().length < 2) {
    return validationError("Staff code is invalid.", [
      { path: "staffCode", code: "invalid", message: "Staff code is too short." },
    ]);
  }

  const nowIso = deps.now();
  const staffId = deps.createId();
  try {
    insertLocalStaff(deps.database, {
      id: staffId,
      tenantId: binding.tenantId,
      staffCode: input.staffCode.trim(),
      displayName: input.displayName?.trim() || input.proof.ownerDisplayName,
      status: "active",
      isLocalOwner: true,
      cloudMembershipId: input.proof.cloudMembershipId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    upsertStaffCredential(deps.database, {
      staffId,
      tenantId: binding.tenantId,
      verifier: hashStaffSecret(input.secret),
      verifierFormat: STAFF_VERIFIER_FORMAT,
      credentialRevision: 1,
      updatedAt: nowIso,
    });
    applyCapabilitySnapshot(deps.database, {
      staffId,
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      capabilitiesJson: JSON.stringify([...input.proof.capabilities]),
      sourceRevision: input.proof.sourceRevision,
      authorityVerifiedAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Owner setup failed.";
    if (/already exists|conflicts/i.test(message)) {
      return conflictError("A local owner already exists for this stall.");
    }
    throw error;
  }

  appendSecurityAuditEvent(deps.database, {
    id: deps.createId(),
    tenantId: binding.tenantId,
    stallId: binding.stallId,
    actorRef: staffId,
    action: "staff.first_owner_setup",
    targetType: "staff",
    targetId: staffId,
    occurredAt: nowIso,
    correlationRef: input.requestId ?? null,
    detailsJson: JSON.stringify({ grantId: input.proof.grantId }),
  });

  return { staffId };
}

function requireLocalOwnerActor(
  deps: StaffAdminDeps,
  actorStaffId: string,
): AppError | { actorId: string; tenantId: string; stallId: string } {
  const binding = getStallBinding(deps.database);
  const actor = tryGetLocalStaffById(deps.database, actorStaffId);
  if (actor === null || actor.status !== "active" || !actor.isLocalOwner) {
    return forbiddenError("Only the local owner may manage staff.");
  }
  if (actor.tenantId !== binding.tenantId) {
    return forbiddenError("Only the local owner may manage staff.");
  }
  return { actorId: actor.id, tenantId: binding.tenantId, stallId: binding.stallId };
}

export function activateLocalStaff(
  deps: StaffAdminDeps,
  input: ActivateStaffInput,
): { staffId: string } | AppError {
  const owner = requireLocalOwnerActor(deps, input.actorStaffId);
  if ("code" in owner) {
    return owner;
  }
  if (!areKnownCapabilities(input.capabilities)) {
    return validationError("Capability set is invalid.", [
      { path: "capabilities", code: "invalid", message: "Unknown capability id." },
    ]);
  }
  if (!input.cloudMembershipId.trim()) {
    return validationError("cloudMembershipId is required.", [
      { path: "cloudMembershipId", code: "required", message: "Stable membership id required." },
    ]);
  }
  if (tryGetLocalStaffByCode(deps.database, owner.tenantId, input.staffCode.trim())) {
    return conflictError("A staff member with this staff code already exists.");
  }

  const nowIso = deps.now();
  const staffId = deps.createId();
  insertLocalStaff(deps.database, {
    id: staffId,
    tenantId: owner.tenantId,
    staffCode: input.staffCode.trim(),
    displayName: input.displayName.trim(),
    status: "active",
    isLocalOwner: false,
    cloudMembershipId: input.cloudMembershipId.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  upsertStaffCredential(deps.database, {
    staffId,
    tenantId: owner.tenantId,
    verifier: hashStaffSecret(input.secret),
    verifierFormat: STAFF_VERIFIER_FORMAT,
    credentialRevision: 1,
    updatedAt: nowIso,
  });
  applyCapabilitySnapshot(deps.database, {
    staffId,
    tenantId: owner.tenantId,
    stallId: owner.stallId,
    capabilitiesJson: JSON.stringify([...input.capabilities]),
    sourceRevision: input.sourceRevision,
    authorityVerifiedAt: nowIso,
    updatedAt: nowIso,
  });

  appendSecurityAuditEvent(deps.database, {
    id: deps.createId(),
    tenantId: owner.tenantId,
    stallId: owner.stallId,
    actorRef: owner.actorId,
    action: "staff.activated",
    targetType: "staff",
    targetId: staffId,
    occurredAt: nowIso,
    correlationRef: input.requestId ?? null,
    detailsJson: JSON.stringify({ cloudMembershipId: input.cloudMembershipId.trim() }),
  });

  return { staffId };
}

export function resetLocalStaffCredential(
  deps: StaffAdminDeps,
  input: {
    actorStaffId: string;
    staffId: string;
    newSecret: string;
    requestId?: string;
  },
): { ok: true } | AppError {
  const owner = requireLocalOwnerActor(deps, input.actorStaffId);
  if ("code" in owner) {
    return owner;
  }
  const staff = tryGetLocalStaffById(deps.database, input.staffId);
  if (staff === null || staff.tenantId !== owner.tenantId) {
    return notFoundError("Staff member was not found.");
  }
  const existing = tryGetStaffCredential(deps.database, staff.id);
  const nextRevision = (existing?.credentialRevision ?? 0) + 1;
  const nowIso = deps.now();
  upsertStaffCredential(deps.database, {
    staffId: staff.id,
    tenantId: owner.tenantId,
    verifier: hashStaffSecret(input.newSecret),
    verifierFormat: STAFF_VERIFIER_FORMAT,
    credentialRevision: nextRevision,
    updatedAt: nowIso,
  });
  revokeSessionsForStaff(deps.database, staff.id, nowIso);

  appendSecurityAuditEvent(deps.database, {
    id: deps.createId(),
    tenantId: owner.tenantId,
    stallId: owner.stallId,
    actorRef: owner.actorId,
    action: "staff.credential_reset",
    targetType: "staff",
    targetId: staff.id,
    occurredAt: nowIso,
    correlationRef: input.requestId ?? null,
    detailsJson: JSON.stringify({ credentialRevision: nextRevision }),
  });
  return { ok: true };
}

export function deactivateLocalStaff(
  deps: StaffAdminDeps,
  input: { actorStaffId: string; staffId: string; requestId?: string },
): { ok: true } | AppError {
  const owner = requireLocalOwnerActor(deps, input.actorStaffId);
  if ("code" in owner) {
    return owner;
  }
  const staff = tryGetLocalStaffById(deps.database, input.staffId);
  if (staff === null || staff.tenantId !== owner.tenantId) {
    return notFoundError("Staff member was not found.");
  }
  if (staff.isLocalOwner) {
    return forbiddenError("The local owner account cannot be deactivated this way.");
  }
  const nowIso = deps.now();
  updateLocalStaffStatus(deps.database, {
    staffId: staff.id,
    status: "disabled",
    updatedAt: nowIso,
    disabledAt: nowIso,
  });
  revokeSessionsForStaff(deps.database, staff.id, nowIso);

  appendSecurityAuditEvent(deps.database, {
    id: deps.createId(),
    tenantId: owner.tenantId,
    stallId: owner.stallId,
    actorRef: owner.actorId,
    action: "staff.deactivated",
    targetType: "staff",
    targetId: staff.id,
    occurredAt: nowIso,
    correlationRef: input.requestId ?? null,
    detailsJson: null,
  });
  return { ok: true };
}

export function applyLocalPermissionSnapshot(
  deps: StaffAdminDeps,
  input: {
    staffId: string;
    tenantId: string;
    stallId: string;
    capabilities: readonly string[];
    sourceRevision: number;
    /** When false, do not replace an existing valid snapshot (unused — apply always validates). */
    requestId?: string;
  },
): { authorityVerifiedAt: string } | AppError {
  const binding = getStallBinding(deps.database);
  if (input.tenantId !== binding.tenantId || input.stallId !== binding.stallId) {
    return forbiddenError("Snapshot does not match the bound stall.");
  }
  const staff = tryGetLocalStaffById(deps.database, input.staffId);
  if (staff === null || staff.tenantId !== binding.tenantId) {
    return notFoundError("Staff member was not found.");
  }
  if (!areKnownCapabilities(input.capabilities)) {
    return validationError("Capability set is invalid.", [
      { path: "capabilities", code: "invalid", message: "Unknown capability id." },
    ]);
  }
  const nowIso = deps.now();
  try {
    applyCapabilitySnapshot(deps.database, {
      staffId: staff.id,
      tenantId: binding.tenantId,
      stallId: binding.stallId,
      capabilitiesJson: JSON.stringify([...input.capabilities]),
      sourceRevision: input.sourceRevision,
      authorityVerifiedAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot apply failed.";
    if (/older|revision/i.test(message)) {
      return conflictError(message);
    }
    if (/tenant or stall/i.test(message)) {
      return forbiddenError(message);
    }
    throw error;
  }
  return { authorityVerifiedAt: nowIso };
}

export function assertNotUnauthenticatedSelfClaim(): AppError {
  return unauthenticatedError("Local owner setup requires a verified online ownership proof.");
}
