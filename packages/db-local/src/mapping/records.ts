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

/** Farmer master record after migration 004 (revision + optional contact fields). */
export type FarmerRecord = PartyRecord & {
  revision: number;
  contactNumber: string | null;
  locality: string | null;
};

/** Buyer master record after migration 005. Stored on the traders table. */
export type BuyerRecord = PartyRecord & {
  revision: number;
  contactNumber: string | null;
  locality: string | null;
};

/** Vegetable catalog record after migration 006. */
export type VegetableRecord = PartyRecord & {
  revision: number;
};

/** Package-type catalog record after migration 006. No default tare fields. */
export type PackageTypeRecord = PartyRecord & {
  revision: number;
};

/** Stall commission policy pointer after migration 007. */
export type CommissionPolicyStateRecord = {
  stallId: string;
  activeBandSetId: string | null;
  revision: number;
  updatedAt: string;
};

/** Immutable published commission band-set version after migration 007. */
export type CommissionBandSetRecord = {
  id: string;
  stallId: string;
  versionNumber: number;
  effectiveFrom: string;
  createdAt: string;
  createdByStaffId: string | null;
  activatedAt: string | null;
  activatedByStaffId: string | null;
  previousBandSetId: string | null;
};

export type CommissionBandRecord = {
  id: string;
  stallId: string;
  bandSetId: string;
  sortOrder: number;
  minPricePerKgMinor: number | null;
  maxPricePerKgMinor: number | null;
  ratePerKgMinor: number;
};

export type LedgerPartyKind = "farmer" | "trader";
export type PartyAccountOpeningStatus = "not_opened" | "opened" | "opened_zero";
export type OpeningDraftStatus = "draft" | "posted" | "discarded";
export type OpeningBalanceDirection =
  | "stall_owes_farmer"
  | "farmer_owes_stall"
  | "buyer_owes_stall"
  | "stall_owes_buyer";

export type PartyAccountRecord = {
  id: string;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  currency: "LKR";
  openingStatus: PartyAccountOpeningStatus;
  openingCutoffDate: string | null;
  openingCompletedAt: string | null;
  openingCompletedByStaffId: string | null;
  openingDraftId: string | null;
  openingPostingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LedgerPostingRecord = {
  id: string;
  stallId: string;
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  eventSequence: number;
  businessDate: string;
  recordedAt: string;
  actorStaffId: string | null;
  description: string | null;
  currency: "LKR";
};

export type LedgerEntryRecord = {
  id: string;
  stallId: string;
  postingId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  amountMinor: number;
  currency: "LKR";
  postingSequence: number;
  reversesEntryId: string | null;
};

export type OpeningBalanceDraftRecord = {
  id: string;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  direction: OpeningBalanceDirection;
  amountMinor: number;
  signedAmountMinor: number | null;
  cutoffDate: string;
  currency: "LKR";
  reference: string | null;
  explanation: string | null;
  status: OpeningDraftStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdByStaffId: string | null;
  postedPostingId: string | null;
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

export type LocalStaffStatus = "active" | "disabled";

export type LocalStaffRecord = {
  id: string;
  tenantId: string;
  staffCode: string;
  displayName: string;
  status: LocalStaffStatus;
  isLocalOwner: boolean;
  cloudMembershipId: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
};

export type LocalStaffCredentialRecord = {
  staffId: string;
  tenantId: string;
  verifier: string;
  verifierFormat: "scrypt$v1";
  credentialRevision: number;
  updatedAt: string;
};

export type LocalStaffCapabilitySnapshotRecord = {
  staffId: string;
  tenantId: string;
  stallId: string;
  capabilitiesJson: string;
  sourceRevision: number;
  authorityVerifiedAt: string;
  updatedAt: string;
};

export type LocalStaffSessionRecord = {
  id: string;
  tenantId: string;
  staffId: string;
  deviceId: string;
  verifier: string;
  credentialRevision: number;
  issuedAt: string;
  absoluteExpiresAt: string;
  lastActivityAt: string;
  revokedAt: string | null;
};

export type LocalStaffLoginAttemptRecord = {
  deviceId: string;
  staffCode: string;
  windowStartedAt: string;
  attemptCount: number;
  lockedUntil: string | null;
  updatedAt: string;
};

export type LocalSecurityAuditEventRecord = {
  id: string;
  tenantId: string | null;
  stallId: string | null;
  actorRef: string | null;
  deviceRef: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string;
  correlationRef: string | null;
  detailsJson: string | null;
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
const LOCAL_STAFF_STATUSES = new Set<string>(["active", "disabled"]);

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

function requireMoneyMinor(value: unknown, field: string): number {
  const amount = optionalMoneyMinor(value, field);
  if (amount === null) {
    throw new RowMappingError(`Expected money amount for ${field}.`);
  }
  return amount;
}

function requireLedgerPartyKind(value: unknown, field: string): LedgerPartyKind {
  const text = requireString(value, field);
  if (text !== "farmer" && text !== "trader") {
    throw new RowMappingError(`Invalid ledger party kind for ${field}.`);
  }
  return text;
}

function requireOpeningStatus(value: unknown, field: string): PartyAccountOpeningStatus {
  const text = requireString(value, field);
  if (text !== "not_opened" && text !== "opened" && text !== "opened_zero") {
    throw new RowMappingError(`Invalid opening status for ${field}.`);
  }
  return text;
}

function requireOpeningDirection(value: unknown, field: string): OpeningBalanceDirection {
  const text = requireString(value, field);
  const allowed: OpeningBalanceDirection[] = [
    "stall_owes_farmer",
    "farmer_owes_stall",
    "buyer_owes_stall",
    "stall_owes_buyer",
  ];
  if (!allowed.includes(text as OpeningBalanceDirection)) {
    throw new RowMappingError(`Invalid opening direction for ${field}.`);
  }
  return text as OpeningBalanceDirection;
}

function requireOpeningDraftStatus(value: unknown, field: string): OpeningDraftStatus {
  const text = requireString(value, field);
  if (text !== "draft" && text !== "posted" && text !== "discarded") {
    throw new RowMappingError(`Invalid opening draft status for ${field}.`);
  }
  return text;
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
  table: "farmers" | "traders" | "vegetables" | "package_types",
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

export function mapFarmerRow(row: Record<string, unknown>): FarmerRecord {
  const base = mapPartyRow(row, "farmers");
  return {
    ...base,
    revision: requireInteger(row["revision"], "farmers.revision"),
    contactNumber: optionalString(row["contact_number"], "farmers.contact_number"),
    locality: optionalString(row["locality"], "farmers.locality"),
  };
}

export function mapBuyerRow(row: Record<string, unknown>): BuyerRecord {
  const base = mapPartyRow(row, "traders");
  return {
    ...base,
    revision: requireInteger(row["revision"], "traders.revision"),
    contactNumber: optionalString(row["contact_number"], "traders.contact_number"),
    locality: optionalString(row["locality"], "traders.locality"),
  };
}

export function mapVegetableRow(row: Record<string, unknown>): VegetableRecord {
  const base = mapPartyRow(row, "vegetables");
  return {
    ...base,
    revision: requireInteger(row["revision"], "vegetables.revision"),
  };
}

export function mapPackageTypeRow(row: Record<string, unknown>): PackageTypeRecord {
  const base = mapPartyRow(row, "package_types");
  return {
    ...base,
    revision: requireInteger(row["revision"], "package_types.revision"),
  };
}

export function mapCommissionPolicyStateRow(
  row: Record<string, unknown>,
): CommissionPolicyStateRecord {
  return {
    stallId: requireString(row["stall_id"], "commission_policies.stall_id"),
    activeBandSetId: optionalString(
      row["active_band_set_id"],
      "commission_policies.active_band_set_id",
    ),
    revision: requireInteger(row["revision"], "commission_policies.revision"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "commission_policies.updated_at"),
  };
}

export function mapCommissionBandSetRow(row: Record<string, unknown>): CommissionBandSetRecord {
  return {
    id: requireString(row["id"], "commission_band_sets.id"),
    stallId: requireString(row["stall_id"], "commission_band_sets.stall_id"),
    versionNumber: requireInteger(row["version_number"], "commission_band_sets.version_number"),
    effectiveFrom: requireAbsoluteTimestamp(
      row["effective_from"],
      "commission_band_sets.effective_from",
    ),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "commission_band_sets.created_at"),
    createdByStaffId: optionalString(
      row["created_by_staff_id"],
      "commission_band_sets.created_by_staff_id",
    ),
    activatedAt:
      row["activated_at"] === null || row["activated_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["activated_at"], "commission_band_sets.activated_at"),
    activatedByStaffId: optionalString(
      row["activated_by_staff_id"],
      "commission_band_sets.activated_by_staff_id",
    ),
    previousBandSetId: optionalString(
      row["previous_band_set_id"],
      "commission_band_sets.previous_band_set_id",
    ),
  };
}

export function mapCommissionBandRow(row: Record<string, unknown>): CommissionBandRecord {
  return {
    id: requireString(row["id"], "commission_bands.id"),
    stallId: requireString(row["stall_id"], "commission_bands.stall_id"),
    bandSetId: requireString(row["band_set_id"], "commission_bands.band_set_id"),
    sortOrder: requireInteger(row["sort_order"], "commission_bands.sort_order"),
    minPricePerKgMinor: optionalMoneyMinor(
      row["min_price_per_kg_minor"],
      "commission_bands.min_price_per_kg_minor",
    ),
    maxPricePerKgMinor: optionalMoneyMinor(
      row["max_price_per_kg_minor"],
      "commission_bands.max_price_per_kg_minor",
    ),
    ratePerKgMinor: (() => {
      try {
        return moneyMinorFromSqliteInteger(row["rate_per_kg_minor"]);
      } catch (error) {
        if (error instanceof NumericPersistenceError) {
          throw new RowMappingError(error.message);
        }
        throw error;
      }
    })(),
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

function requireLocalStaffStatus(value: unknown, field: string): LocalStaffStatus {
  const text = requireString(value, field);
  if (!LOCAL_STAFF_STATUSES.has(text)) {
    throw new RowMappingError(`Invalid local staff status for ${field}.`);
  }
  return text as LocalStaffStatus;
}

export function mapLocalStaffRow(row: Record<string, unknown>): LocalStaffRecord {
  return {
    id: requireString(row["id"], "local_staff.id"),
    tenantId: requireString(row["tenant_id"], "local_staff.tenant_id"),
    staffCode: requireString(row["staff_code"], "local_staff.staff_code"),
    displayName: requireString(row["display_name"], "local_staff.display_name"),
    status: requireLocalStaffStatus(row["status"], "local_staff.status"),
    isLocalOwner: requireBoolean01(row["is_local_owner"], "local_staff.is_local_owner"),
    cloudMembershipId: optionalString(
      row["cloud_membership_id"],
      "local_staff.cloud_membership_id",
    ),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "local_staff.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "local_staff.updated_at"),
    disabledAt:
      row["disabled_at"] === null || row["disabled_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["disabled_at"], "local_staff.disabled_at"),
  };
}

export function mapLocalStaffCredentialRow(
  row: Record<string, unknown>,
): LocalStaffCredentialRecord {
  const format = requireString(row["verifier_format"], "local_staff_credentials.verifier_format");
  if (format !== "scrypt$v1") {
    throw new RowMappingError("Unsupported credential verifier format.");
  }
  return {
    staffId: requireString(row["staff_id"], "local_staff_credentials.staff_id"),
    tenantId: requireString(row["tenant_id"], "local_staff_credentials.tenant_id"),
    verifier: requireString(row["verifier"], "local_staff_credentials.verifier"),
    verifierFormat: "scrypt$v1",
    credentialRevision: requireInteger(
      row["credential_revision"],
      "local_staff_credentials.credential_revision",
    ),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "local_staff_credentials.updated_at"),
  };
}

export function mapLocalStaffCapabilitySnapshotRow(
  row: Record<string, unknown>,
): LocalStaffCapabilitySnapshotRecord {
  return {
    staffId: requireString(row["staff_id"], "local_staff_capability_snapshots.staff_id"),
    tenantId: requireString(row["tenant_id"], "local_staff_capability_snapshots.tenant_id"),
    stallId: requireString(row["stall_id"], "local_staff_capability_snapshots.stall_id"),
    capabilitiesJson: requireString(
      row["capabilities_json"],
      "local_staff_capability_snapshots.capabilities_json",
    ),
    sourceRevision: requireInteger(
      row["source_revision"],
      "local_staff_capability_snapshots.source_revision",
    ),
    authorityVerifiedAt: requireAbsoluteTimestamp(
      row["authority_verified_at"],
      "local_staff_capability_snapshots.authority_verified_at",
    ),
    updatedAt: requireAbsoluteTimestamp(
      row["updated_at"],
      "local_staff_capability_snapshots.updated_at",
    ),
  };
}

export function mapLocalStaffSessionRow(row: Record<string, unknown>): LocalStaffSessionRecord {
  return {
    id: requireString(row["id"], "local_staff_sessions.id"),
    tenantId: requireString(row["tenant_id"], "local_staff_sessions.tenant_id"),
    staffId: requireString(row["staff_id"], "local_staff_sessions.staff_id"),
    deviceId: requireString(row["device_id"], "local_staff_sessions.device_id"),
    verifier: requireString(row["verifier"], "local_staff_sessions.verifier"),
    credentialRevision: requireInteger(
      row["credential_revision"],
      "local_staff_sessions.credential_revision",
    ),
    issuedAt: requireAbsoluteTimestamp(row["issued_at"], "local_staff_sessions.issued_at"),
    absoluteExpiresAt: requireAbsoluteTimestamp(
      row["absolute_expires_at"],
      "local_staff_sessions.absolute_expires_at",
    ),
    lastActivityAt: requireAbsoluteTimestamp(
      row["last_activity_at"],
      "local_staff_sessions.last_activity_at",
    ),
    revokedAt:
      row["revoked_at"] === null || row["revoked_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["revoked_at"], "local_staff_sessions.revoked_at"),
  };
}

export function mapLocalStaffLoginAttemptRow(
  row: Record<string, unknown>,
): LocalStaffLoginAttemptRecord {
  return {
    deviceId: requireString(row["device_id"], "local_staff_login_attempts.device_id"),
    staffCode: requireString(row["staff_code"], "local_staff_login_attempts.staff_code"),
    windowStartedAt: requireAbsoluteTimestamp(
      row["window_started_at"],
      "local_staff_login_attempts.window_started_at",
    ),
    attemptCount: requireInteger(row["attempt_count"], "local_staff_login_attempts.attempt_count"),
    lockedUntil:
      row["locked_until"] === null || row["locked_until"] === undefined
        ? null
        : requireAbsoluteTimestamp(row["locked_until"], "local_staff_login_attempts.locked_until"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "local_staff_login_attempts.updated_at"),
  };
}

export function mapLocalSecurityAuditEventRow(
  row: Record<string, unknown>,
): LocalSecurityAuditEventRecord {
  return {
    id: requireString(row["id"], "local_security_audit_events.id"),
    tenantId: optionalString(row["tenant_id"], "local_security_audit_events.tenant_id"),
    stallId: optionalString(row["stall_id"], "local_security_audit_events.stall_id"),
    actorRef: optionalString(row["actor_ref"], "local_security_audit_events.actor_ref"),
    deviceRef: optionalString(row["device_ref"], "local_security_audit_events.device_ref"),
    action: requireString(row["action"], "local_security_audit_events.action"),
    targetType: optionalString(row["target_type"], "local_security_audit_events.target_type"),
    targetId: optionalString(row["target_id"], "local_security_audit_events.target_id"),
    occurredAt: requireAbsoluteTimestamp(
      row["occurred_at"],
      "local_security_audit_events.occurred_at",
    ),
    correlationRef: optionalString(
      row["correlation_ref"],
      "local_security_audit_events.correlation_ref",
    ),
    detailsJson: optionalString(row["details_json"], "local_security_audit_events.details_json"),
  };
}

export function mapPartyAccountRow(row: Record<string, unknown>): PartyAccountRecord {
  const currency = requireString(row["currency"], "party_accounts.currency");
  if (currency !== "LKR") {
    throw new RowMappingError("Unsupported currency for party_accounts.currency.");
  }
  return {
    id: requireString(row["id"], "party_accounts.id"),
    stallId: requireString(row["stall_id"], "party_accounts.stall_id"),
    partyKind: requireLedgerPartyKind(row["party_kind"], "party_accounts.party_kind"),
    partyId: requireString(row["party_id"], "party_accounts.party_id"),
    currency: "LKR",
    openingStatus: requireOpeningStatus(row["opening_status"], "party_accounts.opening_status"),
    openingCutoffDate:
      row["opening_cutoff_date"] === null || row["opening_cutoff_date"] === undefined
        ? null
        : requireCalendarDate(row["opening_cutoff_date"], "party_accounts.opening_cutoff_date"),
    openingCompletedAt:
      row["opening_completed_at"] === null || row["opening_completed_at"] === undefined
        ? null
        : requireAbsoluteTimestamp(
            row["opening_completed_at"],
            "party_accounts.opening_completed_at",
          ),
    openingCompletedByStaffId: optionalString(
      row["opening_completed_by_staff_id"],
      "party_accounts.opening_completed_by_staff_id",
    ),
    openingDraftId: optionalString(row["opening_draft_id"], "party_accounts.opening_draft_id"),
    openingPostingId: optionalString(
      row["opening_posting_id"],
      "party_accounts.opening_posting_id",
    ),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "party_accounts.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "party_accounts.updated_at"),
  };
}

export function mapLedgerPostingRow(row: Record<string, unknown>): LedgerPostingRecord {
  const currency = requireString(row["currency"], "ledger_postings.currency");
  if (currency !== "LKR") {
    throw new RowMappingError("Unsupported currency for ledger_postings.currency.");
  }
  return {
    id: requireString(row["id"], "ledger_postings.id"),
    stallId: requireString(row["stall_id"], "ledger_postings.stall_id"),
    sourceType: requireString(row["source_type"], "ledger_postings.source_type"),
    sourceId: requireString(row["source_id"], "ledger_postings.source_id"),
    financialEventType: requireString(
      row["financial_event_type"],
      "ledger_postings.financial_event_type",
    ),
    eventSequence: requireInteger(row["event_sequence"], "ledger_postings.event_sequence"),
    businessDate: requireCalendarDate(row["business_date"], "ledger_postings.business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "ledger_postings.recorded_at"),
    actorStaffId: optionalString(row["actor_staff_id"], "ledger_postings.actor_staff_id"),
    description: optionalString(row["description"], "ledger_postings.description"),
    currency: "LKR",
  };
}

export function mapLedgerEntryRow(row: Record<string, unknown>): LedgerEntryRecord {
  const currency = requireString(row["currency"], "ledger_entries.currency");
  if (currency !== "LKR") {
    throw new RowMappingError("Unsupported currency for ledger_entries.currency.");
  }
  return {
    id: requireString(row["id"], "ledger_entries.id"),
    stallId: requireString(row["stall_id"], "ledger_entries.stall_id"),
    postingId: requireString(row["posting_id"], "ledger_entries.posting_id"),
    partyKind: requireLedgerPartyKind(row["party_kind"], "ledger_entries.party_kind"),
    partyId: requireString(row["party_id"], "ledger_entries.party_id"),
    amountMinor: requireMoneyMinor(row["amount_minor"], "ledger_entries.amount_minor"),
    currency: "LKR",
    postingSequence: requireInteger(row["posting_sequence"], "ledger_entries.posting_sequence"),
    reversesEntryId: optionalString(row["reverses_entry_id"], "ledger_entries.reverses_entry_id"),
  };
}

export function mapOpeningBalanceDraftRow(row: Record<string, unknown>): OpeningBalanceDraftRecord {
  const currency = requireString(row["currency"], "opening_balance_drafts.currency");
  if (currency !== "LKR") {
    throw new RowMappingError("Unsupported currency for opening_balance_drafts.currency.");
  }
  return {
    id: requireString(row["id"], "opening_balance_drafts.id"),
    stallId: requireString(row["stall_id"], "opening_balance_drafts.stall_id"),
    partyKind: requireLedgerPartyKind(row["party_kind"], "opening_balance_drafts.party_kind"),
    partyId: requireString(row["party_id"], "opening_balance_drafts.party_id"),
    direction: requireOpeningDirection(row["direction"], "opening_balance_drafts.direction"),
    amountMinor: requireMoneyMinor(row["amount_minor"], "opening_balance_drafts.amount_minor"),
    signedAmountMinor: optionalMoneyMinor(
      row["signed_amount_minor"],
      "opening_balance_drafts.signed_amount_minor",
    ),
    cutoffDate: requireCalendarDate(row["cutoff_date"], "opening_balance_drafts.cutoff_date"),
    currency: "LKR",
    reference: optionalString(row["reference"], "opening_balance_drafts.reference"),
    explanation: optionalString(row["explanation"], "opening_balance_drafts.explanation"),
    status: requireOpeningDraftStatus(row["status"], "opening_balance_drafts.status"),
    revision: requireInteger(row["revision"], "opening_balance_drafts.revision"),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "opening_balance_drafts.created_at"),
    updatedAt: requireAbsoluteTimestamp(row["updated_at"], "opening_balance_drafts.updated_at"),
    createdByStaffId: optionalString(
      row["created_by_staff_id"],
      "opening_balance_drafts.created_by_staff_id",
    ),
    postedPostingId: optionalString(
      row["posted_posting_id"],
      "opening_balance_drafts.posted_posting_id",
    ),
  };
}
