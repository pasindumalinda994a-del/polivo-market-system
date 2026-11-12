/**
 * Classify completed finalize API failures so recovery metadata is only kept
 * when the outcome may still be committing (timeout / in-use key).
 */

export type FinalizeFailureKind = "ambiguous" | "definite_conflict" | "definite_other";

export function classifyFinalizeFailure(input: {
  conflict?: boolean;
  code: string;
  message: string;
}): FinalizeFailureKind {
  const haystack = `${input.code} ${input.message}`.toLowerCase();

  if (/timeout|network|unreachable|fetch|service_unavailable/i.test(haystack)) {
    return "ambiguous";
  }

  if (/idempotency key is already in use|already in use/i.test(haystack)) {
    return "ambiguous";
  }

  // Completed HTTP conflict with a known pre-commit rejection — safe to clear recovery.
  if (input.conflict || /conflict/i.test(input.code)) {
    if (/already finalized|already been finalized/i.test(haystack)) {
      return "ambiguous";
    }
    return "definite_conflict";
  }

  return "definite_other";
}

/** True when UI should poll lookupFinalization instead of treating the error as final. */
export function shouldResolveFinalizeOutcome(kind: FinalizeFailureKind): boolean {
  return kind === "ambiguous";
}
