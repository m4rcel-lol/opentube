import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const unauthorized = (message = "Authentication required.") => new AppError(401, message);
export const forbidden = (message = "Permission denied.") => new AppError(403, message);
export const notFound = (message = "Not found.") => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);

export function registerErrorHandler(app: {
  setErrorHandler: (
    handler: (error: FastifyError | AppError | ZodError, request: FastifyRequest, reply: FastifyReply) => Promise<void> | void
  ) => void;
}) {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      await reply.status(400).send({
        error: "ValidationError",
        message: "Request validation failed.",
        details: error.flatten()
      });
      return;
    }

    if (error instanceof AppError) {
      await reply.status(error.statusCode).send({
        error: "ApplicationError",
        message: error.message
      });
      return;
    }

    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    await reply.status(statusCode).send({
      error: statusCode >= 500 ? "InternalServerError" : "RequestError",
      message: statusCode >= 500 ? "An unexpected server error occurred." : error.message
    });
  });
}
