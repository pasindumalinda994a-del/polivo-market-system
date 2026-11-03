/**
 * Policy-test helpers using simulated JWT claims.
 * Real Clerk signature/issuer verification belongs to phase 12.
 */

import pg from "pg";

import type { CloudTestEnv } from "./env.js";

const { Client } = pg;

export type PolicySubject =
  | {
      kind: "authenticated";
      sub: string;
      email?: string;
      emailVerified?: boolean;
    }
  | { kind: "anon" }
  | { kind: "none" };

export async function connectAdmin(env: CloudTestEnv): Promise<pg.Client> {
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  return client;
}

/** Begin a transaction as authenticated/anon with labeled simulated JWT claims. */
export async function beginAs(client: pg.Client, subject: PolicySubject): Promise<void> {
  await client.query("BEGIN");
  if (subject.kind === "none") {
    return;
  }
  if (subject.kind === "anon") {
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "anon" }),
    ]);
    await client.query("SET LOCAL ROLE anon");
    return;
  }
  // POLICY TEST: simulated JWT claims — not cryptographically verified here.
  const claims: Record<string, unknown> = {
    sub: subject.sub,
    role: "authenticated",
    aud: "authenticated",
  };
  if (subject.email !== undefined) {
    claims.email = subject.email;
  }
  if (subject.emailVerified !== undefined) {
    claims.email_verified = subject.emailVerified;
  }
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  await client.query("SET LOCAL ROLE authenticated");
}

export async function rollback(client: pg.Client): Promise<void> {
  await client.query("ROLLBACK");
}

export async function resetFixtures(client: pg.Client): Promise<void> {
  await client.query(`
    TRUNCATE TABLE
      public.sync_received_events,
      public.payment_allocations,
      public.payments,
      public.farmer_bills,
      public.trader_bills,
      public.sale_farmer_allocations,
      public.sale_line_package_weights,
      public.sale_lines,
      public.sales,
      public.commission_bands,
      public.commission_band_sets,
      public.audit_events,
      public.admin_audit_events,
      public.device_enrollment_grants,
      public.tenant_devices,
      public.tenant_invitations,
      public.tenant_onboarding_requests,
      public.tenant_permission_profiles,
      public.farmers,
      public.traders,
      public.vegetables,
      public.tenant_memberships,
      public.tenants
    RESTART IDENTITY CASCADE
  `);
}

export const FIXTURES = {
  tenantA: "tenant-a",
  tenantB: "tenant-b",
  userA: "user_tenant_a_active",
  userB: "user_tenant_b_active",
  userNoMembership: "user_no_membership",
  userInactive: "user_tenant_a_inactive",
  stallA: "stall-a",
  stallB: "stall-b",
  farmerA: "farmer-a",
  farmerB: "farmer-b",
} as const;

export async function seedIsolationFixtures(client: pg.Client): Promise<void> {
  await resetFixtures(client);

  await client.query(
    `INSERT INTO public.tenants (id, status, display_name, timezone) VALUES
      ($1, 'active', 'Stall A', 'Asia/Colombo'),
      ($2, 'active', 'Stall B', 'Asia/Colombo')`,
    [FIXTURES.tenantA, FIXTURES.tenantB],
  );

  await client.query(
    `INSERT INTO public.tenant_memberships
      (id, tenant_id, identity_provider, external_subject, status, access_role, capabilities)
     VALUES
      ('mem-a', $1, 'clerk', $2, 'active', 'owner', '[]'::jsonb),
      ('mem-b', $3, 'clerk', $4, 'active', 'billing_staff', '["reports.view_financial"]'::jsonb),
      ('mem-inactive', $1, 'clerk', $5, 'inactive', 'cashier', '[]'::jsonb)`,
    [FIXTURES.tenantA, FIXTURES.userA, FIXTURES.tenantB, FIXTURES.userB, FIXTURES.userInactive],
  );

  await client.query(
    `INSERT INTO public.tenant_permission_profiles
      (tenant_id, profile_role, capabilities, revision, updated_by_subject)
     VALUES
      ($1, 'billing_staff', '["bills.create","bills.edit_draft"]'::jsonb, 1, $2),
      ($1, 'cashier', '["payments.receive_trader"]'::jsonb, 1, $2),
      ($3, 'billing_staff', '["bills.create"]'::jsonb, 1, $4),
      ($3, 'cashier', '["payments.receive_trader"]'::jsonb, 1, $4)`,
    [FIXTURES.tenantA, FIXTURES.userA, FIXTURES.tenantB, FIXTURES.userB],
  );

  const now = new Date().toISOString();

  await client.query(
    `INSERT INTO public.farmers
      (tenant_id, id, stall_id, short_code, display_name, is_active, created_at, updated_at)
     VALUES
      ($1, $2, $3, 'F1', 'Farmer A', true, $5, $5),
      ($4, $6, $7, 'F1', 'Farmer B', true, $5, $5)`,
    [
      FIXTURES.tenantA,
      FIXTURES.farmerA,
      FIXTURES.stallA,
      FIXTURES.tenantB,
      now,
      FIXTURES.farmerB,
      FIXTURES.stallB,
    ],
  );

  await client.query(
    `INSERT INTO public.traders
      (tenant_id, id, stall_id, short_code, display_name, is_active, created_at, updated_at)
     VALUES
      ($1, 'trader-a', $2, 'T1', 'Trader A', true, $3, $3),
      ($4, 'trader-b', $5, 'T1', 'Trader B', true, $3, $3)`,
    [FIXTURES.tenantA, FIXTURES.stallA, now, FIXTURES.tenantB, FIXTURES.stallB],
  );

  await client.query(
    `INSERT INTO public.payments
      (tenant_id, id, stall_id, party_kind, farmer_id, trader_id, method, amount_minor, paid_at, created_at)
     VALUES
      ($1, 'pay-a', $2, 'farmer', $3, NULL, 'cash', 12550, $4, $4),
      ($5, 'pay-b', $6, 'farmer', $7, NULL, 'cash', 9900, $4, $4)`,
    [
      FIXTURES.tenantA,
      FIXTURES.stallA,
      FIXTURES.farmerA,
      now,
      FIXTURES.tenantB,
      FIXTURES.stallB,
      FIXTURES.farmerB,
    ],
  );

  await client.query(
    `INSERT INTO public.sync_received_events
      (tenant_id, event_id, stall_id, event_type, event_schema_version, occurred_at, source_revision)
     VALUES
      ($1, 'evt-a-1', $2, 'payment.recorded', '1', $3, 1)`,
    [FIXTURES.tenantA, FIXTURES.stallA, now],
  );
}
