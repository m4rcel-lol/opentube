import type { Paginated, PublicUser, VideoDetail, VideoSummary, CommentDto } from "@opentube/shared";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ApiErrorBody {
  message?: string;
  error?: string;
}

export interface AdminStats {
  users: number;
  bannedUsers: number;
  videos: number;
  readyVideos: number;
  failedVideos: number;
  removedVideos: number;
  comments: number;
  channelComments: number;
  openReports: number;
  views: number;
}

export type AdminVideo = VideoSummary & {
  ownerId: string;
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  allowEmbedding: boolean;
};

export type AdminUser = PublicUser & {
  email: string;
  isBanned: boolean;
};

export interface AdminCommentDto {
  id: string;
  targetType: "VIDEO" | "CHANNEL";
  targetId: string;
  targetLabel: string;
  targetPath: string;
  userId: string;
  username: string;
  body: string;
  isRemoved: boolean;
  createdAt: string;
}

export interface ReportDto {
  id: string;
  reporterId: string;
  targetType: "VIDEO" | "COMMENT" | "USER";
  targetId: string;
  reason: string;
  status: "OPEN" | "REVIEWED" | "DISMISSED";
  createdAt: string;
  reviewedAt: string | null;
  reporter: { id: string; username: string };
}

export interface ChannelCommentDto {
  id: string;
  channelOwnerId: string;
  userId: string;
  username: string;
  userAvatarPath: string | null;
  userIsVerified: boolean;
  body: string;
  isRemoved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSettings {
  siteName: string;
  tagline: string;
  embeddingEnabled: boolean;
  allowRegistration: boolean;
  maxUploadBytes: number;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLink: string;
  announcementKind: "INFO" | "WARNING";
}

function readCookie(name: string) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? "";
}

let csrfReady: Promise<void> | null = null;

export async function ensureCsrf() {
  if (!csrfReady) {
    csrfReady = fetch("/api/auth/csrf", { credentials: "include" }).then(() => undefined);
  }
  await csrfReady;
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers = new Headers();
  let payload: BodyInit | undefined;
  if (method !== "GET") {
    await ensureCsrf();
    headers.set("X-CSRF-Token", decodeURIComponent(readCookie("ot_csrf")));
  }
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const init: RequestInit = {
    method,
    credentials: "include",
    headers
  };
  if (payload !== undefined) init.body = payload;

  const response = await fetch(path, init);

  if (!response.ok) {
    let parsed: ApiErrorBody = {};
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = {};
    }
    throw new Error(parsed.message || parsed.error || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function upload<T>(path: string, file: File): Promise<T> {
  await ensureCsrf();
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRF-Token": decodeURIComponent(readCookie("ot_csrf"))
    },
    body: formData
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(parsed.message || parsed.error || `Upload failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload,

  auth: {
    me: () => request<{ user: PublicUser | null }>("GET", "/api/auth/me"),
    login: (usernameOrEmail: string, password: string) =>
      request<{ user: PublicUser }>("POST", "/api/auth/login", { usernameOrEmail, password }),
    register: (username: string, email: string, password: string) =>
      request<{ user: PublicUser }>("POST", "/api/auth/register", { username, email, password }),
    logout: () => request<{ ok: true }>("POST", "/api/auth/logout")
  },

  settings: {
    public: () => request<{ settings: PublicSettings }>("GET", "/api/settings/public")
  },

  videos: {
    list: (params = "") => request<Paginated<VideoSummary>>("GET", `/api/videos${params}`),
    search: (params = "") => request<Paginated<VideoSummary>>("GET", `/api/search${params}`),
    get: (id: string) => request<{ video: VideoDetail }>("GET", `/api/videos/${id}`),
    create: (body: unknown) => request<{ video: VideoDetail }>("POST", "/api/videos", body),
    upload: (id: string, file: File) => upload<{ video: VideoDetail }>(`/api/videos/${id}/upload`, file),
    update: (id: string, body: unknown) => request<{ video: VideoDetail }>("PATCH", `/api/videos/${id}`, body),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/api/videos/${id}`),
    view: (id: string) => request<{ counted: boolean; views: number }>("POST", `/api/videos/${id}/view`),
    rate: (id: string, ratingValue: number) =>
      request<{ rating: number; stats: { averageRating: number; ratingCount: number } }>("POST", `/api/videos/${id}/rate`, {
        ratingValue
      }),
    favorite: (id: string) => request<{ favorited: true }>("POST", `/api/videos/${id}/favorite`),
    unfavorite: (id: string) => request<{ favorited: false }>("DELETE", `/api/videos/${id}/favorite`),
    comments: (id: string, page = 1) =>
      request<Paginated<CommentDto>>("GET", `/api/videos/${id}/comments?page=${page}&pageSize=50`),
    comment: (id: string, body: string, parentId?: string) =>
      request<{ comment: CommentDto }>("POST", `/api/videos/${id}/comments`, { body, parentId }),
    deleteComment: (id: string) => request<{ ok: true }>("DELETE", `/api/comments/${id}`)
  },

  users: {
    get: (username: string) => request<{ user: PublicUser; isSubscribed: boolean }>("GET", `/api/users/${username}`),
    videos: (username: string, page = 1) =>
      request<Paginated<VideoSummary>>("GET", `/api/users/${username}/videos?page=${page}&pageSize=12`),
    subscribe: (username: string) => request<{ subscribed: true }>("POST", `/api/users/${username}/subscribe`),
    unsubscribe: (username: string) => request<{ subscribed: false }>("DELETE", `/api/users/${username}/subscribe`),
    channels: (page = 1) => request<Paginated<PublicUser>>("GET", `/api/channels?page=${page}&pageSize=20`),
    comments: (username: string) => request<Paginated<ChannelCommentDto>>("GET", `/api/users/${username}/comments?page=1&pageSize=30`),
    comment: (username: string, body: string) => request<{ comment: ChannelCommentDto }>("POST", `/api/users/${username}/comments`, { body }),
    deleteComment: (id: string) => request<{ ok: true }>("DELETE", `/api/channel-comments/${id}`)
  },

  account: {
    profile: () => request<{ user: PublicUser; email: string }>("GET", "/api/account/profile"),
    updateProfile: (body: unknown) => request<{ user: PublicUser; email: string }>("PATCH", "/api/account/profile", body),
    uploadAvatar: (file: File) => upload<{ user: PublicUser; email: string }>("/api/account/avatar", file),
    uploadBanner: (file: File) => upload<{ user: PublicUser; email: string }>("/api/account/banner", file),
    videos: () => request<Paginated<VideoSummary>>("GET", "/api/account/videos?page=1&pageSize=50"),
    favorites: () => request<Paginated<VideoSummary>>("GET", "/api/account/favorites?page=1&pageSize=50"),
    subscriptions: () => request<Paginated<PublicUser>>("GET", "/api/account/subscriptions?page=1&pageSize=50")
  },

  reports: {
    create: (targetType: "VIDEO" | "COMMENT" | "USER", targetId: string, reason: string) =>
      request<{ report: ReportDto }>("POST", "/api/reports", { targetType, targetId, reason })
  },

  admin: {
    stats: () => request<AdminStats>("GET", "/api/admin/stats"),
    reports: () => request<Paginated<ReportDto>>("GET", "/api/admin/reports?page=1&pageSize=50"),
    updateReport: (id: string, status: "OPEN" | "REVIEWED" | "DISMISSED") =>
      request<{ report: ReportDto }>("PATCH", `/api/admin/reports/${id}`, { status }),
    videos: () => request<Paginated<AdminVideo>>("GET", "/api/admin/videos?page=1&pageSize=50"),
    updateVideo: (id: string, body: unknown) => request<{ video: AdminVideo }>("PATCH", `/api/admin/videos/${id}`, body),
    users: () => request<Paginated<AdminUser>>("GET", "/api/admin/users?page=1&pageSize=50"),
    updateUser: (id: string, body: unknown) => request<{ user: AdminUser }>("PATCH", `/api/admin/users/${id}`, body),
    comments: () => request<Paginated<AdminCommentDto>>("GET", "/api/admin/comments?page=1&pageSize=50"),
    deleteComment: (id: string) => request<{ ok: true }>("DELETE", `/api/admin/comments/${id}`),
    deleteChannelComment: (id: string) => request<{ ok: true }>("DELETE", `/api/admin/channel-comments/${id}`),
    settings: () => request<{ settings: PublicSettings }>("GET", "/api/admin/settings"),
    updateSettings: (body: Partial<PublicSettings>) =>
      request<{ settings: PublicSettings }>("PATCH", "/api/admin/settings", body)
  },

  embed: (id: string) =>
    request<{
      video: VideoSummary & {
        description: string;
        processedUrl: string | null;
        variants: Array<{ label: string; url: string | null; width: number | null; height: number | null }>;
        watchUrl: string;
      };
    }>("GET", `/api/embed/${id}`)
};
