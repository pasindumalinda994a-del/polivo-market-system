import { useCallback, useEffect, useId, useState } from "react";

import { Button } from "@polivo/ui";

type WorkspaceStatus = {
  upload: {
    state: string;
    pendingEventCount: number;
    acknowledgedCursor: string;
    localTailSequence: string;
    blockingErrorCode: string | null;
    blockingMessage: string | null;
    configurationMessage: string | null;
    nextRetryAt: string | null;
  };
  configuration: {
    state: string;
    effectiveRevision: number | null;
    pendingAcknowledgement: boolean;
    pendingAckRevision: number | null;
    snapshotValidUntil: string | null;
    blockingErrorCode: string | null;
    blockingMessage: string | null;
  };
  reconciliation: {
    summaryPhrase: string;
    safeNextAction: string | null;
    mismatches: Array<{ category: string; observed: string; availableAction: string | null }>;
    incompleteDomainWarnings: string[];
    cutoff: { comparableCutoff: string } | null;
  } | null;
  pendingBlocked: Array<{
    transactionGroupId: string;
    eventType: string;
    sourceReference: string;
    recordedAt: string;
    attemptCount: number;
    errorCode: string | null;
    recommendedAction: string | null;
    blocked: boolean;
  }>;
  overallHealthy: boolean;
  hasUnresolvedIntegrityConflict: boolean;
  accessSnapshotExpired: boolean;
  localObservedAt: string;
};

type SyncWorkspacePanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canView: boolean;
  canReconcile: boolean;
  canRetry: boolean;
  canRecover: boolean;
  canExport: boolean;
  staffKey: string | null;
};

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}`;
}

export function SyncWorkspacePanel({
  hostAvailable,
  signedIn,
  canView,
  canReconcile,
  canRetry,
  canRecover,
  canExport,
  staffKey,
}: SyncWorkspacePanelProps) {
  const headingId = useId();
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planPreview, setPlanPreview] = useState<string | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [section, setSection] = useState<"overview" | "pending" | "reconcile" | "recovery">(
    "overview",
  );

  const load = useCallback(async () => {
    if (!hostAvailable || !signedIn || !canView || !window.polivoSync?.getWorkspace) {
      setWorkspace(null);
      return;
    }
    const result = await window.polivoSync.getWorkspace();
    if (!result.ok) {
      setError(result.message);
      setWorkspace(null);
      return;
    }
    setError(null);
    setWorkspace(result.data as WorkspaceStatus);
  }, [canView, hostAvailable, signedIn]);

  useEffect(() => {
    void load();
  }, [load, staffKey]);

  const onRetry = async () => {
    if (!window.polivoSync || busy || !canRetry) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoSync.retry();
      if (!result.ok) {
        setError(result.message);
      } else {
        setError(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const onReconcile = async () => {
    if (!window.polivoSync?.reconcile || busy || !canReconcile) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoSync.reconcile({ requestId: newId() });
      if (!result.ok) {
        setError(result.message);
      } else {
        setError(null);
        await load();
        setSection("reconcile");
      }
    } finally {
      setBusy(false);
    }
  };

  const onPrepareRecovery = async (actionType: string) => {
    if (!window.polivoSync?.createRecoveryPlan || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoSync.createRecoveryPlan({
        requestId: newId(),
        actionType,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const plan = (result.data as { plan: { planId: string; safetyRationale: string; potentialOutcome: string } })
        .plan;
      setPendingPlanId(plan.planId);
      setPlanPreview(`${plan.safetyRationale}\n\nOutcome: ${plan.potentialOutcome}`);
      setSection("recovery");
      setError(null);
    } finally {
      setBusy(false);
    }
  };

  const onConfirmRecovery = async () => {
    if (!window.polivoSync?.executeRecoveryPlan || !pendingPlanId || busy || !canRecover) {
      return;
    }
    const confirmed = window.confirm(
      "Confirm this bounded recovery action? It will not reset cursors or skip events.",
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoSync.executeRecoveryPlan({
        requestId: newId(),
        planId: pendingPlanId,
        idempotencyKey: newId(),
      });
      if (!result.ok) {
        setError(result.message);
      } else {
        setPendingPlanId(null);
        setPlanPreview(null);
        setError(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    if (!window.polivoSync?.exportDiagnostics || busy || !canExport) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoSync.exportDiagnostics({ requestId: newId() });
      if (!result.ok) {
        setError(result.message);
      } else {
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return null;
  }

  const healthLabel = !workspace
    ? "Unknown"
    : workspace.hasUnresolvedIntegrityConflict
      ? "Integrity conflict"
      : workspace.accessSnapshotExpired
        ? "Access snapshot expired"
        : workspace.overallHealthy
          ? "Healthy"
          : "Attention needed";

  return (
    <section className="space-y-4" aria-labelledby={headingId}>
      <div>
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          Cloud sync workspace
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload progress, access configuration, reconciliation, and bounded recovery. Local billing
          remains authoritative.
        </p>
      </div>

      {!hostAvailable || !signedIn ? (
        <p className="text-sm text-muted-foreground">
          Sign in while the host is available to view sync status.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : workspace ? (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sync workspace sections">
            {(
              [
                ["overview", "Overview"],
                ["pending", "Pending"],
                ["reconcile", "Reconciliation"],
                ["recovery", "Recovery"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={section === id ? "default" : "outline"}
                onClick={() => setSection(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {section === "overview" ? (
            <div className="space-y-3 text-sm">
              <p>
                Status: <span className="font-medium">{healthLabel}</span>
                {workspace.overallHealthy &&
                (workspace.accessSnapshotExpired || workspace.hasUnresolvedIntegrityConflict)
                  ? " (not shown as healthy while conflicts remain)"
                  : null}
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Upload</dt>
                  <dd className="font-medium">{workspace.upload.state}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pending events</dt>
                  <dd className="font-medium">{workspace.upload.pendingEventCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Local tail / ack</dt>
                  <dd className="font-medium">
                    {workspace.upload.localTailSequence} / {workspace.upload.acknowledgedCursor}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Access configuration</dt>
                  <dd className="font-medium">{workspace.configuration.state}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Applied revision</dt>
                  <dd className="font-medium">
                    {workspace.configuration.effectiveRevision ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last comparison</dt>
                  <dd className="font-medium">
                    {workspace.reconciliation?.summaryPhrase ?? "Not run yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Observed at</dt>
                  <dd className="font-medium">{workspace.localObservedAt}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {canRetry ? (
                  <Button type="button" size="sm" disabled={busy} onClick={() => void onRetry()}>
                    Retry upload now
                  </Button>
                ) : null}
                {canReconcile ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onReconcile()}
                  >
                    Run reconciliation
                  </Button>
                ) : null}
                {canExport ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onExport()}
                  >
                    Export diagnostics
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {section === "pending" ? (
            <div className="space-y-2 text-sm">
              {workspace.pendingBlocked.length === 0 ? (
                <p className="text-muted-foreground">No pending or blocked upload groups.</p>
              ) : (
                <ul className="space-y-2">
                  {workspace.pendingBlocked.map((item) => (
                    <li key={item.transactionGroupId} className="rounded border border-border p-2">
                      <div className="font-medium">
                        {item.eventType} · {item.sourceReference}
                      </div>
                      <div className="text-muted-foreground">
                        Recorded {item.recordedAt}; attempts {item.attemptCount}
                        {item.errorCode ? `; ${item.errorCode}` : ""}
                        {item.blocked ? " (blocked)" : ""}
                      </div>
                      <div>
                        Recommended: {item.recommendedAction ?? "escalate / support workflow"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {section === "reconcile" ? (
            <div className="space-y-3 text-sm">
              {workspace.reconciliation ? (
                <>
                  <p className="font-medium">{workspace.reconciliation.summaryPhrase}</p>
                  {workspace.reconciliation.cutoff ? (
                    <p>Cutoff: {workspace.reconciliation.cutoff.comparableCutoff}</p>
                  ) : null}
                  {workspace.reconciliation.incompleteDomainWarnings.length > 0 ? (
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {workspace.reconciliation.incompleteDomainWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {workspace.reconciliation.mismatches.length > 0 ? (
                    <ul className="space-y-2">
                      {workspace.reconciliation.mismatches.map((m, index) => (
                        <li key={`${m.category}-${index}`}>
                          <span className="font-medium">{m.category}</span>: {m.observed}
                          {m.availableAction ? ` → ${m.availableAction}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No mismatch details beyond expected backlog.</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Run a comparison to see matched domains and cutoff.</p>
              )}
              {canReconcile ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => void onReconcile()}>
                  Run comparison
                </Button>
              ) : null}
            </div>
          ) : null}

          {section === "recovery" ? (
            <div className="space-y-3 text-sm">
              <p>
                Recovery reuses original event identities and existing workers. Force sync, skip,
                reset cursor, and trust-cloud actions are not available.
              </p>
              {planPreview ? (
                <pre className="whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 text-xs">
                  {planPreview}
                </pre>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canRetry ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onPrepareRecovery("retry_upload_worker")}
                  >
                    Plan: retry upload
                  </Button>
                ) : null}
                {canRecover ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onPrepareRecovery("recover_local_acknowledgement")}
                    >
                      Plan: recover acknowledgement
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onPrepareRecovery("replay_original_events")}
                    >
                      Plan: replay originals
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onPrepareRecovery("retry_configuration_acknowledgement")}
                    >
                      Plan: retry config ack
                    </Button>
                  </>
                ) : null}
                {pendingPlanId && canRecover ? (
                  <Button type="button" size="sm" disabled={busy} onClick={() => void onConfirmRecovery()}>
                    Confirm plan
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading sync workspace…</p>
      )}
    </section>
  );
}
