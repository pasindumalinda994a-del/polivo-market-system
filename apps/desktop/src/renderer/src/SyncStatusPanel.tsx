import { useCallback, useEffect, useState } from "react";

import { Button } from "@polivo/ui";

type SyncStatus = {
  state: string;
  pendingEventCount: number;
  acknowledgedCursor: string;
  localTailSequence: string;
  localTailMeasuredAt: string | null;
  nextRetryAt: string | null;
  blockingErrorCode: string | null;
  blockingMessage: string | null;
  configurationMessage: string | null;
  lastUploadAttemptAt: string | null;
  lastAcknowledgedAt: string | null;
};

type SyncStatusPanelProps = {
  hostAvailable: boolean;
  signedIn: boolean;
  canManage: boolean;
  staffKey: string | null;
};

export function SyncStatusPanel({
  hostAvailable,
  signedIn,
  canManage,
  staffKey,
}: SyncStatusPanelProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!hostAvailable || !signedIn || !canManage || !window.polivoSync) {
      setStatus(null);
      return;
    }
    const result = await window.polivoSync.getStatus();
    if (!result.ok) {
      setError(result.message);
      setStatus(null);
      return;
    }
    setError(null);
    setStatus(result.data as SyncStatus);
  }, [canManage, hostAvailable, signedIn]);

  useEffect(() => {
    void load();
  }, [load, staffKey]);

  const onRetry = async () => {
    if (!window.polivoSync || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await window.polivoSync.retry();
      if (!result.ok) {
        setError(result.message);
      } else {
        const payload = result.data as { status?: SyncStatus; message?: string | null };
        setStatus(payload.status ?? null);
        setError(payload.message ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <section className="space-y-3" aria-labelledby="sync-status-heading">
      <div>
        <h2 id="sync-status-heading" className="text-lg font-semibold text-foreground">
          Cloud sync
        </h2>
        <p className="text-sm text-muted-foreground">
          Upload status for committed local events. Local billing does not wait on cloud
          acknowledgement.
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
      ) : status ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">State</dt>
            <dd className="font-medium">{status.state}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pending events</dt>
            <dd className="font-medium">{status.pendingEventCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Acknowledged cursor</dt>
            <dd className="font-medium">{status.acknowledgedCursor}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Local tail</dt>
            <dd className="font-medium">{status.localTailSequence}</dd>
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
        <p className="text-sm text-muted-foreground">Loading sync status…</p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!hostAvailable || !signedIn || busy}
          onClick={() => void load()}
        >
          Refresh
        </Button>
        <Button
          type="button"
          disabled={!hostAvailable || !signedIn || busy}
          onClick={() => void onRetry()}
        >
          Retry now
        </Button>
      </div>
    </section>
  );
}
