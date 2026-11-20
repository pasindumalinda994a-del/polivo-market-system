import {
  accessConfigEnvelopeSchema,
  type AccessConfigEnvelope,
  type AccessMembershipSnapshot,
} from "@polivo/contracts";
import {
  applyAccessConfigSnapshot,
  applyCapabilitySnapshot,
  getConfigDomainState,
  getStallBinding,
  listLocalStaffByCloudMembershipId,
  revokeAcceptedTerminal,
  revokeActiveSessionsForDevice,
  revokeSessionsForStaff,
  runInTransaction,
  tryGetAcceptedTerminal,
  tryGetHostEnrollment,
  tryGetReceivedSnapshot,
  updateLocalStaffStatus,
  type LocalDatabase,
} from "@polivo/db-local";
import { areKnownCapabilities } from "@polivo/domain";

export type ApplyAccessResult =
  | {
      kind: "applied" | "already_applied";
      revision: number;
      publicationId: string;
      payloadHash: string;
      appliedAt: string;
    }
  | {
      kind: "rejected" | "blocked";
      errorCode: string;
      message: string;
      revision?: number;
      publicationId?: string;
      payloadHash?: string;
      appliedAt: string;
    };

function validateMembershipCaps(membership: AccessMembershipSnapshot): string | null {
  if (!areKnownCapabilities(membership.capabilities)) {
    return `Membership ${membership.membershipId} contains unknown capabilities.`;
  }
  return null;
}

/**
 * Validate and atomically apply a complete access configuration envelope.
 * Network I/O must not be held across this transaction.
 */
export function applyAccessEnvelope(input: {
  database: LocalDatabase;
  envelope: AccessConfigEnvelope;
  nowIso: string;
  createId: () => string;
}): ApplyAccessResult {
  const parsed = accessConfigEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success) {
    return {
      kind: "rejected",
      errorCode: "INVALID_ENVELOPE",
      message: parsed.error.issues[0]?.message ?? "Access envelope is invalid.",
      appliedAt: input.nowIso,
    };
  }
  const envelope = parsed.data;
  const binding = getStallBinding(input.database);
  if (envelope.tenantId !== binding.tenantId || envelope.stallId !== binding.stallId) {
    return {
      kind: "rejected",
      errorCode: "TARGET_MISMATCH",
      message: "Configuration target does not match this stall.",
      revision: envelope.revision,
      publicationId: envelope.publicationId,
      payloadHash: envelope.payloadHash,
      appliedAt: input.nowIso,
    };
  }
  if (envelope.requiredCompatibilityVersion !== 1 || envelope.schemaVersion !== "1") {
    return {
      kind: "blocked",
      errorCode: "INCOMPATIBLE_SCHEMA",
      message: "Access configuration schema is not supported by this host.",
      revision: envelope.revision,
      publicationId: envelope.publicationId,
      payloadHash: envelope.payloadHash,
      appliedAt: input.nowIso,
    };
  }

  for (const membership of envelope.payload.memberships) {
    const err = validateMembershipCaps(membership);
    if (err) {
      return {
        kind: "rejected",
        errorCode: "UNKNOWN_CAPABILITY",
        message: err,
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        appliedAt: input.nowIso,
      };
    }
  }

  const state = getConfigDomainState(input.database, "access");
  if (state.effectiveRevision != null && envelope.revision < state.effectiveRevision) {
    return {
      kind: "rejected",
      errorCode: "STALE_REVISION",
      message: "Access revision is older than the locally applied revision.",
      revision: envelope.revision,
      publicationId: envelope.publicationId,
      payloadHash: envelope.payloadHash,
      appliedAt: input.nowIso,
    };
  }

  const existing = tryGetReceivedSnapshot(input.database, "access", envelope.revision);
  if (existing !== null && existing.payloadHash !== envelope.payloadHash) {
    return {
      kind: "rejected",
      errorCode: "CONFIG_INTEGRITY_CONFLICT",
      message: "Same revision arrived with different content.",
      revision: envelope.revision,
      publicationId: envelope.publicationId,
      payloadHash: envelope.payloadHash,
      appliedAt: input.nowIso,
    };
  }

  if (state.effectiveRevision === envelope.revision && state.payloadHash === envelope.payloadHash) {
    // Idempotent replay: ensure pending ack remains without reapplying side effects.
    return runInTransaction(input.database.db, (tx) => {
      applyAccessConfigSnapshot(tx, {
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        payloadJson: JSON.stringify(envelope.payload),
        issuedAt: envelope.issuedAt,
        maxSnapshotAgeMs: envelope.maxSnapshotAgeMs,
        receivedAt: input.nowIso,
        appliedAt: input.nowIso,
        result: "already_applied",
        auditId: input.createId(),
      });
      return {
        kind: "already_applied" as const,
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        appliedAt: input.nowIso,
      };
    });
  }

  try {
    return runInTransaction(input.database.db, (tx) => {
      const host = tryGetHostEnrollment(tx);
      for (const device of envelope.payload.devices) {
        if (device.role === "terminal" && device.enrollmentState === "revoked") {
          const local = tryGetAcceptedTerminal(tx, device.deviceId);
          if (local !== null && local.pairingState !== "revoked") {
            revokeAcceptedTerminal(tx, {
              terminalDeviceId: device.deviceId,
              revokedAt: device.revokedAt ?? input.nowIso,
              updatedAt: input.nowIso,
            });
            revokeActiveSessionsForDevice(tx, device.deviceId, input.nowIso);
          }
        }
        if (
          device.role === "host" &&
          device.enrollmentState === "revoked" &&
          host &&
          (host.cloudDeviceId === device.deviceId || host.hostDeviceId === device.deviceId)
        ) {
          // Trusted revocation signal for this host: stop cloud ops via block; do not re-enroll.
          throw Object.assign(new Error("HOST_REVOKED"), { code: "HOST_REVOKED" });
        }
      }

      for (const membership of envelope.payload.memberships) {
        const mapped = listLocalStaffByCloudMembershipId(
          tx,
          binding.tenantId,
          membership.membershipId,
        );
        for (const staff of mapped) {
          if (membership.status !== "active") {
            if (staff.status !== "disabled") {
              updateLocalStaffStatus(tx, {
                staffId: staff.id,
                status: "disabled",
                updatedAt: input.nowIso,
                disabledAt: input.nowIso,
              });
            }
            revokeSessionsForStaff(tx, staff.id, input.nowIso);
            continue;
          }
          applyCapabilitySnapshot(tx, {
            staffId: staff.id,
            tenantId: binding.tenantId,
            stallId: binding.stallId,
            capabilitiesJson: JSON.stringify(membership.capabilities),
            sourceRevision: membership.capabilitiesRevision,
            authorityVerifiedAt: envelope.issuedAt,
            updatedAt: input.nowIso,
          });
        }
      }

      applyAccessConfigSnapshot(tx, {
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        payloadJson: JSON.stringify(envelope.payload),
        issuedAt: envelope.issuedAt,
        maxSnapshotAgeMs: envelope.maxSnapshotAgeMs,
        receivedAt: input.nowIso,
        appliedAt: input.nowIso,
        result: "applied",
        auditId: input.createId(),
      });

      return {
        kind: "applied" as const,
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        appliedAt: input.nowIso,
      };
    });
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === "HOST_REVOKED") {
      return {
        kind: "blocked",
        errorCode: "HOST_REVOKED",
        message: "This host is revoked in the cloud access snapshot.",
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        appliedAt: input.nowIso,
      };
    }
    if (error instanceof Error && error.message === "CONFIG_INTEGRITY_CONFLICT") {
      return {
        kind: "rejected",
        errorCode: "CONFIG_INTEGRITY_CONFLICT",
        message: "Same revision arrived with different content.",
        revision: envelope.revision,
        publicationId: envelope.publicationId,
        payloadHash: envelope.payloadHash,
        appliedAt: input.nowIso,
      };
    }
    throw error;
  }
}
