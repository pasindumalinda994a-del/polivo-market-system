import { generateKeyPairSync, sign, createPrivateKey, createPublicKey } from "node:crypto";

export type DeviceKeyPair = {
  /** base64url raw 32-byte public key */
  publicKey: string;
  /** base64url PKCS8 DER private key for secure storage */
  privateKeyPkcs8: string;
};

export function generateDeviceKeyPair(): DeviceKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  // SPKI for Ed25519 ends with the raw 32-byte key.
  const rawPublic = publicDer.subarray(publicDer.length - 32);
  const privatePkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
  return {
    publicKey: Buffer.from(rawPublic).toString("base64url"),
    privateKeyPkcs8: Buffer.from(privatePkcs8).toString("base64url"),
  };
}

export function signPossessionMessage(privateKeyPkcs8: string, message: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(null, Buffer.from(message, "utf8"), key);
  return Buffer.from(signature).toString("base64url");
}

export function publicKeyFromPrivate(privateKeyPkcs8: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const rawPublic = publicDer.subarray(publicDer.length - 32);
  return Buffer.from(rawPublic).toString("base64url");
}

export function buildRedeemPossessionMessage(input: {
  installationId: string;
  publicKey: string;
  deploymentEnvironment: string;
}): string {
  return [
    "polivo-redeem-v1",
    input.installationId,
    input.publicKey,
    input.deploymentEnvironment,
  ].join("\n");
}

export function buildConfirmPossessionMessage(input: {
  tenantId: string;
  deviceId: string;
  installationId: string;
  publicKey: string;
  credentialVersion: number;
}): string {
  return [
    "polivo-confirm-v1",
    input.tenantId,
    input.deviceId,
    input.installationId,
    input.publicKey,
    String(input.credentialVersion),
  ].join("\n");
}
