import { describe, expect, it, vi } from "vitest";

import { WebAuthError } from "./errors";
import { requireApiUser, requirePageUser } from "./require-user";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

describe("requireApiUser", () => {
  it("returns the opaque subject when authenticated", async () => {
    await expect(requireApiUser({ getUserId: async () => "user_abc" })).resolves.toEqual({
      subject: "user_abc",
    });
  });

  it("throws UNAUTHENTICATED when no session exists", async () => {
    await expect(requireApiUser({ getUserId: async () => null })).rejects.toBeInstanceOf(
      WebAuthError,
    );
    await expect(requireApiUser({ getUserId: async () => null })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("requirePageUser", () => {
  it("redirects unauthenticated page access to sign-in", async () => {
    await expect(requirePageUser("/dashboard", { getUserId: async () => null })).rejects.toThrow(
      "REDIRECT:/sign-in?redirect_url=%2Fdashboard",
    );
  });

  it("returns the subject for authenticated pages", async () => {
    await expect(
      requirePageUser("/dashboard", { getUserId: async () => "user_abc" }),
    ).resolves.toEqual({ subject: "user_abc" });
  });
});
