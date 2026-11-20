import { describe, expect, it } from "vitest";

import type {
  ConfigDeliveryStatus,
  StallAdminProfile,
  TenantDeviceSummary,
} from "@polivo/contracts";

import type { MembershipSummary } from "@/lib/auth/membership-summary";

import { deriveOnboardingReadiness } from "./readiness";

const membership: MembershipSummary = {
  membershipId: "m1",
  tenantId: "tenant-1",
  accessRole: "owner",
  membershipStatus: "active",
  tenantStatus: "active",
  displayName: "Central Stall",
  timezone: "Asia/Colombo",
  capabilities: [],
};

const profile: StallAdminProfile = {
  tenantId: "tenant-1",
  status: "active",
  displayName: "Central Stall",
  marketLocation: "Pettah",
  contact: "owner@example.com",
  timezone: "Asia/Colombo",
  profileRevision: 2,
  adminNotes: "",
  updatedAt: "2026-11-20T10:00:00.000Z",
};

const activatedHost: TenantDeviceSummary = {
  deviceId: "host-1",
  role: "host",
  label: "Office PC",
  enrollmentState: "activated",
  intendedHostDeviceId: null,
  deploymentEnvironment: "development",
  stateRevision: 1,
  createdAt: "2026-11-19T10:00:00.000Z",
  updatedAt: "2026-11-19T11:00:00.000Z",
  redeemedAt: "2026-11-19T10:30:00.000Z",
  activatedAt: "2026-11-19T11:00:00.000Z",
  revokedAt: null,
};

const deliveryApplied: ConfigDeliveryStatus = {
  domain: "access",
  publishedRevision: 3,
  lastAcknowledgedRevision: 3,
  localApplicationStatus: "applied",
  lastAcknowledgementAt: "2026-11-20T09:00:00.000Z",
  lastHostDeviceId: "host-1",
  failureCode: null,
  failureMessage: null,
};

describe("deriveOnboardingReadiness", () => {
  it("requires host authorization for a new owner stall", () => {
    const readiness = deriveOnboardingReadiness({
      membership,
      profile,
      profileError: null,
      devices: [],
      devicesError: null,
      delivery: null,
      deliveryError: null,
      observedAt: "2026-11-20T12:00:00.000Z",
    });
    const hostAuth = readiness.milestones.find((m) => m.id === "host_enrollment_authorized");
    expect(hostAuth?.status).toBe("action_required");
    expect(readiness.nextPermittedAction?.href).toContain("/devices");
  });

  it("keeps local owner setup unknown even when host is activated", () => {
    const readiness = deriveOnboardingReadiness({
      membership,
      profile,
      profileError: null,
      devices: [activatedHost],
      devicesError: null,
      delivery: deliveryApplied,
      deliveryError: null,
      observedAt: "2026-11-20T12:00:00.000Z",
    });
    const ownerSetup = readiness.milestones.find((m) => m.id === "local_owner_setup");
    expect(ownerSetup?.status).toBe("unknown");
    expect(ownerSetup?.nextActionHref).toContain("/setup");
    const hostConnection = readiness.milestones.find((m) => m.id === "host_connection");
    expect(hostConnection?.status).toBe("unknown");
    const config = readiness.milestones.find((m) => m.id === "configuration_delivery");
    expect(config?.status).toBe("confirmed_complete");
  });

  it("marks awaiting when host grant is reserved", () => {
    const reserved: TenantDeviceSummary = {
      ...activatedHost,
      enrollmentState: "reserved",
      activatedAt: null,
    };
    const readiness = deriveOnboardingReadiness({
      membership,
      profile,
      profileError: null,
      devices: [reserved],
      devicesError: null,
      delivery: null,
      deliveryError: null,
      observedAt: "2026-11-20T12:00:00.000Z",
    });
    expect(readiness.milestones.find((m) => m.id === "host_enrollment_completed")?.status).toBe(
      "awaiting_host_confirmation",
    );
  });

  it("blocks when tenant lifecycle is suspended", () => {
    const readiness = deriveOnboardingReadiness({
      membership: { ...membership, tenantStatus: "suspended" },
      profile,
      profileError: null,
      devices: [],
      devicesError: null,
      delivery: null,
      deliveryError: null,
      observedAt: "2026-11-20T12:00:00.000Z",
    });
    expect(readiness.milestones.find((m) => m.id === "stall_membership")?.status).toBe("blocked");
  });
});
