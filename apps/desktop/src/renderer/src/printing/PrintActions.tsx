import { useCallback, useEffect, useState } from "react";

import { Button, Input, Label } from "@polivo/ui";

type PrintDocumentKind =
  | "buyer_bill"
  | "farmer_bill"
  | "payment_receipt"
  | "account_statement"
  | "test_page";

type PrinterConfig = {
  printerSystemName: string;
  displayLabel: string;
  paperProfile: "thermal-80mm-test" | "a4-paged-test";
  copyCount: 1;
};

type AttemptSummary = {
  id: string;
  classification: string;
  outcome: string;
  preparedAt: string;
  reprintReason: string | null;
};

export function PrintActions({
  documentKind,
  documentId,
  statementSnapshotToken,
}: {
  documentKind: PrintDocumentKind;
  documentId: string;
  statementSnapshotToken?: string;
}) {
  const [config, setConfig] = useState<PrinterConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reprintReason, setReprintReason] = useState("");
  const [showReprint, setShowReprint] = useState(false);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.polivoPrint;
    if (!api) {
      setStatus("Print bridge unavailable.");
      return;
    }
    await api.flushPendingOutcome();
    const configResult = await api.getConfig();
    if (configResult.ok) {
      setConfig((configResult.data as PrinterConfig | null) ?? null);
    }
    const history = await api.listAttempts({ documentKind, documentId, limit: 5 });
    if (history.ok) {
      const data = history.data as { attempts?: AttemptSummary[] };
      setAttempts(data.attempts ?? []);
    }
  }, [documentKind, documentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const api = window.polivoPrint;
      if (!api) {
        await Promise.resolve();
        if (!cancelled) {
          setStatus("Print bridge unavailable.");
        }
        return;
      }
      await api.flushPendingOutcome();
      if (cancelled) {
        return;
      }
      const configResult = await api.getConfig();
      if (cancelled) {
        return;
      }
      if (configResult.ok) {
        setConfig((configResult.data as PrinterConfig | null) ?? null);
      }
      const history = await api.listAttempts({ documentKind, documentId, limit: 5 });
      if (cancelled) {
        return;
      }
      if (history.ok) {
        const data = history.data as { attempts?: AttemptSummary[] };
        setAttempts(data.attempts ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentKind, documentId]);

  async function runPreview(): Promise<void> {
    const api = window.polivoPrint;
    if (!api) {
      return;
    }
    setBusy(true);
    setStatus(null);
    const result = await api.preview({
      documentKind,
      documentId,
      statementSnapshotToken,
      classification: "initial",
    });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.message);
      return;
    }
    setStatus("Preview opened. Closing the preview without printing cancels that attempt.");
    await refresh();
  }

  async function runPrint(classification: "initial" | "reprint"): Promise<void> {
    const api = window.polivoPrint;
    if (!api) {
      return;
    }
    if (classification === "reprint" && reprintReason.trim().length === 0) {
      setStatus("Reprint reason is required.");
      return;
    }
    setBusy(true);
    setStatus(null);
    const result = await api.print({
      documentKind,
      documentId,
      statementSnapshotToken,
      classification,
      reprintReason: classification === "reprint" ? reprintReason.trim() : undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.message);
      return;
    }
    const data = result.data as { outcome?: string };
    if (data.outcome === "accepted_by_print_system") {
      setStatus(
        "Accepted by the Windows print system. This is not proof that paper physically printed.",
      );
    } else if (data.outcome === "outcome_unknown") {
      setStatus(
        "Print outcome unknown. Check the printer and Windows queue before requesting another copy.",
      );
    } else {
      setStatus(`Print attempt ended: ${data.outcome ?? "unknown"}.`);
    }
    setShowReprint(false);
    setReprintReason("");
    await refresh();
  }

  return (
    <section className="space-y-2 rounded-md border border-border p-3" aria-label="Print actions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <p>
            Printer:{" "}
            <strong>{config?.displayLabel ?? config?.printerSystemName ?? "Not configured"}</strong>
          </p>
          <p className="text-muted-foreground">
            Paper profile: {config?.paperProfile ?? "—"} · Explicit Print only (no auto-print)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void runPreview()}>
            Preview
          </Button>
          <Button type="button" disabled={busy} onClick={() => void runPrint("initial")}>
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setShowReprint((value) => !value)}
          >
            Reprint
          </Button>
        </div>
      </div>
      {showReprint ? (
        <div className="space-y-2">
          <Label htmlFor={`reprint-reason-${documentId}`}>Reprint reason</Label>
          <Input
            id={`reprint-reason-${documentId}`}
            value={reprintReason}
            onChange={(event) => setReprintReason(event.target.value)}
            placeholder="Why is another copy needed?"
          />
          <Button type="button" disabled={busy} onClick={() => void runPrint("reprint")}>
            Confirm reprint
          </Button>
        </div>
      ) : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      {attempts.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              {attempt.preparedAt}: {attempt.classification} → {attempt.outcome}
              {attempt.reprintReason ? ` (${attempt.reprintReason})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
