import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiErrorSchema, mapZodIssuesToValidationIssues, validationIssueSchema } from "./errors.js";
import { tenantIdSchema } from "./primitives.js";
import { paginationQuerySchema } from "./pagination.js";

describe("api errors and sanitization", () => {
  it("accepts a minimal api error", () => {
    expect(
      apiErrorSchema.safeParse({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields on strict command objects", () => {
    const strictCommand = z.strictObject({
      tenantId: tenantIdSchema,
    });

    expect(strictCommand.safeParse({ tenantId: "t1", unexpected: true }).success).toBe(false);
  });

  it("exposes only permitted public validation-issue fields", () => {
    const invalidLimit = paginationQuerySchema.safeParse({ limit: 0 });
    expect(invalidLimit.success).toBe(false);
    if (invalidLimit.success) {
      return;
    }

    const issues = mapZodIssuesToValidationIssues(invalidLimit.error.issues);
    expect(issues.length).toBeGreaterThan(0);

    for (const issue of issues) {
      expect(Object.keys(issue).sort()).toEqual(["code", "message", "path"]);
      expect(validationIssueSchema.safeParse(issue).success).toBe(true);
    }

    const serialized = JSON.stringify(issues);
    expect(serialized).not.toContain('"input"');
  });

  it("does not leak synthetic secrets, bodies, stacks, or raw Zod details", () => {
    const secretPassword = "synthetic-password-hunter2";
    const secretToken = "synthetic-token-abc123";
    const schema = z.strictObject({
      password: z.string().min(32),
      token: z.string().uuid(),
    });

    const rejectedBody = {
      password: secretPassword,
      token: secretToken,
      nested: { note: "should-not-appear" },
    };

    const result = schema.safeParse(rejectedBody);
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const issues = mapZodIssuesToValidationIssues(result.error.issues);
    const serialized = JSON.stringify(issues);

    expect(serialized).not.toContain(secretPassword);
    expect(serialized).not.toContain(secretToken);
    expect(serialized).not.toContain("should-not-appear");
    expect(serialized).not.toContain('"input"');
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toContain("node_modules");
    expect(serialized).not.toContain("ZodError");

    for (const issue of issues) {
      expect(issue).not.toHaveProperty("input");
      expect(issue).not.toHaveProperty("stack");
      expect(issue).not.toHaveProperty("issues");
      expect(issue).not.toHaveProperty("cause");
    }
  });
});
