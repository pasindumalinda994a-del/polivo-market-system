import { REPORT_DEFINITION_VERSION } from "@polivo/contracts";
import { captureReportingWatermarks, type UserReportingClient, type ReportingWatermarks } from "@polivo/db-cloud";
import {
  assertReportSnapshotMatchesBinding,
  createReportSnapshotPayload,
  decodeReportSnapshotToken,
  encodeReportSnapshotToken,
  fingerprintReportFilters,
  type ReportSnapshotPayload,
  type ReportType,
} from "@polivo/domain";
import type { ReportFiltersDto } from "@polivo/contracts";

import { stallBinding } from "./client";
import { mapReportDomainError } from "./errors";

function normalizeFilters(filters: ReportFiltersDto): ReportFiltersDto {
  const out: ReportFiltersDto = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export async function resolveOrCreateReportSnapshot(input: {
  client: UserReportingClient;
  tenantId: string;
  reportType: ReportType;
  filters: ReportFiltersDto;
  snapshotToken: string | undefined;
  nowIso: string;
}): Promise<{ payload: ReportSnapshotPayload; token: string; watermarks: ReportingWatermarks }> {
  const { stallId } = stallBinding(input.tenantId);
  const normalized = normalizeFilters(input.filters);
  const filterFp = fingerprintReportFilters(normalized as Record<string, unknown>);
  const from = normalized.fromBusinessDate ?? null;
  const to = normalized.toBusinessDate ?? null;
  const asOf = normalized.asOfBusinessDate ?? null;

  if (input.snapshotToken) {
    try {
      const payload = decodeReportSnapshotToken(input.snapshotToken);
      assertReportSnapshotMatchesBinding(
        payload,
        {
          stallId,
          reportType: input.reportType,
          definitionVersion: REPORT_DEFINITION_VERSION,
          currency: "LKR",
          fromBusinessDate: from,
          toBusinessDate: to,
          asOfBusinessDate: asOf,
          filterFingerprint: filterFp,
        },
        input.nowIso,
      );
      return { payload, token: input.snapshotToken, watermarks: payload.watermarks };
    } catch (error) {
      mapReportDomainError(error);
    }
  }

  const watermarks = await captureReportingWatermarks(input.client, input.tenantId, stallId);
  const payload = createReportSnapshotPayload({
    stallId,
    reportType: input.reportType,
    fromBusinessDate: from,
    toBusinessDate: to,
    asOfBusinessDate: asOf,
    filterFingerprint: filterFp,
    watermarks,
    capturedAt: input.nowIso,
  });
  return { payload, token: encodeReportSnapshotToken(payload), watermarks };
}

export function reportSnapshotMeta(token: string, payload: ReportSnapshotPayload) {
  return {
    snapshotToken: token,
    capturedAt: payload.capturedAt,
    expiresAt: payload.expiresAt,
    maxPostingSequence: payload.watermarks.maxPostingSequence,
    dateBasis: "business_effective" as const,
    businessTimezone: "UTC" as const,
    recordingCutoffAt: payload.capturedAt,
  };
}

export { normalizeFilters as normalizeReportFilters };