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
