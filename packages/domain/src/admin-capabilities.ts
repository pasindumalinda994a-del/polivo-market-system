/**
 * Administrative action matrix for platform and stall administration (Phase 36 / ADR 0024).
 * These are not operational PERMISSION_CAPABILITIES and cannot be granted via tenant APIs.
 */

export const PLATFORM_ADMIN_ACTIONS = [
  "platform.directory.view",
  "platform.stall.view",
  "platform.audit.view",
  "platform.stall.profile.edit",
] as const;

export const STALL_OWNER_ADMIN_ACTIONS = [
  "stall.profile.edit",
  "stall.members.manage",
  "stall.invitations.manage",
  "stall.permissions.publish",
  "stall.devices.manage",
  "stall.config.delivery.view",
  "stall.audit.view",
  "stall.diagnostics.link",
] as const;

export type PlatformAdminAction = (typeof PLATFORM_ADMIN_ACTIONS)[number];
export type StallOwnerAdminAction = (typeof STALL_OWNER_ADMIN_ACTIONS)[number];

export type AdminActionScope = "platform" | "stall";

export type AdminActionDefinition = {
  action: PlatformAdminAction | StallOwnerAdminAction;
  scope: AdminActionScope;
  /** Who may perform the action under ADR 0024. */
  authority: "platform_administrator" | "stall_owner";
  requiresReason: boolean;
  revisionGuarded: boolean;
  auditAction: string;
};

export const ADMIN_ACTION_MATRIX: readonly AdminActionDefinition[] = [
  {
    action: "platform.directory.view",
    scope: "platform",
    authority: "platform_administrator",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "platform.directory.viewed",
  },
  {
    action: "platform.stall.view",
    scope: "platform",
    authority: "platform_administrator",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "platform.stall.viewed",
  },
  {
    action: "platform.audit.view",
    scope: "platform",
    authority: "platform_administrator",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "platform.audit.viewed",
  },
  {
    action: "platform.stall.profile.edit",
    scope: "platform",
    authority: "platform_administrator",
    requiresReason: false,
    revisionGuarded: true,
    auditAction: "stall_profile.updated",
  },
  {
    action: "stall.profile.edit",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: false,
    revisionGuarded: true,
    auditAction: "stall_profile.updated",
  },
  {
    action: "stall.members.manage",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: true,
    revisionGuarded: false,
    auditAction: "membership.updated",
  },
  {
    action: "stall.invitations.manage",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "invitation.created",
  },
  {
    action: "stall.permissions.publish",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: false,
    revisionGuarded: true,
    auditAction: "permission_profile.updated",
  },
  {
    action: "stall.devices.manage",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: true,
    revisionGuarded: true,
    auditAction: "device.revoked",
  },
  {
    action: "stall.config.delivery.view",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "config.delivery.viewed",
  },
  {
    action: "stall.audit.view",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "stall.audit.viewed",
  },
  {
    action: "stall.diagnostics.link",
    scope: "stall",
    authority: "stall_owner",
    requiresReason: false,
    revisionGuarded: false,
    auditAction: "stall.diagnostics.opened",
  },
] as const;

/** Actions that remain unavailable until a later ADR (lifecycle / ownership transfer). */
export const UNAVAILABLE_ADMIN_ACTIONS = [
  "stall.lifecycle.suspend",
  "stall.lifecycle.archive",
  "stall.lifecycle.reactivate",
  "stall.ownership.transfer",
  "stall.tenant.delete",
  "platform.market.admin.assign",
] as const;

export type UnavailableAdminAction = (typeof UNAVAILABLE_ADMIN_ACTIONS)[number];

export function isUnavailableAdminAction(action: string): action is UnavailableAdminAction {
  return (UNAVAILABLE_ADMIN_ACTIONS as readonly string[]).includes(action);
}
