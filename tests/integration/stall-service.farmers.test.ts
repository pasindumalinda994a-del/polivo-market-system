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

describe("stall-service farmer management", () => {
  it("creates, lists, updates, deactivates, and reactivates a farmer", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-farmers-", "crud.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const created = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: {
        shortCode: "TF1",
        displayName: "Test Farmer A",
        contactNumber: "0712345678",
        locality: "Dambulla",
      },
      headers: mutationHeaders("create-1"),
    });
    expect(created.statusCode).toBe(201);
    const farmer = created.json();
    expect(farmer).toMatchObject({
      shortCode: "TF1",
      displayName: "Test Farmer A",
      contactNumber: "0712345678",
      locality: "Dambulla",
      isActive: true,
      revision: 1,
    });

    const listed = await app.inject({
      method: "GET",
      url: "/farmers?q=TF1",
      headers: AUTH_HEADERS,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/farmers/${farmer.id}`,
      payload: {
        expectedRevision: 1,
        displayName: "Test Farmer A Updated",
        contactNumber: null,
      },
      headers: mutationHeaders("update-1"),
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      displayName: "Test Farmer A Updated",
      contactNumber: null,
      locality: "Dambulla",
      revision: 2,
    });

    const deactivated = await app.inject({
      method: "PATCH",
      url: `/farmers/${farmer.id}/status`,
      payload: { expectedRevision: 2, status: "inactive" },
      headers: mutationHeaders("status-1"),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().isActive).toBe(false);
    expect(deactivated.json().shortCode).toBe("TF1");
    expect(deactivated.json().id).toBe(farmer.id);

    const activeOnly = await app.inject({
      method: "GET",
      url: "/farmers?q=TF1",
      headers: AUTH_HEADERS,
    });
    expect(activeOnly.json().items).toHaveLength(0);

    const withInactive = await app.inject({
      method: "GET",
      url: "/farmers?q=TF1&active=all",
      headers: AUTH_HEADERS,
    });
    expect(withInactive.json().items).toHaveLength(1);

    const reactivated = await app.inject({
      method: "PATCH",
      url: `/farmers/${farmer.id}/status`,
      payload: { expectedRevision: 3, status: "active" },
      headers: mutationHeaders("status-2"),
    });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json()).toMatchObject({
      id: farmer.id,
      shortCode: "TF1",
      isActive: true,
      revision: 4,
    });

    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 4 });
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM sync_outbox`).get() as { c: number },
    ).toEqual({ c: 4 });
  });

  it("rejects invalid input, duplicate codes, and stale revisions", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-farmers-", "validate.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const invalid = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: " ", displayName: "  " },
      headers: mutationHeaders("bad"),
    });
    expect(invalid.statusCode).toBe(400);
    expect(apiErrorSchema.safeParse(invalid.json()).success).toBe(true);

    const first = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "SAME", displayName: "One" },
      headers: mutationHeaders("dup-1"),
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "SAME", displayName: "Two" },
      headers: mutationHeaders("dup-2"),
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("CONFLICT");

    const sameName = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "OTHER", displayName: "One" },
      headers: mutationHeaders("name-2"),
    });
    expect(sameName.statusCode).toBe(201);

    const stale = await app.inject({
      method: "PATCH",
      url: `/farmers/${first.json().id}`,
      payload: { expectedRevision: 99, displayName: "Nope" },
      headers: mutationHeaders("stale"),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe("CONFLICT");
    expect(first.json().displayName).toBe("One");
  });

  it("replays idempotent creates and denies unauthorized callers", async () => {
    const path = createTempDbPath("polivo-farmers-", "idem.sqlite");
    const local = initBoundDatabase(path);
    const app = trackApp(buildTestApp({ database: local }));

    const payload = { shortCode: "ID1", displayName: "Idem Farmer" };
    const first = await app.inject({
      method: "POST",
      url: "/farmers",
      payload,
      headers: mutationHeaders("idem-key"),
    });
    expect(first.statusCode).toBe(201);

    const replay = await app.inject({
      method: "POST",
      url: "/farmers",
      payload,
      headers: mutationHeaders("idem-key"),
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const mismatch = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "ID1", displayName: "Changed" },
      headers: mutationHeaders("idem-key"),
    });
    expect(mismatch.statusCode).toBe(409);

    expect(local.db.prepare(`SELECT COUNT(*) AS c FROM farmers`).get() as { c: number }).toEqual({
      c: 1,
    });
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 1 });

    await app.close();
    openApps.splice(openApps.indexOf(app), 1);
    local.close();

    const reopened = reopenDatabase(path);
    const app2 = trackApp(buildTestApp({ database: reopened }));
    const durable = await app2.inject({
      method: "POST",
      url: "/farmers",
      payload,
      headers: mutationHeaders("idem-key"),
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
      url: "/farmers",
      headers: AUTH_HEADERS,
    });
    expect(forbidden.statusCode).toBe(403);

    const unauth = trackApp(buildTestApp({ database: reopened, authorize: false }));
    const missing = await unauth.inject({
      method: "GET",
      url: "/farmers",
      headers: AUTH_HEADERS,
    });
    expect(missing.statusCode).toBe(401);

    const noSession = trackApp(buildTestApp({ database: reopened }));
    const sessionRequired = await noSession.inject({
      method: "GET",
      url: "/farmers",
      headers: {
        "x-polivo-device-id": "test-device",
        "x-polivo-device-signed-at": "2026-11-09T08:00:00.000Z",
        "x-polivo-device-signature": "test-signature",
      },
    });
    expect(sessionRequired.statusCode).toBe(401);
  });

  it("searches Sinhala names and supports stable pagination", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-farmers-", "search.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    for (const [code, name] of [
      ["S1", "කමල්"],
      ["S2", "නිමල්"],
      ["S3", "කමල් Two"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/farmers",
        payload: { shortCode: code, displayName: name },
        headers: mutationHeaders(`seed-${code}`),
      });
      expect(response.statusCode).toBe(201);
    }

    const sinhala = await app.inject({
      method: "GET",
      url: `/farmers?q=${encodeURIComponent("කමල්")}&active=all`,
      headers: AUTH_HEADERS,
    });
    expect(sinhala.statusCode).toBe(200);
    expect(sinhala.json().items.length).toBeGreaterThanOrEqual(2);

    const page1 = await app.inject({
      method: "GET",
      url: "/farmers?active=all&limit=2",
      headers: AUTH_HEADERS,
    });
    expect(page1.json().items).toHaveLength(2);
    expect(page1.json().nextCursor).toBe("2");

    const page2 = await app.inject({
      method: "GET",
      url: "/farmers?active=all&limit=2&cursor=2",
      headers: AUTH_HEADERS,
    });
    expect(page2.json().items).toHaveLength(1);
    expect(page2.json().nextCursor).toBeNull();
    expect(page2.json().items[0].id).not.toBe(page1.json().items[0].id);
  });
});
