import { createHash, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import selfsigned from "selfsigned";

export type TlsMaterial = {
  keyPem: string;
  certPem: string;
  /** Lowercase hex SHA-256 of the DER certificate. */
  certificateSha256: string;
  keyPath: string;
  certPath: string;
};

export function tlsMaterialDirectory(credentialRoot: string): string {
  return join(credentialRoot, "tls");
}

export function certificateSha256FromPem(certPem: string): string {
  const cert = new X509Certificate(certPem);
  return createHash("sha256").update(cert.raw).digest("hex");
}

/**
 * Load existing host TLS material or generate a self-signed certificate.
 * Material lives under the service-account credential root (never in SQLite).
 */
export function loadOrCreateTlsMaterial(credentialRoot: string): TlsMaterial {
  const dir = tlsMaterialDirectory(credentialRoot);
  mkdirSync(dir, { recursive: true });
  const keyPath = join(dir, "server-key.pem");
  const certPath = join(dir, "server-cert.pem");

  if (existsSync(keyPath) && existsSync(certPath)) {
    const keyPem = readFileSync(keyPath, "utf8");
    const certPem = readFileSync(certPath, "utf8");
    return {
      keyPem,
      certPem,
      certificateSha256: certificateSha256FromPem(certPem),
      keyPath,
      certPath,
    };
  }

  const attrs = [{ name: "commonName", value: "polivo-stall-service" }];
  // selfsigned 2.x is synchronous (pinned for startup without async composition).
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [
      {
        name: "basicConstraints",
        cA: false,
      },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: "extKeyUsage",
        serverAuth: true,
      },
    ],
  });

  const keyPem = pems.private;
  const certPem = pems.cert;
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, keyPem, { encoding: "utf8", mode: 0o600 });
  writeFileSync(certPath, certPem, { encoding: "utf8", mode: 0o644 });

  return {
    keyPem,
    certPem,
    certificateSha256: certificateSha256FromPem(certPem),
    keyPath,
    certPath,
  };
}

export function loadTlsMaterialFromPaths(keyPath: string, certPath: string): TlsMaterial {
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    throw new Error(
      `TLS material is missing. Expected key at ${keyPath} and certificate at ${certPath}.`,
    );
  }
  const keyPem = readFileSync(keyPath, "utf8");
  const certPem = readFileSync(certPath, "utf8");
  return {
    keyPem,
    certPem,
    certificateSha256: certificateSha256FromPem(certPem),
    keyPath,
    certPath,
  };
}
