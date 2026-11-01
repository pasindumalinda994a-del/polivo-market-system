/**
 * Configurable operational permission capabilities.
 * Enforcement belongs to the stall service; these are stable identifiers only.
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
  "inventory.manage_arrivals",
  "inventory.adjust",
  "data.export",
  "staff.manage",
  "settings.manage",
  "backups.restore",
] as const;

export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

export const BILLING_STAFF_DEFAULT_CAPABILITIES: readonly PermissionCapability[] = [
  "bills.create",
  "bills.edit_draft",
  "bills.finalize",
  "bills.change_selling_price",
  "parties.register_edit",
  "inventory.manage_arrivals",
];

export const CASHIER_DEFAULT_CAPABILITIES: readonly PermissionCapability[] = [
  "payments.receive_trader",
  "payments.pay_farmer",
  "payments.record_cheque",
  "reports.view_financial",
];
