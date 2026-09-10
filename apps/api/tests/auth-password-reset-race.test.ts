import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { createOpaqueToken, hashToken } from "../src/lib/tokens.js";
import { confirmPasswordReset } from "../src/modules/auth/password-reset-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("login que validou a senha anterior não cria sessão depois da recuperação", {
  skip: databaseUrl ? false : "TEST_DATABASE_URL não definida",
}, async (context) => {
  if (!databaseUrl) return;
  const prisma = createPrismaClient(databaseUrl);
  const email = `race-${randomUUID()}@example.test`;
  const oldPassword = "Old valid password 123!";
  const newPassword = "New valid password 456!";
  const env = loadEnv({
    NODE_ENV: "test", DATABASE_URL: databaseUrl, WEB_ORIGIN: "https://app.example.test",
    PASSWORD_PEPPER: "p".repeat(32), PASSWORD_RESET_ENABLED: "true",
    RESEND_API_KEY: "re_test_fake_key_only", EMAIL_FROM: "security@example.test",
    PASSWORD_RESET_OTP_SECRET: "s".repeat(64), LOG_LEVEL: "silent",
  });
  const resetApp = await buildApp({ env, prisma, logger: false, passwordResetDeliveryEnabled: false });
  const user = await prisma.user.create({ data: {
    name: "Race test", businessName: "Race test", email, phone: "11999999999",
    passwordHash: await hashPassword(oldPassword, env.PASSWORD_PEPPER),
    termsVersion: "test", termsAcceptedAt: new Date(),
  } });
  const challenge = await prisma.passwordResetChallenge.create({ data: {
    userId: user.id, codeHash: "a".repeat(64), expiresAt: new Date(Date.now() + 600_000), verifiedAt: new Date(),
  } });
  const token = createOpaqueToken();
  await prisma.passwordResetGrant.create({ data: {
    userId: user.id, challengeId: challenge.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 300_000),
  } });

  let resetBeforeSession = true;
  // Pause exactly between login's password verification and its session write.
  // This deterministic interleaving reproduces the race on any PostgreSQL engine.
  const loginPrisma = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (...args: Parameters<typeof prisma.$transaction>) => {
          if (resetBeforeSession) {
            resetBeforeSession = false;
            assert.equal(await confirmPasswordReset(resetApp, token, newPassword), true);
          }
          return Reflect.apply(target.$transaction, target, args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const loginApp = await buildApp({ env, prisma: loginPrisma, logger: false, passwordResetDeliveryEnabled: false });
  context.after(async () => {
    await loginApp.close();
    await resetApp.close();
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
  const login = (password: string) => loginApp.inject({
    method: "POST", url: "/api/v1/auth/login", headers: { origin: env.WEB_ORIGIN }, payload: { email, password },
  });
  const stale = await login(oldPassword);
  assert.equal(stale.statusCode, 401, stale.body);
  assert.equal(stale.headers["set-cookie"], undefined);
  assert.equal(await prisma.session.count({ where: { userId: user.id, revokedAt: null } }), 0);
  const current = await login(newPassword);
  assert.equal(current.statusCode, 200, current.body);
});
