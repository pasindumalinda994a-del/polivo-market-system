import { useCallback, useEffect, useState } from "react";

import { Button } from "@polivo/ui";

type ConfigStatus = {
  state: string;
  effectiveRevision: number | null;
  lastSuccessfulRefreshAt: string | null;
  snapshotValidUntil: string | null;
  pendingAcknowledgement: boolean;
  pendingAckRevision: number | null;
  blockingErrorCode: string | null;
  blockingMessage: string | null;
  configurationMessage: string | null;
};

type ConfigStatusPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canManage: boolean;
  staffKey: string | null;
  /** Called after a successful refresh so the shell can reload session capabilities. */
  onAfterRefresh?: () => void;
};

export function ConfigStatusPanel({
  hostAvailable,
  signedIn,
  canManage,
  staffKey,
  onAfterRefresh,
}: ConfigStatusPanelProps) {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!hostAvailable || !signedIn || !canManage || !window.polivoConfigSync) {
      setStatus(null);
      return;
    }
    const result = await window.polivoConfigSync.getStatus();
    if (!result.ok) {
      setError(result.message);
      setStatus(null);
      return;
    }
    setError(null);
    setStatus(result.data as ConfigStatus);
  }, [canManage, hostAvailable, signedIn]);

  useEffect(() => {
    void load();
  }, [load, staffKey]);

  const onRefresh = async () => {
    if (!window.polivoConfigSync || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoConfigSync.refresh();
      if (!result.ok) {
        setError(result.message);
      } else {
        const payload = result.data as { status?: ConfigStatus; message?: string | null };
        setStatus(payload.status ?? null);
        setError(payload.message ?? null);
        onAfterRefresh?.();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <section className="space-y-3" aria-labelledby="config-status-heading">
      <div>
        <h2 id="config-status-heading" className="text-lg font-semibold text-foreground">
          Access configuration
        </h2>
        <p className="text-sm text-muted-foreground">
          Cloud-published role and device access applied on this stall host.
        </p>
      </div>
      {!hostAvailable || !signedIn ? (
        <p className="text-sm text-muted-foreground">
          Sign in while the host is available to view access configuration status.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : status ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">State</dt>
            <dd className="font-medium">{status.state}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Effective revision</dt>
            <dd className="font-medium">{status.effectiveRevision ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last successful refresh</dt>
            <dd className="font-medium">{status.lastSuccessfulRefreshAt ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Snapshot valid until</dt>
            <dd className="font-medium">{status.snapshotValidUntil ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pending acknowledgement</dt>
            <dd className="font-medium">
              {status.pendingAcknowledgement
                ? `Yes${status.pendingAckRevision != null ? ` (rev ${status.pendingAckRevision})` : ""}`
                : "No"}
            </dd>
          </div>
          {status.blockingErrorCode ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Blocked</dt>
              <dd className="font-medium">
                {status.blockingErrorCode}
                {status.blockingMessage ? ` — ${status.blockingMessage}` : ""}
              </dd>
            </div>
          ) : null}
          {status.configurationMessage ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Configuration</dt>
              <dd className="font-medium">{status.configurationMessage}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Loading access configuration status…</p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!hostAvailable || !signedIn || busy}
          onClick={() => void load()}
        >
          Reload status
        </Button>
        <Button
          type="button"
          disabled={!hostAvailable || !signedIn || busy}
          onClick={() => void onRefresh()}
        >
          Refresh now
        </Button>
      </div>
    </section>
  );
}
