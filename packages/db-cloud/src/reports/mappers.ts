import { moneyMinorFromPg, weightHundredthsFromPg } from "../numeric.js";
import {
  optionalAbsoluteTimestamp,
  optionalString,
  requireAbsoluteTimestamp,
  requireCalendarDate,
  requireInteger,
  requireString,
} from "./errors.js";
import type {
  EligibleObligationRow,
  ReportCorrectionRow,
  ReportExportJobRecord,
  ReportPaymentRow,
  ReportSaleLineRow,
  ReportingWatermarks,
  StallReportingFreshness,
  StatementMovementRow,
  UnappliedPaymentRow,
} from "./types.js";

export function mapReportingWatermarks(row: Record<string, unknown>): ReportingWatermarks {
  return {
    maxPostingSequence: requireInteger(row["max_posting_sequence"], "max_posting_sequence"),
    maxAllocationCreatedAt: requireAbsoluteTimestamp(
      row["max_allocation_created_at"],
      "max_allocation_created_at",
    ),
    maxAllocationId: requireString(row["max_allocation_id"], "max_allocation_id"),
    maxPaymentRecordedAt: requireAbsoluteTimestamp(
      row["max_payment_recorded_at"],
      "max_payment_recorded_at",
    ),
    maxPaymentId: requireString(row["max_payment_id"], "max_payment_id"),
    committedCloudCursor:
      row["committed_cloud_cursor"] === null || row["committed_cloud_cursor"] === undefined
        ? undefined
        : requireInteger(row["committed_cloud_cursor"], "committed_cloud_cursor"),
  };
}

export function mapReportSaleLineRow(row: Record<string, unknown>): ReportSaleLineRow {
  const statusRaw = requireString(row["correction_status"], "correction_status");
  const correctionStatus =
    statusRaw === "reversed" || statusRaw === "superseded" ? statusRaw : "active";
  return {
    saleLineId: requireString(row["sale_line_id"], "sale_line_id"),
    saleId: requireString(row["sale_id"], "sale_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    postingSequence:
      row["posting_sequence"] === null || row["posting_sequence"] === undefined
        ? null
        : requireInteger(row["posting_sequence"], "posting_sequence"),
    traderId: requireString(row["trader_id"], "trader_id"),
    traderDisplayName: requireString(row["trader_display_name"], "trader_display_name"),
    farmerId: optionalString(row["farmer_id"], "farmer_id"),
    farmerDisplayName: optionalString(row["farmer_display_name"], "farmer_display_name"),
    vegetableId: requireString(row["vegetable_id"], "vegetable_id"),
    vegetableCode: requireString(row["vegetable_code"], "vegetable_code"),
    vegetableDisplayName: requireString(row["vegetable_display_name"], "vegetable_display_name"),
    packageCount: requireInteger(row["package_count"], "package_count"),
    netWeightHundredths: weightHundredthsFromPg(row["net_weight_hundredths"]),
    unitPricePerKgMinor: moneyMinorFromPg(row["unit_price_per_kg_minor"]),
    saleAmountMinor: moneyMinorFromPg(row["sale_amount_minor"]),
    commissionAmountMinor: moneyMinorFromPg(row["commission_amount_minor"]),
    farmerReceivesMinor: moneyMinorFromPg(row["farmer_receives_minor"]),
    correctionStatus,
    traderBillNumber: optionalString(row["trader_bill_number"], "trader_bill_number"),
  };
}

export function mapReportPaymentRow(row: Record<string, unknown>): ReportPaymentRow {
  const amountMinor = moneyMinorFromPg(row["amount_minor"]);
  const allocatedTotalMinor = moneyMinorFromPg(row["allocated_total_minor"]);
  const status = requireString(row["status"], "status") as "posted" | "reversed";
  const unapplied = status === "posted" ? Math.max(0, amountMinor - allocatedTotalMinor) : 0;
  return {
    paymentId: requireString(row["payment_id"], "payment_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    partyKind: requireString(row["party_kind"], "party_kind") as "farmer" | "trader",
    farmerId: optionalString(row["farmer_id"], "farmer_id"),
    farmerDisplayName: optionalString(row["farmer_display_name"], "farmer_display_name"),
    traderId: optionalString(row["trader_id"], "trader_id"),
    traderDisplayName: optionalString(row["trader_display_name"], "trader_display_name"),
    direction: requireString(row["direction"], "direction") as "receive" | "pay",
    method: requireString(row["method"], "method") as "cash" | "bank_transfer" | "cheque",
    amountMinor,
    status,
    referenceNumber: requireString(row["reference_number"], "reference_number"),
    allocatedTotalMinor,
    unappliedAmountMinor: unapplied,
  };
}

export function mapReportCorrectionRow(row: Record<string, unknown>): ReportCorrectionRow {
  return {
    operationId: requireString(row["operation_id"], "operation_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    action: requireString(row["action"], "action"),
    sourceSaleId: requireString(row["source_sale_id"], "source_sale_id"),
    replacementSaleId: optionalString(row["replacement_sale_id"], "replacement_sale_id"),
    reversalPostingId: requireString(row["reversal_posting_id"], "reversal_posting_id"),
    traderId: optionalString(row["trader_id"], "trader_id"),
    reason: optionalString(row["reason"], "reason"),
  };
}

export function mapStatementMovementRow(row: Record<string, unknown>): StatementMovementRow {
  return {
    entryId: requireString(row["entry_id"], "entry_id"),
    postingId: requireString(row["posting_id"], "posting_id"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
    postingSequence: requireInteger(row["posting_sequence"], "posting_sequence"),
    sourceType: requireString(row["source_type"], "source_type"),
    sourceId: requireString(row["source_id"], "source_id"),
    financialEventType: requireString(row["financial_event_type"], "financial_event_type"),
    description: optionalString(row["description"], "description"),
    amountMinor: moneyMinorFromPg(row["amount_minor"]),
    reversesEntryId: optionalString(row["reverses_entry_id"], "reverses_entry_id"),
    reversedByEntryId: optionalString(row["reversed_by_entry_id"], "reversed_by_entry_id"),
  };
}

export function mapUnappliedPaymentRow(row: Record<string, unknown>): UnappliedPaymentRow {
  const method = requireString(row["method"], "method");
  if (method !== "cash" && method !== "bank_transfer" && method !== "cheque") {
    throw new Error(`Unexpected payment method: ${method}`);
  }
  return {
    paymentId: requireString(row["payment_id"], "payment_id"),
    referenceNumber: requireString(row["reference_number"], "reference_number"),
    businessDate: requireCalendarDate(row["business_date"], "business_date"),
    amountMinor: moneyMinorFromPg(row["amount_minor"]),
    allocatedActiveMinor: moneyMinorFromPg(row["allocated_active_minor"]),
    unappliedAmountMinor: moneyMinorFromPg(row["unapplied_amount_minor"]),
    method,
    physicalHandoverDate: optionalString(row["physical_handover_date"], "physical_handover_date"),
    chequeNumber: optionalString(row["cheque_number"], "cheque_number"),
    recordedAt: requireAbsoluteTimestamp(row["recorded_at"], "recorded_at"),
  };
}

export function mapEligibleObligationRow(row: Record<string, unknown>): EligibleObligationRow {
  const obligationKind = requireString(row["obligation_kind"], "obligation_kind");
  if (
    obligationKind !== "trader_bill" &&
    obligationKind !== "farmer_sale_line" &&
    obligationKind !== "opening_balance"
  ) {
    throw new Error(`Unexpected obligation kind: ${obligationKind}`);
  }
  const docKind = optionalString(row["document_kind"], "document_kind");
  return {
    obligationKind,
    targetId: requireString(row["target_id"], "target_id"),
    label: requireString(row["label"], "label"),
    businessDate:
      row["business_date"] === null || row["business_date"] === undefined
        ? null
        : requireCalendarDate(row["business_date"], "business_date"),
    effectiveAmountMinor: moneyMinorFromPg(row["effective_amount_minor"]),
    activeAllocatedMinor: moneyMinorFromPg(row["active_allocated_minor"]),
    remainingMinor: moneyMinorFromPg(row["remaining_minor"]),
    documentKind:
      docKind === "trader_bill" ||
      docKind === "farmer_bill" ||
      docKind === "opening_balance" ||
      docKind === "sale_line"
        ? docKind
        : null,
    documentId: optionalString(row["document_id"], "document_id"),
    documentNumber: optionalString(row["document_number"], "document_number"),
    farmerBillId: optionalString(row["farmer_bill_id"], "farmer_bill_id"),
  };
}

export function mapReportExportJobRow(row: Record<string, unknown>): ReportExportJobRecord {
  return {
    id: requireString(row["id"], "report_export_jobs.id"),
    stallId: requireString(row["stall_id"], "report_export_jobs.stall_id"),
    reportType: requireString(row["report_type"], "report_export_jobs.report_type"),
    format: requireString(row["format"], "report_export_jobs.format") as "csv" | "pdf",
    status: requireString(
      row["status"],
      "report_export_jobs.status",
    ) as ReportExportJobRecord["status"],
    definitionVersion: requireString(
      row["definition_version"],
      "report_export_jobs.definition_version",
    ),
    snapshotToken: requireString(row["snapshot_token"], "report_export_jobs.snapshot_token"),
    filterFingerprint: requireString(
      row["filter_fingerprint"],
      "report_export_jobs.filter_fingerprint",
    ),
    normalizedFiltersJson:
      typeof row["normalized_filters_json"] === "string"
        ? row["normalized_filters_json"]
        : JSON.stringify(row["normalized_filters_json"]),
    rowCount:
      row["row_count"] === null || row["row_count"] === undefined
        ? null
        : requireInteger(row["row_count"], "report_export_jobs.row_count"),
    contentSha256: optionalString(row["content_sha256"], "report_export_jobs.content_sha256"),
    contentType: optionalString(row["content_type"], "report_export_jobs.content_type"),
    byteLength:
      row["byte_length"] === null || row["byte_length"] === undefined
        ? null
        : requireInteger(row["byte_length"], "report_export_jobs.byte_length"),
    defaultFileName: requireString(
      row["default_file_name"],
      "report_export_jobs.default_file_name",
    ),
    failureCode: optionalString(row["failure_code"], "report_export_jobs.failure_code"),
    failureMessage: optionalString(row["failure_message"], "report_export_jobs.failure_message"),
    createdBySubject: requireString(
      row["created_by_subject"],
      "report_export_jobs.created_by_subject",
    ),
    createOperationId: requireString(
      row["create_operation_id"],
      "report_export_jobs.create_operation_id",
    ),
    createdAt: requireAbsoluteTimestamp(row["created_at"], "report_export_jobs.created_at"),
    expiresAt: requireAbsoluteTimestamp(row["expires_at"], "report_export_jobs.expires_at"),
    readyAt: optionalAbsoluteTimestamp(row["ready_at"], "report_export_jobs.ready_at"),
  };
}

export function mapStallReportingFreshness(row: Record<string, unknown>): StallReportingFreshness {
  return {
    lastHostContactAt: optionalAbsoluteTimestamp(
      row["last_host_contact_at"],
      "last_host_contact_at",
    ),
    lastAppliedUploadGroupId: optionalString(
      row["last_applied_upload_group_id"],
      "last_applied_upload_group_id",
    ),
    lastAppliedUploadAt: optionalAbsoluteTimestamp(
      row["last_applied_upload_at"],
      "last_applied_upload_at",
    ),
    committedCloudCursor: requireInteger(row["committed_cloud_cursor"], "committed_cloud_cursor"),
    committedCloudCursorObservedAt: optionalAbsoluteTimestamp(
      row["committed_cloud_cursor_observed_at"],
      "committed_cloud_cursor_observed_at",
    ),
    appliedMaxPostingSequence: requireInteger(
      row["applied_max_posting_sequence"],
      "applied_max_posting_sequence",
    ),
    hasAnyAppliedData: row["has_any_applied_data"] === true,
  };
}
