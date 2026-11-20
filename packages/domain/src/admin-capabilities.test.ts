import { describe, expect, it } from "vitest";

import {
  ADMIN_ACTION_MATRIX,
  isUnavailableAdminAction,
  PLATFORM_ADMIN_ACTIONS,
  STALL_OWNER_ADMIN_ACTIONS,
  UNAVAILABLE_ADMIN_ACTIONS,
} from "./admin-capabilities.js";

describe("admin capability matrix", () => {
  it("keeps platform and stall scopes distinct", () => {
    const platform = ADMIN_ACTION_MATRIX.filter((row) => row.scope === "platform");
    const stall = ADMIN_ACTION_MATRIX.filter((row) => row.scope === "stall");
    expect(platform.every((row) => row.authority === "platform_administrator")).toBe(true);
    expect(stall.every((row) => row.authority === "stall_owner")).toBe(true);
    expect(PLATFORM_ADMIN_ACTIONS.length).toBeGreaterThan(0);
    expect(STALL_OWNER_ADMIN_ACTIONS.length).toBeGreaterThan(0);
  });

  it("marks lifecycle and ownership transfer as unavailable", () => {
    expect(isUnavailableAdminAction("stall.lifecycle.suspend")).toBe(true);
    expect(isUnavailableAdminAction("stall.ownership.transfer")).toBe(true);
    expect(isUnavailableAdminAction("stall.profile.edit")).toBe(false);
    expect(UNAVAILABLE_ADMIN_ACTIONS).toContain("platform.market.admin.assign");
  });

  it("requires revision guards for profile edits", () => {
    const profileActions = ADMIN_ACTION_MATRIX.filter((row) => row.action.endsWith("profile.edit"));
    expect(profileActions.length).toBeGreaterThan(0);
    expect(profileActions.every((row) => row.revisionGuarded)).toBe(true);
  });
});
