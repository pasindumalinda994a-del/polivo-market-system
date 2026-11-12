import { afterEach, describe, expect, it } from "vitest";

import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
import { createTestAuthorizationAdapter } from "../../apps/stall-service/src/testing/test-auth.ts";
import { countFinancialArtifacts } from "../../apps/stall-service/src/commands/account-statement-commands.ts";
import { cleanupTempDatabases, createTempDbPath, initBoundDatabase } from "./helpers/temp-db.ts";

type StallApp = ReturnType<typeof buildTestApp>;

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
  "x-polivo-device-signed-at": "2026-11-11T08:00:00.000Z",
  "x-polivo-device-signature": "test-signature",
  "x-polivo-session": "test-session-secret",
};

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { ...AUTH_HEADERS, "idempotency-key": idempotencyKey };
}

async function createBuyer(app: StallApp): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: "/buyers",
    payload: {
      shortCode: "B1",
      displayName: "Buyer One",
    },
    headers: mutationHeaders("buyer-create-stmt"),
  });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

async function postOpening(app: StallApp, traderId: string, amountMinor: number): Promise<void> {
  const draftResponse = await app.inject({
    method: "POST",
    url: "/openings/drafts",
    payload: {
      partyKind: "trader",
      partyId: traderId,
      direction: "buyer_owes_stall",
      amountMinor,
      cutoffDate: "2025-12-15",
      reference: "OB-B1",
    },
    headers: mutationHeaders(`open-prep-${amountMinor}`),
  });
  expect(draftResponse.statusCode).toBe(200);
  const draft = draftResponse.json();
  const posted = await app.inject({
    method: "POST",
    url: `/openings/drafts/${draft.id}/post`,
    payload: { expectedRevision: draft.revision },
    headers: mutationHeaders(`open-post-${amountMinor}`),
  });
  expect(posted.statusCode).toBe(200);
}

describe("stall-service account statements", () => {
  it("returns statement opening, period totals, and creates no financial side effects", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-stmt-", "basic.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const traderId = await createBuyer(app);
    await postOpening(app, traderId, 200_000);

    const before = countFinancialArtifacts(local, "stall-1");

    const statement = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/statement?fromBusinessDate=2026-01-01&toBusinessDate=2026-01-31`,
      headers: AUTH_HEADERS,
    });
    expect(statement.statusCode).toBe(200);
    const body = statement.json();
    expect(body.summary.openingBalanceMinor).toBe(200_000);
    expect(body.summary.closingBalanceMinor).toBe(200_000);
    expect(body.summary.movementCount).toBe(0);
    expect(body.snapshot.businessTimezone).toBe("UTC");
    expect(body.snapshot.snapshotToken).toBeTruthy();

    const after = countFinancialArtifacts(local, "stall-1");
    expect(after).toEqual(before);

    const summary = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/summary`,
      headers: AUTH_HEADERS,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().balanceMinor).toBe(200_000);

    const outstanding = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/outstanding`,
      headers: AUTH_HEADERS,
    });
    expect(outstanding.statusCode).toBe(200);
    expect(outstanding.json().isHistorical).toBe(false);
    expect(outstanding.json().remainingObligationsMinor).toBeGreaterThanOrEqual(0);

    const historical = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/outstanding/historical?asOfBusinessDate=2025-12-31`,
      headers: AUTH_HEADERS,
    });
    expect(historical.statusCode).toBe(200);
    expect(historical.json().isHistorical).toBe(true);
    expect(historical.json().reconstructionBasis).toBe("effective_and_recording_cutoff");
  });

  it("rejects mismatched snapshot cursors and denies without accounts.view", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-stmt-", "auth.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const traderId = await createBuyer(app);
    await postOpening(app, traderId, 50_000);

    const first = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/statement?fromBusinessDate=2026-01-01&toBusinessDate=2026-12-31&limit=1`,
      headers: AUTH_HEADERS,
    });
    expect(first.statusCode).toBe(200);

    const mismatched = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/statement?fromBusinessDate=2026-01-01&toBusinessDate=2026-12-31&limit=1&cursor=not-a-valid-cursor&snapshotToken=${encodeURIComponent(first.json().snapshot.snapshotToken)}`,
      headers: AUTH_HEADERS,
    });
    expect([400, 409]).toContain(mismatched.statusCode);

    const deniedApp = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "viewer",
            deviceRef: "test-device",
            capabilities: new Set(["parties.register_edit"]),
          },
        }),
      }),
    );
    const denied = await deniedApp.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/statement?fromBusinessDate=2026-01-01&toBusinessDate=2026-12-31`,
      headers: AUTH_HEADERS,
    });
    expect(denied.statusCode).toBe(403);
  });

  it("includes imported openings that fall inside the selected period as movements", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-stmt-", "inside.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const traderId = await createBuyer(app);
    await postOpening(app, traderId, 200_000);

    const statement = await app.inject({
      method: "GET",
      url: `/accounts/trader/${traderId}/statement?fromBusinessDate=2025-12-01&toBusinessDate=2025-12-31`,
      headers: AUTH_HEADERS,
    });
    expect(statement.statusCode).toBe(200);
    const body = statement.json();
    expect(body.summary.openingBalanceMinor).toBe(0);
    expect(body.summary.closingBalanceMinor).toBe(200_000);
    expect(body.summary.movementCount).toBe(1);
    expect(body.items[0]?.sourceType).toBe("opening_balance");
  });
});
