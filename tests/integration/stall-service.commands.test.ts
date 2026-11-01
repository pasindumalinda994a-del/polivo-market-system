import { apiErrorSchema } from "@polivo/contracts";
import {
  allocateNextBillSequence,
  RevisionConflictError,
  runInTransaction,
  updateBillWithExpectedRevision,
} from "@polivo/db-local";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/stall-service/src/app.ts";
import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
import { FIXTURE_BUMP_BILL_PATH } from "../../apps/stall-service/src/testing/fixture-routes.ts";
import { createTestAuthorizationAdapter } from "../../apps/stall-service/src/testing/test-auth.ts";
import {
  cleanupTempDatabases,
  createTempDbPath,
  initBoundDatabase,
  reopenDatabase,
  seedTraderBillFixture,
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

describe("stall-service command foundations", () => {
  it("rejects unauthenticated fixture mutations and keeps production free of fixture routes", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-cmd-", "auth.sqlite"));
    seedTraderBillFixture(local);

    const production = trackApp(buildApp({ database: local, logger: false }));
    const missing = await production.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "x" },
      headers: { "idempotency-key": "k1" },
    });
    expect(missing.statusCode).toBe(404);
    expect(apiErrorSchema.safeParse(missing.json()).success).toBe(true);

    const unauth = trackApp(
      buildTestApp({
        database: local,
        authorize: false,
      }),
    );
    const denied = await unauth.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "n1" },
      headers: { "idempotency-key": "k-unauth" },
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("validates input with the shared error format", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-cmd-", "valid.sqlite"));
    seedTraderBillFixture(local);
    const app = trackApp(buildTestApp({ database: local }));

    const response = await app.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 0, note: "" },
      headers: { "idempotency-key": "k-valid" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/sqlite|SELECT|C:\\/i);
  });

  it("commits fixture command with audit and outbox, and replays idempotent results", async () => {
    const path = createTempDbPath("polivo-cmd-", "idem.sqlite");
    const local = initBoundDatabase(path);
    seedTraderBillFixture(local);
    const app = trackApp(buildTestApp({ database: local }));

    const first = await app.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "first" },
      headers: { "idempotency-key": "same-key" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ billId: "bill-1", revision: 2, note: "first" });

    const replay = await app.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "first" },
      headers: { "idempotency-key": "same-key" },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const conflict = await app.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "different" },
      headers: { "idempotency-key": "same-key" },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe("CONFLICT");

    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 1 });
    expect(
      local.db.prepare(`SELECT COUNT(*) AS c FROM sync_outbox`).get() as { c: number },
    ).toEqual({ c: 1 });

    await app.close();
    openApps.splice(openApps.indexOf(app), 1);
    local.close();

    const reopened = reopenDatabase(path);
    const app2 = trackApp(buildTestApp({ database: reopened }));
    const durableReplay = await app2.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "first" },
      headers: { "idempotency-key": "same-key" },
    });
    expect(durableReplay.statusCode).toBe(200);
    expect(durableReplay.json()).toEqual({ billId: "bill-1", revision: 2, note: "first" });
    expect(
      reopened.db.prepare(`SELECT COUNT(*) AS c FROM audit_events`).get() as { c: number },
    ).toEqual({ c: 1 });
  });

  it("does not return recorded results to unauthorized callers", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-cmd-", "authz.sqlite"));
    seedTraderBillFixture(local);

    const allowed = trackApp(buildTestApp({ database: local }));
    const created = await allowed.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "secret" },
      headers: { "idempotency-key": "authz-key" },
    });
    expect(created.statusCode).toBe(200);

    const denied = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "other",
            deviceRef: "other-device",
            capabilities: new Set(),
          },
        }),
      }),
    );
    const blocked = await denied.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "secret" },
      headers: { "idempotency-key": "authz-key" },
    });
    expect(blocked.statusCode).toBe(403);
  });

  it("returns a revision conflict when expected revision is stale", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-cmd-", "rev.sqlite"));
    seedTraderBillFixture(local);
    const app = trackApp(buildTestApp({ database: local }));

    const first = await app.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "a" },
      headers: { "idempotency-key": "rev-1" },
    });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({
      method: "POST",
      url: FIXTURE_BUMP_BILL_PATH,
      payload: { billId: "bill-1", expectedRevision: 1, note: "b" },
      headers: { "idempotency-key": "rev-2" },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe("CONFLICT");
  });

  it("allows only one competing revision update to succeed across connections", () => {
    const path = createTempDbPath("polivo-cmd-", "concurrent-rev.sqlite");
    const setup = initBoundDatabase(path);
    seedTraderBillFixture(setup);
    setup.close();

    const first = reopenDatabase(path);
    const second = reopenDatabase(path);

    // Serialize writers without waiting on busy_timeout: commit first, then prove
    // the second connection loses on the same expected revision.
    runInTransaction(first.db, (tx) => {
      updateBillWithExpectedRevision(tx, "trader", "stall-1", "bill-1", {
        expectedRevision: 1,
        updatedAt: "2026-11-01T04:00:00.000Z",
      });
    });

    expect(() =>
      runInTransaction(second.db, (tx) => {
        updateBillWithExpectedRevision(tx, "trader", "stall-1", "bill-1", {
          expectedRevision: 1,
          updatedAt: "2026-11-01T04:01:00.000Z",
        });
      }),
    ).toThrow(RevisionConflictError);

    expect(
      first.db.prepare(`SELECT revision FROM trader_bills WHERE id = 'bill-1'`).get() as {
        revision: number;
      },
    ).toEqual({ revision: 2 });
  });

  it("allocates unique bill sequences under competing connections", () => {
    const path = createTempDbPath("polivo-cmd-", "concurrent-seq.sqlite");
    const setup = initBoundDatabase(path);
    seedTraderBillFixture(setup);
    setup.close();

    const first = reopenDatabase(path);
    const second = reopenDatabase(path);

    const allocated: number[] = [];
    allocated.push(
      runInTransaction(first.db, (tx) => allocateNextBillSequence(tx, "stall-1", "farmer")),
    );
    allocated.push(
      runInTransaction(second.db, (tx) => allocateNextBillSequence(tx, "stall-1", "farmer")),
    );

    expect(new Set(allocated).size).toBe(2);
    expect(allocated.sort((a, b) => a - b)).toEqual([200, 201]);
  });
});
