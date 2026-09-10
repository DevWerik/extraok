import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";

import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createPrismaClient } from "../src/db/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { MailDeliveryError, type PasswordResetMailer } from "../src/lib/password-reset-mailer.js";
import { createOpaqueToken, hashToken } from "../src/lib/tokens.js";
import {
  decryptPasswordResetCode,
  encryptPasswordResetCode,
  generatePasswordResetCode,
  hashPasswordResetCode,
  passwordResetCodeMatches,
} from "../src/modules/auth/password-reset-crypto.js";
import {
  cleanupPasswordResetRecords,
  drainPasswordResetDeliveries,
} from "../src/modules/auth/password-reset-delivery.js";
import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordReset,
} from "../src/modules/auth/password-reset-service.js";

const otpSecret = "otp-secret-exclusivo-para-testes-mais-de-32-caracteres";
const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseOptions = { skip: databaseUrl ? false : "TEST_DATABASE_URL não definida" };
const origin = "https://app.extraok.test";
const oldPassword = "Senha anterior segura 123!";
const newPassword = "Senha nova segura 456!";
type CodeMessage = Parameters<PasswordResetMailer["sendCode"]>[0];

test("OTP usa oito dígitos e HMAC vinculado ao segredo, usuário e desafio", () => {
  for (let index = 0; index < 100; index++) assert.match(generatePasswordResetCode(), /^\d{8}$/);
  const stored = hashPasswordResetCode(otpSecret, "user-a", "challenge-a", "00000001");
  assert.match(stored, /^[a-f0-9]{64}$/);
  assert.equal(passwordResetCodeMatches(stored, stored), true);
  for (const candidate of [
    hashPasswordResetCode(otpSecret, "user-a", "challenge-a", "00000002"),
    hashPasswordResetCode(otpSecret, "user-b", "challenge-a", "00000001"),
    hashPasswordResetCode(otpSecret, "user-a", "challenge-b", "00000001"),
    hashPasswordResetCode("different-secret", "user-a", "challenge-a", "00000001"),
    "invalid", "0".repeat(64),
  ]) assert.equal(passwordResetCodeMatches(stored, candidate), false);
});

test("outbox AES-GCM preserva zeros e rejeita adulteração, troca de contexto e segredo", () => {
  const encrypted = encryptPasswordResetCode(otpSecret, "user", "challenge", "00000001");
  assert.equal(decryptPasswordResetCode(otpSecret, "user", "challenge", encrypted), "00000001");
  assert.notEqual(encrypted, encryptPasswordResetCode(otpSecret, "user", "challenge", "00000001"));
  assert.equal(encrypted.includes("00000001"), false);
  assert.throws(() => decryptPasswordResetCode(otpSecret, "other-user", "challenge", encrypted));
  assert.throws(() => decryptPasswordResetCode(otpSecret, "user", "other-challenge", encrypted));
  assert.throws(() => decryptPasswordResetCode("other-secret", "user", "challenge", encrypted));
  const parts = encrypted.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => decryptPasswordResetCode(otpSecret, "user", "challenge", parts.join(".")));
  assert.throws(() => decryptPasswordResetCode(otpSecret, "user", "challenge", "invalid"));
});

test("recurso desativado responde 503 sem acessar banco ou provedor", async (context) => {
  const env = loadEnv({
    NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
    WEB_ORIGIN: origin, PASSWORD_PEPPER: "pepper-disabled-reset-mais-de-32-caracteres",
  });
  const app = await buildApp({ env, logger: false });
  context.after(() => app.close());
  for (const endpoint of ["request", "verify", "confirm"]) {
    const response = await app.inject({
      method: "POST", url: `/api/v1/auth/password-reset/${endpoint}`,
      headers: { origin }, payload: {},
    });
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(response.json<{ error: { code: string } }>().error.code, "SERVICE_UNAVAILABLE");
  }
});

function cookieFrom(response: LightMyRequestResponse): string {
  const value = response.headers["set-cookie"];
  const cookies = Array.isArray(value) ? value : [value];
  const cookie = cookies.find((candidate) => candidate?.startsWith("extraok_password_reset="));
  assert.ok(cookie);
  return cookie.split(";", 1)[0] ?? "";
}

async function fixture(context: TestContext) {
  assert.ok(databaseUrl);
  const prisma = createPrismaClient(databaseUrl);
  const email = `password-reset-${randomUUID()}@example.test`;
  const env = loadEnv({
    NODE_ENV: "production", DATABASE_URL: databaseUrl, WEB_ORIGIN: origin,
    PASSWORD_PEPPER: "pepper-dos-testes-reset-com-mais-de-32-caracteres",
    PASSWORD_RESET_ENABLED: "true", PASSWORD_RESET_OTP_SECRET: otpSecret,
    RESEND_API_KEY: "re_unit_test_placeholder", EMAIL_FROM: "ExtraOK <seguranca@example.test>",
    LOG_LEVEL: "silent",
  });
  const messages: CodeMessage[] = [];
  const changedMessages: Array<Parameters<PasswordResetMailer["sendPasswordChanged"]>[0]> = [];
  let deliveryError: Error | undefined;
  const mailer: PasswordResetMailer = {
    async sendCode(input) {
      if (input.email !== email) return;
      messages.push({ ...input });
      if (deliveryError) throw deliveryError;
    },
    async sendPasswordChanged(input) {
      if (input.email === email) changedMessages.push({ ...input });
    },
  };
  const app = await buildApp({ env, prisma, logger: false, passwordResetMailer: mailer, passwordResetDeliveryEnabled: false });
  const user = await prisma.user.create({
    data: {
      email, name: "Teste Recuperação", businessName: "ExtraOK Testes", phone: "11999999999",
      termsVersion: "test", termsAcceptedAt: new Date(), passwordHash: await hashPassword(oldPassword, env.PASSWORD_PEPPER),
    },
  });
  context.after(async () => {
    await app.close();
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });
  const post = (path: string, payload: unknown, cookie?: string, remoteAddress = "127.0.0.1") => app.inject({
    method: "POST", url: `/api/v1/auth/${path}`, payload: payload as Record<string, unknown>,
    headers: { origin, ...(cookie ? { cookie } : {}) }, remoteAddress,
  });
  const deliver = () => drainPasswordResetDeliveries(app, mailer);
  const ageRequests = () => prisma.passwordResetChallenge.updateMany({
    where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 65_000) },
  });
  return { prisma, app, env, user, email, mailer, messages, changedMessages, post, deliver, ageRequests,
    failDelivery(error?: Error) { deliveryError = error; } };
}

test("recuperação completa usa cookie restrito, invalida senha/sessões e envia aviso", databaseOptions, async (context) => {
  const f = await fixture(context);
  const token = createOpaqueToken();
  await f.prisma.session.create({ data: { userId: f.user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  const rejectedOrigin = await f.app.inject({ method: "POST", url: "/api/v1/auth/password-reset/request", payload: { email: f.email } });
  assert.equal(rejectedOrigin.statusCode, 403);
  const request = await f.post("password-reset/request", { email: ` ${f.email.toUpperCase()} ` });
  const unknown = await f.post("password-reset/request", { email: `unknown-${randomUUID()}@example.test` });
  assert.equal(request.statusCode, 202, request.body);
  assert.equal(unknown.statusCode, 202, unknown.body);
  assert.deepEqual(request.json(), unknown.json());
  assert.match(String(request.headers["set-cookie"]), /extraok_password_reset=;/);
  assert.equal(f.messages.length, 0, "O envio não deve bloquear a resposta HTTP");
  const pending = await f.prisma.passwordResetDelivery.findFirstOrThrow({ where: { userId: f.user.id } });
  assert.ok(pending.ciphertext);
  await f.deliver();
  assert.equal(f.messages.length, 1);
  const code = f.messages[0]!.code;
  assert.match(code, /^\d{8}$/);
  const challenge = await f.prisma.passwordResetChallenge.findFirstOrThrow({ where: { userId: f.user.id } });
  assert.notEqual(challenge.codeHash, code);
  assert.equal(pending.ciphertext.includes(code), false);
  assert.equal((await f.prisma.passwordResetDelivery.findUniqueOrThrow({ where: { id: pending.id } })).ciphertext, null);
  const repeatedRequest = await f.post("password-reset/request", { email: f.email });
  assert.equal(repeatedRequest.statusCode, 202);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 1);
  const wrong = code === "00000000" ? "00000001" : "00000000";
  assert.equal((await f.post("password-reset/verify", { email: f.email, code: wrong })).statusCode, 400);
  const verify = await f.post("password-reset/verify", { email: f.email, code });
  assert.equal(verify.statusCode, 200, verify.body);
  assert.deepEqual(verify.json(), { expiresInSeconds: 300 });
  const rawCookie = String(verify.headers["set-cookie"]);
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /Secure/);
  assert.match(rawCookie, /SameSite=Strict/);
  assert.match(rawCookie, /Path=\/api\/v1\/auth\/password-reset/);
  const cookie = cookieFrom(verify);
  assert.equal((await f.post("password-reset/verify", { email: f.email, code })).statusCode, 400);
  assert.equal((await f.post("password-reset/confirm", { password: newPassword, confirmPassword: "diferente" }, cookie)).statusCode, 400);
  assert.equal((await f.post("password-reset/confirm", { password: "curta", confirmPassword: "curta" }, cookie)).statusCode, 400);
  const confirm = await f.post("password-reset/confirm", { password: newPassword, confirmPassword: newPassword }, cookie);
  assert.equal(confirm.statusCode, 204, confirm.body);
  assert.equal((await f.post("password-reset/confirm", { password: newPassword, confirmPassword: newPassword }, cookie)).statusCode, 400);
  const oldSession = await f.app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie: `__Host-extraok_session=${token}` } });
  assert.equal(oldSession.statusCode, 401);
  assert.equal((await f.post("login", { email: f.email, password: oldPassword })).statusCode, 401);
  assert.equal((await f.post("login", { email: f.email, password: newPassword })).statusCode, 200);
  await f.deliver();
  assert.equal(f.changedMessages.length, 1);
  assert.equal(await f.prisma.passwordResetGrant.count({ where: { userId: f.user.id, usedAt: null } }), 0);
});

test("expiração e reenvio invalidam código e autorização anteriores", databaseOptions, async (context) => {
  const f = await fixture(context);
  await requestPasswordReset(f.app, f.email);
  await f.deliver();
  const firstCode = f.messages[0]!.code;
  await f.prisma.passwordResetChallenge.updateMany({ where: { userId: f.user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal(await verifyPasswordReset(f.app, f.email, firstCode), null);
  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  await f.deliver();
  const secondCode = f.messages[1]!.code;
  if (secondCode !== firstCode) assert.equal(await verifyPasswordReset(f.app, f.email, firstCode), null);
  const grant = await verifyPasswordReset(f.app, f.email, secondCode);
  assert.ok(grant);
  await f.prisma.passwordResetGrant.updateMany({ where: { userId: f.user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal(await confirmPasswordReset(f.app, grant.token, newPassword), false);
  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  await f.deliver();
  assert.equal(await confirmPasswordReset(f.app, grant.token, newPassword), false);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id, invalidatedAt: null } }), 1);
});

test("orçamento de tentativas persiste entre reenvios e só libera após uma hora", databaseOptions, async (context) => {
  const f = await fixture(context);
  await requestPasswordReset(f.app, f.email);
  await f.deliver();
  const wrong = f.messages[0]!.code === "00000000" ? "00000001" : "00000000";
  for (let index = 0; index < 4; index++) assert.equal(await verifyPasswordReset(f.app, f.email, wrong), null);
  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  await f.deliver();
  const code = f.messages[1]!.code;
  assert.equal(await verifyPasswordReset(f.app, f.email, code === "00000000" ? "00000001" : "00000000"), null);
  assert.equal(await verifyPasswordReset(f.app, f.email, code), null);
  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 2);
  assert.equal((await f.prisma.passwordResetState.findUniqueOrThrow({ where: { userId: f.user.id } })).failedAttempts, 5);
  await cleanupPasswordResetRecords(f.app);
  assert.equal((await f.prisma.passwordResetState.findUniqueOrThrow({ where: { userId: f.user.id } })).failedAttempts, 5);
  await f.prisma.passwordResetState.update({ where: { userId: f.user.id }, data: { failureWindowStart: new Date(Date.now() - 3_600_001) } });
  await requestPasswordReset(f.app, f.email);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 3);
  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 3, "No máximo três solicitações por hora");
});

test("outbox repete payload idempotente, remove segredos e cancela códigos superados", databaseOptions, async (context) => {
  const f = await fixture(context);
  await requestPasswordReset(f.app, f.email);
  f.failDelivery(new MailDeliveryError(true, 503));
  await f.deliver();
  let delivery = await f.prisma.passwordResetDelivery.findFirstOrThrow({ where: { userId: f.user.id } });
  assert.equal(delivery.attempts, 1);
  assert.ok(delivery.ciphertext);
  assert.equal(delivery.finishedAt, null);
  f.failDelivery();
  await f.prisma.passwordResetDelivery.update({ where: { id: delivery.id }, data: { availableAt: new Date(Date.now() - 1) } });
  await f.deliver();
  assert.deepEqual(f.messages[0], f.messages[1]);
  delivery = await f.prisma.passwordResetDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
  assert.ok(delivery.finishedAt);
  assert.equal(delivery.ciphertext, null);

  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  const superseded = await f.prisma.passwordResetDelivery.findFirstOrThrow({ where: { userId: f.user.id, finishedAt: null } });
  await f.ageRequests();
  await requestPasswordReset(f.app, f.email);
  const cancelled = await f.prisma.passwordResetDelivery.findUniqueOrThrow({ where: { id: superseded.id } });
  assert.ok(cancelled.finishedAt);
  assert.equal(cancelled.ciphertext, null);
  f.failDelivery(new MailDeliveryError(false, 422));
  await f.deliver();
  assert.equal(f.messages.length, 3, "O código superado não deve ser entregue");
  assert.equal(await f.prisma.passwordResetDelivery.count({ where: { userId: f.user.id, finishedAt: null } }), 0);
});

test("concorrência permite um desafio, uma validação e um consumo por recuperação", databaseOptions, async (context) => {
  const f = await fixture(context);
  await Promise.all(Array.from({ length: 4 }, () => requestPasswordReset(f.app, f.email)));
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 1);
  await f.deliver();
  const results = await Promise.all(Array.from({ length: 4 }, () => verifyPasswordReset(f.app, f.email, f.messages[0]!.code)));
  const grants = results.filter((grant) => grant !== null);
  assert.equal(grants.length, 1);
  const grant = grants[0]!;
  const confirms = await Promise.all(Array.from({ length: 3 }, () => confirmPasswordReset(f.app, grant.token, newPassword)));
  assert.equal(confirms.filter(Boolean).length, 1);
  assert.equal(await f.prisma.passwordResetDelivery.count({ where: { userId: f.user.id, kind: "changed" } }), 1);
});

test("limpeza remove códigos vencidos sem enviá-los e mantém orçamento recente", databaseOptions, async (context) => {
  const f = await fixture(context);
  await requestPasswordReset(f.app, f.email);
  await f.prisma.passwordResetDelivery.updateMany({
    where: { userId: f.user.id }, data: { expiresAt: new Date(Date.now() - 1) },
  });
  await cleanupPasswordResetRecords(f.app);
  await f.deliver();
  assert.equal(f.messages.length, 0);
  const delivery = await f.prisma.passwordResetDelivery.findFirstOrThrow({ where: { userId: f.user.id } });
  assert.equal(delivery.ciphertext, null);
  assert.ok(delivery.finishedAt);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 1);
  await f.prisma.passwordResetChallenge.updateMany({
    where: { userId: f.user.id }, data: { expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
  });
  await cleanupPasswordResetRecords(f.app);
  assert.equal(await f.prisma.passwordResetChallenge.count({ where: { userId: f.user.id } }), 0);
});

test("limites por IP e autorização inválida mantêm contratos de erro", databaseOptions, async (context) => {
  const f = await fixture(context);
  for (let index = 0; index < 10; index++) {
    assert.equal((await f.post("password-reset/request", { email: `unknown-${index}@example.test` })).statusCode, 202);
  }
  const limited = await f.post("password-reset/request", { email: f.email });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json<{ error: { code: string } }>().error.code, "RATE_LIMITED");
  const missing = await f.post("password-reset/confirm", { password: newPassword, confirmPassword: newPassword });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json<{ error: { code: string } }>().error.code, "VALIDATION");
  const verify = await f.post("password-reset/verify", { email: f.email, code: "123" });
  assert.equal(verify.statusCode, 400);
});
