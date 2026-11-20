import type {
  ConfigDeliveryStatus,
  StallAdminProfile,
  TenantDeviceSummary,
} from "@polivo/contracts";

import type { MembershipSummary } from "@/lib/auth/membership-summary";

export const ONBOARDING_MILESTONE_STATUSES = [
  "confirmed_complete",
  "action_required",
  "awaiting_host_confirmation",
  "blocked",
  "unknown",
] as const;

export type OnboardingMilestoneStatus = (typeof ONBOARDING_MILESTONE_STATUSES)[number];

export type OnboardingMilestoneId =
  | "web_authenticated"
  | "stall_membership"
  | "stall_profile"
  | "host_enrollment_authorized"
  | "host_enrollment_completed"
  | "local_owner_setup"
  | "host_connection"
  | "configuration_delivery"
  | "additional_terminals"
  | "cloud_synchronization";

export type OnboardingMilestone = {
  id: OnboardingMilestoneId;
  title: string;
  status: OnboardingMilestoneStatus;
  summary: string;
  evidenceSource: string;
  lastConfirmedAt: string | null;
  nextActionLabel: string | null;
  nextActionHref: string | null;
};

export type OnboardingReadinessInput = {
  membership: MembershipSummary;
  profile: StallAdminProfile | null;
  profileError: string | null;
  devices: TenantDeviceSummary[] | null;
  devicesError: string | null;
  delivery: ConfigDeliveryStatus | null;
  deliveryError: string | null;
  /** ISO timestamp when this overview was derived. */
  observedAt: string;
};

export type OnboardingReadiness = {
  observedAt: string;
  milestones: OnboardingMilestone[];
  nextPermittedAction: {
    label: string;
    href: string;
  } | null;
};

function hostDevices(devices: TenantDeviceSummary[]): TenantDeviceSummary[] {
  return devices.filter((device) => device.role === "host");
}

function terminalDevices(devices: TenantDeviceSummary[]): TenantDeviceSummary[] {
  return devices.filter((device) => device.role === "terminal");
}

function isActiveEnrollment(state: TenantDeviceSummary["enrollmentState"]): boolean {
  return (
    state === "reserved" ||
    state === "redeemed" ||
    state === "waiting_host_confirm" ||
    state === "activated"
  );
}

/**
 * Derive onboarding milestones from authoritative cloud records.
 * Never invents positive host-online or local-owner-complete status.
 */
export function deriveOnboardingReadiness(input: OnboardingReadinessInput): OnboardingReadiness {
  const { membership, observedAt } = input;
  const tenantId = membership.tenantId;
  const isOwner = membership.accessRole === "owner";
  const devicesHref = `/tenants/${encodeURIComponent(tenantId)}/devices`;
  const profileHref = `/tenants/${encodeURIComponent(tenantId)}/profile`;
  const setupHref = `/tenants/${encodeURIComponent(tenantId)}/setup`;
  const reportsHref = `/tenants/${encodeURIComponent(tenantId)}`;

  const milestones: OnboardingMilestone[] = [];

  milestones.push({
    id: "web_authenticated",
    title: "Web account authenticated",
    status: "confirmed_complete",
    summary: "Signed in with an online Polivo account.",
    evidenceSource: "Clerk session",
    lastConfirmedAt: observedAt,
    nextActionLabel: null,
    nextActionHref: null,
  });

  const tenantBlocked =
    membership.tenantStatus === "suspended" || membership.tenantStatus === "inactive";

  milestones.push({
    id: "stall_membership",
    title: "Stall created, selected, or joined",
    status: tenantBlocked ? "blocked" : "confirmed_complete",
    summary: tenantBlocked
      ? `Membership exists, but stall status is ${membership.tenantStatus}.`
      : `Active ${membership.accessRole.replaceAll("_", " ")} membership for this stall.`,
    evidenceSource: "tenant_memberships",
    lastConfirmedAt: observedAt,
    nextActionLabel: tenantBlocked ? "Contact support" : null,
    nextActionHref: tenantBlocked ? "/support" : null,
  });

  if (input.profileError) {
    milestones.push({
      id: "stall_profile",
      title: "Stall profile",
      status: "unknown",
      summary: `Profile could not be loaded: ${input.profileError}`,
      evidenceSource: "get_stall_admin_profile",
      lastConfirmedAt: null,
      nextActionLabel: isOwner ? "Open profile" : null,
      nextActionHref: isOwner ? profileHref : null,
    });
  } else if (!input.profile) {
    milestones.push({
      id: "stall_profile",
      title: "Stall profile",
      status: isOwner ? "action_required" : "unknown",
      summary: isOwner
        ? "Stall profile has not been loaded for this overview."
        : "Profile details are managed by the stall owner.",
      evidenceSource: "get_stall_admin_profile",
      lastConfirmedAt: null,
      nextActionLabel: isOwner ? "Complete profile" : null,
      nextActionHref: isOwner ? profileHref : null,
    });
  } else {
    const profile = input.profile;
    const missingOptional = !profile.marketLocation?.trim() || !profile.contact?.trim();
    milestones.push({
      id: "stall_profile",
      title: "Stall profile",
      status: missingOptional && isOwner ? "action_required" : "confirmed_complete",
      summary:
        missingOptional && isOwner
          ? "Display name and timezone are set. Add market location and contact when ready."
          : `Profile revision ${profile.profileRevision} · ${profile.displayName}`,
      evidenceSource: "tenants profile fields",
      lastConfirmedAt: profile.updatedAt,
      nextActionLabel: missingOptional && isOwner ? "Edit profile" : null,
      nextActionHref: missingOptional && isOwner ? profileHref : null,
    });
  }

  if (input.devicesError || input.devices === null) {
    milestones.push(
      {
        id: "host_enrollment_authorized",
        title: "Host enrollment authorized",
        status: "unknown",
        summary: input.devicesError
          ? `Device list unavailable: ${input.devicesError}`
          : "No trusted device list for this overview.",
        evidenceSource: "list_tenant_devices",
        lastConfirmedAt: null,
        nextActionLabel: isOwner ? "Open devices" : null,
        nextActionHref: isOwner ? devicesHref : null,
      },
      {
        id: "host_enrollment_completed",
        title: "Host enrollment completed",
        status: "unknown",
        summary: "Cannot confirm host activation without a trusted device list.",
        evidenceSource: "list_tenant_devices",
        lastConfirmedAt: null,
        nextActionLabel: isOwner ? "Open devices" : null,
        nextActionHref: isOwner ? devicesHref : null,
      },
    );
  } else {
    const hosts = hostDevices(input.devices);
    const activatedHost = hosts.find((device) => device.enrollmentState === "activated");
    const pendingHost = hosts.find(
      (device) =>
        device.enrollmentState === "reserved" ||
        device.enrollmentState === "redeemed" ||
        device.enrollmentState === "waiting_host_confirm",
    );
    const anyActiveHost = hosts.some((device) => isActiveEnrollment(device.enrollmentState));

    if (activatedHost) {
      milestones.push({
        id: "host_enrollment_authorized",
        title: "Host enrollment authorized",
        status: "confirmed_complete",
        summary: "An authoritative host device record exists.",
        evidenceSource: "tenant_devices (host)",
        lastConfirmedAt: activatedHost.updatedAt,
        nextActionLabel: null,
        nextActionHref: null,
      });
      milestones.push({
        id: "host_enrollment_completed",
        title: "Host enrollment completed",
        status: "confirmed_complete",
        summary: `Host activated${activatedHost.label ? ` (${activatedHost.label})` : ""}. Enrollment yesterday does not prove the host is online now.`,
        evidenceSource: "tenant_devices.enrollment_state=activated",
        lastConfirmedAt: activatedHost.activatedAt ?? activatedHost.updatedAt,
        nextActionLabel: null,
        nextActionHref: null,
      });
    } else if (pendingHost) {
      milestones.push({
        id: "host_enrollment_authorized",
        title: "Host enrollment authorized",
        status: "awaiting_host_confirmation",
        summary: `Host grant is ${pendingHost.enrollmentState.replaceAll("_", " ")}. Redeem and confirm on the host computer.`,
        evidenceSource: "tenant_devices (host)",
        lastConfirmedAt: pendingHost.updatedAt,
        nextActionLabel: isOwner ? "View devices" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
      milestones.push({
        id: "host_enrollment_completed",
        title: "Host enrollment completed",
        status: "awaiting_host_confirmation",
        summary: "Waiting for the host to redeem and confirm enrollment.",
        evidenceSource: "tenant_devices (host)",
        lastConfirmedAt: pendingHost.updatedAt,
        nextActionLabel: isOwner ? "View devices" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
    } else if (!anyActiveHost) {
      milestones.push({
        id: "host_enrollment_authorized",
        title: "Host enrollment authorized",
        status: isOwner ? "action_required" : "unknown",
        summary: isOwner
          ? "No host enrollment has been authorized yet."
          : "Host enrollment is managed by the stall owner.",
        evidenceSource: "tenant_devices (host)",
        lastConfirmedAt: observedAt,
        nextActionLabel: isOwner ? "Authorize host" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
      milestones.push({
        id: "host_enrollment_completed",
        title: "Host enrollment completed",
        status: isOwner ? "action_required" : "unknown",
        summary: "No activated host is recorded for this stall.",
        evidenceSource: "tenant_devices (host)",
        lastConfirmedAt: observedAt,
        nextActionLabel: isOwner ? "Authorize host" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
    }
  }

  const activatedHostForLater =
    input.devices?.find(
      (device) => device.role === "host" && device.enrollmentState === "activated",
    ) ?? null;

  milestones.push({
    id: "local_owner_setup",
    title: "First local owner setup",
    status: activatedHostForLater ? "unknown" : isOwner ? "action_required" : "unknown",
    summary: activatedHostForLater
      ? "Cloud records do not prove local owner setup. Issue a setup grant here, redeem it on the host, then verify by signing in locally."
      : "Authorize and activate the host before issuing a local owner setup grant.",
    evidenceSource: "local host evidence (not projected to cloud for owners)",
    lastConfirmedAt: null,
    nextActionLabel:
      isOwner && activatedHostForLater ? "Issue setup grant" : isOwner ? "Authorize host" : null,
    nextActionHref: isOwner && activatedHostForLater ? setupHref : isOwner ? devicesHref : null,
  });

  milestones.push({
    id: "host_connection",
    title: "Host connection verified",
    status: "unknown",
    summary:
      "This website does not probe private LAN addresses. Verify host reachability and trust pins in the desktop application.",
    evidenceSource: "desktop connection identity (local)",
    lastConfirmedAt: null,
    nextActionLabel: "Open setup guide",
    nextActionHref: "/setup",
  });

  if (input.deliveryError || !input.delivery) {
    milestones.push({
      id: "configuration_delivery",
      title: "Initial configuration applied",
      status: "unknown",
      summary: input.deliveryError
        ? `Configuration delivery status unavailable: ${input.deliveryError}`
        : "No trusted configuration delivery confirmation yet.",
      evidenceSource: "get_access_config_delivery_status",
      lastConfirmedAt: null,
      nextActionLabel: isOwner ? "Open permissions" : null,
      nextActionHref: isOwner ? `/tenants/${encodeURIComponent(tenantId)}/permissions` : null,
    });
  } else {
    const delivery = input.delivery;
    const localStatus = delivery.localApplicationStatus;
    let status: OnboardingMilestoneStatus = "awaiting_host_confirmation";
    if (localStatus === "applied") {
      status = "confirmed_complete";
    } else if (localStatus === "failed" || localStatus === "blocked") {
      status = "blocked";
    } else if (localStatus === "pending_delivery") {
      status = activatedHostForLater ? "awaiting_host_confirmation" : "action_required";
    }
    milestones.push({
      id: "configuration_delivery",
      title: "Initial configuration applied",
      status,
      summary: `Published revision ${delivery.publishedRevision ?? "none"} · local application ${localStatus.replaceAll("_", " ")}.`,
      evidenceSource: "access config delivery status",
      lastConfirmedAt: delivery.lastAcknowledgementAt,
      nextActionLabel: isOwner ? "View permissions delivery" : null,
      nextActionHref: isOwner ? `/tenants/${encodeURIComponent(tenantId)}/permissions` : null,
    });
  }

  if (input.devices) {
    const terminals = terminalDevices(input.devices);
    const activatedTerminals = terminals.filter((device) => device.enrollmentState === "activated");
    if (!activatedHostForLater) {
      milestones.push({
        id: "additional_terminals",
        title: "Additional terminals",
        status: "action_required",
        summary: "Activate the stall host before authorizing terminals.",
        evidenceSource: "tenant_devices",
        lastConfirmedAt: observedAt,
        nextActionLabel: isOwner ? "Authorize host" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
    } else if (activatedTerminals.length > 0) {
      milestones.push({
        id: "additional_terminals",
        title: "Additional terminals",
        status: "confirmed_complete",
        summary: `${activatedTerminals.length} activated terminal(s) recorded. Optional — more terminals can still be added.`,
        evidenceSource: "tenant_devices (terminal)",
        lastConfirmedAt: activatedTerminals[0]?.activatedAt ?? observedAt,
        nextActionLabel: isOwner ? "Authorize another terminal" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
    } else {
      milestones.push({
        id: "additional_terminals",
        title: "Additional terminals",
        status: "action_required",
        summary:
          "Host is enrolled. Additional terminals are optional; authorize them from Devices when needed.",
        evidenceSource: "tenant_devices (terminal)",
        lastConfirmedAt: observedAt,
        nextActionLabel: isOwner ? "Authorize terminal" : null,
        nextActionHref: isOwner ? devicesHref : null,
      });
    }
  } else {
    milestones.push({
      id: "additional_terminals",
      title: "Additional terminals",
      status: "unknown",
      summary: "Terminal status unknown without a trusted device list.",
      evidenceSource: "list_tenant_devices",
      lastConfirmedAt: null,
      nextActionLabel: null,
      nextActionHref: null,
    });
  }

  milestones.push({
    id: "cloud_synchronization",
    title: "Cloud synchronization",
    status: "unknown",
    summary:
      "Cloud receipt of setup or financial events does not prove every terminal is connected. Check sync status on the host or reporting freshness after data exists.",
    evidenceSource: "sync receipts / reporting freshness (when available)",
    lastConfirmedAt: null,
    nextActionLabel: "Open stall reports",
    nextActionHref: reportsHref,
  });

  const actionable = milestones.find(
    (milestone) =>
      (milestone.status === "action_required" ||
        milestone.status === "awaiting_host_confirmation" ||
        milestone.status === "blocked") &&
      milestone.nextActionHref &&
      milestone.nextActionLabel,
  );

  return {
    observedAt,
    milestones,
    nextPermittedAction: actionable
      ? { label: actionable.nextActionLabel!, href: actionable.nextActionHref! }
      : isOwner
        ? { label: "Open setup overview", href: setupHref }
        : { label: "Open stall", href: reportsHref },
  };
}

export function milestoneStatusLabel(status: OnboardingMilestoneStatus): string {
  switch (status) {
    case "confirmed_complete":
      return "Confirmed complete";
    case "action_required":
      return "Action required";
    case "awaiting_host_confirmation":
      return "Awaiting host confirmation";
    case "blocked":
      return "Blocked";
    case "unknown":
      return "Unknown";
  }
}
