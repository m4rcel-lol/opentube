import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma, Video } from "@prisma/client";
import {
  commentCreateSchema,
  paginationSchema,
  ratingSchema,
  searchQuerySchema,
  videoMetadataSchema,
  videoPatchSchema
} from "@opentube/shared";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { canAdmin, canModerate, requireUser } from "../middleware/auth.js";
import { enqueueVideoProcessing } from "../services/videoQueue.js";
import {
  ratingStats,
  serializeComment,
  serializeVideoDetail,
  serializeVideoSummary
} from "../services/serializers.js";
import { AppError, badRequest, forbidden, notFound } from "../utils/errors.js";
import { mediaUrl, removeIfExists, storagePath, validateUploadedVideo } from "../utils/media.js";
import { pagination } from "../utils/pagination.js";
import { requestFingerprint } from "../utils/security.js";
import { sanitizeTags, sanitizeText } from "../utils/sanitize.js";

const idParamSchema = z.object({ id: z.string().trim().min(1) });

function publicVideoWhere(extra: Prisma.VideoWhereInput = {}): Prisma.VideoWhereInput {
  return {
    status: "READY",
    visibility: "PUBLIC",
    ...extra
  };
}

async function listVideos(where: Prisma.VideoWhereInput, page: number, pageSize: number, sort: "recent" | "most-viewed" | "top-rated") {
  const pageInfo = pagination(page, pageSize, await prisma.video.count({ where }));
  if (sort === "top-rated") {
    const total = await prisma.video.count({ where: { ...where, ratings: { some: {} } } });
    const topPage = pagination(page, pageSize, total);
    const groups = await prisma.rating.groupBy({
      by: ["videoId"],
      where: { video: where },
      _avg: { ratingValue: true },
      _count: { ratingValue: true },
      orderBy: [{ _avg: { ratingValue: "desc" } }, { _count: { ratingValue: "desc" } }],
      skip: topPage.skip,
      take: topPage.take
    });
    const ids = groups.map((group) => group.videoId);
    const videos = await prisma.video.findMany({
      where: { id: { in: ids } },
      include: { owner: { select: { id: true, username: true, isVerified: true } } }
    });
    const byId = new Map(videos.map((video) => [video.id, video]));
    const stats = await ratingStats(ids);
    return {
      items: ids.flatMap((id) => {
        const video = byId.get(id);
        return video ? [serializeVideoSummary(video, stats.get(id))] : [];
      }),
      page: topPage.page,
      pageSize: topPage.pageSize,
      total: topPage.total,
      totalPages: topPage.totalPages
    };
  }

  const videos = await prisma.video.findMany({
    where,
    include: { owner: { select: { id: true, username: true, isVerified: true } } },
    orderBy: sort === "most-viewed" ? [{ views: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    skip: pageInfo.skip,
    take: pageInfo.take
  });
  const stats = await ratingStats(videos.map((video) => video.id));
  return {
    items: videos.map((video) => serializeVideoSummary(video, stats.get(video.id))),
    page: pageInfo.page,
    pageSize: pageInfo.pageSize,
    total: pageInfo.total,
    totalPages: pageInfo.totalPages
  };
}

function canViewVideo(video: Pick<Video, "ownerId" | "status" | "visibility">, request: FastifyRequest) {
  if (canAdmin(request.user)) return true;
  if (request.user?.id === video.ownerId) return true;
  if (video.status !== "READY") return false;
  return video.visibility === "PUBLIC" || video.visibility === "UNLISTED";
}

function canMutateVideo(video: Pick<Video, "ownerId">, request: FastifyRequest) {
  return request.user?.id === video.ownerId || canAdmin(request.user);
}

async function loadVideoForViewer(id: string, request: FastifyRequest) {
  const video = await prisma.video.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, username: true, isVerified: true } },
      _count: { select: { comments: true } }
    }
  });
  if (!video || video.status === "REMOVED") throw notFound("Video unavailable.");
  if (!canViewVideo(video, request)) throw notFound("Video unavailable.");
  return video;
}

async function serializeDetailForRequest(video: Awaited<ReturnType<typeof loadVideoForViewer>>, request: FastifyRequest) {
  const [statsMap, viewerRating, favorite] = await Promise.all([
    ratingStats([video.id]),
    request.user
      ? prisma.rating.findUnique({
          where: { videoId_userId: { videoId: video.id, userId: request.user.id } },
          select: { ratingValue: true }
        })
      : Promise.resolve(null),
    request.user
      ? prisma.favorite.findUnique({
          where: { videoId_userId: { videoId: video.id, userId: request.user.id } },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);
  return serializeVideoDetail(video, statsMap.get(video.id) ?? { averageRating: 0, ratingCount: 0 }, viewerRating?.ratingValue ?? null, Boolean(favorite));
}

export async function registerVideoRoutes(app: FastifyInstance) {
  app.get("/api/videos", async (request) => {
    const parsed = searchQuerySchema.parse(request.query);
    const where = publicVideoWhere(parsed.category ? { category: parsed.category } : {});
    return listVideos(where, parsed.page, parsed.pageSize, parsed.sort);
  });

  app.get("/api/videos/:id", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const video = await loadVideoForViewer(id, request);
    return { video: await serializeDetailForRequest(video, request) };
  });

  app.post("/api/videos", { preHandler: requireUser }, async (request, reply) => {
    const parsed = videoMetadataSchema.parse(request.body);
    const video = await prisma.video.create({
      data: {
        ownerId: request.user!.id,
        title: sanitizeText(parsed.title),
        description: sanitizeText(parsed.description),
        tags: sanitizeTags(parsed.tags),
        category: sanitizeText(parsed.category),
        visibility: parsed.visibility,
        allowEmbedding: parsed.allowEmbedding,
        status: "UPLOADING"
      },
      include: {
        owner: { select: { id: true, username: true, isVerified: true } },
        _count: { select: { comments: true } }
      }
    });
    await reply.status(201).send({ video: await serializeDetailForRequest(video, request) });
  });

  app.post(
    "/api/videos/:id/upload",
    {
      preHandler: requireUser,
      config: { rateLimit: { max: 8, timeWindow: "1 hour" } }
    },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const video = await prisma.video.findUnique({ where: { id } });
      if (!video) throw notFound("Video not found.");
      if (!canMutateVideo(video, request)) throw forbidden();
      if (video.status === "REMOVED") throw badRequest("Removed videos cannot be uploaded.");

      const file = await request.file();
      if (!file) throw badRequest("Upload must include a video file.");

      const tmpRelativePath = path.posix.join("uploads", `${id}-upload.tmp`);
      const tmpPath = storagePath(tmpRelativePath);
      await pipeline(file.file, createWriteStream(tmpPath));
      if (file.file.truncated) {
        await removeIfExists(tmpPath);
        throw badRequest("Upload exceeds the configured size limit.");
      }

      try {
        const detected = await validateUploadedVideo(tmpPath);
        const finalRelativePath = path.posix.join("uploads", `${id}-original.${detected.extension}`);
        const finalPath = storagePath(finalRelativePath);
        await fs.rename(tmpPath, finalPath);

        await prisma.$transaction([
          prisma.videoVariant.deleteMany({ where: { videoId: id } }),
          prisma.video.update({
            where: { id },
            data: {
              originalFilePath: finalRelativePath,
              processedFilePath: null,
              thumbnailPath: null,
              duration: null,
              status: "PROCESSING"
            }
          })
        ]);

        if (video.originalFilePath && video.originalFilePath !== finalRelativePath) {
          await removeIfExists(storagePath(video.originalFilePath));
        }

        await enqueueVideoProcessing(id);
        const updated = await loadVideoForViewer(id, request);
        await reply.send({ video: await serializeDetailForRequest(updated, request) });
      } catch (error) {
        await removeIfExists(tmpPath);
        await prisma.video.update({ where: { id }, data: { status: "FAILED" } });
        if (error instanceof AppError) throw error;
        throw new AppError(500, "Upload was saved but processing could not be queued.");
      }
    }
  );

  app.patch("/api/videos/:id", { preHandler: requireUser }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw notFound("Video not found.");
    if (!canMutateVideo(video, request)) throw forbidden();

    const parsed = videoPatchSchema.parse(request.body);
    const data: Prisma.VideoUpdateInput = {};
    if (parsed.title !== undefined) data.title = sanitizeText(parsed.title);
    if (parsed.description !== undefined) data.description = sanitizeText(parsed.description);
    if (parsed.tags !== undefined) data.tags = sanitizeTags(parsed.tags);
    if (parsed.category !== undefined) data.category = sanitizeText(parsed.category);
    if (parsed.visibility !== undefined) data.visibility = parsed.visibility;
    if (parsed.allowEmbedding !== undefined) data.allowEmbedding = parsed.allowEmbedding;
    if (parsed.status !== undefined && canAdmin(request.user)) data.status = parsed.status;

    await prisma.video.update({ where: { id }, data });
    const updated = await loadVideoForViewer(id, request);
    return { video: await serializeDetailForRequest(updated, request) };
  });

  app.delete("/api/videos/:id", { preHandler: requireUser }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) throw notFound("Video not found.");
    if (!canMutateVideo(video, request)) throw forbidden();
    await prisma.video.update({ where: { id }, data: { status: "REMOVED" } });
    return { ok: true };
  });

  app.post("/api/videos/:id/view", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const video = await loadVideoForViewer(id, request);
    if (video.status !== "READY") return { counted: false, views: video.views };

    const fingerprint = requestFingerprint(request);
    const recent = await prisma.viewEvent.findFirst({
      where: {
        videoId: id,
        ipHash: fingerprint.ipHash,
        userAgentHash: fingerprint.userAgentHash,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      select: { id: true }
    });

    if (recent) return { counted: false, views: video.views };

    const updated = await prisma.$transaction(async (tx) => {
      await tx.viewEvent.create({
        data: {
          videoId: id,
          viewerUserId: request.user?.id ?? null,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash
        }
      });
      return tx.video.update({ where: { id }, data: { views: { increment: 1 } }, select: { views: true } });
    });

    return { counted: true, views: updated.views };
  });

  app.post("/api/videos/:id/rate", { preHandler: requireUser }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await loadVideoForViewer(id, request);
    const parsed = ratingSchema.parse(request.body);
    await prisma.rating.upsert({
      where: { videoId_userId: { videoId: id, userId: request.user!.id } },
      update: { ratingValue: parsed.ratingValue },
      create: { videoId: id, userId: request.user!.id, ratingValue: parsed.ratingValue }
    });
    const stats = await ratingStats([id]);
    return { rating: parsed.ratingValue, stats: stats.get(id) ?? { averageRating: 0, ratingCount: 0 } };
  });

  app.post("/api/videos/:id/favorite", { preHandler: requireUser }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await loadVideoForViewer(id, request);
    await prisma.favorite.upsert({
      where: { videoId_userId: { videoId: id, userId: request.user!.id } },
      update: {},
      create: { videoId: id, userId: request.user!.id }
    });
    return { favorited: true };
  });

  app.delete("/api/videos/:id/favorite", { preHandler: requireUser }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await prisma.favorite.deleteMany({ where: { videoId: id, userId: request.user!.id } });
    return { favorited: false };
  });

  app.get("/api/videos/:id/comments", async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await loadVideoForViewer(id, request);
    const parsed = paginationSchema.parse(request.query);
    const total = await prisma.comment.count({ where: { videoId: id } });
    const page = pagination(parsed.page, parsed.pageSize, total);
    const comments = await prisma.comment.findMany({
      where: { videoId: id },
      include: { user: { select: { username: true, avatarPath: true, isVerified: true } } },
      orderBy: { createdAt: "asc" },
      skip: page.skip,
      take: page.take
    });
    return {
      items: comments.map(serializeComment),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.post("/api/videos/:id/comments", { preHandler: requireUser }, async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const video = await loadVideoForViewer(id, request);
    if (video.status !== "READY") throw badRequest("Comments are only available when the video is ready.");
    const parsed = commentCreateSchema.parse(request.body);
    if (parsed.parentId) {
      const parent = await prisma.comment.findFirst({ where: { id: parsed.parentId, videoId: id } });
      if (!parent) throw badRequest("Parent comment does not belong to this video.");
    }
    const comment = await prisma.comment.create({
      data: {
        videoId: id,
        userId: request.user!.id,
        parentId: parsed.parentId ?? null,
        body: sanitizeText(parsed.body)
      },
      include: { user: { select: { username: true, avatarPath: true, isVerified: true } } }
    });
    await reply.status(201).send({ comment: serializeComment(comment) });
  });

  app.delete("/api/comments/:id", { preHandler: requireUser }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) throw notFound("Comment not found.");
    if (comment.userId !== request.user!.id && !canModerate(request.user)) throw forbidden();
    await prisma.comment.update({
      where: { id },
      data: { isRemoved: true, body: "" }
    });
    return { ok: true };
  });
}

export { listVideos, publicVideoWhere };
