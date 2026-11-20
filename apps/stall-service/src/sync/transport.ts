import {
  SYNC_INGEST_MAX_REQUEST_BYTES,
  syncIngestResponseSchema,
  type SyncIngestResponse,
} from "@polivo/contracts";

import type { SignedIngestRequest } from "./signer.js";

export type SyncTransportResult =
  | { kind: "ack"; status: number; body: SyncIngestResponse }
  | { kind: "http_error"; status: number; retryable: boolean; errorCode: string; message: string }
  | { kind: "transport_error"; retryable: boolean; errorCode: string; message: string }
  | { kind: "malformed_response"; status: number; errorCode: string; message: string };

export type SyncTransport = {
  upload: (signed: SignedIngestRequest) => Promise<SyncTransportResult>;
};

export type CreateHttpSyncTransportInput = {
  ingestUrl: string;
  /** When true, allow http:// for local development only. */
  allowInsecureHttp: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export function createHttpSyncTransport(input: CreateHttpSyncTransportInput): SyncTransport {
  const url = new URL(input.ingestUrl);
  if (url.protocol === "http:") {
    if (!input.allowInsecureHttp) {
      throw new Error("POLIVO_SYNC_INGEST_URL must use HTTPS in non-development configurations.");
    }
  } else if (url.protocol !== "https:") {
    throw new Error("POLIVO_SYNC_INGEST_URL must be an http(s) URL.");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;

  return {
    upload: async (signed) => {
      if (Buffer.byteLength(signed.rawBody, "utf8") > SYNC_INGEST_MAX_REQUEST_BYTES) {
        return {
          kind: "http_error",
          status: 0,
          retryable: false,
          errorCode: "OVERSIZED_REQUEST",
          message: "Encoded ingest request exceeds the maximum size.",
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: signed.headers,
          body: signed.rawBody,
          signal: controller.signal,
          redirect: "error",
        });

        const text = await response.text();
        if (Buffer.byteLength(text, "utf8") > SYNC_INGEST_MAX_REQUEST_BYTES) {
          return {
            kind: "malformed_response",
            status: response.status,
            errorCode: "RESPONSE_TOO_LARGE",
            message: "Ingest response exceeded the bounded parse size.",
          };
        }

        let json: unknown;
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          return {
            kind: "malformed_response",
            status: response.status,
            errorCode: "MALFORMED_RESPONSE",
            message: "Ingest response was not valid JSON.",
          };
        }

        if (response.status >= 500 || response.status === 429) {
          return {
            kind: "http_error",
            status: response.status,
            retryable: true,
            errorCode: response.status === 429 ? "RATE_LIMITED" : "SERVER_ERROR",
            message: `Transient HTTP ${response.status} from ingest endpoint.`,
          };
        }

        if (response.status === 401 || response.status === 403) {
          return {
            kind: "http_error",
            status: response.status,
            retryable: false,
            errorCode: "AUTHORIZATION_FAILURE",
            message: "Ingest authentication or authorization failed.",
          };
        }

        const parsed = syncIngestResponseSchema.safeParse(json);
        if (!parsed.success) {
          if (response.ok) {
            return {
              kind: "malformed_response",
              status: response.status,
              errorCode: "MALFORMED_ACK",
              message: "Ingest acknowledgement did not match the expected contract.",
            };
          }
          const errObj = json as { code?: string; message?: string };
          return {
            kind: "http_error",
            status: response.status,
            retryable: response.status >= 500,
            errorCode: errObj.code ?? `HTTP_${response.status}`,
            message: errObj.message ?? `Ingest request failed with HTTP ${response.status}.`,
          };
        }

        return { kind: "ack", status: response.status, body: parsed.data };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
          kind: "transport_error",
          retryable: true,
          errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
          message: aborted ? "Ingest request timed out." : message,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
