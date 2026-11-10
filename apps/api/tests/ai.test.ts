import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { AppError } from "../src/lib/errors.js";
import { createGeminiDescriptionGenerator, type DescriptionInput } from "../src/modules/ai/gemini.js";

const origin = "https://app.extraok.test";
const environment = {
  NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unused",
  WEB_ORIGIN: origin, PASSWORD_PEPPER: "p".repeat(32),
  AI_ENABLED: "true", GEMINI_API_KEY: "test-placeholder-not-a-real-key", AI_DAILY_LIMIT: "2",
};
const env = loadEnv(environment);
const input = { title: "Higienização de estofado", description: "Limpeza do estofado." };
const generated = "Higienização do estofado para auxiliar na sua limpeza e conservação.";

function geminiResponse(text = generated, finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
}

function fakePrisma(userId: () => string = () => "user-one"): PrismaClient {
  return { session: { async findUnique() {
    const now = new Date();
    return {
      id: "session", revokedAt: null, expiresAt: new Date(now.getTime() + 60_000), lastUsedAt: now, createdAt: now,
      user: { id: userId(), name: "Pessoa", businessName: "Negócio", email: "test@example.test", phone: null, createdAt: now },
    };
  } } } as unknown as PrismaClient;
}

const headers = { origin, cookie: "extraok_session=test-session" };

test("IA exige chave ao ativar e valida modelo e limite; desativada aceita chave vazia", () => {
  assert.equal(loadEnv({ ...environment, AI_ENABLED: "false", GEMINI_API_KEY: "" }).GEMINI_API_KEY, undefined);
  for (const override of [{ GEMINI_API_KEY: " " }, { GEMINI_MODEL: "../secret?key=value" }, { AI_DAILY_LIMIT: "0" }, { AI_DAILY_LIMIT: "1.5" }]) {
    assert.throws(() => loadEnv({ ...environment, ...override }));
  }
  const disabled = loadEnv({ ...environment, AI_ENABLED: undefined, GEMINI_API_KEY: undefined });
  assert.equal(disabled.AI_ENABLED, false);
});

test("Gemini envia somente título e rascunho, com chave no cabeçalho e sem redirects", async () => {
  let calls = 0;
  const gateway = createGeminiDescriptionGenerator(env, async (url, options) => {
    calls++;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`);
    assert.ok(options);
    assert.equal(options.redirect, "error");
    assert.equal(options.method, "POST");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(new Headers(options.headers).get("x-goog-api-key"), env.GEMINI_API_KEY);
    const payload = JSON.parse(String(options.body));
    assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), input);
    assert.equal(String(options.body).includes(env.GEMINI_API_KEY!), false);
    assert.equal(payload.generationConfig.maxOutputTokens, 2_048);
    assert.deepEqual(payload.generationConfig.thinkingConfig, { thinkingLevel: "low" });
    assert.equal(payload.generationConfig.candidateCount, undefined);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, text: "private reasoning" }, { text: ` ${generated} ` },
    ] } }] });
  });
  assert.equal(await gateway.generate(input), generated);
  assert.equal(calls, 1);
});

test("Gemini sanitiza erros e não repete chamadas, inclusive em timeout e cota", async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    let calls = 0;
    const gateway = createGeminiDescriptionGenerator(env, async () => {
      calls++;
      return Response.json({ error: `${env.GEMINI_API_KEY} private input` }, { status });
    });
    await assert.rejects(gateway.generate(input), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, status === 429 ? 429 : 503);
      assert.equal(String(error).includes(env.GEMINI_API_KEY!), false);
      assert.equal(String(error).includes("private"), false);
      assert.equal("cause" in error, false);
      return true;
    });
    assert.equal(calls, 1);
  }
  for (const transport of [
    async () => { throw new DOMException("private timeout", "TimeoutError"); },
    async () => { throw new Error("private network details"); },
    async () => new Response("invalid json"),
  ]) {
    await assert.rejects(createGeminiDescriptionGenerator(env, transport).generate(input), (error: unknown) => error instanceof AppError && error.code === "AI_UNAVAILABLE");
  }
});

test("Gemini recusa bloqueios, texto truncado, vazio, só pensamento e descrição longa", async () => {
  for (const response of [
    geminiResponse(""), geminiResponse("curto"), geminiResponse("x".repeat(2_001)),
    geminiResponse(generated, "MAX_TOKENS"), geminiResponse(generated, "SAFETY"),
    Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    Response.json({ candidates: [] }),
    Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: generated }] } }] }),
  ]) {
    await assert.rejects(createGeminiDescriptionGenerator(env, async () => response).generate(input), AppError);
  }
  const disabled = createGeminiDescriptionGenerator({ ...env, AI_ENABLED: false }, async () => assert.fail("Não deve chamar o Gemini"));
  await assert.rejects(disabled.generate(input), AppError);
});

test("rotas de IA exigem sessão e origem autorizada antes de chamar o Gemini", async (t) => {
  let calls = 0;
  const app = await buildApp({ env, prisma: fakePrisma(), logger: false, descriptionGenerator: { async generate() { calls++; return generated; } } });
  t.after(() => app.close());
  const guest = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers: { origin }, payload: input });
  assert.equal(guest.statusCode, 401);
  const wrongOrigin = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers: { ...headers, origin: "https://evil.test" }, payload: input });
  assert.equal(wrongOrigin.statusCode, 403);
  const missingOrigin = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers: { cookie: headers.cookie }, payload: input });
  assert.equal(missingOrigin.statusCode, 403);
  const guestCapabilities = await app.inject({ method: "GET", url: "/api/v1/ai/capabilities" });
  assert.equal(guestCapabilities.statusCode, 401);
  const capabilities = await app.inject({ method: "GET", url: "/api/v1/ai/capabilities", headers });
  assert.deepEqual(capabilities.json(), { descriptionsEnabled: true });
  assert.equal(capabilities.headers["cache-control"], "no-store");
  assert.equal(capabilities.body.includes(env.GEMINI_API_KEY!), false);
  assert.equal(calls, 0);
});

test("rota valida entrada antes de consumir cota e retorna sugestão sem gravar registros", async (t) => {
  const calls: DescriptionInput[] = [];
  const app = await buildApp({ env, prisma: fakePrisma(), logger: false, descriptionGenerator: { async generate(value) { calls.push(value); return generated; } } });
  t.after(() => app.close());
  for (const [index, payload] of [
    {}, { title: "ab" }, { title: "x".repeat(161) }, { ...input, description: "x".repeat(2_001) }, { ...input, ownerId: "another-user" },
  ].entries()) {
    const response = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers, payload, remoteAddress: `127.0.0.${index + 2}` });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal(calls.length, 0);
  for (const payload of [{ title: ` ${input.title} ` }, input]) {
    const response = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers, payload });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { description: generated });
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.deepEqual(calls, [{ title: input.title, description: "" }, input]);
});

test("cota por conta persiste entre IPs e sessões e é independente de outra conta", async (t) => {
  let userId = "user-one";
  let calls = 0;
  const app = await buildApp({ env, prisma: fakePrisma(() => userId), logger: false, descriptionGenerator: { async generate() { calls++; return generated; } } });
  t.after(() => app.close());
  for (let index = 0; index < 3; index++) {
    const response = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers: { ...headers, cookie: `extraok_session=session-${index}` }, payload: input, remoteAddress: `127.0.0.${index + 2}` });
    assert.equal(response.statusCode, index < 2 ? 200 : 429, response.body);
    if (index === 2) {
      assert.equal(response.json().error.code, "RATE_LIMITED");
      assert.ok(Number(response.headers["retry-after"]) > 0);
    }
  }
  userId = "user-two";
  const other = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers, payload: input });
  assert.equal(other.statusCode, 200);
  assert.equal(calls, 3);
});

test("limite por IP bloqueia a sexta tentativa mesmo alternando contas", async (t) => {
  let userId = "";
  let calls = 0;
  const app = await buildApp({ env, prisma: fakePrisma(() => userId), logger: false, descriptionGenerator: { async generate() { calls++; return generated; } } });
  t.after(() => app.close());
  for (let index = 0; index < 6; index++) {
    userId = `user-${index}`;
    const response = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers, payload: input });
    assert.equal(response.statusCode, index < 5 ? 200 : 429, response.body);
  }
  assert.equal(calls, 5);
});

test("IA desativada preserva API e não chama o provedor", async (t) => {
  const app = await buildApp({ env: { ...env, AI_ENABLED: false, GEMINI_API_KEY: undefined }, prisma: fakePrisma(), logger: false, descriptionGenerator: { async generate() { assert.fail("Não deve gerar"); } } });
  t.after(() => app.close());
  const capabilities = await app.inject({ method: "GET", url: "/api/v1/ai/capabilities", headers });
  assert.deepEqual(capabilities.json(), { descriptionsEnabled: false });
  const response = await app.inject({ method: "POST", url: "/api/v1/ai/extra-description", headers, payload: input });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "AI_UNAVAILABLE");
  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
});
