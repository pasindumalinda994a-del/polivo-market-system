import { RepositoryError, type DbExecutor } from "./types.js";

export type ConfigDomain = "access";

export type ConfigDomainStateRecord = {
  domain: ConfigDomain;
  effectiveRevision: number | null;
  publicationId: string | null;
  payloadHash: string | null;
  issuedAt: string | null;
  maxSnapshotAgeMs: number | null;
  lastSuccessfulRefreshAt: string | null;
  lastPullAttemptAt: string | null;
  pendingAck: boolean;
  pendingAckRevision: number | null;
  pendingAckPublicationId: string | null;
  pendingAckPayloadHash: string | null;
  pendingAckResult: string | null;
  pendingAckErrorCode: string | null;
  pendingAckMessage: string | null;
  pendingAckAppliedAt: string | null;
  blockErrorCode: string | null;
  blockMessage: string | null;
  updatedAt: string;
};

export type ConfigReceivedSnapshotRecord = {
  domain: ConfigDomain;
  revision: number;
  publicationId: string;
  payloadHash: string;
  payloadJson: string;
  issuedAt: string;
  maxSnapshotAgeMs: number;
  receivedAt: string;
  appliedAt: string | null;
};

function mapDomainState(row: Record<string, unknown>): ConfigDomainStateRecord {
  return {
    domain: row["domain"] as ConfigDomain,
    effectiveRevision: row["effective_revision"] == null ? null : Number(row["effective_revision"]),
    publicationId: row["publication_id"] == null ? null : String(row["publication_id"]),
    payloadHash: row["payload_hash"] == null ? null : String(row["payload_hash"]),
    issuedAt: row["issued_at"] == null ? null : String(row["issued_at"]),
    maxSnapshotAgeMs:
      row["max_snapshot_age_ms"] == null ? null : Number(row["max_snapshot_age_ms"]),
    lastSuccessfulRefreshAt:
      row["last_successful_refresh_at"] == null ? null : String(row["last_successful_refresh_at"]),
    lastPullAttemptAt:
      row["last_pull_attempt_at"] == null ? null : String(row["last_pull_attempt_at"]),
    pendingAck: Number(row["pending_ack"]) === 1,
    pendingAckRevision:
      row["pending_ack_revision"] == null ? null : Number(row["pending_ack_revision"]),
    pendingAckPublicationId:
      row["pending_ack_publication_id"] == null ? null : String(row["pending_ack_publication_id"]),
    pendingAckPayloadHash:
      row["pending_ack_payload_hash"] == null ? null : String(row["pending_ack_payload_hash"]),
    pendingAckResult: row["pending_ack_result"] == null ? null : String(row["pending_ack_result"]),
    pendingAckErrorCode:
      row["pending_ack_error_code"] == null ? null : String(row["pending_ack_error_code"]),
    pendingAckMessage:
      row["pending_ack_message"] == null ? null : String(row["pending_ack_message"]),
    pendingAckAppliedAt:
      row["pending_ack_applied_at"] == null ? null : String(row["pending_ack_applied_at"]),
    blockErrorCode: row["block_error_code"] == null ? null : String(row["block_error_code"]),
    blockMessage: row["block_message"] == null ? null : String(row["block_message"]),
    updatedAt: String(row["updated_at"]),
  };
}

export function getConfigDomainState(
  executor: DbExecutor,
  domain: ConfigDomain = "access",
): ConfigDomainStateRecord {
  const row = executor.db
    .prepare(
      `SELECT domain, effective_revision, publication_id, payload_hash, issued_at,
              max_snapshot_age_ms, last_successful_refresh_at, last_pull_attempt_at,
              pending_ack, pending_ack_revision, pending_ack_publication_id,
              pending_ack_payload_hash, pending_ack_result, pending_ack_error_code,
              pending_ack_message, pending_ack_applied_at, block_error_code, block_message,
              updated_at
       FROM config_domain_state WHERE domain = ?`,
    )
    .get(domain) as Record<string, unknown> | undefined;
  if (row === undefined) {
    throw new RepositoryError(`Config domain state missing for ${domain}.`);
  }
  return mapDomainState(row);
}

export function tryGetReceivedSnapshot(
  executor: DbExecutor,
  domain: ConfigDomain,
  revision: number,
): ConfigReceivedSnapshotRecord | null {
  const row = executor.db
    .prepare(
      `SELECT domain, revision, publication_id, payload_hash, payload_json, issued_at,
              max_snapshot_age_ms, received_at, applied_at
       FROM config_received_snapshots WHERE domain = ? AND revision = ?`,
    )
    .get(domain, revision) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return {
    domain: row["domain"] as ConfigDomain,
    revision: Number(row["revision"]),
    publicationId: String(row["publication_id"]),
    payloadHash: String(row["payload_hash"]),
    payloadJson: String(row["payload_json"]),
    issuedAt: String(row["issued_at"]),
    maxSnapshotAgeMs: Number(row["max_snapshot_age_ms"]),
    receivedAt: String(row["received_at"]),
    appliedAt: row["applied_at"] == null ? null : String(row["applied_at"]),
  };
}

export function recordPullAttempt(
  executor: DbExecutor,
  input: { domain?: ConfigDomain; at: string },
): void {
  const domain = input.domain ?? "access";
  executor.db
    .prepare(
      `UPDATE config_domain_state
       SET last_pull_attempt_at = ?, updated_at = ?
       WHERE domain = ?`,
    )
    .run(input.at, input.at, domain);
}

export function clearConfigBlock(
  executor: DbExecutor,
  input: { domain?: ConfigDomain; updatedAt: string },
): void {
  const domain = input.domain ?? "access";
  executor.db
    .prepare(
      `UPDATE config_domain_state
       SET block_error_code = NULL, block_message = NULL, updated_at = ?
       WHERE domain = ?`,
    )
    .run(input.updatedAt, domain);
}

export function setConfigBlock(
  executor: DbExecutor,
  input: {
    domain?: ConfigDomain;
    errorCode: string;
    message: string;
    updatedAt: string;
  },
): void {
  const domain = input.domain ?? "access";
  executor.db
    .prepare(
      `UPDATE config_domain_state
       SET block_error_code = ?, block_message = ?, updated_at = ?
       WHERE domain = ?`,
    )
    .run(input.errorCode, input.message, input.updatedAt, domain);
}

export function clearPendingConfigAck(
  executor: DbExecutor,
  input: { domain?: ConfigDomain; updatedAt: string },
): void {
  const domain = input.domain ?? "access";
  executor.db
    .prepare(
      `UPDATE config_domain_state
       SET pending_ack = 0,
           pending_ack_revision = NULL,
           pending_ack_publication_id = NULL,
           pending_ack_payload_hash = NULL,
           pending_ack_result = NULL,
           pending_ack_error_code = NULL,
           pending_ack_message = NULL,
           pending_ack_applied_at = NULL,
           updated_at = ?
       WHERE domain = ?`,
    )
    .run(input.updatedAt, domain);
}

export function applyAccessConfigSnapshot(
  executor: DbExecutor,
  input: {
    revision: number;
    publicationId: string;
    payloadHash: string;
    payloadJson: string;
    issuedAt: string;
    maxSnapshotAgeMs: number;
    receivedAt: string;
    appliedAt: string;
    result: "applied" | "already_applied";
    auditId: string;
  },
): ConfigDomainStateRecord {
  const domain: ConfigDomain = "access";
  const existing = tryGetReceivedSnapshot(executor, domain, input.revision);
  if (existing !== null) {
    if (existing.payloadHash !== input.payloadHash) {
      throw new RepositoryError("CONFIG_INTEGRITY_CONFLICT");
    }
  } else {
    executor.db
      .prepare(
        `INSERT INTO config_received_snapshots (
           domain, revision, publication_id, payload_hash, payload_json,
           issued_at, max_snapshot_age_ms, received_at, applied_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        domain,
        input.revision,
        input.publicationId,
        input.payloadHash,
        input.payloadJson,
        input.issuedAt,
        input.maxSnapshotAgeMs,
        input.receivedAt,
        input.appliedAt,
      );
  }

  executor.db
    .prepare(
      `UPDATE config_received_snapshots
       SET applied_at = COALESCE(applied_at, ?)
       WHERE domain = ? AND revision = ?`,
    )
    .run(input.appliedAt, domain, input.revision);

  executor.db
    .prepare(
      `UPDATE config_domain_state
       SET effective_revision = ?,
           publication_id = ?,
           payload_hash = ?,
           issued_at = ?,
           max_snapshot_age_ms = ?,
           last_successful_refresh_at = ?,
           pending_ack = 1,
           pending_ack_revision = ?,
           pending_ack_publication_id = ?,
           pending_ack_payload_hash = ?,
           pending_ack_result = ?,
           pending_ack_error_code = NULL,
           pending_ack_message = NULL,
           pending_ack_applied_at = ?,
           block_error_code = NULL,
           block_message = NULL,
           updated_at = ?
       WHERE domain = ?`,
    )
    .run(
      input.revision,
      input.publicationId,
      input.payloadHash,
      input.issuedAt,
      input.maxSnapshotAgeMs,
      input.appliedAt,
      input.revision,
      input.publicationId,
      input.payloadHash,
      input.result,
      input.appliedAt,
      input.appliedAt,
      domain,
    );

  executor.db
    .prepare(
      `INSERT INTO config_application_audit (
         id, domain, revision, publication_id, payload_hash, result, error_code, message, recorded_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    )
    .run(
      input.auditId,
      domain,
      input.revision,
      input.publicationId,
      input.payloadHash,
      input.result,
      input.appliedAt,
    );

  return getConfigDomainState(executor, domain);
}
