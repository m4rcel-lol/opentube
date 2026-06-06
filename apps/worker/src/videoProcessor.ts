import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { prisma } from "./prisma.js";
import { env } from "./config.js";

interface ProbeResult {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
}

function storagePath(relativePath = "") {
  const root = path.resolve(env.STORAGE_ROOT);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage path.");
  }
  return resolved;
}

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(storagePath("processed"), { recursive: true }),
    fs.mkdir(storagePath("thumbnails"), { recursive: true })
  ]);
}

async function removeIfExists(filePath: string) {
  await fs.rm(filePath, { force: true });
}

async function runCommand(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function readCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function probe(inputPath: string): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  const raw = await readCommand("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    inputPath
  ]);
  const parsed = JSON.parse(raw) as ProbeResult;
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = parsed.format?.duration ? Math.round(Number(parsed.format.duration)) : null;
  return {
    duration: Number.isFinite(duration) ? duration : null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null
  };
}

async function transcode(inputPath: string, outputPath: string, height: number) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-vf",
    `scale=w=-2:h=${height}:force_original_aspect_ratio=decrease`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "26",
    "-profile:v",
    "main",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    outputPath
  ]);
}

async function thumbnail(inputPath: string, outputPath: string) {
  const args = [
    "-y",
    "-ss",
    "2",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=w=160:h=120:force_original_aspect_ratio=decrease,pad=160:120:(ow-iw)/2:(oh-ih)/2",
    "-q:v",
    "5",
    outputPath
  ];
  try {
    await runCommand("ffmpeg", args);
  } catch {
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=w=160:h=120:force_original_aspect_ratio=decrease,pad=160:120:(ow-iw)/2:(oh-ih)/2",
      "-q:v",
      "5",
      outputPath
    ]);
  }
}

export async function processVideo(videoId: string) {
  await ensureDirs();
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || !video.originalFilePath) {
    throw new Error(`Video ${videoId} has no original upload.`);
  }

  const inputPath = storagePath(video.originalFilePath);
  const primaryRelative = path.posix.join("processed", `${videoId}-480p.mp4`);
  const lowRelative = path.posix.join("processed", `${videoId}-360p.mp4`);
  const thumbRelative = path.posix.join("thumbnails", `${videoId}.jpg`);
  const primaryPath = storagePath(primaryRelative);
  const lowPath = storagePath(lowRelative);
  const thumbPath = storagePath(thumbRelative);

  await prisma.video.update({ where: { id: videoId }, data: { status: "PROCESSING" } });

  try {
    await Promise.all([fs.rm(primaryPath, { force: true }), fs.rm(lowPath, { force: true }), fs.rm(thumbPath, { force: true })]);
    await transcode(inputPath, lowPath, 360);
    await transcode(inputPath, primaryPath, 480);
    await thumbnail(inputPath, thumbPath);
    const info = await probe(primaryPath);

    await prisma.$transaction([
      prisma.videoVariant.deleteMany({ where: { videoId } }),
      prisma.video.update({
        where: { id: videoId },
        data: {
          processedFilePath: primaryRelative,
          thumbnailPath: thumbRelative,
          duration: info.duration,
          originalFilePath: null,
          status: "READY"
        }
      }),
      prisma.videoVariant.createMany({
        data: [
          { videoId, label: "360p", filePath: lowRelative, width: null, height: 360 },
          { videoId, label: "480p", filePath: primaryRelative, width: info.width, height: info.height ?? 480 }
        ]
      })
    ]);
    await removeIfExists(inputPath);
  } catch (error) {
    await prisma.video.update({ where: { id: videoId }, data: { status: "FAILED" } });
    throw error;
  }
}
