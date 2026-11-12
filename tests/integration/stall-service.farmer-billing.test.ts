import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../apps/stall-service/src/app.ts";
import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
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

async function seedTwoFarmers(app: StallApp): Promise<{
  farmerA: string;
  farmerB: string;
  traderId: string;
  vegetableId: string;
  packageTypeId: string;
}> {
  const farmerA = await app.inject({
    method: "POST",
    url: "/farmers",
    payload: { shortCode: "FA", displayName: "Farmer A" },
    headers: mutationHeaders("seed-farmer-a"),
  });
  expect(farmerA.statusCode).toBe(201);

  const farmerB = await app.inject({
    method: "POST",
    url: "/farmers",
    payload: { shortCode: "FB", displayName: "Farmer B" },
    headers: mutationHeaders("seed-farmer-b"),
  });
  expect(farmerB.statusCode).toBe(201);

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
    farmerA: farmerA.json().id as string,
    farmerB: farmerB.json().id as string,
    traderId: buyer.json().id as string,
    vegetableId: vegetable.json().id as string,
    packageTypeId: packageType.json().id as string,
  };
}

async function openAccounts(app: StallApp, farmerIds: string[], traderId: string): Promise<void> {
  for (const [index, farmerId] of farmerIds.entries()) {
    const draft = await app.inject({
      method: "POST",
      url: "/openings/drafts",
      payload: {
        partyKind: "farmer",
        partyId: farmerId,
        direction: "stall_owes_farmer",
        amountMinor: 0,
        cutoffDate: "2026-11-01",
      },
      headers: mutationHeaders(`open-farmer-${index}-prepare`),
    });
    expect(draft.statusCode).toBe(200);
    const posted = await app.inject({
      method: "POST",
      url: `/openings/drafts/${draft.json().id}/post`,
      payload: { expectedRevision: draft.json().revision },
      headers: mutationHeaders(`open-farmer-${index}-post`),
    });
    expect(posted.statusCode).toBe(200);
  }

  const traderDraft = await app.inject({
    method: "POST",
    url: "/openings/drafts",
    payload: {
      partyKind: "trader",
      partyId: traderId,
      direction: "buyer_owes_stall",
      amountMinor: 0,
      cutoffDate: "2026-11-01",
    },
    headers: mutationHeaders("open-trader-prepare"),
  });
  expect(traderDraft.statusCode).toBe(200);
  const traderPosted = await app.inject({
    method: "POST",
    url: `/openings/drafts/${traderDraft.json().id}/post`,
    payload: { expectedRevision: traderDraft.json().revision },
    headers: mutationHeaders("open-trader-post"),
  });
  expect(traderPosted.statusCode).toBe(200);
}

async function finalizeSaleForFarmers(
  app: StallApp,
  input: {
    traderId: string;
    vegetableId: string;
    packageTypeId: string;
    lines: Array<{ farmerId: string; unitPricePerKgMinor: number }>;
    key: string;
  },
): Promise<{ saleId: string; lineIdsByFarmer: Map<string, string[]> }> {
  const draft = await app.inject({
    method: "POST",
    url: "/sales/drafts",
    payload: {
      traderId: input.traderId,
      businessDate: "2026-11-10",
      lines: input.lines.map((line) => ({
        farmerId: line.farmerId,
        vegetableId: input.vegetableId,
        packageTypeId: input.packageTypeId,
        unitPricePerKgMinor: line.unitPricePerKgMinor,
        weights: {
          packagingWeightHundredths: 0,
          rows: [{ rowKey: "1", grossWeightHundredths: 1000 }],
        },
      })),
    },
    headers: mutationHeaders(`${input.key}-draft`),
  });
  expect(draft.statusCode).toBe(201);
  const saleId = draft.json().id as string;

  const preview = await app.inject({
    method: "POST",
    url: `/sales/drafts/${saleId}/preview`,
    headers: AUTH_HEADERS,
  });
  expect(preview.statusCode).toBe(200);
  expect(preview.json().readyToFinalize).toBe(true);

  const finalize = await app.inject({
    method: "POST",
    url: `/sales/drafts/${saleId}/finalize`,
    payload: {
      expectedRevision: draft.json().revision,
      expectedCalculationFingerprint: preview.json().calculationFingerprint,
    },
    headers: mutationHeaders(`${input.key}-finalize`),
  });
  expect(finalize.statusCode).toBe(200);

  const lineIdsByFarmer = new Map<string, string[]>();
  for (const line of finalize.json().bill.lines as Array<{
    lineId: string;
    farmerId: string;
  }>) {
    const existing = lineIdsByFarmer.get(line.farmerId) ?? [];
    existing.push(line.lineId);
    lineIdsByFarmer.set(line.farmerId, existing);
  }

  return { saleId, lineIdsByFarmer };
}

describe("stall-service farmer sales and bill generation", () => {
  it("lists eligible lines, issues idempotently without changing balances, and separates farmers", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-farmer-bill-", "flow.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const ids = await seedTwoFarmers(app);
    await openAccounts(app, [ids.farmerA, ids.farmerB], ids.traderId);

    const sale = await finalizeSaleForFarmers(app, {
      traderId: ids.traderId,
      vegetableId: ids.vegetableId,
      packageTypeId: ids.packageTypeId,
      lines: [
        { farmerId: ids.farmerA, unitPricePerKgMinor: 10_000 },
        { farmerId: ids.farmerB, unitPricePerKgMinor: 25_000 },
      ],
      key: "sale-1",
    });

    const balanceBeforeA = await app.inject({
      method: "GET",
      url: `/accounts/farmer/${ids.farmerA}/balance`,
      headers: AUTH_HEADERS,
    });
    expect(balanceBeforeA.statusCode).toBe(200);
    const balanceABefore = balanceBeforeA.json().balanceMinor as number;

    const salesA = await app.inject({
      method: "GET",
      url: `/farmer-sales?farmerId=${ids.farmerA}&inclusionStatus=unbilled`,
      headers: AUTH_HEADERS,
    });
    expect(salesA.statusCode).toBe(200);
    expect(salesA.json().items).toHaveLength(1);
    expect(salesA.json().summary.unbilledLineCount).toBe(1);

    const lineA = sale.lineIdsByFarmer.get(ids.farmerA)![0]!;
    const preview = await app.inject({
      method: "POST",
      url: "/farmer-bills/preview",
      payload: { farmerId: ids.farmerA, sourceLineIds: [lineA] },
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().lineCount).toBe(1);

    const issueKey = "issue-farmer-a";
    const issued = await app.inject({
      method: "POST",
      url: "/farmer-bills/issue",
      payload: {
        farmerId: ids.farmerA,
        sourceLineIds: [lineA],
        expectedSelectionFingerprint: preview.json().selectionFingerprint,
      },
      headers: mutationHeaders(issueKey),
    });
    expect(issued.statusCode).toBe(201);
    expect(issued.json().billNumber).toMatch(/^F-111111$/);
    expect(issued.json().bill.lines).toHaveLength(1);
    expect(issued.json().bill.lines[0].farmerReceivesMinor).toBe(
      preview.json().totalFarmerReceivesMinor,
    );

    const retry = await app.inject({
      method: "POST",
      url: "/farmer-bills/issue",
      payload: {
        farmerId: ids.farmerA,
        sourceLineIds: [lineA],
        expectedSelectionFingerprint: preview.json().selectionFingerprint,
      },
      headers: mutationHeaders(issueKey),
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json().farmerBillId).toBe(issued.json().farmerBillId);

    const balanceAfterA = await app.inject({
      method: "GET",
      url: `/accounts/farmer/${ids.farmerA}/balance`,
      headers: AUTH_HEADERS,
    });
    expect(balanceAfterA.json().balanceMinor).toBe(balanceABefore);

    const overlap = await app.inject({
      method: "POST",
      url: "/farmer-bills/issue",
      payload: {
        farmerId: ids.farmerA,
        sourceLineIds: [lineA],
        expectedSelectionFingerprint: preview.json().selectionFingerprint,
      },
      headers: mutationHeaders("issue-farmer-a-again"),
    });
    expect(overlap.statusCode).toBe(409);

    const lineB = sale.lineIdsByFarmer.get(ids.farmerB)![0]!;
    const previewB = await app.inject({
      method: "POST",
      url: "/farmer-bills/preview",
      payload: { farmerId: ids.farmerB, sourceLineIds: [lineB] },
      headers: AUTH_HEADERS,
    });
    expect(previewB.statusCode).toBe(200);
    const issuedB = await app.inject({
      method: "POST",
      url: "/farmer-bills/issue",
      payload: {
        farmerId: ids.farmerB,
        sourceLineIds: [lineB],
        expectedSelectionFingerprint: previewB.json().selectionFingerprint,
      },
      headers: mutationHeaders("issue-farmer-b"),
    });
    expect(issuedB.statusCode).toBe(201);
    expect(issuedB.json().billNumber).toMatch(/^F-111112$/);

    const list = await app.inject({
      method: "GET",
      url: "/farmer-bills",
      headers: AUTH_HEADERS,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);

    const lookup = await app.inject({
      method: "GET",
      url: `/farmer-bills/issuances/${issueKey}`,
      headers: AUTH_HEADERS,
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().farmerBillId).toBe(issued.json().farmerBillId);

    // Buyer sequence must remain untouched by farmer issuance.
    const sale2 = await finalizeSaleForFarmers(app, {
      traderId: ids.traderId,
      vegetableId: ids.vegetableId,
      packageTypeId: ids.packageTypeId,
      lines: [{ farmerId: ids.farmerA, unitPricePerKgMinor: 10_000 }],
      key: "sale-2",
    });
    expect(sale2.saleId).toBeTruthy();
  });

  it("excludes draft sales from farmer sales listing", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-farmer-bill-", "draft.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const ids = await seedTwoFarmers(app);
    await openAccounts(app, [ids.farmerA], ids.traderId);

    const draft = await app.inject({
      method: "POST",
      url: "/sales/drafts",
      payload: {
        traderId: ids.traderId,
        businessDate: "2026-11-10",
        lines: [
          {
            farmerId: ids.farmerA,
            vegetableId: ids.vegetableId,
            packageTypeId: ids.packageTypeId,
            unitPricePerKgMinor: 10_000,
            weights: {
              packagingWeightHundredths: 0,
              rows: [{ rowKey: "1", grossWeightHundredths: 1000 }],
            },
          },
        ],
      },
      headers: mutationHeaders("draft-only"),
    });
    expect(draft.statusCode).toBe(201);

    const sales = await app.inject({
      method: "GET",
      url: `/farmer-sales?farmerId=${ids.farmerA}`,
      headers: AUTH_HEADERS,
    });
    expect(sales.statusCode).toBe(200);
    expect(sales.json().items).toHaveLength(0);
    expect(sales.json().summary.matchingLineCount).toBe(0);
  });
});
