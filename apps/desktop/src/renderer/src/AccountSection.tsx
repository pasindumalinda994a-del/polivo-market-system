import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
} from "@polivo/ui";

import type { AccountBalance, AccountMovement, OpeningDraft } from "../../preload/index";
import { AccountStatementPanel } from "./AccountStatementPanel";

type PartyKind = "farmer" | "trader";
type OpeningDirection =
  "stall_owes_farmer" | "farmer_owes_stall" | "buyer_owes_stall" | "stall_owes_buyer";

type AccountSectionProps = {
  partyKind: PartyKind;
  partyId: string | null;
  partyLabel: string;
  hostAvailable: boolean;
  signedIn: boolean;
  canView: boolean;
  canPrepare: boolean;
  canPost: boolean;
  staffKey: string | null;
  /** Optional shortcut into the Payments workspace with this party preselected. */
  paymentActionLabel?: string;
  onPaymentAction?: () => void;
};

function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMoneyMinor(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  return `${sign}Rs. ${major}.${minor}`;
}

function directionsFor(partyKind: PartyKind): OpeningDirection[] {
  return partyKind === "farmer"
    ? ["stall_owes_farmer", "farmer_owes_stall"]
    : ["buyer_owes_stall", "stall_owes_buyer"];
}

function directionOptionLabel(direction: OpeningDirection): string {
  switch (direction) {
    case "stall_owes_farmer":
      return "Stall owes farmer";
    case "farmer_owes_stall":
      return "Farmer owes stall";
    case "buyer_owes_stall":
      return "Buyer owes stall";
    case "stall_owes_buyer":
      return "Stall owes buyer";
  }
}

export function AccountSection({
  partyKind,
  partyId,
  partyLabel,
  hostAvailable,
  signedIn,
  canView,
  canPrepare,
  canPost,
  staffKey,
  paymentActionLabel,
  onPaymentAction,
}: AccountSectionProps) {
  const prepareKeyRef = useRef(newIdempotencyKey("opening-prepare"));
  const postKeyRef = useRef(newIdempotencyKey("opening-post"));
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [showMovements, setShowMovements] = useState(false);
  const [draft, setDraft] = useState<OpeningDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<OpeningDirection>(directionsFor(partyKind)[0]!);
  const [amountMajor, setAmountMajor] = useState("0.00");
  const [cutoffDate, setCutoffDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [explanation, setExplanation] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [showStatement, setShowStatement] = useState(false);

  useEffect(() => {
    setBalance(null);
    setMovements([]);
    setShowMovements(false);
    setShowStatement(false);
    setDraft(null);
    setError(null);
    setInfo(null);
    setReviewMode(false);
    setDirection(directionsFor(partyKind)[0]!);
    setAmountMajor("0.00");
    setReference("");
    setExplanation("");
    prepareKeyRef.current = newIdempotencyKey("opening-prepare");
    postKeyRef.current = newIdempotencyKey("opening-post");
  }, [staffKey, partyKind, partyId]);

  useEffect(() => {
    if (!signedIn || !hostAvailable || !canView || !partyId || !window.polivoAccounts) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setError(null);
    void window.polivoAccounts
      .getBalance({ partyKind, partyId })
      .then((result) => {
        if (!result.ok) {
          setError(result.message);
          setBalance(null);
          return;
        }
        if (result.stale) {
          return;
        }
        setBalance(result.data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load balance.");
        setBalance(null);
      })
      .finally(() => setLoading(false));
  }, [signedIn, hostAvailable, canView, partyKind, partyId]);

  if (!partyId) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
        Select a {partyLabel.toLowerCase()} to view account balance and openings.
      </div>
    );
  }

  if (!signedIn || !hostAvailable) {
    return (
      <Alert>
        <AlertTitle>Account unavailable</AlertTitle>
        <AlertDescription>Sign in with a reachable stall host to view balances.</AlertDescription>
      </Alert>
    );
  }

  if (!canView) {
    return (
      <Alert>
        <AlertTitle>Missing permission</AlertTitle>
        <AlertDescription>
          Viewing balances requires the accounts.view capability. Refresh staff permissions if this
          was recently granted.
        </AlertDescription>
      </Alert>
    );
  }

  async function loadMovements(): Promise<void> {
    if (!window.polivoAccounts || !partyId) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoAccounts.listMovements({
      partyKind,
      partyId,
      limit: 20,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    setMovements(result.data.items);
    setShowMovements(true);
  }

  function parseAmountMinor(): number | null {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amountMajor.trim());
    if (!match) {
      return null;
    }
    const whole = Number(match[1]);
    const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
    return whole * 100 + fraction;
  }

  async function prepareDraft(): Promise<void> {
    if (!window.polivoAccounts || !partyId || busy) {
      return;
    }
    const amountMinor = parseAmountMinor();
    if (amountMinor === null) {
      setError("Enter an exact amount with at most two decimal places.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await window.polivoAccounts.prepareOpening(
      {
        partyKind,
        partyId,
        direction,
        amountMinor,
        cutoffDate,
        reference: reference.trim() || undefined,
        explanation: explanation.trim() || undefined,
      },
      prepareKeyRef.current,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      if (!result.conflict) {
        prepareKeyRef.current = newIdempotencyKey("opening-prepare");
      }
      return;
    }
    if (result.stale) {
      return;
    }
    setDraft(result.data);
    setReviewMode(true);
    setInfo("Draft saved. Drafts have no financial effect until posted.");
  }

  async function confirmPost(): Promise<void> {
    if (!window.polivoAccounts || !draft || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoAccounts.postOpening(
      draft.id,
      { expectedRevision: draft.revision },
      postKeyRef.current,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      if (result.conflict) {
        setInfo(
          "If the connection dropped after commit, retry with the same key or reload balance.",
        );
      } else {
        postKeyRef.current = newIdempotencyKey("opening-post");
      }
      return;
    }
    if (result.stale) {
      return;
    }
    setBalance(result.data.balance);
    setDraft(result.data.draft);
    setReviewMode(false);
    setInfo(
      result.data.postingId
        ? `Opening posted (${result.data.postingId}). Balance updated.`
        : "Zero opening completed. No movement was created.",
    );
    prepareKeyRef.current = newIdempotencyKey("opening-prepare");
    postKeyRef.current = newIdempotencyKey("opening-post");
    if (showMovements) {
      void loadMovements();
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Account — {partyLabel}</h3>
        {balance ? (
          <Badge variant="secondary">
            {balance.openingStatus === "not_opened" ? "Not opened" : "Opening complete"}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Account error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert>
          <AlertTitle>Account update</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? <LoadingState label="Loading balance…" /> : null}

      {balance ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="text-lg font-semibold">
              {formatMoneyMinor(balance.displayAmountMinor)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Direction</div>
            <div className="text-sm font-medium">{balance.directionLabel}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Currency</div>
            <div className="text-sm font-medium">{balance.currency}</div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !balance}
          onClick={() => void loadMovements()}
        >
          {showMovements ? "Refresh movements" : "View movements"}
        </Button>
        {partyId && canView ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!balance}
            onClick={() => setShowStatement((value) => !value)}
          >
            {showStatement ? "Hide statement" : "Open statement"}
          </Button>
        ) : null}
        {onPaymentAction && paymentActionLabel && partyId ? (
          <Button type="button" size="sm" onClick={onPaymentAction}>
            {paymentActionLabel}
          </Button>
        ) : null}
      </div>

      {showStatement && partyId ? (
        <AccountStatementPanel
          partyKind={partyKind}
          partyId={partyId}
          partyLabel={partyLabel}
          hostAvailable={hostAvailable}
          signedIn={signedIn}
          canView={canView}
          staffKey={staffKey}
          onClose={() => setShowStatement(false)}
        />
      ) : null}

      {showMovements ? (
        movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posted movements yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Running</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((item) => (
                  <TableRow key={item.entryId}>
                    <TableCell>{item.businessDate}</TableCell>
                    <TableCell>
                      {item.sourceType}/{item.financialEventType}
                    </TableCell>
                    <TableCell>{item.directionLabel}</TableCell>
                    <TableCell className="text-right">
                      {formatMoneyMinor(item.amountMinor)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoneyMinor(item.runningBalanceMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}

      {canPrepare && balance?.openingStatus === "not_opened" ? (
        <div className="space-y-3 border-t border-border pt-3">
          <h4 className="text-sm font-semibold">Opening balance</h4>
          <p className="text-xs text-muted-foreground">
            Drafts have no financial effect until an authorized staff member posts them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${partyKind}-opening-direction`}>Direction</Label>
              <select
                id={`${partyKind}-opening-direction`}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={direction}
                disabled={busy || reviewMode}
                onChange={(event) => setDirection(event.target.value as OpeningDirection)}
              >
                {directionsFor(partyKind).map((option) => (
                  <option key={option} value={option}>
                    {directionOptionLabel(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${partyKind}-opening-amount`}>Amount (Rs.)</Label>
              <Input
                id={`${partyKind}-opening-amount`}
                value={amountMajor}
                disabled={busy || reviewMode}
                onChange={(event) => setAmountMajor(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${partyKind}-opening-cutoff`}>Cutoff date</Label>
              <Input
                id={`${partyKind}-opening-cutoff`}
                type="date"
                value={cutoffDate}
                disabled={busy || reviewMode}
                onChange={(event) => setCutoffDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${partyKind}-opening-reference`}>Reference</Label>
              <Input
                id={`${partyKind}-opening-reference`}
                value={reference}
                disabled={busy || reviewMode}
                onChange={(event) => setReference(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`${partyKind}-opening-explanation`}>Explanation</Label>
              <Input
                id={`${partyKind}-opening-explanation`}
                value={explanation}
                disabled={busy || reviewMode}
                onChange={(event) => setExplanation(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!reviewMode ? (
              <Button type="button" disabled={busy} onClick={() => void prepareDraft()}>
                Save draft for review
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setReviewMode(false);
                    setDraft(null);
                    prepareKeyRef.current = newIdempotencyKey("opening-prepare");
                  }}
                >
                  Edit draft
                </Button>
                {canPost ? (
                  <Button
                    type="button"
                    disabled={busy || !draft}
                    onClick={() => void confirmPost()}
                  >
                    Post opening
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Posting requires accounts.opening_post.
                  </p>
                )}
              </>
            )}
          </div>
          {draft && reviewMode ? (
            <Alert>
              <AlertTitle>Review opening draft</AlertTitle>
              <AlertDescription>
                {directionOptionLabel(draft.direction)} · {formatMoneyMinor(draft.amountMinor)} ·
                cutoff {draft.cutoffDate}
                {draft.isZeroOpening ? " · zero opening (no movement)" : ""}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
