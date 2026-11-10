import { apiErrorSchema } from "@polivo/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/stall-service/src/app.ts";
import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
import { createTestAuthorizationAdapter } from "../../apps/stall-service/src/testing/test-auth.ts";
import {
  cleanupTempDatabases,
  createTempDbPath,
  initBoundDatabase,
  reopenDatabase,
} from "./helpers/temp-db.ts";

type StallApp = ReturnType<typeof buildApp>;

const openApps: StallApp[] = [];

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop();
    if (app !== undefined) {
      await app.close();
    }
  }
  cleanupTempDatabases();
});

function trackApp(app: StallApp): StallApp {
  openApps.push(app);
  return app;
}

const AUTH_HEADERS = {
  "x-polivo-device-id": "test-device",
  "x-polivo-device-signed-at": "2026-11-09T08:00:00.000Z",
  "x-polivo-device-signature": "test-signature",
  "x-polivo-session": "test-session-secret",
};

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { ...AUTH_HEADERS, "idempotency-key": idempotencyKey };
}

describe("stall-service buyer management", () => {
  it("creates, lists, updates, deactivates, and reactivates a buyer", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-buyers-", "crud.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const created = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: {
        shortCode: "TB1",
        displayName: "Test Trader A",
        contactNumber: "0712345678",
        locality: "Dambulla",
      },
      headers: mutationHeaders("buyer-create-1"),
    });
    expect(created.statusCode).toBe(201);
    const buyer = created.json();
    expect(buyer).toMatchObject({
      shortCode: "TB1",
      displayName: "Test Trader A",
      contactNumber: "0712345678",
      locality: "Dambulla",
      isActive: true,
      revision: 1,
    });

    const listed = await app.inject({
      method: "GET",
      url: "/buyers?q=TB1",
      headers: AUTH_HEADERS,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/buyers/${buyer.id}`,
      payload: {
        expectedRevision: 1,
        displayName: "Test Trader A Updated",
        contactNumber: null,
      },
      headers: mutationHeaders("buyer-update-1"),
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: buyer.id,
      displayName: "Test Trader A Updated",
      contactNumber: null,
      locality: "Dambulla",
      revision: 2,
    });

    const deactivated = await app.inject({
      method: "PATCH",
      url: `/buyers/${buyer.id}/status`,
      payload: { expectedRevision: 2, status: "inactive" },
      headers: mutationHeaders("buyer-status-1"),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toMatchObject({
      id: buyer.id,
      shortCode: "TB1",
      isActive: false,
    });

    const activeOnly = await app.inject({
      method: "GET",
      url: "/buyers?q=TB1",
      headers: AUTH_HEADERS,
    });
    expect(activeOnly.json().items).toHaveLength(0);

    const inactive = await app.inject({
      method: "GET",
      url: "/buyers?q=TB1&active=inactive",
      headers: AUTH_HEADERS,
    });
    expect(inactive.json().items).toHaveLength(1);

    const reactivated = await app.inject({
      method: "PATCH",
      url: `/buyers/${buyer.id}/status`,
      payload: { expectedRevision: 3, status: "active" },
      headers: mutationHeaders("buyer-status-2"),
    });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json()).toMatchObject({
      id: buyer.id,
      shortCode: "TB1",
      isActive: true,
      revision: 4,
    });

    const stored = local.db
      .prepare(`SELECT contact_number FROM traders WHERE id = ?`)
      .get(buyer.id) as { contact_number: string | null };
    expect(stored.contact_number).toBeNull();
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events WHERE action LIKE 'buyer.%'`).get(),
    ).toEqual({ c: 4 });
    expect(
      local.db
        .prepare(`SELECT COUNT(*) AS c FROM sync_outbox WHERE event_type LIKE 'polivo.buyer.%'`)
        .get(),
    ).toEqual({ c: 4 });
  });

  it("rejects invalid input, duplicate buyer codes, and stale revisions", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-buyers-", "validate.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const invalid = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: { shortCode: " ", displayName: "  " },
      headers: mutationHeaders("buyer-bad"),
    });
    expect(invalid.statusCode).toBe(400);
    expect(apiErrorSchema.safeParse(invalid.json()).success).toBe(true);

    const farmer = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "TB1", displayName: "Farmer With Buyer Code" },
      headers: mutationHeaders("farmer-same-code"),
    });
    expect(farmer.statusCode).toBe(201);

    const first = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: { shortCode: "TB1", displayName: "One" },
      headers: mutationHeaders("buyer-dup-1"),
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: { shortCode: "TB1", displayName: "Two" },
      headers: mutationHeaders("buyer-dup-2"),
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("CONFLICT");

    const sameName = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: { shortCode: "TB2", displayName: "One" },
      headers: mutationHeaders("buyer-name-2"),
    });
    expect(sameName.statusCode).toBe(201);

    const stale = await app.inject({
      method: "PATCH",
      url: `/buyers/${first.json().id}`,
      payload: { expectedRevision: 99, displayName: "Nope" },
      headers: mutationHeaders("buyer-stale"),
    });
    expect(stale.statusCode).toBe(409);
    const stored = local.db
      .prepare(`SELECT display_name, revision FROM traders WHERE id = ?`)
      .get(first.json().id) as { display_name: string; revision: number };
    expect(stored).toEqual({ display_name: "One", revision: 1 });

    const wrongRole = await app.inject({
      method: "GET",
      url: `/buyers/${farmer.json().id}`,
      headers: AUTH_HEADERS,
    });
    expect(wrongRole.statusCode).toBe(404);

    local.db
      .prepare(
        `INSERT INTO traders (id, stall_id, short_code, display_name, is_active, created_at, updated_at)
         VALUES ('other-stall-buyer', 'stall-other', 'OX', 'Other Stall', 1, '2026-11-09T08:00:00.000Z', '2026-11-09T08:00:00.000Z')`,
      )
      .run();
    const otherStall = await app.inject({
      method: "GET",
      url: "/buyers/other-stall-buyer",
      headers: AUTH_HEADERS,
    });
    expect(otherStall.statusCode).toBe(404);
  });

  it("lets only one concurrent registration win the same buyer code", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-buyers-", "race.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const [left, right] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/buyers",
        payload: { shortCode: "RACE", displayName: "Left" },
        headers: mutationHeaders("buyer-race-1"),
      }),
      app.inject({
        method: "POST",
        url: "/buyers",
        payload: { shortCode: "RACE", displayName: "Right" },
        headers: mutationHeaders("buyer-race-2"),
      }),
    ]);
    const statuses = [left.statusCode, right.statusCode].sort();
    expect(statuses).toEqual([201, 409]);
    expect(local.db.prepare(`SELECT COUNT(*) AS c FROM traders`).get()).toEqual({ c: 1 });
  });

  it("replays buyer commands independently of farmer commands", async () => {
    const path = createTempDbPath("polivo-buyers-", "idem.sqlite");
    const local = initBoundDatabase(path);
    const app = trackApp(buildTestApp({ database: local }));
    const payload = { shortCode: "ID1", displayName: "Idem Buyer" };

    const farmer = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "ID1", displayName: "Idem Farmer" },
      headers: mutationHeaders("shared-key"),
    });
    expect(farmer.statusCode).toBe(201);

    const first = await app.inject({
      method: "POST",
      url: "/buyers",
      payload,
      headers: mutationHeaders("shared-key"),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().id).not.toBe(farmer.json().id);

    const replay = await app.inject({
      method: "POST",
      url: "/buyers",
      payload,
      headers: mutationHeaders("shared-key"),
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const mismatch = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: { shortCode: "ID1", displayName: "Changed" },
      headers: mutationHeaders("shared-key"),
    });
    expect(mismatch.statusCode).toBe(409);
    expect(local.db.prepare(`SELECT COUNT(*) AS c FROM traders`).get()).toEqual({ c: 1 });
    expect(
      local.db
        .prepare(`SELECT COUNT(*) AS c FROM audit_events WHERE action = 'buyer.created'`)
        .get(),
    ).toEqual({ c: 1 });

    await app.close();
    openApps.splice(openApps.indexOf(app), 1);
    local.close();

    const reopened = reopenDatabase(path);
    const app2 = trackApp(buildTestApp({ database: reopened }));
    const durable = await app2.inject({
      method: "POST",
      url: "/buyers",
      payload,
      headers: mutationHeaders("shared-key"),
    });
    expect(durable.statusCode).toBe(201);
    expect(durable.json()).toEqual(first.json());

    const denied = trackApp(
      buildTestApp({
        database: reopened,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "cashier",
            deviceRef: "device-2",
            capabilities: new Set(["bills.create"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );
    const forbidden = await denied.inject({
      method: "GET",
      url: "/buyers",
      headers: AUTH_HEADERS,
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = trackApp(
      buildTestApp({
        database: reopened,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "billing",
            deviceRef: "device-3",
            capabilities: new Set(["parties.register_edit"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );
    const permitted = await allowed.inject({
      method: "GET",
      url: "/buyers?q=ID1",
      headers: AUTH_HEADERS,
    });
    expect(permitted.statusCode).toBe(200);
    expect(permitted.json().items).toHaveLength(1);
  });

  it("searches Sinhala names, literal characters, and stable pages", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-buyers-", "search.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    for (const [code, name] of [
      ["S1", "කමල්"],
      ["S2", "නිමල්"],
      ["S3", "100%_කමල්"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/buyers",
        payload: { shortCode: code, displayName: name },
        headers: mutationHeaders(`buyer-seed-${code}`),
      });
      expect(response.statusCode).toBe(201);
    }

    const sinhala = await app.inject({
      method: "GET",
      url: `/buyers?q=${encodeURIComponent("කමල්")}&active=all`,
      headers: AUTH_HEADERS,
    });
    expect(sinhala.statusCode).toBe(200);
    expect(sinhala.json().items).toHaveLength(2);

    const literal = await app.inject({
      method: "GET",
      url: `/buyers?q=${encodeURIComponent("100%_")}&active=all`,
      headers: AUTH_HEADERS,
    });
    expect(literal.json().items.map((item: { shortCode: string }) => item.shortCode)).toEqual([
      "S3",
    ]);

    const page1 = await app.inject({
      method: "GET",
      url: "/buyers?active=all&limit=2",
      headers: AUTH_HEADERS,
    });
    expect(page1.json().items).toHaveLength(2);
    expect(page1.json().nextCursor).toBe("2");

    const page2 = await app.inject({
      method: "GET",
      url: "/buyers?active=all&limit=2&cursor=2",
      headers: AUTH_HEADERS,
    });
    expect(page2.json().items).toHaveLength(1);
    expect(page2.json().nextCursor).toBeNull();
  });

  it("rolls back the buyer row when outbox persistence fails", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-buyers-", "rollback.sqlite"));
    local.db.exec(`
      CREATE TRIGGER fail_buyer_outbox
      BEFORE INSERT ON sync_outbox
      WHEN NEW.event_type = 'polivo.buyer.created'
      BEGIN
        SELECT RAISE(ABORT, 'forced buyer outbox failure');
      END;
    `);
    const app = trackApp(buildTestApp({ database: local }));
    const created = await app.inject({
      method: "POST",
      url: "/buyers",
      payload: { shortCode: "ROLL", displayName: "Should Roll Back" },
      headers: mutationHeaders("buyer-rollback"),
    });
    expect(created.statusCode).toBe(500);
    expect(created.json().code).toBe("INTERNAL_ERROR");
    expect(local.db.prepare(`SELECT COUNT(*) AS c FROM traders`).get()).toEqual({ c: 0 });
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events WHERE target_type = 'buyer'`).get(),
    ).toEqual({ c: 0 });
    expect(
      local.db
        .prepare(`SELECT COUNT(*) AS c FROM sync_outbox WHERE event_type = 'polivo.buyer.created'`)
        .get(),
    ).toEqual({ c: 0 });
    expect(
      local.db
        .prepare(
          `SELECT COUNT(*) AS c FROM command_idempotency WHERE command_type = 'buyer.create'`,
        )
        .get(),
    ).toEqual({ c: 0 });
  });
});
