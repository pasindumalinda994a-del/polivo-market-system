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

describe("stall-service vegetable management", () => {
  it("creates, lists, updates, deactivates, and reactivates a vegetable", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-veg-", "crud.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const created = await app.inject({
      method: "POST",
      url: "/vegetables",
      payload: { shortCode: "CB", displayName: "Carrot" },
      headers: mutationHeaders("veg-create-1"),
    });
    expect(created.statusCode).toBe(201);
    const vegetable = created.json();
    expect(vegetable).toMatchObject({
      shortCode: "CB",
      displayName: "Carrot",
      isActive: true,
      revision: 1,
    });

    const listed = await app.inject({
      method: "GET",
      url: "/vegetables?q=CB",
      headers: AUTH_HEADERS,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/vegetables/${vegetable.id}`,
      payload: { expectedRevision: 1, displayName: "Carrot Updated" },
      headers: mutationHeaders("veg-update-1"),
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: vegetable.id,
      displayName: "Carrot Updated",
      revision: 2,
    });

    const deactivated = await app.inject({
      method: "PATCH",
      url: `/vegetables/${vegetable.id}/status`,
      payload: { expectedRevision: 2, status: "inactive" },
      headers: mutationHeaders("veg-status-1"),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().isActive).toBe(false);

    const activeOnly = await app.inject({
      method: "GET",
      url: "/vegetables?q=CB",
      headers: AUTH_HEADERS,
    });
    expect(activeOnly.json().items).toHaveLength(0);

    const byId = await app.inject({
      method: "GET",
      url: `/vegetables/${vegetable.id}`,
      headers: AUTH_HEADERS,
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().shortCode).toBe("CB");

    const reactivated = await app.inject({
      method: "PATCH",
      url: `/vegetables/${vegetable.id}/status`,
      payload: { expectedRevision: 3, status: "active" },
      headers: mutationHeaders("veg-status-2"),
    });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json()).toMatchObject({ isActive: true, revision: 4 });

    expect(
      local.db
        .prepare(`SELECT COUNT(*) AS c FROM audit_events WHERE action LIKE 'vegetable.%'`)
        .get(),
    ).toEqual({ c: 4 });
    expect(
      local.db
        .prepare(`SELECT COUNT(*) AS c FROM sync_outbox WHERE event_type LIKE 'polivo.vegetable.%'`)
        .get(),
    ).toEqual({ c: 4 });
  });

  it("rejects invalid input, duplicates, stale revisions, and wrong capabilities", async () => {
    const path = createTempDbPath("polivo-veg-", "auth.sqlite");
    const local = initBoundDatabase(path);
    const app = trackApp(buildTestApp({ database: local }));

    const invalid = await app.inject({
      method: "POST",
      url: "/vegetables",
      payload: { shortCode: " ", displayName: "  " },
      headers: mutationHeaders("veg-bad"),
    });
    expect(invalid.statusCode).toBe(400);
    expect(apiErrorSchema.safeParse(invalid.json()).success).toBe(true);

    const first = await app.inject({
      method: "POST",
      url: "/vegetables",
      payload: { shortCode: "CB", displayName: "One" },
      headers: mutationHeaders("veg-dup-1"),
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: "/vegetables",
      payload: { shortCode: "CB", displayName: "Two" },
      headers: mutationHeaders("veg-dup-2"),
    });
    expect(duplicate.statusCode).toBe(409);

    const stale = await app.inject({
      method: "PATCH",
      url: `/vegetables/${first.json().id}`,
      payload: { expectedRevision: 99, displayName: "Stale" },
      headers: mutationHeaders("veg-stale"),
    });
    expect(stale.statusCode).toBe(409);

    const payload = { shortCode: "ID1", displayName: "Idempotent" };
    const createOnce = await app.inject({
      method: "POST",
      url: "/vegetables",
      payload,
      headers: mutationHeaders("shared-veg-key"),
    });
    expect(createOnce.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/vegetables",
      payload,
      headers: mutationHeaders("shared-veg-key"),
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(createOnce.json());

    await app.close();
    openApps.splice(openApps.indexOf(app), 1);
    local.close();

    const reopened = reopenDatabase(path);
    const deniedPartiesOnly = trackApp(
      buildTestApp({
        database: reopened,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "billing",
            deviceRef: "device-2",
            capabilities: new Set(["parties.register_edit"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );
    const forbiddenParties = await deniedPartiesOnly.inject({
      method: "GET",
      url: "/vegetables",
      headers: AUTH_HEADERS,
    });
    expect(forbiddenParties.statusCode).toBe(403);

    const deniedCashier = trackApp(
      buildTestApp({
        database: reopened,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "cashier",
            deviceRef: "device-3",
            capabilities: new Set(["payments.receive_trader"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );
    const forbiddenCashier = await deniedCashier.inject({
      method: "POST",
      url: "/vegetables",
      payload: { shortCode: "X1", displayName: "Nope" },
      headers: mutationHeaders("veg-denied"),
    });
    expect(forbiddenCashier.statusCode).toBe(403);

    const allowed = trackApp(
      buildTestApp({
        database: reopened,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "catalog",
            deviceRef: "device-4",
            capabilities: new Set(["catalog.manage"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );
    const permitted = await allowed.inject({
      method: "GET",
      url: "/vegetables?q=CB&active=all",
      headers: AUTH_HEADERS,
    });
    expect(permitted.statusCode).toBe(200);
    expect(permitted.json().items.length).toBeGreaterThan(0);
  });
});
