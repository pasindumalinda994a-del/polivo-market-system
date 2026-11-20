/**
 * Hand-maintained cloud database types for phases 11–13.
 * Type-only consumers may import `@polivo/db-cloud/types` without loading clients.
 * BIGINT money/weight columns are typed as string to preserve exact values in JS.
 */

export type TenantStatus = "active" | "inactive" | "suspended";
export type MembershipStatus = "active" | "inactive" | "suspended";
export type MembershipAccessRole = "owner" | "billing_staff" | "cashier";
export type OperationalProfileRole = "billing_staff" | "cashier";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type IdentityProvider = "clerk";

export type TenantRow = {
  id: string;
  status: TenantStatus;
  display_name: string;
  market_location: string | null;
  contact: string | null;
  timezone: string;
  profile_revision: number;
  created_at: string;
  updated_at: string;
};

export type PlatformAdministratorStatus = "active" | "inactive";

export type PlatformAdministratorRow = {
  identity_provider: IdentityProvider;
  external_subject: string;
  status: PlatformAdministratorStatus;
  created_at: string;
  created_by_subject: string | null;
  updated_at: string;
  notes: string | null;
};

export type TenantAdminNotesRow = {
  tenant_id: string;
  notes: string;
  updated_at: string;
  updated_by_subject: string;
};

export type TenantMembershipRow = {
  id: string;
  tenant_id: string;
  identity_provider: IdentityProvider;
  external_subject: string;
  status: MembershipStatus;
  access_role: MembershipAccessRole;
  capabilities: string[];
  /** Monotonic revision bumped when membership access/capabilities change (ADR 0013). */
  capabilities_revision: number;
  created_at: string;
  updated_at: string;
};

export type TenantPermissionProfileRow = {
  tenant_id: string;
  profile_role: OperationalProfileRole;
  capabilities: string[];
  revision: number;
  updated_at: string;
  updated_by_subject: string;
};

export type TenantInvitationRow = {
  id: string;
  tenant_id: string;
  email_normalized: string;
  access_role: OperationalProfileRole;
  capabilities: string[];
  token_hash: string;
  status: InvitationStatus;
  expires_at: string;
  created_by_subject: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by_subject: string | null;
  revoked_at: string | null;
};

export type TenantOnboardingRequestRow = {
  idempotency_key: string;
  actor_subject: string;
  request_payload_hash: string;
  tenant_id: string;
  created_at: string;
};

export type AdminAuditEventRow = {
  id: string;
  tenant_id: string;
  actor_subject: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  configuration_revision: number | null;
  created_at: string;
};

export type DeviceRole = "host" | "terminal";
export type DeviceEnrollmentState =
  "reserved" | "redeemed" | "activated" | "revoked" | "waiting_host_confirm";
export type DeviceEnrollmentGrantStatus = "issued" | "consumed" | "cancelled" | "expired";
export type DeploymentEnvironment = "development" | "staging" | "production";

export type TenantDeviceRow = {
  id: string;
  tenant_id: string;
  device_id: string;
  role: DeviceRole;
  installation_id: string;
  public_key: string;
  credential_version: number;
  label: string | null;
  enrollment_state: DeviceEnrollmentState;
  intended_host_device_id: string | null;
  deployment_environment: DeploymentEnvironment;
  state_revision: number;
  authorized_by_subject: string;
  created_at: string;
  updated_at: string;
  redeemed_at: string | null;
  activated_at: string | null;
  revoked_at: string | null;
};

export type DeviceEnrollmentGrantRow = {
  id: string;
  tenant_id: string;
  device_role: DeviceRole;
  intended_host_device_id: string | null;
  reserved_device_id: string;
  secret_digest: string;
  deployment_environment: DeploymentEnvironment;
  status: DeviceEnrollmentGrantStatus;
  expires_at: string;
  max_attempts: number;
  attempt_count: number;
  authorizing_owner_subject: string;
  created_at: string;
  consumed_at: string | null;
  cancelled_at: string | null;
  consumed_by_installation_id: string | null;
  consumed_device_row_id: string | null;
};

export type FarmerRow = {
  tenant_id: string;
  id: string;
  stall_id: string;
  short_code: string;
  display_name: string;
  is_active: boolean;
  revision: number;
  contact_number: string | null;
  locality: string | null;
  created_at: string;
  updated_at: string;
};

export type TraderRow = {
  tenant_id: string;
  id: string;
  stall_id: string;
  short_code: string;
  display_name: string;
  is_active: boolean;
  revision: number;
  contact_number: string | null;
  locality: string | null;
  created_at: string;
  updated_at: string;
};

export type VegetableRow = {
  tenant_id: string;
  id: string;
  stall_id: string;
  short_code: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  tenant_id: string;
  id: string;
  stall_id: string;
  party_kind: "farmer" | "trader";
  farmer_id: string | null;
  trader_id: string | null;
  method: "cash" | "bank_transfer" | "cheque";
  /** BIGINT paisa as string transport. */
  amount_minor: string;
  paid_at: string;
  created_at: string;
};

export type ReportExportJobRow = {
  tenant_id: string;
  id: string;
  stall_id: string;
  report_type: string;
  format: "csv" | "pdf";
  status: "preparing" | "ready" | "failed" | "expired";
  definition_version: string;
  snapshot_token: string;
  filter_fingerprint: string;
  normalized_filters_json: Record<string, unknown>;
  row_count: number | null;
  content_sha256: string | null;
  content_bytes: string | Uint8Array | null;
  content_type: string | null;
  byte_length: number | null;
  default_file_name: string;
  failure_code: string | null;
  failure_message: string | null;
  created_by_subject: string;
  create_operation_id: string;
  created_at: string;
  expires_at: string;
  ready_at: string | null;
};

export type SyncReceivedEventRow = {
  tenant_id: string;
  event_id: string;
  stall_id: string;
  event_type: string;
  event_schema_version: string;
  occurred_at: string;
  received_at: string;
  source_revision: number | null;
  source_stream_id: string | null;
  stream_generation: number | null;
  local_sequence: number | null;
  transaction_group_id: string | null;
  payload_hash: string | null;
  applied_status: string;
  device_id: string | null;
  applied_at: string | null;
  diagnostics_json: string | null;
};

export type SyncSourceStreamRow = {
  tenant_id: string;
  source_stream_id: string;
  stall_id: string;
  device_id: string;
  installation_id: string;
  stream_generation: number;
  committed_cursor: number;
  compatibility_protocol_version: string;
  created_at: string;
  updated_at: string;
};

export type PackageTypeRow = {
  tenant_id: string;
  id: string;
  stall_id: string;
  short_code: string;
  display_name: string;
  is_active: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
};

/** Capability seeds for create_stall RPC — JSON arrays (PostgREST-friendly json params). */
export type CreateStallCapabilityJson = string[] | readonly string[];

export type CreateStallWithOwnerArgs = {
  p_idempotency_key: string;
  p_request_payload_hash: string;
  p_display_name: string;
  p_timezone: string;
  p_market_location?: string | null;
  p_contact?: string | null;
  p_billing_staff_capabilities?: CreateStallCapabilityJson;
  p_cashier_capabilities?: CreateStallCapabilityJson;
};

export type CreateStallWithOwnerResult = {
  tenant_id: string;
  membership_id: string;
  replayed: boolean;
};

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: TenantRow;
        Insert: Partial<TenantRow> & Pick<TenantRow, "id" | "status" | "display_name" | "timezone">;
        Update: Partial<TenantRow>;
        Relationships: [];
      };
      tenant_memberships: {
        Row: TenantMembershipRow;
        Insert: Partial<TenantMembershipRow> &
          Pick<
            TenantMembershipRow,
            "id" | "tenant_id" | "identity_provider" | "external_subject" | "status" | "access_role"
          >;
        Update: Partial<TenantMembershipRow>;
        Relationships: [];
      };
      tenant_permission_profiles: {
        Row: TenantPermissionProfileRow;
        Insert: TenantPermissionProfileRow;
        Update: Partial<TenantPermissionProfileRow>;
        Relationships: [];
      };
      tenant_invitations: {
        Row: TenantInvitationRow;
        Insert: Omit<
          TenantInvitationRow,
          "created_at" | "accepted_at" | "accepted_by_subject" | "revoked_at"
        > & {
          created_at?: string;
          accepted_at?: string | null;
          accepted_by_subject?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<TenantInvitationRow>;
        Relationships: [];
      };
      tenant_onboarding_requests: {
        Row: TenantOnboardingRequestRow;
        Insert: TenantOnboardingRequestRow;
        Update: Partial<TenantOnboardingRequestRow>;
        Relationships: [];
      };
      admin_audit_events: {
        Row: AdminAuditEventRow;
        Insert: Omit<AdminAuditEventRow, "created_at"> & { created_at?: string };
        Update: Partial<AdminAuditEventRow>;
        Relationships: [];
      };
      platform_administrators: {
        Row: PlatformAdministratorRow;
        Insert: Omit<PlatformAdministratorRow, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PlatformAdministratorRow>;
        Relationships: [];
      };
      tenant_admin_notes: {
        Row: TenantAdminNotesRow;
        Insert: Omit<TenantAdminNotesRow, "updated_at"> & { updated_at?: string };
        Update: Partial<TenantAdminNotesRow>;
        Relationships: [];
      };
      tenant_devices: {
        Row: TenantDeviceRow;
        Insert: Omit<
          TenantDeviceRow,
          | "created_at"
          | "updated_at"
          | "redeemed_at"
          | "activated_at"
          | "revoked_at"
          | "state_revision"
        > & {
          created_at?: string;
          updated_at?: string;
          redeemed_at?: string | null;
          activated_at?: string | null;
          revoked_at?: string | null;
          state_revision?: number;
        };
        Update: Partial<TenantDeviceRow>;
        Relationships: [];
      };
      device_enrollment_grants: {
        Row: DeviceEnrollmentGrantRow;
        Insert: Omit<
          DeviceEnrollmentGrantRow,
          | "created_at"
          | "consumed_at"
          | "cancelled_at"
          | "consumed_by_installation_id"
          | "consumed_device_row_id"
          | "attempt_count"
          | "max_attempts"
        > & {
          created_at?: string;
          consumed_at?: string | null;
          cancelled_at?: string | null;
          consumed_by_installation_id?: string | null;
          consumed_device_row_id?: string | null;
          attempt_count?: number;
          max_attempts?: number;
        };
        Update: Partial<DeviceEnrollmentGrantRow>;
        Relationships: [];
      };
      farmers: {
        Row: FarmerRow;
        Insert: FarmerRow;
        Update: Partial<FarmerRow>;
        Relationships: [];
      };
      traders: {
        Row: TraderRow;
        Insert: TraderRow;
        Update: Partial<TraderRow>;
        Relationships: [];
      };
      vegetables: {
        Row: VegetableRow;
        Insert: VegetableRow;
        Update: Partial<VegetableRow>;
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: Omit<PaymentRow, "amount_minor"> & { amount_minor: string | number };
        Update: Partial<PaymentRow>;
        Relationships: [];
      };
      sync_received_events: {
        Row: SyncReceivedEventRow;
        Insert: Omit<SyncReceivedEventRow, "received_at" | "applied_status"> & {
          received_at?: string;
          applied_status?: string;
        };
        Update: Partial<SyncReceivedEventRow>;
        Relationships: [];
      };
      sync_source_streams: {
        Row: SyncSourceStreamRow;
        Insert: SyncSourceStreamRow;
        Update: Partial<SyncSourceStreamRow>;
        Relationships: [];
      };
      package_types: {
        Row: PackageTypeRow;
        Insert: PackageTypeRow;
        Update: Partial<PackageTypeRow>;
        Relationships: [];
      };
      report_export_jobs: {
        Row: ReportExportJobRow;
        Insert: ReportExportJobRow;
        Update: Partial<ReportExportJobRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_sync_ingest_rate_limit: {
        Args: {
          p_bucket_key: string;
          p_window_seconds: number;
          p_max_requests: number;
        };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
          request_count: number;
        }[];
      };
      apply_sync_ingestion_group: {
        Args: {
          p_tenant_id: string;
          p_stall_id: string;
          p_device_id: string;
          p_installation_id: string;
          p_credential_version: number;
          p_source_stream_id: string;
          p_stream_generation: number;
          p_transaction_group_id: string;
          p_events: unknown;
          p_event_hashes: unknown;
        };
        Returns: Record<string, unknown>;
      };
      has_active_reporting_access: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      is_active_tenant_owner: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      is_platform_administrator: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_platform_admin_status: {
        Args: Record<string, never>;
        Returns: { is_platform_admin: boolean }[];
      };
      get_stall_admin_profile: {
        Args: { p_tenant_id: string };
        Returns: {
          tenant_id: string;
          status: TenantStatus;
          display_name: string;
          market_location: string | null;
          contact: string | null;
          timezone: string;
          profile_revision: number;
          admin_notes: string;
          updated_at: string;
        }[];
      };
      update_stall_profile: {
        Args: {
          p_tenant_id: string;
          p_expected_revision: number;
          p_display_name: string;
          p_timezone: string;
          p_market_location?: string | null;
          p_contact?: string | null;
          p_admin_notes?: string | null;
        };
        Returns: { profile_revision: number }[];
      };
      list_platform_stall_directory: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_search?: string | null;
          p_status?: TenantStatus | null;
          p_tenant_id?: string | null;
        };
        Returns: {
          tenant_id: string;
          display_name: string;
          market_location: string | null;
          contact: string | null;
          timezone: string;
          status: TenantStatus;
          owner_subject: string | null;
          enrollment_status: string;
          last_host_contact_at: string | null;
          last_upload_applied_at: string | null;
          config_published_revision: number | null;
          config_acknowledged_revision: number | null;
          config_delivery_status: string;
          blocker_no_enrolled_host: boolean;
          blocker_host_contact_stale: boolean;
          blocker_upload_blocked: boolean;
          blocker_config_pending: boolean;
          blocker_reconciliation_issue: boolean;
          total_count: number;
        }[];
      };
      get_platform_stall_detail: {
        Args: { p_tenant_id: string };
        Returns: {
          tenant_id: string;
          display_name: string;
          market_location: string | null;
          contact: string | null;
          timezone: string;
          status: TenantStatus;
          profile_revision: number;
          admin_notes: string;
          owner_subject: string | null;
          enrollment_status: string;
          last_host_contact_at: string | null;
          last_upload_applied_at: string | null;
          config_published_revision: number | null;
          config_acknowledged_revision: number | null;
          config_delivery_status: string;
          blocker_no_enrolled_host: boolean;
          blocker_host_contact_stale: boolean;
          blocker_upload_blocked: boolean;
          blocker_config_pending: boolean;
          blocker_reconciliation_issue: boolean;
          updated_at: string;
        }[];
      };
      create_stall_with_owner: {
        Args: CreateStallWithOwnerArgs;
        Returns: CreateStallWithOwnerResult[];
      };
      create_tenant_invitation: {
        Args: {
          p_tenant_id: string;
          p_email: string;
          p_access_role: OperationalProfileRole;
          p_capabilities: string[];
          p_token_hash: string;
          p_expires_at?: string | null;
        };
        Returns: { invitation_id: string; expires_at: string }[];
      };
      revoke_tenant_invitation: {
        Args: { p_tenant_id: string; p_invitation_id: string };
        Returns: undefined;
      };
      accept_tenant_invitation: {
        Args: { p_token_hash: string };
        Returns: { tenant_id: string; membership_id: string; access_role: string }[];
      };
      update_membership_access: {
        Args: {
          p_tenant_id: string;
          p_membership_id: string;
          p_status?: MembershipStatus | null;
          p_access_role?: MembershipAccessRole | null;
          p_capabilities?: string[] | null;
        };
        Returns: undefined;
      };
      update_permission_profile: {
        Args: {
          p_tenant_id: string;
          p_profile_role: OperationalProfileRole;
          p_capabilities: string[];
          p_expected_revision: number;
        };
        Returns: { revision: number }[];
      };
      authorize_local_staff_setup_grant: {
        Args: {
          p_tenant_id: string;
          p_secret_digest: string;
          p_ttl_seconds?: number;
        };
        Returns: { grant_id: string; expires_at: string }[];
      };
      redeem_local_staff_setup_grant: {
        Args: {
          p_secret_digest: string;
          p_tenant_id: string;
        };
        Returns: {
          grant_id: string;
          tenant_id: string;
          cloud_membership_id: string;
          owner_display_name: string;
          capabilities: string[];
          source_revision: number;
        }[];
      };
      authorize_local_staff_permission_refresh: {
        Args: {
          p_tenant_id: string;
          p_target_membership_id: string;
          p_secret_digest: string;
          p_ttl_seconds?: number;
        };
        Returns: { grant_id: string; expires_at: string }[];
      };
      redeem_local_staff_permission_refresh: {
        Args: {
          p_secret_digest: string;
          p_tenant_id: string;
          p_expected_membership_id?: string | null;
        };
        Returns: {
          grant_id: string;
          tenant_id: string;
          cloud_membership_id: string;
          capabilities: string[];
          source_revision: number;
        }[];
      };
      authorize_host_enrollment: {
        Args: {
          p_tenant_id: string;
          p_secret_digest: string;
          p_deployment_environment: DeploymentEnvironment;
          p_label?: string | null;
          p_ttl_seconds?: number;
        };
        Returns: { grant_id: string; reserved_device_id: string; expires_at: string }[];
      };
      authorize_terminal_enrollment: {
        Args: {
          p_tenant_id: string;
          p_host_device_id: string;
          p_secret_digest: string;
          p_deployment_environment: DeploymentEnvironment;
          p_label?: string | null;
          p_ttl_seconds?: number;
        };
        Returns: { grant_id: string; reserved_device_id: string; expires_at: string }[];
      };
      list_tenant_devices: {
        Args: { p_tenant_id: string };
        Returns: {
          device_id: string;
          role: DeviceRole;
          label: string | null;
          enrollment_state: DeviceEnrollmentState;
          intended_host_device_id: string | null;
          deployment_environment: DeploymentEnvironment;
          state_revision: number;
          created_at: string;
          updated_at: string;
          redeemed_at: string | null;
          activated_at: string | null;
          revoked_at: string | null;
        }[];
      };
      cancel_device_enrollment_grant: {
        Args: { p_tenant_id: string; p_grant_id: string };
        Returns: undefined;
      };
      revoke_tenant_device: {
        Args: { p_tenant_id: string; p_device_id: string };
        Returns: { state_revision: number }[];
      };
      redeem_device_enrollment_grant: {
        Args: {
          p_secret_digest: string;
          p_installation_id: string;
          p_public_key: string;
          p_deployment_environment: DeploymentEnvironment;
          p_expected_role: DeviceRole;
          p_possession_message: string;
          p_possession_signature: string;
        };
        Returns: {
          tenant_id: string | null;
          device_id: string | null;
          role: DeviceRole | null;
          intended_host_device_id: string | null;
          label: string | null;
          credential_version: number | null;
          state_revision: number | null;
          enrollment_state: DeviceEnrollmentState | null;
          stall_display_name: string | null;
          /** Null on success; token such as GRANT_EXPIRED when side effects were persisted. */
          error_code: string | null;
        }[];
      };
      confirm_device_enrollment: {
        Args: {
          p_tenant_id: string;
          p_device_id: string;
          p_installation_id: string;
          p_public_key: string;
          p_credential_version: number;
          p_possession_message: string;
          p_possession_signature: string;
        };
        Returns: { enrollment_state: DeviceEnrollmentState; state_revision: number }[];
      };
      rotate_device_credential: {
        Args: {
          p_tenant_id: string;
          p_device_id: string;
          p_installation_id: string;
          p_previous_public_key: string;
          p_previous_credential_version: number;
          p_new_public_key: string;
          p_new_credential_version: number;
          p_possession_message: string;
          p_possession_signature: string;
        };
        Returns: { credential_version: number; state_revision: number }[];
      };
      capture_reporting_watermarks: {
        Args: { p_tenant_id: string; p_stall_id: string };
        Returns: {
          max_posting_sequence: number;
          max_allocation_created_at: string;
          max_allocation_id: string;
          max_payment_recorded_at: string;
          max_payment_id: string;
          committed_cloud_cursor: number;
        }[];
      };
      get_stall_reporting_freshness: {
        Args: { p_tenant_id: string };
        Returns: {
          last_host_contact_at: string | null;
          last_applied_upload_group_id: string | null;
          last_applied_upload_at: string | null;
          committed_cloud_cursor: number;
          committed_cloud_cursor_observed_at: string | null;
          applied_max_posting_sequence: number;
          has_any_applied_data: boolean;
        }[];
      };
      list_report_sale_lines: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      list_report_payments: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      list_report_corrections: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      sum_account_balance_at_watermark: {
        Args: Record<string, unknown>;
        Returns: number;
      };
      list_unapplied_payments_at_watermark: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      list_eligible_trader_bill_obligations: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      list_eligible_farmer_sale_line_obligations: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      list_statement_movements_page: {
        Args: Record<string, unknown>;
        Returns: Record<string, unknown>[];
      };
      sum_statement_opening_balance: {
        Args: Record<string, unknown>;
        Returns: number;
      };
      sum_balance_before_statement_page: {
        Args: Record<string, unknown>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
