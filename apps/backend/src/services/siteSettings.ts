import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

const defaultSettings: Record<string, unknown> = {
  siteName: "OpenTube",
  tagline: "Broadcast Yourself, Openly.",
  embeddingEnabled: true,
  allowRegistration: true,
  maxUploadBytes: 512 * 1024 * 1024,
  maintenanceEnabled: false,
  maintenanceMessage: "OpenTube is temporarily down for maintenance.",
  announcementEnabled: false,
  announcementText: "",
  announcementLink: "",
  announcementKind: "INFO"
};

export async function getSetting<T>(key: string): Promise<T> {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  if (!setting) return defaultSettings[key] as T;
  return setting.value as T;
}

export async function getPublicSettings() {
  const settings = await prisma.siteSetting.findMany();
  const result = { ...defaultSettings };
  for (const setting of settings) {
    result[setting.key] = setting.value;
  }
  return result;
}

export async function upsertSettings(values: Record<string, unknown>) {
  const allowed = new Set([
    "siteName",
    "tagline",
    "embeddingEnabled",
    "allowRegistration",
    "maxUploadBytes",
    "maintenanceEnabled",
    "maintenanceMessage",
    "announcementEnabled",
    "announcementText",
    "announcementLink",
    "announcementKind"
  ]);
  const writes = Object.entries(values)
    .filter(([key]) => allowed.has(key))
    .map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: value as Prisma.InputJsonValue },
        create: { key, value: value as Prisma.InputJsonValue }
      })
    );
  await prisma.$transaction(writes);
  return getPublicSettings();
}
