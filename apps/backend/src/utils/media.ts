import fs from "node:fs/promises";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { env } from "../config/env.js";
import { badRequest } from "./errors.js";

const allowedVideoMimes = new Map<string, string>([
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
  ["video/x-msvideo", "avi"],
  ["video/webm", "webm"],
  ["video/x-matroska", "mkv"]
]);

const allowedImageMimes = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

export async function ensureStorageDirs() {
  await Promise.all([
    fs.mkdir(storagePath("uploads"), { recursive: true }),
    fs.mkdir(storagePath("processed"), { recursive: true }),
    fs.mkdir(storagePath("thumbnails"), { recursive: true }),
    fs.mkdir(storagePath("avatars"), { recursive: true }),
    fs.mkdir(storagePath("banners"), { recursive: true })
  ]);
}

export function storagePath(relativePath = ""): string {
  const root = path.resolve(env.STORAGE_ROOT);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw badRequest("Invalid storage path.");
  }
  return resolved;
}

export function mediaUrl(relativePath: string | null): string | null {
  if (!relativePath) return null;
  return `/media/${relativePath.replace(/\\/g, "/")}`;
}

export async function validateUploadedVideo(filePath: string) {
  const detected = await fileTypeFromFile(filePath);
  if (!detected || !allowedVideoMimes.has(detected.mime)) {
    throw badRequest("Unsupported video type. Upload mp4, mov, avi, webm, or mkv.");
  }
  return {
    mime: detected.mime,
    extension: allowedVideoMimes.get(detected.mime) ?? detected.ext
  };
}

export async function validateUploadedImage(filePath: string) {
  const detected = await fileTypeFromFile(filePath);
  if (!detected || !allowedImageMimes.has(detected.mime)) {
    throw badRequest("Unsupported image type. Upload jpg, png, webp, or gif.");
  }
  return {
    mime: detected.mime,
    extension: allowedImageMimes.get(detected.mime) ?? detected.ext
  };
}

export async function compressUploadedImage(
  inputPath: string,
  outputPath: string,
  kind: "avatar" | "banner"
) {
  const dimensions = kind === "avatar"
    ? { width: 512, height: 512, quality: 82 }
    : { width: 1600, height: 320, quality: 80 };

  try {
    await sharp(inputPath, {
      animated: false,
      limitInputPixels: 60_000_000
    })
      .rotate()
      .resize({
        width: dimensions.width,
        height: dimensions.height,
        fit: "cover",
        position: "attention"
      })
      .webp({
        quality: dimensions.quality,
        effort: 4
      })
      .toFile(outputPath);
  } catch {
    throw badRequest("Image could not be processed safely.");
  }
}

export async function removeIfExists(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
