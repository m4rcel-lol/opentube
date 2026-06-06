import path from "node:path";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { allowedOrigins, env } from "./config/env.js";
import { optionalAuth } from "./middleware/auth.js";
import { registerCsrf } from "./middleware/csrf.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEmbedRoutes } from "./routes/embed.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerVideoRoutes } from "./routes/videos.js";
import { getSetting } from "./services/siteSettings.js";
import { forbidden, registerErrorHandler } from "./utils/errors.js";
import { ensureStorageDirs } from "./utils/media.js";

export async function buildApp() {
  await ensureStorageDirs();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    },
    bodyLimit: Math.max(1024 * 1024, Math.min(env.MAX_UPLOAD_BYTES, 25 * 1024 * 1024))
  });

  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    }
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute"
  });
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_BYTES,
      files: 1
    }
  });
  await app.register(fastifyStatic, {
    root: path.resolve(env.STORAGE_ROOT),
    prefix: "/media/",
    decorateReply: false
  });

  registerCsrf(app);

  app.addHook("preHandler", optionalAuth);
  app.addHook("preHandler", async (request) => {
    const pathOnly = request.url.split("?")[0] ?? request.url;
    if (
      pathOnly === "/health" ||
      pathOnly.startsWith("/media/") ||
      pathOnly.startsWith("/api/auth/") ||
      pathOnly === "/api/settings/public"
    ) {
      return;
    }
    if (request.user?.isBanned) {
      throw forbidden("This account has been suspended.");
    }
    if (request.user?.role === "ADMIN") return;
    const enabled = await getSetting<boolean>("maintenanceEnabled");
    if (!enabled) return;
    const message = await getSetting<string>("maintenanceMessage");
    throw forbidden(message || "OpenTube is temporarily down for maintenance.");
  });

  app.get("/health", async () => ({
    ok: true,
    service: "backend"
  }));

  await registerAuthRoutes(app);
  await registerAccountRoutes(app);
  await registerVideoRoutes(app);
  await registerUserRoutes(app);
  await registerSearchRoutes(app);
  await registerReportRoutes(app);
  await registerAdminRoutes(app);
  await registerEmbedRoutes(app);

  return app;
}
