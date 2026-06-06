import type { FastifyInstance } from "fastify";
import { adminSettingsPatchSchema, adminUserPatchSchema, paginationSchema, videoPatchSchema } from "@opentube/shared";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { getPublicSettings, upsertSettings } from "../services/siteSettings.js";
import {
  channelStats,
  ratingStats,
  serializeComment,
  serializePublicUser,
  serializeVideoSummary
} from "../services/serializers.js";
import { badRequest, notFound } from "../utils/errors.js";
import { pagination } from "../utils/pagination.js";
import { sanitizeTags, sanitizeText } from "../utils/sanitize.js";

const idParamSchema = z.object({ id: z.string().trim().min(1) });

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/settings/public", async () => ({
    settings: await getPublicSettings()
  }));

  app.get("/api/admin/stats", { preHandler: requireRole("MODERATOR") }, async () => {
    const [users, bannedUsers, videos, readyVideos, failedVideos, removedVideos, comments, channelComments, openReports, views] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.video.count(),
      prisma.video.count({ where: { status: "READY" } }),
      prisma.video.count({ where: { status: "FAILED" } }),
      prisma.video.count({ where: { status: "REMOVED" } }),
      prisma.comment.count(),
      prisma.channelComment.count(),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.viewEvent.count()
    ]);
    return { users, bannedUsers, videos, readyVideos, failedVideos, removedVideos, comments, channelComments, openReports, views };
  });

  app.get("/api/admin/reports", { preHandler: requireRole("MODERATOR") }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const count = await prisma.report.count();
    const page = pagination(parsed.page, parsed.pageSize, count);
    const reports = await prisma.report.findMany({
      include: { reporter: { select: { id: true, username: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: page.skip,
      take: page.take
    });
    return {
      items: reports.map((report) => ({
        ...report,
        createdAt: report.createdAt.toISOString(),
        reviewedAt: report.reviewedAt?.toISOString() ?? null
      })),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.patch("/api/admin/reports/:id", { preHandler: requireRole("MODERATOR") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = z.object({ status: z.enum(["OPEN", "REVIEWED", "DISMISSED"]) }).parse(request.body);
    const report = await prisma.report.update({
      where: { id },
      data: {
        status: parsed.status,
        reviewedAt: parsed.status === "OPEN" ? null : new Date()
      }
    });
    return { report };
  });

  app.get("/api/admin/videos", { preHandler: requireRole("ADMIN") }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const count = await prisma.video.count();
    const page = pagination(parsed.page, parsed.pageSize, count);
    const videos = await prisma.video.findMany({
      include: { owner: { select: { id: true, username: true, isVerified: true } } },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
    const stats = await ratingStats(videos.map((video) => video.id));
    return {
      items: videos.map((video) => ({
        ...serializeVideoSummary(video, stats.get(video.id)),
        ownerId: video.ownerId,
        visibility: video.visibility,
        allowEmbedding: video.allowEmbedding
      })),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.patch("/api/admin/videos/:id", { preHandler: requireRole("ADMIN") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = videoPatchSchema.parse(request.body);
    const existing = await prisma.video.findUnique({ where: { id } });
    if (!existing) throw notFound("Video not found.");
    const data = {
      ...(parsed.title !== undefined ? { title: sanitizeText(parsed.title) } : {}),
      ...(parsed.description !== undefined ? { description: sanitizeText(parsed.description) } : {}),
      ...(parsed.tags !== undefined ? { tags: sanitizeTags(parsed.tags) } : {}),
      ...(parsed.category !== undefined ? { category: sanitizeText(parsed.category) } : {}),
      ...(parsed.visibility !== undefined ? { visibility: parsed.visibility } : {}),
      ...(parsed.allowEmbedding !== undefined ? { allowEmbedding: parsed.allowEmbedding } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {})
    };
    const video = await prisma.video.update({
      where: { id },
      data,
      include: { owner: { select: { id: true, username: true, isVerified: true } } }
    });
    const stats = await ratingStats([video.id]);
    return {
      video: {
        ...serializeVideoSummary(video, stats.get(video.id)),
        ownerId: video.ownerId,
        visibility: video.visibility,
        allowEmbedding: video.allowEmbedding
      }
    };
  });

  app.get("/api/admin/users", { preHandler: requireRole("ADMIN") }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const count = await prisma.user.count();
    const page = pagination(parsed.page, parsed.pageSize, count);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
    const items = await Promise.all(
      users.map(async (user) => ({
        ...serializePublicUser(user, await channelStats(user.id)),
        email: user.email,
        isBanned: user.isBanned
      }))
    );
    return {
      items,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.patch("/api/admin/users/:id", { preHandler: requireRole("ADMIN") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = adminUserPatchSchema.parse(request.body);
    const data: Prisma.UserUpdateInput = {};
    if (parsed.role !== undefined) data.role = parsed.role;
    if (parsed.isBanned !== undefined) data.isBanned = parsed.isBanned;
    if (parsed.isVerified !== undefined) data.isVerified = parsed.isVerified;
    const user = await prisma.user.update({
      where: { id },
      data
    });
    return { user: { ...serializePublicUser(user, await channelStats(user.id)), isBanned: user.isBanned, isVerified: user.isVerified } };
  });

  app.delete("/api/admin/comments/:id", { preHandler: requireRole("MODERATOR") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const comment = await prisma.comment.update({
      where: { id },
      data: { isRemoved: true, body: "" },
      include: { user: { select: { username: true, avatarPath: true, isVerified: true } } }
    });
    return { comment: serializeComment(comment) };
  });

  app.get("/api/admin/comments", { preHandler: requireRole("MODERATOR") }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const [videoCount, channelCount] = await Promise.all([
      prisma.comment.count(),
      prisma.channelComment.count()
    ]);
    const page = pagination(parsed.page, parsed.pageSize, videoCount + channelCount);
    const [videoComments, channelComments] = await Promise.all([
      prisma.comment.findMany({
        include: {
          user: { select: { id: true, username: true } },
          video: { select: { id: true, title: true } }
        },
        orderBy: { createdAt: "desc" },
        take: page.skip + page.take
      }),
      prisma.channelComment.findMany({
        include: {
          user: { select: { id: true, username: true } },
          channelOwner: { select: { id: true, username: true } }
        },
        orderBy: { createdAt: "desc" },
        take: page.skip + page.take
      })
    ]);
    const items = [
      ...videoComments.map((comment) => ({
        id: comment.id,
        targetType: "VIDEO" as const,
        targetId: comment.videoId,
        targetLabel: comment.video.title,
        targetPath: `/watch/${comment.videoId}`,
        userId: comment.userId,
        username: comment.user.username,
        body: comment.isRemoved ? "[removed]" : comment.body,
        isRemoved: comment.isRemoved,
        createdAt: comment.createdAt.toISOString()
      })),
      ...channelComments.map((comment) => ({
        id: comment.id,
        targetType: "CHANNEL" as const,
        targetId: comment.channelOwnerId,
        targetLabel: comment.channelOwner.username,
        targetPath: `/user/${comment.channelOwner.username}`,
        userId: comment.userId,
        username: comment.user.username,
        body: comment.isRemoved ? "[removed]" : comment.body,
        isRemoved: comment.isRemoved,
        createdAt: comment.createdAt.toISOString()
      }))
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(page.skip, page.skip + page.take);

    return {
      items,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.delete("/api/admin/channel-comments/:id", { preHandler: requireRole("MODERATOR") }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await prisma.channelComment.update({
      where: { id },
      data: { isRemoved: true, body: "" }
    });
    return { ok: true };
  });

  app.get("/api/admin/settings", { preHandler: requireRole("ADMIN") }, async () => ({
    settings: await getPublicSettings()
  }));

  app.patch("/api/admin/settings", { preHandler: requireRole("ADMIN") }, async (request) => {
    const parsed = adminSettingsPatchSchema.parse(request.body);
    if (typeof parsed.embeddingEnabled !== "undefined" && typeof parsed.embeddingEnabled !== "boolean") {
      throw badRequest("embeddingEnabled must be a boolean.");
    }
    if (typeof parsed.allowRegistration !== "undefined" && typeof parsed.allowRegistration !== "boolean") {
      throw badRequest("allowRegistration must be a boolean.");
    }
    if (typeof parsed.maintenanceEnabled !== "undefined" && typeof parsed.maintenanceEnabled !== "boolean") {
      throw badRequest("maintenanceEnabled must be a boolean.");
    }
    if (typeof parsed.announcementEnabled !== "undefined" && typeof parsed.announcementEnabled !== "boolean") {
      throw badRequest("announcementEnabled must be a boolean.");
    }
    if (typeof parsed.maxUploadBytes !== "undefined") {
      const value = Number(parsed.maxUploadBytes);
      if (!Number.isInteger(value) || value < 1024 * 1024) throw badRequest("maxUploadBytes must be at least 1 MiB.");
      parsed.maxUploadBytes = value;
    }
    if (typeof parsed.siteName !== "undefined") parsed.siteName = sanitizeText(String(parsed.siteName)).slice(0, 80);
    if (typeof parsed.tagline !== "undefined") parsed.tagline = sanitizeText(String(parsed.tagline)).slice(0, 160);
    if (typeof parsed.maintenanceMessage !== "undefined") parsed.maintenanceMessage = sanitizeText(String(parsed.maintenanceMessage)).slice(0, 500);
    if (typeof parsed.announcementText !== "undefined") parsed.announcementText = sanitizeText(String(parsed.announcementText)).slice(0, 500);
    if (typeof parsed.announcementLink !== "undefined") parsed.announcementLink = sanitizeText(String(parsed.announcementLink)).slice(0, 300);
    if (typeof parsed.announcementKind !== "undefined" && !["INFO", "WARNING"].includes(String(parsed.announcementKind))) {
      throw badRequest("announcementKind must be INFO or WARNING.");
    }
    return { settings: await upsertSettings(parsed) };
  });
}
