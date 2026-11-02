/**
 * Hand-maintained cloud database types for phase 11.
 * Type-only consumers may import `@polivo/db-cloud/types` without loading clients.
 * BIGINT money/weight columns are typed as string to preserve exact values in JS.
 */

export type TenantStatus = "active" | "inactive" | "suspended";
export type MembershipStatus = "active" | "inactive" | "suspended";
export type MembershipAccessRole = "reporting_reader";
export type IdentityProvider = "clerk";

export type TenantRow = {
  id: string;
  status: TenantStatus;
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
  created_at: string;
  updated_at: string;
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

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: TenantRow;
        Insert: Partial<TenantRow> & Pick<TenantRow, "id" | "status">;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
