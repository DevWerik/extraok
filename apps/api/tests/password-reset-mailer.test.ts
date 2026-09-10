import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv } from "../src/config/env.js";
import { createPasswordResetMailer, MailDeliveryError } from "../src/lib/password-reset-mailer.js";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  WEB_ORIGIN: "https://app.example.test",
  PASSWORD_PEPPER: "p".repeat(32),
  PASSWORD_RESET_ENABLED: "true",
  RESEND_API_KEY: "re_test_fake_key_only",
  EMAIL_FROM: "ExtraOK <security@example.test>",
  PASSWORD_RESET_OTP_SECRET: "s".repeat(64),
});
const input = { email: "user@example.test", code: "00123456", expiresInMinutes: 10, idempotencyKey: "password-reset/test" };

test("envio usa HTTPS, autenticação, chave idempotente e sinal de cancelamento", async () => {
  const calls: RequestInit[] = [];
  const mailer = createPasswordResetMailer(env, async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.ok(options);
    calls.push(options);
    return Response.json({ id: "message-id" });
  });
  await mailer.sendCode(input);
  await mailer.sendCode(input);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].redirect, "error");
  assert.ok(calls[0].signal instanceof AbortSignal);
  const headers = new Headers(calls[0].headers);
  assert.equal(headers.get("Authorization"), `Bearer ${env.RESEND_API_KEY}`);
  assert.equal(headers.get("Idempotency-Key"), input.idempotencyKey);
  const payload = JSON.parse(String(calls[0].body));
  assert.deepEqual(payload.to, [input.email]);
  assert.equal(payload.from, env.EMAIL_FROM);
  assert.match(payload.text, /00123456/);
  assert.match(payload.text, /10 minutos após a solicitação/);
});

test("aviso de troca não inclui código nem senha", async () => {
  const mailer = createPasswordResetMailer(env, async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    assert.match(payload.subject, /senha foi alterada/);
    assert.match(payload.text, /sessões anteriores foram encerradas/);
    assert.equal(String(options?.body).includes(input.code), false);
    return Response.json({ id: "notification-id" });
  });
  await mailer.sendPasswordChanged({ email: input.email, idempotencyKey: "password-reset/changed" });
});

test("falhas do provedor são classificadas sem expor sua resposta", async () => {
  for (const [status, retryable] of [[400, false], [401, false], [403, false], [408, true], [409, true], [429, true], [500, true]] as const) {
    const mailer = createPasswordResetMailer(env, async () => Response.json({ message: `private ${input.code} ${input.email}` }, { status }));
    await assert.rejects(mailer.sendCode(input), (error: unknown) => {
      assert.ok(error instanceof MailDeliveryError);
      assert.equal(error.retryable, retryable);
      assert.equal(error.statusCode, status);
      assert.equal(String(error).includes(input.code), false);
      assert.equal(String(error).includes(input.email), false);
      assert.equal("cause" in error, false);
      return true;
    });
  }
});

test("timeout, falha de rede e resposta inesperada permitem retry seguro", async () => {
  for (const transport of [
    async () => { throw new DOMException("private timeout detail", "TimeoutError"); },
    async () => { throw new Error("private network detail"); },
    async () => Response.json({ unexpected: true }),
  ]) {
    const mailer = createPasswordResetMailer(env, transport);
    await assert.rejects(mailer.sendCode(input), (error: unknown) => error instanceof MailDeliveryError && error.retryable && !String(error).includes("private"));
  }
});

test("configuração desativada e OTP malformado nunca chamam o provedor", async () => {
  const transport: typeof fetch = async () => { assert.fail("Não deveria enviar e-mail"); };
  const disabled = createPasswordResetMailer({ ...env, PASSWORD_RESET_ENABLED: false }, transport);
  await assert.rejects(disabled.sendCode(input), MailDeliveryError);
  const mailer = createPasswordResetMailer(env, transport);
  await assert.rejects(mailer.sendCode({ ...input, code: "<script>" }), MailDeliveryError);
});
