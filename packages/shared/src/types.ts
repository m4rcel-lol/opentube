export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type VideoStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | "REMOVED";
export type VideoVisibility = "PUBLIC" | "UNLISTED" | "PRIVATE";
export type ReportTargetType = "VIDEO" | "COMMENT" | "USER";
export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED";

export interface ChannelCustomization {
  backgroundColor: string;
  textColor: string;
  linkColor: string;
}

export interface PublicUser {
  id: string;
  username: string;
  avatarPath: string | null;
  bannerPath: string | null;
  channelDescription: string;
  channelCustomization: ChannelCustomization;
  role: UserRole;
  isBanned: boolean;
  isVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  stats?: {
    videosUploaded: number;
    subscribers: number;
    totalViews: number;
  };
}

export interface VideoSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  ownerUsername: string;
  ownerIsVerified: boolean;
  views: number;
  averageRating: number;
  ratingCount: number;
  duration: number | null;
  category: string;
  tags: string[];
  createdAt: string;
  status: VideoStatus;
}

export interface VideoDetail extends VideoSummary {
  description: string;
  ownerId: string;
  processedUrl: string | null;
  visibility: VideoVisibility;
  allowEmbedding: boolean;
  isFavorited: boolean;
  viewerRating: number | null;
  commentsCount: number;
}

export interface CommentDto {
  id: string;
  videoId: string;
  userId: string;
  username: string;
  userAvatarPath: string | null;
  userIsVerified: boolean;
  body: string;
  parentId: string | null;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
