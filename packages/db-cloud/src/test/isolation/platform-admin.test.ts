/**
 * Phase 36 platform / stall administration policy tests.
 * JWT claims are simulated (POLICY TEST). Platform admin rows are synthetic fixtures only.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";

import { resolveCloudTestEnv, type CloudTestEnv } from "./env.js";
import {
  beginAs,
  connectAdmin,
  FIXTURES,
  rollback,
  seedIsolationFixtures,
  seedPlatformAdministrator,
} from "./pg.js";

describe("platform and stall administration (policy tests)", () => {
  let env: CloudTestEnv;
  let admin: pg.Client;

  beforeAll(async () => {
    env = resolveCloudTestEnv();
    admin = await connectAdmin(env);
    await admin.query("SELECT 1 FROM public.platform_administrators LIMIT 1");
  });

  afterAll(async () => {
    await admin?.end();
  });

  beforeEach(async () => {
    try {
      await admin.query("ROLLBACK");
    } catch {
      // no open transaction
    }
    await seedIsolationFixtures(admin);
  });

  it("denies stall owners from platform directory", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    let failed = false;
    try {
      await admin.query(
        `SELECT * FROM public.list_platform_stall_directory(50, 0, NULL, NULL, NULL)`,
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("allows synthetic platform admin to list directory without financial columns", async () => {
    await seedPlatformAdministrator(admin);
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userPlatformAdmin });
    const { rows } = await admin.query<{
      tenant_id: string;
      display_name: string;
      enrollment_status: string;
      total_count: string;
    }>(`SELECT * FROM public.list_platform_stall_directory(50, 0, NULL, NULL, NULL)`);
    await rollback(admin);

    expect(Number(rows[0]?.total_count ?? 0)).toBeGreaterThanOrEqual(2);
    expect(rows.some((row) => row.tenant_id === FIXTURES.tenantA)).toBe(true);
    expect(rows[0]).not.toHaveProperty("sales_total");
    expect(rows[0]?.enrollment_status).toBeTruthy();
  });

  it("rejects reporting members from stall profile updates", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userB });
    let failed = false;
    try {
      await admin.query(
        `SELECT * FROM public.update_stall_profile($1, 1, 'Hack', 'Asia/Colombo', NULL, NULL, NULL)`,
        [FIXTURES.tenantB],
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("updates stall profile with revision guard for owners", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const first = await admin.query<{ profile_revision: string }>(
      `SELECT * FROM public.update_stall_profile($1, 1, 'Stall A Renamed', 'Asia/Colombo', 'Pettah', 'a@example.com', 'note-1')`,
      [FIXTURES.tenantA],
    );
    expect(Number(first.rows[0]?.profile_revision)).toBe(2);

    const profile = await admin.query<{ display_name: string; admin_notes: string }>(
      `SELECT * FROM public.get_stall_admin_profile($1)`,
      [FIXTURES.tenantA],
    );
    expect(profile.rows[0]?.display_name).toBe("Stall A Renamed");
    expect(profile.rows[0]?.admin_notes).toBe("note-1");

    let conflicted = false;
    try {
      await admin.query(
        `SELECT * FROM public.update_stall_profile($1, 1, 'Stale', 'Asia/Colombo', NULL, NULL, NULL)`,
        [FIXTURES.tenantA],
      );
    } catch {
      conflicted = true;
    }
    await rollback(admin);

    expect(conflicted).toBe(true);
  });

  it("records audit events for profile updates and keeps them readable by owners", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await admin.query(
      `SELECT * FROM public.update_stall_profile($1, 1, 'Audited Stall', 'Asia/Colombo', NULL, NULL, 'secret-note')`,
      [FIXTURES.tenantA],
    );
    const audit = await admin.query<{ action: string; tenant_id: string }>(
      `SELECT action, tenant_id FROM public.admin_audit_events
       WHERE tenant_id = $1 AND action = 'stall_profile.updated'
       ORDER BY created_at DESC LIMIT 1`,
      [FIXTURES.tenantA],
    );
    await rollback(admin);

    expect(audit.rows[0]?.action).toBe("stall_profile.updated");
    expect(audit.rows[0]?.tenant_id).toBe(FIXTURES.tenantA);
  });

  it("lets platform admin read audit across stalls; inactive members cannot", async () => {
    await seedPlatformAdministrator(admin);

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await admin.query(
      `SELECT * FROM public.update_stall_profile($1, 1, 'Cross Audit', 'Asia/Colombo', NULL, NULL, NULL)`,
      [FIXTURES.tenantA],
    );
    const ownerRead = await admin.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM public.admin_audit_events WHERE tenant_id = $1 LIMIT 1`,
      [FIXTURES.tenantA],
    );
    expect(ownerRead.rows.length).toBe(1);

    // Same transaction: switch JWT subject to platform admin (synthetic fixture).
    await admin.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: FIXTURES.userPlatformAdmin,
        role: "authenticated",
        aud: "authenticated",
      }),
    ]);
    const platformRead = await admin.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM public.admin_audit_events WHERE tenant_id = $1 LIMIT 1`,
      [FIXTURES.tenantA],
    );

    await admin.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        sub: FIXTURES.userInactive,
        role: "authenticated",
        aud: "authenticated",
      }),
    ]);
    const inactiveRead = await admin.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM public.admin_audit_events WHERE tenant_id = $1 LIMIT 1`,
      [FIXTURES.tenantA],
    );
    await rollback(admin);

    expect(platformRead.rows.length).toBe(1);
    expect(inactiveRead.rows.length).toBe(0);
  });

  it("does not change financial rows when updating stall profile", async () => {
    const before = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.sales WHERE tenant_id = $1`,
      [FIXTURES.tenantA],
    );
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await admin.query(
      `SELECT * FROM public.update_stall_profile($1, 1, 'No Finance Touch', 'Asia/Colombo', NULL, NULL, NULL)`,
      [FIXTURES.tenantA],
    );
    await rollback(admin);
    const after = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.sales WHERE tenant_id = $1`,
      [FIXTURES.tenantA],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("blocks cross-tenant profile access for owners", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    let failed = false;
    try {
      await admin.query(`SELECT * FROM public.get_stall_admin_profile($1)`, [FIXTURES.tenantB]);
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("inactive platform admin cannot list directory", async () => {
    await seedPlatformAdministrator(admin);
    await admin.query(
      `UPDATE public.platform_administrators SET status = 'inactive'
       WHERE external_subject = $1`,
      [FIXTURES.userPlatformAdmin],
    );
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userPlatformAdmin });
    let failed = false;
    try {
      await admin.query(
        `SELECT * FROM public.list_platform_stall_directory(10, 0, NULL, NULL, NULL)`,
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });
});
