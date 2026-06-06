import type { FastifyInstance } from "fastify";
import { searchQuerySchema } from "@opentube/shared";
import type { Prisma } from "@prisma/client";
import { listVideos, publicVideoWhere } from "./videos.js";
import { sanitizeText } from "../utils/sanitize.js";

export async function registerSearchRoutes(app: FastifyInstance) {
  app.get("/api/search", async (request) => {
    const parsed = searchQuerySchema.parse(request.query);
    const q = sanitizeText(parsed.q);
    const searchWhere: Prisma.VideoWhereInput =
      q.length > 0
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { tags: { has: q } },
              { owner: { username: { contains: q.toLowerCase(), mode: "insensitive" } } }
            ]
          }
        : {};

    const where = publicVideoWhere({
      ...searchWhere,
      ...(parsed.category ? { category: parsed.category } : {})
    });
    return listVideos(where, parsed.page, parsed.pageSize, parsed.sort);
  });
}
