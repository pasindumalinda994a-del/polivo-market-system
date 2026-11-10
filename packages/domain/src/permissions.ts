/**
 * Configurable operational permission capabilities.
 * Enforcement belongs to the stall service; these are stable identifiers only.
 * Cloud membership administration uses ownership, not these capability grants.
 */
export const PERMISSION_CAPABILITIES = [
  "bills.create",
  "bills.edit_draft",
  "bills.finalize",
  "bills.change_selling_price",
  "bills.change_commission",
  "bills.add_change_deductions",
  "bills.correct_finalized",
  "bills.cancel_finalized",
  "payments.receive_trader",
  "payments.pay_farmer",
  "payments.record_cheque",
  "payments.reverse",
  "reports.view_financial",
  "parties.register_edit",
  "catalog.manage",
  "commission.manage",
  "accounts.view",
  "accounts.opening_prepare",
  "accounts.opening_post",
  "accounts.opening_correct",
  "inventory.manage_arrivals",
  "inventory.adjust",
  "data.export",
  "staff.manage",
  "settings.manage",
  "backups.restore",
] as const;

export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

const CAPABILITY_SET = new Set<string>(PERMISSION_CAPABILITIES);

/** True when every value is a known catalog capability. Unknown values are rejected. */
export function areKnownCapabilities(values: readonly string[]): boolean {
  return values.every((value) => CAPABILITY_SET.has(value));
}

/**
 * Returns unknown capability identifiers.
 * Empty array means the set is valid against the catalog.
 */
export function unknownCapabilities(values: readonly string[]): string[] {
  return values.filter((value) => !CAPABILITY_SET.has(value));
}

/** Deduplicate while preserving first-seen order; rejects unknowns via return null. */
export function normalizeCapabilitySet(values: readonly string[]): PermissionCapability[] | null {
  if (!areKnownCapabilities(values)) {
    return null;
  }
  const seen = new Set<string>();
  const normalized: PermissionCapability[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value as PermissionCapability);
  }
  return normalized;
}

export type CapabilityGroupId =
  | "bills"
  | "payments"
  | "reports"
  | "parties"
  | "catalog"
  | "commission"
  | "accounts"
  | "inventory"
  | "administration";

export type CapabilityGroup = {
  id: CapabilityGroupId;
  label: string;
  capabilities: readonly PermissionCapability[];
};

/** Grouped catalog for owner-facing permission editors. */
export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  {
    id: "bills",
    label: "Bills",
    capabilities: [
      "bills.create",
      "bills.edit_draft",
      "bills.finalize",
      "bills.change_selling_price",
      "bills.change_commission",
      "bills.add_change_deductions",
      "bills.correct_finalized",
      "bills.cancel_finalized",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    capabilities: [
      "payments.receive_trader",
      "payments.pay_farmer",
      "payments.record_cheque",
      "payments.reverse",
    ],
  },
  {
    id: "reports",
    label: "Reports",
    capabilities: ["reports.view_financial"],
  },
  {
    id: "parties",
    label: "Farmers and buyers",
    capabilities: ["parties.register_edit"],
  },
  {
    id: "catalog",
    label: "Vegetables and packages",
    capabilities: ["catalog.manage"],
  },
  {
    id: "commission",
    label: "Commission",
    capabilities: ["commission.manage"],
  },
  {
    id: "accounts",
    label: "Accounts and openings",
    capabilities: [
      "accounts.view",
      "accounts.opening_prepare",
      "accounts.opening_post",
      "accounts.opening_correct",
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    capabilities: ["inventory.manage_arrivals", "inventory.adjust"],
  },
  {
    id: "administration",
    label: "Administration",
    capabilities: ["data.export", "staff.manage", "settings.manage", "backups.restore"],
  },
] as const;

/** Recommended starting profile for billing staff — not auto-approved production policy. */
export const BILLING_STAFF_DEFAULT_CAPABILITIES: readonly PermissionCapability[] = [
  "bills.create",
  "bills.edit_draft",
  "bills.finalize",
  "bills.change_selling_price",
  "parties.register_edit",
  "catalog.manage",
  "commission.manage",
  "accounts.view",
  "accounts.opening_prepare",
  "inventory.manage_arrivals",
];

/** Recommended starting profile for cashiers — not auto-approved production policy. */
export const CASHIER_DEFAULT_CAPABILITIES: readonly PermissionCapability[] = [
  "payments.receive_trader",
  "payments.pay_farmer",
  "payments.record_cheque",
  "reports.view_financial",
  "accounts.view",
];

export function recommendedCapabilitiesForProfile(
  profile: "billing_staff" | "cashier",
): readonly PermissionCapability[] {
  return profile === "billing_staff"
    ? BILLING_STAFF_DEFAULT_CAPABILITIES
    : CASHIER_DEFAULT_CAPABILITIES;
}

/**
 * Effective operational capabilities for local stall enforcement.
 * Cloud owners store an empty capability list by design (ADR 0009); local owners
 * still need the full operational catalog at the host. Non-owners use the snapshot.
 */
export function effectiveLocalCapabilities(input: {
  isLocalOwner: boolean;
  snapshotCapabilities: readonly string[];
}): PermissionCapability[] {
  if (input.isLocalOwner) {
    return [...PERMISSION_CAPABILITIES];
  }
  const normalized = normalizeCapabilitySet(input.snapshotCapabilities);
  return normalized ?? [];
}
