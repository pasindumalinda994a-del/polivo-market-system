import { createHash, X509Certificate } from "node:crypto";
import https from "node:https";
import { URL } from "node:url";

export type PinnedHttpsResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  bodyText: string;
  certificateSha256: string;
};

export type PinnedHttpsOptions = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** When set, the peer certificate SHA-256 must match (lowercase hex). */
  expectedCertificateSha256?: string;
  /**
   * Allow a first loopback bootstrap without a pin (pairing only).
   * Observed fingerprint is still returned for verification against the trust bundle.
   */
  allowUnpinnedLoopback?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
};

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/**
 * HTTPS request with optional certificate pinning.
 * Rejects non-HTTPS URLs and does not follow redirects.
 */
export function pinnedHttpsRequest(options: PinnedHttpsOptions): Promise<PinnedHttpsResponse> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(options.url);
    } catch {
      reject(new Error("Host address is not a valid URL."));
      return;
    }

    if (url.protocol !== "https:") {
      reject(new Error("Protocol downgrade rejected. Desktop connections require HTTPS."));
      return;
    }

    if (options.expectedCertificateSha256 === undefined && !options.allowUnpinnedLoopback) {
      reject(new Error("Host identity could not be verified"));
      return;
    }

    if (
      options.expectedCertificateSha256 === undefined &&
      options.allowUnpinnedLoopback &&
      !isLoopbackHostname(url.hostname)
    ) {
      reject(new Error("Unpinned HTTPS is only allowed on loopback during pairing."));
      return;
    }

    const timeoutMs = options.timeoutMs ?? 10_000;
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          reject(new Error("Redirects to another origin are rejected."));
          return;
        }

        const socket = response.socket as
          | (typeof response.socket & {
              getPeerCertificate?: (detailed?: boolean) => { raw?: Buffer };
            })
          | null;
        const peer =
          socket && typeof socket.getPeerCertificate === "function"
            ? socket.getPeerCertificate(true)
            : null;
        if (!peer || !peer.raw) {
          response.resume();
          reject(new Error("Host identity could not be verified"));
          return;
        }

        const certificateSha256 = createHash("sha256").update(peer.raw).digest("hex");
        if (
          options.expectedCertificateSha256 !== undefined &&
          certificateSha256 !== options.expectedCertificateSha256
        ) {
          response.resume();
          reject(new Error("Host identity could not be verified"));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers as Record<string, string | string[] | undefined>,
            bodyText: Buffer.concat(chunks).toString("utf8"),
            certificateSha256,
          });
        });
      },
    );

    const onAbort = (): void => {
      request.destroy(new Error("Request cancelled."));
    };
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        reject(new Error("Request cancelled."));
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    request.on("timeout", () => {
      request.destroy(new Error("Stall host unavailable"));
    });
    request.on("error", (error) => {
      const message = error instanceof Error ? error.message : "Stall host unavailable";
      if (/cancelled/i.test(message)) {
        reject(error);
        return;
      }
      reject(new Error("Stall host unavailable"));
    });

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

export function sha256OfPemCertificate(certPem: string): string {
  const cert = new X509Certificate(certPem);
  return createHash("sha256").update(cert.raw).digest("hex");
}
