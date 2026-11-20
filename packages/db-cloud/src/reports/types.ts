export type ReportingWatermarks = {
  maxPostingSequence: number;
  maxAllocationCreatedAt: string;
  maxAllocationId: string;
  maxPaymentRecordedAt: string;
  maxPaymentId: string;
  committedCloudCursor?: number;
};

export type ReportSaleLineRow = {
  saleLineId: string;
  saleId: string;
  businessDate: string;
  recordedAt: string;
  postingSequence: number | null;
  traderId: string;
  traderDisplayName: string;
  farmerId: string | null;
  farmerDisplayName: string | null;
  vegetableId: string;
  vegetableCode: string;
  vegetableDisplayName: string;
  packageCount: number;
  netWeightHundredths: number;
  unitPricePerKgMinor: number;
  saleAmountMinor: number;
  commissionAmountMinor: number;
  farmerReceivesMinor: number;
  correctionStatus: "active" | "reversed" | "superseded";
  traderBillNumber: string | null;
};

export type ReportPaymentRow = {
  paymentId: string;
  businessDate: string;
  recordedAt: string;
  partyKind: "farmer" | "trader";
  farmerId: string | null;
  farmerDisplayName: string | null;
  traderId: string | null;
  traderDisplayName: string | null;
  direction: "receive" | "pay";
  method: "cash" | "bank_transfer" | "cheque";
  amountMinor: number;
  status: "posted" | "reversed";
  referenceNumber: string;
  allocatedTotalMinor: number;
  unappliedAmountMinor: number;
};

export type ReportCorrectionRow = {
  operationId: string;
  businessDate: string;
  recordedAt: string;
  action: string;
  sourceSaleId: string;
  replacementSaleId: string | null;
  reversalPostingId: string;
  traderId: string | null;
  reason: string | null;
};

export type ListReportSaleLinesInput = {
  tenantId: string;
  stallId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  watermarks: ReportingWatermarks;
  farmerId?: string;
  buyerId?: string;
  vegetableId?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type ListReportPaymentsInput = {
  tenantId: string;
  stallId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  watermarks: ReportingWatermarks;
  farmerId?: string;
  buyerId?: string;
  paymentMethod?: "cash" | "bank_transfer" | "cheque";
  paymentDirection?: "receive" | "pay";
  paymentStatus?: "posted" | "reversed" | "all";
  limit?: number;
  offset?: number;
};

export type LedgerPartyKind = "farmer" | "trader";

export type StatementMovementRow = {
  entryId: string;
  postingId: string;
  businessDate: string;
  recordedAt: string;
  postingSequence: number;
  sourceType: string;
  sourceId: string;
  financialEventType: string;
  description: string | null;
  amountMinor: number;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
};

export type ListStatementMovementsInput = {
  tenantId: string;
  stallId: string;
  partyKind: LedgerPartyKind;
  partyId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  maxPostingSequence: number;
  limit: number;
  afterBusinessDate?: string;
  afterPostingSequence?: number;
  afterEntryId?: string;
  movementSearch?: string;
  sourceTypeFilter?: string;
};

export type ListStatementMovementsResult = {
  precedingBalanceMinor: number;
  items: StatementMovementRow[];
  hasMore: boolean;
};

export type UnappliedPaymentRow = {
  paymentId: string;
  referenceNumber: string;
  businessDate: string;
  amountMinor: number;
  allocatedActiveMinor: number;
  unappliedAmountMinor: number;
  method: "cash" | "bank_transfer" | "cheque";
  physicalHandoverDate: string | null;
  chequeNumber: string | null;
  recordedAt: string;
};

export type EligibleObligationRow = {
  obligationKind: "trader_bill" | "farmer_sale_line" | "opening_balance";
  targetId: string;
  label: string;
  businessDate: string | null;
  effectiveAmountMinor: number;
  activeAllocatedMinor: number;
  remainingMinor: number;
  documentKind: "trader_bill" | "farmer_bill" | "opening_balance" | "sale_line" | null;
  documentId: string | null;
  documentNumber: string | null;
  farmerBillId: string | null;
};

export type ReportExportJobRecord = {
  id: string;
  stallId: string;
  reportType: string;
  format: "csv" | "pdf";
  status: "preparing" | "ready" | "failed" | "expired";
  definitionVersion: string;
  snapshotToken: string;
  filterFingerprint: string;
  normalizedFiltersJson: string;
  rowCount: number | null;
  contentSha256: string | null;
  contentType: string | null;
  byteLength: number | null;
  defaultFileName: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdBySubject: string;
  createOperationId: string;
  createdAt: string;
  expiresAt: string;
  readyAt: string | null;
};

export type InsertReportExportJobInput = {
  tenantId: string;
  id: string;
  stallId: string;
  reportType: string;
  format: "csv" | "pdf";
  status: ReportExportJobRecord["status"];
  definitionVersion: string;
  snapshotToken: string;
  filterFingerprint: string;
  normalizedFiltersJson: string | Record<string, unknown>;
  rowCount: number | null;
  contentSha256: string | null;
  contentBytes: Uint8Array | null;
  contentType: string | null;
  byteLength: number | null;
  defaultFileName: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdBySubject: string;
  createOperationId: string;
  createdAt: string;
  expiresAt: string;
  readyAt: string | null;
};

export type StallReportingFreshness = {
  lastHostContactAt: string | null;
  lastAppliedUploadGroupId: string | null;
  lastAppliedUploadAt: string | null;
  committedCloudCursor: number;
  committedCloudCursorObservedAt: string | null;
  appliedMaxPostingSequence: number;
  hasAnyAppliedData: boolean;
};
