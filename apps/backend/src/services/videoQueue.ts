import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const videoQueueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const videoProcessingQueue = new Queue("video-processing", {
  connection: videoQueueConnection
});

export async function enqueueVideoProcessing(videoId: string) {
  await videoProcessingQueue.add(
    "process-video",
    { videoId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 }
    }
  );
}
