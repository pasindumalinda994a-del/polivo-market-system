import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PAYMENT_CHEQUE_RECOGNITION_BASIS,
  syncPaymentPostedV2PayloadSchema,
  syncSaleCorrectedV2PayloadSchema,
} from "@polivo/contracts";
import {
  finalizeSaleWithExpectedRevision,
  initializeNewDatabase,
  insertBuyer,
  insertFarmer,
  insertFinalizedTraderBill,
  insertPackageType,
  insertPayment,
  insertSaleCorrectionOperation,
  insertSaleDraft,
  insertVegetable,
  postLedgerEntries,
  runInTransaction,
  type LocalDatabase,
  type OutboxEventRecord,
} from "@polivo/db-local";
import { afterEach, describe, expect, it } from "vitest";

import { enrichOutboxEventForUpload } from "./enrich.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

const FINGERPRINT = "a".repeat(64);
const STALL_ID = "stall-1";
const TENANT_ID = "tenant-1";
const NOW = "2026-11-13T12:00:00.000Z";
const BUSINESS_DATE = "2026-11-13";

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

function createBoundDb(): LocalDatabase {
  const root = mkdtempSync(join(tmpdir(), "polivo-enrich-"));
  tempRoots.push(root);
  const local = track(initializeNewDatabase(join(root, "test.sqlite")));
  local.db
    .prepare(
      `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at)
       VALUES (1, ?, ?, ?)`,
    )
    .run(STALL_ID, TENANT_ID, NOW);
  return local;
}

function seedMasters(local: LocalDatabase): void {
  insertFarmer(local, {
    id: "farmer-1",
    stallId: STALL_ID,
    shortCode: "F1",
    displayName: "Farmer One",
    contactNumber: null,
    locality: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  insertBuyer(local, {
    id: "trader-1",
    stallId: STALL_ID,
    shortCode: "T1",
    displayName: "Buyer One",
    contactNumber: null,
    locality: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  insertVegetable(local, {
    id: "veg-1",
    stallId: STALL_ID,
    shortCode: "CARROT",
    displayName: "Carrot",
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  insertPackageType(local, {
    id: "pkg-1",
    stallId: STALL_ID,
    shortCode: "BAG",
    displayName: "Bag",
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

/**
 * Seed a source sale header (FK only) plus a fully finalized replacement sale,
 * reversal + replacement ledger postings, and a committed correction operation.
 */
function seedCorrectedSaleWorld(local: LocalDatabase): {
  operationId: string;
  sourceSaleId: string;
  replacementSaleId: string;
  reversalPostingId: string;
  replacementPostingId: string;
  replacementTraderBillId: string;
} {
  const sourceSaleId = "sale-src";
  const replacementSaleId = "sale-repl";
  const lineId = "line-repl-1";
  const reversalPostingId = "post-rev";
  const replacementPostingId = "post-repl";
  const replacementTraderBillId = "tb-repl";
  const operationId = "op-correct-1";

  local.db
    .prepare(
      `INSERT INTO sales (
         id, stall_id, trader_id, business_date, status, revision,
         corrects_sale_id, finalized_at, created_at, updated_at
       ) VALUES (?, ?, 'trader-1', ?, 'finalized', 2, NULL, ?, ?, ?)`,
    )
    .run(sourceSaleId, STALL_ID, BUSINESS_DATE, NOW, NOW, NOW);

  runInTransaction(local.db, (tx) => {
    insertSaleDraft(tx, {
      id: replacementSaleId,
      stallId: STALL_ID,
      traderId: "trader-1",
      businessDate: BUSINESS_DATE,
      correctsSaleId: sourceSaleId,
      lines: [
        {
          id: lineId,
          farmerId: "farmer-1",
          vegetableId: "veg-1",
          packageTypeId: "pkg-1",
          unitPricePerKgMinor: 25_000,
          packagingWeightHundredths: 0,
          notes: null,
          weights: [
            {
              id: "w-repl-1",
              rowKey: "a",
              packageIndex: 1,
              grossWeightHundredths: 10_000,
            },
          ],
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    });

    postLedgerEntries(tx, {
      postingId: replacementPostingId,
      stallId: STALL_ID,
      sourceType: "sale",
      sourceId: replacementSaleId,
      financialEventType: "sale_replaced",
      eventSequence: 1,
      businessDate: BUSINESS_DATE,
      recordedAt: NOW,
      actorStaffId: "staff-1",
      description: "Replacement sale",
      currency: "LKR",
      entries: [
        {
          entryId: "entry-repl-trader",
          partyKind: "trader",
          partyId: "trader-1",
          amountMinor: 110_000,
        },
        {
          entryId: "entry-repl-farmer",
          partyKind: "farmer",
          partyId: "farmer-1",
          amountMinor: -100_000,
        },
      ],
    });

    finalizeSaleWithExpectedRevision(tx, {
      stallId: STALL_ID,
      saleId: replacementSaleId,
      expectedRevision: 1,
      traderShortCode: "T1",
      traderDisplayName: "Buyer One",
      commissionPolicyId: "policy-1",
      commissionVersionId: "policy-ver-1",
      calculationFingerprint: FINGERPRINT,
      postingId: replacementPostingId,
      totalSaleAmountMinor: 100_000,
      totalCommissionMinor: 10_000,
      totalTraderPaysMinor: 110_000,
      totalFarmerReceivesMinor: 100_000,
      lineSnapshots: [
        {
          lineId,
          farmerId: "farmer-1",
          farmerShortCode: "F1",
          farmerDisplayName: "Farmer One",
          vegetableShortCode: "CARROT",
          vegetableDisplayName: "Carrot",
          packageTypeId: "pkg-1",
          packageTypeShortCode: "BAG",
          packageTypeDisplayName: "Bag",
          grossWeightHundredths: 10_000,
          netWeightHundredths: 10_000,
          lineSaleAmountMinor: 100_000,
          appliedCommissionRatePerKgMinor: 1_000,
          appliedCommissionAmountMinor: 10_000,
          commissionPolicyId: "policy-1",
          commissionVersionId: "policy-ver-1",
          commissionBandId: "band-1",
          traderPaysMinor: 110_000,
          farmerReceivesMinor: 100_000,
        },
      ],
      finalizedAt: NOW,
      updatedAt: NOW,
    });

    insertFinalizedTraderBill(tx, {
      id: replacementTraderBillId,
      stallId: STALL_ID,
      saleId: replacementSaleId,
      traderId: "trader-1",
      traderShortCode: "T1",
      traderDisplayName: "Buyer One",
      stallDisplayName: "Test Stall",
      stallAddress: null,
      billNumber: "T-444444",
      businessDate: BUSINESS_DATE,
      totalAmountMinor: 110_000,
      totalCommissionMinor: 10_000,
      totalFarmerReceivesMinor: 100_000,
      commissionPolicyId: "policy-1",
      commissionVersionId: "policy-ver-1",
      calculationFingerprint: FINGERPRINT,
      postingId: replacementPostingId,
      finalizedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });

    postLedgerEntries(tx, {
      postingId: reversalPostingId,
      stallId: STALL_ID,
      sourceType: "sale",
      sourceId: sourceSaleId,
      financialEventType: "sale_reversed",
      eventSequence: 1,
      businessDate: BUSINESS_DATE,
      recordedAt: NOW,
      actorStaffId: "staff-1",
      description: "Sale reversal",
      currency: "LKR",
      entries: [
        {
          entryId: "entry-rev-trader",
          partyKind: "trader",
          partyId: "trader-1",
          amountMinor: -110_000,
        },
        {
          entryId: "entry-rev-farmer",
          partyKind: "farmer",
          partyId: "farmer-1",
          amountMinor: 100_000,
        },
      ],
    });

    insertSaleCorrectionOperation(tx, {
      id: operationId,
      stallId: STALL_ID,
      action: "correct",
      sourceSaleId,
      replacementSaleId,
      reason: "Weight correction",
      actorStaffId: "staff-1",
      recordedAt: NOW,
      businessDate: BUSINESS_DATE,
      previewFingerprint: FINGERPRINT,
      sourceRevisionExpected: 2,
      reversalPostingId,
      replacementPostingId,
      originalTraderBillId: null,
      replacementTraderBillId,
      createdAt: NOW,
    });
  });

  return {
    operationId,
    sourceSaleId,
    replacementSaleId,
    reversalPostingId,
    replacementPostingId,
    replacementTraderBillId,
  };
}

function thinCorrectedOutboxEvent(world: ReturnType<typeof seedCorrectedSaleWorld>): OutboxEventRecord {
  return {
    eventId: "evt-sale-corrected-1",
    tenantId: TENANT_ID,
    stallId: STALL_ID,
    originatingDeviceId: "host-1",
    eventType: "polivo.sale.corrected",
    eventSchemaVersion: "1",
    payloadJson: JSON.stringify({
      operationId: world.operationId,
      sourceSaleId: world.sourceSaleId,
      replacementSaleId: world.replacementSaleId,
      reversalPostingId: world.reversalPostingId,
      replacementPostingId: world.replacementPostingId,
      originalTraderBillId: null,
      replacementTraderBillId: world.replacementTraderBillId,
      reason: "Weight correction",
      businessDate: BUSINESS_DATE,
      recordedAt: NOW,
    }),
    occurredAt: NOW,
    localSequence: 25,
    transactionGroupId: "grp-correct-1",
    deliveryAttempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lastErrorCode: null,
    ackState: "pending",
    acknowledgedAt: null,
    ackReceiptJson: null,
    ackPayloadHash: null,
  };
}

afterEach(() => {
  while (openLocals.length > 0) {
    try {
      openLocals.pop()?.close();
    } catch {
      // ignore
    }
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
});

describe("enrichOutboxEventForUpload — polivo.sale.corrected", () => {
  it("rebuilds a full replacement.summary that passes syncSaleCorrectedV2PayloadSchema", () => {
    const local = createBoundDb();
    seedMasters(local);
    const world = seedCorrectedSaleWorld(local);

    const enriched = enrichOutboxEventForUpload(local, thinCorrectedOutboxEvent(world));

    expect(enriched.eventSchemaVersion).toBe("2");
    expect(enriched.eventType).toBe("polivo.sale.corrected");

    const parsed = syncSaleCorrectedV2PayloadSchema.safeParse(enriched.payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }

    const summary = parsed.data.replacement.summary;
    expect(summary).toMatchObject({
      saleId: world.replacementSaleId,
      traderBillId: world.replacementTraderBillId,
      billNumber: "T-444444",
      traderId: "trader-1",
      businessDate: BUSINESS_DATE,
      totalAmountMinor: 110_000,
      totalCommissionMinor: 10_000,
      postingId: world.replacementPostingId,
      commissionPolicyId: "policy-1",
      commissionVersionId: "policy-ver-1",
      calculationFingerprint: FINGERPRINT,
      lineCount: 1,
    });
  });
});

type SeededPayment = {
  paymentId: string;
  postingId: string;
  method: "cash" | "cheque";
  chequeNumber: string | null;
};

function seedPostedPayment(
  local: LocalDatabase,
  input: {
    paymentId: string;
    postingId: string;
    method: "cash" | "cheque";
    referenceNumber: string;
    chequeNumber?: string | null;
    issuingBankLabel?: string | null;
    chequeDate?: string | null;
    physicalHandoverDate?: string | null;
  },
): SeededPayment {
  runInTransaction(local.db, (tx) => {
    postLedgerEntries(tx, {
      postingId: input.postingId,
      stallId: STALL_ID,
      sourceType: "payment",
      sourceId: input.paymentId,
      financialEventType: "payment_posted",
      eventSequence: 1,
      businessDate: BUSINESS_DATE,
      recordedAt: NOW,
      actorStaffId: "staff-1",
      description: "Payment",
      currency: "LKR",
      entries: [
        {
          entryId: `${input.postingId}-entry`,
          partyKind: "trader",
          partyId: "trader-1",
          amountMinor: -100_000,
        },
      ],
    });

    insertPayment(tx, {
      id: input.paymentId,
      stallId: STALL_ID,
      partyKind: "trader",
      farmerId: null,
      traderId: "trader-1",
      direction: "receive",
      method: input.method,
      amountMinor: 100_000,
      businessDate: BUSINESS_DATE,
      referenceNumber: input.referenceNumber,
      status: "posted",
      paidAt: NOW,
      recordedAt: NOW,
      actorStaffId: "staff-1",
      postingId: input.postingId,
      chequeNumber: input.chequeNumber ?? null,
      issuingBankLabel: input.issuingBankLabel ?? null,
      chequeDate: input.chequeDate ?? null,
      physicalHandoverDate: input.physicalHandoverDate ?? null,
      createdAt: NOW,
    });
  });

  return {
    paymentId: input.paymentId,
    postingId: input.postingId,
    method: input.method,
    chequeNumber: input.chequeNumber ?? null,
  };
}

/** Legacy Phase 26 cash thin payload — cheque metadata keys omitted entirely. */
function thinLegacyCashPaymentOutbox(seeded: SeededPayment): OutboxEventRecord {
  return {
    eventId: "evt-pay-cash-legacy",
    tenantId: TENANT_ID,
    stallId: STALL_ID,
    originatingDeviceId: "host-1",
    eventType: "polivo.payment.posted",
    eventSchemaVersion: "1",
    payloadJson: JSON.stringify({
      schemaVersion: "1",
      tenantId: TENANT_ID,
      stallId: STALL_ID,
      paymentId: seeded.paymentId,
      referenceNumber: "R-100001",
      partyKind: "trader",
      partyId: "trader-1",
      direction: "receive",
      method: "cash",
      amountMinor: 100_000,
      currency: "LKR",
      businessDate: BUSINESS_DATE,
      recordedAt: NOW,
      postingId: seeded.postingId,
      actorStaffId: "staff-1",
      deviceId: null,
      allocatedTotalMinor: 100_000,
      unappliedAmountMinor: 0,
      // intentionally no chequeNumber / issuingBankLabel / chequeDate /
      // physicalHandoverDate / recognitionBasis
    }),
    occurredAt: NOW,
    localSequence: 32,
    transactionGroupId: "grp-pay-cash",
    deliveryAttempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lastErrorCode: null,
    ackState: "pending",
    acknowledgedAt: null,
    ackReceiptJson: null,
    ackPayloadHash: null,
  };
}

function thinChequePaymentOutbox(seeded: SeededPayment): OutboxEventRecord {
  return {
    eventId: "evt-pay-cheque",
    tenantId: TENANT_ID,
    stallId: STALL_ID,
    originatingDeviceId: "host-1",
    eventType: "polivo.payment.posted",
    eventSchemaVersion: "1",
    payloadJson: JSON.stringify({
      schemaVersion: "1",
      tenantId: TENANT_ID,
      stallId: STALL_ID,
      paymentId: seeded.paymentId,
      referenceNumber: "R-200001",
      partyKind: "trader",
      partyId: "trader-1",
      direction: "receive",
      method: "cheque",
      amountMinor: 100_000,
      currency: "LKR",
      businessDate: BUSINESS_DATE,
      recordedAt: NOW,
      postingId: seeded.postingId,
      actorStaffId: "staff-1",
      deviceId: null,
      allocatedTotalMinor: 100_000,
      unappliedAmountMinor: 0,
      chequeNumber: "001234",
      issuingBankLabel: "Test Bank",
      chequeDate: BUSINESS_DATE,
      physicalHandoverDate: BUSINESS_DATE,
      recognitionBasis: PAYMENT_CHEQUE_RECOGNITION_BASIS,
    }),
    occurredAt: NOW,
    localSequence: 34,
    transactionGroupId: "grp-pay-cheque",
    deliveryAttempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lastErrorCode: null,
    ackState: "pending",
    acknowledgedAt: null,
    ackReceiptJson: null,
    ackPayloadHash: null,
  };
}

describe("enrichOutboxEventForUpload — polivo.payment.posted", () => {
  it("fills null cheque metadata for legacy cash thin payloads missing those keys", () => {
    const local = createBoundDb();
    seedMasters(local);
    const seeded = seedPostedPayment(local, {
      paymentId: "pay-cash-1",
      postingId: "post-pay-cash",
      method: "cash",
      referenceNumber: "R-100001",
    });

    const enriched = enrichOutboxEventForUpload(local, thinLegacyCashPaymentOutbox(seeded));

    expect(enriched.eventSchemaVersion).toBe("2");
    const parsed = syncPaymentPostedV2PayloadSchema.safeParse(enriched.payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }

    expect(parsed.data.summary).toMatchObject({
      paymentId: seeded.paymentId,
      method: "cash",
      chequeNumber: null,
      issuingBankLabel: null,
      chequeDate: null,
      physicalHandoverDate: null,
      recognitionBasis: null,
    });
    expect(parsed.data.payment.chequeNumber).toBeNull();
  });

  it("preserves cheque number leading zeros from the payment row", () => {
    const local = createBoundDb();
    seedMasters(local);
    const seeded = seedPostedPayment(local, {
      paymentId: "pay-cheque-1",
      postingId: "post-pay-cheque",
      method: "cheque",
      referenceNumber: "R-200001",
      chequeNumber: "001234",
      issuingBankLabel: "Test Bank",
      chequeDate: BUSINESS_DATE,
      physicalHandoverDate: BUSINESS_DATE,
    });

    const enriched = enrichOutboxEventForUpload(local, thinChequePaymentOutbox(seeded));

    expect(enriched.eventSchemaVersion).toBe("2");
    const parsed = syncPaymentPostedV2PayloadSchema.safeParse(enriched.payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }

    expect(parsed.data.summary.chequeNumber).toBe("001234");
    expect(parsed.data.summary.recognitionBasis).toBe(PAYMENT_CHEQUE_RECOGNITION_BASIS);
    expect(parsed.data.payment.chequeNumber).toBe("001234");
  });
});
