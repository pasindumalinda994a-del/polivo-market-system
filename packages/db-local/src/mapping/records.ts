import { moneyMinorFromSqliteInteger, NumericPersistenceError } from "../numeric.js";
import {
  optionalString,
  requireAbsoluteTimestamp,
  requireBoolean01,
  requireCalendarDate,
  requireInteger,
  requireString,
  RowMappingError,
} from "./errors.js";

export type StallBindingRecord = {
  stallId: string;
  tenantId: string;
  boundAt: string;
};

export type LocalInstallationRecord = {
  id: string;
  createdAt: string;
};

export type HostActivationState =
  "pending_credential" | "redeeming" | "bound" | "confirming" | "activated" | "failed";

export type HostEnrollmentRecord = {
  hostDeviceId: string;
  installationId: string;
  credentialRef: string;
  credentialVersion: number;
  activationState: HostActivationState;
  pendingOperationId: string | null;
  cloudDeviceId: string | null;
  cloudStateRevision: number | null;
  activatedAt: string | null;
  updatedAt: string;
};

export type TerminalPairingState = "pending_host_confirm" | "accepted" | "revoked";

export type AcceptedTerminalRecord = {
  terminalDeviceId: string;
  publicKey: string;
  credentialVersion: number;
  label: string | null;
  pairingState: TerminalPairingState;
  cloudStateRevision: number | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
};

export type PartyRecord = {
  id: string;
  stallId: string;
  shortCode: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillStatus = "draft" | "finalized" | "cancelled";
export type PaymentStatus = "unpaid" | "partially_paid" | "fully_paid";

export type BillRecord = {
  id: string;
  stallId: string;
  saleId: string;
  partyId: string;
  billNumber: string | null;
  businessDate: string;
  status: BillStatus;
  revision: number;
  totalAmountMinor: number | null;
  paymentStatus: PaymentStatus | null;
  createdAt: string;
  updatedAt: string;
};

export type IdempotencyRecord = {
  scope: string;
  idempotencyKey: string;
  commandType: string;
  requestFingerprint: string;
  resultRef: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type AuditEventRecord = {
  id: string;
  stallId: string | null;
  tenantId: string | null;
  actorRef: string | null;
  deviceRef: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string;
  correlationRef: string | null;
  reason: string | null;
  changeDetailsJson: string | null;
};

export type OutboxEventRecord = {
  eventId: string;
  tenantId: string;
  stallId: string;
  originatingDeviceId: string;
  eventType: string;
  eventSchemaVersion: string;
  payloadJson: string;
  occurredAt: string;
  localSequence: number;
  deliveryAttempts: number;
  lastAttemptAt: string | null;
  ackState: "pending" | "acknowledged" | "failed";
  acknowledgedAt: string | null;
};

export type BillType = "farmer" | "trader";

const BILL_STATUSES = new Set<string>(["draft", "finalized", "cancelled"]);
const PAYMENT_STATUSES = new Set<string>(["unpaid", "partially_paid", "fully_paid"]);
const ACK_STATES = new Set<string>(["pending", "acknowledged", "failed"]);
const HOST_ACTIVATION_STATES = new Set<string>([
  "pending_credential",
  "redeeming",
  "bound",
  "confirming",
  "activated",
  "failed",
]);
const TERMINAL_PAIRING_STATES = new Set<string>(["pending_host_confirm", "accepted", "revoked"]);

function requireHostActivationState(value: unknown, field: string): HostActivationState {
  const text = requireString(value, field);
  if (!HOST_ACTIVATION_STATES.has(text)) {
    throw new RowMappingError(`Invalid host activation state for ${field}.`);
  }
  return text as HostActivationState;
}

function requireTerminalPairingState(value: unknown, field: string): TerminalPairingState {
  const text = requireString(value, field);
  if (!TERMINAL_PAIRING_STATES.has(text)) {
    throw new RowMappingError(`Invalid terminal pairing state for ${field}.`);
  }
  return text as TerminalPairingState;
}

function optionalInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requireInteger(value, field);
}

function requireBillStatus(value: unknown, field: string): BillStatus {
  const text = requireString(value, field);
  if (!BILL_STATUSES.has(text)) {
    throw new RowMappingError(`Invalid bill status for ${field}.`);
  }
  return text as BillStatus;
}

function requirePaymentStatus(value: unknown, field: string): PaymentStatus | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = requireString(value, field);
  if (!PAYMENT_STATUSES.has(text)) {
    throw new RowMappingError(`Invalid payment status for ${field}.`);
  }
  return text as PaymentStatus;
}

function optionalMoneyMinor(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return moneyMinorFromSqliteInteger(value);
  } catch (error) {
    if (error instanceof NumericPersistenceError) {
      throw new RowMappingError(`${field}: ${error.message}`);
    }
    throw error;
  }
}

export function mapStallBindingRow(row: Record<string, unknown>): StallBindingRecord {
  return {
    stallId: requireString(row["stall_id"], "stall_binding.stall_id"),
    tenantId: requireString(row["tenant_id"], "stall_binding.tenant_id"),
    boundAt: requireAbsoluteTimestamp(row["bound_at"], "stall_binding.bound_at"),
  };
}

export function mapLocalInstallationRow(row: Record<string, unknown>): LocalInstallationRecord {
  return {
    id: requireString(row["id"], "local_installation.id"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "local_installation.created_at"),
  };
}

export function mapHostEnrollmentRow(row: Record<string, unknown>): HostEnrollmentRecord {
  return {
    hostDeviceId: requireString(row["host_device_id"], "host_enrollment.host_device_id"),
    installationId: requireString(row["installation_id"], "host_enrollment.installation_id"),
    credentialRef: requireString(row["credential_ref"], "host_enrollment.credential_ref"),
    credentialVersion: requireInteger(
      row["credential_version"],
      "host_enrollment.credential_version",
    ),
    activationState: requireHostActivationState(
      row["activation_state"],
      "host_enrollment.activation_state",
    ),
    pendingOperationId: optionalString(
      row["pending_operation_id"],
      "host_enrollment.pending_operation_id",
    ),
    cloudDeviceId: optionalString(row["cloud_device_id"], "host_enrollment.cloud_device_id"),
    cloudStateRevision: optionalInteger(
      row["cloud_state_revision"],
      "host_enrollment.cloud_state_revision",
    ),
    activatedAt:
      row["activated_at"] === null || row["activated_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["activated_at"], "host_enrollment.activated_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "host_enrollment.updated_at"),
  };
}

export function mapAcceptedTerminalRow(row: Record<string, unknown>): AcceptedTerminalRecord {
  return {
    terminalDeviceId: requireString(
      row["terminal_device_id"],
      "accepted_terminals.terminal_device_id",
    ),
    publicKey: requireString(row["public_key"], "accepted_terminals.public_key"),
    credentialVersion: requireInteger(
      row["credential_version"],
      "accepted_terminals.credential_version",
    ),
    label: optionalString(row["label"], "accepted_terminals.label"),
    pairingState: requireTerminalPairingState(
      row["pairing_state"],
      "accepted_terminals.pairing_state",
    ),
    cloudStateRevision: optionalInteger(
      row["cloud_state_revision"],
      "accepted_terminals.cloud_state_revision",
    ),
    acceptedAt:
      row["accepted_at"] === null || row["accepted_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["accepted_at"], "accepted_terminals.accepted_at"),
    revokedAt:
      row["revoked_at"] === null || row["revoked_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["revoked_at"], "accepted_terminals.revoked_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "accepted_terminals.updated_at"),
  };
}

export function mapPartyRow(
  row: Record<string, unknown>,
  table: "farmers" | "traders",
): PartyRecord {
  return {
    id: requireString(row["id"], `${table}.id`),
    stallId: requireString(row["stall_id"], `${table}.stall_id`),
    shortCode: requireString(row["short_code"], `${table}.short_code`),
    displayName: requireString(row["display_name"], `${table}.display_name`),
    isActive: requireBoolean01(row["is_active"], `${table}.is_active`),
    createdAt: requireAbsoluteTimestamp(row["created_at"], `${table}.created_at`),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], `${table}.updated_at`),
  };
}

export function mapBillRow(row: Record<string, unknown>, kind: BillType): BillRecord {
  const partyColumn = kind === "farmer" ? "farmer_id" : "trader_id";
  const table = kind === "farmer" ? "farmer_bills" : "trader_bills";
  return {
    id: requireString(row["id"], `${table}.id`),
    stallId: requireString(row["stall_id"], `${table}.stall_id`),
    saleId: requireString(row["sale_id"], `${table}.sale_id`),
    partyId: requireString(row[partyColumn], `${table}.${partyColumn}`),
    billNumber: optionalString(row["bill_number"], `${table}.bill_number`),
    businessDate: requireCalendarDate(row["business_date"], `${table}.business_date`),
    status: requireBillStatus(row["status"], `${table}.status`),
    revision: requireInteger(row["revision"], `${table}.revision`),
    totalAmountMinor: optionalMoneyMinor(row["total_amount_minor"], `${table}.total_amount_minor`),
    paymentStatus: requirePaymentStatus(row["payment_status"], `${table}.payment_status`),
    createdAt: requireAbsoluteTimestamp(row["created_at"], `${table}.created_at`),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], `${table}.updated_at`),
  };
}

export function mapIdempotencyRow(row: Record<string, unknown>): IdempotencyRecord {
  return {
    scope: requireString(row["scope"], "command_idempotency.scope"),
    idempotencyKey: requireString(row["idempotency_key"], "command_idempotency.idempotency_key"),
    commandType: requireString(row["command_type"], "command_idempotency.command_type"),
    requestFingerprint: requireString(
      row["request_fingerprint"],
      "command_idempotency.request_fingerprint",
    ),
    resultRef: optionalString(row["result_ref"], "command_idempotency.result_ref"),
    completedAt:
      row["completed_at"] === null || row["completed_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["completed_at"], "command_idempotency.completed_at"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "command_idempotency.created_at"),
  };
}

export function mapAuditEventRow(row: Record<string, unknown>): AuditEventRecord {
  return {
    id: requireString(row["id"], "audit_events.id"),
    stallId: optionalString(row["stall_id"], "audit_events.stall_id"),
    tenantId: optionalString(row["tenant_id"], "audit_events.tenant_id"),
    actorRef: optionalString(row["actor_ref"], "audit_events.actor_ref"),
    deviceRef: optionalString(row["device_ref"], "audit_events.device_ref"),
    action: requireString(row["action"], "audit_events.action"),
    targetType: optionalString(row["target_type"], "audit_events.target_type"),
    targetId: optionalString(row["target_id"], "audit_events.target_id"),
    occurredAt: requireAbsoluteTimestamp(row["occurred_at"], "audit_events.occurred_at"),
    correlationRef: optionalString(row["correlation_ref"], "audit_events.correlation_ref"),
    reason: optionalString(row["reason"], "audit_events.reason"),
    changeDetailsJson: optionalString(
      row["change_details_json"],
      "audit_events.change_details_json",
    ),
  };
}

export function mapOutboxEventRow(row: Record<string, unknown>): OutboxEventRecord {
  const ackState = requireString(row["ack_state"], "sync_outbox.ack_state");
  if (!ACK_STATES.has(ackState)) {
    throw new RowMappingError("Invalid ack_state for sync_outbox.ack_state.");
  }
  return {
    eventId: requireString(row["event_id"], "sync_outbox.event_id"),
    tenantId: requireString(row["tenant_id"], "sync_outbox.tenant_id"),
    stallId: requireString(row["stall_id"], "sync_outbox.stall_id"),
    originatingDeviceId: requireString(
      row["originating_device_id"],
      "sync_outbox.originating_device_id",
    ),
    eventType: requireString(row["event_type"], "sync_outbox.event_type"),
    eventSchemaVersion: requireString(
      row["event_schema_version"],
      "sync_outbox.event_schema_version",
    ),
    payloadJson: requireString(row["payload_json"], "sync_outbox.payload_json"),
    occurredAt: requireAbsoluteTimestamp(row["occurred_at"], "sync_outbox.occurred_at"),
    localSequence: requireInteger(row["local_sequence"], "sync_outbox.local_sequence"),
    deliveryAttempts: requireInteger(row["delivery_attempts"], "sync_outbox.delivery_attempts"),
    lastAttemptAt:
      row["last_attempt_at"] === null || row["last_attempt_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["last_attempt_at"], "sync_outbox.last_attempt_at"),
    ackState: ackState as OutboxEventRecord["ackState"],
    acknowledgedAt:
      row["acknowledged_at"] === null || row["acknowledged_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["acknowledged_at"], "sync_outbox.acknowledged_at"),
  };
}
