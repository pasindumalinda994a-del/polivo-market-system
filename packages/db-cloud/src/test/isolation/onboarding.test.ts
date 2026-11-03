/**
 * Phase 13 onboarding / invitation / permission RPC policy tests.
 * JWT claims are simulated (POLICY TEST). Real Clerk verification remains separate.
 */

import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";

import { resolveCloudTestEnv, type CloudTestEnv } from "./env.js";
import { beginAs, connectAdmin, FIXTURES, rollback, seedIsolationFixtures } from "./pg.js";

function tokenPair(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  return { raw, hash };
}

describe("cloud tenant onboarding and roles (policy tests)", () => {
  let env: CloudTestEnv;
  let admin: pg.Client;

  beforeAll(async () => {
    env = resolveCloudTestEnv();
    admin = await connectAdmin(env);
    await admin.query("SELECT 1 FROM public.tenant_permission_profiles LIMIT 1");
  });

  afterAll(async () => {
    await admin?.end();
  });

  beforeEach(async () => {
    await seedIsolationFixtures(admin);
  });

  it("rejects unauthenticated stall creation", async () => {
    await beginAs(admin, { kind: "anon" });
    let failed = false;
    try {
      await admin.query(
        `SELECT * FROM public.create_stall_with_owner($1, $2, $3, $4, NULL, NULL, '[]'::json, '[]'::json)`,
        ["key-1", "hash-1", "New Stall", "Asia/Colombo"],
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("creates a tenant and owner membership atomically", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userNoMembership });
    const { rows } = await admin.query<{
      tenant_id: string;
      membership_id: string;
      replayed: boolean;
    }>(
      `SELECT * FROM public.create_stall_with_owner($1, $2, $3, $4, $5, NULL, $6::json, $7::json)`,
      [
        "onboard-ok-1",
        "payload-hash-1",
        "Green Stall",
        "Asia/Colombo",
        "Pettah",
        '["bills.create"]',
        '["payments.receive_trader"]',
      ],
    );
    await rollback(admin);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.replayed).toBe(false);
    expect(rows[0]?.tenant_id).toMatch(/^ten_/);
    expect(rows[0]?.membership_id).toMatch(/^mem_/);
  });

  it("replays identical idempotent onboarding and conflicts on payload mismatch", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userNoMembership });
    const first = await admin.query<{ tenant_id: string; replayed: boolean }>(
      `SELECT * FROM public.create_stall_with_owner($1, $2, $3, $4, NULL, NULL, '[]'::json, '[]'::json)`,
      ["onboard-idem-1", "same-hash", "Stall Idem", "Asia/Colombo"],
    );
    const second = await admin.query<{ tenant_id: string; replayed: boolean }>(
      `SELECT * FROM public.create_stall_with_owner($1, $2, $3, $4, NULL, NULL, '[]'::json, '[]'::json)`,
      ["onboard-idem-1", "same-hash", "Stall Idem", "Asia/Colombo"],
    );

    expect(second.rows[0]?.tenant_id).toBe(first.rows[0]?.tenant_id);
    expect(second.rows[0]?.replayed).toBe(true);

    let conflicted = false;
    try {
      await admin.query(
        `SELECT * FROM public.create_stall_with_owner($1, $2, $3, $4, NULL, NULL, '[]'::json, '[]'::json)`,
        ["onboard-idem-1", "other-hash", "Stall Idem", "Asia/Colombo"],
      );
    } catch {
      conflicted = true;
    }
    await rollback(admin);
    expect(conflicted).toBe(true);
  });

  it("rejects unknown capabilities on permission profile updates", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    let failed = false;
    try {
      await admin.query(
        `SELECT * FROM public.update_permission_profile($1, 'billing_staff', $2::jsonb, 1)`,
        [FIXTURES.tenantA, '["not.a.real.capability"]'],
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("returns revision conflicts for stale permission updates", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await admin.query(
      `SELECT * FROM public.update_permission_profile($1, 'billing_staff', $2::jsonb, 1)`,
      [FIXTURES.tenantA, '["bills.create"]'],
    );
    let conflicted = false;
    try {
      await admin.query(
        `SELECT * FROM public.update_permission_profile($1, 'billing_staff', $2::jsonb, 1)`,
        [FIXTURES.tenantA, '["bills.edit_draft"]'],
      );
    } catch {
      conflicted = true;
    }
    await rollback(admin);
    expect(conflicted).toBe(true);
  });

  it("prevents non-owners from administering members", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userB });
    let failed = false;
    try {
      await admin.query(
        `SELECT public.update_membership_access($1, 'mem-b', 'inactive', NULL, NULL)`,
        [FIXTURES.tenantB],
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("preserves the last active owner", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    let failed = false;
    try {
      await admin.query(
        `SELECT public.update_membership_access($1, 'mem-a', 'inactive', NULL, NULL)`,
        [FIXTURES.tenantA],
      );
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });

  it("accepts a valid invitation for the verified email recipient only", async () => {
    const { hash } = tokenPair();

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    const created = await admin.query<{ invitation_id: string }>(
      `SELECT invitation_id FROM public.create_tenant_invitation(
        $1, $2, 'cashier', '["payments.receive_trader"]'::jsonb, $3, now() + interval '7 days'
      )`,
      [FIXTURES.tenantA, "staff@example.com", hash],
    );
    expect(created.rows[0]?.invitation_id).toMatch(/^inv_/);
    await admin.query("COMMIT");

    await beginAs(admin, {
      kind: "authenticated",
      sub: FIXTURES.userNoMembership,
      email: "other@example.com",
      emailVerified: true,
    });
    let wrongRecipient = false;
    try {
      await admin.query(`SELECT * FROM public.accept_tenant_invitation($1)`, [hash]);
    } catch {
      wrongRecipient = true;
    }
    await rollback(admin);
    expect(wrongRecipient).toBe(true);

    await beginAs(admin, {
      kind: "authenticated",
      sub: FIXTURES.userNoMembership,
      email: "staff@example.com",
      emailVerified: true,
    });
    const accepted = await admin.query<{ tenant_id: string; access_role: string }>(
      `SELECT * FROM public.accept_tenant_invitation($1)`,
      [hash],
    );
    await rollback(admin);

    expect(accepted.rows[0]?.tenant_id).toBe(FIXTURES.tenantA);
    expect(accepted.rows[0]?.access_role).toBe("cashier");
  });

  it("does not expose invitation rows to non-owners", async () => {
    const { hash } = tokenPair();
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await admin.query(
      `SELECT invitation_id FROM public.create_tenant_invitation(
        $1, $2, 'cashier', '[]'::jsonb, $3, now() + interval '7 days'
      )`,
      [FIXTURES.tenantA, "hidden@example.com", hash],
    );
    await admin.query("COMMIT");

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userB });
    const { rows } = await admin.query("SELECT id FROM public.tenant_invitations");
    await rollback(admin);
    expect(rows).toEqual([]);
  });

  it("rejects reused invitation tokens after acceptance", async () => {
    const { hash } = tokenPair();
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await admin.query(
      `SELECT invitation_id FROM public.create_tenant_invitation(
        $1, $2, 'billing_staff', '["bills.create"]'::jsonb, $3, now() + interval '7 days'
      )`,
      [FIXTURES.tenantA, "once@example.com", hash],
    );
    await admin.query("COMMIT");

    await beginAs(admin, {
      kind: "authenticated",
      sub: "user_invite_once",
      email: "once@example.com",
      emailVerified: true,
    });
    await admin.query(`SELECT * FROM public.accept_tenant_invitation($1)`, [hash]);
    await admin.query("COMMIT");

    await beginAs(admin, {
      kind: "authenticated",
      sub: "user_invite_once_other",
      email: "once@example.com",
      emailVerified: true,
    });
    let failed = false;
    try {
      await admin.query(`SELECT * FROM public.accept_tenant_invitation($1)`, [hash]);
    } catch {
      failed = true;
    }
    await rollback(admin);
    expect(failed).toBe(true);
  });
});
