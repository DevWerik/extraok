import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError, badRequest } from "../../lib/errors.js";
import type { PasswordResetMailer } from "../../lib/password-reset-mailer.js";
import { parseWith } from "../../lib/validation.js";
import { clearSessionCookie } from "../../plugins/auth.js";
import { startPasswordResetDelivery } from "./password-reset-delivery.js";
import {
  confirmPasswordReset,
  passwordResetPolicy,
  requestPasswordReset,
  verifyPasswordReset,
} from "./password-reset-service.js";

export const passwordResetCookieName = "extraok_password_reset";
const cookiePath = "/api/v1/auth/password-reset";
const emailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email("Informe um e-mail válido."));
const requestSchema = z.object({ email: emailSchema });
const verifySchema = z.object({ email: emailSchema, code: z.string().regex(/^\d{8}$/, "Informe o código de 8 dígitos.") });
const confirmSchema = z.object({
  password: z.string().min(12, "Use no mínimo 12 caracteres.").max(128),
  confirmPassword: z.string().min(1).max(128),
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"], message: "As senhas devem ser iguais.",
});

async function withResponseFloor<T>(action: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const floor = 250 + randomInt(0, 101);
  try {
    return await action();
  } finally {
    const remaining = floor - (performance.now() - start);
    if (remaining > 0) await delay(remaining);
  }
}

export async function registerPasswordResetRoutes(
  app: FastifyInstance,
  mailer: PasswordResetMailer,
  options: { deliveryEnabled?: boolean } = {},
): Promise<void> {
  const ensureEnabled = () => {
    if (!app.env.PASSWORD_RESET_ENABLED) {
      throw new AppError(503, "SERVICE_UNAVAILABLE", "A recuperação de senha está temporariamente indisponível.");
    }
  };
  const cookieOptions = {
    path: cookiePath,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: app.env.NODE_ENV === "production",
  };

  app.post("/auth/password-reset/request", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    ensureEnabled();
    const input = parseWith(requestSchema, request.body);
    await withResponseFloor(() => requestPasswordReset(app, input.email));
    reply.clearCookie(passwordResetCookieName, cookieOptions);
    return reply.header("Cache-Control", "no-store").status(202).send({
      message: "Se houver uma conta com esse e-mail, você receberá um código de recuperação.",
      retryAfterSeconds: passwordResetPolicy.retryAfterSeconds,
      expiresInSeconds: passwordResetPolicy.expiresInSeconds,
      codeLength: passwordResetPolicy.codeLength,
    });
  });

  app.post("/auth/password-reset/verify", {
    config: { rateLimit: { max: 20, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    ensureEnabled();
    const input = parseWith(verifySchema, request.body);
    const grant = await withResponseFloor(() => verifyPasswordReset(app, input.email, input.code));
    if (!grant) throw badRequest("Código inválido ou expirado. Solicite um novo código quando necessário.");
    reply.setCookie(passwordResetCookieName, grant.token, {
      ...cookieOptions,
      expires: grant.expiresAt,
      maxAge: passwordResetPolicy.grantExpiresInSeconds,
    });
    return reply.header("Cache-Control", "no-store").send({ expiresInSeconds: passwordResetPolicy.grantExpiresInSeconds });
  });

  app.post("/auth/password-reset/confirm", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
  }, async (request, reply) => {
    ensureEnabled();
    const input = parseWith(confirmSchema, request.body);
    const token = request.cookies[passwordResetCookieName];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !await confirmPasswordReset(app, token, input.password)) {
      reply.clearCookie(passwordResetCookieName, cookieOptions);
      throw badRequest("Autorização inválida ou expirada. Solicite um novo código.");
    }
    reply.clearCookie(passwordResetCookieName, cookieOptions);
    clearSessionCookie(reply, app.env);
    return reply.header("Cache-Control", "no-store").status(204).send();
  });

  if (app.env.PASSWORD_RESET_ENABLED && options.deliveryEnabled !== false) {
    startPasswordResetDelivery(app, mailer);
  }
}
