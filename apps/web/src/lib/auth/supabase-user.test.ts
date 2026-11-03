import { describe, expect, it, vi } from "vitest";

vi.mock("@polivo/db-cloud", () => ({
  createUserSupabaseClient: ({ accessToken }: { accessToken: () => Promise<string | null> }) => {
    return {
      kind: "user-context",
      accessToken,
    };
  },
}));

import { createRequestUserSupabaseClient } from "./supabase-user";

describe("createRequestUserSupabaseClient", () => {
  it("creates a user-context client with the supplied token provider", async () => {
    const client = createRequestUserSupabaseClient({
      accessToken: async () => "clerk-session-token",
    }) as unknown as {
      kind: string;
      accessToken: () => Promise<string | null>;
    };

    expect(client.kind).toBe("user-context");
    await expect(client.accessToken()).resolves.toBe("clerk-session-token");
  });

  it("does not introduce a privileged-client fallback path", () => {
    const source = createRequestUserSupabaseClient.toString();
    expect(source).not.toMatch(/SUPABASE_SECRET_KEY|service[_-]?role|createService/i);
  });
});
