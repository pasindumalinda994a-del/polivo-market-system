import { afterEach, describe, expect, it } from "vitest";
import {
  getLocalInstallation,
  upsertAcceptedTerminal,
  upsertHostEnrollment,
} from "@polivo/db-local";

import { buildApp } from "../../apps/stall-service/src/app.ts";
import { signDeviceAuthMessage } from "../../apps/stall-service/src/auth/device-proof.ts";
import { createLocalStaffAuthorizationAdapter } from "../../apps/stall-service/src/auth/local-staff-authorization.ts";
import { createTestOnlyOfflineAccessPolicy } from "../../apps/stall-service/src/auth/offline-access-policy.ts";
import { setupFirstLocalOwner } from "../../apps/stall-service/src/auth/staff-admin.ts";
import { generateDeviceKeyPair } from "../../apps/stall-service/src/security/ed25519.ts";
import { createMemorySecureStorage } from "../../apps/stall-service/src/security/secure-storage.ts";
import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
import { createTestAuthorizationAdapter } from "../../apps/stall-service/src/testing/test-auth.ts";
import {
  cleanupTempDatabases,
  createTempDbPath,
  initBoundDatabase,
} from "./helpers/temp-db.ts";

type StallApp = ReturnType<typeof buildApp>;

const openApps: StallApp[] = [];

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop();
    if (app !== undefined) {
      await app.close();
    }
  }
  cleanupTempDatabases();
});

function trackApp(app: StallApp): StallApp {
  openApps.push(app);
  return app;
}

const AUTH_HEADERS = {
  "x-polivo-device-id": "test-device",
  "x-polivo-device-signed-at": "2026-11-09T08:00:00.000Z",
  "x-polivo-device-signature": "test-signature",
  "x-polivo-session": "test-session-secret",
};

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { ...AUTH_HEADERS, "idempotency-key": idempotencyKey };
}

async function createFarmer(app: StallApp): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: "/farmers",
    payload: {
      shortCode: "F1",
      displayName: "Farmer One",
    },
    headers: mutationHeaders("farmer-create-1"),
  });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

describe("stall-service accounts and openings", () => {
  it("shows zero balance, posts opening, rejects duplicate, and supports idempotent retry", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-open-", "post.sqlite"));
    const app = trackApp(buildTestApp({ database: local }));
    const farmerId = await createFarmer(app);

    const zero = await app.inject({
      method: "GET",
      url: `/accounts/farmer/${farmerId}/balance`,
      headers: AUTH_HEADERS,
    });
    expect(zero.statusCode).toBe(200);
    expect(zero.json()).toMatchObject({
      balanceMinor: 0,
      directionLabel: "Settled",
      openingStatus: "not_opened",
    });

    const draftResponse = await app.inject({
      method: "POST",
      url: "/openings/drafts",
      payload: {
        partyKind: "farmer",
        partyId: farmerId,
        direction: "stall_owes_farmer",
        amountMinor: 25_000,
        cutoffDate: "2026-11-01",
        reference: "OB-F1",
        explanation: "Cutover payable",
      },
      headers: mutationHeaders("open-prepare-1"),
    });
    expect(draftResponse.statusCode).toBe(200);
    const draft = draftResponse.json();
    expect(draft.status).toBe("draft");

    const stillZero = await app.inject({
      method: "GET",
      url: `/accounts/farmer/${farmerId}/balance`,
      headers: AUTH_HEADERS,
    });
    expect(stillZero.json().balanceMinor).toBe(0);

    const posted = await app.inject({
      method: "POST",
      url: `/openings/drafts/${draft.id}/post`,
      payload: { expectedRevision: draft.revision },
      headers: mutationHeaders("open-post-1"),
    });
    expect(posted.statusCode).toBe(200);
    expect(posted.json()).toMatchObject({
      balance: {
        balanceMinor: 25_000,
        directionLabel: "Stall owes farmer",
        openingStatus: "opened",
      },
    });

    const retry = await app.inject({
      method: "POST",
      url: `/openings/drafts/${draft.id}/post`,
      payload: { expectedRevision: draft.revision },
      headers: mutationHeaders("open-post-1"),
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().balance.balanceMinor).toBe(25_000);

    const secondDraft = await app.inject({
      method: "POST",
      url: "/openings/drafts",
      payload: {
        partyKind: "farmer",
        partyId: farmerId,
        direction: "stall_owes_farmer",
        amountMinor: 1_000,
        cutoffDate: "2026-11-02",
      },
      headers: mutationHeaders("open-prepare-2"),
    });
    expect(secondDraft.statusCode).toBe(409);

    const movements = await app.inject({
      method: "GET",
      url: `/accounts/farmer/${farmerId}/movements`,
      headers: AUTH_HEADERS,
    });
    expect(movements.statusCode).toBe(200);
    expect(movements.json().items).toHaveLength(1);
    expect(movements.json().precedingBalanceMinor).toBe(0);
  });

  it("denies opening post without capability", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-open-", "deny.sqlite"));
    const app = trackApp(
      buildTestApp({
        database: local,
        authorization: createTestAuthorizationAdapter({
          principal: {
            actorRef: "viewer",
            deviceRef: "test-device",
            capabilities: new Set(["accounts.view", "parties.register_edit"]),
          },
        }),
      }),
    );
    const farmerId = await createFarmer(app);
    const denied = await app.inject({
      method: "POST",
      url: "/openings/drafts",
      payload: {
        partyKind: "farmer",
        partyId: farmerId,
        direction: "stall_owes_farmer",
        amountMinor: 100,
        cutoffDate: "2026-11-01",
      },
      headers: mutationHeaders("open-denied"),
    });
    expect(denied.statusCode).toBe(403);
  });

  it("accepts real device proofs signed over concrete account paths", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-open-", "device-proof.sqlite"));
    const secureStorage = createMemorySecureStorage();
    const clock = "2026-11-10T06:40:00.000Z";
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const offlinePolicy = createTestOnlyOfflineAccessPolicy({
      absoluteSessionLifetimeMs: 8 * hour,
      idleTimeoutMs: 2 * hour,
      maxSnapshotAgeMs: 7 * day,
    });

    const hostKeys = generateDeviceKeyPair();
    const installation = getLocalInstallation(local);
    const credentialRef = `host-${installation.id}-v1`;
    secureStorage.setSecret(credentialRef, hostKeys.privateKeyPkcs8);
    upsertHostEnrollment(local, {
      hostDeviceId: "host-device-1",
      installationId: installation.id,
      credentialRef,
      credentialVersion: 1,
      activationState: "activated",
      cloudDeviceId: "cloud-host-1",
      cloudStateRevision: 1,
      activatedAt: clock,
      updatedAt: clock,
    });

    const terminalKeys = generateDeviceKeyPair();
    upsertAcceptedTerminal(local, {
      terminalDeviceId: "terminal-1",
      publicKey: terminalKeys.publicKey,
      credentialVersion: 1,
      label: "Lane 1",
      pairingState: "accepted",
      cloudStateRevision: 1,
      acceptedAt: clock,
      updatedAt: clock,
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
          grantId: "lsg_accounts_proof",
        },
      },
    );
    expect("staffId" in ownerSetup).toBe(true);

    let idSeq = 0;
    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy,
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy,
          now: () => clock,
        }),
        now: () => clock,
        createId: () => `id-${++idSeq}`,
      }),
    );

    function deviceHeaders(method: string, path: string, sessionSecret?: string) {
      return {
        "x-polivo-device-id": "terminal-1",
        "x-polivo-device-signed-at": clock,
        "x-polivo-device-signature": signDeviceAuthMessage(terminalKeys.privateKeyPkcs8, {
          deviceId: "terminal-1",
          signedAt: clock,
          method,
          path,
        }),
        ...(sessionSecret ? { "x-polivo-session": sessionSecret } : {}),
      };
    }

    const signIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "OWNER1",
        secret: "owner-secret-test",
        deviceProof: {
          deviceId: "terminal-1",
          signedAt: clock,
          signature: signDeviceAuthMessage(terminalKeys.privateKeyPkcs8, {
            deviceId: "terminal-1",
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
      headers: deviceHeaders("POST", "/local-auth/sign-in"),
    });
    expect(signIn.statusCode).toBe(200);
    const sessionSecret = signIn.json().sessionSecret as string;

    const farmer = await app.inject({
      method: "POST",
      url: "/farmers",
      payload: { shortCode: "P21", displayName: "Proof Farmer" },
      headers: {
        ...deviceHeaders("POST", "/farmers", sessionSecret),
        "idempotency-key": "farmer-proof-1",
      },
    });
    expect(farmer.statusCode).toBe(201);
    const farmerId = farmer.json().id as string;
    const balancePath = `/accounts/farmer/${farmerId}/balance`;
    const movementsPath = `/accounts/farmer/${farmerId}/movements`;

    const balance = await app.inject({
      method: "GET",
      url: balancePath,
      headers: deviceHeaders("GET", balancePath, sessionSecret),
    });
    expect(balance.statusCode).toBe(200);
    expect(balance.json()).toMatchObject({
      balanceMinor: 0,
      directionLabel: "Settled",
      openingStatus: "not_opened",
    });

    const templateSigned = await app.inject({
      method: "GET",
      url: balancePath,
      headers: deviceHeaders("GET", "/accounts/:partyKind/:partyId/balance", sessionSecret),
    });
    expect(templateSigned.statusCode).toBe(401);
    expect(templateSigned.json().message).toMatch(/Device proof is invalid/i);

    const movements = await app.inject({
      method: "GET",
      url: `${movementsPath}?limit=20`,
      headers: deviceHeaders("GET", movementsPath, sessionSecret),
    });
    expect(movements.statusCode).toBe(200);
    expect(movements.json()).toMatchObject({
      precedingBalanceMinor: 0,
      items: [],
      nextCursor: null,
    });
  });
});
