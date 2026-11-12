import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReferenceCombobox, type ReferenceOption } from "./ReferenceCombobox";

afterEach(() => {
  cleanup();
});

describe("ReferenceCombobox", () => {
  it("supports keyboard selection and distinguishes unavailable from empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items: ReferenceOption[] = [
      { id: "1", shortCode: "B1", displayName: "Buyer One", active: true },
      { id: "2", shortCode: "B2", displayName: "Buyer Two", active: true },
    ];
    const search = vi.fn(async () => ({ ok: true as const, items }));

    render(<ReferenceCombobox label="Buyer" value={null} onChange={onChange} search={search} />);

    const input = screen.getByRole("combobox", { name: "Buyer" });
    await user.click(input);
    await user.type(input, "B");
    await waitFor(() => expect(search).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("option", { name: /B1/ })).toBeInTheDocument());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(items[1]);
  });

  it("does not present connection failure as no matches", async () => {
    const user = userEvent.setup();
    const search = vi.fn(async () => ({
      ok: false as const,
      code: "UNAVAILABLE",
      message: "Host unreachable",
    }));
    render(
      <ReferenceCombobox label="Farmer" value={null} onChange={() => undefined} search={search} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Farmer" }));
    await waitFor(() =>
      expect(screen.getByText(/Host unreachable|Service unavailable/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
  });
});
