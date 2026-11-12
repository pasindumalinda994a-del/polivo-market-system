import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@polivo/ui";

import { PrintActions } from "./printing/PrintActions";

type PartyKind = "farmer" | "trader";

type StatementResponse = {
  header: {
    partyCode: string;
    partyDisplayName: string;
    accountRole: PartyKind;
    currency: string;
    fromBusinessDate: string;
    toBusinessDate: string;
    dateBasis: string;
    generatedAt: string;
  };
  summary: {
    openingBalanceMinor: number;
    openingDirectionLabel: string;
    periodIncreaseMinor: number;
    periodDecreaseMinor: number;
    closingBalanceMinor: number;
    closingDirectionLabel: string;
    movementCount: number;
  };
  balanceBeforePageMinor: number;
  items: Array<{
    entryId: string;
    businessDate: string;
    sourceType: string;
    financialEventType: string;
    description: string | null;
    documentReference: string | null;
    increaseMinor: number;
    decreaseMinor: number;
    runningBalanceMinor: number;
    runningDirectionLabel: string;
    reversesEntryId: string | null;
    reversedByEntryId: string | null;
  }>;
  nextCursor: string | null;
  snapshot: {
    snapshotToken: string;
    capturedAt: string;
    expiresAt: string;
    maxPostingSequence: number;
    businessTimezone: string;
  };
  rowFilterActive: boolean;
  rowFilterLabel: string | null;
};

type OutstandingResponse = {
  remainingObligationsMinor: number;
  unappliedPaymentsMinor: number;
  accountBalanceMinor: number;
  reconciliationOk: boolean;
  reconciliationDiagnostic: string | null;
  isHistorical: boolean;
  items: Array<{
    targetId: string;
    label: string;
    sourceDate: string | null;
    originalAmountMinor: number;
    effectiveAmountMinor: number;
    activeAllocatedMinor: number;
    remainingMinor: number;
    relatedBillNumber: string | null;
    settlementStatus: string;
    correctionStatus: string;
  }>;
  snapshot: { snapshotToken: string };
};

type AccountStatementPanelProps = {
  partyKind: PartyKind;
  partyId: string;
  partyLabel: string;
  hostAvailable: boolean;
  signedIn: boolean;
  canView: boolean;
  staffKey: string | null;
  onClose: () => void;
};

function formatMoneyMinor(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  return `${sign}Rs. ${major}.${minor}`;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AccountStatementPanel({
  partyKind,
  partyId,
  partyLabel,
  hostAvailable,
  signedIn,
  canView,
  staffKey,
  onClose,
}: AccountStatementPanelProps) {
  const requestGen = useRef(0);
  const [fromDate, setFromDate] = useState("2020-01-01");
  const [toDate, setToDate] = useState(utcToday);
  const [asOfDate, setAsOfDate] = useState(utcToday);
  const [movementSearch, setMovementSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageBusy, setPageBusy] = useState(false);

  useEffect(() => {
    setStatement(null);
    setOutstanding(null);
    setError(null);
    setAppliedSearch("");
    setMovementSearch("");
    requestGen.current += 1;
  }, [partyId, partyKind, staffKey]);

  async function loadStatement(options?: {
    cursor?: string;
    snapshotToken?: string;
    append?: boolean;
    search?: string;
  }): Promise<void> {
    if (!window.polivoAccounts || !signedIn || !hostAvailable || !canView) {
      return;
    }
    const gen = ++requestGen.current;
    setLoading(true);
    setError(null);
    const search = options?.search ?? appliedSearch;
    const result = await window.polivoAccounts.getStatement({
      partyKind,
      partyId,
      fromBusinessDate: fromDate,
      toBusinessDate: toDate,
      limit: 20,
      cursor: options?.cursor,
      snapshotToken: options?.snapshotToken,
      movementSearch: search.trim().length > 0 ? search.trim() : undefined,
    });
    if (gen !== requestGen.current) {
      return;
    }
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    const data = result.data as StatementResponse;
    setStatement((prev) =>
      options?.append && prev
        ? {
            ...data,
            items: [...prev.items, ...data.items],
          }
        : data,
    );
  }

  async function loadOutstanding(historical: boolean): Promise<void> {
    if (!window.polivoAccounts || !signedIn || !hostAvailable || !canView) {
      return;
    }
    const gen = ++requestGen.current;
    setLoading(true);
    setError(null);
    const result = await window.polivoAccounts.listOutstanding({
      partyKind,
      partyId,
      asOfBusinessDate: asOfDate,
      historical,
      snapshotToken: statement?.snapshot.snapshotToken,
      limit: 50,
    });
    if (gen !== requestGen.current) {
      return;
    }
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    setOutstanding(result.data as OutstandingResponse);
  }

  async function applyFilters(): Promise<void> {
    setAppliedSearch(movementSearch);
    await loadStatement({ search: movementSearch });
  }

  function resetFilters(): void {
    setFromDate("2020-01-01");
    setToDate(utcToday());
    setAsOfDate(utcToday());
    setMovementSearch("");
    setAppliedSearch("");
    setStatement(null);
    setOutstanding(null);
    setError(null);
  }

  async function loadMore(): Promise<void> {
    if (!statement?.nextCursor || pageBusy) {
      return;
    }
    setPageBusy(true);
    await loadStatement({
      cursor: statement.nextCursor,
      snapshotToken: statement.snapshot.snapshotToken,
      append: true,
    });
    setPageBusy(false);
  }

  async function refreshSnapshot(): Promise<void> {
    setStatement(null);
    setOutstanding(null);
    await loadStatement({ search: appliedSearch });
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Account statement — {partyLabel}</h3>
          <p className="text-xs text-muted-foreground">
            Read-only ledger statement. Business dates use UTC calendar boundaries.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close statement
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Statement error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="statement-from">From</Label>
          <Input
            id="statement-from"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="statement-to">To</Label>
          <Input
            id="statement-to"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="statement-search">Movement search</Label>
          <Input
            id="statement-search"
            value={movementSearch}
            onChange={(event) => setMovementSearch(event.target.value)}
            placeholder="Reference or source (row filter only)"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="statement-asof">Outstanding as-of</Label>
          <Input
            id="statement-asof"
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={() => void applyFilters()}>
          Apply
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={resetFilters}>
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => void refreshSnapshot()}
        >
          Refresh snapshot
        </Button>
      </div>

      {loading ? <LoadingState label="Loading statement…" /> : null}

      {statement ? (
        <div className="space-y-3">
          <PrintActions
            documentKind="account_statement"
            documentId={`stmt-${partyId.slice(0, 48)}-${statement.header.fromBusinessDate}-${statement.header.toBusinessDate}`}
            statementSnapshotToken={statement.snapshot.snapshotToken}
          />
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Party</div>
              <div className="font-medium">
                {statement.header.partyCode} — {statement.header.partyDisplayName}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Period</div>
              <div className="font-medium">
                {statement.header.fromBusinessDate} → {statement.header.toBusinessDate}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Date basis / timezone</div>
              <div className="font-medium">
                {statement.header.dateBasis} / {statement.snapshot.businessTimezone}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Generated / cutoff</div>
              <div className="font-medium">
                {statement.header.generatedAt.slice(0, 19)}Z · seq{" "}
                {statement.snapshot.maxPostingSequence}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">Opening</div>
              <div className="font-semibold">
                {formatMoneyMinor(statement.summary.openingBalanceMinor)}
              </div>
              <div className="text-xs">{statement.summary.openingDirectionLabel}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">Period increase</div>
              <div className="font-semibold">
                {formatMoneyMinor(statement.summary.periodIncreaseMinor)}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">Period decrease</div>
              <div className="font-semibold">
                {formatMoneyMinor(statement.summary.periodDecreaseMinor)}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">Closing</div>
              <div className="font-semibold">
                {formatMoneyMinor(statement.summary.closingBalanceMinor)}
              </div>
              <div className="text-xs">{statement.summary.closingDirectionLabel}</div>
            </div>
          </div>

          {statement.rowFilterActive ? (
            <Alert>
              <AlertTitle>Row filter active</AlertTitle>
              <AlertDescription>
                {statement.rowFilterLabel ??
                  "Period totals remain for the complete selected period."}
              </AlertDescription>
            </Alert>
          ) : null}

          <Tabs defaultValue="movements">
            <TabsList>
              <TabsTrigger value="movements">Movements</TabsTrigger>
              <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            </TabsList>
            <TabsContent value="movements" className="space-y-2">
              {statement.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No movements in the selected period
                  {statement.summary.openingBalanceMinor !== 0
                    ? " (nonzero opening brought forward)."
                    : "."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Increase</TableHead>
                        <TableHead className="text-right">Decrease</TableHead>
                        <TableHead className="text-right">Running</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.items.map((item) => (
                        <TableRow key={item.entryId}>
                          <TableCell>{item.businessDate}</TableCell>
                          <TableCell>
                            {item.sourceType}/{item.financialEventType}
                            {item.reversesEntryId ? " · reversal" : ""}
                            {item.reversedByEntryId ? " · reversed" : ""}
                          </TableCell>
                          <TableCell>
                            {item.description ?? item.documentReference ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.increaseMinor > 0
                              ? formatMoneyMinor(item.increaseMinor)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.decreaseMinor > 0
                              ? formatMoneyMinor(item.decreaseMinor)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoneyMinor(item.runningBalanceMinor)}
                            <div className="text-xs text-muted-foreground">
                              {item.runningDirectionLabel}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {statement.nextCursor ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pageBusy}
                  onClick={() => void loadMore()}
                >
                  Load more
                </Button>
              ) : null}
            </TabsContent>
            <TabsContent value="outstanding" className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void loadOutstanding(false)}
                  disabled={loading}
                >
                  Load current outstanding
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void loadOutstanding(true)}
                  disabled={loading}
                >
                  Load historical as-of
                </Button>
              </div>
              {outstanding ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-3 text-sm">
                    <div>
                      Remaining obligations:{" "}
                      <strong>{formatMoneyMinor(outstanding.remainingObligationsMinor)}</strong>
                    </div>
                    <div>
                      Unapplied payments:{" "}
                      <strong>{formatMoneyMinor(outstanding.unappliedPaymentsMinor)}</strong>
                    </div>
                    <div>
                      Account balance:{" "}
                      <strong>{formatMoneyMinor(outstanding.accountBalanceMinor)}</strong>
                    </div>
                  </div>
                  {!outstanding.reconciliationOk && outstanding.reconciliationDiagnostic ? (
                    <Alert variant="destructive">
                      <AlertTitle>Reconciliation mismatch</AlertTitle>
                      <AlertDescription>{outstanding.reconciliationDiagnostic}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Bill</TableHead>
                          <TableHead className="text-right">Effective</TableHead>
                          <TableHead className="text-right">Settled</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outstanding.items.map((item) => (
                          <TableRow key={item.targetId}>
                            <TableCell>{item.label}</TableCell>
                            <TableCell>{item.sourceDate ?? "—"}</TableCell>
                            <TableCell>{item.relatedBillNumber ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              {formatMoneyMinor(item.effectiveAmountMinor)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoneyMinor(item.activeAllocatedMinor)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoneyMinor(item.remainingMinor)}
                            </TableCell>
                            <TableCell>
                              {item.settlementStatus}/{item.correctionStatus}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Open outstanding for the selected as-of date. Net balance, bill outstanding, and
                  unapplied payments stay distinct.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}
