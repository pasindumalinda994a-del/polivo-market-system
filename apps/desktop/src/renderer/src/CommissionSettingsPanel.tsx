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
import {
  ADR_REFERENCE_COMMISSION_BANDS,
  validateCommissionPolicy,
  type CommissionBand,
} from "@polivo/domain";

type CommissionSettingsPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canManage: boolean;
  staffKey: string | null;
};

type BandDraft = {
  key: string;
  id: string;
  minMajor: string;
  maxMajor: string;
  openEnded: boolean;
  rateMajor: string;
};

type ViewMode = "active" | "edit" | "review" | "history";

type ActivePolicy = {
  status: "unconfigured" | "configured";
  stallId: string;
  revision: number;
  updatedAt: string;
  activeVersion: {
    id: string;
    versionNumber: number;
    activatedAt: string | null;
    activatedByStaffId: string | null;
    bands: Array<{
      id: string;
      sortOrder: number;
      minPricePerKgMinor: number;
      maxPricePerKgMinor: number | null;
      ratePerKgMinor: number;
    }>;
  } | null;
  roundingRuleId: string;
  algorithmVersion: string;
};

type VersionSummary = {
  id: string;
  versionNumber: number;
  activatedAt: string | null;
  activatedByStaffId: string | null;
  bandCount: number;
  isActive: boolean;
};

type PreviewResult = {
  versionId: string;
  versionNumber: number;
  bandId: string;
  appliedRatePerKgMinor: number;
  commissionMinor: number;
  explanation: string;
  isActiveVersion: boolean;
};

function newIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newDraftKey(): string {
  return newIdempotencyKey("band");
}

function minorToMajorString(minor: number): string {
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function parseMajorToMinor(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
  return whole * 100 + fraction;
}

function formatBandLabel(minMinor: number, maxMinor: number | null): string {
  const min = minorToMajorString(minMinor);
  if (maxMinor === null) {
    return `Rs ${min}/kg and above (inclusive lower bound)`;
  }
  return `Rs ${min}/kg through Rs ${minorToMajorString(maxMinor)}/kg inclusive`;
}

function bandsFromActive(policy: ActivePolicy | null): BandDraft[] {
  const source =
    policy?.activeVersion?.bands ??
    ADR_REFERENCE_COMMISSION_BANDS.map((band, index) => ({
      id: `draft-${index + 1}`,
      sortOrder: index + 1,
      minPricePerKgMinor: band.minPricePerKgMinor,
      maxPricePerKgMinor: band.maxPricePerKgMinor,
      ratePerKgMinor: band.ratePerKgMinor,
    }));

  return source.map((band) => ({
    key: newDraftKey(),
    id: band.id.startsWith("draft-") || band.id.startsWith("adr-") ? newDraftKey() : band.id,
    minMajor: minorToMajorString(band.minPricePerKgMinor),
    maxMajor: band.maxPricePerKgMinor === null ? "" : minorToMajorString(band.maxPricePerKgMinor),
    openEnded: band.maxPricePerKgMinor === null,
    rateMajor: minorToMajorString(band.ratePerKgMinor),
  }));
}

function draftsToDomainBands(drafts: BandDraft[]): CommissionBand[] | string {
  const bands: CommissionBand[] = [];
  for (const draft of drafts) {
    const min = parseMajorToMinor(draft.minMajor);
    const rate = parseMajorToMinor(draft.rateMajor);
    if (min === null || rate === null) {
      return "Each band needs valid money amounts with at most two decimal places.";
    }
    let max: number | null = null;
    if (!draft.openEnded) {
      max = parseMajorToMinor(draft.maxMajor);
      if (max === null) {
        return "Closed bands need a valid inclusive upper price.";
      }
    }
    bands.push({
      id: draft.id || newDraftKey(),
      minPricePerKgMinor: min,
      maxPricePerKgMinor: max,
      ratePerKgMinor: rate,
    });
  }
  try {
    validateCommissionPolicy({
      policyId: "desktop-draft",
      versionId: "desktop-draft",
      rateBasis: "per_kg_minor",
      roundingRuleId: "half_up_money_times_weight_v1",
      algorithmVersion: "stall_default_bands_v1",
      bands,
    });
  } catch (error) {
    return error instanceof Error ? error.message : "Policy validation failed.";
  }
  return bands;
}

export function CommissionSettingsPanel({
  hostAvailable,
  signedIn,
  canManage,
  staffKey,
}: CommissionSettingsPanelProps) {
  const priceId = useId();
  const weightId = useId();
  const activateKeyRef = useRef(newIdempotencyKey("commission-activate"));
  const loadRequestRef = useRef(0);

  const [mode, setMode] = useState<ViewMode>("active");
  const [policy, setPolicy] = useState<ActivePolicy | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [drafts, setDrafts] = useState<BandDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const [previewPrice, setPreviewPrice] = useState("250.00");
  const [previewWeight, setPreviewWeight] = useState("100.00");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [loadedActiveVersionId, setLoadedActiveVersionId] = useState<string | null>(null);

  function applyLoadedPolicy(
    activeResult: Awaited<ReturnType<NonNullable<Window["polivoCommissionPolicy"]>["getActive"]>>,
    historyResult: Awaited<
      ReturnType<NonNullable<Window["polivoCommissionPolicy"]>["listVersions"]>
    >,
  ): void {
    if (!activeResult.ok) {
      setError(activeResult.message);
      return;
    }
    if (activeResult.stale) {
      return;
    }
    setPolicy(activeResult.data as ActivePolicy);
    setLoadedActiveVersionId(activeResult.data.activeVersion?.id ?? null);
    setRevisionConflict(false);
    if (historyResult.ok && !historyResult.stale) {
      setVersions(historyResult.data.items as VersionSummary[]);
    }
  }

  async function reload(): Promise<void> {
    if (!window.polivoCommissionPolicy) {
      setError("Commission settings bridge is unavailable.");
      return;
    }
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const [activeResult, historyResult] = await Promise.all([
        window.polivoCommissionPolicy.getActive(),
        window.polivoCommissionPolicy.listVersions({ limit: 50 }),
      ]);
      if (requestId !== loadRequestRef.current) {
        return;
      }
      applyLoadedPolicy(activeResult, historyResult);
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!signedIn || !hostAvailable || !canManage || !window.polivoCommissionPolicy) {
      return;
    }
    const requestId = ++loadRequestRef.current;
    void Promise.all([
      window.polivoCommissionPolicy.getActive(),
      window.polivoCommissionPolicy.listVersions({ limit: 50 }),
    ])
      .then(([activeResult, historyResult]) => {
        if (requestId !== loadRequestRef.current) {
          return;
        }
        applyLoadedPolicy(activeResult, historyResult);
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) {
          setLoading(false);
        }
      });
  }, [signedIn, hostAvailable, canManage, staffKey]);

  if (!signedIn) {
    return (
      <EmptyState
        title="Sign in required"
        description="Sign in with a staff account that can manage commission settings."
      />
    );
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Permission required"
        description="Your session does not include commission.manage. Ask an owner to grant commission settings access, then sign out and sign in again."
      />
    );
  }

  if (!hostAvailable) {
    return (
      <EmptyState
        title="Stall host unavailable"
        description="Reconnect to the stall service. Unsaved commission edits are kept until you leave Settings or switch staff."
      />
    );
  }

  function startEdit(): void {
    setDrafts(bandsFromActive(policy));
    setValidationMessage(null);
    setMode("edit");
    setInfo(null);
  }

  function updateDraft(key: string, patch: Partial<BandDraft>): void {
    setDrafts((current) =>
      current.map((band) => (band.key === key ? { ...band, ...patch } : band)),
    );
  }

  function goToReview(): void {
    const parsed = draftsToDomainBands(drafts);
    if (typeof parsed === "string") {
      setValidationMessage(parsed);
      return;
    }
    setValidationMessage(null);
    setMode("review");
  }

  async function activate(): Promise<void> {
    if (!window.polivoCommissionPolicy || !policy || busy) {
      return;
    }
    const parsed = draftsToDomainBands(drafts);
    if (typeof parsed === "string") {
      setValidationMessage(parsed);
      setMode("edit");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoCommissionPolicy.activate(
      {
        expectedRevision: policy.revision,
        bands: parsed.map((band) => ({
          id: band.id,
          minPricePerKgMinor: band.minPricePerKgMinor,
          maxPricePerKgMinor: band.maxPricePerKgMinor,
          ratePerKgMinor: band.ratePerKgMinor,
        })),
      },
      activateKeyRef.current,
    );
    setBusy(false);
    if (!result.ok) {
      if (result.conflict) {
        setRevisionConflict(true);
        setError(result.message);
        return;
      }
      setError(result.message);
      return;
    }
    activateKeyRef.current = newIdempotencyKey("commission-activate");
    setPolicy(result.data as ActivePolicy);
    setLoadedActiveVersionId(result.data.activeVersion?.id ?? null);
    setInfo(
      `Commission policy version ${result.data.activeVersion?.versionNumber ?? ""} activated.`,
    );
    setMode("active");
    setPreviewStale(true);
    void reload();
  }

  async function runPreview(): Promise<void> {
    if (!window.polivoCommissionPolicy) {
      return;
    }
    const price = parseMajorToMinor(previewPrice);
    const weight = parseMajorToMinor(previewWeight);
    if (price === null || weight === null) {
      setError("Preview needs valid price/kg and net weight with at most two decimals.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.polivoCommissionPolicy.preview({
      sellingPricePerKgMinor: price,
      netWeightHundredths: weight,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPreview(result.data as PreviewResult);
    setPreviewStale(
      loadedActiveVersionId !== null && result.data.versionId !== loadedActiveVersionId,
    );
  }

  return (
    <section className="space-y-4" aria-label="Commission settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Commission settings</h2>
          <p className="text-sm text-text-secondary">
            Stall default bands only. Published versions are immutable. Rounding: per-bag half-up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void reload()}
            disabled={loading || busy}
          >
            Refresh
          </Button>
          {mode === "active" ? (
            <Button type="button" onClick={startEdit} disabled={loading || busy}>
              {policy?.status === "configured" ? "Replace policy" : "Configure policy"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode("history")}
            disabled={loading || busy}
          >
            Version history
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{revisionConflict ? "Configuration conflict" : "Action failed"}</AlertTitle>
          <AlertDescription>
            {error}
            {revisionConflict ? " Refresh, review the active policy, then edit again." : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {info ? (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}
      {validationMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Invalid policy</AlertTitle>
          <AlertDescription>{validationMessage}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !policy ? <LoadingState label="Loading commission policy…" /> : null}

      {mode === "active" && policy ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={policy.status === "configured" ? "default" : "secondary"}>
              {policy.status === "configured" ? "Configured" : "Unconfigured"}
            </Badge>
            <span className="text-sm text-text-secondary">Revision {policy.revision}</span>
            {policy.activeVersion ? (
              <span className="text-sm text-text-secondary">
                Active version {policy.activeVersion.versionNumber}
                {policy.activeVersion.activatedAt
                  ? ` · activated ${policy.activeVersion.activatedAt}`
                  : ""}
              </span>
            ) : null}
          </div>

          {policy.activeVersion ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Band</TableHead>
                  <TableHead>Rate per kg</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policy.activeVersion.bands.map((band) => (
                  <TableRow key={band.id}>
                    <TableCell>
                      {formatBandLabel(band.minPricePerKgMinor, band.maxPricePerKgMinor)}
                    </TableCell>
                    <TableCell>Rs {minorToMajorString(band.ratePerKgMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No active commission policy"
              description="Activate a validated band set before sales can calculate commission. Missing configuration returns an explicit error — never zero."
            />
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-base font-medium">Calculation preview</h3>
            <p className="text-sm text-text-secondary">
              Service-validated preview against the active policy. Not a sale, bill, or ledger
              entry.
            </p>
            {previewStale ? (
              <Alert>
                <AlertTitle>Preview may be stale</AlertTitle>
                <AlertDescription>
                  The active policy changed. Run preview again to recalculate.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={priceId}>Selling price per kg (Rs)</Label>
                <Input
                  id={priceId}
                  value={previewPrice}
                  onChange={(event) => setPreviewPrice(event.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={weightId}>Net weight (kg)</Label>
                <Input
                  id={weightId}
                  value={previewWeight}
                  onChange={(event) => setPreviewWeight(event.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void runPreview()}
              disabled={busy || policy.status !== "configured"}
            >
              Preview commission
            </Button>
            {preview ? (
              <div className="space-y-1 text-sm">
                <p>
                  Version {preview.versionNumber}
                  {preview.isActiveVersion ? " (active)" : " (not active)"} · band {preview.bandId}
                </p>
                <p>Applied rate: Rs {minorToMajorString(preview.appliedRatePerKgMinor)}/kg</p>
                <p>Rounded commission: Rs {minorToMajorString(preview.commissionMinor)}</p>
                <p className="text-text-secondary">{preview.explanation}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {(mode === "edit" || mode === "review") && (
        <div className="space-y-4">
          <h3 className="text-base font-medium">
            {mode === "edit" ? "Edit candidate bands" : "Review before activation"}
          </h3>
          <p className="text-sm text-text-secondary">
            Boundaries are inclusive on both ends when an upper price is set. The final band must be
            open-ended. Coverage must start at Rs 0.00 with no gaps.
          </p>
          {mode === "edit" ? (
            <div className="space-y-3">
              {drafts.map((band, index) => (
                <div
                  key={band.key}
                  className="grid gap-2 border-b border-border pb-3 sm:grid-cols-5"
                >
                  <div className="space-y-1">
                    <Label>Min Rs/kg (inclusive)</Label>
                    <Input
                      value={band.minMajor}
                      onChange={(event) => updateDraft(band.key, { minMajor: event.target.value })}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Max Rs/kg (inclusive)</Label>
                    <Input
                      value={band.maxMajor}
                      disabled={band.openEnded}
                      onChange={(event) => updateDraft(band.key, { maxMajor: event.target.value })}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Rate Rs/kg</Label>
                    <Input
                      value={band.rateMajor}
                      onChange={(event) => updateDraft(band.key, { rateMajor: event.target.value })}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={band.openEnded}
                        onChange={(event) =>
                          updateDraft(band.key, {
                            openEnded: event.target.checked,
                            maxMajor: event.target.checked ? "" : band.maxMajor,
                          })
                        }
                      />
                      Open-ended
                    </label>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={drafts.length <= 1}
                      onClick={() =>
                        setDrafts((current) => current.filter((item) => item.key !== band.key))
                      }
                    >
                      Remove {index + 1}
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDrafts((current) => [
                      ...current,
                      {
                        key: newDraftKey(),
                        id: newDraftKey(),
                        minMajor: "0.00",
                        maxMajor: "",
                        openEnded: true,
                        rateMajor: "5.00",
                      },
                    ])
                  }
                >
                  Add band
                </Button>
                <Button type="button" onClick={goToReview}>
                  Review candidate
                </Button>
                <Button type="button" variant="outline" onClick={() => setMode("active")}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Band</TableHead>
                    <TableHead>Rate per kg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const parsed = draftsToDomainBands(drafts);
                    if (typeof parsed === "string") {
                      return null;
                    }
                    return parsed.map((band) => (
                      <TableRow key={band.id}>
                        <TableCell>
                          {formatBandLabel(band.minPricePerKgMinor, band.maxPricePerKgMinor)}
                        </TableCell>
                        <TableCell>Rs {minorToMajorString(band.ratePerKgMinor)}</TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
              <Alert>
                <AlertTitle>Activation changes future calculations</AlertTitle>
                <AlertDescription>
                  Confirm carefully. Finalized sales keep their original commission snapshots; only
                  new sales use this version.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void activate()} disabled={busy}>
                  Activate replacement version
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMode("edit")}
                  disabled={busy}
                >
                  Back to edit
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "history" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Published versions</h3>
            <Button type="button" variant="outline" onClick={() => setMode("active")}>
              Back
            </Button>
          </div>
          {versions.length === 0 ? (
            <EmptyState
              title="No versions yet"
              description="Activate a policy to create history."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead>Bands</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>{version.versionNumber}</TableCell>
                    <TableCell>{version.activatedAt ?? "—"}</TableCell>
                    <TableCell>{version.bandCount}</TableCell>
                    <TableCell>{version.isActive ? "Active" : "Historical"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}
    </section>
  );
}
