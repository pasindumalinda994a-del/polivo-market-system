import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeightEntry, createWeightEntryRow } from "./WeightEntry";

afterEach(() => {
  cleanup();
});

describe("WeightEntry controlled mode", () => {
  it("adds, corrects, and removes weights with the verification example", async () => {
    const user = userEvent.setup();
    let rows = [
      createWeightEntryRow("32.00"),
      createWeightEntryRow("28.50"),
      createWeightEntryRow("19.25"),
      createWeightEntryRow(""),
    ];
    const onRowsChange = vi.fn((next) => {
      rows = next;
      rerender(
        <WeightEntry
          hidePackageTypeSelect
          selectedPackageTypeId="pkg-1"
          rows={rows}
          onRowsChange={onRowsChange}
          showValidateButton={false}
        />,
      );
    });

    const { rerender } = render(
      <WeightEntry
        hidePackageTypeSelect
        selectedPackageTypeId="pkg-1"
        rows={rows}
        onRowsChange={onRowsChange}
        showValidateButton={false}
      />,
    );

    expect(screen.getByText(/79\.75 kg/)).toBeInTheDocument();

    const second = screen.getByLabelText("Package 2 weight (kg)");
    await user.clear(second);
    await user.type(second, "30.00");
    expect(screen.getByText(/81\.25 kg/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove package 3" }));
    expect(screen.getByText(/62\.00 kg/)).toBeInTheDocument();
  });

  it("does not advance on Enter during IME composition", async () => {
    const onRowsChange = vi.fn();
    render(
      <WeightEntry
        hidePackageTypeSelect
        selectedPackageTypeId="pkg-1"
        rows={[createWeightEntryRow("10.00")]}
        onRowsChange={onRowsChange}
        showValidateButton={false}
      />,
    );
    const input = screen.getByLabelText("Package 1 weight (kg)");
    fireEvent.compositionStart(input);
    await waitFor(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onRowsChange).not.toHaveBeenCalled();
  });
});
