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
  created_at: string;
  updated_at: string;
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

export type SyncReceivedEventRow = {
  tenant_id: string;
  event_id: string;
  stall_id: string;
  event_type: string;
  event_schema_version: string;
  occurred_at: string;
  received_at: string;
  source_revision: number | null;
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
        Insert: Omit<SyncReceivedEventRow, "received_at"> & { received_at?: string };
        Update: Partial<SyncReceivedEventRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_active_reporting_access: {
        Args: { p_tenant_id: string };
        Returns: boolean;
      };
      is_active_tenant_owner: {
        Args: { p_tenant_id: string };
        Returns: boolean;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
