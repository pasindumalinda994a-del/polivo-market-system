import { getBillById, updateBillWithExpectedRevision, type TxHandle } from "@polivo/db-local";
import { z } from "zod";

import {
  runIdempotentCommand,
  writeAuditAndOutbox,
  type CommandDefinition,
  type CommandDeps,
} from "../commands/command-runner.js";
import type { ExecutionContext } from "../context/execution-context.js";
import { notFoundError } from "../errors/app-error.js";

/** Test-only fixture event — not a production financial payload. */
export const TEST_FIXTURE_EVENT_TYPE = "polivo.test.fixture";
export const TEST_FIXTURE_EVENT_VERSION = "1";

export const fixtureBumpBillInputSchema = z.strictObject({
  billId: z.string().min(1).max(128),
  expectedRevision: z.number().int().positive(),
  note: z.string().min(1).max(64),
});

export type FixtureBumpBillInput = z.infer<typeof fixtureBumpBillInputSchema>;

export type FixtureBumpBillResult = {
  billId: string;
  revision: number;
  note: string;
};

export const FIXTURE_BUMP_BILL_CAPABILITY = "test.fixture";

function createBumpBillDefinition(
  deps: CommandDeps,
): CommandDefinition<FixtureBumpBillInput, FixtureBumpBillResult> {
  return {
    type: "test.fixture.bump_trader_bill",
    version: "1",
    requiredCapability: FIXTURE_BUMP_BILL_CAPABILITY,
    scopeToPrincipal: true,
    execute: ({
      tx,
      context,
      input,
    }: {
      tx: TxHandle;
      context: ExecutionContext;
      input: FixtureBumpBillInput;
    }) => {
      const bill = getBillById(tx, "trader", context.stallId, input.billId);
      if (bill === null) {
        throw notFoundError("Trader bill not found for this stall.");
      }

      const revision = updateBillWithExpectedRevision(tx, "trader", context.stallId, input.billId, {
        expectedRevision: input.expectedRevision,
        updatedAt: deps.now(),
      });

      const result: FixtureBumpBillResult = {
        billId: input.billId,
        revision,
        note: input.note,
      };

      writeAuditAndOutbox({
        tx,
        context,
        action: "test.fixture.bump_trader_bill",
        targetType: "trader_bill",
        targetId: input.billId,
        eventType: TEST_FIXTURE_EVENT_TYPE,
        eventSchemaVersion: TEST_FIXTURE_EVENT_VERSION,
        payload: { billId: input.billId, revision, note: input.note },
        eventId: deps.createId(),
        auditId: deps.createId(),
        now: deps.now(),
      });

      return result;
    },
    serializeResult: (result) => JSON.stringify(result),
    deserializeResult: (resultRef) => JSON.parse(resultRef) as FixtureBumpBillResult,
  };
}

export function runFixtureBumpBillCommand(
  deps: CommandDeps,
  input: FixtureBumpBillInput,
  meta: { requestId: string; idempotencyKey: string },
): FixtureBumpBillResult {
  return runIdempotentCommand(deps, createBumpBillDefinition(deps), {
    input,
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey,
  });
}
