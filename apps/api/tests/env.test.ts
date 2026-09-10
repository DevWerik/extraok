import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv } from "../src/config/env.js";

const requiredEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://extraok:secret@localhost:5432/extraok",
  WEB_ORIGIN: "https://app.extraok.com.br/",
  PASSWORD_PEPPER: "p".repeat(32),
};

test("loadEnv preserva o modo explicito, aplica defaults e normaliza a origem", () => {
  const environment = loadEnv(requiredEnvironment);

  assert.equal(environment.NODE_ENV, "development");
  assert.equal(environment.HOST, "0.0.0.0");
  assert.equal(environment.PORT, 3333);
  assert.equal(environment.WEB_ORIGIN, "https://app.extraok.com.br");
  assert.equal(environment.SESSION_TTL_DAYS, 30);
  assert.equal(environment.SESSION_IDLE_HOURS, 12);
  assert.equal(environment.APPROVAL_LINK_TTL_DAYS, 30);
  assert.equal(environment.TRUST_PROXY, false);
  assert.equal(environment.PASSWORD_RESET_ENABLED, false);
});

test("loadEnv exige um NODE_ENV explicito e valido", () => {
  assert.throws(
    () => loadEnv({ ...requiredEnvironment, NODE_ENV: undefined }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("NODE_ENV"),
  );

  assert.throws(
    () => loadEnv({ ...requiredEnvironment, NODE_ENV: "staging" }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("NODE_ENV"),
  );

  assert.equal(
    loadEnv({ ...requiredEnvironment, NODE_ENV: "test" }).NODE_ENV,
    "test",
  );
});

test("loadEnv converte numeros e booleanos vindos do processo", () => {
  const environment = loadEnv({
    ...requiredEnvironment,
    PORT: "8080",
    SESSION_TTL_DAYS: "7",
    APPROVAL_LINK_TTL_DAYS: "14",
    TRUST_PROXY: "true",
  });

  assert.equal(environment.PORT, 8080);
  assert.equal(environment.SESSION_TTL_DAYS, 7);
  assert.equal(environment.APPROVAL_LINK_TTL_DAYS, 14);
  assert.equal(environment.TRUST_PROXY, true);
});

test("loadEnv rejeita segredos curtos e origens nao HTTP", () => {
  assert.throws(() =>
    loadEnv({
      ...requiredEnvironment,
      WEB_ORIGIN: "ftp://app.extraok.com.br",
      PASSWORD_PEPPER: "curto",
    }),
  );
});

test("loadEnv exige HTTPS para origens remotas em producao", () => {
  assert.throws(() =>
    loadEnv({
      ...requiredEnvironment,
      NODE_ENV: "production",
      WEB_ORIGIN: "http://app.extraok.com.br",
    }),
  );

  assert.equal(
    loadEnv({
      ...requiredEnvironment,
      NODE_ENV: "production",
      WEB_ORIGIN: "http://localhost:8080",
    }).WEB_ORIGIN,
    "http://localhost:8080",
  );
});

test("loadEnv rejeita o pepper local conhecido em producao", () => {
  assert.throws(() =>
    loadEnv({
      ...requiredEnvironment,
      NODE_ENV: "production",
      PASSWORD_PEPPER:
        "extraok-local-development-pepper-do-not-use-in-production",
    }),
  );
});

test("recuperação desativada aceita campos opcionais vazios", () => {
  const environment = loadEnv({
    ...requiredEnvironment,
    PASSWORD_RESET_ENABLED: "false",
    RESEND_API_KEY: "",
    EMAIL_FROM: " ",
    PASSWORD_RESET_OTP_SECRET: "",
  });
  assert.equal(environment.RESEND_API_KEY, undefined);
  assert.equal(environment.EMAIL_FROM, undefined);
  assert.equal(environment.PASSWORD_RESET_OTP_SECRET, undefined);
});

const recoveryEnvironment = {
  ...requiredEnvironment,
  PASSWORD_RESET_ENABLED: "true",
  RESEND_API_KEY: "re_test_fake_key_only",
  EMAIL_FROM: "ExtraOK <security@example.test>",
  PASSWORD_RESET_OTP_SECRET: "s".repeat(64),
};

test("ativação da recuperação exige todas as configurações válidas", () => {
  assert.equal(loadEnv(recoveryEnvironment).PASSWORD_RESET_ENABLED, true);
  for (const setting of ["RESEND_API_KEY", "EMAIL_FROM", "PASSWORD_RESET_OTP_SECRET"]) {
    assert.throws(() => loadEnv({ ...recoveryEnvironment, [setting]: "" }));
  }
  assert.throws(() => loadEnv({ ...recoveryEnvironment, PASSWORD_RESET_OTP_SECRET: requiredEnvironment.PASSWORD_PEPPER }));
  assert.throws(() => loadEnv({ ...recoveryEnvironment, PASSWORD_RESET_OTP_SECRET: "short" }));
  assert.throws(() => loadEnv({ ...recoveryEnvironment, RESEND_API_KEY: "invalid" }));
  assert.throws(() => loadEnv({ ...recoveryEnvironment, PASSWORD_RESET_ENABLED: "yes" }));
});

test("remetente aceita endereço simples e rejeita cabeçalhos injetados", () => {
  assert.equal(loadEnv({ ...recoveryEnvironment, EMAIL_FROM: "security@example.test" }).EMAIL_FROM, "security@example.test");
  for (const email of ["invalid", "ExtraOK <invalid>", "ExtraOK <ok@example.test>\r\nBcc: attacker@example.test", "ExtraOK <ok@example.test> trailing"]) {
    assert.throws(() => loadEnv({ ...recoveryEnvironment, EMAIL_FROM: email }));
  }
});
