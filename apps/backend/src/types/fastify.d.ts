import "fastify";
import type { UserRole } from "@opentube/shared";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isBanned: boolean;
  isVerified: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
    sessionId?: string;
  }
}
