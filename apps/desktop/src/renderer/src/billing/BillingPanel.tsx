import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@polivo/ui";
import type {
  FinalizeSaleResponse,
  ListSaleDraftsResponse,
  SaleDraftListItemDto,
  SaleDraftRecordDto,
  SalePreviewResponse,
  TraderBillRecordDto,
} from "@polivo/contracts";
import { SALE_DRAFT_MAX_LINES } from "@polivo/contracts";

import { PrintActions } from "../printing/PrintActions";
import { WeightEntry } from "../WeightEntry";
import {
  buildUpdateRequest,
  createEmptyEditor,
  createEmptyLine,
  editorFromDraft,
  lineGrossPreviewKg,
  type BillEditor,
  type EditorLine,
} from "./billing-editor";
import {
  formatMoneyMinor,
  formatWeightHundredths,
  newClientId,
  todayCalendarDateUtc,
} from "./billing-format";
import { BILLING_SHORTCUTS, matchBillingShortcut } from "./billing-shortcuts";
import { billingAllows, describeSaveStatus, type BillingWorkflowState } from "./billing-state";
import { classifyFinalizeFailure, shouldResolveFinalizeOutcome } from "./finalize-failure";
import {
  ReferenceCombobox,
  type ReferenceOption,
  type ReferenceSearchResult,
} from "./ReferenceCombobox";

export type BillingPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canCreate: boolean;
  canEditDraft: boolean;
  canFinalize: boolean;
  staffKey: string | null;
};

type UndoSnapshot = { lines: EditorLine[]; activeLineKey: string | null } | null;

function canReadBills(canCreate: boolean, canEditDraft: boolean, canFinalize: boolean): boolean {
  return canCreate || canEditDraft || canFinalize;
}

export function BillingPanel({
  hostAvailable,
  signedIn,
  canCreate,
  canEditDraft,
  canFinalize,
  staffKey,
}: BillingPanelProps) {
  const baseId = useId();
  const buyerInputRef = useRef<HTMLInputElement | null>(null);
  const draftListRef = useRef<HTMLDivElement | null>(null);
  const requestGen = useRef(0);
  const finalizeKeyRef = useRef<string | null>(null);
  const finalizeInFlightRef = useRef(false);
  const [hasFinalizeKey, setHasFinalizeKey] = useState(false);

  const [workflow, setWorkflow] = useState<BillingWorkflowState>("no_active_draft");
  const [editor, setEditor] = useState<BillEditor>(() => createEmptyEditor(todayCalendarDateUtc()));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SaleDraftListItemDto[]>([]);
  const [draftCursor, setDraftCursor] = useState<string | null>(null);
  const [showDraftList, setShowDraftList] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [preview, setPreview] = useState<SalePreviewResponse | null>(null);
  const [finalized, setFinalized] = useState<TraderBillRecordDto | null>(null);
  const [undo, setUndo] = useState<UndoSnapshot>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const canRead = canReadBills(canCreate, canEditDraft, canFinalize);

  const bumpGeneration = useCallback(() => {
    requestGen.current += 1;
    return requestGen.current;
  }, []);

  const markDirty = useCallback(() => {
    setDirty(true);
    setPreview(null);
    setWorkflow((current) => {
      if (
        current === "ready_for_review" ||
        current === "saved" ||
        current === "editing" ||
        current === "review_stale"
      ) {
        return "unsaved_changes";
      }
      if (
        current === "finalizing" ||
        current === "finalized" ||
        current === "finalization_outcome_unknown"
      ) {
        return current;
      }
      return "unsaved_changes";
    });
  }, []);

  const searchBuyers = useCallback(async (q: string): Promise<ReferenceSearchResult> => {
    if (!window.polivoBuyers) {
      return { ok: false, code: "UNAVAILABLE", message: "Buyer search is unavailable." };
    }
    const result = await window.polivoBuyers.list({
      q: q || undefined,
      active: "active",
      limit: 20,
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    if (result.stale) {
      return { ok: true, items: [], stale: true };
    }
    return {
      ok: true,
      items: result.data.items.map((item) => ({
        id: item.id,
        shortCode: item.shortCode,
        displayName: item.displayName,
        active: item.isActive,
      })),
    };
  }, []);

  const searchFarmers = useCallback(async (q: string): Promise<ReferenceSearchResult> => {
    if (!window.polivoFarmers) {
      return { ok: false, code: "UNAVAILABLE", message: "Farmer search is unavailable." };
    }
    const result = await window.polivoFarmers.list({
      q: q || undefined,
      active: "active",
      limit: 20,
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    if (result.stale) {
      return { ok: true, items: [], stale: true };
    }
    return {
      ok: true,
      items: result.data.items.map((item) => ({
        id: item.id,
        shortCode: item.shortCode,
        displayName: item.displayName,
        active: item.isActive,
      })),
    };
  }, []);

  const searchVegetables = useCallback(async (q: string): Promise<ReferenceSearchResult> => {
    if (!window.polivoVegetables) {
      return { ok: false, code: "UNAVAILABLE", message: "Vegetable search is unavailable." };
    }
    const result = await window.polivoVegetables.list({
      q: q || undefined,
      active: "active",
      limit: 20,
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    if (result.stale) {
      return { ok: true, items: [], stale: true };
    }
    return {
      ok: true,
      items: result.data.items.map((item) => ({
        id: item.id,
        shortCode: item.shortCode,
        displayName: item.displayName,
        active: item.isActive,
      })),
    };
  }, []);

  const searchPackages = useCallback(async (q: string): Promise<ReferenceSearchResult> => {
    if (!window.polivoPackageTypes) {
      return { ok: false, code: "UNAVAILABLE", message: "Package search is unavailable." };
    }
    const result = await window.polivoPackageTypes.list({
      q: q || undefined,
      active: "active",
      limit: 20,
    });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    if (result.stale) {
      return { ok: true, items: [], stale: true };
    }
    return {
      ok: true,
      items: result.data.items.map((item) => ({
        id: item.id,
        shortCode: item.shortCode,
        displayName: item.displayName,
        active: item.isActive,
      })),
    };
  }, []);

  const loadDraftList = useCallback(async () => {
    if (!window.polivoSalesBilling || !hostAvailable || !canRead) {
      return;
    }
    const gen = requestGen.current;
    const result = await window.polivoSalesBilling.listDrafts({ limit: 20 });
    if (gen !== requestGen.current || !result.ok || result.stale) {
      return;
    }
    const data = result.data as ListSaleDraftsResponse;
    setDrafts(data.items);
    setDraftCursor(data.nextCursor);
  }, [canRead, hostAvailable]);

  const applyDraftRecord = useCallback(async (draft: SaleDraftRecordDto) => {
    let trader: ReferenceOption | null = null;
    if (window.polivoBuyers) {
      const buyer = await window.polivoBuyers.get(draft.traderId);
      if (buyer.ok) {
        trader = {
          id: buyer.data.id,
          shortCode: buyer.data.shortCode,
          displayName: buyer.data.displayName,
          active: buyer.data.isActive,
        };
      } else {
        trader = {
          id: draft.traderId,
          shortCode: "?",
          displayName: "Buyer on draft",
          active: true,
        };
      }
    }
    const farmers = new Map<string, ReferenceOption>();
    const vegetables = new Map<string, ReferenceOption>();
    const packageTypes = new Map<string, ReferenceOption>();
    for (const line of draft.lines) {
      if (window.polivoFarmers && !farmers.has(line.farmerId)) {
        const farmer = await window.polivoFarmers.get(line.farmerId);
        if (farmer.ok) {
          farmers.set(line.farmerId, {
            id: farmer.data.id,
            shortCode: farmer.data.shortCode,
            displayName: farmer.data.displayName,
            active: farmer.data.isActive,
          });
        }
      }
      if (window.polivoVegetables && !vegetables.has(line.vegetableId)) {
        const vegetable = await window.polivoVegetables.get(line.vegetableId);
        if (vegetable.ok) {
          vegetables.set(line.vegetableId, {
            id: vegetable.data.id,
            shortCode: vegetable.data.shortCode,
            displayName: vegetable.data.displayName,
            active: vegetable.data.isActive,
          });
        }
      }
      if (window.polivoPackageTypes && !packageTypes.has(line.packageTypeId)) {
        const listed = await window.polivoPackageTypes.list({ active: "all", limit: 100 });
        if (listed.ok && !listed.stale) {
          for (const pkg of listed.data.items) {
            packageTypes.set(pkg.id, {
              id: pkg.id,
              shortCode: pkg.shortCode,
              displayName: pkg.displayName,
              active: pkg.isActive,
            });
          }
        }
      }
    }
    setEditor(editorFromDraft(draft, { trader, farmers, vegetables, packageTypes }));
    setDirty(false);
    setPreview(null);
    setFinalized(null);
    setConflictMessage(null);
    setWorkflow("saved");
  }, []);

  const resumeDraft = useCallback(
    async (saleId: string) => {
      if (!window.polivoSalesBilling) {
        return;
      }
      if (dirty && !window.confirm("Discard unsaved changes and load this draft?")) {
        return;
      }
      const gen = bumpGeneration();
      setWorkflow("loading_draft");
      setError(null);
      const result = await window.polivoSalesBilling.getDraft(saleId);
      if (gen !== requestGen.current) {
        return;
      }
      if (!result.ok) {
        if (result.code === "UNAUTHENTICATED") {
          setWorkflow("session_expired");
        } else {
          setError(result.message);
          setWorkflow(hostAvailable ? "no_active_draft" : "service_unavailable");
        }
        return;
      }
      const draft = result.data as SaleDraftRecordDto;
      await applyDraftRecord(draft);
    },
    [applyDraftRecord, bumpGeneration, dirty, hostAvailable],
  );

  const startNewBill = useCallback(() => {
    if (!canCreate) {
      setWorkflow("permission_denied");
      return;
    }
    if (dirty && !window.confirm("Discard unsaved changes and start a new bill?")) {
      return;
    }
    bumpGeneration();
    setError(null);
    setInfo("Select a buyer to create the draft at the stall.");
    setFinalized(null);
    setPreview(null);
    setConflictMessage(null);
    finalizeKeyRef.current = null;
    finalizeInFlightRef.current = false;
    setHasFinalizeKey(false);
    setEditor(createEmptyEditor(todayCalendarDateUtc()));
    setDirty(false);
    setWorkflow(hostAvailable ? "editing" : "service_unavailable");
    queueMicrotask(() => buyerInputRef.current?.focus());
  }, [bumpGeneration, canCreate, dirty, hostAvailable]);

  const ensureDraftCreated = useCallback(
    async (trader: ReferenceOption, businessDate: string): Promise<SaleDraftRecordDto | null> => {
      if (!window.polivoSalesBilling || !canCreate) {
        return null;
      }
      if (!hostAvailable) {
        setWorkflow("service_unavailable");
        setError("Stall service unreachable. Cannot create a draft until the host is available.");
        return null;
      }
      const gen = requestGen.current;
      setWorkflow("saving");
      const result = await window.polivoSalesBilling.createDraft(
        { traderId: trader.id, businessDate, lines: [] },
        newClientId("create"),
      );
      if (gen !== requestGen.current) {
        return null;
      }
      if (!result.ok) {
        setError(result.message);
        setWorkflow(result.code === "UNAUTHENTICATED" ? "session_expired" : "editing");
        return null;
      }
      return result.data as SaleDraftRecordDto;
    },
    [canCreate, hostAvailable],
  );

  const saveDraft = useCallback(async (): Promise<SaleDraftRecordDto | null> => {
    if (!window.polivoSalesBilling) {
      return null;
    }
    if (!hostAvailable) {
      setWorkflow("service_unavailable");
      setError("Stall service unreachable. Unsaved edits are only in memory.");
      return null;
    }
    if (!editor.trader) {
      setError("Select a buyer before saving.");
      setWorkflow("unsaved_changes");
      return null;
    }

    let saleId = editor.saleId;
    let revision = editor.revision;
    if (!saleId || revision === null) {
      if (!canCreate) {
        setWorkflow("permission_denied");
        return null;
      }
      const created = await ensureDraftCreated(editor.trader, editor.businessDate);
      if (!created) {
        return null;
      }
      saleId = created.id;
      revision = created.revision;
      setEditor((current) => ({
        ...current,
        saleId: created.id,
        revision: created.revision,
        trader: editor.trader,
        businessDate: created.businessDate,
      }));
    }

    if (!canEditDraft) {
      setWorkflow("permission_denied");
      return null;
    }

    const built = buildUpdateRequest({
      ...editor,
      saleId,
      revision,
    });
    if (!built.ok) {
      setError(built.message);
      setWorkflow("unsaved_changes");
      return null;
    }
    const gen = requestGen.current;
    setWorkflow("saving");
    setError(null);
    const result = await window.polivoSalesBilling.updateDraft(
      saleId,
      built.request,
      newClientId("update"),
    );
    if (gen !== requestGen.current) {
      return null;
    }
    if (!result.ok) {
      if (result.conflict) {
        setConflictMessage(
          result.message ||
            "A newer saved version exists on another terminal. Reload the authoritative draft or keep your unsaved edits in memory.",
        );
        setWorkflow("revision_conflict");
        return null;
      }
      if (result.code === "UNAUTHENTICATED") {
        setWorkflow("session_expired");
      } else {
        setError(result.message);
        setWorkflow("unsaved_changes");
      }
      return null;
    }
    const draft = result.data as SaleDraftRecordDto;
    await applyDraftRecord(draft);
    setInfo("Saved to stall. Account balances are unchanged until finalize.");
    await loadDraftList();
    return draft;
  }, [
    applyDraftRecord,
    canCreate,
    canEditDraft,
    editor,
    ensureDraftCreated,
    hostAvailable,
    loadDraftList,
  ]);

  const reviewBill = useCallback(async () => {
    if (!canEditDraft || !window.polivoSalesBilling || !editor.saleId) {
      return;
    }
    if (!hostAvailable) {
      setWorkflow("service_unavailable");
      return;
    }
    if (dirty) {
      const saved = await saveDraft();
      if (!saved) {
        return;
      }
    }
    const gen = requestGen.current;
    setWorkflow("previewing");
    setError(null);
    const result = await window.polivoSalesBilling.previewDraft(editor.saleId);
    if (gen !== requestGen.current) {
      return;
    }
    if (!result.ok) {
      if (result.conflict) {
        setConflictMessage(result.message);
        setWorkflow("revision_conflict");
        return;
      }
      setError(result.message);
      setWorkflow("saved");
      return;
    }
    const data = result.data as SalePreviewResponse;
    setPreview(data);
    setWorkflow(data.readyToFinalize ? "ready_for_review" : "review_stale");
    if (!data.readyToFinalize) {
      setError(data.issues.map((issue) => issue.message).join(" ") || "Not ready to finalize.");
    }
  }, [canEditDraft, dirty, editor.saleId, hostAvailable, saveDraft]);

  const resolveFinalization = useCallback(
    async (idempotencyKey: string, saleId: string) => {
      if (!window.polivoSalesBilling) {
        return;
      }
      const lookup = await window.polivoSalesBilling.lookupFinalization(idempotencyKey);
      if (lookup.ok) {
        const data = lookup.data as FinalizeSaleResponse;
        setFinalized(data.bill);
        setPreview(null);
        setDirty(false);
        setWorkflow("finalized");
        await window.polivoSalesBilling.clearFinalizeRecovery();
        finalizeInFlightRef.current = false;
        finalizeKeyRef.current = null;
        setHasFinalizeKey(false);
        setInfo(`Issued buyer bill ${data.billNumber}.`);
        await loadDraftList();
        return;
      }
      const draftStatus = await window.polivoSalesBilling.getDraft(saleId);
      if (draftStatus.ok) {
        setWorkflow("finalization_outcome_unknown");
        setError(
          "Still checking whether the bill was finalized. A temporary miss is not a confirmed failure.",
        );
        return;
      }
      if (draftStatus.code === "NOT_FOUND" || /finaliz/i.test(draftStatus.message)) {
        const billLookup = await window.polivoSalesBilling.listTraderBills({ limit: 5 });
        if (billLookup.ok && !billLookup.stale) {
          const data = billLookup.data as { items: Array<{ saleId: string; id: string }> };
          const match = data.items.find((item) => item.saleId === saleId);
          if (match) {
            const bill = await window.polivoSalesBilling.getTraderBill(match.id);
            if (bill.ok) {
              setFinalized(bill.data as TraderBillRecordDto);
              setWorkflow("finalized");
              await window.polivoSalesBilling.clearFinalizeRecovery();
              finalizeInFlightRef.current = false;
              finalizeKeyRef.current = null;
              setHasFinalizeKey(false);
              return;
            }
          }
        }
      }
      setWorkflow("finalization_outcome_unknown");
    },
    [loadDraftList],
  );

  const finalizeBill = useCallback(async () => {
    if (!canFinalize || !window.polivoSalesBilling || !editor.saleId || !preview) {
      return;
    }
    if (!preview.readyToFinalize || !preview.calculationFingerprint) {
      setError("Review is not ready. Refresh the calculation before finalizing.");
      return;
    }
    if (workflow === "review_stale" || dirty) {
      setError("Review is stale. Save and review again before finalizing.");
      return;
    }
    if (finalizeInFlightRef.current && finalizeKeyRef.current) {
      await resolveFinalization(finalizeKeyRef.current, editor.saleId);
      return;
    }
    const key = finalizeKeyRef.current ?? newClientId("finalize");
    finalizeKeyRef.current = key;
    setHasFinalizeKey(true);
    finalizeInFlightRef.current = true;
    const payload = {
      expectedRevision: preview.draftRevision,
      expectedCalculationFingerprint: preview.calculationFingerprint,
    };
    await window.polivoSalesBilling.setFinalizeRecovery({
      saleId: editor.saleId,
      idempotencyKey: key,
      expectedRevision: payload.expectedRevision,
      expectedCalculationFingerprint: payload.expectedCalculationFingerprint,
      startedAt: new Date().toISOString(),
    });
    setWorkflow("finalizing");
    setError(null);
    const clearFinalizeInFlight = async () => {
      await window.polivoSalesBilling?.clearFinalizeRecovery();
      finalizeInFlightRef.current = false;
      finalizeKeyRef.current = null;
      setHasFinalizeKey(false);
    };

    try {
      const result = await window.polivoSalesBilling.finalizeDraft(editor.saleId, payload, key);
      if (!result.ok) {
        const kind = classifyFinalizeFailure({
          conflict: result.conflict,
          code: result.code,
          message: result.message,
        });
        if (shouldResolveFinalizeOutcome(kind)) {
          setWorkflow("finalization_outcome_unknown");
          setError("Checking whether the bill was finalized…");
          await resolveFinalization(key, editor.saleId);
          return;
        }
        // Definite completed rejection (e.g. farmer account not opened): txn did not commit.
        await clearFinalizeInFlight();
        if (kind === "definite_conflict" && /revision|modified by another/i.test(result.message)) {
          setConflictMessage(result.message);
          setWorkflow("revision_conflict");
          return;
        }
        setError(result.message);
        setWorkflow("ready_for_review");
        return;
      }
      const data = result.data as FinalizeSaleResponse;
      setFinalized(data.bill);
      setPreview(null);
      setDirty(false);
      setWorkflow("finalized");
      await clearFinalizeInFlight();
      setInfo(`Issued buyer bill ${data.billNumber}.`);
      await loadDraftList();
    } catch {
      setWorkflow("finalization_outcome_unknown");
      setError("Checking whether the bill was finalized…");
      await resolveFinalization(key, editor.saleId);
    }
  }, [canFinalize, dirty, editor.saleId, loadDraftList, preview, resolveFinalization, workflow]);

  const reloadAuthoritative = useCallback(async () => {
    if (!editor.saleId) {
      return;
    }
    await resumeDraft(editor.saleId);
  }, [editor.saleId, resumeDraft]);

  const updateActiveLine = useCallback(
    (patch: Partial<EditorLine>) => {
      if (!billingAllows(workflow, "edit_fields") && workflow !== "revision_conflict") {
        return;
      }
      setEditor((current) => ({
        ...current,
        lines: current.lines.map((line) =>
          line.clientKey === current.activeLineKey ? { ...line, ...patch } : line,
        ),
      }));
      markDirty();
    },
    [markDirty, workflow],
  );

  const addLine = useCallback(() => {
    if (!billingAllows(workflow, "edit_fields")) {
      return;
    }
    setEditor((current) => {
      if (current.lines.length >= SALE_DRAFT_MAX_LINES) {
        return current;
      }
      const line = createEmptyLine();
      return {
        ...current,
        lines: [...current.lines, line],
        activeLineKey: line.clientKey,
      };
    });
    markDirty();
  }, [markDirty, workflow]);

  const removeLine = useCallback(
    (clientKey: string) => {
      if (!billingAllows(workflow, "edit_fields")) {
        return;
      }
      setEditor((current) => {
        setUndo({ lines: current.lines, activeLineKey: current.activeLineKey });
        const nextLines =
          current.lines.length <= 1
            ? [createEmptyLine()]
            : current.lines.filter((line) => line.clientKey !== clientKey);
        return {
          ...current,
          lines: nextLines,
          activeLineKey: nextLines[0]?.clientKey ?? null,
        };
      });
      markDirty();
    },
    [markDirty, workflow],
  );

  const restoreUndo = useCallback(() => {
    if (!undo) {
      return;
    }
    setEditor((current) => ({
      ...current,
      lines: undo.lines,
      activeLineKey: undo.activeLineKey,
    }));
    setUndo(null);
    markDirty();
  }, [markDirty, undo]);

  // Load drafts and optional finalize recovery after sign-in (panel remounts on staffKey).
  useEffect(() => {
    if (!signedIn || !canRead || !hostAvailable) {
      return;
    }
    bumpGeneration();
    let cancelled = false;
    void (async () => {
      await loadDraftList();
      if (cancelled || !window.polivoSalesBilling) {
        return;
      }
      const recovery = await window.polivoSalesBilling.getFinalizeRecovery();
      if (cancelled || !recovery.ok || !recovery.data) {
        return;
      }
      setWorkflow("finalization_outcome_unknown");
      finalizeKeyRef.current = recovery.data.idempotencyKey;
      finalizeInFlightRef.current = true;
      setHasFinalizeKey(true);
      setEditor((current) => ({
        ...current,
        saleId: recovery.data!.saleId,
        revision: recovery.data!.expectedRevision,
      }));
      await resolveFinalization(recovery.data.idempotencyKey, recovery.data.saleId);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    staffKey,
    signedIn,
    canRead,
    hostAvailable,
    bumpGeneration,
    loadDraftList,
    resolveFinalization,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const match = matchBillingShortcut(event);
      if (!match) {
        return;
      }
      if (match.action === "close_panel") {
        if (showHelp) {
          event.preventDefault();
          setShowHelp(false);
          return;
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (
        typing &&
        match.action !== "save" &&
        match.action !== "finalize" &&
        match.action !== "toggle_help"
      ) {
        if (
          match.action === "new_bill" ||
          match.action === "review" ||
          match.action === "open_draft_list"
        ) {
          // allow with ctrl
        } else if (match.action === "focus_buyer" || match.action === "add_line") {
          // allow
        } else {
          return;
        }
      }
      event.preventDefault();
      switch (match.action) {
        case "new_bill":
          if (billingAllows(workflow, "new_bill")) {
            void startNewBill();
          }
          break;
        case "focus_buyer":
          buyerInputRef.current?.focus();
          break;
        case "add_line":
          addLine();
          break;
        case "save":
          if (billingAllows(workflow, "save")) {
            void saveDraft();
          }
          break;
        case "review":
          if (billingAllows(workflow, "preview")) {
            void reviewBill();
          }
          break;
        case "finalize":
          if (billingAllows(workflow, "finalize")) {
            void finalizeBill();
          }
          break;
        case "open_draft_list":
          setShowDraftList(true);
          queueMicrotask(() => draftListRef.current?.focus());
          break;
        case "toggle_help":
          setShowHelp((value) => !value);
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addLine, finalizeBill, reviewBill, saveDraft, startNewBill, workflow, showHelp]);

  const activeLine = editor.lines.find((line) => line.clientKey === editor.activeLineKey) ?? null;
  const effectiveWorkflow: BillingWorkflowState = !signedIn
    ? "session_expired"
    : !canRead
      ? "permission_denied"
      : !hostAvailable && workflow !== "finalized" && workflow !== "finalization_outcome_unknown"
        ? "service_unavailable"
        : workflow;
  const mutationLocked =
    effectiveWorkflow === "finalizing" ||
    effectiveWorkflow === "finalization_outcome_unknown" ||
    effectiveWorkflow === "finalized" ||
    effectiveWorkflow === "loading_draft" ||
    effectiveWorkflow === "saving" ||
    effectiveWorkflow === "previewing";
  const fieldsDisabled =
    mutationLocked || !canEditDraft || effectiveWorkflow === "permission_denied";

  if (!signedIn) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Buyer billing"
          description="Keyboard-first draft entry. The stall service owns calculations, numbering, and ledger posting."
        />
        <EmptyState
          title="Sign in to bill"
          description="Verify the stall host and sign in. Billing uses the local stall service over LAN."
        />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Buyer billing"
          description="Keyboard-first draft entry. The stall service owns calculations, numbering, and ledger posting."
        />
        <EmptyState
          title="Billing permission required"
          description="This session needs bills.create, bills.edit_draft, or bills.finalize. Sign out and sign in again after a permission refresh if you recently gained access."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Buyer billing"
        description="Keyboard-first draft entry. The stall service owns calculations, numbering, and ledger posting."
      />

      {!hostAvailable ? (
        <Alert variant="destructive">
          <AlertTitle>Stall service unreachable</AlertTitle>
          <AlertDescription>
            Save, preview, and finalize are disabled. Internet loss alone does not block LAN billing
            — this means the local host is not reachable. In-memory edits are kept while the session
            remains valid.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Billing issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert>
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}
      {conflictMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Revision conflict</AlertTitle>
          <AlertDescription>
            {conflictMessage}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void reloadAuthoritative()}>
                Reload authoritative draft
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConflictMessage(null)}
              >
                Keep my unsaved edits
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md border border-border px-2 py-1">
          Save: <strong>{describeSaveStatus(effectiveWorkflow)}</strong>
        </span>
        {editor.saleId ? (
          <span className="rounded-md border border-border px-2 py-1">
            Draft {editor.saleId.slice(0, 8)}… · rev {editor.revision ?? "—"}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!billingAllows(effectiveWorkflow, "new_bill") || !canCreate}
          onClick={() => void startNewBill()}
        >
          New bill
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!billingAllows(effectiveWorkflow, "save") || !canEditDraft || !hostAvailable}
          onClick={() => void saveDraft()}
        >
          Save draft
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!billingAllows(effectiveWorkflow, "preview") || !canEditDraft || !hostAvailable}
          onClick={() => void reviewBill()}
        >
          Review
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!billingAllows(effectiveWorkflow, "finalize") || !canFinalize || !hostAvailable}
          onClick={() => void finalizeBill()}
        >
          Finalize
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowHelp((v) => !v)}>
          Shortcuts
        </Button>
        {undo ? (
          <Button type="button" size="sm" variant="secondary" onClick={restoreUndo}>
            Undo remove line
          </Button>
        ) : null}
        {effectiveWorkflow === "finalization_outcome_unknown" && editor.saleId && hasFinalizeKey ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const key = finalizeKeyRef.current;
              if (key && editor.saleId) {
                void resolveFinalization(key, editor.saleId);
              }
            }}
          >
            Check finalization
          </Button>
        ) : null}
      </div>

      {showHelp ? (
        <section className="rounded-md border border-border p-3" aria-label="Keyboard shortcuts">
          <h2 className="mb-2 text-sm font-semibold">Keyboard shortcuts</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {BILLING_SHORTCUTS.map((shortcut) => (
              <li key={shortcut.id}>
                <kbd className="rounded border border-border px-1">{shortcut.chord}</kbd>{" "}
                {shortcut.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finalized ? (
        <FinalizedBillView
          bill={finalized}
          onNewBill={() => {
            void startNewBill();
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          {showDraftList ? (
            <aside
              ref={draftListRef}
              tabIndex={-1}
              className="space-y-2 rounded-md border border-border p-3"
              aria-label="Draft list"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Drafts</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void loadDraftList()}
                >
                  Refresh
                </Button>
              </div>
              {drafts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open drafts.</p>
              ) : (
                <ul className="space-y-1">
                  {drafts.map((draft) => (
                    <li key={draft.id}>
                      <button
                        type="button"
                        className={`w-full rounded-md px-2 py-1 text-left text-xs hover:bg-bg-secondary ${
                          editor.saleId === draft.id ? "bg-bg-secondary font-medium" : ""
                        }`}
                        onClick={() => void resumeDraft(draft.id)}
                      >
                        {draft.traderDisplayName}
                        <span className="block text-muted-foreground">
                          {draft.businessDate} · {draft.lineCount} lines
                          {dirty && editor.saleId === draft.id ? " · unsaved" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {draftCursor ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!window.polivoSalesBilling) {
                      return;
                    }
                    const result = await window.polivoSalesBilling.listDrafts({
                      limit: 20,
                      cursor: draftCursor,
                    });
                    if (!result.ok || result.stale) {
                      return;
                    }
                    const data = result.data as ListSaleDraftsResponse;
                    setDrafts((current) => [...current, ...data.items]);
                    setDraftCursor(data.nextCursor);
                  }}
                >
                  More
                </Button>
              ) : null}
            </aside>
          ) : null}

          <div className="space-y-4">
            <section className="space-y-3 rounded-md border border-border p-3">
              <h2 className="text-sm font-semibold">Bill header</h2>
              <ReferenceCombobox
                id={`${baseId}-buyer`}
                label="Buyer"
                value={editor.trader}
                inputRef={buyerInputRef}
                disabled={fieldsDisabled}
                onChange={(trader) => {
                  setEditor((current) => ({ ...current, trader }));
                  markDirty();
                }}
                search={searchBuyers}
              />
              <div className="space-y-1">
                <Label htmlFor={`${baseId}-date`}>Business date</Label>
                <Input
                  id={`${baseId}-date`}
                  type="date"
                  value={editor.businessDate}
                  disabled={fieldsDisabled}
                  onChange={(event) => {
                    setEditor((current) => ({ ...current, businessDate: event.target.value }));
                    markDirty();
                  }}
                />
              </div>
            </section>

            {workflow === "no_active_draft" && !editor.saleId && !editor.trader ? (
              <EmptyState
                title="No active draft"
                description="Press New bill (Ctrl+N) or resume a draft from the list. Select a buyer, then save to persist the draft at the stall."
              />
            ) : (
              <>
                <section className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">Sale line workspace</h2>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={fieldsDisabled || editor.lines.length >= SALE_DRAFT_MAX_LINES}
                      onClick={addLine}
                    >
                      Add line
                    </Button>
                  </div>
                  {activeLine ? (
                    <div className="space-y-3">
                      <ReferenceCombobox
                        label="Farmer"
                        value={activeLine.farmer}
                        disabled={fieldsDisabled}
                        onChange={(farmer) => updateActiveLine({ farmer })}
                        search={searchFarmers}
                      />
                      <ReferenceCombobox
                        label="Vegetable"
                        value={activeLine.vegetable}
                        disabled={fieldsDisabled}
                        onChange={(vegetable) => updateActiveLine({ vegetable })}
                        search={searchVegetables}
                      />
                      <ReferenceCombobox
                        label="Package type"
                        value={activeLine.packageType}
                        disabled={fieldsDisabled}
                        onChange={(packageType) => updateActiveLine({ packageType })}
                        search={searchPackages}
                      />
                      <WeightEntry
                        hidePackageTypeSelect
                        selectedPackageTypeId={activeLine.packageType?.id ?? ""}
                        rows={activeLine.weightRows}
                        disabled={fieldsDisabled}
                        showValidateButton={false}
                        onRowsChange={(weightRows) => updateActiveLine({ weightRows })}
                      />
                      <div className="space-y-1">
                        <Label htmlFor={`${baseId}-price`}>Price per kg (Rs.)</Label>
                        <Input
                          id={`${baseId}-price`}
                          inputMode="decimal"
                          value={activeLine.unitPriceText}
                          disabled={fieldsDisabled}
                          onChange={(event) =>
                            updateActiveLine({ unitPriceText: event.target.value })
                          }
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Line weight estimate: {lineGrossPreviewKg(activeLine)} kg (service confirms
                        on save/review)
                      </p>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-md border border-border p-3">
                  <h2 className="mb-2 text-sm font-semibold">Lines</h2>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Farmer</TableHead>
                        <TableHead>Vegetable</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editor.lines.map((line) => (
                        <TableRow
                          key={line.clientKey}
                          data-active={line.clientKey === editor.activeLineKey}
                          className={
                            line.clientKey === editor.activeLineKey
                              ? "bg-bg-secondary/60"
                              : undefined
                          }
                        >
                          <TableCell>{line.farmer?.shortCode ?? "—"}</TableCell>
                          <TableCell>{line.vegetable?.shortCode ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {lineGrossPreviewKg(line)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {line.unitPriceText || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={fieldsDisabled}
                                onClick={() =>
                                  setEditor((current) => ({
                                    ...current,
                                    activeLineKey: line.clientKey,
                                  }))
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={fieldsDisabled}
                                aria-label="Remove line"
                                onClick={() => removeLine(line.clientKey)}
                              >
                                Remove
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>

                <section className="space-y-2 rounded-md border border-border p-3">
                  <h2 className="text-sm font-semibold">Bill summary</h2>
                  {preview ? (
                    <div className="space-y-2 text-sm">
                      <p>
                        Buyer total:{" "}
                        <strong className="tabular-nums">
                          {preview.totalTraderPaysMinor !== null
                            ? `Rs. ${formatMoneyMinor(preview.totalTraderPaysMinor)}`
                            : "—"}
                        </strong>
                      </p>
                      <p>
                        Commission:{" "}
                        <strong className="tabular-nums">
                          {preview.totalCommissionMinor !== null
                            ? `Rs. ${formatMoneyMinor(preview.totalCommissionMinor)}`
                            : "—"}
                        </strong>
                      </p>
                      <p>
                        Farmer total (before deductions):{" "}
                        <strong className="tabular-nums">
                          {preview.totalFarmerReceivesBeforeDeductionsMinor !== null
                            ? `Rs. ${formatMoneyMinor(preview.totalFarmerReceivesBeforeDeductionsMinor)}`
                            : "—"}
                        </strong>
                      </p>
                      {preview.issues.length > 0 ? (
                        <ul className="list-disc pl-5 text-destructive">
                          {preview.issues.map((issue) => (
                            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Authoritative service calculation
                        {preview.calculationFingerprint
                          ? ` · fingerprint ${preview.calculationFingerprint.slice(0, 12)}…`
                          : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Local weight/price figures are estimates until you save and review.
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FinalizedBillView({
  bill,
  onNewBill,
}: {
  bill: TraderBillRecordDto;
  onNewBill: () => void;
}) {
  return (
    <section
      className="space-y-3 rounded-md border border-border p-4"
      aria-label="Finalized buyer bill"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Buyer / trader bill {bill.billNumber}</h2>
          <p className="text-sm text-muted-foreground">
            {bill.traderShortCode} — {bill.traderDisplayName} · {bill.businessDate} · status{" "}
            {bill.status}
          </p>
          <p className="text-xs text-muted-foreground">
            Payment status shown is the bill record field ({bill.paymentStatus}) — not inferred from
            balances. Printing uses this committed bill id and does not re-finalize the sale.
          </p>
        </div>
        <Button type="button" onClick={onNewBill}>
          New bill
        </Button>
      </div>
      <PrintActions documentKind="buyer_bill" documentId={bill.id} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Farmer</TableHead>
            <TableHead>Vegetable</TableHead>
            <TableHead className="text-right">Net wt</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bill.lines.map((line) => (
            <TableRow key={line.lineId}>
              <TableCell>
                {line.farmerShortCode} — {line.farmerDisplayName}
              </TableCell>
              <TableCell>
                {line.vegetableCode} — {line.vegetableDisplayName}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatWeightHundredths(line.netWeightHundredths)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoneyMinor(line.unitPricePerKgMinor)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoneyMinor(line.traderPaysMinor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="space-y-1 text-sm">
        <p>
          Buyer total: <strong>Rs. {formatMoneyMinor(bill.totalAmountMinor)}</strong>
        </p>
        <p>
          Commission: <strong>Rs. {formatMoneyMinor(bill.totalCommissionMinor)}</strong>
        </p>
        <p>
          Farmer total:{" "}
          <strong>Rs. {formatMoneyMinor(bill.totalFarmerReceivesBeforeDeductionsMinor)}</strong>
        </p>
      </div>
    </section>
  );
}
