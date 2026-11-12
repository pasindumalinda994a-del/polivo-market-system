import type { LocalDatabase } from "@polivo/db-local";
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
  "x-polivo-device-signed-at": "2026-11-11T08:00:00.000Z",
  "x-polivo-device-signature": "test-signature",
  "x-polivo-session": "test-session-secret",
};

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { ...AUTH_HEADERS, "idempotency-key": idempotencyKey };
}

const TEST_BANDS = [
  { id: "band-low", minPricePerKgMinor: 0, maxPricePerKgMinor: 19_999, ratePerKgMinor: 500 },
  { id: "band-mid", minPricePerKgMinor: 20_000, maxPricePerKgMinor: 40_000, ratePerKgMinor: 1_500 },
  { id: "band-high", minPricePerKgMinor: 40_001, maxPricePerKgMinor: null, ratePerKgMinor: 5_000 },
];

// Independently calculated synthetic fixture:
// 100.00 kg x 25,000 paisa/kg = 2,500,000 paisa sale; mid-band commission 1,500 paisa/kg
// = 150,000 paisa, so the farmer receives 2,350,000 paisa.
const SALE_TOTAL = 2_500_000;
const FARMER_RECEIVES = 2_350_000;
const BIG_SALE_ROWS = [
  { rowKey: "a", grossWeightHundredths: 4_000 },
  { rowKey: "b", grossWeightHundredths: 6_000 },
];
// 10.00 kg x 25,000 = 250,000 sale; commission 15,000; farmer receives 235,000.
const SMALL_SALE_TOTAL = 250_000;
const SMALL_SALE_ROWS = [{ rowKey: "a", grossWeightHundredths: 1_000 }];

type World = {
  farmerId: string;
  traderId: string;
  vegetableId: string;
  packageTypeId: string;
};

async function createParty(
  app: StallApp,
  kind: "farmers" | "buyers",
  shortCode: string,
  displayName: string,
  key: string,
): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: `/${kind}`,
    payload: { shortCode, displayName },
    headers: mutationHeaders(key),
  });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

async function postOpening(
  app: StallApp,
  partyKind: "farmer" | "trader",
  partyId: string,
  amountMinor: number,
  key: string,
  reference?: string,
): Promise<string> {
  const draft = await app.inject({
    method: "POST",
    url: "/openings/drafts",
    payload: {
      partyKind,
      partyId,
      direction: partyKind === "farmer" ? "stall_owes_farmer" : "buyer_owes_stall",
      amountMinor,
      cutoffDate: "2026-11-01",
      ...(reference !== undefined ? { reference } : {}),
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
  return draft.json().id as string;
}

async function seedWorld(app: StallApp): Promise<World> {
  const farmerId = await createParty(app, "farmers", "F1", "Farmer One", "pay-seed-farmer");
  const traderId = await createParty(app, "buyers", "B1", "Buyer One", "pay-seed-buyer");
  const vegetable = await app.inject({
    method: "POST",
    url: "/vegetables",
    payload: { shortCode: "CARROT", displayName: "Carrot" },
    headers: mutationHeaders("pay-seed-veg"),
  });
  expect(vegetable.statusCode).toBe(201);
  const packageType = await app.inject({
    method: "POST",
    url: "/package-types",
    payload: { shortCode: "BAG", displayName: "Bag" },
    headers: mutationHeaders("pay-seed-pkg"),
  });
  expect(packageType.statusCode).toBe(201);
  const commission = await app.inject({
    method: "POST",
    url: "/commission-policy/activate",
    payload: { expectedRevision: 1, bands: TEST_BANDS },
    headers: mutationHeaders("pay-seed-commission"),
  });
  expect(commission.statusCode).toBe(200);
  await postOpening(app, "farmer", farmerId, 0, "pay-open-farmer");
  await postOpening(app, "trader", traderId, 0, "pay-open-trader");
  return {
    farmerId,
    traderId,
    vegetableId: vegetable.json().id as string,
    packageTypeId: packageType.json().id as string,
  };
}

async function finalizeSale(
  app: StallApp,
  world: World,
  options: {
    traderId?: string;
    rows?: Array<{ rowKey: string; grossWeightHundredths: number }>;
    key: string;
  },
): Promise<{ saleId: string; traderBillId: string }> {
  const draftResponse = await app.inject({
    method: "POST",
    url: "/sales/drafts",
    payload: {
      traderId: options.traderId ?? world.traderId,
      businessDate: "2026-11-10",
      lines: [
        {
          farmerId: world.farmerId,
          vegetableId: world.vegetableId,
          packageTypeId: world.packageTypeId,
          unitPricePerKgMinor: 25_000,
          weights: { rows: options.rows ?? BIG_SALE_ROWS },
        },
      ],
    },
    headers: mutationHeaders(`${options.key}-create`),
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
    headers: mutationHeaders(`${options.key}-finalize`),
  });
  expect(finalized.statusCode).toBe(200);
  return { saleId: draft.id as string, traderBillId: finalized.json().traderBillId as string };
}

type Obligation = {
  obligationKind: "trader_bill" | "farmer_sale_line" | "opening_balance";
  targetId: string;
  remainingMinor: number;
  effectiveAmountMinor: number;
  activeAllocatedMinor: number;
  farmerBillId: string | null;
};

async function getObligations(
  app: StallApp,
  partyKind: "trader" | "farmer",
  partyId: string,
): Promise<{ accountBalanceMinor: number; obligations: Obligation[] }> {
  const response = await app.inject({
    method: "GET",
    url: `/payments/obligations?partyKind=${partyKind}&partyId=${partyId}&direction=${
      partyKind === "trader" ? "receive" : "pay"
    }`,
    headers: AUTH_HEADERS,
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

async function getBalance(
  app: StallApp,
  partyKind: "trader" | "farmer",
  partyId: string,
): Promise<number> {
  const response = await app.inject({
    method: "GET",
    url: `/accounts/${partyKind}/${partyId}/balance`,
    headers: AUTH_HEADERS,
  });
  expect(response.statusCode).toBe(200);
  return response.json().balanceMinor as number;
}

type PaymentBody = {
  partyKind: "trader" | "farmer";
  partyId: string;
  direction: "receive" | "pay";
  method: "cash" | "bank_transfer" | "cheque";
  amountMinor: number;
  businessDate?: string;
  bankTransferReference?: string;
  bankTransferDate?: string;
  bankAccountLabel?: string;
  chequeNumber?: string;
  issuingBankLabel?: string;
  chequeDate?: string;
  physicalHandoverDate?: string;
  note?: string;
  allocations: Array<{
    obligationKind: Obligation["obligationKind"];
    targetId: string;
    appliedAmountMinor: number;
  }>;
  proposeOldestFirst?: boolean;
};

function receiptBody(
  traderId: string,
  amountMinor: number,
  allocations: PaymentBody["allocations"],
  extra: Partial<PaymentBody> = {},
): PaymentBody {
  return {
    partyKind: "trader",
    partyId: traderId,
    direction: "receive",
    method: "cash",
    amountMinor,
    businessDate: "2026-11-11",
    allocations,
    ...extra,
  };
}

function payoutBody(
  farmerId: string,
  amountMinor: number,
  allocations: PaymentBody["allocations"],
  extra: Partial<PaymentBody> = {},
): PaymentBody {
  return {
    partyKind: "farmer",
    partyId: farmerId,
    direction: "pay",
    method: "cash",
    amountMinor,
    businessDate: "2026-11-11",
    allocations,
    ...extra,
  };
}

function chequePayoutBody(
  farmerId: string,
  amountMinor: number,
  allocations: PaymentBody["allocations"],
  extra: Partial<PaymentBody> = {},
): PaymentBody {
  return payoutBody(farmerId, amountMinor, allocations, {
    method: "cheque",
    chequeNumber: "001234",
    issuingBankLabel: "People's Bank",
    chequeDate: "2026-11-10",
    physicalHandoverDate: "2026-11-11",
    ...extra,
  });
}

async function previewPayment(app: StallApp, body: PaymentBody) {
  const preview = await app.inject({
    method: "POST",
    url: "/payments/preview",
    payload: body,
    headers: AUTH_HEADERS,
  });
  expect(preview.statusCode).toBe(200);
  return preview.json();
}

async function postPayment(app: StallApp, body: PaymentBody, key: string) {
  const preview = await previewPayment(app, body);
  expect(preview.blockingErrors).toEqual([]);
  const posted = await app.inject({
    method: "POST",
    url: "/payments",
    payload: {
      ...body,
      previewFingerprint: preview.previewFingerprint,
      ...(body.method === "cheque" ? { physicalHandoverConfirmed: true } : {}),
    },
    headers: mutationHeaders(key),
  });
  return { preview, posted };
}

function scalar<T>(local: LocalDatabase, sql: string, ...params: Array<string | number>): T {
  const row = local.db.prepare(sql).get(...params) as Record<string, unknown>;
  return Object.values(row)[0] as T;
}

function paymentLedgerCount(local: LocalDatabase): number {
  return scalar<number>(
    local,
    `SELECT COUNT(*) FROM ledger_postings WHERE source_type = 'payment'`,
  );
}

function billStatus(local: LocalDatabase, table: "trader_bills" | "farmer_bills", id: string) {
  return scalar<string>(local, `SELECT payment_status FROM ${table} WHERE id = ?`, id);
}

describe("stall-service cash, bank, and cheque payments", () => {
  it("records a buyer cash partial receipt once, then settles the remainder by bank transfer", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "buyer.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const sale = await finalizeSale(app, world, { key: "pay-sale-1" });

    const before = await getObligations(app, "trader", world.traderId);
    expect(before.accountBalanceMinor).toBe(SALE_TOTAL);
    expect(before.obligations).toHaveLength(1);
    expect(before.obligations[0]).toMatchObject({
      obligationKind: "trader_bill",
      targetId: sale.traderBillId,
      remainingMinor: SALE_TOTAL,
    });
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("unpaid");

    const cashBody = receiptBody(world.traderId, 1_000_000, [
      { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 1_000_000 },
    ]);
    const preview = await previewPayment(app, cashBody);
    expect(preview).toMatchObject({
      allocatedTotalMinor: 1_000_000,
      unappliedAmountMinor: 0,
      accountBalanceBeforeMinor: SALE_TOTAL,
      accountBalanceAfterMinor: 1_500_000,
      blockingErrors: [],
    });
    expect(preview.allocations[0].remainingAfterMinor).toBe(1_500_000);
    // Preview has no financial effect and consumes no reference.
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(0);
    expect(paymentLedgerCount(local)).toBe(0);
    expect(await getBalance(app, "trader", world.traderId)).toBe(SALE_TOTAL);

    const first = await app.inject({
      method: "POST",
      url: "/payments",
      payload: { ...cashBody, previewFingerprint: preview.previewFingerprint },
      headers: mutationHeaders("pay-buyer-cash"),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().payment).toMatchObject({
      referenceNumber: "R-100001",
      direction: "receive",
      method: "cash",
      amountMinor: 1_000_000,
      status: "posted",
      allocatedTotalMinor: 1_000_000,
      unappliedAmountMinor: 0,
    });

    expect(paymentLedgerCount(local)).toBe(1);
    expect(
      scalar<number>(
        local,
        `SELECT e.amount_minor FROM ledger_entries e
         INNER JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.source_type = 'payment'`,
      ),
    ).toBe(-1_000_000);
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("partially_paid");
    expect(await getBalance(app, "trader", world.traderId)).toBe(1_500_000);

    const bankBody = receiptBody(
      world.traderId,
      1_500_000,
      [
        {
          obligationKind: "trader_bill",
          targetId: sale.traderBillId,
          appliedAmountMinor: 1_500_000,
        },
      ],
      {
        method: "bank_transfer",
        bankTransferReference: "TXN-8841",
        bankTransferDate: "2026-11-11",
        bankAccountLabel: "Main account",
      },
    );
    const second = await postPayment(app, bankBody, "pay-buyer-bank");
    expect(second.posted.statusCode).toBe(201);
    expect(second.posted.json().payment).toMatchObject({
      referenceNumber: "R-100002",
      method: "bank_transfer",
      bankTransferReference: "TXN-8841",
      bankAccountLabel: "Main account",
    });
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("fully_paid");
    expect(await getBalance(app, "trader", world.traderId)).toBe(0);
    expect((await getObligations(app, "trader", world.traderId)).obligations).toEqual([]);
    expect(paymentLedgerCount(local)).toBe(2);

    // Audit + outbox commit with each payment; allocation events are not additional cash movement.
    const events = local.db
      .prepare(`SELECT event_type, payload_json FROM sync_outbox ORDER BY local_sequence`)
      .all() as Array<{ event_type: string; payload_json: string }>;
    const postedEvents = events.filter((event) => event.event_type === "polivo.payment.posted");
    const allocationEvents = events.filter(
      (event) => event.event_type === "polivo.payment.allocation_created",
    );
    expect(postedEvents).toHaveLength(2);
    expect(allocationEvents).toHaveLength(2);
    expect(JSON.parse(allocationEvents[0]!.payload_json).representsCashMovement).toBe(false);
    expect(
      scalar<number>(local, `SELECT COUNT(*) FROM audit_events WHERE action = 'payment.posted'`),
    ).toBe(2);

    const detail = await app.inject({
      method: "GET",
      url: `/payments/${first.json().payment.paymentId}`,
      headers: AUTH_HEADERS,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().allocations).toHaveLength(1);

    const list = await app.inject({
      method: "GET",
      url: "/payments?limit=1",
      headers: AUTH_HEADERS,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().totalCount).toBe(2);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().nextCursor).not.toBeNull();
    const nextPage = await app.inject({
      method: "GET",
      url: `/payments?limit=1&cursor=${encodeURIComponent(list.json().nextCursor)}`,
      headers: AUTH_HEADERS,
    });
    expect(nextPage.statusCode).toBe(200);
    expect(nextPage.json().items[0].paymentId).not.toBe(list.json().items[0].paymentId);
  });

  it("pays a farmer against the source sale line after bill issue without a duplicate obligation", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "farmer.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    await finalizeSale(app, world, { key: "pay-farmer-sale" });

    const unbilled = await getObligations(app, "farmer", world.farmerId);
    expect(unbilled.accountBalanceMinor).toBe(FARMER_RECEIVES);
    expect(unbilled.obligations).toHaveLength(1);
    const lineId = unbilled.obligations[0]!.targetId;
    expect(unbilled.obligations[0]).toMatchObject({
      obligationKind: "farmer_sale_line",
      remainingMinor: FARMER_RECEIVES,
      farmerBillId: null,
    });

    const billPreview = await app.inject({
      method: "POST",
      url: "/farmer-bills/preview",
      payload: { farmerId: world.farmerId, sourceLineIds: [lineId] },
      headers: AUTH_HEADERS,
    });
    expect(billPreview.statusCode).toBe(200);
    const issued = await app.inject({
      method: "POST",
      url: "/farmer-bills/issue",
      payload: {
        farmerId: world.farmerId,
        sourceLineIds: [lineId],
        expectedSelectionFingerprint: billPreview.json().selectionFingerprint,
      },
      headers: mutationHeaders("pay-farmer-bill-issue"),
    });
    expect(issued.statusCode).toBe(201);
    const farmerBillId = issued.json().farmerBillId as string;
    // Issuing a farmer bill never posts the ledger again.
    expect(await getBalance(app, "farmer", world.farmerId)).toBe(FARMER_RECEIVES);

    const billed = await getObligations(app, "farmer", world.farmerId);
    expect(billed.obligations).toHaveLength(1);
    expect(billed.obligations[0]).toMatchObject({ targetId: lineId, farmerBillId });

    const firstBody = payoutBody(world.farmerId, 1_000_000, [
      { obligationKind: "farmer_sale_line", targetId: lineId, appliedAmountMinor: 1_000_000 },
    ]);
    const first = await postPayment(app, firstBody, "pay-farmer-1");
    expect(first.posted.statusCode).toBe(201);
    expect(first.posted.json().payment).toMatchObject({
      referenceNumber: "P-100001",
      direction: "pay",
      partyKind: "farmer",
    });
    expect(
      scalar<number>(
        local,
        `SELECT e.amount_minor FROM ledger_entries e
         INNER JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.source_type = 'payment'`,
      ),
    ).toBe(-1_000_000);
    expect(billStatus(local, "farmer_bills", farmerBillId)).toBe("partially_paid");
    expect(await getBalance(app, "farmer", world.farmerId)).toBe(FARMER_RECEIVES - 1_000_000);

    const rest = FARMER_RECEIVES - 1_000_000;
    const second = await postPayment(
      app,
      payoutBody(world.farmerId, rest, [
        { obligationKind: "farmer_sale_line", targetId: lineId, appliedAmountMinor: rest },
      ]),
      "pay-farmer-2",
    );
    expect(second.posted.statusCode).toBe(201);
    expect(second.posted.json().payment.referenceNumber).toBe("P-100002");
    expect(billStatus(local, "farmer_bills", farmerBillId)).toBe("fully_paid");
    expect(await getBalance(app, "farmer", world.farmerId)).toBe(0);
    expect((await getObligations(app, "farmer", world.farmerId)).obligations).toEqual([]);
  });

  it("settles a farmer cheque on physical handover without a second clearance posting", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "cheque.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    await finalizeSale(app, world, { key: "pay-cheque-sale" });
    const obligations = await getObligations(app, "farmer", world.farmerId);
    const lineId = obligations.obligations[0]!.targetId;

    const partialBody = chequePayoutBody(world.farmerId, 400_000, [
      { obligationKind: "farmer_sale_line", targetId: lineId, appliedAmountMinor: 400_000 },
    ]);
    const preview = await previewPayment(app, partialBody);
    expect(preview.settlementExplanation).toMatch(/handover counts the cheque amount as paid/i);
    expect(preview.chequeNumber).toBe("001234");
    expect(preview.recognitionBasis).toBe("physical_handover");
    expect(preview.blockingErrors).toEqual([]);

    const first = await postPayment(app, partialBody, "pay-cheque-1");
    expect(first.posted.statusCode).toBe(201);
    expect(first.posted.json().payment).toMatchObject({
      method: "cheque",
      chequeNumber: "001234",
      issuingBankLabel: "People's Bank",
      physicalHandoverDate: "2026-11-11",
      recognitionBasis: "physical_handover",
      referenceNumber: "P-100001",
    });
    expect(paymentLedgerCount(local)).toBe(1);
    expect(await getBalance(app, "farmer", world.farmerId)).toBe(FARMER_RECEIVES - 400_000);
    expect(
      scalar<string>(
        local,
        `SELECT cheque_number FROM payments WHERE reference_number = 'P-100001'`,
      ),
    ).toBe("001234");

    const retry = await app.inject({
      method: "POST",
      url: "/payments",
      payload: {
        ...partialBody,
        previewFingerprint: first.preview.previewFingerprint,
        physicalHandoverConfirmed: true,
      },
      headers: mutationHeaders("pay-cheque-1"),
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json().payment.paymentId).toBe(first.posted.json().payment.paymentId);
    expect(paymentLedgerCount(local)).toBe(1);

    const rest = FARMER_RECEIVES - 400_000;
    const second = await postPayment(
      app,
      chequePayoutBody(
        world.farmerId,
        rest,
        [{ obligationKind: "farmer_sale_line", targetId: lineId, appliedAmountMinor: rest }],
        { chequeNumber: "001235" },
      ),
      "pay-cheque-2",
    );
    expect(second.posted.statusCode).toBe(201);
    expect(await getBalance(app, "farmer", world.farmerId)).toBe(0);
    expect(paymentLedgerCount(local)).toBe(2);

    const duplicatePreview = await previewPayment(
      app,
      chequePayoutBody(world.farmerId, 1_000, [], { chequeNumber: "001234" }),
    );
    expect(duplicatePreview.warnings).toHaveLength(1);
    expect(duplicatePreview.warnings[0].code).toBe("DUPLICATE_CHEQUE_METADATA");
    expect(duplicatePreview.warnings[0].matchingReferenceNumbers).toContain("P-100001");

    const futureHandover = await app.inject({
      method: "POST",
      url: "/payments/preview",
      payload: chequePayoutBody(world.farmerId, 1_000, [], {
        physicalHandoverDate: "2099-01-01",
        chequeNumber: "009999",
      }),
      headers: AUTH_HEADERS,
    });
    expect(futureHandover.statusCode).toBe(200);
    expect(futureHandover.json().blockingErrors.join(" ")).toMatch(/future/i);

    const withoutConfirm = await app.inject({
      method: "POST",
      url: "/payments",
      payload: {
        ...chequePayoutBody(world.farmerId, 1_000, [], { chequeNumber: "008888" }),
        previewFingerprint: "a".repeat(64),
      },
      headers: mutationHeaders("pay-cheque-no-confirm"),
    });
    expect(withoutConfirm.statusCode).toBe(400);

    const reversed = await app.inject({
      method: "POST",
      url: "/payments/reversals/preview",
      payload: {
        paymentId: first.posted.json().payment.paymentId,
        reason: "Payment-record reversal for test cheque",
      },
      headers: AUTH_HEADERS,
    });
    expect(reversed.statusCode).toBe(200);
    const reverseCommit = await app.inject({
      method: "POST",
      url: "/payments/reversals",
      payload: {
        paymentId: first.posted.json().payment.paymentId,
        reason: "Payment-record reversal for test cheque",
        previewFingerprint: reversed.json().previewFingerprint,
      },
      headers: mutationHeaders("pay-cheque-reverse"),
    });
    expect(reverseCommit.statusCode).toBe(200);
    expect(reverseCommit.json().originalPayment.status).toBe("reversed");
    expect(reverseCommit.json().reversalPayment.chequeNumber).toBe("001234");
    expect(await getBalance(app, "farmer", world.farmerId)).toBe(400_000);

    const listCheque = await app.inject({
      method: "GET",
      url: "/payments?method=cheque&direction=pay",
      headers: AUTH_HEADERS,
    });
    expect(listCheque.statusCode).toBe(200);
    expect(
      listCheque.json().items.every((item: { method: string }) => item.method === "cheque"),
    ).toBe(true);
  });

  it("settles opening balances separately and proposes oldest-first for preview only", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "opening.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const buyer2 = await createParty(app, "buyers", "B2", "Buyer Two", "pay-seed-buyer-2");
    const openingId = await postOpening(app, "trader", buyer2, 300_000, "pay-open-b2", "OB-B2");
    const sale = await finalizeSale(app, world, {
      traderId: buyer2,
      rows: SMALL_SALE_ROWS,
      key: "pay-sale-b2",
    });

    const listed = await getObligations(app, "trader", buyer2);
    expect(listed.accountBalanceMinor).toBe(300_000 + SMALL_SALE_TOTAL);
    expect(listed.obligations.map((item) => item.obligationKind)).toEqual([
      "opening_balance",
      "trader_bill",
    ]);
    expect(listed.obligations[0]).toMatchObject({ targetId: openingId, remainingMinor: 300_000 });

    // Oldest-first (opening cutoff 2026-11-01, sale 2026-11-10) is a preview-only proposal.
    const proposal = await previewPayment(
      app,
      receiptBody(buyer2, 400_000, [], { proposeOldestFirst: true }),
    );
    expect(proposal.blockingErrors).toEqual([]);
    expect(proposal.allocations).toMatchObject([
      { obligationKind: "opening_balance", targetId: openingId, appliedAmountMinor: 300_000 },
      { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 100_000 },
    ]);

    const proposedBody = receiptBody(buyer2, 400_000, [], { proposeOldestFirst: true });
    const rejected = await app.inject({
      method: "POST",
      url: "/payments",
      payload: { ...proposedBody, previewFingerprint: proposal.previewFingerprint },
      headers: mutationHeaders("pay-b2-proposal"),
    });
    expect(rejected.statusCode).toBe(400);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(0);

    const explicit = receiptBody(
      buyer2,
      400_000,
      proposal.allocations.map(
        (item: {
          obligationKind: Obligation["obligationKind"];
          targetId: string;
          appliedAmountMinor: number;
        }) => ({
          obligationKind: item.obligationKind,
          targetId: item.targetId,
          appliedAmountMinor: item.appliedAmountMinor,
        }),
      ),
    );
    const posted = await postPayment(app, explicit, "pay-b2-explicit");
    expect(posted.posted.statusCode).toBe(201);
    expect(await getBalance(app, "trader", buyer2)).toBe(300_000 + SMALL_SALE_TOTAL - 400_000);
    const after = await getObligations(app, "trader", buyer2);
    expect(after.obligations).toHaveLength(1);
    expect(after.obligations[0]).toMatchObject({
      obligationKind: "trader_bill",
      remainingMinor: SMALL_SALE_TOTAL - 100_000,
    });
    // Opening balance is fully settled; the trader bill is only partly settled.
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("partially_paid");
  });

  it("replays an idempotent retry and rejects a reused key with a different payload", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "idem.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const sale = await finalizeSale(app, world, { key: "pay-idem-sale" });
    const body = receiptBody(world.traderId, 500_000, [
      { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 500_000 },
    ]);
    const preview = await previewPayment(app, body);
    const request = {
      method: "POST" as const,
      url: "/payments",
      payload: { ...body, previewFingerprint: preview.previewFingerprint },
      headers: mutationHeaders("pay-idem-1"),
    };
    const first = await app.inject(request);
    const retry = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().payment.paymentId).toBe(first.json().payment.paymentId);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(1);
    expect(paymentLedgerCount(local)).toBe(1);
    expect(await getBalance(app, "trader", world.traderId)).toBe(SALE_TOTAL - 500_000);

    const different = await app.inject({
      ...request,
      payload: {
        ...body,
        amountMinor: 600_000,
        allocations: [
          {
            obligationKind: "trader_bill",
            targetId: sale.traderBillId,
            appliedAmountMinor: 600_000,
          },
        ],
        previewFingerprint: preview.previewFingerprint,
      },
    });
    expect(different.statusCode).toBe(409);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(1);

    // Outcome lookup (lost response recovery) returns the stored operation summary.
    const outcome = await app.inject({
      method: "GET",
      url: "/payments/operations/pay-idem-1",
      headers: AUTH_HEADERS,
    });
    expect(outcome.statusCode).toBe(200);
    expect(outcome.json()).toEqual({
      paymentId: first.json().payment.paymentId,
      referenceNumber: "R-100001",
      postingId: first.json().payment.postingId,
      status: "posted",
    });
    const typed = await app.inject({
      method: "GET",
      url: "/payments/operations/pay-idem-1?commandType=post",
      headers: AUTH_HEADERS,
    });
    expect(typed.statusCode).toBe(200);
    const wrongType = await app.inject({
      method: "GET",
      url: "/payments/operations/pay-idem-1?commandType=reverse",
      headers: AUTH_HEADERS,
    });
    expect(wrongType.statusCode).toBe(404);
    const missing = await app.inject({
      method: "GET",
      url: "/payments/operations/never-used",
      headers: AUTH_HEADERS,
    });
    expect(missing.statusCode).toBe(404);
  });

  it("keeps excess as unapplied credit and allocates it later without moving the account", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "unapplied.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const sale = await finalizeSale(app, world, { key: "pay-unapplied-sale" });

    // 1,000,000 received with nothing allocated: the whole amount is unapplied credit.
    const posted = await postPayment(
      app,
      receiptBody(world.traderId, 1_000_000, []),
      "pay-unapplied-1",
    );
    expect(posted.posted.statusCode).toBe(201);
    const paymentId = posted.posted.json().payment.paymentId as string;
    expect(posted.posted.json().payment).toMatchObject({
      allocatedTotalMinor: 0,
      unappliedAmountMinor: 1_000_000,
    });
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("unpaid");
    expect(await getBalance(app, "trader", world.traderId)).toBe(SALE_TOTAL - 1_000_000);
    const ledgerBefore = paymentLedgerCount(local);
    const entriesBefore = scalar<number>(local, `SELECT COUNT(*) FROM ledger_entries`);

    const allocationBody = {
      paymentId,
      allocations: [
        { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 600_000 },
      ],
    };
    const preview = await app.inject({
      method: "POST",
      url: "/payments/allocate/preview",
      payload: allocationBody,
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      availableAmountMinor: 1_000_000,
      allocatedTotalMinor: 600_000,
      remainingUnappliedMinor: 400_000,
      accountBalanceUnchanged: true,
      blockingErrors: [],
    });

    const allocated = await app.inject({
      method: "POST",
      url: "/payments/allocate",
      payload: { ...allocationBody, previewFingerprint: preview.json().previewFingerprint },
      headers: mutationHeaders("pay-allocate-1"),
    });
    expect(allocated.statusCode).toBe(200);
    expect(allocated.json().payment).toMatchObject({
      allocatedTotalMinor: 600_000,
      unappliedAmountMinor: 400_000,
    });
    // No second ledger posting and no balance movement.
    expect(paymentLedgerCount(local)).toBe(ledgerBefore);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM ledger_entries`)).toBe(entriesBefore);
    expect(await getBalance(app, "trader", world.traderId)).toBe(SALE_TOTAL - 1_000_000);
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("partially_paid");
    expect(
      (await getObligations(app, "trader", world.traderId)).obligations[0]!.remainingMinor,
    ).toBe(SALE_TOTAL - 600_000);

    const retry = await app.inject({
      method: "POST",
      url: "/payments/allocate",
      payload: { ...allocationBody, previewFingerprint: preview.json().previewFingerprint },
      headers: mutationHeaders("pay-allocate-1"),
    });
    expect(retry.statusCode).toBe(200);
    expect(
      scalar<number>(
        local,
        `SELECT COUNT(*) FROM payment_allocations WHERE payment_id = ?`,
        paymentId,
      ),
    ).toBe(1);

    const allocateOutcome = await app.inject({
      method: "GET",
      url: "/payments/operations/pay-allocate-1?commandType=allocate",
      headers: AUTH_HEADERS,
    });
    expect(allocateOutcome.statusCode).toBe(200);
    expect(allocateOutcome.json().paymentId).toBe(paymentId);

    // Only the 400,000 still available can be allocated.
    const tooMuch = await app.inject({
      method: "POST",
      url: "/payments/allocate/preview",
      payload: {
        paymentId,
        allocations: [
          {
            obligationKind: "trader_bill",
            targetId: sale.traderBillId,
            appliedAmountMinor: 500_000,
          },
        ],
      },
      headers: AUTH_HEADERS,
    });
    expect(tooMuch.statusCode).toBe(200);
    expect(tooMuch.json().blockingErrors.length).toBeGreaterThan(0);
    const tooMuchCommit = await app.inject({
      method: "POST",
      url: "/payments/allocate",
      payload: {
        paymentId,
        allocations: [
          {
            obligationKind: "trader_bill",
            targetId: sale.traderBillId,
            appliedAmountMinor: 500_000,
          },
        ],
        previewFingerprint: tooMuch.json().previewFingerprint,
      },
      headers: mutationHeaders("pay-allocate-too-much"),
    });
    expect(tooMuchCommit.statusCode).toBe(409);
    expect(
      scalar<number>(
        local,
        `SELECT COUNT(*) FROM payment_allocations WHERE payment_id = ?`,
        paymentId,
      ),
    ).toBe(1);

    // Excess over the obligation stays as credit: 3,000,000 against a 2,500,000 bill.
    const settled = await postPayment(
      app,
      receiptBody(world.traderId, 3_000_000, [
        {
          obligationKind: "trader_bill",
          targetId: sale.traderBillId,
          appliedAmountMinor: SALE_TOTAL - 600_000,
        },
      ]),
      "pay-excess",
    );
    expect(settled.posted.statusCode).toBe(201);
    expect(settled.posted.json().payment.unappliedAmountMinor).toBe(
      3_000_000 - (SALE_TOTAL - 600_000),
    );
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("fully_paid");
    expect(await getBalance(app, "trader", world.traderId)).toBe(
      SALE_TOTAL - 1_000_000 - 3_000_000,
    );
  });

  it("reverses a payment exactly, reopens the obligation, and blocks a second reversal", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "reverse.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const sale = await finalizeSale(app, world, { key: "pay-reverse-sale" });

    const posted = await postPayment(
      app,
      receiptBody(world.traderId, 1_000_000, [
        {
          obligationKind: "trader_bill",
          targetId: sale.traderBillId,
          appliedAmountMinor: 1_000_000,
        },
      ]),
      "pay-reverse-original",
    );
    const original = posted.posted.json().payment;
    expect(await getBalance(app, "trader", world.traderId)).toBe(1_500_000);
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("partially_paid");

    const previewBody = { paymentId: original.paymentId, reason: "wrong buyer receipt" };
    const preview = await app.inject({
      method: "POST",
      url: "/payments/reversals/preview",
      payload: previewBody,
      headers: AUTH_HEADERS,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      originalAmountMinor: 1_000_000,
      accountBalanceBeforeMinor: 1_500_000,
      accountBalanceAfterMinor: SALE_TOTAL,
      blockingErrors: [],
    });
    expect(preview.json().allocationsToRelease).toHaveLength(1);
    expect(preview.json().obligationsReopening).toMatchObject([
      { targetId: sale.traderBillId, reopenAmountMinor: 1_000_000 },
    ]);
    // Previewing reserves no reference and moves no money.
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(1);

    const commitBody = { ...previewBody, previewFingerprint: preview.json().previewFingerprint };
    const reversed = await app.inject({
      method: "POST",
      url: "/payments/reversals",
      payload: commitBody,
      headers: mutationHeaders("pay-reverse-1"),
    });
    expect(reversed.statusCode).toBe(200);
    const { originalPayment, reversalPayment } = reversed.json();
    expect(originalPayment).toMatchObject({
      paymentId: original.paymentId,
      status: "reversed",
      reversedByPaymentId: reversalPayment.paymentId,
      allocatedTotalMinor: 0,
      unappliedAmountMinor: 0,
    });
    expect(reversalPayment).toMatchObject({
      referenceNumber: "R-100002",
      reversesPaymentId: original.paymentId,
      amountMinor: 1_000_000,
      status: "posted",
    });

    // Opposite ledger entry linked to the original entry, restoring the balance exactly.
    const reversalEntry = local.db
      .prepare(
        `SELECT e.amount_minor, e.reverses_entry_id, o.amount_minor AS original_amount, o.posting_id
         FROM ledger_entries e
         INNER JOIN ledger_entries o ON o.id = e.reverses_entry_id
         INNER JOIN ledger_postings p ON p.id = e.posting_id
         WHERE p.source_type = 'payment' AND p.financial_event_type = 'payment_reversed'`,
      )
      .get() as { amount_minor: number; reverses_entry_id: string; original_amount: number };
    expect(reversalEntry.amount_minor).toBe(1_000_000);
    expect(reversalEntry.original_amount).toBe(-1_000_000);
    expect(await getBalance(app, "trader", world.traderId)).toBe(SALE_TOTAL);
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("unpaid");
    const reopened = await getObligations(app, "trader", world.traderId);
    expect(reopened.obligations[0]).toMatchObject({
      remainingMinor: SALE_TOTAL,
      activeAllocatedMinor: 0,
    });
    // Allocation history is preserved, marked reversed.
    expect(
      scalar<string>(
        local,
        `SELECT status FROM payment_allocations WHERE payment_id = ?`,
        original.paymentId,
      ),
    ).toBe("reversed");
    expect(
      scalar<number>(
        local,
        `SELECT COUNT(*) FROM sync_outbox WHERE event_type = 'polivo.payment.reversed'`,
      ),
    ).toBe(1);

    const retry = await app.inject({
      method: "POST",
      url: "/payments/reversals",
      payload: commitBody,
      headers: mutationHeaders("pay-reverse-1"),
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().reversalPayment.paymentId).toBe(reversalPayment.paymentId);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(2);

    const reverseOutcome = await app.inject({
      method: "GET",
      url: "/payments/operations/pay-reverse-1?commandType=reverse",
      headers: AUTH_HEADERS,
    });
    expect(reverseOutcome.statusCode).toBe(200);
    expect(reverseOutcome.json().paymentId).toBe(reversalPayment.paymentId);

    // Double reverse (original and the reversal entry itself) is blocked.
    const second = await app.inject({
      method: "POST",
      url: "/payments/reversals/preview",
      payload: previewBody,
      headers: AUTH_HEADERS,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().blockingErrors.length).toBeGreaterThan(0);
    const secondCommit = await app.inject({
      method: "POST",
      url: "/payments/reversals",
      payload: { ...previewBody, previewFingerprint: preview.json().previewFingerprint },
      headers: mutationHeaders("pay-reverse-2"),
    });
    expect(secondCommit.statusCode).toBe(409);
    const reverseTheReversal = await app.inject({
      method: "POST",
      url: "/payments/reversals/preview",
      payload: { paymentId: reversalPayment.paymentId, reason: "undo the undo" },
      headers: AUTH_HEADERS,
    });
    expect(reverseTheReversal.json().blockingErrors.length).toBeGreaterThan(0);

    // A reversed payment cannot receive allocations.
    const allocateReversed = await app.inject({
      method: "POST",
      url: "/payments/allocate/preview",
      payload: {
        paymentId: original.paymentId,
        allocations: [
          { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 100 },
        ],
      },
      headers: AUTH_HEADERS,
    });
    expect(allocateReversed.json().blockingErrors.length).toBeGreaterThan(0);

    // The reopened obligation can be paid again; the reversed reference is never reused.
    const repay = await postPayment(
      app,
      receiptBody(world.traderId, SALE_TOTAL, [
        {
          obligationKind: "trader_bill",
          targetId: sale.traderBillId,
          appliedAmountMinor: SALE_TOTAL,
        },
      ]),
      "pay-reverse-repay",
    );
    expect(repay.posted.json().payment.referenceNumber).toBe("R-100003");
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("fully_paid");
  });

  it("denies reversal and cross-direction payments without the matching capability", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "authz.sqlite"));
    const owner = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(owner);
    const sale = await finalizeSale(owner, world, { key: "pay-authz-sale" });
    const body = receiptBody(world.traderId, 400_000, [
      { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 400_000 },
    ]);
    const posted = await postPayment(owner, body, "pay-authz-original");
    expect(posted.posted.statusCode).toBe(201);
    const paymentId = posted.posted.json().payment.paymentId as string;

    const cashier = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "cashier",
            deviceRef: "device-cashier",
            capabilities: new Set(["payments.receive_trader"]),
          },
        }),
      }),
    );

    const reversePreview = await cashier.inject({
      method: "POST",
      url: "/payments/reversals/preview",
      payload: { paymentId, reason: "cashier attempt" },
      headers: AUTH_HEADERS,
    });
    expect(reversePreview.statusCode).toBe(403);
    const reverseCommit = await cashier.inject({
      method: "POST",
      url: "/payments/reversals",
      payload: {
        paymentId,
        reason: "cashier attempt",
        previewFingerprint: "a".repeat(64),
      },
      headers: mutationHeaders("pay-authz-reverse"),
    });
    expect(reverseCommit.statusCode).toBe(403);
    expect(scalar<string>(local, `SELECT status FROM payments WHERE id = ?`, paymentId)).toBe(
      "posted",
    );

    // Receive-only cashier cannot record farmer payouts or view farmer obligations.
    const payoutPreview = await cashier.inject({
      method: "POST",
      url: "/payments/preview",
      payload: payoutBody(world.farmerId, 1_000, []),
      headers: AUTH_HEADERS,
    });
    expect(payoutPreview.statusCode).toBe(403);
    const farmerObligations = await cashier.inject({
      method: "GET",
      url: `/payments/obligations?partyKind=farmer&partyId=${world.farmerId}&direction=pay`,
      headers: AUTH_HEADERS,
    });
    expect(farmerObligations.statusCode).toBe(403);

    // The cashier can still collect from buyers and see receipts only.
    const buyerObligations = await cashier.inject({
      method: "GET",
      url: `/payments/obligations?partyKind=trader&partyId=${world.traderId}&direction=receive`,
      headers: AUTH_HEADERS,
    });
    expect(buyerObligations.statusCode).toBe(200);
    const history = await cashier.inject({
      method: "GET",
      url: "/payments?direction=pay",
      headers: AUTH_HEADERS,
    });
    expect(history.statusCode).toBe(403);
    const receipts = await cashier.inject({
      method: "GET",
      url: "/payments",
      headers: AUTH_HEADERS,
    });
    expect(receipts.statusCode).toBe(200);
    expect(receipts.json().totalCount).toBe(1);

    // No capability at all is denied everywhere.
    const nobody = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "nobody",
            deviceRef: "device-nobody",
            capabilities: new Set(["accounts.view"]),
          },
        }),
      }),
    );
    expect(
      (await nobody.inject({ method: "GET", url: "/payments", headers: AUTH_HEADERS })).statusCode,
    ).toBe(403);
    expect(
      (await nobody.inject({ method: "GET", url: `/payments/${paymentId}`, headers: AUTH_HEADERS }))
        .statusCode,
    ).toBe(403);

    const unauthenticated = await owner.inject({ method: "GET", url: "/payments" });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it("rejects a second payment that would over-allocate the same remaining amount", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "concurrent.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const sale = await finalizeSale(app, world, { key: "pay-race-sale" });

    // Both operators review 2,000,000 against the same 2,500,000 remaining; only one fits.
    const bodyA = receiptBody(world.traderId, 2_000_000, [
      { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 2_000_000 },
    ]);
    const bodyB = receiptBody(
      world.traderId,
      2_000_000,
      [
        {
          obligationKind: "trader_bill",
          targetId: sale.traderBillId,
          appliedAmountMinor: 2_000_000,
        },
      ],
      { note: "second terminal" },
    );
    const previewA = await previewPayment(app, bodyA);
    const previewB = await previewPayment(app, bodyB);
    expect(previewA.blockingErrors).toEqual([]);
    expect(previewB.blockingErrors).toEqual([]);

    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/payments",
        payload: { ...bodyA, previewFingerprint: previewA.previewFingerprint },
        headers: mutationHeaders("pay-race-a"),
      }),
      app.inject({
        method: "POST",
        url: "/payments",
        payload: { ...bodyB, previewFingerprint: previewB.previewFingerprint },
        headers: mutationHeaders("pay-race-b"),
      }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);

    // Failed operation left no partial payment, allocation, ledger posting, or consumed reference.
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(1);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payment_allocations`)).toBe(1);
    expect(paymentLedgerCount(local)).toBe(1);
    expect(await getBalance(app, "trader", world.traderId)).toBe(SALE_TOTAL - 2_000_000);
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("partially_paid");

    const next = await postPayment(
      app,
      receiptBody(world.traderId, 500_000, [
        { obligationKind: "trader_bill", targetId: sale.traderBillId, appliedAmountMinor: 500_000 },
      ]),
      "pay-race-next",
    );
    expect(next.posted.json().payment.referenceNumber).toBe("R-100002");
    expect(billStatus(local, "trader_bills", sale.traderBillId)).toBe("fully_paid");

    // Stale review: the same preview cannot be reused after obligations changed.
    const stale = await app.inject({
      method: "POST",
      url: "/payments",
      payload: { ...bodyA, previewFingerprint: previewA.previewFingerprint },
      headers: mutationHeaders("pay-race-stale"),
    });
    expect(stale.statusCode).toBe(409);
  });

  it("rejects buyer cheques, release/reassign endpoints, invalid methods, and bad allocations", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-pay-", "rules.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const world = await seedWorld(app);
    const sale = await finalizeSale(app, world, { key: "pay-rules-sale" });
    const allocations = [
      {
        obligationKind: "trader_bill" as const,
        targetId: sale.traderBillId,
        appliedAmountMinor: 1_000,
      },
    ];

    const chequePreview = await app.inject({
      method: "POST",
      url: "/payments/preview",
      payload: {
        ...receiptBody(world.traderId, 1_000, allocations),
        method: "cheque",
        chequeNumber: "001234",
        issuingBankLabel: "Bank",
        chequeDate: "2026-11-10",
        physicalHandoverDate: "2026-11-11",
      },
      headers: AUTH_HEADERS,
    });
    expect(chequePreview.statusCode).toBe(400);
    expect(chequePreview.json().message).toMatch(/cheque/i);
    const chequePost = await app.inject({
      method: "POST",
      url: "/payments",
      payload: {
        ...receiptBody(world.traderId, 1_000, allocations),
        method: "cheque",
        chequeNumber: "001234",
        issuingBankLabel: "Bank",
        chequeDate: "2026-11-10",
        physicalHandoverDate: "2026-11-11",
        physicalHandoverConfirmed: true,
        previewFingerprint: "a".repeat(64),
      },
      headers: mutationHeaders("pay-rules-cheque"),
    });
    expect(chequePost.statusCode).toBe(400);
    expect(chequePost.json().message).toMatch(/cheque/i);

    for (const url of [
      "/payments/allocations/release",
      "/payments/allocations/reassign",
      "/payments/allocate/release",
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        payload: {},
        headers: mutationHeaders(`pay-rules-${url}`),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].code).toBe("UNSUPPORTED_OPERATION");
    }

    const missingBankMetadata = await app.inject({
      method: "POST",
      url: "/payments/preview",
      payload: { ...receiptBody(world.traderId, 1_000, allocations), method: "bank_transfer" },
      headers: AUTH_HEADERS,
    });
    expect(missingBankMetadata.statusCode).toBe(400);

    const wrongDirection = await app.inject({
      method: "POST",
      url: "/payments/preview",
      payload: { ...receiptBody(world.traderId, 1_000, allocations), direction: "pay" },
      headers: AUTH_HEADERS,
    });
    expect(wrongDirection.statusCode).toBe(400);

    const missingKey = await app.inject({
      method: "POST",
      url: "/payments",
      payload: {
        ...receiptBody(world.traderId, 1_000, allocations),
        previewFingerprint: "a".repeat(64),
      },
      headers: AUTH_HEADERS,
    });
    expect(missingKey.statusCode).toBe(400);

    const duplicateTargets = await previewPayment(
      app,
      receiptBody(world.traderId, 2_000, [...allocations, ...allocations]),
    );
    expect(duplicateTargets.blockingErrors.length).toBeGreaterThan(0);
    const overRemaining = await previewPayment(
      app,
      receiptBody(world.traderId, SALE_TOTAL + 1, [
        { ...allocations[0]!, appliedAmountMinor: SALE_TOTAL + 1 },
      ]),
    );
    expect(overRemaining.blockingErrors.length).toBeGreaterThan(0);
    const overPayment = await previewPayment(
      app,
      receiptBody(world.traderId, 500, [{ ...allocations[0]!, appliedAmountMinor: 1_000 }]),
    );
    expect(overPayment.blockingErrors.length).toBeGreaterThan(0);
    const unknownTarget = await previewPayment(
      app,
      receiptBody(world.traderId, 1_000, [
        { obligationKind: "trader_bill", targetId: "not-a-bill", appliedAmountMinor: 1_000 },
      ]),
    );
    expect(unknownTarget.blockingErrors.length).toBeGreaterThan(0);

    const blockedCommit = await app.inject({
      method: "POST",
      url: "/payments",
      payload: {
        ...receiptBody(world.traderId, SALE_TOTAL + 1, [
          { ...allocations[0]!, appliedAmountMinor: SALE_TOTAL + 1 },
        ]),
        previewFingerprint: overRemaining.previewFingerprint,
      },
      headers: mutationHeaders("pay-rules-blocked"),
    });
    expect(blockedCommit.statusCode).toBe(409);
    expect(scalar<number>(local, `SELECT COUNT(*) FROM payments`)).toBe(0);
    expect(paymentLedgerCount(local)).toBe(0);

    const missingBuyer = await app.inject({
      method: "POST",
      url: "/payments/preview",
      payload: receiptBody("no-such-buyer", 1_000, []),
      headers: AUTH_HEADERS,
    });
    expect(missingBuyer.statusCode).toBe(404);
  });
});
