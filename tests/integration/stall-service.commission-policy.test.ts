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

/** Synthetic TEST-ONLY bands — not production seeds. */
const TEST_BANDS = [
  {
    id: "band-low",
    minPricePerKgMinor: 0,
    maxPricePerKgMinor: 19_999,
    ratePerKgMinor: 500,
  },
  {
    id: "band-mid",
    minPricePerKgMinor: 20_000,
    maxPricePerKgMinor: 40_000,
    ratePerKgMinor: 1_500,
  },
  {
    id: "band-high",
    minPricePerKgMinor: 40_001,
    maxPricePerKgMinor: null,
    ratePerKgMinor: 5_000,
  },
];

describe("stall-service commission policy", () => {
  it("shows unconfigured, activates, previews, replaces, and preserves history", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-comm-", "crud.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));

    const unconfigured = await app.inject({
      method: "GET",
      url: "/commission-policy",
      headers: AUTH_HEADERS,
    });
    expect(unconfigured.statusCode).toBe(200);
    expect(unconfigured.json()).toMatchObject({
      status: "unconfigured",
      revision: 1,
      activeVersion: null,
    });

    const missingPreview = await app.inject({
      method: "POST",
      url: "/commission-policy/preview",
      payload: { sellingPricePerKgMinor: 25_000, netWeightHundredths: 10_000 },
      headers: AUTH_HEADERS,
    });
    expect(missingPreview.statusCode).toBe(400);

    const activated = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload: { expectedRevision: 1, bands: TEST_BANDS },
      headers: mutationHeaders("comm-activate-1"),
    });
    expect(activated.statusCode).toBe(200);
    const active = activated.json();
    expect(active).toMatchObject({
      status: "configured",
      revision: 2,
    });
    expect(active.activeVersion.bands).toHaveLength(3);
    expect(active.activeVersion.versionNumber).toBe(1);

    const preview = await app.inject({
      method: "POST",
      url: "/commission-policy/preview",
      payload: { sellingPricePerKgMinor: 25_000, netWeightHundredths: 10_000 },
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      commissionMinor: 150_000,
      appliedRatePerKgMinor: 1_500,
      isActiveVersion: true,
    });

    expect(
      local.db
        .prepare(
          `SELECT COUNT(*) AS c FROM audit_events WHERE action = 'commission_policy.activated'`,
        )
        .get(),
    ).toEqual({ c: 1 });
    expect(
      local.db
        .prepare(
          `SELECT COUNT(*) AS c FROM sync_outbox WHERE event_type = 'polivo.commission_policy.activated'`,
        )
        .get(),
    ).toEqual({ c: 1 });
    expect(local.db.prepare(`SELECT COUNT(*) AS c FROM sales`).get()).toEqual({ c: 0 });

    const replacementBands = [
      {
        id: "band2-low",
        minPricePerKgMinor: 0,
        maxPricePerKgMinor: 9_999,
        ratePerKgMinor: 400,
      },
      {
        id: "band2-high",
        minPricePerKgMinor: 10_000,
        maxPricePerKgMinor: null,
        ratePerKgMinor: 2_000,
      },
    ];

    const replaced = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload: { expectedRevision: 2, bands: replacementBands },
      headers: mutationHeaders("comm-activate-2"),
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().activeVersion.versionNumber).toBe(2);

    const history = await app.inject({
      method: "GET",
      url: "/commission-policy/versions",
      headers: AUTH_HEADERS,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().items).toHaveLength(2);

    const prior = await app.inject({
      method: "GET",
      url: `/commission-policy/versions/${active.activeVersion.id}`,
      headers: AUTH_HEADERS,
    });
    expect(prior.statusCode).toBe(200);
    expect(prior.json().bands).toHaveLength(3);
    expect(prior.json().versionNumber).toBe(1);
  });

  it("rejects invalid bands, stale revisions, idempotency mismatch, and wrong capabilities", async () => {
    const path = createTempDbPath("polivo-comm-", "auth.sqlite");
    const local = initBoundDatabase(path);
    const app = trackApp(buildTestApp({ database: local }));

    const gap = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload: {
        expectedRevision: 1,
        bands: [
          {
            id: "a",
            minPricePerKgMinor: 0,
            maxPricePerKgMinor: 100,
            ratePerKgMinor: 500,
          },
          {
            id: "b",
            minPricePerKgMinor: 102,
            maxPricePerKgMinor: null,
            ratePerKgMinor: 1_500,
          },
        ],
      },
      headers: mutationHeaders("comm-gap"),
    });
    expect(gap.statusCode).toBe(400);
    expect(apiErrorSchema.safeParse(gap.json()).success).toBe(true);

    const first = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload: { expectedRevision: 1, bands: TEST_BANDS },
      headers: mutationHeaders("comm-ok"),
    });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload: { expectedRevision: 1, bands: TEST_BANDS },
      headers: mutationHeaders("comm-stale"),
    });
    expect(stale.statusCode).toBe(409);

    const payload = { expectedRevision: 2, bands: TEST_BANDS };
    const once = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload,
      headers: mutationHeaders("shared-comm-key"),
    });
    expect(once.statusCode).toBe(200);
    const replay = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload,
      headers: mutationHeaders("shared-comm-key"),
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(once.json());

    const mismatch = await app.inject({
      method: "POST",
      url: "/commission-policy/activate",
      payload: {
        expectedRevision: once.json().revision,
        bands: [
          {
            id: "x",
            minPricePerKgMinor: 0,
            maxPricePerKgMinor: null,
            ratePerKgMinor: 900,
          },
        ],
      },
      headers: mutationHeaders("shared-comm-key"),
    });
    expect(mismatch.statusCode).toBe(409);

    await app.close();
    openApps.splice(openApps.indexOf(app), 1);
    local.close();

    const reopened = reopenDatabase(path);
    const denied = trackApp(
      buildTestApp({
        database: reopened,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "billing",
            deviceRef: "device-2",
            capabilities: new Set(["catalog.manage"]),
          },
        }),
        useLegacyTestAuth: false,
      }),
    );

    const forbidden = await denied.inject({
      method: "GET",
      url: "/commission-policy",
      headers: AUTH_HEADERS,
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
