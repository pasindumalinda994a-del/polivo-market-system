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

import type { CatalogRecord } from "../../preload/index";
import { WeightEntry } from "./WeightEntry";

type ActiveFilter = "active" | "inactive" | "all";

type CatalogPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canManage: boolean;
  staffKey: string | null;
};

type EditorMode = "closed" | "create" | "edit";

type FormState = {
  shortCode: string;
  displayName: string;
};

const EMPTY_FORM: FormState = { shortCode: "", displayName: "" };

function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CatalogPanel({ hostAvailable, signedIn, canManage, staffKey }: CatalogPanelProps) {
  const searchId = useId();
  const vegShortCodeRef = useRef<HTMLInputElement>(null);
  const pkgShortCodeRef = useRef<HTMLInputElement>(null);
  const vegSearchRequestRef = useRef(0);
  const pkgSearchRequestRef = useRef(0);
  const vegCreateKeyRef = useRef(newIdempotencyKey("veg-create"));
  const vegSaveKeyRef = useRef(newIdempotencyKey("veg-save"));
  const pkgCreateKeyRef = useRef(newIdempotencyKey("pkg-create"));
  const pkgSaveKeyRef = useRef(newIdempotencyKey("pkg-save"));

  const [vegQuery, setVegQuery] = useState("");
  const [vegDebouncedQuery, setVegDebouncedQuery] = useState("");
  const [vegActiveFilter, setVegActiveFilter] = useState<ActiveFilter>("active");
  const [vegetables, setVegetables] = useState<CatalogRecord[]>([]);
  const [vegLoading, setVegLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [vegEditorMode, setVegEditorMode] = useState<EditorMode>("closed");
  const [vegForm, setVegForm] = useState<FormState>(EMPTY_FORM);
  const [editingVegetable, setEditingVegetable] = useState<CatalogRecord | null>(null);
  const [vegBusy, setVegBusy] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);

  const [packageTypes, setPackageTypes] = useState<CatalogRecord[]>([]);
  const [pkgEditorMode, setPkgEditorMode] = useState<EditorMode>("closed");
  const [pkgForm, setPkgForm] = useState<FormState>(EMPTY_FORM);
  const [editingPackageType, setEditingPackageType] = useState<CatalogRecord | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);

  const [previewVegetableId, setPreviewVegetableId] = useState("");
  const [previewPackageTypeId, setPreviewPackageTypeId] = useState("");
  const [weightEntryKey, setWeightEntryKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setVegDebouncedQuery(vegQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [vegQuery]);

  useEffect(() => {
    setVegQuery("");
    setVegDebouncedQuery("");
    setVegetables([]);
    setPackageTypes([]);
    setVegEditorMode("closed");
    setPkgEditorMode("closed");
    setVegForm(EMPTY_FORM);
    setPkgForm(EMPTY_FORM);
    setEditingVegetable(null);
    setEditingPackageType(null);
    setError(null);
    setInfo(null);
    setRevisionConflict(false);
    setPreviewVegetableId("");
    setPreviewPackageTypeId("");
    setWeightEntryKey((value) => value + 1);
    vegCreateKeyRef.current = newIdempotencyKey("veg-create");
    vegSaveKeyRef.current = newIdempotencyKey("veg-save");
    pkgCreateKeyRef.current = newIdempotencyKey("pkg-create");
    pkgSaveKeyRef.current = newIdempotencyKey("pkg-save");
  }, [staffKey]);

  useEffect(() => {
    if (!signedIn || !hostAvailable || !canManage || !window.polivoVegetables) {
      setVegetables([]);
      return;
    }
    const requestId = ++vegSearchRequestRef.current;
    setVegLoading(true);
    setError(null);
    void window.polivoVegetables
      .list({ q: vegDebouncedQuery || undefined, active: vegActiveFilter, limit: 50 })
      .then((result) => {
        if (requestId !== vegSearchRequestRef.current) {
          return;
        }
        if (!result.ok) {
          setError(result.message);
          setVegetables([]);
          return;
        }
        if (result.stale) {
          return;
        }
        setVegetables(result.data.items);
      })
      .catch((err) => {
        if (requestId !== vegSearchRequestRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to search vegetables.");
        setVegetables([]);
      })
      .finally(() => {
        if (requestId === vegSearchRequestRef.current) {
          setVegLoading(false);
        }
      });
  }, [signedIn, hostAvailable, canManage, vegDebouncedQuery, vegActiveFilter, staffKey]);

  useEffect(() => {
    if (!signedIn || !hostAvailable || !canManage || !window.polivoPackageTypes) {
      setPackageTypes([]);
      return;
    }
    const requestId = ++pkgSearchRequestRef.current;
    void window.polivoPackageTypes
      .list({ active: "all", limit: 100 })
      .then((result) => {
        if (requestId !== pkgSearchRequestRef.current) {
          return;
        }
        if (!result.ok) {
          setError(result.message);
          setPackageTypes([]);
          return;
        }
        if (result.stale) {
          return;
        }
        setPackageTypes(result.data.items);
      })
      .catch((err) => {
        if (requestId !== pkgSearchRequestRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load package types.");
        setPackageTypes([]);
      });
  }, [signedIn, hostAvailable, canManage, staffKey]);

  async function refreshVegetables() {
    if (!window.polivoVegetables) {
      return;
    }
    const result = await window.polivoVegetables.list({
      q: vegDebouncedQuery || undefined,
      active: vegActiveFilter,
      limit: 50,
    });
    if (result.ok && !result.stale) {
      setVegetables(result.data.items);
    }
  }

  async function refreshPackageTypes() {
    if (!window.polivoPackageTypes) {
      return;
    }
    const result = await window.polivoPackageTypes.list({ active: "all", limit: 100 });
    if (result.ok && !result.stale) {
      setPackageTypes(result.data.items);
    }
  }

  async function saveVegetable() {
    if (!window.polivoVegetables || vegBusy) {
      return;
    }
    setVegBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (vegEditorMode === "create") {
        const result = await window.polivoVegetables.create(
          { shortCode: vegForm.shortCode, displayName: vegForm.displayName },
          vegCreateKeyRef.current,
        );
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setInfo(`Created vegetable ${result.data.shortCode}.`);
        setVegEditorMode("closed");
        setVegForm(EMPTY_FORM);
        vegCreateKeyRef.current = newIdempotencyKey("veg-create");
        await refreshVegetables();
        return;
      }
      if (!editingVegetable) {
        return;
      }
      const result = await window.polivoVegetables.update(
        editingVegetable.id,
        { expectedRevision: editingVegetable.revision, displayName: vegForm.displayName },
        vegSaveKeyRef.current,
      );
      if (!result.ok) {
        setError(result.message);
        setRevisionConflict(Boolean(result.conflict));
        return;
      }
      setInfo(`Updated vegetable ${result.data.shortCode}.`);
      setEditingVegetable(result.data);
      setVegEditorMode("closed");
      vegSaveKeyRef.current = newIdempotencyKey("veg-save");
      setRevisionConflict(false);
      await refreshVegetables();
    } finally {
      setVegBusy(false);
    }
  }

  async function toggleVegetableStatus(vegetable: CatalogRecord) {
    if (!window.polivoVegetables || vegBusy) {
      return;
    }
    setVegBusy(true);
    setError(null);
    try {
      const result = await window.polivoVegetables.changeStatus(vegetable.id, {
        expectedRevision: vegetable.revision,
        status: vegetable.isActive ? "inactive" : "active",
      });
      if (!result.ok) {
        setError(result.message);
        setRevisionConflict(Boolean(result.conflict));
        return;
      }
      setInfo(
        `${result.data.isActive ? "Reactivated" : "Deactivated"} vegetable ${result.data.shortCode}.`,
      );
      await refreshVegetables();
    } finally {
      setVegBusy(false);
    }
  }

  async function savePackageType() {
    if (!window.polivoPackageTypes || pkgBusy) {
      return;
    }
    setPkgBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (pkgEditorMode === "create") {
        const result = await window.polivoPackageTypes.create(
          { shortCode: pkgForm.shortCode, displayName: pkgForm.displayName },
          pkgCreateKeyRef.current,
        );
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setInfo(`Created package type ${result.data.shortCode}.`);
        setPkgEditorMode("closed");
        setPkgForm(EMPTY_FORM);
        pkgCreateKeyRef.current = newIdempotencyKey("pkg-create");
        await refreshPackageTypes();
        return;
      }
      if (!editingPackageType) {
        return;
      }
      const result = await window.polivoPackageTypes.update(
        editingPackageType.id,
        { expectedRevision: editingPackageType.revision, displayName: pkgForm.displayName },
        pkgSaveKeyRef.current,
      );
      if (!result.ok) {
        setError(result.message);
        setRevisionConflict(Boolean(result.conflict));
        return;
      }
      setInfo(`Updated package type ${result.data.shortCode}.`);
      setEditingPackageType(result.data);
      setPkgEditorMode("closed");
      pkgSaveKeyRef.current = newIdempotencyKey("pkg-save");
      setRevisionConflict(false);
      await refreshPackageTypes();
    } finally {
      setPkgBusy(false);
    }
  }

  async function togglePackageTypeStatus(packageType: CatalogRecord) {
    if (!window.polivoPackageTypes || pkgBusy) {
      return;
    }
    setPkgBusy(true);
    setError(null);
    try {
      const result = await window.polivoPackageTypes.changeStatus(packageType.id, {
        expectedRevision: packageType.revision,
        status: packageType.isActive ? "inactive" : "active",
      });
      if (!result.ok) {
        setError(result.message);
        setRevisionConflict(Boolean(result.conflict));
        return;
      }
      setInfo(
        `${result.data.isActive ? "Reactivated" : "Deactivated"} package type ${result.data.shortCode}.`,
      );
      await refreshPackageTypes();
    } finally {
      setPkgBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <EmptyState
        title="Catalog unavailable"
        description="Sign in to manage vegetables, package types, and the weight-entry preview."
      />
    );
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Catalog unavailable"
        description="This staff account does not include catalog.manage."
      />
    );
  }

  if (!hostAvailable) {
    return (
      <EmptyState
        title="Host unavailable"
        description="Reconnect to the stall host before changing catalog records."
      />
    );
  }

  const activeVegetables = vegetables.filter((item) => item.isActive);
  const activePackageTypes = packageTypes.filter((item) => item.isActive);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Vegetables</h2>
            <p className="text-sm text-muted-foreground">
              Search by short code or name. Categories remain deferred.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setVegEditorMode("create");
              setEditingVegetable(null);
              setVegForm(EMPTY_FORM);
              setRevisionConflict(false);
              vegCreateKeyRef.current = newIdempotencyKey("veg-create");
              queueMicrotask(() => vegShortCodeRef.current?.focus());
            }}
          >
            Add vegetable
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor={searchId}>Search vegetables</Label>
            <Input
              id={searchId}
              value={vegQuery}
              onChange={(event) => setVegQuery(event.target.value)}
              placeholder="Code or name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${searchId}-active`}>Status</Label>
            <select
              id={`${searchId}-active`}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={vegActiveFilter}
              onChange={(event) => setVegActiveFilter(event.target.value as ActiveFilter)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Catalog error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {info ? (
          <Alert>
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}
        {revisionConflict ? (
          <Alert variant="destructive">
            <AlertTitle>Revision conflict</AlertTitle>
            <AlertDescription>
              Another terminal updated this record. Reload the row and try again.
            </AlertDescription>
          </Alert>
        ) : null}

        {vegEditorMode !== "closed" ? (
          <form
            className="space-y-3 rounded-md border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveVegetable();
            }}
          >
            <h3 className="text-sm font-semibold">
              {vegEditorMode === "create" ? "New vegetable" : "Edit vegetable"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="veg-short-code">Short code</Label>
                <Input
                  id="veg-short-code"
                  ref={vegShortCodeRef}
                  value={vegForm.shortCode}
                  disabled={vegEditorMode === "edit" || vegBusy}
                  onChange={(event) =>
                    setVegForm((current) => ({ ...current, shortCode: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="veg-display-name">Display name</Label>
                <Input
                  id="veg-display-name"
                  value={vegForm.displayName}
                  disabled={vegBusy}
                  onChange={(event) =>
                    setVegForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={vegBusy}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={vegBusy}
                onClick={() => setVegEditorMode("closed")}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {vegLoading ? <LoadingState label="Searching vegetables…" /> : null}
        {!vegLoading && vegetables.length === 0 ? (
          <EmptyState title="No vegetables" description="Create a vegetable to begin." />
        ) : null}
        {vegetables.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vegetables.map((vegetable) => (
                <TableRow key={vegetable.id}>
                  <TableCell>{vegetable.shortCode}</TableCell>
                  <TableCell>{vegetable.displayName}</TableCell>
                  <TableCell>
                    <Badge variant={vegetable.isActive ? "default" : "secondary"}>
                      {vegetable.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setVegEditorMode("edit");
                        setEditingVegetable(vegetable);
                        setVegForm({
                          shortCode: vegetable.shortCode,
                          displayName: vegetable.displayName,
                        });
                        vegSaveKeyRef.current = newIdempotencyKey("veg-save");
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleVegetableStatus(vegetable)}
                    >
                      {vegetable.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Package types</h2>
            <p className="text-sm text-muted-foreground">
              Bags, boxes, and other containers. No default tare weights in this release.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setPkgEditorMode("create");
              setEditingPackageType(null);
              setPkgForm(EMPTY_FORM);
              pkgCreateKeyRef.current = newIdempotencyKey("pkg-create");
              queueMicrotask(() => pkgShortCodeRef.current?.focus());
            }}
          >
            Add package type
          </Button>
        </div>

        {pkgEditorMode !== "closed" ? (
          <form
            className="space-y-3 rounded-md border border-border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void savePackageType();
            }}
          >
            <h3 className="text-sm font-semibold">
              {pkgEditorMode === "create" ? "New package type" : "Edit package type"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pkg-short-code">Short code</Label>
                <Input
                  id="pkg-short-code"
                  ref={pkgShortCodeRef}
                  value={pkgForm.shortCode}
                  disabled={pkgEditorMode === "edit" || pkgBusy}
                  onChange={(event) =>
                    setPkgForm((current) => ({ ...current, shortCode: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-display-name">Display name</Label>
                <Input
                  id="pkg-display-name"
                  value={pkgForm.displayName}
                  disabled={pkgBusy}
                  onChange={(event) =>
                    setPkgForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pkgBusy}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pkgBusy}
                onClick={() => setPkgEditorMode("closed")}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {packageTypes.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packageTypes.map((packageType) => (
                <TableRow key={packageType.id}>
                  <TableCell>{packageType.shortCode}</TableCell>
                  <TableCell>{packageType.displayName}</TableCell>
                  <TableCell>
                    <Badge variant={packageType.isActive ? "default" : "secondary"}>
                      {packageType.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPkgEditorMode("edit");
                        setEditingPackageType(packageType);
                        setPkgForm({
                          shortCode: packageType.shortCode,
                          displayName: packageType.displayName,
                        });
                        pkgSaveKeyRef.current = newIdempotencyKey("pkg-save");
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void togglePackageTypeStatus(packageType)}
                    >
                      {packageType.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No package types" description="Create a bag or box type to begin." />
        )}
      </section>

      <section className="space-y-3 rounded-md border border-border p-4">
        <div>
          <h2 className="text-base font-semibold">Weight entry preview</h2>
          <p className="text-sm text-muted-foreground">
            Local practice only. Values stay in memory for this staff session and are not saved to
            the stall database. Use Validate entry to check totals.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="preview-vegetable">Active vegetable</Label>
          <select
            id="preview-vegetable"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={previewVegetableId}
            onChange={(event) => setPreviewVegetableId(event.target.value)}
          >
            <option value="">Select vegetable</option>
            {activeVegetables.map((vegetable) => (
              <option key={vegetable.id} value={vegetable.id}>
                {vegetable.shortCode} — {vegetable.displayName}
              </option>
            ))}
          </select>
        </div>
        <WeightEntry
          key={`${staffKey ?? "none"}-${weightEntryKey}`}
          packageTypes={activePackageTypes.map((item) => ({
            id: item.id,
            shortCode: item.shortCode,
            displayName: item.displayName,
          }))}
          selectedPackageTypeId={previewPackageTypeId}
          onPackageTypeChange={setPreviewPackageTypeId}
        />
      </section>
    </div>
  );
}
