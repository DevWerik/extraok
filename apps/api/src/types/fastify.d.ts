import type { PrismaClient } from "../generated/prisma/client.js";

import type { Env } from "../config/env.js";

export interface AuthUser {
  id: string;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  createdAt: Date;
}

export interface AuthSession {
  id: string;
  issuedAt: Date;
  expiresAt: Date;
}

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    authUser: AuthUser | null;
    authSession: AuthSession | null;
  }
}

export {};
