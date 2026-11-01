import { mapZodIssuesToValidationIssues } from "@polivo/contracts";
import type { ZodType } from "zod";

import { validationError, type AppError } from "../errors/app-error.js";

export function parseWithSchema<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw validationError(`Invalid ${label}.`, mapZodIssuesToValidationIssues(parsed.error.issues));
  }
  return parsed.data;
}

export function tryParseWithSchema<T>(
  schema: ZodType<T>,
  value: unknown,
  label: string,
): T | AppError {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return validationError(
      `Invalid ${label}.`,
      mapZodIssuesToValidationIssues(parsed.error.issues),
    );
  }
  return parsed.data;
}
