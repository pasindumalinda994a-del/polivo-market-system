import { describe, expect, it } from "vitest";

import { mapTenantRpcError, summarizeRpcErrorForLog } from "./rpc-errors";

describe("mapTenantRpcError", () => {
  it("maps domain exception tokens", () => {
    expect(mapTenantRpcError({ message: "IDEMPOTENCY_CONFLICT" }).code).toBe("CONFLICT");
    expect(mapTenantRpcError({ message: "LAST_OWNER" }).code).toBe("CONFLICT");
    expect(mapTenantRpcError({ message: "UNAUTHENTICATED" }).code).toBe("UNAUTHENTICATED");
  });

  it("maps missing schema or function failures to a clear service message", () => {
    const error = mapTenantRpcError({
      code: "PGRST202",
      message: "Could not find the function public.create_stall_with_owner in the schema cache",
    });
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.message).toMatch(/migrations are applied/i);
  });

  it("maps missing gen_random_uuid style failures", () => {
    const error = mapTenantRpcError({
      message: "function gen_random_uuid() does not exist",
    });
    expect(error.code).toBe("SERVICE_UNAVAILABLE");
    expect(error.message).toMatch(/migrations are applied/i);
  });

  it("maps JWT rejection hints", () => {
    const error = mapTenantRpcError({
      message: "JWSError JWSInvalidSignature",
    });
    expect(error.message).toMatch(/third-party auth/i);
  });

  it("maps EMAIL_NOT_VERIFIED to verify-email guidance", () => {
    const error = mapTenantRpcError({
      message: "EMAIL_NOT_VERIFIED",
    });
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toMatch(/must be verified/i);
  });

  it("maps INVALID_TOKEN before the broad INVALID_ branch", () => {
    const error = mapTenantRpcError({
      message: "INVALID_TOKEN",
    });
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toMatch(/invitation is not available/i);
  });
});

describe("summarizeRpcErrorForLog", () => {
  it("keeps safe PostgREST fields only", () => {
    expect(
      summarizeRpcErrorForLog({
        code: "PGRST202",
        message: "missing function",
        details: "create_stall_with_owner",
        hint: null,
        accessToken: "should-not-appear-as-token-field-in-output-keys-only",
      }),
    ).toEqual({
      name: "PostgrestError",
      code: "PGRST202",
      message: "missing function",
      details: "create_stall_with_owner",
      hint: undefined,
    });
  });
});
