import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle, Button, Input, Label, PageHeader } from "@polivo/ui";

type PrinterOption = { name: string; displayName: string; isDefault: boolean };

type PrinterConfig = {
  printerSystemName: string;
  displayLabel: string;
  paperProfile: "thermal-80mm-test" | "a4-paged-test";
  copyCount: 1;
};

export function PrintingSettingsPanel({
  hostAvailable,
  signedIn,
}: {
  hostAvailable: boolean;
  signedIn: boolean;
}) {
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [config, setConfig] = useState<PrinterConfig | null>(null);
  const [stallName, setStallName] = useState("");
  const [stallAddress, setStallAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const api = window.polivoPrint;
    if (!api) {
      setError("Print bridge unavailable.");
      return;
    }
    const listed = await api.listPrinters();
    if (listed.ok) {
      setPrinters((listed.data as PrinterOption[]) ?? []);
    }
    const current = await api.getConfig();
    if (current.ok) {
      setConfig((current.data as PrinterConfig | null) ?? null);
    }
    if (signedIn && hostAvailable) {
      const identity = await api.getStallIdentity();
      if (identity.ok) {
        const data = identity.data as {
          displayName?: string;
          address?: string | null;
          configured?: boolean;
        };
        setStallName(data.displayName ?? "");
        setStallAddress(data.address ?? "");
        setError(null);
      } else {
        setError(identity.message);
      }
    }
  }

  useEffect(() => {
    void refresh();
  }, [hostAvailable, signedIn]);

  async function saveConfig(next: PrinterConfig): Promise<void> {
    const api = window.polivoPrint;
    if (!api) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.setConfig(next);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setConfig(result.data as PrinterConfig);
    setMessage("Terminal printer configuration saved for this device only.");
  }

  async function saveStallIdentity(): Promise<void> {
    const api = window.polivoPrint;
    if (!api) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.setStallIdentity({
      displayName: stallName.trim(),
      address: stallAddress.trim().length > 0 ? stallAddress.trim() : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const data = result.data as {
      displayName?: string;
      address?: string | null;
    };
    setStallName(data.displayName ?? stallName.trim());
    setStallAddress(data.address ?? "");
    setMessage("Stall print identity saved. New bills will snapshot this name when issued.");
  }

  async function printTestPage(): Promise<void> {
    const api = window.polivoPrint;
    if (!api || !config) {
      setError("Configure a printer before printing the test page.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.print({
      documentKind: "test_page",
      documentId: `test-${Date.now()}`,
      classification: "initial",
      paperProfile: config.paperProfile,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const data = result.data as { outcome?: string };
    setMessage(`Test page attempt outcome: ${data.outcome ?? "unknown"}`);
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Printing"
        description="Terminal-local printer settings and stall print identity. Profiles are labeled test profiles until physical acceptance."
      />
      {message ? (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Printing error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-2" aria-label="Printer configuration">
        <h3 className="text-sm font-semibold">This terminal’s printer</h3>
        <Label htmlFor="print-printer">System printer</Label>
        <select
          id="print-printer"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={config?.printerSystemName ?? ""}
          onChange={(event) => {
            const selected = printers.find((printer) => printer.name === event.target.value);
            if (!selected) {
              return;
            }
            void saveConfig({
              printerSystemName: selected.name,
              displayLabel: selected.displayName,
              paperProfile: config?.paperProfile ?? "thermal-80mm-test",
              copyCount: 1,
            });
          }}
        >
          <option value="">Select printer…</option>
          {printers.map((printer) => (
            <option key={printer.name} value={printer.name}>
              {printer.displayName}
              {printer.isDefault ? " (Windows default)" : ""}
            </option>
          ))}
        </select>
        <Label htmlFor="print-profile">Paper profile</Label>
        <select
          id="print-profile"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={config?.paperProfile ?? "thermal-80mm-test"}
          disabled={!config}
          onChange={(event) => {
            if (!config) {
              return;
            }
            void saveConfig({
              ...config,
              paperProfile: event.target.value as PrinterConfig["paperProfile"],
            });
          }}
        >
          <option value="thermal-80mm-test">thermal-80mm-test (uncalibrated)</option>
          <option value="a4-paged-test">a4-paged-test (uncalibrated)</option>
        </select>
        <Button type="button" disabled={busy || !config} onClick={() => void printTestPage()}>
          Print nonfinancial test page
        </Button>
      </section>

      <section className="space-y-2" aria-label="Stall print identity">
        <h3 className="text-sm font-semibold">Stall identity on bills</h3>
        <p className="text-sm text-muted-foreground">
          Used for print headers and snapshotted onto newly issued bills. Existing bills without a
          snapshot show current identity labeled as unverified historical.
        </p>
        <Label htmlFor="stall-print-name">Display name</Label>
        <Input
          id="stall-print-name"
          value={stallName}
          onChange={(event) => setStallName(event.target.value)}
          disabled={!signedIn || !hostAvailable}
        />
        <Label htmlFor="stall-print-address">Address (optional)</Label>
        <Input
          id="stall-print-address"
          value={stallAddress}
          onChange={(event) => setStallAddress(event.target.value)}
          disabled={!signedIn || !hostAvailable}
        />
        <Button
          type="button"
          disabled={busy || !signedIn || !hostAvailable || stallName.trim().length === 0}
          onClick={() => void saveStallIdentity()}
        >
          Save stall print identity
        </Button>
      </section>
    </div>
  );
}
