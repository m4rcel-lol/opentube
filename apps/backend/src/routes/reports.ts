import type { FastifyInstance } from "fastify";
import { reportCreateSchema } from "@opentube/shared";
import { prisma } from "../db/prisma.js";
import { requireUser } from "../middleware/auth.js";
import { badRequest } from "../utils/errors.js";
import { sanitizeText } from "../utils/sanitize.js";

async function targetExists(targetType: "VIDEO" | "COMMENT" | "USER", targetId: string) {
  if (targetType === "VIDEO") return Boolean(await prisma.video.findUnique({ where: { id: targetId }, select: { id: true } }));
  if (targetType === "COMMENT") return Boolean(await prisma.comment.findUnique({ where: { id: targetId }, select: { id: true } }));
  return Boolean(await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } }));
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.post("/api/reports", { preHandler: requireUser }, async (request, reply) => {
    const parsed = reportCreateSchema.parse(request.body);
    if (!(await targetExists(parsed.targetType, parsed.targetId))) {
      throw badRequest("Reported target does not exist.");
    }
    const report = await prisma.report.create({
      data: {
        reporterId: request.user!.id,
        targetType: parsed.targetType,
        targetId: parsed.targetId,
        reason: sanitizeText(parsed.reason)
      }
    });
    await reply.status(201).send({ report });
  });
}
