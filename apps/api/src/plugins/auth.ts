import type { FastifyReply, FastifyRequest } from "fastify";

import type { Env } from "../config/env.js";
import { unauthorized } from "../lib/errors.js";
import { hashToken } from "../lib/tokens.js";
import type { AuthUser } from "../types/fastify.js";

const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export function sessionCookieName(env: Env): string {
  return env.NODE_ENV === "production"
    ? "__Host-extraok_session"
    : "extraok_session";
}

export function setSessionCookie(
  reply: FastifyReply,
  env: Env,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(sessionCookieName(env), token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  reply.clearCookie(sessionCookieName(env), {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
  });
}

export function serializeUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    businessName: user.businessName,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[sessionCookieName(request.server.env)];

  if (!token) {
    throw unauthorized();
  }

  const now = new Date();
  const session = await request.server.prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= now.getTime() ||
    session.lastUsedAt.getTime() <=
      now.getTime() - request.server.env.SESSION_IDLE_HOURS * 60 * 60 * 1000
  ) {
    if (session && session.revokedAt === null) {
      await request.server.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    clearSessionCookie(reply, request.server.env);
    throw unauthorized("Sua sessão expirou. Entre novamente.");
  }

  request.authUser = serializeUser(session.user);
  request.authSession = {
    id: session.id,
    issuedAt: session.createdAt,
    expiresAt: session.expiresAt,
  };

  if (now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await request.server.prisma.session.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
      },
      data: { lastUsedAt: now },
    });
  }
}

export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.authUser) throw unauthorized();
  return request.authUser;
}
