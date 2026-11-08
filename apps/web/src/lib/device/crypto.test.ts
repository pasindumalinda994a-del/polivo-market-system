import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildRedeemPossessionMessage,
  generateEnrollmentSecret,
  hashEnrollmentSecret,
  verifyEd25519Possession,
} from "./crypto";

describe("device enrollment crypto", () => {
  it("hashes enrollment secrets without echoing the raw value", () => {
    const secret = generateEnrollmentSecret();
    const digest = hashEnrollmentSecret(secret);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(secret);
  });

  it("verifies ed25519 possession proofs", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicDer = publicKey.export({ type: "spki", format: "der" });
    const rawPublic = Buffer.from(publicDer.subarray(publicDer.length - 32)).toString("base64url");
    const message = buildRedeemPossessionMessage({
      installationId: "inst_1",
      publicKey: rawPublic,
      deploymentEnvironment: "development",
      expectedRole: "terminal",
    });
    const signature = Buffer.from(sign(null, Buffer.from(message, "utf8"), privateKey)).toString(
      "base64url",
    );
    expect(
      verifyEd25519Possession({
        publicKey: rawPublic,
        message,
        signature,
      }),
    ).toBe(true);
    expect(
      verifyEd25519Possession({
        publicKey: rawPublic,
        message: `${message}\nextra`,
        signature,
      }),
    ).toBe(false);
  });
});
