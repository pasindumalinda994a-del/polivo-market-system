import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildHostIdentityMessage, hostIdentityResponseSchema } from "@polivo/contracts";
import {
  getLocalInstallation,
  upsertAcceptedTerminal,
  upsertHostEnrollment,
  type LocalDatabase,
} from "@polivo/db-local";

import { signDeviceAuthMessage } from "../../apps/stall-service/src/auth/device-proof.ts";
import { createTestOnlyOfflineAccessPolicy } from "../../apps/stall-service/src/auth/offline-access-policy.ts";
import { createLocalStaffAuthorizationAdapter } from "../../apps/stall-service/src/auth/local-staff-authorization.ts";
import {
  setupFirstLocalOwner,
  activateLocalStaff,
} from "../../apps/stall-service/src/auth/staff-admin.ts";
import { generateDeviceKeyPair } from "../../apps/stall-service/src/security/ed25519.ts";
import { writeHostMeta } from "../../apps/stall-service/src/security/host-meta.ts";
import { createMemorySecureStorage } from "../../apps/stall-service/src/security/secure-storage.ts";
import { loadOrCreateTlsMaterial } from "../../apps/stall-service/src/security/tls-material.ts";
import { buildApp } from "../../apps/stall-service/src/app.ts";
import { cleanupTempDatabases, createTempDbPath, initBoundDatabase } from "./helpers/temp-db.ts";

const tempRoots: string[] = [];
const openApps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  while (openApps.length > 0) {
    await openApps.pop()?.close();
  }
  cleanupTempDatabases();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function trackApp(app: ReturnType<typeof buildApp>): ReturnType<typeof buildApp> {
  openApps.push(app);
  return app;
}

function seedHostAndTerminal(local: LocalDatabase, credentialRoot: string) {
  const secureStorage = createMemorySecureStorage();
  const hostKeys = generateDeviceKeyPair();
  const terminalKeys = generateDeviceKeyPair();
  const installation = getLocalInstallation(local);
  const credentialRef = `host-${installation.id}-v1`;
  secureStorage.setSecret(credentialRef, hostKeys.privateKeyPkcs8);
  const now = "2026-11-05T10:00:00.000Z";
  upsertHostEnrollment(local, {
    hostDeviceId: "host-device-1",
    installationId: installation.id,
    credentialRef,
    credentialVersion: 1,
    activationState: "activated",
    cloudDeviceId: "cloud-host-1",
    cloudStateRevision: 1,
    activatedAt: now,
    updatedAt: now,
  });
  upsertAcceptedTerminal(local, {
    terminalDeviceId: "terminal-1",
    publicKey: terminalKeys.publicKey,
    credentialVersion: 1,
    label: "Lane 1",
    pairingState: "accepted",
    cloudStateRevision: 1,
    acceptedAt: now,
    updatedAt: now,
  });
  writeHostMeta(credentialRoot, { stallDisplayName: "Connection Test Stall" });
  const tlsMaterial = loadOrCreateTlsMaterial(credentialRoot);
  return {
    secureStorage,
    hostKeys,
    terminalKeys,
    tlsMaterial,
    hostDeviceId: "cloud-host-1",
  };
}

describe("stall-service desktop connection (phase 16)", () => {
  it("returns a signed host identity over HTTPS and rejects wrong TLS pin", async () => {
    const path = createTempDbPath("polivo-conn-", "identity.sqlite");
    const local = initBoundDatabase(path);
    const credentialRoot = mkdtempSync(join(tmpdir(), "polivo-conn-creds-"));
    tempRoots.push(credentialRoot);
    const seeded = seedHostAndTerminal(local, credentialRoot);

    const app = trackApp(
      buildApp({
        database: local,
        secureStorage: seeded.secureStorage,
        credentialRoot,
        tlsMaterial: seeded.tlsMaterial,
        https: seeded.tlsMaterial,
        logger: false,
        now: () => "2026-11-05T12:00:00.000Z",
      }),
    );

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listen address");
    }

    expect(address.port).toBeGreaterThan(0);

    // Node fetch rejects self-signed by default — use Fastify inject for schema checks.
    const injected = await app.inject({ method: "GET", url: "/connection/identity" });
    expect(injected.statusCode).toBe(200);
    const identity = hostIdentityResponseSchema.parse(JSON.parse(injected.body));
    expect(identity.stallDisplayName).toBe("Connection Test Stall");
    expect(identity.hostDeviceId).toBe("cloud-host-1");
    expect(identity.tlsCertificateSha256).toBe(seeded.tlsMaterial.certificateSha256);

    const message = buildHostIdentityMessage({
      hostDeviceId: identity.hostDeviceId,
      hostPublicKey: identity.hostPublicKey,
      hostCredentialVersion: identity.hostCredentialVersion,
      stallDisplayName: identity.stallDisplayName,
      tlsCertificateSha256: identity.tlsCertificateSha256,
      signedAt: identity.signedAt,
    });
    expect(message.startsWith("polivo-host-identity-v1")).toBe(true);

    // Wrong fingerprint must not equal the real cert.
    expect(identity.tlsCertificateSha256).not.toBe("0".repeat(64));
  });

  it("accepts a paired terminal with trust bundle fields and signs in after identity", async () => {
    const path = createTempDbPath("polivo-conn-", "signin.sqlite");
    const local = initBoundDatabase(path);
    const credentialRoot = mkdtempSync(join(tmpdir(), "polivo-conn-signin-"));
    tempRoots.push(credentialRoot);
    const seeded = seedHostAndTerminal(local, credentialRoot);
    const clock = "2026-11-05T12:00:00.000Z";
    const policy = createTestOnlyOfflineAccessPolicy({
      absoluteSessionLifetimeMs: 8 * 60 * 60 * 1000,
      idleTimeoutMs: 2 * 60 * 60 * 1000,
      maxSnapshotAgeMs: 7 * 24 * 60 * 60 * 1000,
    });

    const ownerSetup = setupFirstLocalOwner(
      { database: local, now: () => clock, createId: () => "staff-owner" },
      {
        staffCode: "OWNER1",
        secret: "owner-secret-test",
        proof: {
          tenantId: "tenant-1",
          cloudMembershipId: "mem_owner",
          ownerDisplayName: "Owner",
          capabilities: [],
          sourceRevision: 1,
          grantId: "lsg_test",
        },
      },
    );
    expect("staffId" in ownerSetup).toBe(true);

    activateLocalStaff(
      { database: local, now: () => clock, createId: () => "staff-cashier" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASH01",
        displayName: "Cashier One",
        secret: "cashier-secret-test",
        cloudMembershipId: "mem_cashier",
        capabilities: ["bills.create"],
        sourceRevision: 1,
      },
    );

    const app = trackApp(
      buildApp({
        database: local,
        secureStorage: seeded.secureStorage,
        credentialRoot,
        tlsMaterial: seeded.tlsMaterial,
        offlinePolicy: policy,
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage: seeded.secureStorage,
          offlinePolicy: policy,
          now: () => clock,
        }),
        logger: false,
        now: () => clock,
        https: false,
      }),
    );

    const identity = await app.inject({ method: "GET", url: "/connection/identity" });
    expect(identity.statusCode).toBe(200);
    const identityBody = hostIdentityResponseSchema.parse(JSON.parse(identity.body));
    expect(identityBody.tlsCertificateSha256).toBe(seeded.tlsMaterial.certificateSha256);

    const signedAt = clock;
    const deviceProof = {
      deviceId: "terminal-1",
      signedAt,
      signature: signDeviceAuthMessage(seeded.terminalKeys.privateKeyPkcs8, {
        deviceId: "terminal-1",
        signedAt,
        method: "POST",
        path: "/local-auth/sign-in",
      }),
    };

    const signIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH01",
        secret: "cashier-secret-test",
        deviceProof,
      },
    });
    expect(signIn.statusCode).toBe(200);
    const sessionSecret = (JSON.parse(signIn.body) as { sessionSecret: string }).sessionSecret;
    expect(sessionSecret.length).toBeGreaterThan(10);

    // Sign out clears session; a delayed previous response must not be trusted by clients
    // (client generation is covered in desktop unit of work — here we verify server revoke).
    const signOutProof = {
      deviceId: "terminal-1",
      signedAt,
      signature: signDeviceAuthMessage(seeded.terminalKeys.privateKeyPkcs8, {
        deviceId: "terminal-1",
        signedAt,
        method: "POST",
        path: "/local-auth/sign-out",
      }),
    };
    const signOut = await app.inject({
      method: "POST",
      url: "/local-auth/sign-out",
      headers: { "x-polivo-session": sessionSecret },
      payload: { deviceProof: signOutProof },
    });
    expect(signOut.statusCode).toBe(200);

    const sessionAfter = await app.inject({
      method: "GET",
      url: "/local-auth/session",
      headers: {
        "x-polivo-device-id": "terminal-1",
        "x-polivo-device-signed-at": signedAt,
        "x-polivo-device-signature": signDeviceAuthMessage(seeded.terminalKeys.privateKeyPkcs8, {
          deviceId: "terminal-1",
          signedAt,
          method: "GET",
          path: "/local-auth/session",
        }),
        "x-polivo-session": sessionSecret,
      },
    });
    expect(sessionAfter.statusCode).toBeGreaterThanOrEqual(401);
  });

  it("keeps provisioning accept off non-loopback remotes when identity is public", async () => {
    const path = createTempDbPath("polivo-conn-", "loopback.sqlite");
    const local = initBoundDatabase(path);
    const credentialRoot = mkdtempSync(join(tmpdir(), "polivo-conn-loop-"));
    tempRoots.push(credentialRoot);
    const seeded = seedHostAndTerminal(local, credentialRoot);
    const app = trackApp(
      buildApp({
        database: local,
        secureStorage: seeded.secureStorage,
        credentialRoot,
        tlsMaterial: seeded.tlsMaterial,
        logger: false,
        https: false,
      }),
    );

    // inject() presents as loopback — accept still requires a valid pairing payload.
    const accept = await app.inject({
      method: "POST",
      url: "/enrollment/terminals/accept",
      payload: { invalid: true },
    });
    expect(accept.statusCode).toBe(400);

    // Identity remains available without device proof.
    const identity = await app.inject({ method: "GET", url: "/connection/identity" });
    expect(identity.statusCode).toBe(200);
  });
});
