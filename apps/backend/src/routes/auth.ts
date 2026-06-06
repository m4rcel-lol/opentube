import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { loginSchema, registerSchema } from "@opentube/shared";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { clearSession, createSession, requireUser } from "../middleware/auth.js";
import { getSetting } from "../services/siteSettings.js";
import { serializePublicUser } from "../services/serializers.js";
import { conflict, forbidden, unauthorized } from "../utils/errors.js";
import { sanitizeText } from "../utils/sanitize.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/csrf", async (request) => ({
    csrfToken: request.cookies[env.CSRF_COOKIE_NAME] ?? null
  }));

  app.post(
    "/api/auth/register",
    {
      config: { rateLimit: { max: 8, timeWindow: "10 minutes" } }
    },
    async (request, reply) => {
      const allowRegistration = await getSetting<boolean>("allowRegistration");
      if (!allowRegistration) throw forbidden("Registration is disabled.");

      const parsed = registerSchema.parse(request.body);
      const username = sanitizeText(parsed.username.toLowerCase());
      const email = parsed.email;

      const existing = await prisma.user.findFirst({
        where: { OR: [{ username }, { email }] },
        select: { id: true }
      });
      if (existing) throw conflict("Username or email is already registered.");

      const passwordHash = await argon2.hash(parsed.password);
      const user = await prisma.user.create({
        data: { username, email, passwordHash }
      });
      await createSession(request, reply, user.id);
      await reply.status(201).send({ user: serializePublicUser(user) });
    }
  );

  app.post(
    "/api/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }
    },
    async (request, reply) => {
      const parsed = loginSchema.parse(request.body);
      const usernameOrEmail = sanitizeText(parsed.usernameOrEmail.toLowerCase());

      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }]
        }
      });
      if (!user) throw unauthorized("Invalid username/email or password.");

      const ok = await argon2.verify(user.passwordHash, parsed.password);
      if (!ok) throw unauthorized("Invalid username/email or password.");

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await createSession(request, reply, user.id);
      await reply.send({ user: serializePublicUser(user) });
    }
  );

  app.post("/api/auth/logout", { preHandler: requireUser }, async (request, reply) => {
    await clearSession(request, reply);
    await reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (request) => {
    if (!request.user) return { user: null };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
    return { user: serializePublicUser(user) };
  });
}
