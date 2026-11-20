"use client";

import { Button, Input, Label } from "@polivo/ui";

export type ReportFilterValues = {
  fromBusinessDate: string;
  toBusinessDate: string;
  asOfBusinessDate?: string;
};

export function ReportFilters({
  values,
  onChange,
  onApply,
  showAsOf = false,
}: {
  values: ReportFilterValues;
  onChange: (next: ReportFilterValues) => void;
  onApply: () => void;
  showAsOf?: boolean;
}) {
  return (
    <div className="mb-4 grid gap-3 rounded-lg border p-4 md:grid-cols-4">
      <div>
        <Label htmlFor="fromBusinessDate">From</Label>
        <Input
          id="fromBusinessDate"
          type="date"
          value={values.fromBusinessDate}
          onChange={(event) => onChange({ ...values, fromBusinessDate: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="toBusinessDate">To</Label>
        <Input
          id="toBusinessDate"
          type="date"
          value={values.toBusinessDate}
          onChange={(event) => onChange({ ...values, toBusinessDate: event.target.value })}
        />
      </div>
      {showAsOf ? (
        <div>
          <Label htmlFor="asOfBusinessDate">As of</Label>
          <Input
            id="asOfBusinessDate"
            type="date"
            value={values.asOfBusinessDate ?? ""}
            onChange={(event) => onChange({ ...values, asOfBusinessDate: event.target.value })}
          />
        </div>
      ) : null}
      <div className="flex items-end">
        <Button type="button" onClick={onApply}>
          Apply filters
        </Button>
      </div>
    </div>
  );
}

export function defaultRollingFilterWindow(): ReportFilterValues {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return {
    fromBusinessDate: start.toISOString().slice(0, 10),
    toBusinessDate: end.toISOString().slice(0, 10),
  };
}
