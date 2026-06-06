import { z } from "zod";

export const userRoleSchema = z.enum(["USER", "MODERATOR", "ADMIN"]);
export const videoStatusSchema = z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED", "REMOVED"]);
export const videoVisibilitySchema = z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]);
export const reportTargetTypeSchema = z.enum(["VIDEO", "COMMENT", "USER"]);
export const reportStatusSchema = z.enum(["OPEN", "REVIEWED", "DISMISSED"]);

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(31)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_-]*$/, "Use letters, numbers, underscores, or hyphens.");

export const emailSchema = z.string().trim().email().max(254).transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(256, "Password is too long.");

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const channelCustomizationSchema = z.object({
  backgroundColor: hexColorSchema.default("#ffffff"),
  textColor: hexColorSchema.default("#333333"),
  linkColor: hexColorSchema.default("#0033cc")
});

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema
});

export const loginSchema = z.object({
  usernameOrEmail: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256)
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
});

export const videoMetadataSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  category: z.string().trim().min(1).max(40).default("People"),
  visibility: videoVisibilitySchema.default("PUBLIC"),
  allowEmbedding: z.boolean().default(true)
});

export const videoPatchSchema = videoMetadataSchema.partial().extend({
  status: videoStatusSchema.optional()
});

export const ratingSchema = z.object({
  ratingValue: z.coerce.number().int().min(1).max(5)
});

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().trim().min(1).optional()
});

export const reportCreateSchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(1000)
});

export const accountProfileSchema = z.object({
  email: emailSchema.optional(),
  channelDescription: z.string().trim().max(5000).optional(),
  avatarPath: z.string().trim().max(300).nullable().optional(),
  bannerPath: z.string().trim().max(300).nullable().optional(),
  channelCustomization: channelCustomizationSchema.optional()
});

export const adminUserPatchSchema = z.object({
  role: userRoleSchema.optional(),
  isBanned: z.boolean().optional(),
  isVerified: z.boolean().optional()
});

export const adminSettingsPatchSchema = z.record(z.unknown());

export const searchQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).default(""),
  category: z.string().trim().max(40).optional(),
  sort: z.enum(["recent", "most-viewed", "top-rated"]).default("recent")
});
