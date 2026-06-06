import http from "node:http";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./config.js";
import { prisma } from "./prisma.js";
import { processVideo } from "./videoProcessor.js";

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

let healthy = true;

const server = http.createServer((_request, response) => {
  response.statusCode = healthy ? 200 : 503;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ ok: healthy, service: "worker" }));
});

server.listen(env.WORKER_HEALTH_PORT, "0.0.0.0");

const worker = new Worker(
  "video-processing",
  async (job) => {
    const videoId = String(job.data?.videoId ?? "");
    if (!videoId) throw new Error("Missing videoId in job payload.");
    await processVideo(videoId);
  },
  {
    connection,
    concurrency: 1
  }
);

worker.on("completed", (job) => {
  console.log(`Processed video job ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Video job ${job?.id ?? "unknown"} failed`, error);
});

worker.on("error", (error) => {
  healthy = false;
  console.error("Worker error", error);
});

async function shutdown() {
  healthy = false;
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  server.close();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
