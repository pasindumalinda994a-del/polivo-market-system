import { describe, expect, it } from "vitest";

import {
  areKnownCapabilities,
  normalizeCapabilitySet,
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
    expect(recommendedCapabilitiesForProfile("cashier")).toContain("payments.receive_trader");
  });
});
