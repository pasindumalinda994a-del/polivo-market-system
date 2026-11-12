import { useId, useRef, useState } from "react";
import { Button, Input, Label } from "@polivo/ui";
import {
  summarizePackageWeightEntry,
  weightHundredthsToMajorDecimalString,
  type PackageWeightDraftRow,
  type PackageWeightSummary,
} from "@polivo/domain";

export type WeightEntryPackageTypeOption = {
  id: string;
  shortCode: string;
  displayName: string;
};

export type WeightEntryRowState = {
  rowKey: string;
  weightText: string;
};

export type WeightEntryProps = {
  packageTypes?: WeightEntryPackageTypeOption[];
  selectedPackageTypeId?: string;
  onPackageTypeChange?: (packageTypeId: string) => void;
  /** When true, the parent owns package-type selection outside this component. */
  hidePackageTypeSelect?: boolean;
  rows?: WeightEntryRowState[];
  onRowsChange?: (rows: WeightEntryRowState[]) => void;
  onValidated?: (summary: PackageWeightSummary) => void;
  validateLabel?: string;
  showValidateButton?: boolean;
  disabled?: boolean;
};

function newRowKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createWeightEntryRow(weightText = ""): WeightEntryRowState {
  return { rowKey: newRowKey(), weightText };
}

function countCompletedRows(rows: readonly PackageWeightDraftRow[]): number {
  return rows.filter((row) => {
    const result = summarizePackageWeightEntry({ rows: [row] });
    return result.status === "complete";
  }).length;
}

export function WeightEntry({
  packageTypes = [],
  selectedPackageTypeId = "",
  onPackageTypeChange,
  hidePackageTypeSelect = false,
  rows: controlledRows,
  onRowsChange,
  onValidated,
  validateLabel = "Validate entry",
  showValidateButton = true,
  disabled = false,
}: WeightEntryProps) {
  const baseId = useId();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [uncontrolledRows, setUncontrolledRows] = useState<WeightEntryRowState[]>([
    createWeightEntryRow(),
  ]);
  const [composingIndex, setComposingIndex] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  const isControlled = controlledRows !== undefined;
  const rows = isControlled ? controlledRows : uncontrolledRows;

  function setRows(
    next: WeightEntryRowState[] | ((current: WeightEntryRowState[]) => WeightEntryRowState[]),
  ) {
    const resolved = typeof next === "function" ? next(rows) : next;
    if (isControlled) {
      onRowsChange?.(resolved);
    } else {
      setUncontrolledRows(resolved);
      onRowsChange?.(resolved);
    }
  }

  const draftRows: PackageWeightDraftRow[] = rows.map((row) => ({
    rowKey: row.rowKey,
    weightText: row.weightText,
    packageTypeId: selectedPackageTypeId || undefined,
  }));
  const summary = summarizePackageWeightEntry({ rows: draftRows });
  const completedCount = countCompletedRows(draftRows);
  const previewTotal = weightHundredthsToMajorDecimalString(summary.grossWeightHundredths);

  function focusRow(index: number) {
    queueMicrotask(() => {
      const el = inputRefs.current[index];
      el?.focus();
      el?.select();
    });
  }

  function updateWeight(index: number, value: string) {
    setCompletionMessage(null);
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, weightText: value } : row)),
    );
    setRowErrors((current) => {
      const next = { ...current };
      const key = rows[index]?.rowKey;
      if (key) {
        delete next[key];
      }
      return next;
    });
  }

  function addRow(afterIndex?: number) {
    if (disabled) {
      return;
    }
    setCompletionMessage(null);
    const insertAt = (afterIndex ?? rows.length - 1) + 1;
    setRows((current) => {
      const next = createWeightEntryRow();
      if (afterIndex === undefined) {
        return [...current, next];
      }
      const copy = [...current];
      copy.splice(afterIndex + 1, 0, next);
      return copy;
    });
    focusRow(insertAt);
  }

  function removeRow(index: number) {
    if (disabled) {
      return;
    }
    setCompletionMessage(null);
    setRows((current) => {
      if (current.length <= 1) {
        return [createWeightEntryRow()];
      }
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
    focusRow(Math.max(0, index - 1));
  }

  function handleEnter(index: number) {
    if (disabled || composingIndex === index) {
      return;
    }
    const row = rows[index];
    if (!row) {
      return;
    }
    const single = summarizePackageWeightEntry({
      rows: [
        {
          rowKey: row.rowKey,
          weightText: row.weightText,
          packageTypeId: selectedPackageTypeId || undefined,
        },
      ],
    });
    if (single.status !== "complete") {
      setRowErrors((current) => ({
        ...current,
        [row.rowKey]: single.errors[0] ?? "Enter a valid weight",
      }));
      focusRow(index);
      return;
    }
    setRowErrors((current) => {
      const next = { ...current };
      delete next[row.rowKey];
      return next;
    });
    if (index >= rows.length - 1) {
      addRow(index);
    } else {
      focusRow(index + 1);
    }
  }

  function handleValidate() {
    if (summary.status !== "complete") {
      setCompletionMessage(
        summary.errors[0] ?? "Finish every package weight before validating the entry.",
      );
      return;
    }
    setCompletionMessage(
      `Validated ${summary.packageCount} packages · ${weightHundredthsToMajorDecimalString(summary.grossWeightHundredths)} kg`,
    );
    onValidated?.(summary);
  }

  return (
    <div className="space-y-3">
      {!hidePackageTypeSelect ? (
        <div className="space-y-1">
          <Label htmlFor={`${baseId}-package-type`}>Package type</Label>
          <select
            id={`${baseId}-package-type`}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={selectedPackageTypeId}
            disabled={disabled}
            onChange={(event) => {
              setCompletionMessage(null);
              onPackageTypeChange?.(event.target.value);
            }}
          >
            <option value="">Select package type</option>
            {packageTypes.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.shortCode} — {pkg.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.rowKey} className="flex items-start gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`${baseId}-w-${row.rowKey}`}>Package {index + 1} weight (kg)</Label>
              <Input
                id={`${baseId}-w-${row.rowKey}`}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                inputMode="decimal"
                value={row.weightText}
                disabled={disabled}
                aria-invalid={Boolean(rowErrors[row.rowKey])}
                onChange={(event) => updateWeight(index, event.target.value)}
                onCompositionStart={() => setComposingIndex(index)}
                onCompositionEnd={() => setComposingIndex(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleEnter(index);
                  }
                }}
              />
              {rowErrors[row.rowKey] ? (
                <p className="text-xs text-destructive">{rowErrors[row.rowKey]}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-6"
              disabled={disabled}
              aria-label={`Remove package ${index + 1}`}
              onClick={() => removeRow(index)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => addRow()}>
          Add package
        </Button>
        {showValidateButton ? (
          <Button
            type="button"
            onClick={handleValidate}
            disabled={disabled || summary.status !== "complete"}
          >
            {validateLabel}
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <p>
          Packages (completed rows): <strong>{completedCount}</strong>
        </p>
        <p>
          Preview gross total: <strong>{previewTotal} kg</strong>
          {summary.status !== "complete" ? " (incomplete until all rows validate)" : ""}
        </p>
        {summary.errors.length > 0 ? (
          <ul className="mt-1 list-disc pl-5 text-destructive">
            {summary.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {completionMessage ? (
          <p className="mt-2 text-muted-foreground">{completionMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
