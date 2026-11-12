import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle, Button, Label, PageHeader } from "@polivo/ui";
import type {
  FarmerBillListItemDto,
  FarmerBillPreviewResponse,
  FarmerBillRecordDto,
  FarmerSaleLineRowDto,
  FarmerSalesSummaryDto,
  IssueFarmerBillResponse,
  ListFarmerSalesResponse,
} from "@polivo/contracts";

import { ReferenceCombobox, type ReferenceOption } from "../billing/ReferenceCombobox";
import { formatMoneyMinor, formatWeightHundredths, newClientId } from "../billing/billing-format";
import { PrintActions } from "../printing/PrintActions";

type FarmerBillingPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canRead: boolean;
  canIssue: boolean;
  staffKey: string | null;
};

type Mode = "workspace" | "review" | "detail";

export function FarmerBillingPanel({
  hostAvailable,
  signedIn,
  canRead,
  canIssue,
  staffKey,
}: FarmerBillingPanelProps) {
  const [farmer, setFarmer] = useState<ReferenceOption | null>(null);
  const [inclusionFilter, setInclusionFilter] = useState<"unbilled" | "billed" | "all">("unbilled");
  const [rows, setRows] = useState<FarmerSaleLineRowDto[]>([]);
  const [summary, setSummary] = useState<FarmerSalesSummaryDto | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [billHistory, setBillHistory] = useState<FarmerBillListItemDto[]>([]);
  const [preview, setPreview] = useState<FarmerBillPreviewResponse | null>(null);
  const [issuedBill, setIssuedBill] = useState<FarmerBillRecordDto | null>(null);
  const [mode, setMode] = useState<Mode>("workspace");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const issuingRef = useRef(false);

  const selectedCount = selectedIds.size;
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.saleLineId)),
    [rows, selectedIds],
  );

  async function searchFarmers(query: string) {
    if (!window.polivoFarmers) {
      return { ok: false as const, code: "UNAVAILABLE", message: "Farmers bridge unavailable." };
    }
    const result = await window.polivoFarmers.list({
      q: query || undefined,
      active: "all",
      limit: 20,
    });
    if (!result.ok) {
      return { ok: false as const, code: result.code, message: result.message };
    }
    return {
      ok: true as const,
      items: result.data.items.map((item) => ({
        id: item.id,
        shortCode: item.shortCode,
        displayName: item.displayName,
        active: item.isActive,
      })),
      stale: result.stale,
    };
  }

  async function loadSales(farmerId: string, append = false, cursor?: string | null) {
    if (!window.polivoFarmerBilling || !canRead) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoFarmerBilling.listSales({
      farmerId,
      limit: 50,
      cursor: cursor ?? undefined,
      inclusionStatus: inclusionFilter === "all" ? undefined : inclusionFilter,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    const data = result.data as ListFarmerSalesResponse;
    setSummary(data.summary);
    setRows((previous) => (append ? [...previous, ...data.items] : data.items));
    setNextCursor(data.nextCursor);
    if (!append) {
      setSelectedIds(new Set());
      setPreview(null);
      setFocusIndex(0);
    }
  }

  async function loadBillHistory(farmerId: string) {
    if (!window.polivoFarmerBilling || !canRead) {
      return;
    }
    const result = await window.polivoFarmerBilling.listBills({ farmerId, limit: 20 });
    if (!result.ok || result.stale) {
      return;
    }
    setBillHistory((result.data as { items: FarmerBillListItemDto[] }).items);
  }

  useEffect(() => {
    if (!farmer || !signedIn || !hostAvailable) {
      setRows([]);
      setSummary(null);
      setBillHistory([]);
      return;
    }
    void loadSales(farmer.id);
    void loadBillHistory(farmer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on farmer/filter/session
  }, [farmer?.id, inclusionFilter, signedIn, hostAvailable, staffKey, canRead]);

  useEffect(() => {
    let cancelled = false;
    async function recover() {
      if (!window.polivoFarmerBilling || !canIssue) {
        return;
      }
      const recovery = await window.polivoFarmerBilling.getIssueRecovery();
      if (cancelled || !recovery.ok || recovery.data === null) {
        return;
      }
      setMessage("Recovering an in-flight farmer bill issuance…");
      const lookup = await window.polivoFarmerBilling.lookupIssuance(recovery.data.idempotencyKey);
      if (!lookup.ok) {
        setError(
          `${lookup.message} Reuse the same operation or clear recovery after confirming the bill was not issued.`,
        );
        return;
      }
      const issued = lookup.data as IssueFarmerBillResponse;
      setIssuedBill(issued.bill);
      setMode("detail");
      setMessage(`Recovered issued farmer bill ${issued.billNumber}.`);
      await window.polivoFarmerBilling.clearIssueRecovery();
      if (farmer?.id === recovery.data.farmerId) {
        await loadSales(farmer.id);
        await loadBillHistory(farmer.id);
      }
    }
    void recover();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffKey, canIssue]);

  function toggleRow(saleLineId: string) {
    setPreview(null);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(saleLineId)) {
        next.delete(saleLineId);
      } else {
        next.add(saleLineId);
      }
      return next;
    });
  }

  function selectPageUnbilled() {
    setPreview(null);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const row of rows) {
        if (row.inclusionStatus === "unbilled") {
          next.add(row.saleLineId);
        }
      }
      return next;
    });
  }

  async function runPreview() {
    if (!farmer || !window.polivoFarmerBilling || selectedIds.size === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoFarmerBilling.preview({
      farmerId: farmer.id,
      sourceLineIds: [...selectedIds],
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setPreview(null);
      return;
    }
    setPreview(result.data as FarmerBillPreviewResponse);
    setMode("review");
    setMessage(null);
  }

  async function runIssue() {
    if (!farmer || !preview || !window.polivoFarmerBilling || !canIssue || issuingRef.current) {
      return;
    }
    issuingRef.current = true;
    setBusy(true);
    setError(null);
    const key = newClientId("fbill");
    const payload = {
      farmerId: farmer.id,
      sourceLineIds: preview.lines.map((line) => line.saleLineId),
      expectedSelectionFingerprint: preview.selectionFingerprint,
      businessDate: preview.businessDate,
    };
    await window.polivoFarmerBilling.setIssueRecovery({
      farmerId: payload.farmerId,
      sourceLineIds: payload.sourceLineIds,
      expectedSelectionFingerprint: payload.expectedSelectionFingerprint,
      businessDate: payload.businessDate,
      idempotencyKey: key,
      startedAt: new Date().toISOString(),
    });
    const result = await window.polivoFarmerBilling.issue(payload, key);
    issuingRef.current = false;
    setBusy(false);
    if (!result.ok) {
      if (result.conflict) {
        setError(`${result.message} Refresh eligible sales and review again.`);
        setPreview(null);
        setMode("workspace");
        await loadSales(farmer.id);
      } else {
        setError(
          `${result.message} If the outcome is unknown, recovery will reuse the same operation identity.`,
        );
      }
      return;
    }
    const issued = result.data as IssueFarmerBillResponse;
    await window.polivoFarmerBilling.clearIssueRecovery();
    setIssuedBill(issued.bill);
    setMode("detail");
    setMessage(`Issued farmer bill ${issued.billNumber}.`);
    setSelectedIds(new Set());
    setPreview(null);
    await loadSales(farmer.id);
    await loadBillHistory(farmer.id);
  }

  async function openBill(billId: string) {
    if (!window.polivoFarmerBilling) {
      return;
    }
    setBusy(true);
    const result = await window.polivoFarmerBilling.getBill(billId);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setIssuedBill(result.data as FarmerBillRecordDto);
    setMode("detail");
  }

  if (!signedIn || !hostAvailable) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="Farmer bills"
          description="Sign in to review farmer sales and issue bills."
        />
        <Alert>
          <AlertTitle>Host session required</AlertTitle>
          <AlertDescription>Connect and sign in before using farmer billing.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title="Farmer bills" description="Billing capability required." />
        <Alert variant="destructive">
          <AlertTitle>Not authorized</AlertTitle>
          <AlertDescription>
            Missing bills.create, bills.edit_draft, or bills.finalize.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (mode === "detail" && issuedBill) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title={`Farmer bill ${issuedBill.billNumber}`}
          description="Immutable issued bill details. Net entitlement is not cash paid."
        />
        {message ? (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>Type: Farmer bill</div>
          <div>
            Farmer: {issuedBill.farmerShortCode} — {issuedBill.farmerDisplayName}
          </div>
          <div>Issue date: {issuedBill.businessDate}</div>
          <div>
            Covered sales: {issuedBill.coveredBusinessDateFrom} → {issuedBill.coveredBusinessDateTo}
          </div>
          <div>Gross: {formatMoneyMinor(issuedBill.totalSaleAmountMinor)}</div>
          <div>Commission: {formatMoneyMinor(issuedBill.totalCommissionMinor)}</div>
          <div>Net entitlement: {formatMoneyMinor(issuedBill.totalFarmerReceivesMinor)}</div>
          <div>Document status: Issued (not a payment status)</div>
        </div>
        <PrintActions documentKind="farmer_bill" documentId={issuedBill.id} />
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Source</th>
              <th className="py-1 pr-2">Vegetable</th>
              <th className="py-1 pr-2">Weight</th>
              <th className="py-1 pr-2">Gross</th>
              <th className="py-1 pr-2">Commission</th>
              <th className="py-1 pr-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {issuedBill.lines.map((line) => (
              <tr key={line.saleLineId} className="border-b align-top">
                <td className="py-1 pr-2">{line.businessDate}</td>
                <td className="py-1 pr-2 font-mono text-xs">{line.saleLineId}</td>
                <td className="py-1 pr-2">
                  {line.vegetableCode} — {line.vegetableDisplayName}
                </td>
                <td className="py-1 pr-2">{formatWeightHundredths(line.netWeightHundredths)}</td>
                <td className="py-1 pr-2">{formatMoneyMinor(line.saleAmountMinor)}</td>
                <td className="py-1 pr-2">{formatMoneyMinor(line.commissionAmountMinor)}</td>
                <td className="py-1 pr-2">{formatMoneyMinor(line.farmerReceivesMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          type="button"
          onClick={() => {
            setMode("workspace");
            setIssuedBill(null);
            setMessage(null);
          }}
        >
          Back to farmer sales
        </Button>
      </div>
    );
  }

  if (mode === "review" && preview) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="Review farmer bill"
          description="Confirm exact selected sources and totals before issuing."
        />
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Cannot issue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div>Lines: {preview.lineCount}</div>
          <div>Weight: {formatWeightHundredths(preview.totalNetWeightHundredths)}</div>
          <div>Gross: {formatMoneyMinor(preview.totalSaleAmountMinor)}</div>
          <div>Commission: {formatMoneyMinor(preview.totalCommissionMinor)}</div>
          <div>Net entitlement: {formatMoneyMinor(preview.totalFarmerReceivesMinor)}</div>
          <div>Bill date: {preview.businessDate}</div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Vegetable</th>
              <th className="py-1 pr-2">Gross</th>
              <th className="py-1 pr-2">Commission</th>
              <th className="py-1 pr-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line) => (
              <tr key={line.saleLineId} className="border-b">
                <td className="py-1 pr-2">{line.businessDate}</td>
                <td className="py-1 pr-2">
                  {line.vegetableCode} — {line.vegetableDisplayName}
                </td>
                <td className="py-1 pr-2">{formatMoneyMinor(line.saleAmountMinor)}</td>
                <td className="py-1 pr-2">{formatMoneyMinor(line.commissionAmountMinor)}</td>
                <td className="py-1 pr-2">{formatMoneyMinor(line.farmerReceivesMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!canIssue || busy}
            onClick={() => {
              void runIssue();
            }}
          >
            Issue farmer bill
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setMode("workspace");
              setPreview(null);
            }}
          >
            Back to selection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Farmer bills"
        description="Select finalized unbilled sale lines for one farmer. Issuance documents existing entitlements; it does not mark the farmer paid."
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <AlertTitle>Notice</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <ReferenceCombobox
        label="Farmer"
        value={farmer}
        onChange={(value) => {
          setFarmer(value);
          setPreview(null);
          setSelectedIds(new Set());
          setMode("workspace");
        }}
        search={searchFarmers}
        allowInactiveSelection
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="inclusion-filter">Inclusion</Label>
          <select
            id="inclusion-filter"
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={inclusionFilter}
            onChange={(event) =>
              setInclusionFilter(event.target.value as "unbilled" | "billed" | "all")
            }
          >
            <option value="unbilled">Unbilled</option>
            <option value="billed">Billed</option>
            <option value="all">All matching</option>
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!farmer || busy}
          onClick={() => {
            if (farmer) {
              void loadSales(farmer.id);
              void loadBillHistory(farmer.id);
            }
          }}
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!farmer || rows.length === 0}
          onClick={selectPageUnbilled}
        >
          Select unbilled on page
        </Button>
      </div>

      {summary ? (
        <div className="grid gap-2 text-sm md:grid-cols-4">
          <div>Matching lines (all filters): {summary.matchingLineCount}</div>
          <div>Unbilled: {summary.unbilledLineCount}</div>
          <div>Billed: {summary.billedLineCount}</div>
          <div>Matching net: {formatMoneyMinor(summary.totalFarmerReceivesMinor)}</div>
        </div>
      ) : null}

      <div
        className="overflow-auto rounded-md border"
        onKeyDown={(event) => {
          if (rows.length === 0) {
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setFocusIndex((index) => Math.min(rows.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setFocusIndex((index) => Math.max(0, index - 1));
          } else if (event.key === " " || event.key === "Enter") {
            const row = rows[focusIndex];
            if (row && row.inclusionStatus === "unbilled") {
              event.preventDefault();
              toggleRow(row.saleLineId);
            }
          }
        }}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-2 py-1">Sel</th>
              <th className="px-2 py-1">Date</th>
              <th className="px-2 py-1">Vegetable</th>
              <th className="px-2 py-1">Pkgs</th>
              <th className="px-2 py-1">Weight</th>
              <th className="px-2 py-1">Price</th>
              <th className="px-2 py-1">Gross</th>
              <th className="px-2 py-1">Commission</th>
              <th className="px-2 py-1">Net</th>
              <th className="px-2 py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const selected = selectedIds.has(row.saleLineId);
              const focused = index === focusIndex;
              return (
                <tr
                  key={row.saleLineId}
                  className={`border-b ${focused ? "bg-accent/40" : ""} ${selected ? "bg-primary/5" : ""}`}
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={row.inclusionStatus !== "unbilled"}
                      onChange={() => toggleRow(row.saleLineId)}
                      aria-label={`Select sale line ${row.saleLineId}`}
                    />
                  </td>
                  <td className="px-2 py-1">{row.businessDate}</td>
                  <td className="px-2 py-1">
                    {row.vegetableCode} — {row.vegetableDisplayName}
                  </td>
                  <td className="px-2 py-1">{row.packageCount}</td>
                  <td className="px-2 py-1">{formatWeightHundredths(row.netWeightHundredths)}</td>
                  <td className="px-2 py-1">{formatMoneyMinor(row.unitPricePerKgMinor)}</td>
                  <td className="px-2 py-1">{formatMoneyMinor(row.saleAmountMinor)}</td>
                  <td className="px-2 py-1">{formatMoneyMinor(row.commissionAmountMinor)}</td>
                  <td className="px-2 py-1">{formatMoneyMinor(row.farmerReceivesMinor)}</td>
                  <td className="px-2 py-1">
                    {row.inclusionStatus === "billed"
                      ? `Billed ${row.farmerBillNumber ?? ""}`
                      : "Unbilled"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-muted-foreground" colSpan={10}>
                  {farmer ? "No matching farmer sales." : "Select a farmer to load sales."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy || !farmer}
          onClick={() => {
            if (farmer) {
              void loadSales(farmer.id, true, nextCursor);
            }
          }}
        >
          Load more
        </Button>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 rounded-md border p-3 text-sm">
        <div>Selected lines (this selection): {selectedCount}</div>
        <div>
          Selected weight:{" "}
          {formatWeightHundredths(
            selectedRows.reduce((sum, row) => sum + row.netWeightHundredths, 0),
          )}
        </div>
        <div>
          Selected gross:{" "}
          {formatMoneyMinor(selectedRows.reduce((sum, row) => sum + row.saleAmountMinor, 0))}
        </div>
        <div>
          Selected commission:{" "}
          {formatMoneyMinor(selectedRows.reduce((sum, row) => sum + row.commissionAmountMinor, 0))}
        </div>
        <div>
          Selected net:{" "}
          {formatMoneyMinor(selectedRows.reduce((sum, row) => sum + row.farmerReceivesMinor, 0))}
        </div>
        <Button
          type="button"
          disabled={selectedCount === 0 || busy || !canIssue}
          onClick={() => {
            void runPreview();
          }}
        >
          Review selection
        </Button>
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Bill history</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Number</th>
              <th className="py-1 pr-2">Issue date</th>
              <th className="py-1 pr-2">Covered</th>
              <th className="py-1 pr-2">Gross</th>
              <th className="py-1 pr-2">Net</th>
              <th className="py-1 pr-2" />
            </tr>
          </thead>
          <tbody>
            {billHistory.map((bill) => (
              <tr key={bill.id} className="border-b">
                <td className="py-1 pr-2">{bill.billNumber}</td>
                <td className="py-1 pr-2">{bill.businessDate}</td>
                <td className="py-1 pr-2">
                  {bill.coveredBusinessDateFrom} → {bill.coveredBusinessDateTo}
                </td>
                <td className="py-1 pr-2">{formatMoneyMinor(bill.totalSaleAmountMinor)}</td>
                <td className="py-1 pr-2">{formatMoneyMinor(bill.totalFarmerReceivesMinor)}</td>
                <td className="py-1 pr-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openBill(bill.id)}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {billHistory.length === 0 ? (
              <tr>
                <td className="py-2 text-muted-foreground" colSpan={6}>
                  No farmer bills yet for this farmer.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
