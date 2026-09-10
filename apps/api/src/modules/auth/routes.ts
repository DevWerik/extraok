import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { conflict, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { createOpaqueToken, hashToken } from "../../lib/tokens.js";
import { parseWith } from "../../lib/validation.js";
import {
  clearSessionCookie,
  currentUser,
  requireAuth,
  serializeUser,
  sessionCookieName,
  setSessionCookie,
} from "../../plugins/auth.js";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido."));

const registerSchema = z.object({
  name: z.string().trim().min(3).max(100),
  businessName: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().min(10).max(30),
  password: z.string().min(12).max(128),
  acceptTerms: z.literal(true, {
    error: "É necessário aceitar os termos para criar a conta.",
  }),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

function expiresFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function createSession(
  app: FastifyInstance,
  userId: string,
  expectedPasswordHash: string,
): Promise<{ token: string; expiresAt: Date; issuedAt: Date }> {
  const token = createOpaqueToken();
  const expiresAt = expiresFromNow(app.env.SESSION_TTL_DAYS);
  const session = await app.prisma.$transaction(async (transaction) => {
    // Serialize with password reset: a login that verified an old password must
    // not create a fresh session after the reset has revoked existing sessions.
    const users = await transaction.$queryRaw<Array<{ password_hash: string }>>`
      SELECT password_hash FROM users WHERE id = ${userId}::uuid FOR UPDATE
    `;
    if (users[0]?.password_hash !== expectedPasswordHash) {
      throw unauthorized("E-mail ou senha inválidos.");
    }
    return transaction.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });
  });

  return { token, expiresAt, issuedAt: session.createdAt };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/register",
    {
      config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = parseWith(registerSchema, request.body);
      const existing = await app.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });

      if (existing) {
        throw conflict("Já existe uma conta com este e-mail.");
      }

      const passwordHash = await hashPassword(
        input.password,
        app.env.PASSWORD_PEPPER,
      );
      const token = createOpaqueToken();
      const expiresAt = expiresFromNow(app.env.SESSION_TTL_DAYS);
      const { user, issuedAt } = await app.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            name: input.name,
            businessName: input.businessName,
            email: input.email,
            phone: input.phone,
            passwordHash,
            termsVersion: app.env.TERMS_VERSION,
            termsAcceptedAt: new Date(),
          },
        });
        const session = await transaction.session.create({
          data: {
            userId: createdUser.id,
            tokenHash: hashToken(token),
            expiresAt,
          },
        });

        return { user: createdUser, issuedAt: session.createdAt };
      });

      setSessionCookie(reply, app.env, token, expiresAt);
      return reply.status(201).send({
        user: serializeUser(user),
        issuedAt,
        expiresAt,
      });
    },
  );

  app.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = parseWith(loginSchema, request.body);
      const user = await app.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user) {
        await hashPassword(input.password, app.env.PASSWORD_PEPPER);
        throw unauthorized("E-mail ou senha inválidos.");
      }

      const valid = await verifyPassword(
        input.password,
        user.passwordHash,
        app.env.PASSWORD_PEPPER,
      );
      if (!valid) {
        throw unauthorized("E-mail ou senha inválidos.");
      }

      const session = await createSession(app, user.id, user.passwordHash);
      setSessionCookie(reply, app.env, session.token, session.expiresAt);

      return {
        user: serializeUser(user),
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      };
    },
  );

  app.get(
    "/auth/session",
    { preHandler: requireAuth },
    async (request) => ({
      user: currentUser(request),
      issuedAt: request.authSession?.issuedAt,
      expiresAt: request.authSession?.expiresAt,
    }),
  );

  app.post(
    "/auth/logout",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.cookies[sessionCookieName(app.env)];
      clearSessionCookie(reply, app.env);

      if (token) {
        await app.prisma.session.updateMany({
          where: {
            tokenHash: hashToken(token),
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }

      return reply.status(204).send();
    },
  );
}
