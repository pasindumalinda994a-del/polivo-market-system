import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EligibleObligationItemDto,
  EligibleObligationsResponse,
  ListPaymentsResponse,
  PaymentDirectionDto,
  PaymentListItemDto,
  PaymentPartyKindDto,
  PaymentPreviewResponse,
  PaymentRecordDto,
} from "@polivo/contracts";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "@polivo/ui";

import type { PaymentCommitRecovery } from "../../../preload/index";
import { ReferenceCombobox, type ReferenceOption } from "../billing/ReferenceCombobox";
import { newClientId } from "../billing/billing-format";
import { ObligationAllocationTable } from "./ObligationAllocationTable";
import { PaymentDetail } from "./PaymentDetail";
import {
  commitWithRecovery,
  loadPayment,
  lookupOperation,
  paymentFromCommitData,
  type CommitOutcome,
} from "./payment-commit";
import {
  accountBalanceLabel,
  allocationsFromPreview,
  directionForParty,
  directionLabel,
  formatMinorForInput,
  formatRs,
  isCalendarDate,
  methodLabel,
  obligationKey,
  parseMajorAmountToMinor,
  partyKindForDirection,
  resolveAllocationEntries,
  sumApplied,
  toAllocationInputs,
} from "./payment-format";

export type PaymentsInitialContext = {
  partyKind: PaymentPartyKindDto;
  party: ReferenceOption;
  /** Optional bill to preselect for allocation. */
  bill?: { billId: string; billNumber: string };
  /** Changes on every navigation request so repeated requests re-apply. */
  nonce: number;
};

export type PaymentsPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canReceive: boolean;
  canPay: boolean;
  canReverse: boolean;
  staffKey: string | null;
  initialContext?: PaymentsInitialContext | null;
  onInitialContextConsumed?: () => void;
};

type View = "workspace" | "review" | "detail";
type Method = "cash" | "bank_transfer" | "cheque";

type RecoveryBanner = {
  record: PaymentCommitRecovery;
  message: string;
};

const KIND_LABEL: Record<PaymentCommitRecovery["kind"], string> = {
  post: "payment",
  allocate: "allocation",
  reverse: "reversal",
};

const SELECT_CLASS = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function PaymentsPanel({
  hostAvailable,
  signedIn,
  canReceive,
  canPay,
  canReverse,
  staffKey,
  initialContext,
  onInitialContextConsumed,
}: PaymentsPanelProps) {
  const postingRef = useRef(false);
  const pendingBillRef = useRef<{ billId: string; billNumber: string } | null>(null);

  const [direction, setDirection] = useState<PaymentDirectionDto>(
    canReceive || !canPay ? "receive" : "pay",
  );
  const [party, setParty] = useState<ReferenceOption | null>(null);
  const [method, setMethod] = useState<Method>("cash");
  const [amountText, setAmountText] = useState("");
  const [businessDate, setBusinessDate] = useState("");
  const [note, setNote] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [bankDate, setBankDate] = useState("");
  const [bankLabel, setBankLabel] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [issuingBankLabel, setIssuingBankLabel] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [handoverDate, setHandoverDate] = useState("");
  const [handoverConfirmed, setHandoverConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const [obligationsData, setObligationsData] = useState<EligibleObligationsResponse | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PaymentPreviewResponse | null>(null);
  const [history, setHistory] = useState<PaymentListItemDto[]>([]);

  const [view, setView] = useState<View>("workspace");
  const [detail, setDetail] = useState<PaymentRecordDto | null>(null);
  const [detailNotice, setDetailNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryBanner | null>(null);

  const partyKind = partyKindForDirection(direction);
  const canPostDirection = direction === "receive" ? canReceive : canPay;
  const hasAnyCapability = canReceive || canPay || canReverse;
  const ready = signedIn && hostAvailable;

  const obligations = useMemo(() => obligationsData?.obligations ?? [], [obligationsData]);
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

  const amountMinor = parseMajorAmountToMinor(amountText);
  const allocatedTotal = sumApplied(entries);
  const totalOutstanding = obligations.reduce((sum, row) => sum + row.remainingMinor, 0);
  const selectedOutstanding = entries.reduce((sum, entry) => sum + entry.item.remainingMinor, 0);

  const errors = {
    party: !party && attempted ? "Select a party." : null,
    amount:
      amountText.trim() === ""
        ? attempted
          ? "Enter an amount."
          : null
        : amountMinor === null
          ? "Enter a positive amount with up to two decimals."
          : null,
    businessDate:
      businessDate.trim() !== "" && !isCalendarDate(businessDate.trim())
        ? "Use the format YYYY-MM-DD."
        : null,
    bankReference:
      method === "bank_transfer" && bankReference.trim() === "" && attempted
        ? "Bank transfer reference is required."
        : null,
    bankDate:
      method === "bank_transfer"
        ? bankDate.trim() === ""
          ? attempted
            ? "Bank transfer date is required."
            : null
          : !isCalendarDate(bankDate.trim())
            ? "Use the format YYYY-MM-DD."
            : null
        : null,
    chequeNumber:
      method === "cheque" && chequeNumber.trim() === "" && attempted
        ? "Cheque number is required."
        : null,
    issuingBankLabel:
      method === "cheque" && issuingBankLabel.trim() === "" && attempted
        ? "Issuing bank is required."
        : null,
    chequeDate:
      method === "cheque"
        ? chequeDate.trim() === ""
          ? attempted
            ? "Cheque date is required."
            : null
          : !isCalendarDate(chequeDate.trim())
            ? "Use the format YYYY-MM-DD."
            : null
        : null,
    handoverDate:
      method === "cheque"
        ? handoverDate.trim() === ""
          ? attempted
            ? "Physical handover date is required."
            : null
          : !isCalendarDate(handoverDate.trim())
            ? "Use the format YYYY-MM-DD."
            : null
        : null,
    handoverConfirmed:
      method === "cheque" && !handoverConfirmed && attempted
        ? "Confirm that the cheque was physically handed over."
        : null,
    allocation:
      amountMinor !== null && allocatedTotal > amountMinor
        ? "Allocated total exceeds the payment amount."
        : entries.some((entry) => entry.error !== null)
          ? "Fix the highlighted allocation amounts."
          : null,
  };
  const formHasErrors = Object.values(errors).some((value) => value !== null);

  const searchParties = useCallback(
    async (query: string) => {
      if (direction === "receive") {
        if (!window.polivoBuyers) {
          return { ok: false as const, code: "UNAVAILABLE", message: "Buyers bridge unavailable." };
        }
        const result = await window.polivoBuyers.list({
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
    },
    [direction],
  );

  function resetDraft() {
    setAmountText("");
    setAmounts({});
    setPreview(null);
    setAttempted(false);
    setNote("");
    setBankReference("");
    setBankDate("");
    setBankLabel("");
    setChequeNumber("");
    setIssuingBankLabel("");
    setChequeDate("");
    setHandoverDate("");
    setHandoverConfirmed(false);
    setBusinessDate("");
  }

  const loadHistory = useCallback(async () => {
    if (!window.polivoPayments || !ready || !hasAnyCapability) {
      return;
    }
    const result = await window.polivoPayments.list({
      ...(party ? { partyKind: partyKindForDirection(direction), partyId: party.id } : {}),
      ...(canPostDirection ? { direction } : {}),
      limit: 20,
    });
    if (!result.ok || result.stale) {
      return;
    }
    setHistory((result.data as ListPaymentsResponse).items);
  }, [party, direction, canPostDirection, ready, hasAnyCapability]);

  const loadObligations = useCallback(async () => {
    if (!window.polivoPayments || !party || !ready || !canPostDirection) {
      setObligationsData(null);
      return;
    }
    const result = await window.polivoPayments.listObligations({
      partyKind: partyKindForDirection(direction),
      partyId: party.id,
      direction,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.stale) {
      return;
    }
    const data = result.data as EligibleObligationsResponse;
    setObligationsData(data);
    const pendingBill = pendingBillRef.current;
    pendingBillRef.current = null;
    if (pendingBill) {
      const matches = data.obligations.filter(
        (row) =>
          row.documentId === pendingBill.billId ||
          row.farmerBillId === pendingBill.billId ||
          row.documentNumber === pendingBill.billNumber,
      );
      if (matches.length === 0) {
        setAmounts({});
        setMessage(
          `Bill ${pendingBill.billNumber} has no open obligation to allocate. It may be fully paid or not yet eligible.`,
        );
      } else {
        const selected: Record<string, string> = {};
        for (const row of matches) {
          selected[obligationKey(row.obligationKind, row.targetId)] = formatMinorForInput(
            row.remainingMinor,
          );
        }
        setAmounts(selected);
        setAmountText((current) =>
          current.trim() === ""
            ? formatMinorForInput(matches.reduce((sum, row) => sum + row.remainingMinor, 0))
            : current,
        );
        setMessage(`Preselected open obligations for bill ${pendingBill.billNumber}.`);
      }
    }
  }, [party, direction, ready, canPostDirection]);

  useEffect(() => {
    if (!initialContext) {
      return;
    }
    setDirection(directionForParty(initialContext.partyKind));
    setParty(initialContext.party);
    pendingBillRef.current = initialContext.bill ?? null;
    resetDraft();
    setView("workspace");
    setDetail(null);
    setError(null);
    setMessage(null);
    onInitialContextConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per navigation nonce
  }, [initialContext?.nonce]);

  useEffect(() => {
    if (!ready) {
      setObligationsData(null);
      setHistory([]);
      return;
    }
    void loadObligations();
    void loadHistory();
  }, [ready, staffKey, loadObligations, loadHistory]);

  async function refreshRecoveryBanner(messageText?: string) {
    if (!window.polivoPayments) {
      return;
    }
    const stored = await window.polivoPayments.getRecovery();
    if (stored.ok && stored.data !== null) {
      setRecovery({
        record: stored.data,
        message:
          messageText ??
          `A previous ${KIND_LABEL[stored.data.kind]} may not have completed. Its outcome is unknown.`,
      });
    } else {
      setRecovery(null);
    }
  }

  async function recoverFromStore(cancelled: () => boolean) {
    if (!window.polivoPayments) {
      return;
    }
    const stored = await window.polivoPayments.getRecovery();
    if (cancelled() || !stored.ok || stored.data === null) {
      return;
    }
    const record = stored.data;
    const lookup = await lookupOperation(record);
    if (cancelled()) {
      return;
    }
    if (!lookup.ok) {
      setRecovery({
        record,
        message: `Could not confirm the previous ${KIND_LABEL[record.kind]} outcome: ${lookup.message}`,
      });
      return;
    }
    const loaded = await loadPayment(lookup.operation.paymentId);
    if (cancelled()) {
      return;
    }
    if (typeof loaded === "string") {
      setRecovery({
        record,
        message: `The ${KIND_LABEL[record.kind]} was recorded but could not be loaded: ${loaded}`,
      });
      return;
    }
    await window.polivoPayments.clearRecovery();
    setRecovery(null);
    setDetail(loaded);
    setDetailNotice(`Recovered ${KIND_LABEL[record.kind]} ${loaded.referenceNumber}.`);
    setView("detail");
    void loadHistory();
    void loadObligations();
  }

  useEffect(() => {
    if (!ready) {
      return;
    }
    let cancelled = false;
    void recoverFromStore(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recover per staff session
  }, [ready, staffKey]);

  function buildRequest(propose: boolean): Record<string, unknown> | null {
    if (!party || amountMinor === null) {
      return null;
    }
    const isBank = method === "bank_transfer";
    const isCheque = method === "cheque";
    return {
      partyKind,
      partyId: party.id,
      direction,
      method,
      amountMinor,
      ...(businessDate.trim() !== "" ? { businessDate: businessDate.trim() } : {}),
      ...(note.trim() !== "" ? { note: note.trim() } : {}),
      ...(isBank
        ? {
            bankTransferReference: bankReference.trim(),
            bankTransferDate: bankDate.trim(),
            ...(bankLabel.trim() !== "" ? { bankAccountLabel: bankLabel.trim() } : {}),
          }
        : {}),
      ...(isCheque
        ? {
            chequeNumber: chequeNumber.trim(),
            issuingBankLabel: issuingBankLabel.trim(),
            chequeDate: chequeDate.trim(),
            physicalHandoverDate: handoverDate.trim(),
          }
        : {}),
      allocations: propose ? [] : toAllocationInputs(entries),
      ...(propose ? { proposeOldestFirst: true } : {}),
    };
  }

  async function runPreview(propose: boolean) {
    setAttempted(true);
    setError(null);
    setMessage(null);
    if (!window.polivoPayments || !canPostDirection) {
      setError("Missing the payment capability for this direction.");
      return;
    }
    const base =
      !party ||
      amountMinor === null ||
      errors.businessDate !== null ||
      errors.bankReference !== null ||
      errors.bankDate !== null ||
      errors.chequeNumber !== null ||
      errors.issuingBankLabel !== null ||
      errors.chequeDate !== null ||
      errors.handoverDate !== null ||
      (method === "bank_transfer" && (bankReference.trim() === "" || bankDate.trim() === "")) ||
      (method === "cheque" &&
        (chequeNumber.trim() === "" ||
          issuingBankLabel.trim() === "" ||
          chequeDate.trim() === "" ||
          handoverDate.trim() === "" ||
          !handoverConfirmed));
    if (base || (!propose && formHasErrors)) {
      setError("Fix the highlighted fields before reviewing.");
      return;
    }
    const request = buildRequest(propose);
    if (!request) {
      return;
    }
    setBusy(true);
    const result = await window.polivoPayments.preview(request);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const next = result.data as PaymentPreviewResponse;
    setPreview(next);
    if (propose) {
      const proposed: Record<string, string> = {};
      for (const row of next.allocations) {
        proposed[obligationKey(row.obligationKind, row.targetId)] = formatMinorForInput(
          row.appliedAmountMinor,
        );
      }
      setAmounts(proposed);
    }
    setView("review");
  }

  async function settleOutcome(
    kind: PaymentCommitRecovery["kind"],
    outcome: CommitOutcome,
  ): Promise<PaymentRecordDto | null> {
    if (outcome.status === "ok") {
      return paymentFromCommitData(kind, outcome.data);
    }
    if (outcome.status === "recovered") {
      const loaded = await loadPayment(outcome.operation.paymentId);
      if (typeof loaded === "string") {
        setError(`The ${KIND_LABEL[kind]} was recorded but could not be loaded: ${loaded}`);
        return null;
      }
      return loaded;
    }
    setError(outcome.message);
    if (outcome.status === "unknown") {
      await refreshRecoveryBanner(outcome.message);
    }
    return null;
  }

  async function postPayment() {
    if (!preview || preview.blockingErrors.length > 0 || postingRef.current) {
      return;
    }
    if (!canPostDirection) {
      setError("Missing the payment capability for this direction.");
      return;
    }
    postingRef.current = true;
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {
      partyKind: preview.partyKind,
      partyId: preview.partyId,
      direction: preview.direction,
      method: preview.method,
      amountMinor: preview.amountMinor,
      businessDate: preview.businessDate,
      ...(preview.note !== null ? { note: preview.note } : {}),
      ...(preview.bankTransferReference !== null
        ? { bankTransferReference: preview.bankTransferReference }
        : {}),
      ...(preview.bankTransferDate !== null ? { bankTransferDate: preview.bankTransferDate } : {}),
      ...(preview.bankAccountLabel !== null ? { bankAccountLabel: preview.bankAccountLabel } : {}),
      ...(preview.chequeNumber !== null ? { chequeNumber: preview.chequeNumber } : {}),
      ...(preview.issuingBankLabel !== null ? { issuingBankLabel: preview.issuingBankLabel } : {}),
      ...(preview.chequeDate !== null ? { chequeDate: preview.chequeDate } : {}),
      ...(preview.physicalHandoverDate !== null
        ? { physicalHandoverDate: preview.physicalHandoverDate }
        : {}),
      ...(preview.method === "cheque" ? { physicalHandoverConfirmed: true } : {}),
      allocations: allocationsFromPreview(preview.allocations),
      previewFingerprint: preview.previewFingerprint,
    };
    const outcome = await commitWithRecovery({
      kind: "post",
      idempotencyKey: newClientId("pay"),
      startedAt: new Date().toISOString(),
      partyKind: preview.partyKind,
      partyId: preview.partyId,
      direction: preview.direction,
      paymentId: null,
      previewFingerprint: preview.previewFingerprint,
      payload,
    });
    const payment = await settleOutcome("post", outcome);
    postingRef.current = false;
    setBusy(false);
    if (payment) {
      resetDraft();
      setDetail(payment);
      setDetailNotice(
        `Payment ${payment.referenceNumber} recorded. Allocated ${formatRs(payment.allocatedTotalMinor)}, unapplied ${formatRs(payment.unappliedAmountMinor)}.`,
      );
      setView("detail");
      void loadHistory();
      void loadObligations();
      return;
    }
    if (outcome.status === "failed") {
      // The reviewed state may be stale; return to the workspace so it can be refreshed.
      setPreview(null);
      setView("workspace");
      void loadObligations();
    }
  }

  async function retryRecovery() {
    if (!recovery || postingRef.current) {
      return;
    }
    postingRef.current = true;
    setBusy(true);
    setError(null);
    const record = recovery.record;
    const outcome = await commitWithRecovery(record);
    const payment = await settleOutcome(record.kind, outcome);
    postingRef.current = false;
    setBusy(false);
    if (payment) {
      setRecovery(null);
      setDetail(payment);
      setDetailNotice(`Completed ${KIND_LABEL[record.kind]} ${payment.referenceNumber}.`);
      setView("detail");
      void loadHistory();
      void loadObligations();
    } else if (outcome.status === "failed") {
      setRecovery(null);
    }
  }

  async function discardRecovery() {
    await window.polivoPayments?.clearRecovery();
    setRecovery(null);
    setMessage("Recovery record discarded. Check payment history before re-entering a payment.");
  }

  async function checkRecoveryAgain() {
    setBusy(true);
    await recoverFromStore(() => false);
    setBusy(false);
  }

  async function openPayment(paymentId: string, notice: string | null = null) {
    setBusy(true);
    setError(null);
    const loaded = await loadPayment(paymentId);
    setBusy(false);
    if (typeof loaded === "string") {
      setError(loaded);
      return;
    }
    setDetail(loaded);
    setDetailNotice(notice);
    setView("detail");
  }

  function toggleObligation(item: EligibleObligationItemDto) {
    setPreview(null);
    const key = obligationKey(item.obligationKind, item.targetId);
    setAmounts((previous) => {
      if (previous[key] !== undefined) {
        const next = { ...previous };
        delete next[key];
        return next;
      }
      let suggested = item.remainingMinor;
      if (amountMinor !== null) {
        const applied = resolveAllocationEntries(obligations, previous).reduce(
          (sum, entry) => sum + (entry.appliedMinor ?? 0),
          0,
        );
        const room = amountMinor - applied;
        if (room > 0) {
          suggested = Math.min(suggested, room);
        }
      }
      return { ...previous, [key]: formatMinorForInput(suggested) };
    });
  }

  function changeDirection(next: PaymentDirectionDto) {
    if (next === direction) {
      return;
    }
    setDirection(next);
    setParty(null);
    setObligationsData(null);
    pendingBillRef.current = null;
    resetDraft();
    if (next === "receive" && method === "cheque") {
      setMethod("cash");
    }
    setError(null);
    setMessage(null);
  }

  function resetToWorkspace() {
    setView("workspace");
    setDetail(null);
    setDetailNotice(null);
    setError(null);
  }

  if (!signedIn || !hostAvailable) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title="Payments" description="Sign in to record payments." />
        <Alert>
          <AlertTitle>Host session required</AlertTitle>
          <AlertDescription>Connect and sign in before using payments.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAnyCapability) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title="Payments" description="Payment capability required." />
        <Alert variant="destructive">
          <AlertTitle>Not authorized</AlertTitle>
          <AlertDescription>
            Missing payments.receive_trader, payments.pay_farmer, or payments.reverse.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const recoveryBanner = recovery ? (
    <Alert variant="destructive" role="alert">
      <AlertTitle>Unconfirmed {KIND_LABEL[recovery.record.kind]}</AlertTitle>
      <AlertDescription>
        <p>{recovery.message}</p>
        <p className="mt-1 text-xs">
          Started {recovery.record.startedAt}. Retrying reuses the same operation identity, so it
          cannot post twice.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void checkRecoveryAgain()}
          >
            Check outcome again
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void retryRecovery()}>
            Retry same operation
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void discardRecovery()}
          >
            Discard recovery
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  ) : null;

  if (view === "detail" && detail) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="Payments"
          description="Review a recorded payment, allocate unapplied amounts, or reverse it."
        />
        {recoveryBanner}
        <PaymentDetail
          key={`${detail.paymentId}:${detail.status}:${detail.allocatedTotalMinor}`}
          payment={detail}
          notice={detailNotice}
          canReverse={canReverse}
          canAllocate={detail.direction === "receive" ? canReceive : canPay}
          onBack={resetToWorkspace}
          onPaymentChanged={(next, notice) => {
            setDetail(next);
            setDetailNotice(notice);
          }}
          onOpenPayment={(paymentId) => void openPayment(paymentId)}
          onHistoryChanged={() => {
            void loadHistory();
            void loadObligations();
          }}
        />
      </div>
    );
  }

  if (view === "review" && preview) {
    const blocked = preview.blockingErrors.length > 0;
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="Review payment"
          description="Check every detail. Nothing is recorded until you choose Post payment. This is a review, not a receipt."
        />
        {recoveryBanner}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Cannot post</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {blocked ? (
          <Alert variant="destructive">
            <AlertTitle>Blocked by the service</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {preview.blockingErrors.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div>Direction: {directionLabel(preview.direction)}</div>
          <div>
            Party: {preview.partyCode} — {preview.partyDisplayName}
          </div>
          <div>Method: {methodLabel(preview.method)}</div>
          <div>Amount: {formatRs(preview.amountMinor)}</div>
          <div>Business date: {preview.businessDate}</div>
          {preview.note ? <div>Note: {preview.note}</div> : null}
          {preview.bankTransferReference ? (
            <div>Bank reference: {preview.bankTransferReference}</div>
          ) : null}
          {preview.bankTransferDate ? <div>Bank date: {preview.bankTransferDate}</div> : null}
          {preview.bankAccountLabel ? <div>Bank account: {preview.bankAccountLabel}</div> : null}
          {preview.chequeNumber ? <div>Cheque number: {preview.chequeNumber}</div> : null}
          {preview.issuingBankLabel ? <div>Issuing bank: {preview.issuingBankLabel}</div> : null}
          {preview.chequeDate ? <div>Cheque date: {preview.chequeDate}</div> : null}
          {preview.physicalHandoverDate ? (
            <div>Handover date: {preview.physicalHandoverDate}</div>
          ) : null}
        </div>
        {preview.settlementExplanation ? (
          <Alert>
            <AlertTitle>Handover settlement</AlertTitle>
            <AlertDescription>{preview.settlementExplanation}</AlertDescription>
          </Alert>
        ) : null}
        {preview.warnings.length > 0 ? (
          <Alert>
            <AlertTitle>Review duplicate cheque metadata</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {preview.warnings.map((warning) => (
                  <li key={warning.code}>
                    {warning.message} References: {warning.matchingReferenceNumbers.join(", ")}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Allocated to</th>
              <th className="py-1 pr-2">Applied</th>
              <th className="py-1 pr-2">Remaining after</th>
            </tr>
          </thead>
          <tbody>
            {preview.allocations.map((row) => (
              <tr key={obligationKey(row.obligationKind, row.targetId)} className="border-b">
                <td className="py-1 pr-2">{row.label}</td>
                <td className="py-1 pr-2">{formatRs(row.appliedAmountMinor)}</td>
                <td className="py-1 pr-2">{formatRs(row.remainingAfterMinor)}</td>
              </tr>
            ))}
            {preview.allocations.length === 0 ? (
              <tr>
                <td className="py-2 text-muted-foreground" colSpan={3}>
                  No obligations selected. The full amount will be recorded as unapplied.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-4">
          <div>Allocated: {formatRs(preview.allocatedTotalMinor)}</div>
          <div>Unapplied: {formatRs(preview.unappliedAmountMinor)}</div>
          <div>
            Account before: {formatRs(preview.accountBalanceBeforeMinor)} (
            {accountBalanceLabel(preview.partyKind, preview.accountBalanceBeforeMinor)})
          </div>
          <div>
            Account after: {formatRs(preview.accountBalanceAfterMinor)} (
            {accountBalanceLabel(preview.partyKind, preview.accountBalanceAfterMinor)})
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || blocked || !canPostDirection}
            onClick={() => void postPayment()}
          >
            Post payment
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setView("workspace");
              setError(null);
            }}
          >
            Back to edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Payments"
        description="Record cash or bank payments from buyers or to farmers. Review before posting; payments are never silently overwritten."
      />
      {recoveryBanner}
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
      {!canPostDirection ? (
        <Alert>
          <AlertTitle>Read-only for this mode</AlertTitle>
          <AlertDescription>
            Your session lacks{" "}
            {direction === "receive" ? "payments.receive_trader" : "payments.pay_farmer"}; you can
            browse history but cannot preview or post here.
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) {
            void runPreview(false);
          }
        }}
      >
        <div role="group" aria-label="Payment mode" className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={direction === "receive" ? "default" : "outline"}
            aria-pressed={direction === "receive"}
            disabled={!canReceive && !canReverse}
            onClick={() => changeDirection("receive")}
          >
            Receive from buyer
          </Button>
          <Button
            type="button"
            variant={direction === "pay" ? "default" : "outline"}
            aria-pressed={direction === "pay"}
            disabled={!canPay && !canReverse}
            onClick={() => changeDirection("pay")}
          >
            Pay farmer
          </Button>
        </div>

        <div className="space-y-1">
          <ReferenceCombobox
            label={direction === "receive" ? "Buyer" : "Farmer"}
            value={party}
            onChange={(value) => {
              setParty(value);
              setPreview(null);
              setAmounts({});
              setObligationsData(null);
              pendingBillRef.current = null;
            }}
            search={searchParties}
            allowInactiveSelection
          />
          {errors.party ? <p className="text-xs text-destructive">{errors.party}</p> : null}
        </div>

        {party && obligationsData ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3 text-sm" aria-label="Account balance">
              <div className="text-xs text-muted-foreground">Account balance (ledger)</div>
              <div className="text-base font-semibold">
                {formatRs(Math.abs(obligationsData.accountBalanceMinor))}
              </div>
              <div>{accountBalanceLabel(partyKind, obligationsData.accountBalanceMinor)}</div>
            </div>
            <div className="rounded-md border p-3 text-sm" aria-label="Open obligations">
              <div className="text-xs text-muted-foreground">Open obligations (all)</div>
              <div className="text-base font-semibold">{formatRs(totalOutstanding)}</div>
              <div>{obligations.length} open item(s)</div>
            </div>
            <div className="rounded-md border p-3 text-sm" aria-label="Selected obligations">
              <div className="text-xs text-muted-foreground">Selected obligation outstanding</div>
              <div className="text-base font-semibold">{formatRs(selectedOutstanding)}</div>
              <div>Applying {formatRs(allocatedTotal)}</div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="payment-method">Method</Label>
            <select
              id="payment-method"
              className={SELECT_CLASS}
              value={method}
              onChange={(event) => {
                const next = event.target.value as Method;
                setMethod(next);
                if (next !== "cheque") {
                  setHandoverConfirmed(false);
                }
                setPreview(null);
              }}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              {direction === "pay" ? <option value="cheque">Cheque</option> : null}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-amount">Amount (Rs.)</Label>
            <Input
              id="payment-amount"
              inputMode="decimal"
              value={amountText}
              aria-invalid={errors.amount !== null}
              aria-describedby={errors.amount ? "payment-amount-error" : undefined}
              onChange={(event) => {
                setAmountText(event.target.value);
                setPreview(null);
              }}
            />
            {errors.amount ? (
              <p id="payment-amount-error" className="text-xs text-destructive">
                {errors.amount}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-date">Business date (optional)</Label>
            <Input
              id="payment-date"
              placeholder="YYYY-MM-DD"
              value={businessDate}
              aria-invalid={errors.businessDate !== null}
              onChange={(event) => {
                setBusinessDate(event.target.value);
                setPreview(null);
              }}
            />
            {errors.businessDate ? (
              <p className="text-xs text-destructive">{errors.businessDate}</p>
            ) : null}
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label htmlFor="payment-note">Note (optional)</Label>
            <Textarea
              id="payment-note"
              rows={1}
              value={note}
              maxLength={500}
              onChange={(event) => {
                setNote(event.target.value);
                setPreview(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                }
              }}
            />
          </div>
        </div>

        {method === "bank_transfer" ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="payment-bank-reference">Bank transfer reference</Label>
              <Input
                id="payment-bank-reference"
                value={bankReference}
                maxLength={128}
                aria-invalid={errors.bankReference !== null}
                onChange={(event) => {
                  setBankReference(event.target.value);
                  setPreview(null);
                }}
              />
              {errors.bankReference ? (
                <p className="text-xs text-destructive">{errors.bankReference}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-bank-date">Bank transfer date</Label>
              <Input
                id="payment-bank-date"
                placeholder="YYYY-MM-DD"
                value={bankDate}
                aria-invalid={errors.bankDate !== null}
                onChange={(event) => {
                  setBankDate(event.target.value);
                  setPreview(null);
                }}
              />
              {errors.bankDate ? (
                <p className="text-xs text-destructive">{errors.bankDate}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-bank-label">Bank account label (optional)</Label>
              <Input
                id="payment-bank-label"
                value={bankLabel}
                maxLength={64}
                onChange={(event) => {
                  setBankLabel(event.target.value);
                  setPreview(null);
                }}
              />
            </div>
          </div>
        ) : null}

        {method === "cheque" ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="payment-cheque-number">Cheque number</Label>
                <Input
                  id="payment-cheque-number"
                  value={chequeNumber}
                  maxLength={64}
                  aria-invalid={errors.chequeNumber !== null}
                  onChange={(event) => {
                    setChequeNumber(event.target.value);
                    setPreview(null);
                  }}
                />
                {errors.chequeNumber ? (
                  <p className="text-xs text-destructive">{errors.chequeNumber}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="payment-issuing-bank">Issuing bank</Label>
                <Input
                  id="payment-issuing-bank"
                  value={issuingBankLabel}
                  maxLength={64}
                  aria-invalid={errors.issuingBankLabel !== null}
                  onChange={(event) => {
                    setIssuingBankLabel(event.target.value);
                    setPreview(null);
                  }}
                />
                {errors.issuingBankLabel ? (
                  <p className="text-xs text-destructive">{errors.issuingBankLabel}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="payment-cheque-date">Cheque date</Label>
                <Input
                  id="payment-cheque-date"
                  placeholder="YYYY-MM-DD"
                  value={chequeDate}
                  aria-invalid={errors.chequeDate !== null}
                  onChange={(event) => {
                    setChequeDate(event.target.value);
                    setPreview(null);
                  }}
                />
                {errors.chequeDate ? (
                  <p className="text-xs text-destructive">{errors.chequeDate}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="payment-handover-date">Physical handover date</Label>
                <Input
                  id="payment-handover-date"
                  placeholder="YYYY-MM-DD"
                  value={handoverDate}
                  aria-invalid={errors.handoverDate !== null}
                  onChange={(event) => {
                    setHandoverDate(event.target.value);
                    setPreview(null);
                  }}
                />
                {errors.handoverDate ? (
                  <p className="text-xs text-destructive">{errors.handoverDate}</p>
                ) : null}
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={handoverConfirmed}
                onChange={(event) => {
                  setHandoverConfirmed(event.target.checked);
                  setPreview(null);
                }}
              />
              <span>
                I confirm the cheque was physically handed to the farmer. Recording this handover
                counts the cheque amount as paid.
              </span>
            </label>
            {errors.handoverConfirmed ? (
              <p className="text-xs text-destructive">{errors.handoverConfirmed}</p>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-2" aria-label="Allocations">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Allocate to open obligations</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!party || busy}
                onClick={() => {
                  void loadObligations();
                  void loadHistory();
                }}
              >
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!party || busy || amountMinor === null || !canPostDirection}
                onClick={() => void runPreview(true)}
              >
                Propose oldest first
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={Object.keys(amounts).length === 0}
                onClick={() => {
                  setAmounts({});
                  setPreview(null);
                }}
              >
                Clear selection
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tick obligations and adjust amounts, or propose oldest-first (shown for review before
            posting). Anything not allocated is recorded as unapplied credit or advance. Arrow keys
            move between rows; Space toggles.
          </p>
          <ObligationAllocationTable
            idPrefix="payment-workspace"
            obligations={obligations}
            amounts={amounts}
            errors={entryErrors}
            disabled={busy || !canPostDirection}
            onToggle={toggleObligation}
            onAmountChange={(item, text) => {
              setPreview(null);
              setAmounts((previous) => ({
                ...previous,
                [obligationKey(item.obligationKind, item.targetId)]: text,
              }));
            }}
          />
          {errors.allocation ? (
            <p className="text-sm text-destructive">{errors.allocation}</p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !canPostDirection}>
            Review payment
          </Button>
          <span className="text-xs text-muted-foreground">
            Enter reviews only. Posting needs a separate explicit confirmation.
          </span>
        </div>
      </form>

      <section className="space-y-2" aria-label="Payment history">
        <h2 className="text-base font-semibold">
          {party ? `Payments for ${party.shortCode}` : "Recent payments"}
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Reference</th>
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Party</th>
              <th className="py-1 pr-2">Method</th>
              <th className="py-1 pr-2">Amount</th>
              <th className="py-1 pr-2">Unapplied</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2" />
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.paymentId} className="border-b">
                <td className="py-1 pr-2">{item.referenceNumber}</td>
                <td className="py-1 pr-2">{item.businessDate}</td>
                <td className="py-1 pr-2">
                  {item.partyCode} — {item.partyDisplayName}
                </td>
                <td className="py-1 pr-2">{methodLabel(item.method)}</td>
                <td className="py-1 pr-2">{formatRs(item.amountMinor)}</td>
                <td className="py-1 pr-2">{formatRs(item.unappliedAmountMinor)}</td>
                <td className="py-1 pr-2">{item.status}</td>
                <td className="py-1 pr-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void openPayment(item.paymentId)}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {history.length === 0 ? (
              <tr>
                <td className="py-2 text-muted-foreground" colSpan={8}>
                  No payments found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
