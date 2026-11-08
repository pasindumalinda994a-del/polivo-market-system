import {
  mapLocalSecurityAuditEventRow,
  mapLocalStaffCapabilitySnapshotRow,
  mapLocalStaffCredentialRow,
  mapLocalStaffLoginAttemptRow,
  mapLocalStaffRow,
  mapLocalStaffSessionRow,
  type LocalSecurityAuditEventRecord,
  type LocalStaffCapabilitySnapshotRecord,
  type LocalStaffCredentialRecord,
  type LocalStaffLoginAttemptRecord,
  type LocalStaffRecord,
  type LocalStaffSessionRecord,
  type LocalStaffStatus,
} from "../mapping/records.js";
import { NotFoundError, RepositoryError, RevisionConflictError, type DbExecutor } from "./types.js";

export type InsertLocalStaffInput = {
  id: string;
  tenantId: string;
  staffCode: string;
  displayName: string;
  status: LocalStaffStatus;
  isLocalOwner: boolean;
  cloudMembershipId?: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt?: string | null;
};

export type UpsertStaffCredentialInput = {
  staffId: string;
  tenantId: string;
  verifier: string;
  verifierFormat: "scrypt$v1";
  credentialRevision: number;
  updatedAt: string;
};

export type UpsertCapabilitySnapshotInput = {
  staffId: string;
  tenantId: string;
  stallId: string;
  capabilitiesJson: string;
  sourceRevision: number;
  authorityVerifiedAt: string;
  updatedAt: string;
};

export type InsertStaffSessionInput = {
  id: string;
  tenantId: string;
  staffId: string;
  deviceId: string;
  verifier: string;
  credentialRevision: number;
  issuedAt: string;
  absoluteExpiresAt: string;
  lastActivityAt: string;
};

export type UpsertLoginAttemptInput = {
  deviceId: string;
  staffCode: string;
  windowStartedAt: string;
  attemptCount: number;
  lockedUntil?: string | null;
  updatedAt: string;
};

export type AppendSecurityAuditInput = {
  id: string;
  tenantId?: string | null;
  stallId?: string | null;
  actorRef?: string | null;
  deviceRef?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  occurredAt: string;
  correlationRef?: string | null;
  detailsJson?: string | null;
};

export function countLocalStaff(executor: DbExecutor, tenantId: string): number {
  const row = executor.db
    .prepare(`SELECT COUNT(*) AS c FROM local_staff WHERE tenant_id = ?`)
    .get(tenantId) as { c: number | bigint } | undefined;
  if (row === undefined) {
    return 0;
  }
  return typeof row.c === "bigint" ? Number(row.c) : row.c;
}

export function tryGetLocalStaffById(
  executor: DbExecutor,
  staffId: string,
): LocalStaffRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, tenant_id, staff_code, display_name, status, is_local_owner,
              cloud_membership_id, created_at, updated_at, disabled_at
       FROM local_staff WHERE id = ?`,
    )
    .get(staffId) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffRow(row);
}

export function getLocalStaffById(executor: DbExecutor, staffId: string): LocalStaffRecord {
  const row = tryGetLocalStaffById(executor, staffId);
  if (row === null) {
    throw new NotFoundError("Local staff identity was not found.");
  }
  return row;
}

export function tryGetLocalStaffByCode(
  executor: DbExecutor,
  tenantId: string,
  staffCode: string,
): LocalStaffRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, tenant_id, staff_code, display_name, status, is_local_owner,
              cloud_membership_id, created_at, updated_at, disabled_at
       FROM local_staff WHERE tenant_id = ? AND staff_code = ?`,
    )
    .get(tenantId, staffCode) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffRow(row);
}

export function tryGetLocalOwner(executor: DbExecutor, tenantId: string): LocalStaffRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, tenant_id, staff_code, display_name, status, is_local_owner,
              cloud_membership_id, created_at, updated_at, disabled_at
       FROM local_staff WHERE tenant_id = ? AND is_local_owner = 1`,
    )
    .get(tenantId) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffRow(row);
}

export function insertLocalStaff(
  executor: DbExecutor,
  input: InsertLocalStaffInput,
): LocalStaffRecord {
  if (input.isLocalOwner) {
    const existingOwner = tryGetLocalOwner(executor, input.tenantId);
    if (existingOwner !== null) {
      throw new RepositoryError("A local owner already exists for this tenant.");
    }
  }
  try {
    executor.db
      .prepare(
        `INSERT INTO local_staff (
           id, tenant_id, staff_code, display_name, status, is_local_owner,
           cloud_membership_id, created_at, updated_at, disabled_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.tenantId,
        input.staffCode,
        input.displayName,
        input.status,
        input.isLocalOwner ? 1 : 0,
        input.cloudMembershipId ?? null,
        input.createdAt,
        input.updatedAt,
        input.disabledAt ?? null,
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/UNIQUE/i.test(message)) {
      throw new RepositoryError("Local staff identity conflicts with an existing record.");
    }
    throw error;
  }
  return getLocalStaffById(executor, input.id);
}

export function updateLocalStaffStatus(
  executor: DbExecutor,
  input: {
    staffId: string;
    status: LocalStaffStatus;
    updatedAt: string;
    disabledAt?: string | null;
  },
): LocalStaffRecord {
  const result = executor.db
    .prepare(
      `UPDATE local_staff
       SET status = ?, updated_at = ?, disabled_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.updatedAt,
      input.status === "disabled" ? (input.disabledAt ?? input.updatedAt) : null,
      input.staffId,
    );
  if (result.changes !== 1) {
    throw new NotFoundError("Local staff identity was not found.");
  }
  return getLocalStaffById(executor, input.staffId);
}

export function tryGetStaffCredential(
  executor: DbExecutor,
  staffId: string,
): LocalStaffCredentialRecord | null {
  const row = executor.db
    .prepare(
      `SELECT staff_id, tenant_id, verifier, verifier_format, credential_revision, updated_at
       FROM local_staff_credentials WHERE staff_id = ?`,
    )
    .get(staffId) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffCredentialRow(row);
}

export function upsertStaffCredential(
  executor: DbExecutor,
  input: UpsertStaffCredentialInput,
): LocalStaffCredentialRecord {
  if (input.credentialRevision < 1) {
    throw new RepositoryError("credential_revision must be >= 1.");
  }
  executor.db
    .prepare(
      `INSERT INTO local_staff_credentials (
         staff_id, tenant_id, verifier, verifier_format, credential_revision, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(staff_id) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         verifier = excluded.verifier,
         verifier_format = excluded.verifier_format,
         credential_revision = excluded.credential_revision,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.staffId,
      input.tenantId,
      input.verifier,
      input.verifierFormat,
      input.credentialRevision,
      input.updatedAt,
    );
  const row = tryGetStaffCredential(executor, input.staffId);
  if (row === null) {
    throw new RepositoryError("Failed to persist staff credential.");
  }
  return row;
}

export function tryGetCapabilitySnapshot(
  executor: DbExecutor,
  staffId: string,
): LocalStaffCapabilitySnapshotRecord | null {
  const row = executor.db
    .prepare(
      `SELECT staff_id, tenant_id, stall_id, capabilities_json, source_revision,
              authority_verified_at, updated_at
       FROM local_staff_capability_snapshots WHERE staff_id = ?`,
    )
    .get(staffId) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffCapabilitySnapshotRow(row);
}

/**
 * Apply a trusted snapshot. Rejects older revisions and wrong tenant/stall.
 * Unchanged revision may refresh authority_verified_at.
 */
export function applyCapabilitySnapshot(
  executor: DbExecutor,
  input: UpsertCapabilitySnapshotInput,
): LocalStaffCapabilitySnapshotRecord {
  const existing = tryGetCapabilitySnapshot(executor, input.staffId);
  if (existing !== null) {
    if (existing.tenantId !== input.tenantId || existing.stallId !== input.stallId) {
      throw new RepositoryError("Capability snapshot tenant or stall does not match.");
    }
    if (input.sourceRevision < existing.sourceRevision) {
      throw new RevisionConflictError(
        "Capability snapshot revision is older than the locally trusted revision.",
      );
    }
  }

  executor.db
    .prepare(
      `INSERT INTO local_staff_capability_snapshots (
         staff_id, tenant_id, stall_id, capabilities_json, source_revision,
         authority_verified_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(staff_id) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         stall_id = excluded.stall_id,
         capabilities_json = excluded.capabilities_json,
         source_revision = excluded.source_revision,
         authority_verified_at = excluded.authority_verified_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.staffId,
      input.tenantId,
      input.stallId,
      input.capabilitiesJson,
      input.sourceRevision,
      input.authorityVerifiedAt,
      input.updatedAt,
    );

  const row = tryGetCapabilitySnapshot(executor, input.staffId);
  if (row === null) {
    throw new RepositoryError("Failed to persist capability snapshot.");
  }
  return row;
}

export function insertStaffSession(
  executor: DbExecutor,
  input: InsertStaffSessionInput,
): LocalStaffSessionRecord {
  executor.db
    .prepare(
      `INSERT INTO local_staff_sessions (
         id, tenant_id, staff_id, device_id, verifier, credential_revision,
         issued_at, absolute_expires_at, last_activity_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      input.id,
      input.tenantId,
      input.staffId,
      input.deviceId,
      input.verifier,
      input.credentialRevision,
      input.issuedAt,
      input.absoluteExpiresAt,
      input.lastActivityAt,
    );
  return getStaffSessionById(executor, input.id);
}

export function getStaffSessionById(
  executor: DbExecutor,
  sessionId: string,
): LocalStaffSessionRecord {
  const row = executor.db
    .prepare(
      `SELECT id, tenant_id, staff_id, device_id, verifier, credential_revision,
              issued_at, absolute_expires_at, last_activity_at, revoked_at
       FROM local_staff_sessions WHERE id = ?`,
    )
    .get(sessionId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new NotFoundError("Staff session was not found.");
  }
  return mapLocalStaffSessionRow(row);
}

export function tryGetStaffSessionByVerifier(
  executor: DbExecutor,
  verifier: string,
): LocalStaffSessionRecord | null {
  const row = executor.db
    .prepare(
      `SELECT id, tenant_id, staff_id, device_id, verifier, credential_revision,
              issued_at, absolute_expires_at, last_activity_at, revoked_at
       FROM local_staff_sessions WHERE verifier = ?`,
    )
    .get(verifier) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffSessionRow(row);
}

export function updateSessionActivity(
  executor: DbExecutor,
  sessionId: string,
  lastActivityAt: string,
): void {
  executor.db
    .prepare(
      `UPDATE local_staff_sessions
       SET last_activity_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    )
    .run(lastActivityAt, sessionId);
}

export function revokeStaffSession(
  executor: DbExecutor,
  sessionId: string,
  revokedAt: string,
): void {
  executor.db
    .prepare(
      `UPDATE local_staff_sessions
       SET revoked_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    )
    .run(revokedAt, sessionId);
}

export function revokeSessionsForStaff(
  executor: DbExecutor,
  staffId: string,
  revokedAt: string,
): number {
  const result = executor.db
    .prepare(
      `UPDATE local_staff_sessions
       SET revoked_at = ?
       WHERE staff_id = ? AND revoked_at IS NULL`,
    )
    .run(revokedAt, staffId);
  return Number(result.changes);
}

export function revokeActiveSessionsForDevice(
  executor: DbExecutor,
  deviceId: string,
  revokedAt: string,
): number {
  const result = executor.db
    .prepare(
      `UPDATE local_staff_sessions
       SET revoked_at = ?
       WHERE device_id = ? AND revoked_at IS NULL`,
    )
    .run(revokedAt, deviceId);
  return Number(result.changes);
}

export function tryGetLoginAttempt(
  executor: DbExecutor,
  deviceId: string,
  staffCode: string,
): LocalStaffLoginAttemptRecord | null {
  const row = executor.db
    .prepare(
      `SELECT device_id, staff_code, window_started_at, attempt_count, locked_until, updated_at
       FROM local_staff_login_attempts WHERE device_id = ? AND staff_code = ?`,
    )
    .get(deviceId, staffCode) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapLocalStaffLoginAttemptRow(row);
}

export function upsertLoginAttempt(
  executor: DbExecutor,
  input: UpsertLoginAttemptInput,
): LocalStaffLoginAttemptRecord {
  executor.db
    .prepare(
      `INSERT INTO local_staff_login_attempts (
         device_id, staff_code, window_started_at, attempt_count, locked_until, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id, staff_code) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         attempt_count = excluded.attempt_count,
         locked_until = excluded.locked_until,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.deviceId,
      input.staffCode,
      input.windowStartedAt,
      input.attemptCount,
      input.lockedUntil ?? null,
      input.updatedAt,
    );
  const row = tryGetLoginAttempt(executor, input.deviceId, input.staffCode);
  if (row === null) {
    throw new RepositoryError("Failed to persist login attempt state.");
  }
  return row;
}

export function clearLoginAttempt(executor: DbExecutor, deviceId: string, staffCode: string): void {
  executor.db
    .prepare(`DELETE FROM local_staff_login_attempts WHERE device_id = ? AND staff_code = ?`)
    .run(deviceId, staffCode);
}

export function appendSecurityAuditEvent(
  executor: DbExecutor,
  input: AppendSecurityAuditInput,
): LocalSecurityAuditEventRecord {
  executor.db
    .prepare(
      `INSERT INTO local_security_audit_events (
         id, tenant_id, stall_id, actor_ref, device_ref, action,
         target_type, target_id, occurred_at, correlation_ref, details_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.tenantId ?? null,
      input.stallId ?? null,
      input.actorRef ?? null,
      input.deviceRef ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      input.occurredAt,
      input.correlationRef ?? null,
      input.detailsJson ?? null,
    );
  const row = executor.db
    .prepare(
      `SELECT id, tenant_id, stall_id, actor_ref, device_ref, action,
              target_type, target_id, occurred_at, correlation_ref, details_json
       FROM local_security_audit_events WHERE id = ?`,
    )
    .get(input.id) as Record<string, unknown>;
  return mapLocalSecurityAuditEventRow(row);
}
