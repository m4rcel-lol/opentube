import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined) return undefined;
  return String(value) === "true";
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://localhost"),
  COOKIE_SECURE: booleanFromEnv.default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CSRF_COOKIE_NAME: z.string().min(1).default("ot_csrf"),
  SESSION_COOKIE_NAME: z.string().min(1).default("ot_session"),
  VIEW_HASH_SECRET: z.string().min(16),
  STORAGE_ROOT: z.string().min(1).default("./storage"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024 * 1024).default(512 * 1024 * 1024),
  OPENTUBE_ADMIN_USERNAME: z.string().optional(),
  OPENTUBE_ADMIN_EMAIL: z.string().optional(),
  OPENTUBE_ADMIN_PASSWORD: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const allowedOrigins = env.ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
