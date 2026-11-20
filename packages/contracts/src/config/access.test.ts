import { describe, expect, it } from "vitest";

import {
  accessConfigEnvelopeSchema,
  configAckRequestBodySchema,
  configPullRequestBodySchema,
  configPullResponseSchema,
  CONFIG_PROTOCOL_VERSION,
} from "./access.js";
import {
  buildConfigAckPossessionMessage,
  buildConfigPullPossessionMessage,
} from "./possession.js";

const issuedAt = "2026-11-13T12:00:00.000Z";

describe("config access contracts", () => {
  it("accepts a complete access envelope", () => {
    const parsed = accessConfigEnvelopeSchema.parse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      schemaVersion: "1",
      domain: "access",
      snapshotKind: "complete_replacement",
      tenantId: "ten_test",
      stallId: "ten_test",
      targetScope: "stall_host",
      revision: 3,
      publicationId: "pub_abc",
      issuedAt,
      maxSnapshotAgeMs: 7 * 24 * 60 * 60 * 1000,
      requiredCompatibilityVersion: 1,
      payloadHash: "a".repeat(64),
      payload: {
        profiles: [
          {
            profileRole: "cashier",
            capabilities: ["bills.create"],
            revision: 2,
            updatedAt: issuedAt,
          },
        ],
        memberships: [
          {
            membershipId: "mem_1",
            status: "active",
            accessRole: "cashier",
            capabilities: ["bills.create"],
            capabilitiesRevision: 4,
            updatedAt: issuedAt,
          },
        ],
        devices: [
          {
            deviceId: "dev_host",
            role: "host",
            enrollmentState: "activated",
            installationId: "inst_1",
            credentialVersion: 1,
            intendedHostDeviceId: null,
            revokedAt: null,
            label: "Host",
          },
        ],
      },
    });
    expect(parsed.revision).toBe(3);
    expect(parsed.snapshotKind).toBe("complete_replacement");
  });

  it("rejects unknown domains on pull", () => {
    const result = configPullRequestBodySchema.safeParse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      requestId: "req_1",
      tenantId: "ten_test",
      stallId: "ten_test",
      domain: "commission",
      knownRevision: null,
    });
    expect(result.success).toBe(false);
  });

  it("builds distinct pull and ack possession messages", () => {
    const common = {
      tenantId: "ten_test",
      deviceId: "dev_host",
      installationId: "inst_1",
      credentialVersion: 1,
      requestId: "req_1",
      bodySha256: "b".repeat(64),
      signedAt: issuedAt,
    };
    const pull = buildConfigPullPossessionMessage(common);
    const ack = buildConfigAckPossessionMessage(common);
    expect(pull.startsWith("polivo-config-pull-v1\n")).toBe(true);
    expect(ack.startsWith("polivo-config-ack-v1\n")).toBe(true);
    expect(pull).not.toBe(ack);
  });

  it("accepts up_to_date pull responses without envelope", () => {
    const parsed = configPullResponseSchema.parse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      correlationId: "cor_1",
      requestId: "req_1",
      tenantId: "ten_test",
      stallId: "ten_test",
      domain: "access",
      outcome: "up_to_date",
      envelope: null,
      publishedRevision: 3,
      lastAcknowledgedRevision: 3,
      message: null,
    });
    expect(parsed.outcome).toBe("up_to_date");
  });

  it("accepts ack request bodies", () => {
    const parsed = configAckRequestBodySchema.parse({
      protocolVersion: CONFIG_PROTOCOL_VERSION,
      requestId: "req_ack",
      tenantId: "ten_test",
      stallId: "ten_test",
      domain: "access",
      revision: 3,
      publicationId: "pub_abc",
      payloadHash: "c".repeat(64),
      result: "applied",
      appliedAt: issuedAt,
      errorCode: null,
      message: null,
    });
    expect(parsed.result).toBe("applied");
  });
});
