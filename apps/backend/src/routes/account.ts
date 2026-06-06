import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { accountProfileSchema, paginationSchema } from "@opentube/shared";
import type { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import { prisma } from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";
import {
  channelStats,
  ratingStats,
  serializePublicUser,
  serializeVideoSummary
} from "../services/serializers.js";
import { sanitizeChannelCustomization, sanitizeText } from "../utils/sanitize.js";
import { pagination } from "../utils/pagination.js";
import { badRequest } from "../utils/errors.js";
import { compressUploadedImage, removeIfExists, storagePath, validateUploadedImage } from "../utils/media.js";

const avatarMaxBytes = 5 * 1024 * 1024;
const bannerMaxBytes = 10 * 1024 * 1024;

async function saveAccountImage(
  request: FastifyRequest,
  kind: "avatar" | "banner"
) {
  const file = await request.file();
  if (!file) throw badRequest("Upload must include an image file.");

  const maxBytes = kind === "avatar" ? avatarMaxBytes : bannerMaxBytes;
  const folder = kind === "avatar" ? "avatars" : "banners";
  const tmpRelativePath = path.posix.join(folder, `${request.user!.id}-${nanoid(10)}.tmp`);
  const tmpPath = storagePath(tmpRelativePath);
  let finalPath: string | null = null;

  await pipeline(file.file, createWriteStream(tmpPath));
  const stat = await fs.stat(tmpPath);
  if (file.file.truncated || stat.size > maxBytes) {
    await removeIfExists(tmpPath);
    throw badRequest(`${kind === "avatar" ? "Profile picture" : "Banner"} must be ${Math.floor(maxBytes / 1024 / 1024)}MB or smaller.`);
  }

  try {
    await validateUploadedImage(tmpPath);
    const finalRelativePath = path.posix.join(folder, `${request.user!.id}-${nanoid(10)}.webp`);
    finalPath = storagePath(finalRelativePath);
    await compressUploadedImage(tmpPath, finalPath, kind);
    await removeIfExists(tmpPath);
    return finalRelativePath;
  } catch (error) {
    await removeIfExists(tmpPath);
    if (finalPath) await removeIfExists(finalPath);
    throw error;
  }
}

export async function registerAccountRoutes(app: FastifyInstance) {
  app.get("/api/account/profile", { preHandler: requireUser }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    return {
      user: serializePublicUser(user, await channelStats(user.id)),
      email: user.email
    };
  });

  app.patch("/api/account/profile", { preHandler: requireUser }, async (request) => {
    const parsed = accountProfileSchema.parse(request.body);
    const data: Prisma.UserUpdateInput = {};
    if (parsed.email !== undefined) data.email = parsed.email;
    if (parsed.channelDescription !== undefined) data.channelDescription = sanitizeText(parsed.channelDescription);
    if (parsed.avatarPath !== undefined) {
      data.avatarPath = parsed.avatarPath && parsed.avatarPath.startsWith("avatars/") ? sanitizeText(parsed.avatarPath) : null;
    }
    if (parsed.bannerPath !== undefined) {
      data.bannerPath = parsed.bannerPath && parsed.bannerPath.startsWith("banners/") ? sanitizeText(parsed.bannerPath) : null;
    }
    if (parsed.channelCustomization !== undefined) data.channelCustomization = sanitizeChannelCustomization(parsed.channelCustomization);
    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data
    });

    return {
      user: serializePublicUser(user, await channelStats(user.id)),
      email: user.email
    };
  });

  app.post("/api/account/avatar", { preHandler: requireUser }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    const avatarPath = await saveAccountImage(request, "avatar");
    const updated = await prisma.user.update({
      where: { id: request.user!.id },
      data: { avatarPath }
    });
    if (user.avatarPath?.startsWith("avatars/")) await removeIfExists(storagePath(user.avatarPath));
    return {
      user: serializePublicUser(updated, await channelStats(updated.id)),
      email: updated.email
    };
  });

  app.post("/api/account/banner", { preHandler: requireUser }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    const bannerPath = await saveAccountImage(request, "banner");
    const updated = await prisma.user.update({
      where: { id: request.user!.id },
      data: { bannerPath }
    });
    if (user.bannerPath?.startsWith("banners/")) await removeIfExists(storagePath(user.bannerPath));
    return {
      user: serializePublicUser(updated, await channelStats(updated.id)),
      email: updated.email
    };
  });

  app.get("/api/account/videos", { preHandler: requireUser }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const count = await prisma.video.count({ where: { ownerId: request.user!.id } });
    const page = pagination(parsed.page, parsed.pageSize, count);
    const videos = await prisma.video.findMany({
      where: { ownerId: request.user!.id },
      include: { owner: { select: { id: true, username: true, isVerified: true } } },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
    const stats = await ratingStats(videos.map((video) => video.id));
    return {
      items: videos.map((video) => serializeVideoSummary(video, stats.get(video.id))),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.get("/api/account/favorites", { preHandler: requireUser }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const where = { userId: request.user!.id, video: { status: "READY" as const, visibility: "PUBLIC" as const } };
    const count = await prisma.favorite.count({ where });
    const page = pagination(parsed.page, parsed.pageSize, count);
    const favorites = await prisma.favorite.findMany({
      where,
      include: {
        video: {
          include: { owner: { select: { id: true, username: true, isVerified: true } } }
        }
      },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
    const videos = favorites.map((favorite) => favorite.video);
    const stats = await ratingStats(videos.map((video) => video.id));
    return {
      items: videos.map((video) => serializeVideoSummary(video, stats.get(video.id))),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.get("/api/account/subscriptions", { preHandler: requireUser }, async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const count = await prisma.subscription.count({ where: { subscriberId: request.user!.id } });
    const page = pagination(parsed.page, parsed.pageSize, count);
    const subscriptions = await prisma.subscription.findMany({
      where: { subscriberId: request.user!.id },
      include: { channelOwner: true },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });

    const users = await Promise.all(
      subscriptions.map(async (subscription) =>
        serializePublicUser(subscription.channelOwner, await channelStats(subscription.channelOwner.id))
      )
    );
    return {
      items: users,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });
}
