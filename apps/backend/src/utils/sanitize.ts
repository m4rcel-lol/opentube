import sanitizeHtml from "sanitize-html";
import { channelCustomizationSchema } from "@opentube/shared";

export function sanitizeText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard"
  }).trim();
}

export function sanitizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const rawTag of tags) {
    const tag = sanitizeText(rawTag).replace(/\s+/g, " ").trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
  }
  return clean.slice(0, 20);
}

export function sanitizeChannelCustomization(input: unknown) {
  return channelCustomizationSchema.parse(input);
}
