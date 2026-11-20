import {
  CONFIG_SYNC_MAX_REQUEST_BYTES,
  CONFIG_SYNC_MAX_RESPONSE_BYTES,
  configAckResponseSchema,
  configPullResponseSchema,
  type ConfigAckResponse,
  type ConfigPullResponse,
} from "@polivo/contracts";

import type { SignedConfigRequest } from "./signer.js";

export type ConfigTransportResult<T> =
  | { kind: "ok"; status: number; body: T }
  | { kind: "http_error"; status: number; retryable: boolean; errorCode: string; message: string }
  | { kind: "transport_error"; retryable: boolean; errorCode: string; message: string }
  | { kind: "malformed_response"; status: number; errorCode: string; message: string };

export type ConfigTransport = {
  pull: (signed: SignedConfigRequest) => Promise<ConfigTransportResult<ConfigPullResponse>>;
  ack: (signed: SignedConfigRequest) => Promise<ConfigTransportResult<ConfigAckResponse>>;
};

export type CreateHttpConfigTransportInput = {
  pullUrl: string;
  ackUrl: string;
  allowInsecureHttp: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function assertHttpUrl(urlText: string, allowInsecureHttp: boolean, label: string): URL {
  const url = new URL(urlText);
  if (url.protocol === "http:") {
    if (!allowInsecureHttp) {
      throw new Error(`${label} must use HTTPS in non-development configurations.`);
    }
  } else if (url.protocol !== "https:") {
    throw new Error(`${label} must be an http(s) URL.`);
  }
  return url;
}

async function postJson<T>(input: {
  url: URL;
  signed: SignedConfigRequest;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  parse: (json: unknown) => T;
}): Promise<ConfigTransportResult<T>> {
  if (Buffer.byteLength(input.signed.rawBody, "utf8") > CONFIG_SYNC_MAX_REQUEST_BYTES) {
    return {
      kind: "http_error",
      status: 0,
      retryable: false,
      errorCode: "OVERSIZED_REQUEST",
      message: "Encoded config request exceeds the maximum size.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(input.url, {
      method: "POST",
      headers: input.signed.headers,
      body: input.signed.rawBody,
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > CONFIG_SYNC_MAX_RESPONSE_BYTES) {
      return {
        kind: "malformed_response",
        status: response.status,
        errorCode: "RESPONSE_TOO_LARGE",
        message: "Config response exceeded the bounded parse size.",
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
        message: "Config response was not valid JSON.",
      };
    }
    if (response.status >= 500 || response.status === 429) {
      return {
        kind: "http_error",
        status: response.status,
        retryable: true,
        errorCode: response.status === 429 ? "RATE_LIMITED" : "SERVER_ERROR",
        message: `Transient HTTP ${response.status} from config endpoint.`,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        kind: "http_error",
        status: response.status,
        retryable: false,
        errorCode: "UNAUTHORIZED",
        message: `Config endpoint returned HTTP ${response.status}.`,
      };
    }
    if (!response.ok) {
      return {
        kind: "http_error",
        status: response.status,
        retryable: false,
        errorCode: "HTTP_ERROR",
        message: `Config endpoint returned HTTP ${response.status}.`,
      };
    }
    try {
      return { kind: "ok", status: response.status, body: input.parse(json) };
    } catch (error) {
      return {
        kind: "malformed_response",
        status: response.status,
        errorCode: "SCHEMA_MISMATCH",
        message: error instanceof Error ? error.message : "Config response schema mismatch.",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      kind: "transport_error",
      retryable: true,
      errorCode: aborted ? "TIMEOUT" : "TRANSPORT_ERROR",
      message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpConfigTransport(input: CreateHttpConfigTransportInput): ConfigTransport {
  const pullUrl = assertHttpUrl(input.pullUrl, input.allowInsecureHttp, "POLIVO_CONFIG_PULL_URL");
  const ackUrl = assertHttpUrl(input.ackUrl, input.allowInsecureHttp, "POLIVO_CONFIG_ACK_URL");
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;

  return {
    pull: (signed) =>
      postJson({
        url: pullUrl,
        signed,
        timeoutMs,
        fetchImpl,
        parse: (json) => configPullResponseSchema.parse(json),
      }),
    ack: (signed) =>
      postJson({
        url: ackUrl,
        signed,
        timeoutMs,
        fetchImpl,
        parse: (json) => configAckResponseSchema.parse(json),
      }),
  };
}
