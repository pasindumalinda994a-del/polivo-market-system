import { reportQuerySchema, type ReportQuery } from "@polivo/contracts";

function readString(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  if (value === null || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseReportQueryFromSearchParams(
  reportType: string,
  params: URLSearchParams,
): ReportQuery {
  const filters = {
    fromBusinessDate: readString(params, "fromBusinessDate"),
    toBusinessDate: readString(params, "toBusinessDate"),
    asOfBusinessDate: readString(params, "asOfBusinessDate"),
    farmerId: readString(params, "farmerId"),
    buyerId: readString(params, "buyerId"),
    vegetableId: readString(params, "vegetableId"),
    paymentMethod: readString(params, "paymentMethod") as ReportQuery["filters"]["paymentMethod"],
    paymentDirection: readString(params, "paymentDirection") as ReportQuery["filters"]["paymentDirection"],
    paymentStatus: readString(params, "paymentStatus") as ReportQuery["filters"]["paymentStatus"],
    grouping: readString(params, "grouping"),
  };

  const parsed = reportQuerySchema.safeParse({
    reportType,
    filters,
    limit: readNumber(params, "limit"),
    cursor: readString(params, "cursor"),
    snapshotToken: readString(params, "snapshotToken"),
  });
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}