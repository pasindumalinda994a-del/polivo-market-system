import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/stall-service/src/app.ts";
import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
import { createTestAuthorizationAdapter } from "../../apps/stall-service/src/testing/test-auth.ts";
import { cleanupTempDatabases, createTempDbPath, initBoundDatabase } from "./helpers/temp-db.ts";

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

describe("stall-service package-type management", () => {
  it("creates, updates, and toggles package types under catalog.manage", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pkg-", "crud.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const created = await app.inject({
      method: "POST",
      url: "/package-types",
      payload: { shortCode: "BAG", displayName: "Bag" },
      headers: mutationHeaders("pkg-create-1"),
    });
    expect(created.statusCode).toBe(201);
    const packageType = created.json();
    expect(packageType).toMatchObject({
      shortCode: "BAG",
      displayName: "Bag",
      isActive: true,
      revision: 1,
    });

    const updated = await app.inject({
      method: "PATCH",
      url: `/package-types/${packageType.id}`,
      payload: { expectedRevision: 1, displayName: "Large bag" },
      headers: mutationHeaders("pkg-update-1"),
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ displayName: "Large bag", revision: 2 });

    const deactivated = await app.inject({
      method: "PATCH",
      url: `/package-types/${packageType.id}/status`,
      payload: { expectedRevision: 2, status: "inactive" },
      headers: mutationHeaders("pkg-status-1"),
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().isActive).toBe(false);

    const listed = await app.inject({
      method: "GET",
      url: "/package-types?q=BAG&active=inactive",
      headers: AUTH_HEADERS,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);

    expect(
      local.db
        .prepare(
          `SELECT COUNT(*) AS c FROM sync_outbox WHERE event_type LIKE 'polivo.package_type.%'`,
        )
        .get(),
    ).toEqual({ c: 3 });
  });

  it("denies package-type access without catalog.manage", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pkg-", "deny.sqlite"));
    const denied = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "cashier",
            deviceRef: "device-1",
            capabilities: new Set(["parties.register_edit"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );
    const response = await denied.inject({
      method: "GET",
      url: "/package-types",
      headers: AUTH_HEADERS,
    });
    expect(response.statusCode).toBe(403);
  });
});
