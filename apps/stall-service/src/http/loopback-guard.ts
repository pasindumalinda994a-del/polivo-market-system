import type { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "../errors/app-error.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);

/**
 * True when the remote client address is loopback.
 * Used to keep provisioning routes off the LAN even when the service binds broadly.
 */
export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  const normalized = address.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalized)) {
    return true;
  }
  // Node may present IPv4-mapped IPv6 without the hostname alias.
  return normalized === "::ffff:127.0.0.1";
}

export function assertLoopbackOnly(request: FastifyRequest, reply: FastifyReply): void {
  const remote = request.socket.remoteAddress;
  if (!isLoopbackRemoteAddress(remote)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "This operation is only available from the stall host loopback interface.",
    });
  }
  void reply;
}
