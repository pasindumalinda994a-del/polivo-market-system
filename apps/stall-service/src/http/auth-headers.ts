import type { FastifyRequest } from "fastify";

import type { DeviceProof } from "../auth/device-proof.js";
import { unauthenticatedError, type AppError } from "../errors/app-error.js";

export type RequestAuthMaterial = {
  deviceProof: DeviceProof;
  sessionSecret?: string;
};

function headerString(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0].trim();
  }
  return undefined;
}

export function readDeviceProofFromHeaders(request: FastifyRequest): DeviceProof | AppError {
  const deviceId = headerString(request, "x-polivo-device-id");
  const signedAt = headerString(request, "x-polivo-device-signed-at");
  const signature = headerString(request, "x-polivo-device-signature");
  if (!deviceId || !signedAt || !signature) {
    return unauthenticatedError("Device proof headers are required.");
  }
  return { deviceId, signedAt, signature };
}

export function readSessionSecretFromHeaders(request: FastifyRequest): string | AppError {
  const secret = headerString(request, "x-polivo-session");
  if (!secret) {
    return unauthenticatedError("Staff session is required.");
  }
  return secret;
}

export function readRequestAuthMaterial(
  request: FastifyRequest,
  options: { requireSession: boolean },
): RequestAuthMaterial | AppError {
  const deviceProof = readDeviceProofFromHeaders(request);
  if ("code" in deviceProof) {
    return deviceProof;
  }
  if (!options.requireSession) {
    return { deviceProof };
  }
  const sessionSecret = readSessionSecretFromHeaders(request);
  if (typeof sessionSecret !== "string") {
    return sessionSecret;
  }
  return { deviceProof, sessionSecret };
}
