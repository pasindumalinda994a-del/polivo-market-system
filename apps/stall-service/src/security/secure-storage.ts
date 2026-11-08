import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { platform } from "node:os";

export type SecureStorageAdapter = {
  readonly kind: "windows-dpapi" | "simulated-file" | "memory";
  setSecret: (credentialRef: string, secret: string) => void;
  getSecret: (credentialRef: string) => string | null;
  deleteSecret: (credentialRef: string) => void;
};

export class SecureStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecureStorageError";
  }
}

/** In-memory adapter for unit tests only. */
export function createMemorySecureStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();
  return {
    kind: "memory",
    setSecret(credentialRef, secret) {
      store.set(credentialRef, secret);
    },
    getSecret(credentialRef) {
      return store.get(credentialRef) ?? null;
    },
    deleteSecret(credentialRef) {
      store.delete(credentialRef);
    },
  };
}

/**
 * Development/test file adapter. Not for production host credentials.
 * Stores opaque ciphertext-looking payloads; clearly labeled simulated.
 */
export function createSimulatedFileSecureStorage(directory: string): SecureStorageAdapter {
  mkdirSync(directory, { recursive: true });
  return {
    kind: "simulated-file",
    setSecret(credentialRef, secret) {
      const path = join(directory, `${sanitizeRef(credentialRef)}.sim`);
      writeFileSync(path, Buffer.from(secret, "utf8").toString("base64"), { encoding: "utf8" });
    },
    getSecret(credentialRef) {
      const path = join(directory, `${sanitizeRef(credentialRef)}.sim`);
      if (!existsSync(path)) {
        return null;
      }
      return Buffer.from(readFileSync(path, "utf8"), "base64").toString("utf8");
    },
    deleteSecret(credentialRef) {
      const path = join(directory, `${sanitizeRef(credentialRef)}.sim`);
      if (existsSync(path)) {
        writeFileSync(path, "", { encoding: "utf8" });
      }
    },
  };
}

function powershellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Windows DPAPI (CurrentUser) via PowerShell ProtectedData.
 * Must run as the same Windows account that will run the stall service.
 * Secrets are passed on stdin — never embedded in `-Command` argv.
 */
export function createWindowsDpapiSecureStorage(directory: string): SecureStorageAdapter {
  if (platform() !== "win32") {
    throw new SecureStorageError("Windows DPAPI secure storage requires win32.");
  }
  mkdirSync(directory, { recursive: true });

  return {
    kind: "windows-dpapi",
    setSecret(credentialRef, secret) {
      const path = join(directory, `${sanitizeRef(credentialRef)}.dpapi`);
      mkdirSync(dirname(path), { recursive: true });
      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$plainText = [Console]::In.ReadToEnd()
$plain = [Text.Encoding]::UTF8.GetBytes($plainText)
$protected = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes(${powershellSingleQuote(path)}, $protected)
`;
      runPowerShell(script, secret);
    },
    getSecret(credentialRef) {
      const path = join(directory, `${sanitizeRef(credentialRef)}.dpapi`);
      if (!existsSync(path)) {
        return null;
      }
      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$protected = [IO.File]::ReadAllBytes(${powershellSingleQuote(path)})
$plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Text.Encoding]::UTF8.GetString($plain)
`;
      return runPowerShell(script).trimEnd();
    },
    deleteSecret(credentialRef) {
      const path = join(directory, `${sanitizeRef(credentialRef)}.dpapi`);
      if (existsSync(path)) {
        writeFileSync(path, Buffer.alloc(0));
      }
    },
  };
}

export function createDefaultHostSecureStorage(directory: string): SecureStorageAdapter {
  if (platform() === "win32" && process.env.POLIVO_SECURE_STORAGE !== "simulated") {
    return createWindowsDpapiSecureStorage(directory);
  }
  return createSimulatedFileSecureStorage(directory);
}

function sanitizeRef(credentialRef: string): string {
  const cleaned = credentialRef.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (cleaned.length < 1 || cleaned.length > 128) {
    throw new SecureStorageError("Invalid credential_ref for secure storage.");
  }
  return cleaned;
}

function runPowerShell(script: string, stdinInput?: string): string {
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
      input: stdinInput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SecureStorageError(`Windows DPAPI secure storage failed: ${message}`);
  }
}
