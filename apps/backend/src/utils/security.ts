import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function hashWithSecret(value: string): string {
  return crypto.createHmac("sha256", env.VIEW_HASH_SECRET).update(value).digest("base64url");
}

export function requestIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || request.ip;
  }
  return request.ip;
}

export function requestUserAgent(request: FastifyRequest): string {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua : "";
}

export function requestFingerprint(request: FastifyRequest) {
  return {
    ipHash: hashWithSecret(requestIp(request)),
    userAgentHash: hashWithSecret(requestUserAgent(request))
  };
}
