import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FarmerBillIssueRecoveryRecord = {
  farmerId: string;
  sourceLineIds: string[];
  expectedSelectionFingerprint: string;
  businessDate: string | null;
  idempotencyKey: string;
  startedAt: string;
};

function recoveryPath(): string {
  const dir = join(app.getPath("userData"), "billing-recovery");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "farmer-bill-issue-in-flight.json");
}

export function readFarmerBillIssueRecovery(): FarmerBillIssueRecoveryRecord | null {
  const path = recoveryPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FarmerBillIssueRecoveryRecord>;
    if (
      typeof parsed.farmerId !== "string" ||
      !Array.isArray(parsed.sourceLineIds) ||
      !parsed.sourceLineIds.every((id) => typeof id === "string") ||
      typeof parsed.expectedSelectionFingerprint !== "string" ||
      (parsed.businessDate !== null &&
        parsed.businessDate !== undefined &&
        typeof parsed.businessDate !== "string") ||
      typeof parsed.idempotencyKey !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return {
      farmerId: parsed.farmerId,
      sourceLineIds: parsed.sourceLineIds,
      expectedSelectionFingerprint: parsed.expectedSelectionFingerprint,
      businessDate: parsed.businessDate ?? null,
      idempotencyKey: parsed.idempotencyKey,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function writeFarmerBillIssueRecovery(record: FarmerBillIssueRecoveryRecord): void {
  writeFileSync(recoveryPath(), `${JSON.stringify(record)}\n`, "utf8");
}

export function clearFarmerBillIssueRecovery(): void {
  const path = recoveryPath();
  if (existsSync(path)) {
    writeFileSync(path, "", "utf8");
  }
}
