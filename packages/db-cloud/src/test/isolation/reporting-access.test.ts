/**
 * Phase 35 capability-aware financial reporting RLS tests.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveCloudTestEnv, type CloudTestEnv } from "./env.js";
import { beginAs, connectAdmin, FIXTURES, rollback, seedIsolationFixtures } from "./pg.js";
import type pg from "pg";

const USER_CASHIER_NO_REPORT = "user_tenant_a_cashier_no_report";
const USER_BILLING_WITH_REPORT = "user_tenant_a_billing_report";

describe("cloud reporting access (policy tests)", () => {
  let env: CloudTestEnv;
  let admin: pg.Client;

  beforeAll(async () => {
    env = resolveCloudTestEnv();
    admin = await connectAdmin(env);
    await admin.query("SELECT 1 FROM public.tenants LIMIT 1");
  });

  afterAll(async () => {
    await admin?.end();
  });

  beforeEach(async () => {
    await seedIsolationFixtures(admin);
    await admin.query(
      `INSERT INTO public.tenant_memberships
        (id, tenant_id, identity_provider, external_subject, status, access_role, capabilities)
       VALUES
        ('mem-cashier-no', $1, 'clerk', $2, 'active', 'cashier', '[]'::jsonb),
        ('mem-billing-report', $1, 'clerk', $3, 'active', 'billing_staff', '["reports.view_financial"]'::jsonb)`,
      [FIXTURES.tenantA, USER_CASHIER_NO_REPORT, USER_BILLING_WITH_REPORT],
    );

    const now = new Date().toISOString();
    await admin.query(
      `INSERT INTO public.sales
        (tenant_id, id, stall_id, trader_id, business_date, status, revision, created_at, updated_at, correction_status)
       VALUES ($1, 'sale-a', $1, 'trader-a', '2026-01-01', 'finalized', 1, $2, $2, 'active')`,
      [FIXTURES.tenantA, now],
    );
  });

  it("blocks cashier without reports.view_financial from SELECT sales", async () => {
    await beginAs(admin, { kind: "authenticated", sub: USER_CASHIER_NO_REPORT });
    const { rows } = await admin.query("SELECT id FROM public.sales WHERE tenant_id = $1", [
      FIXTURES.tenantA,
    ]);
    await rollback(admin);
    expect(rows).toEqual([]);
  });

  it("allows billing staff with reports.view_financial to SELECT sales", async () => {
    await beginAs(admin, { kind: "authenticated", sub: USER_BILLING_WITH_REPORT });
    const { rows } = await admin.query<{ id: string }>(
      "SELECT id FROM public.sales WHERE tenant_id = $1 ORDER BY id",
      [FIXTURES.tenantA],
    );
    await rollback(admin);
    expect(rows.map((r) => r.id)).toEqual(["sale-a"]);
  });

  it("allows owner to SELECT sales", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const { rows } = await admin.query<{ id: string }>(
      "SELECT id FROM public.sales WHERE tenant_id = $1 ORDER BY id",
      [FIXTURES.tenantA],
    );
    await rollback(admin);
    expect(rows.map((r) => r.id)).toEqual(["sale-a"]);
  });

  it("restricts export job SELECT to own subject", async () => {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 3_600_000).toISOString();
    await admin.query(
      `INSERT INTO public.report_export_jobs (
         tenant_id, id, stall_id, report_type, format, status, definition_version,
         snapshot_token, filter_fingerprint, normalized_filters_json,
         default_file_name, created_by_subject, create_operation_id, created_at, expires_at
       ) VALUES (
         $1, 'export-a', $1, 'sales_summary', 'csv', 'preparing', '1',
         'tok', 'fp', '{}'::jsonb,
         'sales.csv', $2, 'op-a', $3, $4
       )`,
      [FIXTURES.tenantA, FIXTURES.userA, now, expires],
    );

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const own = await admin.query("SELECT id FROM public.report_export_jobs WHERE id = 'export-a'");
    await rollback(admin);
    expect(own.rows).toHaveLength(1);

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userB });
    const foreign = await admin.query(
      "SELECT id FROM public.report_export_jobs WHERE tenant_id = $1 AND id = 'export-a'",
      [FIXTURES.tenantA],
    );
    await rollback(admin);
    expect(foreign.rows).toEqual([]);
  });
});
