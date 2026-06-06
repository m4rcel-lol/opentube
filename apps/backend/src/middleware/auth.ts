import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@opentube/shared";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { forbidden, unauthorized } from "../utils/errors.js";
import { randomToken, requestFingerprint, sha256 } from "../utils/security.js";

const roleRank: Record<UserRole, number> = {
  USER: 1,
  MODERATOR: 2,
  ADMIN: 3
};

function roleValue(role: UserRole | undefined) {
  return role ? roleRank[role] : 0;
}

export async function createSession(request: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = randomToken(48);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const fingerprint = requestFingerprint(request);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash
    }
  });

  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[env.SESSION_COOKIE_NAME];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
}

export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[env.SESSION_COOKIE_NAME];
  if (!token) return;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isBanned: true,
          isVerified: true
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return;
  }

  request.sessionId = session.id;
  request.user = session.user;
}

export async function requireUser(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw unauthorized();
}

export function requireRole(minRole: UserRole) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) throw unauthorized();
    if (roleValue(request.user.role) < roleValue(minRole)) throw forbidden();
  };
}

export function canModerate(user: FastifyRequest["user"]) {
  return roleValue(user?.role) >= roleValue("MODERATOR");
}

export function canAdmin(user: FastifyRequest["user"]) {
  return roleValue(user?.role) >= roleValue("ADMIN");
}
