import { describe, expect, it } from "vitest";

import { createUserSupabaseClient } from "./client.js";
import { CloudConfigError } from "./config.js";

describe("createUserSupabaseClient", () => {
  it("creates a client with explicit config and access token provider", () => {
    const client = createUserSupabaseClient({
      config: {
        supabaseUrl: "http://127.0.0.1:54321",
        supabasePublishableKey: "publishable-test-key",
      },
      accessToken: () => "test-token",
    });
    expect(client).toBeDefined();
  });

  it("rejects missing access token provider", () => {
    expect(() =>
      createUserSupabaseClient({
        config: {
          supabaseUrl: "http://127.0.0.1:54321",
          supabasePublishableKey: "publishable-test-key",
        },
        accessToken: undefined as unknown as () => string,
      }),
    ).toThrow(CloudConfigError);
  });
});
