import {
  accountBalanceResponseSchema,
  accountMovementsResponseSchema,
  accountStatementResponseSchema,
  accountSummaryResponseSchema,
  correctOpeningResponseSchema,
  openingDraftRecordSchema,
  outstandingObligationsResponseSchema,
  postOpeningDraftResponseSchema,
  unappliedPaymentsResponseSchema,
  type AccountBalanceResponse,
  type AccountMovementsResponse,
  type AccountStatementResponse,
  type AccountSummaryResponse,
  type CorrectOpeningResponse,
  type OpeningDraftRecordDto,
  type OutstandingObligationsResponse,
  type PostOpeningDraftResponse,
  type PrepareOpeningDraftRequest,
  type UnappliedPaymentsResponse,
  type UpdateOpeningDraftRequest,
} from "@polivo/contracts";
import { randomUUID } from "node:crypto";

import {
  authenticatedHostRequest,
  getConnectionRequestGeneration,
  isStaffSignedIn,
  mapHostApiError,
} from "./connection.js";

export type AccountsApiError = {
  ok: false;
  code: string;
  message: string;
  conflict?: boolean;
};

export type AccountsApiSuccess<T> = {
  ok: true;
  data: T;
  stale?: boolean;
};

export type AccountsApiResult<T> = AccountsApiSuccess<T> | AccountsApiError;

function parseError(status: number, bodyText: string, fallback: string): AccountsApiError {
  let code = "INTERNAL_ERROR";
  try {
    const parsed = JSON.parse(bodyText) as { code?: string; message?: string };
    if (typeof parsed.code === "string") {
      code = parsed.code;
    }
  } catch {
    // ignore
  }
  return {
    ok: false,
    code,
    message: mapHostApiError(status, bodyText, fallback),
    conflict: status === 409 || code === "CONFLICT",
  };
}

function ensureIdempotencyKey(idempotencyKey?: string): string {
  return idempotencyKey && idempotencyKey.trim().length > 0 ? idempotencyKey : randomUUID();
}

export async function getAccountBalance(input: {
  partyKind: "farmer" | "trader";
  partyId: string;
}): Promise<AccountsApiResult<AccountBalanceResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/accounts/${input.partyKind}/${input.partyId}/balance`,
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: {
          stallId: "stale",
          partyKind: input.partyKind,
          partyId: input.partyId,
          currency: "LKR",
          balanceMinor: 0,
          displayAmountMinor: 0,
          directionLabel: "Settled",
          openingStatus: "not_opened",
          openingCutoffDate: null,
          asOfBusinessDate: null,
        },
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load account balance.");
    }
    return {
      ok: true,
      data: accountBalanceResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listAccountMovements(input: {
  partyKind: "farmer" | "trader";
  partyId: string;
  limit?: number;
  cursor?: string;
}): Promise<AccountsApiResult<AccountMovementsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/accounts/${input.partyKind}/${input.partyId}/movements`,
      query: {
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
      },
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: { precedingBalanceMinor: 0, items: [], nextCursor: null },
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load account movements.");
    }
    return {
      ok: true,
      data: accountMovementsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function prepareOpeningDraft(
  input: PrepareOpeningDraftRequest,
  idempotencyKey?: string,
): Promise<AccountsApiResult<OpeningDraftRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/openings/drafts",
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: openingDraftRecordSchema.parse({
          id: "stale",
          stallId: "stale",
          partyKind: input.partyKind,
          partyId: input.partyId,
          direction: input.direction,
          amountMinor: input.amountMinor,
          signedAmountMinor: null,
          cutoffDate: input.cutoffDate,
          currency: "LKR",
          reference: null,
          explanation: null,
          status: "draft",
          revision: 1,
          isZeroOpening: true,
          directionLabel: "Settled",
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          createdByStaffId: null,
          postedPostingId: null,
        }),
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to prepare opening draft.");
    }
    return {
      ok: true,
      data: openingDraftRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function updateOpeningDraft(
  draftId: string,
  input: UpdateOpeningDraftRequest,
  idempotencyKey?: string,
): Promise<AccountsApiResult<OpeningDraftRecordDto>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "PATCH",
      path: `/openings/drafts/${draftId}`,
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to update opening draft.");
    }
    return {
      ok: true,
      data: openingDraftRecordSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function postOpeningDraft(
  draftId: string,
  input: { expectedRevision: number },
  idempotencyKey?: string,
): Promise<AccountsApiResult<PostOpeningDraftResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: `/openings/drafts/${draftId}/post`,
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to post opening balance.");
    }
    return {
      ok: true,
      data: postOpeningDraftResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getAccountStatement(input: {
  partyKind: "farmer" | "trader";
  partyId: string;
  fromBusinessDate: string;
  toBusinessDate: string;
  limit?: number;
  cursor?: string;
  snapshotToken?: string;
  movementSearch?: string;
  sourceTypeFilter?: string;
}): Promise<AccountsApiResult<AccountStatementResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/accounts/${input.partyKind}/${input.partyId}/statement`,
      query: {
        fromBusinessDate: input.fromBusinessDate,
        toBusinessDate: input.toBusinessDate,
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
        snapshotToken: input.snapshotToken,
        movementSearch: input.movementSearch,
        sourceTypeFilter: input.sourceTypeFilter,
      },
    });
    if (response.requestGeneration !== generation) {
      return {
        ok: true,
        data: accountStatementResponseSchema.parse({
          viewModelVersion: "1",
          header: {
            stallId: "stale",
            tenantId: null,
            partyKind: input.partyKind,
            partyId: input.partyId,
            partyCode: "-",
            partyDisplayName: "-",
            accountRole: input.partyKind,
            currency: "LKR",
            fromBusinessDate: input.fromBusinessDate,
            toBusinessDate: input.toBusinessDate,
            dateBasis: "business_effective",
            openingStatus: "not_opened",
            generatedAt: new Date(0).toISOString(),
          },
          summary: {
            openingBalanceMinor: 0,
            openingDirectionLabel: "Settled",
            periodIncreaseMinor: 0,
            periodDecreaseMinor: 0,
            periodNetMinor: 0,
            closingBalanceMinor: 0,
            closingDirectionLabel: "Settled",
            movementCount: 0,
          },
          balanceBeforePageMinor: 0,
          items: [],
          nextCursor: null,
          snapshot: {
            snapshotToken: "stale",
            capturedAt: new Date(0).toISOString(),
            expiresAt: new Date(0).toISOString(),
            maxPostingSequence: 0,
            dateBasis: "business_effective",
            businessTimezone: "UTC",
          },
          rowFilterActive: false,
          rowFilterLabel: null,
        }),
        stale: true,
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load account statement.");
    }
    return {
      ok: true,
      data: accountStatementResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function getAccountSummary(input: {
  partyKind: "farmer" | "trader";
  partyId: string;
  asOfBusinessDate?: string;
  snapshotToken?: string;
}): Promise<AccountsApiResult<AccountSummaryResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/accounts/${input.partyKind}/${input.partyId}/summary`,
      query: {
        asOfBusinessDate: input.asOfBusinessDate,
        snapshotToken: input.snapshotToken,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: false, code: "STALE", message: "Stale response ignored." };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load account summary.");
    }
    return {
      ok: true,
      data: accountSummaryResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listOutstandingObligations(input: {
  partyKind: "farmer" | "trader";
  partyId: string;
  asOfBusinessDate?: string;
  historical?: boolean;
  snapshotToken?: string;
  limit?: number;
  cursor?: string;
}): Promise<AccountsApiResult<OutstandingObligationsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const path = input.historical
      ? `/accounts/${input.partyKind}/${input.partyId}/outstanding/historical`
      : `/accounts/${input.partyKind}/${input.partyId}/outstanding`;
    const response = await authenticatedHostRequest({
      method: "GET",
      path,
      query: {
        asOfBusinessDate: input.asOfBusinessDate,
        snapshotToken: input.snapshotToken,
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: false, code: "STALE", message: "Stale response ignored." };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(
        response.status,
        response.bodyText,
        "Unable to load outstanding obligations.",
      );
    }
    return {
      ok: true,
      data: outstandingObligationsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function listUnappliedPayments(input: {
  partyKind: "farmer" | "trader";
  partyId: string;
  asOfBusinessDate?: string;
  snapshotToken?: string;
  includePaymentMetadata?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<AccountsApiResult<UnappliedPaymentsResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  const generation = getConnectionRequestGeneration();
  try {
    const response = await authenticatedHostRequest({
      method: "GET",
      path: `/accounts/${input.partyKind}/${input.partyId}/unapplied-payments`,
      query: {
        asOfBusinessDate: input.asOfBusinessDate,
        snapshotToken: input.snapshotToken,
        includePaymentMetadata:
          input.includePaymentMetadata === undefined
            ? undefined
            : input.includePaymentMetadata
              ? "true"
              : "false",
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        cursor: input.cursor,
      },
    });
    if (response.requestGeneration !== generation) {
      return { ok: false, code: "STALE", message: "Stale response ignored." };
    }
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to load unapplied payments.");
    }
    return {
      ok: true,
      data: unappliedPaymentsResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}

export async function correctOpening(
  input: {
    partyKind: "farmer" | "trader";
    partyId: string;
    reason: string;
    replacement?: {
      direction:
        "stall_owes_farmer" | "farmer_owes_stall" | "buyer_owes_stall" | "stall_owes_buyer";
      amountMinor: number;
      cutoffDate?: string;
      reference?: string;
      explanation?: string;
    };
  },
  idempotencyKey?: string,
): Promise<AccountsApiResult<CorrectOpeningResponse>> {
  if (!isStaffSignedIn()) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Staff session required." };
  }
  try {
    const response = await authenticatedHostRequest({
      method: "POST",
      path: "/openings/correct",
      body: input,
      idempotencyKey: ensureIdempotencyKey(idempotencyKey),
    });
    if (response.status < 200 || response.status >= 300) {
      return parseError(response.status, response.bodyText, "Unable to correct opening balance.");
    }
    return {
      ok: true,
      data: correctOpeningResponseSchema.parse(JSON.parse(response.bodyText)),
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Stall host unavailable",
    };
  }
}
