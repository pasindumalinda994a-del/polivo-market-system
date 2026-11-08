import {
  mapAcceptedTerminalRow,
  mapHostEnrollmentRow,
  type AcceptedTerminalRecord,
  type HostActivationState,
  type HostEnrollmentRecord,
  type TerminalPairingState,
} from "../mapping/records.js";
import { NotFoundError, RepositoryError, type DbExecutor } from "./types.js";

export type UpsertHostEnrollmentInput = {
  hostDeviceId: string;
  installationId: string;
  credentialRef: string;
  credentialVersion: number;
  activationState: HostActivationState;
  pendingOperationId?: string | null;
  cloudDeviceId?: string | null;
  cloudStateRevision?: number | null;
  activatedAt?: string | null;
  updatedAt: string;
};

export type UpsertAcceptedTerminalInput = {
  terminalDeviceId: string;
  publicKey: string;
  credentialVersion: number;
  label?: string | null;
  pairingState: TerminalPairingState;
  cloudStateRevision?: number | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  updatedAt: string;
};

export function tryGetHostEnrollment(executor: DbExecutor): HostEnrollmentRecord | null {
  const row = executor.db
    .prepare(
      `SELECT host_device_id, installation_id, credential_ref, credential_version,
              activation_state, pending_operation_id, cloud_device_id, cloud_state_revision,
              activated_at, updated_at
       FROM host_enrollment WHERE id = 1`,
    )
    .get() as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapHostEnrollmentRow(row);
}

export function getHostEnrollment(executor: DbExecutor): HostEnrollmentRecord {
  const row = tryGetHostEnrollment(executor);
  if (row === null) {
    throw new NotFoundError("Host enrollment is not configured for this database.");
  }
  return row;
}

export function upsertHostEnrollment(
  executor: DbExecutor,
  input: UpsertHostEnrollmentInput,
): HostEnrollmentRecord {
  if (input.credentialVersion < 1) {
    throw new RepositoryError("credential_version must be >= 1.");
  }
  executor.db
    .prepare(
      `INSERT INTO host_enrollment (
         id, host_device_id, installation_id, credential_ref, credential_version,
         activation_state, pending_operation_id, cloud_device_id, cloud_state_revision,
         activated_at, updated_at
       ) VALUES (
         1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )
       ON CONFLICT(id) DO UPDATE SET
         host_device_id = excluded.host_device_id,
         installation_id = excluded.installation_id,
         credential_ref = excluded.credential_ref,
         credential_version = excluded.credential_version,
         activation_state = excluded.activation_state,
         pending_operation_id = excluded.pending_operation_id,
         cloud_device_id = excluded.cloud_device_id,
         cloud_state_revision = excluded.cloud_state_revision,
         activated_at = excluded.activated_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.hostDeviceId,
      input.installationId,
      input.credentialRef,
      input.credentialVersion,
      input.activationState,
      input.pendingOperationId ?? null,
      input.cloudDeviceId ?? null,
      input.cloudStateRevision ?? null,
      input.activatedAt ?? null,
      input.updatedAt,
    );
  return getHostEnrollment(executor);
}

export function updateHostActivationState(
  executor: DbExecutor,
  input: {
    activationState: HostActivationState;
    updatedAt: string;
    pendingOperationId?: string | null;
    cloudDeviceId?: string | null;
    cloudStateRevision?: number | null;
    activatedAt?: string | null;
    credentialVersion?: number;
    credentialRef?: string;
  },
): HostEnrollmentRecord {
  const existing = getHostEnrollment(executor);
  return upsertHostEnrollment(executor, {
    hostDeviceId: existing.hostDeviceId,
    installationId: existing.installationId,
    credentialRef: input.credentialRef ?? existing.credentialRef,
    credentialVersion: input.credentialVersion ?? existing.credentialVersion,
    activationState: input.activationState,
    pendingOperationId:
      input.pendingOperationId !== undefined
        ? input.pendingOperationId
        : existing.pendingOperationId,
    cloudDeviceId: input.cloudDeviceId !== undefined ? input.cloudDeviceId : existing.cloudDeviceId,
    cloudStateRevision:
      input.cloudStateRevision !== undefined
        ? input.cloudStateRevision
        : existing.cloudStateRevision,
    activatedAt: input.activatedAt !== undefined ? input.activatedAt : existing.activatedAt,
    updatedAt: input.updatedAt,
  });
}

export function listAcceptedTerminals(executor: DbExecutor): AcceptedTerminalRecord[] {
  const rows = executor.db
    .prepare(
      `SELECT terminal_device_id, public_key, credential_version, label, pairing_state,
              cloud_state_revision, accepted_at, revoked_at, updated_at
       FROM accepted_terminals
       ORDER BY terminal_device_id`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => mapAcceptedTerminalRow(row));
}

export function tryGetAcceptedTerminal(
  executor: DbExecutor,
  terminalDeviceId: string,
): AcceptedTerminalRecord | null {
  const row = executor.db
    .prepare(
      `SELECT terminal_device_id, public_key, credential_version, label, pairing_state,
              cloud_state_revision, accepted_at, revoked_at, updated_at
       FROM accepted_terminals
       WHERE terminal_device_id = ?`,
    )
    .get(terminalDeviceId) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return mapAcceptedTerminalRow(row);
}

export function upsertAcceptedTerminal(
  executor: DbExecutor,
  input: UpsertAcceptedTerminalInput,
): AcceptedTerminalRecord {
  if (input.credentialVersion < 1) {
    throw new RepositoryError("credential_version must be >= 1.");
  }
  executor.db
    .prepare(
      `INSERT INTO accepted_terminals (
         terminal_device_id, public_key, credential_version, label, pairing_state,
         cloud_state_revision, accepted_at, revoked_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(terminal_device_id) DO UPDATE SET
         public_key = excluded.public_key,
         credential_version = excluded.credential_version,
         label = excluded.label,
         pairing_state = excluded.pairing_state,
         cloud_state_revision = excluded.cloud_state_revision,
         accepted_at = excluded.accepted_at,
         revoked_at = excluded.revoked_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.terminalDeviceId,
      input.publicKey,
      input.credentialVersion,
      input.label ?? null,
      input.pairingState,
      input.cloudStateRevision ?? null,
      input.acceptedAt ?? null,
      input.revokedAt ?? null,
      input.updatedAt,
    );
  const row = tryGetAcceptedTerminal(executor, input.terminalDeviceId);
  if (row === null) {
    throw new RepositoryError("Failed to persist accepted terminal.");
  }
  return row;
}

export function revokeAcceptedTerminal(
  executor: DbExecutor,
  input: {
    terminalDeviceId: string;
    revokedAt: string;
    updatedAt: string;
    cloudStateRevision?: number | null;
  },
): AcceptedTerminalRecord {
  const existing = tryGetAcceptedTerminal(executor, input.terminalDeviceId);
  if (existing === null) {
    throw new NotFoundError("Accepted terminal was not found.");
  }
  return upsertAcceptedTerminal(executor, {
    terminalDeviceId: existing.terminalDeviceId,
    publicKey: existing.publicKey,
    credentialVersion: existing.credentialVersion,
    label: existing.label,
    pairingState: "revoked",
    cloudStateRevision:
      input.cloudStateRevision !== undefined
        ? input.cloudStateRevision
        : existing.cloudStateRevision,
    acceptedAt: existing.acceptedAt,
    revokedAt: input.revokedAt,
    updatedAt: input.updatedAt,
  });
}
