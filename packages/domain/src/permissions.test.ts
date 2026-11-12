import { describe, expect, it } from "vitest";

import {
  areKnownCapabilities,
  effectiveLocalCapabilities,
  normalizeCapabilitySet,
  PERMISSION_CAPABILITIES,
  recommendedCapabilitiesForProfile,
  unknownCapabilities,
} from "./permissions.js";

describe("permission capability helpers", () => {
  it("accepts known capabilities and rejects unknowns", () => {
    expect(areKnownCapabilities(["bills.create", "reports.view_financial"])).toBe(true);
    expect(areKnownCapabilities(["bills.create", "not.a.capability"])).toBe(false);
    expect(unknownCapabilities(["bills.create", "not.a.capability"])).toEqual(["not.a.capability"]);
  });

  it("normalizes duplicates while preserving order", () => {
    expect(normalizeCapabilitySet(["bills.create", "bills.finalize", "bills.create"])).toEqual([
      "bills.create",
      "bills.finalize",
    ]);
    expect(normalizeCapabilitySet(["bills.create", "evil.cap"])).toBeNull();
  });

  it("returns recommended profiles without treating them as enforced grants", () => {
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain("bills.create");
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain("catalog.manage");
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain("commission.manage");
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain("accounts.view");
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain(
      "accounts.opening_prepare",
    );
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain("documents.print");
    expect(recommendedCapabilitiesForProfile("billing_staff")).toContain("documents.reprint");
    expect(recommendedCapabilitiesForProfile("billing_staff")).not.toContain(
      "accounts.opening_post",
    );
    expect(recommendedCapabilitiesForProfile("billing_staff")).not.toContain(
      "accounts.opening_correct",
    );
    expect(recommendedCapabilitiesForProfile("cashier")).toContain("payments.receive_trader");
    expect(recommendedCapabilitiesForProfile("cashier")).toContain("accounts.view");
    expect(recommendedCapabilitiesForProfile("cashier")).toContain("documents.print");
    expect(recommendedCapabilitiesForProfile("cashier")).not.toContain("documents.reprint");
    expect(recommendedCapabilitiesForProfile("cashier")).not.toContain("catalog.manage");
    expect(recommendedCapabilitiesForProfile("cashier")).not.toContain("commission.manage");
    expect(recommendedCapabilitiesForProfile("cashier")).not.toContain("accounts.opening_prepare");
  });

  it("expands local owners to the full catalog even when the snapshot is empty", () => {
    expect(effectiveLocalCapabilities({ isLocalOwner: true, snapshotCapabilities: [] })).toEqual([
      ...PERMISSION_CAPABILITIES,
    ]);
    expect(
      effectiveLocalCapabilities({
        isLocalOwner: true,
        snapshotCapabilities: ["bills.create"],
      }),
    ).toContain("parties.register_edit");
    expect(effectiveLocalCapabilities({ isLocalOwner: true, snapshotCapabilities: [] })).toContain(
      "catalog.manage",
    );
    expect(effectiveLocalCapabilities({ isLocalOwner: true, snapshotCapabilities: [] })).toContain(
      "commission.manage",
    );
    expect(effectiveLocalCapabilities({ isLocalOwner: true, snapshotCapabilities: [] })).toContain(
      "accounts.opening_post",
    );
  });

  it("uses the snapshot for non-owners", () => {
    expect(
      effectiveLocalCapabilities({
        isLocalOwner: false,
        snapshotCapabilities: ["parties.register_edit", "bills.create"],
      }),
    ).toEqual(["parties.register_edit", "bills.create"]);
    expect(effectiveLocalCapabilities({ isLocalOwner: false, snapshotCapabilities: [] })).toEqual(
      [],
    );
  });
});
