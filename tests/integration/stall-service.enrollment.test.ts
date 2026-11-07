import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLocalInstallation,
  initializeNewDatabase,
  tryGetHostEnrollment,
  tryGetStallBinding,
  type LocalDatabase,
} from "@polivo/db-local";

import {
  generateDeviceKeyPair,
  signPossessionMessage,
} from "../../apps/stall-service/src/security/ed25519.js";
import { createMemorySecureStorage } from "../../apps/stall-service/src/security/secure-storage.js";
import { acceptTerminalPairing } from "../../apps/stall-service/src/enrollment/accept-terminal.js";
import { activateHostWithDatabase } from "../../apps/stall-service/src/enrollment/activate-host.js";

const tempRoots: string[] = [];
const openLocals: LocalDatabase[] = [];

function track(local: LocalDatabase): LocalDatabase {
  openLocals.push(local);
  return local;
}

afterEach(() => {
  while (openLocals.length > 0) {
    try {
      openLocals.pop()?.close();
    } catch {
      // ignore
    }
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("stall-service enrollment", () => {
  it("activates host with mocked cloud and resumes offline binding", async () => {
    const root = mkdtempSync(join(tmpdir(), "polivo-activate-"));
    tempRoots.push(root);
    const dbPath = join(root, "stall.sqlite");
    const local = track(initializeNewDatabase(dbPath));
    const installation = getLocalInstallation(local);
    const storage = createMemorySecureStorage();

    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
      if (href.includes("/redeem")) {
        expect(body.installationId).toBe(installation.id);
        expect(body.enrollmentSecret).toBe("s".repeat(43));
        return new Response(
          JSON.stringify({
            tenantId: "ten_test",
            deviceId: "dev_host_1",
            role: "host",
            intendedHostDeviceId: null,
            label: "Host",
            credentialVersion: 1,
            stateRevision: 2,
            enrollmentState: "redeemed",
            stallDisplayName: "Test Stall",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (href.includes("/confirm")) {
        return new Response(JSON.stringify({ enrollmentState: "activated", stateRevision: 3 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected" } }), { status: 500 });
    }) as unknown as typeof fetch;

    const result = await activateHostWithDatabase(local, {
      enrollmentBaseUrl: "http://localhost:3000",
      deploymentEnvironment: "development",
      enrollmentSecret: "s".repeat(43),
      secureStorage: storage,
      secureStorageDirectory: root,
      fetchImpl,
    });

    expect(result.activationState).toBe("activated");
    expect(tryGetStallBinding(local)?.tenantId).toBe("ten_test");
    expect(tryGetHostEnrollment(local)?.hostDeviceId).toBe("dev_host_1");
    expect(storage.getSecret(tryGetHostEnrollment(local)!.credentialRef)).toBeTruthy();

    const resumed = await activateHostWithDatabase(local, {
      enrollmentBaseUrl: "http://localhost:3000",
      deploymentEnvironment: "development",
      enrollmentSecret: "s".repeat(43),
      secureStorage: storage,
      secureStorageDirectory: root,
      fetchImpl,
    });
    expect(resumed.resumed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects terminal pairing intended for another host", () => {
    const root = mkdtempSync(join(tmpdir(), "polivo-pair-"));
    tempRoots.push(root);
    const local = track(initializeNewDatabase(join(root, "stall.sqlite")));
    const installation = getLocalInstallation(local);
    const keys = generateDeviceKeyPair();

    local.db
      .prepare(
        `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at) VALUES (1, 'ten_a', 'ten_a', ?)`,
      )
      .run("2026-11-03T00:00:00.000Z");
    local.db
      .prepare(
        `INSERT INTO host_enrollment (
           id, host_device_id, installation_id, credential_ref, credential_version,
           activation_state, cloud_device_id, cloud_state_revision, activated_at, updated_at
         ) VALUES (1, 'dev_host_a', ?, 'ref', 1, 'activated', 'dev_host_a', 1, ?, ?)`,
      )
      .run(installation.id, "2026-11-03T00:00:00.000Z", "2026-11-03T00:00:00.000Z");

    const artifact = JSON.stringify({
      hostDeviceId: "dev_host_b",
      terminalDeviceId: "dev_term_1",
      publicKey: keys.publicKey,
      credentialVersion: 1,
      cloudStateRevision: 1,
    });
    const signature = signPossessionMessage(keys.privateKeyPkcs8, artifact);

    expect(() =>
      acceptTerminalPairing(
        local,
        {
          terminalDeviceId: "dev_term_1",
          publicKey: keys.publicKey,
          credentialVersion: 1,
          cloudStateRevision: 1,
          pairingArtifact: artifact,
          pairingSignature: signature,
        },
        "2026-11-03T00:01:00.000Z",
      ),
    ).toThrow(/different host/i);
  });

  it("accepts a correctly host-bound terminal pairing artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "polivo-pair-ok-"));
    tempRoots.push(root);
    const local = track(initializeNewDatabase(join(root, "stall.sqlite")));
    const installation = getLocalInstallation(local);
    const keys = generateDeviceKeyPair();

    local.db
      .prepare(
        `INSERT INTO stall_binding (id, stall_id, tenant_id, bound_at) VALUES (1, 'ten_a', 'ten_a', ?)`,
      )
      .run("2026-11-03T00:00:00.000Z");
    local.db
      .prepare(
        `INSERT INTO host_enrollment (
           id, host_device_id, installation_id, credential_ref, credential_version,
           activation_state, cloud_device_id, cloud_state_revision, activated_at, updated_at
         ) VALUES (1, 'dev_host_a', ?, 'ref', 1, 'activated', 'dev_host_a', 1, ?, ?)`,
      )
      .run(installation.id, "2026-11-03T00:00:00.000Z", "2026-11-03T00:00:00.000Z");

    const artifact = JSON.stringify({
      hostDeviceId: "dev_host_a",
      terminalDeviceId: "dev_term_1",
      publicKey: keys.publicKey,
      credentialVersion: 1,
      cloudStateRevision: 4,
    });
    const signature = signPossessionMessage(keys.privateKeyPkcs8, artifact);
    const result = acceptTerminalPairing(
      local,
      {
        terminalDeviceId: "dev_term_1",
        publicKey: keys.publicKey,
        credentialVersion: 1,
        label: "Counter",
        cloudStateRevision: 4,
        pairingArtifact: artifact,
        pairingSignature: signature,
      },
      "2026-11-03T00:01:00.000Z",
    );
    expect(result.pairingState).toBe("accepted");
  });
});
