import { useMemo, useRef, useState } from "react";
import type {
  AllocateExistingPaymentPreviewResponse,
  AllocateExistingPaymentResponse,
  EligibleObligationItemDto,
  EligibleObligationsResponse,
  PaymentRecordDto,
  PaymentReversalCommitResponse,
  PaymentReversalPreviewResponse,
} from "@polivo/contracts";
import { Alert, AlertDescription, AlertTitle, Button, Label, Textarea } from "@polivo/ui";

import { newClientId } from "../billing/billing-format";
import { PrintActions } from "../printing/PrintActions";
import { ObligationAllocationTable } from "./ObligationAllocationTable";
import { commitWithRecovery, loadPayment, paymentFromCommitData } from "./payment-commit";
import {
  allocationsFromPreview,
  directionLabel,
  formatMinorForInput,
  formatRs,
  methodLabel,
  obligationKey,
  resolveAllocationEntries,
  sumApplied,
  toAllocationInputs,
} from "./payment-format";

type PaymentDetailProps = {
  payment: PaymentRecordDto;
  notice: string | null;
  canReverse: boolean;
  /** Whether this session may allocate for the payment's direction. */
  canAllocate: boolean;
  onBack: () => void;
  onPaymentChanged: (payment: PaymentRecordDto, notice: string) => void;
  onOpenPayment: (paymentId: string) => void;
  onHistoryChanged: () => void;
};

type DetailAction = "none" | "allocate" | "reverse";

export function PaymentDetail({
  payment,
  notice,
  canReverse,
  canAllocate,
  onBack,
  onPaymentChanged,
  onOpenPayment,
  onHistoryChanged,
}: PaymentDetailProps) {
  const commitGuardRef = useRef(false);
  const [action, setAction] = useState<DetailAction>("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reverse
  const [reason, setReason] = useState("");
  const [reversalPreview, setReversalPreview] = useState<PaymentReversalPreviewResponse | null>(
    null,
  );

  // Allocate
  const [obligations, setObligations] = useState<EligibleObligationItemDto[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [allocatePreview, setAllocatePreview] =
    useState<AllocateExistingPaymentPreviewResponse | null>(null);

  const isReversalRecord = payment.reversesPaymentId !== null;
  const isPosted = payment.status === "posted" && !isReversalRecord;
  const showReverse = canReverse && isPosted;
  const showAllocate = canAllocate && isPosted && payment.unappliedAmountMinor > 0;

  const entries = useMemo(
    () => resolveAllocationEntries(obligations, amounts),
    [obligations, amounts],
  );
  const entryErrors = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const entry of entries) {
      map[obligationKey(entry.item.obligationKind, entry.item.targetId)] = entry.error;
    }
    return map;
  }, [entries]);
  const appliedTotal = sumApplied(entries);
  const allocationOverAvailable = appliedTotal > payment.unappliedAmountMinor;
  const allocationInvalid =
    entries.length === 0 ||
    entries.some((entry) => entry.error !== null) ||
    allocationOverAvailable;

  async function openAllocate() {
    if (!window.polivoPayments) {
      return;
    }
    setAction("allocate");
    setError(null);
    setAllocatePreview(null);
    setAmounts({});
    setBusy(true);
    const result = await window.polivoPayments.listObligations({
      partyKind: payment.partyKind,
      partyId: payment.partyId,
      direction: payment.direction,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    setObligations((result.data as EligibleObligationsResponse).obligations);
  }

  function toggleObligation(item: EligibleObligationItemDto) {
    setAllocatePreview(null);
    const key = obligationKey(item.obligationKind, item.targetId);
    setAmounts((previous) => {
      if (previous[key] !== undefined) {
        const next = { ...previous };
        delete next[key];
        return next;
      }
      const alreadyApplied = resolveAllocationEntries(obligations, previous).reduce(
        (sum, entry) => sum + (entry.appliedMinor ?? 0),
        0,
      );
      const room = Math.max(0, payment.unappliedAmountMinor - alreadyApplied);
      const suggested = Math.min(item.remainingMinor, room > 0 ? room : item.remainingMinor);
      return { ...previous, [key]: formatMinorForInput(suggested) };
    });
  }

  async function runAllocatePreview() {
    if (!window.polivoPayments || allocationInvalid) {
      setError(
        allocationOverAvailable
          ? `Allocated total exceeds the unapplied ${formatRs(payment.unappliedAmountMinor)}.`
          : "Select at least one obligation with a valid amount.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoPayments.previewAllocate({
      paymentId: payment.paymentId,
      allocations: toAllocationInputs(entries),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAllocatePreview(result.data as AllocateExistingPaymentPreviewResponse);
  }

  async function runAllocateCommit() {
    if (!allocatePreview || allocatePreview.blockingErrors.length > 0 || commitGuardRef.current) {
      return;
    }
    if (!canAllocate) {
      setError("Missing the payment capability for this direction.");
      return;
    }
    commitGuardRef.current = true;
    setBusy(true);
    setError(null);
    const payload = {
      paymentId: payment.paymentId,
      allocations: allocationsFromPreview(allocatePreview.allocations),
      previewFingerprint: allocatePreview.previewFingerprint,
    };
    const outcome = await commitWithRecovery({
      kind: "allocate",
      idempotencyKey: newClientId("palloc"),
      startedAt: new Date().toISOString(),
      partyKind: payment.partyKind,
      partyId: payment.partyId,
      direction: payment.direction,
      paymentId: payment.paymentId,
      previewFingerprint: allocatePreview.previewFingerprint,
      payload,
    });
    if (outcome.status === "ok") {
      const updated = paymentFromCommitData(
        "allocate",
        outcome.data as AllocateExistingPaymentResponse,
      );
      commitGuardRef.current = false;
      setBusy(false);
      onHistoryChanged();
      onPaymentChanged(
        updated,
        `Allocated part of ${updated.referenceNumber} to open obligations.`,
      );
      return;
    }
    if (outcome.status === "recovered") {
      const loaded = await loadPayment(outcome.operation.paymentId);
      commitGuardRef.current = false;
      setBusy(false);
      onHistoryChanged();
      if (typeof loaded === "string") {
        setError(`Allocation was recorded but could not be reloaded: ${loaded}`);
        return;
      }
      onPaymentChanged(loaded, `Recovered allocation for ${loaded.referenceNumber}.`);
      return;
    }
    commitGuardRef.current = false;
    setBusy(false);
    setError(
      outcome.status === "unknown"
        ? `${outcome.message} Reopen the Payments workspace to recover this operation.`
        : outcome.message,
    );
  }

  async function runReversalPreview() {
    if (!window.polivoPayments) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("A reason is required before previewing a reversal.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoPayments.previewReversal({
      paymentId: payment.paymentId,
      reason: trimmed,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setReversalPreview(null);
      return;
    }
    setReversalPreview(result.data as PaymentReversalPreviewResponse);
  }

  async function runReversalCommit() {
    if (!reversalPreview || reversalPreview.blockingErrors.length > 0 || commitGuardRef.current) {
      return;
    }
    if (!canReverse) {
      setError("Missing payments.reverse capability.");
      return;
    }
    commitGuardRef.current = true;
    setBusy(true);
    setError(null);
    const payload = {
      paymentId: payment.paymentId,
      reason: reversalPreview.reason,
      previewFingerprint: reversalPreview.previewFingerprint,
    };
    const outcome = await commitWithRecovery({
      kind: "reverse",
      idempotencyKey: newClientId("prev"),
      startedAt: new Date().toISOString(),
      partyKind: payment.partyKind,
      partyId: payment.partyId,
      direction: payment.direction,
      paymentId: payment.paymentId,
      previewFingerprint: reversalPreview.previewFingerprint,
      payload,
    });
    if (outcome.status === "ok") {
      const reversal = paymentFromCommitData(
        "reverse",
        outcome.data as PaymentReversalCommitResponse,
      );
      commitGuardRef.current = false;
      setBusy(false);
      onHistoryChanged();
      onPaymentChanged(
        reversal,
        `Reversed ${payment.referenceNumber}. Reversal reference ${reversal.referenceNumber}.`,
      );
      return;
    }
    if (outcome.status === "recovered") {
      const loaded = await loadPayment(outcome.operation.paymentId);
      commitGuardRef.current = false;
      setBusy(false);
      onHistoryChanged();
      if (typeof loaded === "string") {
        setError(`Reversal was recorded but could not be reloaded: ${loaded}`);
        return;
      }
      onPaymentChanged(loaded, `Recovered reversal ${loaded.referenceNumber}.`);
      return;
    }
    commitGuardRef.current = false;
    setBusy(false);
    setError(
      outcome.status === "unknown"
        ? `${outcome.message} Reopen the Payments workspace to recover this operation.`
        : outcome.message,
    );
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <Alert>
          <AlertTitle>Recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-2 rounded-md border p-3" aria-label="Payment detail">
        <h2 className="text-base font-semibold">
          Payment {payment.referenceNumber}
          {payment.status === "reversed" ? " (reversed)" : ""}
          {isReversalRecord ? " (reversal entry)" : ""}
        </h2>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div>Direction: {directionLabel(payment.direction)}</div>
          <div>Method: {methodLabel(payment.method)}</div>
          <div>Business date: {payment.businessDate}</div>
          <div>Amount: {formatRs(payment.amountMinor)}</div>
          <div>Allocated: {formatRs(payment.allocatedTotalMinor)}</div>
          <div>Unapplied: {formatRs(payment.unappliedAmountMinor)}</div>
          {payment.bankTransferReference ? (
            <div>Bank reference: {payment.bankTransferReference}</div>
          ) : null}
          {payment.bankTransferDate ? <div>Bank date: {payment.bankTransferDate}</div> : null}
          {payment.bankAccountLabel ? <div>Bank account: {payment.bankAccountLabel}</div> : null}
          {payment.chequeNumber ? <div>Cheque number: {payment.chequeNumber}</div> : null}
          {payment.issuingBankLabel ? <div>Issuing bank: {payment.issuingBankLabel}</div> : null}
          {payment.chequeDate ? <div>Cheque date: {payment.chequeDate}</div> : null}
          {payment.physicalHandoverDate ? (
            <div>Handover date: {payment.physicalHandoverDate}</div>
          ) : null}
          {payment.note ? <div className="md:col-span-3">Note: {payment.note}</div> : null}
        </div>
        <PrintActions documentKind="payment_receipt" documentId={payment.paymentId} />
        <div className="flex flex-wrap gap-2 text-sm">
          {payment.reversesPaymentId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenPayment(payment.reversesPaymentId!)}
            >
              Open original payment
            </Button>
          ) : null}
          {payment.reversedByPaymentId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenPayment(payment.reversedByPaymentId!)}
            >
              Open reversal
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-1" aria-label="Payment allocations">
        <h3 className="text-sm font-semibold">Allocations</h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Target</th>
              <th className="py-1 pr-2">Kind</th>
              <th className="py-1 pr-2">Applied</th>
              <th className="py-1 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((allocation) => (
              <tr key={allocation.allocationId} className="border-b">
                <td className="py-1 pr-2 font-mono text-xs">{allocation.targetId}</td>
                <td className="py-1 pr-2">{allocation.obligationKind}</td>
                <td className="py-1 pr-2">{formatRs(allocation.appliedAmountMinor)}</td>
                <td className="py-1 pr-2">{allocation.status}</td>
              </tr>
            ))}
            {payment.allocations.length === 0 ? (
              <tr>
                <td className="py-2 text-muted-foreground" colSpan={4}>
                  No allocations. The full amount is unapplied.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back to payments
        </Button>
        {showAllocate ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy || action === "allocate"}
            onClick={() => void openAllocate()}
          >
            Allocate unapplied amount
          </Button>
        ) : null}
        {showReverse ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy || action === "reverse"}
            onClick={() => {
              setAction("reverse");
              setError(null);
              setReversalPreview(null);
            }}
          >
            Reverse payment
          </Button>
        ) : null}
      </div>

      {action === "allocate" && showAllocate ? (
        <section className="space-y-3 rounded-md border p-3" aria-label="Allocate unapplied amount">
          <h3 className="text-sm font-semibold">
            Allocate unapplied {formatRs(payment.unappliedAmountMinor)}
          </h3>
          <p className="text-sm text-muted-foreground">
            Allocation does not move more cash or change the account balance.
          </p>
          <ObligationAllocationTable
            idPrefix={`detail-${payment.paymentId}`}
            obligations={obligations}
            amounts={amounts}
            errors={entryErrors}
            disabled={busy}
            onToggle={toggleObligation}
            onAmountChange={(item, text) => {
              setAllocatePreview(null);
              setAmounts((previous) => ({
                ...previous,
                [obligationKey(item.obligationKind, item.targetId)]: text,
              }));
            }}
          />
          <div className="text-sm">
            Selected to allocate: {formatRs(appliedTotal)} of{" "}
            {formatRs(payment.unappliedAmountMinor)}
          </div>
          {allocationOverAvailable ? (
            <p className="text-sm text-destructive">
              Allocated total exceeds the unapplied amount.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || allocationInvalid}
              onClick={() => void runAllocatePreview()}
            >
              Review allocation
            </Button>
          </div>
          {allocatePreview ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <h4 className="font-semibold">Allocation review (not a receipt)</h4>
              {allocatePreview.blockingErrors.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTitle>Cannot allocate</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {allocatePreview.blockingErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              <ul className="space-y-1">
                {allocatePreview.allocations.map((row) => (
                  <li key={obligationKey(row.obligationKind, row.targetId)}>
                    {row.label}: apply {formatRs(row.appliedAmountMinor)}, remaining after{" "}
                    {formatRs(row.remainingAfterMinor)}
                  </li>
                ))}
              </ul>
              <div>Allocated total: {formatRs(allocatePreview.allocatedTotalMinor)}</div>
              <div>Remaining unapplied: {formatRs(allocatePreview.remainingUnappliedMinor)}</div>
              <div>Account balance is unchanged by allocation.</div>
              <Button
                type="button"
                disabled={busy || allocatePreview.blockingErrors.length > 0 || !canAllocate}
                onClick={() => void runAllocateCommit()}
              >
                Commit allocation
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {action === "reverse" && showReverse ? (
        <section className="space-y-3 rounded-md border p-3" aria-label="Reverse payment">
          <h3 className="text-sm font-semibold">Reverse payment {payment.referenceNumber}</h3>
          <p className="text-sm text-muted-foreground">
            Reversal undoes the whole payment and releases its allocations. Enter does not commit.
          </p>
          <div className="space-y-1">
            <Label htmlFor={`reverse-reason-${payment.paymentId}`}>Reason (required)</Label>
            <Textarea
              id={`reverse-reason-${payment.paymentId}`}
              rows={3}
              value={reason}
              disabled={busy}
              onChange={(event) => {
                setReason(event.target.value);
                setReversalPreview(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || reason.trim().length === 0}
            onClick={() => void runReversalPreview()}
          >
            Review reversal
          </Button>
          {reversalPreview ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <h4 className="font-semibold">Reversal review (not a receipt)</h4>
              {reversalPreview.blockingErrors.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTitle>Cannot reverse</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {reversalPreview.blockingErrors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div>
                {directionLabel(reversalPreview.direction)} · {methodLabel(reversalPreview.method)}{" "}
                · original {formatRs(reversalPreview.originalAmountMinor)}
              </div>
              <div>
                Account balance: {formatRs(reversalPreview.accountBalanceBeforeMinor)} →{" "}
                {formatRs(reversalPreview.accountBalanceAfterMinor)}
              </div>
              <div>Allocations to release: {reversalPreview.allocationsToRelease.length}</div>
              {reversalPreview.obligationsReopening.length > 0 ? (
                <ul className="space-y-1">
                  {reversalPreview.obligationsReopening.map((row) => (
                    <li key={obligationKey(row.obligationKind, row.targetId)}>
                      Reopens {row.label}: {formatRs(row.reopenAmountMinor)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div>Reason: {reversalPreview.reason}</div>
              <Button
                type="button"
                disabled={busy || reversalPreview.blockingErrors.length > 0 || !canReverse}
                onClick={() => void runReversalCommit()}
              >
                Commit reversal
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
