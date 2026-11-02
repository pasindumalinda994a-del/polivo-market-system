/**
 * Tenant isolation policy tests against local Supabase Postgres.
 * JWT claims used here are labeled POLICY TESTs (simulated). Phase 12 verifies real Clerk tokens.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { moneyMinorFromPg, moneyMinorToPgString } from "../../numeric.js";
import { resolveCloudTestEnv, type CloudTestEnv } from "./env.js";
import { beginAs, connectAdmin, FIXTURES, rollback, seedIsolationFixtures } from "./pg.js";
import type pg from "pg";

describe("cloud tenant isolation (policy tests)", () => {
  let env: CloudTestEnv;
  let admin: pg.Client;

  beforeAll(async () => {
    env = resolveCloudTestEnv();
    try {
      admin = await connectAdmin(env);
      await admin.query("SELECT 1 FROM public.tenants LIMIT 1");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        [
          "Cloud isolation tests require a disposable Postgres with migrations applied.",
          "Run: pnpm test:db-cloud (scripts/test-db-cloud.mjs).",
          `Connection detail: ${message}`,
        ].join("\n"),
        { cause: error },
      );
    }
  });

  afterAll(async () => {
    await admin?.end();
  });

  beforeEach(async () => {
    await seedIsolationFixtures(admin);
  });

  it("lets tenant A user read tenant A farmers only", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const { rows } = await admin.query<{ id: string; tenant_id: string }>(
      "SELECT id, tenant_id FROM public.farmers ORDER BY id",
    );
    await rollback(admin);
    expect(rows).toEqual([{ id: FIXTURES.farmerA, tenant_id: FIXTURES.tenantA }]);
  });

  it("blocks tenant A user from reading tenant B farmers", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const { rows } = await admin.query("SELECT id FROM public.farmers WHERE tenant_id = $1", [
      FIXTURES.tenantB,
    ]);
    await rollback(admin);
    expect(rows).toEqual([]);
  });

  it("does not grant access when only a foreign record id is known", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const { rows } = await admin.query("SELECT id FROM public.farmers WHERE id = $1", [
      FIXTURES.farmerB,
    ]);
    await rollback(admin);
    expect(rows).toEqual([]);
  });

  it("returns no rows for users with no membership", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userNoMembership });
    const { rows } = await admin.query("SELECT id FROM public.farmers");
    await rollback(admin);
    expect(rows).toEqual([]);
  });

  it("blocks inactive membership from reading reporting data", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userInactive });
    const farmers = await admin.query("SELECT id FROM public.farmers");
    const payments = await admin.query("SELECT id FROM public.payments");
    await rollback(admin);
    expect(farmers.rows).toEqual([]);
    expect(payments.rows).toEqual([]);
  });

  it("blocks anonymous requests from reading operational data", async () => {
    await beginAs(admin, { kind: "anon" });
    let farmers: unknown[] = [];
    try {
      const result = await admin.query("SELECT id FROM public.farmers");
      farmers = result.rows;
    } catch {
      // anon has no SELECT grant — permission denied is also acceptable denial.
    }
    await rollback(admin);
    expect(farmers).toEqual([]);
  });

  it("restricts membership select to the authenticated subject only", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const { rows } = await admin.query<{ id: string }>("SELECT id FROM public.tenant_memberships");
    await rollback(admin);
    expect(rows.map((r) => r.id)).toEqual(["mem-a"]);
  });

  it("prevents authenticated users from inserting membership", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    let failed = false;
    try {
      await admin.query(
        `INSERT INTO public.tenant_memberships
          (id, tenant_id, identity_provider, external_subject, status, access_role)
         VALUES ('mem-evil', $1, 'clerk', $2, 'active', 'reporting_reader')`,
        [FIXTURES.tenantB, FIXTURES.userA],
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("prevents authenticated users from elevating or reactivating membership", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userInactive });
    let failed = false;
    try {
      await admin.query(
        `UPDATE public.tenant_memberships SET status = 'active' WHERE id = 'mem-inactive'`,
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("prevents ordinary users from inserting updating or deleting financial copies", async () => {
    const attempts: boolean[] = [];

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    try {
      await admin.query(
        `INSERT INTO public.farmers
          (tenant_id, id, stall_id, short_code, display_name, is_active, created_at, updated_at)
         VALUES ($1, 'farmer-new', $2, 'FX', 'X', true, now(), now())`,
        [FIXTURES.tenantA, FIXTURES.stallA],
      );
      attempts.push(false);
    } catch {
      attempts.push(true);
    }
    await rollback(admin);

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    try {
      await admin.query(`UPDATE public.payments SET amount_minor = 1 WHERE id = 'pay-a'`);
      attempts.push(false);
    } catch {
      attempts.push(true);
    }
    await rollback(admin);

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    try {
      await admin.query(`DELETE FROM public.payments WHERE id = 'pay-a'`);
      attempts.push(false);
    } catch {
      attempts.push(true);
    }
    await rollback(admin);

    expect(attempts).toEqual([true, true, true]);
  });

  it("rejects cross-tenant parent-child references", async () => {
    let failed = false;
    try {
      await admin.query(
        `INSERT INTO public.payments
          (tenant_id, id, stall_id, party_kind, farmer_id, trader_id, method, amount_minor, paid_at, created_at)
         VALUES ($1, 'pay-cross', $2, 'farmer', $3, NULL, 'cash', 100, now(), now())`,
        [FIXTURES.tenantA, FIXTURES.stallA, FIXTURES.farmerB],
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("rejects sale_farmer_allocations that pair a line with a different sale", async () => {
    const now = new Date().toISOString();
    await admin.query(
      `INSERT INTO public.vegetables
        (tenant_id, id, stall_id, short_code, display_name, is_active, created_at, updated_at)
       VALUES ($1, 'veg-a', $2, 'V1', 'Veg A', true, $3, $3)`,
      [FIXTURES.tenantA, FIXTURES.stallA, now],
    );
    await admin.query(
      `INSERT INTO public.sales
        (tenant_id, id, stall_id, trader_id, business_date, status, revision, created_at, updated_at)
       VALUES
        ($1, 'sale-1', $2, 'trader-a', '2026-11-01', 'draft', 1, $3, $3),
        ($1, 'sale-2', $2, 'trader-a', '2026-11-01', 'draft', 1, $3, $3)`,
      [FIXTURES.tenantA, FIXTURES.stallA, now],
    );
    await admin.query(
      `INSERT INTO public.sale_lines
        (tenant_id, id, stall_id, sale_id, vegetable_id, line_order, unit_price_per_kg_minor, packaging_weight_hundredths)
       VALUES
        ($1, 'line-1', $2, 'sale-1', 'veg-a', 1, 10000, 0),
        ($1, 'line-2', $2, 'sale-2', 'veg-a', 1, 10000, 0)`,
      [FIXTURES.tenantA, FIXTURES.stallA],
    );

    await expect(
      admin.query(
        `INSERT INTO public.sale_farmer_allocations
          (tenant_id, id, stall_id, sale_id, sale_line_id, farmer_id, allocated_net_weight_hundredths)
         VALUES ($1, 'alloc-cross', $2, 'sale-1', 'line-2', $3, 100)`,
        [FIXTURES.tenantA, FIXTURES.stallA, FIXTURES.farmerA],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "sale_farmer_allocations_sale_line_fk",
    });
  });

  it("preserves exact money values through Postgres BIGINT round trip", async () => {
    const { rows } = await admin.query<{ amount_minor: string }>(
      "SELECT amount_minor::text AS amount_minor FROM public.payments WHERE id = 'pay-a'",
    );
    expect(rows[0]).toBeDefined();
    const encoded = moneyMinorToPgString(12_550);
    expect(rows[0]!.amount_minor).toBe(encoded);
    expect(moneyMinorFromPg(rows[0]!.amount_minor)).toBe(12_550);
  });

  it("enforces tenant-scoped uniqueness for received event identities", async () => {
    let failed = false;
    try {
      await admin.query(
        `INSERT INTO public.sync_received_events
          (tenant_id, event_id, stall_id, event_type, event_schema_version, occurred_at)
         VALUES ($1, 'evt-a-1', $2, 'payment.recorded', '1', now())`,
        [FIXTURES.tenantA, FIXTURES.stallA],
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
