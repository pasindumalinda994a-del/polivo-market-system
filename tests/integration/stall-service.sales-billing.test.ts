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
  "x-polivo-device-signed-at": "2026-11-10T08:00:00.000Z",
  "x-polivo-device-signature": "test-signature",
  "x-polivo-session": "test-session-secret",
};

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { ...AUTH_HEADERS, "idempotency-key": idempotencyKey };
}

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

async function seedCatalog(app: StallApp): Promise<{
  farmerId: string;
  traderId: string;
  vegetableId: string;
  packageTypeId: string;
}> {
  const farmer = await app.inject({
    method: "POST",
    url: "/farmers",
    payload: { shortCode: "F1", displayName: "Farmer One" },
    headers: mutationHeaders("seed-farmer"),
  });
  expect(farmer.statusCode).toBe(201);

  const buyer = await app.inject({
    method: "POST",
    url: "/buyers",
    payload: { shortCode: "B1", displayName: "Buyer One" },
    headers: mutationHeaders("seed-buyer"),
  });
  expect(buyer.statusCode).toBe(201);

  const vegetable = await app.inject({
    method: "POST",
    url: "/vegetables",
    payload: { shortCode: "CARROT", displayName: "Carrot" },
    headers: mutationHeaders("seed-veg"),
  });
  expect(vegetable.statusCode).toBe(201);

  const packageType = await app.inject({
    method: "POST",
    url: "/package-types",
    payload: { shortCode: "BAG", displayName: "Bag" },
    headers: mutationHeaders("seed-pkg"),
  });
  expect(packageType.statusCode).toBe(201);

  const commission = await app.inject({
    method: "POST",
    url: "/commission-policy/activate",
    payload: { expectedRevision: 1, bands: TEST_BANDS },
    headers: mutationHeaders("seed-commission"),
  });
  expect(commission.statusCode).toBe(200);

  return {
    farmerId: farmer.json().id as string,
    traderId: buyer.json().id as string,
    vegetableId: vegetable.json().id as string,
    packageTypeId: packageType.json().id as string,
  };
}

async function openAccounts(app: StallApp, farmerId: string, traderId: string): Promise<void> {
  for (const [partyKind, partyId, key] of [
    ["farmer", farmerId, "open-farmer"],
    ["trader", traderId, "open-trader"],
  ] as const) {
    const draft = await app.inject({
      method: "POST",
      url: "/openings/drafts",
      payload: {
        partyKind,
        partyId,
        direction: partyKind === "farmer" ? "stall_owes_farmer" : "buyer_owes_stall",
        amountMinor: 0,
        cutoffDate: "2026-11-01",
      },
      headers: mutationHeaders(`${key}-prepare`),
    });
    expect(draft.statusCode).toBe(200);
    const posted = await app.inject({
      method: "POST",
      url: `/openings/drafts/${draft.json().id}/post`,
      payload: { expectedRevision: draft.json().revision },
      headers: mutationHeaders(`${key}-post`),
    });
    expect(posted.statusCode).toBe(200);
  }
}

describe("stall-service sales and buyer billing", () => {
  it("creates draft, previews without ledger writes, finalizes idempotently, and rejects stale fingerprints", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-sales-", "flow.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const ids = await seedCatalog(app);
    await openAccounts(app, ids.farmerId, ids.traderId);

    const draftResponse = await app.inject({
      method: "POST",
      url: "/sales/drafts",
      payload: {
        traderId: ids.traderId,
        businessDate: "2026-11-10",
        lines: [
          {
            farmerId: ids.farmerId,
            vegetableId: ids.vegetableId,
            packageTypeId: ids.packageTypeId,
            unitPricePerKgMinor: 25_000,
            weights: {
              rows: [
                { rowKey: "a", grossWeightHundredths: 4_000 },
                { rowKey: "b", grossWeightHundredths: 6_000 },
              ],
            },
          },
        ],
      },
      headers: mutationHeaders("sale-create-1"),
    });
    expect(draftResponse.statusCode).toBe(201);
    const draft = draftResponse.json();
    expect(draft.status).toBe("draft");
    expect(draft.revision).toBe(1);

    const beforePreviewPostings = local.db
      .prepare(`SELECT COUNT(*) AS c FROM ledger_postings WHERE source_type = 'sale'`)
      .get() as { c: number };
    expect(beforePreviewPostings.c).toBe(0);

    const preview = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/preview`,
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody.readyToFinalize).toBe(true);
    expect(previewBody.totalTraderPaysMinor).toBe(2_500_000);
    expect(previewBody.totalCommissionMinor).toBe(150_000);
    expect(previewBody.calculationFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const afterPreviewPostings = local.db
      .prepare(`SELECT COUNT(*) AS c FROM ledger_postings WHERE source_type = 'sale'`)
      .get() as { c: number };
    expect(afterPreviewPostings.c).toBe(0);

    const stale = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/finalize`,
      payload: {
        expectedRevision: draft.revision,
        expectedCalculationFingerprint: "a".repeat(64),
      },
      headers: mutationHeaders("sale-finalize-stale"),
    });
    expect(stale.statusCode).toBe(409);

    const finalized = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/finalize`,
      payload: {
        expectedRevision: draft.revision,
        expectedCalculationFingerprint: previewBody.calculationFingerprint,
      },
      headers: mutationHeaders("sale-finalize-1"),
    });
    expect(finalized.statusCode).toBe(200);
    const result = finalized.json();
    expect(result.billNumber).toBe("T-444444");
    expect(result.bill.totalAmountMinor).toBe(2_500_000);

    const retry = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/finalize`,
      payload: {
        expectedRevision: draft.revision,
        expectedCalculationFingerprint: previewBody.calculationFingerprint,
      },
      headers: mutationHeaders("sale-finalize-1"),
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().billNumber).toBe("T-444444");
    expect(retry.json().traderBillId).toBe(result.traderBillId);

    const secondKey = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/finalize`,
      payload: {
        expectedRevision: draft.revision,
        expectedCalculationFingerprint: previewBody.calculationFingerprint,
      },
      headers: mutationHeaders("sale-finalize-2"),
    });
    expect(secondKey.statusCode).toBe(409);

    const salePostings = local.db
      .prepare(`SELECT COUNT(*) AS c FROM ledger_postings WHERE source_type = 'sale'`)
      .get() as { c: number };
    expect(salePostings.c).toBe(1);

    expect(result.postingId).toBeTruthy();
    const traderBalance = await app.inject({
      method: "GET",
      url: `/accounts/trader/${ids.traderId}/balance`,
      headers: AUTH_HEADERS,
    });
    expect(traderBalance.statusCode).toBe(200);
    expect(traderBalance.json().balanceMinor).toBe(2_500_000);

    const farmerBalance = await app.inject({
      method: "GET",
      url: `/accounts/farmer/${ids.farmerId}/balance`,
      headers: AUTH_HEADERS,
    });
    expect(farmerBalance.statusCode).toBe(200);
    expect(farmerBalance.json().balanceMinor).toBe(2_350_000);

    const billGet = await app.inject({
      method: "GET",
      url: `/trader-bills/${result.traderBillId}`,
      headers: AUTH_HEADERS,
    });
    expect(billGet.statusCode).toBe(200);
    expect(billGet.json().billNumber).toBe("T-444444");

    const afterGetPostings = local.db
      .prepare(`SELECT COUNT(*) AS c FROM ledger_postings WHERE source_type = 'sale'`)
      .get() as { c: number };
    expect(afterGetPostings.c).toBe(1);
  });

  it("rejects finalize when accounts are not opened", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-sales-", "opening.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const ids = await seedCatalog(app);

    const draftResponse = await app.inject({
      method: "POST",
      url: "/sales/drafts",
      payload: {
        traderId: ids.traderId,
        businessDate: "2026-11-10",
        lines: [
          {
            farmerId: ids.farmerId,
            vegetableId: ids.vegetableId,
            packageTypeId: ids.packageTypeId,
            unitPricePerKgMinor: 25_000,
            weights: {
              rows: [{ rowKey: "a", grossWeightHundredths: 10_000 }],
            },
          },
        ],
      },
      headers: mutationHeaders("sale-create-open"),
    });
    expect(draftResponse.statusCode).toBe(201);
    const draft = draftResponse.json();

    const preview = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/preview`,
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);

    const finalize = await app.inject({
      method: "POST",
      url: `/sales/drafts/${draft.id}/finalize`,
      payload: {
        expectedRevision: draft.revision,
        expectedCalculationFingerprint: preview.json().calculationFingerprint,
      },
      headers: mutationHeaders("sale-finalize-open"),
    });
    expect(finalize.statusCode).toBe(409);
    expect(finalize.json().message).toMatch(/not ready/i);
  });

  it("denies cashiers without bills capabilities", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-sales-", "auth.sqlite"));
    const app = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "cashier",
            deviceRef: "test-device",
            capabilities: new Set(["accounts.view"]),
          },
        }),
      }),
    );

    const created = await app.inject({
      method: "POST",
      url: "/sales/drafts",
      payload: { traderId: "x", lines: [] },
      headers: mutationHeaders("denied"),
    });
    expect(created.statusCode).toBe(403);
  });
});
