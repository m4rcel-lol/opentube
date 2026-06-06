import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { buildApp } from "./app.js";
import { bootstrapAdminFromEnv } from "./scripts/createAdmin.js";
import { videoQueueConnection } from "./services/videoQueue.js";

const app = await buildApp();

await bootstrapAdminFromEnv();

const shutdown = async () => {
  await app.close();
  await videoQueueConnection.quit();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await app.listen({ host: "0.0.0.0", port: env.BACKEND_PORT });
