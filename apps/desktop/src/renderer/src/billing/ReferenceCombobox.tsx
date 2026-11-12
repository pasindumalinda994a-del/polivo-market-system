import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Input, Label } from "@polivo/ui";

export type ReferenceOption = {
  id: string;
  shortCode: string;
  displayName: string;
  active?: boolean;
};

export type ReferenceSearchResult =
  | { ok: true; items: ReferenceOption[]; stale?: boolean }
  | { ok: false; code: string; message: string };

type ReferenceComboboxProps = {
  id?: string;
  label: string;
  value: ReferenceOption | null;
  onChange: (value: ReferenceOption | null) => void;
  search: (query: string) => Promise<ReferenceSearchResult>;
  disabled?: boolean;
  placeholder?: string;
  /** Keep showing an inactive selection that is no longer searchable. */
  allowInactiveSelection?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
};

function formatOption(option: ReferenceOption): string {
  return `${option.shortCode} — ${option.displayName}`;
}

export function ReferenceCombobox({
  id: idProp,
  label,
  value,
  onChange,
  search,
  disabled = false,
  placeholder = "Short code or name",
  allowInactiveSelection = true,
  inputRef: externalInputRef,
}: ReferenceComboboxProps) {
  const reactId = useId();
  const fieldId = idProp ?? reactId;
  const listboxId = `${fieldId}-listbox`;
  const internalRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalInputRef ?? internalRef;
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<ReferenceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const displayValue = editing || !value ? query : formatOption(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!open || disabled) {
      return;
    }
    const searchText = value && !editing ? "" : debouncedQuery;
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && requestId === requestIdRef.current) {
        setSearching(true);
        setError(null);
        setUnavailable(false);
      }
    });
    void (async () => {
      const result = await search(searchText);
      if (cancelled || requestId !== requestIdRef.current) {
        return;
      }
      setSearching(false);
      if (!result || typeof result !== "object" || !("ok" in result)) {
        setUnavailable(true);
        setItems([]);
        setError("Search failed.");
        return;
      }
      if (!result.ok) {
        setUnavailable(true);
        setItems([]);
        setError(result.message);
        return;
      }
      if (result.stale) {
        return;
      }
      setItems(result.items);
      setHighlight(0);
      setUnavailable(false);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, disabled, search, value, editing]);

  function selectOption(option: ReferenceOption) {
    onChange(option);
    setQuery(formatOption(option));
    setEditing(false);
    setOpen(false);
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setEditing(true);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  const showInactiveWarning = allowInactiveSelection && value && value.active === false;

  return (
    <div className="relative space-y-1">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={fieldId}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[highlight] ? `${listboxId}-${highlight}` : undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          autoComplete="off"
          onChange={(event) => {
            setEditing(true);
            setQuery(event.target.value);
            setOpen(true);
            if (value) {
              onChange(null);
            }
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              if (value && !editing) {
                setEditing(true);
                setQuery("");
              }
            }
          }}
          onBlur={() => {
            // Allow option mousedown to win before closing.
            window.setTimeout(() => {
              setOpen(false);
              if (value) {
                setEditing(false);
                setQuery(formatOption(value));
              }
            }, 120);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlight((current) => Math.min(current + 1, Math.max(0, items.length - 1)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((current) => Math.max(0, current - 1));
              return;
            }
            if (event.key === "Enter" && open && items[highlight]) {
              event.preventDefault();
              selectOption(items[highlight]!);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="rounded-md border border-border px-2 text-sm"
            disabled={disabled}
            onClick={clearSelection}
          >
            Clear
          </button>
        ) : null}
      </div>
      {value ? (
        <p className="text-xs text-muted-foreground">
          Selected: {value.shortCode} — {value.displayName}
          {showInactiveWarning ? " (inactive — finalization may be blocked)" : ""}
        </p>
      ) : null}
      {open && !disabled ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-background shadow-md"
        >
          {searching ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
          ) : unavailable ? (
            <li className="px-3 py-2 text-sm text-destructive">
              {error ??
                "Service unavailable. Results are not empty — try again when the host is reachable."}
            </li>
          ) : items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.id}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  index === highlight ? "bg-bg-secondary" : ""
                }`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(item);
                }}
              >
                <span className="font-medium">{item.shortCode}</span>
                <span className="text-muted-foreground"> — {item.displayName}</span>
                {item.active === false ? (
                  <span className="ml-1 text-xs text-destructive">(inactive)</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
