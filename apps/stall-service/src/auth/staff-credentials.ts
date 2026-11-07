import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Versioned staff credential verifier format (ADR 0011). */
export const STAFF_VERIFIER_FORMAT = "scrypt$v1" as const;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

const VERIFIER_RE = /^scrypt\$v1\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

/**
 * Create a salted adaptive verifier. Never log or return the plaintext secret.
 * Encoding: scrypt$v1$N$r$p$saltB64url$keyB64url
 */
export function hashStaffSecret(secret: string): string {
  if (secret.length < 4) {
    throw new Error("Staff secret is too short.");
  }
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(secret, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    STAFF_VERIFIER_FORMAT,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export function verifyStaffSecret(secret: string, storedVerifier: string): boolean {
  const match = VERIFIER_RE.exec(storedVerifier);
  if (!match) {
    return false;
  }
  const N = Number(match[1]);
  const R = Number(match[2]);
  const P = Number(match[3]);
  const salt = Buffer.from(match[4]!, "base64url");
  const expected = Buffer.from(match[5]!, "base64url");
  if (![N, R, P].every((v) => Number.isInteger(v) && v > 0) || salt.length === 0) {
    return false;
  }
  try {
    const actual = scryptSync(secret, salt, expected.length, {
      N,
      r: R,
      p: P,
      maxmem: 64 * 1024 * 1024,
    });
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Digest for high-entropy session secrets (lookup + compare). Not for low-entropy passwords. */
export function hashSessionSecret(sessionSecret: string): string {
  return createHash("sha256").update(sessionSecret, "utf8").digest("hex");
}

export function verifySessionSecret(sessionSecret: string, storedVerifier: string): boolean {
  const actual = Buffer.from(hashSessionSecret(sessionSecret), "utf8");
  const expected = Buffer.from(storedVerifier, "utf8");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function generateSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}
