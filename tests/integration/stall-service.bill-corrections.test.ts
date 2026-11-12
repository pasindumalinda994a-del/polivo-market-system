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

async function seedAndFinalizeSale(app: StallApp): Promise<{
  farmerId: string;
  traderId: string;
  vegetableId: string;
  packageTypeId: string;
  saleId: string;
  traderBillId: string;
  revision: number;
  lines: Array<{
    lineId: string;
    farmerId: string;
    vegetableId: string;
    packageTypeId: string;
    unitPricePerKgMinor: number;
    weights: { rows: Array<{ rowKey: string; grossWeightHundredths: number }> };
  }>;
}> {
  const farmer = await app.inject({
    method: "POST",
    url: "/farmers",
    payload: { shortCode: "F1", displayName: "Farmer One" },
    headers: mutationHeaders("corr-seed-farmer"),
  });
  expect(farmer.statusCode).toBe(201);
  const buyer = await app.inject({
    method: "POST",
    url: "/buyers",
    payload: { shortCode: "B1", displayName: "Buyer One" },
    headers: mutationHeaders("corr-seed-buyer"),
  });
  expect(buyer.statusCode).toBe(201);
  const vegetable = await app.inject({
    method: "POST",
    url: "/vegetables",
    payload: { shortCode: "CARROT", displayName: "Carrot" },
    headers: mutationHeaders("corr-seed-veg"),
  });
  expect(vegetable.statusCode).toBe(201);
  const packageType = await app.inject({
    method: "POST",
    url: "/package-types",
    payload: { shortCode: "BAG", displayName: "Bag" },
    headers: mutationHeaders("corr-seed-pkg"),
  });
  expect(packageType.statusCode).toBe(201);
  const commission = await app.inject({
    method: "POST",
    url: "/commission-policy/activate",
    payload: { expectedRevision: 1, bands: TEST_BANDS },
    headers: mutationHeaders("corr-seed-commission"),
  });
  expect(commission.statusCode).toBe(200);

  for (const [partyKind, partyId, key] of [
    ["farmer", farmer.json().id as string, "corr-open-farmer"],
    ["trader", buyer.json().id as string, "corr-open-trader"],
  ] as const) {
    const draftOpening = await app.inject({
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
    expect(draftOpening.statusCode).toBe(200);
    const posted = await app.inject({
      method: "POST",
      url: `/openings/drafts/${draftOpening.json().id}/post`,
      payload: { expectedRevision: draftOpening.json().revision },
      headers: mutationHeaders(`${key}-post`),
    });
    expect(posted.statusCode).toBe(200);
  }

  const draftResponse = await app.inject({
    method: "POST",
    url: "/sales/drafts",
    payload: {
      traderId: buyer.json().id,
      businessDate: "2026-11-10",
      lines: [
        {
          farmerId: farmer.json().id,
          vegetableId: vegetable.json().id,
          packageTypeId: packageType.json().id,
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
    headers: mutationHeaders("corr-sale-create"),
  });
  expect(draftResponse.statusCode).toBe(201);
  const draft = draftResponse.json();
  const preview = await app.inject({
    method: "POST",
    url: `/sales/drafts/${draft.id}/preview`,
    headers: AUTH_HEADERS,
  });
  expect(preview.statusCode).toBe(200);
  const finalized = await app.inject({
    method: "POST",
    url: `/sales/drafts/${draft.id}/finalize`,
    payload: {
      expectedRevision: draft.revision,
      expectedCalculationFingerprint: preview.json().calculationFingerprint,
    },
    headers: mutationHeaders("corr-sale-finalize"),
  });
  expect(finalized.statusCode).toBe(200);

  return {
    farmerId: farmer.json().id as string,
    traderId: buyer.json().id as string,
    vegetableId: vegetable.json().id as string,
    packageTypeId: packageType.json().id as string,
    saleId: draft.id as string,
    traderBillId: finalized.json().traderBillId as string,
    revision: 2,
    lines: [
      {
        lineId: draft.lines[0].lineId as string,
        farmerId: farmer.json().id as string,
        vegetableId: vegetable.json().id as string,
        packageTypeId: packageType.json().id as string,
        unitPricePerKgMinor: 25_000,
        weights: {
          rows: [
            { rowKey: "a", grossWeightHundredths: 4_000 },
            { rowKey: "b", grossWeightHundredths: 6_000 },
          ],
        },
      },
    ],
  };
}

describe("stall-service bill history corrections", () => {
  it("lists history, reverses exactly, and rejects double reverse", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-corr-", "reverse.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const seeded = await seedAndFinalizeSale(app);

    const history = await app.inject({
      method: "GET",
      url: "/bill-history?billType=trader&limit=20",
      headers: AUTH_HEADERS,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().totalCount).toBeGreaterThanOrEqual(1);
    expect(history.json().items[0].billId).toBe(seeded.traderBillId);

    const beforeBalances = local.db
      .prepare(
        `SELECT party_kind, party_id, SUM(amount_minor) AS balance
         FROM ledger_entries
         WHERE stall_id = (SELECT stall_id FROM stall_binding LIMIT 1)
         GROUP BY party_kind, party_id`,
      )
      .all() as Array<{ party_kind: string; party_id: string; balance: number }>;

    const preview = await app.inject({
      method: "POST",
      url: "/sales/corrections/preview",
      payload: {
        saleId: seeded.saleId,
        expectedRevision: seeded.revision,
        action: "reverse",
        reason: "entered wrong buyer sale",
      },
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().eligibility.allowed).toBe(true);
    expect(preview.json().reversalEffects.length).toBeGreaterThanOrEqual(2);

    const commit = await app.inject({
      method: "POST",
      url: "/sales/corrections",
      payload: {
        saleId: seeded.saleId,
        expectedRevision: seeded.revision,
        action: "reverse",
        reason: "entered wrong buyer sale",
        previewFingerprint: preview.json().previewFingerprint,
      },
      headers: mutationHeaders("corr-reverse-1"),
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json().replacementSaleId).toBeNull();

    const retry = await app.inject({
      method: "POST",
      url: "/sales/corrections",
      payload: {
        saleId: seeded.saleId,
        expectedRevision: seeded.revision,
        action: "reverse",
        reason: "entered wrong buyer sale",
        previewFingerprint: preview.json().previewFingerprint,
      },
      headers: mutationHeaders("corr-reverse-1"),
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().operationId).toBe(commit.json().operationId);

    const afterBalances = local.db
      .prepare(
        `SELECT party_kind, party_id, SUM(amount_minor) AS balance
         FROM ledger_entries
         WHERE stall_id = (SELECT stall_id FROM stall_binding LIMIT 1)
         GROUP BY party_kind, party_id`,
      )
      .all() as Array<{ party_kind: string; party_id: string; balance: number }>;

    for (const before of beforeBalances) {
      const after = afterBalances.find(
        (row) => row.party_kind === before.party_kind && row.party_id === before.party_id,
      );
      expect(after?.balance ?? 0).toBe(0);
    }

    const secondReverse = await app.inject({
      method: "POST",
      url: "/sales/corrections/preview",
      payload: {
        saleId: seeded.saleId,
        expectedRevision: seeded.revision + 1,
        action: "reverse",
        reason: "try again",
      },
      headers: AUTH_HEADERS,
    });
    expect(secondReverse.statusCode).toBe(200);
    expect(secondReverse.json().eligibility.allowed).toBe(false);
    expect(secondReverse.json().eligibility.code).toBe("blocked_already_corrected");
  });

  it("corrects with replacement using original commission snapshot", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-corr-", "replace.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const seeded = await seedAndFinalizeSale(app);

    const preview = await app.inject({
      method: "POST",
      url: "/sales/corrections/preview",
      payload: {
        saleId: seeded.saleId,
        expectedRevision: seeded.revision,
        action: "correct",
        reason: "price typo",
        replacement: {
          traderId: seeded.traderId,
          lines: [
            {
              ...seeded.lines[0],
              unitPricePerKgMinor: 30_000,
            },
          ],
        },
      },
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().eligibility.allowed).toBe(true);
    expect(preview.json().commissionPolicy.selection).toBe("original_snapshot");
    expect(preview.json().proposedTotals.totalTraderPaysMinor).toBeGreaterThan(
      preview.json().originalTotals.totalTraderPaysMinor,
    );

    const commit = await app.inject({
      method: "POST",
      url: "/sales/corrections",
      payload: {
        saleId: seeded.saleId,
        expectedRevision: seeded.revision,
        action: "correct",
        reason: "price typo",
        previewFingerprint: preview.json().previewFingerprint,
        replacement: {
          traderId: seeded.traderId,
          lines: [
            {
              ...seeded.lines[0],
              unitPricePerKgMinor: 30_000,
            },
          ],
        },
      },
      headers: mutationHeaders("corr-correct-1"),
    });
    expect(commit.statusCode).toBe(200);
    expect(commit.json().replacementSaleId).toBeTruthy();
    expect(commit.json().replacementTraderBillNumber).toMatch(/^T-/);
  });

  it("blocks correction when sale line is on an issued farmer bill", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-corr-", "farmer-block.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const seeded = await seedAndFinalizeSale(app);
    const saleLineId = (
      local.db
        .prepare(`SELECT id FROM sale_lines WHERE sale_id = ? LIMIT 1`)
        .get(seeded.saleId) as { id: string }
    ).id;

    local.db
      .prepare(
        `INSERT INTO farmer_bills (
           id, stall_id, farmer_id, farmer_short_code, farmer_display_name, bill_type,
           bill_number, business_date, status, revision,
           covered_business_date_from, covered_business_date_to,
           total_sale_amount_minor, total_commission_minor, total_farmer_receives_minor,
           total_amount_minor, currency, payment_status, selection_fingerprint,
           finalized_at, created_at, updated_at
         ) VALUES (
           'fb-block', (SELECT stall_id FROM stall_binding LIMIT 1), ?, 'F1', 'Farmer One', 'farmer',
           'F-111111', '2026-11-10', 'finalized', 1,
           '2026-11-10', '2026-11-10',
           1, 1, 1,
           1, 'LKR', 'unpaid', 'fp',
           '2026-11-10T12:00:00.000Z', '2026-11-10T12:00:00.000Z', '2026-11-10T12:00:00.000Z'
         )`,
      )
      .run(seeded.farmerId);
    local.db
      .prepare(
        `INSERT INTO farmer_bill_lines (
           id, stall_id, farmer_bill_id, sale_id, sale_line_id, line_order,
           business_date, vegetable_id, vegetable_short_code, vegetable_display_name,
           package_count, net_weight_hundredths, unit_price_per_kg_minor,
           sale_amount_minor, commission_amount_minor, farmer_receives_minor, created_at
         ) VALUES (
           'fbl-block', (SELECT stall_id FROM stall_binding LIMIT 1), 'fb-block', ?, ?, 1,
           '2026-11-10', ?, 'CARROT', 'Carrot',
           1, 100, 25000,
           100, 10, 90, '2026-11-10T12:00:00.000Z'
         )`,
      )
      .run(seeded.saleId, saleLineId, seeded.vegetableId);

    const blocked = await app.inject({
      method: "GET",
      url: `/sales/${seeded.saleId}/correction-eligibility`,
      headers: AUTH_HEADERS,
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.json().allowed).toBe(false);
    expect(blocked.json().code).toBe("blocked_farmer_bill_inclusion");
  });
});
