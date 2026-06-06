import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@opentube/shared";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { canAdmin, canModerate, requireUser } from "../middleware/auth.js";
import {
  channelStats,
  ratingStats,
  serializePublicUser,
  serializeVideoSummary
} from "../services/serializers.js";
import { forbidden, notFound } from "../utils/errors.js";
import { mediaUrl } from "../utils/media.js";
import { pagination } from "../utils/pagination.js";
import { sanitizeText } from "../utils/sanitize.js";

const usernameParamSchema = z.object({ username: z.string().trim().min(1).max(31) });
const commentBodySchema = z.object({ body: z.string().trim().min(1).max(2000) });
const verifiedSubscriberThreshold = 100000;

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/api/users/:username", async (request) => {
    const { username } = usernameParamSchema.parse(request.params);
    const user = await prisma.user.findUnique({ where: { username: sanitizeText(username.toLowerCase()) } });
    if (!user) throw notFound("User not found.");
    const isSubscribed = request.user && !user.isBanned
      ? Boolean(
          await prisma.subscription.findUnique({
            where: {
              subscriberId_channelOwnerId: {
                subscriberId: request.user.id,
                channelOwnerId: user.id
              }
            }
          })
        )
      : false;

    const publicUser = serializePublicUser(user, user.isBanned ? { videosUploaded: 0, subscribers: 0, totalViews: 0 } : await channelStats(user.id));
    if (user.isBanned) publicUser.channelDescription = "";

    return {
      user: publicUser,
      isSubscribed
    };
  });

  app.get("/api/users/:username/videos", async (request) => {
    const { username } = usernameParamSchema.parse(request.params);
    const parsed = paginationSchema.parse(request.query);
    const user = await prisma.user.findUnique({ where: { username: sanitizeText(username.toLowerCase()) } });
    if (!user) throw notFound("User not found.");
    if (user.isBanned) {
      return { items: [], page: 1, pageSize: parsed.pageSize, total: 0, totalPages: 1 };
    }

    const canSeePrivate = request.user?.id === user.id || canAdmin(request.user);
    const where = {
      ownerId: user.id,
      ...(canSeePrivate ? {} : { status: "READY" as const, visibility: "PUBLIC" as const })
    };
    const count = await prisma.video.count({ where });
    const page = pagination(parsed.page, parsed.pageSize, count);
    const videos = await prisma.video.findMany({
      where,
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

  app.post("/api/users/:username/subscribe", { preHandler: requireUser }, async (request) => {
    const { username } = usernameParamSchema.parse(request.params);
    const user = await prisma.user.findUnique({ where: { username: sanitizeText(username.toLowerCase()) } });
    if (!user || user.isBanned) throw notFound("User not found.");
    if (user.id === request.user!.id) throw forbidden("You cannot subscribe to yourself.");
    await prisma.subscription.upsert({
      where: {
        subscriberId_channelOwnerId: {
          subscriberId: request.user!.id,
          channelOwnerId: user.id
        }
      },
      update: {},
      create: {
        subscriberId: request.user!.id,
        channelOwnerId: user.id
      }
    });
    const subscribers = await prisma.subscription.count({ where: { channelOwnerId: user.id } });
    if (!user.isVerified && subscribers >= verifiedSubscriberThreshold) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true }
      });
    }
    return { subscribed: true, isVerified: user.isVerified || subscribers >= verifiedSubscriberThreshold };
  });

  app.delete("/api/users/:username/subscribe", { preHandler: requireUser }, async (request) => {
    const { username } = usernameParamSchema.parse(request.params);
    const user = await prisma.user.findUnique({ where: { username: sanitizeText(username.toLowerCase()) } });
    if (!user) throw notFound("User not found.");
    await prisma.subscription.deleteMany({
      where: {
        subscriberId: request.user!.id,
        channelOwnerId: user.id
      }
    });
    return { subscribed: false };
  });

  app.get("/api/users/:username/comments", async (request) => {
    const { username } = usernameParamSchema.parse(request.params);
    const parsed = paginationSchema.parse(request.query);
    const user = await prisma.user.findUnique({ where: { username: sanitizeText(username.toLowerCase()) } });
    if (!user) throw notFound("User not found.");
    if (user.isBanned) {
      return { items: [], page: 1, pageSize: parsed.pageSize, total: 0, totalPages: 1 };
    }
    const count = await prisma.channelComment.count({ where: { channelOwnerId: user.id } });
    const page = pagination(parsed.page, parsed.pageSize, count);
    const comments = await prisma.channelComment.findMany({
      where: { channelOwnerId: user.id },
      include: { user: { select: { id: true, username: true, avatarPath: true, isVerified: true } } },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
    return {
      items: comments.map((comment) => ({
        id: comment.id,
        channelOwnerId: comment.channelOwnerId,
        userId: comment.userId,
        username: comment.user.username,
        userAvatarPath: mediaUrl(comment.user.avatarPath),
        userIsVerified: comment.user.isVerified,
        body: comment.isRemoved ? "[removed]" : comment.body,
        isRemoved: comment.isRemoved,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString()
      })),
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });

  app.post("/api/users/:username/comments", { preHandler: requireUser }, async (request, reply) => {
    const { username } = usernameParamSchema.parse(request.params);
    const parsed = commentBodySchema.parse(request.body);
    const channelOwner = await prisma.user.findUnique({ where: { username: sanitizeText(username.toLowerCase()) } });
    if (!channelOwner || channelOwner.isBanned) throw notFound("User not found.");
    const comment = await prisma.channelComment.create({
      data: {
        channelOwnerId: channelOwner.id,
        userId: request.user!.id,
        body: sanitizeText(parsed.body)
      },
      include: { user: { select: { id: true, username: true, avatarPath: true, isVerified: true } } }
    });
    await reply.status(201).send({
      comment: {
        id: comment.id,
        channelOwnerId: comment.channelOwnerId,
        userId: comment.userId,
        username: comment.user.username,
        userAvatarPath: mediaUrl(comment.user.avatarPath),
        userIsVerified: comment.user.isVerified,
        body: comment.body,
        isRemoved: comment.isRemoved,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString()
      }
    });
  });

  app.delete("/api/channel-comments/:id", { preHandler: requireUser }, async (request) => {
    const { id } = z.object({ id: z.string().trim().min(1) }).parse(request.params);
    const comment = await prisma.channelComment.findUnique({ where: { id } });
    if (!comment) throw notFound("Comment not found.");
    if (comment.userId !== request.user!.id && comment.channelOwnerId !== request.user!.id && !canModerate(request.user)) {
      throw forbidden();
    }
    await prisma.channelComment.update({ where: { id }, data: { isRemoved: true, body: "" } });
    return { ok: true };
  });

  app.get("/api/channels", async (request) => {
    const parsed = paginationSchema.parse(request.query);
    const count = await prisma.user.count({ where: { isBanned: false } });
    const page = pagination(parsed.page, parsed.pageSize, count);
    const users = await prisma.user.findMany({
      where: { isBanned: false },
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.take
    });
    const items = await Promise.all(users.map(async (user) => serializePublicUser(user, await channelStats(user.id))));
    return {
      items,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: page.totalPages
    };
  });
}
