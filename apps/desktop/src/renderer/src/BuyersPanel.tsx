import { useEffect, useId, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
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

import type { BuyerRecord } from "../../preload/index";
import { AccountSection } from "./AccountSection";

type ActiveFilter = "active" | "inactive" | "all";

type BuyersPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canManage: boolean;
  canViewAccounts: boolean;
  canPrepareOpening: boolean;
  canPostOpening: boolean;
  staffKey: string | null;
};

type EditorMode = "closed" | "create" | "edit";

type FormState = {
  shortCode: string;
  displayName: string;
  contactNumber: string;
  locality: string;
};

const EMPTY_FORM: FormState = {
  shortCode: "",
  displayName: "",
  contactNumber: "",
  locality: "",
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `buyer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function BuyersPanel({
  hostAvailable,
  signedIn,
  canManage,
  canViewAccounts,
  canPrepareOpening,
  canPostOpening,
  staffKey,
}: BuyersPanelProps) {
  const searchId = useId();
  const shortCodeRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);
  const createKeyRef = useRef(newIdempotencyKey());
  const saveKeyRef = useRef(newIdempotencyKey());

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [items, setItems] = useState<BuyerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("closed");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<BuyerRecord | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setQuery("");
    setDebouncedQuery("");
    setItems([]);
    setSelectedId(null);
    setEditorMode("closed");
    setForm(EMPTY_FORM);
    setEditing(null);
    setError(null);
    setInfo(null);
    setRevisionConflict(false);
    createKeyRef.current = newIdempotencyKey();
    saveKeyRef.current = newIdempotencyKey();
  }, [staffKey]);

  useEffect(() => {
    if (!signedIn || !hostAvailable || !canManage || !window.polivoBuyers) {
      setItems([]);
      return;
    }
    const requestId = ++searchRequestRef.current;
    setLoading(true);
    setError(null);
    void window.polivoBuyers
      .list({ q: debouncedQuery || undefined, active: activeFilter, limit: 50 })
      .then((result) => {
        if (requestId !== searchRequestRef.current) {
          return;
        }
        if (!result.ok) {
          setError(result.message);
          setItems([]);
          return;
        }
        if (result.stale) {
          return;
        }
        setItems(result.data.items);
      })
      .catch((err) => {
        if (requestId !== searchRequestRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to search buyers.");
        setItems([]);
      })
      .finally(() => {
        if (requestId === searchRequestRef.current) {
          setLoading(false);
        }
      });
  }, [signedIn, hostAvailable, canManage, debouncedQuery, activeFilter, staffKey]);

  function openCreate() {
    setEditorMode("create");
    setEditing(null);
    setForm(EMPTY_FORM);
    setRevisionConflict(false);
    setError(null);
    setInfo(null);
    createKeyRef.current = newIdempotencyKey();
    queueMicrotask(() => shortCodeRef.current?.focus());
  }

  function openEdit(buyer: BuyerRecord) {
    setEditorMode("edit");
    setEditing(buyer);
    setSelectedId(buyer.id);
    setForm({
      shortCode: buyer.shortCode,
      displayName: buyer.displayName,
      contactNumber: buyer.contactNumber ?? "",
      locality: buyer.locality ?? "",
    });
    setRevisionConflict(false);
    setError(null);
    setInfo(null);
    saveKeyRef.current = newIdempotencyKey();
    queueMicrotask(() => displayNameRef.current?.focus());
  }

  function closeEditor() {
    setEditorMode("closed");
    setEditing(null);
    setForm(EMPTY_FORM);
    setRevisionConflict(false);
  }

  async function refreshList(focusId?: string) {
    if (!window.polivoBuyers) {
      return;
    }
    const result = await window.polivoBuyers.list({
      q: debouncedQuery || undefined,
      active: activeFilter,
      limit: 50,
    });
    if (!result.ok || result.stale) {
      return;
    }
    setItems(result.data.items);
    if (focusId) {
      setSelectedId(focusId);
    }
  }

  async function submitCreate() {
    if (!window.polivoBuyers || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await window.polivoBuyers.create(
        {
          shortCode: form.shortCode.trim(),
          displayName: form.displayName.trim(),
          contactNumber: form.contactNumber.trim() ? form.contactNumber.trim() : null,
          locality: form.locality.trim() ? form.locality.trim() : null,
        },
        createKeyRef.current,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setInfo("Saved locally");
      closeEditor();
      await refreshList(result.data.id);
      createKeyRef.current = newIdempotencyKey();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register buyer.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!window.polivoBuyers || !editing || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await window.polivoBuyers.update(
        editing.id,
        {
          expectedRevision: editing.revision,
          displayName: form.displayName.trim(),
          contactNumber: form.contactNumber.trim() ? form.contactNumber.trim() : null,
          locality: form.locality.trim() ? form.locality.trim() : null,
        },
        saveKeyRef.current,
      );
      if (!result.ok) {
        if (result.conflict) {
          setRevisionConflict(true);
          setError(
            "Another terminal updated this buyer. Your unsaved changes are still here. Reload the record, then reconcile deliberately.",
          );
        } else {
          setError(result.message);
        }
        return;
      }
      setInfo("Saved locally");
      setEditing(result.data);
      setRevisionConflict(false);
      saveKeyRef.current = newIdempotencyKey();
      await refreshList(result.data.id);
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update buyer.");
    } finally {
      setBusy(false);
    }
  }

  async function reloadForConflict() {
    if (!window.polivoBuyers || !editing) {
      return;
    }
    const result = await window.polivoBuyers.get(editing.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(result.data);
    setRevisionConflict(false);
    setInfo("Loaded the newer record. Re-apply your changes if still needed.");
    saveKeyRef.current = newIdempotencyKey();
  }

  async function toggleStatus(buyer: BuyerRecord) {
    if (!window.polivoBuyers || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.polivoBuyers.changeStatus(
        buyer.id,
        {
          expectedRevision: buyer.revision,
          status: buyer.isActive ? "inactive" : "active",
        },
        newIdempotencyKey(),
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setInfo("Saved locally");
      await refreshList(result.data.id);
      if (editing?.id === result.data.id) {
        setEditing(result.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change buyer status.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <EmptyState
        title="Buyers"
        description="Sign in with party-management permission to register and find buyers."
      />
    );
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Buyers unavailable"
        description="This staff account does not include parties.register_edit."
      />
    );
  }

  const serviceBlocked = !hostAvailable;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Buyers</h2>
          <p className="text-sm text-muted-foreground">
            Search by short code or name. Buyer codes stay unique even when inactive. A farmer may
            use the same code.
          </p>
        </div>
        <Button type="button" disabled={serviceBlocked || busy} onClick={openCreate}>
          Add Buyer
        </Button>
      </div>

      {serviceBlocked ? (
        <Alert variant="destructive">
          <AlertTitle>Host unavailable</AlertTitle>
          <AlertDescription>
            Buyer actions are disabled until the stall host connection is restored.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert>
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1">
          <Label htmlFor={searchId}>Search</Label>
          <Input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Short code or name"
            autoComplete="off"
            disabled={serviceBlocked}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${searchId}-active`}>Status filter</Label>
          <select
            id={`${searchId}-active`}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={activeFilter}
            disabled={serviceBlocked}
            onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {loading ? <LoadingState label="Searching buyers…" /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No buyers found"
          description={
            debouncedQuery
              ? "Try a different short code or name, or include inactive records."
              : "Register the first buyer for this stall."
          }
        />
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((buyer) => (
                <TableRow
                  key={buyer.id}
                  data-state={selectedId === buyer.id ? "selected" : undefined}
                  className={selectedId === buyer.id ? "bg-muted/40" : undefined}
                >
                  <TableCell className="font-medium">{buyer.shortCode}</TableCell>
                  <TableCell>{buyer.displayName}</TableCell>
                  <TableCell>{buyer.contactNumber ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={buyer.isActive ? "default" : "secondary"}>
                      {buyer.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={serviceBlocked || busy}
                      onClick={() => setSelectedId(buyer.id)}
                    >
                      Select
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={serviceBlocked || busy}
                      onClick={() => openEdit(buyer)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={serviceBlocked || busy}
                      onClick={() => void toggleStatus(buyer)}
                    >
                      {buyer.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <AccountSection
        partyKind="trader"
        partyId={selectedId}
        partyLabel={
          items.find((item) => item.id === selectedId)?.displayName ?? "Selected buyer"
        }
        hostAvailable={hostAvailable}
        signedIn={signedIn}
        canView={canViewAccounts}
        canPrepare={canPrepareOpening}
        canPost={canPostOpening}
        staffKey={staffKey}
      />

      {editorMode !== "closed" ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <h3 className="text-base font-semibold">
            {editorMode === "create" ? "Add Buyer" : "Edit Buyer"}
          </h3>
          {revisionConflict ? (
            <Alert variant="destructive">
              <AlertTitle>Revision conflict</AlertTitle>
              <AlertDescription>
                Another terminal updated this record. Unsaved values are preserved.
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void reloadForConflict()}
                  >
                    Reload newer record
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="buyer-short-code">Short code</Label>
              <Input
                id="buyer-short-code"
                ref={shortCodeRef}
                value={form.shortCode}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, shortCode: event.target.value }))
                }
                disabled={editorMode === "edit" || busy || serviceBlocked}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyer-display-name">Display name</Label>
              <Input
                id="buyer-display-name"
                ref={displayNameRef}
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, displayName: event.target.value }))
                }
                disabled={busy || serviceBlocked}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyer-contact">Contact number</Label>
              <Input
                id="buyer-contact"
                value={form.contactNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contactNumber: event.target.value }))
                }
                disabled={busy || serviceBlocked}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="buyer-locality">Locality</Label>
              <Input
                id="buyer-locality"
                value={form.locality}
                onChange={(event) => setForm((prev) => ({ ...prev, locality: event.target.value }))}
                disabled={busy || serviceBlocked}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || serviceBlocked}
              onClick={() => void (editorMode === "create" ? submitCreate() : submitEdit())}
            >
              Save
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={closeEditor}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
