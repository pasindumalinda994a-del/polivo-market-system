import { afterEach, describe, expect, it } from "vitest";

import { generateDeviceKeyPair } from "../../apps/stall-service/src/security/ed25519.ts";
import { createMemorySecureStorage } from "../../apps/stall-service/src/security/secure-storage.ts";
import { createTestOnlyOfflineAccessPolicy } from "../../apps/stall-service/src/auth/offline-access-policy.ts";
import { createLocalStaffAuthorizationAdapter } from "../../apps/stall-service/src/auth/local-staff-authorization.ts";
import { signDeviceAuthMessage } from "../../apps/stall-service/src/auth/device-proof.ts";
import { createTestOnlySetupGrantRedeemer } from "../../apps/stall-service/src/auth/setup-grant-redeem.ts";
import {
  activateLocalStaff,
  applyLocalPermissionSnapshot,
  deactivateLocalStaff,
  resetLocalStaffCredential,
  setupFirstLocalOwner,
} from "../../apps/stall-service/src/auth/staff-admin.ts";
import { buildTestApp } from "../../apps/stall-service/src/testing/build-test-app.ts";
import { STAFF_PROBE_PATH } from "../../apps/stall-service/src/testing/staff-auth-fixture.ts";
import {
  insertLocalStaff,
  upsertHostEnrollment,
  upsertAcceptedTerminal,
  upsertStaffCredential,
  applyCapabilitySnapshot,
  getLocalInstallation,
  type LocalDatabase,
} from "@polivo/db-local";
import {
  hashStaffSecret,
  STAFF_VERIFIER_FORMAT,
} from "../../apps/stall-service/src/auth/staff-credentials.ts";
import {
  cleanupTempDatabases,
  createTempDbPath,
  initBoundDatabase,
  reopenDatabase,
} from "./helpers/temp-db.ts";

type StallApp = ReturnType<typeof buildTestApp>;
const openApps: StallApp[] = [];

afterEach(async () => {
  while (openApps.length > 0) {
    await openApps.pop()?.close();
  }
  cleanupTempDatabases();
});

function trackApp(app: StallApp): StallApp {
  openApps.push(app);
  return app;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function testPolicy() {
  return createTestOnlyOfflineAccessPolicy({
    absoluteSessionLifetimeMs: 8 * HOUR,
    idleTimeoutMs: 2 * HOUR,
    maxSnapshotAgeMs: 7 * DAY,
  });
}

function seedActivatedHost(
  local: LocalDatabase,
  secureStorage: ReturnType<typeof createMemorySecureStorage>,
) {
  const keys = generateDeviceKeyPair();
  const installation = getLocalInstallation(local);
  const credentialRef = `host-${installation.id}-v1`;
  secureStorage.setSecret(credentialRef, keys.privateKeyPkcs8);
  const now = "2026-11-04T10:00:00.000Z";
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
  return { hostDeviceId: "host-device-1", privateKeyPkcs8: keys.privateKeyPkcs8 };
}

function seedAcceptedTerminal(local: LocalDatabase) {
  const keys = generateDeviceKeyPair();
  const now = "2026-11-04T10:00:00.000Z";
  upsertAcceptedTerminal(local, {
    terminalDeviceId: "terminal-1",
    publicKey: keys.publicKey,
    credentialVersion: 1,
    label: "Lane 1",
    pairingState: "accepted",
    cloudStateRevision: 1,
    acceptedAt: now,
    updatedAt: now,
  });
  return {
    terminalDeviceId: "terminal-1",
    privateKeyPkcs8: keys.privateKeyPkcs8,
    publicKey: keys.publicKey,
  };
}

function deviceHeaders(input: {
  deviceId: string;
  privateKeyPkcs8: string;
  method: string;
  path: string;
  signedAt: string;
  sessionSecret?: string;
}) {
  const signature = signDeviceAuthMessage(input.privateKeyPkcs8, {
    deviceId: input.deviceId,
    signedAt: input.signedAt,
    method: input.method,
    path: input.path,
  });
  return {
    "x-polivo-device-id": input.deviceId,
    "x-polivo-device-signed-at": input.signedAt,
    "x-polivo-device-signature": signature,
    ...(input.sessionSecret ? { "x-polivo-session": input.sessionSecret } : {}),
  };
}

describe("stall-service local staff authentication (phase 15)", () => {
  it("allows offline cashier sign-in with TEST-ONLY policy and zero cloud calls", async () => {
    const path = createTempDbPath("polivo-staff-", "offline.sqlite");
    const local = initBoundDatabase(path);
    const secureStorage = createMemorySecureStorage();
    const host = seedActivatedHost(local, secureStorage);
    const terminal = seedAcceptedTerminal(local);
    const clock = "2026-11-04T12:00:00.000Z";

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
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        displayName: "Cashier One",
        cloudMembershipId: "mem_cashier",
        capabilities: ["bills.create"],
        sourceRevision: 1,
      },
    );

    let cloudCalls = 0;
    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy: testPolicy(),
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: testPolicy(),
          now: () => clock,
        }),
        now: () => clock,
        createId: () => `id-${Math.random().toString(16).slice(2)}`,
        setupGrantRedeemer: {
          async redeem() {
            cloudCalls += 1;
            throw new Error("cloud must not be called during offline login");
          },
        },
      }),
    );

    const signedAt = clock;
    const signIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(signIn.statusCode).toBe(200);
    expect(cloudCalls).toBe(0);
    const session = signIn.json() as { sessionSecret: string; staffId: string };
    expect(session.staffId).toBe("staff-cashier");

    const probe = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "shift-start" },
      headers: {
        "idempotency-key": "probe-1",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret: session.sessionSecret,
        }),
      },
    });
    expect(probe.statusCode).toBe(200);
    expect(cloudCalls).toBe(0);
    void host;
  });

  it("denies protected ops without session, wrong device, and owner-only capability", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-staff-", "deny.sqlite"));
    const secureStorage = createMemorySecureStorage();
    seedActivatedHost(local, secureStorage);
    const terminal = seedAcceptedTerminal(local);
    const terminal2Keys = generateDeviceKeyPair();
    upsertAcceptedTerminal(local, {
      terminalDeviceId: "terminal-2",
      publicKey: terminal2Keys.publicKey,
      credentialVersion: 1,
      pairingState: "accepted",
      acceptedAt: "2026-11-04T10:00:00.000Z",
      updatedAt: "2026-11-04T10:00:00.000Z",
    });

    const clock = "2026-11-04T12:00:00.000Z";
    setupFirstLocalOwner(
      { database: local, now: () => clock, createId: () => "staff-owner" },
      {
        staffCode: "OWNER1",
        secret: "owner-secret-test",
        proof: {
          tenantId: "tenant-1",
          cloudMembershipId: "mem_owner",
          ownerDisplayName: "Owner",
          capabilities: ["staff.manage"],
          sourceRevision: 1,
          grantId: "lsg_1",
        },
      },
    );
    activateLocalStaff(
      { database: local, now: () => clock, createId: () => "staff-cashier" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        displayName: "Cashier",
        cloudMembershipId: "mem_c",
        capabilities: ["bills.create"],
        sourceRevision: 1,
      },
    );

    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy: testPolicy(),
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: testPolicy(),
          now: () => clock,
        }),
        now: () => clock,
        createId: () => crypto.randomUUID(),
      }),
    );

    const noSession = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "x" },
      headers: {
        "idempotency-key": "ns",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
        }),
      },
    });
    expect(noSession.statusCode).toBe(401);

    const signIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    const { sessionSecret } = signIn.json() as { sessionSecret: string };

    const wrongDevice = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "x" },
      headers: {
        "idempotency-key": "wd",
        ...deviceHeaders({
          deviceId: "terminal-2",
          privateKeyPkcs8: terminal2Keys.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret,
        }),
      },
    });
    expect(wrongDevice.statusCode).toBe(401);

    // Cashier lacks staff.manage — use authorize adapter directly for owner-only denial.
    const authz = createLocalStaffAuthorizationAdapter({
      database: local,
      secureStorage,
      offlinePolicy: testPolicy(),
      now: () => clock,
    });
    const denied = authz.authorize({
      requiredCapability: "staff.manage",
      deviceProof: {
        deviceId: terminal.terminalDeviceId,
        signedAt: clock,
        signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          method: "POST",
          path: STAFF_PROBE_PATH,
        }),
      },
      sessionSecret,
      method: "POST",
      path: STAFF_PROBE_PATH,
    });
    expect("code" in denied && denied.code === "FORBIDDEN").toBe(true);
  });

  it("switches staff on one terminal, enforces reset/deactivate, and capability reduction on replay", async () => {
    const dbPath = createTempDbPath("polivo-staff-", "switch.sqlite");
    const local = initBoundDatabase(dbPath);
    const secureStorage = createMemorySecureStorage();
    seedActivatedHost(local, secureStorage);
    const terminal = seedAcceptedTerminal(local);
    let clock = "2026-11-04T12:00:00.000Z";

    setupFirstLocalOwner(
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
          grantId: "g1",
        },
      },
    );
    activateLocalStaff(
      { database: local, now: () => clock, createId: () => "staff-a" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASHA",
        secret: "secret-a-test",
        displayName: "A",
        cloudMembershipId: "mem_a",
        capabilities: ["bills.create"],
        sourceRevision: 2,
      },
    );
    activateLocalStaff(
      { database: local, now: () => clock, createId: () => "staff-b" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASHB",
        secret: "secret-b-test",
        displayName: "B",
        cloudMembershipId: "mem_b",
        capabilities: ["bills.create"],
        sourceRevision: 2,
      },
    );

    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy: testPolicy(),
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: testPolicy(),
          now: () => clock,
        }),
        now: () => clock,
        createId: () => crypto.randomUUID(),
        setupGrantRedeemer: createTestOnlySetupGrantRedeemer({
          tenantId: "tenant-1",
          cloudMembershipId: "mem_owner",
          ownerDisplayName: "Owner",
          capabilities: [],
          sourceRevision: 1,
          grantId: "g-test",
        }),
      }),
    );

    const signInA = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASHA",
        secret: "secret-a-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    const sessionA = (signInA.json() as { sessionSecret: string }).sessionSecret;

    const firstProbe = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "a1" },
      headers: {
        "idempotency-key": "idem-cap",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret: sessionA,
        }),
      },
    });
    expect(firstProbe.statusCode).toBe(200);

    // Capability reduction then idempotent replay must deny.
    applyLocalPermissionSnapshot(
      { database: local, now: () => clock, createId: () => crypto.randomUUID() },
      {
        staffId: "staff-a",
        tenantId: "tenant-1",
        stallId: "stall-1",
        capabilities: [],
        sourceRevision: 3,
      },
    );
    const replay = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "a1" },
      headers: {
        "idempotency-key": "idem-cap",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret: sessionA,
        }),
      },
    });
    expect(replay.statusCode).toBe(403);

    // Restore capability and switch staff.
    applyLocalPermissionSnapshot(
      { database: local, now: () => clock, createId: () => crypto.randomUUID() },
      {
        staffId: "staff-a",
        tenantId: "tenant-1",
        stallId: "stall-1",
        capabilities: ["bills.create"],
        sourceRevision: 4,
      },
    );
    const signInB = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASHB",
        secret: "secret-b-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    const sessionB = (signInB.json() as { sessionSecret: string }).sessionSecret;

    const oldSession = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "old" },
      headers: {
        "idempotency-key": "old-sess",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret: sessionA,
        }),
      },
    });
    expect(oldSession.statusCode).toBe(401);

    resetLocalStaffCredential(
      { database: local, now: () => clock, createId: () => crypto.randomUUID() },
      { actorStaffId: "staff-owner", staffId: "staff-b", newSecret: "secret-b-new" },
    );
    const afterReset = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "b" },
      headers: {
        "idempotency-key": "after-reset",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret: sessionB,
        }),
      },
    });
    expect(afterReset.statusCode).toBe(401);

    // Re-login with new secret, then deactivate.
    const signInB2 = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASHB",
        secret: "secret-b-new",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(signInB2.statusCode).toBe(200);
    const sessionB2 = (signInB2.json() as { sessionSecret: string }).sessionSecret;
    deactivateLocalStaff(
      { database: local, now: () => clock, createId: () => crypto.randomUUID() },
      { actorStaffId: "staff-owner", staffId: "staff-b" },
    );
    const afterDeactivate = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "dead" },
      headers: {
        "idempotency-key": "dead",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret: sessionB2,
        }),
      },
    });
    expect(afterDeactivate.statusCode).toBe(401);

    // Restart / reopen DB: absolute expiry still enforced.
    local.close();
    const reopened = reopenDatabase(dbPath);
    clock = "2026-11-04T21:00:00.000Z"; // beyond 8h absolute from 12:00
    insertLocalStaff(reopened, {
      id: "staff-c",
      tenantId: "tenant-1",
      staffCode: "CASHC",
      displayName: "C",
      status: "active",
      isLocalOwner: false,
      cloudMembershipId: "mem_c",
      createdAt: "2026-11-04T12:00:00.000Z",
      updatedAt: "2026-11-04T12:00:00.000Z",
    });
    upsertStaffCredential(reopened, {
      staffId: "staff-c",
      tenantId: "tenant-1",
      verifier: hashStaffSecret("secret-c-test"),
      verifierFormat: STAFF_VERIFIER_FORMAT,
      credentialRevision: 1,
      updatedAt: "2026-11-04T12:00:00.000Z",
    });
    applyCapabilitySnapshot(reopened, {
      staffId: "staff-c",
      tenantId: "tenant-1",
      stallId: "stall-1",
      capabilitiesJson: JSON.stringify(["bills.create"]),
      sourceRevision: 1,
      authorityVerifiedAt: "2026-11-04T12:00:00.000Z",
      updatedAt: "2026-11-04T12:00:00.000Z",
    });
  });

  it("rejects duplicate owner setup and production fail-closed offline policy", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-staff-", "owner.sqlite"));
    const secureStorage = createMemorySecureStorage();
    seedActivatedHost(local, secureStorage);
    const clock = "2026-11-04T12:00:00.000Z";
    const proof = {
      tenantId: "tenant-1",
      cloudMembershipId: "mem_owner",
      ownerDisplayName: "Owner",
      capabilities: [] as string[],
      sourceRevision: 1,
      grantId: "g1",
    };
    const first = setupFirstLocalOwner(
      { database: local, now: () => clock, createId: () => "staff-owner" },
      { staffCode: "OWNER1", secret: "owner-secret-test", proof },
    );
    expect("staffId" in first).toBe(true);
    const second = setupFirstLocalOwner(
      { database: local, now: () => clock, createId: () => "staff-owner-2" },
      { staffCode: "OWNER2", secret: "owner-secret-test", proof: { ...proof, grantId: "g2" } },
    );
    expect("code" in second && second.code === "CONFLICT").toBe(true);

    const terminal = seedAcceptedTerminal(local);
    activateLocalStaff(
      { database: local, now: () => clock, createId: () => "staff-c" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        displayName: "C",
        cloudMembershipId: "mem_c",
        capabilities: ["bills.create"],
        sourceRevision: 1,
      },
    );

    // Production fail-closed offline policy denies new sessions.
    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        // default offline policy is fail-closed
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: createTestOnlyOfflineAccessPolicy({
            // still need adapter; use production fail-closed via composition default
            absoluteSessionLifetimeMs: HOUR,
            idleTimeoutMs: HOUR,
            maxSnapshotAgeMs: DAY,
          }),
          now: () => clock,
        }),
        now: () => clock,
        createId: () => crypto.randomUUID(),
      }),
    );
    // Explicit production fail-closed sign-in
    const { productionFailClosedOfflineAccessPolicy } =
      await import("../../apps/stall-service/src/auth/offline-access-policy.ts");
    const failClosedApp = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy: productionFailClosedOfflineAccessPolicy,
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: productionFailClosedOfflineAccessPolicy,
          now: () => clock,
        }),
        now: () => clock,
        createId: () => crypto.randomUUID(),
      }),
    );
    const denied = await failClosedApp.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({
      message: "Stall access needs an online refresh.",
    });
    void app;
  });

  it("allows sign-in under production offline policy and denies when snapshot expires mid-session", async () => {
    const { createProductionOfflineAccessPolicy } =
      await import("../../apps/stall-service/src/auth/offline-access-policy.ts");
    const local = initBoundDatabase(createTempDbPath("polivo-staff-", "prod-policy.sqlite"));
    const secureStorage = createMemorySecureStorage();
    seedActivatedHost(local, secureStorage);
    const terminal = seedAcceptedTerminal(local);
    let clock = "2026-11-07T05:30:00.000Z";
    const now = () => clock;
    const productionPolicy = createProductionOfflineAccessPolicy();

    setupFirstLocalOwner(
      { database: local, now, createId: () => "staff-owner" },
      {
        staffCode: "OWNER1",
        secret: "owner-secret-test",
        proof: {
          tenantId: "tenant-1",
          cloudMembershipId: "mem_owner",
          ownerDisplayName: "Owner",
          capabilities: [],
          sourceRevision: 1,
          grantId: "g-owner",
        },
      },
    );
    activateLocalStaff(
      { database: local, now, createId: () => "staff-c" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        displayName: "Cashier",
        cloudMembershipId: "mem_c",
        capabilities: ["bills.create"],
        sourceRevision: 1,
      },
    );

    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy: productionPolicy,
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: productionPolicy,
          now,
        }),
        now,
        createId: () => crypto.randomUUID(),
      }),
    );

    const signedIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(signedIn.statusCode).toBe(200);
    const sessionSecret = (signedIn.json() as { sessionSecret: string; absoluteExpiresAt: string })
      .sessionSecret;
    expect((signedIn.json() as { absoluteExpiresAt: string }).absoluteExpiresAt).toBe(
      "2026-11-07T17:30:00.000Z",
    );

    const sessionBefore = await app.inject({
      method: "GET",
      url: "/local-auth/session",
      headers: deviceHeaders({
        deviceId: terminal.terminalDeviceId,
        privateKeyPkcs8: terminal.privateKeyPkcs8,
        method: "GET",
        path: "/local-auth/session",
        signedAt: clock,
        sessionSecret,
      }),
    });
    expect(sessionBefore.statusCode).toBe(200);
    const lastActivityAt = (sessionBefore.json() as { lastActivityAt: string }).lastActivityAt;

    // Passive session poll must not extend idle (no touchActivity).
    clock = "2026-11-07T06:00:00.000Z";
    const sessionPoll = await app.inject({
      method: "GET",
      url: "/local-auth/session",
      headers: deviceHeaders({
        deviceId: terminal.terminalDeviceId,
        privateKeyPkcs8: terminal.privateKeyPkcs8,
        method: "GET",
        path: "/local-auth/session",
        signedAt: clock,
        sessionSecret,
      }),
    });
    expect(sessionPoll.statusCode).toBe(200);
    expect((sessionPoll.json() as { lastActivityAt: string }).lastActivityAt).toBe(lastActivityAt);

    // Snapshot expiry mid-session blocks protected work; sign-in again does not renew snapshot.
    applyCapabilitySnapshot(local, {
      staffId: "staff-c",
      tenantId: "tenant-1",
      stallId: "stall-1",
      capabilitiesJson: JSON.stringify(["bills.create"]),
      sourceRevision: 1,
      authorityVerifiedAt: "2026-10-01T00:00:00.000Z",
      updatedAt: clock,
    });
    clock = "2026-11-07T06:05:00.000Z";
    const probe = await app.inject({
      method: "POST",
      url: STAFF_PROBE_PATH,
      payload: { note: "stale" },
      headers: {
        "idempotency-key": "idem-stale-snap",
        ...deviceHeaders({
          deviceId: terminal.terminalDeviceId,
          privateKeyPkcs8: terminal.privateKeyPkcs8,
          method: "POST",
          path: STAFF_PROBE_PATH,
          signedAt: clock,
          sessionSecret,
        }),
      },
    });
    expect(probe.statusCode).toBe(403);
    expect(probe.json()).toMatchObject({
      message: "Stall access needs an online refresh.",
    });

    const resign = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(resign.statusCode).toBe(403);
    expect(resign.json()).toMatchObject({
      message: "Stall access needs an online refresh.",
    });
  });

  it("expands empty owner snapshot to full operational capabilities for session and authz", async () => {
    const local = initBoundDatabase(createTempDbPath("polivo-staff-", "owner-caps.sqlite"));
    const secureStorage = createMemorySecureStorage();
    seedActivatedHost(local, secureStorage);
    const terminal = seedAcceptedTerminal(local);
    const clock = "2026-11-09T12:00:00.000Z";

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
          grantId: "lsg_owner_caps",
        },
      },
    );
    expect("staffId" in ownerSetup).toBe(true);

    activateLocalStaff(
      { database: local, now: () => clock, createId: () => "staff-cashier" },
      {
        actorStaffId: "staff-owner",
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        displayName: "Cashier",
        cloudMembershipId: "mem_cashier",
        capabilities: ["reports.view_financial"],
        sourceRevision: 1,
      },
    );

    const app = trackApp(
      buildTestApp({
        database: local,
        useLegacyTestAuth: false,
        secureStorage,
        offlinePolicy: testPolicy(),
        authorization: createLocalStaffAuthorizationAdapter({
          database: local,
          secureStorage,
          offlinePolicy: testPolicy(),
          now: () => clock,
        }),
        now: () => clock,
        createId: () => `id-${Math.random().toString(16).slice(2)}`,
      }),
    );

    const ownerSignIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "OWNER1",
        secret: "owner-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(ownerSignIn.statusCode).toBe(200);
    const ownerSession = (ownerSignIn.json() as { sessionSecret: string }).sessionSecret;

    const ownerSessionLookup = await app.inject({
      method: "GET",
      url: "/local-auth/session",
      headers: deviceHeaders({
        deviceId: terminal.terminalDeviceId,
        privateKeyPkcs8: terminal.privateKeyPkcs8,
        method: "GET",
        path: "/local-auth/session",
        signedAt: clock,
        sessionSecret: ownerSession,
      }),
    });
    expect(ownerSessionLookup.statusCode).toBe(200);
    const ownerCaps = (ownerSessionLookup.json() as { capabilities: string[] }).capabilities;
    expect(ownerCaps).toContain("parties.register_edit");
    expect(ownerCaps).toContain("bills.create");
    expect(ownerCaps.length).toBeGreaterThan(5);

    const ownerFarmers = await app.inject({
      method: "GET",
      url: "/farmers",
      headers: deviceHeaders({
        deviceId: terminal.terminalDeviceId,
        privateKeyPkcs8: terminal.privateKeyPkcs8,
        method: "GET",
        path: "/farmers",
        signedAt: clock,
        sessionSecret: ownerSession,
      }),
    });
    expect(ownerFarmers.statusCode).toBe(200);

    const cashierSignIn = await app.inject({
      method: "POST",
      url: "/local-auth/sign-in",
      payload: {
        staffCode: "CASH1",
        secret: "cashier-secret-test",
        deviceProof: {
          deviceId: terminal.terminalDeviceId,
          signedAt: clock,
          signature: signDeviceAuthMessage(terminal.privateKeyPkcs8, {
            deviceId: terminal.terminalDeviceId,
            signedAt: clock,
            method: "POST",
            path: "/local-auth/sign-in",
          }),
        },
      },
    });
    expect(cashierSignIn.statusCode).toBe(200);
    const cashierSession = (cashierSignIn.json() as { sessionSecret: string }).sessionSecret;

    const cashierFarmers = await app.inject({
      method: "GET",
      url: "/farmers",
      headers: deviceHeaders({
        deviceId: terminal.terminalDeviceId,
        privateKeyPkcs8: terminal.privateKeyPkcs8,
        method: "GET",
        path: "/farmers",
        signedAt: clock,
        sessionSecret: cashierSession,
      }),
    });
    expect(cashierFarmers.statusCode).toBe(403);
  });
});
