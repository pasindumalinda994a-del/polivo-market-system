import { generateKeyPairSync, sign } from "node:crypto";

import {
  buildConfigAckPossessionMessage,
  buildConfigPullPossessionMessage,
} from "@polivo/contracts";
import { describe, expect, it } from "vitest";

import { verifyConfigAckPossession, verifyConfigPullPossession } from "./crypto";

function rawPublicKeyBase64Url(publicKeyDerSpki: Buffer): string {
  return publicKeyDerSpki.subarray(-32).toString("base64url");
}

describe("config possession crypto", () => {
  it("verifies pull and ack signatures", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyRaw = rawPublicKeyBase64Url(
      publicKey.export({ type: "spki", format: "der" }) as Buffer,
    );
    const common = {
      tenantId: "ten_test",
      deviceId: "dev_host",
      installationId: "inst_1",
      credentialVersion: 1,
      requestId: "req_1",
      bodySha256: "a".repeat(64),
      signedAt: new Date().toISOString(),
    };
    const pullSig = sign(
      null,
      Buffer.from(buildConfigPullPossessionMessage(common), "utf8"),
      privateKey,
    ).toString("base64url");
    expect(
      verifyConfigPullPossession({
        publicKey: publicKeyRaw,
        ...common,
        signature: pullSig,
      }),
    ).toEqual({ ok: true });

    const ackSig = sign(
      null,
      Buffer.from(buildConfigAckPossessionMessage(common), "utf8"),
      privateKey,
    ).toString("base64url");
    expect(
      verifyConfigAckPossession({
        publicKey: publicKeyRaw,
        ...common,
        signature: ackSig,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects pull signature used for ack", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyRaw = rawPublicKeyBase64Url(
      publicKey.export({ type: "spki", format: "der" }) as Buffer,
    );
    const common = {
      tenantId: "ten_test",
      deviceId: "dev_host",
      installationId: "inst_1",
      credentialVersion: 1,
      requestId: "req_1",
      bodySha256: "a".repeat(64),
      signedAt: new Date().toISOString(),
    };
    const pullSig = sign(
      null,
      Buffer.from(buildConfigPullPossessionMessage(common), "utf8"),
      privateKey,
    ).toString("base64url");
    const result = verifyConfigAckPossession({
      publicKey: publicKeyRaw,
      ...common,
      signature: pullSig,
    });
    expect(result.ok).toBe(false);
  });
});
