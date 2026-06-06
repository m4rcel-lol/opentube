import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  STORAGE_ROOT: z.string().min(1).default("./storage"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3002)
});

export const env = envSchema.parse(process.env);
