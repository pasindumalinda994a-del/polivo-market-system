import { useEffect, useId, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@polivo/ui";

import { PrintActions } from "../printing/PrintActions";
import type {
  BillHistoryChainDetailDto,
  BillHistoryListItemDto,
  SaleCorrectionCommitResponse,
  SaleCorrectionPreviewResponse,
} from "@polivo/contracts";

export type BillHistoryPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canRead: boolean;
  canCorrect: boolean;
  canCancel: boolean;
  staffKey: string | null;
  /**
   * Optional navigation into Payments with the bill's party (and bill context) preselected.
   * Only provided when the session holds the matching payment capability.
   */
  paymentKinds?: ReadonlyArray<"trader" | "farmer">;
  onRecordPayment?: (context: {
    partyKind: "trader" | "farmer";
    party: { id: string; shortCode: string; displayName: string };
    bill: { billId: string; billNumber: string };
  }) => void;
};

function formatMoney(paisa: number): string {
  return `Rs. ${(paisa / 100).toFixed(2)}`;
}

export function BillHistoryPanel({
  hostAvailable,
  signedIn,
  canRead,
  canCorrect,
  canCancel,
  staffKey,
  paymentKinds = [],
  onRecordPayment,
}: BillHistoryPanelProps) {
  const formId = useId();
  const commitGuardRef = useRef(false);
  const [billType, setBillType] = useState<"all" | "trader" | "farmer">("trader");
  const [partyQuery, setPartyQuery] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BillHistoryListItemDto[]>([]);
  const [detail, setDetail] = useState<BillHistoryChainDetailDto | null>(null);
  const [reason, setReason] = useState("");
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SaleCorrectionPreviewResponse | null>(null);
  const [commitResult, setCommitResult] = useState<SaleCorrectionCommitResponse | null>(null);
  const [busyAction, setBusyAction] = useState<"preview-correct" | "preview-reverse" | "commit" | null>(
    null,
  );

  useEffect(() => {
    setItems([]);
    setDetail(null);
    setPreview(null);
    setCommitResult(null);
    setReason("");
    setError(null);
    commitGuardRef.current = false;
  }, [staffKey]);

  useEffect(() => {
    let cancelled = false;
    async function recover() {
      if (!window.polivoBillCorrections || !signedIn) {
        return;
      }
      const recovery = await window.polivoBillCorrections.getRecovery();
      if (cancelled || !recovery.ok || recovery.data === null) {
        return;
      }
      const lookup = await window.polivoBillCorrections.lookup(recovery.data.idempotencyKey);
      if (cancelled) {
        return;
      }
      if (lookup.ok) {
        setCommitResult(lookup.data as SaleCorrectionCommitResponse);
        await window.polivoBillCorrections.clearRecovery();
      }
    }
    void recover();
    return () => {
      cancelled = true;
    };
  }, [signedIn, staffKey]);

  async function refreshList() {
    if (!window.polivoBillCorrections || !hostAvailable || !canRead) {
      return;
    }
    setLoading(true);
    setError(null);
    const result = await window.polivoBillCorrections.listHistory({
      billType: billType === "all" ? undefined : billType,
      partyQuery: partyQuery.trim() || undefined,
      billNumber: billNumber.trim() || undefined,
      limit: 50,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    const data = result.data as { items: BillHistoryListItemDto[] };
    setItems(data.items);
  }

  async function openDetail(item: BillHistoryListItemDto) {
    if (!window.polivoBillCorrections) {
      return;
    }
    setError(null);
    setPreview(null);
    setCommitResult(null);
    const result = await window.polivoBillCorrections.getDetail({
      billType: item.billType,
      billId: item.billId,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const next = result.data as BillHistoryChainDetailDto;
    setDetail(next);
    const prices: Record<string, string> = {};
    for (const line of next.saleLines ?? []) {
      prices[line.lineId] = String(line.unitPricePerKgMinor);
    }
    setEditedPrices(prices);
  }

  function buildReplacementPayload(current: BillHistoryChainDetailDto) {
    if (!current.traderId || !current.saleLines || current.saleLines.length === 0) {
      return null;
    }
    return {
      traderId: current.traderId,
      lines: current.saleLines.map((line) => {
        const priceText = editedPrices[line.lineId] ?? String(line.unitPricePerKgMinor);
        const unitPricePerKgMinor = Number.parseInt(priceText, 10);
        return {
          lineId: line.lineId,
          farmerId: line.farmerId,
          vegetableId: line.vegetableId,
          packageTypeId: line.packageTypeId,
          unitPricePerKgMinor: Number.isFinite(unitPricePerKgMinor)
            ? unitPricePerKgMinor
            : line.unitPricePerKgMinor,
          notes: line.notes,
          weights: {
            rows: line.weights,
            packagingWeightHundredths: line.packagingWeightHundredths,
          },
        };
      }),
    };
  }

  async function runPreview(action: "correct" | "reverse") {
    if (!window.polivoBillCorrections || !detail?.saleId || detail.sourceRevision === null) {
      return;
    }
    if (action === "correct" && !canCorrect) {
      setError("Missing bills.correct_finalized capability.");
      return;
    }
    if (action === "reverse" && !canCancel) {
      setError("Missing bills.cancel_finalized capability.");
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      setError("A reason is required before preview.");
      return;
    }
    const replacement =
      action === "correct" ? buildReplacementPayload(detail) : undefined;
    if (action === "correct" && replacement === null) {
      setError("Sale lines are unavailable for correction.");
      return;
    }
    setBusyAction(action === "correct" ? "preview-correct" : "preview-reverse");
    setError(null);
    setCommitResult(null);
    const result = await window.polivoBillCorrections.preview({
      saleId: detail.saleId,
      expectedRevision: detail.sourceRevision,
      action,
      reason: trimmedReason,
      ...(replacement !== undefined && replacement !== null ? { replacement } : {}),
    });
    setBusyAction(null);
    if (!result.ok) {
      setError(result.message);
      setPreview(null);
      return;
    }
    setPreview(result.data as SaleCorrectionPreviewResponse);
  }

  async function runCommit() {
    if (
      !window.polivoBillCorrections ||
      !preview ||
      !detail?.saleId ||
      preview.eligibility.allowed !== true
    ) {
      return;
    }
    if (commitGuardRef.current) {
      return;
    }
    if (preview.action === "correct" && !canCorrect) {
      setError("Missing bills.correct_finalized capability.");
      return;
    }
    if (preview.action === "reverse" && !canCancel) {
      setError("Missing bills.cancel_finalized capability.");
      return;
    }
    const replacement =
      preview.action === "correct" ? buildReplacementPayload(detail) : undefined;
    if (preview.action === "correct" && replacement === null) {
      setError("Sale lines are unavailable for correction commit.");
      return;
    }
    commitGuardRef.current = true;
    setBusyAction("commit");
    setError(null);
    const key = crypto.randomUUID();
    await window.polivoBillCorrections.setRecovery({
      idempotencyKey: key,
      saleId: detail.saleId,
      action: preview.action,
      savedAt: new Date().toISOString(),
    });
    const result = await window.polivoBillCorrections.commit(
      {
        saleId: detail.saleId,
        expectedRevision: preview.sourceRevision,
        action: preview.action,
        reason: preview.reason,
        previewFingerprint: preview.previewFingerprint,
        ...(replacement !== undefined && replacement !== null ? { replacement } : {}),
      },
      key,
    );
    setBusyAction(null);
    commitGuardRef.current = false;
    if (!result.ok) {
      if (result.code === "SERVICE_UNAVAILABLE" || result.code === "CONFLICT") {
        const lookup = await window.polivoBillCorrections.lookup(key);
        if (lookup.ok) {
          setCommitResult(lookup.data as SaleCorrectionCommitResponse);
          await window.polivoBillCorrections.clearRecovery();
          await refreshList();
          return;
        }
      }
      setError(result.message);
      return;
    }
    await window.polivoBillCorrections.clearRecovery();
    setCommitResult(result.data as SaleCorrectionCommitResponse);
    setPreview(null);
    await refreshList();
  }

  if (!signedIn) {
    return (
      <EmptyState
        title="Sign in to review bill history"
        description="Bill history and corrections require an authorized staff session."
      />
    );
  }
  if (!hostAvailable) {
    return (
      <EmptyState
        title="Stall host unavailable"
        description="Reconnect to the stall service to load bill history."
      />
    );
  }
  if (!canRead) {
    return (
      <EmptyState
        title="Permission required"
        description="Your session lacks bill history read capabilities."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Bill history"
        description="Search issued buyer and farmer bills. Correct or reverse eligible finalized sales with an explicit review."
      />

      <section className="grid gap-3 md:grid-cols-4" aria-label="Bill history filters">
        <div className="space-y-1">
          <Label htmlFor={`${formId}-type`}>Bill type</Label>
          <Select value={billType} onValueChange={(value) => setBillType(value as typeof billType)}>
            <SelectTrigger id={`${formId}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trader">Buyer bills</SelectItem>
              <SelectItem value="farmer">Farmer bills</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formId}-number`}>Bill number</Label>
          <Input
            id={`${formId}-number`}
            value={billNumber}
            onChange={(event) => setBillNumber(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formId}-party`}>Party code or name</Label>
          <Input
            id={`${formId}-party`}
            value={partyQuery}
            onChange={(event) => setPartyQuery(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={() => void refreshList()} disabled={loading}>
            Search
          </Button>
        </div>
      </section>

      {error ? (
        <ErrorState title="Bill history error" description={error} />
      ) : null}
      {loading ? <LoadingState label="Loading bill history" /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="History results">
          {items.length === 0 && !loading ? (
            <EmptyState
              title="No bills matched"
              description="Adjust filters or finalize a sale, then search again."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Original amount</TableHead>
                  <TableHead>Correction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.billType}:${item.billId}`}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => void openDetail(item)}
                      >
                        {item.billNumber}
                      </button>
                    </TableCell>
                    <TableCell>
                      {item.partyCode} · {item.partyDisplayName}
                    </TableCell>
                    <TableCell>{formatMoney(item.originalAmountMinor)}</TableCell>
                    <TableCell>{item.correctionStatus}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section aria-label="Bill detail" className="space-y-3">
          {!detail ? (
            <EmptyState
              title="Select a bill"
              description="Open a bill to review the original snapshot and correction timeline."
            />
          ) : (
            <>
              <Alert>
                <AlertTitle>
                  {detail.billType === "trader" ? "Buyer bill" : "Farmer bill"} {detail.billNumber}
                </AlertTitle>
                <AlertDescription>
                  Original amount {formatMoney(detail.originalAmountMinor)} · Document status{" "}
                  {detail.documentStatus} · Correction {detail.correctionStatus}
                  {detail.paymentStatus ? ` · Payment status ${detail.paymentStatus}` : ""}
                </AlertDescription>
              </Alert>

              <PrintActions
                documentKind={detail.billType === "trader" ? "buyer_bill" : "farmer_bill"}
                documentId={detail.billId}
              />

              {onRecordPayment &&
              paymentKinds.includes(detail.billType) &&
              detail.correctionStatus === "active" ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onRecordPayment({
                        partyKind: detail.billType,
                        party: detail.party,
                        bill: { billId: detail.billId, billNumber: detail.billNumber },
                      })
                    }
                  >
                    {detail.billType === "trader" ? "Allocate payment" : "Record payment"}
                  </Button>
                </div>
              ) : null}

              <div className="space-y-1">
                <h3 className="text-sm font-medium">Activity</h3>
                <ul className="space-y-1 text-sm">
                  {detail.activity.map((item) => (
                    <li key={`${item.kind}:${item.at}:${item.referenceId ?? ""}`}>
                      {item.at.slice(0, 19)} — {item.label}
                    </li>
                  ))}
                </ul>
              </div>

              {detail.billType === "trader" && detail.saleId && detail.correctionStatus === "active" ? (
                <div className="space-y-2 rounded-md border p-3">
                  <h3 className="text-sm font-medium">Correction / reversal</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter does not commit. Review the service preview, then use Commit explicitly.
                    Sales already on an issued farmer bill are blocked by the service.
                  </p>
                  {(detail.saleLines ?? []).length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Proposed line prices (paisa/kg)</h4>
                      {detail.saleLines!.map((line) => (
                        <div key={line.lineId} className="flex items-center gap-2">
                          <Label htmlFor={`${formId}-price-${line.lineId}`} className="min-w-28">
                            Line {line.lineId.slice(0, 8)}
                          </Label>
                          <Input
                            id={`${formId}-price-${line.lineId}`}
                            value={editedPrices[line.lineId] ?? String(line.unitPricePerKgMinor)}
                            onChange={(event) =>
                              setEditedPrices((current) => ({
                                ...current,
                                [line.lineId]: event.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-reason`}>Reason</Label>
                    <Textarea
                      id={`${formId}-reason`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canCancel || busyAction !== null}
                      onClick={() => void runPreview("reverse")}
                    >
                      Preview reversal
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canCorrect || busyAction !== null}
                      onClick={() => void runPreview("correct")}
                    >
                      Preview correction
                    </Button>
                  </div>
                  {preview ? (
                    <div className="space-y-2 text-sm">
                      <p>
                        Eligibility: {preview.eligibility.code} — {preview.eligibility.message}
                      </p>
                      {preview.eligibility.farmerBillInclusions.length > 0 ? (
                        <Alert>
                          <AlertTitle>Farmer bill inclusion blocks this action</AlertTitle>
                          <AlertDescription>
                            {preview.eligibility.message}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      <p>Reversal effects: {preview.reversalEffects.length} ledger line(s)</p>
                      {preview.proposedTotals ? (
                        <p>
                          Proposed buyer total {formatMoney(preview.proposedTotals.totalTraderPaysMinor)}
                        </p>
                      ) : null}
                      {preview.eligibility.allowed ? (
                        <Button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => void runCommit()}
                        >
                          {preview.action === "reverse" ? "Commit reversal" : "Commit correction"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {commitResult ? (
                <Alert>
                  <AlertTitle>Operation committed</AlertTitle>
                  <AlertDescription>
                    {commitResult.action} recorded for sale {commitResult.sourceSaleId}. Reversal
                    posting {commitResult.reversalPostingId}
                    {commitResult.replacementTraderBillNumber
                      ? ` · Replacement bill ${commitResult.replacementTraderBillNumber}`
                      : ""}
                    .
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
