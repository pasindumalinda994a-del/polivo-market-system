import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FinalizeRecoveryRecord = {
  saleId: string;
  idempotencyKey: string;
  expectedRevision: number;
  expectedCalculationFingerprint: string;
  startedAt: string;
};

function recoveryPath(): string {
  const dir = join(app.getPath("userData"), "billing-recovery");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "finalize-in-flight.json");
}

export function readFinalizeRecovery(): FinalizeRecoveryRecord | null {
  const path = recoveryPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FinalizeRecoveryRecord>;
    if (
      typeof parsed.saleId !== "string" ||
      typeof parsed.idempotencyKey !== "string" ||
      typeof parsed.expectedRevision !== "number" ||
      typeof parsed.expectedCalculationFingerprint !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return {
      saleId: parsed.saleId,
      idempotencyKey: parsed.idempotencyKey,
      expectedRevision: parsed.expectedRevision,
      expectedCalculationFingerprint: parsed.expectedCalculationFingerprint,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function writeFinalizeRecovery(record: FinalizeRecoveryRecord): void {
  writeFileSync(recoveryPath(), `${JSON.stringify(record)}\n`, "utf8");
}

export function clearFinalizeRecovery(): void {
  const path = recoveryPath();
  if (existsSync(path)) {
    writeFileSync(path, "", "utf8");
  }
}
