import { useState } from "react";
import type { EligibleObligationItemDto } from "@polivo/contracts";
import { Input } from "@polivo/ui";

import { formatRs, obligationKey, obligationKindLabel } from "./payment-format";

type ObligationAllocationTableProps = {
  idPrefix: string;
  obligations: EligibleObligationItemDto[];
  /** Selected rows keyed by obligation key; value is the typed major-unit amount. */
  amounts: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string | null>>;
  disabled?: boolean;
  onToggle: (item: EligibleObligationItemDto) => void;
  onAmountChange: (item: EligibleObligationItemDto, text: string) => void;
};

/**
 * Keyboard-friendly obligation list: Arrow keys move the row cursor, Space/Enter toggles the focused
 * row. Enter never commits anything.
 */
export function ObligationAllocationTable({
  idPrefix,
  obligations,
  amounts,
  errors,
  disabled = false,
  onToggle,
  onAmountChange,
}: ObligationAllocationTableProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const activeIndex = Math.min(focusIndex, Math.max(0, obligations.length - 1));

  return (
    <div
      className="overflow-auto rounded-md border"
      tabIndex={0}
      role="group"
      aria-label="Eligible obligations"
      onKeyDown={(event) => {
        const target = event.target;
        const isCheckbox = target instanceof HTMLInputElement && target.type === "checkbox";
        if (obligations.length === 0 || (target instanceof HTMLInputElement && !isCheckbox)) {
          return;
        }
        if (isCheckbox && event.key === " ") {
          // The native checkbox toggle handles Space.
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setFocusIndex(Math.min(obligations.length - 1, activeIndex + 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setFocusIndex(Math.max(0, activeIndex - 1));
        } else if ((event.key === " " || event.key === "Enter") && !disabled) {
          const row = obligations[activeIndex];
          if (row) {
            event.preventDefault();
            onToggle(row);
          }
        }
      }}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-2 py-1">Sel</th>
            <th className="px-2 py-1">Date</th>
            <th className="px-2 py-1">Obligation</th>
            <th className="px-2 py-1">Document</th>
            <th className="px-2 py-1">Effective</th>
            <th className="px-2 py-1">Allocated</th>
            <th className="px-2 py-1">Outstanding</th>
            <th className="px-2 py-1">Apply (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          {obligations.map((item, index) => {
            const key = obligationKey(item.obligationKind, item.targetId);
            const selected = amounts[key] !== undefined;
            const error = errors[key] ?? null;
            const inputId = `${idPrefix}-amount-${index}`;
            return (
              <tr
                key={key}
                className={`border-b align-top ${index === activeIndex ? "bg-accent/40" : ""} ${
                  selected ? "bg-primary/5" : ""
                }`}
              >
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled || item.remainingMinor <= 0}
                    onChange={() => onToggle(item)}
                    onFocus={() => setFocusIndex(index)}
                    aria-label={`Allocate to ${item.label}`}
                  />
                </td>
                <td className="px-2 py-1">{item.businessDate ?? "—"}</td>
                <td className="px-2 py-1">
                  <div>{item.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {obligationKindLabel(item.obligationKind)}
                  </div>
                </td>
                <td className="px-2 py-1">{item.documentNumber ?? "—"}</td>
                <td className="px-2 py-1">{formatRs(item.effectiveAmountMinor)}</td>
                <td className="px-2 py-1">{formatRs(item.activeAllocatedMinor)}</td>
                <td className="px-2 py-1 font-medium">{formatRs(item.remainingMinor)}</td>
                <td className="px-2 py-1">
                  {selected ? (
                    <div className="space-y-1">
                      <Input
                        id={inputId}
                        inputMode="decimal"
                        className="h-8 w-28"
                        value={amounts[key] ?? ""}
                        disabled={disabled}
                        aria-label={`Amount to apply to ${item.label}`}
                        aria-invalid={error !== null}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        onFocus={() => setFocusIndex(index)}
                        onChange={(event) => onAmountChange(item, event.target.value)}
                      />
                      {error ? (
                        <p id={`${inputId}-error`} className="text-xs text-destructive">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {obligations.length === 0 ? (
            <tr>
              <td className="px-2 py-4 text-muted-foreground" colSpan={8}>
                No open obligations. Any amount recorded will stay unapplied.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
