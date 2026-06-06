import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { forbidden } from "../utils/errors.js";
import { randomToken } from "../utils/security.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function registerCsrf(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    let token = request.cookies[env.CSRF_COOKIE_NAME];
    if (!token) {
      token = randomToken(32);
      request.cookies[env.CSRF_COOKIE_NAME] = token;
      reply.setCookie(env.CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        path: "/"
      });
    }

    if (!unsafeMethods.has(request.method)) return;
    const header = request.headers["x-csrf-token"];
    if (typeof header !== "string" || header !== token) {
      throw forbidden("Invalid or missing CSRF token.");
    }
  });
}
