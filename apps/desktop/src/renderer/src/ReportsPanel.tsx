import { useEffect, useId, useRef, useState, useTransition } from "react";
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
} from "@polivo/ui";

type ReportCatalogItem = {
  reportType: string;
  title: string;
  description: string;
  dateModel: string;
  supportedFilters: string[];
  supportedGroupings: string[];
  available: boolean;
  unavailableReason: string | null;
};

type ReportRow = {
  rowId: string;
  label: string;
  businessDate: string | null;
  farmerName: string | null;
  buyerName: string | null;
  vegetableName: string | null;
  statusLabel: string | null;
  sourceRef: string | null;
  metrics: Record<string, number | null>;
  notes: string | null;
  carriedForward?: boolean;
  observationDate?: string | null;
  priceUnavailable?: boolean;
};

type ReportResponse = {
  reportType: string;
  definitionVersion: string;
  scope: {
    dateModel: string;
    dateBasisLabel: string;
  };
  normalizedFilters: Record<string, unknown>;
  snapshot: {
    snapshotToken: string;
    capturedAt: string;
    expiresAt: string;
    recordingCutoffAt: string;
  };
  summary: Record<string, number | null>;
  rows: ReportRow[];
  nextCursor: string | null;
  rowCountEstimate: number | null;
  limitations: string[];
  emptyReason: "no_activity" | "data_unavailable" | "access_denied" | null;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoUtc(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

type Props = {
  canView: boolean;
  canExport: boolean;
};

export function ReportsPanel({ canView, canExport }: Props) {
  const formId = useId();
  const requestGen = useRef(0);
  const [pending, startTransition] = useTransition();
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [reportType, setReportType] = useState("sales_summary");
  const [fromBusinessDate, setFromBusinessDate] = useState(daysAgoUtc(7));
  const [toBusinessDate, setToBusinessDate] = useState(todayUtc());
  const [asOfBusinessDate, setAsOfBusinessDate] = useState(todayUtc());
  const [farmerId, setFarmerId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [vegetableId, setVegetableId] = useState("");
  const [grouping, setGrouping] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [uiState, setUiState] = useState<
    "idle" | "loading" | "ready" | "empty" | "denied" | "expired" | "exporting"
  >("idle");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [staleFilters, setStaleFilters] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const selected = catalog.find((c) => c.reportType === reportType) ?? null;

  useEffect(() => {
    if (!canView || !window.polivoReports) return;
    startTransition(() => {
      void window.polivoReports!.catalog().then((result) => {
        if (!result.ok) {
          setError(result.message);
          setUiState(result.code === "FORBIDDEN" ? "denied" : "idle");
          return;
        }
        const data = result.data as { items: ReportCatalogItem[] };
        setCatalog(data.items);
      });
    });
  }, [canView]);

  function buildFilters(): Record<string, string> {
    const filters: Record<string, string> = {};
    const supported = new Set(selected?.supportedFilters ?? []);
    if (supported.has("fromBusinessDate")) filters.fromBusinessDate = fromBusinessDate;
    if (supported.has("toBusinessDate")) filters.toBusinessDate = toBusinessDate;
    if (supported.has("asOfBusinessDate")) filters.asOfBusinessDate = asOfBusinessDate;
    if (supported.has("farmerId") && farmerId.trim()) filters.farmerId = farmerId.trim();
    if (supported.has("buyerId") && buyerId.trim()) filters.buyerId = buyerId.trim();
    if (supported.has("vegetableId") && vegetableId.trim()) filters.vegetableId = vegetableId.trim();
    if (supported.has("grouping") && grouping) filters.grouping = grouping;
    return filters;
  }

  function run(cursor?: string | null, snapshotToken?: string | null) {
    if (!window.polivoReports) {
      setError("Reports bridge unavailable.");
      return;
    }
    const gen = ++requestGen.current;
    setError(null);
    setExportMessage(null);
    setUiState("loading");
    setStaleFilters(false);
    startTransition(() => {
      void window
        .polivoReports!.run({
          reportType,
          filters: buildFilters(),
          limit: 50,
          cursor: cursor ?? undefined,
          snapshotToken: snapshotToken ?? undefined,
        })
        .then((result) => {
          if (gen !== requestGen.current) return;
          if (!result.ok) {
            if (result.conflict) {
              setUiState("expired");
              setError(result.message);
              return;
            }
            if (result.code === "FORBIDDEN") {
              setUiState("denied");
              setError(result.message);
              return;
            }
            setUiState("idle");
            setError(result.message);
            return;
          }
          if (result.stale) return;
          const data = result.data as ReportResponse;
          setReport(data);
          setUiState(data.emptyReason === "no_activity" ? "empty" : "ready");
        });
    });
  }

  function resetFilters() {
    setFromBusinessDate(daysAgoUtc(7));
    setToBusinessDate(todayUtc());
    setAsOfBusinessDate(todayUtc());
    setFarmerId("");
    setBuyerId("");
    setVegetableId("");
    setGrouping("none");
    setReport(null);
    setStaleFilters(false);
    setUiState("idle");
    setError(null);
  }

  function markFilterChanged() {
    if (report) setStaleFilters(true);
  }

  async function exportFormat(format: "csv" | "pdf") {
    if (!window.polivoReports || !report) return;
    if (!canExport) {
      setError("Export requires data.export permission.");
      setUiState("denied");
      return;
    }
    setUiState("exporting");
    setExportMessage(null);
    setError(null);
    const created = await window.polivoReports.createExport({
      reportType: report.reportType,
      format,
      filters: report.normalizedFilters,
      snapshotToken: report.snapshot.snapshotToken,
    });
    if (!created.ok) {
      setError(created.message);
      setUiState(created.code === "FORBIDDEN" ? "denied" : "ready");
      return;
    }
    const job = (created.data as { job: { exportJobId: string; defaultFileName: string } }).job;
    const saved = await window.polivoReports.saveExport({
      exportJobId: job.exportJobId,
      defaultFileName: job.defaultFileName,
    });
    if (!saved.ok) {
      if (saved.cancelled) {
        setExportMessage("Save cancelled — no completed artifact reported.");
        setUiState("ready");
        return;
      }
      setError(saved.message);
      setUiState("ready");
      return;
    }
    const data = saved.data as { savedPath: string; byteLength: number };
    setExportMessage(`Saved ${format.toUpperCase()} (${data.byteLength} bytes).`);
    setUiState("ready");
  }

  if (!canView) {
    return (
      <ErrorState
        title="Reports unavailable"
        description="Sign in with reports.view_financial to open local reports."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Local financial reports from the stall database. Offline-capable; no financial mutations."
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Report error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {exportMessage ? (
        <Alert>
          <AlertTitle>Export</AlertTitle>
          <AlertDescription>{exportMessage}</AlertDescription>
        </Alert>
      ) : null}
      {staleFilters && report ? (
        <Alert>
          <AlertTitle>Filters changed</AlertTitle>
          <AlertDescription>
            Showing previous selection until you Apply. Totals may not match the new filters.
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        id={formId}
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-type`}>Report</Label>
          <Select
            value={reportType}
            onValueChange={(value) => {
              setReportType(value);
              setReport(null);
              setUiState("idle");
              markFilterChanged();
            }}
          >
            <SelectTrigger id={`${formId}-type`}>
              <SelectValue placeholder="Select report" />
            </SelectTrigger>
            <SelectContent>
              {catalog.map((item) => (
                <SelectItem key={item.reportType} value={item.reportType}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected?.supportedFilters.includes("fromBusinessDate") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-from`}>From date</Label>
            <Input
              id={`${formId}-from`}
              type="date"
              value={fromBusinessDate}
              onChange={(e) => {
                setFromBusinessDate(e.target.value);
                markFilterChanged();
              }}
            />
          </div>
        ) : null}
        {selected?.supportedFilters.includes("toBusinessDate") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-to`}>To date</Label>
            <Input
              id={`${formId}-to`}
              type="date"
              value={toBusinessDate}
              onChange={(e) => {
                setToBusinessDate(e.target.value);
                markFilterChanged();
              }}
            />
          </div>
        ) : null}
        {selected?.supportedFilters.includes("asOfBusinessDate") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-asof`}>As of date</Label>
            <Input
              id={`${formId}-asof`}
              type="date"
              value={asOfBusinessDate}
              onChange={(e) => {
                setAsOfBusinessDate(e.target.value);
                markFilterChanged();
              }}
            />
          </div>
        ) : null}
        {selected?.supportedFilters.includes("farmerId") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-farmer`}>Farmer id</Label>
            <Input
              id={`${formId}-farmer`}
              value={farmerId}
              onChange={(e) => {
                setFarmerId(e.target.value);
                markFilterChanged();
              }}
            />
          </div>
        ) : null}
        {selected?.supportedFilters.includes("buyerId") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-buyer`}>Buyer id</Label>
            <Input
              id={`${formId}-buyer`}
              value={buyerId}
              onChange={(e) => {
                setBuyerId(e.target.value);
                markFilterChanged();
              }}
            />
          </div>
        ) : null}
        {selected?.supportedFilters.includes("vegetableId") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-veg`}>Vegetable id</Label>
            <Input
              id={`${formId}-veg`}
              value={vegetableId}
              onChange={(e) => {
                setVegetableId(e.target.value);
                markFilterChanged();
              }}
            />
          </div>
        ) : null}
        {selected?.supportedFilters.includes("grouping") ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-group`}>Grouping</Label>
            <Select
              value={grouping}
              onValueChange={(value) => {
                setGrouping(value);
                markFilterChanged();
              }}
            >
              <SelectTrigger id={`${formId}-group`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(selected.supportedGroupings.length > 0
                  ? selected.supportedGroupings
                  : ["none"]
                ).map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" form={formId} disabled={pending || uiState === "loading"}>
          Apply
        </Button>
        <Button type="button" variant="outline" onClick={resetFilters}>
          Reset
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!report || !canExport || uiState === "exporting"}
          onClick={() => void exportFormat("csv")}
        >
          Export CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!report || !canExport || uiState === "exporting"}
          onClick={() => void exportFormat("pdf")}
        >
          Export PDF
        </Button>
        {report?.nextCursor ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => run(report.nextCursor, report.snapshot.snapshotToken)}
          >
            Next page
          </Button>
        ) : null}
      </div>

      {uiState === "loading" || uiState === "exporting" ? (
        <LoadingState label={uiState === "exporting" ? "Preparing export" : "Loading report"} />
      ) : null}
      {uiState === "denied" ? (
        <ErrorState title="Permission denied" description={error ?? "Access denied."} />
      ) : null}
      {uiState === "expired" ? (
        <ErrorState
          title="Snapshot expired"
          description="Refresh deliberately with Apply. Results were not silently replaced."
        />
      ) : null}
      {uiState === "empty" ? (
        <EmptyState
          title="No matching activity"
          description="No rows for the selected filters. This is no activity, not data unavailable."
        />
      ) : null}

      {report && (uiState === "ready" || staleFilters) ? (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            <div>{report.scope.dateBasisLabel}</div>
            <div>
              Snapshot cutoff {report.snapshot.recordingCutoffAt} · expires{" "}
              {report.snapshot.expiresAt}
            </div>
            <div>
              Definition v{report.definitionVersion}
              {report.rowCountEstimate !== null
                ? ` · ~${report.rowCountEstimate} rows`
                : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(report.summary).map(([key, value]) => (
              <div key={key}>
                <span className="text-muted-foreground">{key}: </span>
                <span>{value === null ? "—" : value}</span>
              </div>
            ))}
          </div>
          {report.limitations.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {report.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Party / vegetable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Metrics</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.rowId}>
                  <TableCell>{row.businessDate ?? "—"}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>
                    {[row.farmerName, row.buyerName, row.vegetableName]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    {row.statusLabel ?? "—"}
                    {row.carriedForward ? " (carried forward)" : ""}
                    {row.priceUnavailable ? " (unavailable)" : ""}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {Object.entries(row.metrics)
                      .map(([k, v]) => `${k}=${v ?? "null"}`)
                      .join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
