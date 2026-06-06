import type { Prisma, User, Video } from "@prisma/client";
import type { ChannelCustomization } from "@opentube/shared";
import { prisma } from "../db/prisma.js";
import { mediaUrl } from "../utils/media.js";

const fallbackCustomization: ChannelCustomization = {
  backgroundColor: "#ffffff",
  textColor: "#333333",
  linkColor: "#0033cc"
};

function asChannelCustomization(value: Prisma.JsonValue): ChannelCustomization {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallbackCustomization;
  const input = value as Record<string, unknown>;
  const backgroundColor = typeof input.backgroundColor === "string" ? input.backgroundColor : fallbackCustomization.backgroundColor;
  const textColor = typeof input.textColor === "string" ? input.textColor : fallbackCustomization.textColor;
  const linkColor = typeof input.linkColor === "string" ? input.linkColor : fallbackCustomization.linkColor;
  return { backgroundColor, textColor, linkColor };
}

export function serializePublicUser(
  user: Pick<
    User,
    "id" | "username" | "avatarPath" | "channelDescription" | "channelCustomization" | "role" | "createdAt" | "lastLoginAt"
    | "bannerPath"
    | "isBanned"
    | "isVerified"
  >,
  stats?: { videosUploaded: number; subscribers: number; totalViews: number }
) {
  return {
    id: user.id,
    username: user.username,
    avatarPath: mediaUrl(user.avatarPath),
    bannerPath: mediaUrl(user.bannerPath),
    channelDescription: user.channelDescription,
    channelCustomization: asChannelCustomization(user.channelCustomization),
    role: user.role,
    isBanned: user.isBanned,
    isVerified: user.isVerified,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    stats
  };
}

export async function channelStats(userId: string) {
  const [videosUploaded, subscribers, views] = await Promise.all([
    prisma.video.count({ where: { ownerId: userId, status: "READY", visibility: "PUBLIC" } }),
    prisma.subscription.count({ where: { channelOwnerId: userId } }),
    prisma.video.aggregate({
      where: { ownerId: userId, status: "READY", visibility: "PUBLIC" },
      _sum: { views: true }
    })
  ]);
  return {
    videosUploaded,
    subscribers,
    totalViews: views._sum.views ?? 0
  };
}

export async function ratingStats(videoIds: string[]) {
  if (videoIds.length === 0) return new Map<string, { averageRating: number; ratingCount: number }>();
  const grouped = await prisma.rating.groupBy({
    by: ["videoId"],
    where: { videoId: { in: videoIds } },
    _avg: { ratingValue: true },
    _count: { ratingValue: true }
  });
  const map = new Map<string, { averageRating: number; ratingCount: number }>();
  for (const item of grouped) {
    map.set(item.videoId, {
      averageRating: item._avg.ratingValue ?? 0,
      ratingCount: item._count.ratingValue
    });
  }
  return map;
}

type VideoWithOwner = Video & {
  owner: { id: string; username: string; isVerified: boolean };
  _count?: { comments?: number };
};

export function serializeVideoSummary(
  video: VideoWithOwner,
  stats?: { averageRating: number; ratingCount: number }
) {
  return {
    id: video.id,
    title: video.title,
    thumbnailUrl: mediaUrl(video.thumbnailPath),
    ownerUsername: video.owner.username,
    ownerIsVerified: video.owner.isVerified,
    views: video.views,
    averageRating: stats?.averageRating ?? 0,
    ratingCount: stats?.ratingCount ?? 0,
    duration: video.duration,
    category: video.category,
    tags: video.tags,
    createdAt: video.createdAt.toISOString(),
    status: video.status
  };
}

export function serializeVideoDetail(
  video: VideoWithOwner,
  stats: { averageRating: number; ratingCount: number },
  viewerRating: number | null,
  isFavorited: boolean
) {
  return {
    ...serializeVideoSummary(video, stats),
    ownerId: video.ownerId,
    description: video.description,
    processedUrl: mediaUrl(video.processedFilePath),
    visibility: video.visibility,
    allowEmbedding: video.allowEmbedding,
    isFavorited,
    viewerRating,
    commentsCount: video._count?.comments ?? 0
  };
}

export function serializeComment(comment: {
  id: string;
  videoId: string;
  userId: string;
  parentId: string | null;
  body: string;
  isRemoved: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { username: string; avatarPath: string | null; isVerified: boolean };
}) {
  return {
    id: comment.id,
    videoId: comment.videoId,
    userId: comment.userId,
    username: comment.user.username,
    userAvatarPath: mediaUrl(comment.user.avatarPath),
    userIsVerified: comment.user.isVerified,
    parentId: comment.parentId,
    body: comment.isRemoved ? "[removed]" : comment.body,
    isRemoved: comment.isRemoved,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString()
  };
}
