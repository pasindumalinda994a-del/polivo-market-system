/**
 * Phase 31 sync ingestion apply RPC + RLS tests.
 */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveCloudTestEnv, type CloudTestEnv } from "./env.js";
import { beginAs, connectAdmin, FIXTURES, resetFixtures, rollback } from "./pg.js";
import type pg from "pg";

function canonicalHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortValue(payload)), "utf8")
    .digest("hex");
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = sortValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

const TENANT = FIXTURES.tenantA;
const STALL = FIXTURES.tenantA; // Phase 31 binding: stall_id === tenant_id
const DEVICE = "host-device-a";
const INSTALL = "install-host-a";
const NOW = "2026-11-13T10:00:00.000Z";

async function seedHostTenant(
  client: pg.Client,
  input?: { revoked?: boolean; terminal?: boolean },
) {
  await resetFixtures(client);
  await client.query(
    `INSERT INTO public.tenants (id, status, display_name, timezone) VALUES ($1, 'active', 'Stall A', 'Asia/Colombo')`,
    [TENANT],
  );
  await client.query(
    `INSERT INTO public.tenant_memberships
      (id, tenant_id, identity_provider, external_subject, status, access_role, capabilities)
     VALUES ('mem-a', $1, 'clerk', $2, 'active', 'owner', '[]'::jsonb)`,
    [TENANT, FIXTURES.userA],
  );
  const state = input?.revoked ? "revoked" : "activated";
  await client.query(
    `INSERT INTO public.tenant_devices (
      id, tenant_id, device_id, role, installation_id, public_key, credential_version,
      enrollment_state, deployment_environment, state_revision, authorized_by_subject,
      created_at, updated_at, activated_at, revoked_at, intended_host_device_id
    ) VALUES (
      'tdev-1', $1, $2, $3, $4, $5, 1, $6, 'development', 1, $7,
      $8::timestamptz, $8::timestamptz,
      CASE WHEN $6 = 'activated' THEN $8::timestamptz ELSE NULL END,
      CASE WHEN $6 = 'revoked' THEN $8::timestamptz ELSE NULL END,
      $9
    )`,
    [
      TENANT,
      input?.terminal ? "terminal-device-a" : DEVICE,
      input?.terminal ? "terminal" : "host",
      INSTALL,
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      state,
      FIXTURES.userA,
      NOW,
      input?.terminal ? DEVICE : null,
    ],
  );
}

function farmerEvent(sequence: string, eventId = "evt-farmer-1") {
  const payload = {
    farmer: {
      id: "farmer-sync-1",
      shortCode: "FS1",
      displayName: "Sync Farmer",
      contactNumber: null,
      locality: null,
      isActive: true,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    stallId: STALL,
  };
  return {
    event: {
      eventId,
      eventType: "polivo.farmer.created",
      eventSchemaVersion: "1",
      sequence,
      transactionGroupId: "grp-1",
      aggregateId: "farmer-sync-1",
      aggregateRevision: 1,
      occurredAt: NOW,
      payload,
    },
    hash: canonicalHash(payload),
  };
}

describe("cloud sync ingestion apply", () => {
  let env: CloudTestEnv;
  let admin: pg.Client;

  beforeAll(async () => {
    env = resolveCloudTestEnv();
    admin = await connectAdmin(env);
    const { rows } = await admin.query(
      `SELECT 1 AS ok FROM pg_proc WHERE proname = 'apply_sync_ingestion_group'`,
    );
    if (rows.length === 0) {
      throw new Error("apply_sync_ingestion_group missing — apply Phase 31 migrations.");
    }
  });

  afterAll(async () => {
    await admin?.end();
  });

  beforeEach(async () => {
    await seedHostTenant(admin);
  });

  it("applies a farmer snapshot group for an activated host", async () => {
    const { event, hash } = farmerEvent("1");
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group(
        $1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb
      ) AS apply_sync_ingestion_group`,
      [
        TENANT,
        STALL,
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([event]),
        JSON.stringify({ [event.eventId]: hash }),
      ],
    );
    const result = rows[0]?.apply_sync_ingestion_group;
    expect(result?.outcome).toBe("applied");
    expect(result?.committedCursor).toBe("1");

    const farmers = await admin.query(
      `SELECT id, revision FROM public.farmers WHERE tenant_id = $1`,
      [TENANT],
    );
    expect(farmers.rows).toEqual([{ id: "farmer-sync-1", revision: 1 }]);
  });

  it("returns already_applied on identical replay", async () => {
    const { event, hash } = farmerEvent("1");
    const args = [
      TENANT,
      STALL,
      DEVICE,
      INSTALL,
      INSTALL,
      JSON.stringify([event]),
      JSON.stringify({ [event.eventId]: hash }),
    ];
    await admin.query(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb)`,
      args,
    );
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb) AS apply_sync_ingestion_group`,
      args,
    );
    expect(rows[0]?.apply_sync_ingestion_group.outcome).toBe("already_applied");
    const count = await admin.query(
      `SELECT count(*)::int AS c FROM public.farmers WHERE tenant_id = $1`,
      [TENANT],
    );
    expect(count.rows[0]?.c).toBe(1);
  });

  it("rejects event id reused with different payload hash", async () => {
    const first = farmerEvent("1");
    await admin.query(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb)`,
      [
        TENANT,
        STALL,
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([first.event]),
        JSON.stringify({ [first.event.eventId]: first.hash }),
      ],
    );
    const altered = {
      ...first.event,
      payload: {
        ...first.event.payload,
        farmer: { ...first.event.payload.farmer, displayName: "Changed" },
      },
    };
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-2',$6::jsonb,$7::jsonb) AS apply_sync_ingestion_group`,
      [
        TENANT,
        STALL,
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([altered]),
        JSON.stringify({ [altered.eventId]: canonicalHash(altered.payload) }),
      ],
    );
    expect(rows[0]?.apply_sync_ingestion_group.outcome).toBe("integrity_conflict");
  });

  it("rejects out-of-order sequences", async () => {
    const { event, hash } = farmerEvent("2");
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb) AS apply_sync_ingestion_group`,
      [
        TENANT,
        STALL,
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([event]),
        JSON.stringify({ [event.eventId]: hash }),
      ],
    );
    expect(rows[0]?.apply_sync_ingestion_group.outcome).toBe("sequence_conflict");
  });

  it("rejects revoked host", async () => {
    await seedHostTenant(admin, { revoked: true });
    const { event, hash } = farmerEvent("1");
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb) AS apply_sync_ingestion_group`,
      [
        TENANT,
        STALL,
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([event]),
        JSON.stringify({ [event.eventId]: hash }),
      ],
    );
    expect(rows[0]?.apply_sync_ingestion_group.outcome).toBe("authorization_failure");
  });

  it("rejects wrong stall scope", async () => {
    const { event, hash } = farmerEvent("1");
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-1',$6::jsonb,$7::jsonb) AS apply_sync_ingestion_group`,
      [
        TENANT,
        "wrong-stall",
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([event]),
        JSON.stringify({ [event.eventId]: hash }),
      ],
    );
    expect(rows[0]?.apply_sync_ingestion_group.outcome).toBe("authorization_failure");
  });

  it("rejects sale finalized schema v1 as unsupported", async () => {
    const payload = {
      saleId: "sale-1",
      traderBillId: "tb-1",
      billNumber: "T-444444",
      traderId: "trader-1",
      businessDate: "2026-11-13",
      totalAmountMinor: 100,
      totalCommissionMinor: 10,
      postingId: "post-1",
      commissionPolicyId: "pol-1",
      commissionVersionId: "ver-1",
      calculationFingerprint: "a".repeat(64),
      lineCount: 1,
    };
    const event = {
      eventId: "evt-sale-1",
      eventType: "polivo.sale.finalized",
      eventSchemaVersion: "1",
      sequence: "1",
      transactionGroupId: "grp-sale",
      occurredAt: NOW,
      payload,
    };
    const { rows } = await admin.query<{ apply_sync_ingestion_group: Record<string, unknown> }>(
      `SELECT public.apply_sync_ingestion_group($1,$2,$3,$4,1,$5,1,'grp-sale',$6::jsonb,$7::jsonb) AS apply_sync_ingestion_group`,
      [
        TENANT,
        STALL,
        DEVICE,
        INSTALL,
        INSTALL,
        JSON.stringify([event]),
        JSON.stringify({ [event.eventId]: canonicalHash(payload) }),
      ],
    );
    expect(rows[0]?.apply_sync_ingestion_group.outcome).toBe("unsupported_event_version");
  });

  it("blocks authenticated browser inserts into farmers and apply RPC execute", async () => {
    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await expect(
      admin.query(
        `INSERT INTO public.farmers
          (tenant_id, id, stall_id, short_code, display_name, is_active, created_at, updated_at)
         VALUES ($1, 'f-x', $1, 'X', 'Nope', true, $2, $2)`,
        [TENANT, NOW],
      ),
    ).rejects.toThrow();
    await rollback(admin);

    await beginAs(admin, { kind: "authenticated", sub: FIXTURES.userA });
    await expect(
      admin.query(
        `SELECT public.apply_sync_ingestion_group($1,$1,'d','i',1,'i',1,'g','[]'::jsonb,'{}'::jsonb)`,
        [TENANT],
      ),
    ).rejects.toThrow();
    await rollback(admin);
  });

  it("blocks anonymous select of sync inbox tables", async () => {
    await beginAs(admin, { kind: "anon" });
    await expect(admin.query(`SELECT * FROM public.sync_source_streams`)).rejects.toThrow(
      /permission denied/i,
    );
    await rollback(admin);

    await beginAs(admin, { kind: "anon" });
    await expect(admin.query(`SELECT * FROM public.sync_received_events`)).rejects.toThrow(
      /permission denied/i,
    );
    await rollback(admin);
  });

  it("enforces durable rate limits", async () => {
    const bucket = `stream:test:${Date.now()}`;
    const { rows: first } = await admin.query<{ allowed: boolean; request_count: number }>(
      `SELECT * FROM public.check_sync_ingest_rate_limit($1, 60, 2)`,
      [bucket],
    );
    expect(first[0]?.allowed).toBe(true);
    await admin.query(`SELECT * FROM public.check_sync_ingest_rate_limit($1, 60, 2)`, [bucket]);
    const { rows: third } = await admin.query<{ allowed: boolean }>(
      `SELECT * FROM public.check_sync_ingest_rate_limit($1, 60, 2)`,
      [bucket],
    );
    expect(third[0]?.allowed).toBe(false);
  });
});
