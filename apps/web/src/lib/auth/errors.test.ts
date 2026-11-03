import { describe, expect, it } from "vitest";

import {
  httpStatusForError,
  redactForLog,
  serviceUnavailableError,
  toPublicApiError,
  unauthenticatedError,
} from "./errors";

describe("auth errors", () => {
  it("maps authentication failure to HTTP 401", () => {
    const error = unauthenticatedError();
    expect(httpStatusForError(error)).toBe(401);
    expect(toPublicApiError(error)).toEqual({
      code: "UNAUTHENTICATED",
      message: "Authentication required.",
    });
  });

  it("maps upstream outages to HTTP 503", () => {
    const error = serviceUnavailableError();
    expect(httpStatusForError(error)).toBe(503);
    expect(toPublicApiError(error).code).toBe("SERVICE_UNAVAILABLE");
  });

  it("redacts token-like values for logs", () => {
    expect(
      redactForLog({
        authorization: "Bearer abc.def.ghi",
        nested: { accessToken: "secret-value" },
        ok: "visible",
      }),
    ).toEqual({
      authorization: "[redacted]",
      nested: { accessToken: "[redacted]" },
      ok: "visible",
    });
  });
});
